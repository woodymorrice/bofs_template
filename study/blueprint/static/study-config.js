/**
 * study-config.js
 *
 * Appearance settings for the React study UI.
 * Edit the values below to change the look of the code view.
 * All other files import from here — no other edits needed.
 */

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
