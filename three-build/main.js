import * as THREE from "three";

const PARTICLE_COUNT = 11000;
const DEBRIS_COUNT = 2200;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const BAND_DEFS = [
  { key: "sub", min: 20, max: 60, smooth: 0.28 },
  { key: "bass", min: 60, max: 140, smooth: 0.26 },
  { key: "lowMid", min: 140, max: 400, smooth: 0.24 },
  { key: "mid", min: 400, max: 1400, smooth: 0.22 },
  { key: "highMid", min: 1400, max: 3200, smooth: 0.22 },
  { key: "presence", min: 3200, max: 6000, smooth: 0.2 },
  { key: "air", min: 6000, max: 12000, smooth: 0.18 },
];

const LAYER_ROLE_COLORS = [
  {
    base: [0.14, 0.76, 1.00],
    peak: [0.72, 0.96, 1.00],
  },
  {
    base: [1.00, 0.56, 0.10],
    peak: [1.00, 0.88, 0.22],
  },
  {
    base: [0.92, 0.20, 0.88],
    peak: [1.00, 0.54, 1.00],
  },
];

const PHASE_KEYS = [
  {
    at: 0,
    label: "DORMANT",
    bg: [0.0010, 0.0014, 0.0030],
    fog: [0.0050, 0.0060, 0.0120],
    primary: [0.28, 0.72, 1.00],
    accent: [0.92, 0.26, 0.92],
    hot: [1.00, 0.62, 0.16],
    shellScale: 0.74,
    helixScale: 0.68,
    haloScale: 0.80,
    verticalDrift: 0.24,
    waveAmp: 0.28,
    turbulence: 0.22,
    cameraRadius: 126,
    spin: 0.18,
    collapse: 0.08,
    shear: 0.12,
    ribbon: 0.22,
    debrisGain: 0.18,
    cameraLift: 0.24,
    flare: 0.14,
  },
  {
    at: 0.16,
    label: "LIFT",
    bg: [0.0012, 0.0018, 0.0034],
    fog: [0.0055, 0.0074, 0.0135],
    primary: [0.30, 0.78, 1.00],
    accent: [0.76, 0.34, 1.00],
    hot: [1.00, 0.68, 0.18],
    shellScale: 0.88,
    helixScale: 0.84,
    haloScale: 0.90,
    verticalDrift: 0.36,
    waveAmp: 0.48,
    turbulence: 0.34,
    cameraRadius: 118,
    spin: 0.26,
    collapse: 0.14,
    shear: 0.24,
    ribbon: 0.42,
    debrisGain: 0.24,
    cameraLift: 0.32,
    flare: 0.22,
  },
  {
    at: 0.34,
    label: "TORSION",
    bg: [0.0016, 0.0012, 0.0040],
    fog: [0.0064, 0.0052, 0.0150],
    primary: [0.46, 0.64, 1.00],
    accent: [0.90, 0.30, 0.84],
    hot: [0.98, 0.40, 0.26],
    shellScale: 0.98,
    helixScale: 1.04,
    haloScale: 0.98,
    verticalDrift: 0.54,
    waveAmp: 0.72,
    turbulence: 0.54,
    cameraRadius: 110,
    spin: -0.12,
    collapse: 0.24,
    shear: 0.56,
    ribbon: 0.72,
    debrisGain: 0.36,
    cameraLift: 0.42,
    flare: 0.30,
  },
  {
    at: 0.52,
    label: "FRACTURE",
    bg: [0.0024, 0.0010, 0.0012],
    fog: [0.0090, 0.0036, 0.0042],
    primary: [1.00, 0.52, 0.36],
    accent: [0.84, 0.18, 0.46],
    hot: [1.00, 0.82, 0.20],
    shellScale: 1.10,
    helixScale: 1.18,
    haloScale: 1.06,
    verticalDrift: 0.72,
    waveAmp: 0.96,
    turbulence: 0.72,
    cameraRadius: 102,
    spin: -0.34,
    collapse: 0.58,
    shear: 0.86,
    ribbon: 0.88,
    debrisGain: 0.82,
    cameraLift: 0.48,
    flare: 0.48,
  },
  {
    at: 0.72,
    label: "VEIL",
    bg: [0.0010, 0.0016, 0.0044],
    fog: [0.0052, 0.0074, 0.0160],
    primary: [0.24, 0.82, 0.88],
    accent: [0.42, 0.46, 1.00],
    hot: [1.00, 0.76, 0.26],
    shellScale: 0.82,
    helixScale: 0.72,
    haloScale: 1.08,
    verticalDrift: 0.22,
    waveAmp: 0.30,
    turbulence: 0.26,
    cameraRadius: 122,
    spin: 0.12,
    collapse: 0.18,
    shear: 0.32,
    ribbon: 0.34,
    debrisGain: 0.68,
    cameraLift: 0.38,
    flare: 0.26,
  },
  {
    at: 0.88,
    label: "IGNITE",
    bg: [0.0022, 0.0015, 0.0008],
    fog: [0.0078, 0.0054, 0.0032],
    primary: [1.00, 0.70, 0.22],
    accent: [0.18, 0.86, 0.98],
    hot: [0.92, 0.26, 0.72],
    shellScale: 1.06,
    helixScale: 1.10,
    haloScale: 1.10,
    verticalDrift: 0.72,
    waveAmp: 0.92,
    turbulence: 0.64,
    cameraRadius: 100,
    spin: -0.24,
    collapse: 0.44,
    shear: 0.70,
    ribbon: 0.84,
    debrisGain: 0.74,
    cameraLift: 0.54,
    flare: 0.58,
  },
  {
    at: 1,
    label: "SOLAR",
    bg: [0.0024, 0.0016, 0.0008],
    fog: [0.0082, 0.0058, 0.0034],
    primary: [1.00, 0.78, 0.22],
    accent: [0.22, 0.92, 1.00],
    hot: [0.94, 0.32, 0.84],
    shellScale: 1.10,
    helixScale: 1.16,
    haloScale: 1.08,
    verticalDrift: 0.82,
    waveAmp: 1.04,
    turbulence: 0.72,
    cameraRadius: 98,
    spin: -0.42,
    collapse: 0.62,
    shear: 0.92,
    ribbon: 1.02,
    debrisGain: 1.00,
    cameraLift: 0.62,
    flare: 0.80,
  },
];

