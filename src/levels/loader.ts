import {
  keyOf,
  type CustomerId,
  type DrinkId,
  type Level,
  type ObstacleId,
  type Pos,
} from '../engine/types';
import type { LevelData } from './level.schema';

// tile the player stands on to serve a customer
export function standTileOf(c: LevelData['customers'][number]): Pos {
  if (c.standHere === 'left') return { x: c.x - 1, y: c.y };
  if (c.standHere === 'right') return { x: c.x + 1, y: c.y };
  if (c.standHere === 'up') return { x: c.x, y: c.y - 1 };
  if (c.standHere === 'down') return { x: c.x, y: c.y + 1 };
  return { x: c.x, y: c.y };
}

export function buildLevel(data: LevelData): Level {
  const standHereMap: Record<string, CustomerId> = {};
  const customersMap: Record<string, CustomerId> = {};
  for (const c of data.customers) {
    standHereMap[keyOf(standTileOf(c))] = c.id;
    customersMap[keyOf(c)] = c.id;
  }

  const obstaclesMap: Record<string, ObstacleId> = {};
  for (const o of data.obstacles) obstaclesMap[keyOf(o)] = o.type as ObstacleId;

  const drinkStationsMap: Record<string, DrinkId> = {};
  for (const d of data.drinkStations) drinkStationsMap[keyOf(d)] = d.drink;

  return {
    width: data.width,
    height: data.height,
    start: data.start,
    walls: new Set(data.walls.map(keyOf)),
    obstacles: obstaclesMap,
    drinkStations: drinkStationsMap,
    customers: customersMap,
    standHere: standHereMap,
    orders: { ...data.orders },
  };
}
