import * as THREE from "three";

const STAR_COUNT = 3600;
const DUST_COUNT = 520;
const STREAK_COUNT = 260;
const GATE_COUNT = 12;
const GATE_SEGMENTS = 12;
const FIELD_DEPTH = 760;
const FRONT_Z = 18;
const BACK_Z = -FIELD_DEPTH;
const TAU = Math.PI * 2;

const BAND_DEFS = [
  { key: "sub", min: 20, max: 60, smooth: 0.28 },
  { key: "bass", min: 60, max: 140, smooth: 0.26 },
  { key: "lowMid", min: 140, max: 400, smooth: 0.24 },
  { key: "mid", min: 400, max: 1400, smooth: 0.22 },
  { key: "highMid", min: 1400, max: 3200, smooth: 0.22 },
  { key: "presence", min: 3200, max: 6000, smooth: 0.2 },
  { key: "air", min: 6000, max: 12000, smooth: 0.18 },
];

const PHASE_KEYS = [
  {
    at: 0,
    label: "LAUNCH",
    bg: [0.0008, 0.0012, 0.0030],
    fog: [0.0040, 0.0060, 0.0120],
    primary: [0.70, 0.90, 1.00],
    accent: [0.52, 0.76, 1.00],
    hot: [1.00, 0.72, 0.36],
    speed: 18,
    tunnelRadius: 44,
    twist: 0.16,
    gateRadius: 24,
    gateScale: 0.08,
    wobble: 0.08,
    spark: 0.10,
    cameraLift: 0.18,
  },
  {
    at: 0.18,
    label: "CRUISE",
    bg: [0.0010, 0.0016, 0.0038],
    fog: [0.0042, 0.0068, 0.0136],
    primary: [0.82, 0.94, 1.00],
    accent: [0.40, 0.82, 1.00],
    hot: [1.00, 0.74, 0.30],
    speed: 24,
    tunnelRadius: 48,
    twist: 0.24,
    gateRadius: 28,
    gateScale: 0.12,
    wobble: 0.12,
    spark: 0.14,
    cameraLift: 0.24,
  },
  {
    at: 0.42,
    label: "PULSE",
    bg: [0.0012, 0.0014, 0.0046],
    fog: [0.0054, 0.0058, 0.0160],
    primary: [0.92, 0.92, 1.00],
    accent: [0.52, 0.62, 1.00],
    hot: [1.00, 0.58, 0.24],
    speed: 30,
    tunnelRadius: 52,
    twist: 0.38,
    gateRadius: 32,
    gateScale: 0.16,
    wobble: 0.16,
    spark: 0.18,
    cameraLift: 0.30,
  },
  {
    at: 0.62,
    label: "WARP",
    bg: [0.0014, 0.0010, 0.0026],
    fog: [0.0064, 0.0040, 0.0108],
    primary: [1.00, 0.94, 0.82],
    accent: [0.34, 0.94, 1.00],
    hot: [1.00, 0.52, 0.28],
    speed: 40,
    tunnelRadius: 58,
    twist: 0.52,
    gateRadius: 36,
    gateScale: 0.22,
    wobble: 0.22,
    spark: 0.26,
    cameraLift: 0.34,
  },
  {
    at: 0.82,
    label: "NEBULA",
    bg: [0.0010, 0.0008, 0.0038],
    fog: [0.0054, 0.0036, 0.0140],
    primary: [0.86, 0.80, 1.00],
    accent: [0.98, 0.50, 0.96],
    hot: [1.00, 0.84, 0.34],
    speed: 28,
    tunnelRadius: 56,
    twist: 0.32,
    gateRadius: 34,
    gateScale: 0.14,
    wobble: 0.12,
    spark: 0.18,
    cameraLift: 0.40,
  },
  {
    at: 1,
    label: "ASCEND",
    bg: [0.0012, 0.0010, 0.0022],
    fog: [0.0060, 0.0048, 0.0100],
    primary: [1.00, 0.92, 0.70],
    accent: [0.40, 0.94, 1.00],
    hot: [1.00, 0.58, 0.36],
    speed: 36,
    tunnelRadius: 62,
    twist: 0.44,
    gateRadius: 40,
    gateScale: 0.18,
    wobble: 0.16,
    spark: 0.24,
    cameraLift: 0.46,
  },
];

const app = document.getElementById("app");
const startOverlay = document.getElementById("start-overlay");
const startButton = document.getElementById("start-btn");
const exportButton = document.getElementById("export-btn");
const exportOverlayButton = document.getElementById("export-btn-overlay");
const phaseEl = document.getElementById("phase");
const statusEl = document.getElementById("status");
const bandsEl = document.getElementById("bands");
const urlParams = new URLSearchParams(window.location.search);
const OFFLINE_MODE = urlParams.get("offline") === "1";

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
renderer.toneMappingExposure = 0.84;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04070d, 0.0024);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 0, 14);

