/*
  script.js
  ---------
  Reads the settings and renders the page. Also handles the clock, search,
  notes, and theme toggle.

  Where settings come from (Stage 3):
    1. If you have saved changes with the in-page Settings panel, those are
       stored in this browser (localStorage, key "homepage.config") and win.
    2. Otherwise the page uses the "homepageConfig" object from config.js.
  Either way, the raw settings are passed through sanitizeConfig() so a
  missing or broken section falls back to safe defaults instead of crashing
  the page.

  This file is organized as small functions, each with one job, called from
  initApp() at the bottom. Functions whose names start with "apply" or
  "render" are safe to run again at any time — the Settings panel
  (settings.js) calls applyConfig() to refresh the page live after an edit.
*/

const STORAGE_KEYS = {
  notes: "homepage.notes",
  theme: "homepage.theme",
  config: "homepage.config",
  // Legacy key from an earlier version, where the color theme was stored
  // separately from the rest of the settings. Migrated on startup.
  legacyPalette: "homepage.palette",
};

// The color themes styles.css knows about (see its section 1). "default"
// is the teal look; every other id needs a matching
// :root[data-palette="..."] block in styles.css and an <option> in the
// Settings panel's color theme dropdown.
const KNOWN_PALETTES = ["default", "indigo"];
const KNOWN_DENSITIES = ["compact", "comfortable", "spacious"];

function isKnownPalette(palette) {
  return KNOWN_PALETTES.includes(palette);
}

function isKnownDensity(density) {
  return KNOWN_DENSITIES.includes(density);
}

// Bumped if the shape of the stored config wrapper ever changes, so a
// future version can migrate (or safely ignore) old data.
const CONFIG_STORAGE_VERSION = 1;

// The configuration currently shown on the page. Set by applyConfig();
// read by the Settings panel via getCurrentConfig().
let currentConfig = null;

function getCurrentConfig() {
  return currentConfig;
}

/* ------------------------------------------------------------------ */
/* Configuration handling                                              */
/* ------------------------------------------------------------------ */

// Only ordinary web links are allowed; anything else (javascript:, file:,
// a typo like "wwww.example") is rejected instead of rendering a broken
// or unsafe link.
function isValidLinkUrl(url) {
  return /^https?:\/\//i.test(url);
}

// Normalizes the shortcutGroups array: keeps only object entries and
// coerces every field to the expected type. Links with an empty or invalid
// URL are KEPT here (so half-finished edits in the Settings panel are not
// silently deleted) — they are skipped at render time instead.
function sanitizeGroups(rawGroups) {
  if (!Array.isArray(rawGroups)) return [];
  return rawGroups
    .filter((group) => group && typeof group === "object")
    .map((group) => ({
      title: typeof group.title === "string" ? group.title : "Untitled group",
      enabled: group.enabled !== false,
      links: Array.isArray(group.links)
        ? group.links
            .filter((link) => link && typeof link === "object")
            .map((link) => ({
              name: typeof link.name === "string" ? link.name : "",
              url: typeof link.url === "string" ? link.url : "",
              icon: typeof link.icon === "string" ? link.icon : "",
            }))
        : [],
    }));
}

// Returns a safe config object, falling back to sensible defaults if the
// raw input (config.js or an imported backup) is missing, malformed, or
// has missing fields. This keeps the page from crashing just because a
// settings file has a typo.
function sanitizeConfig(raw) {
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
    theme: { default: "dark", palette: "default" },
    layout: { density: "comfortable" },
  };

  if (raw === null || raw === undefined || typeof raw !== "object") {
    console.warn("No usable configuration found. Using default settings.");
    return fallback;
  }

  // Shallow-merge each section so a missing/broken section falls back
  // individually instead of discarding the whole configuration.
  const config = {
    user: { ...fallback.user, ...(raw.user || {}) },
    greeting: { ...fallback.greeting, ...(raw.greeting || {}) },
    search: { ...fallback.search, ...(raw.search || {}) },
    sections: { ...fallback.sections, ...(raw.sections || {}) },
    behavior: { ...fallback.behavior, ...(raw.behavior || {}) },
    shortcutGroups: sanitizeGroups(raw.shortcutGroups),
    notes: { ...fallback.notes, ...(raw.notes || {}) },
    theme: { ...fallback.theme, ...(raw.theme || {}) },
    layout: { ...fallback.layout, ...(raw.layout || {}) },
  };

  // An unknown color theme would leave the page unstyled-ish, so it
  // falls back to the default.
  if (!isKnownPalette(config.theme.palette)) {
    config.theme.palette = "default";
  }

  // Older backups do not have a layout section. Unknown or missing values
  // use the balanced default so they remain fully compatible.
  if (!isKnownDensity(config.layout.density)) {
    config.layout.density = "comfortable";
  }

  // The search URL becomes the form's action, so it must be a real web
  // address — anything else falls back to the default engine.
  if (!isValidLinkUrl(config.search.actionUrl)) {
    console.warn(
      "search.actionUrl must start with https:// (or http://). Falling back to the default engine.",
      config.search.actionUrl
    );
    config.search = { ...fallback.search };
  }

  return config;
}

