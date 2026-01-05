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
    id: "1" | "2" | "3";
    standHere: "left" | "right"; // do we want to step on left or right of customer to serve them
  }[];

  orders: Record<"1" | "2" | "3", ("D1" | "D2")[]>;
};
