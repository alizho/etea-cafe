import { type Pos } from "./engine/types";
import type { GameState } from "./engine/game";
import { TILE_SIZE } from "./config/constants";

// sprites
const pathH = new Image();
pathH.src = "/src/assets/path_h.png";

const pathHAlt = new Image();
pathHAlt.src = "/src/assets/path_h_alt.png";

const pathV = new Image();
pathV.src = "/src/assets/path_v.png";

const pathVAlt = new Image();
pathVAlt.src = "/src/assets/path_v_alt.png";

const pathCornerLD = new Image();
pathCornerLD.src = "/src/assets/path_corner_ld.png";

const pathCornerLDAlt = new Image();
pathCornerLDAlt.src = "/src/assets/path_corner_ld_alt.png";

const pathButt = new Image();
pathButt.src = "/src/assets/path_butt.png";

const pathButtAlt = new Image();
pathButtAlt.src = "/src/assets/path_butt_alt.png";

const pathArrow = new Image();
pathArrow.src = "/src/assets/path_arrow.png";

const pathArrowAlt = new Image();
pathArrowAlt.src = "/src/assets/path_arrow_alt.png";

export const pathImagesLoaded = Promise.all([
  new Promise<void>((resolve) => {
    pathH.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathHAlt.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathV.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathVAlt.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathCornerLD.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathCornerLDAlt.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathButt.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathButtAlt.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathArrow.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    pathArrowAlt.onload = () => resolve();
  }),
]);

type Direction = "left" | "right" | "up" | "down";

function getDirection(from: Pos, to: Pos): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  if (dy > 0) return "down";
  if (dy < 0) return "up";
  return null;
}

function isOppositeDirection(
  dirFrom: Direction | null,
  dirTo: Direction | null,
  path: Pos[],
  i: number,
): boolean {
  if (!dirFrom || !dirTo) return false;

  const isVerticalBacktrack =
    (dirFrom === "down" && dirTo === "up") ||
    (dirFrom === "up" && dirTo === "down");
  const isHorizontalBacktrack =
    (dirFrom === "left" && dirTo === "right") ||
    (dirFrom === "right" && dirTo === "left");

  // back tracking if we r going straight in one direction then reversing
  // are previous and next movements on the same axis
  if (i > 0 && i < path.length - 1) {
    const pos = path[i];
    const prev = path[i - 1];
    const next = path[i + 1];
    const prevDx = pos.x - prev.x;
    const prevDy = pos.y - prev.y;
    const nextDx = next.x - pos.x;
    const nextDy = next.y - pos.y;

    const prevIsVertical = prevDx === 0;
    const nextIsVertical = nextDx === 0;
    const prevIsHorizontal = prevDy === 0;
    const nextIsHorizontal = nextDy === 0;

    // show butt block if we're backtracking on the same axis in a straight line
    if (isVerticalBacktrack && prevIsVertical && nextIsVertical) {
      return true;
    } else if (isHorizontalBacktrack && prevIsHorizontal && nextIsHorizontal) {
      return true;
    }
  } else {
    //opposite check if fisrt or last tile
    return isVerticalBacktrack || isHorizontalBacktrack;
  }

  return false;
}

export type PathTint = { r: number; g: number; b: number };

// default blue tint #85b6d7
export const PATH_TINT_BLUE: PathTint = { r: 133, g: 182, b: 215 };
// green tint for optimal path
export const PATH_TINT_GREEN: PathTint = { r: 100, g: 190, b: 120 };

