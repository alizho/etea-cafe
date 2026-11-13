import { inject } from '@vercel/analytics';
import { type Pos } from './engine/types';
import { clearPath, initGame } from './engine/game';
import { buildLevel } from './levels/loader';
import { getFirstLevelFromSupabase } from './levels/daily';
import {
  submitRun,
  getPlayerId,
  getBestScoreFromStorage,
  setBestScoreInStorage,
  hasRunInDatabase,
} from './supabase/api';
import { showSuccessPopup, hideSuccessPopup } from './popup';
import type { LevelData } from './levels/level.schema';
import { validateLevelData } from './levels/validate';
import { solveLevel } from './engine/solver';
import { ensureAudioStartedOnFirstGesture, startBackgroundMusic } from './audio';
import { initMenu, showTutorialIfFirstVisit, markTutorialSeen, OPEN_TUTORIAL_EVENT } from './menu';
import {
  shouldShowStartScreen,
  showStartScreen,
  isStartScreenOpen,
  onStartScreenClose,
} from './start';
import {
  TUTORIAL_LESSONS,
  isTutorialRoute,
  getLessonIndexFromUrl,
  setLessonInUrl,
  showTutorialBanner,
  hideTutorialBanner,
  setFailureMessage,
  showTutorialSuccess,
  hideTutorialSuccess,
  showOrdersCallout,
  hideOrdersCallout,
  nudgeOrdersCallout,
  showCursorTooltip,
  hideCursorTooltip,
} from './tutorial';
import { initGuide, refreshGuide, setGuideLesson } from './guide';
import { decodeLevelShareToken, getShareTokenFromUrlHash } from './share';
import { imagesLoaded, sprites } from './render/images';
import { getCustomerIconDataUrl } from './render/draw';
import { GameRenderer } from './render/renderer';
import { initBuilder, setBuilderToolIcons } from './builder/builder';
import { cloneLevel } from './util/grid';
import { scatterDecorations } from './ui/decor';
import { playClickSound } from './ui/sfx';
import './style.css';

type PlayMode = 'shared' | 'daily' | 'custom' | 'tutorial';

let renderer!: GameRenderer;
let builder!: ReturnType<typeof initBuilder>;
let dayTextEl: HTMLElement | null = null;

let dailyLevelData!: LevelData;
let dailyLevelId: string | null = null;
let currentLevelData!: LevelData;
// store level ID for submitting runs
let currentLevelId: string | null = null;
let dayNumber = 1;
let currentMode: PlayMode = 'daily';
let tutorialIndex = 0;

const dayNumberFromId = (id: string | undefined) => {
  const m = id?.match(/day-(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
};

// banner changes the available height, so refit the canvas
const refitCanvas = () => window.dispatchEvent(new Event('resize'));

async function decodeSharedLevel(token: string) {
  const decoded = await decodeLevelShareToken(token);
  const validation = decoded ? validateLevelData(decoded) : null;
  const ok = !!decoded && !!validation && validation.ok;
  return { decoded, validation, ok };
}

function modeLabel(mode: PlayMode): string {
  if (mode === 'tutorial') return 'tutorial';
  if (mode === 'shared') return 'shared level';
  if (mode === 'custom') return 'your level';
  return `level ${dayNumber}`;
}

function setDayText(mode: PlayMode) {
  currentMode = mode;
  renderer.setHighlightRunWhenReady(mode === 'tutorial');
  if (mode !== 'tutorial') {
    hideTutorialBanner();
    hideTutorialSuccess();
    hideCallout();
    setFailureMessage(null);
    setGuideLesson(null);
    // left the tutorial (levels menu, builder...), so a refresh shouldn't drop you back in
    if (isTutorialRoute()) history.replaceState(null, '', '/' + window.location.hash);
  }
  if (dayTextEl) dayTextEl.textContent = modeLabel(mode);
}

function applyLevelDataToRenderer(data: LevelData, id: string | null, mode: PlayMode) {
  hideSuccessPopup();
  renderer.hideFailurePopup();

  currentLevelData = cloneLevel(data);
  currentLevelId = id;
  renderer.setLevelId(currentLevelId);
  renderer.setState(initGame(buildLevel(currentLevelData)));
  renderer.playIntroAnimation();
  setDayText(mode);
}

// ── tutorial lessons: tiny levels at /tutorial, no scores submitted ──

function showCallout() {
  const shown = showOrdersCallout(() => {
    hideCursorTooltip();
    renderer.setInputLocked(false);
    refreshGuide(); // start the ghost path + glorbo outline now that drawing is allowed
  });
  renderer.setInputLocked(shown, (x, y) => {
    nudgeOrdersCallout();
    showCursorTooltip('look at your order!', x, y);
  });
}

function hideCallout() {
  hideOrdersCallout();
  hideCursorTooltip();
  renderer.setInputLocked(false);
}

// lessons are static, so solve each one once
const tutorialParCache = new Map<number, number | undefined>();
function getTutorialPar(index: number): number | undefined {
  if (tutorialParCache.has(index)) return tutorialParCache.get(index);
  const lesson = TUTORIAL_LESSONS[index];
  let par: number | undefined;
  if (lesson?.showPar) {
    const result = solveLevel(buildLevel(lesson.data));
    par = result.solvable ? result.path.length - 1 : undefined;
  }
  tutorialParCache.set(index, par);
  return par;
}

function showLessonChrome(index: number) {
  const lesson = TUTORIAL_LESSONS[index];
  showTutorialBanner(index, getTutorialPar(index));
  setFailureMessage(lesson.failText);
  setLessonInUrl(index);
  setGuideLesson(lesson);
}

function loadTutorialLesson(index: number) {
  tutorialIndex = index;
  applyLevelDataToRenderer(TUTORIAL_LESSONS[index].data, null, 'tutorial');
  showLessonChrome(index);
  if (TUTORIAL_LESSONS[index].pointAtOrders) showCallout();
  else hideCallout();
}

// ── in-app navigation between the daily puzzle and /tutorial ──
// swapping the level in place instead of a full page load, so nothing has to rebuild

function enterTutorial(index: number) {
  markTutorialSeen();
  // the builder can't stay open over a lesson
  builder.forceExit();
  loadTutorialLesson(index);
  refitCanvas();
}

function enterDaily() {
  dayNumber = dayNumberFromId(dailyLevelData.id);
  applyLevelDataToRenderer(dailyLevelData, dailyLevelId, 'daily');
  refitCanvas();
}

function openTutorial() {
  const menuPanel = document.getElementById('menu-panel');
  if (menuPanel) {
    menuPanel.style.display = 'none';
    menuPanel.classList.remove('menu-panel--first-visit');
  }
  history.pushState(null, '', '/tutorial?lesson=1');
  enterTutorial(0);
}

function setupTutorialNavigation() {
  // any plain click on a link to /tutorial (welcome popup)
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href="/tutorial"]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openTutorial();
  });

  // hamburger menu "tutorial" item
  window.addEventListener(OPEN_TUTORIAL_EVENT, openTutorial);

  // browser back / forward between the two
  window.addEventListener('popstate', () => {
    if (isTutorialRoute()) enterTutorial(getLessonIndexFromUrl());
    else if (currentMode === 'tutorial') enterDaily();
  });
}

