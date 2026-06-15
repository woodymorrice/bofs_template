/**
 * p5-ui/model.js  —  Model layer of the canvas pseudo-MVC.
 *
 * Holds the three loaded dataset assets and the small amount of mutable
 * runtime state that the controller needs to track across frames. All other
 * p5-ui modules (controller.js, view.js) read from here via the getters;
 * nothing outside model.js writes to _assets or _state directly.
 *
 * Asset loading uses p5's preload system: initAssets(p) must be called from
 * inside p.preload so that p5 blocks the controller from starting until all three
 * files have finished loading. The assets themselves are p5 objects (p5.Image
 * for the image, plain JS objects for the JSON files).
 *
 * Exports:
 *   initAssets(p) — call from p.preload; triggers async load of all three assets
 *   getAssets()   — returns { overview, tree, layout }
 *   getState()    — returns { fullscreen }
 *   setState(obj) — merges obj into _state (shallow, like React's setState)
 */

import { dataset } from "../study-config.js";

// ---------------------------------------------------------------------------
// MARK: Assets
// ---------------------------------------------------------------------------

// Assets are null until p.preload completes. controller.js reads these via
// getAssets() and passes them down to view functions.
let _assets = {
    overview: null,  // p5.Image  — the pre-rendered codebase overview image
    tree:     null,  // plain obj — root.json file tree (used for hit detection)
    layout:   null,  // plain obj — layout.json spatial positions
};

// ---------------------------------------------------------------------------
// MARK: State
// ---------------------------------------------------------------------------

// Mutable runtime state. Kept here so controller.js can update it and view.js
// can read it without either module knowing about the other.
let _state = {
    fullscreen: false,  // true after the participant presses Enter
};

// ---------------------------------------------------------------------------
// MARK: initAssets
// ---------------------------------------------------------------------------

/**
 * Triggers async loading of the three dataset files via p5's built-in loaders.
 * Must be called from inside the p5 p.preload hook so p5 waits for all loads
 * before calling p.setup.
 *
 * The dataset folder name comes from study-config.js. Loaded files are written
 * directly into _assets and readable via getAssets() once preload completes.
 *
 * @param {object} p - The p5 instance (passed in from controller.js).
 */
export function initAssets(p) {
    _assets.overview = p.loadImage(`/blueprint/${dataset}/overview.png`);
    _assets.tree     = p.loadJSON(`/blueprint/${dataset}/root.json`);
    _assets.layout   = p.loadJSON(`/blueprint/${dataset}/layout.json`);
}

// ---------------------------------------------------------------------------
// MARK: Getters / setters
// ---------------------------------------------------------------------------

/** Returns the loaded assets object { overview, tree, layout }. */
export function getAssets() { return _assets; }

/** Returns the runtime state object { fullscreen }. */
export function getState()  { return _state; }

/**
 * Merges `updates` into _state (shallow merge, like Object.assign).
 * Example: setState({ fullscreen: true })
 *
 * @param {object} updates - Key/value pairs to merge into the state object.
 */
export function setState(updates) { Object.assign(_state, updates); }