export function renderPath(
  ctx: CanvasRenderingContext2D,
  tempCtx: CanvasRenderingContext2D,
  state: GameState,
  animationFrame: number,
  tint: PathTint = PATH_TINT_BLUE,
): void {
  const { path, stepIndex } = state;
  const pathLength = path.length;
  const lastIndexToDraw =
    state.status === "idle" && pathLength > 0 ? pathLength - 1 : pathLength;

  for (let i = 0; i < lastIndexToDraw; i++) {
    if (i <= stepIndex) continue;
    const pos = path[i];
    const px = pos.x * TILE_SIZE;
    const py = pos.y * TILE_SIZE;

    // calculate gradient: newest segment (highest index) = white, oldest (lowest index) = tint color
    const gradientValue =
      pathLength > 1 ? (pathLength - 1 - i) / (pathLength - 1) : 1;

    // determine direction from previous to current, and current to next
    let dirFrom: Direction | null = null;
    let dirTo: Direction | null = null;

    if (i > 0) {
      dirFrom = getDirection(path[i - 1], pos);
    }

    if (i < path.length - 1) {
      dirTo = getDirection(pos, path[i + 1]);
    }

    // gradient color from tint parameter
    const targetR = tint.r;
    const targetG = tint.g;
    const targetB = tint.b;
    const r = Math.round(255 - (255 - targetR) * gradientValue);
    const g = Math.round(255 - (255 - targetG) * gradientValue);
    const b = Math.round(255 - (255 - targetB) * gradientValue);

    // clear temp canvas
    tempCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

    // opposite direction check
    const oppositeDir = isOppositeDirection(dirFrom, dirTo, path, i);

    if (dirFrom && dirTo && dirFrom !== dirTo && !oppositeDir) {
      // corner - rotate sprite based on corner type
      tempCtx.save();
      tempCtx.translate(TILE_SIZE / 2, TILE_SIZE / 2);

      // rotation angle based on corner type
      let rotation = 0;
      if (dirFrom === "right" && dirTo === "down") rotation = 0;
      else if (dirFrom === "up" && dirTo === "left") rotation = 0;
      else if (dirFrom === "down" && dirTo === "right") rotation = 180;
      else if (dirFrom === "left" && dirTo === "up") rotation = 180;
      else if (dirFrom === "right" && dirTo === "up") rotation = 90;
      else if (dirFrom === "down" && dirTo === "left") rotation = 90;
      else if (dirFrom === "left" && dirTo === "down") rotation = 270;
      else if (dirFrom === "up" && dirTo === "right") rotation = 270;

      const cornerSprite =
        animationFrame === 0 ? pathCornerLD : pathCornerLDAlt;
      tempCtx.rotate((rotation * Math.PI) / 180);
      tempCtx.drawImage(
        cornerSprite,
        -TILE_SIZE / 2,
        -TILE_SIZE / 2,
        TILE_SIZE,
        TILE_SIZE,
      );
      tempCtx.restore();
    } else if (oppositeDir) {
      // backtracking on same axis
      tempCtx.save();
      tempCtx.translate(TILE_SIZE / 2, TILE_SIZE / 2);

      // rotation based on direction we're coming from
      let rotation = 0;
      if (dirFrom === "down")
        rotation = 0; // down down up
      else if (dirFrom === "up")
        rotation = 180; // up up down
      else if (dirFrom === "left")
        rotation = 90; // left left right
      else if (dirFrom === "right") rotation = 270; // right right left

      const buttSprite = animationFrame === 0 ? pathButt : pathButtAlt;
      tempCtx.rotate((rotation * Math.PI) / 180);
      tempCtx.drawImage(
        buttSprite,
        -TILE_SIZE / 2,
        -TILE_SIZE / 2,
        TILE_SIZE,
        TILE_SIZE,
      );
      tempCtx.restore();
    } else if (dirTo) {
      // direction to next tile
      if (dirTo === "left" || dirTo === "right") {
        const hSprite = animationFrame === 0 ? pathH : pathHAlt;
        tempCtx.drawImage(hSprite, 0, 0, TILE_SIZE, TILE_SIZE);
      } else {
        const vSprite = animationFrame === 0 ? pathV : pathVAlt;
        tempCtx.drawImage(vSprite, 0, 0, TILE_SIZE, TILE_SIZE);
      }
    } else if (dirFrom) {
      // direction from previous
      if (dirFrom === "left" || dirFrom === "right") {
        const hSprite = animationFrame === 0 ? pathH : pathHAlt;
        tempCtx.drawImage(hSprite, 0, 0, TILE_SIZE, TILE_SIZE);
      } else {
        const vSprite = animationFrame === 0 ? pathV : pathVAlt;
        tempCtx.drawImage(vSprite, 0, 0, TILE_SIZE, TILE_SIZE);
      }
    } else {
      // horizontal
      const hSprite = animationFrame === 0 ? pathH : pathHAlt;
      tempCtx.drawImage(hSprite, 0, 0, TILE_SIZE, TILE_SIZE);
    }

    // apply gradient tint only to sprite pixels with alpha > 0
    const imageData = tempCtx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    const data = imageData.data;

    // apply multiply blend to tint only non-transparent pixels
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = Math.floor((data[i] * r) / 255); // R
        data[i + 1] = Math.floor((data[i + 1] * g) / 255); // G
        data[i + 2] = Math.floor((data[i + 2] * b) / 255); // B
      }
    }

    // put the tinted image data back
    tempCtx.putImageData(imageData, 0, 0);

    // draw tinted sprite
    ctx.drawImage(tempCtx.canvas, px, py);
  }
}

export function renderPathArrow(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  animationFrame: number,
): void {
  const { path } = state;

  // draw path arrow on the last tile (current point user is on)
  if (path.length > 0 && state.status === "idle") {
    const lastIndex = path.length - 1;
    const lastPos = path[lastIndex];
    const arrowX = lastPos.x * TILE_SIZE;
    const arrowY = lastPos.y * TILE_SIZE;

    // determine direction based on last movement
    let arrowRotation = 0;
    if (path.length > 1) {
      const prevPos = path[lastIndex - 1];
      const dir = getDirection(prevPos, lastPos);

      if (dir === "right")
        arrowRotation = 270; // right
      else if (dir === "left")
        arrowRotation = 90; // left
      else if (dir === "down")
        arrowRotation = 0; // down
      else if (dir === "up") arrowRotation = 180; // up
    } else {
      arrowRotation = 0;
    }

    // draw arrow sprite with rotation
    ctx.save();
    ctx.translate(arrowX + TILE_SIZE / 2, arrowY + TILE_SIZE / 2);
    ctx.rotate((arrowRotation * Math.PI) / 180);
    const arrowSprite = animationFrame === 0 ? pathArrow : pathArrowAlt;
    ctx.drawImage(
      arrowSprite,
      -TILE_SIZE / 2,
      -TILE_SIZE / 2,
      TILE_SIZE,
      TILE_SIZE,
    );
    ctx.restore();
  }
}
