let track;
let fft;
let kickPeak;
let snarePeak;
let hatPeak;

let started = false;

let kickPulse = 0;
let snarePulse = 0;
let hatPulse = 0;

let shocks = [];
let sparks = [];

const IDLE_WAVEFORM = new Array(64).fill(0);
const BAND_KEYS = ["sub", "bass", "lowMid", "mid", "highMid", "presence", "air"];
const BAND_RANGES = {
  sub: [20, 60],
  bass: [60, 140],
  lowMid: [140, 400],
  mid: [400, 1400],
  highMid: [1400, 3200],
  presence: [3200, 6000],
  air: [6000, 12000],
};

const rawBands = {
  sub: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  presence: 0,
  air: 0,
};

const smoothBands = {
  sub: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  presence: 0,
  air: 0,
};

const ASCII_CORE = " .:-=+*#%@";
const ASCII_RING = " .-:=+oO0";
const ASCII_RIBBON = " ._-=~";
const ASCII_SLASH = " ./\\\\|xX";
const ASCII_NOISE = " ..:*";
const ASCII_SPARKS = ["+", "x", "/", "\\", "*", ":"];

const PHASE_KEYS = [
  {
    at: 0,
    label: "BOOT",
    bgTop: [8, 13, 24],
    bgBottom: [15, 16, 28],
    grid: [67, 112, 154],
    primary: [238, 243, 255],
    accent: [102, 216, 255],
    accent2: [255, 132, 84],
    fieldWidth: 0.64,
    fieldHeight: 0.46,
    coreSize: 0.22,
    ringBase: 0.26,
    ringGap: 0.13,
    ringCount: 2,
    waveformAmp: 0.07,
    waveLoops: 2.4,
    ribbonNoise: 0.02,
    slashTilt: 0.12,
    centerShift: -0.04,
    gridSpacing: 56,
    gridAlpha: 18,
    scanner: 0,
    rotationSpeed: 0.22,
    spinDir: 1,
  },
  {
    at: 0.22,
    label: "BUILD",
    bgTop: [7, 20, 34],
    bgBottom: [16, 22, 34],
    grid: [85, 154, 190],
    primary: [242, 247, 255],
    accent: [93, 230, 255],
    accent2: [255, 152, 96],
    fieldWidth: 0.68,
    fieldHeight: 0.5,
    coreSize: 0.24,
    ringBase: 0.28,
    ringGap: 0.11,
    ringCount: 3,
    waveformAmp: 0.1,
    waveLoops: 3.2,
    ribbonNoise: 0.04,
    slashTilt: 0.2,
    centerShift: -0.015,
    gridSpacing: 52,
    gridAlpha: 22,
    scanner: 0.14,
    rotationSpeed: 0.32,
    spinDir: 1,
  },
  {
    at: 0.48,
    label: "DROP",
    bgTop: [20, 11, 16],
    bgBottom: [34, 14, 17],
    grid: [173, 96, 74],
    primary: [255, 242, 221],
    accent: [255, 178, 96],
    accent2: [255, 101, 65],
    fieldWidth: 0.74,
    fieldHeight: 0.54,
    coreSize: 0.25,
    ringBase: 0.27,
    ringGap: 0.09,
    ringCount: 5,
    waveformAmp: 0.14,
    waveLoops: 4.4,
    ribbonNoise: 0.06,
    slashTilt: 0.34,
    centerShift: 0,
    gridSpacing: 46,
    gridAlpha: 28,
    scanner: 0.26,
    rotationSpeed: 0.44,
    spinDir: -1,
  },
  {
    at: 0.74,
    label: "BREAK",
    bgTop: [8, 12, 18],
    bgBottom: [12, 20, 31],
    grid: [119, 163, 206],
    primary: [236, 245, 255],
    accent: [126, 197, 255],
    accent2: [255, 217, 132],
    fieldWidth: 0.62,
    fieldHeight: 0.44,
    coreSize: 0.2,
    ringBase: 0.24,
    ringGap: 0.14,
    ringCount: 2,
    waveformAmp: 0.06,
    waveLoops: 1.8,
    ribbonNoise: 0.025,
    slashTilt: 0.16,
    centerShift: -0.06,
    gridSpacing: 60,
    gridAlpha: 20,
    scanner: 0.72,
    rotationSpeed: 0.16,
    spinDir: 1,
  },
  {
    at: 0.88,
    label: "OVERDRIVE",
    bgTop: [28, 17, 13],
    bgBottom: [13, 11, 19],
    grid: [196, 147, 96],
    primary: [255, 245, 224],
    accent: [255, 208, 120],
    accent2: [104, 221, 255],
    fieldWidth: 0.78,
    fieldHeight: 0.56,
    coreSize: 0.26,
    ringBase: 0.28,
    ringGap: 0.082,
    ringCount: 6,
    waveformAmp: 0.16,
    waveLoops: 5.4,
    ribbonNoise: 0.07,
    slashTilt: 0.38,
    centerShift: 0.01,
    gridSpacing: 44,
    gridAlpha: 30,
    scanner: 0.32,
    rotationSpeed: 0.52,
    spinDir: -1,
  },
  {
    at: 1,
    label: "OVERDRIVE",
    bgTop: [28, 17, 13],
    bgBottom: [13, 11, 19],
    grid: [196, 147, 96],
    primary: [255, 245, 224],
    accent: [255, 208, 120],
    accent2: [104, 221, 255],
    fieldWidth: 0.78,
    fieldHeight: 0.56,
    coreSize: 0.26,
    ringBase: 0.28,
    ringGap: 0.082,
    ringCount: 6,
    waveformAmp: 0.16,
    waveLoops: 5.4,
    ribbonNoise: 0.07,
    slashTilt: 0.38,
    centerShift: 0.01,
    gridSpacing: 44,
    gridAlpha: 30,
    scanner: 0.32,
    rotationSpeed: 0.52,
    spinDir: -1,
  },
];

