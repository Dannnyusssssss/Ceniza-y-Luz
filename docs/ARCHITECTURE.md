# Arquitectura

Ceniza y Luz es un juego web de una sola página, sin backend. Una lógica de juego pura, sin dependencias del navegador, avanza a ritmo fijo; una capa de presentación con Babylon.js y el DOM lee ese estado y lo dibuja. Casi todo lo que cambia de una zona a otra (mapas, enemigos, puzzles, textos, equilibrio) son datos.

## Mapa de carpetas

| Carpeta       | Contenido                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `src/data/`   | Datos tipados: zonas, enemigos, jefes, objetos, puzzles, textos, equilibrio, calidad y música.   |
| `src/core/`   | Utilidades sin motor gráfico: bucle de paso fijo, azar con semilla, entrada, ajustes y sistemas. |
| `src/game/`   | Lógica pura: combate, enemigos, jefes, inventario, puzzles, progreso y guardado.                 |
| `src/world/`  | Lógica pura del mundo: colisión, terreno, decoración repartida y cámara.                         |
| `src/engine/` | Babylon.js y composición de una partida: motor, escena, modelos, sistemas y efectos.             |
| `src/render/` | Vistas: personajes, enemigos, jefes, objetos, entorno, materiales y partículas.                  |
| `src/audio/`  | Efectos y música sintetizados con WebAudio, sin archivos de sonido.                              |
| `src/ui/`     | Interfaz en el DOM: menús, HUD, diálogos, ajustes y coordinación de pantallas.                   |
| `art/`        | Fuentes de arte: scripts de Blender y archivos `.blend`.                                         |
| `public/`     | Archivos que se publican tal cual: modelos `.glb`, texturas de caras, favicon y portada.         |
| `tests/`      | Pruebas de la lógica pura con Vitest.                                                            |

## Capas

```
data  <-  core  <-  game / world  <-  render / audio / ui  <-  main
                                       (engine compone)
```

Las dependencias van en un solo sentido. `src/game/` y `src/world/` no importan Babylon.js, ni el DOM, ni `localStorage`. Esa separación permite probar el combate, los jefes, los puzzles y el guardado sin abrir un navegador, y hace que las pruebas sean reproducibles: el azar usa un generador con semilla y el tiempo se pasa como parámetro.

La presentación lee el estado y lo dibuja, pero no lo cambia. Por ejemplo, `src/game/regent.ts` decide qué hace el jefe final y `src/render/regentView.ts` lo muestra; `src/engine/regentRunner.ts` los conecta con el resto de la partida.

## Flujo principal

`src/main.ts` crea el motor gráfico y la partida, y arranca el bucle de render:

1. `FixedStepLoop` (`src/core/loop.ts`) acumula el tiempo real y ejecuta los pasos de lógica a 60 Hz.
2. `SystemRegistry` (`src/core/systems.ts`) ejecuta los sistemas en un orden declarado: jugador, combate, muñeco, cámara, render e interfaz. Se registran en un solo lugar, `src/engine/sessionSystems.ts`.
3. Cada fotograma se dibuja interpolando entre los dos últimos pasos de lógica, de modo que el movimiento es suave a cualquier frecuencia de pantalla.

`GameSession` (`src/engine/session.ts`) compone una partida; `SessionView` (`src/engine/sessionView.ts`) dibuja; `SessionEvents` (`src/engine/sessionEvents.ts`) atiende los efectos de lo que ocurre; y `App` (`src/ui/app.ts`) coordina las pantallas: inicio, elección de personaje, juego, diálogos, pausa y final.

La lógica comunica lo que ocurre mediante listas de eventos que devuelve cada función. El sonido, los efectos y los avisos en pantalla los atienden después, así cada señal sonora importante tiene también su señal visual.

## Decisiones de diseño

