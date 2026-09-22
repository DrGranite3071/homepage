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
  unsplashEnabled: "homepage.unsplash.enabled",
  unsplashIntensity: "homepage.unsplash.intensity",
  unsplashDark: "homepage.unsplash.photo.dark",
  unsplashLight: "homepage.unsplash.photo.light",
};

const UNSPLASH_WORKER_URL = "https://homepage-unsplash.clasaxiead.workers.dev";
const UNSPLASH_INTENSITIES = ["soft", "normal", "strong"];

// The color themes styles.css knows about (see its section 1). "default"
// is the teal look; every other id needs a matching
// :root[data-palette="..."] block in styles.css and an <option> in the
// Settings panel's color theme dropdown.
const KNOWN_PALETTES = ["default", "indigo"];
const KNOWN_DENSITIES = ["compact", "comfortable", "spacious"];
const APPEARANCE_OPTIONS = {
  cardStyle: ["solid", "soft", "glass"],
  cornerStyle: ["compact", "rounded", "soft"],
  ambience: ["off", "subtle", "strong"],
};
const APPEARANCE_DEFAULTS = { cardStyle: "soft", cornerStyle: "rounded", ambience: "subtle" };

function isKnownPalette(palette) {
  return KNOWN_PALETTES.includes(palette);
}

function isKnownDensity(density) {
  return KNOWN_DENSITIES.includes(density);
}

// Bumped if the shape of the stored config wrapper ever changes, so a
// future version can migrate (or safely ignore) old data.
const CONFIG_STORAGE_VERSION = 1;
const DASHBOARD_SCHEMA_VERSION = 1;

// The configuration currently shown on the page. Set by applyConfig();
// read by the Settings panel via getCurrentConfig().
let currentConfig = null;

let unsplashEnabled = true;
let unsplashIntensity = "normal";
let activeUnsplashPhoto = null;
let activeUnsplashTheme = null;
let activeUnsplashLayer = 0;
let unsplashRequestToken = 0;
let unsplashLoading = false;

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
function sanitizeWeather(raw) {
  const fallback = {
    enabled: true,
    location: "Bucharest",
    useBrowserLocation: false,
    locations: [
      { label: "Bucharest", latitude: 44.4268, longitude: 26.1025 },
      { label: "Riga", latitude: 56.9496, longitude: 24.1052 },
    ],
  };

  const base = raw && typeof raw === "object" ? raw : {};
  const presetLocations = fallback.locations.map((entry) => ({ ...entry }));
  const sourceLocations = Array.isArray(base.locations) && base.locations.length > 0
    ? base.locations
    : presetLocations;

  const normalizedLocations = sourceLocations
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : "Location",
      latitude: Number(entry.latitude),
      longitude: Number(entry.longitude),
    }))
    .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude));

  const preferredLocations = normalizedLocations.length > 0
    ? normalizedLocations.filter((entry) =>
        presetLocations.some((preset) => preset.label === entry.label)
      )
    : [];

  const finalLocations = preferredLocations.length > 0 ? preferredLocations.slice(0, 2) : presetLocations;

  const normalized = {
    enabled: base.enabled !== false,
    location: typeof base.location === "string" && base.location.trim() ? base.location.trim() : fallback.location,
    useBrowserLocation: base.useBrowserLocation === true,
    locations: finalLocations,
  };

  if (!finalLocations.some((entry) => entry.label === normalized.location)) {
    normalized.location = finalLocations[0].label;
  }

  return normalized;
}

