// ============================================================
//  webgl-utils.js  -  helper stile Matsuda 2015 (WebGL 2)
//  ------------------------------------------------------------
//   getWebGLContext(canvas)
//   initShaders(gl, vshaderSrc, fshaderSrc)   [salva su gl.program]
//   createFullscreenTriangle(gl, program)
//   resizeCanvas(gl)
//
//  Il renderer CSG e' "generico nel JS": ogni scena genera il
//  proprio fragment shader (vedi js/csg-codegen.js) con la
//  funzione map() interamente inlinata. In WebGL 2 questa non
//  sarebbe l'unica strada possibile (l'indicizzazione dinamica
//  e' permessa), ma resta la PIU' VELOCE: il codice generato
//  e' dritto, senza branching ne' indexing a runtime.
// ============================================================

var WebGLUtils = (function () {

    function getWebGLContext(canvas) {
        var gl = canvas.getContext('webgl2', { antialias: false });
        if (!gl) {
            console.error('WebGL 2 non disponibile in questo browser.');
        }
        return gl;
    }

    function loadShader(gl, type, source) {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            var info = gl.getShaderInfoLog(sh);
            var kind = (type === gl.VERTEX_SHADER) ? 'VS' : 'FS';
            console.error('[' + kind + ' compile error]\n' + info);
            console.error('---- shader source ----\n' + source);
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    function createProgram(gl, vshaderSrc, fshaderSrc) {
        var vs = loadShader(gl, gl.VERTEX_SHADER,   vshaderSrc);
        var fs = loadShader(gl, gl.FRAGMENT_SHADER, fshaderSrc);
        if (!vs || !fs) return null;

        var p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('[Program link error]\n' +
                          gl.getProgramInfoLog(p));
            gl.deleteProgram(p);
            return null;
        }
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return p;
    }

    // initShaders: stessa firma del libro Matsuda 2015.
    function initShaders(gl, vshaderSrc, fshaderSrc) {
        var p = createProgram(gl, vshaderSrc, fshaderSrc);
        if (!p) return false;
        gl.useProgram(p);
        gl.program = p;
        return true;
    }

    // Triangolo full-screen (3 vertici fuori dal viewport).
    // In WebGL 2 i VAO sono nativi (in WebGL 1 servirebbe l'extension
    // OES_vertex_array_object). Lo creiamo e lo lasciamo bound:
    // tanto in tutto il programma c'e' una sola geometria.
    function createFullscreenTriangle(gl, program) {
        var vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        var verts = new Float32Array([
            -1.0, -1.0,
             3.0, -1.0,
            -1.0,  3.0
        ]);
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        var a_Position = gl.getAttribLocation(program, 'a_Position');
        if (a_Position < 0) {
            console.error("attribute 'a_Position' non trovato.");
            return null;
        }
        gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(a_Position);
        return vao;
    }

    function resizeCanvas(gl) {
        var canvas = gl.canvas;
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var w = Math.floor(window.innerWidth  * dpr);
        var h = Math.floor(window.innerHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width  = w;
            canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    return {
        getWebGLContext:          getWebGLContext,
        loadShader:               loadShader,
        createProgram:            createProgram,
        initShaders:              initShaders,
        createFullscreenTriangle: createFullscreenTriangle,
        resizeCanvas:             resizeCanvas
    };

})();
