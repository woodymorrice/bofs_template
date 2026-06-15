# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Runs an HCI study comparing two code navigation interfaces. Participants experience both conditions (counterbalanced within-subjects design):

- **Standard**: VS Code-style IDE — file tree, tabbed editor, project search, in-file find, split pane, command palette
- **Thumbview**: Spatial canvas overview — p5.js rendering of a pre-built thumbview of the codebase; hovering highlights files; clicking opens them in the locked React document view

BOFS (Bride of Frankensystem) handles routing, session management, condition assignment, questionnaires, and admin. Flask serves the study; the UI is React (no build step — ESM via esm.sh, `htm` tagged templates instead of JSX). p5.js renders the canvas in the Thumbview condition.

## Running the study

```bash
# Create and activate virtual environment
python -m venv env
env\Scripts\activate          # Windows
# source env/bin/activate     # macOS/Linux

# Install BOFS
pip install bride-of-frankensystem-dev

# Start the server
bofs study/

# http://localhost:5000         — participant entry point
# http://localhost:5000/admin   — admin panel (password: admin)
```

## Keeping all documentation current

**Every change must update all three layers of documentation before the task is considered complete.** Stale documentation is actively harmful.

### 1. CLAUDE.md (this file)
Update whenever a change affects the current state of the app, architecture, module descriptions, configuration keys, or conventions. This file is the source of truth for project context across conversations.

### 2. README.md
Update whenever a change affects setup steps, study flow, dataset format, configuration options, or deployment. The README and CLAUDE.md overlap but serve different audiences: README is for a researcher setting up or customising the study, CLAUDE.md is for Claude. Both must stay accurate.

### 3. In-code comments
Update the file-level comment, function comments, and any affected inline comments whenever the behaviour, purpose, or structure of a file or function changes. A comment that describes what the code used to do is worse than no comment at all.

## GitHub Issues

Issues are tracked on the GitHub repository. Use `gh issue` commands for all issue management.

**When the user proposes a new feature or a non-trivial change** (anything that would take more than a few lines or touches multiple files), ask whether it should become a GitHub issue before starting work. If yes, create it with `gh issue create` before proceeding.

**When work completes that relates to an open issue**, ask the user whether to close it before doing so. Use `gh issue close <number>` once confirmed. Don't leave issues open for work that is done without at least prompting.

**During multi-step work on an issue**, post progress notes with `gh issue comment` at meaningful checkpoints — when a significant sub-task is done, when a design decision is made, or when a blocker is hit.

## Code comments

**This project overrides the default no-comment style.** The canvas code uses p5.js instance mode (an unusual pattern), the React UI uses `htm` tagged templates without JSX (a non-standard approach), and BOFS is a custom framework unfamiliar to most readers. All code must be commented so that any section can be understood without prior knowledge of these tools.

**Scope:** these documentation requirements apply only to the files you own — the tracked `.js` files under `study/blueprint/static/` **except** `vendor/` (third-party libraries, do not edit), `study/blueprint/templates/simple/task.html`, and `study/blueprint/views.py`. Everything else (questionnaire JSON, instruction HTML, consent page, config files, BOFS internals) is boilerplate and does not need documentation added or modified.

**Every file must have a top-of-file comment explaining:**
- What the file is and what it does
- What it exports and how those exports are used elsewhere

**Every function must have a comment explaining:**
- What it does, what arguments it accepts, and what it returns

**Inline comments must explain:**
- Any p5.js pattern — instance mode (`p.setup`, `p.draw`, `p.preload`), coordinate space conversions, the distinction between image-pixel space and screen-pixel space
- Any `htm` / no-build-step React pattern — tagged templates, `<//>` closing tags, `${{ }}` double-brace props, hooks used without a build tool
- Any BOFS pattern — `@verify_correct_page`, `@verify_session_valid`, how page flow and session management work
- Any non-obvious logic or design decision

**MARK comments:** add a `// MARK:` section marker before every class, function, and significant code section, wrapped in a divider line so it is visible when scanning the file. Use the pattern from `react-ui.js`:

