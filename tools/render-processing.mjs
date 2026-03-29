import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import {
  BAND_DEFS,
  PRESETS,
  analyzeAudio,
  probeMediaMetadata,
} from "./analyze-audio.mjs";

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
  const outputPath = path.resolve(options.output || defaultOutputPath(inputPath, options));

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`);
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

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  // Audio analysis
  console.log("Analyzing audio...");
  const { analysis, duration, timings: analysisTimings } = await analyzeAudio(inputPath, {
    fps: options.fps,
    sampleRate: options.sampleRate,
    maxFrames: options.maxFrames,
  });
  Object.assign(timings, analysisTimings);

  // Write analysis to cache
  const cacheId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cacheDir = path.join(ROOT, ".render-cache", cacheId);
  const framesDir = path.join(cacheDir, "frames");
  await fsp.mkdir(framesDir, { recursive: true });

  const analysisPath = path.join(cacheDir, "analysis.json");
  await fsp.writeFile(analysisPath, JSON.stringify(analysis));

  console.log(`Analysis: ${analysis.frameCount} frames, ${analysis.duration.toFixed(2)}s`);
  console.log(`Probe ${analysisTimings.probeMs}ms | Decode ${analysisTimings.decodeMs}ms | Analyze ${analysisTimings.analysisMs}ms`);

  // Run Processing sketch
  console.log(`\nRendering with sketch: ${options.sketch}`);
  let stepStartedAt = Date.now();
  const resolvedImage = options.image ? await resolveImagePaths(options.image) : null;
  const resolvedReveal = options.reveal ? await resolveImagePaths(options.reveal) : null;

  await runProcessingSketch({
    processingJava,
    sketchDir,
    analysisPath,
    framesDir,
    width: options.width,
    height: options.height,
    fps: options.fps,
    jpegQuality: options.jpegQuality,
    frameCount: analysis.frameCount,
    imagePath: resolvedImage,
    revealPath: resolvedReveal,
  });
  timings.renderMs = Date.now() - stepStartedAt;

  // Verify frames
  const frameFiles = await fsp.readdir(framesDir);
  const jpegCount = frameFiles.filter((f) => f.endsWith(".jpg")).length;
  if (jpegCount === 0) {
    throw new Error("Processing sketch produced no frames");
  }
  if (jpegCount < analysis.frameCount) {
    console.warn(`Warning: expected ${analysis.frameCount} frames, got ${jpegCount}`);
  }

  // Encode with ffmpeg
  console.log("\nEncoding video...");
  stepStartedAt = Date.now();
  await encodeVideo({
    framesDir,
    inputPath,
    outputPath,
    fps: options.fps,
    crf: options.crf,
    duration: analysis.duration,
  });
  timings.encodeMs = Date.now() - stepStartedAt;

  // Cleanup frames
  if (!options.keepFrames) {
    await fsp.rm(cacheDir, { recursive: true, force: true });
  } else {
    console.log(`Frames kept at: ${framesDir}`);
  }

  // Summary
  const finishedAt = Date.now();
  const outputStats = await fsp.stat(outputPath);
  const outputMeta = probeMediaMetadata(outputPath);

  printRenderSummary({
    startedAt,
    finishedAt,
    sketch: options.sketch,
    preset: options.preset,
    inputPath,
    outputPath,
    width: outputMeta.width || options.width,
    height: outputMeta.height || options.height,
    fps: outputMeta.frameRate || options.fps,
    frameCount: analysis.frameCount,
    sourceDuration: duration,
    renderDuration: analysis.duration,
    outputDuration: outputMeta.duration || analysis.duration,
    analysisSampleRate: options.sampleRate,
    outputSize: outputStats.size,
    outputVideoCodec: outputMeta.videoCodec,
    outputAudioCodec: outputMeta.audioCodec,
    outputAudioSampleRate: outputMeta.audioSampleRate,
    outputAudioChannels: outputMeta.audioChannels,
    timings,
  });
}

function parseArgs(argv) {
  const preset = PRESETS.reel;
  const options = {
    sketch: "demo",
    preset: "reel",
    fps: 30,
    width: preset.width,
    height: preset.height,
    sampleRate: 44100,
    jpegQuality: 92,
    crf: 18,
    help: false,
    maxFrames: 0,
    keepFrames: false,
    image: null,
    reveal: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--input" || arg === "-i") {
      options.input = next;
      i += 1;
    } else if (arg === "--output" || arg === "-o") {
      options.output = next;
      i += 1;
    } else if (arg === "--sketch") {
      options.sketch = next;
      i += 1;
    } else if (arg === "--preset") {
      const dimensions = PRESETS[next];
      if (!dimensions) {
        throw new Error(`Unknown preset: ${next}. Valid: ${Object.keys(PRESETS).join(", ")}`);
      }
      options.preset = next;
      options.width = dimensions.width;
      options.height = dimensions.height;
      i += 1;
    } else if (arg === "--width") {
      options.preset = "custom";
      options.width = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--height") {
      options.preset = "custom";
      options.height = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--fps") {
      options.fps = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--sample-rate") {
      options.sampleRate = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--jpeg-quality") {
      options.jpegQuality = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--crf") {
      options.crf = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--max-frames") {
      options.maxFrames = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--keep-frames") {
      options.keepFrames = true;
    } else if (arg === "--image") {
      options.image = next;
      i += 1;
    } else if (arg === "--reveal") {
      options.reveal = next;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node tools/render-processing.mjs --input ./audio.wav [options]

Options:
  --input, -i         Path to the source audio file (required)
  --output, -o        Output video path (defaults beside the input file)
  --sketch            Processing sketch name (default: demo)
  --preset            reel | feed | square | landscape (default: reel)
  --width             Custom output width
  --height            Custom output height
  --fps               Frames per second (default: 30)
  --sample-rate       Audio analysis sample rate (default: 44100)
  --jpeg-quality      JPEG quality 1-100 (default: 92)
  --crf               ffmpeg x264 CRF value (default: 18)
  --max-frames        Render only the first N frames
  --keep-frames       Keep rendered frames after encoding
  --image             Image path, comma-separated list, or directory (for pixelsort)
  --help, -h          Show this message
`);
}

