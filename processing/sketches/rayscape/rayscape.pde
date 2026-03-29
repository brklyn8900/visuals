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

  if (args != null && args.length >= 7) {
    analysisPath = args[0];
    framesDir = args[1];
    targetFps = Float.parseFloat(args[4]);
    jpegQuality = Float.parseFloat(args[5]) / 100.0;
    targetFrameCount = Integer.parseInt(args[6]);
  } else {
    println("Error: insufficient arguments");
    exit();
    return;
  }

  analysisData = loadJSONObject(analysisPath);
  framesArray = analysisData.getJSONArray("frames");
  if (targetFrameCount == 0) {
    targetFrameCount = analysisData.getInt("frameCount");
  }

  canvas = createGraphics(targetWidth, targetHeight, P2D);
  shader = loadShader("rayscape.frag", "rayscape.vert");
  frameRate(1000);
}

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

    canvas.beginDraw();
    canvas.shader(shader);

    shader.set("u_resolution", (float)targetWidth, (float)targetHeight);
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

    canvas.rect(0, 0, targetWidth, targetHeight);
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