function preload() {
  soundFormats("wav", "mp3");
  track = loadSound("Metallic_Drive_II.wav");
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(document.body);
  pixelDensity(1);
  rectMode(CENTER);
  textFont("Share Tech Mono");
  noStroke();

  fft = new p5.FFT(0.8, 512);
  fft.setInput(track);

  kickPeak = new p5.PeakDetect(30, 120, 0.18, 18);
  snarePeak = new p5.PeakDetect(160, 1400, 0.22, 12);
  hatPeak = new p5.PeakDetect(3500, 10000, 0.16, 10);

  kickPeak.onPeak(onKick);
  snarePeak.onPeak(onSnare);
  hatPeak.onPeak(onHat);

  const startButton = document.getElementById("start-btn");
  if (startButton) {
    startButton.addEventListener("click", startAudio);
  }
}

function startAudio() {
  if (!track || !track.isLoaded()) {
    return;
  }

  userStartAudio().then(() => {
    if (track.isPlaying()) {
      track.stop();
    }
    track.loop();
    started = true;
    resetTransientState();
    const overlay = document.getElementById("start-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
    }
  });
}

function resetTransientState() {
  kickPulse = 0;
  snarePulse = 0;
  hatPulse = 0;
  shocks = [];
  sparks = [];
  for (const key of BAND_KEYS) {
    rawBands[key] = 0;
    smoothBands[key] = 0;
  }
}

function onKick() {
  kickPulse = 1;
  shocks.push({
    radius: min(width, height) * 0.15,
    speed: 12 + smoothBands.bass * 20,
    alpha: 225,
    spin: random(TWO_PI),
  });
  spawnSparks(18, false);
}

function onSnare() {
  snarePulse = 1;
  spawnSparks(14, true);
}

function onHat() {
  hatPulse = 1;
  spawnSparks(8, true);
}

function spawnSparks(count, lateral) {
  const spread = min(width, height) * 0.09;
  for (let i = 0; i < count; i += 1) {
    const angle = lateral
      ? random([-1, 1]) * random(0.08, 0.42) + random(-0.04, 0.04)
      : random(TWO_PI);
    const speed = random(3, 9) + kickPulse * 6 + snarePulse * 4 + hatPulse * 2;
    sparks.push({
      x: random(-spread * 0.25, spread * 0.25),
      y: random(-spread * 0.25, spread * 0.25),
      vx: cos(angle) * speed,
      vy: sin(angle) * speed * (lateral ? 0.56 : 1),
      alpha: random(120, 240),
      life: floor(random(18, 34)),
      char: random(ASCII_SPARKS),
      tone: random() > 0.55 ? 1 : 0,
    });
  }
}

