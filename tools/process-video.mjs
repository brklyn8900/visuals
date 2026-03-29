import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import { PRESETS, probeMediaMetadata } from "./analyze-audio.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const timings = {};

  if (options.help || !options.input) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  const inputPath = path.resolve(options.input);
  const sketchDir = path.join(ROOT, "processing", "sketches", options.sketch);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Video file not found: ${inputPath}`);
  }
  if (!fs.existsSync(sketchDir)) {
    throw new Error(`Sketch not found: ${sketchDir}`);
  }

  const processingJava = findProcessingJava();
  if (!processingJava) {
    throw new Error(
      "processing-java not found in PATH.\n" +
      "Install Processing: brew install --cask processing\n" +
      "Then open Processing.app > Tools > Install \"processing-java\""
    );
  }

  // Probe video metadata
  console.log("Probing video...");
  let stepStartedAt = Date.now();
  const probe = probeVideo(inputPath);
  timings.probeMs = Date.now() - stepStartedAt;

  const srcFps = probe.fps;
  const fps = options.fps || srcFps;
  const width = options.width || probe.width;
  const height = options.height || probe.height;
  const duration = probe.duration;
  const frameCount = options.maxFrames || Math.ceil(duration * fps);
  const hasAudio = probe.hasAudio;

  console.log(`Source: ${probe.width}x${probe.height} @ ${srcFps}fps, ${duration.toFixed(2)}s, ${Math.ceil(duration * srcFps)} frames`);
  console.log(`Output: ${width}x${height} @ ${fps}fps, ${frameCount} frames`);

  const outputPath = path.resolve(
    options.output || defaultOutputPath(inputPath, options)
  );
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  // Setup cache directories
  const cacheId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cacheDir = path.join(ROOT, ".render-cache", cacheId);
  const sourceFramesDir = path.join(cacheDir, "source");
  const outputFramesDir = path.join(cacheDir, "frames");
  await fsp.mkdir(sourceFramesDir, { recursive: true });
  await fsp.mkdir(outputFramesDir, { recursive: true });

  // Extract source frames
  console.log("\nExtracting frames...");
  stepStartedAt = Date.now();
  await extractFrames({
    inputPath,
    outputDir: sourceFramesDir,
    fps,
    width,
    height,
    maxFrames: frameCount,
  });
  timings.extractMs = Date.now() - stepStartedAt;

  // Verify extraction
  const sourceFiles = await fsp.readdir(sourceFramesDir);
  const extractedCount = sourceFiles.filter((f) => f.endsWith(".jpg")).length;
  if (extractedCount === 0) {
    throw new Error("Frame extraction produced no frames");
  }
  console.log(`Extracted ${extractedCount} frames`);

  // Use actual extracted count if fewer than expected
  const actualFrameCount = Math.min(frameCount, extractedCount);

  // Generate synthetic analysis JSON
  console.log("\nGenerating synthetic analysis...");
  stepStartedAt = Date.now();
  const analysis = generateSyntheticAnalysis({
    frameCount: actualFrameCount,
    fps,
    duration: actualFrameCount / fps,
    intensity: options.intensity,
  });
  const analysisPath = path.join(cacheDir, "analysis.json");
  await fsp.writeFile(analysisPath, JSON.stringify(analysis));
  timings.analysisMs = Date.now() - stepStartedAt;

  // Run Processing sketch
  console.log(`\nProcessing with sketch: ${options.sketch}`);
  stepStartedAt = Date.now();
  await runProcessingSketch({
    processingJava,
    sketchDir,
    analysisPath,
    framesDir: outputFramesDir,
    width,
    height,
    fps,
    jpegQuality: options.jpegQuality,
    frameCount: actualFrameCount,
    videoFramesDir: sourceFramesDir,
  });
  timings.renderMs = Date.now() - stepStartedAt;

  // Verify rendered frames
  const renderedFiles = await fsp.readdir(outputFramesDir);
  const renderedCount = renderedFiles.filter((f) => f.endsWith(".jpg")).length;
  if (renderedCount === 0) {
    throw new Error("Processing sketch produced no frames");
  }
  if (renderedCount < actualFrameCount) {
    console.warn(`Warning: expected ${actualFrameCount} frames, got ${renderedCount}`);
  }

  // Encode output video
  console.log("\nEncoding video...");
  stepStartedAt = Date.now();
  await encodeVideo({
    framesDir: outputFramesDir,
    inputPath: hasAudio ? inputPath : null,
    outputPath,
    fps,
    crf: options.crf,
  });
  timings.encodeMs = Date.now() - stepStartedAt;

  // Cleanup
  if (!options.keepFrames) {
    await fsp.rm(cacheDir, { recursive: true, force: true });
  } else {
    console.log(`Source frames: ${sourceFramesDir}`);
    console.log(`Output frames: ${outputFramesDir}`);
  }

  // Summary
  const finishedAt = Date.now();
  const totalMs = finishedAt - startedAt;
  const outputStats = await fsp.stat(outputPath);
  const outputMeta = probeMediaMetadata(outputPath);

  console.log("");
  console.log("Process complete");
  console.log(`Sketch      ${options.sketch}`);
  console.log(`Input       ${displayPath(inputPath)}`);
  console.log(`Output      ${displayPath(outputPath)}`);
  console.log(`Format      ${width}x${height} @ ${fps} fps`);
  console.log(`Frames      ${renderedCount} frames`);
  console.log(`Intensity   ${options.intensity}`);
  console.log(`Size        ${formatBytes(outputStats.size)}`);
  console.log(`Timing      total ${formatElapsed(totalMs)} | probe ${formatElapsed(timings.probeMs)} | extract ${formatElapsed(timings.extractMs)} | analysis ${formatElapsed(timings.analysisMs)} | render ${formatElapsed(timings.renderMs)} | encode ${formatElapsed(timings.encodeMs)}`);
  console.log(`Speed       ${(duration / (totalMs / 1000)).toFixed(2)}x realtime`);
}

// ================================================================
//  VIDEO PROBE
// ================================================================

function probeVideo(inputPath) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `ffprobe failed for ${inputPath}`);
  }

  const data = JSON.parse(result.stdout);
  const videoStream = data.streams.find((s) => s.codec_type === "video");
  const audioStream = data.streams.find((s) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("No video stream found");
  }

  // Parse frame rate from r_frame_rate (e.g. "24/1")
  const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
  const fps = Math.round(num / den);

  return {
    width: videoStream.width,
    height: videoStream.height,
    fps,
    duration: Number.parseFloat(data.format.duration),
    hasAudio: Boolean(audioStream),
  };
}

// ================================================================
//  FRAME EXTRACTION
// ================================================================

async function extractFrames({ inputPath, outputDir, fps, width, height, maxFrames }) {
  const args = [
    "-i", inputPath,
    "-vf", `fps=${fps},scale=${width}:${height}:flags=lanczos`,
    "-qscale:v", "2",
  ];

  if (maxFrames) {
    args.push("-frames:v", String(maxFrames));
  }

  args.push(path.join(outputDir, "frame-%06d.jpg"));

  const proc = spawn("ffmpeg", ["-y", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const [code] = await once(proc, "close");
  if (code !== 0) {
    throw new Error(`Frame extraction failed:\n${stderr.split("\n").slice(-5).join("\n")}`);
  }
}

// ================================================================
//  SYNTHETIC ANALYSIS
// ================================================================

function generateSyntheticAnalysis({ frameCount, fps, duration, intensity }) {
  // Intensity scales how aggressive the effects are (0.0 - 1.0)
  const scale = Math.max(0, Math.min(1, intensity));

  const frames = [];

  for (let i = 0; i < frameCount; i++) {
    const t = i / Math.max(1, frameCount - 1); // 0..1 progress
    const sec = i / fps;

    // Organic sine-based energy curves, phase-offset per band
    const sub     = oscillate(sec, 0.15, 0.0) * scale;
    const bass    = oscillate(sec, 0.22, 1.0) * scale;
    const lowMid  = oscillate(sec, 0.35, 2.0) * scale;
    const mid     = oscillate(sec, 0.50, 3.0) * scale;
    const highMid = oscillate(sec, 0.70, 4.0) * scale;
    const presence = oscillate(sec, 0.90, 5.0) * scale;
    const air     = oscillate(sec, 1.10, 6.0) * scale;

    // Periodic pulses for trigger-based effects
    const kickPulse  = pulse(sec, 1.8, 0.0, 0.12) * scale;
    const snarePulse = pulse(sec, 2.4, 0.9, 0.10) * scale;
    const hatPulse   = pulse(sec, 3.2, 0.3, 0.08) * scale * 0.5;

    frames.push({
      bands: { sub, bass, lowMid, mid, highMid, presence, air },
      kickPulse,
      snarePulse,
      hatPulse,
    });
  }

  return {
    frameCount,
    fps,
    duration,
    sampleRate: 44100,
    frames,
  };
}

/** Sine oscillator mapped to 0..1, with frequency in Hz and phase offset */
function oscillate(sec, freqHz, phaseOffset) {
  const raw = Math.sin(sec * freqHz * Math.PI * 2 + phaseOffset);
  return raw * 0.5 + 0.5; // map -1..1 to 0..1
}

/** Periodic pulse: returns 1.0 at peak, decays to 0 over decayDuration */
function pulse(sec, periodSec, offsetSec, decayDuration) {
  const phase = ((sec - offsetSec) % periodSec + periodSec) % periodSec;
  if (phase > decayDuration) return 0;
  return 1.0 - phase / decayDuration;
}

// ================================================================
//  PROCESSING SKETCH RUNNER
// ================================================================

async function runProcessingSketch(options) {
  const {
    processingJava, sketchDir, analysisPath, framesDir,
    width, height, fps, jpegQuality, frameCount, videoFramesDir,
  } = options;

  const outputDir = path.join(sketchDir, "out");
  await fsp.mkdir(outputDir, { recursive: true });

  const env = { ...process.env };
  env._JAVA_OPTIONS = [env._JAVA_OPTIONS, "-Dapple.awt.UIElement=true"].filter(Boolean).join(" ");

  const proc = spawn(
    processingJava,
    [
      `--sketch=${sketchDir}`,
      `--output=${outputDir}`,
      "--force",
      "--run",
      analysisPath,
      framesDir,
      String(width),
      String(height),
      String(fps),
      String(jpegQuality),
      String(frameCount),
      videoFramesDir, // passed as the image arg — sketch detects it's a directory
    ],
    { stdio: ["ignore", "pipe", "pipe"], env }
  );

  let stderr = "";
  const inlineProgress =
    Boolean(process.stdout.isTTY) &&
    typeof process.stdout.clearLine === "function" &&
    typeof process.stdout.cursorTo === "function";

  proc.stdout.on("data", (chunk) => {
    const lines = String(chunk).split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(/^FRAME:(\d+)\/(\d+)$/);
      if (match) {
        const current = Number.parseInt(match[1], 10);
        const total = Number.parseInt(match[2], 10);
        const percent = (current / total) * 100;
        const text = `Rendered ${current}/${total} frames (${percent.toFixed(1)}%)`;
        if (inlineProgress) {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(text);
        } else if (current % Math.max(1, Math.floor(fps)) === 0 || current === total) {
          console.log(text);
        }
      } else if (line.startsWith("Warning:") || line.startsWith("Error")) {
        console.log(`[sketch] ${line}`);
      }
    }
  });

  proc.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const [code] = await once(proc, "close");

  if (inlineProgress) process.stdout.write("\n");

  if (code !== 0) {
    const errorLines = stderr.split("\n").filter((l) => l.trim()).slice(-10).join("\n");
    throw new Error(`Processing sketch exited with code ${code}\n${errorLines}`);
  }
}

// ================================================================
//  VIDEO ENCODING
// ================================================================

async function encodeVideo({ framesDir, inputPath, outputPath, fps, crf }) {
  const framePath = path.join(framesDir, "frame-%06d.jpg");

  const args = [
    "-y",
    "-framerate", String(fps),
    "-i", framePath,
  ];

  // Mux original audio if available
  if (inputPath) {
    args.push("-i", inputPath);
    args.push("-map", "0:v:0", "-map", "1:a:0?");
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
  );

  if (inputPath) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-movflags", "+faststart", "-shortest", outputPath);

  const proc = spawn("ffmpeg", args, {
    stdio: ["ignore", "inherit", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const [code] = await once(proc, "close");
  if (code !== 0) {
    throw new Error(stderr || "ffmpeg encoding failed");
  }
}

// ================================================================
//  ARGS
// ================================================================

function findProcessingJava() {
  const result = spawnSync("which", ["processing-java"], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  const candidates = [
    "/usr/local/bin/processing-java",
    path.join(process.env.HOME || "", "bin", "processing-java"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function parseArgs(argv) {
  const options = {
    sketch: "pixelsort",
    fps: 0,       // 0 = match source
    width: 0,     // 0 = match source
    height: 0,    // 0 = match source
    jpegQuality: 92,
    crf: 18,
    intensity: 0.5,
    help: false,
    maxFrames: 0,
    keepFrames: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--input" || arg === "-i") {
      options.input = next; i += 1;
    } else if (arg === "--output" || arg === "-o") {
      options.output = next; i += 1;
    } else if (arg === "--sketch") {
      options.sketch = next; i += 1;
    } else if (arg === "--preset") {
      const dimensions = PRESETS[next];
      if (!dimensions) {
        throw new Error(`Unknown preset: ${next}. Valid: ${Object.keys(PRESETS).join(", ")}`);
      }
      options.width = dimensions.width;
      options.height = dimensions.height;
      i += 1;
    } else if (arg === "--width") {
      options.width = Number.parseInt(next, 10); i += 1;
    } else if (arg === "--height") {
      options.height = Number.parseInt(next, 10); i += 1;
    } else if (arg === "--fps") {
      options.fps = Number.parseInt(next, 10); i += 1;
    } else if (arg === "--jpeg-quality") {
      options.jpegQuality = Number.parseInt(next, 10); i += 1;
    } else if (arg === "--crf") {
      options.crf = Number.parseInt(next, 10); i += 1;
    } else if (arg === "--intensity") {
      options.intensity = Number.parseFloat(next); i += 1;
    } else if (arg === "--max-frames") {
      options.maxFrames = Number.parseInt(next, 10); i += 1;
    } else if (arg === "--keep-frames") {
      options.keepFrames = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node tools/process-video.mjs --input ./video.mp4 [options]

Options:
  --input, -i         Path to the source video file (required)
  --output, -o        Output video path (defaults beside input)
  --sketch            Processing sketch name (default: pixelsort)
  --preset            reel | feed | square | landscape
  --width             Custom output width (default: match source)
  --height            Custom output height (default: match source)
  --fps               Output frame rate (default: match source)
  --intensity         Effect intensity 0.0-1.0 (default: 0.5)
  --jpeg-quality      JPEG quality 1-100 (default: 92)
  --crf               ffmpeg x264 CRF value (default: 18)
  --max-frames        Process only the first N frames
  --keep-frames       Keep extracted/rendered frames after encoding
  --help, -h          Show this message

Examples:
  node tools/process-video.mjs -i video/boy.mp4
  node tools/process-video.mjs -i video/boy.mp4 --sketch pixelsort --intensity 0.7
  node tools/process-video.mjs -i video/boy.mp4 --max-frames 30 --keep-frames
`);
}

function defaultOutputPath(inputPath, options) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}-${options.sketch}.mp4`);
}

function formatElapsed(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s >= 60) return `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s`;
  return `${s.toFixed(1)}s`;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size >= 10 || i === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[i]}`;
}

function displayPath(filePath) {
  const rel = path.relative(ROOT, filePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? `./${rel}` : filePath;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
