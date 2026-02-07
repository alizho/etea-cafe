import { toggleAudio, getAudioEnabled } from "./audio";

export function initMenu(): void {
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const hamburgerMenu = document.getElementById("hamburger-menu");
  const menuPanel = document.getElementById("menu-panel");
  const menuPanelBody = document.getElementById("menu-panel-body");
  const menuPanelClose = document.getElementById("menu-panel-close");

  if (!hamburgerBtn || !hamburgerMenu) return;

  let menuOpen = false;

  const openMenu = () => {
    menuOpen = true;
    hamburgerMenu.style.display = "flex";
    hamburgerBtn.classList.add("hamburger-btn--active");
  };

  const closeMenu = () => {
    menuOpen = false;
    hamburgerMenu.style.display = "none";
    hamburgerBtn.classList.remove("hamburger-btn--active");
  };

  const toggleMenu = () => {
    if (menuOpen) closeMenu();
    else openMenu();
  };

  const showPanel = (html: string) => {
    if (!menuPanel || !menuPanelBody) return;
    menuPanelBody.innerHTML = html;
    menuPanel.style.display = "flex";
    closeMenu();
  };

  const hidePanel = () => {
    if (!menuPanel) return;
    menuPanel.style.display = "none";
  };

  /* ── hamburger button ── */

  hamburgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  /* ── close menu on outside click ── */

  document.addEventListener("click", (e) => {
    if (
      menuOpen &&
      !hamburgerMenu.contains(e.target as Node) &&
      e.target !== hamburgerBtn
    ) {
      closeMenu();
    }
  });

  /* ── close panel ── */

  if (menuPanelClose) {
    menuPanelClose.addEventListener("click", hidePanel);
  }

  if (menuPanel) {
    menuPanel.addEventListener("click", (e) => {
      if (e.target === menuPanel) hidePanel();
    });
  }

  /* ── escape key ── */

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (menuPanel && menuPanel.style.display !== "none") {
        hidePanel();
      } else if (menuOpen) {
        closeMenu();
      }
    }
  });

  /* ── menu item actions ── */

  const menuItems = hamburgerMenu.querySelectorAll<HTMLElement>(".menu-item");

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;

      switch (action) {
        case "past-puzzles":
          showPanel(
            `<h3 class="menu-panel-title">past puzzles</h3>` +
              `<p class="menu-panel-text">coming soon...</p>`,
          );
          break;

        case "builder":
          closeMenu();
          document.getElementById("builder-btn")?.click();
          break;

        case "tutorial":
          showPanel(
            `<h3 class="menu-panel-title">how to play</h3>` +
              `<p class="menu-panel-text">click to draw a path, then press run to see if everyone is satisfied.</p>` +
              `<p class="menu-panel-text">you can only hold 2 drinks at a time.</p>` +
              `<p class="menu-panel-text">try to find the shortest path possible.</p>`,
          );
          break;

        case "settings":
          showPanel(buildSettingsHTML());
          attachSettingsListeners();
          break;

        case "about":
          showPanel(
            `<h3 class="menu-panel-title">about</h3>` +
              `<p class="menu-panel-text">this game was made with &lt;3 by jamms</p>` +
              `<p class="menu-panel-text"><a href="https://jam.ms" target="_blank" rel="noopener" class="menu-link">jam.ms</a></p>`,
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
      `<button id="audio-toggle-btn" class="game-button settings-toggle">${enabled ? "on" : "off"}</button>` +
      `</div>`
    );
  }

  function attachSettingsListeners(): void {
    const btn = document.getElementById("audio-toggle-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const newState = toggleAudio();
      btn.textContent = newState ? "on" : "off";
    });
  }
}
