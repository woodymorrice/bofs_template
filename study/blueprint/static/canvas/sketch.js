import { getCurrentPhase, setCurrentPhase, Phase } from "../phaseManager.js";
import { startTrial } from "../trialManager.js";
import { initAssets, getAssets, getState, setState } from "./model.js";
import {
    drawIntroduction,
    drawInstructions,
    drawPreTrial,
    drawTrial,
    drawPostTrial,
} from "./views.js";

function nodePositions(node) {
    // Normalize scalar (boltz schema) vs array (test schema) node fields.
    const lefts   = Array.isArray(node.left)    ? node.left    : [node.left];
    const tops    = Array.isArray(node.top)      ? node.top     : [node.top];
    const heights = Array.isArray(node.heights)  ? node.heights : [node.height];
    return { lefts, tops, heights };
}

function findHovered(layout, node, mx, my) {
    if (node.children) {
        for (let child of node.children) {
            let result = findHovered(layout, child, mx, my);
            if (result) return result;
        }
        return null;
    }
    const { lefts, tops, heights } = nodePositions(node);
    const labelOffset = layout.labelHeight * layout.heightScale;
    const colWidth    = layout.widestWidth * layout.widthScale;
    for (let i = 0; i < lefts.length; i++) {
        if (mx < lefts[i] || mx > lefts[i] + colWidth) continue;
        if (my >= tops[i] && my <= tops[i] - labelOffset + heights[i])
            return { name: node.name, id: node.id, width: node.width, left: lefts[i], top: tops[i], height: heights[i] };
    }
    return null;
}

const sketch = (p) => {
    let canvas;

    p.preload = function () {
        initAssets(p);
    };

    p.setup = function () {
        const parent = document.getElementById("study-container");
        canvas = p.createCanvas(p.windowWidth, p.windowHeight).parent(parent);
    };

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
            startTrial();
            const widthScale  = p.windowWidth  / overview.width;
            const heightScale = p.windowHeight / overview.height;
            const hoverInfo = findHovered(layout, tree, p.mouseX / widthScale, p.mouseY / heightScale);
            drawTrial(p, overview, layout, hoverInfo);
        } else if (phase === Phase.POST_TRIAL) {
            drawPostTrial(p);
        }
    };

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
                finished = true;
                window.location.href = "/redirect_next_page";
            }
        }
    };

    p.windowResized = function () {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    };
};

new p5(sketch);
