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

// ================================================================
//  SONG STRUCTURE (seconds)
// ================================================================
float INTRO_END     = 31;
float V1_START      = 31,  V1_END      = 42;
float V2_START      = 43,  V2_END      = 52;
float V3_START      = 53,  V3_END      = 65;
float PRE_START     = 66,  PRE_END     = 74;
float CHORUS_START  = 77,  CHORUS_SWELL = 95;
float WHISPER_START = 104;
float VIOLIN_START  = 114, VIOLIN_CRESC = 126, VIOLIN_QUIET = 132;
float PIANO_START   = 139;

// ================================================================
//  MULTI-IMAGE
// ================================================================
int numImages = 0;
int[][] imagePixels;
int[] source;
PImage sourceFrame;

// ================================================================
//  PARTICLE SYSTEM
// ================================================================
int MAX_PARTICLES = 2500;
float[] px, py, pvx, pvy;
float[] plife, pmaxLife, psize;
int[] ptype;   // 0=ash 1=star 2=ember
int[] pr, pg2, pb; // color components
int particleCount = 0;

// ================================================================
//  SETTINGS / SETUP
// ================================================================

void settings() {
  if (args != null && args.length >= 4) {
    targetWidth = Integer.parseInt(args[2]);
    targetHeight = Integer.parseInt(args[3]);
    size(1, 1, P2D);
  } else {
    targetWidth = 400; targetHeight = 500;
    size(400, 500, P2D);
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
    if (args.length >= 8) imageArg = args[7];
  } else {
    println("Error: insufficient arguments");
    exit(); return;
  }

  if (imageArg == null || imageArg.isEmpty()) {
    println("Error: image path(s) required for elegy sketch");
    exit(); return;
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
      exit(); return;
    }
    img.resize(targetWidth, targetHeight);
    img.loadPixels();
    arrayCopy(img.pixels, imagePixels[i]);
    println("Loaded image " + (i+1) + "/" + numImages + ": " + imagePaths[i].trim());
  }

  source = new int[totalPx];
  sourceFrame = createImage(targetWidth, targetHeight, ARGB);

  // Init particles
  px = new float[MAX_PARTICLES];
  py = new float[MAX_PARTICLES];
  pvx = new float[MAX_PARTICLES];
  pvy = new float[MAX_PARTICLES];
  plife = new float[MAX_PARTICLES];
  pmaxLife = new float[MAX_PARTICLES];
  psize = new float[MAX_PARTICLES];
  ptype = new int[MAX_PARTICLES];
  pr = new int[MAX_PARTICLES];
  pg2 = new int[MAX_PARTICLES];
  pb = new int[MAX_PARTICLES];

  analysisData = loadJSONObject(analysisPath);
  framesArray = analysisData.getJSONArray("frames");
  if (targetFrameCount == 0) {
    targetFrameCount = analysisData.getInt("frameCount");
  }

  canvas = createGraphics(targetWidth, targetHeight, P2D);
  shader = loadShader("elegy.frag");
  frameRate(1000);
}

// ================================================================
//  IMAGE BLENDING — timeline-based crossfades
// ================================================================

void buildSource(float time) {
  if (numImages == 1) {
    arrayCopy(imagePixels[0], source);
    return;
  }

  if (numImages == 2) {
    // Image a for intro/V1, crossfade to b during V2
    if (time < V2_START) {
      arrayCopy(imagePixels[0], source);
    } else if (time < V2_END) {
      float t = smoothstepF((time - V2_START) / (V2_END - V2_START));
      blendImages(imagePixels[0], imagePixels[1], t);
    } else {
      arrayCopy(imagePixels[1], source);
    }
    return;
  }

  // 3+ images: a during intro/V1, crossfade to b in V2, crossfade to c in V3
  if (time < V2_START) {
    arrayCopy(imagePixels[0], source);
  } else if (time < V2_END) {
    float t = smoothstepF((time - V2_START) / (V2_END - V2_START));
    blendImages(imagePixels[0], imagePixels[1], t);
  } else if (time < V3_START) {
    arrayCopy(imagePixels[1], source);
  } else if (time < V3_END) {
    float t = smoothstepF((time - V3_START) / (V3_END - V3_START));
    blendImages(imagePixels[1], imagePixels[min(2, numImages - 1)], t);
  } else {
    arrayCopy(imagePixels[min(2, numImages - 1)], source);
  }
}