- **Babylon.js con WebGPU y respaldo a WebGL2.** Aporta materiales, sombras y efectos de posproceso, y permite usar el motor más moderno que admita cada navegador. Se importa por módulos para que el empaquetador elimine lo que no se usa.
- **Estilo anime con modelos de Blender.** Los personajes, enemigos y objetos se generan con scripts propios (`art/blender/`), con esqueleto, sombreado de dos tonos y contorno. El entorno se crea por código. Las animaciones de ataque duran lo que indican los datos del juego, y una prueba comprueba que coinciden.
- **Colisión propia.** Un círculo contra rectángulos y una función de alturas del suelo bastan para este mundo, sin el peso de un motor de física.
- **Cámara propia.** Solo la mueve el jugador; nunca gira sola. Las escenas de la intro y del final son planos fijos que cambian cuando el jugador avanza el texto.
- **Guardado versionado.** `src/game/save.ts` guarda con un número de versión, migra los formatos antiguos y valida cada campo contra los datos del juego, de modo que un guardado corrupto o manipulado no rompe la partida.
- **Sonido sintetizado.** Todo se genera con WebAudio, sin archivos. El juego se puede completar sin sonido.
- **Seguridad del jugador.** Los destellos pasan por un limitador de 3 por segundo y se pueden desactivar. Los cambios de luz del jefe final son graduales.
- **Sin servicios externos.** Todo sale de `dist/`. La política de seguridad de contenido se aplica con una etiqueta `<meta>` en el build, y los compiladores de shaders remotos del motor están desactivados.

## Rendimiento

Cada zona tiene un presupuesto de 4 luces, un generador de sombras y 150 llamadas de dibujo. Las mallas repetidas usan instancias finas, y lo que crea una zona se libera al salir de ella.

Los ajustes ofrecen tres calidades (`src/data/quality.ts`) y un límite de FPS que salta refrescos enteros de la pantalla para evitar tirones. La resolución dinámica (`src/core/resolutionGovernor.ts`) baja la resolución interna si los FPS quedan por debajo de 50 durante 10 segundos; se puede desactivar y vuelve a la resolución completa al cambiar de calidad.

## Pruebas

`npm run test` ejecuta las pruebas de `tests/`, que cubren la lógica pura: combate, enemigos, jefes, inventario, economía, puzzles, colisión, bucle de paso fijo, guardado y migraciones, además de la coherencia de los datos (por ejemplo, que todo puzzle tenga solución y que los objetivos de cada zona sean alcanzables). El render, el audio y la sensación de juego se comprueban jugando.

## Cómo se extiende

- **Una zona:** se añade como `ZoneData` (véase `src/data/zoneFortaleza.ts`), con su identificador en `src/data/zones.ts`, su paleta en `src/data/palettes.ts`, su música en `src/data/music.ts` y su nombre en `src/data/texts.ts`.
- **Un enemigo:** sus estadísticas van en `src/data/enemies.ts` y su modelo en `art/blender/enemies/`, con los mismos clips que los demás.
- **Un objeto:** se define en `src/data/items.ts` y se coloca en el cofre o la tienda que corresponda.
- **Un puzzle:** se añade a `src/data/puzzles.ts` (secuencia o bloques). Una prueba comprueba que los de bloques tengan solución.

El compilador de TypeScript avisa de los textos o datos que falten, porque varias tablas se comprueban contra los identificadores de zona.

## Límites conocidos

- Requiere teclado y un navegador de escritorio con WebGPU o WebGL2.
- La política de seguridad de contenido va en una etiqueta `<meta>`. Por ese medio no se pueden fijar `frame-ancestors`, `X-Frame-Options`, HSTS ni `Permissions-Policy`: dependen del alojamiento.
- Dentro de un `iframe` con `allow-same-origin`, el juego conserva el acceso a su propio origen. Ese atributo no lo aísla.
- Los datos guardados pertenecen al origen desde el que se juega y no se comparten entre navegadores ni dominios.
