// ============================================================
//  main.js - entry point del renderer CSG (WebGL 2)
//
//  Pipeline:
//    1) ottieni il contesto WebGL 2
//    2) per la scena scelta: csg-codegen produce VS+FS
//    3) initShaders compila + linka
//    4) setup triangolo full-screen + uniform locations
//    5) render loop
//
//  Il fragment shader e' RIGENERATO ad ogni cambio scena.
//
//  Espone window.App con:
//    addScene(name, scene)
//    loadScene(name)
//  cosi' il file input / drag-drop puo' iniettare nuove scene
//  parse-ate al volo da .csg.
// ============================================================

(function main() {

    // ----- 1) Contesto WebGL --------------------------------
    var canvas = document.getElementById('webgl');
    var gl     = WebGLUtils.getWebGLContext(canvas);
    if (!gl) {
        alert('WebGL 2 non disponibile in questo browser.');
        return;
    }

    // ----- Riferimenti UI ----------------------------------
    var sceneSelect    = document.getElementById('sceneSelect');
    var statusEl       = document.getElementById('status');
    var fpsEl          = document.getElementById('fps');
    var fileInput      = document.getElementById('csgFileInput');
    var loadBtn        = document.getElementById('loadCsgBtn');
    var testCubeChk    = document.getElementById('testCubeToggle');
    var testCubePosEl  = document.getElementById('testCubePos');

    // ----- Camera orbitale (creata subito: usata da fitCameraToScene) -
    var camera = new OrbitCamera([0.0, 0.0, 0.5], 14.0, 0.7, 0.25);
    camera.attach(canvas);
    var FOV_RAD = 0.45;

    // ----- Stato test-cube --------------------------------
    // Posizione e taglia vengono riadattate per scena dal bbox
    // (vedi fitCameraToScene). Le frecce muovono in unita'
    // proporzionali alla scala della scena.
    var testCubeVisible = false;
    var testCubePos     = [2.5, 0.0, 0.5];
    var testCubeSize    = 1.0;
    var testCubeBlend   = 0.20;

    // scala caratteristica della scena (raggio bbox);
    // aggiornata da fitCameraToScene().
    var sceneScale = 1.0;

    // -------------------------------------------------------
    //  Bounding box mondo della scena: per ogni primitiva
    //  trasformiamo gli 8 "angoli" del suo bbox canonico
    //  con la matrice del nodo e raccogliamo min/max globale.
    //  Sovrastima sicura (per la sfera prendiamo il cubo
    //  circoscritto); va benissimo per il fit-to-view.
    // -------------------------------------------------------
    function computeSceneBBox(scene) {
        var min = [Infinity, Infinity, Infinity];
        var max = [-Infinity, -Infinity, -Infinity];

        function transform(rows, v) {
            var x = v[0], y = v[1], z = v[2];
            return [
                rows[0][0]*x + rows[0][1]*y + rows[0][2]*z + rows[0][3],
                rows[1][0]*x + rows[1][1]*y + rows[1][2]*z + rows[1][3],
                rows[2][0]*x + rows[2][1]*y + rows[2][2]*z + rows[2][3]
            ];
        }
        function expand(p) {
            if (p[0] < min[0]) min[0] = p[0]; if (p[0] > max[0]) max[0] = p[0];
            if (p[1] < min[1]) min[1] = p[1]; if (p[1] > max[1]) max[1] = p[1];
            if (p[2] < min[2]) min[2] = p[2]; if (p[2] > max[2]) max[2] = p[2];
        }
        function cornersFor(type, params) {
            // sphere unit: bbox [-1,1]^3
            if (type === 0) return [
                [-1,-1,-1],[+1,-1,-1],[-1,+1,-1],[+1,+1,-1],
                [-1,-1,+1],[+1,-1,+1],[-1,+1,+1],[+1,+1,+1] ];
            // cube unit: [0,1]^3 (min-corner all'origine, PDF)
            if (type === 1) return [
                [0,0,0],[1,0,0],[0,1,0],[1,1,0],
                [0,0,1],[1,0,1],[0,1,1],[1,1,1] ];
            // cylinder unit: r=1, h=1, base XY
            if (type === 2) return [
                [-1,-1, 0],[+1,-1, 0],[-1,+1, 0],[+1,+1, 0],
                [-1,-1, 1],[+1,-1, 1],[-1,+1, 1],[+1,+1, 1] ];
            // frustum: usa il max fra r1=1 e r2=R
            if (type === 3) {
                var R = (params && params[0] != null) ?
                        Math.max(1, params[0]) : 1.0;
                return [
                    [-R,-R, 0],[+R,-R, 0],[-R,+R, 0],[+R,+R, 0],
                    [-R,-R, 1],[+R,-R, 1],[-R,+R, 1],[+R,+R, 1] ];
            }
            return [[0,0,0]];
        }

        var prims = scene.primitives || [];
        for (var i = 0; i < prims.length; ++i) {
            var p = prims[i];
            var corners = cornersFor(p.type, p.params);
            for (var c = 0; c < corners.length; ++c) {
                expand(transform(p.matrix, corners[c]));
            }
        }
        if (!isFinite(min[0])) { min = [-1,-1,-1]; max = [1,1,1]; }
        return { min: min, max: max };
    }

    // -------------------------------------------------------
    //  Imposta camera + test-cube + scene-scale dalla bbox.
    // -------------------------------------------------------
    function fitCameraToScene(scene) {
        var bb = computeSceneBBox(scene);
        var cx = (bb.min[0] + bb.max[0]) * 0.5;
        var cy = (bb.min[1] + bb.max[1]) * 0.5;
        var cz = (bb.min[2] + bb.max[2]) * 0.5;
        var dx = bb.max[0] - bb.min[0];
        var dy = bb.max[1] - bb.min[1];
        var dz = bb.max[2] - bb.min[2];
        var radius = Math.max(0.5, Math.hypot(dx, dy, dz) * 0.5);

        // camera
        camera.target[0] = cx;
        camera.target[1] = cy;
        camera.target[2] = cz;
        camera.distance  = radius * 2.8;
        camera.minDist   = radius * 0.5;
        camera.maxDist   = radius * 20.0;
        camera.update();

        // scale globale per ombre/AO/normal/fog
        sceneScale = radius;

        // test cube: posizione "ovvia" a destra del modello,
        // size e blend proporzionali alla scala della scena
        testCubePos     = [cx + radius * 1.3, cy, cz];
        testCubeSize    = radius * 0.4;
        testCubeBlend   = radius * 0.15;
        updateTestCubeHud();
    }

    function updateTestCubeHud() {
        if (!testCubePosEl) return;
        if (testCubeVisible) {
            testCubePosEl.style.display = '';
            testCubePosEl.textContent =
                'cubo: (' + testCubePos[0].toFixed(2) + ', '
                          + testCubePos[1].toFixed(2) + ', '
                          + testCubePos[2].toFixed(2) +
                ')  size ' + testCubeSize.toFixed(2);
        } else {
            testCubePosEl.style.display = 'none';
        }
    }

    // ----- Resize ------------------------------------------
    WebGLUtils.resizeCanvas(gl);
    window.addEventListener('resize',
        function () { WebGLUtils.resizeCanvas(gl); });

    // ----- Stato corrente ----------------------------------
    var locs = null;
    var ready = false;
    var currentSceneName = null;

    // ----- Popola dropdown con tutte le scene registrate ---
    function populateSelect(selectedName) {
        sceneSelect.innerHTML = '';
        var keys = Object.keys(CsgScenes).sort();
        for (var i = 0; i < keys.length; ++i) {
            var opt = document.createElement('option');
            opt.value = keys[i];
            opt.textContent = keys[i];
            sceneSelect.appendChild(opt);
        }
        if (selectedName && CsgScenes[selectedName]) {
            sceneSelect.value = selectedName;
        }
    }

    // ----- Carica una scena --------------------------------
    function loadScene(sceneName) {
        var scene = CsgScenes[sceneName];
        if (!scene) {
            statusEl.textContent = 'scena "' + sceneName + '" non trovata';
            return;
        }
        statusEl.textContent = 'compilo "' + sceneName + '"...';
        ready = false;

        try {
            var src = CsgCodegen.generate(scene);

            if (gl.program) {
                gl.deleteProgram(gl.program);
                gl.program = null;
            }
            if (!WebGLUtils.initShaders(gl, src.vsSource, src.fsSource)) {
                statusEl.textContent = 'errore di compilazione (vedi console)';
                return;
            }
            WebGLUtils.createFullscreenTriangle(gl, gl.program);

            locs = {
                u_Resolution:      gl.getUniformLocation(gl.program, 'u_Resolution'),
                u_CameraPos:       gl.getUniformLocation(gl.program, 'u_CameraPos'),
                u_CameraTarget:    gl.getUniformLocation(gl.program, 'u_CameraTarget'),
                u_Fov:             gl.getUniformLocation(gl.program, 'u_Fov'),
                u_SceneScale:      gl.getUniformLocation(gl.program, 'u_SceneScale'),
                u_TestCubeVisible: gl.getUniformLocation(gl.program, 'u_TestCubeVisible'),
                u_TestCubePos:     gl.getUniformLocation(gl.program, 'u_TestCubePos'),
                u_TestCubeSize:    gl.getUniformLocation(gl.program, 'u_TestCubeSize'),
                u_TestCubeBlend:   gl.getUniformLocation(gl.program, 'u_TestCubeBlend')
            };

            // auto-fit: ricalcola camera + test-cube + sceneScale
            fitCameraToScene(scene);

            currentSceneName = sceneName;
            ready = true;
            statusEl.textContent = sceneName + ' (' +
                scene.primitives.length + ' prim)';
        } catch (e) {
            statusEl.textContent = 'errore: ' + e.message;
            console.error(e);
        }
    }

    // ----- Aggiunge / aggiorna una scena (chiamata esterna) -
    function addScene(name, scene) {
        scene.name = name;
        CsgScenes[name] = scene;
        populateSelect(name);
    }

    // ----- Esposizione globale -----------------------------
    window.App = {
        addScene:  addScene,
        loadScene: function (name) {
            sceneSelect.value = name;
            loadScene(name);
        }
    };

    // ----- Bootstrap ---------------------------------------
    // Scena di partenza: una semplice sfera (test_00).
    populateSelect();
    var initial = CsgScenes['test_00'] ? 'test_00' :
                  Object.keys(CsgScenes)[0];
    if (initial) {
        sceneSelect.value = initial;
        loadScene(initial);
    } else {
        statusEl.textContent = 'nessuna scena disponibile';
    }
    sceneSelect.addEventListener('change', function () {
        loadScene(sceneSelect.value);
    });

    // ----- Gestione file input (.csg) ---------------------
    function handleCsgFiles(files) {
        var arr = Array.prototype.slice.call(files);
        arr.forEach(function (file) {
            if (!/\.csg$/i.test(file.name)) {
                console.warn('Skip non-csg:', file.name);
                return;
            }
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var scene = CsgParser.parse(ev.target.result);
                    addScene(file.name, scene);
                    App.loadScene(file.name);
                } catch (err) {
                    console.error('Errore parsing', file.name, err);
                    alert('Errore parsing ' + file.name + ':\n' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }

    if (loadBtn && fileInput) {
        loadBtn.addEventListener('click', function () {
            fileInput.click();
        });
        fileInput.addEventListener('change', function (e) {
            handleCsgFiles(e.target.files);
            // reset cosi' lo stesso file puo' essere ricaricato
            fileInput.value = '';
        });
    }

    // ----- Drag-and-drop di file .csg sulla canvas --------
    canvas.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    canvas.addEventListener('drop', function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files) {
            handleCsgFiles(e.dataTransfer.files);
        }
    });

    // ----- Test cube: toggle + tasti freccia --------------
    if (testCubeChk) {
        testCubeChk.addEventListener('change', function () {
            testCubeVisible = !!testCubeChk.checked;
            updateTestCubeHud();
        });
    }
    window.addEventListener('keydown', function (e) {
        if (!testCubeVisible) return;
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;

        // step proporzionale alla scala della scena (e shift = 5x)
        var baseStep = sceneScale * 0.10;
        var step     = e.shiftKey ? baseStep * 5.0 : baseStep;
        var sizeStep = sceneScale * 0.05;
        var handled = true;
        switch (e.key) {
            case 'ArrowLeft':  testCubePos[0] -= step; break;
            case 'ArrowRight': testCubePos[0] += step; break;
            case 'ArrowUp':    testCubePos[1] += step; break;   // +Y = "lontano" (OpenSCAD)
            case 'ArrowDown':  testCubePos[1] -= step; break;
            case 'PageUp':     testCubePos[2] += step; break;
            case 'PageDown':   testCubePos[2] -= step; break;
            case '+': case '=':
                testCubeSize = Math.min(sceneScale * 3.0,
                                        testCubeSize + sizeStep); break;
            case '-': case '_':
                testCubeSize = Math.max(sceneScale * 0.05,
                                        testCubeSize - sizeStep); break;
            case 'r': case 'R':
                fitCameraToScene(CsgScenes[currentSceneName]);
                break;
            default: handled = false;
        }
        if (handled) {
            e.preventDefault();
            updateTestCubeHud();
        }
    });

    // ----- FPS counter -------------------------------------
    var last = performance.now();
    var frames = 0, acc = 0;

    // ----- Render loop -------------------------------------
    function frame(now) {
        var dt = (now - last) * 0.001;
        last = now;
        frames++; acc += dt;
        if (acc > 0.5) {
            fpsEl.textContent = (frames / acc).toFixed(1) + ' fps';
            frames = 0; acc = 0;
        }

        if (ready) {
            gl.uniform2f(locs.u_Resolution,
                         gl.canvas.width, gl.canvas.height);
            gl.uniform3fv(locs.u_CameraPos,    camera.position);
            gl.uniform3fv(locs.u_CameraTarget, camera.target);
            gl.uniform1f(locs.u_Fov, FOV_RAD);
            gl.uniform1f(locs.u_SceneScale, sceneScale);

            // test-cube
            gl.uniform1f (locs.u_TestCubeVisible, testCubeVisible ? 1.0 : 0.0);
            gl.uniform3fv(locs.u_TestCubePos,     testCubePos);
            gl.uniform1f (locs.u_TestCubeSize,    testCubeSize);
            gl.uniform1f (locs.u_TestCubeBlend,   testCubeBlend);

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

})();
