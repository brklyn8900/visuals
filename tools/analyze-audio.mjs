import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";

import FFT from "fft.js";

export const BAND_DEFS = [
  { key: "sub", min: 20, max: 60, smooth: 0.28 },
  { key: "bass", min: 60, max: 140, smooth: 0.26 },
  { key: "lowMid", min: 140, max: 400, smooth: 0.24 },
  { key: "mid", min: 400, max: 1400, smooth: 0.22 },
  { key: "highMid", min: 1400, max: 3200, smooth: 0.22 },
  { key: "presence", min: 3200, max: 6000, smooth: 0.20 },
  { key: "air", min: 6000, max: 12000, smooth: 0.18 },
];

export const PRESETS = {
  reel: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

export function probeDuration(inputPath) {
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

export function probeMediaMetadata(filePath) {
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

export async function decodeAudioToSamples(inputPath, sampleRate) {
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

export function buildAnalysis(samples, sampleRate, fps, frameCount) {
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

export async function analyzeAudio(inputPath, options = {}) {
  const fps = options.fps || 30;
  const sampleRate = options.sampleRate || 44100;
  const maxFrames = options.maxFrames || 0;
  const timings = {};

  let stepStartedAt = Date.now();
  const duration = probeDuration(inputPath);
  timings.probeMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  const samples = await decodeAudioToSamples(inputPath, sampleRate);
  timings.decodeMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  const targetFrameCount = maxFrames
    ? Math.max(1, maxFrames)
    : Math.max(1, Math.ceil(duration * fps));
  const analysis = buildAnalysis(samples, sampleRate, fps, targetFrameCount);
  timings.analysisMs = Date.now() - stepStartedAt;

  return { analysis, duration, timings };
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

// CLI mode
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const argv = process.argv.slice(2);
  let inputPath = null;
  let outputPath = null;
  let fps = 30;
  let sampleRate = 44100;
  let maxFrames = 0;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--input" || arg === "-i") {
      inputPath = next;
      i += 1;
    } else if (arg === "--output" || arg === "-o") {
      outputPath = next;
      i += 1;
    } else if (arg === "--fps") {
      fps = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--sample-rate") {
      sampleRate = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--max-frames") {
      maxFrames = Number.parseInt(next, 10);
      i += 1;
    }
  }

  if (help || !inputPath) {
    console.log(`Usage:
  node tools/analyze-audio.mjs --input <audio-file> [options]

Options:
  --input, -i       Path to the source audio file (required)
  --output, -o      Output JSON path (default: stdout)
  --fps             Frames per second (default: 30)
  --sample-rate     Audio analysis sample rate (default: 44100)
  --max-frames      Analyze only the first N frames
  --help, -h        Show this message
`);
    process.exit(help ? 0 : 1);
  }

  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Audio file not found: ${resolved}`);
    process.exit(1);
  }

  const { analysis, duration, timings } = await analyzeAudio(resolved, { fps, sampleRate, maxFrames });
  const json = JSON.stringify(analysis);

  if (outputPath) {
    await fsp.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await fsp.writeFile(path.resolve(outputPath), json);
    console.error(`Wrote ${analysis.frameCount} frames (${duration.toFixed(2)}s) to ${outputPath}`);
    console.error(`Timings: probe ${timings.probeMs}ms | decode ${timings.decodeMs}ms | analyze ${timings.analysisMs}ms`);
  } else {
    process.stdout.write(json);
  }
}
