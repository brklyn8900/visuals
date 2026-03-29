#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D u_before;  // starting image (boy without clouds)
uniform sampler2D u_after;   // revealed image (boy with clouds)
varying vec2 vTexCoord;

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
    vec2 uv = vTexCoord;

    // --- Slow zoom toward the boy ---
    vec2 zoomCenter = vec2(0.5, 0.6);
    uv = (uv - zoomCenter) / u_zoom + zoomCenter;

    // --- Displacement (cloud breathing) — only on upper half ---
    float upperFactor = smoothstep(0.7, 0.15, uv.y);
    float dn1 = fbm(uv * 3.0 + u_time * 0.06);
    float dn2 = fbm(uv * 3.0 + u_time * 0.06 + 100.0);
    vec2 disp = (vec2(dn1, dn2) - 0.5) * u_displace * upperFactor;
    disp *= 1.0 + u_bass * 0.3;

    vec2 dispUV = clamp(uv + disp, 0.0, 1.0);

    // --- Sample both layers ---
    vec4 beforeCol = texture2D(u_before, dispUV);
    vec4 afterCol  = texture2D(u_after, dispUV);

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

    // --- Grade the "before" layer (cold B&W → warm amber) ---
    float grayBefore = dot(beforeCol.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bwBefore = vec3(grayBefore);
    vec3 warmBefore = vec3(
        grayBefore * 1.3 + 0.02,
        grayBefore * 0.92,
        grayBefore * 0.55
    );
    vec3 gradedBefore = mix(bwBefore, warmBefore, u_warmth);
    gradedBefore = smoothstep(vec3(0.0), vec3(1.0), gradedBefore * 1.05);

    // --- Grade the "after" layer (revealed with warmth) ---
    float grayAfter = dot(afterCol.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bwAfter = vec3(grayAfter);
    vec3 warmAfter = vec3(
        grayAfter * 1.4 + 0.03,
        grayAfter * 0.95,
        grayAfter * 0.5
    );
    // After layer always has some warmth — it's the apocalypse revealed
    vec3 gradedAfter = mix(bwAfter, warmAfter, max(u_warmth, 0.3));
    gradedAfter = smoothstep(vec3(0.0), vec3(1.0), gradedAfter * 1.05);

    // --- Compose: before dissolves to reveal after ---
    // visible=1 → before (no clouds), visible=0 → after (clouds)
    vec3 result = mix(gradedAfter, gradedBefore, visible) + edgeColor;

    // --- Radial blast light (from where the cloud appears) ---
    vec2 blastCenter = vec2(0.5, 0.32);
    float blastDist = length(uv - blastCenter);
    float lightFall = exp(-blastDist * 3.0);
    vec3 blastLight = vec3(1.0, 0.82, 0.45) * lightFall * u_lightIntensity;
    result += blastLight;

    // --- Film grain ---
    float grain = (hash(uv * 800.0 + u_time * 37.0) - 0.5) * 0.025;
    result += grain;

    // --- Vignette ---
    float vig = 1.0 - dot(vTexCoord - 0.5, vTexCoord - 0.5) * 1.8;
    result *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