function handleTutorialSuccess(moves: number) {
  showTutorialSuccess({
    index: tutorialIndex,
    moves,
    par: getTutorialPar(tutorialIndex),
    onNext: () => {
      if (tutorialIndex >= TUTORIAL_LESSONS.length - 1) {
        history.pushState(null, '', '/');
        enterDaily();
      } else {
        loadTutorialLesson(tutorialIndex + 1);
      }
    },
    onRetry: () => loadTutorialLesson(tutorialIndex),
  });
}

// submit run and show top score
async function handleSuccess(moves: number) {
  if (currentMode === 'tutorial') {
    handleTutorialSuccess(moves);
    return;
  }
  // compute optimal path via BFS solver
  let optimalMoves: number | undefined;
  let optimalPath: Pos[] | undefined;
  try {
    const result = solveLevel(buildLevel(currentLevelData));
    if (result.solvable) {
      optimalMoves = result.path.length - 1; // path includes start position
      optimalPath = result.path;
    }
  } catch (e) {
    console.error('Error computing optimal path:', e);
  }

  const viewOptimalCallback = optimalPath
    ? () => renderer.showOptimalPath(optimalPath!)
    : undefined;

  let isFirst = false;

  // show success popup on every playthrough
  const showPopup = () => {
    const hideLeaderboard = currentMode !== 'daily';
    const path = renderer.getPath();
    const { width, height } = renderer.getLevelDimensions();
    showSuccessPopup(
      dayNumber,
      moves,
      currentLevelId,
      path,
      width,
      height,
      optimalMoves,
      viewOptimalCallback,
      hideLeaderboard,
      isFirst
    );
  };

  try {
    if (currentLevelId) {
      const playerId = getPlayerId();
      const storedBest = getBestScoreFromStorage(currentLevelId);
      const isNewBest = storedBest === null || moves < storedBest;

      // check if player already has a run in database for this level
      const hasExistingRun = await hasRunInDatabase(currentLevelId, playerId);
      if (!hasExistingRun) {
        await submitRun(currentLevelId, playerId, moves, true);
        isFirst = true;
      }

      if (isNewBest) {
        setBestScoreInStorage(currentLevelId, moves);
        // update UI to show new best score
        renderer.updateBestScoreDisplay();
      }
    }

    showPopup();
  } catch (error) {
    console.error('Error submitting run:', error);
    // still show popup even if API call fails
    showPopup();
  }
}

