import { type DrinkId, type ObstacleId, type Pos, type CustomerId } from './engine/types';
import { clearPath, initGame, stepSimulation, tryAppendPath, type GameState } from './engine/game';
import { buildLevel } from './levels/loader';
import { getTodayLevelFromSupabase } from './levels/daily';
import {
  submitRun,
  getPlayerId,
  getBestScoreFromStorage,
  setBestScoreInStorage,
  hasRunInDatabase,
} from './supabase/api';
import { showSuccessPopup, hideSuccessPopup } from './popup';
import type { LevelData } from './levels/level.schema';
import { validateLevelData } from './levels/validate';
import { solveLevel } from './engine/solver';
import { pathImagesLoaded, renderPath, renderPathArrow, PATH_TINT_GREEN } from './paths';
import { TILE_SIZE } from './config/constants';
import {
  ensureAudioStartedOnFirstGesture,
  playPathTileSfx,
  playStepSfx,
  playNiceSfx,
  playWompSfx,
} from './audio';
import { initMenu } from './menu';
import {
  loadAllSprites,
  type LoadedSprites,
  type DecorKind,
  PLACEABLE_DECOR,
  ALL_DRINK_IDS,
  getDecorWidth,
  WALL_DECOR_TYPES,
  isWallDecorType,
} from './config/items';

const HAMMER_SFX_URL = '/audio/hammer.mp3';

function playHammerSfx(): void {
  const audio = new Audio(HAMMER_SFX_URL);
  void audio.play().catch((err) => console.error('Hammer SFX failed:', err));
}
import {
  decodeLevelShareToken,
  encodeLevelShareToken,
  getShareTokenFromUrlHash,
  makeShareUrlFromToken,
} from './share';
import './style.css';

// store loaded sprites
let sprites: LoadedSprites;

// wall and ui cuz they static
const floorOpen = new Image();
floorOpen.src = '/src/assets/floor_open.png';

const wallTop = new Image();
wallTop.src = '/src/assets/wall_top.png';

const wallBot = new Image();
wallBot.src = '/src/assets/wall_bot.png';

const wallLeftTop = new Image();
wallLeftTop.src = '/src/assets/wall_left_top.png';

const wallLeftMid = new Image();
wallLeftMid.src = '/src/assets/wall_left_mid.png';

const wallLeftBot = new Image();
wallLeftBot.src = '/src/assets/wall_left_bot.png';

const wallLeftCorner = new Image();
wallLeftCorner.src = '/src/assets/wall_left_corner.png';

const wallRightTop = new Image();
wallRightTop.src = '/src/assets/wall_right_top.png';

const wallRightMid = new Image();
wallRightMid.src = '/src/assets/wall_right_mid.png';

const wallRightBot = new Image();
wallRightBot.src = '/src/assets/wall_right_bot.png';

const wallRightCorner = new Image();
wallRightCorner.src = '/src/assets/wall_right_corner.png';

const glorboSpriteSheet = new Image();
glorboSpriteSheet.src = '/src/assets/glorbo_sprite_sheet.png';

const catAltSprite = new Image();
catAltSprite.src = '/src/assets/cat-2.png';

const hoverSprite = new Image();
hoverSprite.src = '/src/assets/hover.png';

const hoverHammerSprite = new Image();
hoverHammerSprite.src = '/src/assets/hover-hammer.png';

const hoverDragSprite = new Image();
hoverDragSprite.src = '/src/assets/hover-drag.png';

const hoverNopeSprite = new Image();
hoverNopeSprite.src = '/src/assets/hover_nope.png';

const hoverYepSprite = new Image();
hoverYepSprite.src = '/src/assets/hover_yep.png';

const standHere = new Image();
standHere.src = '/src/assets/stand_here.png';

// load dynamic stuff
const imagesLoaded = Promise.all([
  loadAllSprites().then((loaded) => {
    sprites = loaded;
  }),
  new Promise<void>((resolve) => {
    floorOpen.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallTop.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallBot.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallLeftTop.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallLeftMid.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallLeftBot.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallLeftCorner.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallRightTop.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallRightMid.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallRightBot.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    wallRightCorner.onload = () => resolve();
  }),
  pathImagesLoaded,
  new Promise<void>((resolve) => {
    glorboSpriteSheet.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverHammerSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverDragSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverNopeSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverYepSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    standHere.onload = () => resolve();
  }),
]);

function inBounds(levelW: number, levelH: number, p: Pos): boolean {
  return p.x >= 0 && p.x < levelW && p.y >= 0 && p.y < levelH;
}

function getCustomerIconDataUrl(customerSprite: HTMLImageElement, quadrant: 2 | 3 = 2): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const spriteWidth = customerSprite.width / 2;
  const spriteHeight = customerSprite.height / 2;
  canvas.width = spriteWidth;
  canvas.height = spriteHeight;

  const sourceX = quadrant === 2 ? 0 : spriteWidth;
  const sourceY = spriteHeight;

  ctx.drawImage(
    customerSprite,
    sourceX,
    sourceY,
    spriteWidth,
    spriteHeight,
    0,
    0,
    spriteWidth,
    spriteHeight
  );

  return canvas.toDataURL();
}

function getGlorboIcon(glorboSprite: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const spriteSheetWidth = glorboSprite.width;
  const spriteSheetHeight = glorboSprite.height;
  const spriteWidth = spriteSheetWidth / 3;
  const spriteHeight = spriteSheetHeight / 2;

  canvas.width = spriteWidth;
  canvas.height = spriteHeight;

  ctx.drawImage(glorboSprite, 0, 0, spriteWidth, spriteHeight, 0, 0, spriteWidth, spriteHeight);

  return canvas.toDataURL();
}

function getTilePos(
  canvas: HTMLCanvasElement,
  levelWidthTiles: number,
  levelHeightTiles: number,
  x: number,
  y: number
): Pos | null {
  const rect = canvas.getBoundingClientRect();

  // this is cuz resizing would make things cutoff on smaller displays
  // idk if it's the best solution but
  const cssX = x - rect.left;
  const cssY = y - rect.top;

  if (rect.width <= 0 || rect.height <= 0) return null;

  const logicalW = levelWidthTiles * TILE_SIZE;
  const logicalH = levelHeightTiles * TILE_SIZE;

  const canvasX = (cssX / rect.width) * logicalW;
  const canvasY = (cssY / rect.height) * logicalH;

  const tileX = Math.floor(canvasX / TILE_SIZE);
  const tileY = Math.floor(canvasY / TILE_SIZE);

  return { x: tileX, y: tileY };
}

