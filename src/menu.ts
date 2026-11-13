import { toggleAudio, getAudioEnabled } from './audio';
import { getLevelHistory, getLevelByDate } from './supabase/api';
import type { LevelData } from './levels/level.schema';
import { GLORBO_SHEET, spriteIcon } from './ui/icons';

const TUTORIAL_SEEN_KEY = 'tutorialSeen';

// main.ts listens for this and swaps the board to lesson 1
export const OPEN_TUTORIAL_EVENT = 'etea:open-tutorial';

const glorboSprite = spriteIcon(GLORBO_SHEET, '300%', '200%');

const panelHTML = (title: string, body: string) =>
  `<h3 class="menu-panel-title">${title}</h3>` + body;

const panelTextHTML = (title: string, text: string) =>
  panelHTML(title, `<p class="menu-panel-text">${text}</p>`);

// first visit: a short welcome that pushes the playable tutorial instead of a wall of rules
const welcomeHTML =
  `<h3 class="menu-panel-title">welcome to etea.cafe!</h3>` +
  `<p class="menu-panel-text">help glorbo ${glorboSprite} serve every customer in as few steps as you can.</p>` +
  `<p class="menu-panel-text">new here? the <span class="tutorial-hl">tutorial</span> takes about a minute.</p>`;

const firstVisitHTML =
  welcomeHTML +
  `<div class="first-visit-actions">` +
  `<a class="game-button game-button--primary" href="/tutorial">try tutorial</a>` +
  `<button type="button" class="game-button first-visit-skip-btn" data-action="skip-tutorial">skip tutorial</button>` +
  `</div>`;

const FIRST_VISIT_CLASS = 'menu-panel--first-visit';

function hideMenuPanel(menuPanel: HTMLElement): void {
  menuPanel.style.display = 'none';
  menuPanel.classList.remove(FIRST_VISIT_CLASS);
}

export function hasSeenTutorial(): boolean {
  return !!localStorage.getItem(TUTORIAL_SEEN_KEY);
}

export function markTutorialSeen(): void {
  localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
}

export function showTutorialIfFirstVisit(): void {
  if (hasSeenTutorial()) return;

  const menuPanel = document.getElementById('menu-panel');
  const menuPanelBody = document.getElementById('menu-panel-body');
  if (!menuPanel || !menuPanelBody) return;

  menuPanelBody.innerHTML = firstVisitHTML;
  menuPanel.classList.add(FIRST_VISIT_CLASS);
  menuPanel.style.display = 'flex';
  menuPanelBody
    .querySelector('[data-action="skip-tutorial"]')
    ?.addEventListener('click', () => hideMenuPanel(menuPanel));
  markTutorialSeen();
}

