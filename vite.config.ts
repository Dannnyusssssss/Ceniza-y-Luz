import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Política de seguridad de contenido del juego publicado.
 * Solo se inyecta en el build: el servidor de desarrollo de Vite inserta estilos en línea
 * que esta política bloquearía.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      );
    },
  };
}

/** Licencias de terceros que viajan con el juego publicado (dist/licenses/). */
const THIRD_PARTY_NOTICES: readonly { from: string; to: string }[] = [
  { from: 'node_modules/@babylonjs/core/license.md', to: 'licenses/babylonjs-core-LICENSE.md' },
  { from: 'node_modules/@babylonjs/core/NOTICE.md', to: 'licenses/babylonjs-core-NOTICE.md' },
  { from: 'node_modules/@babylonjs/materials/license.md', to: 'licenses/babylonjs-materials-LICENSE.md' },
];

function thirdPartyNotices(): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle() {
      for (const notice of THIRD_PARTY_NOTICES) {
        this.emitFile({ type: 'asset', fileName: notice.to, source: readFileSync(notice.from, 'utf8') });
      }
    },
  };
}

// Rutas relativas para que dist/ funcione desde cualquier hosting estático o subcarpeta.
export default defineConfig({
  base: './',
  plugins: [contentSecurityPolicy(), thirdPartyNotices()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