class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private isDrawing: boolean = false;
  private simInterval: number | null = null;
  private animationFrame: number = 0;
  private animationInterval: number | null = null;
  private tempCanvas: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;
  private hoverTile: Pos | null = null;
  private buildCursor: string = 'crosshair';
  private dragGhostRenderer:
    | ((ctx: CanvasRenderingContext2D, tileX: number, tileY: number, animFrame: number) => void)
    | null = null;
  private glorboHidden: boolean = false;
  private builderHoverSprite: HTMLImageElement | null = null;

  private uiMode: 'play' | 'build' = 'play';
  private onBuildTileClick: ((pos: Pos) => void) | null = null;
  private onSuccess: ((moves: number) => void) | null = null;
  private successHandled: boolean = false;
  private currentLevelId: string | null = null;
  private showingOptimalReplay: boolean = false;

  // avoid build mode spamming paint calls on same tile
  private lastBuildPaintKey: string | null = null;

  constructor(canvas: HTMLCanvasElement, state: GameState) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context');
    this.ctx = ctx;
    this.state = state;

    // create temporary canvas for sprite tinting
    this.tempCanvas = document.createElement('canvas');
    this.tempCanvas.width = TILE_SIZE;
    this.tempCanvas.height = TILE_SIZE;
    const tempCtx = this.tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Could not get 2d context for temp canvas');
    this.tempCtx = tempCtx;

    this.setupCanvas();
    this.setupEventListeners();
    this.startSimulation();
    this.startAnimation();
  }

  private startAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }

    // animate path by switching between normal and alt sprites
    this.animationInterval = window.setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % 2;
      this.render();
    }, 500); // switch every 500ms
  }

  public destroy() {
    if (this.simInterval) {
      clearInterval(this.simInterval);
    }
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
  }

  private setupCanvas() {
    const level = this.state.level;

    const scale = 4;
    const baseCanvasWidth = level.width * TILE_SIZE;
    const baseCanvasHeight = level.height * TILE_SIZE;

    // changing canvas width/height
    this.canvas.width = baseCanvasWidth * scale;
    this.canvas.height = baseCanvasHeight * scale;

    this.updateCanvasDisplaySize(baseCanvasWidth, baseCanvasHeight);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(scale, scale);

    this.ctx.imageSmoothingEnabled = false;
    this.tempCtx.imageSmoothingEnabled = false;
  }

  private updateCanvasDisplaySize(baseCanvasWidth: number, baseCanvasHeight: number) {
    // fit display size w current layout
    const headerEl = document.querySelector('.header') as HTMLElement | null;
    const controlsEl = document.querySelector('.game-controls') as HTMLElement | null;
    const infoEl = document.querySelector('.game-info') as HTMLElement | null;
    const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null;
    const inventoryEl = document.getElementById('inventory') as HTMLElement | null;

    const headerH = headerEl?.getBoundingClientRect().height ?? 0;
    const controlsH = controlsEl?.getBoundingClientRect().height ?? 0;
    const inventoryH = inventoryEl?.getBoundingClientRect().height ?? 0;
    const infoH = infoEl?.getBoundingClientRect().height ?? 0;
    const sidebarW = sidebarEl?.getBoundingClientRect().width ?? 0;

    const logo = document.querySelector('.logo') as HTMLElement | null;
    const extraLogoSpace = logo ? logo.getBoundingClientRect().height * 0.5 : 0;

    const paddingW = 64;
    const paddingH = 72;

    const maxW = Math.max(120, window.innerWidth - sidebarW - paddingW);
    const maxH = Math.max(
      120,
      window.innerHeight - headerH - controlsH - inventoryH - infoH - paddingH - extraLogoSpace
    );

    const fitScale = Math.min(maxW / baseCanvasWidth, maxH / baseCanvasHeight, 1);
    const cssW = Math.max(64, Math.floor(baseCanvasWidth * fitScale));
    const cssH = Math.max(64, Math.floor(baseCanvasHeight * fitScale));

    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.handlePointerMove(e);
      this.handleHover(e);
    });
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => {
      this.stopDrawing();
      this.hoverTile = null;
      this.render();
    });

    // touch svreen support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const coords = { clientX: touch.clientX, clientY: touch.clientY };
      this.handlePointerMove(coords);
      this.handleHover(coords);
    });
    this.canvas.addEventListener('touchend', () => this.stopDrawing());

    window.addEventListener('resize', () => {
      const level = this.state.level;
      this.updateCanvasDisplaySize(level.width * TILE_SIZE, level.height * TILE_SIZE);
      this.render();
    });

    // undo only while drawing paths

    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (this.uiMode !== 'play') return;
      if (this.state.status !== 'idle') return;
      if (this.showingOptimalReplay) return;
      e.preventDefault();
      this.undoLastPathStep();
    });
  }

  private undoLastPathStep() {
    if (this.state.path.length <= 1) return;
    this.state = { ...this.state, path: this.state.path.slice(0, -1) };
    playPathTileSfx();
    this.render();
    this.updateUI();
  }

  private handlePointerDown(e: { clientX: number; clientY: number }) {
    if (this.state.status !== 'idle') return;
    const pos = getTilePos(
      this.canvas,
      this.state.level.width,
      this.state.level.height,
      e.clientX,
      e.clientY
    );
    if (!pos) return;

    if (this.uiMode === 'build') {
      if (!inBounds(this.state.level.width, this.state.level.height, pos)) return;
      this.isDrawing = true;
      this.lastBuildPaintKey = null;

      this.onBuildTileClick?.(pos);
      this.lastBuildPaintKey = `${pos.x},${pos.y}`;
      return;
    }

    const last = this.state.path[this.state.path.length - 1] ?? this.state.level.start;
    if (pos.x !== last.x || pos.y !== last.y) return;

    this.isDrawing = true;
  }

  private handlePointerMove(e: { clientX: number; clientY: number }) {
    if (this.uiMode === 'build') {
      if (!this.isDrawing) return;
      if (this.state.status !== 'idle') return;

      const pos = getTilePos(
        this.canvas,
        this.state.level.width,
        this.state.level.height,
        e.clientX,
        e.clientY
      );
      if (!pos) return;
      if (!inBounds(this.state.level.width, this.state.level.height, pos)) return;

      const key = `${pos.x},${pos.y}`;
      if (this.lastBuildPaintKey === key) return;
      this.lastBuildPaintKey = key;

      // repaintttt
      this.onBuildTileClick?.(pos);
      return;
    }

    if (!this.isDrawing) return;
    if (this.state.status !== 'idle') return;

    const pos = getTilePos(
      this.canvas,
      this.state.level.width,
      this.state.level.height,
      e.clientX,
      e.clientY
    );
    if (!pos) return;
    if (!inBounds(this.state.level.width, this.state.level.height, pos)) return;

    const prevLen = this.state.path.length;
    this.state = tryAppendPath(this.state, pos);
    if (this.state.path.length > prevLen) {
      playPathTileSfx();
    }
    this.render();
    this.updateUI();
  }

  private stopDrawing() {
    this.isDrawing = false;
    this.lastBuildPaintKey = null;
  }

  private handleHover(e: { clientX: number; clientY: number }) {
    const pos = getTilePos(
      this.canvas,
      this.state.level.width,
      this.state.level.height,
      e.clientX,
      e.clientY
    );
    if (pos && inBounds(this.state.level.width, this.state.level.height, pos)) {
      if (this.hoverTile?.x !== pos.x || this.hoverTile?.y !== pos.y) {
        this.hoverTile = pos;
        this.render();
      }

      if (this.uiMode === 'build') {
        this.canvas.style.cursor = this.buildCursor;
        return;
      }

      // grab cursor on path that you can grab from
      const lastPathTile = this.state.path[this.state.path.length - 1];
      const isLastPathTile = lastPathTile && pos.x === lastPathTile.x && pos.y === lastPathTile.y;

      // TODO: SPRITE CHANGE!! make it green or something when u can grab on it
      if (isLastPathTile) {
        this.canvas.style.cursor = this.isDrawing ? 'grabbing' : 'grab';
      } else {
        this.canvas.style.cursor = 'default';
      }
    } else {
      if (this.hoverTile !== null) {
        this.hoverTile = null;
        this.render();
      }
      this.canvas.style.cursor = 'default';
    }
  }

  public setUIMode(mode: 'play' | 'build') {
    this.uiMode = mode;
    this.isDrawing = false;
    this.lastBuildPaintKey = null;
    this.buildCursor = 'crosshair';
    this.dragGhostRenderer = null;
    this.glorboHidden = false;
    if (this.uiMode === 'play') {
      this.builderHoverSprite = null;
    }
    if (this.uiMode === 'build') {
      // stop sim while editing
      if (this.simInterval) {
        clearInterval(this.simInterval);
        this.simInterval = null;
      }
    }
    this.render();
    this.updateUI();
  }

  public setOnBuildTileClick(handler: ((pos: Pos) => void) | null) {
    this.onBuildTileClick = handler;
  }

  public setBuildCursor(cursor: string) {
    this.buildCursor = cursor;
    if (this.uiMode === 'build') {
      this.canvas.style.cursor = cursor;
    }
  }

  public setDragGhost(
    fn:
      | ((ctx: CanvasRenderingContext2D, tileX: number, tileY: number, animFrame: number) => void)
      | null
  ) {
    this.dragGhostRenderer = fn;
    this.render();
  }

  public setBuilderHoverSprite(img: HTMLImageElement | null) {
    this.builderHoverSprite = img;
    this.render();
  }

  public setGlorboHidden(hidden: boolean) {
    this.glorboHidden = hidden;
  }

  public setOnSuccess(handler: ((moves: number) => void) | null) {
    this.onSuccess = handler;
  }

  public setLevelId(levelId: string | null) {
    this.currentLevelId = levelId;
  }

  public getState(): GameState {
    return this.state;
  }

  public setState(newState: GameState) {
    const prevW = this.state.level.width;
    const prevH = this.state.level.height;
    this.state = newState;

    if (newState.level.width !== prevW || newState.level.height !== prevH) {
      this.setupCanvas();
    }

    // reset success on reset
    if (newState.status !== 'success') {
      this.successHandled = false;
    }
    // clear optimal replay flag on retry/new level (idle), keep it when user presses run
    if (newState.status === 'idle') {
      this.showingOptimalReplay = false;
    }
    this.render();
    this.updateUI();
    this.startSimulation();
  }

  public updateBestScoreDisplay() {
    this.updateUI();
  }

  /** Show the optimal path laid out on the board (idle, user presses run to play it) */
  public showOptimalPath(path: Pos[]) {
    this.showingOptimalReplay = true;
    this.successHandled = true;
    const level = this.state.level;
    const replayState: GameState = {
      level,
      path,
      status: 'idle',
      stepIndex: 0,
      stepsTaken: 0,
      glorboPos: path[0] ?? level.start,
      inventory: [],
      remainingOrders: { A: [...level.orders.A], B: [...level.orders.B], C: [...level.orders.C] },
      message: 'optimal path',
    };
    this.state = replayState;
    this.render();
    this.updateUI();
  }

  public getPath(): Pos[] {
    return this.state.path;
  }

  public getLevelDimensions(): { width: number; height: number } {
    return {
      width: this.state.level.width,
      height: this.state.level.height,
    };
  }

  private startSimulation() {
    if (this.uiMode === 'build') return;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }

    if (this.state.status !== 'running') return;

    this.state = stepSimulation(this.state);
    if (this.state.status === 'running') {
      playStepSfx();
    }
    this.render();
    this.updateUI();

    if (this.state.status !== 'running') {
      if (this.state.status === 'failed') {
        this.showFailurePopup();
      } else if (
        this.state.status === 'success' &&
        this.onSuccess &&
        !this.successHandled &&
        !this.showingOptimalReplay
      ) {
        this.successHandled = true;
        this.onSuccess(this.state.stepsTaken);
      }
      return;
    }

    this.simInterval = window.setInterval(() => {
      const prevOrders = { ...this.state.remainingOrders };
      this.state = stepSimulation(this.state);

      for (const customerId in prevOrders) {
        if (
          prevOrders[customerId as keyof typeof prevOrders].length >
          this.state.remainingOrders[customerId as keyof typeof this.state.remainingOrders].length
        ) {
          playNiceSfx();
        }
      }

      if (this.state.status === 'running') {
        playStepSfx();
      }
      this.render();
      this.updateUI();

      if (this.state.status !== 'running') {
        if (this.simInterval) {
          clearInterval(this.simInterval);
          this.simInterval = null;
        }
        if (this.state.status === 'failed') {
          playWompSfx();
          this.showFailurePopup();
        } else if (
          this.state.status === 'success' &&
          this.onSuccess &&
          !this.successHandled &&
          !this.showingOptimalReplay
        ) {
          this.successHandled = true;
          this.onSuccess(this.state.stepsTaken);
        }
      }
    }, 250);
  }

  public render() {
    const { level, glorboPos } = this.state;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // draw floor for all tiles
    for (let y = 1; y < level.height - 1; y++) {
      for (let x = 1; x < level.width - 1; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        ctx.drawImage(floorOpen, px, py, TILE_SIZE, TILE_SIZE);
      }
    }

    // draw walls
    const isFloor = (x: number, y: number): boolean => {
      if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
      return !level.walls.has(`${x},${y}`);
    };

    for (const wallKey of level.walls) {
      const [x, y] = wallKey.split(',').map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      let wallSprite: HTMLImageElement = wallTop; // default fallback

      if (isFloor(x, y + 1)) {
        wallSprite = wallTop;
      } else if (isFloor(x, y - 1)) {
        wallSprite = wallBot;
      } else if (!isFloor(x - 1, y + 1) && isFloor(x - 1, y)) {
        wallSprite = wallRightBot;
      } else if (isFloor(x - 1, y)) {
        wallSprite = wallRightMid;
      } else if (isFloor(x - 1, y + 1)) {
        wallSprite = wallRightTop;
      } else if (!isFloor(x + 1, y + 1) && isFloor(x + 1, y)) {
        wallSprite = wallLeftBot;
      } else if (isFloor(x + 1, y)) {
        wallSprite = wallLeftMid;
      } else if (isFloor(x + 1, y + 1)) {
        wallSprite = wallLeftTop;
      } else if (isFloor(x + 1, y - 1)) {
        wallSprite = wallLeftCorner;
      } else if (isFloor(x - 1, y - 1)) {
        wallSprite = wallRightCorner;
      }

      ctx.drawImage(wallSprite, px, py, TILE_SIZE, TILE_SIZE);
    }

    // draw obstacles

    const twoTileTypes = ['plant_two', 'window_double_a', 'window_double_b'] as const;
    const twoTileByRow = new Map<string, Map<string, number[]>>();
    for (const t of twoTileTypes) {
      twoTileByRow.set(t, new Map());
    }
    for (const [key, type] of Object.entries(level.obstacles)) {
      if (!twoTileTypes.includes(type as (typeof twoTileTypes)[number])) continue;
      const [x, y] = key.split(',').map(Number);
      const byRow = twoTileByRow.get(type as (typeof twoTileTypes)[number])!;
      const xs = byRow.get(String(y)) ?? [];
      xs.push(x);
      byRow.set(String(y), xs);
    }

    for (const t of twoTileTypes) {
      const byRow = twoTileByRow.get(t)!;
      const sprite = sprites.obstacles[t as ObstacleId];
      if (!sprite) continue;
      for (const [yStr, xsRaw] of byRow.entries()) {
        const y = Number(yStr);
        const xs = Array.from(new Set(xsRaw)).sort((a, b) => a - b);
        for (let i = 0; i < xs.length - 1; ) {
          const x = xs[i]!;
          const x2 = xs[i + 1]!;
          if (x2 === x + 1) {
            ctx.drawImage(sprite, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
            i += 2;
          } else {
            i += 1;
          }
        }
      }
    }

    for (const [key, type] of Object.entries(level.obstacles)) {
      const [x, y] = key.split(',').map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      if (twoTileTypes.includes(type as (typeof twoTileTypes)[number])) continue;

      const obstacleSprite = sprites.obstacles[type as ObstacleId];
      if (!obstacleSprite) continue;

      let spriteToDraw = obstacleSprite;
      if (type === 'cat') {
        spriteToDraw = this.animationFrame % 2 === 0 ? obstacleSprite : catAltSprite;
      }

      ctx.drawImage(spriteToDraw, px, py, TILE_SIZE, TILE_SIZE);
    }

    // draw drink stations
    for (const [key, drink] of Object.entries(level.drinkStations)) {
      const [x, y] = key.split(',').map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      // check if glorbo is on this drink station
      const isGlorboOnStation = glorboPos.x === x && glorboPos.y === y;

      const drinkSprite = sprites.drinks[drink as DrinkId];
      if (!drinkSprite) continue;

      // use pressed sprite if glorbo is on it and has pressed sprite
      const spriteToUse =
        isGlorboOnStation && sprites.drinkPressed ? sprites.drinkPressed : drinkSprite;
      ctx.drawImage(spriteToUse, px, py, TILE_SIZE, TILE_SIZE);
    }

    // serve boxes
    for (const [key, customerId] of Object.entries(level.standHere)) {
      const isServed =
        (this.state.remainingOrders[customerId as 'A' | 'B' | 'C']?.length ?? 0) === 0;
      if (isServed) continue;
      const [x, y] = key.split(',').map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      const standWidth = standHere.width;
      const standHeight = standHere.height;
      const frameWidth = standWidth / 2;
      const frameIndex = this.animationFrame % 2;

      ctx.drawImage(
        standHere,
        frameIndex * frameWidth,
        0,
        frameWidth,
        standHeight,
        px,
        py,
        TILE_SIZE,
        TILE_SIZE
      );
    }

    // draw customers
    for (const [key, customerId] of Object.entries(level.customers)) {
      const [x, y] = key.split(',').map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      const customerSprite = sprites.customers[customerId as CustomerId];
      if (!customerSprite) continue;

      // check if customer is served
      const isServed = (this.state.remainingOrders[customerId as CustomerId]?.length ?? 0) === 0;

      // sprite is split into 4 quadrants:
      // top-left (0,0): animation 1 before drink
      // top-right (1,0): animation 2 before drink
      // bottom-left (0,1): animation 1 after drink
      // bottom-right (1,1): animation 2 after drink
      const spriteWidth = customerSprite.width / 2;
      const spriteHeight = customerSprite.height / 2;

      const frameIndex = this.animationFrame % 2; // 0 or 1 for animation frame
      const sourceX = frameIndex * spriteWidth;
      const sourceY = isServed ? spriteHeight : 0; // top half if not served, bottom half if served

      ctx.drawImage(
        customerSprite,
        sourceX,
        sourceY,
        spriteWidth,
        spriteHeight,
        px,
        py,
        TILE_SIZE,
        TILE_SIZE
      );
    }

    if (this.uiMode === 'play') {
      // draw path with directional sprites and gradient overlay
      // use green tint for optimal path replay, default blue otherwise
      const tint = this.showingOptimalReplay ? PATH_TINT_GREEN : undefined;
      renderPath(ctx, this.tempCtx, this.state, this.animationFrame, tint);

      // draw path arrow on the last tile (current point user is on)
      renderPathArrow(ctx, this.state, this.animationFrame);
    }

    // draw glorbo (on top of path) — hidden when being dragged
    if (!this.glorboHidden) {
      const gx = glorboPos.x * TILE_SIZE;
      const gy = glorboPos.y * TILE_SIZE;

      // determine which sprite to use based on inventory count
      const drinkCount = this.state.inventory.length;
      const spriteIndex = Math.min(drinkCount, 2); // 0, 1, or 2

      const spriteSheetWidth = glorboSpriteSheet.width;
      const spriteSheetHeight = glorboSpriteSheet.height;
      const spriteWidth = spriteSheetWidth / 3;
      const spriteHeight = spriteSheetHeight / 2; // 2 rows
      const sourceY = this.animationFrame * spriteHeight; // 0 for static, spriteHeight for animation

      // draw the appropriate sprite from the sprite sheet
      ctx.drawImage(
        glorboSpriteSheet,
        spriteIndex * spriteWidth,
        sourceY,
        spriteWidth,
        spriteHeight, // source rectangle
        gx,
        gy,
        TILE_SIZE,
        TILE_SIZE // destination rectangle
      );
    }

    // draw hover sprite on hovered tile (only during idle state)
    if (this.state.status === 'idle' && this.hoverTile) {
      const hx = this.hoverTile.x * TILE_SIZE;
      const hy = this.hoverTile.y * TILE_SIZE;

      let spriteToUse =
        this.uiMode === 'build' && this.builderHoverSprite ? this.builderHoverSprite : hoverSprite;
      if (this.uiMode === 'play') {
        // check if tile is unwalkable (wall, customer, or obstacle)
        const hoverKey = `${this.hoverTile.x},${this.hoverTile.y}`;
        const isUnwalkable =
          this.state.level.walls.has(hoverKey) ||
          this.state.level.customers[hoverKey] ||
          this.state.level.obstacles[hoverKey];

        // check if hovering over the last path tile (where you can grab from)
        const lastPathTile = this.state.path[this.state.path.length - 1];
        const isLastPathTile =
          lastPathTile &&
          this.hoverTile.x === lastPathTile.x &&
          this.hoverTile.y === lastPathTile.y;

        spriteToUse = isLastPathTile
          ? hoverYepSprite
          : isUnwalkable
            ? hoverNopeSprite
            : hoverSprite;
      }

      // hover sprite has 2 frames split in half horizontally
      const hoverWidth = spriteToUse.width;
      const hoverHeight = spriteToUse.height;
      const frameWidth = hoverWidth / 2;
      // stay on second frame (index 1) when dragging, otherwise animate
      const frameIndex = this.isDrawing ? 1 : this.animationFrame % 2;

      // draw the appropriate frame
      ctx.drawImage(
        spriteToUse,
        frameIndex * frameWidth,
        0,
        frameWidth,
        hoverHeight, // source rectangle
        hx,
        hy,
        TILE_SIZE,
        TILE_SIZE // destination rectangle
      );
    }

    // draw drag ghost at hover tile
    if (this.dragGhostRenderer && this.hoverTile) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      this.dragGhostRenderer(ctx, this.hoverTile.x, this.hoverTile.y, this.animationFrame);
      ctx.restore();
    }
  }

  public updateUI() {
    const stepsEl = document.getElementById('steps');
    const messageEl = document.getElementById('message');
    const bestScoreEl = document.getElementById('best-score');
    const pathEl = document.getElementById('path');
    const inventoryEl = document.getElementById('inventory');
    const runButton = document.getElementById('run-btn') as HTMLButtonElement;
    const retryButton = document.getElementById('retry-btn') as HTMLButtonElement;

    if (stepsEl) {
      const pathSteps = Math.max(0, this.state.path.length - 1);
      const displaySteps = this.state.status === 'idle' ? pathSteps : this.state.stepsTaken;
      stepsEl.textContent = `steps: ${displaySteps}`;
    }
    if (messageEl) messageEl.textContent = this.state.message || '';

    // always show best score if available
    if (bestScoreEl && this.currentLevelId) {
      const bestScore = getBestScoreFromStorage(this.currentLevelId);
      if (bestScore !== null) {
        bestScoreEl.textContent = `best: ${bestScore}`;
        bestScoreEl.style.display = 'block';
      } else {
        bestScoreEl.style.display = 'none';
      }
    } else if (bestScoreEl && !this.currentLevelId) {
      bestScoreEl.style.display = 'none';
    }

    if (pathEl) {
      const pathLabel = this.state.path.map((p) => `(${p.x},${p.y})`).join(' → ');
      pathEl.textContent = `ur path: ${pathLabel}`;
    }

    if (inventoryEl) {
      const inventory = this.state.inventory;
      const slot0 = document.getElementById('inventory-slot-0');
      const slot1 = document.getElementById('inventory-slot-1');
      [slot0, slot1].forEach((slot, i) => {
        if (!slot) return;
        const drinkId = inventory[i];
        if (drinkId) {
          const imageSrc = sprites.drinkItems[drinkId]?.src ?? '';
          slot.innerHTML = `<img src="${imageSrc}" alt="${drinkId}" class="inventory-drink-icon" />`;
        } else {
          slot.innerHTML = '';
        }
      });
    }

    this.updateOrdersDisplay();

    if (runButton) {
      runButton.disabled = this.uiMode === 'build' || this.state.status !== 'idle';
    }

    if (retryButton) {
      retryButton.disabled = this.uiMode === 'build' || this.state.status === 'running';
    }
  }

  private showFailurePopup() {
    const popup = document.getElementById('failure-popup');
    if (popup) {
      popup.style.display = 'flex';
    }
  }

  public hideFailurePopup() {
    const popup = document.getElementById('failure-popup');
    if (popup) {
      popup.style.display = 'none';
    }
  }

  private updateOrdersDisplay() {
    const ordersEl = document.getElementById('orders');
    if (!ordersEl) return;

    const { level, remainingOrders } = this.state;
    const entries = Object.entries(level.orders);
    entries.sort(([a], [b]) => a.localeCompare(b));

    const getCustomerSprite = (customerId: string): HTMLImageElement | null => {
      return sprites.customers[customerId as keyof typeof sprites.customers] ?? null;
    };

    const getDrinkItemImage = (drinkId: string): string => {
      return sprites.drinkItems[drinkId as DrinkId]?.src ?? '';
    };

    const ordersHTML = entries
      .map(([customerId, drinks], index) => {
        const customerSprite = getCustomerSprite(customerId);
        const remaining = remainingOrders[customerId as keyof typeof remainingOrders] ?? drinks;
        const isServed = remaining.length === 0;
        const quadrant: 2 | 3 = isServed ? 3 : 2;
        const customerIconUrl = customerSprite
          ? getCustomerIconDataUrl(customerSprite, quadrant)
          : '';

        // gray out items that have already been served
        const remainingCounts: Record<string, number> = {};
        for (const d of remaining) remainingCounts[d] = (remainingCounts[d] ?? 0) + 1;

        const servedCounts: Record<string, number> = {};
        for (const d of drinks) servedCounts[d] = (servedCounts[d] ?? 0) + 1;
        for (const [d, c] of Object.entries(remainingCounts))
          servedCounts[d] = (servedCounts[d] ?? 0) - c;

        const drinkImages = drinks
          .map((drinkId) => {
            const servedLeft = servedCounts[drinkId] ?? 0;
            const itemServed = servedLeft > 0;
            if (itemServed) servedCounts[drinkId] = servedLeft - 1;
            const servedClass = itemServed ? 'drink-item-served' : '';
            return `<img src="${getDrinkItemImage(drinkId)}" alt="${drinkId}" class="drink-item-icon ${servedClass}" />`;
          })
          .join('');

        const servedClass = isServed ? 'order-served' : '';

        return `
        <li class="order-item ${servedClass}" data-customer-id="${customerId}">
          <div class="order-header">order #${index + 1}</div>
          <div class="order-row">
            <img src="${customerIconUrl}" alt="${customerId}" class="customer-icon" />
            <div class="drink-items">${drinkImages}</div>
          </div>
        </li>
      `;
      })
      .join('');

    ordersEl.innerHTML = ordersHTML;
  }
}

