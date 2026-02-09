export type DrinkId = "D1" | "D2" | "F1" | "F2" | "F3";
export type CustomerId = "A" | "B" | "C";
export type ObstacleId =
  | "plant_a"
  | "plant_b"
  | "plant_two"
  | "shelf_a"
  | "table_single"
  | "shelf_b"
  | "bookshelf"
  | "stool"
  | "chair_l"
  | "chair_r"
  | "table_l"
  | "table_m"
  | "table_r"
  | "window_single_a"
  | "window_double_a"
  | "window_double_b"
  | "cat";

export interface DrinkConfig {
  id: DrinkId;
  name: string;
  spritePath: string;
  itemSpritePath: string;
  pressedSpritePath?: string; // pressed state
  category: "drink" | "food";
}

export interface ObstacleConfig {
  id: ObstacleId;
  name: string;
  spritePath: string;
  width: number; // tiles wide
  placeable: boolean; // builder mode (so like multi tile wouldn't cuz special case, see table_triple)
}

export interface CustomerConfig {
  id: CustomerId;
  name: string;
  spritePath: string;
}

export const DRINKS: Record<DrinkId, DrinkConfig> = {
  D1: {
    id: "D1",
    name: "drink_a",
    spritePath: "/src/assets/drink_a.png",
    itemSpritePath: "/src/assets/drink_a_item.png",
    pressedSpritePath: "/src/assets/drink_pressed.png",
    category: "drink",
  },
  D2: {
    id: "D2",
    name: "drink_b",
    spritePath: "/src/assets/drink_b.png",
    itemSpritePath: "/src/assets/drink_b_item.png",
    pressedSpritePath: "/src/assets/drink_pressed.png",
    category: "drink",
  },
  F1: {
    id: "F1",
    name: "food_a",
    spritePath: "/src/assets/food_a.png",
    itemSpritePath: "/src/assets/food_a_item.png",
    category: "food",
  },
  F2: {
    id: "F2",
    name: "food_b",
    spritePath: "/src/assets/food_b.png",
    itemSpritePath: "/src/assets/food_b_item.png",
    category: "food",
  },
  F3: {
    id: "F3",
    name: "food_c",
    spritePath: "/src/assets/food_c.png",
    itemSpritePath: "/src/assets/food_c_item.png",
    category: "food",
  },
};

export const OBSTACLES: Record<ObstacleId, ObstacleConfig> = {
  plant_a: {
    id: "plant_a",
    name: "plant_a",
    spritePath: "/src/assets/plant_a.png",
    width: 1,
    placeable: true,
  },
  plant_b: {
    id: "plant_b",
    name: "plant_b",
    spritePath: "/src/assets/plant_b.png",
    width: 1,
    placeable: true,
  },
  plant_two: {
    id: "plant_two",
    name: "plant_two",
    spritePath: "/src/assets/plant_two.png",
    width: 2,
    placeable: true,
  },
  shelf_a: {
    id: "shelf_a",
    name: "shelf_a",
    spritePath: "/src/assets/shelf_a.png",
    width: 1,
    placeable: true,
  },
  shelf_b: {
    id: "shelf_b",
    name: "shelf_b",
    spritePath: "/src/assets/shelf_b.png",
    width: 1,
    placeable: true,
  },
  bookshelf: {
    id: "bookshelf",
    name: "bookshelf",
    spritePath: "/src/assets/bookshelf.png",
    width: 1,
    placeable: true,
  },
  stool: {
    id: "stool",
    name: "stool",
    spritePath: "/src/assets/stool.png",
    width: 1,
    placeable: true,
  },
  chair_l: {
    id: "chair_l",
    name: "chair_l",
    spritePath: "/src/assets/chair_l.png",
    width: 1,
    placeable: true,
  },
  chair_r: {
    id: "chair_r",
    name: "chair_r",
    spritePath: "/src/assets/chair_r.png",
    width: 1,
    placeable: true,
  },
  table_single: {
    id: "table_single",
    name: "table_single",
    spritePath: "/src/assets/table_single.png",
    width: 1,
    placeable: true,
  },
  table_l: {
    id: "table_l",
    name: "table_l",
    spritePath: "/src/assets/table_l.png",
    width: 1,
    placeable: false, // part of table_triple
  },
  table_m: {
    id: "table_m",
    name: "table_m",
    spritePath: "/src/assets/table_m.png",
    width: 1,
    placeable: false, // part of table_triple
  },
  table_r: {
    id: "table_r",
    name: "table_r",
    spritePath: "/src/assets/table_r.png",
    width: 1,
    placeable: false, // part of table_triple
  },
  window_single_a: {
    id: "window_single_a",
    name: "window_single_a",
    spritePath: "/src/assets/window_single_a.png",
    width: 1,
    placeable: false, // top wall only
  },
  window_double_a: {
    id: "window_double_a",
    name: "window_double_a",
    spritePath: "/src/assets/window_double_a.png",
    width: 2,
    placeable: false, // top wall only, spans 2 tiles
  },
  window_double_b: {
    id: "window_double_b",
    name: "window_double_b",
    spritePath: "/src/assets/window_double_b.png",
    width: 2,
    placeable: false, // top wall only, spans 2 tiles
  },
  cat: {
    id: "cat",
    name: "cat",
  spritePath: "/src/assets/cat-1.png",
    width: 1,
    placeable: true,
  },
};

