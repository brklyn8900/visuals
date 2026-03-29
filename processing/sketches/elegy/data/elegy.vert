uniform mat4 transform;
attribute vec4 position;
attribute vec2 texCoord;
varying vec2 vTexCoord;

void main() {
    vTexCoord = texCoord;
    gl_Position = transform * position;
}
