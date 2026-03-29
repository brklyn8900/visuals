import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import FFT from "fft.js";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const BAND_DEFS = [
  { key: "sub", min: 20, max: 60, smooth: 0.28 },
  { key: "bass", min: 60, max: 140, smooth: 0.26 },
  { key: "lowMid", min: 140, max: 400, smooth: 0.24 },
  { key: "mid", min: 400, max: 1400, smooth: 0.22 },
  { key: "highMid", min: 1400, max: 3200, smooth: 0.22 },
  { key: "presence", min: 3200, max: 6000, smooth: 0.20 },
  { key: "air", min: 6000, max: 12000, smooth: 0.18 },
];

const PRESETS = {
  reel: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const timings = {};

  if (options.help || !options.input) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output || defaultOutputPath(inputPath, options));
  const buildPath = path.join(ROOT, options.build);
  const chromePath = options.chrome || process.env.CHROME_PATH || DEFAULT_CHROME;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`);
  }
  if (!fs.existsSync(buildPath)) {
    throw new Error(`Build not found: ${buildPath}`);
  }
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome executable not found: ${chromePath}`);
  }

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  let stepStartedAt = Date.now();
  const duration = probeDuration(inputPath);
  timings.probeMs = Date.now() - stepStartedAt;
  const sampleRate = options.sampleRate;

  stepStartedAt = Date.now();
  const samples = await decodeAudioToSamples(inputPath, sampleRate);
  timings.decodeMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  const targetFrameCount = options.maxFrames
    ? Math.max(1, options.maxFrames)
    : Math.max(1, Math.ceil(duration * options.fps));
  const analysis = buildAnalysis(samples, sampleRate, options.fps, targetFrameCount);
  timings.analysisMs = Date.now() - stepStartedAt;

  const cacheId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cacheDir = path.join(ROOT, ".render-cache", cacheId);
  await fsp.mkdir(cacheDir, { recursive: true });
  const analysisPath = path.join(cacheDir, "analysis.json");
  await fsp.writeFile(analysisPath, JSON.stringify(analysis));

  const server = await createStaticServer(ROOT);

  let browser;
  try {
    stepStartedAt = Date.now();
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--hide-scrollbars",
        "--mute-audio",
      ],
    });

    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        if (text) {
          console.error(`[page:error] ${text}`);
        }
      }
    });
    page.on("pageerror", (error) => {
      console.error(`[page:error] ${error.message}`);
    });

    await page.setViewport({
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
    });

    const analysisUrl = `/.render-cache/${cacheId}/analysis.json`;
    const pageUrl = `http://127.0.0.1:${server.port}/${options.build}/index.html?offline=1&analysis=${encodeURIComponent(analysisUrl)}`;
    await page.goto(pageUrl, { waitUntil: "networkidle0" });
    await page.waitForFunction(
      () => window.__VISUAL_EXPORT && (window.__VISUAL_EXPORT.ready === true || Boolean(window.__VISUAL_EXPORT.error)),
      { timeout: 30000 }
    );

    const exportStatus = await page.evaluate(() => ({
      ready: window.__VISUAL_EXPORT?.ready === true,
      error: window.__VISUAL_EXPORT?.error || "",
    }));
    if (!exportStatus.ready) {
      throw new Error(`Offline renderer failed to initialize: ${exportStatus.error || "unknown error"}`);
    }
    timings.bootstrapMs = Date.now() - stepStartedAt;

    stepStartedAt = Date.now();
    await renderToVideo({
      page,
      inputPath,
      outputPath,
      width: options.width,
      height: options.height,
      fps: options.fps,
      frameCount: analysis.frameCount,
      jpegQuality: options.jpegQuality,
      crf: options.crf,
      duration: analysis.duration,
    });
    timings.renderMs = Date.now() - stepStartedAt;
  } finally {
    if (browser) {
      await browser.close();
    }
    await closeServer(server.instance);
  }

  const finishedAt = Date.now();
  const outputStats = await fsp.stat(outputPath);
  const outputMeta = probeMediaMetadata(outputPath);

  printRenderSummary({
    startedAt,
    finishedAt,
    build: options.build,
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
    analysisSampleRate: sampleRate,
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
    build: "space-build",
    preset: "reel",
    fps: 30,
    width: preset.width,
    height: preset.height,
    sampleRate: 44100,
    jpegQuality: 92,
    crf: 18,
    help: false,
    maxFrames: 0,
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
    } else if (arg === "--build") {
      options.build = next;
      i += 1;
    } else if (arg === "--preset") {
      const dimensions = PRESETS[next];
      if (!dimensions) {
        throw new Error(`Unknown preset: ${next}`);
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
    } else if (arg === "--chrome") {
      options.chrome = next;
      i += 1;
    } else if (arg === "--max-frames") {
      options.maxFrames = Number.parseInt(next, 10);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node tools/render-video.mjs --input ./Metallic_Drive_II.wav --output ./out.mp4 --preset reel

Options:
  --input, -i         Path to the source audio file
  --output, -o        Output video path (defaults beside the input file)
  --build             Build folder to render (default: space-build)
  --preset            reel | feed | square | landscape
  --width             Custom output width
  --height            Custom output height
  --fps               Frames per second (default: 30)
  --sample-rate       Audio analysis sample rate (default: 44100)
  --jpeg-quality      Screenshot JPEG quality 1-100 (default: 92)
  --crf               ffmpeg x264 CRF value (default: 18)
  --chrome            Override Chrome executable path
  --max-frames        Render only the first N frames (useful for tests)
  --help, -h          Show this message
`);
}

function defaultOutputPath(inputPath, options) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}-${options.build}.mp4`);
}

function probeDuration(inputPath) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `ffprobe failed for ${inputPath}`);
  }

  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine duration for ${inputPath}`);
  }

  return duration;
}

function probeMediaMetadata(filePath) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels",
      filePath,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `ffprobe failed for ${filePath}`);
  }

  const parsed = JSON.parse(result.stdout || "{}");
  const format = parsed.format || {};
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video") || {};
  const audio = streams.find((stream) => stream.codec_type === "audio") || {};

  return {
    duration: Number.parseFloat(format.duration) || 0,
    width: Number.isFinite(video.width) ? video.width : 0,
    height: Number.isFinite(video.height) ? video.height : 0,
    frameRate: parseFrameRate(video.avg_frame_rate),
    videoCodec: video.codec_name || "unknown",
    audioCodec: audio.codec_name || "unknown",
    audioSampleRate: Number.parseInt(audio.sample_rate || "0", 10) || 0,
    audioChannels: Number.parseInt(audio.channels || "0", 10) || 0,
  };
}

async function decodeAudioToSamples(inputPath, sampleRate) {
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "f32le",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const chunks = [];
  let stderr = "";

  ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const [code] = await once(ffmpeg, "close");
  if (code !== 0) {
    throw new Error(stderr || `ffmpeg failed while decoding ${inputPath}`);
  }

  const buffer = Buffer.concat(chunks);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(arrayBuffer);
}

function buildAnalysis(samples, sampleRate, fps, frameCount) {
  const fftSize = 2048;
  const halfWindow = fftSize >> 1;
  const fft = new FFT(fftSize);
  const spectrum = fft.createComplexArray();
  const windowed = new Float32Array(fftSize);
  const hann = createHannWindow(fftSize);
  const rawFrames = new Array(frameCount);
  const bandSeries = Object.fromEntries(BAND_DEFS.map((def) => [def.key, []]));

  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = Math.floor((frame / fps) * sampleRate);
    for (let i = 0; i < fftSize; i += 1) {
      const sampleIndex = center + i - halfWindow;
      const sample = sampleIndex >= 0 && sampleIndex < samples.length ? samples[sampleIndex] : 0;
      windowed[i] = sample * hann[i];
    }

    fft.realTransform(spectrum, windowed);

    const bands = {};
    for (const def of BAND_DEFS) {
      const value = averageBandFromSpectrum(spectrum, sampleRate, fftSize, def.min, def.max);
      bands[def.key] = value;
      bandSeries[def.key].push(value);
    }

    rawFrames[frame] = bands;
  }

  const scales = {};
  for (const def of BAND_DEFS) {
    scales[def.key] = percentile(bandSeries[def.key], 0.95) || 1e-6;
  }

  const smoothed = Object.fromEntries(BAND_DEFS.map((def) => [def.key, 0]));
  const frames = new Array(frameCount);
  let kickPulse = 0;
  let snarePulse = 0;
  let hatPulse = 0;
  let lastKick = -10;
  let lastSnare = -10;
  let lastHat = -10;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const now = frame / fps;
    kickPulse *= 0.88;
    snarePulse *= 0.84;
    hatPulse *= 0.8;

    const rawBands = rawFrames[frame];
    const bands = {};

    for (const def of BAND_DEFS) {
      const normalized = Math.min(rawBands[def.key] / scales[def.key], 1.2);
      smoothed[def.key] = lerp(smoothed[def.key], normalized, def.smooth);
      bands[def.key] = smoothed[def.key];
    }

    const kickRise = bands.bass - bands.sub * 0.14;
    const snareRise = bands.highMid + bands.lowMid * 0.34;
    const hatRise = bands.air + bands.presence * 0.36;

    if (now - lastKick > 0.14 && bands.bass > 0.34 && kickRise > 0.22) {
      lastKick = now;
      kickPulse = 1;
    }

    if (now - lastSnare > 0.16 && bands.highMid > 0.2 && snareRise > 0.34) {
      lastSnare = now;
      snarePulse = 1;
    }

    if (now - lastHat > 0.08 && bands.air > 0.14 && hatRise > 0.24) {
      lastHat = now;
      hatPulse = 1;
    }

    frames[frame] = {
      bands,
      kickPulse,
      snarePulse,
      hatPulse,
    };
  }

  return {
    fps,
    frameCount,
    duration: frameCount / fps,
    frames,
  };
}

function averageBandFromSpectrum(spectrum, sampleRate, fftSize, minHz, maxHz) {
  const binHz = sampleRate / fftSize;
  const start = Math.max(0, Math.floor(minHz / binHz));
  const end = Math.min((fftSize >> 1) - 1, Math.ceil(maxHz / binHz));
  let sum = 0;
  let count = 0;

  for (let i = start; i <= end; i += 1) {
    const re = spectrum[i * 2];
    const im = spectrum[i * 2 + 1];
    const magnitude = Math.sqrt(re * re + im * im) / fftSize;
    sum += magnitude;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function createHannWindow(size) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

async function renderToVideo(options) {
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      String(options.fps),
      "-i",
      "pipe:0",
      "-i",
      options.inputPath,
      "-t",
      String(options.duration),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(options.crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-shortest",
      options.outputPath,
    ],
    { stdio: ["pipe", "inherit", "pipe"] }
  );

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const logInterval = Math.max(1, Math.floor(options.fps));
  const inlineProgress =
    Boolean(process.stdout.isTTY) &&
    typeof process.stdout.clearLine === "function" &&
    typeof process.stdout.cursorTo === "function";

  for (let frame = 0; frame < options.frameCount; frame += 1) {
    await options.page.evaluate((frameIndex) => window.__VISUAL_EXPORT.renderFrame(frameIndex), frame);
    const image = await options.page.screenshot({
      type: "jpeg",
      quality: options.jpegQuality,
    });

    if (!ffmpeg.stdin.write(image)) {
      await once(ffmpeg.stdin, "drain");
    }

    if (frame % logInterval === 0 || frame === options.frameCount - 1) {
      const percent = ((frame + 1) / options.frameCount) * 100;
      const line = `Rendered ${frame + 1}/${options.frameCount} frames (${percent.toFixed(1)}%)`;
      if (inlineProgress) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(line);
      } else {
        console.log(line);
      }
    }
  }

  if (inlineProgress) {
    process.stdout.write("\n");
  }

  ffmpeg.stdin.end();
  const [code] = await once(ffmpeg, "close");
  if (code !== 0) {
    throw new Error(stderr || "ffmpeg failed while encoding the video.");
  }
}

async function createStaticServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      let filePath = path.join(root, decodeURIComponent(requestUrl.pathname));

      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      let stats = await fsp.stat(filePath).catch(() => null);
      if (stats && stats.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        stats = await fsp.stat(filePath).catch(() => null);
      }

      if (!stats || !stats.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.setHeader("Content-Type", contentType(filePath));
      res.setHeader("Cache-Control", "no-store");
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    instance: server,
    port: address.port,
  };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

async function closeServer(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function parseFrameRate(value) {
  if (!value || typeof value !== "string") {
    return 0;
  }

  const [numeratorRaw, denominatorRaw] = value.split("/");
  const numerator = Number.parseFloat(numeratorRaw);
  const denominator = Number.parseFloat(denominatorRaw);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
    return numerator / denominator;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function printRenderSummary(summary) {
  const totalMs = summary.finishedAt - summary.startedAt;
  const realtimeRate = summary.renderDuration / Math.max(totalMs / 1000, 1e-6);
  const displayFps = summary.fps.toFixed(2).replace(/\.00$/, "");
  const lines = [
    ["Pipeline", "offline audio analysis -> frame render -> H.264/AAC encode"],
    ["Build", summary.build],
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
    `bootstrap ${formatElapsed(timings.bootstrapMs || 0)}`,
    `render ${formatElapsed(timings.renderMs || 0)}`,
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