/* ------------------------------------------------------------------ */
/* Saved configuration (localStorage)                                  */
/* ------------------------------------------------------------------ */

// Changes made in the Settings panel are stored in this browser and take
// priority over config.js. Deleting the stored copy (the panel's "Reset to
// config.js" button) goes back to the file.

function loadUserConfig() {
  try {
    const rawText = localStorage.getItem(STORAGE_KEYS.config);
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== "object" || typeof parsed.config !== "object" || parsed.config === null) {
      console.warn("Saved settings in this browser look malformed; using config.js instead.");
      return null;
    }
    return parsed.config;
  } catch (error) {
    console.warn("Could not read saved settings from localStorage; using config.js instead.", error);
    return null;
  }
}

function saveUserConfig(config) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.config,
      JSON.stringify({ version: CONFIG_STORAGE_VERSION, config })
    );
    return true;
  } catch (error) {
    console.warn("Could not save settings to localStorage.", error);
    return false;
  }
}

function clearUserConfig() {
  try {
    localStorage.removeItem(STORAGE_KEYS.config);
  } catch (error) {
    console.warn("Could not remove saved settings from localStorage.", error);
  }
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

// Applies the configurable parts (engine URL, parameter name, placeholder).
// Safe to call again whenever the settings change.
function applySearchSettings(config) {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  if (!form || !input) return;

  form.setAttribute("action", config.search.actionUrl);
  input.setAttribute("name", config.search.queryParameter);
  input.setAttribute("placeholder", config.search.placeholder);
}

// Wires up the search behavior. Called exactly once at startup — the
// listeners don't depend on the settings, so they never need re-binding.
function bindSearchEvents() {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  if (!form || !input) return;

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
    empty.textContent = "No links yet — add some in Settings.";
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
    empty.textContent = "No shortcut groups yet. Use the Settings button (top right) to add some.";
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

// Applies the configurable parts (heading text and placeholder).
// Safe to call again whenever the settings change.
function applyNotesSettings(config) {
  const heading = document.getElementById("notes-heading");
  const textarea = document.getElementById("notes-textarea");

  if (heading && config.notes.label) heading.textContent = config.notes.label;
  if (textarea && config.notes.placeholder) {
    textarea.setAttribute("placeholder", config.notes.placeholder);
  }
}

// Loads the saved notes and wires up autosave and the Clear button.
// Called exactly once at startup.
function initNotes() {
  const textarea = document.getElementById("notes-textarea");
  const clearBtn = document.getElementById("notes-clear");
  const status = document.getElementById("notes-status");
  if (!textarea) return;

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

/* Color theme ("palette") — independent of light/dark mode; the two
   combine, so every color theme has a dark and a light variation. The
   chosen palette lives in the config (theme.palette), so it is saved,
   exported, and reset together with the rest of the settings. */

function applyPalette(palette) {
  document.documentElement.setAttribute(
    "data-palette",
    isKnownPalette(palette) ? palette : "default"
  );
}

function applyDensity(density) {
  document.documentElement.setAttribute(
    "data-density",
    isKnownDensity(density) ? density : "comfortable"
  );
}

// An earlier version stored the color theme in its own localStorage key.
// If that key is found, fold its value into the given config (and into
// the saved settings, if there are any) and delete it.
function migrateLegacyPalette(config) {
  let legacy = null;
  try {
    legacy = localStorage.getItem(STORAGE_KEYS.legacyPalette);
    if (legacy !== null) localStorage.removeItem(STORAGE_KEYS.legacyPalette);
  } catch (error) {
    return config;
  }
  if (!isKnownPalette(legacy) || legacy === config.theme.palette) return config;

  // The legacy key held an explicit user choice, so persist it — even if
  // that means creating the saved-settings entry for the first time.
  config.theme.palette = legacy;
  saveUserConfig(config);
  return config;
}

function initTheme(config) {
  // The inline script in index.html already set data-theme and
  // data-palette before paint; this re-derives the same values so the
  // button label and aria state are correct, and wires up the toggle.
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

// (Re-)applies a configuration to the page: everything that depends on the
// settings, and nothing that binds event listeners. The Settings panel
// calls this after every edit so the page updates live.
function applyConfig(config) {
  currentConfig = config;
  applyPageTitle(config);
  renderGreeting(config);
  applySectionVisibility(config);
  applySearchSettings(config);
  renderShortcutGroups(config);
  applyNotesSettings(config);
  applyPalette(config.theme.palette);
  applyDensity(config.layout.density);
}

function initApp() {
  // Settings saved from the in-page panel win over config.js.
  const stored = loadUserConfig();
  const base = typeof homepageConfig !== "undefined" ? homepageConfig : null;
  const config = migrateLegacyPalette(sanitizeConfig(stored !== null ? stored : base));

  applyConfig(config);
  initTheme(config);
  startClock();
  bindSearchEvents();
  initNotes();
  // The Settings panel itself is set up by settings.js, which runs after
  // this file (both are deferred, and defer scripts run in file order).
}

// script.js is loaded with "defer", so the DOM is ready when this runs.
initApp();
