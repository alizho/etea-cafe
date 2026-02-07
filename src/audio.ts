import {
  BG_MUSIC,
  MUSIC_VOLUME,
  WET_A,
  WET_B,
  SFX_VOLUME,
} from "./config/constants";

let hasStarted = false;
let audioEnabled = true;

let musicContext: AudioContext | null = null;
let musicGain: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicBufferPromise: Promise<AudioBuffer> | null = null;

async function loadMusicBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (!musicBufferPromise) {
    musicBufferPromise = fetch(BG_MUSIC)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`music err Lol`);
        }
        return res.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf));
  }

  return musicBufferPromise;
}

const tileSfxA = new Audio(WET_A);
tileSfxA.preload = "auto";
tileSfxA.volume = SFX_VOLUME;

const tileSfxB = new Audio(WET_B);
tileSfxB.preload = "auto";
tileSfxB.volume = SFX_VOLUME;

let nextTileSfx: "A" | "B" = "A";

const PATH_TILE_SFX_MIN_INTERVAL_MS = 35;
const PATH_TILE_SFX_MAX_POLYPHONY = 6;

let lastPathTileSfxAtMs = 0;
const activePathTileSfx = new Set<HTMLAudioElement>();

type ListenerOptions = AddEventListenerOptions & { passive?: boolean };

function onceStartHandler() {
  // after first user gesture
  void startBackgroundMusic();
  detachStartListeners();
}

const START_EVENTS: Array<[keyof WindowEventMap, ListenerOptions]> = [
  ["pointerdown", { once: true, passive: true, capture: true }],
  ["mousedown", { once: true, passive: true, capture: true }],
  ["touchstart", { once: true, passive: true, capture: true }],
  ["keydown", { once: true, capture: true }],
];

function detachStartListeners() {
  for (const [event, opts] of START_EVENTS) {
    window.removeEventListener(event, onceStartHandler, opts);
  }
}

export function ensureAudioStartedOnFirstGesture(): void {
  for (const [event, opts] of START_EVENTS) {
    window.addEventListener(event, onceStartHandler, opts);
  }
}

export async function startBackgroundMusic(): Promise<void> {
  if (hasStarted) return;
  hasStarted = true;

  try {
    if (!musicContext) {
      musicContext = new AudioContext();
    }

    if (musicContext.state !== "running") {
      await musicContext.resume();
    }

    if (!musicGain) {
      musicGain = musicContext.createGain();
      musicGain.gain.value = MUSIC_VOLUME;
      musicGain.connect(musicContext.destination);
    } else {
      musicGain.gain.value = MUSIC_VOLUME;
    }
    if (musicSource) return;

    const buffer = await loadMusicBuffer(musicContext);
    const source = musicContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain);
    source.start(0);
    musicSource = source;
  } catch {
    hasStarted = false;
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

  const base = nextTileSfx === "A" ? tileSfxA : tileSfxB;
  nextTileSfx = nextTileSfx === "A" ? "B" : "A";

  // clean rapid path drawing
  const sfx = base.cloneNode(true) as HTMLAudioElement;
  sfx.volume = Math.min(1, SFX_VOLUME * (0.9 + Math.random() * 0.2));
  sfx.playbackRate = 0.98 + Math.random() * 0.04;

  activePathTileSfx.add(sfx);
  const cleanup = () => {
    activePathTileSfx.delete(sfx);
  };
  sfx.addEventListener("ended", cleanup, { once: true });
  sfx.addEventListener("error", cleanup, { once: true });
  void sfx.play().catch(cleanup);
}
