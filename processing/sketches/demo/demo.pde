import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.IIOImage;
import javax.imageio.stream.FileImageOutputStream;
import javax.imageio.plugins.jpeg.JPEGImageWriteParam;
import java.awt.image.BufferedImage;

// -- Config from args --
String analysisPath;
String framesDir;
int targetWidth = 400;
int targetHeight = 400;
float targetFps = 30;
float jpegQuality = 0.92;
int targetFrameCount = 0;

// -- Analysis data --
JSONObject analysisData;
JSONArray framesArray;

// -- Render state --
PGraphics canvas;
int currentFrame = 0;
boolean rendered = false;

// -- Flow field --
int numParticles = 4000;
float[] px, py, prevX, prevY;
float[] pHue;
int[] pLayer; // 0=slow/thick, 1=medium, 2=fast/thin

float noiseZ = 0;
float colorPhase = 0;

// -- Color palette (HSB) --
// Three anchor hues that shift over the song
float[][] hueAnchors = {
  { 195, 280, 340 },  // cyan, violet, magenta
  { 15, 35, 55 },     // ember: red, orange, gold
  { 160, 195, 280 },  // ocean: teal, cyan, violet
};

void settings() {
  if (args != null && args.length >= 4) {
    targetWidth = Integer.parseInt(args[2]);
    targetHeight = Integer.parseInt(args[3]);
    size(1, 1);
  } else {
    size(targetWidth, targetHeight);
  }
}

void setup() {
  surface.setVisible(false);

  if (args != null && args.length >= 7) {
    analysisPath = args[0];
    framesDir = args[1];
    targetFps = Float.parseFloat(args[4]);
    jpegQuality = Float.parseFloat(args[5]) / 100.0;
    targetFrameCount = Integer.parseInt(args[6]);
  } else {
    println("Usage: processing-java --sketch=<path> --run <analysis.json> <framesDir> <width> <height> <fps> <jpegQuality> <frameCount>");
    exit();
    return;
  }

  analysisData = loadJSONObject(analysisPath);
  framesArray = analysisData.getJSONArray("frames");
  if (targetFrameCount == 0) {
    targetFrameCount = analysisData.getInt("frameCount");
  }

  canvas = createGraphics(targetWidth, targetHeight);
  canvas.beginDraw();
  canvas.background(8, 6, 14);
  canvas.endDraw();

  // Scale particle count to canvas area
  float areaRatio = (targetWidth * targetHeight) / (1080.0 * 1080.0);
  numParticles = max(2000, (int)(4000 * areaRatio));

  px = new float[numParticles];
  py = new float[numParticles];
  prevX = new float[numParticles];
  prevY = new float[numParticles];
  pHue = new float[numParticles];
  pLayer = new int[numParticles];

  for (int i = 0; i < numParticles; i++) {
    respawn(i);
    prevX[i] = px[i];
    prevY[i] = py[i];
    pLayer[i] = (i < numParticles * 0.2) ? 0 : (i < numParticles * 0.6) ? 1 : 2;
  }

  noiseSeed(42);
  frameRate(1000);
}

void respawn(int i) {
  px[i] = random(targetWidth);
  py[i] = random(targetHeight);
  pHue[i] = random(1);
}

