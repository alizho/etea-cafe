import {
  BG_MUSIC,
  MUSIC_VOLUME,
  WET_A,
  STEP_SFX,
  NICE_SFX,
  WOMP_SFX,
  SFX_VOLUME,
  PATH_TILE_SFX_VOLUME,
  STEP_SFX_VOLUME as STEP_VOLUME_SCALE,
} from './config/constants';

let hasStarted = false;
let audioEnabled = true;

let musicContext: AudioContext | null = null;
let musicGain: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicBufferPromise: Promise<AudioBuffer> | null = null;
let startInProgress = false;

async function ensureContextRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'running') return;
  try {
    await ctx.resume();
  } catch (e) {
    console.warn('[audio] ctx.resume() failed:', e);
  }

  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {

    }
  }
}

async function loadMusicBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (!musicBufferPromise) {
    musicBufferPromise = fetch(BG_MUSIC)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`music fetch failed: ${res.status}`);
        }
        return res.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .catch((err) => {
        musicBufferPromise = null;
        throw err;
      });
  }

  return musicBufferPromise;
}

const tileSfx = new Audio(WET_A);
tileSfx.preload = 'auto';
tileSfx.volume = SFX_VOLUME * PATH_TILE_SFX_VOLUME;

const stepSfx = new Audio(STEP_SFX);
stepSfx.preload = 'auto';
stepSfx.volume = SFX_VOLUME * STEP_VOLUME_SCALE;

const niceSfx = new Audio(NICE_SFX);
niceSfx.preload = 'auto';
niceSfx.volume = SFX_VOLUME;

const wompSfx = new Audio(WOMP_SFX);
wompSfx.preload = 'auto';
wompSfx.volume = SFX_VOLUME;

const PATH_TILE_SFX_MIN_INTERVAL_MS = 35;
const STEP_SFX_MIN_INTERVAL_MS = 50;
const PATH_TILE_SFX_MAX_POLYPHONY = 6;
const STEP_SFX_MAX_POLYPHONY = 4;

let lastPathTileSfxAtMs = 0;
let lastStepSfxAtMs = 0;
const activePathTileSfx = new Set<HTMLAudioElement>();
const activeStepSfx = new Set<HTMLAudioElement>();

type ListenerOptions = AddEventListenerOptions & { passive?: boolean };

function gestureHandler() {
  if (!musicContext) {
    musicContext = new AudioContext();
  }

  void ensureContextRunning(musicContext);

  if (!hasStarted && !startInProgress) {
    void startBackgroundMusic();
  }
}

const GESTURE_EVENTS: Array<[keyof WindowEventMap, ListenerOptions]> = [
  ['pointerdown', { passive: true, capture: true }],
  ['touchstart', { passive: true, capture: true }],
  ['keydown', { capture: true }],
];

let gestureListenersAttached = false;

function detachGestureListeners() {
  if (!gestureListenersAttached) return;
  for (const [event, opts] of GESTURE_EVENTS) {
    window.removeEventListener(event, gestureHandler, opts);
  }
  gestureListenersAttached = false;
}

export function ensureAudioStartedOnFirstGesture(): void {
  if (gestureListenersAttached) return;
  for (const [event, opts] of GESTURE_EVENTS) {
    window.addEventListener(event, gestureHandler, opts);
  }
  gestureListenersAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && musicContext) {
      void ensureContextRunning(musicContext);
    }
  });
}

export async function startBackgroundMusic(): Promise<void> {
  if (hasStarted) return;
  startInProgress = true;

  try {
    if (!musicContext) {
      musicContext = new AudioContext();
    }

    await ensureContextRunning(musicContext);

    if (!musicGain) {
      musicGain = musicContext.createGain();
      musicGain.gain.value = audioEnabled ? MUSIC_VOLUME : 0;
      musicGain.connect(musicContext.destination);
    } else {
      musicGain.gain.value = audioEnabled ? MUSIC_VOLUME : 0;
    }
    if (musicSource) return;

    const buffer = await loadMusicBuffer(musicContext);

    await ensureContextRunning(musicContext);

    const source = musicContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain);
    source.start(0);
    musicSource = source;
    hasStarted = true;

    detachGestureListeners();
  } catch (err) {
  
  } finally {
    startInProgress = false;
  }
}

export function toggleAudio(): boolean {
  audioEnabled = !audioEnabled;
  if (musicGain) {
    musicGain.gain.value = audioEnabled ? MUSIC_VOLUME : 0;
  }
  return audioEnabled;
}

export function getAudioEnabled(): boolean {
  return audioEnabled;
}

export function playPathTileSfx(): void {
  if (!hasStarted || !audioEnabled) return;

  const nowMs = performance.now();
  if (nowMs - lastPathTileSfxAtMs < PATH_TILE_SFX_MIN_INTERVAL_MS) return;
  if (activePathTileSfx.size >= PATH_TILE_SFX_MAX_POLYPHONY) return;
  lastPathTileSfxAtMs = nowMs;

  // randomize pitch and volume
  const sfx = tileSfx.cloneNode(true) as HTMLAudioElement;
  sfx.volume = Math.min(1, SFX_VOLUME * PATH_TILE_SFX_VOLUME * (0.9 + Math.random() * 0.2));
  sfx.playbackRate = 0.98 + Math.random() * 0.04;

  activePathTileSfx.add(sfx);
  const cleanup = () => {
    activePathTileSfx.delete(sfx);
  };
  sfx.addEventListener('ended', cleanup, { once: true });
  sfx.addEventListener('error', cleanup, { once: true });
  void sfx.play().catch(cleanup);
}

export function playStepSfx(): void {
  if (!hasStarted || !audioEnabled) return;

  const nowMs = performance.now();
  if (nowMs - lastStepSfxAtMs < STEP_SFX_MIN_INTERVAL_MS) return;
  if (activeStepSfx.size >= STEP_SFX_MAX_POLYPHONY) return;
  lastStepSfxAtMs = nowMs;

  // randomize pitch and volume
  const sfx = stepSfx.cloneNode(true) as HTMLAudioElement;
  sfx.volume = Math.min(1, SFX_VOLUME * STEP_VOLUME_SCALE * (0.5 + Math.random() * 0.5));
  sfx.playbackRate = 0.9 + Math.random() * 0.2;

  activeStepSfx.add(sfx);
  const cleanup = () => {
    activeStepSfx.delete(sfx);
  };
  sfx.addEventListener('ended', cleanup, { once: true });
  sfx.addEventListener('error', cleanup, { once: true });
  void sfx.play().catch(cleanup);
}

export function playNiceSfx(): void {
  if (!hasStarted || !audioEnabled) return;

  const sfx = niceSfx.cloneNode(true) as HTMLAudioElement;
  sfx.volume = SFX_VOLUME;
  void sfx.play().catch(() => {});
}

export function playWompSfx(): void {
  if (!hasStarted || !audioEnabled) return;

  const sfx = wompSfx.cloneNode(true) as HTMLAudioElement;
  sfx.volume = SFX_VOLUME;
  void sfx.play().catch(() => {});
}
