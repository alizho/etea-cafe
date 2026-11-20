import type { DrinkId, Level, ObstacleId } from '../engine/types';
import { TILE_SIZE } from '../config/constants';
import { pairAdjacent, parseKey, uniqueSorted } from '../util/grid';
import {
  sprites,
  catAltSprite,
  glorboSpriteSheet,
  spillSprite,
  wallTop,
  wallBot,
  wallLeftTop,
  wallLeftMid,
  wallLeftBot,
  wallLeftCorner,
  wallRightTop,
  wallRightMid,
  wallRightBot,
  wallRightCorner,
} from './images';

type Ctx = CanvasRenderingContext2D;

const _outlineCache = new Map<HTMLImageElement, HTMLCanvasElement>();
function getWhiteSilhouette(sprite: HTMLImageElement): HTMLCanvasElement {
  let cached = _outlineCache.get(sprite);
  if (cached) return cached;
  const off = document.createElement('canvas');
  off.width = sprite.width;
  off.height = sprite.height;
  const offCtx = off.getContext('2d')!;
  offCtx.drawImage(sprite, 0, 0);
  offCtx.globalCompositeOperation = 'source-in';
  offCtx.fillStyle = 'white';
  offCtx.fillRect(0, 0, off.width, off.height);
  _outlineCache.set(sprite, off);
  return off;
}

const OUTLINE_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

function drawSpriteWithOutline(
  ctx: Ctx,
  sprite: HTMLImageElement,
  px: number,
  py: number,
  w: number,
  h: number,
  outlinePx = 4,
  outlineAlpha = 0.7
) {
  const silhouette = getWhiteSilhouette(sprite);
  const o = outlinePx;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = outlineAlpha;
  for (const [dx, dy] of OUTLINE_OFFSETS) {
    ctx.drawImage(silhouette, px + dx * o, py + dy * o, w, h);
  }
  ctx.globalAlpha = prevAlpha;
  ctx.drawImage(sprite, px, py, w, h);
}

/** drink station with its pulsing white outline */
export function drawStation(
  ctx: Ctx,
  sprite: HTMLImageElement,
  x: number,
  y: number,
  frame: number
) {
  const outlineAlpha = frame % 2 === 0 ? 0.7 : 0.3;
  drawSpriteWithOutline(
    ctx,
    sprite,
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    4,
    outlineAlpha
  );
}

// 2x2 sheet: columns are frames, bottom row is served
export function drawCustomer(
  ctx: Ctx,
  sprite: HTMLImageElement,
  x: number,
  y: number,
  frame: number,
  served: boolean
) {
  const sw = sprite.width / 2;
  const sh = sprite.height / 2;
  ctx.drawImage(
    sprite,
    (frame % 2) * sw,
    served ? sh : 0,
    sw,
    sh,
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );
}

// 3 columns (items held) x 2 rows (frames)
export function drawGlorbo(ctx: Ctx, x: number, y: number, column: number, frame: number) {
  const sw = glorboSpriteSheet.width / 3;
  const sh = glorboSpriteSheet.height / 2;
  ctx.drawImage(
    glorboSpriteSheet,
    column * sw,
    frame * sh,
    sw,
    sh,
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );
}

/** sprite with 2 frames side by side */
export function drawTwoFrame(
  ctx: Ctx,
  sprite: HTMLImageElement,
  frameIndex: number,
  x: number,
  y: number
) {
  const frameWidth = sprite.width / 2;
  ctx.drawImage(
    sprite,
    frameIndex * frameWidth,
    0,
    frameWidth,
    sprite.height,
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );
}

export function drawTile(ctx: Ctx, sprite: HTMLImageElement, x: number, y: number, tilesWide = 1) {
  ctx.drawImage(sprite, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE * tilesWide, TILE_SIZE);
}

export const catFrame = (base: HTMLImageElement, frame: number) =>
  frame % 2 === 0 ? base : catAltSprite;

const isFloor = (level: Level, x: number, y: number): boolean => {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  return !level.walls.has(`${x},${y}`);
};

export function wallSpriteFor(level: Level, x: number, y: number): HTMLImageElement {
  const f = (dx: number, dy: number) => isFloor(level, x + dx, y + dy);
  if (f(0, 1)) return wallTop;
  if (f(0, -1)) return wallBot;
  if (!f(-1, 1) && f(-1, 0)) return wallRightBot;
  if (f(-1, 0)) return wallRightMid;
  if (f(-1, 1)) return wallRightTop;
  if (!f(1, 1) && f(1, 0)) return wallLeftBot;
  if (f(1, 0)) return wallLeftMid;
  if (f(1, 1)) return wallLeftTop;
  if (f(1, -1)) return wallLeftCorner;
  if (f(-1, -1)) return wallRightCorner;
  return wallTop;
}

export const TWO_TILE_TYPES = ['plant_two', 'window_double_a', 'window_double_b'] as const;
const isTwoTileType = (type: ObstacleId) =>
  (TWO_TILE_TYPES as readonly ObstacleId[]).includes(type);

export type ObstacleDraw = {
  x: number;
  y: number;
  type: ObstacleId;
  sprite: HTMLImageElement;
  tilesWide: 1 | 2;
};

