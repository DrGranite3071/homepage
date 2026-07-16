# Homepage

A personal browser start page and productivity dashboard, built with plain
HTML, CSS, and JavaScript — no frameworks, no build tools, no server, no
external services.

It combines:

- a browser start page: clock, date, personalized greeting, web search, and
  quick shortcuts to your frequently used sites;
- a small productivity dashboard: categorized shortcut groups and a
  "Today's focus" notes area;
- an in-page **Settings panel** for editing all of the above without
  touching any code, plus backup export/import.

This implements the roadmap through **Stage 3: In-page editing**. It is
intentionally simple and is meant to be a solid backbone you keep editing,
not a finished product.

> ⚠️ **Public-site warning.** If this repository is public and/or published
> with GitHub Pages, **everything in it is visible to the whole internet**:
> every file, every commit, and the full edit history. Never put passwords,
> API keys, tokens, private documents, or personal notes in any file here.
> A static site has no server and cannot protect anything with a login —
> treat every committed file as public.

## Project structure

```
/
├── index.html        the page structure (semantic HTML)
├── styles.css        all visual styling, organized into labeled sections
├── config.js         the default settings (a plain data file)
├── script.js         the logic that reads the settings and renders the page
├── settings.js       the in-page Settings panel (Stage 3)
├── README.md         this file
├── .gitignore        keeps local tool settings out of the repository
└── assets/
    └── icons/        reserved for future custom icons (currently unused)
```

`index.html` loads `config.js` **before** `script.js`, because both read a
variable called `homepageConfig` that is defined in `config.js`, and
`settings.js` loads last because it uses helpers defined in `script.js`.
A small inline script in `index.html` also applies your saved theme
*before* the page paints, so there is no flash of the wrong theme.

## How to open the page locally

You don't need to install anything. From the project folder, start a simple
local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. (Opening `index.html`
directly by double-clicking also mostly works, but some browsers restrict
local files in ways that can cause surprises later, so the local server is
the recommended way.)

If you're working in GitHub Codespaces, see "Previewing in Codespaces"
below.

## Editing from the page: the Settings panel

Click **Settings** (top right) to edit almost everything without touching
any files:

- **Profile** — your display name and the browser tab title.
- **Search** — pick an engine (Google, DuckDuckGo, Bing, Brave) and the
  hint text shown in the empty search box.
- **Page** — show/hide the search bar, shortcut groups, and notes area,
  and choose whether shortcuts open in a new tab.
- **Theme** — pick a color theme (Teal or Midnight indigo). Each color
  theme has a dark and a light variation; the header button switches
  between those, so the two choices combine. The color theme is saved
  with the rest of the settings, so it persists on this device and is
  included in backup files. To make it the default on *every* device,
  set `theme.palette` in `config.js` and push — a static site has no
  server, so that committed value is the cross-device source of truth.
- **Layout** — choose Compact, Comfortable, or Spacious density. Density
  changes card padding and the gaps between dashboard items without changing
  colors, content, or features. Comfortable is the default.
- **Shortcut groups** — add, rename, hide, reorder (↑/↓), and delete
  groups; add, edit, reorder, and delete the links inside them. Web
  addresses must start with `https://` — a row with an empty or invalid
  address gets a red border and is kept in the panel but not shown on
  the page.
- **Backup** — see "Backup, restore, and reset" below.

Changes save automatically to your browser's localStorage (key
`homepage.config`) and the page updates live behind the panel.

**How this relates to `config.js`:** the file provides the *defaults*;
anything you save from the Settings panel is stored in the browser and
**overrides the file on that device**. So if you edit `config.js` after
using the panel, you won't see the file's changes until you press
**Reset to config.js** in the panel (or use it on a device/browser with
no saved changes). Like the notes, panel changes do not sync between
devices — export a backup to move them.

### Backup, restore, and reset

In the **Backup** section of the Settings panel:

- **Export backup** downloads a JSON file containing your settings, your
  notes, theme choices (mode and color theme), and layout density. Keep it
  somewhere safe; it's plain text you can read and edit.
- **Import backup** loads such a file and replaces your current settings,
  notes, and theme with its contents. (It also accepts a bare
  `homepageConfig`-style object copied out of `config.js`.) Files that
  aren't a homepage backup are rejected with a message.
- **Reset to config.js** deletes the browser-saved settings and goes back
  to whatever `config.js` says (including its color theme). Notes and the
  dark/light choice are kept.

> Note: a backup file contains your name, your links, and your notes — if
> you share or commit it, all of that becomes visible to others.

Backups made before layout density was added remain compatible. When a
backup has no density value, or contains an unrecognized one, the page uses
**Comfortable** safely.

