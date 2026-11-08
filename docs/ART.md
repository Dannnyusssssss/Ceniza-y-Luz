# Modelos 3D

Los personajes, los aldeanos, los enemigos, los objetos del mundo, el muñeco de práctica y la Hoja de Luz se generan con scripts de Python que ejecuta Blender en segundo plano. El entorno (terreno, casas, árboles, rocas, cristales, carteles) se crea por código dentro del juego.

## Requisitos

- Blender 5.2 LTS instalado aparte. Por defecto se busca en `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`; otra ruta se indica con la variable de entorno `BLENDER_PATH`.
- Las dependencias de Node del proyecto (`npm install`).

## Comandos

| Comando                            | Qué hace                                                               |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `npm run art`                      | Genera o exporta todos los modelos.                                    |
| `npm run art -- alba ciro`         | Solo los modelos indicados (`blade`, `alba`, `chest`, `ilse`…).        |
| `npm run art -- --regenerate alba` | Vuelve a generar un modelo aunque su `.blend` se haya retocado a mano. |
| `npm run art -- --no-previews`     | Sin imágenes de vista previa.                                          |

## Qué produce

- `public/models/<modelo>.glb`: el modelo que carga el juego (sin compresión Draco ni meshopt).
- `public/models/<modelo>-face.png`: la textura de la cara de cada personaje con rostro.
- `art/blend/<modelo>.blend`: el archivo de Blender, que se puede abrir y retocar.
- `src/data/generated/models.ts`: clips de animación (fotogramas y segundos), huesos, triángulos y texturas de cada modelo.
- `art/previews/`: imágenes de frente, tres cuartos, lado, espalda y primer plano de la cara (no se versionan).

Los colores y los tiempos de los golpes y de la esquiva se leen de `src/data/` (`characters.ts`, `npcs.ts`, `enemies.ts`, `balance.ts`, `palettes.ts`), así el modelo y la lógica del juego no se desincronizan. Un test comprueba que la duración de cada golpe coincide con `balance.ts`.

Cada enemigo tiene los clips `idle`, `move`, `windup`, `attack`, `recover` y `hurt`; los de ataque duran lo que indica `enemies.ts`. Los aldeanos (`ilse`, `oren`, `teo`) comparten el esqueleto de los gemelos, con menos detalle, y tienen los clips `idle` y `talk`.

Los objetos del mundo (`chest`, `beacon`, `switch`, `pushblock`, `plate`, `gate`) no llevan esqueleto. Las piezas que se mueven son objetos con nombre propio que el juego gira o desplaza: la tapa del cofre (`chestLid`, con el origen en la bisagra) y las rejas de la puerta (`gateBars`).

## Retoques a mano

`art/blend/generated.json` guarda una huella de cada `.blend` generado. Si un `.blend` se modifica en Blender, el comando deja de regenerarlo y solo lo exporta, para no perder los retoques. Con `--regenerate` se vuelve a generar desde el script.

## Estructura de los scripts

| Archivo                               | Contenido                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `art/build.mjs`                       | Lanza Blender por cada modelo, guarda las huellas y escribe el manifiesto.                                |
| `art/blender/build_model.py`          | Punto de entrada dentro de Blender: genera o abre, renderiza vistas previas y exporta.                    |
| `art/blender/lib/common.py`           | Escena, mallas básicas, color por vértice, materiales, contorno, exportación y vistas previas.            |
| `art/blender/lib/sculpt.py`           | Formas orgánicas con metaballs, cortes rectos, secciones del cuerpo, mechones y transferencia de pesos.   |
| `art/blender/lib/facepaint.py`        | Dibujo de la textura de la cara (ojos, cejas, nariz y boca).                                              |
| `art/blender/lib/rig.py`              | Esqueleto, posturas y clips de animación.                                                                 |
| `art/blender/characters/twins*.py`    | Alba y Ciro: cuerpo, cabeza y pelo, ropa, animaciones y ensamblado.                                       |
| `art/blender/characters/villagers.py` | Ilse, Oren y Teo: ropa, pelo y clips sobre el cuerpo base de los gemelos.                                 |
| `art/blender/enemies/`                | Brumilla, Acechador, Coloso de Bruma y Tirador de Ceniza; `mist.py` reúne su paleta y sus piezas comunes. |
| `art/blender/props/`                  | La Hoja de Luz, el muñeco de práctica y los objetos del mundo (`world_props.py`).                         |

## Convenciones

- Metros, Z hacia arriba en Blender; los modelos miran hacia -Y.
- Materiales que reconoce el juego: `toon` (luz y sombra de dos tonos), `outline` (contorno), `glow` (brilla) y `face` (textura con recorte por transparencia).
- El color de cada zona va como color por vértice. El contorno es una capa algo mayor con las caras invertidas, pintada de un tono oscuro del color que rodea.
- Los huesos `hair.1`, `hair.2`, `cape` y `scarf` no llevan claves en los clips: el juego los balancea por código (con menos amplitud si está activado "Reducir movimiento").
