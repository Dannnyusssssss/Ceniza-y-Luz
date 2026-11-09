import { STATIC_REDRAW_FRAMES } from '../data/quality';

/**
 * Decide si hay que dibujar cuando la imagen está quieta (pausa y menús). Al quedarse quieta o al invalidarse
 * dibuja unos fotogramas más, para que lleguen los cambios y los efectos que tardan en prepararse; después, nada.
 */
export class RedrawGate {
  private pending = 0;
  private wasStatic = false;

  /** Algo cambió la imagen: un redimensionado, un ajuste o la vuelta de la tarjeta gráfica. */
  invalidate(): void {
    this.pending = STATIC_REDRAW_FRAMES;
  }

  shouldDraw(isStatic: boolean): boolean {
    if (!isStatic) {
      this.wasStatic = false;
      this.pending = 0;
      return true;
    }
    if (!this.wasStatic) {
      this.wasStatic = true;
      this.pending = STATIC_REDRAW_FRAMES;
    }
    if (this.pending === 0) return false;
    this.pending--;
    return true;
  }
}
