import {
  keyOf,
  manhattan1,
  samePos,
  type CustomerId,
  type DrinkId,
  type Level,
  type Pos,
} from '../engine/types';
import { stepSimulation, tryAppendPath, type GameState } from '../engine/game';
import { getBestScoreFromStorage } from '../supabase/api';
import { renderPath, renderPathArrow, PATH_TINT_GREEN } from '../paths';
import { TILE_SIZE } from '../config/constants';
import {
  playPathTileSfx,
  playStepSfx,
  playNiceSfx,
  playWompSfx,
  playCustomerServeSfx,
} from '../audio';
import { inBounds } from '../util/grid';
import {
  sprites,
  floorOpen,
  hoverSprite,
  hoverNopeSprite,
  hoverYepSprite,
  standHere,
} from './images';
import {
  catFrame,
  drawCustomer,
  drawGlorbo,
  drawStation,
  drawTile,
  drawTwoFrame,
  getCustomerIconDataUrl,
  obstacleDrawList,
  wallSpriteFor,
  type ObstacleDraw,
} from './draw';
import { alignSideColumns, fitCanvasDisplaySize, getTilePos } from './layout';

const CANVAS_SCALE = 4;

export type GhostRenderer = (
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  animFrame: number
) => void;

type ClientPoint = { clientX: number; clientY: number };

const KEY_STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

const isOverlayOpen = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.popup-overlay')).some(
    (el) => el.style.display !== '' && el.style.display !== 'none'
  );

const isServed = (state: GameState, customerId: CustomerId) =>
  (state.remainingOrders[customerId]?.length ?? 0) === 0;

