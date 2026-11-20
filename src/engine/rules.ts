import type { CustomerId, DrinkId, Level } from './types';

// the game rules, shared by the live sim and the solver

export type Orders = Record<CustomerId, DrinkId[]>;
export type Hands = { inv: DrinkId[]; remaining: Orders };

export function initRemainingOrders(level: Level): Orders {
  return {
    A: [...(level.orders.A ?? [])],
    B: [...(level.orders.B ?? [])],
    C: [...(level.orders.C ?? [])],
  };
}

// can't step on walls, customers, or obstacles
export function isWalkable(level: Level, posKey: string): boolean {
  return !level.walls.has(posKey) && !level.customers[posKey] && !level.obstacles[posKey];
}

export function tileHasEffect(level: Level, posKey: string): boolean {
  return !!level.standHere[posKey] || !!level.drinkStations[posKey] || level.spills.has(posKey);
}

export function allServed(remaining: Orders): boolean {
  return Object.values(remaining).every((needs) => needs.length === 0);
}

// queue max 2 drop oldest
function pickDrink(inv: DrinkId[], drink: DrinkId): DrinkId[] {
  const next = [...inv];
  if (next.length >= 2) next.shift();
  next.push(drink);
  return next;
}

// hand over every held item the customer still needs
function serve(customerId: CustomerId | undefined, inv: DrinkId[], remaining: Orders): Hands {
  if (!customerId) return { inv, remaining };
  const needs = [...(remaining[customerId] ?? [])];
  const kept: DrinkId[] = [];
  for (const d of inv) {
    const i = needs.indexOf(d);
    if (i >= 0) needs.splice(i, 1);
    else kept.push(d);
  }
  if (kept.length === inv.length) return { inv, remaining };
  return { inv: kept, remaining: { ...remaining, [customerId]: needs } };
}

// slip on a spill (drop the oldest item), serve, pick up, then serve again when a stand tile overlaps a station
export function resolveTile(
  level: Level,
  posKey: string,
  inv: DrinkId[],
  remaining: Orders
): Hands {
  if (level.spills.has(posKey)) inv = inv.slice(1);
  const customerId = level.standHere[posKey] as CustomerId | undefined;
  const hands = serve(customerId, inv, remaining);
  const drink = level.drinkStations[posKey];
  if (!drink) return hands;
  return serve(customerId, pickDrink(hands.inv, drink), hands.remaining);
}