## Editing the defaults (`config.js`)

The defaults live in `config.js`, in one object called `homepageConfig`.
Every editable spot is marked with an `EDIT HERE` comment. This file is
the right place for changes you want in the repository itself (for
example, so every new device starts from your real links); day-to-day
tweaks are easier in the Settings panel. Quick map:

| What you want to change      | Where in `config.js`         |
| ---------------------------- | ---------------------------- |
| Your name in the greeting    | `user.displayName`           |
| Browser tab title            | `user.pageTitle`             |
| Greeting phrases             | `greeting`                   |
| Search engine / placeholder  | `search`                     |
| Hide/show whole sections     | `sections`                   |
| Links open in new tab or not | `behavior.openLinksInNewTab` |
| Shortcut categories & links  | `shortcutGroups`             |
| Notes heading & placeholder  | `notes`                      |
| Default theme (dark/light)   | `theme.default`              |
| Default color theme          | `theme.palette`              |
| Default layout density       | `layout.density`             |

### Your display name and page title

```js
user: {
  displayName: "Robert",          // used in "Good morning, Robert"
  pageTitle: "Robert's Homepage", // shown in the browser tab
},
```

### Search engine

```js
search: {
  engine: "Google",
  actionUrl: "https://www.google.com/search",
  queryParameter: "q",
  placeholder: "Search the web",
},
```

To switch engines, change `actionUrl` and `queryParameter`. For example,
for DuckDuckGo:

```js
search: {
  engine: "DuckDuckGo",
  actionUrl: "https://duckduckgo.com/",
  queryParameter: "q",
  placeholder: "Search DuckDuckGo",
},
```

Tip: pressing the `/` key anywhere on the page jumps to the search box —
handy with a keyboard on desktop or Samsung DeX.

### Adding a new category (shortcut group)

Shortcut groups live in the `shortcutGroups` array. Each group is one card.
The order in the array is the order on the page. To add a group, copy an
existing block and edit it:

```js
shortcutGroups: [
  // ...existing groups...
  {
    title: "Entertainment",
    enabled: true,
    links: [
      { name: "Netflix", url: "https://www.netflix.com", icon: "N" },
    ],
  },
],
```

- **Remove a group:** delete its block, or set `enabled: false` to hide it
  without deleting it.
- **Reorder groups:** cut and paste a whole `{ ... }` block to a different
  position in the array.

### Adding a shortcut link

Each group has a `links` array. Each link needs a `name` and a `url`
(which must start with `https://`). `icon` is optional — it's the 1–2
character badge next to the link; if you leave it out, the first letter of
`name` is used automatically.

```js
links: [
  { name: "Example Site", url: "https://example.com", icon: "E" },
],
```

Links with a missing name, missing URL, or a URL that doesn't start with
`http(s)://` are skipped with a warning in the browser console (F12)
instead of breaking the page.

### Hiding sections and link behavior

```js
sections: {
  showSearch: true,     // false hides the search bar
  showShortcuts: true,  // false hides all shortcut cards
  showNotes: true,      // false hides the notes area
},

behavior: {
  openLinksInNewTab: true, // false = shortcuts open in the same tab
},
```

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

This only controls the theme on the very first visit — after that, the
choice you make with the theme toggle (saved in your browser) takes over.

### Layout density

Open **Settings → Layout** to choose how much breathing room the dashboard
uses:

- **Compact** uses the smallest card padding and gaps, fitting more content
  on screen while keeping controls touch-friendly.
- **Comfortable** is the balanced default.
- **Spacious** gives cards and dashboard sections the most room.

The choice applies immediately and is stored with the rest of your settings
in the browser's `homepage.config` localStorage entry. It persists after a
refresh, is included in exported backups, and returns to the `config.js`
default when you use **Reset to config.js**.

## Changing colors

Colors, spacing, and sizes are defined once at the top of `styles.css`, in
the `1. VARIABLES AND THEMES` section, as CSS custom properties:

```css
:root {
  --color-bg: #12161c;      /* page background (dark theme) */
  --color-accent: #3fb8af;  /* teal accent used on buttons and badges */
  ...
}
```

Change a value there and it updates everywhere it is used. The default
(teal) dark values are under `:root`; its light overrides are under
`:root[data-theme="light"]`; each additional color theme (like Midnight
indigo) has its own `:root[data-palette="..."]` pair right below. To add
a new color theme, copy the two indigo blocks, pick a new `data-palette`
name, and add a matching `<option>` to the Settings panel's color theme
dropdown in `index.html` plus the palette lists in `script.js`
(`KNOWN_PALETTES`) and the inline script in `index.html`. If you change
one variation, check the others still look right.

