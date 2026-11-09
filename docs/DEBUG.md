# Depuración

Herramientas para quien trabaja en el código del juego. Ninguna cambia el resultado de una partida.

## Elegir el motor gráfico

El juego usa WebGPU si el navegador lo admite y, si no, WebGL2. Para forzar uno, añade a la URL:

| Parámetro       | Efecto                                            |
| --------------- | ------------------------------------------------- |
| `?motor=webgpu` | Intenta WebGPU primero (si falla, pasa a WebGL2). |
| `?motor=webgl2` | Intenta WebGL2 primero (si falla, pasa a WebGPU). |

Cualquier otro valor se ignora. El motor en uso queda en el atributo `data-backend` del `<canvas id="game">`.

## Arena de oleadas

Con `?modo=arena` el juego abre la arena de práctica en lugar de la aventura: oleadas cada vez más difíciles de los cuatro tipos de enemigo, para probar el balance del combate. No se guarda nada y no aparece en ningún menú. Cualquier otro valor se ignora.

## Acceso desde la consola

Solo con el servidor de desarrollo (`npm run dev`), `window.game` da acceso a `session` y `app`. Por ejemplo, `game.session.changeZone('bosque', 'fromLumbre')` lleva a otra zona y `game.session.progress` muestra el progreso. En el build no existe.

## Overlay de depuración

Oculto por defecto. Se muestra y se oculta con **F3** en cualquier pantalla. Se refresca cuatro veces por segundo y, mientras está oculto, no mide nada (no cuesta rendimiento).

| Línea              | Qué mide                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| FPS                | Imágenes dibujadas por segundo, según el motor gráfico.                                  |
| Refresco (Hz)      | Frecuencia de la pantalla medida por el juego. Sirve para comparar con los FPS.          |
| Lógica (ms)        | Media por fotograma del tiempo de los pasos fijos de lógica (60 Hz) y de los sistemas.   |
| Render (ms)        | Media por fotograma del tiempo de CPU de `scene.render()` (no incluye el tiempo de GPU). |
| Llamadas de dibujo | Llamadas de dibujo del último fotograma, incluidas sombras, contornos y efectos.         |
| Luces activas      | Luces encendidas en la escena.                                                           |
| Mallas activas     | Mallas que pasaron el recorte de cámara en el último fotograma.                          |
| Motor              | `webgpu` o `webgl2`.                                                                     |
| Calidad            | Nivel de calidad gráfica en uso (Baja, Media o Alta).                                    |
| Resolución interna | Píxeles que dibuja el motor en cada imagen. Baja si actúa la resolución dinámica.        |
| Gráfica            | Gráfica que informa el navegador. Puede ser poco detallada y no se envía a ningún sitio. |

Presupuesto por zona: 4 luces como máximo, un generador de sombras y 150 llamadas de dibujo.
