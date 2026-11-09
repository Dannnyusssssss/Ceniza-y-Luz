# Licencias

## El juego

Ceniza y Luz: todos los derechos reservados. Titular: Danny Sivinta.

Consulta el archivo `LICENSE` de la raíz. Los modelos 3D (personajes, enemigos y objetos) los crea el propio proyecto en Blender a partir de los scripts de `art/`; el entorno, los efectos y el sonido se generan por código. No se usan modelos, texturas, fuentes ni sonidos de terceros. Los archivos que produce Blender pertenecen al proyecto; la licencia de Blender no se aplica a ellos.

## Dependencias incluidas en el juego publicado

| Paquete                | Versión | Licencia   | Aviso en el juego publicado                                                |
| ---------------------- | ------- | ---------- | -------------------------------------------------------------------------- |
| `@babylonjs/core`      | 9.35.0  | Apache-2.0 | `licenses/babylonjs-core-LICENSE.md` y `licenses/babylonjs-core-NOTICE.md` |
| `@babylonjs/materials` | 9.35.0  | Apache-2.0 | `licenses/babylonjs-materials-LICENSE.md`                                  |
| `@babylonjs/loaders`   | 9.35.0  | Apache-2.0 | `licenses/babylonjs-loaders-LICENSE.md`                                    |

El build copia estos archivos a `dist/licenses/` de forma automática.

`babylonjs-gltf2interface` 9.35.0 (Apache-2.0) solo aporta tipos de TypeScript y no se incluye en el juego publicado.

## Herramientas de desarrollo (no se incluyen en el juego publicado)

| Paquete                  | Versión | Licencia   |
| ------------------------ | ------- | ---------- |
| `vite`                   | 8.3.6   | MIT        |
| `typescript`             | 6.0.3   | Apache-2.0 |
| `vitest`                 | 5.1.0   | MIT        |
| `eslint`                 | 10.14.0 | MIT        |
| `@eslint/js`             | 10.0.1  | MIT        |
| `typescript-eslint`      | 8.72.1  | MIT        |
| `eslint-config-prettier` | 10.1.8  | MIT        |
| `prettier`               | 3.9.10  | MIT        |
| `globals`                | 17.14.0 | MIT        |
| `@types/node`            | 26.6.6  | MIT        |

El despliegue usa las acciones oficiales de GitHub (`actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact` y `actions/deploy-pages`), con licencia MIT, que no forman parte del juego.

Para generar los modelos se usa Blender 5.2.3 LTS (GPL), instalado aparte; no forma parte del juego ni del repositorio.
