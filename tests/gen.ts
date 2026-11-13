import type { LevelData } from '../src/levels/level.schema';
import type { CustomerId, DrinkId, ObstacleId } from '../src/engine/types';

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const DRINKS: DrinkId[] = ['D1', 'D2', 'F1', 'F2', 'F3'];
const OBS: ObstacleId[] = ['plant_a', 'stool', 'shelf_a', 'cat'] as ObstacleId[];
const DIRS = ['left', 'right', 'up', 'down'] as const;

export function randomLevel(seed: number): LevelData {
  const r = rng(seed);
  const int = (n: number) => Math.floor(r() * n);
  const width = 5 + int(5);
  const height = 4 + int(4);
  const walls: { x: number; y: number }[] = [];
  for (let x = 0; x < width; x++) walls.push({ x, y: 0 }, { x, y: height - 1 });
  for (let y = 1; y < height - 1; y++) walls.push({ x: 0, y }, { x: width - 1, y });
  const used = new Set<string>();
  const free = () => {
    for (let t = 0; t < 100; t++) {
      const x = 1 + int(width - 2);
      const y = 1 + int(height - 2);
      if (!used.has(`${x},${y}`)) {
        used.add(`${x},${y}`);
        return { x, y };
      }
    }
    return null;
  };
  const start = free()!;
  const drinkStations: LevelData['drinkStations'] = [];
  const nStations = 1 + int(4);
  for (let i = 0; i < nStations; i++) {
    const p = free();
    if (p) drinkStations.push({ ...p, drink: DRINKS[int(DRINKS.length)] });
  }
  const customers: LevelData['customers'] = [];
  const orders = {} as Record<CustomerId, DrinkId[]>;
  const ids: CustomerId[] = (['A', 'B', 'C'] as CustomerId[]).slice(0, 1 + int(3));
  const stationDrinks = drinkStations.map((d) => d.drink);
  for (const id of ids) {
    const p = free();
    if (!p) continue;
    const dir = DIRS[int(4)];
    customers.push({ ...p, id, standHere: dir });
    const n = 1 + int(2);
    const pool = r() < 0.85 && stationDrinks.length ? stationDrinks : DRINKS;
    orders[id] = Array.from({ length: n }, () => pool[int(pool.length)]);
  }
  for (const id of ['A', 'B', 'C'] as CustomerId[]) if (!orders[id]) orders[id] = [];
  const obstacles: LevelData['obstacles'] = [];
  const nObs = int(4);
  for (let i = 0; i < nObs; i++) {
    const p = free();
    if (p) obstacles.push({ ...p, type: OBS[int(OBS.length)] });
  }
  return { id: `rand-${seed}`, width, height, start, walls, obstacles, drinkStations, customers, orders };
}
