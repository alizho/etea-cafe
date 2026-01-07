export type LevelData = {
  id: string;
  width: number;
  height: number;

  start: { x: number; y: number };

  walls: { x: number; y: number }[];

  obstacles: {
    x: number;
    y: number;
    type: "plant_a" | "plant_b" | "table_single";
  }[];

  drinkStations: {
    x: number;
    y: number;
    drink: "D1" | "D2" | "F1" | "F2" | "F3";
  }[];

  customers: {
    x: number;
    y: number;
    id: "A" | "B" | "C";
    standHere: "left" | "right" | "up" | "down";
  }[];

  orders: Record<"A" | "B" | "C", ("D1" | "D2")[]>;
};
