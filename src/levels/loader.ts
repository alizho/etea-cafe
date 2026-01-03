import type { Level } from "../engine/types";
import type { LevelData } from "./level.schema";

const k = (x: number, y: number) => `${x},${y}`;

export function buildLevel(data: LevelData): Level {
  return {
    width: data.width,
    height: data.height,
    start: data.start,

    walls: new Set(data.walls.map((w) => k(w.x, w.y))),

    drinkStations: Object.fromEntries(
      data.drinkStations.map((d) => [k(d.x, d.y), d.drink])
    ),

    customers: Object.fromEntries(data.customers.map((c) => [k(c.x, c.y), c.id])),

    orders: data.orders,
  };
}
