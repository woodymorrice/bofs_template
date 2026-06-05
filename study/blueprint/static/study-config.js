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
