import { initGame } from '../engine/game';
import { samePos, type CustomerId, type DrinkId, type Pos } from '../engine/types';
import { buildLevel } from '../levels/loader';
import type { LevelData } from '../levels/level.schema';
import { validateLevelData } from '../levels/validate';
import { solveLevel } from '../engine/solver';
import { encodeLevelShareToken, makeShareUrlFromToken } from '../share';
import { ALL_DRINK_IDS, isWallDecorType, type DecorKind } from '../config/items';
import { clamp, cloneLevel, inBounds } from '../util/grid';
import type { GameRenderer, GhostRenderer } from '../render/renderer';
import { getTilePos } from '../render/layout';
import { sprites, glorboSpriteSheet, hoverDragSprite, hoverHammerSprite } from '../render/images';
import {
  catFrame,
  drawCustomer,
  drawGlorbo,
  drawStation,
  drawTile,
  getCustomerIconDataUrl,
  getGlorboIcon,
} from '../render/draw';
import { playHammerSfx } from '../ui/sfx';
import { copyTextToClipboard } from '../ui/clipboard';
import {
  MAX_BUILDER_SIZE,
  MIN_BUILDER_SIZE,
  customerAt,
  cycleDecorAt,
  cycleStationAt,
  cycleWallDecorAt,
  decorKindAt,
  enforceBorderWalls,
  groupOffset,
  normalizeOrders,
  obstacleAt,
  onBorder,
  removeAt,
  removeObstacleGroup,
  resizeLevelData,
  setCustomerAt,
  setDecorAt,
  setDrinkAt,
  setStartAt,
  stationAt,
} from './edit';

type BuilderTool = 'erase' | 'decor' | 'start' | 'station' | 'cust1' | 'cust2' | 'cust3' | 'drag';

const CUSTOMER_FOR_TOOL: Partial<Record<BuilderTool, CustomerId>> = {
  cust1: 'A',
  cust2: 'B',
  cust3: 'C',
};

// drag tool state
type DraggedItem =
  | { kind: 'start' }
  | { kind: 'station'; drink: DrinkId }
  | { kind: 'customer'; id: CustomerId; standHere: string }
  | { kind: 'decor'; decorKind: DecorKind; clickOffset: number };

const ORDER_ITEMS: DrinkId[] = ['D1', 'D2', 'F1', 'F2', 'F3'];

export type BuilderDeps = {
  renderer: GameRenderer;
  canvas: HTMLCanvasElement;
  getLevelData: () => LevelData;
  onEnter: () => void;
  onExit: (data: LevelData) => void;
};

/** builder tool icons */
export function setBuilderToolIcons() {
  const icon = (id: string) => document.getElementById(id) as HTMLImageElement | null;
  const decorIcon = icon('builder-decor-icon');
  const startIcon = icon('builder-start-icon');
  const b1 = icon('builder-cust1-icon');
  const b2 = icon('builder-cust2-icon');
  const b3 = icon('builder-cust3-icon');
  if (startIcon) startIcon.src = getGlorboIcon(glorboSpriteSheet);
  if (b1) b1.src = getCustomerIconDataUrl(sprites.customers.A, 2);
  if (b2) b2.src = getCustomerIconDataUrl(sprites.customers.B, 2);
  if (b3) b3.src = getCustomerIconDataUrl(sprites.customers.C, 2);
  if (decorIcon) decorIcon.src = '/img/plant_a.png';
}

function makeEl<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

