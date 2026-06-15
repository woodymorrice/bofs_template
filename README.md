# Interfile Study — Researcher & Developer Guide

A within-subjects HCI study platform for comparing code navigation techniques. Condition 1 gives participants a full VS Code-style IDE (the React UI). Condition 2 gives participants a spatial overview of the codebase (p5.js canvas) as their primary navigation tool, with a read-only React document view that opens when they navigate to a location.

---

## Table of Contents

1. [Setup and Running](#1-setup-and-running)
2. [Project Structure](#2-project-structure)
3. [Study Flow (config.toml)](#3-study-flow-configtoml)
4. [Conditions Overview](#4-conditions-overview)
5. [Dataset Format](#5-dataset-format)
6. [Configuration Reference (study-config.js)](#6-configuration-reference-study-configjs)
7. [Condition 1 — Standard IDE](#7-condition-1--standard-ide)
8. [Condition 2 — Spatial Overview](#8-condition-2--spatial-overview)
9. [Debug Mode](#9-debug-mode)
10. [Wiring the p5 Canvas (Condition 2)](#10-wiring-the-p5-canvas-condition-2)
11. [Modifying the React UI](#11-modifying-the-react-ui)
12. [Task Phases](#12-task-phases)
13. [Questionnaires](#13-questionnaires)
14. [Participant Data and Admin](#14-participant-data-and-admin)
15. [Testing](#15-testing)
16. [Common Tasks Checklist](#16-common-tasks-checklist)

---

## 1. Setup and Running

**Prerequisites:** Python 3.x

```bash
# Create and activate virtual environment
python -m venv env
source env/bin/activate          # macOS / Linux
env\Scripts\activate             # Windows

# Install BOFS (the study framework)
pip install bride-of-frankensystem-dev

# Run the study server
bofs study/
```

The server starts at `http://localhost:5000` by default. Port, admin password, and other server settings live in `study/config.toml`.

**Admin panel:** `http://localhost:5000/admin`
Password is set by `ADMIN_PASSWORD` in `config.toml` (default: `admin`).

---

## 2. Project Structure

```
interfile_study/
├── README.md
└── study/
    ├── config.toml                         # Study-wide settings and page flow
    ├── consent.html                        # Consent page content
    └── blueprint/
        ├── views.py                        # Flask routes for each condition's task page
        ├── questionnaires/
        │   ├── demographics.json           # Pre-study demographic questions
        │   ├── condition1.json             # Post-condition questionnaire (Condition 1)
        │   ├── condition2.json             # Post-condition questionnaire (Condition 2)
        │   ├── post_condition.json         # Generic post-condition template
        │   └── final.json                  # End-of-study questionnaire
        ├── templates/
        │   ├── simple/task.html            # The task page (loaded for both conditions)
        │   └── instructions/
        │       ├── introduction.html       # Pre-study introduction page
        │       ├── condition1.html         # Condition 1 instructions
        │       └── condition2.html         # Condition 2 instructions
        └── static/
            ├── study-config.js             # *** YOUR MAIN CONFIGURATION FILE ***
            ├── react-ui.js                 # VS Code-style React UI (all components)
            ├── p5-ui/                      # p5.js spatial canvas (pseudo-MVC)
            │   ├── controller.js           # p5 entry point, phases, trial management
            │   ├── model.js                # Loaded assets and mutable state
            │   ├── view.js                 # Pure draw functions per phase
            │   └── utils.js                # Pure utilities: hit detection, schema normalisation
            ├── vendor/
            │   └── p5.min.js              # p5.js library (bundled, do not edit)
            └── datasets/                   # One folder per dataset (gitignored — files are large)
                └── boltz/                  # Example: AlphaFold Boltz codebase
                    ├── root.json           # File tree with source lines
                    ├── layout.json         # Spatial positions for the p5 canvas
                    └── overview.png        # Full-codebase overview image
```

The dataset folder name is configured in `study-config.js` via `export const dataset = "boltz"`.

---

## 3. Study Flow (config.toml)

`study/config.toml` controls every aspect of how participants move through the study.

### Participant assignment

```toml
CONDITIONS = [
    {label='Condition 1', enabled=true},
    {label='Condition 2', enabled=true},
]
```

BOFS assigns participants to conditions in a balanced way. The `label` values here must match the strings passed to `condition_name` in `views.py` (they already do by default).

### Page flow

`PAGE_LIST` defines the sequence of pages. Use `conditional_routing` to serve a different page order to each condition group. The current config is a **within-subjects** design: both groups complete both conditions, in counterbalanced order.

**To switch to between-subjects:** replace the `conditional_routing` block with one that gives each group only their condition's pages. The commented-out example in `config.toml` shows this pattern.

**To add a third condition:** uncomment the `condition3` entries throughout `config.toml`, add a `Condition 3` entry to the `CONDITIONS` list, and add a corresponding route in `views.py`.

### Key config.toml settings

| Setting | What it does |
|---|---|
| `PORT` | Server port (default 5000) |
| `ADMIN_PASSWORD` | Password for `/admin` |
| `RETRIEVE_SESSIONS` | If true, participants can resume an interrupted session |
| `ALLOW_RETAKES` | If true, the same participant ID can run again |
| `GENERATE_COMPLETION_CODE` | Shows a code at the end (useful for Prolific/MTurk) |
| `EXTERNAL_ID_LABEL` | Label for the participant ID field |

---

## 4. Conditions Overview

| | Condition 1 | Condition 2 |
|---|---|---|
| Primary navigation | React IDE (file tree, search bar, find) | p5 spatial overview (canvas) |
| Sidebar & file tree | Visible, fully interactive | Hidden |
| Command palette (Ctrl+Shift+P) | Active | Disabled |
| Project-wide search (Ctrl+Shift+F) | Active | Disabled |
| In-file find (Ctrl+F) | Active | Disabled |
| Go-to-line (Ctrl+G) | Active | Disabled |
| Multi-tab / split pane | Active (drag, Ctrl+\\) | Hidden |
| Document view scrolling | Free | Locked to navigated location |
| Canvas right-click toggle | Only after trial starts | Only after trial starts |

The `window.condition_name` global (injected by the server from `views.py`) drives the condition logic in `react-ui.js`. `study-config.js`'s `debugMode` flag overrides it during development.

---

## 5. Dataset Format

A dataset is a folder inside `study/blueprint/static/datasets/<dataset>/` containing three files.

### root.json

A tree of all source files in the codebase. The React file tree and search panel read this directly.

```jsonc
{
    "id": "root",
    "name": "myproject",
    "type": "TreeDir",
    "children": [
        {
            "id": "src",
            "name": "src",
            "type": "TreeDir",
            "children": [
                {
                    "id": "main.py",
                    "name": "main.py",
                    "type": "TreeFile",
                    "path": "src/main.py",

                    // Required for source view and search:
                    "lines": ["def main():", "    pass"],

                    // Optional metadata (shown in meta view when lines is absent):
                    "totalLines": 2,
                    "longestLine": 12,
                    "width": 240.5,   // canvas bounding-box width in px
                    "height": 48      // canvas bounding-box height in px
                }
            ]
        }
    ]
}
```

**Notes:**
- Every node must have a unique `id`. The value can be anything — a hash, a path, a number.
- If `lines` is omitted from a `TreeFile`, the React UI shows a metadata table instead of source code. The project-wide search also skips files without `lines`.
- `width`/`height` are only needed for the p5 canvas layout.

### layout.json

Stores the spatial position of every file in the canvas coordinate system. Read by the p5 sketch.

```jsonc
{
    "labelHeight": 14,
    "heightScale": 1.0,
    // The tree structure mirrors root.json, but nodes carry canvas positions:
    "children": [
        {
            "id": "main.py",
            "name": "main.py",
            // A file may appear in multiple columns (left/top/heights are arrays):
            "left": [100, 400],       // x position of each column
            "top": [50, 50],          // y position (top of the content area)
            "heights": [300, 120],    // pixel height of each column
            "width": 200              // column width (same for all columns)
        }
    ]
}
```

### overview.png

A pre-rendered image of the entire codebase as it would appear on the canvas. The p5 sketch draws this image scaled to fill the window in the spatial overview mode.

### Switching datasets

1. Create `study/blueprint/static/datasets/<yourname>/` and put `root.json`, `layout.json`, and `overview.png` in it.
2. Open `study-config.js` and change `export const dataset = "yourname";`.
3. That's it — both the React UI and the p5 canvas will load from the new folder.

---

## 6. Configuration Reference (study-config.js)

`study/blueprint/static/study-config.js` is the single file you need to edit for most visual and behavioral configuration. It exports named constants imported by both `react-ui.js` and `p5-ui/controller.js`.

```js
// Which dataset folder to load (relative to /blueprint/)
export const dataset = "boltz";

// highlight.js theme name — browse themes at https://highlightjs.org/demo
export const highlightTheme = "base16/gruvbox-dark-hard";

// Code font (CSS font-family string, tried in order)
export const codeFont = "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace";

// Code font size in pixels
export const codeFontSize = 13;

// Line height multiplier (1.5–1.7 is comfortable)
export const codeLineHeight = 1.6;

// Set true during development to access all features regardless of condition.
// MUST be false before running participants.
export const debugMode = false;

// Lines of context above and below the target in Condition 2's locked view.
// Total lines shown = (condition2ContextLines * 2) + 1
export const condition2ContextLines = 20;
```

**To load a Google Font for code:** add a `<link>` tag in `task.html` and then reference the font name in `codeFont`.

---

## 7. Condition 1 — Standard IDE

The React UI is a VS Code-style interface with the following components:

### Layout
```
+--------------------------------------------------+
|  TopNav  (Ctrl+Shift+P = file search, Ctrl+G = goto line)
+------+------------+-----------------------------+
| Act. |  Sidebar   | [TabBar]  [TabBar] (split)  |
| Bar  |  Explorer  +-----------------------------+
|      |  or Search | DocumentView (left/right)   |
+------+------------+-----------------------------+
```

### Navigation features

| Shortcut | Action |
|---|---|
| Ctrl+Shift+P | Open file command palette |
| Ctrl+G | Go to line (type `:42` in the command palette) |
| Ctrl+Shift+F | Open project-wide search sidebar |
| Ctrl+F | Open in-file find (floating widget) |
| Ctrl+\\ | Move active tab to other pane (creates split) |
| Right-click | Toggle between React UI and p5 canvas (only during trial) |

### File tree

Files appear in the Explorer sidebar. Clicking a file opens it in the focused pane. Search results from the command palette or Ctrl+Shift+F sidebar also highlight the file in the tree (via `revealNodeId`).

### Tabs and split pane

- Each pane has an independent tab bar. Tabs are draggable within and between panes.
- Ctrl+\\ moves the active tab to the other pane, creating the split if it doesn't exist.
- Closing all tabs in the right pane collapses the split automatically.
- The focused pane (blue tab accent) receives all new file opens.

---

## 8. Condition 2 — Spatial Overview

In Condition 2, the p5 canvas is the primary navigation environment. The React UI is stripped down to a read-only document viewer.

### What the stripped React UI shows
- The TopNav bar (no search bar)
- A single DocumentView pane, locked to the code location the participant navigated to
- No sidebar, no file tree, no tabs, no find

### What is locked

When `window.studyNavigateTo` is called (see below), the DocumentView:
1. Opens the target file
2. Renders only `condition2ContextLines` lines above and below the target line (default ±20 = 41 lines total)
3. Sets `overflow: hidden` — the participant cannot scroll
4. Flashes the target line with a brief yellow highlight

To navigate to a different location, the participant must right-click to return to the canvas and perform another navigation action.

### Returning to the canvas

The right-click toggle is registered in `setupCanvasToggle()` in `react-ui.js`. It swaps `display` between `#react-container` and `#study-container`. It only activates while `window.studyTrialActive` is true (set by `controller.js` when the trial begins, or immediately if `debugMode = true`).

---

## 9. Debug Mode

Set `debugMode = true` in `study-config.js` to test both conditions without changing `condition_name`.

**What debug mode does:**
- Forces `isCondition2 = false` in all React components → full IDE features are always available
- Sets `window.studyTrialActive = true` immediately on page load → the right-click canvas toggle works without waiting for the trial to start
- Skips the automatic canvas→React UI switch inside `window.studyNavigateTo` → you can call it from the browser console while the React UI is visible

**Testing Condition 2 navigation from the browser console:**

```js
// Open a specific file and lock to line 42
window.studyNavigateTo("main.py", 42);

// Open a file without locking to a line
window.studyNavigateTo("main.py", null);
```

`nodeId` must match an `id` field from `root.json`.

**Important:** Set `debugMode = false` before running participants. A wrong condition flag will ruin the study.

---

## 10. Wiring the p5 Canvas (Condition 2)

The p5 sketch in `p5-ui/controller.js` needs to call `window.studyNavigateTo(nodeId, lineNum)` when the participant selects a file location in the canvas.

### The interface

```js
// Defined and registered by StudyApp in react-ui.js on mount.
// Safe to call at any time after the React app loads.
window.studyNavigateTo(nodeId, lineNum);
```

| Parameter | Type | Description |
|---|---|---|
| `nodeId` | `string` | The `id` field from the node in `root.json` |
| `lineNum` | `number \| null` | 1-based line number to lock to, or `null` to just open the file |

### What it does (inside react-ui.js)

1. Finds the node in the loaded file tree by `id`
2. Calls `openFile(node)` — opens the file in the left pane
3. Calls `setLockedLine(lineNum)` — engages the locked view in DocumentView
4. Calls `handleGoToLine(lineNum)` — triggers the flash animation on the target line
5. Switches `#react-container` to visible and `#study-container` to hidden (skipped in debug mode)

### Example: click on a canvas bounding box to navigate

```js
// In p5-ui/controller.js, inside the p5 sketch function:

p.mouseClicked = function() {
    if (getCurrentPhase() !== Phase.TRIAL) return;

    const widthScale  = p.windowWidth  / overview.width;
    const heightScale = p.windowHeight / overview.height;
    const hoverInfo = findHovered(
        layout, tree,
        p.mouseX / widthScale, p.mouseY / heightScale
    );

    if (hoverInfo && window.studyNavigateTo) {
        // lineNum: use the top of the hovered column as an approximation,
        // or compute from the pixel position within the column.
        const lineNum = 1; // TODO: compute actual line from y position
        window.studyNavigateTo(hoverInfo.id, lineNum);
    }
};
```

### Computing the line number from a canvas y-position

Each file in `layout.json` stores `top[]` and `heights[]` arrays (one entry per column/chunk). Given a click at canvas-coordinate `(cx, cy)`:

```js
function getLineAtPoint(fileNode, layoutNode, cx, cy, lineHeight) {
    for (let col = 0; col < layoutNode.left.length; col++) {
        if (cx < layoutNode.left[col] || cx > layoutNode.left[col] + layoutNode.width) continue;
        const relY = cy - layoutNode.top[col];
        if (relY < 0 || relY > layoutNode.heights[col]) continue;
        // Each pixel row corresponds to `lineHeight` source lines.
        // lineHeight comes from layout.json's labelHeight and heightScale.
        const line = Math.floor(relY / lineHeight) + 1; // 1-based
        return line;
    }
    return 1;
}
```

---

## 11. Modifying the React UI

All React components live in a single file: `study/blueprint/static/react-ui.js`.

### Key constraints

- **No build step.** React 18 and BlueprintJS are loaded from `esm.sh`. All JSX uses the `htm` tagged template literal library.
- **No backticks inside `html\`...\`` template literals** (even in comments). Backticks close the template string. Use `<!--` comments sparingly, and never put a backtick inside one.
- Use `<//>` to close a component tag (shorthand for `</ComponentName>`).
- Pass object props with `${{ }}` double braces: `style=${{ color: "red" }}`.
- Blueprint icons: https://blueprintjs.com/docs/#icons

### Adding a new activity panel (sidebar tab)

1. Add an entry to `ACTIVITY_ITEMS` in `react-ui.js`:
   ```js
   { id: "My Panel (Ctrl+Shift+M)", icon: "grid", disabled: false },
   ```

2. Add a branch in the `Sidebar` component's render:
   ```js
   const myPanelActive = activeActivity === "My Panel (Ctrl+Shift+M)";
   // ...
   ${myPanelActive && html`
       <${SidebarHeader} title="My Panel" />
       <${MyNewPanelComponent} ... />
   `}
   ```

3. Register a keyboard shortcut in `StudyApp` if needed (follow the Ctrl+Shift+F pattern).

### Adding a language to syntax highlighting

In `getLanguage()` near the top of `react-ui.js`:

```js
const map = {
    py: "python", js: "javascript", /* ... */
    rs: "rust",   cpp: "cpp",       // add your extension → hljs language id here
};
```

All hljs language ids: https://github.com/highlightjs/highlight.js/tree/main/src/languages

### Changing the code theme

In `study-config.js`, change `highlightTheme`. The value is the hljs theme filename (without `.min.css`). Browse all themes at https://highlightjs.org/demo.

For themes in the `base16/` family, use a forward slash: `"base16/gruvbox-dark-hard"`.

### Adding menu items to TopNav

In the `TopNav` component in `react-ui.js`, append inside the first `NavbarGroup`:
```js
<${Button} minimal text="MyMenu" onClick=${...} />
```

### Changing what the empty document pane says

In `DocumentView` in `react-ui.js`, find the `NonIdealState` block. The `description` prop is already condition-aware — edit both strings there.

### Modifying the find/search behavior

- **Minimum query length before searching:** in `SearchPanel`'s `searchResults` useMemo, add `if (query.length < 3) return [];` at the top.
- **Number of file results in the command palette:** in `SearchBar`, change `.slice(0, 10)` in the `results` useMemo.
- **Debouncing search:** wrap the `query` state update in a debounce hook and feed the debounced value to the `searchResults` useMemo instead of `query` directly.

---

## 12. Task Phases

`p5-ui/controller.js` manages a simple phase state machine that drives the p5 sketch. The React UI is independent of phases — it activates when `startTrial()` in `controller.js` is called.

| Phase | What happens |
|---|---|
| `INTRODUCTION` | Red screen; press Enter to go fullscreen |
| `INSTRUCTIONS` | Red screen; press Space to advance |
| `PRE_TRIAL` | Red screen; press Space to start the trial |
| `TRIAL` | `startTrial()` fires; switches to condition-appropriate view |
| `POST_TRIAL` | Red screen; press Space to finish and redirect |

**To customize each phase:** edit the `drawIntroduction`, `drawInstructions`, `drawPreTrial`, `drawTrial`, and `drawPostTrial` functions in `p5-ui/view.js`.

**To end the trial and advance:** in `controller.js`, when the participant completes the task, call `setCurrentPhase(Phase.POST_TRIAL)` (or have them press Space, which is the current default).

The `drawTrial` function in `view.js` receives `overview`, `layout`, and `hoverInfo` — use these to implement the spatial overview UI for Condition 2.

---

## 13. Questionnaires

Questionnaires are JSON files in `study/blueprint/questionnaires/`. BOFS renders them automatically when referenced in `PAGE_LIST`.

### Question types

| `questiontype` | Description |
|---|---|
| `field` | Free-text input |
| `num_field` | Numeric input with optional `min`/`max` |
| `radiolist` | Radio buttons; add `"labels": [...]` |
| `drop_down` | Dropdown; add `"items": [...]` |
| `likert` | Likert scale; add `"min_label"`, `"max_label"`, `"steps"` |
| `checkbox` | Single checkbox (yes/no) |

### Adding a question

Append to the `"questions"` array in the relevant JSON file:

```json
{
    "questiontype": "likert",
    "instructions": "How easy was it to find the target file?",
    "id": "ease_of_navigation",
    "min_label": "Very difficult",
    "max_label": "Very easy",
    "steps": 7,
    "required": true
}
```

The `id` field becomes the column name in the response database.

### Using the `{{condition}}` template variable

`post_condition.json` uses `{{condition}}` in its title, which BOFS replaces with the condition label at render time. You can use this to ask condition-specific questions from a single file.

---

## 15. Testing

### Python (pytest)

```bash
pip install pytest
pytest -v               # run all tests
pytest tests/test_X.py  # run a single file
```

### JavaScript (Vitest)

```bash
npm install        # first time only — installs Vitest
npm test           # run all JS tests once
npm run test:watch # re-run on file save
```

JavaScript tests live in `tests/`, named `<module>.test.js`. Currently only `p5-ui/utils.js` is covered (`nodePositions` and `findHovered`). Functions in `controller.js` that use the DOM or p5 instance cannot be tested without a browser; for `react-ui.js`, end-to-end browser testing (e.g. Playwright) is more appropriate than unit tests.

When adding new canvas utility functions that have no browser or p5 dependency, put them in `p5-ui/utils.js` and add tests in `tests/utils.test.js`.

---

## 14. Participant Data and Admin

### Admin panel

`http://localhost:5000/admin` (password set in `config.toml`)

- View all participant sessions
- Download response data as CSV
- Reset or delete sessions

### Response storage

All questionnaire responses are stored in an SQLite database at `study/study.db`. Each row corresponds to one questionnaire submission, keyed by participant session ID and condition.

### Exporting data

From the admin panel, use the Download button to export CSV. Column names match the `id` fields in your questionnaire JSON files.

---

## 16. Common Tasks Checklist

### Before running participants

- [ ] Set `debugMode = false` in `study-config.js`
- [ ] Update `study/consent.html` with the correct study title, researchers, and procedures
- [ ] Update instruction pages in `study/blueprint/templates/instructions/`
- [ ] Set a strong `ADMIN_PASSWORD` in `config.toml`
- [ ] Test the full study flow as a participant (consent → task → questionnaire → end)
- [ ] Test Condition 1 and Condition 2 separately by manually visiting `/task/condition1` and `/task/condition2`
- [ ] Verify `window.studyNavigateTo` works from the browser console in debug mode
- [ ] Confirm the canvas-to-React switch works when `window.studyNavigateTo` is called during a real trial

### Switching to a new dataset

- [ ] Create `study/blueprint/static/datasets/<name>/` with `root.json`, `layout.json`, `overview.png`
- [ ] Change `dataset = "<name>"` in `study-config.js`
- [ ] Reload the page and confirm the file tree loads
- [ ] Test that `window.studyNavigateTo` works for a node id from the new `root.json`

### Adding a new condition

- [ ] Add `{label='Condition 3', enabled=true}` to `CONDITIONS` in `config.toml`
- [ ] Add condition routing to `PAGE_LIST`
- [ ] Add `questionnaires/condition3.json`
- [ ] Add `templates/instructions/condition3.html`
- [ ] Add a route in `views.py` (`/task/condition3` → `task("Condition 3")`)
- [ ] Handle `window.condition_name === "Condition 3"` in `react-ui.js` if the new condition needs different UI behaviour

### Deploying for remote participants

BOFS is a standard Flask app. Deploy it behind a production WSGI server (gunicorn) and reverse proxy (nginx). The SQLite database path in `config.toml` should point to a persistent volume. Consider setting `RETRIEVE_SESSIONS = true` so participants can reconnect if their browser closes.
