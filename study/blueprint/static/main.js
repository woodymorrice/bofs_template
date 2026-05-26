import { getCurrentPhase, setCurrentPhase, Phase } from "./phaseManager.js";
import { startTrial, getMode } from "./trialManager.js";



const sketch = (p) => {
    /* Any variables initialized in the global-variables script in task.html can be 
    directly referenced by name in any script. */
    let canvas, fullscreen, layout, overview, parent, tree;
    const MAX_WIDTH = 3920;
    const MAX_HEIGHT = 2160;
    
    
    p.preload = function() {  
        // TODO
        overview = p.loadImage("/blueprint/test/overview.png");
        tree = p.loadJSON("/blueprint/test/root.json");
        layout = p.loadJSON("/blueprint/test/layout.json");
    }
    
    
    p.setup = function() {
        // TODO
        parent = document.getElementById("study-container");
        canvas = p.createCanvas(p.windowWidth, p.windowHeight).parent(parent);
        fullscreen = false;
    }
    
    
    p.draw = function() {  
        const phase = getCurrentPhase();
        if (phase === Phase.INTRODUCTION) {
            drawIntroduction(p, fullscreen);
        } else if (phase === Phase.INSTRUCTIONS) {
            drawInstructions(p);
        } else if (phase === Phase.PRE_TRIAL) {
            drawPreTrial(p);
        } else if (phase === Phase.TRIAL) {
            startTrial();
            drawTrial(p, overview, layout, tree);
        } else if (phase == Phase.POST_TRIAL) {
            drawPostTrial(p);
        }
        return;
    }
    
    p.keyPressed = function() {
        /* Browser fullscreen API must be triggered by a user gesture. */
        if (p.key === "Enter") {
            document.documentElement.requestFullscreen();
            fullscreen = true;
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
            } else if (phase == Phase.POST_TRIAL) {                
                /* Set finished = true and window.location.href = "/redirect_next_page" to
                advance to the next page automatically. */
                finished = true;
                window.location.href = "/redirect_next_page";
            }
        }
    }
    
    p.windowResized = function() {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    }
}

function findHovered(layout, node, mx, my) {
  if (node.children) {
    for (let child of node.children) {
      let [matchNode, matchIndex] = findHovered(layout, child, mx, my);
      if (matchNode) return [matchNode, matchIndex];
    }
    return [null, -1];
  }
  if (mx < node.left[0] || mx > node.left[0] + node.width) return [null, -1];
  for (let i = 0; i < node.left.length; i++) {
    if (my >= node.top[i] && my <= (node.top[i]-layout.labelHeight*layout.heightScale) + node.heights[i]) return [node, i];
  }
  return [null, -1];
}

function drawIntroduction(p, fullscreen) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    if (!fullscreen) {
        p.text("Press Enter for fullscreen", p.windowWidth/2, p.windowHeight/2);
    } else {
        p.text("Introduction phase", p.windowWidth/2, p.windowHeight/2);
    }
}

function drawInstructions(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("Instructions phase", p.windowWidth/2, p.windowHeight/2);
}

function drawPreTrial(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("PreTrial phase", p.windowWidth/2, p.windowHeight/2);
}

function drawTrial(p, overview, layout, tree) {
    if (condition_name === "Condition 1") {

    }
    else if (condition_name === "Condition 2") {
        let widthScale = p.windowWidth / overview.width;
        let heightScale = p.windowHeight / overview.height;
    
        // TODO
        p.background([255, 0, 0]);
        p.noStroke();
        p.fill([255, 255, 255]);
        p.image(overview, 0, 0, p.windowWidth, p.windowHeight);
    
        // text(condition_name + " (" + condition_number + ")", 10, 10);
    
        let [hovered, hoverIndex] = findHovered(layout, tree, p.mouseX/widthScale, p.mouseY/heightScale);
        if (hovered) {
            p.text(hovered.name + " (" + hovered.id + ")\n" +
                "Left: " + hovered.left[hoverIndex] + ", Top: " + hovered.top[hoverIndex] + "\n" +
                "Width: " + hovered.width + ", Height: " + hovered.heights[hoverIndex], p.windowWidth/2, p.windowHeight/2);
            p.noFill();
            p.stroke([255, 0, 0]);
            p.rect(hovered.left[hoverIndex]*widthScale, (hovered.top[hoverIndex]-layout.labelHeight*layout.heightScale)*heightScale, 
                hovered.width*widthScale, hovered.heights[hoverIndex]*heightScale);
        }
    
        p.fill([255, 0, 0]);
        p.circle(p.mouseX, p.mouseY, 20);
    }
}

function drawPostTrial(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("Post-trial phase", p.windowWidth/2, p.windowHeight/2);
}

// This line replaces p5's automatic global mode startup.
// Store the return value — call mySketch.remove() to tear it down later.
const mySketch = new p5(sketch);