export function drawIntroduction(p, fullscreen) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    if (!fullscreen) {
        p.text("Press Enter for fullscreen", p.windowWidth / 2, p.windowHeight / 2);
    } else {
        p.text("Introduction phase", p.windowWidth / 2, p.windowHeight / 2);
    }
}

export function drawInstructions(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("Instructions phase", p.windowWidth / 2, p.windowHeight / 2);
}

export function drawPreTrial(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("PreTrial phase", p.windowWidth / 2, p.windowHeight / 2);
}

export function drawTrial(p, overview, layout, hoverInfo) {
    if (condition_name === "Condition 1") {
        p.background([0, 0, 0]);
        p.image(overview, 0, 0, p.windowWidth, p.windowHeight);
    } else if (condition_name === "Condition 2") {
        const widthScale  = p.windowWidth  / overview.width;
        const heightScale = p.windowHeight / overview.height;

        p.background([255, 0, 0]);
        p.noStroke();
        p.fill([255, 255, 255]);
        p.image(overview, 0, 0, p.windowWidth, p.windowHeight);

        if (hoverInfo) {
            p.text(
                hoverInfo.name + " (" + hoverInfo.id + ")\n" +
                "Left: " + hoverInfo.left + ", Top: " + hoverInfo.top + "\n" +
                "Width: " + hoverInfo.width + ", Height: " + hoverInfo.height,
                p.windowWidth / 2, p.windowHeight / 2
            );
            p.noFill();
            p.stroke([255, 0, 0]);
            p.rect(
                hoverInfo.left * widthScale,
                (hoverInfo.top - layout.labelHeight * layout.heightScale) * heightScale,
                layout.widestWidth * layout.widthScale * widthScale,
                (hoverInfo.height + layout.labelHeight * layout.heightScale) * heightScale
            );
        } else {
            p.text("NO HOVER", p.windowWidth / 2, p.windowHeight / 2);
        }

        p.fill([255, 0, 0]);
        p.circle(p.mouseX, p.mouseY, 20);
    }
}

export function drawPostTrial(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("Post-trial phase", p.windowWidth / 2, p.windowHeight / 2);
}
