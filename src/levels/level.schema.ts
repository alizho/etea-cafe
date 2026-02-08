import type { CustomerId, DrinkId, ObstacleId } from "../engine/types";

export type LevelData = {
  id: string;
  width: number;
  height: number;

  start: { x: number; y: number };

  walls: { x: number; y: number }[];

  obstacles: {
    x: number;
    y: number;
    type: ObstacleId;
  }[];

  drinkStations: {
    x: number;
    y: number;
    drink: DrinkId;
  }[];

  customers: {
    x: number;
    y: number;
    id: CustomerId;
    standHere: "left" | "right" | "up" | "down";
  }[];

  orders: Record<CustomerId, DrinkId[]>;
};