function sanitizeConfig(raw) {
  const fallback = {
    user: { displayName: "there", pageTitle: "Homepage" },
    greeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
      subtitle: "Make today count.",
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
    weather: sanitizeWeather(null),
    theme: { default: "dark", palette: "default" },
    layout: { density: "comfortable" },
    appearance: { ...APPEARANCE_DEFAULTS },
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
    weather: sanitizeWeather(raw.weather),
    theme: { ...fallback.theme, ...(raw.theme || {}) },
    layout: { ...fallback.layout, ...(raw.layout || {}) },
    appearance: { ...fallback.appearance, ...(raw.appearance || {}) },
  };

  // Older stored configs and backups have no appearance section.
  Object.keys(APPEARANCE_OPTIONS).forEach((key) => {
    if (!APPEARANCE_OPTIONS[key].includes(config.appearance[key])) {
      config.appearance[key] = APPEARANCE_DEFAULTS[key];
    }
  });
  if (typeof config.greeting.subtitle !== "string") {
    config.greeting.subtitle = fallback.greeting.subtitle;
  }

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

function notifyLocalDashboardChange(source) {
  document.dispatchEvent(new CustomEvent("homepage:local-change", { detail: { source } }));
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
  const subtitleEl = document.getElementById("greeting-subtitle");
  if (subtitleEl) {
    subtitleEl.textContent = config.greeting.subtitle.trim();
    subtitleEl.hidden = !subtitleEl.textContent;
  }
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

// A complete local snapshot used by backup and optional cloud sync.
function getDashboardSnapshot() {
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    config: sanitizeConfig(getCurrentConfig()),
    notes: readNotesFromStorage(),
    theme: (() => {
      const stored = readStoredTheme();
      return stored === "light" || stored === "dark"
        ? stored
        : getCurrentConfig().theme.default === "light" ? "light" : "dark";
    })(),
  };
}

function validateDashboardSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.schemaVersion !== DASHBOARD_SCHEMA_VERSION) return null;
  if (!raw.config || typeof raw.config !== "object" || Array.isArray(raw.config)) return null;
  if (typeof raw.notes !== "string") return null;
  if (raw.theme !== "light" && raw.theme !== "dark") return null;
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    config: sanitizeConfig(raw.config),
    notes: raw.notes,
    theme: raw.theme,
  };
}

function applyDashboardSnapshot(raw) {
  const clean = validateDashboardSnapshot(raw);
  if (!clean) return false;
  if (!saveUserConfig(clean.config) || !writeNotesToStorage(clean.notes)) return false;
  writeStoredTheme(clean.theme);
  applyConfig(clean.config);
  applyTheme(clean.theme);
  const textarea = document.getElementById("notes-textarea");
  if (textarea) textarea.value = clean.notes;
  document.dispatchEvent(new CustomEvent("homepage:config-applied"));
  return true;
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

  textarea.addEventListener("input", () => {
    const saved = writeNotesToStorage(textarea.value);
    if (saved) {
      showStatus("Saved");
      notifyLocalDashboardChange("notes");
    } else {
      showStatus("Could not save — storage unavailable in this browser.", true);
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Clear today's focus notes? This cannot be undone.");
      if (!confirmed) return;
      textarea.value = "";
      clearNotesFromStorage();
      notifyLocalDashboardChange("notes-clear");
      showStatus("Cleared");
      textarea.focus();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Optional Unsplash background                                       */
/* ------------------------------------------------------------------ */

function unsplashPhotoStorageKey(theme) {
  return theme === "light" ? STORAGE_KEYS.unsplashLight : STORAGE_KEYS.unsplashDark;
}

function isSafeHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch (error) {
    return false;
  }
}

function sanitizeUnsplashPhoto(raw) {
  if (!raw || typeof raw !== "object" ||
      typeof raw.id !== "string" || !raw.id.trim() ||
      !isSafeHttpsUrl(raw.imageUrl) ||
      !isSafeHttpsUrl(raw.photographerUrl) ||
      !isSafeHttpsUrl(raw.photoUrl) ||
      !isSafeHttpsUrl(raw.downloadLocation) ||
      typeof raw.photographerName !== "string" || !raw.photographerName.trim()) {
    return null;
  }
  return {
    id: raw.id,
    imageUrl: raw.imageUrl,
    fullImageUrl: isSafeHttpsUrl(raw.fullImageUrl) ? raw.fullImageUrl : raw.imageUrl,
    color: typeof raw.color === "string" ? raw.color : "",
    description: typeof raw.description === "string" ? raw.description : "",
    photographerName: raw.photographerName.trim(),
    photographerUrl: raw.photographerUrl,
    photoUrl: raw.photoUrl,
    downloadLocation: raw.downloadLocation,
  };
}

function readUnsplashPhoto(theme) {
  try {
    return sanitizeUnsplashPhoto(JSON.parse(localStorage.getItem(unsplashPhotoStorageKey(theme)) || "null"));
  } catch (error) {
    return null;
  }
}

function saveUnsplashPhoto(theme, photo) {
  try {
    localStorage.setItem(unsplashPhotoStorageKey(theme), JSON.stringify(photo));
    return true;
  } catch (error) {
    return false;
  }
}

function readUnsplashPreferences() {
  try {
    unsplashEnabled = localStorage.getItem(STORAGE_KEYS.unsplashEnabled) !== "off";
    const savedIntensity = localStorage.getItem(STORAGE_KEYS.unsplashIntensity);
    unsplashIntensity = UNSPLASH_INTENSITIES.includes(savedIntensity) ? savedIntensity : "normal";
  } catch (error) {
    unsplashEnabled = true;
    unsplashIntensity = "normal";
  }
  document.documentElement.setAttribute("data-background-intensity", unsplashIntensity);
}

function notifyUnsplashChange(status = "") {
  document.dispatchEvent(new CustomEvent("homepage:unsplash-change", {
    detail: { enabled: unsplashEnabled, intensity: unsplashIntensity, loading: unsplashLoading, status },
  }));
}

function renderUnsplashFooter(photo) {
  const defaultFooter = document.getElementById("footer-default");
  const credit = document.getElementById("footer-photo-credit");
  const photographer = document.getElementById("photo-photographer-link");
  const viewPhoto = document.getElementById("photo-view-link");
  if (!defaultFooter || !credit) return;

  const showCredit = Boolean(photo && unsplashEnabled);
  defaultFooter.hidden = showCredit;
  credit.hidden = !showCredit;
  if (!showCredit) return;
  photographer.textContent = photo.photographerName;
  photographer.href = photo.photographerUrl;
  viewPhoto.href = photo.photoUrl;
}

function clearUnsplashBackground() {
  unsplashRequestToken += 1;
  activeUnsplashPhoto = null;
  activeUnsplashTheme = null;
  document.documentElement.setAttribute("data-has-background", "false");
  document.querySelectorAll(".unsplash-photo-layer").forEach((layer) => layer.classList.remove("is-visible"));
  renderUnsplashFooter(null);
}

function preloadUnsplashPhoto(photo) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Background image could not be loaded"));
    image.src = photo.imageUrl;
  });
}

