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
PShader shader;
int currentFrame = 0;
boolean rendered = false;

// -- Multi-image --
int numImages = 0;
int[][] imagePixels;
float crossfadeZone = 0.12;
int[] source;
PImage sourceFrame;

void settings() {
  if (args != null && args.length >= 4) {
    targetWidth = Integer.parseInt(args[2]);
    targetHeight = Integer.parseInt(args[3]);
    size(1, 1, P2D);
  } else {
    targetWidth = 400;
    targetHeight = 400;
    size(400, 400, P2D);
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
    println("Error: image path(s) required for kaleidoscope sketch");
    exit();
    return;
  }

  // Load images
  String[] imagePaths = imageArg.split(",");
  numImages = imagePaths.length;
  int totalPx = targetWidth * targetHeight;
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

  source = new int[totalPx];
  sourceFrame = createImage(targetWidth, targetHeight, ARGB);

  analysisData = loadJSONObject(analysisPath);
  framesArray = analysisData.getJSONArray("frames");
  if (targetFrameCount == 0) {
    targetFrameCount = analysisData.getInt("frameCount");
  }

  canvas = createGraphics(targetWidth, targetHeight, P2D);
  shader = loadShader("kaleidoscope.frag");
  frameRate(1000);
}

// ================================================================
//  IMAGE BLENDING
// ================================================================

void buildSource(float progress) {
  if (numImages == 1) {
    arrayCopy(imagePixels[0], source);
    return;
  }

  float segLen = 1.0 / numImages;
  float pos = progress / segLen;
  int idx = constrain(floor(pos), 0, numImages - 1);
  int nextIdx = min(idx + 1, numImages - 1);
  float segProgress = pos - idx;

  if (idx == nextIdx || segProgress < (1.0 - crossfadeZone)) {
    arrayCopy(imagePixels[idx], source);
  } else {
    float blend = map(segProgress, 1.0 - crossfadeZone, 1.0, 0, 1);
    blend = constrain(blend, 0, 1);
    blend = blend * blend * (3 - 2 * blend); // smoothstep

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
    float energy   = (sub + bass + lowMid + mid + highMid + presence + air) / 7.0;

    float time     = currentFrame / targetFps;
    float progress = (float) currentFrame / max(1, targetFrameCount - 1);

    // Build blended source image for this frame
    buildSource(progress);
    sourceFrame.loadPixels();
    arrayCopy(source, sourceFrame.pixels);
    sourceFrame.updatePixels();

    // Draw source image, then apply kaleidoscope filter
    canvas.beginDraw();
    canvas.image(sourceFrame, 0, 0);

    shader.set("u_time", time);
    shader.set("u_progress", progress);
    shader.set("u_sub", sub);
    shader.set("u_bass", bass);
    shader.set("u_lowMid", lowMid);
    shader.set("u_mid", mid);
    shader.set("u_highMid", highMid);
    shader.set("u_presence", presence);
    shader.set("u_air", air);
    shader.set("u_kick", kick);
    shader.set("u_snare", snare);
    shader.set("u_hat", hat);
    shader.set("u_energy", energy);

    canvas.filter(shader);
    canvas.endDraw();

    saveJPEG(canvas, framesDir + "/frame-" + nf(currentFrame + 1, 6) + ".jpg", jpegQuality);
    println("FRAME:" + (currentFrame + 1) + "/" + targetFrameCount);
  }

  println("DONE");
  exit();
}

void saveJPEG(PGraphics pg, String filePath, float quality) {
  try {
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
