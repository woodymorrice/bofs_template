/**
 * p5-ui/view.js  —  View layer of the canvas pseudo-MVC.
 *
 * Contains one draw function per study phase. Each function receives the p5
 * instance and pre-resolved data from controller.js — views have
 * no knowledge of the dataset schema and perform no hit detection or input
 * handling.
 *
 * All coordinate maths in this file converts from image-pixel space (the
 * coordinate system used in root.json and layout.json) to screen pixels:
 *   screen_x = image_x * widthScale   where widthScale = windowWidth / overview.width
 *   screen_y = image_y * heightScale  where heightScale = windowHeight / overview.height
 *
 * `condition_name` is a global string injected by the Flask template in task.html.
 *
 * Exports (all consumed by controller.js):
 *   drawIntroduction(p, fullscreen)
 *   drawInstructions(p)
 *   drawPreTrial(p)
 *   drawTrial(p, overview, layout, hoverInfo)
 *   drawPostTrial(p)
 */

// ---------------------------------------------------------------------------
// MARK: drawIntroduction
// ---------------------------------------------------------------------------

/**
 * Renders the INTRODUCTION phase screen. Shows a prompt to enter fullscreen
 * until the participant presses Enter, then shows a generic message.
 *
 * @param {object}  p          - The p5 instance.
 * @param {boolean} fullscreen - True after the participant has pressed Enter.
 */
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

// ---------------------------------------------------------------------------
// MARK: drawInstructions
// ---------------------------------------------------------------------------

/**
 * Renders the INSTRUCTIONS phase screen.
 *
 * @param {object} p - The p5 instance.
 */
export function drawInstructions(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("Instructions phase", p.windowWidth / 2, p.windowHeight / 2);
}

// ---------------------------------------------------------------------------
// MARK: drawPreTrial
// ---------------------------------------------------------------------------

/**
 * Renders the PRE_TRIAL phase screen.
 *
 * @param {object} p - The p5 instance.
 */
export function drawPreTrial(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("PreTrial phase", p.windowWidth / 2, p.windowHeight / 2);
}

// ---------------------------------------------------------------------------
// MARK: drawTrial
// ---------------------------------------------------------------------------

/**
 * Renders the TRIAL phase. Behaviour differs by condition:
 *
 *   Standard — draws the overview image only; the React IDE (shown by
 *                 startTrial in controller.js) is the primary interface.
 *
 *   Thumbview — draws the overview image with a hover highlight rect and a
 *                 debug cursor circle. hoverInfo comes from findHovered() in
 *                 controller.js; it is null when the mouse is not over any file.
 *
 * Coordinate conversion: positions in hoverInfo and layout are in image-pixel
 * space; multiply by widthScale / heightScale to get screen coordinates.
 *
 * @param {object}      p         - The p5 instance.
 * @param {object}      overview  - The loaded p5.Image (overview.png).
 * @param {object}      layout    - The parsed layout.json object.
 * @param {object|null} hoverInfo - Flat node info from findHovered(), or null.
 *   hoverInfo shape: { name, id, width, left, top, height }
 *   All position/dimension values are in image-pixel space.
 */
export function drawTrial(p, overview, layout, hoverInfo) {
    if (condition_name === "Standard") {
        p.background([0, 0, 0]);
        // Scale the overview image to fill the entire canvas.
        p.image(overview, 0, 0, p.windowWidth, p.windowHeight);

    } else if (condition_name === "Thumbview") {
        // Compute scale factors to convert image-pixel coordinates to screen pixels.
        const widthScale  = p.windowWidth  / overview.width;
        const heightScale = p.windowHeight / overview.height;

        p.background([255, 0, 0]);
        p.noStroke();
        p.fill([255, 255, 255]);
        p.image(overview, 0, 0, p.windowWidth, p.windowHeight);

        if (hoverInfo) {
            // Show the hovered node's name, id, and raw image-pixel dimensions.
            p.text(
                hoverInfo.name + " (" + hoverInfo.id + ")\n" +
                "Left: " + hoverInfo.left + ", Top: " + hoverInfo.top + "\n" +
                "Width: " + hoverInfo.width + ", Height: " + hoverInfo.height,
                p.windowWidth / 2, p.windowHeight / 2
            );

            // Draw a highlight rect over the hovered file column.
            // - x: convert hoverInfo.left from image-pixel to screen pixels
            // - y: subtract labelOffset so the rect covers the filename label too
            // - w: use widestWidth (full column width) not node.width
            // - h: add labelOffset back to the height to cover the label area
            const labelOffset = layout.labelHeight * layout.heightScale;
            p.noFill();
            p.stroke([255, 0, 0]);
            p.rect(
                hoverInfo.left * widthScale,
                (hoverInfo.top - labelOffset) * heightScale,
                layout.widestWidth * layout.widthScale * widthScale,
                (hoverInfo.height + labelOffset) * heightScale
            );
        } else {
            p.text("NO HOVER", p.windowWidth / 2, p.windowHeight / 2);
        }

        // Debug cursor: red circle that follows the mouse.
        p.fill([255, 0, 0]);
        p.circle(p.mouseX, p.mouseY, 20);
    }
}

// ---------------------------------------------------------------------------
// MARK: drawPostTrial
// ---------------------------------------------------------------------------

/**
 * Renders the POST_TRIAL phase screen.
 *
 * @param {object} p - The p5 instance.
 */
export function drawPostTrial(p) {
    p.background([255, 0, 0]);
    p.noStroke();
    p.fill([255, 255, 255]);
    p.text("Post-trial phase", p.windowWidth / 2, p.windowHeight / 2);
}
