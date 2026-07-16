# Homepage

A personal browser start page and productivity dashboard, built with plain
HTML, CSS, and JavaScript — no frameworks, no build tools, no server, no
external services.

It combines:

- a browser start page: clock, date, personalized greeting, web search, and
  quick shortcuts to your frequently used sites;
- a small productivity dashboard: categorized shortcut groups and a
  "Today's focus" notes area.

This is **Stage 1: Foundation**. It is intentionally simple and is meant to
be a solid backbone you keep editing, not a finished product.

## Project structure

```
/
├── index.html        the page structure (semantic HTML)
├── styles.css         all visual styling, organized into labeled sections
├── config.js           <-- the file you edit most often (your data)
├── script.js           the logic that reads config.js and renders the page
├── README.md           this file
└── assets/
    └── icons/          reserved for future custom icons (currently unused)
```

`index.html` loads `config.js` **before** `script.js`, because `script.js`
reads a variable called `homepageConfig` that is defined in `config.js`.

## How to open the page locally

You don't need to install anything. From the project folder, start a simple
local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. (Opening `index.html`
directly by double-clicking it also mostly works, but some browsers
restrict local files in ways that can affect things later, so the local
server is the recommended way.)

If you're working in GitHub Codespaces, see the "Previewing in Codespaces"
section below.

## Editing your information (`config.js`)

Almost everything you'll want to personalize lives in `config.js`, in one
object called `homepageConfig`.

### Your display name

```js
user: {
  displayName: "Robert",
},
```

Change `"Robert"` to your name. It's used in the greeting, e.g.
"Good morning, Robert".

### Search engine

```js
search: {
  engine: "Google",
  actionUrl: "https://www.google.com/search",
  queryParameter: "q",
  placeholder: "Search the web",
},
```

To switch engines, change `actionUrl` and `queryParameter` to match the
engine you want. For example, for DuckDuckGo:

```js
search: {
  engine: "DuckDuckGo",
  actionUrl: "https://duckduckgo.com/",
  queryParameter: "q",
  placeholder: "Search DuckDuckGo",
},
```

### Adding, removing, or reordering shortcut groups

Shortcut groups live in the `shortcutGroups` array. Each group is one card
on the dashboard. The order in the array is the order they appear on the
page — reorder them by moving entries around in the array.

```js
shortcutGroups: [
  {
    title: "Study",
    enabled: true,
    links: [
      { name: "Wikipedia", url: "https://www.wikipedia.org", icon: "W" },
    ],
  },
],
```

- To **add a new group**, copy one of the existing `{ title: ..., enabled:
  true, links: [...] }` blocks and add it to the array.
- To **remove a group**, delete its block from the array (or set
  `enabled: false` to hide it without deleting it).
- To **reorder groups**, cut and paste a whole `{ ... }` block to a
  different position in the array.

### Adding or removing links inside a group

Each group has a `links` array. Each link needs a `name` and a `url`. `icon`
is optional — it's the 1-2 character badge shown next to the link; if you
leave it out, the first letter of `name` is used automatically.

```js
links: [
  { name: "Example Site", url: "https://example.com", icon: "E" },
],
```

Add a new `{ name, url, icon }` object to add a link, or delete one to
remove it.

### Notes area label

```js
notes: {
  label: "Today's focus",
  placeholder: "What matters most today?",
},
```

### Default theme

```js
theme: {
  default: "dark", // or "light"
},
```

This only controls the theme the very first time someone visits — after
that, their own toggle choice (saved in the browser) takes over.

## Changing colors

Colors, spacing, and other visual values are defined once at the top of
`styles.css`, in the `1. VARIABLES AND THEMES` section, as CSS custom
properties (variables). For example:

```css
:root {
  --color-bg: #12161c;
  --color-accent: #3fb8af;
  ...
}
```

Change a value there and it updates everywhere that variable is used. Dark
theme values are under `:root`, and light theme overrides are under
`:root[data-theme="light"]`.

## How local notes are stored

The "Today's focus" text area saves its content automatically to your
browser's `localStorage` a moment after you stop typing, and reloads it the
next time you open the page. There is a "Clear" button that asks for
confirmation before erasing the saved note.

## What data never leaves your browser

Everything on this page — your name, notes, shortcuts, and theme choice —
is stored only in `config.js` (which you control) and in your browser's
`localStorage`. Nothing is sent to a server, no analytics or tracking
scripts are included, and the only outgoing network requests this page
makes are the ones you trigger yourself (submitting a search, or clicking a
shortcut link).

## Current limitations

- Shortcuts and settings can only be edited by changing `config.js`
  directly — there is no in-page settings editor yet.
- No weather, calendar, email, or other live integrations.
- No offline support or installability (not a PWA yet).
- No import/export of your configuration.
- Icons are simple text badges, not real icons/logos.

These are all intentional for this stage — see the roadmap below.

## Development pathway

**Stage 1 — Foundation (this version)**
Semantic layout, configurable shortcuts, search, clock and greeting, local
notes, theme toggle, responsive design.

**Stage 2 — Personalization** *(not implemented yet)*
Replace placeholder links with your real links, refine visual identity,
choose typography and spacing, optional background choices, optional
layout variants.

**Stage 3 — Interface editing** *(not implemented yet)*
Settings interface, add/edit/remove shortcuts from the page itself, reorder
categories, import/export configuration, stronger validation and recovery.

**Stage 4 — Optional live widgets** *(not implemented yet)*
Weather, calendar, tasks, carefully chosen APIs, with a privacy and
security review before implementation.

**Stage 5 — Installation and synchronization** *(not implemented yet)*
PWA support, offline behavior, optional synchronization, hosting and
access-control decisions.

**Stage 6 — Advanced options** *(not implemented yet)*
Browser extension, Android wrapper or APK, real authentication if private
remote data is introduced, server-side components only if genuinely
needed.

## Previewing in Codespaces

1. Run `python3 -m http.server 8000` in the terminal.
2. Open the **Ports** tab in Codespaces, find port `8000`, and click the
   globe/open-in-browser icon (or use "Open in Browser" from its context
   menu).
3. By default the forwarded port is private to you — don't change its
   visibility to "Public" unless you specifically want to share it.

## Saving your changes with Git

After editing files, from the project folder:

```bash
git status              # see what changed
git add .                # stage all changes
git commit -m "message"  # commit with a short description
git push                 # send commits to GitHub
```
