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
PFont mono;

// -- Grid --
int cols, rows;
float cellW, cellH;
float fontSize;

// -- Character ramps (sorted by visual density) --
String[] charSets = {
  " .,:;-~=+*#%@",           // classic density ramp
  " ._-:;!|/\\(){}[]<>",     // structural / brutalist
  " 0123456789ABCDEF",        // data / hex
  " +-x|/\\=><^v#@",         // geometric
};

// -- Glitch state --
float[] rowOffset;        // horizontal displacement per row
float[] rowGlitchDecay;   // decay timer for row glitches
int[] corruptBlockX, corruptBlockY, corruptBlockW, corruptBlockH;
float[] corruptBlockLife;
int maxCorruptBlocks = 8;
int corruptHead = 0;

// -- Color --
// Phosphor green base, glitch accents
color colPrimary;
color colGlitch1, colGlitch2, colGlitch3;
color colBg;

float noiseZ = 0;

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

  // Font sizing — target ~120-160 columns for density
  float targetCols = 140;
  fontSize = max(8, targetWidth / targetCols * 1.1);
  mono = createFont("Menlo-Bold", fontSize);

  canvas.beginDraw();
  canvas.textFont(mono);
  canvas.textSize(fontSize);
  cellW = canvas.textWidth("M");
  cellH = fontSize * 1.15;
  canvas.endDraw();

  cols = (int)(targetWidth / cellW) + 1;
  rows = (int)(targetHeight / cellH) + 1;

  // Glitch state
  rowOffset = new float[rows];
  rowGlitchDecay = new float[rows];

  corruptBlockX = new int[maxCorruptBlocks];
  corruptBlockY = new int[maxCorruptBlocks];
  corruptBlockW = new int[maxCorruptBlocks];
  corruptBlockH = new int[maxCorruptBlocks];
  corruptBlockLife = new float[maxCorruptBlocks];

  // Colors
  colBg = color(6, 6, 10);
  colPrimary = color(0, 255, 65);     // phosphor green
  colGlitch1 = color(255, 0, 100);    // hot pink
  colGlitch2 = color(0, 220, 255);    // cyan
  colGlitch3 = color(255, 60, 0);     // harsh red-orange

  noiseSeed(77);
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

    // Noise evolution
    float noiseScale = 0.02 + bass * 0.03;
    noiseZ += 0.008 + mid * 0.015;

    // -- Select active character set based on mid+progress --
    int charSetIdx = floor((mid * 2 + progress * 1.5) * charSets.length) % charSets.length;
    String activeChars = charSets[charSetIdx];
    // Blend: on high energy, mix in hex set
    String glitchChars = charSets[2]; // hex/data set

    // -- Kick: trigger row glitches --
    if (kick > 0.7) {
      int numGlitchRows = 3 + (int)(kick * 12);
      for (int i = 0; i < numGlitchRows; i++) {
        int row = (int) random(rows);
        rowOffset[row] = random(-cols * 0.4, cols * 0.4) * cellW;
        rowGlitchDecay[row] = 1.0;
      }
    }

    // -- Snare: trigger corrupt blocks --
    if (snare > 0.8) {
      int numBlocks = 1 + (int)(snare * 3);
      for (int i = 0; i < numBlocks; i++) {
        int idx = corruptHead % maxCorruptBlocks;
        corruptBlockX[idx] = (int) random(cols);
        corruptBlockY[idx] = (int) random(rows);
        corruptBlockW[idx] = 4 + (int) random(20);
        corruptBlockH[idx] = 2 + (int) random(8);
        corruptBlockLife[idx] = 1.0;
        corruptHead++;
      }
    }

    // Decay row offsets
    for (int r = 0; r < rows; r++) {
      rowGlitchDecay[r] *= 0.85;
      if (rowGlitchDecay[r] < 0.01) {
        rowOffset[r] *= 0.7;
      }
    }

    // Decay corrupt blocks
    for (int i = 0; i < maxCorruptBlocks; i++) {
      corruptBlockLife[i] *= 0.9;
    }

    // -- Build corrupt block lookup --
    boolean[][] isCorrupt = new boolean[cols][rows];
    boolean[][] isInvert = new boolean[cols][rows];
    for (int i = 0; i < maxCorruptBlocks; i++) {
      if (corruptBlockLife[i] > 0.1) {
        for (int bx = corruptBlockX[i]; bx < min(cols, corruptBlockX[i] + corruptBlockW[i]); bx++) {
          for (int by = corruptBlockY[i]; by < min(rows, corruptBlockY[i] + corruptBlockH[i]); by++) {
            if (bx >= 0 && bx < cols && by >= 0 && by < rows) {
              isCorrupt[bx][by] = true;
              isInvert[bx][by] = corruptBlockLife[i] > 0.5;
            }
          }
        }
      }
    }

    canvas.beginDraw();
    canvas.background(red(colBg), green(colBg), blue(colBg));
    canvas.textFont(mono);
    canvas.textSize(fontSize);
    canvas.textAlign(LEFT, TOP);

    for (int row = 0; row < rows; row++) {
      float yPos = row * cellH;
      float xShift = rowOffset[row] * rowGlitchDecay[row];

      // Hat: micro-jitter on random rows
      if (hat > 0.5 && random(1) < hat * 0.15) {
        xShift += random(-cellW * 2, cellW * 2);
      }

      for (int col = 0; col < cols; col++) {
        float xPos = col * cellW + xShift;

        // Skip if completely off-screen
        if (xPos < -cellW || xPos > targetWidth) continue;

        // Noise-driven intensity
        float nx = col * noiseScale;
        float ny = row * noiseScale;
        float n = noise(nx, ny, noiseZ);

        // Audio modulation: bass amplifies, presence adds edge detail
        float intensity = n * (0.4 + bass * 0.6 + sub * 0.3);
        intensity += presence * noise(col * 0.1, row * 0.1, noiseZ * 2) * 0.3;
        intensity = constrain(intensity, 0, 1);

        // Pick character
        boolean corrupt = isCorrupt[col][row];
        boolean invert = isInvert[col][row];
        String chars = corrupt ? glitchChars : activeChars;

        int charIdx;
        if (corrupt && random(1) < 0.3) {
          charIdx = (int) random(chars.length());
        } else {
          charIdx = constrain((int)(intensity * (chars.length() - 1)), 0, chars.length() - 1);
        }
        char ch = chars.charAt(charIdx);

        // Skip spaces unless inverted
        if (ch == ' ' && !invert) continue;

        // -- Color --
        color textCol;
        float bright = 0.3 + intensity * 0.7 + kick * 0.3;
        bright = constrain(bright, 0, 1);

        if (invert) {
          // Inverted block: bright bg, dark text
          canvas.noStroke();
          canvas.fill(red(colGlitch1), green(colGlitch1), blue(colGlitch1), corruptBlockLife[0] * 200);
          canvas.rect(xPos, yPos, cellW, cellH);
          textCol = color(6, 6, 10);
        } else if (corrupt) {
          // Corrupt: random glitch color
          float r = random(1);
          if (r < 0.33) textCol = colGlitch1;
          else if (r < 0.66) textCol = colGlitch2;
          else textCol = colGlitch3;
          textCol = color(red(textCol), green(textCol), blue(textCol), bright * 255);
        } else {
          // Normal: phosphor green with intensity variation
          // Shift toward secondary colors based on position and energy
          float hueShift = noise(col * 0.03, row * 0.03, noiseZ * 0.5);

          if (hueShift > 0.75 && energy > 0.3) {
            // Accent zones: cyan
            textCol = color(
              lerp(0, red(colGlitch2), hueShift - 0.75) * 4 * bright,
              lerp(green(colPrimary), green(colGlitch2), (hueShift - 0.75) * 4) * bright,
              lerp(0, blue(colGlitch2), (hueShift - 0.75) * 4) * bright,
              bright * 220
            );
          } else if (hueShift > 0.6 && highMid > 0.3) {
            // Secondary accent: warm
            textCol = color(
              lerp(0, 255, (hueShift - 0.6) * 6.6) * bright,
              green(colPrimary) * bright * 0.6,
              0,
              bright * 200
            );
          } else {
            // Primary: phosphor green
            textCol = color(0, green(colPrimary) * bright, blue(colPrimary) * bright * 0.25, bright * 200);
          }
        }

        canvas.fill(textCol);
        canvas.noStroke();
        canvas.text(ch, xPos, yPos);
      }
    }

    // -- Scanline overlay --
    canvas.stroke(0, 0, 0, 30 + air * 20);
    canvas.strokeWeight(1);
    for (int y = 0; y < targetHeight; y += 3) {
      canvas.line(0, y, targetWidth, y);
    }

    // -- Kick: horizontal tear lines --
    if (kick > 0.5) {
      int numTears = (int)(kick * 5);
      for (int i = 0; i < numTears; i++) {
        float ty = random(targetHeight);
        float tearHeight = random(1, 4);
        canvas.noStroke();
        canvas.fill(red(colPrimary), green(colPrimary), blue(colPrimary), kick * 60);
        canvas.rect(0, ty, targetWidth, tearHeight);
      }
    }

    // -- Large overlay glyphs on heavy kicks --
    if (kick > 0.9) {
      canvas.textAlign(CENTER, CENTER);
      float bigSize = fontSize * (8 + kick * 12);
      canvas.textSize(bigSize);
      String[] bigGlyphs = { "#", "//", ">>", "<<", "##", "&&", "!!", "??", "[]", "{}" };
      String glyph = bigGlyphs[(int) random(bigGlyphs.length)];
      float gx = targetWidth * 0.2 + random(targetWidth * 0.6);
      float gy = targetHeight * 0.2 + random(targetHeight * 0.6);
      canvas.fill(red(colPrimary), green(colPrimary), blue(colPrimary), 20 + kick * 30);
      canvas.text(glyph, gx, gy);
      canvas.textSize(fontSize);
      canvas.textAlign(LEFT, TOP);
    }

    // -- Vignette --
    float vigSize = max(targetWidth, targetHeight) * 1.1;
    for (int r = (int)(vigSize * 0.4); r < (int)(vigSize * 0.55); r += 2) {
      float a = map(r, vigSize * 0.4, vigSize * 0.55, 0, 140);
      canvas.noFill();
      canvas.stroke(red(colBg), green(colBg), blue(colBg), a);
      canvas.strokeWeight(2);
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