/** paired two-tile pieces first, then singles, in level order */
export function obstacleDrawList(level: Level): ObstacleDraw[] {
  const out: ObstacleDraw[] = [];

  const twoTileByRow = new Map<string, Map<string, number[]>>();
  for (const t of TWO_TILE_TYPES) twoTileByRow.set(t, new Map());
  for (const [key, type] of Object.entries(level.obstacles)) {
    if (!isTwoTileType(type)) continue;
    const [x, y] = parseKey(key);
    const byRow = twoTileByRow.get(type)!;
    const xs = byRow.get(String(y)) ?? [];
    xs.push(x);
    byRow.set(String(y), xs);
  }

  for (const t of TWO_TILE_TYPES) {
    const sprite = sprites.obstacles[t];
    if (!sprite) continue;
    for (const [yStr, xs] of twoTileByRow.get(t)!.entries()) {
      const y = Number(yStr);
      for (const [x] of pairAdjacent(uniqueSorted(xs))) {
        out.push({ x, y, type: t, sprite, tilesWide: 2 });
      }
    }
  }

  for (const [key, type] of Object.entries(level.obstacles)) {
    if (isTwoTileType(type)) continue;
    const sprite = sprites.obstacles[type];
    if (!sprite) continue;
    const [x, y] = parseKey(key);
    out.push({ x, y, type, sprite, tilesWide: 1 });
  }

  return out;
}

function cropToDataUrl(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  w: number,
  h: number
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  return canvas.toDataURL();
}

const _customerIconCache = new Map<HTMLImageElement, Map<2 | 3, string>>();
export function getCustomerIconDataUrl(
  customerSprite: HTMLImageElement,
  quadrant: 2 | 3 = 2
): string {
  const byQuadrant = _customerIconCache.get(customerSprite) ?? new Map<2 | 3, string>();
  const cached = byQuadrant.get(quadrant);
  if (cached !== undefined) return cached;

  const w = customerSprite.width / 2;
  const h = customerSprite.height / 2;
  const url = cropToDataUrl(customerSprite, quadrant === 2 ? 0 : w, h, w, h);
  // only cache once the sprite has real pixels
  if (url && customerSprite.complete && w > 0) {
    byQuadrant.set(quadrant, url);
    _customerIconCache.set(customerSprite, byQuadrant);
  }
  return url;
}

export function getGlorboIcon(glorboSprite: HTMLImageElement): string {
  const w = glorboSprite.width / 3;
  const h = glorboSprite.height / 2;
  return cropToDataUrl(glorboSprite, 0, 0, w, h);
}

// ── spills ──

const PX = TILE_SIZE / 16; // one sprite pixel

export function drawSpill(ctx: Ctx, x: number, y: number) {
  drawTile(ctx, spillSprite, x, y);
}

// ── slipping on a spill ──
// held frames like the rest of the art: no easing, only 90° turns, moves in whole sprite pixels

export type SlipAnim = { start: number; dir: 1 | -1; dropped: DrinkId[] };
type SlipPose = { turns: number; dx: number; dy: number }; // quarter turns, sprite px

// back = fall away from the way glorbo was walking
const slipFrames = (dir: 1 | -1): { ms: number; pose: SlipPose }[] => [
  { ms: 110, pose: { turns: 0, dx: dir * 2, dy: 0 } }, // feet slide out
  { ms: 110, pose: { turns: 0, dx: dir * 2, dy: -3 } }, // whoa
  { ms: 90, pose: { turns: -dir, dx: dir, dy: 1 } }, // splat
  { ms: 70, pose: { turns: -dir, dx: dir, dy: 0 } }, // bounce
  { ms: 300, pose: { turns: -dir, dx: dir, dy: 1 } }, // lie there
  { ms: 130, pose: { turns: 0, dx: 0, dy: -2 } }, // hop up
  { ms: 90, pose: { turns: 0, dx: 0, dy: 0 } },
];

export const SLIP_MS = slipFrames(1).reduce((n, f) => n + f.ms, 0);
export const SLIP_THUD_MS = 220; // the splat frame, when glorbo hits the floor

function slipPose(t: number, dir: 1 | -1): SlipPose {
  const frames = slipFrames(dir);
  let end = 0;
  for (const f of frames) {
    end += f.ms;
    if (t < end) return f.pose;
  }
  return frames[frames.length - 1].pose;
}

// whatever glorbo was holding pops out of their hands, bounces once, and is gone
const ITEM_HOPS = [
  { from: 220, to: 330, dx: 3, dy: -5 },
  { from: 330, to: 440, dx: 6, dy: -6 },
  { from: 440, to: 550, dx: 8, dy: -2 },
  { from: 550, to: 700, dx: 9, dy: 2 },
];

export function drawSlippingGlorbo(
  ctx: Ctx,
  x: number,
  y: number,
  column: number,
  frame: number,
  slip: SlipAnim,
  t: number
) {
  const pose = slipPose(t, slip.dir);
  const cx = (x + 0.5) * TILE_SIZE;
  const cy = (y + 0.5) * TILE_SIZE;
  ctx.save();
  ctx.translate(cx + pose.dx * PX, cy + pose.dy * PX);
  ctx.rotate((pose.turns * Math.PI) / 2);
  ctx.translate(-cx, -cy);
  drawGlorbo(ctx, x, y, column, frame);
  ctx.restore();

  const hop = ITEM_HOPS.find((h) => t >= h.from && t < h.to);
  if (!hop) return;
  const size = TILE_SIZE / 2;
  slip.dropped.forEach((id, i) => {
    const img = sprites.drinkItems[id];
    if (!img) return;
    const spread = 1 + i * 0.6; // second item flies a bit further
    const ix = cx + Math.round(slip.dir * hop.dx * spread) * PX - size / 2;
    const iy = y * TILE_SIZE + TILE_SIZE / 4 + (hop.dy - i) * PX - size / 2;
    ctx.drawImage(img, ix, iy, size, size);
  });
}
