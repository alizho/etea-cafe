export type LevelData = {
  id: string;
  width: number;
  height: number;

  start: { x: number; y: number };

  walls: { x: number; y: number }[];

  drinkStations: {
    x: number;
    y: number;
    drink: "D1" | "D2";
  }[];

  customers: {
    x: number;
    y: number;
    id: "A" | "B" | "C";
    standHere: "left" | "right"; 
  }[];

  orders: Record<"A" | "B" | "C", ("D1" | "D2")[]>;
};
