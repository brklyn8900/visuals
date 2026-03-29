import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.IIOImage;
import javax.imageio.stream.FileImageOutputStream;
import javax.imageio.plugins.jpeg.JPEGImageWriteParam;
import java.awt.image.BufferedImage;

// -- Config --
String analysisPath;
String framesDir;
int targetWidth = 1080;
int targetHeight = 1350;
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
int[] working;   // per-frame working buffer
int[] source;    // blended source for current frame (for block glitch refs)
int[] prev;      // previous frame for persistence blending

// -- Multi-image --
int numImages = 0;
int[][] imagePixels;  // pixel data for each loaded image
float crossfadeZone = 0.12; // fraction of each segment used for crossfade

// -- Video frames mode --
boolean videoMode = false;
String videoFramesDir = null;
int videoFrameCount = 0;

// -- Sort modes: 0=luma, 1=hue, 2=red channel --
int sortMode = 0;
float sortModeTimer = 0;

// -- Color tint state --
float tintHue = 0;

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

  String imageArg = null;
  if (args != null && args.length >= 7) {
    analysisPath = args[0];
    framesDir = args[1];
    targetFps = Float.parseFloat(args[4]);
    jpegQuality = Float.parseFloat(args[5]) / 100.0;
    targetFrameCount = Integer.parseInt(args[6]);
    if (args.length >= 8) {
      imageArg = args[7];
    }
  } else {
    println("Error: insufficient arguments");
    exit();
    return;
  }

  if (imageArg == null || imageArg.isEmpty()) {
    println("Error: image path(s) required for pixelsort sketch");
    exit();
    return;
  }

  int totalPx = targetWidth * targetHeight;
  working = new int[totalPx];
  source  = new int[totalPx];
  prev    = new int[totalPx];

  // Check if imageArg is a directory (video frames mode)
  java.io.File imageFile = new java.io.File(imageArg);
  if (imageFile.isDirectory()) {
    videoMode = true;
    videoFramesDir = imageArg;
    // Count available frames
    String[] files = imageFile.list();
    int count = 0;
    for (String f : files) {
      if (f.endsWith(".jpg") && f.startsWith("frame-")) count++;
    }
    videoFrameCount = count;
    println("Video frames mode: " + videoFrameCount + " source frames in " + videoFramesDir);

    // Load first frame to initialize prev[]
    numImages = 1;
    loadVideoFrame(0, prev);
  } else {
    // Load images — single path or comma-separated list
    String[] imagePaths = imageArg.split(",");
    numImages = imagePaths.length;
    imagePixels = new int[numImages][totalPx];

    for (int i = 0; i < numImages; i++) {
      PImage img = loadImage(imagePaths[i].trim());
      if (img == null || img.width <= 0) {
        println("Error: could not load image: " + imagePaths[i]);
        exit();
        return;
      }
      img.resize(targetWidth, targetHeight);
      img.loadPixels();
      arrayCopy(img.pixels, imagePixels[i]);
      println("Loaded image " + (i + 1) + "/" + numImages + ": " + imagePaths[i].trim());
    }
    arrayCopy(imagePixels[0], prev);
  }

  analysisData = loadJSONObject(analysisPath);
  framesArray = analysisData.getJSONArray("frames");
  if (targetFrameCount == 0) {
    targetFrameCount = analysisData.getInt("frameCount");
  }

  canvas = createGraphics(targetWidth, targetHeight);
  frameRate(1000);
}

// ================================================================
//  SORT KEY FUNCTIONS
// ================================================================
float luma(int c) {
  return ((c >> 16) & 0xFF) * 0.299
       + ((c >> 8)  & 0xFF) * 0.587
       + ( c        & 0xFF) * 0.114;
}

