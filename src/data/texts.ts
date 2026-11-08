import type { CharacterId } from './characters';
import type { NpcId, SignTextId, ZoneId } from './zones';

/** Quién habla: el protagonista, su gemelo, el narrador o un aldeano. */
export type Speaker = 'player' | 'sibling' | 'narrator' | NpcId;

/** Texto que cambia con el personaje elegido (voz de Alba o de Ciro), o igual para los dos. */
export type LineText = string | Readonly<Record<CharacterId, string>>;

export interface DialogueLine {
  readonly speaker: Speaker;
  readonly text: LineText;
}

export type Dialogue = readonly DialogueLine[];

/** Todos los textos visibles del juego. */
export const TEXTS = {
  errors: {
    noGraphics:
      'Tu navegador no puede mostrar gráficos 3D (WebGL2 o WebGPU no están disponibles). Prueba con un navegador de escritorio actualizado o activa la aceleración por hardware.',
    contextLost: 'Se perdió el acceso a la tarjeta gráfica. Intentando recuperarlo…',
    contextRestored: 'Gráficos recuperados.',
    startFailed: 'No se pudo iniciar el juego. Recarga la página para intentarlo de nuevo.',
  },
  loading: {
    /** Se muestra con el porcentaje cargado. */
    progress: (percent: number) => `Cargando… ${percent} %`,
  },
  start: {
    subtitle: 'La Bruma se llevó a tu gemelo. Toma la Hoja de Luz y ve a buscarlo.',
    noticeTitle: 'Aviso de contenido',
    notice:
      'Fantasía oscura con combate contra criaturas que se desvanecen en ceniza. Sin sangre. Edad orientativa: 13+.',
    controlsTitle: 'Controles',
    play: 'Empezar',
    continueGame: 'Continuar',
    newGame: 'Nueva partida',
    newGameConfirm: '¿Empezar de cero? La partida guardada se perderá.',
    newGameYes: 'Sí, empezar de cero',
    newGameNo: 'Cancelar',
    settings: 'Ajustes',
    keyboardExit: 'Pulsa Tab para salir del juego con el teclado.',
  },
  controls: [
    ['W A S D', 'Moverse'],
    ['Mayús (mantener)', 'Caminar'],
    ['Ratón o flechas', 'Mover la cámara'],
    ['Clic izquierdo o J', 'Atacar (pulsa varias veces para un combo de 3 golpes)'],
    ['Espacio', 'Esquivar'],
    ['E', 'Hablar, abrir, empujar, descansar'],
    ['I', 'Inventario'],
    ['Esc o P', 'Pausa'],
    ['M', 'Silencio'],
  ] as readonly (readonly [string, string])[],
  select: {
    title: 'Elige a tu protagonista',
    hint: 'Tu gemelo será quien debas rescatar.',
    confirm: 'Jugar con',
    back: 'Volver',
  },
  pause: {
    title: 'Pausa',
    resume: 'Continuar',
    settings: 'Ajustes',
    controls: 'Controles',
    toStart: 'Volver al inicio',
    pointerHint:
      'Al continuar se captura el ratón. Si tu navegador no lo permite, usa las flechas para la cámara.',
  },
  settings: {
    title: 'Ajustes',
    back: 'Volver',
    muted: 'Silencio',
    reduceFlashing: 'Reducir parpadeo (sin destellos de golpe)',
    reduceMotion: 'Reducir movimiento (sin sacudida de cámara y con menos balanceo)',
    sensitivity: 'Sensibilidad de la cámara',
    invertY: 'Invertir el eje vertical de la cámara',
    fov: 'Campo de visión',
    fovUnit: '°',
    quality: 'Calidad gráfica',
    qualityOptions: { low: 'Baja', medium: 'Media', high: 'Alta' },
    fpsLimit: 'Límite de FPS',
    fpsLimitOptions: {
      auto: 'Automático (recomendado)',
      saver: 'Ahorro (menos consumo)',
      off: 'Sin límite (hasta el máximo de la pantalla)',
    },
    textSize: 'Tamaño del texto',
    textSizeOptions: { normal: 'Normal', large: 'Grande', xlarge: 'Muy grande' },
    damageTaken: 'Daño recibido',
    damageTakenOptions: { normal: 'Normal', reduced: 'Reducido (la mitad)' },
    saveFailed:
      'No se pudieron guardar los ajustes en este navegador. Seguirán activos hasta que cierres la página.',
    clearData: 'Borrar datos guardados en este navegador',
    clearConfirm: '¿Seguro? Se borrarán los ajustes y la partida guardada.',
    clearYes: 'Sí, borrar',
    clearNo: 'Cancelar',
    cleared: 'Datos borrados. Se usan los ajustes iniciales y ya no hay partida guardada.',
  },
  hud: {
    dummyName: 'Muñeco de práctica',
    health: 'Vida',
    dummyDown: 'Muñeco de práctica: reapareciendo…',
    muted: 'Silencio activado',
    pointerHint: 'Clic en el juego: capturar el ratón · Flechas: cámara · Esc o P: pausa',
    lockedHint: 'Esc o P: pausa',
    hearts: 'Corazones',
    of: 'de',
    sparks: 'Chispas',
    wave: 'Oleada',
    enemies: 'Enemigos',
    nextWave: 'Siguiente oleada en',
    seconds: 's',
    dodgeReady: 'Esquiva lista',
    dodgeWait: 'Esquiva recargando',
    waveStarted: (n: number) => `Oleada ${n}`,
    waveCleared: (n: number) => `¡Oleada ${n} superada!`,
    potions: 'Pociones',
    objective: 'Objetivo',
  },
  death: {
    title: 'Has caído',
    text: 'La Bruma te ha vencido esta vez. Vuelves al último faro con todo lo que llevabas.',
    arenaText: 'La Bruma te ha vencido esta vez. Vuelve a intentarlo desde el comienzo de la oleada.',
    retry: 'Reintentar',
    toStart: 'Volver al inicio',
  },
  dialogue: {
    next: 'Seguir',
    close: 'Cerrar',
    skip: 'Saltar la introducción',
    hint: 'E, Intro o clic para seguir',
  },
  prompts: {
    key: 'E',
    talk: (name: string) => `Hablar con ${name}`,
    chest: 'Abrir el cofre',
    beacon: 'Descansar en el faro',
    altar: 'Tomar la Hoja de Luz',
    sign: 'Leer',
    gate: 'Examinar la puerta',
    gateKey: 'Abrir con la llave',
    switchStone: (symbol: string) => `Activar la piedra ${symbol}`,
    block: 'Empujar el bloque',
    reset: 'Devolver el bloque a su sitio',
  },
  symbols: { sol: 'del Sol', luna: 'de la Luna', estrella: 'de la Estrella' },
  world: {
    zones: {
      lumbre: 'Lumbre',
      bosque: 'Bosque de Luciérnagas',
      arena: 'Arena de práctica',
    } satisfies Record<ZoneId, string>,
    chest: {
      sparks: (n: number) => `Has encontrado ${n} chispas.`,
      temple: (level: number) => `La Hoja de Luz se templa: ahora es de temple ${level}.`,
      templeFull: 'Tu Hoja ya está al máximo: el cofre te da chispas.',
      fragment: (count: number, needed: number) => `Fragmento de corazón (${count} de ${needed}).`,
      heart: '¡Fragmentos completos! Tienes un corazón más.',
      key: 'Has encontrado la Llave del Claro.',
      potion: (n: number) => (n === 1 ? 'Has encontrado una poción.' : `Has encontrado ${n} pociones.`),
      potionFull: 'No te caben más pociones: las que sobran se pagan en chispas.',
    },
    restSaved: 'Descansas junto al faro. Vida recuperada y partida guardada.',
    restFailed: 'Descansas junto al faro. No se pudo guardar en este navegador.',
    autosaveFailed: 'No se pudo guardar en este navegador.',
    bladeTaken: 'Has tomado la Hoja de Luz. Ya puedes atacar. El portal del norte se abre.',
    gateOpen: 'La puerta se abre.',
    gateLocked: {
      key: 'Está cerrada con llave. Debe de haber una en algún cofre.',
      puzzle: 'No se abre desde aquí: algo cerca debe de accionarla.',
      flag: 'El portal está cerrado. Primero toma la Hoja de Luz del santuario.',
      ability: 'Hace falta una habilidad que aún no tienes.',
    },
    switchOk: 'La piedra se enciende.',
    switchWrong: 'Las piedras se apagan: ese no era el orden. Mira de nuevo el mural.',
    blockStuck: 'El bloque no se mueve hacia ahí.',
    puzzleSolved: '¡Resuelto! Algo se ha abierto.',
    puzzleReset: 'El bloque vuelve a su sitio.',
    saved: 'Partida guardada.',
  },
  objectives: {
    blade: 'Toma la Hoja de Luz del santuario, al noroeste de la aldea.',
    forest: 'Cruza el portal del norte y entra en el Bosque de Luciérnagas.',
    blocks: 'Empuja el bloque hasta la plataforma para abrir la puerta del muro.',
    key: 'Busca la llave en un cofre, al noreste del bosque.',
    clearing: 'Usa la llave en la puerta del claro, al oeste.',
    mist: 'Sigue el camino hacia el norte, hasta la barrera de Bruma.',
  },
  signs: {
    portal: 'Portal del Bosque. Cerrado hasta nueva orden de la guardiana. Quien salga, que salga armado.',
    muneco: 'Muñeco de práctica. Golpéalo con la Hoja las veces que quieras: no se queja.',
    bosqueEntrada:
      'Bosque de Luciérnagas. Si te pierdes, sigue el camino de tierra. Si te caes, vuelve al faro.',
    simbolos: 'El mural guarda el orden: de arriba abajo. Activa las piedras igual y la alcoba se abrirá.',
    bloques:
      'El bloque pesa, pero cede. Colócate detrás, pulsa E y llévalo hasta la plataforma que brilla. Si se atasca, la piedra de la entrada lo devuelve a su sitio.',
    claro: 'Claro interior. La llave está donde el camino se acaba, al noreste.',
    bruma: 'La Bruma cierra el paso a la Ciénaga de Ecos. Por ahora no hay forma de cruzarla.',
  } satisfies Record<SignTextId, string>,
  shop: {
    title: 'Tienda de Oren',
    sparks: (n: number) => `Tienes ${n} chispas`,
    buy: 'Comprar',
    sell: (price: number) => `Vender una poción (+${price} chispas)`,
    noSell: 'No tienes pociones que vender',
    close: 'Salir de la tienda',
    bought: (name: string) => `Has comprado: ${name}.`,
    sold: 'Has vendido una poción.',
    price: (n: number) => `${n} chispas`,
    soldOut: 'Agotado',
    reasons: {
      sparks: 'Te faltan chispas',
      limit: 'No te caben más',
      soldOut: 'Agotado',
    },
    items: {
      potion: { name: 'Poción', text: 'Cura 2 corazones. Se bebe desde el inventario.' },
      temple: { name: 'Temple de la Hoja', text: 'Sube un nivel el temple: la Hoja hace más daño.' },
      talisman: { name: 'Talismán de Brasa', text: 'La esquiva se recarga un 25 % más rápido.' },
    },
  },
  inventory: {
    title: 'Inventario',
    hearts: (hearts: number) => `Corazones máximos: ${hearts}`,
    fragments: (count: number, needed: number) => `Fragmentos de corazón: ${count % needed} de ${needed}`,
    temple: (level: number, max: number) => `Temple de la Hoja: ${level} de ${max}`,
    noBlade: 'Aún no tienes la Hoja de Luz.',
    sparks: (n: number) => `Chispas: ${n}`,
    potions: (n: number, max: number) => `Pociones: ${n} de ${max}`,
    drink: 'Beber una poción',
    drunk: 'Te sientes mejor.',
    fullLife: 'Tu vida ya está llena.',
    noPotions: 'No te quedan pociones.',
    keys: 'Llaves',
    keyName: 'Llave del Claro',
    noKeys: 'Ninguna',
    specials: 'Objetos especiales',
    talisman: 'Talismán de Brasa: la esquiva se recarga antes.',
    noSpecials: 'Ninguno',
    close: 'Cerrar',
  },
  debug: {
    title: 'Depuración',
    fps: 'FPS',
    logic: 'Lógica (ms)',
    render: 'Render (ms)',
    drawCalls: 'Llamadas de dibujo',
    lights: 'Luces activas',
    meshes: 'Mallas activas',
    backend: 'Motor',
    quality: 'Calidad',
    gpu: 'Gráfica',
    resolution: 'Resolución interna',
    refresh: 'Refresco de pantalla (Hz)',
    unknown: 'desconocida',
  },
} as const;

