// ============================================================
//  csg-parser.js   -  parser di file .csg di OpenSCAD
//  ------------------------------------------------------------
//  Pipeline a tre stadi:
//
//     testo .csg
//        |
//        |   tokenize()                       <-- stadio 1
//        v
//     stream di token
//        |
//        |   Parser.parseProgram()            <-- stadio 2
//        v
//     AST (operazioni OpenSCAD annidate)
//        |
//        |   lower()                          <-- stadio 3
//        v
//     { primitives: [...], tree: <nodo> }     (formato delle scene)
//
//  Costrutti gestiti:
//
//   primitive : sphere(r=R), sphere(d=D), cube(size, center),
//               cylinder(r, h, center), cylinder(r1, r2, h, center)
//
//   operatori : union, intersection, difference, group
//   transform : multmatrix, translate, scale, rotate, mirror
//   altro     : color (propaga ai leaf)
//
//  Costrutti SKIPPED con warning (PDF: slide "beyond CSG"):
//     hull, minkowski, offset, linear_extrude, rotate_extrude,
//     import, polyhedron, square, circle, polygon, text
//
//  Cono troncato (cylinder con r1 != r2): emesso come type=3
//  con params=[r2/r1]; il template GLSL fornisce sdFrustumUnit.
// ============================================================

