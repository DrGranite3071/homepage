/*
  script.js
  ---------
  Reads the settings from config.js (the "homepageConfig" object) and
  renders the page. Also handles the clock, notes, and theme toggle.

  This file is organized as small functions, each with one job, called
  from initApp() at the bottom.
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
    user: { displayName: "there" },
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
    shortcutGroups: Array.isArray(homepageConfig.shortcutGroups)
      ? homepageConfig.shortcutGroups
      : fallback.shortcutGroups,
    notes: { ...fallback.notes, ...(homepageConfig.notes || {}) },
    theme: { ...fallback.theme, ...(homepageConfig.theme || {}) },
  };
}

/* ------------------------------------------------------------------ */
/* Greeting                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Clock and date                                                       */
/* ------------------------------------------------------------------ */

function updateClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function updateDate() {
  const dateEl = document.getElementById("date");
  if (!dateEl) return;
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function startClock() {
  updateClock();
  updateDate();
  // Re-render every second; updateDate() only actually changes text once a day.
  setInterval(() => {
    updateClock();
    updateDate();
  }, 1000);
}

/* ------------------------------------------------------------------ */
/* Search                                                               */
/* ------------------------------------------------------------------ */

function configureSearch(config) {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  if (!form || !input) return;

  form.setAttribute("action", config.search.actionUrl);
  input.setAttribute("name", config.search.queryParameter);
  input.setAttribute("placeholder", config.search.placeholder);
}

/* ------------------------------------------------------------------ */
/* Shortcut groups                                                      */
/* ------------------------------------------------------------------ */

// Builds one <a> shortcut link element. Falls back gracefully if a link
// entry is missing a name or url instead of throwing.
function createShortcutLink(link) {
  const li = document.createElement("li");

  const name = typeof link.name === "string" && link.name.trim() ? link.name : null;
  const url = typeof link.url === "string" && link.url.trim() ? link.url : null;

  if (!name || !url) {
    console.warn("Skipped a shortcut link with a missing name or url:", link);
    return null;
  }

  const a = document.createElement("a");
  a.className = "shortcut-link";
  a.href = url;
  // Shortcuts open in a new tab, safely: noopener/noreferrer prevent the
  // new page from being able to access or redirect this one.
  a.target = "_blank";
  a.rel = "noopener noreferrer";

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

function createShortcutGroup(group) {
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
    const li = createShortcutLink(link);
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
    container.appendChild(createShortcutGroup(group));
  });
}

/* ------------------------------------------------------------------ */
/* Notes (localStorage)                                                 */
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

  let saveTimeout = null;
  textarea.addEventListener("input", () => {
    // Debounce so we don't write to storage on every keystroke.
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const saved = writeNotesToStorage(textarea.value);
      if (status) {
        status.textContent = saved ? "Saved" : "Could not save (storage unavailable)";
      }
    }, 300);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Clear today's focus notes? This cannot be undone.");
      if (!confirmed) return;
      textarea.value = "";
      clearNotesFromStorage();
      if (status) status.textContent = "Cleared";
    });
  }
}

/* ------------------------------------------------------------------ */
/* Theme                                                                */
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
  if (button) button.setAttribute("aria-pressed", String(theme === "light"));
  if (label) label.textContent = theme === "light" ? "Light theme" : "Dark theme";
}

function initTheme(config) {
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

  initTheme(config);
  renderGreeting(config);
  startClock();
  configureSearch(config);
  renderShortcutGroups(config);
  initNotes(config);
}

document.addEventListener("DOMContentLoaded", initApp);
