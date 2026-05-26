/* Any variables initialized in the global-variables script in task.html can be 
directly referenced by name in any script. */
let canvas, fullscreen, layout, overview, parent, tree;
const MAX_WIDTH = 3920;
const MAX_HEIGHT = 2160;


function preload() {  
    // TODO
    overview = loadImage("/blueprint/test/overview.png");
    tree = loadJSON("/blueprint/test/root.json");
    layout = loadJSON("/blueprint/test/layout.json");
}


function setup() {
    // TODO
    parent = document.getElementById("study-container");
    canvas = createCanvas(windowWidth, windowHeight).parent(parent);
    fullscreen = false;
}


function draw() {
    let widthScale = windowWidth / overview.width;
    let heightScale = windowHeight / overview.height;

    // TODO
    background([255, 0, 0]);
    noStroke();
    fill([255, 255, 255]);
    image(overview, 0, 0, windowWidth, windowHeight);
    
    if (!fullscreen) {
        text("Press Enter for fullscreen", 10, 10);
        return;
    }

    // text(condition_name + " (" + condition_number + ")", 10, 10);

    let [hovered, hoverIndex] = findHovered(layout, tree, mouseX/widthScale, mouseY/heightScale);
    if (hovered) {
        text(hovered.name + " (" + hovered.id + ")\n" +
            "Left: " + hovered.left[hoverIndex] + ", Top: " + hovered.top[hoverIndex] + "\n" +
            "Width: " + hovered.width + ", Height: " + hovered.heights[hoverIndex], windowWidth/2, windowHeight/2);
        noFill();
        stroke([255, 0, 0]);
        rect(hovered.left[hoverIndex]*widthScale, (hovered.top[hoverIndex]-layout.labelHeight*layout.heightScale)*heightScale, 
            hovered.width*widthScale, hovered.heights[hoverIndex]*heightScale);
    }

    fill([255, 0, 0]);
    circle(mouseX, mouseY, 20);
}


function keyPressed() {
    // TODO

    /* Browser fullscreen API must be triggered by a user gesture. */
    if (key === "Enter") {
        document.documentElement.requestFullscreen();
        fullscreen = true;
    }

    /* Set finished = true and window.location.href = "/redirect_next_page" to
    advance to the next page automatically. */
    if (key === " ") {
        finished = true;
        window.location.href = "/redirect_next_page";
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function findHovered(layout, node, mx, my) {
  if (node.children) {
    for (let child of node.children) {
      let [matchNode, matchIndex] = findHovered(child, mx, my);
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