void draw() {
  if (rendered) return;
  rendered = true;

  for (currentFrame = 0; currentFrame < targetFrameCount; currentFrame++) {
    JSONObject frame = framesArray.getJSONObject(currentFrame);
    JSONObject bands = frame.getJSONObject("bands");

    float sub = bands.getFloat("sub");
    float bass = bands.getFloat("bass");
    float lowMid = bands.getFloat("lowMid");
    float mid = bands.getFloat("mid");
    float highMid = bands.getFloat("highMid");
    float presence = bands.getFloat("presence");
    float air = bands.getFloat("air");
    float kick = frame.getFloat("kickPulse");
    float snare = frame.getFloat("snarePulse");
    float hat = frame.getFloat("hatPulse");

    float progress = (float) currentFrame / max(1, targetFrameCount - 1);
    float energy = (sub + bass + lowMid + mid + highMid + presence + air) / 7.0;

    // -- Noise field parameters driven by audio --
    float noiseScale = map(bass + sub * 0.5, 0, 1.5, 0.0015, 0.004);
    float noiseEvolution = 0.003 + mid * 0.008; // how fast the field morphs
    float speedBase = 1.5 + energy * 3.0 + kick * 4.0;

    // Snare shifts color phase
    if (snare > 0.9) {
      colorPhase += 0.08;
    }
    colorPhase += 0.0003; // slow drift

    noiseZ += noiseEvolution;

    // -- Palette interpolation --
    float palT = progress * (hueAnchors.length - 1);
    int palIdx = constrain(floor(palT), 0, hueAnchors.length - 2);
    float palBlend = palT - palIdx;
    float[] currentHues = new float[3];
    for (int i = 0; i < 3; i++) {
      currentHues[i] = lerp(hueAnchors[palIdx][i], hueAnchors[palIdx + 1][i], palBlend);
    }

    canvas.beginDraw();
    canvas.colorMode(HSB, 360, 100, 100, 100);

    // -- Fade overlay: trails --
    // Less fade = longer trails. Bass makes trails linger.
    float fadeAlpha = map(bass + sub * 0.5, 0, 1.2, 12, 4);
    fadeAlpha = constrain(fadeAlpha, 3, 18);
    canvas.noStroke();
    canvas.fill(228, 30, 5, fadeAlpha); // dark blue-tinted fade, not pure black
    canvas.rect(0, 0, targetWidth, targetHeight);

    // -- Kick flash --
    if (kick > 0.7) {
      float flashAlpha = kick * 8;
      float flashHue = currentHues[0];
      canvas.fill(flashHue, 40, 20, flashAlpha);
      canvas.rect(0, 0, targetWidth, targetHeight);
    }

    // -- Update and draw particles --
    for (int i = 0; i < numParticles; i++) {
      prevX[i] = px[i];
      prevY[i] = py[i];

      // Layer-specific speed multiplier
      float layerSpeed;
      float layerWeight;
      float layerAlpha;
      if (pLayer[i] == 0) {
        layerSpeed = 0.4;
        layerWeight = 2.5;
        layerAlpha = 30;
      } else if (pLayer[i] == 1) {
        layerSpeed = 1.0;
        layerWeight = 1.2;
        layerAlpha = 50;
      } else {
        layerSpeed = 1.8;
        layerWeight = 0.6;
        layerAlpha = 70;
      }

      // Noise-driven angle
      float nx = px[i] * noiseScale;
      float ny = py[i] * noiseScale;
      float noiseVal = noise(nx, ny, noiseZ + pLayer[i] * 10);
      float angle = noiseVal * TAU * 2.5; // extra range for more curl

      // Add turbulence from high frequencies
      angle += sin(px[i] * 0.01 + currentFrame * 0.02) * highMid * 0.5;

      float speed = speedBase * layerSpeed;
      px[i] += cos(angle) * speed;
      py[i] += sin(angle) * speed;

      // Wrap at edges
      if (px[i] < 0) px[i] += targetWidth;
      if (px[i] >= targetWidth) px[i] -= targetWidth;
      if (py[i] < 0) py[i] += targetHeight;
      if (py[i] >= targetHeight) py[i] -= targetHeight;

      // Skip drawing if particle wrapped (would draw a line across the canvas)
      float dx = px[i] - prevX[i];
      float dy = py[i] - prevY[i];
      if (abs(dx) > targetWidth * 0.5 || abs(dy) > targetHeight * 0.5) {
        continue;
      }

      // Color: map noise angle to palette hues
      float hueT = (noiseVal + colorPhase + pHue[i] * 0.3) % 1.0;
      int hueIdx = floor(hueT * 3) % 3;
      int hueNext = (hueIdx + 1) % 3;
      float hueFrac = (hueT * 3) % 1.0;
      float h = lerp(currentHues[hueIdx], currentHues[hueNext], hueFrac) % 360;
      if (h < 0) h += 360;

      float s = 70 + presence * 20 + snare * 15;
      float b = 50 + energy * 30 + kick * 25 + hat * 15;
      float a = layerAlpha + kick * 20 + energy * 15;

      canvas.stroke(h, constrain(s, 0, 100), constrain(b, 0, 100), constrain(a, 0, 100));
      canvas.strokeWeight(layerWeight * (targetWidth / 1080.0));
      canvas.line(prevX[i], prevY[i], px[i], py[i]);

      // Hat: occasional bright dot on fast particles
      if (hat > 0.6 && pLayer[i] == 2 && random(1) < 0.03) {
        canvas.noStroke();
        canvas.fill(h, 20, 100, 60);
        float dotSize = 3 * (targetWidth / 1080.0);
        canvas.ellipse(px[i], py[i], dotSize, dotSize);
      }

      // Respawn stale particles occasionally
      if (currentFrame > 0 && random(1) < 0.0005) {
        respawn(i);
        prevX[i] = px[i];
        prevY[i] = py[i];
      }
    }

    // -- Vignette --
    canvas.colorMode(RGB, 255);
    float vigSize = max(targetWidth, targetHeight) * 1.1;
    for (int r = (int)(vigSize * 0.45); r < (int)(vigSize * 0.55); r += 2) {
      float t = map(r, vigSize * 0.45, vigSize * 0.55, 0, 120);
      canvas.noFill();
      canvas.stroke(8, 6, 14, t);
      canvas.strokeWeight(2);
      canvas.ellipse(targetWidth / 2.0, targetHeight / 2.0, r * 2, r * 2);
    }

    canvas.endDraw();

    // Save frame
    saveJPEG(canvas, framesDir + "/frame-" + nf(currentFrame + 1, 6) + ".jpg", jpegQuality);
    println("FRAME:" + (currentFrame + 1) + "/" + targetFrameCount);
  }

  println("DONE");
  exit();
}

void saveJPEG(PGraphics pg, String filePath, float quality) {
  try {
    BufferedImage bi = (BufferedImage) pg.getNative();
    BufferedImage rgb = new BufferedImage(bi.getWidth(), bi.getHeight(), BufferedImage.TYPE_INT_RGB);
    rgb.getGraphics().drawImage(bi, 0, 0, null);

    javax.imageio.ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
    JPEGImageWriteParam param = (JPEGImageWriteParam) writer.getDefaultWriteParam();
    param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
    param.setCompressionQuality(quality);

    FileImageOutputStream out = new FileImageOutputStream(new java.io.File(filePath));
    writer.setOutput(out);
    writer.write(null, new IIOImage(rgb, null, null), param);
    out.close();
    writer.dispose();
  } catch (Exception e) {
    println("Error saving JPEG: " + e.getMessage());
    pg.save(filePath);
  }
}
