import type { Pos } from '../engine/types';
import { TILE_SIZE } from '../config/constants';

// one column (checklist, board, orders) for phones and for anything taller than it is wide.
// keep in sync with the matching @media query at the end of style.css
const STACKED_QUERY = '(max-width: 600px), (max-aspect-ratio: 1/1)';
export function isStackedLayout(): boolean {
  return window.matchMedia(STACKED_QUERY).matches;
}

export function getTilePos(
  canvas: HTMLCanvasElement,
  levelWidthTiles: number,
  levelHeightTiles: number,
  x: number,
  y: number
): Pos | null {
  const rect = canvas.getBoundingClientRect();

  // this is cuz resizing would make things cutoff on smaller displays
  // idk if it's the best solution but
  const cssX = x - rect.left;
  const cssY = y - rect.top;

  if (rect.width <= 0 || rect.height <= 0) return null;

  const logicalW = levelWidthTiles * TILE_SIZE;
  const logicalH = levelHeightTiles * TILE_SIZE;

  const canvasX = (cssX / rect.width) * logicalW;
  const canvasY = (cssY / rect.height) * logicalH;

  const tileX = Math.floor(canvasX / TILE_SIZE);
  const tileY = Math.floor(canvasY / TILE_SIZE);

  return { x: tileX, y: tileY };
}

const heightOf = (el: Element | null) => el?.getBoundingClientRect().height ?? 0;

export function fitCanvasDisplaySize(
  canvas: HTMLCanvasElement,
  baseCanvasWidth: number,
  baseCanvasHeight: number,
  rows: number
) {
  // fit display size w current layout
  const isMobile = window.innerWidth <= 600;
  // portrait tablets / tall windows stack everything in one column (see STACKED_QUERY)
  const stacked = isStackedLayout();

  const headerH = heightOf(document.querySelector('.header'));
  const controlsH = heightOf(document.querySelector('.game-controls'));
  const inventoryH = heightOf(document.getElementById('inventory'));
  const infoH = heightOf(document.querySelector('.game-info'));

  const sidebarEl = document.querySelector('.sidebar');
  const sidebarW = stacked ? 0 : (sidebarEl?.getBoundingClientRect().width ?? 0);
  // stacked (not phone): orders sit under the board and should fit on screen too
  // (phones too now, so the orders show without scrolling when there's room)
  const sidebarH = stacked ? heightOf(sidebarEl) + 12 : 0;
  // tutorial checklist: a left column on desktop, a row above the board on mobile
  const bannerEl = document.getElementById('tutorial-banner');
  const bannerRect =
    bannerEl && bannerEl.style.display !== 'none' ? bannerEl.getBoundingClientRect() : null;
  const bannerW = !stacked && bannerRect ? bannerRect.width + 16 : 0;
  const bannerH = stacked && bannerRect ? bannerRect.height + 12 : 0;

  const logo = document.querySelector('.logo');

  const extraLogoSpace = logo && !stacked ? logo.getBoundingClientRect().height * 0.5 : 0;

  const paddingW = isMobile ? 8 : stacked ? 48 : 64;
  const paddingH = isMobile ? 16 : stacked ? 100 : 72;

  const maxW = Math.max(120, window.innerWidth - sidebarW - bannerW - paddingW);
  const maxH = Math.max(
    120,
    window.innerHeight -
      headerH -
      controlsH -
      inventoryH -
      infoH -
      bannerH -
      sidebarH -
      paddingH -
      extraLogoSpace
  );

  // stacked layouts have room to spare, so let the board grow past 1:1 there
  const maxScale = stacked && !isMobile ? 1.6 : 1;
  // stacked layouts tuck the mostly-empty bottom wall row under the hands (see --wall-row),
  // so only the visible part of the board needs to fit vertically
  const visibleH = stacked ? baseCanvasHeight * (1 - 61 / 64 / rows) : baseCanvasHeight;
  let fitScale = Math.min(maxW / baseCanvasWidth, maxH / visibleH, maxScale);
  // phones: never shrink the board below 80% of the screen width just to fit the orders
  if (isMobile) fitScale = Math.max(fitScale, Math.min((0.8 * maxW) / baseCanvasWidth, maxScale));
  const cssW = Math.max(64, Math.floor(baseCanvasWidth * fitScale));
  const cssH = Math.max(64, Math.floor(baseCanvasHeight * fitScale));

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.setProperty('--wall-row', `${Math.round((cssH / rows) * (61 / 64))}px`);
}

// desktop: line the bottom of the side columns up with the bottom of the board.
// they're flex-end aligned, so bump each one's bottom margin by however far it's off.
export function alignSideColumns(canvas: HTMLCanvasElement, rows: number) {
  // the bottom wall row is mostly empty (only its top 3px edge is drawn), so aim for the visible edge
  const canvasRect = canvas.getBoundingClientRect();
  const boardBottom = canvasRect.bottom - (canvasRect.height / rows) * (61 / 64);
  const cols = document.querySelectorAll<HTMLElement>(
    '.game-container > .sidebar, .game-container > .tutorial-banner'
  );
  const desktop = !isStackedLayout();
  cols.forEach((col) => {
    if (!desktop || col.style.display === 'none') {
      col.style.marginBottom = '';
      return;
    }
    const current = parseFloat(getComputedStyle(col).marginBottom) || 0;
    // orders column: line up the last order card, not the list's trailing margin
    const anchor = col.matches('.sidebar')
      ? (Array.from(col.querySelectorAll<HTMLElement>('#orders .order-item')).pop() ?? col)
      : col;
    const off = anchor.getBoundingClientRect().bottom - boardBottom;
    col.style.marginBottom = `${Math.max(0, Math.round(current + off))}px`;
  });
}