async function applyFromHash() {
  const token = getShareTokenFromUrlHash();
  if (token) {
    const { decoded, validation, ok } = await decodeSharedLevel(token);
    if (ok) {
      builder.forceExit();
      applyLevelDataToRenderer(decoded as LevelData, null, 'shared');
      return;
    }

    console.warn('Invalid share link', validation && !validation.ok ? validation.errors : decoded);
    const s = renderer.getState();
    renderer.setState({ ...s, message: 'invalid share link' });
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  builder.forceExit();
  applyLevelDataToRenderer(dailyLevelData, dailyLevelId, 'daily');
}

function resetPath() {
  renderer.hideFailurePopup();
  renderer.setState(clearPath(renderer.getState()));
}

function setupPlayButtons() {
  document.getElementById('run-btn')?.addEventListener('click', () => {
    const currentState = renderer.getState();
    if (currentState.status !== 'idle') return;
    renderer.hideFailurePopup();
    renderer.setState({
      ...currentState,
      status: 'running' as const,
      message: 'running...',
    });
  });

  document.getElementById('retry-btn')?.addEventListener('click', () => {
    if (renderer.getState().status === 'running') return;
    resetPath();
  });

  // setup popup retry button
  document.getElementById('popup-retry-btn')?.addEventListener('click', resetPath);

  // setup success popup close button
  document.getElementById('success-popup-close-btn')?.addEventListener('click', () => {
    hideSuccessPopup();
  });
}

// initialize game
async function init() {
  const tutorialRoute = isTutorialRoute();
  if (tutorialRoute) markTutorialSeen();
  // the start screen handles first visits itself (tutorial is its primary button then)
  else if (shouldShowStartScreen()) showStartScreen();
  else showTutorialIfFirstVisit();
  ensureAudioStartedOnFirstGesture();
  void startBackgroundMusic();
  await imagesLoaded;

  setBuilderToolIcons();

  const { levelData, levelId } = await getFirstLevelFromSupabase();
  dailyLevelData = levelData;
  dailyLevelId = levelId;

  // url hash? shared level time
  const sharedToken = getShareTokenFromUrlHash();
  const shared = sharedToken ? await decodeSharedLevel(sharedToken) : null;
  const hasSharedLevel = !!shared?.ok;

  tutorialIndex = tutorialRoute ? getLessonIndexFromUrl() : 0;
  const initialLevelData = tutorialRoute
    ? TUTORIAL_LESSONS[tutorialIndex].data
    : hasSharedLevel
      ? (shared!.decoded as LevelData)
      : levelData;

  currentLevelData = cloneLevel(initialLevelData);
  currentLevelId = tutorialRoute || hasSharedLevel ? null : levelId;
  dayNumber = dayNumberFromId(levelData.id);
  currentMode = tutorialRoute ? 'tutorial' : hasSharedLevel ? 'shared' : 'daily';

  // setup day text
  dayTextEl = document.getElementById('day-text');
  if (dayTextEl) dayTextEl.textContent = modeLabel(hasSharedLevel ? 'shared' : 'daily');

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('no canvas found');

  renderer = new GameRenderer(canvas, initGame(buildLevel(initialLevelData)));
  renderer.setLevelId(currentLevelId);

  // thanks pops, order linking, failure details, tutorial highlights (src/guide.ts)
  initGuide({
    renderer,
    canvas,
    customerIcon: (id) => getCustomerIconDataUrl(sprites.customers[id], 2),
    itemIcon: (id) => sprites.drinkItems[id]?.src ?? '',
  });

  if (tutorialRoute) {
    setDayText('tutorial');
    showLessonChrome(tutorialIndex);
    refitCanvas();
    if (TUTORIAL_LESSONS[tutorialIndex].pointAtOrders) showCallout();
  }

  setupTutorialNavigation();

  renderer.setOnSuccess(handleSuccess);

  builder = initBuilder({
    renderer,
    canvas,
    getLevelData: () => currentLevelData,
    onEnter: () => setDayText('custom'),
    onExit: (data) => {
      currentLevelId = null;
      renderer.setLevelId(null);
      currentLevelData = data;
      renderer.setState(initGame(buildLevel(currentLevelData)));
      setDayText('custom');
    },
  });

  window.addEventListener('hashchange', () => {
    void applyFromHash();
  });

  setupPlayButtons();

  // init hamburger menu
  initMenu();

  // listen for level loads from the menu
  document.addEventListener('loadLevel', ((e: CustomEvent) => {
    const { levelData: ld, levelId: lid } = e.detail;
    builder.forceExit();
    dayNumber = dayNumberFromId((ld as LevelData).id);
    applyLevelDataToRenderer(ld as LevelData, lid as string, 'daily');
  }) as EventListener);

  // initial render and orders display
  renderer.playIntroAnimation();
  renderer.updateUI();

  // the intro played hidden behind the start screen, so replay it when entering reveals the board
  if (isStartScreenOpen()) {
    onStartScreenClose(() => renderer.playIntroAnimation());
  }
}

inject();

document.addEventListener('DOMContentLoaded', () => {
  scatterDecorations();
  const buttons = document.querySelectorAll('.game-button');
  buttons.forEach((button) => {
    button.addEventListener('click', playClickSound);
  });
});

init().catch(console.error);
