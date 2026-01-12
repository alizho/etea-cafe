import type { LevelData } from "./level.schema";

// builder mode checks b4 solver script lol

const k = (x: number, y: number) => `${x},${y}`;

export type LevelValidation = { ok: true } | { ok: false; errors: string[] };

export function validateLevelData(data: LevelData): LevelValidation {
  const errors: string[] = [];

  const validDrinkIds = new Set(["D1", "D2", "F1", "F2", "F3"]);

  if (data.width <= 0 || data.height <= 0) errors.push("width/height must be > 0");

  const inBounds = (x: number, y: number) => x >= 0 && x < data.width && y >= 0 && y < data.height;

  if (!inBounds(data.start.x, data.start.y)) errors.push("start is out of bounds");

  const wallSet = new Set<string>();
  for (const w of data.walls) {
    if (!inBounds(w.x, w.y)) errors.push(`wall out of bounds at (${w.x},${w.y})`);
    wallSet.add(k(w.x, w.y));
  }

  const startKey = k(data.start.x, data.start.y);

  const obstacleSet = new Set<string>();
  for (const o of data.obstacles) {
    if (!inBounds(o.x, o.y)) errors.push(`obstacle out of bounds at (${o.x},${o.y})`);
    const key = k(o.x, o.y);
    if (o.type === "window_single_a") {
      const isTopBorder = o.y === 0;
      const isNonCorner = o.x > 0 && o.x < data.width - 1;
      if (!isTopBorder || !isNonCorner) {
        errors.push(`window must be on the top wall at (${o.x},${o.y})`);
      }
      if (!wallSet.has(key)) {
        errors.push(`window must overlap a wall at (${o.x},${o.y})`);
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
    const key = k(s.x, s.y);
    // stations can't overlap walls because the player can never step
    if (wallSet.has(key)) errors.push(`drink station overlaps wall at (${s.x},${s.y})`);
    if (obstacleSet.has(key)) errors.push(`drink station overlaps obstacle at (${s.x},${s.y})`);
    stationsSet.add(key);
  }

  const customerPosById: Partial<Record<"A" | "B" | "C", string>> = {};
  const customerSet = new Set<string>();

  for (const c of data.customers) {
    if (!inBounds(c.x, c.y)) errors.push(`customer ${c.id} out of bounds at (${c.x},${c.y})`);
    const key = k(c.x, c.y);
    if (wallSet.has(key)) errors.push(`customer ${c.id} overlaps wall at (${c.x},${c.y})`);
    if (obstacleSet.has(key)) errors.push(`customer ${c.id} overlaps obstacle at (${c.x},${c.y})`);
    if (stationsSet.has(key)) errors.push(`customer ${c.id} overlaps drink station at (${c.x},${c.y})`);
    if (customerSet.has(key)) errors.push(`multiple customers on (${c.x},${c.y})`);
    customerSet.add(key);

    if (customerPosById[c.id]) errors.push(`customer ${c.id} appears multiple times`);
    customerPosById[c.id] = key;

    let standX = c.x;
    let standY = c.y;
    if (c.standHere === "left") standX = c.x - 1;
    else if (c.standHere === "right") standX = c.x + 1;
    else if (c.standHere === "up") standY = c.y - 1;
    else if (c.standHere === "down") standY = c.y + 1;
    if (!inBounds(standX, standY)) errors.push(`customer ${c.id} stand tile is out of bounds`);
    const standKey = k(standX, standY);
    if (wallSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps wall`);
    if (obstacleSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps obstacle`);
    if (customerSet.has(standKey)) errors.push(`customer ${c.id} stand tile overlaps a customer`);
  }

  for (const id of ["A", "B", "C"] as const) {
    if (!customerPosById[id]) errors.push(`missing customer ${id}`);
  }

  if (wallSet.has(startKey)) errors.push("start overlaps a wall");
  if (customerSet.has(startKey)) errors.push("start overlaps a customer");
  if (stationsSet.has(startKey)) {
    // start can overlap stations
  }

  for (const id of ["A", "B", "C"] as const) {
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
