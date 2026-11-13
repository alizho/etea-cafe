import { type Pos } from './engine/types';
import type { GameState } from './engine/game';
import { TILE_SIZE } from './config/constants';

// sprites: [frame 0, frame 1] of each path piece
type SpritePair = [HTMLImageElement, HTMLImageElement];

const imageLoads: Promise<void>[] = [];

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  imageLoads.push(
    new Promise<void>((resolve) => {
      img.onload = () => resolve();
    })
  );
  return img;
}

const loadPair = (name: string): SpritePair => [
  loadImage(`/img/${name}.png`),
  loadImage(`/img/${name}_alt.png`),
];

const pathH = loadPair('path_h');
const pathV = loadPair('path_v');
const pathCornerLD = loadPair('path_corner_ld');
const pathButt = loadPair('path_butt');
const pathArrow = loadPair('path_arrow');

export const pathImagesLoaded = Promise.all(imageLoads);

const frameOf = (pair: SpritePair, animationFrame: number) =>
  animationFrame === 0 ? pair[0] : pair[1];

type Direction = 'left' | 'right' | 'up' | 'down';

function getDirection(from: Pos, to: Pos): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return null;
}

// degrees, keyed by "from-to"
const CORNER_ROTATION: Partial<Record<`${Direction}-${Direction}`, number>> = {
  'right-down': 0,
  'up-left': 0,
  'down-right': 180,
  'left-up': 180,
  'right-up': 90,
  'down-left': 90,
  'left-down': 270,
  'up-right': 270,
};

// rotation based on direction we're coming from
const BUTT_ROTATION: Record<Direction, number> = {
  down: 0, // down down up
  up: 180, // up up down
  left: 90, // left left right
  right: 270, // right right left
};

const ARROW_ROTATION: Record<Direction, number> = {
  right: 270,
  left: 90,
  down: 0,
  up: 180,
};

function isOppositeDirection(
  dirFrom: Direction | null,
  dirTo: Direction | null,
  path: Pos[],
  i: number
): boolean {
  if (!dirFrom || !dirTo) return false;

  const isVerticalBacktrack =
    (dirFrom === 'down' && dirTo === 'up') || (dirFrom === 'up' && dirTo === 'down');
  const isHorizontalBacktrack =
    (dirFrom === 'left' && dirTo === 'right') || (dirFrom === 'right' && dirTo === 'left');

  // back tracking if we r going straight in one direction then reversing
  // are previous and next movements on the same axis
  if (i > 0 && i < path.length - 1) {
    const pos = path[i];
    const prev = path[i - 1];
    const next = path[i + 1];
    const prevDx = pos.x - prev.x;
    const prevDy = pos.y - prev.y;
    const nextDx = next.x - pos.x;
    const nextDy = next.y - pos.y;

    const prevIsVertical = prevDx === 0;
    const nextIsVertical = nextDx === 0;
    const prevIsHorizontal = prevDy === 0;
    const nextIsHorizontal = nextDy === 0;

    // show butt block if we're backtracking on the same axis in a straight line
    if (isVerticalBacktrack && prevIsVertical && nextIsVertical) {
      return true;
    } else if (isHorizontalBacktrack && prevIsHorizontal && nextIsHorizontal) {
      return true;
    }
  } else {
    //opposite check if fisrt or last tile
    return isVerticalBacktrack || isHorizontalBacktrack;
  }

  return false;
}

function drawRotated(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  cx: number,
  cy: number,
  degrees: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(sprite, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

// tinted tiles are pure functions of sprite, rotation and color, so reuse them across frames
const TINT_CACHE_MAX = 512;
const tintCache = new Map<string, HTMLCanvasElement>();
const spriteIds = new Map<HTMLImageElement, number>();

function tintedTile(
  tempCtx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  rotation: number | null,
  r: number,
  g: number,
  b: number
): CanvasImageSource {
  const cacheable = sprite.complete && sprite.naturalWidth > 0;
  let spriteId = spriteIds.get(sprite);
  if (spriteId === undefined) spriteIds.set(sprite, (spriteId = spriteIds.size));
  const key = `${spriteId}|${rotation}|${r},${g},${b}|${tempCtx.imageSmoothingEnabled}`;
  const hit = cacheable ? tintCache.get(key) : undefined;
  if (hit) return hit;

  // clear temp canvas
  tempCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  if (rotation === null) tempCtx.drawImage(sprite, 0, 0, TILE_SIZE, TILE_SIZE);
  else drawRotated(tempCtx, sprite, TILE_SIZE / 2, TILE_SIZE / 2, rotation);

  // apply gradient tint only to sprite pixels with alpha > 0
  const imageData = tempCtx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const data = imageData.data;

  // apply multiply blend to tint only non-transparent pixels
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      data[i] = Math.floor((data[i] * r) / 255); // R
      data[i + 1] = Math.floor((data[i + 1] * g) / 255); // G
      data[i + 2] = Math.floor((data[i + 2] * b) / 255); // B
    }
  }

  // put the tinted image data back
  tempCtx.putImageData(imageData, 0, 0);
  if (!cacheable) return tempCtx.canvas;

  const tile = document.createElement('canvas');
  tile.width = tempCtx.canvas.width;
  tile.height = tempCtx.canvas.height;
  tile.getContext('2d')?.putImageData(imageData, 0, 0);
  if (tintCache.size >= TINT_CACHE_MAX) tintCache.clear();
  tintCache.set(key, tile);
  return tile;
}

