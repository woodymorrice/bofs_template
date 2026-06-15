/**
 * tests/utils.test.js
 *
 * Tests for p5-ui/utils.js — nodePositions (dual-schema normalisation) and
 * findHovered (recursive hit detection). These are the only p5-ui functions
 * that are pure enough to test without a browser or p5 instance.
 *
 * All coordinates in findHovered tests are in image-pixel space (the same
 * space the functions operate in). Callers are responsible for converting
 * screen pixels before passing them; that conversion is not tested here.
 */

import { describe, it, expect } from 'vitest';
import { nodePositions, findHovered } from '../study/blueprint/static/p5-ui/utils.js';

// ---------------------------------------------------------------------------
// MARK: Shared fixtures
// ---------------------------------------------------------------------------

// Layout with no label height — simplest case, hit area = [top, top+height].
const simpleLayout = {
    widestWidth: 100,
    widthScale:  1,
    labelHeight: 0,
    heightScale: 1,
};

// Layout with a 10px label — shrinks the bottom of the hit area by labelHeight.
const labelLayout = {
    widestWidth: 100,
    widthScale:  1,
    labelHeight: 10,
    heightScale: 1,
};

// Boltz-schema leaf node: all position fields are scalars.
// Column: x in [50, 150], y in [100, 160] (with simpleLayout).
const boltzNode = {
    name: 'foo.py', id: 'foo', width: 80,
    left: 50, top: 100, height: 60,
};

// Test-schema leaf node: position fields are arrays (two columns).
// Column 0: x in [50, 150],  y in [100, 160]
// Column 1: x in [300, 400], y in [200, 240]
const testNode = {
    name: 'bar.py', id: 'bar', width: 80,
    left: [50, 300], top: [100, 200], heights: [60, 40],
};

// ---------------------------------------------------------------------------
// MARK: nodePositions
// ---------------------------------------------------------------------------

describe('nodePositions', () => {
    it('wraps boltz scalar fields into single-element arrays', () => {
        const { lefts, tops, heights } = nodePositions({ left: 10, top: 20, height: 30 });
        expect(lefts).toEqual([10]);
        expect(tops).toEqual([20]);
        expect(heights).toEqual([30]);
    });

    it('returns test-schema array fields unchanged', () => {
        const { lefts, tops, heights } = nodePositions({
            left: [10, 20], top: [30, 40], heights: [50, 60],
        });
        expect(lefts).toEqual([10, 20]);
        expect(tops).toEqual([30, 40]);
        expect(heights).toEqual([50, 60]);
    });
});

// ---------------------------------------------------------------------------
// MARK: findHovered — null cases
// ---------------------------------------------------------------------------

describe('findHovered — null cases', () => {
    it('returns null for a directory with no children', () => {
        expect(findHovered(simpleLayout, { children: [] }, 100, 130)).toBeNull();
    });

    it('returns null when the mouse is left of the column', () => {
        // left edge is 50; mx=49 fails the mx < lefts[i] check
        expect(findHovered(simpleLayout, { children: [boltzNode] }, 49, 130)).toBeNull();
    });

    it('returns null when the mouse is right of the column', () => {
        // colWidth = 100 * 1 = 100; right edge = 50 + 100 = 150; mx=151 fails mx > 150
        expect(findHovered(simpleLayout, { children: [boltzNode] }, 151, 130)).toBeNull();
    });

    it('returns null when the mouse is above the file', () => {
        // top = 100; my=99 fails my >= tops[i]
        expect(findHovered(simpleLayout, { children: [boltzNode] }, 100, 99)).toBeNull();
    });

    it('returns null when the mouse is below the file', () => {
        // bottom = top - labelOffset + height = 100 - 0 + 60 = 160; my=161 fails my <= 160
        expect(findHovered(simpleLayout, { children: [boltzNode] }, 100, 161)).toBeNull();
    });

    it('returns null when the mouse is between columns of a multi-column node', () => {
        // column 0 right edge is 150, column 1 left edge is 300; mx=200 matches neither
        expect(findHovered(simpleLayout, { children: [testNode] }, 200, 130)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// MARK: findHovered — hit cases
// ---------------------------------------------------------------------------

describe('findHovered — hit cases', () => {
    it('finds a file when the mouse is inside its bounding box', () => {
        const result = findHovered(simpleLayout, { children: [boltzNode] }, 100, 130);
        expect(result).not.toBeNull();
        expect(result.name).toBe('foo.py');
        expect(result.id).toBe('foo');
    });

    it('returns the full hovered-node shape', () => {
        const result = findHovered(simpleLayout, { children: [boltzNode] }, 100, 130);
        expect(result).toMatchObject({
            name: 'foo.py', id: 'foo', width: 80,
            left: 50, top: 100, height: 60,
        });
    });

    it('hits at the column right edge (inclusive)', () => {
        // mx = left + colWidth = 50 + 100 = 150; the check is mx > 150, so 150 passes
        expect(findHovered(simpleLayout, { children: [boltzNode] }, 150, 130)).not.toBeNull();
    });

    it('hits beyond node.width but within widestWidth', () => {
        // node.width is 80 (left+80=130) but colWidth is 100 (left+100=150)
        // mx=145 is inside the column but outside the narrower node.width
        expect(findHovered(simpleLayout, { children: [boltzNode] }, 145, 130)).not.toBeNull();
    });

    it('recurses into nested directories to find a leaf', () => {
        const nestedTree = { children: [{ name: 'src', children: [boltzNode] }] };
        const result = findHovered(simpleLayout, nestedTree, 100, 130);
        expect(result).not.toBeNull();
        expect(result.name).toBe('foo.py');
    });

    it('finds a multi-column node hit in column 0', () => {
        const result = findHovered(simpleLayout, { children: [testNode] }, 100, 130);
        expect(result).not.toBeNull();
        expect(result.left).toBe(50);
        expect(result.top).toBe(100);
        expect(result.height).toBe(60);
    });

    it('finds a multi-column node hit in column 1', () => {
        // column 1: left=300, top=200, height=40 → x in [300,400], y in [200,240]
        const result = findHovered(simpleLayout, { children: [testNode] }, 350, 220);
        expect(result).not.toBeNull();
        expect(result.left).toBe(300);
        expect(result.top).toBe(200);
        expect(result.height).toBe(40);
    });
});

// ---------------------------------------------------------------------------
// MARK: findHovered — labelHeight
// ---------------------------------------------------------------------------

describe('findHovered — labelHeight', () => {
    it('adjusts the bottom of the hit area by labelHeight', () => {
        // labelOffset = 10 * 1 = 10
        // bottom = top - labelOffset + height = 100 - 10 + 60 = 150
        expect(findHovered(labelLayout, { children: [boltzNode] }, 100, 150)).not.toBeNull();
        expect(findHovered(labelLayout, { children: [boltzNode] }, 100, 151)).toBeNull();
    });
});
