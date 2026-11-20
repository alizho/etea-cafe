import { loadAllSprites, type LoadedSprites } from '../config/items';
import { pathImagesLoaded } from '../paths';

// store loaded sprites
export let sprites: LoadedSprites;

const pending: Promise<void>[] = [];

function image(src: string, waitForLoad = true): HTMLImageElement {
  const img = new Image();
  img.src = src;
  if (waitForLoad) {
    pending.push(
      new Promise<void>((resolve) => {
        img.onload = () => resolve();
      })
    );
  }
  return img;
}

// wall and ui cuz they static
export const floorOpen = image('/img/floor_open.png');

export const wallTop = image('/img/wall_top.png');
export const wallBot = image('/img/wall_bot.png');
export const wallLeftTop = image('/img/wall_left_top.png');
export const wallLeftMid = image('/img/wall_left_mid.png');
export const wallLeftBot = image('/img/wall_left_bot.png');
export const wallLeftCorner = image('/img/wall_left_corner.png');
export const wallRightTop = image('/img/wall_right_top.png');
export const wallRightMid = image('/img/wall_right_mid.png');
export const wallRightBot = image('/img/wall_right_bot.png');
export const wallRightCorner = image('/img/wall_right_corner.png');

export const glorboSpriteSheet = image('/img/glorbo_sprite_sheet.png');
export const catAltSprite = image('/img/cat-2.png', false);

export const hoverSprite = image('/img/hover.png');
export const hoverHammerSprite = image('/img/hover-hammer.png');
export const hoverDragSprite = image('/img/hover-drag.png');
export const hoverNopeSprite = image('/img/hover_nope.png');
export const hoverYepSprite = image('/img/hover_yep.png');

export const standHere = image('/img/stand_here.png');
export const spillSprite = image('/img/spill.png');

// load dynamic stuff
export const imagesLoaded = Promise.all([
  loadAllSprites().then((loaded) => {
    sprites = loaded;
  }),
  pathImagesLoaded,
  ...pending,
]);
