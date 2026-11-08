import './styles.css';
import { createEngine } from './engine/createEngine';
import { DEFAULT_BACKEND, readBackendPreference } from './engine/backendPreference';
import { GameSession } from './engine/session';
import { FixedStepLoop } from './core/loop';
import { BrowserInput, type InputCallbacks } from './core/input';
import { SafeStorage } from './core/storage';
import { SettingsStore } from './core/settingsStore';
import { App } from './ui/app';
import { Hud } from './ui/hud';
import { DebugOverlay } from './ui/debug';
import { TEXTS } from './data/texts';
import { META } from './data/meta';

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta el elemento #${id}`);
  return element;
}

function showFatal(message: string): void {
  const box = document.getElementById('fatal');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function hideFatal(): void {
  const box = document.getElementById('fatal');
  if (box) box.hidden = true;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Avisa cuando cambia la escala de pantalla (mover la ventana a otro monitor o hacer zoom). */
function watchPixelRatio(onChange: () => void): void {
  const listen = (): void => {
    try {
      const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener(
        'change',
        () => {
          onChange();
          listen();
        },
        { once: true },
      );
    } catch {
      // Sin soporte de matchMedia: basta con el evento resize.
    }
  };
  listen();
}

async function start(): Promise<void> {
  document.title = META.title;
  const canvas = byId('game');
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const created = await createEngine(canvas, DEFAULT_BACKEND, readBackendPreference(window.location.search));
  if (!created) {
    showFatal(TEXTS.errors.noGraphics);
    return;
  }
  const { engine, backend } = created;
  canvas.dataset['backend'] = backend;
  engine.onContextLostObservable.add(() => showFatal(TEXTS.errors.contextLost));
  engine.onContextRestoredObservable.add(() => hideFatal());

  const settings = new SettingsStore(SafeStorage.fromBrowser(), prefersReducedMotion());
  // La app se crea después de la entrada; los avisos de la entrada se le reenvían.
  let callbacks: InputCallbacks | null = null;
  const input = new BrowserInput(canvas, {
    onPointerLockChange: (locked) => callbacks?.onPointerLockChange(locked),
    onPointerLockError: () => callbacks?.onPointerLockError(),
    onFocusLost: () => callbacks?.onFocusLost(),
    onSystemAction: (action) => callbacks?.onSystemAction(action),
  });
  const session = new GameSession(engine, input, settings, 'alba');
  const debug = new DebugOverlay(
    byId('debug'),
    engine,
    session.world.scene,
    backend,
    () => TEXTS.settings.qualityOptions[settings.value.quality],
  );
  const app = new App(canvas, byId('menu'), session, input, settings, new Hud(byId('hud')), debug);
  callbacks = app.inputCallbacks;
  app.start();

  const loop = new FixedStepLoop();
  engine.runRenderLoop(() => {
    const frameSeconds = engine.getDeltaTime() / 1000;
    const t0 = performance.now();
    const { alpha } = loop.advance(frameSeconds, (dt) => session.systems.fixedUpdate(dt));
    session.systems.frameUpdate(frameSeconds, alpha);
    const t1 = performance.now();
    session.world.scene.render();
    debug.record(t1 - t0, performance.now() - t1, frameSeconds);
  });
  window.addEventListener('resize', () => engine.resize());
  watchPixelRatio(() => engine.resize());
}

start().catch(() => showFatal(TEXTS.errors.startFailed));