```js
// ---------------------------------------------------------------------------
// MARK: Section name
// ---------------------------------------------------------------------------
```

Every file should be navigable by scanning its MARK comments alone.

**Target reader:** someone who can read JavaScript and Python but has not used p5.js instance mode, htm-based React, or BOFS.

## Testing

All tests must pass before every commit.

### Python (pytest)

```bash
pip install pytest
pytest -v               # run all tests
pytest tests/test_X.py  # run a single file
```

Python test files live in `tests/`, named `test_<module>.py`.

### JavaScript (Vitest)

`package.json` at the project root is the npm dependency manifest. Running `npm install` with no arguments reads it and installs everything listed — there is nothing else to configure.

Current npm dependencies (all `devDependencies` — nothing is needed at runtime):

| Package | Purpose |
|---|---|
| `vitest` | JS test runner |

The study's runtime JS (React 18, BlueprintJS, p5.js, htm, highlight.js) is loaded from CDN URLs at runtime and does **not** go in `package.json`.

```bash
npm install          # install all packages from package.json (first time, or after adding a new dep)
npm test             # run all JS tests once
npm run test:watch   # re-run on file changes
```

JavaScript test files live in `tests/`, named `<module>.test.js`. Vitest is configured in `vitest.config.js` at the project root.

**What can be tested:** only pure functions with no browser globals or p5 dependency. Currently that means `p5-ui/utils.js` (`nodePositions`, `findHovered`). Functions in `controller.js` that touch the DOM or p5 instance cannot be imported without mocking; `react-ui.js` imports React from CDN URLs, so unit-testing it requires heavy mocking — end-to-end browser testing (e.g. Playwright) is more appropriate for that file.

**What to test when adding new code:** any canvas utility function with no browser globals or p5 dependency belongs in `p5-ui/utils.js` and must have corresponding tests in `tests/utils.test.js`. Leave browser-coupled code in `controller.js` or `react-ui.js` and test it manually or via an end-to-end runner.

## Architecture

```
study/
  config.toml                    # BOFS study settings (port, conditions, page flow)
  blueprint/
    views.py                     # Flask routes for task pages
    templates/
      simple/
        task.html                # Single HTML page hosting both p5 canvas and React IDE
    static/
      study-config.js            # All UI/appearance constants (single source of truth)
      p5-ui/                     # p5.js spatial canvas — pseudo-MVC
        controller.js            # Controller + entry point (phases, trial mgmt)
        model.js                 # Assets + mutable state (loaded via p.preload)
        view.js                  # Pure draw functions (no schema knowledge)
        utils.js                 # Pure utilities: nodePositions, findHovered (tested)
      react-ui.js                # Monolithic VS Code IDE React component
      vendor/
        p5.min.js                # p5.js library (third-party, do not edit)
      datasets/                  # One folder per study dataset (gitignored — files are large)
        boltz/                   # Example dataset (AlphaFold Boltz codebase)
          root.json              # File tree with source lines and pixel dimensions
          layout.json            # Spatial positions for each node
          overview.png           # Pre-rendered canvas image (3840×2160)
    questionnaires/
      demographics.json
      standard.json
      thumbview.json
      final.json
```

### Phase state machine

The phase state machine lives in `controller.js` and defines five ordered phases driven by keyboard input:

| Phase | Display | Advance |
|---|---|---|
| INTRODUCTION | Red screen; fullscreen prompt | Enter (fullscreen), then Space |
| INSTRUCTIONS | Red screen | Space |
| PRE_TRIAL | Red screen | Space |
| TRIAL | Condition-specific view | Space (ends trial) |
| POST_TRIAL | Red screen | Space (→ next BOFS page) |

### Canvas MVC structure

p5.js does not use pub/sub. The pseudo-MVC maps as follows:

