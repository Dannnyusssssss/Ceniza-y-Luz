/** Datos de la gráfica según el motor: en WebGPU el modelo suele venir en `version`; en WebGL2, en `renderer`. */
export interface GpuInfo {
  readonly vendor: string;
  readonly renderer: string;
  readonly version: string;
}

/** Une los datos útiles de la gráfica. Descarta lo vacío, lo desconocido y la versión de WebGL. Vacío si no hay nada. */
export function describeGpu(info: GpuInfo): string {
  const parts = [info.vendor, info.renderer, info.version]
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^unknown/i.test(part) && !/^webgl/i.test(part));
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  // En WebGL2 el nombre completo ya está en `renderer`: el fabricante solo lo repetiría.
  const full = unique.filter(
    (part) => !unique.some((other) => other !== part && other.toLowerCase().includes(part.toLowerCase())),
  );
  return full.join(' ');
}
