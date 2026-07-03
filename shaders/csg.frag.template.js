// ============================================================
//  csg.frag.template.js  -  Fragment shader TEMPLATE (WebGL 2)
//  ------------------------------------------------------------
//  Il file definisce un sorgente con due segnaposto:
//
//     /*__PRIMITIVE_FUNCS__*/
//     /*__MAP_BODY__*/
//
//  Il code-generator (js/csg-codegen.js) legge la scena, deriva:
//    - le funzioni sdPrim_<i>(p) di ogni primitiva (con matrice
//      inversa e scale-factor inlinati come costanti);
//    - il corpo del map(): traversal dell'albero CSG espanso a
//      codice lineare (variabili d_<n>, c_<n>, f_<n>).
//
//  La codegen NON sarebbe strettamente necessaria in WebGL 2
//  (qui l'indicizzazione dinamica e' permessa), ma resta la
//  scelta piu' veloce: codice dritto = la GPU pre-ottimizza tutto.
//
//  Differenze rispetto alla versione WebGL 1:
//    - "#version 300 es" obbligatorio come PRIMA riga
//    - "varying" -> "in"
//    - "gl_FragColor" -> "out vec4 fragColor"
// ============================================================

var CSG_FSHADER_TEMPLATE = `#version 300 es
precision highp float;

in vec2 v_Ndc;
out vec4 fragColor;

    uniform vec2  u_Resolution;
    uniform vec3  u_CameraPos;
    uniform vec3  u_CameraTarget;
    uniform float u_Fov;

    // Scala "tipica" della scena (raggio della bbox in world units).
    // Calcolato da JS al load. Usato per scalare normale-epsilon,
    // soft-shadow, AO, fog: cosi' un .csg in millimetri e una scena
    // hand-written in unita' "1=10cm" sono entrambe coerenti.
    uniform float u_SceneScale;

    // -------- test cube (toggle dall'HUD) --------
    uniform float u_TestCubeVisible;   // 0 = nascosto, 1 = visibile
    uniform vec3  u_TestCubePos;
    uniform float u_TestCubeSize;
    uniform float u_TestCubeBlend;     // raggio del smooth-union (k)

    // -------- costanti raymarching --------
    // MAX_DIST volutamente generosa per accomodare scene esportate
    // da OpenSCAD in millimetri (bunny.csg arriva a r=20 etc).
    const int   MAX_STEPS = 200;
    const float MAX_DIST  = 2000.0;
    const float SURF_EPS  = 0.001;

    // ==========================================================
    //  Primitive canoniche (standard del PDF HackMore)
    //   sphere   : raggio 1, centrata nell'origine
    //   cube     : lato 1, min-corner nell'origine, ottante +++
    //   cylinder : raggio 1, altezza 1, asse Z, base su XY
    // ==========================================================
    float sdSphereUnit(vec3 p) {
        return length(p) - 1.0;
    }
    float sdCubeUnit(vec3 p) {
        vec3 q = abs(p - vec3(0.5)) - vec3(0.5);
        return length(max(q, 0.0)) +
               min(max(q.x, max(q.y, q.z)), 0.0);
    }
    float sdCylinderUnit(vec3 p) {
        vec2 d = vec2(length(p.xy) - 1.0, max(-p.z, p.z - 1.0));
        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
    }
    // Cono troncato canonico: base r=1 a z=0, top r=R a z=1, asse Z.
    // Formula di Inigo Quilez per il "capped cone" centrata in 0.
    float sdFrustumUnit(vec3 p, float R) {
        float h  = 0.5;          // semialtezza
        float r1 = 1.0;
        float r2 = R;
        p.z -= 0.5;              // canon: z=[0,1] -> centra in 0
        vec2 q  = vec2(length(p.xy), p.z);
        vec2 k1 = vec2(r2, h);
        vec2 k2 = vec2(r2 - r1, 2.0 * h);
        vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2),
                       abs(q.y) - h);
        vec2 cb = q - k1 + k2 *
                  clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
        float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
        return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
    }
    // Box CENTRATO (utile per il test cube — non e' lo cube canonico
    // del PDF: quello e' min-corner all'origine).
    float sdBoxCentered(vec3 p, vec3 halfSize) {
        vec3 q = abs(p) - halfSize;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    // ==========================================================
    //  >>> Inizio codice generato per le primitive della scena <<<
    /*__PRIMITIVE_FUNCS__*/
    //  >>> Fine codice generato per le primitive                <<<
    // ==========================================================

    struct Hit { float d; vec3 col; float flip; };

    // mapScene(): albero CSG espanso linearmente. Vedi csg-codegen.js
    // per la corrispondenza fra il tree JS e il codice qui sotto.
    Hit mapScene(vec3 p) {
        /*__MAP_BODY__*/
    }

    // map(): wrapper che combina la scena con il "test cube" (toggle
    // dall'HUD). Usa smooth-union, cosi' il cubo si fonde con il
    // modello e calcNormal/softShadow/AO lo vedono automaticamente.
    Hit map(vec3 p) {
        Hit s = mapScene(p);
        if (u_TestCubeVisible > 0.5) {
            float tcD = sdBoxCentered(p - u_TestCubePos,
                                      vec3(u_TestCubeSize * 0.5));
            float k  = u_TestCubeBlend;
            float hb = clamp(0.5 + 0.5 * (s.d - tcD) / k, 0.0, 1.0);
            float dB = mix(s.d, tcD, hb) - k * hb * (1.0 - hb);
            vec3  cB = mix(s.col, vec3(0.95, 0.45, 0.20), hb);
            float fB = mix(s.flip, 1.0, hb);
            s.d = dB; s.col = cB; s.flip = fB;
        }
        return s;
    }

    // Normale come gradiente della SDF (PDF: "Normal to the surface")
    vec3 calcNormal(vec3 p) {
        float eps = 0.0008 * u_SceneScale;
        vec2 e = vec2(eps, 0.0);
        return normalize(vec3(
            map(p + e.xyy).d - map(p - e.xyy).d,
            map(p + e.yxy).d - map(p - e.yxy).d,
            map(p + e.yyx).d - map(p - e.yyx).d));
    }

    // Raymarching (PDF: "Ray Marching with SDF")
    struct Cast { float t; vec3 col; vec3 hitP; float flip; float hit; };

    Cast raymarch(vec3 ro, vec3 rd) {
        float t = 0.0;
        Cast  r;
        r.hit  = 0.0;
        r.t    = 0.0;
        r.col  = vec3(0.0);
        r.hitP = vec3(0.0);
        r.flip = 1.0;
        for (int i = 0; i < MAX_STEPS; ++i) {
            vec3 p = ro + rd * t;
            Hit  h = map(p);
            if (h.d < SURF_EPS) {
                r.t    = t;
                r.col  = h.col;
                r.hitP = p;
                r.flip = h.flip;
                r.hit  = 1.0;
                break;
            }
            t += h.d;
            if (t > MAX_DIST) break;
        }
        return r;
    }

    // Soft shadow stile Inigo Quilez (sfrutta la SDF).
    float softShadow(vec3 ro, vec3 rd) {
        float res = 1.0;
        float t   = 0.02 * u_SceneScale;
        for (int i = 0; i < 48; ++i) {
            float h = map(ro + rd * t).d;
            if (h < 0.001 * u_SceneScale) { res = 0.0; break; }
            res = min(res, 16.0 * h / t);
            t += clamp(h, 0.01 * u_SceneScale, 0.3 * u_SceneScale);
            if (t > 25.0 * u_SceneScale) break;
        }
        return clamp(res, 0.0, 1.0);
    }

    float ambientOcclusion(vec3 p, vec3 n) {
        float occ = 0.0, sca = 1.0;
        for (int i = 0; i < 5; ++i) {
            float h = (0.02 + 0.12 * float(i) / 4.0) * u_SceneScale;
            float d = map(p + n * h).d;
            occ += (h - d) * sca;
            sca *= 0.85;
        }
        return clamp(1.0 - 1.5 * occ / u_SceneScale, 0.0, 1.0);
    }

    // Generazione del raggio (PDF: "Generate view rays")
    vec3 getRayDir(vec2 uv, vec3 ro, vec3 ta, float fov) {
        vec3 fwd     = normalize(ta - ro);
        vec3 worldUp = vec3(0.0, 0.0, 1.0);  // Z up (OpenSCAD)
        vec3 rgt     = normalize(cross(fwd, worldUp));
        vec3 up      = cross(rgt, fwd);
        float h      = tan(fov);
        float aspect = u_Resolution.x / u_Resolution.y;
        return normalize(fwd + uv.x * h * aspect * rgt + uv.y * h * up);
    }

    vec3 background(vec3 rd) {
        float t = clamp(rd.z * 0.5 + 0.5, 0.0, 1.0);
        return mix(vec3(0.10, 0.11, 0.13),
                   vec3(0.15, 0.16, 0.19), t);
    }

    vec3 shade(Cast r, vec3 rd) {
        vec3 n = calcNormal(r.hitP) * r.flip;

        vec3 lightDir = normalize(vec3(0.6, -0.8, 0.9));
        vec3 lightCol = vec3(1.0, 0.96, 0.88);

        float ndl  = max(dot(n, lightDir), 0.0);
        float sh   = softShadow(r.hitP + n * 0.01 * u_SceneScale, lightDir);
        float ao   = ambientOcclusion(r.hitP, n);

        // Blinn-Phong
        vec3  hv   = normalize(lightDir - rd);
        float spec = pow(max(dot(n, hv), 0.0), 28.0);

        vec3 ambient = r.col * vec3(0.18, 0.20, 0.24) * ao;
        vec3 diffuse = r.col * lightCol * ndl * sh;
        vec3 specCol = vec3(0.35) * spec * sh;

        vec3 fillDir = normalize(vec3(-0.5, 0.3, 0.2));
        diffuse += r.col * vec3(0.15, 0.18, 0.22)
                 * max(dot(n, fillDir), 0.0);

        return ambient + diffuse + specCol;
    }

    void main() {
        vec2 uv = v_Ndc;
        vec3 ro = u_CameraPos;
        vec3 ta = u_CameraTarget;
        vec3 rd = getRayDir(uv, ro, ta, u_Fov);

        Cast r = raymarch(ro, rd);
        vec3 col;
        if (r.hit < 0.5) {
            col = background(rd);
        } else {
            col = shade(r, rd);
        }

        // gamma 2.2 (niente Reinhard: preserva la saturazione dei colori)
        col = clamp(col, 0.0, 1.0);
        col = pow(col, vec3(1.0 / 2.2));
        fragColor = vec4(col, 1.0);
    }
`;
