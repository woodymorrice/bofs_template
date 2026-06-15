import { dataset } from "../study-config.js";

let _assets = { overview: null, tree: null, layout: null };
let _state = { fullscreen: false };

export function initAssets(p) {
    _assets.overview = p.loadImage(`/blueprint/${dataset}/overview.png`);
    _assets.tree     = p.loadJSON(`/blueprint/${dataset}/root.json`);
    _assets.layout   = p.loadJSON(`/blueprint/${dataset}/layout.json`);
}

export function getAssets() { return _assets; }
export function getState()  { return _state; }
export function setState(updates) { Object.assign(_state, updates); }
