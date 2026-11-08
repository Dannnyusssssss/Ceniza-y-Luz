// Archivo generado por `npm run art`. No editar a mano.
// Clips de animación, huesos y triángulos de cada modelo exportado desde Blender.

export const MODELS = {
  blade: {
    model: 'blade',
    clips: {},
    bones: [],
    triangles: 396,
    textures: [],
  },
  alba: {
    model: 'alba',
    clips: {
      idle: {
        frames: 120,
        seconds: 2,
      },
      walk: {
        frames: 60,
        seconds: 1,
      },
      run: {
        frames: 38,
        seconds: 0.6333333333333333,
      },
      dodge: {
        frames: 26,
        seconds: 0.43333333333333335,
      },
      attack1: {
        frames: 26,
        seconds: 0.43333333333333335,
      },
      attack2: {
        frames: 26,
        seconds: 0.43333333333333335,
      },
      attack3: {
        frames: 38,
        seconds: 0.6333333333333333,
      },
      hurt: {
        frames: 24,
        seconds: 0.4,
      },
      fall: {
        frames: 60,
        seconds: 1,
      },
    },
    bones: [
      'root',
      'hips',
      'spine',
      'chest',
      'neck',
      'head',
      'hair.1',
      'hair.2',
      'cape',
      'scarf',
      'shoulder.L',
      'upperarm.L',
      'forearm.L',
      'hand.L',
      'shoulder.R',
      'upperarm.R',
      'forearm.R',
      'hand.R',
      'thigh.L',
      'shin.L',
      'foot.L',
      'thigh.R',
      'shin.R',
      'foot.R',
    ],
    triangles: 27132,
    textures: ['alba-face.png'],
  },
  ciro: {
    model: 'ciro',
    clips: {
      idle: {
        frames: 120,
        seconds: 2,
      },
      walk: {
        frames: 60,
        seconds: 1,
      },
      run: {
        frames: 38,
        seconds: 0.6333333333333333,
      },
      dodge: {
        frames: 26,
        seconds: 0.43333333333333335,
      },
      attack1: {
        frames: 26,
        seconds: 0.43333333333333335,
      },
      attack2: {
        frames: 26,
        seconds: 0.43333333333333335,
      },
      attack3: {
        frames: 38,
        seconds: 0.6333333333333333,
      },
      hurt: {
        frames: 24,
        seconds: 0.4,
      },
      fall: {
        frames: 60,
        seconds: 1,
      },
    },
    bones: [
      'root',
      'hips',
      'spine',
      'chest',
      'neck',
      'head',
      'hair.1',
      'hair.2',
      'cape',
      'scarf',
      'shoulder.L',
      'upperarm.L',
      'forearm.L',
      'hand.L',
      'shoulder.R',
      'upperarm.R',
      'forearm.R',
      'hand.R',
      'thigh.L',
      'shin.L',
      'foot.L',
      'thigh.R',
      'shin.R',
      'foot.R',
    ],
    triangles: 29764,
    textures: ['ciro-face.png'],
  },
  dummy: {
    model: 'dummy',
    clips: {},
    bones: [],
    triangles: 3740,
    textures: [],
  },
} as const;