const app = document.getElementById("app");
const startOverlay = document.getElementById("start-overlay");
const startButton = document.getElementById("start-btn");
const phaseEl = document.getElementById("phase");
const statusEl = document.getElementById("status");
const bandsEl = document.getElementById("bands");

const bandRows = {};
for (const def of BAND_DEFS) {
  const row = document.createElement("div");
  row.className = "band-row";
  row.innerHTML = `
    <span class="band-name">${def.key}</span>
    <span class="band-track"><span class="band-fill"></span></span>
    <span class="band-value">0</span>
  `;
  bandsEl.appendChild(row);
  bandRows[def.key] = {
    fill: row.querySelector(".band-fill"),
    value: row.querySelector(".band-value"),
  };
}

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1018, 0.0105);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 0, 118);

const swarm = new THREE.Group();
scene.add(swarm);

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);
const sizes = new Float32Array(PARTICLE_COUNT);
const alphas = new Float32Array(PARTICLE_COUNT);

const positionAttr = new THREE.BufferAttribute(positions, 3);
const colorAttr = new THREE.BufferAttribute(colors, 3);
const sizeAttr = new THREE.BufferAttribute(sizes, 1);
const alphaAttr = new THREE.BufferAttribute(alphas, 1);

positionAttr.setUsage(THREE.DynamicDrawUsage);
colorAttr.setUsage(THREE.DynamicDrawUsage);
sizeAttr.setUsage(THREE.DynamicDrawUsage);
alphaAttr.setUsage(THREE.DynamicDrawUsage);

geometry.setAttribute("position", positionAttr);
geometry.setAttribute("color", colorAttr);
geometry.setAttribute("aSize", sizeAttr);
geometry.setAttribute("aAlpha", alphaAttr);

const material = createParticleMaterial({
  blending: THREE.NormalBlending,
  alphaScale: 0.72,
  edge: 0.17,
});

const points = new THREE.Points(geometry, material);
points.frustumCulled = false;
swarm.add(points);

const debrisGeometry = new THREE.BufferGeometry();
const debrisPositions = new Float32Array(DEBRIS_COUNT * 3);
const debrisColors = new Float32Array(DEBRIS_COUNT * 3);
const debrisSizes = new Float32Array(DEBRIS_COUNT);
const debrisAlphas = new Float32Array(DEBRIS_COUNT);

const debrisPositionAttr = new THREE.BufferAttribute(debrisPositions, 3);
const debrisColorAttr = new THREE.BufferAttribute(debrisColors, 3);
const debrisSizeAttr = new THREE.BufferAttribute(debrisSizes, 1);
const debrisAlphaAttr = new THREE.BufferAttribute(debrisAlphas, 1);

