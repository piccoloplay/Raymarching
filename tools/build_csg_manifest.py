#!/usr/bin/env python3
# ============================================================
#  build_csg_manifest.py
#  ------------------------------------------------------------
#  Scansiona csg/*.csg e produce csg/manifest.js con tutti i
#  contenuti embedded come stringhe JS.
#
#  Esecuzione (dalla cartella webgl/):
#      python tools/build_csg_manifest.py
#  oppure (PowerShell):
#      py tools/build_csg_manifest.py
#
#  L'autoloader (js/csg-autoload.js) legge la mappa CSG_EMBEDDED
#  prodotta da questo script e registra ogni .csg in CsgScenes.
# ============================================================

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEBGL_ROOT = os.path.dirname(HERE)
CSG_DIR = os.path.join(WEBGL_ROOT, 'csg')
OUT_PATH = os.path.join(CSG_DIR, 'manifest.js')

def main() -> int:
    if not os.path.isdir(CSG_DIR):
        print(f'Cartella non trovata: {CSG_DIR}', file=sys.stderr)
        return 1

    files = sorted(
        f for f in os.listdir(CSG_DIR)
        if f.endswith('.csg') and os.path.isfile(os.path.join(CSG_DIR, f))
    )

    entries = {}
    for fname in files:
        with open(os.path.join(CSG_DIR, fname), 'r', encoding='utf-8') as fp:
            entries[fname] = fp.read()

    # json.dumps con indent=2 produce un letterale JS valido (stesso
    # subset). Usiamo ensure_ascii=False per tenere i caratteri unicode.
    payload = json.dumps(entries, indent=2, ensure_ascii=False)

    header = (
        '// csg/manifest.js  -  GENERATO automaticamente da '
        'tools/build_csg_manifest.py\n'
        '// Mappa "nome.csg" -> contenuto testuale; viene letta da '
        'js/csg-autoload.js\n'
        '// Per rigenerare:    python tools/build_csg_manifest.py\n'
        '\n'
        'var CSG_EMBEDDED = '
    )

    with open(OUT_PATH, 'w', encoding='utf-8') as out:
        out.write(header)
        out.write(payload)
        out.write(';\n')

    print(f'Generato {OUT_PATH}')
    for fname in files:
        print(f'  - {fname}  ({len(entries[fname])} bytes)')
    print(f'Totale: {len(files)} file.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