float pixelHue(int c) {
  int r = (c >> 16) & 0xFF;
  int g = (c >> 8)  & 0xFF;
  int b =  c        & 0xFF;
  int mx = max(r, max(g, b));
  int mn = min(r, min(g, b));
  if (mx == mn) return 0;
  float d = mx - mn;
  float h;
  if (mx == r)      h = ((g - b) / d) % 6;
  else if (mx == g) h = (b - r) / d + 2;
  else              h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

float sortKey(int c) {
  if (sortMode == 1) return pixelHue(c);
  if (sortMode == 2) return (c >> 16) & 0xFF;
  return luma(c);
}

float thresholdKey(int c) {
  return luma(c);
}

// ================================================================
//  VIDEO FRAME LOADING
// ================================================================

/** Load a video frame by index (0-based) into the target pixel buffer */
void loadVideoFrame(int frameIndex, int[] target) {
  // Source frames are 1-indexed: frame-000001.jpg
  int sourceIdx = constrain(frameIndex + 1, 1, videoFrameCount);
  String framePath = videoFramesDir + "/frame-" + nf(sourceIdx, 6) + ".jpg";
  PImage img = loadImage(framePath);
  if (img == null || img.width <= 0) {
    println("Warning: could not load video frame: " + framePath);
    return;
  }
  if (img.width != targetWidth || img.height != targetHeight) {
    img.resize(targetWidth, targetHeight);
  }
  img.loadPixels();
  arrayCopy(img.pixels, target);
}

// ================================================================
//  IMAGE BLENDING
// ================================================================

/** Build the source pixel buffer for this frame, crossfading between images */
void buildSource(float progress) {
  // Video mode: load the corresponding source frame directly
  if (videoMode) {
    loadVideoFrame(currentFrame, source);
    return;
  }

  if (numImages == 1) {
    arrayCopy(imagePixels[0], source);
    return;
  }

  // Each image owns an equal segment of the timeline
  float segLen = 1.0 / numImages;
  float pos = progress / segLen;
  int idx = constrain(floor(pos), 0, numImages - 1);
  int nextIdx = min(idx + 1, numImages - 1);
  float segProgress = pos - idx; // 0..1 within current segment

  // Crossfade in the last crossfadeZone fraction of each segment
  if (idx == nextIdx || segProgress < (1.0 - crossfadeZone)) {
    // No crossfade — use current image directly
    arrayCopy(imagePixels[idx], source);
  } else {
    // Crossfading into next image
    float blend = map(segProgress, 1.0 - crossfadeZone, 1.0, 0, 1);
    blend = constrain(blend, 0, 1);
    // Ease: smoothstep for natural transition
    blend = blend * blend * (3 - 2 * blend);

    for (int i = 0; i < source.length; i++) {
      int a = imagePixels[idx][i];
      int b = imagePixels[nextIdx][i];
      int r = (int)lerp((a >> 16) & 0xFF, (b >> 16) & 0xFF, blend);
      int g = (int)lerp((a >> 8) & 0xFF,  (b >> 8) & 0xFF,  blend);
      int bl = (int)lerp( a & 0xFF,        b & 0xFF,         blend);
      source[i] = 0xFF000000 | (r << 16) | (g << 8) | bl;
    }
  }
}

// ================================================================
//  DRAW
// ================================================================
void draw() {
  if (rendered) return;
  rendered = true;

  for (currentFrame = 0; currentFrame < targetFrameCount; currentFrame++) {
    JSONObject frame = framesArray.getJSONObject(currentFrame);
    JSONObject bands = frame.getJSONObject("bands");

    float sub      = bands.getFloat("sub");
    float bass     = bands.getFloat("bass");
    float lowMid   = bands.getFloat("lowMid");
    float mid      = bands.getFloat("mid");
    float highMid  = bands.getFloat("highMid");
    float presence = bands.getFloat("presence");
    float air      = bands.getFloat("air");
    float kick     = frame.getFloat("kickPulse");
    float snare    = frame.getFloat("snarePulse");
    float hat      = frame.getFloat("hatPulse");

    float energy = (sub + bass + lowMid + mid + highMid + presence + air) / 7.0;
    float progress = (float) currentFrame / max(1, targetFrameCount - 1);

    // -----------------------------------------------------------
    // BUILD SOURCE — crossfade between images
    // -----------------------------------------------------------
    buildSource(progress);
    arrayCopy(source, working);

    // -----------------------------------------------------------
    // TEMPORAL EVOLUTION
    // -----------------------------------------------------------

    // Phase: 0-25% buildup, 25-60% developing, 60-85% peak, 85-100% resolve
    float intensityMult;
    if (progress < 0.25)      intensityMult = map(progress, 0, 0.25, 0.2, 0.6);
    else if (progress < 0.60) intensityMult = map(progress, 0.25, 0.60, 0.6, 1.0);
    else if (progress < 0.85) intensityMult = 1.0;
    else                      intensityMult = map(progress, 0.85, 1.0, 1.0, 0.3);

    // Sort mode cycling — snare hits advance the mode, timer-based fallback
    sortModeTimer += 1.0 / targetFps;
    if (snare > 0.8 && sortModeTimer > 4.0) {
      sortMode = (sortMode + 1) % 3;
      sortModeTimer = 0;
    }
    if (sortModeTimer > 12.0) {
      sortMode = (sortMode + 1) % 3;
      sortModeTimer = 0;
    }

    // Threshold oscillation
    float threshOsc = sin(currentFrame * 0.015) * 30;

    // Sort direction evolves over the song
    boolean ascending = sin(progress * TAU * 3 + mid * PI) > 0;

    // Tint hue drifts
    tintHue = (progress * 240 + snare * 60) % 360;

    // -----------------------------------------------------------
    // 1. HORIZONTAL PIXEL SORT
    // -----------------------------------------------------------
    float hThresh = map(bass + sub * 0.6, 0, 1.5, 190, 25) + threshOsc;
    hThresh = constrain(hThresh, 15, 210);

    float hCoverage = map(energy * intensityMult, 0, 1, 0.03, 0.95);
    hCoverage = constrain(hCoverage, 0, 1);

    for (int y = 0; y < targetHeight; y++) {
      if (random(1) > hCoverage) continue;
      sortRow(working, y, hThresh, ascending);
    }

    // -----------------------------------------------------------
    // 2. VERTICAL COLUMN SORT — kick triggered, grows with progress
    // -----------------------------------------------------------
    float vKickThreshold = map(progress, 0, 1, 0.5, 0.15);
    if (kick > vKickThreshold) {
      float vThresh = map(kick, vKickThreshold, 1.0, 160, 10) + threshOsc * 0.5;
      vThresh = constrain(vThresh, 8, 180);
      float colFraction = kick * map(progress, 0, 1, 0.15, 0.6);
      int numCols = (int)(colFraction * targetWidth);
      for (int c = 0; c < numCols; c++) {
        int x = (int)random(targetWidth);
        sortColumn(working, x, vThresh, !ascending);
      }
    }

    // -----------------------------------------------------------
    // 3. DIAGONAL SORT — unlocks after 30%
    // -----------------------------------------------------------
    if (progress > 0.30 && energy * intensityMult > 0.3) {
      float diagStrength = map(progress, 0.30, 0.80, 0.0, 1.0);
      diagStrength = constrain(diagStrength, 0, 1) * energy;
      int numDiags = (int)(diagStrength * 60);
      float angle = progress * PI + mid * 0.5;
      for (int d = 0; d < numDiags; d++) {
        int startX = (int)random(targetWidth);
        int startY = (int)random(targetHeight);
        sortDiagonal(working, startX, startY, angle, hThresh * 0.8, ascending);
      }
    }

    // -----------------------------------------------------------
    // 4. BLOCK GLITCH — kicks, uses source[] for clean pixel refs
    // -----------------------------------------------------------
    if (kick > 0.5 && progress > 0.15) {
      int numBlocks = (int)(kick * intensityMult * 6);
      for (int b = 0; b < numBlocks; b++) {
        int bw = (int)(random(30, 180) * targetWidth / 1080.0);
        int bh = (int)(random(15, 70) * targetHeight / 1080.0);
        int bx = (int)random(targetWidth - bw);
        int by = (int)random(targetHeight - bh);
        int offX = (int)(random(-35, 35) * kick * intensityMult);
        int offY = (int)(random(-12, 12) * kick * intensityMult);
        for (int row = 0; row < bh; row++) {
          for (int col = 0; col < bw; col++) {
            int dx = constrain(bx + col + offX, 0, targetWidth - 1);
            int dy = constrain(by + row + offY, 0, targetHeight - 1);
            working[dy * targetWidth + dx] = source[(by + row) * targetWidth + (bx + col)];
          }
        }
      }
    }

    // -----------------------------------------------------------
    // 5. RGB CHANNEL SHIFT — snare, grows with progress
    // -----------------------------------------------------------
    float channelThreshold = map(progress, 0, 1, 0.6, 0.25);
    if (snare > channelThreshold) {
      int shiftX = (int)(snare * map(progress, 0, 1, 6, 20) * targetWidth / 1080.0);
      int shiftY = (progress > 0.5) ? (int)(snare * 6 * targetHeight / 1080.0) : 0;
      channelShift(working, shiftX, shiftY);
    }

    // -----------------------------------------------------------
    // 6. GLITCH ROW DISPLACEMENT — high freqs
    // -----------------------------------------------------------
    float glitchFloor = map(progress, 0, 1, 0.9, 0.4);
    if (highMid + presence > glitchFloor) {
      int numLines = (int)((highMid + presence - glitchFloor) * 35 * intensityMult);
      for (int g = 0; g < numLines; g++) {
        int gy = (int)random(targetHeight);
        int shift = (int)(random(-22, 22) * presence * intensityMult);
        displaceRow(working, gy, shift);
      }
    }

    // -----------------------------------------------------------
    // 7. MICRO SCATTER — hat
    // -----------------------------------------------------------
    if (hat > 0.3) {
      int count = (int)(hat * map(progress, 0, 1, 400, 1500));
      float scatterRange = map(progress, 0, 1, 3, 7);
      for (int s = 0; s < count; s++) {
        int sx = (int)random(targetWidth);
        int sy = (int)random(targetHeight);
        int dx = constrain(sx + (int)random(-scatterRange, scatterRange + 1), 0, targetWidth - 1);
        int dy = constrain(sy + (int)random(-scatterRange, scatterRange + 1), 0, targetHeight - 1);
        working[dy * targetWidth + dx] = working[sy * targetWidth + sx];
      }
    }

    // -----------------------------------------------------------
    // 8. INVERSION ZONES — unlocks after 50%
    // -----------------------------------------------------------
    if (progress > 0.50 && mid > 0.5) {
      int numZones = (int)(mid * intensityMult * 3);
      for (int z = 0; z < numZones; z++) {
        int zw = (int)random(60, 250) * targetWidth / 1080;
        int zh = (int)random(10, 40) * targetHeight / 1080;
        int zx = (int)random(targetWidth - zw);
        int zy = (int)random(targetHeight - zh);
        for (int row = 0; row < zh; row++) {
          for (int col = 0; col < zw; col++) {
            int idx = (zy + row) * targetWidth + (zx + col);
            int c = working[idx];
            working[idx] = 0xFF000000
              | ((255 - ((c >> 16) & 0xFF)) << 16)
              | ((255 - ((c >> 8) & 0xFF)) << 8)
              | (255 - (c & 0xFF));
          }
        }
      }
    }

    // -----------------------------------------------------------
    // 9. PERSISTENCE — blend with previous frame
    // -----------------------------------------------------------
    float persist = map(energy * intensityMult, 0, 1, 0.0, 0.25);
    if (persist > 0.01) {
      for (int i = 0; i < working.length; i++) {
        int wc = working[i];
        int pc = prev[i];
        int r = (int)lerp((wc >> 16) & 0xFF, (pc >> 16) & 0xFF, persist);
        int g = (int)lerp((wc >> 8) & 0xFF,  (pc >> 8) & 0xFF,  persist);
        int b = (int)lerp( wc & 0xFF,         pc & 0xFF,         persist);
        working[i] = 0xFF000000 | (r << 16) | (g << 8) | b;
      }
    }
    arrayCopy(working, prev);

    // -----------------------------------------------------------
    // 10. COLOR TINT OVERLAY
    // -----------------------------------------------------------
    float tintStrength = map(energy * intensityMult, 0, 1, 0.0, 0.12);
    if (tintStrength > 0.01) {
      float h = tintHue / 360.0;
      float tr = 0, tg = 0, tb = 0;
      int hi = (int)(h * 6) % 6;
      float f = h * 6 - hi;
      if (hi == 0)      { tr = 1; tg = f; tb = 0; }
      else if (hi == 1) { tr = 1-f; tg = 1; tb = 0; }
      else if (hi == 2) { tr = 0; tg = 1; tb = f; }
      else if (hi == 3) { tr = 0; tg = 1-f; tb = 1; }
      else if (hi == 4) { tr = f; tg = 0; tb = 1; }
      else              { tr = 1; tg = 0; tb = 1-f; }

      for (int i = 0; i < working.length; i++) {
        int c = working[i];
        int r = (int)lerp((c >> 16) & 0xFF, tr * 255, tintStrength);
        int g = (int)lerp((c >> 8) & 0xFF,  tg * 255, tintStrength);
        int b = (int)lerp( c & 0xFF,        tb * 255, tintStrength);
        working[i] = 0xFF000000 | (constrain(r,0,255) << 16) | (constrain(g,0,255) << 8) | constrain(b,0,255);
      }
    }

    // -----------------------------------------------------------
    // CANVAS OUTPUT
    // -----------------------------------------------------------
    canvas.beginDraw();
    canvas.loadPixels();
    arrayCopy(working, canvas.pixels);
    canvas.updatePixels();

    // Scanlines
    canvas.colorMode(RGB, 255);
    int scanGap = (progress < 0.5) ? 3 : 2;
    float scanAlpha = 10 + energy * 10 + progress * 5;
    for (int y = 0; y < targetHeight; y += scanGap) {
      canvas.stroke(0, scanAlpha);
      canvas.line(0, y, targetWidth, y);
    }

    // Vignette
    float vigSize = max(targetWidth, targetHeight) * 1.1;
    for (int r = (int)(vigSize * 0.4); r < (int)(vigSize * 0.55); r += 2) {
      float t = map(r, vigSize * 0.4, vigSize * 0.55, 0, 90);
      canvas.noFill();
      canvas.stroke(0, t);
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

// ================================================================
//  PIXEL SORTING
// ================================================================

void sortRow(int[] pixels, int y, float threshold, boolean ascending) {
  int rowStart = y * targetWidth;
  int spanStart = -1;

  for (int x = 0; x <= targetWidth; x++) {
    float b = (x < targetWidth) ? thresholdKey(pixels[rowStart + x]) : 0;
    if (b > threshold && x < targetWidth) {
      if (spanStart == -1) spanStart = x;
    } else {
      if (spanStart != -1 && x - spanStart > 1) {
        sortSpan(pixels, rowStart + spanStart, x - spanStart, ascending);
      }
      spanStart = -1;
    }
  }
}

void sortColumn(int[] pixels, int x, float threshold, boolean ascending) {
  int spanStart = -1;

  for (int y = 0; y <= targetHeight; y++) {
    float b = (y < targetHeight) ? thresholdKey(pixels[y * targetWidth + x]) : 0;
    if (b > threshold && y < targetHeight) {
      if (spanStart == -1) spanStart = y;
    } else {
      if (spanStart != -1 && y - spanStart > 1) {
        int len = y - spanStart;
        int[] span = new int[len];
        float[] keys = new float[len];
        for (int i = 0; i < len; i++) {
          span[i] = pixels[(spanStart + i) * targetWidth + x];
          keys[i] = sortKey(span[i]);
        }
        insertionSort(span, keys, len, ascending);
        for (int i = 0; i < len; i++) {
          pixels[(spanStart + i) * targetWidth + x] = span[i];
        }
      }
      spanStart = -1;
    }
  }
}

void sortDiagonal(int[] pixels, int startX, int startY, float angle, float threshold, boolean ascending) {
  float dx = cos(angle);
  float dy = sin(angle);
  int maxLen = 120;

  int[] indices = new int[maxLen];
  int len = 0;
  float cx = startX, cy = startY;
  for (int i = 0; i < maxLen; i++) {
    int ix = (int)cx;
    int iy = (int)cy;
    if (ix < 0 || ix >= targetWidth || iy < 0 || iy >= targetHeight) break;
    int idx = iy * targetWidth + ix;
    if (thresholdKey(pixels[idx]) > threshold) {
      indices[len++] = idx;
    } else if (len > 1) {
      break;
    }
    cx += dx;
    cy += dy;
  }

  if (len < 2) return;

  int[] span = new int[len];
  float[] keys = new float[len];
  for (int i = 0; i < len; i++) {
    span[i] = pixels[indices[i]];
    keys[i] = sortKey(span[i]);
  }
  insertionSort(span, keys, len, ascending);
  for (int i = 0; i < len; i++) {
    pixels[indices[i]] = span[i];
  }
}

void sortSpan(int[] pixels, int offset, int len, boolean ascending) {
  float[] keys = new float[len];
  for (int i = 0; i < len; i++) {
    keys[i] = sortKey(pixels[offset + i]);
  }
  for (int i = 1; i < len; i++) {
    int   tempC = pixels[offset + i];
    float tempK = keys[i];
    int j = i - 1;
    while (j >= 0 && (ascending ? keys[j] > tempK : keys[j] < tempK)) {
      pixels[offset + j + 1] = pixels[offset + j];
      keys[j + 1] = keys[j];
      j--;
    }
    pixels[offset + j + 1] = tempC;
    keys[j + 1] = tempK;
  }
}

void insertionSort(int[] span, float[] keys, int len, boolean ascending) {
  for (int i = 1; i < len; i++) {
    int   tempC = span[i];
    float tempK = keys[i];
    int j = i - 1;
    while (j >= 0 && (ascending ? keys[j] > tempK : keys[j] < tempK)) {
      span[j + 1] = span[j];
      keys[j + 1] = keys[j];
      j--;
    }
    span[j + 1] = tempC;
    keys[j + 1] = tempK;
  }
}

// ================================================================
//  GLITCH EFFECTS
// ================================================================

void channelShift(int[] pixels, int shiftX, int shiftY) {
  int[] shifted = new int[pixels.length];
  arrayCopy(pixels, shifted);

  for (int y = 0; y < targetHeight; y++) {
    for (int x = 0; x < targetWidth; x++) {
      int idx = y * targetWidth + x;
      int srcRx = constrain(x + shiftX, 0, targetWidth - 1);
      int srcRy = constrain(y + shiftY, 0, targetHeight - 1);
      int srcBx = constrain(x - shiftX, 0, targetWidth - 1);
      int srcBy = constrain(y - shiftY, 0, targetHeight - 1);

      int r = (pixels[srcRy * targetWidth + srcRx] >> 16) & 0xFF;
      int g = (pixels[idx] >> 8) & 0xFF;
      int b =  pixels[srcBy * targetWidth + srcBx] & 0xFF;
      shifted[idx] = 0xFF000000 | (r << 16) | (g << 8) | b;
    }
  }
  arrayCopy(shifted, pixels);
}

void displaceRow(int[] pixels, int y, int shift) {
  if (y < 0 || y >= targetHeight || shift == 0) return;
  int start = y * targetWidth;
  int[] row = new int[targetWidth];
  for (int x = 0; x < targetWidth; x++) {
    row[x] = pixels[start + constrain(x + shift, 0, targetWidth - 1)];
  }
  arrayCopy(row, 0, pixels, start, targetWidth);
}

// ================================================================
//  JPEG OUTPUT
// ================================================================
void saveJPEG(PGraphics pg, String filePath, float quality) {
  try {
    // Build BufferedImage from pixel data (works for both JAVA2D and P2D)
    pg.loadPixels();
    BufferedImage rgb = new BufferedImage(pg.width, pg.height, BufferedImage.TYPE_INT_RGB);
    rgb.setRGB(0, 0, pg.width, pg.height, pg.pixels, 0, pg.width);

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