const field = new THREE.Group();
scene.add(field);

const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(STAR_COUNT * 3);
const starColors = new Float32Array(STAR_COUNT * 3);
const starSizes = new Float32Array(STAR_COUNT);
const starAlphas = new Float32Array(STAR_COUNT);

const starPositionAttr = new THREE.BufferAttribute(starPositions, 3);
const starColorAttr = new THREE.BufferAttribute(starColors, 3);
const starSizeAttr = new THREE.BufferAttribute(starSizes, 1);
const starAlphaAttr = new THREE.BufferAttribute(starAlphas, 1);

starPositionAttr.setUsage(THREE.DynamicDrawUsage);
starColorAttr.setUsage(THREE.DynamicDrawUsage);
starSizeAttr.setUsage(THREE.DynamicDrawUsage);
starAlphaAttr.setUsage(THREE.DynamicDrawUsage);

starGeometry.setAttribute("position", starPositionAttr);
starGeometry.setAttribute("color", starColorAttr);
starGeometry.setAttribute("aSize", starSizeAttr);
starGeometry.setAttribute("aAlpha", starAlphaAttr);

const starPoints = new THREE.Points(
  starGeometry,
  createPointMaterial({
    blending: THREE.NormalBlending,
    alphaScale: 0.68,
    edge: 0.18,
  })
);
starPoints.frustumCulled = false;
field.add(starPoints);

const dustGeometry = new THREE.BufferGeometry();
const dustPositions = new Float32Array(DUST_COUNT * 3);
const dustColors = new Float32Array(DUST_COUNT * 3);
const dustSizes = new Float32Array(DUST_COUNT);
const dustAlphas = new Float32Array(DUST_COUNT);

const dustPositionAttr = new THREE.BufferAttribute(dustPositions, 3);
const dustColorAttr = new THREE.BufferAttribute(dustColors, 3);
const dustSizeAttr = new THREE.BufferAttribute(dustSizes, 1);
const dustAlphaAttr = new THREE.BufferAttribute(dustAlphas, 1);

dustPositionAttr.setUsage(THREE.DynamicDrawUsage);
dustColorAttr.setUsage(THREE.DynamicDrawUsage);
dustSizeAttr.setUsage(THREE.DynamicDrawUsage);
dustAlphaAttr.setUsage(THREE.DynamicDrawUsage);

dustGeometry.setAttribute("position", dustPositionAttr);
dustGeometry.setAttribute("color", dustColorAttr);
dustGeometry.setAttribute("aSize", dustSizeAttr);
dustGeometry.setAttribute("aAlpha", dustAlphaAttr);

const dustPoints = new THREE.Points(
  dustGeometry,
  createPointMaterial({
    blending: THREE.AdditiveBlending,
    alphaScale: 0.26,
    edge: 0.24,
  })
);
dustPoints.frustumCulled = false;
field.add(dustPoints);

const streakGeometry = new THREE.BufferGeometry();
const streakPositions = new Float32Array(STREAK_COUNT * 2 * 3);
const streakColors = new Float32Array(STREAK_COUNT * 2 * 3);
const streakPositionAttr = new THREE.BufferAttribute(streakPositions, 3);
const streakColorAttr = new THREE.BufferAttribute(streakColors, 3);
streakPositionAttr.setUsage(THREE.DynamicDrawUsage);
streakColorAttr.setUsage(THREE.DynamicDrawUsage);
streakGeometry.setAttribute("position", streakPositionAttr);
streakGeometry.setAttribute("color", streakColorAttr);

