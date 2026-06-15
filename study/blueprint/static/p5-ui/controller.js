/**
 * p5-ui/controller.js  —  Controller layer of the canvas pseudo-MVC.
 *
 * This file is the p5.js entry point and the controller for the spatial
 * overview canvas. It also owns the phase state machine and trial management
 * that were previously split into phaseManager.js and trialManager.js —
 * those modules had no other consumers, so they live here now.
 *
 * Responsibilities:
 *
 *   1. Phase state machine — the five sequential study phases (INTRODUCTION
 *      through POST_TRIAL) and the functions to read/advance them.
 *
 *   2. Trial management — switching between the p5 canvas (#study-container)
 *      and the React IDE (#react-container) when the trial begins; ending the
 *      trial when the participant presses Space in Condition 1.
 *
 *   3. p5 lifecycle hooks (p.preload, p.setup, p.draw, p.keyPressed,
 *      p.windowResized) — wired into the p5 instance via the sketch function.
 *
 *   4. Input processing — `findHovered()` and `nodePositions()` are imported
 *      from utils.js (pure functions, independently tested). Controller code is
 *      any code that answers "what did the user do?"; view code only draws.
 *
 *   5. Per-frame dispatch — reading the current phase and calling the
 *      appropriate draw function from view.js with already-resolved data.
 *
 * p5 instance mode:
 *   p5 is instantiated with `new p5(sketch)` where `sketch` is a function
 *   that receives the p5 instance as `p`. All p5 functions and constants are
 *   accessed via `p` (e.g. p.background, p.mouseX). This avoids polluting the
 *   global scope with p5's names, required when multiple scripts share the page.
 *
 * Imports:
 *   model.js  — initAssets, getAssets, getState, setState
 *   view.js   — one draw function per phase
 *   utils.js  — nodePositions, findHovered
 */

import { initAssets, getAssets, getState, setState } from "./model.js";
import { nodePositions, findHovered } from "./utils.js";
import {
    drawIntroduction,
    drawInstructions,
    drawPreTrial,
    drawTrial,
    drawPostTrial,
} from "./view.js";

// ---------------------------------------------------------------------------
// MARK: Phase constants
// ---------------------------------------------------------------------------

// Object.freeze makes Phase behave like an enum — its properties cannot be
// added, removed, or changed after creation.
const Phase = Object.freeze({
    INTRODUCTION: 'introduction',
    INSTRUCTIONS: 'instructions',
    PRE_TRIAL:    'preTrial',
    TRIAL:        'trial',
    POST_TRIAL:   'postTrial'
});

// ---------------------------------------------------------------------------
// MARK: Phase state
// ---------------------------------------------------------------------------

let currentPhase = Phase.INTRODUCTION;

/** Returns the currently active phase string (one of the Phase constants). */
function getCurrentPhase() { return currentPhase; }

/**
 * Transitions the phase state machine to `phase`.
 * Throws if `phase` is not one of the Phase constants.
 *
 * @param {string} phase - One of the Phase constant values.
 */
function setCurrentPhase(phase) {
    if (!Object.values(Phase).includes(phase)) {
        throw new Error(`Invalid phase: ${phase}`);
    }
    currentPhase = phase;
}

// ---------------------------------------------------------------------------
// MARK: Container references
// ---------------------------------------------------------------------------

// Grab both containers once at module load time so startTrial() can toggle
// their display without a DOM lookup on every call.
const studyContainer = document.getElementById("study-container");
const reactContainer = document.getElementById("react-container");

// ---------------------------------------------------------------------------
// MARK: Trial state
// ---------------------------------------------------------------------------

let trialMode    = null;   // "standard" | "thumbview" — set in startTrial()
let trialStarted = false;  // guards startTrial() so setup logic runs only once

// ---------------------------------------------------------------------------
// MARK: startTrial
// ---------------------------------------------------------------------------

/**
 * Starts the trial on the first call; does nothing on subsequent calls
 * (guarded by `trialStarted`). Called every frame from p.draw while the
 * phase is TRIAL — the guard makes it safe to call repeatedly.
 *
 * Sets window.studyTrialActive = true, which enables the right-click
 * canvas ↔ React toggle registered in react-ui.js.
 *
 * `condition_name` is a global string injected by the Flask template in task.html.
 */
function startTrial() {
    if (trialStarted) return;
    trialStarted = true;

    window.studyTrialActive = true;

    if (condition_name === "Condition 1") {
        trialMode = "standard";
        // In standard mode the participant presses Space to end the trial.
        document.addEventListener("keydown", onTrialKeyPress);
        // Hide the p5 canvas and show the React IDE.
        studyContainer.style.display = "none";
        reactContainer.style.display = "block";
    } else if (condition_name === "Condition 2") {
        trialMode = "thumbview";
        // In thumbview mode the trial ends when keyPressed calls
        // setCurrentPhase(Phase.POST_TRIAL) directly — no listener needed.
        reactContainer.style.display = "none";
        studyContainer.style.display = "block";
    }
}

// ---------------------------------------------------------------------------
// MARK: endTrial
// ---------------------------------------------------------------------------

/**
 * Cleans up after the trial ends: clears the studyTrialActive flag (which
 * disables the right-click canvas toggle) and removes the Space keydown
 * listener used in standard mode.
 */