function draw() {
  if (!started) {
    drawIdleFrame();
    return;
  }

  fft.analyze();
  kickPeak.update(fft);
  snarePeak.update(fft);
  hatPeak.update(fft);

  updateBands();

  const waveform = fft.waveform();
  const duration = track.duration();
  const progress = duration > 0 ? track.currentTime() / duration : 0;
  const phase = samplePhase(progress);

  updateTransientSystems();
  drawBackground(phase, progress);

  push();
  translate(width * 0.5, height * (0.5 + phase.centerShift));
  drawAsciiShockwaves(phase);
  drawAsciiField(phase, waveform, progress);
  drawAsciiSparks(phase);
  pop();

  drawHud(phase, progress, duration);

  if (!track.isPlaying()) {
    drawCenterText("Paused");
  }
}

function updateBands() {
  rawBands.sub = fft.getEnergy(...BAND_RANGES.sub) / 255;
  rawBands.bass = fft.getEnergy(...BAND_RANGES.bass) / 255;
  rawBands.lowMid = fft.getEnergy(...BAND_RANGES.lowMid) / 255;
  rawBands.mid = fft.getEnergy(...BAND_RANGES.mid) / 255;
  rawBands.highMid = fft.getEnergy(...BAND_RANGES.highMid) / 255;
  rawBands.presence = fft.getEnergy(...BAND_RANGES.presence) / 255;
  rawBands.air = fft.getEnergy(...BAND_RANGES.air) / 255;

  smoothBands.sub = lerp(smoothBands.sub, rawBands.sub, 0.3);
  smoothBands.bass = lerp(smoothBands.bass, rawBands.bass, 0.28);
  smoothBands.lowMid = lerp(smoothBands.lowMid, rawBands.lowMid, 0.24);
  smoothBands.mid = lerp(smoothBands.mid, rawBands.mid, 0.24);
  smoothBands.highMid = lerp(smoothBands.highMid, rawBands.highMid, 0.22);
  smoothBands.presence = lerp(smoothBands.presence, rawBands.presence, 0.22);
  smoothBands.air = lerp(smoothBands.air, rawBands.air, 0.2);
}

function updateTransientSystems() {
  kickPulse *= 0.88;
  snarePulse *= 0.84;
  hatPulse *= 0.8;

  for (let i = shocks.length - 1; i >= 0; i -= 1) {
    const shock = shocks[i];
    shock.radius += shock.speed;
    shock.alpha *= 0.92;
    shock.spin += 0.02;
    if (shock.alpha < 5) {
      shocks.splice(i, 1);
    }
  }

  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.x += spark.vx;
    spark.y += spark.vy;
    spark.vx *= 0.985;
    spark.vy *= 0.985;
    spark.alpha *= 0.93;
    spark.life -= 1;
    if (spark.life <= 0 || spark.alpha < 5) {
      sparks.splice(i, 1);
    }
  }
}

function drawIdleFrame() {
  const phase = samplePhase(0.08);
  drawBackground(phase, 0);
  push();
  translate(width * 0.5, height * (0.5 + phase.centerShift));
  drawAsciiField(phase, IDLE_WAVEFORM, 0);
  pop();
  drawHud(phase, 0, 0);
  drawCenterText("Click Start");
}