function makeGhostRenderer(item: DraggedItem): GhostRenderer {
  switch (item.kind) {
    case 'start':
      return (ctx, tx, ty, animFrame) => drawGlorbo(ctx, tx, ty, 0, animFrame);
    case 'station': {
      const sprite = sprites.drinks[item.drink];
      if (!sprite) return () => {}; // fallback
      return (ctx, tx, ty, animFrame) => drawStation(ctx, sprite, tx, ty, animFrame);
    }
    case 'customer': {
      const sprite = sprites.customers[item.id];
      if (!sprite) return () => {}; // fallback
      return (ctx, tx, ty, animFrame) => drawCustomer(ctx, sprite, tx, ty, animFrame, false);
    }
    case 'decor': {
      const { decorKind, clickOffset } = item;
      if (
        decorKind === 'plant_two' ||
        decorKind === 'window_double_a' ||
        decorKind === 'window_double_b'
      ) {
        const sprite = sprites.obstacles[decorKind];
        return (ctx, tx, ty) => {
          if (!sprite) return;
          drawTile(ctx, sprite, tx - clickOffset, ty, 2);
        };
      }
      if (decorKind === 'table_triple') {
        return (ctx, tx, ty) => {
          const ax = tx - clickOffset;
          drawTile(ctx, sprites.obstacles.table_l, ax, ty);
          drawTile(ctx, sprites.obstacles.table_m, ax + 1, ty);
          drawTile(ctx, sprites.obstacles.table_r, ax + 2, ty);
        };
      }
      if (decorKind === 'cat') {
        const baseSprite = sprites.obstacles.cat ?? sprites.obstacles.plant_a;
        return (ctx, tx, ty, animFrame) => {
          drawTile(ctx, catFrame(baseSprite, animFrame), tx, ty);
        };
      }
      const sprite = sprites.obstacles[decorKind] ?? sprites.obstacles.plant_a; // fallback
      return (ctx, tx, ty) => drawTile(ctx, sprite, tx, ty);
    }
  }
}

