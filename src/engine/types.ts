export type DrinkId = "D1" | "D2";
export type CustomerId = "1" | "2" | "3";

export type Pos = { x: number; y: number };

export type Level = {
  width: number;
  height: number;
  walls: Set<string>; // "x,y"
  start: Pos;

  drinkStations: Record<string, DrinkId>; // key "x,y" -> drink id
  customers: Record<string, CustomerId>; // key "x,y" -> customer id
  standHere: Record<string, CustomerId>;
  orders: Record<CustomerId, DrinkId[]>;
};

export const keyOf = (p: Pos) => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

export const manhattan1 = (a: Pos, b: Pos) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
