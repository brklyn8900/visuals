#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D texture;
varying vec4 vertTexCoord;

uniform float u_time;
uniform float u_progress;
uniform float u_fold;  // 0 = original image, 1 = full kaleidoscope
uniform float u_sub, u_bass, u_lowMid, u_mid, u_highMid, u_presence, u_air;
uniform float u_kick, u_snare, u_hat;
uniform float u_energy;

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

void main() {
    vec2 uv = vertTexCoord.st;

    // --- Segments: 3–5, evolves slowly ---
    float segments = floor(3.0 + u_progress * 2.0);
    segments = clamp(segments, 3.0, 5.0);

    // --- Rotation: slow base, energy gives it momentum ---
    float rotation = u_time * (0.05 + u_mid * 0.03 + u_energy * 0.02);

    // --- Zoom: breathes with bass, energy widens the range ---
    float breathDepth = 0.03 + u_energy * 0.06;
    float zoom = 1.0 + sin(u_time * 0.25) * breathDepth + u_bass * 0.06;
    zoom += u_kick * 0.08;
    vec2 centered = (uv - 0.5) / zoom;

    // --- Displacement warp on loud moments ---
    // Ripple distortion that scales with energy — keeps image readable but adds motion
    float warpStrength = u_energy * 0.012 + u_kick * 0.008;
    if (warpStrength > 0.001) {
        float wx = vnoise(uv * 6.0 + u_time * 0.4);
        float wy = vnoise(uv * 6.0 + u_time * 0.4 + 50.0);
        centered += (vec2(wx, wy) - 0.5) * warpStrength;
    }

    // --- Original (unfolded) UVs ---
    vec2 origUV = centered + 0.5;

    // --- Kaleidoscope UVs ---
    float r = length(centered);
    float a = atan(centered.y, centered.x) + rotation;
    float segAngle = 6.28318 / segments;
    a = mod(a, segAngle);
    if (a > segAngle * 0.5) a = segAngle - a;
    vec2 kalUV = vec2(cos(a), sin(a)) * r + 0.5;

    // --- Fold: morph between original and kaleidoscope ---
    vec2 finalUV = mix(origUV, kalUV, u_fold);
    finalUV = clamp(finalUV, 0.0, 1.0);

    // --- Sample ---
    vec4 col = texture2D(texture, finalUV);

    // --- Chromatic split on high energy ---
    float aberr = u_energy * 0.003 + u_kick * 0.002;
    if (aberr > 0.0008) {
        vec2 dir = normalize(finalUV - 0.5 + 0.001);
        col.r = texture2D(texture, clamp(finalUV + dir * aberr, 0.0, 1.0)).r;
        col.b = texture2D(texture, clamp(finalUV - dir * aberr, 0.0, 1.0)).b;
    }

    // --- Fold seam glow during transitions ---
    if (u_fold > 0.05 && u_fold < 0.95) {
        float origA = atan(centered.y, centered.x) + rotation;
        float distToSeam = abs(mod(origA, segAngle) - segAngle * 0.5) / (segAngle * 0.5);
        float seamVis = smoothstep(0.0, 0.04, 1.0 - distToSeam);
        float transitionStrength = 1.0 - abs(u_fold * 2.0 - 1.0);
        col.rgb += vec3(0.15, 0.12, 0.08) * seamVis * transitionStrength;
    }

    // --- Dynamic contrast: louder = punchier image ---
    float contrast = 1.0 + u_energy * 0.25;
    col.rgb = (col.rgb - 0.5) * contrast + 0.5;

    // --- Saturation boost on energy ---
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    col.rgb = mix(vec3(gray), col.rgb, 1.0 + u_energy * 0.35);

    // --- Brightness pulse on kick ---
    col.rgb *= 1.0 + u_kick * 0.15;

    // --- Gentle warmth drift ---
    float warmth = u_progress * 0.2;
    col.rgb *= vec3(1.0 + warmth * 0.08, 1.0, 1.0 - warmth * 0.05);

    // --- Vignette: tightens on loud moments ---
    float vigStrength = 1.8 + u_energy * 0.8;
    float vig = 1.0 - dot(uv - 0.5, uv - 0.5) * vigStrength;
    col.rgb *= clamp(vig, 0.0, 1.0);

    col.rgb = clamp(col.rgb, 0.0, 1.0);
    gl_FragColor = col;
}
