// csg/manifest.js  -  GENERATO da tools/build-csg-manifest.ps1
// Mappa "nome.csg" -> contenuto testuale; viene letta da js/csg-autoload.js
// Per rigenerare:    powershell -ExecutionPolicy Bypass -File tools/build-csg-manifest.ps1

var CSG_EMBEDDED = {
  "test_cone.csg":         "// test_cone.csg  -  cono troncato (cylinder con r1 != r2): nuovo type=3\n// Sopra un disco-base, sotto una piccola cima.\nunion() {\n    color([0.85, 0.85, 0.40])\n    cylinder(r1 = 2, r2 = 0.5, h = 3, center = true);\n\n    translate([0, 0, 1.7])\n        color([0.30, 0.30, 0.30]) sphere(r = 0.6);\n}\n",

  "test_difference.csg":   "// test_difference.csg  -  sfera con un cilindro forato attraverso\ndifference() {\n    color([0.85, 0.70, 0.30]) sphere(r = 2);\n    cylinder(r = 0.8, h = 6, center = true);\n}\n",

  "test_intersection.csg": "// test_intersection.csg  -  intersezione sfera+cubo (cube-corner rounded)\nintersection() {\n    color([0.30, 0.75, 0.55]) sphere(r = 1.6);\n    color([0.85, 0.65, 0.30]) cube(size = [2.4, 2.4, 2.4], center = true);\n}\n",

  "test_multmatrix.csg":   "// test_multmatrix.csg  -  multmatrix esplicita (come da export OpenSCAD)\n// Stesso effetto di translate + scale, ma fatto a mano.\ngroup() {\n    multmatrix([[1.5, 0, 0, -1.0],\n                [0, 1.5, 0,  0.0],\n                [0, 0, 1.5,  0.0],\n                [0, 0, 0,    1.0]]) {\n        color([0.80, 0.35, 0.45, 1]) sphere(r = 1);\n    }\n    multmatrix([[1, 0, 0,  1.5],\n                [0, 1, 0,  0.0],\n                [0, 0, 1, -0.5],\n                [0, 0, 0,  1.0]]) {\n        color([0.45, 0.65, 0.80, 1]) cube(size = [1, 1, 1], center = false);\n    }\n}\n",

  "test_sphere.csg":       "// test_sphere.csg  -  singola sfera (verifica sdPrimitive base)\nsphere(r = 2);\n",

  "test_union.csg":        "// test_union.csg  -  union di una sfera e un cubo, traslati\nunion() {\n    translate([-1.2, 0, 0]) {\n        color([0.85, 0.35, 0.35]) sphere(r = 1.2);\n    }\n    translate([0.6, -0.6, -0.6]) {\n        color([0.30, 0.55, 0.85]) cube(size = 1.2, center = false);\n    }\n}\n"
};