## How notes are stored (and what localStorage means)

The "Today's focus" text saves automatically to your browser's
**localStorage** a moment after you stop typing (you'll see a brief
"Saved" message), and reloads next time you open the page. The "Clear"
button asks for confirmation first.

localStorage is a small storage area **inside your browser on your
device**. It is not part of this repository and is never uploaded
anywhere — but it also means:

- notes do **not** sync between devices or browsers;
- clearing the browser's site data deletes them;
- anyone using the same browser profile on your device can see them.

Your dark/light choice and your Settings-panel changes (which include the
color theme) are stored the same way (keys `homepage.theme` and
`homepage.config`) — which is why the panel's **Export backup** button
exists.

## What is public when you use GitHub Pages

GitHub Pages serves the files in this repository as a website. That means:

- **Public:** everything committed to the repository — `index.html`,
  `config.js` (including your name and your list of links), all styling
  and code, and the full git history.
- **Private (stays on your device):** your notes, your theme choice, and
  everything you change in the Settings panel, because they live in your
  browser's localStorage, not in the repo. (Exported backup files are
  also private — until you commit or share them.)

If you don't want your real name or your link list to be public, either
keep the repository private (Pages then requires a paid plan, see the
roadmap's Stage 5 for alternatives) or use placeholder values.

## Publishing with GitHub Pages

1. Push the repository to GitHub (see the Git section below).
2. On GitHub, open the repository and go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Set **Branch** to `main` and **Folder** to `/ (root)`, then **Save**.
5. After a minute or two, the site appears at
   `https://<your-username>.github.io/<repository-name>/`
   (for this repository: `https://drgranite3071.github.io/homepage/`).

Every later `git push` to `main` redeploys automatically; changes usually
appear within a few minutes. If you see an old version, do a hard refresh
(Ctrl+Shift+R) — browsers cache start pages aggressively.

To keep cached and fresh files from mixing (which can make a new feature
silently misbehave), every css/js link in `index.html` carries a `?v=N`
version number. **Bump that number on all four links whenever you change
any css/js file** — browsers then treat them as new files and fetch them
together with the updated page.

## Saving your changes with Git

After editing files, from the project folder:

```bash
git status               # see what changed
git diff                 # review the actual edits
git add .                # stage all changes
git commit -m "message"  # commit with a short description
git push                 # send commits to GitHub (and redeploy Pages)
```

## Previewing in Codespaces

1. Run `python3 -m http.server 8000` in the terminal.
2. Open the **Ports** tab, find port `8000`, and click the open-in-browser
   (globe) icon.
3. The forwarded port is private to you by default — don't change its
   visibility to "Public" unless you specifically want to share it.

### Stopping the Codespace (saving compute hours)

A running Codespace consumes your free compute hours even when idle. When
you're done working:

- go to <https://github.com/codespaces>, click **⋯** next to the codespace,
  and choose **Stop codespace**; or
- in VS Code, open the command palette (Ctrl+Shift+P) and run
  **Codespaces: Stop Current Codespace**.

Stopping keeps all your files; only delete the codespace if you've pushed
everything to GitHub. Codespaces also auto-stop after ~30 minutes of
inactivity by default.

## Current limitations

- Notes and Settings-panel changes live in one browser only — no sync
  between devices (export/import a backup file to move them by hand).
- No weather, calendar, or other live integrations.
- No offline support or installability (not a PWA yet).
- Icons are simple text badges, not real logos.

These are intentional for this stage — see the roadmap below.

## Development pathway

**Stage 1 — Foundation (this version)**
Configurable homepage: greeting, clock, search, shortcut groups, local
notes, theme toggle, responsive layout.

**Stage 2 — Personalization** *(ongoing — now done from the page)*
Replace placeholder links with real ones and refine categories; the
Settings panel makes this a continuous activity rather than a one-off
stage. Typography/background/layout variants remain open ideas.

**Stage 3 — In-page editing (this version)**
Settings panel, add and edit links from the interface, reorder categories,
import and export configuration, backup and restore.

**Stage 4 — Optional widgets** *(not implemented yet)*
Weather, calendar, tasks — with a privacy review before adding any
external APIs.

**Stage 5 — Hosting and security** *(not implemented yet)*
Evaluate Cloudflare Pages, keep the source repository private where
possible, add Cloudflare Access or another real identity layer so only
your account can open the page. (Client-side "password screens" on a
static site are decoration, not security — they will not be used.)

**Stage 6 — Installation** *(not implemented yet)*
PWA support, offline behavior, browser start-page usage, optional Android
wrapper or APK.
