import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.IIOImage;
import javax.imageio.stream.FileImageOutputStream;
import javax.imageio.plugins.jpeg.JPEGImageWriteParam;
import java.awt.image.BufferedImage;

// -- Config --
String analysisPath;
String framesDir;
int targetWidth = 400;
int targetHeight = 400;
float targetFps = 30;
float jpegQuality = 0.92;
int targetFrameCount = 0;

// -- Analysis --
JSONObject analysisData;
JSONArray framesArray;

// -- Render --
PGraphics canvas;
int currentFrame = 0;
boolean rendered = false;

// -- Terrain --
int numLines = 70;
int numPoints = 200;
float noiseZ = 0;

// Margins
float marginTop, marginBottom, marginLeft, marginRight;

// Colors
color bgColor = color(6, 4, 15);

// Palette: deep-to-bright gradient for the lines
color[] palette = {
  #1a0533,  // deep purple (back/top)
  #2d1b69,  // dark violet
  #4a1a8a,  // purple
  #7b2fbe,  // bright purple
  #a855f7,  // violet
  #c084fc,  // lavender
  #e879f9,  // pink-violet
  #f0abfc,  // light pink
  #fae8ff,  // near white
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
    println("No args — exiting.");
    exit();
    return;
  }

  analysisData = loadJSONObject(analysisPath);
  framesArray = analysisData.getJSONArray("frames");
  if (targetFrameCount == 0) {
    targetFrameCount = analysisData.getInt("frameCount");
  }

  canvas = createGraphics(targetWidth, targetHeight);

  // Margins: more vertical space, tighter horizontal
  marginTop = targetHeight * 0.08;
  marginBottom = targetHeight * 0.08;
  marginLeft = targetWidth * 0.06;
  marginRight = targetWidth * 0.06;

  noiseSeed(33);
  frameRate(1000);
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
    float[] bandArr = { sub, bass, lowMid, mid, highMid, presence, air };

    // Noise evolution
    noiseZ += 0.006 + energy * 0.012;

    canvas.beginDraw();
    canvas.background(red(bgColor), green(bgColor), blue(bgColor));
    canvas.noFill();

    float drawWidth = targetWidth - marginLeft - marginRight;
    float drawHeight = targetHeight - marginTop - marginBottom;
    float lineSpacing = drawHeight / (numLines - 1);
    float scale = targetHeight / 1080.0; // normalize to reference size

    // Maximum wave amplitude
    float maxAmp = lineSpacing * 3.5;

    // Draw lines from back (top) to front (bottom)
    // Each line occludes the ones behind it
    for (int i = 0; i < numLines; i++) {
      float lineT = (float) i / (numLines - 1); // 0=top/back, 1=bottom/front
      float baseY = marginTop + lineT * drawHeight;

      // -- Frequency band mapping --
      // Front lines respond to bass, back lines to treble
      // Each line blends across the 7 bands based on its position
      float bandWeight = 0;
      for (int b = 0; b < 7; b++) {
        float bandCenter = (float) b / 6.0;
        // Inverted: band 0 (sub) maps to lineT=1 (front), band 6 (air) maps to lineT=0 (back)
        float invertedCenter = 1.0 - bandCenter;
        float dist = abs(lineT - invertedCenter);
        float w = max(0, 1.0 - dist * 3.0); // gaussian-ish falloff
        bandWeight += bandArr[b] * w;
      }
      bandWeight = constrain(bandWeight, 0, 1.5);

      // Amplitude: driven by frequency band + global energy
      float amp = maxAmp * (0.1 + bandWeight * 0.7 + kick * 0.4 * (1.0 - lineT * 0.5));

      // Noise scale: front lines have more detail, back lines smoother
      float noiseScale = lerp(0.008, 0.025, lineT);
      // Extra turbulence from snare
      float turbulence = snare * 0.3;

      // -- Build the waveform points --
      float[] pointX = new float[numPoints];
      float[] pointY = new float[numPoints];

      for (int p = 0; p < numPoints; p++) {
        float px = (float) p / (numPoints - 1);
        float x = marginLeft + px * drawWidth;

        // Base displacement from noise
        float n = noise(px * numPoints * noiseScale, lineT * 10, noiseZ + lineT * 0.5);
        n = (n - 0.5) * 2; // center around 0

        // Add harmonic detail
        float detail = noise(px * numPoints * noiseScale * 3, lineT * 20, noiseZ * 1.5);
        n += (detail - 0.5) * 0.4 * (presence + air * 0.5);

        // Snare turbulence: high-frequency noise burst
        if (snare > 0.3) {
          float sNoise = noise(px * 80, lineT * 30, noiseZ * 3);
          n += (sNoise - 0.5) * turbulence;
        }

        // Hat: fine shimmer
        if (hat > 0.4) {
          n += sin(px * 120 + currentFrame * 0.5) * hat * 0.08;
        }

        // Shape: gaussian-ish envelope so edges taper to zero
        float envelope = sin(px * PI);
        envelope = pow(envelope, 0.8); // slightly wider than pure sine

        // Kick: sharp center peak
        float kickPeak = 0;
        if (kick > 0.2) {
          float centerDist = abs(px - 0.5) * 2;
          kickPeak = kick * exp(-centerDist * centerDist * 8) * 0.6;
        }

        float displacement = (n * amp + kickPeak * maxAmp * 1.5) * envelope;

        pointX[p] = x;
        pointY[p] = baseY - abs(displacement); // waves go UP (negative Y)
      }

      // -- Draw filled shape (occlusion) --
      // Fill below the line with background color to hide lines behind
      canvas.beginShape();
      canvas.fill(red(bgColor), green(bgColor), blue(bgColor));
      canvas.noStroke();

      for (int p = 0; p < numPoints; p++) {
        canvas.vertex(pointX[p], pointY[p]);
      }
      // Close along bottom
      canvas.vertex(marginLeft + drawWidth, baseY + lineSpacing);
      canvas.vertex(marginLeft, baseY + lineSpacing);
      canvas.endShape(CLOSE);

      // -- Draw the line itself --
      // Color: gradient from back (dark) to front (bright)
      float palT = lineT * (palette.length - 1);
      int palIdx = constrain(floor(palT), 0, palette.length - 2);
      float palFrac = palT - palIdx;
      color lineColor = lerpColor(palette[palIdx], palette[palIdx + 1], palFrac);

      // Brightness boost from energy and kick
      float bright = 0.6 + energy * 0.3 + kick * 0.2;
      bright = constrain(bright, 0, 1);

      // Glow: draw line multiple times at increasing width/decreasing opacity
      for (int g = 3; g >= 0; g--) {
        float glow = g * 2.5 * scale;
        float alpha;
        if (g == 0) {
          // Core line
          alpha = 220 * bright;
          canvas.strokeWeight(1.5 * scale);
        } else {
          // Glow layers
          alpha = (30 - g * 8) * bright * bandWeight;
          canvas.strokeWeight((1.5 + glow) * scale);
        }

        color strokeCol = color(
          red(lineColor),
          green(lineColor),
          blue(lineColor),
          alpha
        );
        canvas.stroke(strokeCol);
        canvas.noFill();
        canvas.beginShape();
        for (int p = 0; p < numPoints; p++) {
          canvas.vertex(pointX[p], pointY[p]);
        }
        canvas.endShape();
      }
    }

    // -- Center glow on kicks --
    if (kick > 0.3) {
      float glowR = targetWidth * 0.15 * kick;
      for (int r = (int) glowR; r > 0; r -= 3) {
        float a = map(r, 0, glowR, kick * 25, 0);
        canvas.noStroke();
        canvas.fill(200, 160, 255, a);
        canvas.ellipse(targetWidth / 2.0, targetHeight * 0.5, r * 2, r * 0.4);
      }
    }

    // -- Subtle horizontal scan lines --
    canvas.stroke(0, 0, 0, 15);
    canvas.strokeWeight(1);
    for (int y = 0; y < targetHeight; y += 4) {
      canvas.line(0, y, targetWidth, y);
    }

    // -- Vignette --
    float vigSize = max(targetWidth, targetHeight) * 1.2;
    for (int r = (int)(vigSize * 0.35); r < (int)(vigSize * 0.55); r += 2) {
      float a = map(r, vigSize * 0.35, vigSize * 0.55, 0, 160);
      canvas.noFill();
      canvas.stroke(red(bgColor), green(bgColor), blue(bgColor), a);
      canvas.strokeWeight(3);
      canvas.ellipse(targetWidth / 2.0, targetHeight / 2.0, r * 2, r * 2);
    }

    canvas.endDraw();

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