debrisPositionAttr.setUsage(THREE.DynamicDrawUsage);
debrisColorAttr.setUsage(THREE.DynamicDrawUsage);
debrisSizeAttr.setUsage(THREE.DynamicDrawUsage);
debrisAlphaAttr.setUsage(THREE.DynamicDrawUsage);

debrisGeometry.setAttribute("position", debrisPositionAttr);
debrisGeometry.setAttribute("color", debrisColorAttr);
debrisGeometry.setAttribute("aSize", debrisSizeAttr);
debrisGeometry.setAttribute("aAlpha", debrisAlphaAttr);

const debrisMaterial = createParticleMaterial({
  blending: THREE.AdditiveBlending,
  alphaScale: 0.44,
  edge: 0.22,
});
const debrisPoints = new THREE.Points(debrisGeometry, debrisMaterial);
debrisPoints.frustumCulled = false;
swarm.add(debrisPoints);

const kind = new Uint8Array(PARTICLE_COUNT);
const baseAngle = new Float32Array(PARTICLE_COUNT);
const basePhi = new Float32Array(PARTICLE_COUNT);
const baseRadius = new Float32Array(PARTICLE_COUNT);
const baseHeight = new Float32Array(PARTICLE_COUNT);
const baseSize = new Float32Array(PARTICLE_COUNT);
const speed = new Float32Array(PARTICLE_COUNT);
const seedA = new Float32Array(PARTICLE_COUNT);
const seedB = new Float32Array(PARTICLE_COUNT);
const baseMix = new Float32Array(PARTICLE_COUNT);

const debrisKind = new Uint8Array(DEBRIS_COUNT);
const debrisAngle = new Float32Array(DEBRIS_COUNT);
const debrisRadius = new Float32Array(DEBRIS_COUNT);
const debrisHeight = new Float32Array(DEBRIS_COUNT);
const debrisBaseSize = new Float32Array(DEBRIS_COUNT);
const debrisSpeed = new Float32Array(DEBRIS_COUNT);
const debrisSeedA = new Float32Array(DEBRIS_COUNT);
const debrisSeedB = new Float32Array(DEBRIS_COUNT);
const debrisMix = new Float32Array(DEBRIS_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i += 1) {
  const n = i / Math.max(1, PARTICLE_COUNT - 1);
  const layer = i % 3;
  const jitterA = Math.random() * Math.PI * 2;
  const jitterB = Math.random() * Math.PI * 2;
  const radialJitter = 0.8 + Math.random() * 0.4;

  kind[i] = layer;
  baseAngle[i] = i * GOLDEN_ANGLE + jitterA;
  basePhi[i] = Math.acos(1 - 2 * n);
  baseHeight[i] = (n - 0.5) * 90;
  seedA[i] = jitterA;
  seedB[i] = jitterB;
  baseMix[i] = Math.random();
  speed[i] = 0.8 + Math.random() * 1.2;

  if (layer === 0) {
    baseRadius[i] = (12 + Math.random() * 18) * radialJitter;
    baseSize[i] = 1.4 + Math.random() * 1.2;
  } else if (layer === 1) {
    baseRadius[i] = (26 + Math.random() * 18) * radialJitter;
    baseSize[i] = 1.0 + Math.random() * 0.95;
  } else {
    baseRadius[i] = (48 + Math.random() * 26) * radialJitter;
    baseSize[i] = 0.7 + Math.random() * 0.75;
  }
}

for (let i = 0; i < DEBRIS_COUNT; i += 1) {
  const n = i / Math.max(1, DEBRIS_COUNT - 1);
  const layer = i % 3;

  debrisKind[i] = layer;
  debrisAngle[i] = i * GOLDEN_ANGLE * 1.7 + Math.random() * Math.PI * 2;
  debrisHeight[i] = (n - 0.5) * 150;
  debrisSpeed[i] = 0.55 + Math.random() * 1.6;
  debrisSeedA[i] = Math.random() * Math.PI * 2;
  debrisSeedB[i] = Math.random() * Math.PI * 2;
  debrisMix[i] = Math.random();

  if (layer === 0) {
    debrisRadius[i] = 54 + Math.random() * 30;
    debrisBaseSize[i] = 0.45 + Math.random() * 0.5;
  } else if (layer === 1) {
    debrisRadius[i] = 76 + Math.random() * 38;
    debrisBaseSize[i] = 0.34 + Math.random() * 0.34;
  } else {
    debrisRadius[i] = 34 + Math.random() * 24;
    debrisBaseSize[i] = 0.45 + Math.random() * 0.55;
  }
}