export function initBuilder(deps: BuilderDeps) {
  const { renderer, canvas } = deps;

  // builder mode starts based off the current level
  let builderMode = false;
  let builderData: LevelData = cloneLevel(deps.getLevelData());
  let builderTool: BuilderTool = 'decor';

  let decorToolDefault: DecorKind = 'plant_a';
  const stationCycle: DrinkId[] = ALL_DRINK_IDS;
  let stationToolDefault: DrinkId = 'D1';

  let draggedItem: DraggedItem | null = null;
  let dragOrigin: Pos | null = null;

  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const builderButton = byId<HTMLButtonElement>('builder-btn');
  const builderPanel = byId<HTMLDivElement>('builder-panel');
  const builderStatusEl = byId<HTMLDivElement>('builder-status');
  const builderWidthInput = byId<HTMLInputElement>('builder-width-input');
  const builderHeightInput = byId<HTMLInputElement>('builder-height-input');
  const builderResizeBtn = byId<HTMLButtonElement>('builder-resize-btn');
  const toolButtons = Array.from(
    document.querySelectorAll('.builder-tool-btn')
  ) as HTMLButtonElement[];
  const checkBtn = byId<HTMLButtonElement>('builder-check-btn');
  const shareBtn = byId<HTMLButtonElement>('builder-share-btn');
  const sidebarOrdersEl = byId<HTMLUListElement>('orders');
  const ordersHeadingEl = byId('orders-heading');
  const builderTipEl = byId('builder-tip');
  const runBtn = byId('run-btn');
  const retryBtn = byId('retry-btn');
  const undoBtn = byId('undo-btn');
  const exitBuilderBtn = byId<HTMLButtonElement>('exit-builder-btn');

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
    const exitBtn = exitBuilderBtn;
    if (!exitBtn) return;
    exitBtn.disabled = !builderShareReady;
    exitBtn.title = builderShareReady ? 'exit builder and save' : 'check level first';
  };
  const setShareReady = (ready: boolean) => {
    builderShareReady = ready;
    updateShareUI();
    updateExitUI();
  };
  const markBuilderDirty = () => setShareReady(false);
  updateShareUI();
  updateExitUI();

  const syncBuilderSizeInputs = () => {
    if (builderWidthInput) builderWidthInput.value = String(builderData.width);
    if (builderHeightInput) builderHeightInput.value = String(builderData.height);
  };

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

  const rebuildPreview = () => {
    normalizeOrders(builderData);

    // automatically border walls
    enforceBorderWalls(builderData);

    renderer.setState(initGame(buildLevel(builderData)));
    if (builderMode) {
      renderBuilderOrdersInSidebar();
      markBuilderDirty();
    }
  };

  const edited = () => {
    rebuildPreview();
    setBuilderStatus('edited! check again');
  };

  const makeDrinkButton = (
    value: DrinkId | '',
    allowNone: boolean,
    onPick: (v: DrinkId | '') => void
  ) => {
    const btn = makeEl('button', 'game-button builder-drink-btn');
    btn.type = 'button';
    btn.ariaLabel = 'pick item';

    const setValue = (v: DrinkId | '') => {
      btn.innerHTML = '';
      if (v === '') {
        const placeholder = makeEl('div', 'builder-none-placeholder');
        placeholder.setAttribute('aria-hidden', 'true');
        btn.appendChild(placeholder);
        return;
      }
      const img = makeEl('img', 'drink-item-icon');
      img.src = sprites.drinkItems[v]?.src ?? '/img/drink_a_item.png';
      img.alt = v;
      btn.appendChild(img);
    };

    setValue(value);

    btn.addEventListener('click', () => {
      const options: (DrinkId | '')[] = allowNone ? ['', ...ORDER_ITEMS] : ORDER_ITEMS;
      const idx = options.indexOf(value);
      value = options[(idx + 1) % options.length] ?? 'D1';

      setValue(value);
      onPick(value);
    });

    return btn;
  };

  // replace normal orders list w button ver... idk if i like this approach but whatever
  const renderBuilderOrdersInSidebar = () => {
    if (!sidebarOrdersEl) return;
    normalizeOrders(builderData);

    sidebarOrdersEl.innerHTML = '';

    for (const id of ['A', 'B', 'C'] as const) {
      const li = makeEl('li', 'order-item');

      const header = makeEl('div', 'order-header');
      header.textContent = `order #${id}`;

      const row = makeEl('div', 'order-row');

      const sprite = sprites.customers[id] ?? null;
      const icon = makeEl('img', 'customer-icon');
      icon.src = sprite ? getCustomerIconDataUrl(sprite, 2) : '';
      icon.alt = id;

      const drinks = makeEl('div', 'drink-items');

      let a: DrinkId = builderData.orders[id][0] ?? 'D1';
      let b: DrinkId | '' = builderData.orders[id][1] ?? '';

      const commit = () => {
        // write to builder data and rebuild preview
        builderData.orders[id] = b ? [a, b] : [a];
        edited();
      };

      drinks.appendChild(
        makeDrinkButton(a, false, (v) => {
          a = v as DrinkId;
          commit();
        })
      );
      drinks.appendChild(
        makeDrinkButton(b, true, (v) => {
          b = v;
          commit();
        })
      );

      row.appendChild(icon);
      row.appendChild(drinks);

      li.appendChild(header);
      li.appendChild(row);

      sidebarOrdersEl.appendChild(li);
    }
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

    resizeLevelData(builderData, cappedW, cappedH);
    syncBuilderSizeInputs();
    rebuildPreview();
    setBuilderStatus(`resized to ${builderData.width}x${builderData.height}`);
  };

  // --- drag tool helpers ---

  const detectItemAt = (p: Pos): DraggedItem | null => {
    // start position
    if (samePos(p, builderData.start)) {
      return { kind: 'start' };
    }

    // drink station
    const station = stationAt(builderData, p);
    if (station) {
      return { kind: 'station', drink: station.drink };
    }

    // customer
    const customer = customerAt(builderData, p);
    if (customer) {
      return { kind: 'customer', id: customer.id, standHere: customer.standHere };
    }

    // obstacle/decor (excluding border windows)
    const obstacle = obstacleAt(builderData, p);
    if (obstacle && !isWallDecorType(obstacle.type)) {
      const dKind = decorKindAt(builderData, p);
      if (dKind) {
        return { kind: 'decor', decorKind: dKind, clickOffset: groupOffset(builderData, p) };
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
        setDrinkAt(builderData, origin, item.drink, setBuilderStatus);
        break;
      case 'customer':
        setCustomerAt(builderData, origin, item.id, setBuilderStatus);
        break;
      case 'decor':
        setDecorAt(builderData, origin, item.decorKind, null);
        break;
    }
  };

  const clearDrag = () => {
    draggedItem = null;
    dragOrigin = null;
    renderer.setDragGhost(null);
    renderer.setGlorboHidden(false);
  };

  const putBack = (origin: Pos, item: DraggedItem) => {
    restoreItem(origin, item);
    rebuildPreview();
    renderer.setBuildCursor('grab');
  };

  const cancelDrag = () => {
    const item = draggedItem;
    const origin = dragOrigin;
    clearDrag();
    if (item && origin) putBack(origin, item);
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
      removeAt(builderData, p, setBuilderStatus);
    }

    // show ghost sprite following the cursor
    renderer.setDragGhost(makeGhostRenderer(item));
    return true;
  };

  const dropItem = (p: Pos | null) => {
    const item = draggedItem;
    const origin = dragOrigin;
    clearDrag();
    if (!item || !origin) return;

    // invalid drop position → cancel
    if (!p || !inBounds(builderData.width, builderData.height, p) || onBorder(builderData, p)) {
      putBack(origin, item);
      setBuilderStatus("can't place here");
      return;
    }

    // same position → just put it back
    if (samePos(p, origin)) {
      putBack(origin, item);
      return;
    }

    let success = false;

    switch (item.kind) {
      case 'start':
        removeAt(builderData, p, setBuilderStatus);
        builderData.start = { x: p.x, y: p.y };
        success = true;
        break;
      case 'station':
        setDrinkAt(builderData, p, item.drink, setBuilderStatus);
        success = true;
        break;
      case 'customer':
        setCustomerAt(builderData, p, item.id, setBuilderStatus);
        success = builderData.customers.some((c) => c.id === item.id);
        break;
      case 'decor': {
        const anchor = { x: p.x - item.clickOffset, y: p.y };
        success = setDecorAt(builderData, anchor, item.decorKind, null);
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

  const handleBorderClick = (p: Pos) => {
    if (p.y === 0 && builderTool === 'decor') {
      cycleWallDecorAt(builderData, p, setBuilderStatus);
      edited();
      return;
    }

    // erase wall decor
    if (p.y === 0 && builderTool === 'erase') {
      const o = obstacleAt(builderData, p);
      if (o && isWallDecorType(o.type)) {
        removeObstacleGroup(builderData, p);
        playHammerSfx();
        edited();
      } else {
        setBuilderStatus('border tiles are always walls');
      }
      return;
    }

    setBuilderStatus('border tiles are always walls');
  };

  const handleBuildTileClick = (p: Pos) => {
    if (!builderMode) return;
    if (!inBounds(builderData.width, builderData.height, p)) return;

    // border tiles are fixed walls
    if (onBorder(builderData, p)) {
      handleBorderClick(p);
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

    const customerId = CUSTOMER_FOR_TOOL[builderTool];
    if (customerId) {
      setCustomerAt(builderData, p, customerId, setBuilderStatus);
    } else if (builderTool === 'erase') {
      if (removeAt(builderData, p, setBuilderStatus)) playHammerSfx();
    } else if (builderTool === 'decor') {
      decorToolDefault = cycleDecorAt(builderData, p, decorToolDefault, setBuilderStatus);
    } else if (builderTool === 'start') {
      setStartAt(builderData, p, setBuilderStatus);
    } else if (builderTool === 'station') {
      stationToolDefault = cycleStationAt(
        builderData,
        p,
        stationToolDefault,
        stationCycle,
        setBuilderStatus
      );
    }

    edited();
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
  const dropAt = (clientX: number, clientY: number) =>
    dropItem(getTilePos(canvas, builderData.width, builderData.height, clientX, clientY));
  const isDropping = () => builderMode && builderTool === 'drag' && !!draggedItem;

  canvas.addEventListener('mouseup', (e) => {
    if (!isDropping()) return;
    dropAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('touchend', (e) => {
    if (!isDropping()) return;
    const touch = e.changedTouches[0];
    if (touch) dropAt(touch.clientX, touch.clientY);
    else dropItem(null);
  });

  canvas.addEventListener('mouseleave', () => {
    if (builderTool === 'drag' && draggedItem) {
      cancelDrag();
    }
  });

  const showInvalid = (errors: string[]) => setBuilderStatus(`invalid:\n${errors.join('\n')}`);

  const checkSolvableNow = () => {
    // first validate for quick immediate errors. Then bfs algo (slowerish)
    const validation = validateLevelData(builderData);
    if (!validation.ok) {
      showInvalid(validation.errors);
      setShareReady(false);
      return;
    }

    const solved = solveLevel(buildLevel(builderData));
    setShareReady(solved.solvable);

    setBuilderStatus(
      `${solved.solvable ? 'solvable!' : 'not solvable'} (searched ${solved.visitedStates} states)`
    );
  };

  checkBtn?.addEventListener('click', () => {
    if (!builderMode) return;
    checkSolvableNow();
  });

  shareBtn?.addEventListener('click', async () => {
    if (!builderMode) return;

    if (!builderShareReady) {
      setBuilderStatus('check the level first');
      return;
    }

    const validation = validateLevelData(builderData);
    if (!validation.ok) {
      builderShareReady = false;
      updateShareUI();
      showInvalid(validation.errors);
      return;
    }

    normalizeOrders(builderData);
    enforceBorderWalls(builderData);

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

  const setBuilderChrome = (open: boolean) => {
    if (builderPanel) builderPanel.style.display = open ? 'block' : 'none';
    for (const btn of [runBtn, retryBtn, undoBtn]) {
      if (btn) btn.style.display = open ? 'none' : '';
    }
    if (exitBuilderBtn) exitBuilderBtn.style.display = open ? '' : 'none';

    const exitHint = byId('exit-builder-hint');
    if (exitHint) exitHint.style.display = open ? '' : 'none';
  };

  const setOrdersHeading = (text: string) => {
    if (ordersHeadingEl) ordersHeadingEl.textContent = text;
  };

  const enterBuilderMode = () => {
    builderMode = true;
    builderData = cloneLevel(deps.getLevelData());
    builderTool = 'decor';
    draggedItem = null;
    dragOrigin = null;

    decorToolDefault = 'plant_a';

    enforceBorderWalls(builderData);
    syncBuilderSizeInputs();

    renderer.hideFailurePopup();
    renderer.setUIMode('build');
    renderer.setOnBuildTileClick(handleBuildTileClick);
    renderer.setBuilderHoverSprite(null); // builder opens with "decor" tool → default hover

    setBuilderChrome(true);

    markBuilderDirty(); // require check before exit
    setOrdersHeading('click to change their orders');
    applyToolActiveUI();
    renderBuilderOrdersInSidebar();
    rebuildPreview();
    setBuilderStatus('builder mode. click tiles to edit');
    deps.onEnter();
  };

  const closeBuilder = () => {
    builderMode = false;
    renderer.setOnBuildTileClick(null);
    renderer.setUIMode('play');
    setBuilderChrome(false);
    setOrdersHeading('orders:');
  };

  const exitBuilderMode = () => {
    if (draggedItem) cancelDrag();
    closeBuilder();

    // keep playing the level you just built if leave (custom level = no stored best)
    deps.onExit(cloneLevel(builderData));
    renderer.forceUpdateOrdersDisplay();
  };

  const forceExitBuilderMode = () => {
    if (!builderMode) return;
    draggedItem = null;
    dragOrigin = null;
    closeBuilder();
    renderer.forceUpdateOrdersDisplay();
  };

  const exitIfChecked = () => {
    if (!builderShareReady) {
      setBuilderStatus('check the level first');
      return;
    }
    exitBuilderMode();
  };

  builderButton?.addEventListener('click', () => {
    if (builderMode) exitIfChecked();
    else enterBuilderMode();
  });

  exitBuilderBtn?.addEventListener('click', exitIfChecked);

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

  builderResizeBtn?.addEventListener('click', () => tryResizeFromInputs());

  for (const input of [builderWidthInput, builderHeightInput]) {
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryResizeFromInputs();
    });
  }

  return { forceExit: forceExitBuilderMode };
}
