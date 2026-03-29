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

void main() {
    vec2 uv = vertTexCoord.st;

    // --- Segments: 3–5, evolves slowly ---
    float segments = floor(3.0 + u_progress * 2.0);
    segments = clamp(segments, 3.0, 5.0);

    // --- Slow rotation ---
    float rotation = u_time * (0.05 + u_mid * 0.03);

    // --- Gentle zoom breathing ---
    float zoom = 1.0 + sin(u_time * 0.2) * 0.03 + u_bass * 0.05;
    vec2 centered = (uv - 0.5) / zoom;

    // --- Original (unfolded) UVs ---
    vec2 origUV = centered + 0.5;

    // --- Kaleidoscope UVs ---
    float r = length(centered);
    float a = atan(centered.y, centered.x) + rotation;
    float segAngle = 6.28318 / segments;
    a = mod(a, segAngle);
    if (a > segAngle * 0.5) a = segAngle - a;
    vec2 kalUV = vec2(cos(a), sin(a)) * r + 0.5;

    // --- Fold: morph UVs between original and kaleidoscope ---
    // This creates the origami folding/unfolding effect
    vec2 finalUV = mix(origUV, kalUV, u_fold);
    finalUV = clamp(finalUV, 0.0, 1.0);

    // --- Sample ---
    vec4 col = texture2D(texture, finalUV);

    // --- Fold seam glow: visible fold lines when partially folded ---
    if (u_fold > 0.05 && u_fold < 0.95) {
        float origA = atan(centered.y, centered.x) + rotation;
        float distToSeam = abs(mod(origA, segAngle) - segAngle * 0.5) / (segAngle * 0.5);
        float seamVis = smoothstep(0.0, 0.04, 1.0 - distToSeam);
        // Seam is most visible during transition, fades at extremes
        float transitionStrength = 1.0 - abs(u_fold * 2.0 - 1.0); // peaks at fold=0.5
        col.rgb += vec3(0.15, 0.12, 0.08) * seamVis * transitionStrength;
    }

    // --- Subtle chromatic aberration on snare ---
    if (u_snare > 0.6) {
        float aberr = u_snare * 0.003;
        vec2 dir = normalize(finalUV - 0.5 + 0.001);
        col.r = texture2D(texture, clamp(finalUV + dir * aberr, 0.0, 1.0)).r;
        col.b = texture2D(texture, clamp(finalUV - dir * aberr, 0.0, 1.0)).b;
    }

    // --- Kick brightness pulse ---
    col.rgb *= 1.0 + u_kick * 0.12;

    // --- Gentle warmth shift over song ---
    float warmth = u_progress * 0.2;
    col.rgb *= vec3(1.0 + warmth * 0.08, 1.0, 1.0 - warmth * 0.05);

    // --- Vignette ---
    float vig = 1.0 - dot(uv - 0.5, uv - 0.5) * 1.8;
    col.rgb *= clamp(vig, 0.0, 1.0);

    gl_FragColor = col;
}
