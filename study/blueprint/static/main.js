/* Any variables initialized in the global script in task.html can be directly
referenced by name in any script. */


function preload() {  
    // TODO
}


function setup() {
    // TODO
}


function draw() {
    // TODO
    const parent = document.getElementById("study-container");
    const canvas = createCanvas(800, 600).parent(parent);

    noStroke();
    fill([255, 255, 255]);
    text(condition, 10, 10);
}


function keyPressed() {
    // TODO
}
