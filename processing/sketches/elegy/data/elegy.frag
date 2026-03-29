#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D texture;
varying vec4 vertTexCoord;

uniform float u_time;
uniform float u_dissolve;       // 0 = intact, 1 = fully gone
uniform float u_warmth;         // 0 = cold B&W, 1 = full amber
uniform float u_displace;       // displacement strength
uniform float u_edgeGlow;       // glow at dissolve boundary
uniform float u_lightIntensity; // radial blast light
uniform float u_zoom;           // 1.0 = no zoom, >1.0 = push in

// Audio
uniform float u_bass, u_energy;

// ---- Noise ----

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1, 0)), f.x),
        mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// ---- Main ----

void main() {
    vec2 uv = vertTexCoord.st;

    // --- Slow zoom toward the boy ---
    vec2 zoomCenter = vec2(0.5, 0.6);
    uv = (uv - zoomCenter) / u_zoom + zoomCenter;

    // --- Displacement (cloud breathing) ---
    float upperFactor = smoothstep(0.7, 0.15, uv.y);
    float dn1 = fbm(uv * 3.0 + u_time * 0.06);
    float dn2 = fbm(uv * 3.0 + u_time * 0.06 + 100.0);
    vec2 disp = (vec2(dn1, dn2) - 0.5) * u_displace * upperFactor;
    disp *= 1.0 + u_bass * 0.3;

    vec2 dispUV = clamp(uv + disp, 0.0, 1.0);

    // --- Sample ---
    vec4 col = texture2D(texture, dispUV);

    // --- Dissolve ---
    float dissolveNoise = fbm(uv * 5.0 + u_time * 0.025);

    // Protect center — boy at roughly (0.5, 0.65)
    float centerDist = length((uv - vec2(0.5, 0.65)) * vec2(1.0, 0.7));
    float protect = smoothstep(0.0, 0.35, centerDist);

    float threshold = dissolveNoise * 0.5 + protect * 0.5;

    float edgeW = 0.07;
    float visible = smoothstep(u_dissolve - edgeW * 0.5, u_dissolve + edgeW * 0.5, threshold);

    float atEdge = smoothstep(u_dissolve - edgeW, u_dissolve - edgeW * 0.25, threshold)
                 * (1.0 - smoothstep(u_dissolve + edgeW * 0.25, u_dissolve + edgeW, threshold));

    vec3 edgeColor = vec3(1.0, 0.65, 0.25) * atEdge * u_edgeGlow * 2.5;

    // --- Color grading ---
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bw = vec3(gray);
    vec3 warm = vec3(
        gray * 1.3 + 0.02,
        gray * 0.92,
        gray * 0.55
    );
    vec3 graded = mix(bw, warm, u_warmth);
    graded = smoothstep(vec3(0.0), vec3(1.0), graded * 1.05);

    // --- Compose ---
    vec3 burnThrough = bw * vec3(1.5, 1.05, 0.5) + vec3(0.12, 0.06, 0.01);
    burnThrough = clamp(burnThrough, 0.0, 1.0);
    vec3 result = mix(burnThrough, graded, visible) + edgeColor;

    // --- Radial blast light ---
    vec2 blastCenter = vec2(0.5, 0.32);
    float blastDist = length(uv - blastCenter);
    float lightFall = exp(-blastDist * 3.0);
    vec3 blastLight = vec3(1.0, 0.82, 0.45) * lightFall * u_lightIntensity;
    result += blastLight;
    // --- Film grain ---
    float grain = (hash(uv * 800.0 + u_time * 37.0) - 0.5) * 0.025;
    result += grain;

    // --- Vignette ---
    float vig = 1.0 - dot(vertTexCoord.st - 0.5, vertTexCoord.st - 0.5) * 1.8;
    result *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
