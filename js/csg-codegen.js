// ============================================================
//  csg-codegen.js
//  ------------------------------------------------------------
//  Da scena (JS object) -> sorgente GLSL.
//
//  Formato scena (vedi scenes/*.js):
//
//   {
//     name: 'mio_test',
//     primitives: [
//       { matrix: <4x4 row-major>, color: [r,g,b,a], type: 0|1|2 },
//       ...
//     ],
//     tree: <nodo>
//   }
//
//   <nodo> ::= { leaf: <prim-index> }
//            | { op: 'union'|'intersection'|'difference',
//                a: <nodo>, b: <nodo> }
//
//  Output:
//   {
//     vsSource: <stringa GLSL VS>,
//     fsSource: <stringa GLSL FS>
//   }
// ============================================================

var CsgCodegen = (function () {

    // ----------------------------------------------------------
    //  Inversa di una 4x4 (input: 16 float column-major).
    // ----------------------------------------------------------
    function invert4x4(m) {
        var inv = new Array(16);
        inv[0]  =  m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15]
                +  m[9]*m[7]*m[14]  + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
        inv[4]  = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15]
                -  m[8]*m[7]*m[14]  - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
        inv[8]  =  m[4]*m[9]*m[15]  - m[4]*m[11]*m[13] - m[8]*m[5]*m[15]
                +  m[8]*m[7]*m[13]  + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
        inv[12] = -m[4]*m[9]*m[14]  + m[4]*m[10]*m[13] + m[8]*m[5]*m[14]
                -  m[8]*m[6]*m[13]  - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
        inv[1]  = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15]
                -  m[9]*m[3]*m[14]  - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
        inv[5]  =  m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15]
                +  m[8]*m[3]*m[14]  + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
        inv[9]  = -m[0]*m[9]*m[15]  + m[0]*m[11]*m[13] + m[8]*m[1]*m[15]
                -  m[8]*m[3]*m[13]  - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
        inv[13] =  m[0]*m[9]*m[14]  - m[0]*m[10]*m[13] - m[8]*m[1]*m[14]
                +  m[8]*m[2]*m[13]  + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
        inv[2]  =  m[1]*m[6]*m[15]  - m[1]*m[7]*m[14]  - m[5]*m[2]*m[15]
                +  m[5]*m[3]*m[14]  + m[13]*m[2]*m[7]  - m[13]*m[3]*m[6];
        inv[6]  = -m[0]*m[6]*m[15]  + m[0]*m[7]*m[14]  + m[4]*m[2]*m[15]
                -  m[4]*m[3]*m[14]  - m[12]*m[2]*m[7]  + m[12]*m[3]*m[6];
        inv[10] =  m[0]*m[5]*m[15]  - m[0]*m[7]*m[13]  - m[4]*m[1]*m[15]
                +  m[4]*m[3]*m[13]  + m[12]*m[1]*m[7]  - m[12]*m[3]*m[5];
        inv[14] = -m[0]*m[5]*m[14]  + m[0]*m[6]*m[13]  + m[4]*m[1]*m[14]
                -  m[4]*m[2]*m[13]  - m[12]*m[1]*m[6]  + m[12]*m[2]*m[5];
        inv[3]  = -m[1]*m[6]*m[11]  + m[1]*m[7]*m[10]  + m[5]*m[2]*m[11]
                -  m[5]*m[3]*m[10]  - m[9]*m[2]*m[7]   + m[9]*m[3]*m[6];
        inv[7]  =  m[0]*m[6]*m[11]  - m[0]*m[7]*m[10]  - m[4]*m[2]*m[11]
                +  m[4]*m[3]*m[10]  + m[8]*m[2]*m[7]   - m[8]*m[3]*m[6];
        inv[11] = -m[0]*m[5]*m[11]  + m[0]*m[7]*m[9]   + m[4]*m[1]*m[11]
                -  m[4]*m[3]*m[9]   - m[8]*m[1]*m[7]   + m[8]*m[3]*m[5];
        inv[15] =  m[0]*m[5]*m[10]  - m[0]*m[6]*m[9]   - m[4]*m[1]*m[10]
                +  m[4]*m[2]*m[9]   + m[8]*m[1]*m[6]   - m[8]*m[2]*m[5];

        var det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
        if (det === 0.0) throw new Error('Matrice singolare.');
        var invDet = 1.0 / det;
        for (var i = 0; i < 16; ++i) inv[i] *= invDet;
        return inv;
    }

    // Row-major nested (JSON-like) -> flat column-major (16 float).
    function rowsToColMajor(rows) {
        var out = new Array(16);
        for (var c = 0; c < 4; ++c)
            for (var r = 0; r < 4; ++r)
                out[c * 4 + r] = rows[r][c];
        return out;
    }

    function scaleFactor(rows) {
        var l = [];
        for (var i = 0; i < 3; ++i) {
            l[i] = Math.hypot(rows[0][i], rows[1][i], rows[2][i]);
        }
        return Math.min(l[0], l[1], l[2]);
    }

    // Formatta un float in stringa GLSL ('1.0' invece di '1').
    function f(x) {
        if (!isFinite(x)) throw new Error('valore non finito in scena');
        var s = x.toFixed(6);
        // togli zeri finali superflui ma lascia almeno un decimale
        s = s.replace(/0+$/, '').replace(/\.$/, '.0');
        return s;
    }

    // mat4 column-major literal -> "mat4(a,b,c,d, ...)"
    function glslMat4(m16) {
        var s = 'mat4(';
        for (var i = 0; i < 16; ++i) {
            s += f(m16[i]);
            if (i < 15) s += ((i + 1) % 4 === 0) ? ',  ' : ', ';
        }
        return s + ')';
    }

    // -----------------------------------------------------------
    //  Genera la funzione sdPrim_<i>(p) per la primitiva i-esima.
    //  La matrice inversa e lo scale factor sono inlinati come
    //  letterali GLSL: zero uniform, indicizzazione costante.
    // -----------------------------------------------------------
    function genPrimitiveFn(idx, prim) {
        var colMajor = rowsToColMajor(prim.matrix);
        var inv      = invert4x4(colMajor);
        var sf       = scaleFactor(prim.matrix);
        var t        = prim.type | 0;

        // chiamata alla SDF canonica corrispondente
        var sdfCall;
        if      (t === 0) sdfCall = 'sdSphereUnit(pL)';
        else if (t === 1) sdfCall = 'sdCubeUnit(pL)';
        else if (t === 2) sdfCall = 'sdCylinderUnit(pL)';
        else if (t === 3) {
            // cono troncato: params[0] = r2/r1 (>= 0)
            var R = (prim.params && prim.params.length > 0)
                    ? prim.params[0] : 0.5;
            // evita degenerazioni
            if (!isFinite(R)) R = 0.5;
            sdfCall = 'sdFrustumUnit(pL, ' + f(R) + ')';
        } else {
            throw new Error("Tipo primitiva sconosciuto: " + t);
        }
        return [
            '    float sdPrim_' + idx + '(vec3 p) {',
            '        vec3 pL = (' + glslMat4(inv) +
                            ' * vec4(p, 1.0)).xyz;',
            '        return ' + sdfCall + ' * ' + f(sf) + ';',
            '    }'
        ].join('\n');
    }

    // -----------------------------------------------------------
    //  Genera il corpo del map(): espande l'albero come codice
    //  lineare. Ogni nodo produce 3 variabili (d_N, c_N, f_N).
    //  Ritorna l'indice della variabile del nodo radice.
    // -----------------------------------------------------------
    function genTreeNode(node, scene, ctx) {
        var idx = ctx.counter++;

        if (typeof node.leaf === 'number') {
            // ---- foglia: chiama sdPrim_<i>, inlinea il colore ----
            var pi = node.leaf;
            if (!scene.primitives[pi]) {
                throw new Error('Tree referenzia primitiva inesistente: '
                                + pi);
            }
            var col = scene.primitives[pi].color;
            ctx.lines.push('        float d_' + idx +
                           ' = sdPrim_' + pi + '(p);');
            ctx.lines.push('        vec3  c_' + idx +
                           ' = vec3(' + f(col[0]) + ', '
                                      + f(col[1]) + ', '
                                      + f(col[2]) + ');');
            ctx.lines.push('        float f_' + idx + ' = 1.0;');
            return idx;
        }

        if (!node.op || !node.a || !node.b) {
            throw new Error('Nodo CSG malformato (serve op/a/b o leaf).');
        }

        var ai = genTreeNode(node.a, scene, ctx);
        var bi = genTreeNode(node.b, scene, ctx);
        var op = node.op;

        // dichiarazioni
        ctx.lines.push('        float d_' + idx + ';');
        ctx.lines.push('        vec3  c_' + idx + ';');
        ctx.lines.push('        float f_' + idx + ';');

        if (op === 'union') {
            // U(a,b) = min(a,b)
            ctx.lines.push('        if (d_' + ai + ' <= d_' + bi + ') {');
            ctx.lines.push('            d_' + idx + ' = d_' + ai + ';' +
                                     '  c_' + idx + ' = c_' + ai + ';' +
                                     '  f_' + idx + ' = f_' + ai + ';');
            ctx.lines.push('        } else {');
            ctx.lines.push('            d_' + idx + ' = d_' + bi + ';' +
                                     '  c_' + idx + ' = c_' + bi + ';' +
                                     '  f_' + idx + ' = f_' + bi + ';');
            ctx.lines.push('        }');
        } else if (op === 'intersection') {
            // I(a,b) = max(a,b)
            ctx.lines.push('        if (d_' + ai + ' >= d_' + bi + ') {');
            ctx.lines.push('            d_' + idx + ' = d_' + ai + ';' +
                                     '  c_' + idx + ' = c_' + ai + ';' +
                                     '  f_' + idx + ' = f_' + ai + ';');
            ctx.lines.push('        } else {');
            ctx.lines.push('            d_' + idx + ' = d_' + bi + ';' +
                                     '  c_' + idx + ' = c_' + bi + ';' +
                                     '  f_' + idx + ' = f_' + bi + ';');
            ctx.lines.push('        }');
        } else if (op === 'difference') {
            // D(a,b) = max(a, -b); colore = a; normale flip se vince -b
            ctx.lines.push('        float nb_' + idx + ' = -d_' + bi + ';');
            ctx.lines.push('        if (d_' + ai + ' >= nb_' + idx + ') {');
            ctx.lines.push('            d_' + idx + ' = d_' + ai + ';' +
                                     '  c_' + idx + ' = c_' + ai + ';' +
                                     '  f_' + idx + ' =  f_' + ai + ';');
            ctx.lines.push('        } else {');
            ctx.lines.push('            d_' + idx + ' = nb_' + idx + ';' +
                                     '  c_' + idx + ' = c_' + ai + ';' +
                                     '  f_' + idx + ' = -f_' + bi + ';');
            ctx.lines.push('        }');
        } else {
            throw new Error('Operatore CSG sconosciuto: ' + op);
        }

        return idx;
    }

    // -----------------------------------------------------------
    //  Compone i due segnaposto nel template fragment shader.
    // -----------------------------------------------------------
    function generate(scene) {
        if (!scene || !scene.primitives || !scene.tree) {
            throw new Error("Scena malformata: serve 'primitives' e 'tree'.");
        }

        // 1) Funzioni per le primitive
        var primFns = [];
        for (var i = 0; i < scene.primitives.length; ++i) {
            primFns.push(genPrimitiveFn(i, scene.primitives[i]));
        }
        var primBlock = primFns.join('\n');

        // 2) Corpo di map()
        var ctx = { counter: 0, lines: [] };
        var rootIdx = genTreeNode(scene.tree, scene, ctx);
        ctx.lines.push('');
        ctx.lines.push('        Hit h;');
        ctx.lines.push('        h.d    = d_' + rootIdx + ';');
        ctx.lines.push('        h.col  = c_' + rootIdx + ';');
        ctx.lines.push('        h.flip = f_' + rootIdx + ';');
        ctx.lines.push('        return h;');
        var mapBody = ctx.lines.join('\n');

        // 3) Sostituzione nei segnaposto
        var fsSource = CSG_FSHADER_TEMPLATE
            .replace('/*__PRIMITIVE_FUNCS__*/', primBlock)
            .replace('/*__MAP_BODY__*/',        mapBody);

        return {
            vsSource: CSG_VSHADER_SOURCE,
            fsSource: fsSource
        };
    }

    return {
        generate:  generate,
        invert4x4: invert4x4    // esposto per test
    };

})();