- **Model** (`p5-ui/model.js`): loaded assets (`overview`, `tree`, `layout`) and mutable state (`fullscreen`). `initAssets(p)` is called from `p.preload`; all other modules read via `getAssets()` / `getState()`.
- **Controller** (`p5-ui/controller.js`): the p5 sketch function plus the phase state machine and trial management. Owns the per-frame dispatch (`p.draw`), input handling (`p.keyPressed`), and all logic that interprets input against the model. Calls `findHovered()` and `nodePositions()` imported from `utils.js`.
- **Utilities** (`p5-ui/utils.js`): pure functions with no browser or p5 dependency — `nodePositions()` (dual-schema normaliser) and `findHovered()` (recursive hit detection). **Any new canvas utility function that has no browser globals or p5 dependency must go here**, not in `controller.js`, so it can be tested by Vitest without mocking p5.
- **View** (`p5-ui/view.js`): pure draw functions. Receive already-resolved, flat data from the controller. No schema knowledge, no hit-testing. Signature: `drawTrial(p, overview, layout, hoverInfo)`.

**Rule:** if code reads model data to answer "what did the user do?", it belongs in the controller. If it only draws to the canvas, it belongs in a view.

### Dual dataset schemas

`root.json` node fields differ between datasets:

| Dataset | left / top | height | heights |
|---|---|---|---|
| boltz | scalar (`number`) | `height` | — |
| test | array (`number[]`) | — | `heights` |

`nodePositions(node)` in `p5-ui/utils.js` normalizes both to arrays before use. Any new code that reads per-column node fields must go through `nodePositions()`.

### Coordinate spaces

Node coordinates in `root.json` are in **image-pixel space** (scaled by `widthScale` / `heightScale` from the original canvas layout, not screen pixels).

- `widthScale = windowWidth / overview.width` converts image→screen
- `mouseX / widthScale` converts screen→image (for hit detection input)
- `hoverInfo.left * widthScale` converts image→screen (for drawing rects)

`layout.widestWidth` is the column width used for both hit detection and rect drawing — individual `node.width` values are narrower and must not be used for column-spanning operations.

### Global variables (task.html → controller.js)

`task.html` sets these before the module scripts load; they are accessed as globals inside controller.js:

- `condition_name` — `"Standard"` or `"Thumbview"` (Jinja2 injected)
- `order_number` — participant's condition assignment number
- `finished` — set to `true` before navigating away to suppress the beforeunload warning

### Trial management (controller.js)

`startTrial()` is idempotent (guarded by `trialStarted`). It is called every frame from `p.draw` during the TRIAL phase, but only executes setup logic once. It sets `window.studyTrialActive = true` and shows/hides the appropriate container.

- Standard: hides `#study-container`, shows `#react-container` (React IDE takes over)
- Thumbview: hides `#react-container`, shows `#study-container` (canvas remains)

In the Thumbview condition, left-clicking a hovered file in the canvas calls `window.studyNavigateTo(nodeId, lineNum)`, which opens the file in the React UI and switches the visible container. `p.mouseClicked` in `controller.js` handles this; it guards on `studyContainer.style.display !== "none"` so that clicks inside the React document view (which overlays the canvas) never trigger spurious file navigation. Hit detection uses `findHovered()` and the click y-coordinate is converted to a 1-based line number via `lineFromClick()` (both in `utils.js`). `lineFromClick` accumulates column heights so that multi-column files map continuously from top of column 0 to bottom of the last column.

### React UI (react-ui.js)

Single-file, no build step. Uses `htm` tagged template literals as JSX substitute. Key exported surface:

- `window.studyNavigateTo(nodeId, lineNum)` — called by the p5 canvas when a user clicks a file; opens the file in React, locks the view to `±thumbviewContextLines` lines around `lineNum`, flashes the target line, and switches the container to the React IDE (unless `debugMode` is true)

Syntax highlighting uses `splitHighlightedLines(lines, language)` which highlights the full file at once (not line by line) so multi-line tokens like Python docstrings and block comments render correctly. The HTML output is split back into per-line fragments while tracking open `<span>` tags across line boundaries.

All feature flags (split pane, search, command palette, etc.) respect `condition_name` and `debugMode` from `study-config.js`.

## Configuration

### study/config.toml (BOFS study settings)

