#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_progress;
uniform float u_sub, u_bass, u_lowMid, u_mid, u_highMid, u_presence, u_air;
uniform float u_kick, u_snare, u_hat;
uniform float u_energy;

#define MAX_STEPS 80
#define MAX_DIST 25.0
#define SURF_DIST 0.002

// ---- Utilities ----

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// iq's cosine palette — shift parameter evolves the colors over the song
vec3 palette(float t, float shift) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 c = vec3(1.0);
    vec3 d = vec3(0.263 + shift * 0.2, 0.416 + shift * 0.1, 0.557 - shift * 0.15);
    return a + b * cos(6.28318 * (c * t + d));
}

// ---- Noise ----

float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 397.297, 491.187));
    p += dot(p, p.zyx + 19.19);
    return fract(p.x * p.y * p.z);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
            mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
            mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// ---- SDF Primitives ----

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ---- Scene ----

float scene(vec3 p) {
    // Rotation driven by mid + time
    float rotSpeed = 0.2 + u_mid * 0.3;
    p.xz *= rot(u_time * rotSpeed);
    p.xy *= rot(u_time * rotSpeed * 0.7 + u_snare * 0.4);

    // Morph cycles through 4 shapes over the song
    float morphT = u_progress * 4.0;
    float phase = mod(morphT, 4.0);

    // Bass + kick pulse
    float pulse = 1.0 + u_bass * 0.25 + u_kick * 0.35;

    // Shape SDFs
    float sphere = sdSphere(p, 1.0 * pulse);
    float octa   = sdOctahedron(p, 1.3 * pulse);
    float torus  = sdTorus(p, vec2(1.0 * pulse, 0.3 * pulse));
    float box    = sdBox(p, vec3(0.8 * pulse));

    // Smooth morph between shapes
    float d;
    if (phase < 1.0)      d = mix(sphere, octa,   smoothstep(0.2, 0.8, phase));
    else if (phase < 2.0) d = mix(octa,   torus,  smoothstep(1.2, 1.8, phase));
    else if (phase < 3.0) d = mix(torus,  box,    smoothstep(2.2, 2.8, phase));
    else                  d = mix(box,    sphere, smoothstep(3.2, 3.8, phase));

    // Surface displacement — high frequencies add detail
    float disp = fbm(p * 2.5 + u_time * 0.3) * (0.04 + u_highMid * 0.15 + u_presence * 0.1);
    d += disp;

    // Orbiting satellites
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float angle = fi * 1.2566 + u_time * (0.35 + u_mid * 0.2);
        float radius = 2.2 + sin(u_time * 0.3 + fi * 1.7) * 0.5;
        vec3 orbPos = vec3(
            cos(angle) * radius,
            sin(fi * 2.0 + u_time * 0.5) * 0.7,
            sin(angle) * radius
        );
        float orbSize = 0.1 + u_energy * 0.08 + u_hat * 0.12;
        d = smin(d, sdSphere(p - orbPos, orbSize), 0.25 + u_bass * 0.25);
    }

    // Kick shockwave ring
    if (u_kick > 0.3) {
        float ringR = abs(length(p.xz) - 1.8 - u_kick * 2.0) - 0.04;
        float ringY = abs(p.y) - 0.08;
        d = min(d, max(ringR, ringY));
    }

    return d;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(
        scene(p + e.xyy) - scene(p - e.xyy),
        scene(p + e.yxy) - scene(p - e.yxy),
        scene(p + e.yyx) - scene(p - e.yyx)
    ));
}

// ---- Main ----

void main() {
    vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

    // Camera orbits the scene
    float camDist = 4.5 - u_bass * 0.5;
    float camAngle = u_time * 0.12 + u_progress * 2.0;
    vec3 ro = vec3(
        cos(camAngle) * camDist,
        1.2 + sin(u_time * 0.2) * 0.5,
        sin(camAngle) * camDist
    );

    // Look-at camera
    vec3 fwd = normalize(-ro);
    vec3 right = normalize(cross(vec3(0, 1, 0), fwd));
    vec3 up = cross(fwd, right);
    vec3 rd = normalize(fwd + uv.x * right + uv.y * up);

    // Raymarch
    float t = 0.0;
    float glow = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        float d = scene(p);
        glow += 0.012 / (0.01 + d * d);
        if (d < SURF_DIST || t > MAX_DIST) break;
        t += d * 0.8;
    }

    // Palette shift over song
    float palShift = u_progress * 2.0;

    // Background — dark with subtle energy-driven color
    vec3 bg = vec3(0.015, 0.008, 0.03) + palette(uv.y * 0.5 + 0.5, palShift) * u_energy * 0.02;
    vec3 col = bg;

    if (t < MAX_DIST) {
        vec3 p = ro + rd * t;
        vec3 n = getNormal(p);

        // Diffuse + rim lighting
        vec3 lightDir = normalize(vec3(1.0, 2.0, -1.0));
        float diff = max(dot(n, lightDir), 0.0);
        float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

        // Material from palette
        float matT = length(p) * 0.3 + u_time * 0.08 + u_progress;
        vec3 matCol = palette(matT, palShift);

        // Rim glow
        vec3 rim = palette(fres + u_time * 0.05, palShift + 0.5) * fres * 1.5;

        col = matCol * (diff * 0.6 + 0.15) + rim + matCol * 0.08;
        col *= 1.0 + u_kick * 0.5;

        // Depth fog
        float fog = exp(-t * 0.08);
        col = mix(bg, col, fog);
    }

    // Volumetric glow
    vec3 glowCol = palette(u_time * 0.04 + 0.5, palShift) * glow * 0.12;
    glowCol *= 1.0 + u_energy * 0.6;
    col += glowCol;

    // Kick flash
    col += vec3(1.0, 0.9, 0.8) * u_kick * 0.08;

    // Snare color burst
    col += palette(u_time * 0.1, palShift + 1.0) * u_snare * 0.06;

    // Tone mapping (Reinhard)
    col = col / (col + vec3(1.0));
    col = pow(col, vec3(0.85));

    // Vignette
    vec2 vigUV = gl_FragCoord.xy / u_resolution;
    float vig = 1.0 - dot(vigUV - 0.5, vigUV - 0.5) * 1.8;
    col *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
}