const bgColor = new THREE.Color();
const fogColor = new THREE.Color();

const audioState = {
  context: null,
  element: null,
  analyser: null,
  source: null,
  freqData: null,
  waveform: null,
  binHz: 0,
  started: false,
  lastKick: -10,
  lastSnare: -10,
  lastHat: -10,
};

const bandState = {
  sub: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  presence: 0,
  air: 0,
  kickPulse: 0,
  snarePulse: 0,
  hatPulse: 0,
};

let pointerX = 0;
let pointerY = 0;
let hudFrame = 0;

window.addEventListener("pointermove", (event) => {
  pointerX = event.clientX / window.innerWidth - 0.5;
  pointerY = event.clientY / window.innerHeight - 0.5;
});

window.addEventListener("resize", onResize);
startButton.addEventListener("click", startAudio);

const clock = new THREE.Clock();
renderFrame();

async function startAudio() {
  if (!audioState.context) {
    initAudio();
  }

  await audioState.context.resume();

  if (!audioState.element.paused) {
    audioState.element.pause();
    statusEl.textContent = "Paused.";
    return;
  }

  await audioState.element.play();
  audioState.started = true;
  startOverlay.classList.add("hidden");
  statusEl.textContent = "Field active.";
}

function initAudio() {
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextImpl();
  const element = new Audio("../Metallic_Drive_II.wav");
  element.loop = true;
  element.preload = "auto";

  const source = context.createMediaElementSource(element);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.74;

  source.connect(analyser);
  analyser.connect(context.destination);

  audioState.context = context;
  audioState.element = element;
  audioState.source = source;
  audioState.analyser = analyser;
  audioState.freqData = new Uint8Array(analyser.frequencyBinCount);
  audioState.waveform = new Uint8Array(analyser.fftSize);
  audioState.binHz = context.sampleRate / analyser.fftSize;
}

function renderFrame() {
  requestAnimationFrame(renderFrame);

  const elapsed = clock.getElapsedTime();
  const progress = audioState.element && audioState.element.duration
    ? audioState.element.currentTime / audioState.element.duration
    : 0;
  const phase = samplePhase(progress);

  updateAudioState();
  updateSwarm(elapsed, phase);
  updateDebris(elapsed, phase);
  updateScene(elapsed, phase);

  if ((hudFrame += 1) % 3 === 0) {
    updateHud(progress, phase);
  }

  renderer.render(scene, camera);
}

function updateAudioState() {
  bandState.kickPulse *= 0.88;
  bandState.snarePulse *= 0.84;
  bandState.hatPulse *= 0.8;

  if (!audioState.analyser || !audioState.element || audioState.element.paused) {
    for (const def of BAND_DEFS) {
      bandState[def.key] *= 0.94;
    }
    return;
  }

  audioState.analyser.getByteFrequencyData(audioState.freqData);
  audioState.analyser.getByteTimeDomainData(audioState.waveform);

  for (const def of BAND_DEFS) {
    const value = averageBand(def.min, def.max);
    bandState[def.key] = THREE.MathUtils.lerp(bandState[def.key], value, def.smooth);
  }

  const now = audioState.context.currentTime;
  const kickRise = bandState.bass - bandState.sub * 0.15;
  const snareRise = bandState.highMid + bandState.lowMid * 0.3;
  const hatRise = bandState.air + bandState.presence * 0.35;

  if (
    now - audioState.lastKick > 0.14 &&
    bandState.bass > 0.34 &&
    kickRise > 0.22
  ) {
    audioState.lastKick = now;
    bandState.kickPulse = 1;
  }

  if (
    now - audioState.lastSnare > 0.16 &&
    bandState.highMid > 0.2 &&
    snareRise > 0.34
  ) {
    audioState.lastSnare = now;
    bandState.snarePulse = 1;
  }

  if (
    now - audioState.lastHat > 0.08 &&
    bandState.air > 0.14 &&
    hatRise > 0.24
  ) {
    audioState.lastHat = now;
    bandState.hatPulse = 1;
  }
}

function averageBand(minHz, maxHz) {
  const start = Math.max(0, Math.floor(minHz / audioState.binHz));
  const end = Math.min(audioState.freqData.length - 1, Math.ceil(maxHz / audioState.binHz));
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    sum += audioState.freqData[i];
    count += 1;
  }
  return count > 0 ? sum / (count * 255) : 0;
}

