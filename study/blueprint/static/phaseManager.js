export const Phase = Object.freeze({
    INTRODUCTION: 'introduction',
    INSTRUCTIONS: 'instructions',
    PRE_TRIAL: 'preTrial',
    TRIAL: 'trial',
    POST_TRIAL: 'postTrial'
});

let currentPhase = Phase.INTRODUCTION;
let trialIndex = 0;
const condition = window.condition_number;

export function getCurrentPhase() { return currentPhase; }
export function getTrialIndex() { return trialIndex; }

export function setCurrentPhase(phase) {
    if (!Object.values(Phase).includes(phase)) {
        throw new Error(`Invalid phase: ${phase}`);
    }
    currentPhase = phase;
}