function endTrial() {
    window.studyTrialActive = false;
    document.removeEventListener("keydown", onTrialKeyPress);
}

// ---------------------------------------------------------------------------
// MARK: Trial input handler
// ---------------------------------------------------------------------------

/**
 * Keydown handler registered during standard-mode (Condition 1) trials.
 * Pressing Space ends the trial and advances to the POST_TRIAL phase.
 *
 * @param {KeyboardEvent} event
 */
function onTrialKeyPress(event) {
    if (event.key === " ") {
        endTrial();
        setCurrentPhase(Phase.POST_TRIAL);
    }
}

// ---------------------------------------------------------------------------
// MARK: Sketch (p5 controller)
// ---------------------------------------------------------------------------

/**
 * The p5 sketch function. Receives the p5 instance as `p` and wires up all
 * lifecycle hooks. Passed directly to `new p5(sketch)` at the bottom of this
 * file.
 *
 * p5 lifecycle order:
 *   preload → setup → draw (loop) → keyPressed / windowResized (on events)
 *
 * @param {object} p - The p5 instance.
 */
const sketch = (p) => {
    let canvas;  // holds the p5 canvas element returned by p.createCanvas

    // -------------------------------------------------------------------------
    // MARK: p.preload
    // -------------------------------------------------------------------------

    // preload runs before setup. p5 waits for all p.loadImage / p.loadJSON calls
    // made inside preload to complete before continuing to setup.
    p.preload = function () {
        initAssets(p);  // triggers async loading of overview.png, root.json, layout.json
    };

    // -------------------------------------------------------------------------
    // MARK: p.setup
    // -------------------------------------------------------------------------

    // setup runs once after preload completes. Creates the canvas and attaches it
    // to #study-container so it fills the fixed-position div defined in task.html.
    p.setup = function () {
        const parent = document.getElementById("study-container");
        canvas = p.createCanvas(p.windowWidth, p.windowHeight).parent(parent);
    };

    // -------------------------------------------------------------------------
    // MARK: p.draw
    // -------------------------------------------------------------------------

    // draw runs every frame (default 60 fps). Reads the current phase and
    // delegates to the appropriate view function. During the TRIAL phase it
    // also computes the hovered node and passes it to drawTrial.
    p.draw = function () {
        const phase = getCurrentPhase();
        const { overview, tree, layout } = getAssets();
        const { fullscreen } = getState();

        if (phase === Phase.INTRODUCTION) {
            drawIntroduction(p, fullscreen);

        } else if (phase === Phase.INSTRUCTIONS) {
            drawInstructions(p);

        } else if (phase === Phase.PRE_TRIAL) {
            drawPreTrial(p);

        } else if (phase === Phase.TRIAL) {
            // startTrial() is idempotent — safe to call every frame; it only
            // executes its setup logic (showing/hiding containers) on the first call.
            startTrial();

            // Convert screen mouse coordinates to image-pixel space before hit testing.
            // Node positions in root.json are stored in image-pixel space.
            const widthScale  = p.windowWidth  / overview.width;
            const heightScale = p.windowHeight / overview.height;
            const hoverInfo = findHovered(layout, tree, p.mouseX / widthScale, p.mouseY / heightScale);

            drawTrial(p, overview, layout, hoverInfo);

        } else if (phase === Phase.POST_TRIAL) {
            drawPostTrial(p);
        }
    };

    // -------------------------------------------------------------------------
    // MARK: p.keyPressed
    // -------------------------------------------------------------------------

    // keyPressed fires once per key-down event. Handles two keys:
    //   Enter — requests fullscreen and records it in state so views can adjust
    //   Space — advances the phase state machine (except during TRIAL in
    //           Condition 1, where onTrialKeyPress handles Space instead)
    p.keyPressed = function () {
        if (p.key === "Enter") {
            document.documentElement.requestFullscreen();
            setState({ fullscreen: true });
        }

        const phase = getCurrentPhase();
        if (p.key === " ") {
            if (phase === Phase.INTRODUCTION) {
                setCurrentPhase(Phase.INSTRUCTIONS);
            } else if (phase === Phase.INSTRUCTIONS) {
                setCurrentPhase(Phase.PRE_TRIAL);
            } else if (phase === Phase.PRE_TRIAL) {
                setCurrentPhase(Phase.TRIAL);
            } else if (phase === Phase.TRIAL) {
                setCurrentPhase(Phase.POST_TRIAL);
            } else if (phase === Phase.POST_TRIAL) {
                // `finished` is a global declared in task.html; setting it to true
                // suppresses the beforeunload warning that would otherwise fire when
                // BOFS navigates to the next page.
                finished = true;
                window.location.href = "/redirect_next_page";
            }
        }
    };

    // -------------------------------------------------------------------------
    // MARK: p.windowResized
    // -------------------------------------------------------------------------

    // windowResized fires when the browser window is resized. Keeps the canvas
    // filling the full window so the overview image always scales correctly.
    p.windowResized = function () {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    };
};

// ---------------------------------------------------------------------------
// MARK: Mount
// ---------------------------------------------------------------------------

// Instantiate p5 in instance mode. The sketch function receives `p` (the p5
// instance) as its argument and attaches all lifecycle hooks to it.
// p5 is loaded as a global from the <script> tag in task.html (vendor/p5.min.js).
new p5(sketch);
