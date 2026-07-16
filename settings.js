/*
  settings.js
  -----------
  The in-page Settings panel (Stage 3: in-page editing).

  What it does:
    - opens the <dialog id="settings-dialog"> defined in index.html;
    - lets you edit your name, tab title, search engine, section
      visibility, and every shortcut group and link — no config.js editing;
    - saves every change automatically to this browser (localStorage) via
      the helpers in script.js, and re-renders the page live behind the
      dialog;
    - exports/imports a JSON backup file (settings + notes + theme) and can
      reset back to whatever config.js says.

  This file loads AFTER script.js (both use "defer", and deferred scripts
  run in file order), so everything script.js defines — getCurrentConfig(),
  sanitizeConfig(), saveUserConfig(), applyConfig(), the notes and theme
  storage helpers — already exists when this code runs.

  Everything here is wrapped in an IIFE so the panel's internals don't leak
  into the global scope used by script.js.
*/

(function () {
  "use strict";

  /* ---------------------------------------------------------------- */
  /* Search engine presets                                             */
  /* ---------------------------------------------------------------- */

  // The panel offers well-known engines as a dropdown instead of raw URL
  // fields — safer (no room for typos or unsafe URLs) and simpler. A
  // custom engine can still be set in config.js; the dropdown then shows
  // a "Custom" entry for it.
  const SEARCH_PRESETS = [
    { id: "google", label: "Google", actionUrl: "https://www.google.com/search", queryParameter: "q" },
    { id: "duckduckgo", label: "DuckDuckGo", actionUrl: "https://duckduckgo.com/", queryParameter: "q" },
    { id: "bing", label: "Bing", actionUrl: "https://www.bing.com/search", queryParameter: "q" },
    { id: "brave", label: "Brave Search", actionUrl: "https://search.brave.com/search", queryParameter: "q" },
  ];

  function findPresetForConfig(search) {
    return (
      SEARCH_PRESETS.find(
        (preset) =>
          preset.actionUrl === search.actionUrl &&
          preset.queryParameter === search.queryParameter
      ) || null
    );
  }

  /* ---------------------------------------------------------------- */
  /* Elements                                                          */
  /* ---------------------------------------------------------------- */

  const dialog = document.getElementById("settings-dialog");
  const openBtn = document.getElementById("settings-open");

  // <dialog> with showModal() is supported by all current browsers; on a
  // very old one the panel simply stays unavailable and the rest of the
  // page keeps working.
  if (!dialog || !openBtn || typeof dialog.showModal !== "function") {
    if (openBtn) openBtn.hidden = true;
    console.warn("Settings panel unavailable in this browser; edit config.js instead.");
    return;
  }

  const els = {
    closeBtn: document.getElementById("settings-close"),
    displayName: document.getElementById("set-display-name"),
    pageTitle: document.getElementById("set-page-title"),
    searchEngine: document.getElementById("set-search-engine"),
    searchPlaceholder: document.getElementById("set-search-placeholder"),
    showSearch: document.getElementById("set-show-search"),
    showShortcuts: document.getElementById("set-show-shortcuts"),
    showNotes: document.getElementById("set-show-notes"),
    newTab: document.getElementById("set-new-tab"),
    palette: document.getElementById("set-palette"),
    density: document.getElementById("set-density"),
    groupsEditor: document.getElementById("settings-groups"),
    addGroupBtn: document.getElementById("settings-add-group"),
    exportBtn: document.getElementById("settings-export"),
    importBtn: document.getElementById("settings-import"),
    importInput: document.getElementById("settings-import-input"),
    resetBtn: document.getElementById("settings-reset"),
    backupStatus: document.getElementById("settings-backup-status"),
  };

  /* ---------------------------------------------------------------- */
  /* Saving edits                                                      */
  /* ---------------------------------------------------------------- */

  // The config is plain JSON data, so a JSON round-trip is a reliable
  // deep clone in every browser.
  function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
  }

  // Every edit funnels through here: copy the current config, let the
  // caller change the copy, sanitize it, persist it, and re-render the
  // page behind the dialog. Editing a copy means a half-applied change
  // can never corrupt what's on screen.
  function updateConfig(mutate) {
    const draft = cloneConfig(getCurrentConfig());
    mutate(draft);
    const clean = sanitizeConfig(draft);
    if (!saveUserConfig(clean)) {
      showBackupStatus("Could not save — browser storage is unavailable.", true);
    }
    applyConfig(clean);
    return clean;
  }

  /* ---------------------------------------------------------------- */
  /* Status messages (Backup section)                                  */
  /* ---------------------------------------------------------------- */

  let statusTimeout = null;
  function showBackupStatus(message, sticky = false) {
    if (!els.backupStatus) return;
    els.backupStatus.textContent = message;
    if (statusTimeout) clearTimeout(statusTimeout);
    if (!sticky) {
      statusTimeout = setTimeout(() => {
        els.backupStatus.textContent = "";
      }, 4000);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Filling the simple fields                                         */
  /* ---------------------------------------------------------------- */

  function populateFields() {
    const config = getCurrentConfig();

    if (els.displayName) els.displayName.value = config.user.displayName;
    if (els.pageTitle) els.pageTitle.value = config.user.pageTitle;
    if (els.searchPlaceholder) els.searchPlaceholder.value = config.search.placeholder;

    if (els.showSearch) els.showSearch.checked = config.sections.showSearch !== false;
    if (els.showShortcuts) els.showShortcuts.checked = config.sections.showShortcuts !== false;
    if (els.showNotes) els.showNotes.checked = config.sections.showNotes !== false;
    if (els.newTab) els.newTab.checked = config.behavior.openLinksInNewTab !== false;

    if (els.palette) {
      els.palette.value = isKnownPalette(config.theme.palette) ? config.theme.palette : "default";
    }
    if (els.density) {
      els.density.value = isKnownDensity(config.layout.density)
        ? config.layout.density
        : "comfortable";
    }

    populateEngineSelect(config);
  }

  function populateEngineSelect(config) {
    const select = els.searchEngine;
    if (!select) return;

    select.innerHTML = "";
    SEARCH_PRESETS.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    });

    const preset = findPresetForConfig(config.search);
    if (!preset) {
      // A custom engine (set in config.js or an imported backup) — show it
      // as its own entry so the dropdown doesn't misreport the settings.
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = `Custom (${config.search.engine || "from config.js"})`;
      select.appendChild(option);
    }
    select.value = preset ? preset.id : "custom";
  }

  /* ---------------------------------------------------------------- */
  /* Shortcut groups editor                                            */
  /* ---------------------------------------------------------------- */

  // Small helper for the ↑ / ↓ / ✕ buttons. Everything is built with
  // createElement + textContent (never innerHTML with user data), so a
  // group named "<script>" is just text, not code.
  function createActionButton(symbol, label, action, groupIndex, linkIndex, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-compact";
    button.textContent = symbol;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.action = action;
    button.dataset.group = String(groupIndex);
    if (linkIndex !== null) button.dataset.link = String(linkIndex);
    if (disabled) button.disabled = true;
    return button;
  }

  function createTextInput(className, value, field, groupIndex, linkIndex, label, placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = className;
    input.value = value;
    input.autocomplete = "off";
    input.dataset.field = field;
    input.dataset.group = String(groupIndex);
    if (linkIndex !== null) input.dataset.link = String(linkIndex);
    input.setAttribute("aria-label", label);
    if (placeholder) input.placeholder = placeholder;
    return input;
  }

  function buildLinkRow(link, groupIndex, linkIndex, linkCount) {
    const row = document.createElement("li");
    row.className = "settings-link-row";

    const position = `link ${linkIndex + 1} in group ${groupIndex + 1}`;

    const iconInput = createTextInput(
      "settings-input settings-link-icon-input",
      link.icon,
      "link-icon",
      groupIndex,
      linkIndex,
      `Icon letters for ${position}`,
      "A"
    );
    iconInput.maxLength = 2;

    const nameInput = createTextInput(
      "settings-input",
      link.name,
      "link-name",
      groupIndex,
      linkIndex,
      `Name of ${position}`,
      "Name"
    );

    const urlInput = createTextInput(
      "settings-input settings-link-url-input",
      link.url,
      "link-url",
      groupIndex,
      linkIndex,
      `Web address of ${position}`,
      "https://…"
    );
    // Lets CSS mark a wrong-looking address (see .settings-input:invalid).
    urlInput.pattern = "https?://.+";

    const actions = document.createElement("span");
    actions.className = "settings-row-actions";
    actions.append(
      createActionButton("↑", `Move ${position} up`, "move-link-up", groupIndex, linkIndex, linkIndex === 0),
      createActionButton("↓", `Move ${position} down`, "move-link-down", groupIndex, linkIndex, linkIndex === linkCount - 1),
      createActionButton("✕", `Delete ${position}`, "delete-link", groupIndex, linkIndex, false)
    );

    row.append(iconInput, nameInput, urlInput, actions);
    return row;
  }

  function buildGroupEditor(group, groupIndex, groupCount) {
    const wrapper = document.createElement("div");
    wrapper.className = "settings-group";

    // --- header row: title, shown-toggle, move/delete buttons ---
    const head = document.createElement("div");
    head.className = "settings-group-head";

    const titleInput = createTextInput(
      "settings-input settings-group-title-input",
      group.title,
      "group-title",
      groupIndex,
      null,
      `Title of group ${groupIndex + 1}`,
      "Group title"
    );

    const enabledLabel = document.createElement("label");
    enabledLabel.className = "settings-check settings-check-inline";
    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = group.enabled !== false;
    enabledInput.dataset.field = "group-enabled";
    enabledInput.dataset.group = String(groupIndex);
    const enabledText = document.createElement("span");
    enabledText.textContent = "Shown";
    enabledLabel.append(enabledInput, enabledText);

    const actions = document.createElement("span");
    actions.className = "settings-row-actions";
    actions.append(
      createActionButton("↑", `Move group ${groupIndex + 1} up`, "move-group-up", groupIndex, null, groupIndex === 0),
      createActionButton("↓", `Move group ${groupIndex + 1} down`, "move-group-down", groupIndex, null, groupIndex === groupCount - 1),
      createActionButton("✕", `Delete group ${groupIndex + 1}`, "delete-group", groupIndex, null, false)
    );

    head.append(titleInput, enabledLabel, actions);
    wrapper.appendChild(head);

    // --- link rows ---
    if (group.links.length > 0) {
      const list = document.createElement("ul");
      list.className = "settings-links";
      group.links.forEach((link, linkIndex) => {
        list.appendChild(buildLinkRow(link, groupIndex, linkIndex, group.links.length));
      });
      wrapper.appendChild(list);
    }

    const addLinkBtn = document.createElement("button");
    addLinkBtn.type = "button";
    addLinkBtn.className = "btn btn-ghost settings-add-link";
    addLinkBtn.textContent = "+ Add link";
    addLinkBtn.dataset.action = "add-link";
    addLinkBtn.dataset.group = String(groupIndex);
    wrapper.appendChild(addLinkBtn);

    return wrapper;
  }

  function renderGroupsEditor() {
    const container = els.groupsEditor;
    if (!container) return;

    container.innerHTML = "";
    const groups = getCurrentConfig().shortcutGroups;

    if (groups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "settings-note";
      empty.textContent = "No groups yet — use “+ Add group” below.";
      container.appendChild(empty);
      return;
    }

    groups.forEach((group, groupIndex) => {
      container.appendChild(buildGroupEditor(group, groupIndex, groups.length));
    });
  }

  // After a structural change the editor is rebuilt, so focus has to be
  // put back somewhere sensible by hand (e.g. into a freshly added row).
  function focusEditorInput(field, groupIndex, linkIndex) {
    if (!els.groupsEditor) return;
    let selector = `[data-field="${field}"][data-group="${groupIndex}"]`;
    if (linkIndex !== undefined) selector += `[data-link="${linkIndex}"]`;
    const input = els.groupsEditor.querySelector(selector);
    if (input) {
      input.focus();
      if (typeof input.select === "function") input.select();
    }
  }

  function swapArrayItems(array, indexA, indexB) {
    const temp = array[indexA];
    array[indexA] = array[indexB];
    array[indexB] = temp;
  }

  // One delegated click handler for every ↑ / ↓ / ✕ / add-link button in
  // the editor — the buttons carry their action and indexes as data
  // attributes, so rebuilding the editor never re-binds anything.
  function handleEditorClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;

    const action = button.dataset.action;
    const groupIndex = Number(button.dataset.group);
    const linkIndex = button.dataset.link === undefined ? null : Number(button.dataset.link);

    if (action === "move-group-up" || action === "move-group-down") {
      const offset = action === "move-group-up" ? -1 : 1;
      updateConfig((draft) => {
        const target = groupIndex + offset;
        if (target < 0 || target >= draft.shortcutGroups.length) return;
        swapArrayItems(draft.shortcutGroups, groupIndex, target);
      });
      renderGroupsEditor();
      return;
    }

    if (action === "delete-group") {
      const group = getCurrentConfig().shortcutGroups[groupIndex];
      if (!group) return;
      const linkCount = group.links.length;
      const label = group.title.trim() || "this group";
      if (linkCount > 0) {
        const confirmed = window.confirm(
          `Delete “${label}” and its ${linkCount} link${linkCount === 1 ? "" : "s"}? This cannot be undone.`
        );
        if (!confirmed) return;
      }
      updateConfig((draft) => {
        draft.shortcutGroups.splice(groupIndex, 1);
      });
      renderGroupsEditor();
      return;
    }

    if (action === "add-link") {
      let newLinkIndex = 0;
      updateConfig((draft) => {
        const group = draft.shortcutGroups[groupIndex];
        if (!group) return;
        group.links.push({ name: "", url: "", icon: "" });
        newLinkIndex = group.links.length - 1;
      });
      renderGroupsEditor();
      focusEditorInput("link-name", groupIndex, newLinkIndex);
      return;
    }

    if (linkIndex === null) return;

    if (action === "move-link-up" || action === "move-link-down") {
      const offset = action === "move-link-up" ? -1 : 1;
      updateConfig((draft) => {
        const links = draft.shortcutGroups[groupIndex] && draft.shortcutGroups[groupIndex].links;
        if (!links) return;
        const target = linkIndex + offset;
        if (target < 0 || target >= links.length) return;
        swapArrayItems(links, linkIndex, target);
      });
      renderGroupsEditor();
      return;
    }

    if (action === "delete-link") {
      const group = getCurrentConfig().shortcutGroups[groupIndex];
      const link = group && group.links[linkIndex];
      if (!link) return;
      // Only ask when the row actually contains something.
      if (link.name.trim() || link.url.trim()) {
        const confirmed = window.confirm(`Remove “${link.name.trim() || link.url.trim()}”?`);
        if (!confirmed) return;
      }
      updateConfig((draft) => {
        const links = draft.shortcutGroups[groupIndex] && draft.shortcutGroups[groupIndex].links;
        if (links) links.splice(linkIndex, 1);
      });
      renderGroupsEditor();
      return;
    }
  }

  // One delegated change handler for every text input and checkbox in the
  // editor. Text edits don't rebuild the editor (the input already shows
  // the right value, and rebuilding would break Tab-navigation), they only
  // re-render the page behind the dialog.
  function handleEditorChange(event) {
    const input = event.target.closest("[data-field]");
    if (!input) return;

    const field = input.dataset.field;
    const groupIndex = Number(input.dataset.group);
    const linkIndex = input.dataset.link === undefined ? null : Number(input.dataset.link);

    updateConfig((draft) => {
      const group = draft.shortcutGroups[groupIndex];
      if (!group) return;

      if (field === "group-title") {
        group.title = input.value;
      } else if (field === "group-enabled") {
        group.enabled = input.checked;
      } else if (linkIndex !== null && group.links[linkIndex]) {
        const link = group.links[linkIndex];
        if (field === "link-name") link.name = input.value;
        if (field === "link-url") link.url = input.value.trim();
        if (field === "link-icon") link.icon = input.value.trim();
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Backup: export, import, reset                                     */
  /* ---------------------------------------------------------------- */

  function exportBackup() {
    const backup = {
      // Identifies the file on import, so a random JSON file isn't
      // mistaken for a homepage backup.
      format: "homepage-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      // The color theme travels inside config (theme.palette).
      config: getCurrentConfig(),
      notes: readNotesFromStorage(),
      theme: readStoredTheme(),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homepage-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showBackupStatus("Backup downloaded.");
  }

  // Cloud sync can offer the same proven local backup action without
  // duplicating download logic or reaching into private panel state.
  window.homepageExportBackup = exportBackup;

  function applyImportedData(parsed) {
    let rawConfig = null;
    let notes;
    let theme = null;

    if (parsed && typeof parsed === "object") {
      if (parsed.format === "homepage-backup" && parsed.config && typeof parsed.config === "object") {
        // A full backup made by the Export button.
        rawConfig = parsed.config;
        if (typeof parsed.notes === "string") notes = parsed.notes;
        if (parsed.theme === "light" || parsed.theme === "dark") theme = parsed.theme;
        // Older backups carried the color theme as a separate field.
        if (isKnownPalette(parsed.palette)) {
          rawConfig.theme = { ...(rawConfig.theme || {}), palette: parsed.palette };
        }
      } else if (parsed.shortcutGroups || parsed.user || parsed.search) {
        // A bare config object (e.g. copied out of config.js).
        rawConfig = parsed;
      }
    }

    if (!rawConfig) {
      showBackupStatus("Import failed: that file is not a homepage backup.", true);
      return;
    }

    const clean = sanitizeConfig(rawConfig);
    if (!saveUserConfig(clean)) {
      showBackupStatus("Imported, but could not save — storage is unavailable.", true);
    } else {
      showBackupStatus("Backup imported.");
    }
    applyConfig(clean);

    if (notes !== undefined) {
      writeNotesToStorage(notes);
      const textarea = document.getElementById("notes-textarea");
      if (textarea) textarea.value = notes;
    }
    if (theme) {
      applyTheme(theme);
      writeStoredTheme(theme);
    }

    populateFields();
    renderGroupsEditor();
  }

  function importBackupFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyImportedData(JSON.parse(String(reader.result)));
      } catch (error) {
        console.warn("Could not import backup file.", error);
        showBackupStatus("Import failed: the file is not valid JSON.", true);
      }
    };
    reader.onerror = () => {
      showBackupStatus("Import failed: the file could not be read.", true);
    };
    reader.readAsText(file);
  }

  function resetToConfigFile() {
    const confirmed = window.confirm(
      "Discard every change made in this panel (including the color theme) and go back " +
        "to the settings in config.js? Your notes and dark/light choice are kept."
    );
    if (!confirmed) return;

    clearUserConfig();
    const base = typeof homepageConfig !== "undefined" ? homepageConfig : null;
    applyConfig(sanitizeConfig(base));

    populateFields();
    renderGroupsEditor();
    showBackupStatus("Restored the settings from config.js.");
  }

  /* ---------------------------------------------------------------- */
  /* Wiring it all up (runs once)                                      */
  /* ---------------------------------------------------------------- */

  openBtn.addEventListener("click", () => {
    populateFields();
    renderGroupsEditor();
    dialog.showModal();
  });

  if (els.closeBtn) {
    els.closeBtn.addEventListener("click", () => dialog.close());
  }

  // Clicking the dimmed backdrop closes the panel. Clicks inside land on
  // .settings-body (which fills the dialog), so the target is only the
  // dialog itself when the click was outside it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // --- simple fields ---
  if (els.displayName) {
    els.displayName.addEventListener("change", () => {
      updateConfig((draft) => {
        draft.user.displayName = els.displayName.value.trim();
      });
    });
  }

  if (els.pageTitle) {
    els.pageTitle.addEventListener("change", () => {
      updateConfig((draft) => {
        draft.user.pageTitle = els.pageTitle.value.trim();
      });
    });
  }

  if (els.searchEngine) {
    els.searchEngine.addEventListener("change", () => {
      const preset = SEARCH_PRESETS.find((entry) => entry.id === els.searchEngine.value);
      if (!preset) return; // "custom" re-selected — nothing to change
      updateConfig((draft) => {
        draft.search.engine = preset.label;
        draft.search.actionUrl = preset.actionUrl;
        draft.search.queryParameter = preset.queryParameter;
      });
      // A former custom entry disappears once a preset is chosen.
      populateEngineSelect(getCurrentConfig());
    });
  }

  if (els.searchPlaceholder) {
    els.searchPlaceholder.addEventListener("change", () => {
      updateConfig((draft) => {
        draft.search.placeholder = els.searchPlaceholder.value.trim() || "Search the web";
      });
      els.searchPlaceholder.value = getCurrentConfig().search.placeholder;
    });
  }

  if (els.palette) {
    els.palette.addEventListener("change", () => {
      updateConfig((draft) => {
        draft.theme.palette = isKnownPalette(els.palette.value) ? els.palette.value : "default";
      });
    });
  }

  if (els.density) {
    els.density.addEventListener("change", () => {
      updateConfig((draft) => {
        draft.layout.density = isKnownDensity(els.density.value)
          ? els.density.value
          : "comfortable";
      });
    });
  }

  const checkboxBindings = [
    [els.showSearch, (draft, checked) => (draft.sections.showSearch = checked)],
    [els.showShortcuts, (draft, checked) => (draft.sections.showShortcuts = checked)],
    [els.showNotes, (draft, checked) => (draft.sections.showNotes = checked)],
    [els.newTab, (draft, checked) => (draft.behavior.openLinksInNewTab = checked)],
  ];
  checkboxBindings.forEach(([checkbox, assign]) => {
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      updateConfig((draft) => assign(draft, checkbox.checked));
    });
  });

  // --- groups editor (delegated) ---
  if (els.groupsEditor) {
    els.groupsEditor.addEventListener("click", handleEditorClick);
    els.groupsEditor.addEventListener("change", handleEditorChange);
  }

  if (els.addGroupBtn) {
    els.addGroupBtn.addEventListener("click", () => {
      let newGroupIndex = 0;
      updateConfig((draft) => {
        draft.shortcutGroups.push({ title: "New group", enabled: true, links: [] });
        newGroupIndex = draft.shortcutGroups.length - 1;
      });
      renderGroupsEditor();
      focusEditorInput("group-title", newGroupIndex);
    });
  }

  // --- backup ---
  if (els.exportBtn) els.exportBtn.addEventListener("click", exportBackup);

  if (els.importBtn && els.importInput) {
    els.importBtn.addEventListener("click", () => els.importInput.click());
    els.importInput.addEventListener("change", () => {
      const file = els.importInput.files && els.importInput.files[0];
      if (file) importBackupFile(file);
      // Reset so importing the same file twice in a row still fires.
      els.importInput.value = "";
    });
  }

  if (els.resetBtn) els.resetBtn.addEventListener("click", resetToConfigFile);

  document.addEventListener("homepage:config-applied", () => {
    populateFields();
    renderGroupsEditor();
  });
})();