- Port, admin password, database path
- `CONDITIONS`: list of condition labels; comment out to disable
- `PAGE_LIST`: ordered page flow; `conditional_routing` blocks define per-condition sequences for within-subjects design
- `RETRIEVE_SESSIONS`, `ALLOW_RETAKES`: session recovery settings

**Do not log** changes to `ADMIN_PASSWORD` or routine `PAGE_LIST` reordering in the changelog. Do log additions or removals of conditions, new page types, or structural changes to the flow.

### study/blueprint/static/study-config.js (UI constants)

Single source of truth for all front-end configuration. Edit here only; all other files import from here.

| Export | Purpose |
|---|---|
| `dataset` | Folder name under `static/` for dataset files |
| `highlightTheme` | highlight.js theme name |
| `codeFont` | Font stack for code blocks |
| `codeFontSize` | Code font size in px |
| `codeLineHeight` | Line height multiplier |
| `debugMode` | Enable all features regardless of condition; **must be `false` for participants** |
| `thumbviewContextLines` | Lines above/below target in locked view (default 20) |
| `thumbviewViewportOffset` | Where the clicked line sits in the locked view: 0.0=top, 0.5=centre, 1.0=bottom (default 0.5) |

## Dataset format

Each dataset lives in `study/blueprint/static/datasets/<dataset>/` and contains three files:

**root.json** — nested file tree. Leaf nodes (files) must have:
```json
{
  "id": "unique-string",
  "name": "filename.py",
  "type": "TreeFile",
  "path": "src/filename.py",
  "lines": ["line 1", "line 2"],
  "totalLines": 2,
  "longestLine": 12,
  "width": 240.5,
  "height": 48
}
```
`lines` is required for the React source view and project search. `width`/`height` are in image-pixel space and are consumed by the canvas.

**layout.json** — spatial positions. Key fields:
```
widestWidth   — column width in image-pixel space (used for hit detection and rect drawing)
widthScale    — image→canvas x scale
heightScale   — image→canvas y scale
labelHeight   — height of the filename label in image-pixel space
nColumns      — number of layout columns
spacing       — spacing between columns
```
Per-node position fields use the boltz or test schema (see dual-schema section above).

**overview.png** — pre-rendered canvas image. The boltz example is 3840×2160.

## Questionnaires

JSON files in `study/blueprint/questionnaires/`. BOFS renders them automatically; responses are stored in SQLite keyed by participant ID and condition. Use `{{condition}}` in strings for Jinja2 variable substitution.

## Committing changes

**Do not create commits unless the user explicitly says to commit.** Wait for the instruction — do not commit after completing a task, do not offer to commit, and do not prepare a commit message speculatively.

When the user does say to commit, before committing:

1. Run all tests: `pytest -v` — fix failures before proceeding
2. Review the full diff
3. Verify all three documentation layers are current (see [Keeping all documentation current](#keeping-all-documentation-current))
4. Commit with an informative message capturing what changed and why — commits are the primary change record for this project, so messages should be descriptive enough to understand the motivation without reading the diff

## Explaining changes

After making any change, briefly explain:
- **What** changed and **why** that approach was chosen
- **Any tradeoffs** or non-obvious decisions

## Common development tasks

| Task | Where to change |
|---|---|
| Switch active dataset | `dataset` in `study-config.js` |
| Change font or theme | `study-config.js` |
| Modify study page flow | `PAGE_LIST` in `config.toml` |
| Add a condition | Add to `CONDITIONS` in `config.toml`; add route in `views.py`; create instructions HTML and questionnaire JSON |
| Modify phase behaviour | `p5-ui/controller.js` (`p.keyPressed`, `setCurrentPhase`) |
| Change what's drawn per phase | `p5-ui/view.js` |
| Change hit detection logic | `p5-ui/controller.js` (`findHovered`, `nodePositions`) |
| Modify React IDE features | `react-ui.js` |
| Change locked view context | `thumbviewContextLines` in `study-config.js` |
| Reset a participant session | Admin panel at `/admin` |
| Export response data | Admin panel → download CSV |
