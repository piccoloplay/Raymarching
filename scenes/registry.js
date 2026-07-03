// ============================================================
//  registry.js  -  inizializza il registry globale delle scene
//  ------------------------------------------------------------
//  Ogni file scena (test_00.js, test_02.js, ...) registra se stesso
//  in CsgScenes. Questo file deve essere caricato PRIMA dei file
//  delle singole scene.
//
//  Anche le funzioni helper (L, U, I, D) sono qui per evitarne la
//  ridefinizione in ogni file.
// ============================================================

var CsgScenes = (window.CsgScenes || {});

// ---- helper per costruire l'albero in stile algebrico --------
function L(i)    { return { leaf: i };                              }
function U(a, b) { return { op: 'union',        a: a, b: b };       }
function I(a, b) { return { op: 'intersection', a: a, b: b };       }
function D(a, b) { return { op: 'difference',   a: a, b: b };       }

// ---- helper per costruire matrici T*S (T = translate, S = scale)
// Spesso usato nelle scene; ritorna una 4x4 in formato row-major.
function TS(tx, ty, tz, sx, sy, sz) {
    if (sy === undefined) sy = sx;
    if (sz === undefined) sz = sx;
    return [
        [sx, 0,  0,  tx],
        [0,  sy, 0,  ty],
        [0,  0,  sz, tz],
        [0,  0,  0,  1.0]
    ];
}