// initialize game
async function init() {
  ensureAudioStartedOnFirstGesture();
  await imagesLoaded;

  // builder tool icons
  const decorIcon = document.getElementById('builder-decor-icon') as HTMLImageElement | null;
  const startIcon = document.getElementById('builder-start-icon') as HTMLImageElement | null;
  const b1 = document.getElementById('builder-cust1-icon') as HTMLImageElement | null;
  const b2 = document.getElementById('builder-cust2-icon') as HTMLImageElement | null;
  const b3 = document.getElementById('builder-cust3-icon') as HTMLImageElement | null;
  if (startIcon) startIcon.src = getGlorboIcon(glorboSpriteSheet);
  if (b1) b1.src = getCustomerIconDataUrl(sprites.customers.A, 2);
  if (b2) b2.src = getCustomerIconDataUrl(sprites.customers.B, 2);
  if (b3) b3.src = getCustomerIconDataUrl(sprites.customers.C, 2);
  if (decorIcon) decorIcon.src = '/src/assets/plant_a.png';

  const { levelData, levelId } = await getTodayLevelFromSupabase();
  const dailyLevelData: LevelData = levelData;
  const dailyLevelId: string | null = levelId;

  // url hash? shared level time
  const sharedToken = getShareTokenFromUrlHash();
  const sharedDecoded = sharedToken ? await decodeLevelShareToken(sharedToken) : null;
  const sharedValidation = sharedDecoded ? validateLevelData(sharedDecoded) : null;
  const hasSharedLevel = !!sharedDecoded && !!sharedValidation && sharedValidation.ok;

  const initialLevelData = hasSharedLevel ? (sharedDecoded as LevelData) : levelData;
  const initialLevelId = hasSharedLevel ? null : levelId;

  const level = buildLevel(initialLevelData);
  const state = initGame(level);

  let currentLevelData: LevelData = JSON.parse(JSON.stringify(initialLevelData)) as LevelData;

  // store level ID for submitting runs
  let currentLevelId: string | null = initialLevelId;

  // setup day text
  const dayTextEl = document.getElementById('day-text');
  if (dayTextEl) {
    if (hasSharedLevel) {
      dayTextEl.textContent = 'shared level';
    } else {
      // extract day number from
      const dayMatch = levelData.id.match(/day-(\d+)/);
      const dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : 1;
      dayTextEl.textContent = `day ${dayNumber} playtest`;
    }
  }

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('no canvas found');

  const renderer = new GameRenderer(canvas, state);
  renderer.setLevelId(currentLevelId);

  // extract day number for popup
  const dayMatch = levelData.id.match(/day-(\d+)/);
  let dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : 1;
  let currentMode: 'shared' | 'daily' | 'custom' = hasSharedLevel ? 'shared' : 'daily';

  const setDayText = (mode: 'shared' | 'daily' | 'custom') => {
    currentMode = mode;
    const dayTextEl = document.getElementById('day-text');
    if (!dayTextEl) return;
    if (mode === 'shared') dayTextEl.textContent = 'shared level';
    else if (mode === 'custom') dayTextEl.textContent = 'your level';
    else dayTextEl.textContent = `day ${dayNumber} playtester ver`;
  };

  const applyLevelDataToRenderer = (
    data: LevelData,
    id: string | null,
    mode: 'shared' | 'daily' | 'custom'
  ) => {
    hideSuccessPopup();
    renderer.hideFailurePopup();

    currentLevelData = JSON.parse(JSON.stringify(data)) as LevelData;
    currentLevelId = id;

    renderer.setLevelId(currentLevelId);
    renderer.setState(initGame(buildLevel(currentLevelData)));
    setDayText(mode);
  };

  // submit run and show top score
  renderer.setOnSuccess(async (moves: number) => {
    if (!currentLevelId) {
      // no level id => can't submit
      return;
    }

    // compute optimal path via BFS solver
    let optimalMoves: number | undefined;
    let optimalPath: Pos[] | undefined;
    try {
      const level = buildLevel(currentLevelData);
      const result = solveLevel(level);
      if (result.solvable) {
        optimalMoves = result.path.length - 1; // path includes start position
        optimalPath = result.path;
      }
    } catch (e) {
      console.error('Error computing optimal path:', e);
    }

    const viewOptimalCallback = optimalPath
      ? () => renderer.showOptimalPath(optimalPath!)
      : undefined;

    try {
      const playerId = getPlayerId();
      const storedBest = getBestScoreFromStorage(currentLevelId);
      const isNewBest = storedBest === null || moves < storedBest;

      // check if player already has a run in database for this level
      const hasExistingRun = await hasRunInDatabase(currentLevelId, playerId);

      // only save to database if this is the first run
      if (!hasExistingRun) {
        await submitRun(currentLevelId, playerId, moves, true);
      }

      // update localStorage if it's a new best (for display purposes)
      if (isNewBest) {
        setBestScoreInStorage(currentLevelId, moves);
        // update UI to show new best score
        renderer.updateBestScoreDisplay();
      }

      // show success popup on every playthrough
      const isCustom = currentMode === 'custom';
      const path = renderer.getPath();
      const { width, height } = renderer.getLevelDimensions();
      showSuccessPopup(
        dayNumber,
        moves,
        currentLevelId,
        path,
        width,
        height,
        optimalMoves,
        viewOptimalCallback,
        isCustom
      );
    } catch (error) {
      console.error('Error submitting run:', error);
      // still show popup even if API call fails
      const isCustom = currentMode === 'custom';
      const path = renderer.getPath();
      const { width, height } = renderer.getLevelDimensions();
      showSuccessPopup(
        dayNumber,
        moves,
        currentLevelId,
        path,
        width,
        height,
        optimalMoves,
        viewOptimalCallback,
        isCustom
      );
    }
  });

  // builder mode starts based off the day's level
  type BuilderTool = 'erase' | 'decor' | 'start' | 'station' | 'cust1' | 'cust2' | 'cust3' | 'drag';
  let builderMode = false;
  let builderData: LevelData = JSON.parse(JSON.stringify(currentLevelData)) as LevelData;
  let builderTool: BuilderTool = 'decor';

  const decorCycle: DecorKind[] = PLACEABLE_DECOR;
  let decorToolDefault: DecorKind = 'plant_a';

  const stationCycle: DrinkId[] = ALL_DRINK_IDS;
  let stationToolDefault: DrinkId = 'D1';

  // drag tool state
  type DraggedItem =
    | { kind: 'start' }
    | { kind: 'station'; drink: DrinkId }
    | { kind: 'customer'; id: 'A' | 'B' | 'C'; standHere: string }
    | { kind: 'decor'; decorKind: DecorKind; clickOffset: number };
  let draggedItem: DraggedItem | null = null;
  let dragOrigin: Pos | null = null;

  const builderButton = document.getElementById('builder-btn') as HTMLButtonElement | null;
  const builderPanel = document.getElementById('builder-panel') as HTMLDivElement | null;
  const builderStatusEl = document.getElementById('builder-status') as HTMLDivElement | null;
  const builderWidthInput = document.getElementById(
    'builder-width-input'
  ) as HTMLInputElement | null;
  const builderHeightInput = document.getElementById(
    'builder-height-input'
  ) as HTMLInputElement | null;
  const builderResizeBtn = document.getElementById(
    'builder-resize-btn'
  ) as HTMLButtonElement | null;
  const toolButtons = Array.from(
    document.querySelectorAll('.builder-tool-btn')
  ) as HTMLButtonElement[];
  const checkBtn = document.getElementById('builder-check-btn') as HTMLButtonElement | null;
  const shareBtn = document.getElementById('builder-share-btn') as HTMLButtonElement | null;
  const sidebarOrdersEl = document.getElementById('orders') as HTMLUListElement | null;
  const ordersHeadingEl = document.getElementById('orders-heading');

  const setBuilderStatus = (text: string) => {
    if (builderStatusEl) builderStatusEl.textContent = text;
  };

  let builderShareReady = false;
  const updateShareUI = () => {
    if (!shareBtn) return;

    shareBtn.disabled = false;
    shareBtn.classList.toggle('builder-share-disabled', !builderShareReady);
    shareBtn.setAttribute('aria-disabled', builderShareReady ? 'false' : 'true');
    shareBtn.title = builderShareReady ? 'share this level' : 'run check first';
  };
  const updateExitUI = () => {
    const exitBtn = document.getElementById('exit-builder-btn') as HTMLButtonElement | null;
    if (!exitBtn) return;
    exitBtn.disabled = !builderShareReady;
    exitBtn.title = builderShareReady ? 'exit builder and save' : 'check level first';
  };
  const markBuilderDirty = () => {
    builderShareReady = false;
    updateShareUI();
    updateExitUI();
  };
  updateShareUI();
  updateExitUI();

  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

  const MIN_BUILDER_SIZE = 6;
  const MAX_BUILDER_SIZE = 12;

  const isBorderTile = (w: number, h: number, p: Pos) =>
    p.x === 0 || p.y === 0 || p.x === w - 1 || p.y === h - 1;

  const syncBuilderSizeInputs = () => {
    if (builderWidthInput) builderWidthInput.value = String(builderData.width);
    if (builderHeightInput) builderHeightInput.value = String(builderData.height);
  };

  const builderTipEl = document.getElementById('builder-tip');

  const applyToolActiveUI = () => {
    for (const btn of toolButtons) {
      const tool = btn.dataset.tool as BuilderTool | undefined;
      btn.classList.toggle('builder-tool-active', tool === builderTool);
    }
    if (builderTipEl) {
      builderTipEl.style.display =
        builderTool === 'station' || builderTool === 'decor' ? '' : 'none';
    }
  };

  const normalizeOrders = () => {
    // ensure every customer has at least drink 1
    builderData.orders = {
      A: builderData.orders?.A?.length ? builderData.orders.A.slice(0, 2) : ['D1'],
      B: builderData.orders?.B?.length ? builderData.orders.B.slice(0, 2) : ['D1'],
      C: builderData.orders?.C?.length ? builderData.orders.C.slice(0, 2) : ['D1'],
    };
  };

  const rebuildPreview = () => {
    normalizeOrders();

    // automatically border walls
    enforceBorderWalls();

    renderer.setState(initGame(buildLevel(builderData)));
    if (builderMode) {
      renderBuilderOrdersInSidebar();
    }

    if (builderMode) markBuilderDirty();
  };

  const renderBuilderOrdersInSidebar = () => {
    if (!sidebarOrdersEl) return;
    normalizeOrders();

    // replace normal orders list w button ver... idk if i like this approach but whatever

    const drinkIconSrc = (drink: DrinkId) => {
      return sprites.drinkItems[drink]?.src ?? '/src/assets/drink_a_item.png';
    };

    const renderDrinkButtonContent = (value: DrinkId | '') => {
      if (value === '') {
        const placeholder = document.createElement('div');
        placeholder.className = 'builder-none-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        return placeholder;
      }
      const img = document.createElement('img');
      img.src = drinkIconSrc(value);
      img.alt = value;
      img.className = 'drink-item-icon';
      return img;
    };

    const makeDrinkButton = (
      value: DrinkId | '',
      allowNone: boolean,
      onPick: (v: DrinkId | '') => void
    ) => {
      const btn = document.createElement('button');
      btn.className = 'game-button builder-drink-btn';
      btn.type = 'button';
      btn.ariaLabel = 'pick item';

      const setValue = (v: DrinkId | '') => {
        btn.innerHTML = '';
        btn.appendChild(renderDrinkButtonContent(v));
      };

      setValue(value);

      btn.addEventListener('click', () => {
        const items: DrinkId[] = ['D1', 'D2', 'F1', 'F2', 'F3'];
        if (allowNone) {
          const extended: (DrinkId | '')[] = ['', ...items];
          const idx = extended.indexOf(value);
          const next = extended[(idx + 1) % extended.length] ?? 'D1';
          value = next;
        } else {
          const idx = items.indexOf(value as DrinkId);
          const next = items[(idx + 1) % items.length] ?? 'D1';
          value = next;
        }

        setValue(value);
        onPick(value);
      });

      return btn;
    };

    const getCustomerSprite = (customerId: string): HTMLImageElement | null => {
      return sprites.customers[customerId as keyof typeof sprites.customers] ?? null;
    };

    sidebarOrdersEl.innerHTML = '';

    for (const id of ['A', 'B', 'C'] as const) {
      const li = document.createElement('li');
      li.className = 'order-item';

      const header = document.createElement('div');
      header.className = 'order-header';
      header.textContent = `order #${id}`;

      const row = document.createElement('div');
      row.className = 'order-row';

      const sprite = getCustomerSprite(id);
      const iconUrl = sprite ? getCustomerIconDataUrl(sprite, 2) : '';
      const icon = document.createElement('img');
      icon.src = iconUrl;
      icon.alt = id;
      icon.className = 'customer-icon';

      const drinks = document.createElement('div');
      drinks.className = 'drink-items';

      const first = builderData.orders[id][0] ?? 'D1';
      const second = builderData.orders[id][1] ?? '';

      let a = first as DrinkId;
      let b = second as DrinkId | '';

      const commit = () => {
        // write to builder data and rebuild preview
        builderData.orders[id] = b ? [a, b] : [a];
        rebuildPreview();
        setBuilderStatus('edited! check again');
      };

      const btn1 = makeDrinkButton(a, false, (v) => {
        a = v as DrinkId;
        commit();
      });
      const btn2 = makeDrinkButton(b, true, (v) => {
        b = v;
        commit();
      });

      drinks.appendChild(btn1);
      drinks.appendChild(btn2);

      row.appendChild(icon);
      row.appendChild(drinks);

      li.appendChild(header);
      li.appendChild(row);

      sidebarOrdersEl.appendChild(li);
    }
  };

  const posKey = (p: Pos) => `${p.x},${p.y}`;

  type StandDir = 'left' | 'right' | 'up' | 'down';
  const standDirs: StandDir[] = ['left', 'up', 'right', 'down'];

  const standPosFor = (p: Pos, dir: StandDir): Pos => {
    if (dir === 'left') return { x: p.x - 1, y: p.y };
    if (dir === 'right') return { x: p.x + 1, y: p.y };
    if (dir === 'up') return { x: p.x, y: p.y - 1 };
    return { x: p.x, y: p.y + 1 };
  };

  const hasWallAt = (p: Pos) => builderData.walls.some((w) => w.x === p.x && w.y === p.y);
  const hasCustomerAt = (p: Pos) => builderData.customers.some((c) => c.x === p.x && c.y === p.y);
  const obstacleAt = (p: Pos) => builderData.obstacles.find((o) => o.x === p.x && o.y === p.y);

  const normalizeObstacles = () => {
    const inB = (p: Pos) => inBounds(builderData.width, builderData.height, p);
    const startKey = posKey(builderData.start);

    // special case for wall decor (top row only)
    const topBorderWallDecor: { x: number; y: number; type: ObstacleId }[] = [];
    const topBorderWallDecorSet = new Set<string>();

    const byKey = new Map<string, ObstacleId>();
    for (const o of builderData.obstacles) {
      const p = { x: o.x, y: o.y };
      if (!inB(p)) continue;
      if (isBorderTile(builderData.width, builderData.height, p)) {
        if (
          p.y === 0 &&
          p.x > 0 &&
          p.x < builderData.width - 1 &&
          isWallDecorType(o.type as ObstacleId)
        ) {
          const key = posKey(p);
          if (key !== startKey && !topBorderWallDecorSet.has(key)) {
            topBorderWallDecorSet.add(key);
            topBorderWallDecor.push({ x: p.x, y: p.y, type: o.type as ObstacleId });
          }
        }
        continue;
      }
      if (posKey(p) === startKey) continue;
      byKey.set(posKey(p), o.type as ObstacleId);
    }

    const keep = new Set<string>();

    // plant_two pairs
    const plantTwoXsByRow = new Map<number, number[]>();
    for (const [key, type] of byKey.entries()) {
      if (type !== 'plant_two') continue;
      const [x, y] = key.split(',').map(Number);
      const xs = plantTwoXsByRow.get(y) ?? [];
      xs.push(x);
      plantTwoXsByRow.set(y, xs);
    }

    for (const [y, xsRaw] of plantTwoXsByRow.entries()) {
      const xs = Array.from(new Set(xsRaw)).sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; ) {
        const x = xs[i]!;
        const x2 = xs[i + 1]!;
        if (x2 === x + 1) {
          keep.add(`${x},${y}`);
          keep.add(`${x2},${y}`);
          i += 2;
        } else {
          i += 1;
        }
      }
    }

    // chungus tables
    for (const [key, type] of byKey.entries()) {
      if (type !== 'table_l') continue;
      const [x, y] = key.split(',').map(Number);
      const midKey = `${x + 1},${y}`;
      const rightKey = `${x + 2},${y}`;
      if (byKey.get(midKey) === 'table_m' && byKey.get(rightKey) === 'table_r') {
        keep.add(key);
        keep.add(midKey);
        keep.add(rightKey);
      }
    }

    // 1x1 stuff (keep anything not part of a multi-tile group or wall decor)
    for (const [key, type] of byKey.entries()) {
      if (
        type !== 'plant_two' &&
        type !== 'table_l' &&
        type !== 'table_m' &&
        type !== 'table_r' &&
        !isWallDecorType(type as ObstacleId)
      ) {
        keep.add(key);
      }
    }

    const interior = Array.from(keep).map((key) => {
      const [x, y] = key.split(',').map(Number);
      const type = byKey.get(key) as ObstacleId;
      return { x, y, type };
    });

    builderData.obstacles = [...interior, ...topBorderWallDecor];
  };

  const isValidStandTile = (p: Pos): boolean => {
    if (!inBounds(builderData.width, builderData.height, p)) return false;
    if (isBorderTile(builderData.width, builderData.height, p)) return false;
    if (hasWallAt(p)) return false;
    if (hasCustomerAt(p)) return false;
    if (obstacleAt(p)) return false;
    return true;
  };

  const enforceBorderWalls = () => {
    const w = builderData.width;
    const h = builderData.height;
    if (w < 3 || h < 3) return;

    // clamp start into the interior so it can't overlap borders or be outside
    const nextStart = {
      x: clamp(builderData.start.x, 1, w - 2),
      y: clamp(builderData.start.y, 1, h - 2),
    };
    builderData.start = nextStart;

    const startKey = `${builderData.start.x},${builderData.start.y}`;

    // remove Anything that would overlap
    builderData.drinkStations = builderData.drinkStations.filter((d) => {
      const key = `${d.x},${d.y}`;
      return key !== startKey && !isBorderTile(w, h, { x: d.x, y: d.y });
    });

    builderData.customers = builderData.customers.filter((c) => {
      const key = `${c.x},${c.y}`;
      return key !== startKey && !isBorderTile(w, h, { x: c.x, y: c.y });
    });

    builderData.obstacles = builderData.obstacles.filter((o) => {
      const key = `${o.x},${o.y}`;
      if (key === startKey) return false;

      const isBorder = isBorderTile(w, h, { x: o.x, y: o.y });
      if (!isBorder) return true;

      return isWallDecorType(o.type as ObstacleId) && o.y === 0 && o.x > 0 && o.x < w - 1;
    });

    const wallSet = new Set(builderData.walls.map((wall) => `${wall.x},${wall.y}`));

    for (let x = 0; x < w; x++) {
      wallSet.add(`${x},0`);
      wallSet.add(`${x},${h - 1}`);
    }
    for (let y = 0; y < h; y++) {
      wallSet.add(`0,${y}`);
      wallSet.add(`${w - 1},${y}`);
    }

    wallSet.delete(startKey);

    builderData.walls = Array.from(wallSet).map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });

    normalizeObstacles();
  };

  const getObstacleGroupAt = (p: Pos): Pos[] => {
    const o = obstacleAt(p);
    if (!o) return [p];
    const type = o.type as ObstacleId;

    const twoTileGroup = (t: ObstacleId): Pos[] => {
      const xs = builderData.obstacles
        .filter((ob) => ob.type === t && ob.y === p.y)
        .map((ob) => ob.x)
        .sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; ) {
        const x = xs[i]!;
        const x2 = xs[i + 1]!;
        if (x2 === x + 1) {
          if (p.x === x || p.x === x2)
            return [
              { x, y: p.y },
              { x: x2, y: p.y },
            ];
          i += 2;
        } else {
          i += 1;
        }
      }
      return [p];
    };

    if (type === 'plant_two') return twoTileGroup('plant_two');
    if (type === 'window_double_a') return twoTileGroup('window_double_a');
    if (type === 'window_double_b') return twoTileGroup('window_double_b');

    if (type === 'table_l') return [p, { x: p.x + 1, y: p.y }, { x: p.x + 2, y: p.y }];
    if (type === 'table_m') return [{ x: p.x - 1, y: p.y }, p, { x: p.x + 1, y: p.y }];
    if (type === 'table_r') return [{ x: p.x - 2, y: p.y }, { x: p.x - 1, y: p.y }, p];

    return [p];
  };

  const removeAt = (p: Pos): boolean => {
    if (isBorderTile(builderData.width, builderData.height, p)) {
      setBuilderStatus('border tiles are always walls');
      return false;
    }

    const keys = new Set(getObstacleGroupAt(p).map(posKey));
    const hadWall = builderData.walls.some((w) => keys.has(`${w.x},${w.y}`));
    const hadStation = builderData.drinkStations.some((d) => keys.has(`${d.x},${d.y}`));
    const hadCustomer = builderData.customers.some((c) => keys.has(`${c.x},${c.y}`));
    const hadObstacle = builderData.obstacles.some((o) => keys.has(`${o.x},${o.y}`));

    builderData.walls = builderData.walls.filter((w) => !keys.has(`${w.x},${w.y}`));
    builderData.drinkStations = builderData.drinkStations.filter((d) => !keys.has(`${d.x},${d.y}`));
    builderData.customers = builderData.customers.filter((c) => !keys.has(`${c.x},${c.y}`));
    builderData.obstacles = builderData.obstacles.filter((o) => !keys.has(`${o.x},${o.y}`));

    return hadWall || hadStation || hadCustomer || hadObstacle;
  };

  const setObstacleTiles = (tiles: { p: Pos; type: ObstacleId }[]) => {
    const keys = new Set(tiles.map((t) => posKey(t.p)));
    builderData.obstacles = builderData.obstacles.filter((o) => !keys.has(`${o.x},${o.y}`));
    builderData.walls = builderData.walls.filter((w) => !keys.has(`${w.x},${w.y}`));
    builderData.drinkStations = builderData.drinkStations.filter((d) => !keys.has(`${d.x},${d.y}`));
    builderData.customers = builderData.customers.filter((c) => !keys.has(`${c.x},${c.y}`));

    builderData.obstacles = [
      ...builderData.obstacles,
      ...tiles.map((t) => ({ x: t.p.x, y: t.p.y, type: t.type })),
    ];
  };

  const canPlaceDecorAt = (p: Pos, kind: DecorKind): boolean => {
    if (!inBounds(builderData.width, builderData.height, p)) return false;
    if (isBorderTile(builderData.width, builderData.height, p)) return false;
    if (posKey(p) === posKey(builderData.start)) return false;

    if (isWallDecorType(kind as ObstacleId)) return false;

    if (kind === 'plant_two') {
      const right = { x: p.x + 1, y: p.y };
      if (!inBounds(builderData.width, builderData.height, right)) return false;
      if (isBorderTile(builderData.width, builderData.height, right)) return false;
      if (posKey(right) === posKey(builderData.start)) return false;
      return true;
    }

    if (kind === 'table_triple') {
      const mid = { x: p.x + 1, y: p.y };
      const right = { x: p.x + 2, y: p.y };
      if (!inBounds(builderData.width, builderData.height, mid)) return false;
      if (!inBounds(builderData.width, builderData.height, right)) return false;
      if (isBorderTile(builderData.width, builderData.height, mid)) return false;
      if (isBorderTile(builderData.width, builderData.height, right)) return false;
      const startKey = posKey(builderData.start);
      if (posKey(mid) === startKey || posKey(right) === startKey) return false;
      return true;
    }

    return true;
  };

  const setDecorAt = (p: Pos, kind: DecorKind, opts?: { silent?: boolean }): boolean => {
    const silent = opts?.silent ?? false;
    const fail = (msg: string) => {
      if (!silent) setBuilderStatus(msg);
      return false;
    };

    if (!inBounds(builderData.width, builderData.height, p)) {
      return fail('out of bounds');
    }

    if (isBorderTile(builderData.width, builderData.height, p)) {
      return fail('border tiles must be walls');
    }
    if (posKey(p) === posKey(builderData.start)) {
      return fail('can’t place decor on start');
    }

    if (isWallDecorType(kind as ObstacleId)) {
      return fail('windows can only go on the top wall');
    }

    const tiles: { p: Pos; type: ObstacleId }[] = [];

    if (kind === 'plant_two') {
      const right = { x: p.x + 1, y: p.y };
      if (!inBounds(builderData.width, builderData.height, right)) {
        return fail('not enough space');
      }
      if (isBorderTile(builderData.width, builderData.height, right)) {
        return fail('not enough space');
      }
      if (posKey(right) === posKey(builderData.start)) {
        return fail('can’t place decor on start');
      }
      tiles.push({ p, type: 'plant_two' }, { p: right, type: 'plant_two' });
    } else if (kind === 'table_triple') {
      const mid = { x: p.x + 1, y: p.y };
      const right = { x: p.x + 2, y: p.y };
      if (
        !inBounds(builderData.width, builderData.height, mid) ||
        !inBounds(builderData.width, builderData.height, right)
      ) {
        return fail('not enough space');
      }
      if (
        isBorderTile(builderData.width, builderData.height, mid) ||
        isBorderTile(builderData.width, builderData.height, right)
      ) {
        return fail('not enough space');
      }
      const startKey = posKey(builderData.start);
      if (posKey(mid) === startKey || posKey(right) === startKey) {
        return fail('can’t place decor on start');
      }
      tiles.push(
        { p, type: 'table_l' },
        { p: mid, type: 'table_m' },
        { p: right, type: 'table_r' }
      );
    } else {
      tiles.push({ p, type: kind as ObstacleId });
    }

    setObstacleTiles(tiles);
    normalizeObstacles();
    return true;
  };

  const decorKindAt = (p: Pos): DecorKind | null => {
    const o = obstacleAt(p);
    if (!o) return null;
    const t = o.type as ObstacleId;
    if (t === 'table_l' || t === 'table_m' || t === 'table_r') return 'table_triple';
    return t;
  };

  const decorWidth = getDecorWidth;

  const candidateAnchorsForClick = (click: Pos, kind: DecorKind, preferredIndex: number): Pos[] => {
    const width = decorWidth(kind);
    const clampedPreferred = clamp(preferredIndex, 0, width - 1);

    const offsets = Array.from({ length: width }, (_, i) => i).sort(
      (a, b) => Math.abs(a - clampedPreferred) - Math.abs(b - clampedPreferred)
    );

    return offsets.map((offset) => ({ x: click.x - offset, y: click.y }));
  };

  const findPlaceableAnchorForCandidate = (
    click: Pos,
    kind: DecorKind,
    preferredIndex: number
  ): Pos | null => {
    for (const anchor of candidateAnchorsForClick(click, kind, preferredIndex)) {
      if (canPlaceDecorAt(anchor, kind)) return anchor;
    }
    return null;
  };

  const cycleWallDecorAt = (p: Pos) => {
    if (p.y !== 0 || p.x <= 0 || p.x >= builderData.width - 1) {
      setBuilderStatus('wall items only go on the top wall (not corners)');
      return;
    }
    const current = obstacleAt(p);
    const currentType = current?.type as ObstacleId | undefined;
    const currentIndex = currentType != null ? WALL_DECOR_TYPES.indexOf(currentType) : -1;
    const nextIndex = currentIndex < WALL_DECOR_TYPES.length - 1 ? currentIndex + 1 : -1;

    // Remove current: for 2-tile wall decor, remove both tiles
    const toRemove = getObstacleGroupAt(p);
    const keysToRemove = new Set(toRemove.map(posKey));
    builderData.obstacles = builderData.obstacles.filter((o) => !keysToRemove.has(`${o.x},${o.y}`));

    if (nextIndex >= 0) {
      const nextType = WALL_DECOR_TYPES[nextIndex];
      if (!nextType) return;
      const width = getDecorWidth(nextType);
      // For 2-tile types, right tile must not be the corner (p.x + width - 1 < width - 1 => p.x < 1 for width 2, so p.x must be 0... no: corner is at x = width-1, so we need p.x + width - 1 <= width - 2, i.e. p.x + 1 < width - 1 for width 2, so p.x < builderData.width - 2)
      if (width === 2 && p.x >= builderData.width - 2) {
        setBuilderStatus('double window needs space: use a tile further left');
        return;
      }
      if (width === 2) {
        builderData.obstacles = [
          ...builderData.obstacles,
          { x: p.x, y: p.y, type: nextType },
          { x: p.x + 1, y: p.y, type: nextType },
        ];
      } else {
        builderData.obstacles = [...builderData.obstacles, { x: p.x, y: p.y, type: nextType }];
      }
    }
  };

  const cycleDecorAt = (p: Pos) => {
    const currentKind = decorKindAt(p);

    // multi tile replacement

    let preferredIndex = 0;
    if (currentKind) {
      const group = getObstacleGroupAt(p);
      const leftmost = group.reduce((min, cur) => (cur.x < min.x ? cur : min), group[0] ?? p);
      preferredIndex = p.x - leftmost.x;
    }

    if (!currentKind) {
      if (hasWallAt(p)) removeAt(p);

      const startIndex = Math.max(0, decorCycle.indexOf(decorToolDefault));
      for (let i = 0; i < decorCycle.length; i++) {
        const candidate = decorCycle[(startIndex + i) % decorCycle.length] ?? 'plant_a';
        const anchor = findPlaceableAnchorForCandidate(p, candidate, preferredIndex);
        if (!anchor) continue;
        if (setDecorAt(anchor, candidate)) {
          decorToolDefault = candidate;
        }
        return;
      }

      setBuilderStatus('no decor fits here');
      return;
    }

    const currentIndex = decorCycle.indexOf(currentKind);
    const startIndex = currentIndex >= 0 ? (currentIndex + 1) % decorCycle.length : 0;

    for (let i = 0; i < decorCycle.length; i++) {
      const candidate = decorCycle[(startIndex + i) % decorCycle.length] ?? 'plant_a';
      const anchor = findPlaceableAnchorForCandidate(p, candidate, preferredIndex);
      if (!anchor) continue;

      removeAt(p);
      if (setDecorAt(anchor, candidate)) {
        decorToolDefault = candidate;
      }
      return;
    }

    setBuilderStatus('no other decor fits here');
  };

  const setStartAt = (p: Pos) => {
    if (isBorderTile(builderData.width, builderData.height, p)) {
      setBuilderStatus('start can’t be on the border');
      return;
    }
    removeAt(p);
    builderData.start = { x: p.x, y: p.y };
  };

  const setDrinkAt = (p: Pos, drink: DrinkId) => {
    if (isBorderTile(builderData.width, builderData.height, p)) {
      setBuilderStatus('border tiles are walls (can’t place here)');
      return;
    }
    const key = posKey(p);
    if (key === posKey(builderData.start)) {
      // allow start to overlap station (pickup immediately)
    }
    removeAt(p);
    // remove wall/customer; station can overwrite station
    builderData.walls = builderData.walls.filter((w) => `${w.x},${w.y}` !== key);
    builderData.customers = builderData.customers.filter((c) => `${c.x},${c.y}` !== key);
    builderData.obstacles = builderData.obstacles.filter((o) => `${o.x},${o.y}` !== key);
    builderData.drinkStations = builderData.drinkStations.filter((d) => `${d.x},${d.y}` !== key);
    builderData.drinkStations = [...builderData.drinkStations, { x: p.x, y: p.y, drink }];
  };

  const cycleStationAt = (p: Pos) => {
    const key = posKey(p);
    const idx = builderData.drinkStations.findIndex((d) => `${d.x},${d.y}` === key);
    if (idx < 0) {
      setDrinkAt(p, stationToolDefault);
      return;
    }

    const current = builderData.drinkStations[idx]?.drink as DrinkId | undefined;
    const currentIndex = current ? stationCycle.indexOf(current) : -1;
    const next = stationCycle[(currentIndex + 1) % stationCycle.length] ?? 'D1';

    builderData.drinkStations[idx] = { x: p.x, y: p.y, drink: next };
    stationToolDefault = next;
  };

  const setCustomerAt = (p: Pos, id: 'A' | 'B' | 'C') => {
    if (isBorderTile(builderData.width, builderData.height, p)) {
      setBuilderStatus('border tiles are walls (can’t place here)');
      return;
    }
    const key = posKey(p);
    if (key === posKey(builderData.start)) {
      setBuilderStatus("can't place a customer on start");
      return;
    }
    // if clicking same customer, toggle standHere
    const existingHere = builderData.customers.find((c) => `${c.x},${c.y}` === key);
    if (existingHere && existingHere.id === id) {
      const current = existingHere.standHere as StandDir;
      const startIdx = standDirs.indexOf(current);
      const baseIdx = startIdx >= 0 ? startIdx : 0;

      for (let i = 1; i <= standDirs.length; i++) {
        const next = standDirs[(baseIdx + i) % standDirs.length];
        const standPos = standPosFor({ x: existingHere.x, y: existingHere.y }, next);
        if (isValidStandTile(standPos)) {
          existingHere.standHere = next;
          return;
        }
      }

      setBuilderStatus('no valid stand direction here');
      return;
    }

    removeAt(p);

    builderData.walls = builderData.walls.filter((w) => `${w.x},${w.y}` !== key);
    builderData.drinkStations = builderData.drinkStations.filter((d) => `${d.x},${d.y}` !== key);
    builderData.obstacles = builderData.obstacles.filter((o) => `${o.x},${o.y}` !== key);

    // remove any other customer at tile
    builderData.customers = builderData.customers.filter((c) => `${c.x},${c.y}` !== key);
    // ensure unique per id
    builderData.customers = builderData.customers.filter((c) => c.id !== id);

    let chosen: StandDir | null = null;
    for (const dir of standDirs) {
      const standPos = standPosFor(p, dir);
      if (isValidStandTile(standPos)) {
        chosen = dir;
        break;
      }
    }

    if (!chosen) {
      setBuilderStatus('customer needs a valid stand tile');
      return;
    }

    builderData.customers = [...builderData.customers, { x: p.x, y: p.y, id, standHere: chosen }];
  };

  const resizeBuilderLevel = (nextW: number, nextH: number) => {
    if (!Number.isFinite(nextW) || !Number.isFinite(nextH)) return;
    const rawW = Math.floor(nextW);
    const rawH = Math.floor(nextH);
    const cappedW = clamp(rawW, MIN_BUILDER_SIZE, MAX_BUILDER_SIZE);
    const cappedH = clamp(rawH, MIN_BUILDER_SIZE, MAX_BUILDER_SIZE);

    if (cappedW !== rawW || cappedH !== rawH) {
      setBuilderStatus(`size capped to ${MIN_BUILDER_SIZE}–${MAX_BUILDER_SIZE}`);
    }

    const prevW = builderData.width;
    const prevH = builderData.height;

    builderData.width = cappedW;
    builderData.height = cappedH;

    const inB = (x: number, y: number) =>
      x >= 0 && x < builderData.width && y >= 0 && y < builderData.height;

    // erase previous border walls?
    const wasPrevBorder = (w: { x: number; y: number }) =>
      w.x === 0 || w.y === 0 || w.x === prevW - 1 || w.y === prevH - 1;

    builderData.walls = builderData.walls
      .filter((w) => !wasPrevBorder(w))
      .filter((w) => inB(w.x, w.y));
    builderData.drinkStations = builderData.drinkStations.filter((d) => inB(d.x, d.y));
    builderData.customers = builderData.customers.filter((c) => inB(c.x, c.y));
    builderData.obstacles = builderData.obstacles.filter((o) => inB(o.x, o.y));

    builderData.start = {
      x: clamp(builderData.start.x, 0, builderData.width - 1),
      y: clamp(builderData.start.y, 0, builderData.height - 1),
    };

    enforceBorderWalls();
    syncBuilderSizeInputs();
    rebuildPreview();
    setBuilderStatus(`resized to ${builderData.width}x${builderData.height}`);
  };

  // --- drag tool helpers ---

  const makeGhostRenderer = (
    item: DraggedItem
  ): ((ctx: CanvasRenderingContext2D, tx: number, ty: number, animFrame: number) => void) => {
    switch (item.kind) {
      case 'start':
        return (ctx, tx, ty, animFrame) => {
          const px = tx * TILE_SIZE;
          const py = ty * TILE_SIZE;
          const sw = glorboSpriteSheet.width / 3;
          const sh = glorboSpriteSheet.height / 2;
          const sy = animFrame * sh;
          ctx.drawImage(glorboSpriteSheet, 0, sy, sw, sh, px, py, TILE_SIZE, TILE_SIZE);
        };
      case 'station': {
        const sprite = sprites.drinks[item.drink];
        if (!sprite) return () => {}; // fallback
        return (ctx, tx, ty) => {
          ctx.drawImage(sprite, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        };
      }
      case 'customer': {
        const sprite = sprites.customers[item.id];
        if (!sprite) return () => {}; // fallback
        return (ctx, tx, ty, animFrame) => {
          const sw = sprite.width / 2;
          const sh = sprite.height / 2;
          const sx = (animFrame % 2) * sw;
          ctx.drawImage(
            sprite,
            sx,
            0,
            sw,
            sh,
            tx * TILE_SIZE,
            ty * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE
          );
        };
      }
      case 'decor': {
        const { decorKind, clickOffset } = item;
        if (decorKind === 'plant_two') {
          return (ctx, tx, ty) => {
            const ax = (tx - clickOffset) * TILE_SIZE;
            ctx.drawImage(
              sprites.obstacles.plant_two,
              ax,
              ty * TILE_SIZE,
              TILE_SIZE * 2,
              TILE_SIZE
            );
          };
        }
        if (decorKind === 'window_double_a' || decorKind === 'window_double_b') {
          const sprite = sprites.obstacles[decorKind];
          return (ctx, tx, ty) => {
            if (!sprite) return;
            const ax = (tx - clickOffset) * TILE_SIZE;
            ctx.drawImage(sprite, ax, ty * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
          };
        }
        if (decorKind === 'table_triple') {
          return (ctx, tx, ty) => {
            const ax = tx - clickOffset;
            ctx.drawImage(
              sprites.obstacles.table_l,
              ax * TILE_SIZE,
              ty * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE
            );
            ctx.drawImage(
              sprites.obstacles.table_m,
              (ax + 1) * TILE_SIZE,
              ty * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE
            );
            ctx.drawImage(
              sprites.obstacles.table_r,
              (ax + 2) * TILE_SIZE,
              ty * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE
            );
          };
        }
        if (decorKind === 'cat') {
          const baseSprite = sprites.obstacles.cat ?? sprites.obstacles.plant_a;
          return (ctx, tx, ty, animFrame) => {
            const sprite = animFrame % 2 === 0 ? baseSprite : catAltSprite;
            ctx.drawImage(sprite, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          };
        }
        const sprite = sprites.obstacles[decorKind as ObstacleId] ?? sprites.obstacles.plant_a; // fallback
        return (ctx, tx, ty) => {
          ctx.drawImage(sprite, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        };
      }
    }
  };

  const detectItemAt = (p: Pos): DraggedItem | null => {
    const key = posKey(p);

    // start position
    if (key === posKey(builderData.start)) {
      return { kind: 'start' };
    }

    // drink station
    const station = builderData.drinkStations.find((d) => `${d.x},${d.y}` === key);
    if (station) {
      return { kind: 'station', drink: station.drink as DrinkId };
    }

    // customer
    const customer = builderData.customers.find((c) => `${c.x},${c.y}` === key);
    if (customer) {
      return {
        kind: 'customer',
        id: customer.id as 'A' | 'B' | 'C',
        standHere: customer.standHere as string,
      };
    }

    // obstacle/decor (excluding border windows)
    const obstacle = obstacleAt(p);
    if (obstacle && !isWallDecorType(obstacle.type as ObstacleId)) {
      const dKind = decorKindAt(p);
      if (dKind) {
        const group = getObstacleGroupAt(p);
        const leftmost = group.reduce((min, cur) => (cur.x < min.x ? cur : min), group[0] ?? p);
        const clickOffset = p.x - leftmost.x;
        return { kind: 'decor', decorKind: dKind, clickOffset };
      }
    }

    return null;
  };

  const restoreItem = (origin: Pos, item: DraggedItem) => {
    switch (item.kind) {
      case 'start':
        builderData.start = { x: origin.x, y: origin.y };
        break;
      case 'station':
        setDrinkAt(origin, item.drink);
        break;
      case 'customer':
        setCustomerAt(origin, item.id);
        break;
      case 'decor':
        setDecorAt(origin, item.decorKind, { silent: true });
        break;
    }
  };

  const cancelDrag = () => {
    if (!draggedItem || !dragOrigin) {
      draggedItem = null;
      dragOrigin = null;
      renderer.setDragGhost(null);
      renderer.setGlorboHidden(false);
      return;
    }
    restoreItem(dragOrigin, draggedItem);
    draggedItem = null;
    dragOrigin = null;
    renderer.setDragGhost(null);
    renderer.setGlorboHidden(false);
    rebuildPreview();
    renderer.setBuildCursor('grab');
  };

  const pickUpItem = (p: Pos): boolean => {
    const item = detectItemAt(p);
    if (!item) return false;

    draggedItem = item;
    dragOrigin = { x: p.x, y: p.y };

    // remove item from level data so it disappears visually
    if (item.kind === 'start') {
      renderer.setGlorboHidden(true);
    } else {
      removeAt(p);
    }

    // show ghost sprite following the cursor
    renderer.setDragGhost(makeGhostRenderer(item));
    return true;
  };

  const dropItem = (p: Pos | null) => {
    if (!draggedItem || !dragOrigin) {
      draggedItem = null;
      dragOrigin = null;
      renderer.setDragGhost(null);
      renderer.setGlorboHidden(false);
      return;
    }

    const item = draggedItem;
    const origin = dragOrigin;
    draggedItem = null;
    dragOrigin = null;
    renderer.setDragGhost(null);
    renderer.setGlorboHidden(false);

    // invalid drop position → cancel
    if (
      !p ||
      !inBounds(builderData.width, builderData.height, p) ||
      isBorderTile(builderData.width, builderData.height, p)
    ) {
      restoreItem(origin, item);
      rebuildPreview();
      renderer.setBuildCursor('grab');
      setBuilderStatus("can't place here");
      return;
    }

    // same position → just put it back
    if (p.x === origin.x && p.y === origin.y) {
      restoreItem(origin, item);
      rebuildPreview();
      renderer.setBuildCursor('grab');
      return;
    }

    let success = false;

    switch (item.kind) {
      case 'start':
        removeAt(p);
        builderData.start = { x: p.x, y: p.y };
        success = true;
        break;
      case 'station':
        setDrinkAt(p, item.drink);
        success = true;
        break;
      case 'customer':
        setCustomerAt(p, item.id);
        success = builderData.customers.some((c) => c.id === item.id);
        break;
      case 'decor': {
        const anchor = { x: p.x - item.clickOffset, y: p.y };
        success = setDecorAt(anchor, item.decorKind, { silent: true });
        break;
      }
    }

    if (!success) {
      restoreItem(origin, item);
      setBuilderStatus("can't place here");
    } else {
      markBuilderDirty();
      setBuilderStatus('moved! check again');
    }

    rebuildPreview();
    renderer.setBuildCursor('grab');
  };

  const handleBuildTileClick = (p: Pos) => {
    if (!builderMode) return;
    if (!inBounds(builderData.width, builderData.height, p)) return;

    // border tiles are fixed walls
    if (isBorderTile(builderData.width, builderData.height, p)) {
      if (p.y === 0 && builderTool === 'decor') {
        cycleWallDecorAt(p);
        rebuildPreview();
        setBuilderStatus('edited! check again');
        return;
      }

      // erase wall decor
      if (p.y === 0 && builderTool === 'erase') {
        if (obstacleAt(p) && isWallDecorType(obstacleAt(p)!.type as ObstacleId)) {
          const toRemove = getObstacleGroupAt(p);
          const keysToRemove = new Set(toRemove.map(posKey));
          builderData.obstacles = builderData.obstacles.filter((o) => !keysToRemove.has(`${o.x},${o.y}`));
          playHammerSfx();
          rebuildPreview();
          setBuilderStatus('edited! check again');
        } else {
          setBuilderStatus('border tiles are always walls');
        }
        return;
      }

      setBuilderStatus('border tiles are always walls');
      return;
    }

    // handle drag tool: pick up on first click, ignore during move
    if (builderTool === 'drag') {
      if (!draggedItem) {
        if (!pickUpItem(p)) {
          setBuilderStatus('nothing to drag here');
        } else {
          renderer.setBuildCursor('grabbing');
          rebuildPreview();
          setBuilderStatus('drop on a tile');
        }
      }
      return;
    }

    switch (builderTool) {
      case 'erase': {
        const removed = removeAt(p);
        if (removed) playHammerSfx();
        break;
      }
      case 'decor':
        cycleDecorAt(p);
        break;
      case 'start':
        setStartAt(p);
        break;
      case 'station':
        cycleStationAt(p);
        break;
      case 'cust1':
        setCustomerAt(p, 'A');
        break;
      case 'cust2':
        setCustomerAt(p, 'B');
        break;
      case 'cust3':
        setCustomerAt(p, 'C');
        break;
    }

    rebuildPreview();
    setBuilderStatus('edited! check again');
  };

  for (const btn of toolButtons) {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool as BuilderTool | undefined;
      if (!tool) return;
      // cancel active drag when switching tools
      if (draggedItem) cancelDrag();
      builderTool = tool;
      applyToolActiveUI();
      renderer.setBuildCursor(tool === 'drag' ? 'grab' : 'crosshair');
      const hoverImg =
        tool === 'erase' ? hoverHammerSprite : tool === 'drag' ? hoverDragSprite : null;
      renderer.setBuilderHoverSprite(hoverImg);
    });
  }

  // canvas listeners for drag-and-drop
  canvas.addEventListener('mouseup', (e) => {
    if (!builderMode || builderTool !== 'drag' || !draggedItem) return;
    const pos = getTilePos(canvas, builderData.width, builderData.height, e.clientX, e.clientY);
    dropItem(pos);
  });

  canvas.addEventListener('touchend', (e) => {
    if (!builderMode || builderTool !== 'drag' || !draggedItem) return;
    const touch = e.changedTouches[0];
    const pos = touch
      ? getTilePos(canvas, builderData.width, builderData.height, touch.clientX, touch.clientY)
      : null;
    dropItem(pos);
  });

  canvas.addEventListener('mouseleave', () => {
    if (builderTool === 'drag' && draggedItem) {
      cancelDrag();
    }
  });

  const checkSolvableNow = () => {
    // first validate for quick immediate errors. Then bfs algo (slowerish)
    const validation = validateLevelData(builderData);
    if (!validation.ok) {
      setBuilderStatus(`invalid:\n${validation.errors.join('\n')}`);
      builderShareReady = false;
      updateShareUI();
      updateExitUI();
      return;
    }

    const built = buildLevel(builderData);
    const solved = solveLevel(built);

    builderShareReady = solved.solvable;
    updateShareUI();
    updateExitUI();

    if (solved.solvable) {
      setBuilderStatus(`solvable! (searched ${solved.visitedStates} states)`);
    } else {
      setBuilderStatus(`not solvable (searched ${solved.visitedStates} states)`);
    }
  };

  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      if (!builderMode) return;
      checkSolvableNow();
    });
  }

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      if (!builderMode) return;

      if (!builderShareReady) {
        setBuilderStatus('check the level first');
        return;
      }

      const validation = validateLevelData(builderData);
      if (!validation.ok) {
        builderShareReady = false;
        updateShareUI();
        setBuilderStatus(`invalid:\n${validation.errors.join('\n')}`);
        return;
      }

      normalizeOrders();
      enforceBorderWalls();

      try {
        const token = await encodeLevelShareToken(builderData);
        const url = makeShareUrlFromToken(token);
        const copied = await copyTextToClipboard(url);
        setBuilderStatus(copied ? 'copied share link!' : 'couldn’t copy link :(');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setBuilderStatus(`couldn’t share: ${msg}`);
      }
    });
  }

  const runBtn = document.getElementById('run-btn');
  const retryBtn = document.getElementById('retry-btn');
  const exitBuilderBtn = document.getElementById('exit-builder-btn');

  const enterBuilderMode = () => {
    builderMode = true;
    builderData = JSON.parse(JSON.stringify(currentLevelData)) as LevelData;
    builderTool = 'decor';
    draggedItem = null;
    dragOrigin = null;

    decorToolDefault = 'plant_a';

    enforceBorderWalls();
    syncBuilderSizeInputs();

    renderer.hideFailurePopup();
    renderer.setUIMode('build');
    renderer.setOnBuildTileClick(handleBuildTileClick);
    renderer.setBuilderHoverSprite(null); // builder opens with "decor" tool → default hover

    if (builderPanel) builderPanel.style.display = 'block';
    if (runBtn) runBtn.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'none';
    if (exitBuilderBtn) exitBuilderBtn.style.display = '';

    const exitHint = document.getElementById('exit-builder-hint');
    if (exitHint) exitHint.style.display = '';

    markBuilderDirty(); // require check before exit
    if (ordersHeadingEl) ordersHeadingEl.textContent = 'click to change their orders';
    applyToolActiveUI();
    renderBuilderOrdersInSidebar();
    rebuildPreview();
    setBuilderStatus('builder mode. click tiles to edit');
    setDayText('custom');
  };

  const exitBuilderMode = () => {
    if (draggedItem) cancelDrag();
    builderMode = false;
    renderer.setOnBuildTileClick(null);
    renderer.setUIMode('play');
    if (builderPanel) builderPanel.style.display = 'none';
    if (runBtn) runBtn.style.display = '';
    if (retryBtn) retryBtn.style.display = '';
    if (exitBuilderBtn) exitBuilderBtn.style.display = 'none';

    const exitHint = document.getElementById('exit-builder-hint');
    if (exitHint) exitHint.style.display = 'none';

    if (ordersHeadingEl) ordersHeadingEl.textContent = "today's orders:";

    // keep playing the level you just built if leave (custom level = no stored best)
    currentLevelId = null;
    renderer.setLevelId(null);
    currentLevelData = JSON.parse(JSON.stringify(builderData)) as LevelData;
    renderer.setState(initGame(buildLevel(currentLevelData)));

    setDayText('custom');
  };

  const forceExitBuilderMode = () => {
    if (!builderMode) return;
    draggedItem = null;
    dragOrigin = null;
    builderMode = false;
    renderer.setOnBuildTileClick(null);
    renderer.setUIMode('play');
    if (builderPanel) builderPanel.style.display = 'none';
    if (runBtn) runBtn.style.display = '';
    if (retryBtn) retryBtn.style.display = '';
    if (exitBuilderBtn) exitBuilderBtn.style.display = 'none';

    const exitHint = document.getElementById('exit-builder-hint');
    if (exitHint) exitHint.style.display = 'none';

    if (ordersHeadingEl) ordersHeadingEl.textContent = "today's orders:";
  };

  const applyFromHash = async () => {
    const token = getShareTokenFromUrlHash();
    if (token) {
      const decoded = await decodeLevelShareToken(token);
      const validation = decoded ? validateLevelData(decoded) : null;
      if (decoded && validation && validation.ok) {
        forceExitBuilderMode();
        applyLevelDataToRenderer(decoded as LevelData, null, 'shared');
        return;
      }

      console.warn(
        'Invalid share link',
        validation && !validation.ok ? validation.errors : decoded
      );
      const s = renderer.getState();
      renderer.setState({ ...s, message: 'invalid share link' });
      return;
    }

    forceExitBuilderMode();
    applyLevelDataToRenderer(dailyLevelData, dailyLevelId, 'daily');
  };

  window.addEventListener('hashchange', () => {
    void applyFromHash();
  });

  if (builderButton) {
    builderButton.addEventListener('click', () => {
      if (builderMode) {
        if (!builderShareReady) {
          setBuilderStatus('check the level first');
          return;
        }
        exitBuilderMode();
      } else {
        enterBuilderMode();
      }
    });
  }

  if (exitBuilderBtn) {
    exitBuilderBtn.addEventListener('click', () => {
      if (!builderShareReady) {
        setBuilderStatus('check the level first');
        return;
      }
      exitBuilderMode();
    });
  }

  const tryResizeFromInputs = () => {
    if (!builderMode) return;
    const w = builderWidthInput ? parseInt(builderWidthInput.value, 10) : NaN;
    const h = builderHeightInput ? parseInt(builderHeightInput.value, 10) : NaN;
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      setBuilderStatus('enter valid width/height');
      return;
    }
    resizeBuilderLevel(w, h);
  };

  if (builderResizeBtn) {
    builderResizeBtn.addEventListener('click', () => {
      tryResizeFromInputs();
    });
  }

  if (builderWidthInput) {
    builderWidthInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryResizeFromInputs();
    });
  }

  if (builderHeightInput) {
    builderHeightInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryResizeFromInputs();
    });
  }

  // setup buttons
  const runButton = document.getElementById('run-btn');
  const retryButton = document.getElementById('retry-btn');

  if (runButton) {
    runButton.addEventListener('click', () => {
      const currentState = renderer.getState();
      if (currentState.status !== 'idle') return;
      renderer.hideFailurePopup();
      const newState = {
        ...currentState,
        status: 'running' as const,
        message: 'running...',
      };
      renderer.setState(newState);
    });
  }

  if (retryButton) {
    retryButton.addEventListener('click', () => {
      const currentState = renderer.getState();
      if (currentState.status === 'running') return;
      renderer.hideFailurePopup();
      const newState = clearPath(currentState);
      renderer.setState(newState);
    });
  }

  // setup popup retry button
  const popupRetryButton = document.getElementById('popup-retry-btn');
  if (popupRetryButton) {
    popupRetryButton.addEventListener('click', () => {
      renderer.hideFailurePopup();
      const currentState = renderer.getState();
      const newState = clearPath(currentState);
      renderer.setState(newState);
    });
  }

  // setup success popup close button
  const successPopupCloseBtn = document.getElementById('success-popup-close-btn');
  if (successPopupCloseBtn) {
    successPopupCloseBtn.addEventListener('click', () => {
      hideSuccessPopup();
    });
  }

  // init hamburger menu
  initMenu();

  // listen for level loads from the menu
  document.addEventListener('loadLevel', ((e: CustomEvent) => {
    const { levelData: ld, levelId: lid } = e.detail;
    forceExitBuilderMode();

    const m = (ld as LevelData).id?.match(/day-(\d+)/);
    dayNumber = m ? parseInt(m[1], 10) : 1;

    applyLevelDataToRenderer(ld as LevelData, lid as string, 'daily');
  }) as EventListener);

  // initial render and orders display
  renderer.render();
  renderer.updateUI();
}