function applyPreloadedUnsplashPhoto(photo, theme) {
  const layers = Array.from(document.querySelectorAll(".unsplash-photo-layer"));
  if (layers.length < 2) return;
  const nextLayerIndex = activeUnsplashPhoto ? (activeUnsplashLayer + 1) % layers.length : activeUnsplashLayer;
  const nextLayer = layers[nextLayerIndex];
  nextLayer.classList.remove("is-visible");
  nextLayer.style.backgroundImage = `url(${JSON.stringify(photo.imageUrl)})`;
  void nextLayer.offsetWidth;
  nextLayer.classList.add("is-visible");
  layers.forEach((layer, index) => {
    if (index !== nextLayerIndex) layer.classList.remove("is-visible");
  });
  activeUnsplashLayer = nextLayerIndex;
  activeUnsplashPhoto = photo;
  activeUnsplashTheme = theme;
  document.documentElement.setAttribute("data-has-background", "true");
  renderUnsplashFooter(photo);
}

function trackUnsplashSelection(photo) {
  fetch(`${UNSPLASH_WORKER_URL}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
    keepalive: true,
  }).catch(() => { /* Attribution tracking must never affect the homepage. */ });
}

async function fetchUnsplashPhoto(theme, requestToken) {
  const response = await fetch(`${UNSPLASH_WORKER_URL}/random?theme=${encodeURIComponent(theme)}`);
  if (!response.ok) throw new Error("Background service unavailable");
  const photo = sanitizeUnsplashPhoto(await response.json());
  if (!photo) throw new Error("Background service returned invalid data");
  await preloadUnsplashPhoto(photo);
  if (requestToken !== unsplashRequestToken || !unsplashEnabled ||
      document.documentElement.getAttribute("data-theme") !== theme) return false;
  saveUnsplashPhoto(theme, photo);
  applyPreloadedUnsplashPhoto(photo, theme);
  trackUnsplashSelection(photo);
  return true;
}

async function applyUnsplashForTheme(theme, forceNew = false) {
  const requestToken = ++unsplashRequestToken;
  if (!unsplashEnabled) {
    clearUnsplashBackground();
    notifyUnsplashChange();
    return false;
  }

  if (activeUnsplashTheme !== theme && !forceNew) {
    activeUnsplashPhoto = null;
    activeUnsplashTheme = null;
    document.documentElement.setAttribute("data-has-background", "false");
    document.querySelectorAll(".unsplash-photo-layer").forEach((layer) => layer.classList.remove("is-visible"));
    renderUnsplashFooter(null);
  }

  const stored = forceNew ? null : readUnsplashPhoto(theme);
  unsplashLoading = true;
  notifyUnsplashChange(stored ? "Loading saved background…" : "Finding a background…");
  try {
    let selected = true;
    if (stored) {
      await preloadUnsplashPhoto(stored);
      if (requestToken !== unsplashRequestToken || !unsplashEnabled ||
          document.documentElement.getAttribute("data-theme") !== theme) selected = false;
      if (!selected) return false;
      applyPreloadedUnsplashPhoto(stored, theme);
    } else {
      selected = await fetchUnsplashPhoto(theme, requestToken);
    }
    unsplashLoading = false;
    if (!selected) return false;
    notifyUnsplashChange("Background ready");
    return true;
  } catch (error) {
    // Keep the current photo for a failed replacement, otherwise reveal the CSS fallback.
    if (!activeUnsplashPhoto || activeUnsplashTheme !== theme) clearUnsplashBackground();
    unsplashLoading = false;
    notifyUnsplashChange("Could not load a background");
    return false;
  }
}

function setUnsplashEnabled(enabled) {
  unsplashEnabled = enabled === true;
  try {
    localStorage.setItem(STORAGE_KEYS.unsplashEnabled, unsplashEnabled ? "on" : "off");
  } catch (error) { /* The live preference still works for this session. */ }
  const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  if (unsplashEnabled) applyUnsplashForTheme(theme);
  else clearUnsplashBackground();
  notifyUnsplashChange();
}

function setUnsplashIntensity(intensity) {
  unsplashIntensity = UNSPLASH_INTENSITIES.includes(intensity) ? intensity : "normal";
  document.documentElement.setAttribute("data-background-intensity", unsplashIntensity);
  try {
    localStorage.setItem(STORAGE_KEYS.unsplashIntensity, unsplashIntensity);
  } catch (error) { /* The live preference still works for this session. */ }
  notifyUnsplashChange();
}

function requestAnotherUnsplashBackground() {
  if (unsplashLoading) return Promise.resolve(false);
  if (!unsplashEnabled) {
    unsplashEnabled = true;
    try { localStorage.setItem(STORAGE_KEYS.unsplashEnabled, "on"); } catch (error) { /* session only */ }
  }
  const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return applyUnsplashForTheme(theme, true);
}

function getUnsplashPreferences() {
  return { enabled: unsplashEnabled, intensity: unsplashIntensity, loading: unsplashLoading };
}

function initUnsplashBackground() {
  const anotherButton = document.getElementById("footer-another-background");
  if (anotherButton) anotherButton.addEventListener("click", requestAnotherUnsplashBackground);
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
  if (document.getElementById("unsplash-background")) applyUnsplashForTheme(theme);
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

function applyAppearance(appearance) {
  const root = document.documentElement;
  const attrs = { cardStyle: "data-card-style", cornerStyle: "data-corner-style", ambience: "data-ambience" };
  Object.keys(attrs).forEach((key) => {
    root.setAttribute(attrs[key], APPEARANCE_OPTIONS[key].includes(appearance[key])
      ? appearance[key] : APPEARANCE_DEFAULTS[key]);
  });
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

function getWeatherCondition(code) {
  const map = {
    0: { icon: "☀️", label: "Clear" },
    1: { icon: "🌤️", label: "Mostly clear" },
    2: { icon: "⛅", label: "Partly cloudy" },
    3: { icon: "☁️", label: "Cloudy" },
    45: { icon: "🌫️", label: "Fog" },
    48: { icon: "🌫️", label: "Depositing fog" },
    51: { icon: "🌦️", label: "Light drizzle" },
    53: { icon: "🌦️", label: "Drizzle" },
    55: { icon: "🌧️", label: "Rain" },
    56: { icon: "🌧️", label: "Freezing drizzle" },
    57: { icon: "🌧️", label: "Heavy freezing drizzle" },
    61: { icon: "🌧️", label: "Light rain" },
    63: { icon: "🌧️", label: "Rain" },
    65: { icon: "🌧️", label: "Heavy rain" },
    66: { icon: "🌧️", label: "Freezing rain" },
    67: { icon: "🌧️", label: "Heavy freezing rain" },
    71: { icon: "🌨️", label: "Light snow" },
    73: { icon: "🌨️", label: "Snow" },
    75: { icon: "🌨️", label: "Heavy snow" },
    77: { icon: "❄️", label: "Snow grains" },
    80: { icon: "🌦️", label: "Rain showers" },
    81: { icon: "🌧️", label: "Heavy showers" },
    82: { icon: "⛈️", label: "Violent showers" },
    85: { icon: "🌨️", label: "Snow showers" },
    86: { icon: "🌨️", label: "Heavy snow showers" },
    95: { icon: "⛈️", label: "Thunderstorm" },
    96: { icon: "⛈️", label: "Thunderstorm with hail" },
    99: { icon: "⛈️", label: "Heavy thunderstorm with hail" },
  };

  const entry = map[code] || { icon: "🌡️", label: "Conditions" };
  return entry;
}

function getWeatherLocationByName(config, name) {
  const list = Array.isArray(config.weather.locations) ? config.weather.locations : [];
  return list.find((entry) => entry && entry.label === name) || null;
}

function populateWeatherLocations(config) {
  const select = document.getElementById("weather-location");
  if (!select) return;

  const list = Array.isArray(config.weather.locations) ? config.weather.locations : [];
  if (!list.length) return;

  select.innerHTML = "";
  const browserOption = document.createElement("option");
  browserOption.value = "browser";
  browserOption.textContent = "Use my current location";
  select.appendChild(browserOption);

  list.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    option.textContent = entry.label;
    select.appendChild(option);
  });

  if (config.weather.useBrowserLocation) {
    select.value = "browser";
  } else {
    const currentLabel = config.weather.location || list[0].label;
    select.value = list.some((entry) => entry.label === currentLabel) ? currentLabel : list[0].label;
  }
}

function renderWeatherStatus(text) {
  const updated = document.getElementById("weather-updated");
  if (updated) updated.textContent = text;
}

function renderWeatherData(data, locationLabel) {
  const tempEl = document.getElementById("weather-temp");
  const conditionEl = document.getElementById("weather-condition");
  const iconEl = document.getElementById("weather-icon");
  const cityEl = document.getElementById("weather-heading");
  const windEl = document.getElementById("weather-wind");

  if (cityEl) cityEl.textContent = locationLabel || "Location";
  if (tempEl && data && Number.isFinite(data.temperature)) {
    tempEl.textContent = `${Math.round(data.temperature)}°C`;
  }
  if (conditionEl && data && data.condition) {
    conditionEl.textContent = data.condition;
  }
  if (iconEl && data && data.icon) {
    iconEl.textContent = data.icon;
  }
  if (windEl && data && Number.isFinite(data.wind)) {
    windEl.textContent = `Wind: ${Math.round(data.wind)} km/h`;
  }

  const now = new Date();
  const timeText = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  renderWeatherStatus(`Updated ${timeText}`);
}

async function fetchWeatherForLocation(location) {
  const cityEl = document.getElementById("weather-heading");
  const tempEl = document.getElementById("weather-temp");
  const conditionEl = document.getElementById("weather-condition");

  if (cityEl) cityEl.textContent = location.label || "Location";
  if (tempEl) tempEl.textContent = "--°C";
  if (conditionEl) conditionEl.textContent = "Loading forecast…";
  renderWeatherStatus("Checking weather…");

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather request failed");
    const data = await response.json();
    const current = data.current;
    const code = Number(current && current.weather_code);
    const weather = getWeatherCondition(code);
    const payload = {
      temperature: Number(current && current.temperature_2m),
      condition: weather.label,
      icon: weather.icon,
      wind: Number(current && current.wind_speed_10m),
    };
    renderWeatherData(payload, location.label);
  } catch (error) {
    console.warn("Weather could not be fetched.", error);
    if (conditionEl) conditionEl.textContent = "Weather unavailable";
    if (tempEl) tempEl.textContent = "--°C";
    renderWeatherStatus("Unable to update weather");
  }
}

function updateWeatherConfig(nextWeather) {
  const config = sanitizeConfig({ ...getCurrentConfig(), weather: nextWeather });
  currentConfig = config;
  saveUserConfig(config);
  applyConfig(config);
}

function bindWeatherEvents() {
  const select = document.getElementById("weather-location");
  const refresh = document.getElementById("weather-refresh");
  if (!select) return;

  select.addEventListener("change", () => {
    const value = select.value;
    const config = getCurrentConfig();
    const list = Array.isArray(config.weather.locations) ? config.weather.locations : [];

    if (value === "browser") {
      if (!navigator.geolocation) {
        renderWeatherStatus("This browser cannot access your location");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const customLocation = {
            label: "Current location",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          const nextWeather = {
            ...config.weather,
            location: customLocation.label,
            useBrowserLocation: true,
            locations: [customLocation, ...list.filter((item) => item.label !== "Current location")],
          };
          updateWeatherConfig(nextWeather);
          fetchWeatherForLocation(customLocation);
        },
        () => {
          renderWeatherStatus("Location access was denied");
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
      return;
    }

    const match = getWeatherLocationByName(config, value) || list[0];
    if (!match) return;

    const nextWeather = {
      ...config.weather,
      location: match.label,
      useBrowserLocation: false,
    };
    updateWeatherConfig(nextWeather);
    fetchWeatherForLocation(match);
  });

  if (refresh) {
    refresh.addEventListener("click", () => {
      const config = getCurrentConfig();
      if (config.weather.useBrowserLocation) {
        if (!navigator.geolocation) {
          renderWeatherStatus("Browser location access is unavailable");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const customLocation = {
              label: "Current location",
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            const nextWeather = {
              ...config.weather,
              location: customLocation.label,
              useBrowserLocation: true,
              locations: [customLocation, ...((Array.isArray(config.weather.locations) ? config.weather.locations : []).filter((item) => item.label !== "Current location"))],
            };
            updateWeatherConfig(nextWeather);
            fetchWeatherForLocation(customLocation);
          },
          () => {
            renderWeatherStatus("Location access was denied");
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
        return;
      }

      const match = getWeatherLocationByName(config, config.weather.location) || config.weather.locations[0];
      if (match) fetchWeatherForLocation(match);
    });
  }
}

function applyWeatherSettings(config) {
  const enabled = config.weather && config.weather.enabled !== false;
  const section = document.getElementById("weather-section");
  if (section) section.hidden = !enabled;

  populateWeatherLocations(config);

  const locationList = Array.isArray(config.weather.locations) ? config.weather.locations : [];
  const match = config.weather.useBrowserLocation
    ? { label: "Current location", latitude: 0, longitude: 0 }
    : (getWeatherLocationByName(config, config.weather.location) || locationList[0]);

  if (!match) return;
  if (config.weather.useBrowserLocation) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation = {
            label: "Current location",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          renderWeatherData({
            temperature: 0,
            condition: "Checking weather",
            icon: "📍",
            wind: 0,
          }, "Current location");
          fetchWeatherForLocation(nextLocation);
        },
        () => {
          renderWeatherData({
            temperature: 0,
            condition: "Location unavailable",
            icon: "📍",
            wind: 0,
          }, "Current location");
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
      return;
    }
  }

  fetchWeatherForLocation(match);
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
    notifyLocalDashboardChange("theme");
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
  applyWeatherSettings(config);
  applyPalette(config.theme.palette);
  applyDensity(config.layout.density);
  applyAppearance(config.appearance);
}

function initApp() {
  // Settings saved from the in-page panel win over config.js.
  const stored = loadUserConfig();
  const base = typeof homepageConfig !== "undefined" ? homepageConfig : null;
  const config = migrateLegacyPalette(sanitizeConfig(stored !== null ? stored : base));

  readUnsplashPreferences();
  applyConfig(config);
  initTheme(config);
  initUnsplashBackground();
  bindWeatherEvents();
  startClock();
  bindSearchEvents();
  initNotes();
  // The Settings panel itself is set up by settings.js, which runs after
  // this file (both are deferred, and defer scripts run in file order).
}

// script.js is loaded with "defer", so the DOM is ready when this runs.
initApp();
