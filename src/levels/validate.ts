import { keyOf, type CustomerId } from '../engine/types';
import type { ObstacleId } from '../config/items';
import { ALL_CUSTOMER_IDS, ALL_DRINK_IDS, isWallDecorType } from '../config/items';
import type { LevelData } from './level.schema';
import { standTileOf } from './loader';

// builder mode checks b4 solver script lol

export type LevelValidation = { ok: true } | { ok: false; errors: string[] };

export function validateLevelData(data: LevelData): LevelValidation {
  const errors: string[] = [];

  const validDrinkIds = new Set(ALL_DRINK_IDS);

  if (data.width <= 0 || data.height <= 0) errors.push('width/height must be > 0');

  const inBounds = (x: number, y: number) => x >= 0 && x < data.width && y >= 0 && y < data.height;

  if (!inBounds(data.start.x, data.start.y)) errors.push('start is out of bounds');

  const wallSet = new Set<string>();
  for (const w of data.walls) {
    if (!inBounds(w.x, w.y)) errors.push(`wall out of bounds at (${w.x},${w.y})`);
    wallSet.add(keyOf(w));
  }

  const startKey = keyOf(data.start);

  const obstacleSet = new Set<string>();
  for (const o of data.obstacles) {
    if (!inBounds(o.x, o.y)) errors.push(`obstacle out of bounds at (${o.x},${o.y})`);
    const key = keyOf(o);
    if (isWallDecorType(o.type as ObstacleId)) {
      const isTopBorder = o.y === 0;
      const isNonCorner = o.x > 0 && o.x < data.width - 1;
      if (!isTopBorder || !isNonCorner) {
        errors.push(`wall item must be on the top wall at (${o.x},${o.y})`);
      }
      if (!wallSet.has(key)) {
        errors.push(`wall item must overlap a wall at (${o.x},${o.y})`);
      }
    } else if (wallSet.has(key)) {
      errors.push(`obstacle overlaps wall at (${o.x},${o.y})`);
    }
    if (key === startKey) errors.push(`obstacle overlaps start at (${o.x},${o.y})`);
    if (obstacleSet.has(key)) errors.push(`multiple obstacles on (${o.x},${o.y})`);
    obstacleSet.add(key);
  }

  const stationsSet = new Set<string>();
  for (const s of data.drinkStations) {
    if (!inBounds(s.x, s.y)) errors.push(`drink station out of bounds at (${s.x},${s.y})`);
    const key = keyOf(s);
    // stations can't overlap walls because the player can never step
    if (wallSet.has(key)) errors.push(`drink station overlaps wall at (${s.x},${s.y})`);
    if (obstacleSet.has(key)) errors.push(`drink station overlaps obstacle at (${s.x},${s.y})`);
    stationsSet.add(key);
  }

  const customerPosById: Partial<Record<CustomerId, string>> = {};
  const customerSet = new Set<string>();

  for (const c of data.customers) {
    if (!inBounds(c.x, c.y)) errors.push(`customer ${c.id} out of bounds at (${c.x},${c.y})`);
    const key = keyOf(c);
    if (wallSet.has(key)) errors.push(`customer ${c.id} overlaps wall at (${c.x},${c.y})`);
    if (obstacleSet.has(key)) errors.push(`customer ${c.id} overlaps obstacle at (${c.x},${c.y})`);
    if (stationsSet.has(key))
      errors.push(`customer ${c.id} overlaps drink station at (${c.x},${c.y})`);
    if (customerSet.has(key)) errors.push(`multiple customers on (${c.x},${c.y})`);
    customerSet.add(key);

    if (customerPosById[c.id]) errors.push(`customer ${c.id} appears multiple times`);
    customerPosById[c.id] = key;

    const stand = standTileOf(c);
    if (!inBounds(stand.x, stand.y)) errors.push(`customer ${c.id} stand tile is out of bounds`);
    const standKey = keyOf(stand);
    if (wallSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps wall`);
    if (obstacleSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps obstacle`);
    if (customerSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps a customer`);
  }

  for (const id of ALL_CUSTOMER_IDS) {
    if (!customerPosById[id]) errors.push(`missing customer ${id}`);
  }

  if (wallSet.has(startKey)) errors.push('start overlaps a wall');
  if (customerSet.has(startKey)) errors.push('start overlaps a customer');
  // start can overlap stations

  for (const id of ALL_CUSTOMER_IDS) {
    const order = data.orders[id];
    if (!order) {
      errors.push(`missing order for ${id}`);
      continue;
    }
    if (order.length < 1) errors.push(`order for ${id} must have at least 1 drink`);
    if (order.length > 2) errors.push(`order for ${id} must be 1 or 2 drinks`);

    for (const item of order) {
      if (!validDrinkIds.has(item)) {
        errors.push(`order for ${id} has invalid item: ${String(item)}`);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