function scatterDecorations(): void {
  const count: number = 30;
  const container: HTMLElement = document.body;
  const animationPairs: [string, string][] = [
    ['src/assets/bg1-1.png', 'src/assets/bg1-2.png'],
    ['src/assets/bg2-1.png', 'src/assets/bg2-2.png'],
    ['src/assets/bg3-1.png', 'src/assets/bg3-2.png'],
    ['src/assets/bg4-1.png', 'src/assets/bg4-2.png'],
    ['src/assets/bg5-1.png', 'src/assets/bg5-2.png'],
    ['src/assets/bg6-1.png', 'src/assets/bg6-2.png'],
    ['src/assets/bg7-1.png', 'src/assets/bg7-2.png'],
    ['src/assets/bg8-1.png', 'src/assets/bg8-2.png'],
    ['src/assets/bg9-1.png', 'src/assets/bg9-2.png'],
    ['src/assets/bg10-1.png', 'src/assets/bg10-2.png'],
    ['src/assets/bg11-1.png', 'src/assets/bg11-2.png'],
    ['src/assets/bg12-1.png', 'src/assets/bg12-2.png'],
  ];

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;

  for (let i = 0; i < count; i++) {
    const deco = document.createElement('img');

    const randomPair = animationPairs[Math.floor(Math.random() * animationPairs.length)];
    deco.src = randomPair[0];

    const col = i % cols;
    const row = Math.floor(i / cols);

    const jitterX = Math.random();
    const jitterY = Math.random();

    deco.style.position = 'fixed';
    deco.style.left = `${(col + jitterX) * cellWidth}%`;
    deco.style.top = `${(row + jitterY) * cellHeight}%`;
    deco.style.width = '48px';
    deco.style.pointerEvents = 'none';
    deco.style.zIndex = '0';
    deco.style.imageRendering = '-webkit-optimize-contrast';
    deco.style.imageRendering = 'crisp-edges';
    deco.style.imageRendering = 'pixelated';

    container.appendChild(deco);

    let currentFrame = 0;
    setInterval(() => {
      currentFrame = (currentFrame + 1) % 2;
      deco.src = randomPair[currentFrame];
    }, 500);
  }
}

const soundEffectUrl = '/audio/click.mp3';

function playClickSound(): void {
  const audio = new Audio(soundEffectUrl);
  audio.play().catch((error) => console.error('Audio play failed:', error));
}

document.addEventListener('DOMContentLoaded', () => {
  scatterDecorations();
  const buttons = document.querySelectorAll('.game-button');
  buttons.forEach((button) => {
    button.addEventListener('click', playClickSound);
  });
});

init().catch(console.error);