function updateSwarm(time, phase) {
  const kick = bandState.kickPulse;
  const snare = bandState.snarePulse;
  const hat = bandState.hatPulse;
  const sub = bandState.sub;
  const bass = bandState.bass;
  const lowMid = bandState.lowMid;
  const mid = bandState.mid;
  const highMid = bandState.highMid;
  const presence = bandState.presence;
  const air = bandState.air;

  const lowDrive = sub * 0.72 + bass * 0.96 + kick * 0.55;
  const midDrive = lowMid * 0.72 + mid * 0.94 + snare * 0.50;
  const highDrive = highMid * 0.74 + presence * 0.86 + air * 0.94 + hat * 0.42;

  const shellScale = phase.shellScale * (1 + lowDrive * 0.16);
  const helixScale = phase.helixScale * (1 + bass * 0.22 + midDrive * 0.06);
  const haloScale = phase.haloScale * (1 + highDrive * 0.12);
  const collapse = phase.collapse * (0.24 + bass * 0.22 + kick * 0.32);
  const shear = phase.shear * (0.18 + midDrive * 0.4);
  const ribbonAmp = phase.waveAmp * (3.5 + midDrive * 7 + highDrive * 4);
  const flare = phase.flare * (0.18 + highDrive * 0.22 + snare * 0.14);

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const j = i * 3;
    const layer = kind[i];
    const angle = baseAngle[i];
    const phi = basePhi[i];
    const randA = seedA[i];
    const randB = seedB[i];
    const speedMul = speed[i];
    const mix = baseMix[i];

    let x;
    let y;
    let z;
    let drive;
    let radius;

    if (layer === 0) {
      const side = mix < 0.5 ? -1 : 1;
      const lane = side * (18 + shellScale * 16 + lowDrive * 18);
      const ribbon = Math.sin(baseHeight[i] * 0.085 + time * (0.9 + phase.ribbon * 0.8) + randB) * ribbonAmp;
      const sway = Math.sin(angle * 1.8 + time * 1.1 + randA) * (3 + midDrive * 6);
      x = lane + sway + ribbon * 0.12;
      y = baseHeight[i] * (0.78 + phase.verticalDrift * 0.22);
      y += Math.sin(time * 0.8 + randA + baseHeight[i] * 0.03) * (2 + midDrive * 8);
      z = Math.sin(baseHeight[i] * 0.05 + time * 1.1 + randB) * (12 + phase.waveAmp * 16 + midDrive * 12);
      z += Math.cos(angle * 2.0 + time * 0.7) * (3 + bass * 8);
      y += ribbon * 0.42;
      x += y * shear * 0.06;
      drive = lowDrive;
    } else if (layer === 1) {
      const orbit = angle * 0.74 + time * (0.22 + speedMul * 0.16) * (phase.spin >= 0 ? 1 : -1);
      const beltRadius = 18 + helixScale * 18 + baseRadius[i] * 0.18;
      const beltDepth = 14 + phase.waveAmp * 18 + lowDrive * 8;
      const ribbon = Math.sin(baseHeight[i] * 0.06 + time * 1.4 + randB) * ribbonAmp * (0.24 + mix * 0.36);
      radius = beltRadius * (1 - collapse * 0.08);
      x = Math.cos(orbit) * radius * (0.82 + mix * 0.24);
      z = Math.sin(orbit) * beltDepth + Math.cos(angle * 2.8 + time * 0.85 + randA) * (4 + bass * 6);
      y = Math.sin(angle * 2.2 + time * 0.7 + randB) * (10 + midDrive * 14 + phase.shear * 8);
      y += Math.sin(orbit * 2.0 + time * 0.45 + randA) * (4 + snare * 10);
      y += ribbon;
      x += y * shear * 0.12;
      drive = bass * 0.4 + midDrive * 0.6;
    } else {
      const orbit = angle + time * (0.08 + speedMul * 0.08) + phase.spin * 0.08;
      const edgeRadius = 46 + haloScale * 18 + highDrive * 8;
      const crownHeight = 20 + phase.cameraLift * 18 + highDrive * 12;
      x = Math.cos(orbit) * edgeRadius;
      y = Math.sin(angle * 2.4 + randA) * crownHeight * 0.56;
      z = Math.sin(orbit) * (28 + phase.waveAmp * 10 + phase.debrisGain * 8);
      x += Math.sin(time * 1.7 + randA * 4.0 + orbit) * (1.5 + hat * 4 + air * 4);
      y += Math.cos(time * 1.4 + randB * 3.2 + orbit) * (1.5 + hat * 4 + air * 3);
      z += Math.sin(time * 1.9 + randA * 2.6 - orbit) * (2 + presence * 5);
      drive = highDrive;
    }

    const turbulence = phase.turbulence * (0.22 + midDrive * 0.2 + highDrive * 0.16);
    x += Math.sin(time * 0.4 + randA * 9.0 + y * 0.02) * turbulence * (layer === 0 ? 6 : 3);
    y += Math.sin(time * 0.5 + randA * 5.0 + z * 0.02) * turbulence * (layer === 1 ? 3.5 : 2);
    z += Math.cos(time * 0.42 + randB * 8.0 + x * 0.02) * turbulence * (layer === 2 ? 5 : 3);

    positions[j] = x;
    positions[j + 1] = y;
    positions[j + 2] = z;

    const energy = THREE.MathUtils.clamp(drive * 0.78 + kick * 0.22 + snare * 0.18 + hat * 0.12 + flare * 0.1, 0, 1);
    const role = LAYER_ROLE_COLORS[layer];
    const tint = THREE.MathUtils.clamp(energy * 0.52 + mix * 0.12 + flare * 0.08, 0, 1);
    const phaseBias = layer === 0 ? phase.primary : layer === 1 ? phase.hot : phase.accent;

    colors[j] = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(role.base[0], role.peak[0], tint),
      phaseBias[0],
      0.16
    );
    colors[j + 1] = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(role.base[1], role.peak[1], tint),
      phaseBias[1],
      0.16
    );
    colors[j + 2] = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(role.base[2], role.peak[2], tint),
      phaseBias[2],
      0.16
    );

    sizes[i] =
      baseSize[i] *
      (1 + energy * 0.9 + flare * 0.18 + (layer === 0 ? kick * 0.36 : 0) + (layer === 1 ? snare * 0.3 : 0) + (layer === 2 ? hat * 0.38 : 0));
    alphas[i] = THREE.MathUtils.clamp(0.08 + energy * 0.24 + (layer === 1 ? snare * 0.08 : 0) + (layer === 2 ? hat * 0.08 : 0), 0, 0.46);
  }

  positionAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
}

