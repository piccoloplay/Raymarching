// scenes/test_07.js  -  DIFFERENCE (PDF roadmap step 7)
// Sfera con un cubo sottratto dal basso: si vede l'interno scavato.

CsgScenes['test_07'] = {
    name: 'test_07',
    description: 'Sfera - cubo: la sottrazione mostra la cavita\' interna.',
    primitives: [
        { matrix: TS(0,    0,    0,    1.6),                     // sfera
          color:  [0.80, 0.75, 0.30, 1], type: 0 },
        { matrix: TS(0.2, -1.5, 0.2,  1.4),                      // cubo
          color:  [0.10, 0.10, 0.10, 1], type: 1 }
    ],
    tree: D(L(0), L(1))
};
