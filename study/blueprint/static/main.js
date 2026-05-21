/* Any variables initialized in the global script in task.html can be directly
referenced by name in any script. */
let canvas, fullscreen, parent;

function preload() {  
    // TODO
}


function setup() {
    // TODO
    parent = document.getElementById("study-container");
    canvas = createCanvas(windowWidth, windowHeight).parent(parent);
    fullscreen = false;
}


function draw() {
    // TODO
    background([255, 0, 0]);
    noStroke();
    fill([255, 255, 255]);
    
    if (!fullscreen) {
        text("Press Enter for fullscreen", 10, 10);
        return;
    }

    text(condition_name + " (" + condition_number + ")", 10, 10);
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