function updateDebris(time, phase) {
  const kick = bandState.kickPulse;
  const snare = bandState.snarePulse;
  const hat = bandState.hatPulse;
  const sub = bandState.sub;
  const bass = bandState.bass;
  const lowMid = bandState.lowMid;
  const mid = bandState.mid;
  const highMid = bandState.highMid;
  const presence = bandState.presence;
  const air = bandState.air;

  const lowDrive = sub * 0.55 + bass * 0.9 + kick * 0.45;
  const midDrive = lowMid * 0.7 + mid * 0.95 + snare * 0.52;
  const highDrive = highMid * 0.78 + presence * 0.9 + air * 1.0 + hat * 0.5;
  const spread = 1 + phase.debrisGain * 0.16 + highDrive * 0.22 + kick * 0.12;
  const jet = 8 + kick * 14 + snare * 8 + phase.flare * 6;
  const veil = phase.debrisGain * (0.18 + highDrive * 0.2 + hat * 0.16);

  for (let i = 0; i < DEBRIS_COUNT; i += 1) {
    const j = i * 3;
    const layer = debrisKind[i];
    const angle = debrisAngle[i];
    const randA = debrisSeedA[i];
    const randB = debrisSeedB[i];
    const mix = debrisMix[i];
    const speedMul = debrisSpeed[i];

    let x;
    let y;
    let z;
    let drive;

    if (layer === 0) {
      const side = mix < 0.5 ? -1 : 1;
      x = side * (56 + spread * 18 + Math.sin(time * 1.2 + randA + angle) * (3 + hat * 4));
      y = debrisHeight[i] * 0.22 + Math.sin(time * 0.9 + randB + angle * 0.6) * (5 + highDrive * 10);
      z = Math.sin(angle * 1.2 + time * 1.1) * (16 + phase.ribbon * 12 + air * 8);
      drive = highDrive;
    } else if (layer === 1) {
      x = Math.sin(angle * 2.8 + time * (0.5 + speedMul * 0.18) + randA) * (18 + midDrive * 16 + phase.shear * 8);
      y = (mix < 0.5 ? -1 : 1) * (18 + phase.cameraLift * 16 + Math.cos(time * 0.7 + randB) * 3);
      z = Math.sin(angle + time * 0.4 + randA) * (22 + spread * 14) + jet * (mix - 0.5);
      drive = midDrive + hat * 0.3;
    } else {
      const orbit = angle * 1.4 + time * (0.34 + speedMul * 0.16) * (phase.spin >= 0 ? 1 : -1);
      const burst = 28 + phase.flare * 10 + jet * (0.12 + mix * 0.2);
      x = Math.cos(orbit) * burst;
      y = Math.sin(orbit * 1.6 + randB) * (8 + phase.ribbon * 8);
      z = Math.sin(orbit) * burst + Math.cos(time * 1.1 + randA) * (2 + air * 5);
      drive = lowDrive * 0.35 + highDrive * 0.65;
    }

    x += Math.sin(time * 0.7 + randA * 2.0 + z * 0.03) * veil * 8;
    y += Math.cos(time * 0.6 + randB * 1.8 + x * 0.025) * veil * 6;
    z += Math.sin(time * 0.5 + randA * 1.4) * veil * 7;

    debrisPositions[j] = x;
    debrisPositions[j + 1] = y;
    debrisPositions[j + 2] = z;

    const energy = THREE.MathUtils.clamp(drive * 0.8 + kick * 0.1 + snare * 0.1 + hat * 0.12, 0, 1);
    const role = LAYER_ROLE_COLORS[(layer + 1) % 3];
    const phaseBias = layer === 0 ? phase.hot : layer === 1 ? phase.accent : phase.primary;
    const tint = THREE.MathUtils.clamp(energy * 0.56 + mix * 0.12 + phase.flare * 0.08, 0, 1);

    debrisColors[j] = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(role.base[0], role.peak[0], tint),
      phaseBias[0],
      0.12
    );
    debrisColors[j + 1] = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(role.base[1], role.peak[1], tint),
      phaseBias[1],
      0.12
    );
    debrisColors[j + 2] = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(role.base[2], role.peak[2], tint),
      phaseBias[2],
      0.12
    );

    debrisSizes[i] =
      debrisBaseSize[i] *
      (1 + energy * 0.7 + hat * 0.36 + phase.debrisGain * 0.18 + (layer === 2 ? kick * 0.32 : snare * 0.2));
    debrisAlphas[i] = THREE.MathUtils.clamp(0.04 + energy * 0.18 + phase.debrisGain * 0.05 + (layer === 2 ? kick * 0.06 : hat * 0.05), 0, 0.28);
  }

  debrisPositionAttr.needsUpdate = true;
  debrisColorAttr.needsUpdate = true;
  debrisSizeAttr.needsUpdate = true;
  debrisAlphaAttr.needsUpdate = true;
}