function drawBackground(phase, progress) {
  const ctx = drawingContext;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, rgbString(phase.bgTop));
  gradient.addColorStop(1, rgbString(phase.bgBottom));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawGrid(phase);

  noStroke();
  fillColor(mixColor(phase.accent, phase.accent2, 0.35), 18 + smoothBands.bass * 34 + kickPulse * 42);
  ellipse(
    width * 0.5,
    height * (0.5 + phase.centerShift),
    min(width, height) * (0.68 + smoothBands.lowMid * 0.32 + kickPulse * 0.18),
    min(width, height) * (0.48 + smoothBands.mid * 0.26 + snarePulse * 0.12)
  );

  if (phase.scanner > 0.01) {
    const x = ((progress * 1.45 + frameCount * 0.0005) % 1) * width;
    push();
    rectMode(CORNER);
    fillColor(phase.accent, 12 + phase.scanner * 24 + hatPulse * 26);
    rect(x, 0, width * (0.025 + phase.scanner * 0.03), height);
    pop();
  }
}

function drawGrid(phase) {
  strokeColor(phase.grid, phase.gridAlpha + smoothBands.air * 28 + hatPulse * 20);
  strokeWeight(1);
  const spacing = phase.gridSpacing;
  for (let x = 0; x <= width; x += spacing) {
    line(x, 0, x, height);
  }
  for (let y = 0; y <= height; y += spacing) {
    line(0, y, width, y);
  }
  strokeColor(phase.primary, 18 + kickPulse * 24);
  line(0, height * 0.5, width, height * 0.5);
  noStroke();
}

function drawAsciiField(phase, waveform, progress) {
  const fieldW = min(width * phase.fieldWidth, 900);
  const fieldH = min(height * phase.fieldHeight, 500);
  const cols = max(34, floor(fieldW / 16));
  const rows = max(18, floor(fieldH / 18));
  const cellW = fieldW / cols;
  const cellH = fieldH / rows;
  const aspect = fieldW / fieldH;
  const angle =
    frameCount * 0.005 * phase.rotationSpeed * phase.spinDir +
    progress * TWO_PI * 0.07 * phase.spinDir;
  const cosA = cos(angle);
  const sinA = sin(angle);
  const ribbonAmp = phase.waveformAmp * (0.55 + smoothBands.mid * 1.1 + kickPulse * 0.85);

  textAlign(CENTER, CENTER);
  textSize(cellH * 0.9);

  for (let row = 0; row < rows; row += 1) {
    const py = -fieldH * 0.5 + (row + 0.5) * cellH;
    const ny = map(row + 0.5, 0, rows, -0.92, 0.92);

    for (let col = 0; col < cols; col += 1) {
      const px = -fieldW * 0.5 + (col + 0.5) * cellW;
      const nx = map(col + 0.5, 0, cols, -1, 1);

      const rx0 = nx * aspect * 0.6;
      const ry0 = ny * 0.88;
      const rx = rx0 * cosA - ry0 * sinA;
      const ry = rx0 * sinA + ry0 * cosA;

      const radius = sqrt(rx * rx + ry * ry);
      const square = max(abs(rx * 0.94), abs(ry * 1.06));

      const core = constrain(
        map(square, phase.coreSize * (0.6 + smoothBands.sub * 0.2), phase.coreSize * (1.22 + kickPulse * 0.24), 1, 0),
        0,
        1
      );

      let ring = 0;
      for (let i = 0; i < phase.ringCount; i += 1) {
        const ringR =
          phase.ringBase +
          i * phase.ringGap +
          sin(frameCount * 0.028 + i * 0.92 + nx * 2.4) * 0.008 * (1 + smoothBands.lowMid * 1.6) +
          kickPulse * 0.024;
        ring = max(ring, constrain(1 - abs(radius - ringR) * (10 + smoothBands.bass * 10 + hatPulse * 6), 0, 1));
      }

      const waveIndex = floor(map(col, 0, cols - 1, 0, waveform.length - 1));
      const waveSample = waveform[waveIndex] || 0;
      const waveY =
        waveSample * ribbonAmp +
        sin(nx * PI * phase.waveLoops + frameCount * 0.03 * phase.spinDir) *
          phase.ribbonNoise *
          (1 + smoothBands.lowMid * 1.2);
      const ribbon = constrain(1 - abs(ny - waveY) * (7 + smoothBands.mid * 10 + kickPulse * 6), 0, 1);

      const slashBase =
        abs(ry + rx * phase.slashTilt + sin(frameCount * 0.028 + row * 0.18 + col * 0.04) * 0.12 * (0.3 + smoothBands.highMid + snarePulse));
      const slash = constrain(1 - slashBase * (7 + smoothBands.highMid * 16 + snarePulse * 12), 0, 1);

      const grain = fract(sin((col + 1) * 12.9898 + (row + 1) * 78.233 + frameCount * 0.12) * 43758.5453123);
      const speckle = constrain((grain - (0.95 - smoothBands.air * 0.42 - hatPulse * 0.2)) * 10, 0, 1);

      const coreScore = core * (1.08 + smoothBands.sub * 0.4);
      const ringScore = ring * (0.9 + smoothBands.lowMid * 0.6);
      const ribbonScore = ribbon * (0.95 + smoothBands.mid * 0.8);
      const slashScore = slash * (0.84 + smoothBands.highMid * 0.9 + snarePulse * 0.55);
      const speckleScore = speckle * (0.55 + smoothBands.air * 0.6 + hatPulse * 0.32);

      const strength = max(coreScore, ringScore, ribbonScore, slashScore, speckleScore);
      if (strength < 0.12) {
        continue;
      }

      let char;
      let ink;
      let alpha;

      if (
        coreScore >= ringScore &&
        coreScore >= ribbonScore &&
        coreScore >= slashScore &&
        coreScore >= speckleScore
      ) {
        char = pickChar(ASCII_CORE, coreScore);
        ink = mixColor(phase.primary, phase.accent2, smoothBands.sub * 0.5 + kickPulse * 0.2);
        alpha = 70 + coreScore * 170 + kickPulse * 40;
      } else if (
        ribbonScore >= ringScore &&
        ribbonScore >= slashScore &&
        ribbonScore >= speckleScore
      ) {
        char = pickChar(ASCII_RIBBON, ribbonScore);
        ink = mixColor(phase.accent, phase.accent2, smoothBands.mid * 0.25 + snarePulse * 0.15);
        alpha = 70 + ribbonScore * 160 + kickPulse * 30;
      } else if (slashScore >= ringScore && slashScore >= speckleScore) {
        char = pickChar(ASCII_SLASH, slashScore);
        ink = mixColor(phase.accent2, phase.primary, smoothBands.highMid * 0.2);
        alpha = 70 + slashScore * 170 + snarePulse * 60;
      } else if (ringScore >= speckleScore) {
        char = pickChar(ASCII_RING, ringScore);
        ink = mixColor(phase.primary, phase.accent, smoothBands.lowMid * 0.4 + hatPulse * 0.08);
        alpha = 60 + ringScore * 150 + hatPulse * 25;
      } else {
        char = pickChar(ASCII_NOISE, speckleScore);
        ink = phase.primary;
        alpha = 50 + speckleScore * 125 + hatPulse * 50;
      }

      fillColor(ink, alpha);
      text(char, px, py);
    }
  }
}

