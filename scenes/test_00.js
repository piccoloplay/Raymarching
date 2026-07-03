// scenes/test_00.js  -  una singola sfera (PDF roadmap step 2-3)

CsgScenes['test_00'] = {
    name: 'test_00',
    description: 'Una singola sfera (PDF roadmap step 2-3).',
    primitives: [
        {
            matrix: TS(0, 0, 0,  2),                // scale 2, no traslazione
            color:  [0.90, 0.12, 0.10, 1.0],   // rosso pieno
            type:   0                                // sphere
        }
    ],
    tree: L(0)
};