function updateScene(time, phase) {
  bgColor.setRGB(
    phase.bg[0] + bandState.bass * 0.006,
    phase.bg[1] + bandState.mid * 0.004,
    phase.bg[2] + bandState.air * 0.005
  );
  fogColor.setRGB(
    phase.fog[0] + bandState.lowMid * 0.006,
    phase.fog[1] + bandState.highMid * 0.005,
    phase.fog[2] + bandState.air * 0.004
  );

  scene.background = bgColor;
  scene.fog.color.copy(fogColor);
  scene.fog.density = 0.0046 + bandState.air * 0.0005 + bandState.kickPulse * 0.0005;

  swarm.position.y = Math.sin(time * 0.18) * 2.4 + bandState.sub * 1.6 - bandState.snarePulse * 0.8;
  swarm.rotation.y = time * (0.08 + Math.abs(phase.spin) * 0.08) + bandState.mid * 0.18;
  swarm.rotation.x = Math.sin(time * 0.14) * 0.08 + bandState.highMid * 0.06 + pointerY * 0.14;
  swarm.rotation.z = Math.sin(time * 0.11) * 0.04 + pointerX * 0.08;
  points.rotation.y = time * 0.015 + bandState.lowMid * 0.08;
  points.rotation.x = bandState.mid * 0.03;
  debrisPoints.rotation.y = -time * (0.08 + phase.debrisGain * 0.04) - bandState.presence * 0.16;
  debrisPoints.rotation.x = time * 0.03 + bandState.air * 0.08;
  debrisPoints.scale.setScalar(1 + bandState.kickPulse * 0.015 + phase.flare * 0.008);

  const camRadius = phase.cameraRadius + 10 - bandState.sub * 5 - bandState.kickPulse * 2;
  const camAngle = time * (0.04 + Math.abs(phase.spin) * 0.03) + pointerX * 0.55;
  const camLift = 5 + phase.cameraLift * 12 + bandState.presence * 4 + bandState.snarePulse * 3;
  camera.position.x = Math.cos(camAngle) * camRadius;
  camera.position.z = Math.sin(camAngle) * camRadius;
  camera.position.y = Math.sin(time * 0.1 + pointerY * 0.8) * camLift + bandState.kickPulse * 1.5;
  camera.lookAt(0, swarm.position.y * 0.3, 0);
}

