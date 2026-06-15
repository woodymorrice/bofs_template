/**
 * p5-ui/utils.js  —  Pure utility functions for the spatial canvas.
 *
 * Contains functions extracted from controller.js that have no browser globals,
 * no p5 dependency, and no side effects — making them importable and testable
 * in isolation. All other p5-ui modules (controller.js) import from here.
 *
 * Coordinate system note: all coordinates handled here are in image-pixel space
 * (the coordinate system of root.json / layout.json), NOT screen pixels. Callers
 * must convert screen mouse coordinates before passing them:
 *   mx = p.mouseX / (windowWidth  / overview.width)
 *   my = p.mouseY / (windowHeight / overview.height)
 *
 * Exports:
 *   nodePositions(node)               — normalises dual-schema node fields to arrays
 *   findHovered(layout, node, mx, my) — returns hovered leaf node info or null
 */

// ---------------------------------------------------------------------------
// MARK: nodePositions
// ---------------------------------------------------------------------------

/**
 * Normalises the per-column position fields of a leaf node from root.json,
 * handling the two dataset schemas:
 *
 *   boltz schema — scalar fields: node.left (number), node.top (number),
 *                  node.height (number)
 *   test schema  — array fields:  node.left (number[]), node.top (number[]),
 *                  node.heights (number[])
 *
 * Returns all three as arrays so the rest of the code can always iterate
 * them the same way regardless of which dataset is active.
 *
 * @param {object} node - A leaf node from root.json (type === "TreeFile").
 * @returns {{ lefts: number[], tops: number[], heights: number[] }}
 */
export function nodePositions(node) {
    const lefts   = Array.isArray(node.left)    ? node.left    : [node.left];
    const tops    = Array.isArray(node.top)      ? node.top     : [node.top];
    // Note: boltz uses "height" (singular), test dataset uses "heights" (plural).
    const heights = Array.isArray(node.heights)  ? node.heights : [node.height];
    return { lefts, tops, heights };
}

// ---------------------------------------------------------------------------
// MARK: findHovered
// ---------------------------------------------------------------------------

/**
 * Recursively searches the root.json tree to find the leaf node (file) whose
 * bounding box contains the point (mx, my) in image-pixel space.
 *
 * Hit area width is layout.widestWidth * layout.widthScale (the full column
 * width in image-pixel space) rather than node.width, so the entire column is
 * interactive — not just the narrower individual file width.
 *
 * Hit area height: from tops[i] down to tops[i] - labelOffset + heights[i],
 * where labelOffset = layout.labelHeight * layout.heightScale. This accounts
 * for the filename label drawn above each file block.
 *
 * Returns a flat object so view.js receives clean data with no schema
 * knowledge required. Returns null if the mouse is not over any file.
 *
 * @param {object} layout - The parsed layout.json object.
 * @param {object} node   - The current node in the root.json tree (start with root).
 * @param {number} mx     - Mouse x in image-pixel space.
 * @param {number} my     - Mouse y in image-pixel space.
 * @returns {{ name: string, id: string, width: number, left: number, top: number, height: number } | null}
 */
export function findHovered(layout, node, mx, my) {
    // Directory nodes have children — recurse into them and return the first
    // leaf match found. Leaf nodes (files) have no children property.
    if (node.children) {
        for (let child of node.children) {
            let result = findHovered(layout, child, mx, my);
            if (result) return result;
        }
        return null;
    }

    const { lefts, tops, heights } = nodePositions(node);

    // labelOffset converts the label height from layout coordinates to
    // image-pixel space; it is subtracted so the hit area top aligns with
    // the label rather than the file content below it.
    const labelOffset = layout.labelHeight * layout.heightScale;

    // Use widestWidth (full column width) rather than node.width so the entire
    // column area is hoverable, not just the narrower individual file bounding box.
    const colWidth = layout.widestWidth * layout.widthScale;

    // A file may span multiple columns; check each column occurrence.
    for (let i = 0; i < lefts.length; i++) {
        if (mx < lefts[i] || mx > lefts[i] + colWidth) continue;
        if (my >= tops[i] && my <= tops[i] - labelOffset + heights[i])
            return { name: node.name, id: node.id, width: node.width, left: lefts[i], top: tops[i], height: heights[i] };
    }
    return null;
}
