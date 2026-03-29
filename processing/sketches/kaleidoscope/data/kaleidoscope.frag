#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D texture;
varying vec4 vertTexCoord;

uniform float u_time;
uniform float u_progress;
uniform float u_sub, u_bass, u_lowMid, u_mid, u_highMid, u_presence, u_air;
uniform float u_kick, u_snare, u_hat;
uniform float u_energy;

// ---- Kaleidoscope core ----

vec2 kaleidoscope(vec2 uv, float segments, float rotation) {
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x) + rotation;

    // Mirror fold
    float segAngle = 6.28318 / segments;
    a = mod(a, segAngle);
    if (a > segAngle * 0.5) a = segAngle - a;

    return vec2(cos(a), sin(a)) * r + 0.5;
}

// ---- Noise for distortion ----

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

// ---- Main ----

void main() {
    vec2 uv = vertTexCoord.st;

    // Segment count evolves over the song — more segments = more complex patterns
    // Bass/kick can temporarily add segments
    float baseSegments = 4.0 + u_progress * 6.0;
    float segments = floor(baseSegments + u_kick * 3.0);
    segments = max(segments, 3.0);

    // Rotation — continuous with mid speed boost, snare jolts
    float rotation = u_time * (0.15 + u_mid * 0.25) + u_snare * 0.8;

    // Zoom — bass breathes, kick punches
    float zoom = 0.8 + u_bass * 0.3 + u_kick * 0.25 + sin(u_time * 0.3) * 0.05;

    // Apply zoom by scaling around center
    vec2 centered = (uv - 0.5) / zoom + 0.5;

    // Pre-kaleidoscope noise warp — high frequencies add organic distortion
    float warpAmt = (u_highMid * 0.03 + u_presence * 0.02) * (0.5 + u_progress);
    float nx = vnoise(centered * 8.0 + u_time * 0.5);
    float ny = vnoise(centered * 8.0 + u_time * 0.5 + 100.0);
    centered += (vec2(nx, ny) - 0.5) * warpAmt;

    // Apply kaleidoscope
    vec2 kalUV = kaleidoscope(centered, segments, rotation);

    // Secondary fold — unlocks at 40% progress, creates nested symmetry
    if (u_progress > 0.4) {
        float secondFold = floor(3.0 + u_progress * 2.0);
        float secondRot = u_time * -0.08 + u_progress * 1.5;
        float blend = smoothstep(0.4, 0.5, u_progress);
        vec2 kalUV2 = kaleidoscope(kalUV, secondFold, secondRot);
        kalUV = mix(kalUV, kalUV2, blend * 0.6);
    }

    // Spiral twist — mid drives twist amount
    vec2 sp = kalUV - 0.5;
    float sr = length(sp);
    float twist = sr * u_mid * 2.0 * sin(u_time * 0.4);
    sp = vec2(
        sp.x * cos(twist) - sp.y * sin(twist),
        sp.x * sin(twist) + sp.y * cos(twist)
    );
    kalUV = sp + 0.5;

    // Tile/wrap UVs
    kalUV = fract(kalUV);

    // Sample the source image
    vec4 col = texture2D(texture, kalUV);

    // ---- Post effects ----

    // Chromatic aberration on snare
    if (u_snare > 0.3) {
        float aberr = u_snare * 0.012;
        vec2 dir = normalize(kalUV - 0.5);
        vec2 rUV = fract(kalUV + dir * aberr);
        vec2 bUV = fract(kalUV - dir * aberr);
        col.r = texture2D(texture, rUV).r;
        col.b = texture2D(texture, bUV).b;
    }

    // Color hue rotation over the song
    float hueAngle = u_progress * 3.0 + u_snare * 0.5;
    float cosH = cos(hueAngle);
    float sinH = sin(hueAngle);
    mat3 hueRot = mat3(
        0.299 + 0.701*cosH + 0.168*sinH,  0.587 - 0.587*cosH + 0.330*sinH,  0.114 - 0.114*cosH - 0.497*sinH,
        0.299 - 0.299*cosH - 0.328*sinH,  0.587 + 0.413*cosH + 0.035*sinH,  0.114 - 0.114*cosH + 0.292*sinH,
        0.299 - 0.300*cosH + 1.250*sinH,  0.587 - 0.588*cosH - 1.050*sinH,  0.114 + 0.886*cosH - 0.203*sinH
    );
    col.rgb = clamp(hueRot * col.rgb, 0.0, 1.0);

    // Brightness pulse on kick
    col.rgb *= 1.0 + u_kick * 0.35;

    // Saturation boost with energy
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    col.rgb = mix(vec3(gray), col.rgb, 1.0 + u_energy * 0.4);

    // Hat sparkle — random bright pixels
    if (u_hat > 0.4) {
        float sparkle = hash(uv * 500.0 + u_time * 10.0);
        if (sparkle > 0.985) col.rgb += vec3(u_hat * 0.6);
    }

    // Edge glow — radial gradient overlay
    float edgeDist = length(uv - 0.5);
    vec3 edgeCol = vec3(0.2, 0.05, 0.3) * u_energy * 0.3;
    col.rgb += edgeCol * smoothstep(0.3, 0.7, edgeDist);

    // Vignette
    float vig = 1.0 - dot(uv - 0.5, uv - 0.5) * 2.5;
    col.rgb *= clamp(vig, 0.0, 1.0);

    // Subtle contrast boost
    col.rgb = smoothstep(0.0, 1.0, col.rgb);

    gl_FragColor = col;
}