export function initMenu(): void {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const hamburgerMenu = document.getElementById('hamburger-menu');
  const menuPanel = document.getElementById('menu-panel');
  const menuPanelBody = document.getElementById('menu-panel-body');
  const menuPanelClose = document.getElementById('menu-panel-close');

  if (!hamburgerBtn || !hamburgerMenu) return;

  let menuOpen = false;

  const openMenu = () => {
    menuOpen = true;
    hamburgerMenu.style.display = 'flex';
    hamburgerBtn.classList.add('hamburger-btn--active');
  };

  const closeMenu = () => {
    menuOpen = false;
    hamburgerMenu.style.display = 'none';
    hamburgerBtn.classList.remove('hamburger-btn--active');
  };

  const toggleMenu = () => {
    if (menuOpen) closeMenu();
    else openMenu();
  };

  const showPanel = (html: string) => {
    if (!menuPanel || !menuPanelBody) return;
    menuPanelBody.innerHTML = html;
    menuPanel.classList.remove(FIRST_VISIT_CLASS);
    menuPanel.style.display = 'flex';
    closeMenu();
  };

  const hidePanel = () => {
    if (menuPanel) hideMenuPanel(menuPanel);
  };

  /* ── hamburger button ── */

  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  /* ── close menu on outside click ── */

  document.addEventListener('click', (e) => {
    if (menuOpen && !hamburgerMenu.contains(e.target as Node) && e.target !== hamburgerBtn) {
      closeMenu();
    }
  });

  /* ── close panel ── */

  if (menuPanelClose) {
    menuPanelClose.addEventListener('click', hidePanel);
  }

  if (menuPanel) {
    menuPanel.addEventListener('click', (e) => {
      // the first-visit welcome only closes through its buttons
      if (e.target === menuPanel && !menuPanel.classList.contains(FIRST_VISIT_CLASS)) hidePanel();
    });
  }

  /* ── escape key ── */

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (menuPanel && menuPanel.style.display !== 'none') {
        if (!menuPanel.classList.contains(FIRST_VISIT_CLASS)) hidePanel();
      } else if (menuOpen) {
        closeMenu();
      }
    }
  });

  /* ── menu item actions ── */

  const menuItems = hamburgerMenu.querySelectorAll<HTMLElement>('.menu-item');

  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;

      switch (action) {
        case 'toggle-audio': {
          const newState = toggleAudio();
          setAudioIconBoth(newState);
          break;
        }

        case 'levels':
          showPanel(panelTextHTML('levels', 'loading...'));
          void loadLevels();
          break;

        case 'builder':
          closeMenu();
          document.getElementById('builder-btn')?.click();
          break;

        case 'tutorial':
          closeMenu();
          window.dispatchEvent(new Event(OPEN_TUTORIAL_EVENT));
          break;

        case 'about':
          showPanel(
            panelHTML(
              'about',
              `<p class="menu-panel-text">this game was made with &lt;3 by <a href="https://jam.ms" target="_blank" rel="noopener" class="menu-link">jamms</a></p>` +
                `<p class="menu-panel-text">inspired by <a href="https://enclose.horse" target="_blank" rel="noopener" class="menu-link">enclose.horse</a></p>` +
                `<p class="menu-panel-text"><a href="https://store.steampowered.com/app/3085040/ETea/" target="_blank" rel="noopener" class="menu-link">wishlist etea on steam!</a></p>`
            )
          );
          break;
      }
    });
  });

  /* ── audio toggle (bottom-left + hamburger on mobile) ── */

  const audioToggles = ['audio-toggle-btn', 'audio-toggle-menu-btn'].map((id) => {
    const btn = document.getElementById(id);
    return { btn, img: btn?.querySelector<HTMLImageElement>('img') };
  });
  const [{ btn: audioToggleBtn, img: audioToggleImg }] = audioToggles;

  const setAudioIconBoth = (enabled: boolean) => {
    const base = enabled ? '/img/volume.png' : '/img/volume_mute.png';
    const src = `${base}?v=${enabled ? 'on' : 'off'}`;
    const label = enabled ? 'mute' : 'unmute';
    for (const { btn, img } of audioToggles) {
      if (img) img.src = src;
      if (btn) btn.setAttribute('aria-label', label);
    }
  };

  if (audioToggleBtn && audioToggleImg) {
    setAudioIconBoth(getAudioEnabled());
    audioToggleBtn.addEventListener('click', () => {
      const newState = toggleAudio();
      setAudioIconBoth(newState);
    });
  }

  async function loadLevels(): Promise<void> {
    if (!menuPanelBody) return;

    try {
      const levels = await getLevelHistory();

      if (!levels || levels.length === 0) {
        menuPanelBody.innerHTML = panelTextHTML('levels', 'no levels found');
        return;
      }

      const listItems = levels
        .map((level, index) => {
          const idNumber = level.id.match(/day-(\d+)/)?.[1];
          const label = `level ${idNumber ? parseInt(idNumber, 10) : index + 1}`;
          return (
            `<button class="puzzle-list-item"` +
            ` data-date="${level.date}" data-id="${level.id}">` +
            `${label}</button>`
          );
        })
        .join('');

      menuPanelBody.innerHTML = panelHTML('levels', `<div class="puzzle-list">${listItems}</div>`);

      menuPanelBody.querySelectorAll<HTMLElement>('.puzzle-list-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          void loadPuzzleByDate(btn.dataset.date!, btn.dataset.id!);
        });
      });
    } catch (err) {
      console.error('Failed to load puzzle history:', err);
      menuPanelBody.innerHTML = panelTextHTML('levels', "couldn't load levels");
    }
  }

  async function loadPuzzleByDate(date: string, _levelId: string): Promise<void> {
    try {
      const level = await getLevelByDate(date);
      if (!level || !level.json) return;

      const jsonData = Array.isArray(level.json) ? level.json[0] : level.json;
      if (!jsonData) return;

      const levelData = jsonData as LevelData;

      document.dispatchEvent(
        new CustomEvent('loadLevel', {
          detail: { levelData, levelId: level.id, date },
        })
      );

      hidePanel();
    } catch (err) {
      console.error('Failed to load puzzle:', err);
    }
  }
}
