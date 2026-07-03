// ============================================================
//  csg-autoload.js
//  ------------------------------------------------------------
//  Allo startup: scorre CSG_EMBEDDED (mappa "nome.csg" -> testo)
//  e, per ogni voce, chiama CsgParser.parse() e registra il
//  risultato in CsgScenes con la chiave "nome.csg".
//
//  Funziona offline (file://): nessun fetch, tutto inlinato dal
//  manifest generato da tools/build-csg-manifest.ps1.
//
//  Per caricare un .csg ad-hoc senza rigenerare il manifest,
//  vedi gli handler di file input e drag-drop in js/main.js.
// ============================================================

(function () {
    if (typeof CsgParser !== 'object' || typeof CsgParser.parse !== 'function') {
        console.warn('[csg-autoload] CsgParser non caricato; skip autoload.');
        return;
    }
    if (typeof CsgScenes === 'undefined') {
        console.warn('[csg-autoload] CsgScenes non disponibile; skip.');
        return;
    }
    if (typeof CSG_EMBEDDED !== 'object' || CSG_EMBEDDED === null) {
        // nessun manifest -> non e' un errore; magari l'utente
        // usa solo le scene .js o il drag-drop a runtime.
        return;
    }

    var loaded = 0, failed = 0;
    var names = Object.keys(CSG_EMBEDDED);
    for (var i = 0; i < names.length; ++i) {
        var name = names[i];
        try {
            var scene = CsgParser.parse(CSG_EMBEDDED[name]);
            scene.name = name;
            CsgScenes[name] = scene;
            loaded++;
        } catch (e) {
            console.error('[csg-autoload] errore parsing "' + name +
                          '": ' + e.message);
            failed++;
        }
    }
    console.log('[csg-autoload] caricate ' + loaded + ' scene .csg' +
                (failed ? ' (' + failed + ' fallite)' : ''));
})();