function defaultOutputPath(inputPath, options) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}-${options.sketch}.mp4`);
}

async function resolveImagePaths(imageArg) {
  // Comma-separated list
  if (imageArg.includes(",")) {
    const paths = imageArg.split(",").map((p) => path.resolve(p.trim()));
    for (const p of paths) {
      if (!fs.existsSync(p)) throw new Error(`Image not found: ${p}`);
    }
    return paths.join(",");
  }

  const resolved = path.resolve(imageArg);
  const stat = await fsp.stat(resolved);

  // Directory: load all images sorted alphabetically
  if (stat.isDirectory()) {
    const files = await fsp.readdir(resolved);
    const images = files
      .filter((f) => /\.(png|jpe?g|gif|bmp|tiff?)$/i.test(f))
      .sort()
      .map((f) => path.join(resolved, f));
    if (images.length === 0) {
      throw new Error(`No image files found in ${resolved}`);
    }
    console.log(`Found ${images.length} images in ${imageArg}`);
    return images.join(",");
  }

  // Single file
  return resolved;
}

function findProcessingJava() {
  const result = spawnSync("which", ["processing-java"], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  // Check common macOS locations
  const candidates = [
    "/usr/local/bin/processing-java",
    path.join(process.env.HOME || "", "bin", "processing-java"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function runProcessingSketch(options) {
  const { processingJava, sketchDir, analysisPath, framesDir, width, height, fps, jpegQuality, frameCount, imagePath, revealPath } = options;

  const outputDir = path.join(sketchDir, "out");
  await fsp.mkdir(outputDir, { recursive: true });

  const env = { ...process.env };
  // Hide Java app from macOS Dock and app switcher
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
      ...(imagePath ? [imagePath] : []),
      ...(revealPath ? [revealPath] : []),
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
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const [code] = await once(proc, "close");

  if (inlineProgress) {
    process.stdout.write("\n");
  }

  if (code !== 0) {
    const errorLines = stderr.split("\n").filter((l) => l.trim()).slice(-10).join("\n");
    throw new Error(`Processing sketch exited with code ${code}\n${errorLines}`);
  }
}

async function encodeVideo(options) {
  const { framesDir, inputPath, outputPath, fps, crf, duration } = options;

  const framePath = path.join(framesDir, "frame-%06d.jpg");

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      framePath,
      "-i",
      inputPath,
      "-t",
      String(duration),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-shortest",
      outputPath,
    ],
    { stdio: ["ignore", "inherit", "pipe"] }
  );

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const [code] = await once(ffmpeg, "close");
  if (code !== 0) {
    throw new Error(stderr || "ffmpeg failed while encoding the video.");
  }
}

function printRenderSummary(summary) {
  const totalMs = summary.finishedAt - summary.startedAt;
  const realtimeRate = summary.renderDuration / Math.max(totalMs / 1000, 1e-6);
  const displayFps = summary.fps.toFixed(2).replace(/\.00$/, "");
  const lines = [
    ["Pipeline", "offline audio analysis -> Processing frame render -> H.264/AAC encode"],
    ["Sketch", summary.sketch],
    ["Input", displayPath(summary.inputPath)],
    ["Output", displayPath(summary.outputPath)],
    ["Format", `${summary.width}x${summary.height} @ ${displayFps} fps (${summary.preset})`],
    [
      "Coverage",
      `${formatMediaDuration(summary.renderDuration)} rendered from ${formatMediaDuration(summary.sourceDuration)} source audio`,
    ],
    ["Frames", `${summary.frameCount} frames`],
    ["Analysis", `${summary.analysisSampleRate} Hz, ${BAND_DEFS.length} bands, kick/snare/hat pulse extraction`],
    [
      "Output Meta",
      `${summary.outputVideoCodec} video + ${summary.outputAudioCodec} audio, ${formatBytes(summary.outputSize)}${
        summary.outputAudioSampleRate ? `, ${summary.outputAudioSampleRate} Hz` : ""
      }${summary.outputAudioChannels ? `, ${summary.outputAudioChannels} ch` : ""}`,
    ],
    ["Timing", formatTiming(summary.timings, totalMs)],
    ["Speed", `${realtimeRate.toFixed(2)}x realtime`],
    ["Completed", formatLocalTimestamp(summary.finishedAt)],
  ];

  const labelWidth = lines.reduce((max, [label]) => Math.max(max, label.length), 0);

  console.log("");
  console.log("Render complete");
  for (const [label, value] of lines) {
    console.log(`${label.padEnd(labelWidth)}  ${value}`);
  }
}

function formatTiming(timings, totalMs) {
  return [
    `total ${formatElapsed(totalMs)}`,
    `probe ${formatElapsed(timings.probeMs || 0)}`,
    `decode ${formatElapsed(timings.decodeMs || 0)}`,
    `analyze ${formatElapsed(timings.analysisMs || 0)}`,
    `render ${formatElapsed(timings.renderMs || 0)}`,
    `encode ${formatElapsed(timings.encodeMs || 0)}`,
  ].join(" | ");
}

function formatElapsed(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = safeMs / 1000;
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toFixed(1).padStart(4, "0")}s`;
  }
  return `${totalSeconds.toFixed(1)}s`;
}

function formatMediaDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "unknown";
  }

  const totalHundredths = Math.round(seconds * 100);
  const wholeSeconds = Math.floor(totalHundredths / 100);
  const hundredths = totalHundredths % 100;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  const fraction = String(hundredths).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${fraction}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}.${fraction}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function displayPath(filePath) {
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return `./${relativePath}`;
  }
  return filePath;
}

function formatLocalTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
