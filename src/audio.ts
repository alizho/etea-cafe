import {
  BG_MUSIC,
  MUSIC_VOLUME,
  WET_A,
  STEP_SFX,
  NICE_SFX,
  WOMP_SFX,
  THUD_SFX,
  JET_SFX,
  CHER_SFX,
  MELODY_SFX,
  SFX_VOLUME,
  PATH_TILE_SFX_VOLUME,
  STEP_SFX_VOLUME as STEP_VOLUME_SCALE,
} from './config/constants';
import type { CustomerId } from './engine/types';

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
    } catch {}
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

function preloadSfx(src: string, volume: number): HTMLAudioElement {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = volume;
  return audio;
}

const niceSfx = preloadSfx(NICE_SFX, SFX_VOLUME);
const wompSfx = preloadSfx(WOMP_SFX, SFX_VOLUME);
const thudSfx = preloadSfx(THUD_SFX, SFX_VOLUME);

const CUSTOMER_SERVE_SFX: Record<CustomerId, HTMLAudioElement> = {
  A: preloadSfx(MELODY_SFX, SFX_VOLUME),
  B: preloadSfx(JET_SFX, SFX_VOLUME),
  C: preloadSfx(CHER_SFX, SFX_VOLUME),
};

// rapid-fire sfx: rate-limited, capped polyphony, slight random volume and pitch
type ThrottledSfx = {
  base: HTMLAudioElement;
  volume: number;
  volumeJitter: [min: number, span: number];
  rateJitter: [min: number, span: number];
  minIntervalMs: number;
  maxPolyphony: number;
  lastAtMs: number;
  active: Set<HTMLAudioElement>;
};

function throttledSfx(
  src: string,
  volume: number,
  opts: Pick<ThrottledSfx, 'volumeJitter' | 'rateJitter' | 'minIntervalMs' | 'maxPolyphony'>
): ThrottledSfx {
  return { base: preloadSfx(src, volume), volume, ...opts, lastAtMs: 0, active: new Set() };
}

const tileSfx = throttledSfx(WET_A, SFX_VOLUME * PATH_TILE_SFX_VOLUME, {
  volumeJitter: [0.9, 0.2],
  rateJitter: [0.98, 0.04],
  minIntervalMs: 35,
  maxPolyphony: 6,
});

const stepSfx = throttledSfx(STEP_SFX, SFX_VOLUME * STEP_VOLUME_SCALE, {
  volumeJitter: [0.5, 0.5],
  rateJitter: [0.9, 0.2],
  minIntervalMs: 50,
  maxPolyphony: 4,
});

function playThrottled(t: ThrottledSfx): void {
  if (!hasStarted || !audioEnabled) return;

  const nowMs = performance.now();
  if (nowMs - t.lastAtMs < t.minIntervalMs) return;
  if (t.active.size >= t.maxPolyphony) return;
  t.lastAtMs = nowMs;

  // randomize pitch and volume
  const sfx = t.base.cloneNode(true) as HTMLAudioElement;
  sfx.volume = Math.min(1, t.volume * (t.volumeJitter[0] + Math.random() * t.volumeJitter[1]));
  sfx.playbackRate = t.rateJitter[0] + Math.random() * t.rateJitter[1];

  t.active.add(sfx);
  const cleanup = () => {
    t.active.delete(sfx);
  };
  sfx.addEventListener('ended', cleanup, { once: true });
  sfx.addEventListener('error', cleanup, { once: true });
  void sfx.play().catch(cleanup);
}

function playOneShot(base: HTMLAudioElement, volume: number, playbackRate?: number): void {
  const sfx = base.cloneNode(true) as HTMLAudioElement;
  sfx.volume = volume;
  if (playbackRate !== undefined) sfx.playbackRate = playbackRate;
  void sfx.play().catch(() => {});
}

type ListenerOptions = AddEventListenerOptions & { passive?: boolean };

function getMusicContext(): AudioContext {
  if (!musicContext) {
    musicContext = new AudioContext();
  }
  return musicContext;
}

function applyMusicVolume(): void {
  if (musicGain) musicGain.gain.value = audioEnabled ? MUSIC_VOLUME : 0;
}

function gestureHandler() {
  void ensureContextRunning(getMusicContext());

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
    const ctx = getMusicContext();
    await ensureContextRunning(ctx);

    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.connect(ctx.destination);
    }
    applyMusicVolume();
    if (musicSource) return;

    const buffer = await loadMusicBuffer(ctx);

    await ensureContextRunning(ctx);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain);
    source.start(0);
    musicSource = source;
    hasStarted = true;
  } catch {
  } finally {
    startInProgress = false;
  }
}

export function toggleAudio(): boolean {
  audioEnabled = !audioEnabled;
  applyMusicVolume();
  return audioEnabled;
}

export function getAudioEnabled(): boolean {
  return audioEnabled;
}

export function playPathTileSfx(): void {
  playThrottled(tileSfx);
}

export function playStepSfx(): void {
  playThrottled(stepSfx);
}

export function playNiceSfx(): void {
  if (!hasStarted || !audioEnabled) return;
  playOneShot(niceSfx, SFX_VOLUME);
}

export function playWompSfx(): void {
  if (!hasStarted || !audioEnabled) return;
  playOneShot(wompSfx, SFX_VOLUME);
}

// glorbo hitting the floor after slipping on a spill
export function playThudSfx(): void {
  if (!hasStarted || !audioEnabled) return;
  playOneShot(thudSfx, SFX_VOLUME);
}

export function playCustomerServeSfx(customerId: CustomerId): void {
  if (!hasStarted || !audioEnabled) return;

  const base = CUSTOMER_SERVE_SFX[customerId];
  if (!base) return;

  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (!audioEnabled) return;
      playOneShot(base, SFX_VOLUME * 0.4, 1.4);
    }, i * 100);
  }
}