/** Lo que dice cada aldeano, antes y después de tomar la Hoja. Cambia con la voz del personaje elegido. */
export const DIALOGUES: Readonly<Record<NpcId, { readonly before: Dialogue; readonly after: Dialogue }>> = {
  ilse: {
    before: [
      { speaker: 'ilse', text: 'Te he visto levantarte. Bien. Lumbre aún respira, y tú también.' },
      {
        speaker: 'player',
        text: {
          alba: '¡Se lo llevaron, Ilse! Dime por dónde fueron y voy ahora mismo.',
          ciro: 'Se han llevado a Alba. Dime por dónde y no me digas que espere.',
        },
      },
      {
        speaker: 'ilse',
        text: 'Hacia el norte, a la Fortaleza del Eclipse. Pero con las manos vacías no llegarás ni al bosque.',
      },
      {
        speaker: 'ilse',
        text: 'La Hoja de Luz está en el santuario, detrás de mí. Tómala. Te estaba esperando, aunque tardaras en saberlo.',
      },
    ],
    after: [
      { speaker: 'ilse', text: 'Te queda bien. Prueba el filo con el muñeco del patio antes de salir.' },
      {
        speaker: 'ilse',
        text: 'Si caes, los faros te traerán de vuelta. Descansa en ellos: guardan lo que has hecho y curan lo que te han hecho.',
      },
    ],
  },
  oren: {
    before: [
      { speaker: 'oren', text: 'Ni la Bruma me hace cerrar el puesto. ¿Vienes a mirar o a comprar?' },
      {
        speaker: 'player',
        text: { alba: 'A las dos cosas, si no sales muy caro.', ciro: 'Depende de lo que pidas.' },
      },
    ],
    after: [
      {
        speaker: 'oren',
        text: 'Vaya, la Hoja. Con eso sacarás chispas de la Bruma: a mí me sirven igual que las de siempre.',
      },
    ],
  },
  teo: {
    before: [
      {
        speaker: 'teo',
        text: {
          alba: 'Alba… vi cómo se llevaban a Ciro. Quise gritar y no me salió la voz.',
          ciro: 'Ciro… vi cómo se llevaban a Alba. Quise gritar y no me salió la voz.',
        },
      },
      {
        speaker: 'teo',
        text: 'La señora Ilse está junto al santuario. Dijo que fueras en cuanto despertaras.',
      },
    ],
    after: [
      {
        speaker: 'teo',
        text: 'En el huerto de la casa del este alguien dejó un cofre. A mí no me dejan abrirlo.',
      },
      {
        speaker: 'teo',
        text: 'Tráelo de vuelta, ¿vale? Y ten cuidado con las piedras del bosque: dicen que hay que tocarlas en orden.',
      },
    ],
  },
};