function updateHud(progress, phase) {
  phaseEl.textContent = `Phase ${phase.label}`;

  if (audioState.element && !audioState.element.paused) {
    statusEl.textContent = `${formatTime(audioState.element.currentTime)} / ${formatTime(audioState.element.duration)} | Kick ${formatPercent(bandState.kickPulse)} | Snare ${formatPercent(bandState.snarePulse)} | Hat ${formatPercent(bandState.hatPulse)}`;
  } else {
    statusEl.textContent = "Click start to initialize the field.";
  }

  for (const def of BAND_DEFS) {
    const value = bandState[def.key];
    const row = bandRows[def.key];
    row.fill.style.width = `${Math.round(value * 100)}%`;
    row.value.textContent = String(Math.round(value * 99)).padStart(2, "0");
  }
}

function samplePhase(progress) {
  if (progress <= PHASE_KEYS[0].at) {
    return PHASE_KEYS[0];
  }

  for (let i = 0; i < PHASE_KEYS.length - 1; i += 1) {
    const current = PHASE_KEYS[i];
    const next = PHASE_KEYS[i + 1];
    if (progress <= next.at) {
      const t = THREE.MathUtils.mapLinear(progress, current.at, next.at, 0, 1);
      return mixPhase(current, next, t);
    }
  }

  return PHASE_KEYS[PHASE_KEYS.length - 1];
}

function mixPhase(a, b, t) {
  return {
    label: t < 0.5 ? a.label : b.label,
    bg: mixArray(a.bg, b.bg, t),
    fog: mixArray(a.fog, b.fog, t),
    primary: mixArray(a.primary, b.primary, t),
    accent: mixArray(a.accent, b.accent, t),
    hot: mixArray(a.hot, b.hot, t),
    shellScale: THREE.MathUtils.lerp(a.shellScale, b.shellScale, t),
    helixScale: THREE.MathUtils.lerp(a.helixScale, b.helixScale, t),
    haloScale: THREE.MathUtils.lerp(a.haloScale, b.haloScale, t),
    verticalDrift: THREE.MathUtils.lerp(a.verticalDrift, b.verticalDrift, t),
    waveAmp: THREE.MathUtils.lerp(a.waveAmp, b.waveAmp, t),
    turbulence: THREE.MathUtils.lerp(a.turbulence, b.turbulence, t),
    cameraRadius: THREE.MathUtils.lerp(a.cameraRadius, b.cameraRadius, t),
    spin: THREE.MathUtils.lerp(a.spin, b.spin, t),
    collapse: THREE.MathUtils.lerp(a.collapse, b.collapse, t),
    shear: THREE.MathUtils.lerp(a.shear, b.shear, t),
    ribbon: THREE.MathUtils.lerp(a.ribbon, b.ribbon, t),
    debrisGain: THREE.MathUtils.lerp(a.debrisGain, b.debrisGain, t),
    cameraLift: THREE.MathUtils.lerp(a.cameraLift, b.cameraLift, t),
    flare: THREE.MathUtils.lerp(a.flare, b.flare, t),
  };
}

function mixArray(a, b, t) {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ];
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatPercent(value) {
  return String(Math.round(value * 99)).padStart(2, "0");
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
}

function createParticleMaterial(options = {}) {
  const blending = options.blending ?? THREE.AdditiveBlending;
  const alphaScale = options.alphaScale ?? 1;
  const edge = options.edge ?? 0.22;

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    vertexColors: true,
    uniforms: {
      uAlphaScale: { value: alphaScale },
      uEdge: { value: edge },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = color;
        vAlpha = aAlpha;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (220.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uAlphaScale;
      uniform float uEdge;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = dot(uv, uv);
        float alpha = smoothstep(uEdge, 0.0, d) * vAlpha * uAlphaScale;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });
}