const easeOutBack = (progress: number): number => {
  const p = Math.max(0, Math.min(1, progress));
  const overshoot = 1.35;
  const shifted = p - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
};

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private isDrawing: boolean = false;
  private simInterval: number | null = null;
  private animationFrame: number = 0;
  private animationInterval: number | null = null;
  private introAnimationActive: boolean = false;
  private introAnimationStartedAt: number = 0;
  private introAnimationFrameId: number | null = null;
  private tempCanvas: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;
  private hoverTile: Pos | null = null;
  private buildCursor: string = 'crosshair';
  private dragGhostRenderer: GhostRenderer | null = null;
  private glorboHidden: boolean = false;
  private builderHoverSprite: HTMLImageElement | null = null;

  private uiMode: 'play' | 'build' = 'play';
  private onBuildTileClick: ((pos: Pos) => void) | null = null;
  private onSuccess: ((moves: number) => void) | null = null;
  private successHandled: boolean = false;
  private currentLevelId: string | null = null;
  private showingOptimalReplay: boolean = false;
  // tutorial callout open: no drawing or running until the player presses ok
  private inputLocked: boolean = false;
  // tutorial: pulse a white ring around run once there's a path to run
  private highlightRunWhenReady: boolean = false;
  private onLockedPointerDown: ((clientX: number, clientY: number) => void) | null = null;
  // tutorial hover labels: called with the hovered tile (null when off the board or busy)
  private onHover: ((pos: Pos | null, clientX: number, clientY: number) => void) | null = null;
  // guide hooks (src/guide.ts): extra canvas drawing, state updates, rejected input
  private overlayRenderer:
    | ((ctx: CanvasRenderingContext2D, state: GameState, animFrame: number) => void)
    | null = null;
  private onUIUpdate: ((state: GameState) => void) | null = null;
  private onInputRejected:
    | ((kind: 'start' | 'blocked', clientX: number, clientY: number) => void)
    | null = null;
  private lastRejectedKey: string | null = null;

  // avoid build mode spamming paint calls on same tile
  private lastBuildPaintKey: string | null = null;

  private renderQueued: boolean = false;
  private uiUpdateQueued: boolean = false;

  private lastOrdersKey: string = '';

  // floor, walls, non-cat obstacles: redrawn only per level
  private staticLayer: { level: Level; canvas: HTMLCanvasElement; cats: ObstacleDraw[] } | null =
    null;
  private domCache = new Map<string, HTMLElement | null>();

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

  private byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    let el = this.domCache.get(id);
    if (!el || !el.isConnected) {
      el = document.getElementById(id);
      this.domCache.set(id, el);
    }
    return el as T | null;
  }

  private scheduleRender() {
    if (!this.renderQueued) {
      this.renderQueued = true;
      requestAnimationFrame(() => {
        this.renderQueued = false;
        this.render();
      });
    }
  }

  private scheduleUIUpdate() {
    if (!this.uiUpdateQueued) {
      this.uiUpdateQueued = true;
      requestAnimationFrame(() => {
        this.uiUpdateQueued = false;
        this.updateUI();
      });
    }
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

  private stopIntroAnimation() {
    this.introAnimationActive = false;
    this.canvas.style.cursor = this.uiMode === 'build' ? this.buildCursor : 'default';
  }

  public playIntroAnimation() {
    this.introAnimationStartedAt = performance.now();
    this.introAnimationActive = true;
    this.canvas.style.cursor = 'default';

    if (this.introAnimationFrameId !== null) {
      cancelAnimationFrame(this.introAnimationFrameId);
      this.introAnimationFrameId = null;
    }

    const tick = () => {
      if (!this.introAnimationActive) {
        this.introAnimationFrameId = null;
        return;
      }

      this.render();

      if (this.introAnimationActive) {
        this.introAnimationFrameId = requestAnimationFrame(tick);
      } else {
        this.introAnimationFrameId = null;
      }
    };

    this.render();
    this.introAnimationFrameId = requestAnimationFrame(tick);
  }

  public destroy() {
    if (this.simInterval) {
      clearInterval(this.simInterval);
    }
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
    if (this.introAnimationFrameId !== null) {
      cancelAnimationFrame(this.introAnimationFrameId);
      this.introAnimationFrameId = null;
    }
  }

  private setupCanvas() {
    const level = this.state.level;

    const baseCanvasWidth = level.width * TILE_SIZE;
    const baseCanvasHeight = level.height * TILE_SIZE;

    // changing canvas width/height
    this.canvas.width = baseCanvasWidth * CANVAS_SCALE;
    this.canvas.height = baseCanvasHeight * CANVAS_SCALE;

    this.updateCanvasDisplaySize();

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(CANVAS_SCALE, CANVAS_SCALE);

    this.ctx.imageSmoothingEnabled = false;
    this.tempCtx.imageSmoothingEnabled = false;
  }

  private updateCanvasDisplaySize() {
    const { width, height } = this.state.level;
    fitCanvasDisplaySize(this.canvas, width * TILE_SIZE, height * TILE_SIZE, height);

    // side columns (tutorial checklist, orders) sit flush with the board's bottom edge
    requestAnimationFrame(() => alignSideColumns(this.canvas, this.state.level.height));
  }

  private tileUnder(e: ClientPoint): Pos | null {
    const { width, height } = this.state.level;
    return getTilePos(this.canvas, width, height, e.clientX, e.clientY);
  }

  private boardTileUnder(e: ClientPoint): Pos | null {
    const pos = this.tileUnder(e);
    if (!pos || !inBounds(this.state.level.width, this.state.level.height, pos)) return null;
    return pos;
  }

  private isPathEnd(pos: Pos): boolean {
    const last = this.state.path[this.state.path.length - 1];
    return !!last && samePos(last, pos);
  }

  private undoAllowed(): boolean {
    return this.uiMode === 'play' && this.state.status === 'idle' && !this.showingOptimalReplay;
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.handlePointerMove(e);
      this.handleHover(e);
      this.emitHover(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('mouseup', (e) => {
      this.stopDrawing();
      this.emitHover(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('mouseleave', (e) => {
      this.stopDrawing();
      this.hoverTile = null;
      this.render();
      this.onHover?.(null, e.clientX, e.clientY);
    });

    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement | null;
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (!this.undoAllowed()) return;
        this.undoLastPathStep();
      });
    }

    // touch svreen support
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.handlePointerDown(e.touches[0]);
      },
      { passive: false }
    );
    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        this.handlePointerMove(touch);
        this.handleHover(touch);
      },
      { passive: false }
    );
    this.canvas.addEventListener('touchend', () => this.stopDrawing(), { passive: true });

    window.addEventListener('resize', () => {
      this.updateCanvasDisplaySize();
      this.scheduleRender();
    });

    // undo only while drawing paths

    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      const isUndo =
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') ||
        (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey);
      if (isUndo) {
        if (!this.undoAllowed() || isOverlayOpen()) return;
        e.preventDefault();
        this.undoLastPathStep();
        return;
      }
      this.handleKeyStep(e);
    });
  }

  private tileCenterClient(pos: Pos): ClientPoint {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = this.state.level;
    return {
      clientX: rect.left + ((pos.x + 0.5) / width) * rect.width,
      clientY: rect.top + ((pos.y + 0.5) / height) * rect.height,
    };
  }

  // arrows / wasd extend the path one tile from its end
  private handleKeyStep(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = KEY_STEPS[e.code] ?? KEY_STEPS[e.key];
    if (!step || this.uiMode !== 'play' || isOverlayOpen()) return;
    e.preventDefault();

    const last = this.state.path[this.state.path.length - 1] ?? this.state.level.start;
    if (this.inputLocked) {
      const c = this.tileCenterClient(last);
      this.onLockedPointerDown?.(c.clientX, c.clientY);
      return;
    }
    if (this.introAnimationActive || !this.undoAllowed()) return;

    const next = { x: last.x + step[0], y: last.y + step[1] };
    if (!inBounds(this.state.level.width, this.state.level.height, next)) return;
    this.tryExtendPath(next, this.tileCenterClient(next));
  }

  private undoLastPathStep() {
    if (this.state.path.length <= 1) return;
    this.state = { ...this.state, path: this.state.path.slice(0, -1) };
    playPathTileSfx();
    this.scheduleRender();
    this.scheduleUIUpdate();
  }

  private handlePointerDown(e: ClientPoint) {
    if (this.inputLocked && this.uiMode === 'play') {
      this.onLockedPointerDown?.(e.clientX, e.clientY);
      return;
    }
    if (this.introAnimationActive) return;
    if (this.state.status !== 'idle') return;
    const pos = this.tileUnder(e);
    if (!pos) return;

    if (this.uiMode === 'build') {
      if (!inBounds(this.state.level.width, this.state.level.height, pos)) return;
      this.isDrawing = true;
      this.lastBuildPaintKey = null;

      this.onBuildTileClick?.(pos);
      this.lastBuildPaintKey = keyOf(pos);
      return;
    }

    const last = this.state.path[this.state.path.length - 1] ?? this.state.level.start;
    if (!samePos(pos, last)) {
      this.onInputRejected?.('start', e.clientX, e.clientY);
      return;
    }

    this.isDrawing = true;
    this.lastRejectedKey = null;
  }

  private handlePointerMove(e: ClientPoint) {
    if (this.introAnimationActive) return;
    if (!this.isDrawing) return;
    if (this.state.status !== 'idle') return;
    const pos = this.boardTileUnder(e);
    if (!pos) return;
    const key = keyOf(pos);

    if (this.uiMode === 'build') {
      if (this.lastBuildPaintKey === key) return;
      this.lastBuildPaintKey = key;

      // repaintttt
      this.onBuildTileClick?.(pos);
      return;
    }

    this.tryExtendPath(pos, e);
  }

  private tryExtendPath(pos: Pos, at: ClientPoint) {
    const prevLen = this.state.path.length;
    this.state = tryAppendPath(this.state, pos);
    if (this.state.path.length > prevLen) {
      playPathTileSfx();
      this.lastRejectedKey = null;
    } else {
      // tried to step onto a wall / customer / obstacle right next to the path end
      const key = keyOf(pos);
      const last = this.state.path[this.state.path.length - 1];
      const adjacent = last && manhattan1(last, pos);
      if (adjacent && key !== this.lastRejectedKey) {
        this.lastRejectedKey = key;
        this.onInputRejected?.('blocked', at.clientX, at.clientY);
      }
    }
    this.scheduleRender();
    this.scheduleUIUpdate();
  }

  private stopDrawing() {
    this.isDrawing = false;
    this.lastBuildPaintKey = null;
  }

  private handleHover(e: ClientPoint) {
    if (this.introAnimationActive) return;
    const pos = this.boardTileUnder(e);
    if (!pos) {
      if (this.hoverTile !== null) {
        this.hoverTile = null;
        this.scheduleRender();
      }
      this.canvas.style.cursor = 'default';
      return;
    }

    if (!this.hoverTile || !samePos(this.hoverTile, pos)) {
      this.hoverTile = pos;
      this.scheduleRender();
    }

    if (this.uiMode === 'build') {
      this.canvas.style.cursor = this.buildCursor;
      return;
    }

    // grab cursor on path that you can grab from
    // TODO: SPRITE CHANGE!! make it green or something when u can grab on it
    if (this.isPathEnd(pos)) {
      this.canvas.style.cursor = this.isDrawing ? 'grabbing' : 'grab';
    } else {
      this.canvas.style.cursor = 'default';
    }
  }

  public setUIMode(mode: 'play' | 'build') {
    this.stopIntroAnimation();
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

  public setDragGhost(fn: GhostRenderer | null) {
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

  public setInputLocked(
    locked: boolean,
    onLockedPointerDown: ((clientX: number, clientY: number) => void) | null = null
  ) {
    this.inputLocked = locked;
    this.onLockedPointerDown = locked ? onLockedPointerDown : null;
    if (locked) this.isDrawing = false;
    this.updateUI();
  }

  public setOverlayRenderer(
    fn: ((ctx: CanvasRenderingContext2D, state: GameState, animFrame: number) => void) | null
  ) {
    this.overlayRenderer = fn;
  }

  public setOnUIUpdate(fn: ((state: GameState) => void) | null) {
    this.onUIUpdate = fn;
  }

  public setOnInputRejected(
    fn: ((kind: 'start' | 'blocked', clientX: number, clientY: number) => void) | null
  ) {
    this.onInputRejected = fn;
  }

  public requestRender() {
    this.scheduleRender();
  }

  public isDrawingPath(): boolean {
    return this.isDrawing;
  }

  public setHighlightRunWhenReady(on: boolean) {
    this.highlightRunWhenReady = on;
    this.updateUI();
  }

  public setOnHover(handler: ((pos: Pos | null, clientX: number, clientY: number) => void) | null) {
    this.onHover = handler;
  }

  private emitHover(clientX: number, clientY: number) {
    if (!this.onHover) return;
    const busy = this.uiMode !== 'play' || this.isDrawing || this.state.status !== 'idle';
    this.onHover(busy ? null : this.hoverTile, clientX, clientY);
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
    this.stopIntroAnimation();
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

  public forceUpdateOrdersDisplay() {
    this.lastOrdersKey = '';
    this.updateOrdersDisplay();
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

  private advanceSimulation(serveSfx: boolean) {
    const prevOrders = serveSfx ? { ...this.state.remainingOrders } : null;
    this.state = stepSimulation(this.state);

    if (prevOrders) {
      for (const customerId in prevOrders) {
        const id = customerId as CustomerId;
        if (prevOrders[id].length > this.state.remainingOrders[id].length) {
          playCustomerServeSfx(id);
        }
      }
    }

    if (this.state.status === 'running') {
      playStepSfx();
    }
    this.render();
    this.updateUI();
  }

  // the very first step never plays the womp
  private finishRun(playWomp: boolean) {
    if (this.state.status === 'failed') {
      if (playWomp) playWompSfx();
      this.showFailurePopup();
    } else if (
      this.state.status === 'success' &&
      this.onSuccess &&
      !this.successHandled &&
      !this.showingOptimalReplay
    ) {
      playNiceSfx();
      this.successHandled = true;
      this.onSuccess(this.state.stepsTaken);
    }
  }

  private startSimulation() {
    if (this.uiMode === 'build') return;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }

    if (this.state.status !== 'running') return;

    this.advanceSimulation(false);

    if (this.state.status !== 'running') {
      this.finishRun(false);
      return;
    }

    this.simInterval = window.setInterval(() => {
      this.advanceSimulation(true);

      if (this.state.status !== 'running') {
        if (this.simInterval) {
          clearInterval(this.simInterval);
          this.simInterval = null;
        }
        this.finishRun(true);
      }
    }, 250);
  }

  private getStaticLayer(level: Level) {
    if (this.staticLayer?.level === level) return this.staticLayer;

    const off = this.staticLayer?.canvas ?? document.createElement('canvas');
    off.width = level.width * TILE_SIZE * CANVAS_SCALE;
    off.height = level.height * TILE_SIZE * CANVAS_SCALE;
    const ctx = off.getContext('2d')!;
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // draw floor for all tiles
    for (let y = 1; y < level.height - 1; y++) {
      for (let x = 1; x < level.width - 1; x++) {
        drawTile(ctx, floorOpen, x, y);
      }
    }

    for (const wallKey of level.walls) {
      const [x, y] = wallKey.split(',').map(Number);
      drawTile(ctx, wallSpriteFor(level, x, y), x, y);
    }

    // cats animate, so they're drawn per frame
    const cats: ObstacleDraw[] = [];
    for (const o of obstacleDrawList(level)) {
      if (o.type === 'cat') cats.push(o);
      else drawTile(ctx, o.sprite, o.x, o.y, o.tilesWide);
    }

    this.staticLayer = { level, canvas: off, cats };
    return this.staticLayer;
  }

  public render() {
    if (this.introAnimationActive) {
      this.renderIntroFrame();
      return;
    }

    const { level, glorboPos } = this.state;
    const ctx = this.ctx;
    const frame = this.animationFrame;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const layer = this.getStaticLayer(level);
    ctx.drawImage(layer.canvas, 0, 0, level.width * TILE_SIZE, level.height * TILE_SIZE);
    for (const cat of layer.cats) {
      drawTile(ctx, catFrame(cat.sprite, frame), cat.x, cat.y);
    }

    // draw drink stations
    for (const [key, drink] of Object.entries(level.drinkStations)) {
      const [x, y] = key.split(',').map(Number);
      const drinkSprite = sprites.drinks[drink as DrinkId];
      if (!drinkSprite) continue;

      // use pressed sprite if glorbo is on it and has pressed sprite
      const isGlorboOnStation = glorboPos.x === x && glorboPos.y === y;
      const spriteToUse =
        isGlorboOnStation && sprites.drinkPressed ? sprites.drinkPressed : drinkSprite;
      drawStation(ctx, spriteToUse, x, y, frame);
    }

    // serve boxes
    for (const [key, customerId] of Object.entries(level.standHere)) {
      if (isServed(this.state, customerId)) continue;
      const [x, y] = key.split(',').map(Number);
      drawTwoFrame(ctx, standHere, frame % 2, x, y);
    }

    // draw customers
    for (const [key, customerId] of Object.entries(level.customers)) {
      const customerSprite = sprites.customers[customerId as CustomerId];
      if (!customerSprite) continue;
      const [x, y] = key.split(',').map(Number);
      drawCustomer(ctx, customerSprite, x, y, frame, isServed(this.state, customerId));
    }

    if (this.uiMode === 'play') {
      // draw path with directional sprites and gradient overlay
      // use green tint for optimal path replay, default blue otherwise
      const tint = this.showingOptimalReplay ? PATH_TINT_GREEN : undefined;
      renderPath(ctx, this.tempCtx, this.state, frame, tint);

      // draw path arrow on the last tile (current point user is on)
      renderPathArrow(ctx, this.state, frame);
    }

    // draw glorbo (on top of path) — hidden when being dragged
    if (!this.glorboHidden) {
      drawGlorbo(ctx, glorboPos.x, glorboPos.y, Math.min(this.state.inventory.length, 2), frame);
    }

    // draw hover sprite on hovered tile (only during idle state)
    if (this.state.status === 'idle' && this.hoverTile) {
      const hover = this.hoverTile;
      let spriteToUse =
        this.uiMode === 'build' && this.builderHoverSprite ? this.builderHoverSprite : hoverSprite;
      if (this.uiMode === 'play') {
        const hoverKey = keyOf(hover);
        const isUnwalkable =
          level.walls.has(hoverKey) || level.customers[hoverKey] || level.obstacles[hoverKey];

        spriteToUse = this.isPathEnd(hover)
          ? hoverYepSprite
          : isUnwalkable
            ? hoverNopeSprite
            : hoverSprite;
      }

      // stay on second frame (index 1) when dragging, otherwise animate
      const frameIndex = this.isDrawing ? 1 : frame % 2;
      drawTwoFrame(ctx, spriteToUse, frameIndex, hover.x, hover.y);
    }

    if (this.uiMode === 'play' && this.overlayRenderer) {
      ctx.save();
      this.overlayRenderer(ctx, this.state, frame);
      ctx.restore();
    }

    // draw drag ghost at hover tile
    if (this.dragGhostRenderer && this.hoverTile) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      this.dragGhostRenderer(ctx, this.hoverTile.x, this.hoverTile.y, frame);
      ctx.restore();
    }
  }

  private renderIntroFrame() {
    const { level, glorboPos } = this.state;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const baseCellCount = level.width * level.height;

    type IntroOverlayOp = {
      x: number;
      y: number;
      priority: number;
      draw: (drawCtx: CanvasRenderingContext2D) => void;
    };

    const overlayOps: IntroOverlayOp[] = [];
    const addOverlayOp = (x: number, y: number, priority: number, draw: IntroOverlayOp['draw']) => {
      overlayOps.push({ x, y, priority, draw });
    };

    for (const o of obstacleDrawList(level)) {
      addOverlayOp(o.x, o.y, 0, (drawCtx) => {
        const sprite = o.type === 'cat' ? catFrame(o.sprite, this.animationFrame) : o.sprite;
        drawTile(drawCtx, sprite, o.x, o.y, o.tilesWide);
      });
    }

    for (const [key, drink] of Object.entries(level.drinkStations)) {
      const [x, y] = key.split(',').map(Number);
      const drinkSprite = sprites.drinks[drink as DrinkId];
      if (!drinkSprite) continue;

      addOverlayOp(x, y, 1, (drawCtx) => {
        const isGlorboOnStation = glorboPos.x === x && glorboPos.y === y;
        const spriteToUse =
          isGlorboOnStation && sprites.drinkPressed ? sprites.drinkPressed : drinkSprite;
        drawStation(drawCtx, spriteToUse, x, y, this.animationFrame);
      });
    }

    for (const [key, customerId] of Object.entries(level.customers)) {
      const [x, y] = key.split(',').map(Number);
      const customerSprite = sprites.customers[customerId as CustomerId];
      if (!customerSprite) continue;

      addOverlayOp(x, y, 2, (drawCtx) => {
        const served = isServed(this.state, customerId);
        drawCustomer(drawCtx, customerSprite, x, y, this.animationFrame, served);
      });
    }

    for (const [key, customerId] of Object.entries(level.standHere)) {
      if (isServed(this.state, customerId)) continue;
      const [x, y] = key.split(',').map(Number);

      addOverlayOp(x, y, 3, (drawCtx) => {
        drawTwoFrame(drawCtx, standHere, this.animationFrame % 2, x, y);
      });
    }

    addOverlayOp(glorboPos.x, glorboPos.y, 4, (drawCtx) => {
      const column = Math.min(this.state.inventory.length, 2);
      drawGlorbo(drawCtx, glorboPos.x, glorboPos.y, column, this.animationFrame);
    });

    overlayOps.sort((a, b) => a.y - b.y || a.x - b.x || a.priority - b.priority);

    const elapsed = performance.now() - this.introAnimationStartedAt;
    const baseStepMs = 16;
    const baseSettleSteps = 5;
    const baseReveal = Math.min(baseCellCount + baseSettleSteps, elapsed / baseStepMs);
    const overlayElapsed = Math.max(0, elapsed - (baseCellCount + baseSettleSteps) * baseStepMs);
    const overlayStepMs = 22;
    const overlaySettleSteps = 3;
    const overlayReveal = Math.min(
      overlayOps.length + overlaySettleSteps,
      overlayElapsed / overlayStepMs
    );

    const withDrop = (progress: number, dropPx: number, draw: () => void) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, progress * 1.8);
      ctx.translate(0, Math.round((1 - easeOutBack(progress)) * -dropPx));
      draw();
      ctx.restore();
    };

    const drawBaseTile = (x: number, y: number) => {
      if (level.walls.has(`${x},${y}`)) {
        drawTile(ctx, wallSpriteFor(level, x, y), x, y);
      } else if (x > 0 && x < level.width - 1 && y > 0 && y < level.height - 1) {
        drawTile(ctx, floorOpen, x, y);
      }
    };

    for (let i = 0; i < baseCellCount; i++) {
      const remaining = baseReveal - i;
      if (remaining <= 0) break;
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      withDrop(Math.min(1, remaining / baseSettleSteps), 6, () => drawBaseTile(x, y));
    }

    for (let i = 0; i < overlayOps.length; i++) {
      const op = overlayOps[i]!;
      const remaining = overlayReveal - i;
      if (remaining <= 0) break;
      withDrop(Math.min(1, remaining / overlaySettleSteps), 5, () => op.draw(ctx));
    }

    if (
      baseReveal >= baseCellCount + baseSettleSteps &&
      overlayReveal >= overlayOps.length + overlaySettleSteps
    ) {
      this.stopIntroAnimation();
    }
  }

  public updateUI() {
    const stepsEl = this.byId('steps');
    const messageEl = this.byId('message');
    const bestScoreEl = this.byId('best-score');
    const pathEl = this.byId('path');
    const inventoryEl = this.byId('inventory');
    const runButton = this.byId<HTMLButtonElement>('run-btn');
    const retryButton = this.byId<HTMLButtonElement>('retry-btn');
    const undoButton = this.byId<HTMLButtonElement>('undo-btn');

    if (stepsEl) {
      const pathSteps = Math.max(0, this.state.path.length - 1);
      const displaySteps = this.state.status === 'idle' ? pathSteps : this.state.stepsTaken;
      stepsEl.textContent = `steps: ${displaySteps}`;
    }
    if (messageEl) messageEl.textContent = this.state.message || '';

    // always show best score if available
    if (bestScoreEl) {
      const bestScore = this.currentLevelId ? getBestScoreFromStorage(this.currentLevelId) : null;
      if (bestScore !== null) {
        bestScoreEl.textContent = `best: ${bestScore}`;
        bestScoreEl.style.display = 'block';
      } else {
        bestScoreEl.style.display = 'none';
      }
    }

    if (pathEl) {
      const pathLabel = this.state.path.map((p) => `(${p.x},${p.y})`).join(' → ');
      pathEl.textContent = `ur path: ${pathLabel}`;
    }

    if (inventoryEl) {
      const inventory = this.state.inventory;
      [this.byId('inventory-slot-0'), this.byId('inventory-slot-1')].forEach((slot, i) => {
        if (!slot) return;
        const drinkId = inventory[i] ?? '';
        // only rebuild a slot when its item changes: replacing the <img> on every step
        // makes Safari blank it for a frame while it re-decodes (the "flash")
        if (
          slot.dataset.item === drinkId &&
          slot.querySelector('.inventory-drink-icon:not(.hands-demo-pop)')
        )
          return;
        if (slot.dataset.item === drinkId && !drinkId && !slot.firstChild) return;
        slot.dataset.item = drinkId;
        if (drinkId) {
          const imageSrc = sprites.drinkItems[drinkId as DrinkId]?.src ?? '';
          slot.innerHTML = `<img src="${imageSrc}" alt="${drinkId}" class="inventory-drink-icon" />`;
        } else {
          slot.innerHTML = '';
        }
      });
    }

    const ordersKey = JSON.stringify({
      orders: this.state.level.orders,
      remaining: this.state.remainingOrders,
    });
    if (ordersKey !== this.lastOrdersKey) {
      this.lastOrdersKey = ordersKey;
      this.updateOrdersDisplay();
    }

    if (runButton) {
      runButton.disabled =
        this.uiMode === 'build' || this.state.status !== 'idle' || this.inputLocked;
      runButton.classList.toggle(
        'run-btn--ready',
        this.highlightRunWhenReady && !runButton.disabled && this.state.path.length > 1
      );
    }

    if (retryButton) {
      // nothing to reset until a path is drawn (or a run has finished)
      const nothingToReset = this.state.status === 'idle' && this.state.path.length <= 1;
      retryButton.disabled =
        this.uiMode === 'build' || this.state.status === 'running' || nothingToReset;
    }

    if (undoButton) {
      undoButton.disabled = !(this.undoAllowed() && this.state.path.length > 1);
    }

    this.onUIUpdate?.(this.state);
  }

  private setFailurePopupDisplay(display: string) {
    const popup = this.byId('failure-popup');
    if (popup) popup.style.display = display;
  }

  private showFailurePopup() {
    this.setFailurePopupDisplay('flex');
  }

  public hideFailurePopup() {
    this.setFailurePopupDisplay('none');
  }

  private updateOrdersDisplay() {
    const ordersEl = this.byId('orders');
    if (!ordersEl) return;

    const { level, remainingOrders } = this.state;
    const entries = Object.entries(level.orders);
    entries.sort(([a], [b]) => a.localeCompare(b));

    const ordersHTML = entries
      .map(([customerId, drinks], index) => {
        const customerSprite = sprites.customers[customerId as CustomerId] ?? null;
        const remaining = remainingOrders[customerId as CustomerId] ?? drinks;
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
            const src = sprites.drinkItems[drinkId]?.src ?? '';
            return `<img src="${src}" alt="${drinkId}" data-drink-id="${drinkId}" class="drink-item-icon ${servedClass}" />`;
          })
          .join('');

        const servedClass = isServed ? 'order-served' : '';

        return `
        <li class="order-item ${servedClass}" data-customer-id="${customerId}">
          <div class="order-header">order #${index + 1}${isServed ? ' <span class="order-served-tag">served!</span>' : ''}</div>
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