/** La intro, plano a plano. La usa `data/intro.ts`. */
export const INTRO_LINES = {
  night: [
    { speaker: 'narrator', text: 'Lumbre es una aldea pequeña, y aquella noche dormía como cualquier otra.' },
    {
      speaker: 'narrator',
      text: {
        alba: 'Alba y su gemelo Ciro seguían despiertos en la plaza, discutiendo por nada, como siempre.',
        ciro: 'Ciro y su gemela Alba seguían despiertos en la plaza, discutiendo por nada, como siempre.',
      },
    },
  ],
  smell: [
    {
      speaker: 'sibling',
      text: { alba: 'Alba, para un momento. ¿Hueles eso?', ciro: 'Ciro, calla un momento. ¿Hueles eso?' },
    },
    {
      speaker: 'player',
      text: {
        alba: 'Huele a ceniza… pero nadie ha encendido nada.',
        ciro: 'Ceniza. Y nadie ha encendido nada.',
      },
    },
  ],
  attack: [
    {
      speaker: 'narrator',
      text: 'La Bruma bajó de los montes sin hacer ruido: una niebla de ceniza que parecía saber adónde iba.',
    },
    { speaker: 'narrator', text: 'De ella salieron formas que no debían moverse. Y se movían.' },
  ],
  taken: [
    {
      speaker: 'sibling',
      text: { alba: '¡Alba! ¡No me sueltes!', ciro: '¡Ciro! ¡No te quedes ahí, corre!' },
    },
    {
      speaker: 'narrator',
      text: {
        alba: 'Algo golpeó a Alba contra el suelo. Lo último que vio fue a Ciro desapareciendo en la Bruma.',
        ciro: 'Algo golpeó a Ciro contra el suelo. Lo último que vio fue a Alba desapareciendo en la Bruma.',
      },
    },
  ],
  after: [
    {
      speaker: 'narrator',
      text: 'Una voz de ceniza dijo un solo nombre, y toda la niebla le obedeció: el Regente del Eclipse.',
    },
    { speaker: 'ilse', text: 'Levántate. Ya amanece. Ven al santuario cuando puedas sostenerte en pie.' },
  ],
} as const satisfies Readonly<Record<string, Dialogue>>;
