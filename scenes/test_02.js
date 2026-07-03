// scenes/test_02.js  -  UNION di due sfere (PDF roadmap step 5)

CsgScenes['test_02'] = {
    name: 'test_02',
    description: 'Union di due sfere parzialmente sovrapposte.',
    primitives: [
        { matrix: TS(-0.8, 0, 0,  1.2),  color: [0.85, 0.35, 0.35, 1], type: 0 },
        { matrix: TS( 0.8, 0, 0,  1.2),  color: [0.30, 0.55, 0.85, 1], type: 0 }
    ],
    tree: U(L(0), L(1))
};