export type PathTint = { r: number; g: number; b: number };

// default blue tint #85b6d7
export const PATH_TINT_BLUE: PathTint = { r: 133, g: 182, b: 215 };
// green tint for optimal path
export const PATH_TINT_GREEN: PathTint = { r: 100, g: 190, b: 120 };

export function renderPath(
  ctx: CanvasRenderingContext2D,
  tempCtx: CanvasRenderingContext2D,
  state: GameState,
  animationFrame: number,
  tint: PathTint = PATH_TINT_BLUE
): void {
  const { path, stepIndex } = state;
  const pathLength = path.length;
  const lastIndexToDraw = state.status === 'idle' && pathLength > 0 ? pathLength - 1 : pathLength;

  for (let i = 0; i < lastIndexToDraw; i++) {
    if (i <= stepIndex) continue;
    const pos = path[i];
    const px = pos.x * TILE_SIZE;
    const py = pos.y * TILE_SIZE;

    // calculate gradient: newest segment (highest index) = white, oldest (lowest index) = tint color
    const gradientValue = pathLength > 1 ? (pathLength - 1 - i) / (pathLength - 1) : 1;

    // determine direction from previous to current, and current to next
    const dirFrom = i > 0 ? getDirection(path[i - 1], pos) : null;
    const dirTo = i < path.length - 1 ? getDirection(pos, path[i + 1]) : null;

    // gradient color from tint parameter
    const r = Math.round(255 - (255 - tint.r) * gradientValue);
    const g = Math.round(255 - (255 - tint.g) * gradientValue);
    const b = Math.round(255 - (255 - tint.b) * gradientValue);

    // opposite direction check
    const oppositeDir = isOppositeDirection(dirFrom, dirTo, path, i);

    let sprite: HTMLImageElement;
    let rotation: number | null = null;
    if (dirFrom && dirTo && dirFrom !== dirTo && !oppositeDir) {
      // corner - rotate sprite based on corner type
      sprite = frameOf(pathCornerLD, animationFrame);
      rotation = CORNER_ROTATION[`${dirFrom}-${dirTo}`] ?? 0;
    } else if (oppositeDir) {
      // backtracking on same axis
      sprite = frameOf(pathButt, animationFrame);
      rotation = dirFrom ? BUTT_ROTATION[dirFrom] : 0;
    } else {
      // straight piece along the next (else previous) move, horizontal if neither
      const dir = dirTo ?? dirFrom;
      const vertical = dir === 'up' || dir === 'down';
      sprite = frameOf(vertical ? pathV : pathH, animationFrame);
    }

    // draw tinted sprite
    ctx.drawImage(tintedTile(tempCtx, sprite, rotation, r, g, b), px, py);
  }
}

export function renderPathArrow(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  animationFrame: number
): void {
  const { path } = state;

  // draw path arrow on the last tile (current point user is on)
  if (path.length > 1 && state.status === 'idle') {
    const lastIndex = path.length - 1;
    const lastPos = path[lastIndex];

    // determine direction based on last movement
    const dir = getDirection(path[lastIndex - 1], lastPos);
    const arrowRotation = dir ? ARROW_ROTATION[dir] : 0;

    // draw arrow sprite with rotation
    drawRotated(
      ctx,
      frameOf(pathArrow, animationFrame),
      lastPos.x * TILE_SIZE + TILE_SIZE / 2,
      lastPos.y * TILE_SIZE + TILE_SIZE / 2,
      arrowRotation
    );
  }
}
