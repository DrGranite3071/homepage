/*
  script.js
  ---------
  Reads the settings from config.js (the "homepageConfig" object) and
  renders the page. Also handles the clock, search, notes, and theme toggle.

  This file is organized as small functions, each with one job, called
  from initApp() at the bottom. You should not normally need to edit it —
  everything personal lives in config.js.
*/

const STORAGE_KEYS = {
  notes: "homepage.notes",
  theme: "homepage.theme",
};

/* ------------------------------------------------------------------ */
/* Configuration handling                                              */
/* ------------------------------------------------------------------ */

// Returns a safe config object, falling back to sensible defaults if
// config.js is missing, malformed, or has missing fields. This keeps the
// page from crashing just because config.js has a typo.
function getSafeConfig() {
  const fallback = {
    user: { displayName: "there", pageTitle: "Homepage" },
    greeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
    },
    search: {
      engine: "Google",
      actionUrl: "https://www.google.com/search",
      queryParameter: "q",
      placeholder: "Search the web",
    },
    sections: { showSearch: true, showShortcuts: true, showNotes: true },
    behavior: { openLinksInNewTab: true },
    shortcutGroups: [],
    notes: { label: "Today's focus", placeholder: "What matters most today?" },
    theme: { default: "dark" },
  };

  if (typeof homepageConfig === "undefined" || homepageConfig === null) {
    console.warn("config.js not found or homepageConfig is missing. Using default settings.");
    return fallback;
  }

  // Shallow-merge each section so a missing/broken section falls back
  // individually instead of discarding the whole configuration.
  return {
    user: { ...fallback.user, ...(homepageConfig.user || {}) },
    greeting: { ...fallback.greeting, ...(homepageConfig.greeting || {}) },
    search: { ...fallback.search, ...(homepageConfig.search || {}) },
    sections: { ...fallback.sections, ...(homepageConfig.sections || {}) },
    behavior: { ...fallback.behavior, ...(homepageConfig.behavior || {}) },
    shortcutGroups: Array.isArray(homepageConfig.shortcutGroups)
      ? homepageConfig.shortcutGroups
      : fallback.shortcutGroups,
    notes: { ...fallback.notes, ...(homepageConfig.notes || {}) },
    theme: { ...fallback.theme, ...(homepageConfig.theme || {}) },
  };
}

/* ------------------------------------------------------------------ */
/* Page title, greeting, and section visibility                        */
/* ------------------------------------------------------------------ */

function applyPageTitle(config) {
  if (config.user.pageTitle) {
    document.title = config.user.pageTitle;
  }
}

function renderGreeting(config) {
  const greetingEl = document.getElementById("greeting");
  if (!greetingEl) return;

  const hour = new Date().getHours();
  let timeOfDayGreeting = config.greeting.morning;
  if (hour >= 12 && hour < 18) {
    timeOfDayGreeting = config.greeting.afternoon;
  } else if (hour >= 18) {
    timeOfDayGreeting = config.greeting.evening;
  }

  const name = config.user.displayName || "there";
  greetingEl.textContent = `${timeOfDayGreeting}, ${name}`;
}

function applySectionVisibility(config) {
  const sections = [
    ["search-section", config.sections.showSearch],
    ["shortcuts-section", config.sections.showShortcuts],
    ["notes-section", config.sections.showNotes],
  ];
  sections.forEach(([id, visible]) => {
    const el = document.getElementById(id);
    if (el) el.hidden = visible === false;
  });
}

/* ------------------------------------------------------------------ */
/* Clock and date                                                      */
/* ------------------------------------------------------------------ */

