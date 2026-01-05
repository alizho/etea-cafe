import type { LevelData } from "./level.schema";

// builder mode checks b4 solver script lol

const k = (x: number, y: number) => `${x},${y}`;

export type LevelValidation = { ok: true } | { ok: false; errors: string[] };

export function validateLevelData(data: LevelData): LevelValidation {
  const errors: string[] = [];

  if (data.width <= 0 || data.height <= 0) errors.push("width/height must be > 0");

  const inBounds = (x: number, y: number) => x >= 0 && x < data.width && y >= 0 && y < data.height;

  if (!inBounds(data.start.x, data.start.y)) errors.push("start is out of bounds");

  const wallSet = new Set<string>();
  for (const w of data.walls) {
    if (!inBounds(w.x, w.y)) errors.push(`wall out of bounds at (${w.x},${w.y})`);
    wallSet.add(k(w.x, w.y));
  }

  const stationsSet = new Set<string>();
  for (const s of data.drinkStations) {
    if (!inBounds(s.x, s.y)) errors.push(`drink station out of bounds at (${s.x},${s.y})`);
    const key = k(s.x, s.y);
    // stations can't overlap walls because the player can never step
    if (wallSet.has(key)) errors.push(`drink station overlaps wall at (${s.x},${s.y})`);
    stationsSet.add(key);
  }

  const customerPosById: Partial<Record<"1" | "2" | "3", string>> = {};
  const customerSet = new Set<string>();

  for (const c of data.customers) {
    if (!inBounds(c.x, c.y)) errors.push(`customer ${c.id} out of bounds at (${c.x},${c.y})`);
    const key = k(c.x, c.y);
    if (wallSet.has(key)) errors.push(`customer ${c.id} overlaps wall at (${c.x},${c.y})`);
    if (stationsSet.has(key)) errors.push(`customer ${c.id} overlaps drink station at (${c.x},${c.y})`);
    if (customerSet.has(key)) errors.push(`multiple customers on (${c.x},${c.y})`);
    customerSet.add(key);

    if (customerPosById[c.id]) errors.push(`customer ${c.id} appears multiple times`);
    customerPosById[c.id] = key;

    const standX = c.standHere === "left" ? c.x - 1 : c.x + 1;
    const standY = c.y;
    if (!inBounds(standX, standY)) errors.push(`customer ${c.id} stand tile is out of bounds`);
    const standKey = k(standX, standY);
    if (wallSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps wall`);
    if (customerSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps a customer`);
  }

  for (const id of ["1", "2", "3"] as const) {
    if (!customerPosById[id]) errors.push(`missing customer ${id}`);
  }

  const startKey = k(data.start.x, data.start.y);
  if (wallSet.has(startKey)) errors.push("start overlaps a wall");
  if (customerSet.has(startKey)) errors.push("start overlaps a customer");

  for (const id of ["1", "2", "3"] as const) {
    const order = data.orders[id];
    if (!order) {
      errors.push(`missing order for ${id}`);
      continue;
    }
    if (order.length < 1) errors.push(`order for ${id} must have at least 1 drink`);
    if (order.length > 2) errors.push(`order for ${id} must be 1 or 2 drinks`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