function drawAsciiShockwaves(phase) {
  textAlign(CENTER, CENTER);
  for (const shock of shocks) {
    const count = 18 + floor(shock.radius / 22);
    const size = min(18, 8 + shock.radius * 0.03);
    textSize(size);
    for (let i = 0; i < count; i += 1) {
      const angle = shock.spin + (TWO_PI * i) / count;
      const x = cos(angle) * shock.radius;
      const y = sin(angle) * shock.radius * 0.74;
      fillColor(i % 2 === 0 ? phase.accent : phase.primary, shock.alpha);
      text(i % 2 === 0 ? "o" : "0", x, y);
    }
  }
}

function drawAsciiSparks(phase) {
  textAlign(CENTER, CENTER);
  for (const spark of sparks) {
    textSize(11 + spark.life * 0.08);
    fillColor(spark.tone === 1 ? phase.accent2 : phase.primary, spark.alpha);
    text(spark.char, spark.x, spark.y);
  }
}

function drawHud(phase, progress, duration) {
  const current = duration > 0 ? progress * duration : 0;

  textAlign(LEFT, TOP);
  textSize(12);
  fillColor(phase.primary, 190);
  text("PULSE LATTICE", 28, 24);
  fillColor(phase.accent, 150);
  text(phase.label, 28, 42);
  fillColor(phase.primary, 140);
  text(`${formatTime(current)} / ${formatTime(duration)}`, 28, 60);

  const leftBands = [
    ["SUB", smoothBands.sub],
    ["BASS", smoothBands.bass],
    ["LOWMID", smoothBands.lowMid],
    ["MID", smoothBands.mid],
  ];
  const rightBands = [
    ["HIGHMID", smoothBands.highMid],
    ["PRES", smoothBands.presence],
    ["AIR", smoothBands.air],
  ];

  textSize(11);
  let y = 96;
  for (const [label, value] of leftBands) {
    fillColor(phase.primary, 150);
    text(`${label.padEnd(7, " ")} ${asciiMeter(value, 12)}`, 28, y);
    y += 18;
  }

  y = 96;
  textAlign(RIGHT, TOP);
  for (const [label, value] of rightBands) {
    fillColor(phase.primary, 150);
    text(`${label.padEnd(7, " ")} ${asciiMeter(value, 10)}`, width - 28, y);
    y += 18;
  }

  fillColor(phase.accent2, 160 + kickPulse * 60);
  text(`KICK ${asciiPulse(kickPulse, "#")}`, width - 28, y + 12);
  fillColor(phase.accent2, 140 + snarePulse * 80);
  text(`SNARE ${asciiPulse(snarePulse, "/")}`, width - 28, y + 30);
  fillColor(phase.accent, 140 + hatPulse * 90);
  text(`HAT ${asciiPulse(hatPulse, ".")}`, width - 28, y + 48);

  push();
  rectMode(CORNER);
  noStroke();
  fillColor(phase.primary, 24);
  rect(28, height - 34, width - 56, 6);
  fillColor(phase.accent2, 110);
  rect(28, height - 34, (width - 56) * constrain(progress, 0, 1), 6);
  pop();
}

