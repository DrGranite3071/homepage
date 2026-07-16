/*
  config.js
  ---------
  This is the ONLY file you should need to edit regularly.

  It controls:
    - your name and greeting
    - which search engine is used
    - the shortcut groups and links shown on the dashboard
    - default theme and notes label

  index.html loads this file BEFORE script.js, so script.js can read
  the "homepageConfig" object defined below.

  Tip: if you break the JSON-like structure below (missing comma, missing
  quote, etc.), script.js is written to detect that and show a warning
  instead of crashing the whole page.
*/

const homepageConfig = {
  // ----------------------------------------------------------------
  // USER: basic personalization
  // ----------------------------------------------------------------
  user: {
    // Shown in the greeting, e.g. "Good morning, Robert"
    displayName: "Robert",
  },

  greeting: {
    // Text shown before the name for each time of day.
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },

  // ----------------------------------------------------------------
  // SEARCH: which engine the search box submits to
  // ----------------------------------------------------------------
  search: {
    engine: "Google",
    actionUrl: "https://www.google.com/search",
    // The URL query parameter the engine expects, e.g. ?q=your+search
    queryParameter: "q",
    placeholder: "Search the web",
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
    label: "Today's focus",
    placeholder: "What matters most today?",
  },

  // ----------------------------------------------------------------
  // THEME: default appearance before the user picks one themselves
  // ----------------------------------------------------------------
  theme: {
    // "dark" or "light"
    default: "dark",
  },
};