const streakLines = new THREE.LineSegments(
  streakGeometry,
  new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0.42,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
streakLines.frustumCulled = false;
field.add(streakLines);

const gateGeometry = new THREE.BufferGeometry();
const gatePositions = new Float32Array(GATE_COUNT * GATE_SEGMENTS * 2 * 3);
const gateColors = new Float32Array(GATE_COUNT * GATE_SEGMENTS * 2 * 3);
const gatePositionAttr = new THREE.BufferAttribute(gatePositions, 3);
const gateColorAttr = new THREE.BufferAttribute(gateColors, 3);
gatePositionAttr.setUsage(THREE.DynamicDrawUsage);
gateColorAttr.setUsage(THREE.DynamicDrawUsage);
gateGeometry.setAttribute("position", gatePositionAttr);
gateGeometry.setAttribute("color", gateColorAttr);

const gateLines = new THREE.LineSegments(
  gateGeometry,
  new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0.32,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
gateLines.frustumCulled = false;
field.add(gateLines);

const starType = new Uint8Array(STAR_COUNT);
const starAngle = new Float32Array(STAR_COUNT);
const starRadius = new Float32Array(STAR_COUNT);
const starZ = new Float32Array(STAR_COUNT);
const starBaseSize = new Float32Array(STAR_COUNT);
const starSpeed = new Float32Array(STAR_COUNT);
const starSeed = new Float32Array(STAR_COUNT);
const starMix = new Float32Array(STAR_COUNT);

const dustAngle = new Float32Array(DUST_COUNT);
const dustRadius = new Float32Array(DUST_COUNT);
const dustZ = new Float32Array(DUST_COUNT);
const dustBaseSize = new Float32Array(DUST_COUNT);
const dustSpeed = new Float32Array(DUST_COUNT);
const dustSeedA = new Float32Array(DUST_COUNT);
const dustSeedB = new Float32Array(DUST_COUNT);
const dustMix = new Float32Array(DUST_COUNT);

const streakAngle = new Float32Array(STREAK_COUNT);
const streakRadius = new Float32Array(STREAK_COUNT);
const streakZ = new Float32Array(STREAK_COUNT);
const streakSpeed = new Float32Array(STREAK_COUNT);
const streakSeed = new Float32Array(STREAK_COUNT);
const streakMix = new Float32Array(STREAK_COUNT);

const gateZ = new Float32Array(GATE_COUNT);
const gateSpin = new Float32Array(GATE_COUNT);
const gateSeed = new Float32Array(GATE_COUNT);
const gateMix = new Float32Array(GATE_COUNT);

for (let i = 0; i < STAR_COUNT; i += 1) {
  reseedStar(i, true);
}

for (let i = 0; i < DUST_COUNT; i += 1) {
  reseedDust(i, true);
}

for (let i = 0; i < STREAK_COUNT; i += 1) {
  reseedStreak(i, true);
}

for (let i = 0; i < GATE_COUNT; i += 1) {
  gateZ[i] = -i * (FIELD_DEPTH / GATE_COUNT) - 40;
  gateSpin[i] = Math.random() * TAU;
  gateSeed[i] = Math.random() * TAU;
  gateMix[i] = Math.random();
}

const bgColor = new THREE.Color();
const fogColor = new THREE.Color();
const tmpColorA = new THREE.Color();
const tmpColorB = new THREE.Color();
const lookTarget = new THREE.Vector3();

const audioState = {
  context: null,
  element: null,
  analyser: null,
  source: null,
  recordDestination: null,
  freqData: null,
  waveform: null,
  binHz: 0,
  lastKick: -10,
  lastSnare: -10,
  lastHat: -10,
};

const exportState = {
  recording: false,
  recorder: null,
  stream: null,
  chunks: [],
  mimeType: "",
  restoreLoop: true,
};

const offlineState = {
  ready: false,
  analysis: null,
  fps: 30,
  frameCount: 0,
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
let lastElapsed = 0;

window.addEventListener("pointermove", (event) => {
  pointerX = event.clientX / window.innerWidth - 0.5;
  pointerY = event.clientY / window.innerHeight - 0.5;
});

window.addEventListener("resize", onResize);
startButton.addEventListener("click", startAudio);
exportButton.addEventListener("click", startExport);
exportOverlayButton.addEventListener("click", startExport);

const clock = new THREE.Clock();
if (OFFLINE_MODE) {
  document.body.classList.add("offline");
  startOverlay.classList.add("hidden");
  window.__VISUAL_EXPORT = {
    ready: false,
    frameCount: 0,
    fps: 30,
    error: "",
    async renderFrame() {
      throw new Error("Offline analysis is not ready yet.");
    },
  };
  initOfflineMode().catch((error) => {
    window.__VISUAL_EXPORT = {
      ready: false,
      frameCount: 0,
      fps: 30,
      error: error instanceof Error ? error.message : String(error),
      async renderFrame() {
        throw error;
      },
    };
    console.error(error);
  });
} else {
  renderFrame();
}

async function startAudio() {
  if (!audioState.context) {
    initAudio();
  }

  await audioState.context.resume();

  if (audioState.element.ended || audioState.element.currentTime >= audioState.element.duration - 0.05) {
    audioState.element.currentTime = 0;
  }

  if (!audioState.element.paused) {
    audioState.element.pause();
    statusEl.textContent = "Paused.";
    return;
  }

  audioState.element.loop = true;
  await audioState.element.play();
  startOverlay.classList.add("hidden");
  statusEl.textContent = "In flight.";
}

function initAudio() {
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextImpl();
  const element = new Audio("../Metallic_Drive_II.wav");
  element.loop = true;
  element.preload = "auto";

  const source = context.createMediaElementSource(element);
  const analyser = context.createAnalyser();
  const recordDestination = context.createMediaStreamDestination();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.76;

  source.connect(analyser);
  analyser.connect(context.destination);
  analyser.connect(recordDestination);

  audioState.context = context;
  audioState.element = element;
  audioState.source = source;
  audioState.analyser = analyser;
  audioState.recordDestination = recordDestination;
  audioState.freqData = new Uint8Array(analyser.frequencyBinCount);
  audioState.waveform = new Uint8Array(analyser.fftSize);
  audioState.binHz = context.sampleRate / analyser.fftSize;
  audioState.element.addEventListener("ended", handleTrackEnded);
}

function renderFrame() {
  requestAnimationFrame(renderFrame);

  const elapsed = clock.getElapsedTime();
  const delta = Math.min(0.05, elapsed - lastElapsed || 0.016);
  lastElapsed = elapsed;

  const progress = audioState.element && audioState.element.duration
    ? audioState.element.currentTime / audioState.element.duration
    : 0;
  const phase = samplePhase(progress);

  updateAudioState();
  updateStars(elapsed, delta, phase);
  updateDust(elapsed, delta, phase);
  updateStreaks(elapsed, delta, phase);
  updateGates(elapsed, delta, phase);
  updateScene(elapsed, phase);

  if ((hudFrame += 1) % 3 === 0) {
    updateHud(progress, phase);
  }

  renderer.render(scene, camera);
}

async function initOfflineMode() {
  const analysisUrl = urlParams.get("analysis");
  if (!analysisUrl) {
    throw new Error("Offline mode requires an analysis query parameter.");
  }

  const response = await fetch(analysisUrl);
  if (!response.ok) {
    throw new Error(`Failed to load analysis: ${response.status}`);
  }

  offlineState.analysis = await response.json();
  offlineState.fps = offlineState.analysis.fps;
  offlineState.frameCount = offlineState.analysis.frameCount;
  offlineState.ready = true;

  window.__VISUAL_EXPORT = {
    ready: true,
    frameCount: offlineState.frameCount,
    fps: offlineState.fps,
    error: "",
    renderFrame(frameIndex) {
      renderOfflineFrame(frameIndex);
      return true;
    },
  };
}

function renderOfflineFrame(frameIndex) {
  if (!offlineState.ready || !offlineState.analysis) {
    return;
  }

  const clamped = THREE.MathUtils.clamp(frameIndex, 0, Math.max(0, offlineState.frameCount - 1));
  applyOfflineFrame(clamped);

  const elapsed = clamped / offlineState.fps;
  const delta = 1 / offlineState.fps;
  const progress = offlineState.frameCount > 1 ? clamped / (offlineState.frameCount - 1) : 0;
  const phase = samplePhase(progress);

  updateStars(elapsed, delta, phase);
  updateDust(elapsed, delta, phase);
  updateStreaks(elapsed, delta, phase);
  updateGates(elapsed, delta, phase);
  updateScene(elapsed, phase);
  renderer.render(scene, camera);
}

function applyOfflineFrame(frameIndex) {
  const frame = offlineState.analysis.frames[frameIndex];
  if (!frame) {
    return;
  }

  for (const def of BAND_DEFS) {
    bandState[def.key] = frame.bands[def.key];
  }
  bandState.kickPulse = frame.kickPulse;
  bandState.snarePulse = frame.snarePulse;
  bandState.hatPulse = frame.hatPulse;
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
  const kickRise = bandState.bass - bandState.sub * 0.14;
  const snareRise = bandState.highMid + bandState.lowMid * 0.34;
  const hatRise = bandState.air + bandState.presence * 0.36;

  if (now - audioState.lastKick > 0.14 && bandState.bass > 0.34 && kickRise > 0.22) {
    audioState.lastKick = now;
    bandState.kickPulse = 1;
  }

  if (now - audioState.lastSnare > 0.16 && bandState.highMid > 0.2 && snareRise > 0.34) {
    audioState.lastSnare = now;
    bandState.snarePulse = 1;
  }

  if (now - audioState.lastHat > 0.08 && bandState.air > 0.14 && hatRise > 0.24) {
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

function updateStars(time, delta, phase) {
  const lowDrive = bandState.sub * 0.56 + bandState.bass * 0.96 + bandState.kickPulse * 0.64;
  const midDrive = bandState.lowMid * 0.62 + bandState.mid * 0.84 + bandState.snarePulse * 0.5;
  const highDrive = bandState.highMid * 0.56 + bandState.presence * 0.84 + bandState.air * 0.92 + bandState.hatPulse * 0.48;
  const travel = delta * (phase.speed + lowDrive * 36 + highDrive * 6);

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const j = i * 3;
    const layer = starType[i];
    const radiusBase = phase.tunnelRadius * starRadius[i];
    const twist = time * phase.twist + starZ[i] * 0.005 + starSeed[i] * 0.12;

    starZ[i] += travel * (0.7 + starSpeed[i] * 0.95 + layer * 0.16);
    if (starZ[i] > FRONT_Z) {
      reseedStar(i, false);
    }

    const pulse = 1 + Math.sin(time * (0.7 + starSpeed[i] * 0.2) + starSeed[i]) * phase.wobble * 0.05;
    const wobbleX = Math.sin(time * 0.9 + starSeed[i] * 2.0 + starZ[i] * 0.012) * (0.5 + midDrive * 2);
    const wobbleY = Math.cos(time * 0.7 + starSeed[i] * 1.7 + starZ[i] * 0.014) * (0.5 + midDrive * 1.6);
    const radius = radiusBase * pulse;
    const x = Math.cos(starAngle[i] + twist) * radius + wobbleX;
    const y = Math.sin(starAngle[i] + twist) * radius + wobbleY;

    starPositions[j] = x;
    starPositions[j + 1] = y;
    starPositions[j + 2] = starZ[i];

    const depthMix = 1 - THREE.MathUtils.clamp((-starZ[i]) / FIELD_DEPTH, 0, 1);
    const colorBase = layer === 0 ? phase.primary : layer === 1 ? phase.accent : phase.hot;
    const colorPeak = layer === 0 ? phase.accent : layer === 1 ? phase.hot : phase.primary;
    const tint = THREE.MathUtils.clamp(depthMix * 0.6 + highDrive * 0.18 + lowDrive * 0.08 + starMix[i] * 0.12, 0, 1);

    starColors[j] = THREE.MathUtils.lerp(colorBase[0], colorPeak[0], tint);
    starColors[j + 1] = THREE.MathUtils.lerp(colorBase[1], colorPeak[1], tint);
    starColors[j + 2] = THREE.MathUtils.lerp(colorBase[2], colorPeak[2], tint);

    starSizes[i] = starBaseSize[i] * (1 + depthMix * 1.0 + lowDrive * 0.3 + bandState.kickPulse * 0.3);
    starAlphas[i] = THREE.MathUtils.clamp(0.10 + depthMix * 0.26 + highDrive * 0.08, 0, 0.52);
  }

  starPositionAttr.needsUpdate = true;
  starColorAttr.needsUpdate = true;
  starSizeAttr.needsUpdate = true;
  starAlphaAttr.needsUpdate = true;
}

function updateDust(time, delta, phase) {
  const lowDrive = bandState.sub * 0.4 + bandState.bass * 0.72 + bandState.kickPulse * 0.6;
  const midDrive = bandState.lowMid * 0.56 + bandState.mid * 0.74 + bandState.snarePulse * 0.5;
  const highDrive = bandState.highMid * 0.62 + bandState.presence * 0.84 + bandState.air * 0.9 + bandState.hatPulse * 0.5;
  const travel = delta * (phase.speed + lowDrive * 42 + highDrive * 10);

  for (let i = 0; i < DUST_COUNT; i += 1) {
    const j = i * 3;

    dustZ[i] += travel * (1.1 + dustSpeed[i] * 1.2);
    if (dustZ[i] > FRONT_Z) {
      reseedDust(i, false);
    }

    const twist = time * (phase.twist * 0.9) + dustSeedA[i] + dustZ[i] * 0.008;
    const radius = phase.tunnelRadius * dustRadius[i] * (0.10 + phase.spark * 0.04);
    const x = Math.cos(dustAngle[i] + twist) * radius + Math.sin(time * 1.6 + dustSeedA[i]) * (0.8 + highDrive * 2);
    const y = Math.sin(dustAngle[i] + twist) * radius + Math.cos(time * 1.4 + dustSeedB[i]) * (0.8 + midDrive * 1.6);

    dustPositions[j] = x;
    dustPositions[j + 1] = y;
    dustPositions[j + 2] = dustZ[i];

    const depthMix = 1 - THREE.MathUtils.clamp((-dustZ[i]) / FIELD_DEPTH, 0, 1);
    const tint = THREE.MathUtils.clamp(depthMix * 0.6 + highDrive * 0.2 + dustMix[i] * 0.16, 0, 1);

    dustColors[j] = THREE.MathUtils.lerp(phase.hot[0], phase.accent[0], tint);
    dustColors[j + 1] = THREE.MathUtils.lerp(phase.hot[1], phase.accent[1], tint);
    dustColors[j + 2] = THREE.MathUtils.lerp(phase.hot[2], phase.accent[2], tint);

    dustSizes[i] = dustBaseSize[i] * (1 + depthMix * 1.0 + highDrive * 0.36 + bandState.hatPulse * 0.26);
    dustAlphas[i] = THREE.MathUtils.clamp(0.04 + depthMix * 0.14 + highDrive * 0.08, 0, 0.24);
  }

  dustPositionAttr.needsUpdate = true;
  dustColorAttr.needsUpdate = true;
  dustSizeAttr.needsUpdate = true;
  dustAlphaAttr.needsUpdate = true;
}

function updateStreaks(time, delta, phase) {
  const lowDrive = bandState.sub * 0.5 + bandState.bass * 0.92 + bandState.kickPulse * 0.74;
  const midDrive = bandState.lowMid * 0.5 + bandState.mid * 0.76 + bandState.snarePulse * 0.4;
  const highDrive = bandState.highMid * 0.56 + bandState.presence * 0.82 + bandState.air * 0.92 + bandState.hatPulse * 0.48;
  const travel = delta * (phase.speed + lowDrive * 54 + highDrive * 8);
  const streakLengthBase = 2.5 + lowDrive * 14 + bandState.kickPulse * 20;

  for (let i = 0; i < STREAK_COUNT; i += 1) {
    const j = i * 6;

    streakZ[i] += travel * (1.24 + streakSpeed[i] * 1.5);
    if (streakZ[i] > FRONT_Z) {
      reseedStreak(i, false);
    }

    const radius = phase.tunnelRadius * (0.24 + streakRadius[i] * 0.9);
    const twist = time * (phase.twist * 0.7) + streakSeed[i] + streakZ[i] * 0.006;
    const x = Math.cos(streakAngle[i] + twist) * radius;
    const y = Math.sin(streakAngle[i] + twist) * radius;
    const zHead = streakZ[i];
    const zTail = zHead - (streakLengthBase * (0.4 + streakMix[i] * 0.8));

    streakPositions[j] = x;
    streakPositions[j + 1] = y;
    streakPositions[j + 2] = zHead;
    streakPositions[j + 3] = x;
    streakPositions[j + 4] = y;
    streakPositions[j + 5] = zTail;

    const tint = THREE.MathUtils.clamp(highDrive * 0.18 + lowDrive * 0.22 + streakMix[i] * 0.2, 0, 1);
    tmpColorA.setRGB(
      THREE.MathUtils.lerp(phase.primary[0], phase.accent[0], tint),
      THREE.MathUtils.lerp(phase.primary[1], phase.accent[1], tint),
      THREE.MathUtils.lerp(phase.primary[2], phase.accent[2], tint)
    );
    tmpColorB.setRGB(
      THREE.MathUtils.lerp(phase.hot[0], phase.primary[0], tint * 0.5),
      THREE.MathUtils.lerp(phase.hot[1], phase.primary[1], tint * 0.5),
      THREE.MathUtils.lerp(phase.hot[2], phase.primary[2], tint * 0.5)
    );

    streakColors[j] = tmpColorA.r;
    streakColors[j + 1] = tmpColorA.g;
    streakColors[j + 2] = tmpColorA.b;
    streakColors[j + 3] = tmpColorB.r;
    streakColors[j + 4] = tmpColorB.g;
    streakColors[j + 5] = tmpColorB.b;
  }

  streakPositionAttr.needsUpdate = true;
  streakColorAttr.needsUpdate = true;
}

function updateGates(time, delta, phase) {
  const lowDrive = bandState.sub * 0.54 + bandState.bass * 0.84 + bandState.kickPulse * 0.68;
  const midDrive = bandState.lowMid * 0.62 + bandState.mid * 0.88 + bandState.snarePulse * 0.56;
  const highDrive = bandState.highMid * 0.52 + bandState.presence * 0.74 + bandState.air * 0.78 + bandState.hatPulse * 0.42;
  const travel = delta * (phase.speed + lowDrive * 30 + highDrive * 6);
  const gateSpacing = FIELD_DEPTH / GATE_COUNT;

  for (let g = 0; g < GATE_COUNT; g += 1) {
    gateZ[g] += travel * (0.9 + gateMix[g] * 0.18);
    if (gateZ[g] > FRONT_Z + 32) {
      gateZ[g] -= FIELD_DEPTH + gateSpacing;
      gateSpin[g] = Math.random() * TAU;
      gateSeed[g] = Math.random() * TAU;
      gateMix[g] = Math.random();
    }

    const proximity = THREE.MathUtils.clamp(1 - (-gateZ[g] / FIELD_DEPTH), 0, 1);
    const gateRadius = phase.gateRadius * (1 + gateMix[g] * phase.gateScale + lowDrive * 0.18 + bandState.kickPulse * 0.12);
    const spin = gateSpin[g] + time * phase.twist * 0.4;
    const flare = phase.spark * (0.12 + highDrive * 0.22);

    for (let s = 0; s < GATE_SEGMENTS; s += 1) {
      const i = g * GATE_SEGMENTS + s;
      const j = i * 6;
      const a0 = spin + (s / GATE_SEGMENTS) * TAU;
      const a1 = spin + ((s + 1) / GATE_SEGMENTS) * TAU;
      const r0 = gateRadius * (1 + Math.sin(a0 * 3 + time * 1.4 + gateSeed[g]) * (phase.wobble * 0.1 + midDrive * 0.06));
      const r1 = gateRadius * (1 + Math.sin(a1 * 3 + time * 1.4 + gateSeed[g]) * (phase.wobble * 0.1 + midDrive * 0.06));
      const x0 = Math.cos(a0) * r0 * (1 + Math.sin(time * 0.5 + gateSeed[g]) * 0.02);
      const y0 = Math.sin(a0) * r0 * (0.78 + phase.cameraLift * 0.1) + Math.sin(a0 * 2 + time + gateSeed[g]) * phase.wobble * 2;
      const x1 = Math.cos(a1) * r1 * (1 + Math.sin(time * 0.5 + gateSeed[g]) * 0.02);
      const y1 = Math.sin(a1) * r1 * (0.78 + phase.cameraLift * 0.1) + Math.sin(a1 * 2 + time + gateSeed[g]) * phase.wobble * 2;

      gatePositions[j] = x0;
      gatePositions[j + 1] = y0;
      gatePositions[j + 2] = gateZ[g];
      gatePositions[j + 3] = x1;
      gatePositions[j + 4] = y1;
      gatePositions[j + 5] = gateZ[g];

      const tint = THREE.MathUtils.clamp(proximity * 0.5 + flare + gateMix[g] * 0.18, 0, 1);
      const colorBase = s % 3 === 0 ? phase.hot : phase.accent;
      const colorPeak = phase.primary;

      gateColors[j] = THREE.MathUtils.lerp(colorBase[0], colorPeak[0], tint);
      gateColors[j + 1] = THREE.MathUtils.lerp(colorBase[1], colorPeak[1], tint);
      gateColors[j + 2] = THREE.MathUtils.lerp(colorBase[2], colorPeak[2], tint);
      gateColors[j + 3] = THREE.MathUtils.lerp(colorBase[0], colorPeak[0], tint);
      gateColors[j + 4] = THREE.MathUtils.lerp(colorBase[1], colorPeak[1], tint);
      gateColors[j + 5] = THREE.MathUtils.lerp(colorBase[2], colorPeak[2], tint);
    }
  }

  gatePositionAttr.needsUpdate = true;
  gateColorAttr.needsUpdate = true;
}

function updateScene(time, phase) {
  bgColor.setRGB(
    phase.bg[0] + bandState.bass * 0.008,
    phase.bg[1] + bandState.mid * 0.005,
    phase.bg[2] + bandState.air * 0.008
  );
  fogColor.setRGB(
    phase.fog[0] + bandState.lowMid * 0.008,
    phase.fog[1] + bandState.highMid * 0.006,
    phase.fog[2] + bandState.air * 0.008
  );

  scene.background = bgColor;
  scene.fog.color.copy(fogColor);
  scene.fog.density = 0.0015 + phase.spark * 0.0003 + bandState.air * 0.0003 + bandState.kickPulse * 0.0003;

  field.rotation.z = Math.sin(time * 0.12) * 0.04 + pointerX * 0.08 + bandState.snarePulse * 0.03;
  field.rotation.y = Math.sin(time * 0.08) * 0.03 + pointerX * 0.05;
  field.position.y = Math.sin(time * 0.22) * 0.8 + bandState.sub * 1.2;
  dustPoints.rotation.z = -time * 0.08;
  gateLines.rotation.z = time * 0.02 + bandState.mid * 0.04;

  camera.position.x = Math.sin(time * 0.16 + pointerX) * (1.4 + phase.cameraLift * 4) + pointerX * 5;
  camera.position.y = Math.cos(time * 0.13 + pointerY) * (1.0 + phase.cameraLift * 3) + pointerY * 3 + bandState.kickPulse * 0.8;
  camera.position.z = 14 + bandState.sub * 0.8;
  lookTarget.set(pointerX * 10, pointerY * 6, -220);
  camera.lookAt(lookTarget);
}

function updateHud(progress, phase) {
  phaseEl.textContent = `Phase ${phase.label}`;

  if (exportState.recording) {
    statusEl.textContent = `Recording export... ${formatTime(audioState.element.currentTime)} / ${formatTime(audioState.element.duration)}`;
  } else if (audioState.element && !audioState.element.paused) {
    statusEl.textContent = `${formatTime(audioState.element.currentTime)} / ${formatTime(audioState.element.duration)} | Kick ${formatPercent(bandState.kickPulse)} | Snare ${formatPercent(bandState.snarePulse)} | Hat ${formatPercent(bandState.hatPulse)}`;
  } else {
    statusEl.textContent = "Click start to launch the corridor.";
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
    speed: THREE.MathUtils.lerp(a.speed, b.speed, t),
    tunnelRadius: THREE.MathUtils.lerp(a.tunnelRadius, b.tunnelRadius, t),
    twist: THREE.MathUtils.lerp(a.twist, b.twist, t),
    gateRadius: THREE.MathUtils.lerp(a.gateRadius, b.gateRadius, t),
    gateScale: THREE.MathUtils.lerp(a.gateScale, b.gateScale, t),
    wobble: THREE.MathUtils.lerp(a.wobble, b.wobble, t),
    spark: THREE.MathUtils.lerp(a.spark, b.spark, t),
    cameraLift: THREE.MathUtils.lerp(a.cameraLift, b.cameraLift, t),
  };
}

function mixArray(a, b, t) {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ];
}

function reseedStar(i, initial) {
  const layer = i % 3;
  starType[i] = layer;
  starAngle[i] = Math.random() * TAU;
  starSpeed[i] = 0.4 + Math.random() * 1.2;
  starSeed[i] = Math.random() * TAU;
  starMix[i] = Math.random();
  starZ[i] = initial ? -Math.random() * FIELD_DEPTH : BACK_Z - Math.random() * 120;

  if (layer === 0) {
    starRadius[i] = 0.86 + Math.random() * 0.22;
    starBaseSize[i] = 0.72 + Math.random() * 0.54;
  } else if (layer === 1) {
    starRadius[i] = 0.58 + Math.random() * 0.22;
    starBaseSize[i] = 0.58 + Math.random() * 0.42;
  } else {
    starRadius[i] = 0.30 + Math.random() * 0.18;
    starBaseSize[i] = 0.44 + Math.random() * 0.30;
  }
}

function reseedDust(i, initial) {
  dustAngle[i] = Math.random() * TAU;
  dustRadius[i] = 0.62 + Math.random() * 0.34;
  dustSpeed[i] = 0.6 + Math.random() * 1.4;
  dustSeedA[i] = Math.random() * TAU;
  dustSeedB[i] = Math.random() * TAU;
  dustMix[i] = Math.random();
  dustZ[i] = initial ? -Math.random() * FIELD_DEPTH : BACK_Z - Math.random() * 160;
  dustBaseSize[i] = 0.26 + Math.random() * 0.28;
}

function reseedStreak(i, initial) {
  streakAngle[i] = Math.random() * TAU;
  streakRadius[i] = 0.70 + Math.random() * 0.26;
  streakSpeed[i] = 0.5 + Math.random() * 1.3;
  streakSeed[i] = Math.random() * TAU;
  streakMix[i] = Math.random();
  streakZ[i] = initial ? -Math.random() * FIELD_DEPTH : BACK_Z - Math.random() * 180;
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

async function startExport() {
  if (!window.MediaRecorder) {
    statusEl.textContent = "MediaRecorder is not available in this browser.";
    return;
  }

  if (exportState.recording) {
    stopExport();
    return;
  }

  if (!audioState.context) {
    initAudio();
  }

  await audioState.context.resume();

  const mimeType = getSupportedMimeType();
  const canvasStream = renderer.domElement.captureStream(60);
  const tracks = [...canvasStream.getVideoTracks()];

  if (audioState.recordDestination) {
    tracks.push(...audioState.recordDestination.stream.getAudioTracks());
  }

  if (tracks.length === 0) {
    statusEl.textContent = "Could not create an export stream.";
    return;
  }

  exportState.stream = new MediaStream(tracks);
  exportState.mimeType = mimeType;
  exportState.chunks = [];
  exportState.restoreLoop = audioState.element.loop;
  exportState.recorder = mimeType
    ? new MediaRecorder(exportState.stream, { mimeType })
    : new MediaRecorder(exportState.stream);

  exportState.recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      exportState.chunks.push(event.data);
    }
  });
  exportState.recorder.addEventListener("stop", finalizeExport);

  if (!audioState.element.paused) {
    audioState.element.pause();
  }

  audioState.element.currentTime = 0;
  audioState.element.loop = false;
  exportState.recording = true;
  setExportButtons(true);
  startOverlay.classList.add("hidden");
  statusEl.textContent = "Recording export...";
  exportState.recorder.start();
  await audioState.element.play();
}

function stopExport() {
  if (!exportState.recording || !exportState.recorder) {
    return;
  }

  exportState.recording = false;
  setExportButtons(false);
  statusEl.textContent = "Finishing export...";
  audioState.element.loop = exportState.restoreLoop;

  if (exportState.recorder.state !== "inactive") {
    exportState.recorder.stop();
  }
}

function finalizeExport() {
  const blob = new Blob(exportState.chunks, {
    type: exportState.mimeType || "video/webm",
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = url;
  link.download = `star-drive-${stamp}.webm`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  if (exportState.stream) {
    exportState.stream.getTracks().forEach((track) => track.stop());
  }

  exportState.stream = null;
  exportState.recorder = null;
  exportState.chunks = [];
  statusEl.textContent = "Export ready. Convert the .webm to MP4 for Instagram if needed.";
}

function handleTrackEnded() {
  if (exportState.recording) {
    stopExport();
  }
}

function setExportButtons(isRecording) {
  const label = isRecording ? "Stop Export" : "Export Video";
  exportButton.textContent = label;
  exportOverlayButton.textContent = label;
}

function getSupportedMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

function createPointMaterial(options = {}) {
  const blending = options.blending ?? THREE.AdditiveBlending;
  const alphaScale = options.alphaScale ?? 1;
  const edge = options.edge ?? 0.2;

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