function drawCenterText(label) {
  push();
  textAlign(CENTER, CENTER);
  textSize(min(width, height) * 0.026);
  fill(238, 243, 255, 230);
  text(label, width * 0.5, height * 0.86);
  pop();
}

function asciiMeter(value, width) {
  const filled = floor(constrain(value, 0, 1) * width);
  return `[${"#".repeat(filled)}${".".repeat(width - filled)}]`;
}

function asciiPulse(value, char) {
  const count = floor(constrain(value, 0, 1) * 8);
  return `[${char.repeat(count)}${".".repeat(8 - count)}]`;
}

function pickChar(set, value) {
  const index = floor(constrain(value, 0, 0.9999) * set.length);
  return set[index];
}

function samplePhase(progress) {
  if (progress <= PHASE_KEYS[0].at) {
    return PHASE_KEYS[0];
  }

  for (let i = 0; i < PHASE_KEYS.length - 1; i += 1) {
    const current = PHASE_KEYS[i];
    const next = PHASE_KEYS[i + 1];
    if (progress <= next.at) {
      const t = map(progress, current.at, next.at, 0, 1);
      return mixState(current, next, t);
    }
  }

  return PHASE_KEYS[PHASE_KEYS.length - 1];
}

function mixState(a, b, t) {
  const mixed = {};
  for (const key of Object.keys(a)) {
    const av = a[key];
    const bv = b[key];
    if (key === "label" || key === "at") {
      mixed[key] = t < 0.5 ? av : bv;
    } else if (Array.isArray(av)) {
      mixed[key] = mixColor(av, bv, t);
    } else {
      mixed[key] = lerp(av, bv, t);
    }
  }
  return mixed;
}

function mixColor(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function fract(value) {
  return value - floor(value);
}

function fillColor(color, alpha = 255) {
  fill(color[0], color[1], color[2], alpha);
}

function strokeColor(color, alpha = 255) {
  stroke(color[0], color[1], color[2], alpha);
}

function rgbString(color) {
  return `rgb(${round(color[0])} ${round(color[1])} ${round(color[2])})`;
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? max(0, floor(seconds)) : 0;
  const minutes = floor(safe / 60);
  const remainder = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function mousePressed() {
  if (!started) {
    return;
  }

  if (track.isPlaying()) {
    track.pause();
  } else {
    track.play();
  }

  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
