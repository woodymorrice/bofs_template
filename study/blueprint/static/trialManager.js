import { setCurrentPhase, Phase } from "./phaseManager.js";

export const studyContainer = document.getElementById("study-container");
export const reactContainer = document.getElementById("react-container");

let mode = null;

export function initTrial() {
    if (condition_name === "Condition 1") {
        mode = "standard";
        document.addEventListener("keydown", onKeyPress);
    } else if (condition_name === "Condition 2") {
        mode = "thumbview";
    }
}

export function startTrial() {
    initTrial();
    if (mode === "standard") {
        studyContainer.style.display = "none";
        reactContainer.style.display = "block";
    }
    else if (mode === "thumbview") {
        reactContainer.style.display = "none";
        studyContainer.style.display = "block";
    }
}

function endTrial() {
    document.removeEventListener("keydown", onKeyPress);
}

function onKeyPress(event) {
    if (event.key === " ") {
        endTrial();
        setCurrentPhase(Phase.POST_TRIAL);
    }
}

export function getMode() { return mode; }