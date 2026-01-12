export type DrinkId = "D1" | "D2" | "F1" | "F2" | "F3";
export type CustomerId = "A" | "B" | "C";
export type ObstacleId =
  | "plant_a"
  | "plant_b"
  | "plant_two"
  | "shelf_a"
  | "table_single"
  | "table_l"
  | "table_m"
  | "table_r"
  | "window_single_a";

export type Pos = { x: number; y: number };

export type Level = {
  width: number;
  height: number;
  walls: Set<string>; // "x,y"
  obstacles: Record<string, ObstacleId>; // key "x,y" -> obstacle type
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
