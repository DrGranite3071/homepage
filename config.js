/*
  config.js
  ---------
  The DEFAULT settings for the page.

  Since Stage 3 you normally edit everything from the in-page Settings
  panel instead. Changes made there are saved in the browser and OVERRIDE
  this file on that device — the panel's "Reset to config.js" button
  brings these defaults back. This file is still the right place for
  defaults you want stored in the repository itself.

  It controls:
    - your name, page title, and greeting
    - which search engine is used
    - the shortcut groups and links shown on the dashboard
    - which sections are visible
    - whether links open in a new tab
    - the default theme and the notes label

  index.html loads this file BEFORE script.js, so script.js can read
  the "homepageConfig" object defined below.

  Tip: if you break the structure below (missing comma, missing quote,
  etc.), script.js is written to detect that and fall back to defaults
  instead of crashing the whole page — but check the browser console
  (F12) for warnings if something looks wrong.
*/

const homepageConfig = {
  // ----------------------------------------------------------------
  // USER: basic personalization
  // ----------------------------------------------------------------
  user: {
    // EDIT HERE: your name, shown in the greeting ("Good morning, Robert")
    displayName: "Robert",

    // EDIT HERE: the browser tab title
    pageTitle: "Robert's Homepage",
  },

  greeting: {
    // EDIT HERE: text shown before your name for each time of day
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },

  // ----------------------------------------------------------------
  // SEARCH: which engine the search box submits to
  // ----------------------------------------------------------------
  // Examples:
  //   Google:     actionUrl: "https://www.google.com/search",  queryParameter: "q"
  //   DuckDuckGo: actionUrl: "https://duckduckgo.com/",        queryParameter: "q"
  //   Bing:       actionUrl: "https://www.bing.com/search",    queryParameter: "q"
  search: {
    engine: "Google",
    actionUrl: "https://www.google.com/search",
    // The URL query parameter the engine expects, e.g. ?q=your+search
    queryParameter: "q",
    // EDIT HERE: the hint text shown inside the empty search box
    placeholder: "Search the web",
  },

  // ----------------------------------------------------------------
  // SECTIONS: show or hide whole parts of the page
  // ----------------------------------------------------------------
  // EDIT HERE: set any of these to false to hide that section.
  sections: {
    showSearch: true,
    showShortcuts: true,
    showNotes: true,
  },

  // ----------------------------------------------------------------
  // BEHAVIOR: how links act
  // ----------------------------------------------------------------
  behavior: {
    // EDIT HERE: true = shortcuts open in a new tab, false = same tab
    openLinksInNewTab: true,
  },

  // ----------------------------------------------------------------
  // SHORTCUT GROUPS: the cards shown on the dashboard
  // ----------------------------------------------------------------
  // Each group needs:
  //   title    - group heading, e.g. "Study"
  //   enabled  - set to false to hide the whole group without deleting it
  //   links    - array of { name, url, icon }
  //              "icon" is optional: 1-2 letters/characters shown in a badge.
  //              If left out, the first letter of "name" is used instead.
  //              URLs must start with https:// (or http://).
  //
  // EDIT HERE: replace these placeholder links with your own.
  shortcutGroups: [
    {
      title: "Study",
      enabled: true,
      links: [
        { name: "Wikipedia", url: "https://www.wikipedia.org", icon: "W" },
        { name: "Khan Academy", url: "https://www.khanacademy.org", icon: "K" },
      ],
    },
    {
      title: "Work",
      enabled: true,
      links: [
        { name: "Google Drive", url: "https://drive.google.com", icon: "D" },
        { name: "Trello", url: "https://trello.com", icon: "T" },
      ],
    },
    {
      title: "Communication",
      enabled: true,
      links: [
        { name: "Gmail", url: "https://mail.google.com", icon: "G" },
        { name: "WhatsApp Web", url: "https://web.whatsapp.com", icon: "W" },
      ],
    },
    {
      title: "Tools",
      enabled: true,
      links: [
        { name: "GitHub", url: "https://github.com", icon: "H" },
        { name: "YouTube", url: "https://www.youtube.com", icon: "Y" },
      ],
    },
  ],

  // ----------------------------------------------------------------
  // NOTES: the "Today's focus" text area
  // ----------------------------------------------------------------
  notes: {
    // EDIT HERE: the heading above the notes box
    label: "Today's focus",
    // EDIT HERE: the hint text shown when the notes box is empty
    placeholder: "What matters most today?",
  },

  // ----------------------------------------------------------------
  // THEME: default appearance before the user picks one themselves
  // ----------------------------------------------------------------
  theme: {
    // EDIT HERE: "dark" or "light". Only used on the very first visit;
    // after that, the theme-toggle choice saved in the browser wins.
    default: "dark",

    // EDIT HERE: the color theme — "default" (teal) or "indigo"
    // (Midnight indigo). Because this file is in the repository, the value
    // here is what every device starts with (your cross-device choice);
    // a different choice made in the Settings panel wins on that device.
    palette: "indigo",
  },
};
