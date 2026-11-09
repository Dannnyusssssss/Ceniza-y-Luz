import './styles.css';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { createEngine } from './engine/createEngine';
import { DEFAULT_BACKEND, readBackendPreference } from './engine/backendPreference';
import { GameSession } from './engine/session';
import { readGameMode } from './engine/gameMode';
import { SaveSlot } from './engine/saveSlot';
import { limitFrameRate } from './engine/frameRate';
import { FrameLimiter, frameTarget } from './core/frameLimiter';
import { ResolutionGovernor } from './core/resolutionGovernor';
import { RedrawGate } from './core/redrawGate';
import { applyRenderScale } from './engine/renderScale';
import { QUALITY_PRESETS } from './data/quality';
import { FixedStepLoop } from './core/loop';
import { BrowserInput, type InputCallbacks } from './core/input';
import { SafeStorage } from './core/storage';
import { SettingsStore } from './core/settingsStore';
import { App } from './ui/app';
import { Hud } from './ui/hud';
import { DebugOverlay } from './ui/debug';
import { CONTEXT_RESTORE_SECONDS, FPS_LIMIT_TARGET, IDLE_FPS_TARGET } from './data/settings';
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

/** Pantalla de carga: el porcentaje se anuncia en texto (no solo con la barra). */
function showLoading(fraction: number): void {
  const percent = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
  const text = document.getElementById('loading-text');
  const fill = document.getElementById('loading-fill');
  if (text) text.textContent = TEXTS.loading.progress(percent);
  if (fill) fill.style.width = `${percent}%`;
}

function hideLoading(): void {
  const box = document.getElementById('loading');
  if (box) box.hidden = true;
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

/** Si se pierde la tarjeta gráfica: la partida se pausa y se avisa. Si no vuelve, se pide recargar. */
function watchGraphicsContext(engine: AbstractEngine, onLost: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  engine.onContextLostObservable.add(() => {
    onLost();
    showFatal(TEXTS.errors.contextLost);
    timer = setTimeout(() => showFatal(TEXTS.errors.contextFailed), CONTEXT_RESTORE_SECONDS * 1000);
  });
  engine.onContextRestoredObservable.add(() => {
    if (timer) clearTimeout(timer);
    hideFatal();
  });
}

/** La escala dinámica vuelve a la resolución completa al cambiar de calidad o al desactivarla. */
function watchResolution(settings: SettingsStore): ResolutionGovernor {
  const governor = new ResolutionGovernor();
  let quality = settings.value.quality;
  settings.onChange((s) => {
    const changed = s.quality !== quality;
    quality = s.quality;
    if ((changed || !s.dynamicResolution) && s.resolutionScale !== 1) settings.update({ resolutionScale: 1 });
    if (changed) governor.reset();
  });
  return governor;
}

async function start(): Promise<void> {
  document.title = META.title;
  showLoading(0);
  const canvas = byId('game');
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const created = await createEngine(canvas, DEFAULT_BACKEND, readBackendPreference(window.location.search));
  if (!created) {
    hideLoading();
    showFatal(TEXTS.errors.noGraphics);
    return;
  }
  const { engine, backend, gpu } = created;
  canvas.dataset['backend'] = backend;
  const storage = SafeStorage.fromBrowser();
  const settings = new SettingsStore(storage, prefersReducedMotion());
  // La app se crea después de la entrada; los avisos de la entrada se le reenvían.
  let callbacks: InputCallbacks | null = null;
  const input = new BrowserInput(canvas, {
    onPointerLockChange: (locked) => callbacks?.onPointerLockChange(locked),
    onPointerLockError: () => callbacks?.onPointerLockError(),
    onFocusLost: () => callbacks?.onFocusLost(),
    onSystemAction: (action) => callbacks?.onSystemAction(action),
  });
  const mode = readGameMode(window.location.search);
  const session = await GameSession.create(engine, input, settings, 'alba', mode, showLoading);
  hideLoading();
  const limiter = new FrameLimiter();
  const debug = new DebugOverlay(
    byId('debug'),
    engine,
    session.world.scene,
    backend,
    () => TEXTS.settings.qualityOptions[settings.value.quality],
    gpu,
    () => limiter.refreshHz,
  );
  const app = new App(
    canvas,
    byId('menu'),
    byId('fade'),
    session,
    input,
    settings,
    new SaveSlot(storage),
    new Hud(byId('hud')),
    debug,
  );
  callbacks = app.inputCallbacks;
  watchGraphicsContext(engine, () => app.pauseForError());
  // Solo en desarrollo: acceso desde la consola para probar la partida (ver docs/DEBUG.md).
  if (import.meta.env.DEV) Object.assign(window, { game: { session, app } });
  app.start();

  limitFrameRate(engine, limiter, () =>
    frameTarget(FPS_LIMIT_TARGET[settings.value.fpsLimit], session.playing, IDLE_FPS_TARGET),
  );
  const governor = watchResolution(settings);
  const gate = new RedrawGate();
  settings.onChange(() => gate.invalidate());
  engine.onContextRestoredObservable.add(() => gate.invalidate());
  const loop = new FixedStepLoop();
  engine.runRenderLoop(() => {
    const frameSeconds = engine.getDeltaTime() / 1000;
    const t0 = performance.now();
    const { alpha } = loop.advance(frameSeconds, (dt) => session.systems.fixedUpdate(dt));
    session.systems.frameUpdate(frameSeconds, alpha);
    const t1 = performance.now();
    // Con la imagen quieta (pausa y menús) la pantalla conserva el último fotograma: la gráfica descansa.
    if (gate.shouldDraw(app.sceneIsStatic)) session.world.scene.render();
    debug.record(t1 - t0, performance.now() - t1, frameSeconds);
    if (session.playing && settings.value.dynamicResolution) {
      const limit = FPS_LIMIT_TARGET[settings.value.fpsLimit];
      const hz = limiter.refreshHz;
      const top = limit === null ? hz : hz === null ? limit : Math.min(limit, hz);
      const scale = governor.update(frameSeconds, settings.value.resolutionScale, top);
      if (scale !== null) settings.update({ resolutionScale: scale });
    } else {
      governor.reset();
    }
  });
  const onResize = (): void => {
    applyRenderScale(engine, QUALITY_PRESETS[settings.value.quality], settings.value.resolutionScale);
    gate.invalidate();
  };
  window.addEventListener('resize', onResize);
  watchPixelRatio(onResize);
}

start().catch(() => {
  hideLoading();
  showFatal(TEXTS.errors.startFailed);
});