void blendImages(int[] a, int[] b, float t) {
  for (int i = 0; i < source.length; i++) {
    int ar = (a[i] >> 16) & 0xFF, ag = (a[i] >> 8) & 0xFF, ab = a[i] & 0xFF;
    int br = (b[i] >> 16) & 0xFF, bg = (b[i] >> 8) & 0xFF, bb = b[i] & 0xFF;
    int r = (int)lerp(ar, br, t);
    int g = (int)lerp(ag, bg, t);
    int bl = (int)lerp(ab, bb, t);
    source[i] = 0xFF000000 | (r << 16) | (g << 8) | bl;
  }
}

float smoothstepF(float t) {
  t = constrain(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// ================================================================
//  TIMELINE → SHADER PARAMETERS
// ================================================================

float getDissolve(float time, float energy) {
  float d;
  if      (time < INTRO_END)    d = 0;
  else if (time < V1_END)       d = 0;
  else if (time < V2_END)       d = map(time, V2_START, V2_END, 0, 0.05);
  else if (time < V3_END)       d = map(time, V3_START, V3_END, 0.05, 0.2);
  else if (time < PRE_END)      d = map(time, PRE_START, PRE_END, 0.2, 0.35);
  else if (time < CHORUS_SWELL) d = map(time, CHORUS_START, CHORUS_SWELL, 0.35, 0.55);
  else if (time < WHISPER_START)d = map(time, CHORUS_SWELL, WHISPER_START, 0.55, 0.75);
  else if (time < VIOLIN_START) d = map(time, WHISPER_START, VIOLIN_START, 0.75, 0.5);  // pulls back
  else if (time < VIOLIN_CRESC) d = map(time, VIOLIN_START, VIOLIN_CRESC, 0.5, 0.7);
  else if (time < VIOLIN_QUIET) d = map(time, VIOLIN_CRESC, VIOLIN_QUIET, 0.7, 0.9);
  else if (time < PIANO_START)  d = map(time, VIOLIN_QUIET, PIANO_START, 0.9, 0.85);
  else                          d = map(time, PIANO_START, PIANO_START + 20, 0.85, 0.95);
  return constrain(d + energy * 0.03, 0, 1);
}

float getWarmth(float time, float energy) {
  float w;
  if      (time < V2_START)     w = 0;
  else if (time < V2_END)       w = map(time, V2_START, V2_END, 0, 0.05);
  else if (time < V3_END)       w = map(time, V3_START, V3_END, 0.05, 0.15);
  else if (time < PRE_END)      w = map(time, PRE_START, PRE_END, 0.15, 0.35);
  else if (time < CHORUS_SWELL) w = map(time, CHORUS_START, CHORUS_SWELL, 0.35, 0.65);
  else if (time < WHISPER_START)w = map(time, CHORUS_SWELL, WHISPER_START, 0.65, 0.9);
  else if (time < VIOLIN_START) w = map(time, WHISPER_START, VIOLIN_START, 0.9, 0.5);  // cools
  else if (time < VIOLIN_CRESC) w = map(time, VIOLIN_START, VIOLIN_CRESC, 0.5, 0.8);
  else if (time < VIOLIN_QUIET) w = map(time, VIOLIN_CRESC, VIOLIN_QUIET, 0.8, 1.0);
  else if (time < PIANO_START)  w = map(time, VIOLIN_QUIET, PIANO_START, 1.0, 0.6);
  else                          w = map(time, PIANO_START, PIANO_START + 20, 0.6, 0.3);
  return constrain(w + energy * 0.05, 0, 1);
}

float getDisplacement(float time, float energy) {
  float d;
  if      (time < INTRO_END)    d = 0.005;
  else if (time < V1_END)       d = 0.008;
  else if (time < V2_END)       d = 0.012;
  else if (time < V3_END)       d = map(time, V3_START, V3_END, 0.012, 0.025);
  else if (time < PRE_END)      d = 0.03;
  else if (time < CHORUS_SWELL) d = 0.035;
  else if (time < WHISPER_START)d = 0.05;
  else if (time < VIOLIN_START) d = map(time, WHISPER_START, VIOLIN_START, 0.05, 0.015);
  else if (time < VIOLIN_CRESC) d = map(time, VIOLIN_START, VIOLIN_CRESC, 0.015, 0.045);
  else if (time < VIOLIN_QUIET) d = map(time, VIOLIN_CRESC, VIOLIN_QUIET, 0.045, 0.06);
  else if (time < PIANO_START)  d = map(time, VIOLIN_QUIET, PIANO_START, 0.06, 0.02);
  else                          d = map(time, PIANO_START, PIANO_START + 20, 0.02, 0.008);
  return d + energy * 0.01;
}

float getEdgeGlow(float time) {
  if      (time < V3_START)     return 0;
  else if (time < V3_END)       return map(time, V3_START, V3_END, 0, 0.3);
  else if (time < PRE_END)      return map(time, PRE_START, PRE_END, 0.3, 0.6);
  else if (time < WHISPER_START)return map(time, CHORUS_START, WHISPER_START, 0.6, 1.0);
  else if (time < VIOLIN_START) return map(time, WHISPER_START, VIOLIN_START, 1.0, 0.4);
  else if (time < VIOLIN_QUIET) return map(time, VIOLIN_START, VIOLIN_QUIET, 0.4, 1.0);
  else if (time < PIANO_START)  return map(time, VIOLIN_QUIET, PIANO_START, 1.0, 0.5);
  else                          return map(time, PIANO_START, PIANO_START + 20, 0.5, 0.2);
}

float getLightIntensity(float time) {
  if      (time < PRE_START)    return 0;
  else if (time < CHORUS_START) return map(time, PRE_START, CHORUS_START, 0, 0.15);
  else if (time < CHORUS_SWELL) return map(time, CHORUS_START, CHORUS_SWELL, 0.15, 0.3);
  else if (time < WHISPER_START)return map(time, CHORUS_SWELL, WHISPER_START, 0.3, 0.5);
  else if (time < VIOLIN_START) return map(time, WHISPER_START, VIOLIN_START, 0.5, 0.1);
  else if (time < VIOLIN_CRESC) return map(time, VIOLIN_START, VIOLIN_CRESC, 0.1, 0.4);
  else if (time < VIOLIN_QUIET) return map(time, VIOLIN_CRESC, VIOLIN_QUIET, 0.4, 0.55);
  else if (time < PIANO_START)  return map(time, VIOLIN_QUIET, PIANO_START, 0.55, 0.25);
  else                          return map(time, PIANO_START, PIANO_START + 20, 0.25, 0.08);
}

float getZoom(float time) {
  // Very slow push-in toward the boy over the entire song
  // 1.0 = no zoom, ends around 1.18 = 18% closer
  float songEnd = PIANO_START + 20;
  float t = constrain(time / songEnd, 0, 1);
  // Ease-in: starts imperceptibly slow, accelerates slightly
  t = t * t * (3 - 2 * t); // smoothstep
  return 1.0 + t * 0.18;
}

// ================================================================
//  PARTICLES
// ================================================================

void spawnParticle(float x, float y, float vx, float vy,
                   float life, float sz, int type, int r, int g, int b) {
  if (particleCount >= MAX_PARTICLES) return;
  int i = particleCount;
  px[i] = x;  py[i] = y;
  pvx[i] = vx; pvy[i] = vy;
  plife[i] = life; pmaxLife[i] = life;
  psize[i] = sz;
  ptype[i] = type;
  pr[i] = r; pg2[i] = g; pb[i] = b;
  particleCount++;
}

void spawnAsh(int count, float dissolve) {
  for (int i = 0; i < count; i++) {
    float angle = random(TWO_PI);
    float minD = max(0.05, 0.45 - dissolve * 0.5);
    float maxD = min(0.65, 0.55 - dissolve * 0.2);
    if (maxD < minD) maxD = minD + 0.1;
    float dist = random(minD, maxD);
    float x = targetWidth * 0.5 + cos(angle) * dist * targetWidth;
    float y = targetHeight * 0.6 + sin(angle) * dist * targetHeight * 0.8;
    int gray = (int)random(170, 250);
    spawnParticle(x, y, random(-0.3, 0.3), random(-1.2, -0.2),
                  random(60, 200), random(1, 2.5), 0, gray, gray, gray);
  }
}

void spawnStars(int count) {
  for (int i = 0; i < count; i++) {
    spawnParticle(random(targetWidth), random(-30, -5),
                  random(-0.3, 0.3), random(0.8, 2.5),
                  random(100, 250), random(1.5, 4), 1, 255, 255, 255);
  }
}

void spawnEmbers(int count, float intensity) {
  for (int i = 0; i < count; i++) {
    float x = random(targetWidth * 0.15, targetWidth * 0.85);
    float y = random(targetHeight * 0.35, targetHeight * 0.95);
    int r = 255;
    int g = (int)random(140, 210);
    int b = (int)random(30, 90);
    spawnParticle(x, y, random(-0.4, 0.4), random(-2.0, -0.4),
                  random(100, 280), random(1.5, 4.5) * (0.7 + intensity * 0.5),
                  2, r, g, b);
  }
}

void updateParticles() {
  int w = 0;
  for (int i = 0; i < particleCount; i++) {
    plife[i]--;
    if (plife[i] <= 0) continue;

    px[i] += pvx[i];
    py[i] += pvy[i];

    if (ptype[i] == 0) {       // ash: gentle drift
      pvx[i] += random(-0.015, 0.015);
      pvy[i] -= 0.003;
    } else if (ptype[i] == 1) { // star: slow fall
      pvy[i] += 0.008;
    } else {                    // ember: upward drift
      pvx[i] += random(-0.02, 0.02);
      pvy[i] -= 0.008;
      pvx[i] *= 0.995;
    }

    if (px[i] < -30 || px[i] > targetWidth + 30 ||
        py[i] < -40 || py[i] > targetHeight + 30) continue;

    // Compact
    if (w != i) {
      px[w]=px[i]; py[w]=py[i]; pvx[w]=pvx[i]; pvy[w]=pvy[i];
      plife[w]=plife[i]; pmaxLife[w]=pmaxLife[i]; psize[w]=psize[i];
      ptype[w]=ptype[i]; pr[w]=pr[i]; pg2[w]=pg2[i]; pb[w]=pb[i];
    }
    w++;
  }
  particleCount = w;
}

void drawParticles(PGraphics pg) {
  pg.colorMode(RGB, 255);
  for (int i = 0; i < particleCount; i++) {
    float ratio = plife[i] / pmaxLife[i];
    float alpha;
    if (ratio > 0.85)     alpha = map(ratio, 0.85, 1.0, 1.0, 0.0);
    else if (ratio < 0.3) alpha = map(ratio, 0, 0.3, 0.0, 1.0);
    else                  alpha = 1.0;

    if (ptype[i] == 1) {
      // Star: glow halo + bright core
      pg.noStroke();
      pg.fill(pr[i], pg2[i], pb[i], (int)(alpha * 35));
      pg.ellipse(px[i], py[i], psize[i] * 4, psize[i] * 4);
      pg.fill(pr[i], pg2[i], pb[i], (int)(alpha * 220));
      pg.ellipse(px[i], py[i], psize[i], psize[i]);
    } else if (ptype[i] == 2) {
      // Ember: warm glow + core
      pg.noStroke();
      pg.fill(pr[i], pg2[i], pb[i], (int)(alpha * 25));
      pg.ellipse(px[i], py[i], psize[i] * 3, psize[i] * 3);
      pg.fill(pr[i], pg2[i], pb[i], (int)(alpha * 180));
      pg.ellipse(px[i], py[i], psize[i], psize[i]);
    } else {
      // Ash: simple dot
      pg.stroke(pr[i], pg2[i], pb[i], (int)(alpha * 130));
      pg.strokeWeight(psize[i]);
      pg.point(px[i], py[i]);
    }
  }
  pg.noStroke();
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

    float time = currentFrame / targetFps;

    // --- Build source image ---
    buildSource(time);
    sourceFrame.loadPixels();
    arrayCopy(source, sourceFrame.pixels);
    sourceFrame.updatePixels();

    // --- Compute timeline parameters ---
    float dissolve   = getDissolve(time, energy);
    float warmth     = getWarmth(time, energy);
    float displace   = getDisplacement(time, energy);
    float edgeGlow   = getEdgeGlow(time);
    float lightInt   = getLightIntensity(time);
    float zoom       = getZoom(time);

    // --- Render: image + shader ---
    canvas.beginDraw();
    canvas.background(0);
    canvas.image(sourceFrame, 0, 0);

    shader.set("u_time", time);
    shader.set("u_dissolve", dissolve);
    shader.set("u_warmth", warmth);
    shader.set("u_displace", displace);
    shader.set("u_edgeGlow", edgeGlow);
    shader.set("u_lightIntensity", lightInt);
    shader.set("u_zoom", zoom);
    shader.set("u_bass", bass);
    shader.set("u_energy", energy);

    canvas.filter(shader);

    // --- Particles on top ---
    updateParticles();

    // Spawn based on song section
    if (time >= V1_START && time < V2_START) {
      // V1: very sparse ash
      if (random(1) < 0.15) spawnAsh(1, dissolve);
    }
    else if (time >= V2_START && time < V3_START) {
      // V2: growing ash
      if (random(1) < 0.3) spawnAsh((int)(1 + energy * 2), dissolve);
    }
    else if (time >= V3_START && time < PRE_START) {
      // V3: "all the stars fell down" — stars + ash
      spawnAsh((int)(2 + energy * 3), dissolve);
      if (random(1) < 0.4) spawnStars((int)(1 + energy * 2));
    }
    else if (time >= PRE_START && time < CHORUS_START) {
      // Prechorus: more ash, embers start
      spawnAsh((int)(3 + energy * 3), dissolve);
      if (random(1) < 0.3) spawnEmbers(1, energy);
    }
    else if (time >= CHORUS_START && time < WHISPER_START) {
      // Chorus + swell: heavy embers
      spawnAsh((int)(3 + energy * 4), dissolve);
      float emberRate = (time >= CHORUS_SWELL) ? 0.8 : 0.5;
      if (random(1) < emberRate) {
        int count = (time >= CHORUS_SWELL) ? (int)(3 + energy * 4) : (int)(2 + energy * 2);
        spawnEmbers(count, energy);
      }
    }
    else if (time >= WHISPER_START && time < VIOLIN_START) {
      // Whisper: gentle, sparse — moment of clarity
      if (random(1) < 0.15) spawnAsh(1, dissolve);
      if (random(1) < 0.08) spawnEmbers(1, 0.3);
    }
    else if (time >= VIOLIN_START && time < VIOLIN_QUIET) {
      // Violin: rebuilds to crescendo
      float violinIntensity = (time < VIOLIN_CRESC)
        ? map(time, VIOLIN_START, VIOLIN_CRESC, 0.3, 1.0)
        : map(time, VIOLIN_CRESC, VIOLIN_QUIET, 1.0, 0.5);
      spawnAsh((int)(2 + violinIntensity * 4), dissolve);
      if (random(1) < violinIntensity * 0.6) {
        spawnEmbers((int)(1 + violinIntensity * 3), violinIntensity);
      }
    }
    else if (time >= PIANO_START) {
      // Piano ending: last embers fading
      if (random(1) < 0.08) spawnAsh(1, dissolve);
      if (random(1) < 0.03) spawnEmbers(1, 0.2);
    }

    drawParticles(canvas);
    canvas.endDraw();

    saveJPEG(canvas, framesDir + "/frame-" + nf(currentFrame + 1, 6) + ".jpg", jpegQuality);
    println("FRAME:" + (currentFrame + 1) + "/" + targetFrameCount);
  }

  println("DONE");
  exit();
}

// ================================================================
//  JPEG OUTPUT
// ================================================================

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