function startClock() {
  const clockEl = document.getElementById("clock");
  const dateEl = document.getElementById("date");
  if (!clockEl && !dateEl) return;

  // The elements are looked up once and the date text is only rewritten
  // when the day actually changes, so each tick stays cheap.
  let renderedDay = null;

  function tick() {
    const now = new Date();

    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }

    if (dateEl && now.getDate() !== renderedDay) {
      renderedDay = now.getDate();
      dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }

  tick();
  setInterval(tick, 1000);

  // When the tab was hidden the clock may be stale for up to a second;
  // refresh immediately on return so the time never looks wrong.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

function initSearch(config) {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  if (!form || !input) return;

  form.setAttribute("action", config.search.actionUrl);
  input.setAttribute("name", config.search.queryParameter);
  input.setAttribute("placeholder", config.search.placeholder);

  // Submitting via GET lets the browser handle query encoding safely.
  // We only step in to stop empty or whitespace-only searches.
  form.addEventListener("submit", (event) => {
    const query = input.value.trim();
    if (!query) {
      event.preventDefault();
      input.focus();
      return;
    }
    input.value = query;
  });

  // Press "/" anywhere on the page (outside a text field) to jump to
  // the search box — handy with a keyboard on desktop or Samsung DeX.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (typing) return;
    event.preventDefault();
    input.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Shortcut groups                                                     */
/* ------------------------------------------------------------------ */

// Only ordinary web links are allowed; anything else (javascript:, file:,
// a typo like "wwww.example") is skipped with a console warning instead
// of rendering a broken or unsafe link.
function isValidLinkUrl(url) {
  return /^https?:\/\//i.test(url);
}

// Builds one shortcut link list item. Falls back gracefully if a link
// entry is missing a name or url instead of throwing.
function createShortcutLink(link, behavior) {
  const name = typeof link.name === "string" && link.name.trim() ? link.name.trim() : null;
  const url = typeof link.url === "string" && link.url.trim() ? link.url.trim() : null;

  if (!name || !url) {
    console.warn("Skipped a shortcut link with a missing name or url:", link);
    return null;
  }
  if (!isValidLinkUrl(url)) {
    console.warn(`Skipped shortcut "${name}": its url must start with https:// (or http://).`, link);
    return null;
  }

  const li = document.createElement("li");
  const a = document.createElement("a");
  a.className = "shortcut-link";
  a.href = url;
  if (behavior.openLinksInNewTab !== false) {
    // Open in a new tab, safely: noopener/noreferrer prevent the new
    // page from being able to access or redirect this one.
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }

  const icon = document.createElement("span");
  icon.className = "shortcut-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = (link.icon && String(link.icon).trim()) || name.charAt(0).toUpperCase();

  const label = document.createElement("span");
  label.className = "shortcut-name";
  label.textContent = name;

  a.append(icon, label);
  li.appendChild(a);
  return li;
}

function createShortcutGroup(group, behavior) {
  const title = typeof group.title === "string" && group.title.trim() ? group.title : "Untitled group";

  const section = document.createElement("div");
  section.className = "shortcut-group";

  const heading = document.createElement("h3");
  heading.className = "shortcut-group-title";
  heading.textContent = title;
  section.appendChild(heading);

  const links = Array.isArray(group.links) ? group.links : [];
  const list = document.createElement("ul");
  list.className = "shortcut-list";

  let addedCount = 0;
  links.forEach((link) => {
    const li = createShortcutLink(link, behavior);
    if (li) {
      list.appendChild(li);
      addedCount += 1;
    }
  });

  if (addedCount === 0) {
    const empty = document.createElement("p");
    empty.className = "shortcut-empty";
    empty.textContent = "No links yet. Add some in config.js.";
    section.appendChild(empty);
  } else {
    section.appendChild(list);
  }

  return section;
}

function renderShortcutGroups(config) {
  const container = document.getElementById("shortcut-groups");
  if (!container) return;

  container.innerHTML = "";

  const groups = config.shortcutGroups.filter((group) => group && group.enabled !== false);

  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "shortcut-empty";
    empty.textContent = "No shortcut groups configured yet. Add some in config.js.";
    container.appendChild(empty);
    return;
  }

  groups.forEach((group) => {
    container.appendChild(createShortcutGroup(group, config.behavior));
  });
}

/* ------------------------------------------------------------------ */
/* Notes (localStorage)                                                */
/* ------------------------------------------------------------------ */

// localStorage can throw (private browsing, storage disabled, etc.), so
// every read/write goes through try/catch and the page still works
// without it -- notes just won't persist across reloads in that case.

function readNotesFromStorage() {
  try {
    return localStorage.getItem(STORAGE_KEYS.notes) || "";
  } catch (error) {
    console.warn("Could not read saved notes from localStorage.", error);
    return "";
  }
}

function writeNotesToStorage(value) {
  try {
    localStorage.setItem(STORAGE_KEYS.notes, value);
    return true;
  } catch (error) {
    console.warn("Could not save notes to localStorage.", error);
    return false;
  }
}

function clearNotesFromStorage() {
  try {
    localStorage.removeItem(STORAGE_KEYS.notes);
  } catch (error) {
    console.warn("Could not clear saved notes from localStorage.", error);
  }
}

function initNotes(config) {
  const textarea = document.getElementById("notes-textarea");
  const clearBtn = document.getElementById("notes-clear");
  const status = document.getElementById("notes-status");
  const heading = document.getElementById("notes-heading");
  if (!textarea) return;

  if (heading && config.notes.label) heading.textContent = config.notes.label;
  if (config.notes.placeholder) textarea.setAttribute("placeholder", config.notes.placeholder);

  textarea.value = readNotesFromStorage();

  // Show a short status message ("Saved", "Cleared"), then fade it out
  // after a moment so the page doesn't keep stale feedback around.
  let statusTimeout = null;
  function showStatus(message, sticky = false) {
    if (!status) return;
    status.textContent = message;
    if (statusTimeout) clearTimeout(statusTimeout);
    if (!sticky) {
      statusTimeout = setTimeout(() => {
        status.textContent = "";
      }, 3000);
    }
  }

  let saveTimeout = null;
  textarea.addEventListener("input", () => {
    // Debounce so we don't write to storage on every keystroke.
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const saved = writeNotesToStorage(textarea.value);
      if (saved) {
        showStatus("Saved");
      } else {
        showStatus("Could not save — storage unavailable in this browser.", true);
      }
    }, 300);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Clear today's focus notes? This cannot be undone.");
      if (!confirmed) return;
      textarea.value = "";
      clearNotesFromStorage();
      showStatus("Cleared");
      textarea.focus();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.theme);
  } catch (error) {
    console.warn("Could not read saved theme from localStorage.", error);
    return null;
  }
}

function writeStoredTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch (error) {
    console.warn("Could not save theme choice to localStorage.", error);
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const button = document.getElementById("theme-toggle");
  const label = document.getElementById("theme-toggle-label");
  if (label) label.textContent = theme === "light" ? "Light mode" : "Dark mode";
  if (button) {
    button.setAttribute(
      "aria-label",
      theme === "light" ? "Switch to dark mode" : "Switch to light mode"
    );
  }
}

function initTheme(config) {
  // The inline script in index.html already set data-theme before paint;
  // this re-derives the same value so the button label and aria state
  // are correct, and wires up the toggle.
  const configuredDefault = config.theme.default === "light" ? "light" : "dark";
  const stored = readStoredTheme();
  const initialTheme = stored === "light" || stored === "dark" ? stored : configuredDefault;
  applyTheme(initialTheme);

  const button = document.getElementById("theme-toggle");
  if (!button) return;

  button.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    writeStoredTheme(next);
  });
}

/* ------------------------------------------------------------------ */
/* App startup                                                         */
/* ------------------------------------------------------------------ */

function initApp() {
  const config = getSafeConfig();

  applyPageTitle(config);
  initTheme(config);
  renderGreeting(config);
  startClock();
  applySectionVisibility(config);
  initSearch(config);
  renderShortcutGroups(config);
  initNotes(config);
}

// script.js is loaded with "defer", so the DOM is ready when this runs.
initApp();