var CsgParser = (function () {

    // ===========================================================
    //   ----- STADIO 1: TOKENIZER -----
    // ===========================================================
    function tokenize(text) {
        var tokens = [];
        var i = 0;
        var n = text.length;

        function isDigit(c)  { return c >= '0' && c <= '9'; }
        function isAlpha(c)  { return (c >= 'a' && c <= 'z') ||
                                      (c >= 'A' && c <= 'Z') ||
                                      c === '_' || c === '$'; }
        function isAlnum(c)  { return isDigit(c) || isAlpha(c); }

        while (i < n) {
            var c = text[i];

            // whitespace
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                i++; continue;
            }

            // line comment  //...
            if (c === '/' && text[i + 1] === '/') {
                while (i < n && text[i] !== '\n') i++;
                continue;
            }
            // block comment  /*...*/
            if (c === '/' && text[i + 1] === '*') {
                i += 2;
                while (i < n - 1 && !(text[i] === '*' && text[i + 1] === '/')) {
                    i++;
                }
                i += 2;
                continue;
            }

            // single-char punctuation
            if (c === '(' || c === ')' || c === '{' || c === '}' ||
                c === '[' || c === ']' || c === ',' || c === '=' ||
                c === ';' || c === ':') {
                tokens.push({ type: c, value: c });
                i++;
                continue;
            }

            // number (con segno opzionale, decimali, esponente)
            var isNumStart =
                isDigit(c) ||
                (c === '.' && isDigit(text[i + 1])) ||
                ((c === '-' || c === '+') &&
                 (isDigit(text[i + 1]) || text[i + 1] === '.'));
            if (isNumStart) {
                var j = i;
                if (text[j] === '-' || text[j] === '+') j++;
                while (j < n && isDigit(text[j])) j++;
                if (text[j] === '.') {
                    j++;
                    while (j < n && isDigit(text[j])) j++;
                }
                if (text[j] === 'e' || text[j] === 'E') {
                    j++;
                    if (text[j] === '+' || text[j] === '-') j++;
                    while (j < n && isDigit(text[j])) j++;
                }
                var s = text.substring(i, j);
                tokens.push({ type: 'NUMBER', value: parseFloat(s) });
                i = j;
                continue;
            }

            // string literal "..."
            if (c === '"') {
                var j2 = i + 1;
                var sb = '';
                while (j2 < n && text[j2] !== '"') {
                    if (text[j2] === '\\' && j2 + 1 < n) {
                        var esc = text[j2 + 1];
                        if (esc === 'n')      sb += '\n';
                        else if (esc === 't') sb += '\t';
                        else if (esc === 'r') sb += '\r';
                        else                  sb += esc;
                        j2 += 2;
                    } else {
                        sb += text[j2++];
                    }
                }
                tokens.push({ type: 'STRING', value: sb });
                i = j2 + 1;
                continue;
            }

            // identifier (incl. $fn, $fa, true/false/undef)
            if (isAlpha(c)) {
                var j3 = i;
                while (j3 < n && (isAlnum(text[j3]) || text[j3] === '.')) j3++;
                var ident = text.substring(i, j3);
                if      (ident === 'true')  tokens.push({ type: 'BOOL',  value: true });
                else if (ident === 'false') tokens.push({ type: 'BOOL',  value: false });
                else if (ident === 'undef') tokens.push({ type: 'UNDEF', value: null });
                else                         tokens.push({ type: 'IDENT', value: ident });
                i = j3;
                continue;
            }

            throw new Error("CsgParser: token sconosciuto '" + c +
                            "' a posizione " + i);
        }

        tokens.push({ type: 'EOF' });
        return tokens;
    }

    // ===========================================================
    //   ----- STADIO 2: PARSER (recursive descent) -----
    // ===========================================================
    function Parser(tokens) {
        this.tokens = tokens;
        this.i = 0;
    }
    Parser.prototype.peek    = function () { return this.tokens[this.i]; };
    Parser.prototype.advance = function () { return this.tokens[this.i++]; };
    Parser.prototype.expect  = function (type) {
        var t = this.advance();
        if (t.type !== type) {
            throw new Error("CsgParser: atteso '" + type +
                            "', trovato '" + t.type +
                            "' (token #" + (this.i - 1) + ")");
        }
        return t;
    };
    Parser.prototype.match = function (type) {
        if (this.peek().type === type) { this.advance(); return true; }
        return false;
    };

    Parser.prototype.parseProgram = function () {
        var nodes = [];
        while (this.peek().type !== 'EOF') {
            nodes.push(this.parseNode());
        }
        return nodes;
    };

    Parser.prototype.parseNode = function () {
        var name = this.expect('IDENT').value;
        this.expect('(');
        var args = this.parseArgs();
        this.expect(')');
        var children = [];
        if (this.match('{')) {
            while (this.peek().type !== '}') {
                children.push(this.parseNode());
            }
            this.expect('}');
        } else {
            this.expect(';');
        }
        return { name: name, args: args, children: children };
    };

    Parser.prototype.parseArgs = function () {
        var args = { positional: [], named: {} };
        if (this.peek().type === ')') return args;

        var parser = this;
        function parseOne() {
            // Distingui nome=valore vs valore posizionale.
            // Se vediamo IDENT '=' allora e' un argomento nominato;
            // altrimenti lo trattiamo come posizionale.
            if (parser.peek().type === 'IDENT') {
                var save = parser.i;
                var nm = parser.advance().value;
                if (parser.match('=')) {
                    args.named[nm] = parser.parseValue();
                    return;
                }
                parser.i = save;       // rewind: non era named
            }
            args.positional.push(parser.parseValue());
        }

        parseOne();
        while (this.match(',')) {
            parseOne();
        }
        return args;
    };

    Parser.prototype.parseValue = function () {
        var t = this.peek();
        if (t.type === 'NUMBER') return this.advance().value;
        if (t.type === 'BOOL')   return this.advance().value;
        if (t.type === 'STRING') return this.advance().value;
        if (t.type === 'UNDEF') { this.advance(); return null; }
        if (t.type === 'IDENT') return this.advance().value;   // raw ident
        if (t.type === '[')     return this.parseArray();
        throw new Error("CsgParser: valore atteso, trovato '" + t.type + "'");
    };

    Parser.prototype.parseArray = function () {
        this.expect('[');
        var arr = [];
        if (this.peek().type !== ']') {
            arr.push(this.parseValue());
            while (this.match(',')) arr.push(this.parseValue());
        }
        this.expect(']');
        return arr;
    };

    // ===========================================================
    //   ----- MATRIX UTILITIES (column-major flat 16-float) -----
    // ===========================================================
    function mat4Identity() {
        return [1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1];
    }
    function mat4Multiply(a, b) {
        var r = new Array(16);
        for (var c = 0; c < 4; ++c) {
            for (var ro = 0; ro < 4; ++ro) {
                var s = 0;
                for (var k = 0; k < 4; ++k) {
                    s += a[k * 4 + ro] * b[c * 4 + k];
                }
                r[c * 4 + ro] = s;
            }
        }
        return r;
    }
    function mat4Translate(tx, ty, tz) {
        return [1,0,0,0,  0,1,0,0,  0,0,1,0,  tx,ty,tz,1];
    }
    function mat4Scale(sx, sy, sz) {
        return [sx,0,0,0,  0,sy,0,0,  0,0,sz,0,  0,0,0,1];
    }
    function mat4RotateX(a) {
        var c = Math.cos(a), s = Math.sin(a);
        return [1,0,0,0,  0,c,s,0,  0,-s,c,0,  0,0,0,1];
    }
    function mat4RotateY(a) {
        var c = Math.cos(a), s = Math.sin(a);
        return [c,0,-s,0,  0,1,0,0,  s,0,c,0,  0,0,0,1];
    }
    function mat4RotateZ(a) {
        var c = Math.cos(a), s = Math.sin(a);
        return [c,s,0,0,  -s,c,0,0,  0,0,1,0,  0,0,0,1];
    }
    function mat4RotateAxis(ax, ay, az, ang) {
        // Rodrigues
        var len = Math.hypot(ax, ay, az);
        if (len === 0) return mat4Identity();
        ax /= len; ay /= len; az /= len;
        var c = Math.cos(ang), s = Math.sin(ang), one_c = 1 - c;
        return [
            c + ax*ax*one_c,      ax*ay*one_c + az*s,   ax*az*one_c - ay*s, 0,
            ay*ax*one_c - az*s,   c + ay*ay*one_c,      ay*az*one_c + ax*s, 0,
            az*ax*one_c + ay*s,   az*ay*one_c - ax*s,   c + az*az*one_c,    0,
            0,                    0,                    0,                  1
        ];
    }
    function mat4Mirror(nx, ny, nz) {
        var len = Math.hypot(nx, ny, nz);
        if (len === 0) return mat4Identity();
        nx /= len; ny /= len; nz /= len;
        return [
            1 - 2*nx*nx, -2*nx*ny,    -2*nx*nz,    0,
            -2*nx*ny,    1 - 2*ny*ny, -2*ny*nz,    0,
            -2*nx*nz,    -2*ny*nz,    1 - 2*nz*nz, 0,
            0,           0,           0,           1
        ];
    }
    function colMajorToRows(m) {
        var rows = [];
        for (var r = 0; r < 4; ++r) {
            var row = [];
            for (var c = 0; c < 4; ++c) {
                row.push(m[c * 4 + r]);
            }
            rows.push(row);
        }
        return rows;
    }
    function rowsToColMajor(rows) {
        var out = new Array(16);
        for (var c = 0; c < 4; ++c) {
            for (var r = 0; r < 4; ++r) {
                out[c * 4 + r] = rows[r][c];
            }
        }
        return out;
    }

    // ===========================================================
    //   ----- STADIO 3: LOWERER -----
    // ===========================================================
    var REJECTED = {
        hull:1, minkowski:1, offset:1,
        linear_extrude:1, rotate_extrude:1, 'import':1, polyhedron:1,
        square:1, circle:1, polygon:1, text:1, projection:1, surface:1
    };
    var DEFAULT_COLOR = [0.85, 0.85, 0.85, 1.0];

    function lower(astNodes) {
        var primitives = [];

        // -----------------------------------------------------
        //  Aggiunge una primitiva e ritorna il leaf-node.
        // -----------------------------------------------------
        function addPrim(matColMajor, color, type, params) {
            var prim = {
                matrix: colMajorToRows(matColMajor),
                color:  color.slice(),
                type:   type
            };
            if (params) prim.params = params.slice();
            var idx = primitives.length;
            primitives.push(prim);
            return { leaf: idx };
        }

        // -----------------------------------------------------
        //  Combinazione di sottoalberi (n-aria -> binaria).
        // -----------------------------------------------------
        function combineWith(subs, op) {
            subs = subs.filter(function (s) { return s !== null; });
            if (subs.length === 0) return null;
            if (subs.length === 1) return subs[0];

            if (op === 'union' || op === 'intersection') {
                var acc = subs[0];
                for (var i = 1; i < subs.length; ++i) {
                    acc = { op: op, a: acc, b: subs[i] };
                }
                return acc;
            }
            if (op === 'difference') {
                // first - union(rest)
                var rest = combineWith(subs.slice(1), 'union');
                if (rest === null) return subs[0];
                return { op: 'difference', a: subs[0], b: rest };
            }
            throw new Error("CsgParser: op sconosciuto in combineWith: " + op);
        }

        function lowerSequence(nodes, ctx, op) {
            var subs = [];
            for (var i = 0; i < nodes.length; ++i) {
                var t = lowerNode(nodes[i], ctx);
                if (t) subs.push(t);
            }
            return combineWith(subs, op);
        }

        // -----------------------------------------------------
        //  Dispatcher principale: AST node -> CSG subtree.
        // -----------------------------------------------------
        function lowerNode(node, ctx) {
            switch (node.name) {
                case 'sphere':       return lowerSphere(node, ctx);
                case 'cube':         return lowerCube(node, ctx);
                case 'cylinder':     return lowerCylinder(node, ctx);

                case 'multmatrix':
                case 'translate':
                case 'scale':
                case 'rotate':
                case 'mirror':
                    return lowerTransform(node, ctx);

                case 'color':
                    return lowerColor(node, ctx);

                case 'union':
                    return lowerSequence(node.children, ctx, 'union');
                case 'intersection':
                    return lowerSequence(node.children, ctx, 'intersection');
                case 'difference':
                    return lowerSequence(node.children, ctx, 'difference');

                case 'group':
                    // group e' implicita union (sia al root che dentro)
                    return lowerSequence(node.children, ctx, 'union');
            }

            if (REJECTED[node.name]) {
                console.warn("[CsgParser] '" + node.name +
                    "' non supportato (PDF: 'beyond CSG'). Skip subtree.");
                return null;
            }
            console.warn("[CsgParser] nodo sconosciuto '" + node.name +
                         "': skip.");
            return null;
        }

        // -----------------------------------------------------
        //  Transform: multmatrix / translate / scale / rotate / mirror.
        // -----------------------------------------------------
        function lowerTransform(node, ctx) {
            var M;
            if (node.name === 'multmatrix') {
                var rows = node.args.positional[0] ||
                           node.args.named.m;
                if (!rows || rows.length < 4) {
                    console.warn("[CsgParser] multmatrix senza matrice valida; skip");
                    return null;
                }
                M = rowsToColMajor(rows);
            } else if (node.name === 'translate') {
                var v = node.args.positional[0] || node.args.named.v;
                if (!v) return lowerSequence(node.children, ctx, 'union');
                M = mat4Translate(num(v[0]), num(v[1]), num(v[2]));
            } else if (node.name === 'scale') {
                var v2 = node.args.positional[0] || node.args.named.v;
                if (v2 === undefined || v2 === null) {
                    return lowerSequence(node.children, ctx, 'union');
                }
                if (typeof v2 === 'number') {
                    M = mat4Scale(v2, v2, v2);
                } else {
                    var sx = num(v2[0]), sy = num(v2[1], sx), sz = num(v2[2], sx);
                    M = mat4Scale(sx, sy, sz);
                }
            } else if (node.name === 'rotate') {
                var a = node.args.positional[0] || node.args.named.a;
                var v3 = node.args.positional[1] || node.args.named.v;
                if (typeof a === 'number' && v3) {
                    // angolo + asse
                    M = mat4RotateAxis(num(v3[0]), num(v3[1]), num(v3[2]),
                                       a * Math.PI / 180);
                } else if (a && a.length !== undefined) {
                    // Euler XYZ (in gradi)  ->  Rz * Ry * Rx
                    var rx = num(a[0]) * Math.PI / 180;
                    var ry = num(a[1]) * Math.PI / 180;
                    var rz = num(a[2]) * Math.PI / 180;
                    M = mat4Multiply(mat4Multiply(mat4RotateZ(rz),
                                                  mat4RotateY(ry)),
                                     mat4RotateX(rx));
                } else if (typeof a === 'number') {
                    // rotazione singola attorno a Z (default OpenSCAD)
                    M = mat4RotateZ(a * Math.PI / 180);
                } else {
                    return lowerSequence(node.children, ctx, 'union');
                }
            } else if (node.name === 'mirror') {
                var n = node.args.positional[0] || node.args.named.v;
                if (!n) return lowerSequence(node.children, ctx, 'union');
                M = mat4Mirror(num(n[0]), num(n[1]), num(n[2]));
            }

            var newCtx = {
                transform: mat4Multiply(ctx.transform, M),
                color:     ctx.color
            };
            return lowerSequence(node.children, newCtx, 'union');
        }

        // -----------------------------------------------------
        //  Color: propaga ai discendenti.
        // -----------------------------------------------------
        function lowerColor(node, ctx) {
            var c = node.args.positional[0] || node.args.named.c;
            if (typeof c === 'string') {
                // OpenSCAD color names (es. "red"). Mapping minimale.
                c = COLOR_NAMES[c.toLowerCase()] || DEFAULT_COLOR;
            }
            var newColor = ctx.color;
            if (c && c.length >= 3) {
                newColor = [num(c[0]), num(c[1]), num(c[2]),
                            c.length > 3 ? num(c[3], 1) : 1.0];
            }
            // alpha esplicito come secondo argomento di color()
            if (node.args.positional[1] !== undefined &&
                typeof node.args.positional[1] === 'number') {
                newColor[3] = node.args.positional[1];
            }
            var newCtx = { transform: ctx.transform, color: newColor };
            return lowerSequence(node.children, newCtx, 'union');
        }

        // -----------------------------------------------------
        //  Primitive
        // -----------------------------------------------------
        function lowerSphere(node, ctx) {
            var r;
            if (node.args.named.r !== undefined) r = node.args.named.r;
            else if (node.args.named.d !== undefined) r = node.args.named.d / 2;
            else if (node.args.positional.length > 0 &&
                     typeof node.args.positional[0] === 'number') {
                r = node.args.positional[0];
            } else {
                r = 1.0;
            }
            var M = mat4Multiply(ctx.transform, mat4Scale(r, r, r));
            return addPrim(M, ctx.color, 0);
        }

        function lowerCube(node, ctx) {
            var size = node.args.named.size;
            if (size === undefined) size = node.args.positional[0];
            if (size === undefined) size = 1.0;
            var sx, sy, sz;
            if (typeof size === 'number') {
                sx = sy = sz = size;
            } else {
                sx = num(size[0], 1);
                sy = num(size[1], 1);
                sz = num(size[2], 1);
            }
            var center = node.args.named.center;
            if (center === undefined && node.args.positional[1] !== undefined) {
                center = node.args.positional[1];
            }
            if (center === undefined) center = false;

            var local = mat4Scale(sx, sy, sz);
            if (center) {
                // cube canonico: min-corner all'origine (ottante +++)
                // per centrarlo: T(-sx/2, -sy/2, -sz/2) * S(sx,sy,sz)
                local = mat4Multiply(
                    mat4Translate(-sx / 2, -sy / 2, -sz / 2), local);
            }
            var M = mat4Multiply(ctx.transform, local);
            return addPrim(M, ctx.color, 1);
        }

        function lowerCylinder(node, ctx) {
            var a = node.args.named;
            var h  = (a.h !== undefined) ? a.h : 1.0;
            var r  = a.r;
            var r1 = a.r1, r2 = a.r2;
            if (r !== undefined) { r1 = r; r2 = r; }
            if (r1 === undefined && r2 === undefined) {
                // cilindro(h, r) o cylinder(h, r1, r2): positional fallback
                if (node.args.positional[1] !== undefined) r1 = node.args.positional[1];
                if (node.args.positional[2] !== undefined) r2 = node.args.positional[2];
                if (r1 === undefined) r1 = 1.0;
                if (r2 === undefined) r2 = r1;
            } else {
                if (r1 === undefined) r1 = r2;
                if (r2 === undefined) r2 = r1;
            }
            var center = a.center;
            if (center === undefined) center = false;

            var EPS = 1e-9;

            if (Math.abs(r1 - r2) < EPS) {
                // cilindro normale (type=2)
                var local = mat4Scale(r1, r1, h);
                if (center) {
                    local = mat4Multiply(mat4Translate(0, 0, -h / 2), local);
                }
                var M = mat4Multiply(ctx.transform, local);
                return addPrim(M, ctx.color, 2);
            }

            // truncated cone (type=3): canonical frustum
            //   base radius 1 a z=0, top radius R a z=1
            //   matrix esterna: scale (r1, r1, h)
            //   parametro: R = r2 / r1
            var localF = mat4Scale(r1, r1, h);
            if (center) {
                localF = mat4Multiply(mat4Translate(0, 0, -h / 2), localF);
            }
            var MF = mat4Multiply(ctx.transform, localF);
            return addPrim(MF, ctx.color, 3, [r2 / r1]);
        }

        // -----------------------------------------------------
        //  helper: convert undef to default, parse number-ish.
        // -----------------------------------------------------
        function num(x, dflt) {
            if (x === undefined || x === null) {
                return (dflt !== undefined) ? dflt : 0;
            }
            return +x;
        }

        // -----------------------------------------------------
        //  Avvio
        // -----------------------------------------------------
        var ctx0 = { transform: mat4Identity(), color: DEFAULT_COLOR };
        var tree = lowerSequence(astNodes, ctx0, 'union');

        if (tree === null) {
            throw new Error("CsgParser: la scena non contiene primitive valide.");
        }

        return { primitives: primitives, tree: tree };
    }

    // Mappa dei pochi nomi di colore che OpenSCAD accetta come stringa.
    var COLOR_NAMES = {
        red:    [1, 0, 0, 1],
        green:  [0, 1, 0, 1],
        blue:   [0, 0, 1, 1],
        yellow: [1, 1, 0, 1],
        cyan:   [0, 1, 1, 1],
        magenta:[1, 0, 1, 1],
        white:  [1, 1, 1, 1],
        black:  [0, 0, 0, 1],
        gray:   [0.5, 0.5, 0.5, 1],
        grey:   [0.5, 0.5, 0.5, 1],
        orange: [1, 0.6, 0, 1]
    };

    // ===========================================================
    //   ----- API pubblica -----
    // ===========================================================
    function parse(text) {
        if (typeof text !== 'string') {
            throw new Error("CsgParser.parse: serve una stringa di testo .csg");
        }
        var tokens = tokenize(text);
        var p = new Parser(tokens);
        var ast = p.parseProgram();
        return lower(ast);
    }

    return {
        parse:    parse,
        tokenize: tokenize     // esposto per debug/test
    };

})();