// Obstacle types that can be placed on the top wall (y === 0) in builder; click cycles through these.
export const WALL_DECOR_TYPES: ObstacleId[] = [
  "window_single_a",
  "window_double_a",
  "window_double_b",
  "shelf_a",
  "shelf_b",
];

export function isWallDecorType(type: ObstacleId): boolean {
  return (WALL_DECOR_TYPES as readonly ObstacleId[]).includes(type);
}

export const CUSTOMERS: Record<CustomerId, CustomerConfig> = {
  A: {
    id: "A",
    name: "customer_a",
    spritePath: "/src/assets/customer_a.png",
  },
  B: {
    id: "B",
    name: "customer_b",
    spritePath: "/src/assets/customer_b.png",
  },
  C: {
    id: "C",
    name: "customer_c",
    spritePath: "/src/assets/customer_c.png",
  },
};

// includes special cases

export type DecorKind = "table_triple" | ObstacleId;

// ADD HERE IF BUILDER MODE PLACEABLE
export const PLACEABLE_DECOR: DecorKind[] = [
  "plant_a",
  "plant_b",
  "plant_two",
  "bookshelf",
  "stool",
  "chair_l",
  "chair_r",
  "table_single",
  "cat"
];

export const ALL_DRINK_IDS: DrinkId[] = Object.keys(DRINKS) as DrinkId[];
export const ALL_CUSTOMER_IDS: CustomerId[] = Object.keys(CUSTOMERS) as CustomerId[];
export const ALL_OBSTACLE_IDS: ObstacleId[] = Object.keys(OBSTACLES) as ObstacleId[];

export interface LoadedSprites {
  // dinks and food
  drinks: Record<DrinkId, HTMLImageElement>;
  drinkItems: Record<DrinkId, HTMLImageElement>;
  drinkPressed: HTMLImageElement;

  obstacles: Record<ObstacleId, HTMLImageElement>;

  customers: Record<CustomerId, HTMLImageElement>;
}

// load all sprites

export async function loadAllSprites(): Promise<LoadedSprites> {
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

// load drinks

  const drinkPromises = Object.entries(DRINKS).map(async ([id, config]) => {
    const img = await loadImage(config.spritePath);
    return [id, img] as const;
  });

  const drinkItemPromises = Object.entries(DRINKS).map(async ([id, config]) => {
    const img = await loadImage(config.itemSpritePath);
    return [id, img] as const;
  });

  const obstaclePromises = Object.entries(OBSTACLES).map(async ([id, config]) => {
    const img = await loadImage(config.spritePath);
    return [id, img] as const;
  });

  const customerPromises = Object.entries(CUSTOMERS).map(async ([id, config]) => {
    const img = await loadImage(config.spritePath);
    return [id, img] as const;
  });

  const drinkPressed = await loadImage("/src/assets/drink_pressed.png");

  const [drinkResults, drinkItemResults, obstacleResults, customerResults] =
    await Promise.all([
      Promise.all(drinkPromises),
      Promise.all(drinkItemPromises),
      Promise.all(obstaclePromises),
      Promise.all(customerPromises),
    ]);

  return {
    drinks: Object.fromEntries(drinkResults) as Record<DrinkId, HTMLImageElement>,
    drinkItems: Object.fromEntries(drinkItemResults) as Record<DrinkId, HTMLImageElement>,
    drinkPressed,
    obstacles: Object.fromEntries(obstacleResults) as Record<ObstacleId, HTMLImageElement>,
    customers: Object.fromEntries(customerResults) as Record<CustomerId, HTMLImageElement>,
  };
}

export function getDrinkConfig(id: DrinkId): DrinkConfig {
  return DRINKS[id];
}

export function getObstacleConfig(id: ObstacleId): ObstacleConfig {
  return OBSTACLES[id];
}

export function getCustomerConfig(id: CustomerId): CustomerConfig {
  return CUSTOMERS[id];
}

export function getDecorWidth(kind: DecorKind): number {
  if (kind === "plant_two") return 2;
  if (kind === "table_triple") return 3;
  if (kind === "window_double_a" || kind === "window_double_b") return 2;
  return 1;
}

export function isMultiTileDecor(kind: DecorKind): boolean {
  return kind === "plant_two" || kind === "table_triple" || kind === "window_double_a" || kind === "window_double_b";
}
