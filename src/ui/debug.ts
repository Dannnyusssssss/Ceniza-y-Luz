import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Scene } from '@babylonjs/core/scene';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { TEXTS } from '../data/texts';

/** Veces por segundo que se refresca el texto del overlay. */
const REFRESH_PER_SECOND = 4;

/**
 * Overlay de depuración (oculto por defecto; F3 lo muestra). Mide FPS, tiempo de lógica y de render,
 * llamadas de dibujo, luces y mallas activas. La instrumentación solo existe mientras está visible.
 */
export class DebugOverlay {
  private instrumentation: SceneInstrumentation | null = null;
  private sinceRefresh = 0;
  private logicMs = 0;
  private renderMs = 0;
  private samples = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    private readonly backend: string,
    private readonly qualityName: () => string,
  ) {
    root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.visible) {
      this.root.hidden = true;
      this.instrumentation?.dispose();
      this.instrumentation = null;
    } else {
      this.root.hidden = false;
      this.instrumentation = new SceneInstrumentation(this.scene);
      this.sinceRefresh = 1;
    }
  }

  /** Registra los tiempos del fotograma (ms) y refresca el texto unas veces por segundo. */
  record(logicMs: number, renderMs: number, frameSeconds: number): void {
    if (!this.visible) return;
    this.logicMs += logicMs;
    this.renderMs += renderMs;
    this.samples++;
    this.sinceRefresh += frameSeconds;
    if (this.sinceRefresh < 1 / REFRESH_PER_SECOND) return;
    const t = TEXTS.debug;
    const lights = this.scene.lights.filter((l) => l.isEnabled()).length;
    const lines = [
      `${t.fps}: ${this.engine.getFps().toFixed(0)}`,
      `${t.logic}: ${(this.logicMs / Math.max(1, this.samples)).toFixed(2)}`,
      `${t.render}: ${(this.renderMs / Math.max(1, this.samples)).toFixed(2)}`,
      `${t.drawCalls}: ${this.instrumentation?.drawCallsCounter.current ?? 0}`,
      `${t.lights}: ${lights}`,
      `${t.meshes}: ${this.scene.getActiveMeshes().length}`,
      `${t.backend}: ${this.backend}`,
      `${t.quality}: ${this.qualityName()}`,
    ];
    this.root.textContent = `${t.title}\n${lines.join('\n')}`;
    this.sinceRefresh = 0;
    this.logicMs = 0;
    this.renderMs = 0;
    this.samples = 0;
  }
}
