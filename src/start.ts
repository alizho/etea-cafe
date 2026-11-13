import { showTutorialIfFirstVisit } from './menu';
import { isTutorialRoute } from './tutorial';

// "click to enter" screen shown over the daily puzzle at "/". the game keeps loading
// behind it; entering removes the overlay and, on a first visit, opens the
// "try tutorial / skip tutorial" popup. the click also counts as the user gesture
// browsers need before they'll play music.

const OPEN_CLASS = 'start-screen-open';

let overlay: HTMLElement | null = null;
const closeListeners: (() => void)[] = [];

// tutorial lessons and shared level links (#token) go straight to the game
export function shouldShowStartScreen(): boolean {
  return !isTutorialRoute() && !window.location.hash.slice(1);
}

export function isStartScreenOpen(): boolean {
  return overlay !== null;
}

export function onStartScreenClose(fn: () => void): void {
  if (overlay) closeListeners.push(fn);
}

function enter(): void {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  document.body.classList.remove(OPEN_CLASS);
  document.getElementById('root')?.removeAttribute('inert');
  document.removeEventListener('keydown', onKeydown);
  closeListeners.splice(0).forEach((fn) => fn());
  showTutorialIfFirstVisit();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
  e.preventDefault();
  enter();
}

export function showStartScreen(): void {
  if (overlay) return;
  const verb = window.matchMedia('(hover: none)').matches ? 'tap' : 'click';

  const btn = document.createElement('button');
  btn.type = 'button';
  overlay = btn;
  overlay.className = 'start-screen';
  overlay.setAttribute('aria-label', `etea cafe, ${verb} to enter`);
  overlay.innerHTML =
    `<img src="/img/logo.gif" alt="" class="start-logo" />` +
    `<span class="start-glorbo" aria-hidden="true"></span>` +
    `<span class="start-enter">${verb} to enter</span>`;
  overlay.addEventListener('click', enter);

  document.body.appendChild(overlay);
  document.body.classList.add(OPEN_CLASS);
  document.getElementById('root')?.setAttribute('inert', '');
  document.addEventListener('keydown', onKeydown);
  overlay.focus();
}
