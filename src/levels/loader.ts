import type { Level } from "../engine/types";
import type { CustomerId } from "../engine/types";
import type { LevelData } from "./level.schema";

const k = (x: number, y: number) => `${x},${y}`;

export function buildLevel(data: LevelData): Level {
  // build standHere map: calculate position based on customer position and standHere direction
  const standHereMap: Record<string, CustomerId> = {};
  for (const customer of data.customers) {
    let standX = customer.x;
    let standY = customer.y;
    if (customer.standHere === "left") standX = customer.x - 1;
    else if (customer.standHere === "right") standX = customer.x + 1;
    else if (customer.standHere === "up") standY = customer.y - 1;
    else if (customer.standHere === "down") standY = customer.y + 1;
    standHereMap[k(standX, standY)] = customer.id;
  }

  return {
    width: data.width,
    height: data.height,
    start: data.start,

    walls: new Set(data.walls.map((w) => k(w.x, w.y))),

    drinkStations: Object.fromEntries(
      data.drinkStations.map((d) => [k(d.x, d.y), d.drink])
    ),

    customers: Object.fromEntries(
      data.customers.map((c) => [k(c.x, c.y), c.id])
    ),

    standHere: standHereMap,

    orders: Object.fromEntries(
      Object.entries(data.orders).map(([id, drinks]) => [
        id,
        drinks,
      ])
    ) as Record<CustomerId, ("D1" | "D2")[]>,
  };
}
