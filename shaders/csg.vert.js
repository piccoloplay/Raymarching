// ============================================================
//  csg.vert.js - Vertex shader (GLSL ES 3.00 / WebGL 2)
//  ------------------------------------------------------------
//  Triangolo full-screen: il vertex shader passa solo le NDC.
//
//  Differenze rispetto alla versione WebGL 1:
//    - "#version 300 es" obbligatorio come PRIMA riga
//    - "attribute" -> "in"
//    - "varying"   -> "out"  (input del fragment: "in")
// ============================================================

var CSG_VSHADER_SOURCE = `#version 300 es
precision highp float;

in  vec2 a_Position;
out vec2 v_Ndc;

void main() {
    v_Ndc       = a_Position;
    gl_Position = vec4(a_Position, 0.0, 1.0);
}
`;
