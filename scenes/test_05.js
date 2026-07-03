// scenes/test_05.js  -  INTERSECTION di due sfere (PDF roadmap step 6)
// La forma risultante e' una "lente" (lens shape).

CsgScenes['test_05'] = {
    name: 'test_05',
    description: 'Intersezione di due sfere -> forma a lente.',
    primitives: [
        { matrix: TS(-0.6, 0, 0,  1.4),  color: [0.85, 0.65, 0.30, 1], type: 0 },
        { matrix: TS( 0.6, 0, 0,  1.4),  color: [0.30, 0.75, 0.55, 1], type: 0 }
    ],
    tree: I(L(0), L(1))
};
