import { toggleAudio, getAudioEnabled } from './audio';
import { getLevelHistory, getLevelByDate, getTodayDateEST } from './supabase/api';
import type { LevelData } from './levels/level.schema';

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
    menuPanel.style.display = 'flex';
    closeMenu();
  };

  const hidePanel = () => {
    if (!menuPanel) return;
    menuPanel.style.display = 'none';
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
      if (e.target === menuPanel) hidePanel();
    });
  }

  /* ── escape key ── */

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (menuPanel && menuPanel.style.display !== 'none') {
        hidePanel();
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
        case 'past-puzzles':
          showPanel(
            `<h3 class="menu-panel-title">puzzles</h3>` +
              `<p class="menu-panel-text">loading...</p>`
          );
          void loadPastPuzzles();
          break;

        case 'builder':
          closeMenu();
          document.getElementById('builder-btn')?.click();
          break;

        case 'tutorial':
          showPanel(
            `<h3 class="menu-panel-title">how to play</h3>` +
              `<p class="menu-panel-text">click and drag to draw a path from glorbo.</p>` +
              `<p class="menu-panel-text">make sure you serve everyone their order by stepping on the items they want before you reach them.</p>` +
              `<p class="menu-panel-text">you can only hold 2 items at a time.</p>` +
              `<p class="menu-panel-text">press run to see if you served everyone their order.</p>` +
              `<p class="menu-panel-text">try to find the shortest path possible.</p>` +
              `<p class="menu-panel-text">have fun!</p>`
          );
          break;

        case 'settings':
          showPanel(buildSettingsHTML());
          attachSettingsListeners();
          break;

        case 'about':
          showPanel(
            `<h3 class="menu-panel-title">about</h3>` +
              `<p class="menu-panel-text">this game was made with &lt;3 by <a href="https://jam.ms" target="_blank" rel="noopener" class="menu-link">jamms</a></p>` +
              `<p class="menu-panel-text">inspired by <a href="https://enclose.horse" target="_blank" rel="noopener" class="menu-link">enclose.horse</a></p>` +
              `<p class="menu-panel-text"><a href="https://store.steampowered.com/app/3085040/ETea/" target="_blank" rel="noopener" class="menu-link">wishlist etea on steam!</a></p>`
          );
          break;
      }
    });
  });

  /* ── settings helpers ── */

  function buildSettingsHTML(): string {
    const enabled = getAudioEnabled();
    return (
      `<h3 class="menu-panel-title">settings</h3>` +
      `<div class="settings-row">` +
      `<span class="settings-label">audio</span>` +
      `<button id="audio-toggle-btn" class="game-button settings-toggle">${enabled ? 'on' : 'off'}</button>` +
      `</div>`
    );
  }

  function attachSettingsListeners(): void {
    const btn = document.getElementById('audio-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const newState = toggleAudio();
      btn.textContent = newState ? 'on' : 'off';
    });
  }

  /* ── past puzzles helpers ── */

  function formatDateLabel(dateStr: string): string {
    const [, month, day] = dateStr.split('-');
    const months = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
  }

  async function loadPastPuzzles(): Promise<void> {
    if (!menuPanelBody) return;

    try {
      const levels = await getLevelHistory(30);
      const today = getTodayDateEST();

      if (!levels || levels.length === 0) {
        menuPanelBody.innerHTML =
          `<h3 class="menu-panel-title">puzzles</h3>` +
          `<p class="menu-panel-text">no puzzles yet</p>`;
        return;
      }

      const listItems = levels
        .map((level) => {
          const isToday = level.date === today;
          const label = formatDateLabel(level.date);
          const todayTag = isToday ? ' <span class="puzzle-today-tag">(today)</span>' : '';
          return (
            `<button class="puzzle-list-item${isToday ? ' puzzle-list-today' : ''}"` +
            ` data-date="${level.date}" data-id="${level.id}">` +
            `${label}${todayTag}</button>`
          );
        })
        .join('');

      menuPanelBody.innerHTML =
        `<h3 class="menu-panel-title">puzzles</h3>` + `<div class="puzzle-list">${listItems}</div>`;

      menuPanelBody.querySelectorAll<HTMLElement>('.puzzle-list-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          void loadPuzzleByDate(btn.dataset.date!, btn.dataset.id!);
        });
      });
    } catch (err) {
      console.error('Failed to load puzzle history:', err);
      if (menuPanelBody) {
        menuPanelBody.innerHTML =
          `<h3 class="menu-panel-title">puzzles</h3>` +
          `<p class="menu-panel-text">couldn't load puzzles</p>`;
      }
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
