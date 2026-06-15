/**
 * study-config.js
 *
 * Configuration for the React study UI and p5 sketch.
 * Edit the values below — all other files import from here, so no other
 * edits are needed when switching datasets or changing appearance.
 */

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

/**
 * Folder name of the dataset to use, relative to /blueprint/.
 * All data files (root.json, layout.json, overview.png) are loaded from
 * /blueprint/<dataset>/...
 *
 * Available datasets live in study/blueprint/static/<dataset>/
 */
export const dataset = "boltz";

// ---------------------------------------------------------------------------
// Syntax highlighting theme
// ---------------------------------------------------------------------------

/**
 * Name of the highlight.js theme to apply to all code blocks.
 *
 * The CSS is loaded at runtime from:
 *   https://unpkg.com/highlight.js@11/styles/<highlightTheme>.min.css
 *
 * Browse all available themes at https://highlightjs.org/demo
 *
 * Popular light themes:
 *   "atom-one-light", "github", "vs", "xcode", "default"
 *
 * Popular dark themes:
 *   "atom-one-dark", "github-dark", "vs2015", "night-owl", "tokyo-night-dark"
 *
 * The base16 family uses a subdirectory path with a forward slash:
 *   "base16/gruvbox-dark-hard", "base16/gruvbox-dark-medium", "base16/solarized-dark"
 *   "base16/gruvbox-light-hard", "base16/solarized-light"
 */
export const highlightTheme = "base16/gruvbox-dark-hard";

// ---------------------------------------------------------------------------
// Code font
// ---------------------------------------------------------------------------

/**
 * Font family used in code blocks.
 *
 * Any font installed on the system or loaded via a @font-face / Google Fonts
 * link in task.html will work. The list is tried in order; the last entry
 * ("monospace") is the browser's built-in fallback.
 *
 * Good free options to load from Google Fonts:
 *   "JetBrains Mono", "Fira Code", "Source Code Pro", "Inconsolata"
 *
 * System fonts that are usually already available:
 *   "Cascadia Code" (Windows 11), "Menlo" (macOS), "Consolas" (Windows)
 */
export const codeFont = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";

/**
 * Font size for code blocks, in pixels.
 */
export const codeFontSize = 13;

/**
 * Line height multiplier for code blocks.
 * 1.5–1.7 is comfortable for reading; 1.0 is tightly packed.
 */
export const codeLineHeight = 1.6;

// ---------------------------------------------------------------------------
// Study mode
// ---------------------------------------------------------------------------

/**
 * Debug mode — when true, all React UI features are enabled regardless of
 * condition, and the canvas right-click toggle is available immediately
 * (without waiting for the trial to start). window.studyNavigateTo is also
 * exposed so you can call it from the browser console to test canvas→React
 * navigation without a fully wired p5 sketch.
 *
 * Set to FALSE before deploying to participants.
 */
export const debugMode = false;

/**
 * Lines of context shown above and below the target line in the Condition 2
 * locked document view. E.g. 20 → 41 lines total (20 + target + 20).
 * Increase for more surrounding context; decrease for a tighter focus.
 */
export const condition2ContextLines = 20;

/**
 * Where the clicked line appears within the locked document view in Condition 2.
 * A fraction from 0.0 (top of the view) to 1.0 (bottom of the view).
 *
 * 0.5 (default) — clicked line is vertically centred.
 * 0.0           — clicked line appears at the top; all context lines are below.
 * 1.0           — clicked line appears at the bottom; all context lines are above.
 *
 * When the clicked line is near the start or end of the file, the view is
 * clamped to the file boundaries, so the offset is honoured as closely as
 * possible without showing lines outside the file.
 */
export const condition2ViewportOffset = 0.5;
