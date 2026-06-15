/**
 * react-ui.js
 *
 * Renders a VS Code-style study UI into #react-container using React 18 and
 * BlueprintJS 5. All imports are served from the esm.sh CDN — no build step
 * required. The `htm` library provides JSX-like tagged template literals that
 * call React.createElement at runtime.
 *
 * Layout (top to bottom, left to right):
 *
 *   +--------------------------------------------------+
 *   |  TopNav  (full width, ~50 px tall)               |
 *   |    [ File Edit ... ]  [ search bar ]  [ icons ]  |
 *   +------+------------+---------------------------+
 *   |      |            | TabBar | TabBar (split)    |
 *   | Act. |  Sidebar   +---------------------------+
 *   | Bar  |  (tree /   | DocumentView  | DocView   |
 *   |      |  search)   | left pane     | right pane|
 *   +------+------------+---------------------------+
 *
 * htm template syntax constraints:
 *   - Use html`...` tagged template literals (no build step / no JSX transform).
 *   - NEVER put a backtick character inside an html`...` template literal,
 *     including inside comments — it will prematurely close the template string.
 *   - Use <//> to close a component tag (shorthand for </ComponentName>).
 *   - Pass object props with the ${{ }} double-brace syntax, e.g. style=${{ color: "red" }}.
 *   - Browse Blueprint components and icons at https://blueprintjs.com/docs/
 */

import React, { useState, useEffect, useMemo, useRef, useCallback, useContext } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import htm from "https://esm.sh/htm@3";
import hljs from "https://esm.sh/highlight.js@11";
import {
    Navbar, NavbarGroup, NavbarHeading, NavbarDivider,
    Button,
    InputGroup,
    Tree,
    Alignment,
    NonIdealState,
    Spinner,
} from "https://esm.sh/@blueprintjs/core@5";
import {
    dataset,
    highlightTheme,
    codeFont,
    codeFontSize,
    codeLineHeight,
    debugMode,
    thumbviewContextLines,
    thumbviewViewportOffset,
} from "./study-config.js";

const html = htm.bind(React.createElement);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// JSON endpoint for the file tree. The dataset folder is set in study-config.js.
const TREE_URL = `/blueprint/datasets/${dataset}/root.json`;

/**
 * ACTIVITY_ITEMS — drives both the ActivityBar icon strip and the Sidebar panel
 * routing. Each entry has:
 *   id       {string}  - display label and keyboard shortcut hint; also used as
 *                        the value of activeActivity in StudyApp.
 *   icon     {string}  - Blueprint icon name. Browse all icons at
 *                        https://blueprintjs.com/docs/#icons
 *   disabled {bool}    - greyed out and non-interactive when true; the activity
 *                        still appears but clicking does nothing.
 *
 * To add a new panel: append an entry here, then add a matching branch in
 * Sidebar's render (mirror the explorerActive / searchActive pattern).
 */
const ACTIVITY_ITEMS = [
    { id: "Explorer (Ctrl+Shift+E)",       icon: "document",   disabled: false },
    { id: "Search (Ctrl+Shift+F)",         icon: "search",     disabled: false },
    { id: "Source Control (Ctrl+Shift+G)", icon: "git-branch", disabled: true  },
];

// ---------------------------------------------------------------------------
// Load highlight.js theme CSS (runs once when module loads)
// ---------------------------------------------------------------------------

(function loadHighlightTheme() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://unpkg.com/highlight.js@11/styles/${highlightTheme}.min.css`;
    document.head.appendChild(link);
}());

// Keyframe animation used by DocumentView to flash the target line after a
// go-to-line jump. Fades from a warm yellow highlight to transparent over 1.2 s.
(function injectLineFlashCSS() {
    const style = document.createElement("style");
    style.textContent = `
        @keyframes line-flash {
            0%   { background-color: rgba(255, 200, 50, 0.45); }
            60%  { background-color: rgba(255, 200, 50, 0.25); }
            100% { background-color: transparent; }
        }
    `;
    document.head.appendChild(style);
}());

// In debug mode, make the canvas toggle (right-click) available immediately,
// without waiting for the trial phase to start.
if (debugMode) window.studyTrialActive = true;

// ---------------------------------------------------------------------------
// MARK: App mode context
// ---------------------------------------------------------------------------

/**
 * AppModeContext — carries the current condition flags to every component
 * without prop-drilling. Published by StudyApp via a Provider wrapper.
 *
 * isThumbview {bool} — true when running Thumbview AND debugMode is off.
 *   - TopNav shows a greyed-out, non-interactive SearchBar placeholder instead
 *     of the real one (so Ctrl+Shift+P and Ctrl+G are never registered).
 *   - ActivityBar and Sidebar are rendered at reduced opacity with a
 *     not-allowed cursor overlay — visible but non-interactive.
 *   - DocumentView disables FindBar and shows only a locked line window.
 *   - StudyApp omits TabBar from the render.
 *   - All navigation keyboard shortcuts (Ctrl+F, Ctrl+\, Ctrl+Shift+F) are
 *     silently no-oped.
 *
 * Adding a new condition: add a field here, publish it in StudyApp, and
 * consume it with useContext(AppModeContext) in whichever component needs it.
 */
const AppModeContext = React.createContext({ isThumbview: false });

// ---------------------------------------------------------------------------
// MARK: Tree utility functions
// ---------------------------------------------------------------------------

/**
 * toTreeNodes — recursively converts a root.json node into Blueprint TreeNodeInfo.
 * Directories expand at depth 0 only; files are selectable leaf nodes.
 */
function toTreeNodes(node, depth = 0) {
    if (node.type === "TreeDir") {
        return {
            id: node.id,
            label: node.name,
            icon: "folder-close",
            isExpanded: depth === 0,
            childNodes: (node.children ?? []).map(c => toTreeNodes(c, depth + 1)),
            nodeData: node,
        };
    }
    return {
        id: node.id,
        label: node.name,
        icon: "document",
        isSelected: false,
        nodeData: node,
    };
}

/**
 * updateNodeAtPath — immutably replaces the node at nodePath using updater.
 * nodePath is an array of child indices from root to the target node.
 */
function updateNodeAtPath(nodes, nodePath, updater) {
    const [i, ...rest] = nodePath;
    return nodes.map((node, j) => {
        if (j !== i) return node;
        if (rest.length === 0) return updater(node);
        return { ...node, childNodes: updateNodeAtPath(node.childNodes ?? [], rest, updater) };
    });
}

/**
 * deselectAll — recursively sets isSelected: false on every node.
 * Called before applying a new selection so only one item is highlighted.
 */
function deselectAll(nodes) {
    return nodes.map(node => ({
        ...node,
        isSelected: false,
        childNodes: node.childNodes ? deselectAll(node.childNodes) : undefined,
    }));
}

/**
 * findNodePath — searches the Blueprint TreeNodeInfo tree for a node whose id
 * matches targetId and returns its path (array of child indices), or null.
 */
function findNodePath(nodes, targetId, path = []) {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.id === targetId) return [...path, i];
        if (node.childNodes) {
            const found = findNodePath(node.childNodes, targetId, [...path, i]);
            if (found) return found;
        }
    }
    return null;
}

/**
 * collectFiles — flattens the raw root.json tree into an array containing
 * only TreeFile nodes. Used to build the search index.
 */
function collectFiles(node, acc = []) {
    if (node.type === "TreeFile") acc.push(node);
    (node.children ?? []).forEach(child => collectFiles(child, acc));
    return acc;
}

/**
 * getLanguage — maps a file extension to a highlight.js language id.
 * To add a language: append an entry to the map and ensure the language is
 * included in the hljs build (the CDN import at the top includes all languages).
 * Language ids are lowercase; see https://github.com/highlightjs/highlight.js/tree/main/src/languages
 */
function getLanguage(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const map = {
        py: "python", js: "javascript", ts: "typescript",
        json: "json", md: "markdown", sh: "bash",
        yaml: "yaml", yml: "yaml", toml: "ini", txt: "plaintext",
    };
    return map[ext] ?? "plaintext";
}

// ---------------------------------------------------------------------------
// MARK: Syntax highlighting utilities
// ---------------------------------------------------------------------------

/**
 * splitHighlightedLines — highlights a complete file and splits the result
 * into per-line HTML strings, preserving multi-line token context.
 *
 * The naive approach (highlight each line independently) breaks multi-line
 * tokens such as Python triple-quoted strings and C-style block comments:
 * hljs has no context for previous lines, so interior lines are rendered
 * as plain code rather than as part of the enclosing token.
 *
 * This function highlights the full file as a single string, then splits
 * the resulting HTML at every newline. Because hljs may leave <span> tags
 * open across a newline boundary, we track the open-span stack and:
 *   - close all open spans at the end of each line fragment, and
 *   - reopen them at the start of the next line fragment.
 * Each returned string is therefore a self-contained valid HTML fragment
 * that can be safely set as innerHTML.
 *
 * @param {string[]} lines    - Array of source-code lines (no trailing newline
 *                              on each element; joined with "\n" for hljs).
 * @param {string}   language - highlight.js language id (e.g. "python").
 * @returns {string[]} Per-line HTML strings, one per input line.
 */
function splitHighlightedLines(lines, language) {
    if (!lines.length) return [];

    const fullHtml = hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value;

    const result   = [];
    const openTags = [];  // stack of '<span class="...">' strings currently open

    // Split on the literal newline characters that came from lines.join("\n").
    // Each rawLine is the hljs HTML fragment for one source line.
    const rawLines = fullHtml.split("\n");

    for (const rawLine of rawLines) {
        // Start the output fragment by reopening any spans that were left open
        // by the previous line (these carry multi-line token colour state).
        let lineHtml = openTags.join("") + rawLine;

        // Walk the raw fragment and update the span stack.
        // <span ...> pushes, </span> pops. Other tags (none expected from hljs)
        // are ignored for stack purposes but kept verbatim in the output.
        const tagRe = /<\/?span[^>]*>/g;
        let m;
        while ((m = tagRe.exec(rawLine)) !== null) {
            if (m[0].startsWith("</")) {
                openTags.pop();
            } else {
                openTags.push(m[0]);
            }
        }

        // Close every open span at line end so the fragment is valid HTML.
        lineHtml += "</span>".repeat(openTags.length);

        result.push(lineHtml);
    }

    return result;
}

// ---------------------------------------------------------------------------
// MARK: Search utilities
// ---------------------------------------------------------------------------

/**
 * escapeHtml — minimal HTML escaper for plain-text insertion into innerHTML.
 * Only handles the three characters that break HTML contexts: &, <, >.
 */
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * getLineMatches — finds all {start, end} match positions in a plain-text
 * line for the given query string, respecting matchCase / wholeWord / useRegex.
 * Returns [] when the query is empty or the regex pattern is invalid.
 */
function getLineMatches(lineText, query, { matchCase = false, wholeWord = false, useRegex = false } = {}) {
    if (!query) return [];
    try {
        let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (wholeWord) pattern = `\\b${pattern}\\b`;
        const re = new RegExp(pattern, matchCase ? "g" : "gi");
        const matches = [];
        let m;
        while ((m = re.exec(lineText)) !== null) {
            matches.push({ start: m.index, end: m.index + m[0].length });
            if (m[0].length === 0) re.lastIndex++;
        }
        return matches;
    } catch {
        return [];
    }
}

/**
 * injectHighlights — inserts <mark> elements into an hljs-generated HTML string
 * at match positions that are expressed as plain-text character offsets.
 *
 * The challenge: hljs wraps tokens in <span class="hljs-…"> tags, so a plain
 * character index into the source does NOT map to the same index into the HTML
 * string. We must walk both in parallel.
 *
 * Algorithm (two-pointer walk):
 *   textPos — counts only visible characters (non-tag, non-entity chars).
 *   htmlPos — our cursor into the raw HTML string.
 *
 *   At each step we check if any insertion is queued at the current textPos and
 *   flush it into the result. Then we consume one unit from the HTML:
 *     - '<'  → copy the whole tag to result (advances htmlPos past '>'),
 *              does NOT advance textPos (tags are invisible).
 *     - '&'  → copy the whole HTML entity (advances htmlPos past ';'),
 *              advances textPos by 1 (an entity is one visible character).
 *     - else → copy the single character; advance both pointers.
 *
 * Insertions are built before the walk: for each match range we push an opening
 * <mark> at textPos=start and a closing </mark> at textPos=end. activeRange gets
 * a brighter orange highlight; all other matches get a dimmer yellow.
 */
function injectHighlights(hljsHtml, matchRanges, activeRange) {
    if (!matchRanges || !matchRanges.length) return hljsHtml;

    const insertions = {};
    for (const { start, end } of matchRanges) {
        const isCurrent = activeRange && start === activeRange.start && end === activeRange.end;
        const bg      = isCurrent ? "rgba(255,140,0,0.75)" : "rgba(255,215,0,0.4)";
        const outline = isCurrent ? ";outline:1px solid rgba(255,140,0,0.9)" : "";
        const open    = `<mark style="background:${bg};color:inherit;border-radius:2px${outline}">`;
        if (!insertions[start]) insertions[start] = [];
        if (!insertions[end])   insertions[end]   = [];
        insertions[start].push(open);
        insertions[end].push("</mark>");
    }

    let result  = "";
    let textPos = 0;
    let htmlPos = 0;

    while (htmlPos < hljsHtml.length) {
        // Flush any insertions queued at the current visible-text position.
        if (insertions[textPos]) { result += insertions[textPos].join(""); delete insertions[textPos]; }

        const ch = hljsHtml[htmlPos];
        if (ch === "<") {
            // HTML tag — copy verbatim, don't advance textPos.
            const end = hljsHtml.indexOf(">", htmlPos);
            if (end === -1) { result += hljsHtml.slice(htmlPos); break; }
            result += hljsHtml.slice(htmlPos, end + 1);
            htmlPos = end + 1;
        } else if (ch === "&") {
            // HTML entity (e.g. &amp;, &lt;) — counts as one visible character.
            const end = hljsHtml.indexOf(";", htmlPos);
            if (end === -1) { result += ch; htmlPos++; textPos++; }
            else            { result += hljsHtml.slice(htmlPos, end + 1); htmlPos = end + 1; textPos++; }
        } else {
            // Ordinary character.
            result += ch; htmlPos++; textPos++;
        }
    }
    // Flush any trailing insertions at the very end of the string.
    if (insertions[textPos]) result += insertions[textPos].join("");
    return result;
}

/**
 * injectPlainHighlights — like injectHighlights but for plain text (no hljs).
 * Escapes the text then wraps match spans in <mark>. Used in SearchPanel.
 */
function injectPlainHighlights(plainText, matchRanges) {
    if (!matchRanges || !matchRanges.length) return escapeHtml(plainText);
    let result = "";
    let pos    = 0;
    for (const { start, end } of matchRanges) {
        result += escapeHtml(plainText.slice(pos, start));
        result += `<mark style="background:rgba(255,215,0,0.5);color:inherit;border-radius:2px">${escapeHtml(plainText.slice(start, end))}</mark>`;
        pos = end;
    }
    result += escapeHtml(plainText.slice(pos));
    return result;
}

// ---------------------------------------------------------------------------
// MARK: SearchBar
// ---------------------------------------------------------------------------

/**
 * SearchBar — command-palette style search centred in the navbar with two modes.
 *
 * FILE MODE (default): type any string to fuzzy-match filenames. Up to 10
 * results appear in a dropdown; arrow keys and Enter navigate and open them.
 *
 * LINE MODE: activated by Ctrl+G (or by typing ":" manually). The input shows
 * a colon prefix and the dropdown shows a hint with the valid line range.
 * Entering a valid number and pressing Enter calls onGoToLine and closes.
 *
 * Keyboard shortcuts (global):
 *   Ctrl+Shift+P  — focus and enter file mode
 *   Ctrl+G        — focus and enter line mode (only when a file is open)
 *
 * Props:
 *   allFiles    {object[]}      - flat TreeFile node array for file search
 *   onSelect    {function}      - called with a TreeFile node (file mode)
 *   totalLines  {number|null}   - line count of the open file, or null
 *   onGoToLine  {function}      - called with a line number (line mode)
 */
function SearchBar({ allFiles, onSelect, totalLines, onGoToLine }) {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [hoverIndex, setHoverIndex] = useState(0);
    const inputRef = useRef(null);

    // True when the input starts with ":" — switches to go-to-line mode.
    const lineMode = query.startsWith(":");

    const results = useMemo(() => {
        if (!query || lineMode) return [];
        const q = query.toLowerCase();
        return allFiles.filter(f => f.name.toLowerCase().includes(q)).slice(0, 10);
    }, [query, allFiles, lineMode]);

    useEffect(() => { setHoverIndex(0); }, [results]);

    // Global keyboard shortcuts. Re-registers whenever totalLines changes so
    // the Ctrl+G guard always sees the latest value.
    useEffect(() => {
        function onGlobalKeyDown(e) {
            if (e.ctrlKey && e.shiftKey && e.key === "P") {
                e.preventDefault();
                setQuery("");
                setIsOpen(true);
                inputRef.current?.focus();
            }
            if (e.ctrlKey && !e.shiftKey && e.key === "g" && totalLines) {
                e.preventDefault();
                setQuery(":");
                setIsOpen(true);
                inputRef.current?.focus();
            }
        }
        window.addEventListener("keydown", onGlobalKeyDown);
        return () => window.removeEventListener("keydown", onGlobalKeyDown);
    }, [totalLines]);

    function handleFileSelect(node) {
        onSelect(node);
        setQuery("");
        setIsOpen(false);
        inputRef.current?.blur();
    }

    function handleKeyDown(e) {
        if (e.key === "Escape") {
            setQuery("");
            setIsOpen(false);
            e.target.blur();
            return;
        }
        if (lineMode) {
            if (e.key === "Enter") {
                const num = parseInt(query.slice(1), 10);
                if (!isNaN(num) && num >= 1 && num <= totalLines) {
                    onGoToLine(num);
                    setQuery("");
                    setIsOpen(false);
                    e.target.blur();
                }
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHoverIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHoverIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            if (results[hoverIndex]) handleFileSelect(results[hoverIndex]);
        }
    }

    function handleBlur() {
        // Delay so onMouseDown on a dropdown item fires before the dropdown closes.
        // Without this, the dropdown disappears before the click event registers.
        setTimeout(() => setIsOpen(false), 150);
    }

    const showDropdown = isOpen && (lineMode || results.length > 0);

    return html`
        <div style=${{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
        }}>
            <div style=${{ position: "relative" }}>

                <${InputGroup}
                    inputRef=${inputRef}
                    leftIcon=${lineMode ? "chevron-right" : "search"}
                    placeholder="Search files...  (Ctrl+Shift+P)"
                    value=${query}
                    onInput=${e => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus=${() => setIsOpen(true)}
                    onBlur=${handleBlur}
                    onKeyDown=${handleKeyDown}
                    style=${{ width: "100%" }} />

                ${showDropdown && html`
                    <div style=${{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 200,
                        background: "#ffffff",
                        border: "1px solid #c5cbd3",
                        borderRadius: 4,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                        overflow: "hidden",
                    }}>

                        ${lineMode ? html`
                            <div style=${{
                                padding: "8px 12px",
                                fontSize: 12,
                                color: "#d9822b",
                            }}>
                                Type a line number (from 1 to ${totalLines}).
                            </div>
                        ` : results.map((file, i) => html`
                            <div
                                key=${file.id}
                                onMouseDown=${() => handleFileSelect(file)}
                                onMouseEnter=${() => setHoverIndex(i)}
                                style=${{
                                    padding: "8px 12px",
                                    cursor: "pointer",
                                    background: i === hoverIndex ? "#2d72d2" : "transparent",
                                    color: i === hoverIndex ? "#ffffff" : "inherit",
                                }}>
                                <div style=${{ fontWeight: 500, fontSize: 13 }}>${file.name}</div>
                                <div style=${{
                                    fontSize: 11,
                                    opacity: 0.7,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    ${file.path}
                                </div>
                            </div>
                        `)}

                    </div>
                `}

            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: FindBar
// ---------------------------------------------------------------------------

/**
 * FindBar — floating in-file find widget displayed at the top-right of
 * DocumentView when Ctrl+F is pressed, mirroring VS Code's find panel.
 *
 * Appearance: a pill-shaped floating bar with a search input, a "N of M" count
 * label, prev/next navigation arrows, three toggle buttons, and a close button.
 * It is absolutely positioned over DocumentView (position:absolute) so it does
 * not affect layout.
 *
 * To add a replace input: insert a second InputGroup below the first and wire
 * it to a new `replaceValue`/`onReplaceChange` prop. DocumentView would need a
 * replaceAll() helper that calls setLines() with substituted text.
 *
 * Props:
 *   query         {string}   - current search string
 *   onQueryChange {function} - called with new string on each keystroke
 *   matchCase     {bool}     - Aa toggle state
 *   wholeWord     {bool}     - ab| toggle state
 *   useRegex      {bool}     - .* toggle state
 *   onToggle      {function} - called with "matchCase"|"wholeWord"|"useRegex"
 *   matchCount    {number}   - total number of matches in the file
 *   currentIdx    {number}   - 0-based index of the currently focused match
 *   onPrev        {function} - move to previous match
 *   onNext        {function} - move to next match
 *   onClose       {function} - hide the bar and clear the query
 *   inputRef      {ref}      - forwarded to the underlying <input> for auto-focus
 */
function FindBar({ query, onQueryChange, matchCase, wholeWord, useRegex, onToggle,
                   matchCount, currentIdx, onPrev, onNext, onClose, inputRef }) {
    const countLabel = matchCount === 0 ? "No results" : `${currentIdx + 1} of ${matchCount}`;
    const optStyle   = { fontSize: 12, fontFamily: "monospace", minWidth: 24, padding: "0 4px" };

    return html`
        <div style=${{
            position: "absolute",
            top: 8,
            right: 16,
            zIndex: 100,
            background: "#f6f7f9",
            border: "1px solid #c5cbd3",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            padding: "4px 6px",
            gap: 4,
        }}>
            <${InputGroup}
                inputRef=${inputRef}
                small
                leftIcon="search"
                placeholder="Find..."
                value=${query}
                onChange=${e => onQueryChange(e.target.value)}
                onKeyDown=${e => {
                    if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? onPrev() : onNext(); }
                    if (e.key === "Escape") onClose();
                }}
                style=${{ width: 200 }} />

            <span style=${{ fontSize: 11, color: "#5c7080", minWidth: 60, textAlign: "center" }}>
                ${query ? countLabel : ""}
            </span>

            <${Button} small minimal icon="chevron-up"
                title="Previous Match (Shift+Enter)"
                onClick=${onPrev}
                disabled=${matchCount === 0} />
            <${Button} small minimal icon="chevron-down"
                title="Next Match (Enter)"
                onClick=${onNext}
                disabled=${matchCount === 0} />

            <${NavbarDivider} style=${{ margin: "0 2px" }} />

            <${Button} small minimal active=${matchCase}
                title="Match Case"
                onClick=${() => onToggle("matchCase")}
                style=${optStyle}>Aa<//>
            <${Button} small minimal active=${wholeWord}
                title="Match Whole Word"
                onClick=${() => onToggle("wholeWord")}
                style=${optStyle}>ab|<//>
            <${Button} small minimal active=${useRegex}
                title="Use Regular Expression"
                onClick=${() => onToggle("useRegex")}
                style=${optStyle}>.*<//>

            <${NavbarDivider} style=${{ margin: "0 2px" }} />
            <${Button} small minimal icon="cross" title="Close (Escape)" onClick=${onClose} />
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: TopNav
// ---------------------------------------------------------------------------

/**
 * TopNav — thin horizontal bar pinned to the top of the layout.
 *
 * Appearance: a Blueprint Navbar (~50 px tall). Left side has menu-style text
 * buttons; right side has icon buttons. The SearchBar is absolutely centred
 * over the full navbar width so it floats in the middle regardless of how
 * wide the left and right groups are.
 *
 * To add a menu button to the left group: append a <Button minimal text="…" />
 * inside the first NavbarGroup. To wire it up to a popover menu, wrap the
 * button in a Blueprint Popover2 with a Menu component as the content.
 *
 * To add an icon button to the right group: append a <Button minimal icon="…" />
 * inside the NavbarGroup with align=${Alignment.RIGHT}.
 *
 * Props:
 *   allFiles       {object[]}     - passed to SearchBar for the file index
 *   onSearchSelect {function}     - called when the user picks a search result
 *   totalLines     {number|null}  - line count of the open file, for go-to-line
 *   onGoToLine     {function}     - called with a line number from go-to-line
 */
function TopNav({ allFiles, onSearchSelect, totalLines, onGoToLine }) {
    const { isThumbview } = useContext(AppModeContext);

    // In Thumbview a greyed-out, non-interactive placeholder is shown instead
    // of the real SearchBar. The real SearchBar is never mounted, so its
    // Ctrl+Shift+P / Ctrl+G keyboard handlers are never registered.
    return html`
        <${Navbar} style=${{ position: "relative" }}>
            <${NavbarGroup} align=${Alignment.LEFT}>
                <${NavbarHeading}>CodeIDE<//>
                <${NavbarDivider} />
                <${Button} minimal text="File" disabled />
                <${Button} minimal text="Edit" disabled />
                <${Button} minimal text="Selection" disabled />
                <${Button} minimal text="View" disabled />
                <${Button} minimal text="Go" disabled />
                <${Button} minimal text="Run" disabled />
                <${Button} minimal text="Terminal" disabled />
                <${Button} minimal text="Help" disabled />
            <//>
            <${NavbarGroup} align=${Alignment.RIGHT}>
                <${Button} minimal icon="help" disabled />
                <${Button} minimal icon="cog" disabled />
            <//>
            ${isThumbview ? html`
                <div style=${{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 400,
                    cursor: "not-allowed",
                }}>
                    <div style=${{ pointerEvents: "none", opacity: 0.4 }}>
                        <${InputGroup}
                            leftIcon="search"
                            placeholder="Search files...  (Ctrl+Shift+P)"
                            disabled
                            style=${{ width: "100%" }} />
                    </div>
                </div>
            ` : html`
                <${SearchBar}
                    allFiles=${allFiles}
                    onSelect=${onSearchSelect}
                    totalLines=${totalLines}
                    onGoToLine=${onGoToLine} />
            `}
        <//>
    `;
}

// ---------------------------------------------------------------------------
// MARK: ActivityBar
// ---------------------------------------------------------------------------

/**
 * ActivityBar — narrow icon strip on the far left of the body area, VS Code style.
 *
 * Appearance: 48 px wide, dark background (#333333). Icon buttons are stacked
 * vertically. The active item has a 2 px white accent bar on the left edge and
 * a brighter icon colour. Bottom section holds utility icons (settings).
 *
 * Driven entirely by the ACTIVITY_ITEMS constant — add or remove entries there
 * to change what panels are available. Disabled items are shown at 35% opacity
 * with pointer-events disabled so they are visible but not interactive.
 *
 * Props:
 *   activeItem  {string}   - id of the currently active activity
 *   onItemClick {function} - called with the item id when an icon is clicked
 */
function ActivityBar({ activeItem, onItemClick }) {
    return html`
        <div style=${{
            width: 48,
            background: "#333333",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            flexShrink: 0,
            zIndex: 1,
        }}>
            <div style=${{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 4 }}>
                ${ACTIVITY_ITEMS.map(item => {
                    const isActive = activeItem === item.id;
                    return html`
                        <div key=${item.id} style=${{
                            position: "relative",
                            opacity: item.disabled ? 0.35 : 1,
                            cursor: item.disabled ? "not-allowed" : "auto",
                        }}>
                            ${isActive && !item.disabled && html`
                                <div style=${{
                                    position: "absolute",
                                    left: 0, top: 0, bottom: 0,
                                    width: 2,
                                    background: "#ffffff",
                                }} />
                            `}
                            <${Button}
                                minimal large
                                icon=${item.icon}
                                disabled=${item.disabled}
                                style=${{
                                    color: isActive ? "#ffffff" : "#858585",
                                    width: "100%",
                                    borderRadius: 0,
                                    pointerEvents: item.disabled ? "none" : "auto",
                                    cursor: item.disabled ? "not-allowed" : "auto",
                                }}
                                onClick=${() => !item.disabled && onItemClick(item.id)} />
                        </div>
                    `;
                })}
            </div>
            <div style=${{ paddingBottom: 4, display: "flex", flexDirection: "column" }}>
                <${Button} minimal large icon="user" disabled
                    style=${{ color: "#858585", width: "100%", borderRadius: 0 }} />
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: SidebarHeader
// ---------------------------------------------------------------------------

/**
 * SidebarHeader — small uppercase label used at the top of each sidebar panel,
 * styled after VS Code's section headers.
 *
 * Appearance: all-caps, 11 px, semi-bold, muted colour (#5c7080), with
 * horizontal padding that aligns with the tree node labels below it.
 * Text uppercasing is applied via CSS (textTransform) so the prop value can
 * be passed in any case.
 *
 * Props:
 *   title {string} - the label text (uppercased by CSS)
 */
function SidebarHeader({ title }) {
    return html`
        <div style=${{
            padding: "12px 12px 4px 12px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#5c7080",
            userSelect: "none",
        }}>
            ${title}
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: ExplorerPanel
// ---------------------------------------------------------------------------

/**
 * ExplorerPanel — the file tree panel shown when the Explorer activity is active.
 *
 * Shows a spinner while rawTree is loading, then a Blueprint Tree of the
 * directory structure. Handles expand/collapse and selection, and responds to
 * revealNodeId to programmatically expand and highlight a node.
 *
 * revealNodeId pattern: StudyApp sets revealNodeId to a file's id whenever a
 * search result is clicked. ExplorerPanel watches for changes in a useEffect,
 * finds the node's path with findNodePath, expands all ancestors via
 * updateNodeAtPath, selects the node, then calls onRevealComplete so StudyApp
 * can reset revealNodeId to null (allowing the same node to be revealed again).
 *
 * Tree state is an array of Blueprint TreeNodeInfo objects (immutable updates
 * only — never mutate in place; React needs a new reference to re-render).
 * The raw root.json node is stored in each tree node's nodeData field so
 * click handlers can pass it straight to onSelect.
 *
 * Props:
 *   rawTree          {object|null} - raw root.json tree, or null while loading
 *   revealNodeId     {string|null} - node id to expand and select, or null
 *   onRevealComplete {function}    - called after the reveal so parent can reset it
 *   onSelect         {function}    - called with a raw TreeFile node on click
 */
function ExplorerPanel({ rawTree, revealNodeId, onRevealComplete, onSelect }) {
    const [nodes, setNodes] = useState([]);

    useEffect(() => {
        if (!rawTree) return;
        setNodes([toTreeNodes(rawTree, 0)]);
    }, [rawTree]);

    useEffect(() => {
        if (!revealNodeId || nodes.length === 0) return;
        const path = findNodePath(nodes, revealNodeId);
        if (!path) return;

        setNodes(prev => {
            let updated = deselectAll(prev);
            for (let len = 1; len < path.length; len++) {
                updated = updateNodeAtPath(updated, path.slice(0, len), n => ({
                    ...n, icon: "folder-open", isExpanded: true,
                }));
            }
            updated = updateNodeAtPath(updated, path, n => ({ ...n, isSelected: true }));
            return updated;
        });

        onRevealComplete?.();
    }, [revealNodeId]);

    function handleNodeClick(node, nodePath) {
        if (node.nodeData.type === "TreeFile") {
            setNodes(prev => {
                const cleared = deselectAll(prev);
                return updateNodeAtPath(cleared, nodePath, n => ({ ...n, isSelected: true }));
            });
            onSelect(node.nodeData);
        }
    }

    function handleNodeExpand(node, nodePath) {
        setNodes(prev =>
            updateNodeAtPath(prev, nodePath, n => ({ ...n, icon: "folder-open", isExpanded: true }))
        );
    }

    function handleNodeCollapse(node, nodePath) {
        setNodes(prev =>
            updateNodeAtPath(prev, nodePath, n => ({ ...n, icon: "folder-close", isExpanded: false }))
        );
    }

    if (!rawTree) {
        return html`<${Spinner} size=${20} style=${{ margin: "24px auto", display: "block" }} />`;
    }

    return html`
        <${Tree}
            contents=${nodes}
            onNodeClick=${handleNodeClick}
            onNodeExpand=${handleNodeExpand}
            onNodeCollapse=${handleNodeCollapse} />
    `;
}

// ---------------------------------------------------------------------------
// MARK: SearchPanel
// ---------------------------------------------------------------------------

/**
 * SearchPanel — project-wide search panel shown when the Search activity is active.
 *
 * Mirrors VS Code's Ctrl+Shift+F sidebar: a query input with match-case,
 * whole-word, and regex toggles; results grouped by file with a sticky header
 * showing the filename and match count; each result row shows the 1-based line
 * number and a trimmed snippet with highlighted matches.
 *
 * Search is triggered on every keystroke — there is no debounce. For very large
 * datasets this could be slow; add a debounce useEffect on `query` if needed
 * (replace the direct useMemo dependency with a debounced state value).
 *
 * Minimum query length is 1 character. To increase it (e.g. to avoid searching
 * on single-character keystrokes), add `if (query.length < N) return [];` at
 * the top of the searchResults useMemo.
 *
 * Leading whitespace is stripped from result snippets for readability. Match
 * ranges are adjusted by the same leading-whitespace offset so highlights
 * still land on the right characters in the trimmed text.
 *
 * Only files that include a `lines` array in root.json are searched. Files
 * without lines (metadata-only nodes) are silently excluded via filesWithLines.
 *
 * Props:
 *   allFiles        {object[]}  - flat TreeFile nodes array (must have .lines to appear)
 *   onSelectResult  {function}  - called with (fileNode, 1-based lineNum) on click
 */
function SearchPanel({ allFiles = [], onSelectResult }) {
    const [query,     setQuery]     = useState("");
    const [matchCase, setMatchCase] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [useRegex,  setUseRegex]  = useState(false);
    const [collapsed, setCollapsed] = useState(new Set());
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const filesWithLines = useMemo(
        () => allFiles.filter(f => Array.isArray(f.lines)),
        [allFiles]
    );

    const searchResults = useMemo(() => {
        if (!query) return [];
        const opts = { matchCase, wholeWord, useRegex };
        const out  = [];
        for (const file of filesWithLines) {
            const fileMatches = [];
            for (let i = 0; i < file.lines.length; i++) {
                const ranges = getLineMatches(file.lines[i], query, opts);
                if (ranges.length) fileMatches.push({ lineIdx: i, lineText: file.lines[i], ranges });
            }
            if (fileMatches.length) out.push({ file, matches: fileMatches });
        }
        return out;
    }, [query, matchCase, wholeWord, useRegex, filesWithLines]);

    const totalMatchCount = searchResults.reduce((n, r) => n + r.matches.length, 0);

    function toggleCollapsed(fileId) {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(fileId) ? next.delete(fileId) : next.add(fileId);
            return next;
        });
    }

    const optStyle = { fontSize: 12, fontFamily: "monospace", minWidth: 22, padding: "0 4px" };

    return html`
        <div style=${{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

            <div style=${{ padding: "8px 8px 6px" }}>
                <div style=${{ display: "flex", gap: 3, alignItems: "center" }}>
                    <${InputGroup}
                        inputRef=${inputRef}
                        small
                        leftIcon="search"
                        placeholder="Search"
                        value=${query}
                        onChange=${e => setQuery(e.target.value)}
                        style=${{ flex: 1 }} />
                    <${Button} small minimal active=${matchCase}
                        title="Match Case"
                        onClick=${() => setMatchCase(v => !v)}
                        style=${optStyle}>Aa<//>
                    <${Button} small minimal active=${wholeWord}
                        title="Match Whole Word"
                        onClick=${() => setWholeWord(v => !v)}
                        style=${optStyle}>ab|<//>
                    <${Button} small minimal active=${useRegex}
                        title="Use Regular Expression"
                        onClick=${() => setUseRegex(v => !v)}
                        style=${optStyle}>.*<//>
                </div>
            </div>

            ${query && html`
                <div style=${{ padding: "2px 10px 5px", fontSize: 11, color: "#5c7080" }}>
                    ${searchResults.length === 0
                        ? "No results"
                        : `${totalMatchCount} result${totalMatchCount !== 1 ? "s" : ""} in ${searchResults.length} file${searchResults.length !== 1 ? "s" : ""}`}
                </div>
            `}

            <div style=${{ flex: 1, overflowY: "auto" }}>

                ${!filesWithLines.length && html`
                    <p className="bp5-text-muted" style=${{ padding: "16px 12px", fontSize: 12 }}>
                        This dataset does not include source lines.
                    </p>
                `}

                ${searchResults.map(({ file, matches }) => {
                    const isCollapsed = collapsed.has(file.id);
                    return html`
                        <div key=${file.id}>

                            <div
                                onClick=${() => toggleCollapsed(file.id)}
                                style=${{
                                    display: "flex", alignItems: "center", gap: 4,
                                    padding: "3px 6px",
                                    cursor: "pointer",
                                    background: "#ececec",
                                    userSelect: "none",
                                    position: "sticky", top: 0, zIndex: 1,
                                    borderBottom: "1px solid #d8dde2",
                                }}>
                                <${Button} minimal small
                                    icon=${isCollapsed ? "chevron-right" : "chevron-down"}
                                    style=${{ minWidth: 0, minHeight: 0, padding: 2 }} />
                                <span style=${{ fontWeight: 600, fontSize: 12, flex: 1,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    ${file.name}
                                </span>
                                <span style=${{ fontSize: 11, color: "#5c7080" }}>
                                    ${matches.length}
                                </span>
                            </div>

                            ${!isCollapsed && matches.map(({ lineIdx, lineText, ranges }) => {
                                const leading      = lineText.length - lineText.trimStart().length;
                                const trimmed      = lineText.trimStart();
                                const adjRanges    = ranges.map(r => ({
                                    start: Math.max(0, r.start - leading),
                                    end:   Math.max(0, r.end   - leading),
                                }));
                                return html`
                                    <div
                                        key=${lineIdx}
                                        onClick=${() => onSelectResult && onSelectResult(file, lineIdx + 1)}
                                        onMouseEnter=${e => e.currentTarget.style.background = "#dde5f0"}
                                        onMouseLeave=${e => e.currentTarget.style.background = "transparent"}
                                        style=${{
                                            display: "flex", alignItems: "baseline", gap: 6,
                                            padding: "2px 8px 2px 28px",
                                            cursor: "pointer",
                                            fontFamily: codeFont,
                                            fontSize: 12,
                                            lineHeight: 1.6,
                                            userSelect: "none",
                                        }}>
                                        <span style=${{
                                            color: "#8a9ba8", minWidth: 28, textAlign: "right",
                                            flexShrink: 0, fontSize: 11,
                                        }}>
                                            ${lineIdx + 1}
                                        </span>
                                        <span
                                            style=${{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                            dangerouslySetInnerHTML=${{ __html: injectPlainHighlights(trimmed, adjRanges) }} />
                                    </div>
                                `;
                            })}

                        </div>
                    `;
                })}

            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: Sidebar
// ---------------------------------------------------------------------------

/**
 * Sidebar — the panel area to the right of the ActivityBar.
 *
 * Appearance: 240 px wide, light grey background (#f6f7f9), 1 px right border.
 * Renders a SidebarHeader and content determined by activeActivity:
 *   Explorer activity  — SidebarHeader + ExplorerPanel (file tree)
 *   Search activity    — SidebarHeader + SearchPanel (project-wide search)
 *   Any other activity — nothing (panel body is blank)
 *
 * To add a new panel: add an else-if branch for the new activity id from
 * ACTIVITY_ITEMS, rendering a SidebarHeader and the new panel component.
 *
 * Props:
 *   activeActivity       {string}      - id of the active ActivityBar item
 *   rawTree              {object|null} - passed through to ExplorerPanel
 *   revealNodeId         {string|null} - passed through to ExplorerPanel
 *   onRevealComplete     {function}    - passed through to ExplorerPanel
 *   onSelect             {function}    - passed through to ExplorerPanel (file open)
 *   allFiles             {object[]}    - flat file list passed to SearchPanel
 *   onSelectSearchResult {function}    - called with (node, lineNum) from SearchPanel
 */
function Sidebar({ activeActivity, rawTree, revealNodeId, onRevealComplete, onSelect,
                   allFiles, onSelectSearchResult }) {
    const explorerActive = activeActivity === "Explorer (Ctrl+Shift+E)";
    const searchActive   = activeActivity === "Search (Ctrl+Shift+F)";

    return html`
        <div style=${{
            width: 240,
            borderRight: "1px solid #e1e8ed",
            overflowY: "auto",
            flexShrink: 0,
            background: "#f6f7f9",
            display: "flex",
            flexDirection: "column",
        }}>
            ${explorerActive && html`
                <${SidebarHeader} title="Explorer" />
                <${ExplorerPanel}
                    rawTree=${rawTree}
                    revealNodeId=${revealNodeId}
                    onRevealComplete=${onRevealComplete}
                    onSelect=${onSelect} />
            `}
            ${searchActive && html`
                <${SidebarHeader} title="Search" />
                <${SearchPanel}
                    allFiles=${allFiles}
                    onSelectResult=${onSelectSearchResult} />
            `}
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: DocumentView
// ---------------------------------------------------------------------------

/**
 * DocumentView — main reading/viewing area for a single editor pane.
 *
 * Appearance: fills its pane's remaining space with a white background and
 * 24 px padding, vertically scrollable. Three rendering states:
 *
 *   Empty  — NonIdealState prompt when no file is selected.
 *   Source — numbered, syntax-highlighted code when the node has a "lines"
 *            array. Font, size, and line-height come from study-config.js.
 *   Meta   — condensed key/value table for nodes without source lines.
 *
 * In-file search (Ctrl+F):
 *   A floating FindBar appears at the top-right of this component's container
 *   div (which must have position:relative). Syntax-highlighted HTML is
 *   re-generated via linesWithHighlights (useMemo) each time the query or
 *   match index changes, using injectHighlights to splice <mark> tags into
 *   the hljs output without disturbing its span structure.
 *
 * go-to-line:
 *   Parent passes a 1-based line number via goToLine. A useEffect scrolls
 *   the target line into view and triggers a CSS keyframe flash animation
 *   (line-flash, defined in injectLineFlashCSS). onGoToLineDone is called
 *   after 1.2 s so the parent can reset goToLine to null, making it possible
 *   to jump to the same line twice in a row.
 *
 * Split-pane guard (isActive):
 *   When two DocumentView instances are mounted (split view), both would
 *   respond to the global Ctrl+F keydown event. The isActive prop (false on
 *   the unfocused pane) prevents the blurred pane from opening its FindBar.
 *
 * Props:
 *   selectedNode    {object|null}  - raw root.json TreeFile node, or null
 *   goToLine        {number|null}  - 1-based line number to jump to, or null
 *   onGoToLineDone  {function}     - called after the jump so the parent can
 *                                    reset goToLine (allowing the same line
 *                                    number to trigger a jump again)
 *   isActive        {bool}         - true when this pane has UI focus; gates
 *                                    Ctrl+F so only the focused pane responds
 *   lockedLine      {number|null}  - condition 2 only: 1-based line to centre
 *                                    the locked view on; null in condition 1
 */
function DocumentView({ selectedNode, goToLine, onGoToLineDone, isActive = true, lockedLine = null }) {
    const { isThumbview } = useContext(AppModeContext);

    // --- go-to-line ---
    const [flashLine, setFlashLine] = useState(null);

    // --- in-file find ---
    const [findVisible,    setFindVisible]    = useState(false);
    const [findQuery,      setFindQuery]      = useState("");
    const [findMatchCase,  setFindMatchCase]  = useState(false);
    const [findWholeWord,  setFindWholeWord]  = useState(false);
    const [findUseRegex,   setFindUseRegex]   = useState(false);
    const [findCurrentIdx, setFindCurrentIdx] = useState(0);
    const findInputRef = useRef(null);

    // Thumbview locked view: slice to a window of (2 * thumbviewContextLines + 1)
    // lines around lockedLine, positioned so the clicked line sits at
    // thumbviewViewportOffset within the view (0=top, 0.5=centre, 1=bottom).
    // null = show all lines (Standard behaviour).
    // Line ids (code-line-N) still use the original 1-based file line numbers so
    // go-to-line flash targets the correct element.
    // Scrolling is disabled separately via overflowY (isThumbview ? "hidden" : "auto")
    // on the scroll container — visibleRange only controls which lines are rendered.
    //
    // The context is capped to the number of lines that fit in the viewport.
    // Each line occupies codeFontSize * codeLineHeight px; ~50px is reserved for
    // the navbar, so available height ≈ window.innerHeight - 50.
    const visibleRange = useMemo(() => {
        if (!isThumbview || lockedLine == null || !selectedNode?.lines) return null;
        const center = lockedLine - 1; // 0-based
        // Cap thumbviewContextLines so the total window never exceeds the screen.
        // Chrome breakdown: navbar ~50 px + scroll-container top padding 24 px +
        // filename h2 ~28 px + filepath <p> ~34 px = ~136 px above the first code line.
        // This matches the space the header occupies in both Standard and Thumbview,
        // so when thumbviewContextLines is set to a large sentinel the Thumbview shows
        // the same number of code lines as the Standard condition.
        const lineHeightPx   = codeFontSize * codeLineHeight;
        const availableLines = Math.floor((window.innerHeight - 136) / lineHeightPx);
        // totalContext is lines above + lines below (excluding the target line itself).
        // availableLines - 1 reserves one slot for the target line.
        const totalContext = Math.min(2 * thumbviewContextLines, Math.max(0, availableLines - 1));
        // Split according to the viewport offset.
        // offset=0.5 → equal lines above and below (default centre behaviour).
        const linesAbove = Math.round(thumbviewViewportOffset * totalContext);
        const linesBelow = totalContext - linesAbove;
        const start = Math.max(0, center - linesAbove);
        const end   = Math.min(selectedNode.lines.length - 1, center + linesBelow);
        return { start, end };
    }, [isThumbview, lockedLine, selectedNode]);

    // Syntax-highlighted HTML for each line in the current file.
    // splitHighlightedLines highlights the entire file at once so that
    // multi-line tokens (Python docstrings, block comments, etc.) are coloured
    // correctly across line boundaries.
    const highlightedLines = useMemo(() => {
        if (!selectedNode || !Array.isArray(selectedNode.lines)) return [];
        const lang = getLanguage(selectedNode.name);
        return splitHighlightedLines(selectedNode.lines, lang);
    }, [selectedNode]);

    // Flat list of every find match across all lines: { lineIdx, start, end }.
    const allMatches = useMemo(() => {
        if (!findVisible || !findQuery || !selectedNode?.lines) return [];
        const opts = { matchCase: findMatchCase, wholeWord: findWholeWord, useRegex: findUseRegex };
        const acc  = [];
        for (let i = 0; i < selectedNode.lines.length; i++) {
            for (const r of getLineMatches(selectedNode.lines[i], findQuery, opts)) {
                acc.push({ lineIdx: i, ...r });
            }
        }
        return acc;
    }, [findVisible, findQuery, findMatchCase, findWholeWord, findUseRegex, selectedNode]);

    // Reset the focused-match index whenever the match list changes.
    useEffect(() => { setFindCurrentIdx(0); }, [allMatches]);

    // Scroll the focused match into view whenever the index or match list changes.
    useEffect(() => {
        if (!allMatches.length) return;
        const m = allMatches[Math.min(findCurrentIdx, allMatches.length - 1)];
        document.getElementById(`code-line-${m.lineIdx + 1}`)?.scrollIntoView({ block: "center" });
    }, [findCurrentIdx, allMatches]);

    // hljs output with search-highlight <mark> elements injected.
    // byLine groups allMatches by line index for O(1) lookup inside the map.
    // activeRange is passed to injectHighlights only for the currently focused
    // match's line so it receives the distinct orange highlight style.
    const linesWithHighlights = useMemo(() => {
        if (!findVisible || !findQuery || !allMatches.length) return highlightedLines;
        const byLine  = {};
        for (const m of allMatches) (byLine[m.lineIdx] = byLine[m.lineIdx] || []).push(m);
        const current = allMatches[findCurrentIdx] ?? null;
        return highlightedLines.map((lineHtml, i) => {
            const lineMatches = byLine[i];
            if (!lineMatches) return lineHtml;
            const activeRange = current?.lineIdx === i ? current : null;
            return injectHighlights(lineHtml, lineMatches, activeRange);
        });
    }, [highlightedLines, findVisible, findQuery, allMatches, findCurrentIdx]);

    // Global Ctrl+F: show the find bar. Only the focused pane responds
    // (isActive guard) so both panes don't open simultaneously.
    // Disabled entirely in condition 2.
    useEffect(() => {
        function onKeyDown(e) {
            if (e.ctrlKey && !e.shiftKey && e.key === "f") {
                if (!selectedNode || !isActive || isThumbview) return;
                e.preventDefault();
                setFindVisible(true);
                requestAnimationFrame(() => { findInputRef.current?.focus(); findInputRef.current?.select(); });
            }
            if (e.key === "Escape" && findVisible) setFindVisible(false);
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedNode, findVisible, isActive]);

    // go-to-line: flash the target line. Skip scrollIntoView in condition 2 —
    // the line is already visible in the rendered window, and overflow:hidden
    // on the container would prevent the scroll from taking effect anyway.
    useEffect(() => {
        if (!goToLine) return;
        const el = document.getElementById(`code-line-${goToLine}`);
        if (!el) return;
        if (!isThumbview) el.scrollIntoView({ block: "center" });
        setFlashLine(goToLine);
        const timer = setTimeout(() => { setFlashLine(null); onGoToLineDone?.(); }, 1200);
        return () => clearTimeout(timer);
    }, [goToLine]);

    function findNext() { setFindCurrentIdx(i => allMatches.length ? (i + 1) % allMatches.length : 0); }
    function findPrev() { setFindCurrentIdx(i => allMatches.length ? (i - 1 + allMatches.length) % allMatches.length : 0); }
    function findToggle(opt) {
        if (opt === "matchCase")  setFindMatchCase(v => !v);
        if (opt === "wholeWord")  setFindWholeWord(v => !v);
        if (opt === "useRegex")   setFindUseRegex(v => !v);
    }

    if (!selectedNode) {
        return html`
            <div style=${{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <${NonIdealState}
                    icon="document"
                    title="No file selected"
                    description=${isThumbview
                        ? "Use the spatial overview to navigate to a file location."
                        : "Select a file from the sidebar or use Ctrl+Shift+P to search."} />
            </div>
        `;
    }

    const hasSource    = highlightedLines.length > 0;
    const safeMatchIdx = Math.min(findCurrentIdx, Math.max(allMatches.length - 1, 0));

    return html`
        <div style=${{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

            ${findVisible && !isThumbview && html`
                <${FindBar}
                    query=${findQuery}
                    onQueryChange=${setFindQuery}
                    matchCase=${findMatchCase}
                    wholeWord=${findWholeWord}
                    useRegex=${findUseRegex}
                    onToggle=${findToggle}
                    matchCount=${allMatches.length}
                    currentIdx=${safeMatchIdx}
                    onPrev=${findPrev}
                    onNext=${findNext}
                    onClose=${() => { setFindVisible(false); setFindQuery(""); }}
                    inputRef=${findInputRef} />
            `}

            <div style=${{ flex: 1, overflowY: isThumbview ? "hidden" : "auto", padding: 24 }}>

                <h2 className="bp5-heading" style=${{ marginBottom: 4 }}>${selectedNode.name}</h2>
                <p className="bp5-text-muted" style=${{ marginBottom: 16, fontSize: 12 }}>
                    ${selectedNode.path}
                </p>

                ${hasSource ? html`
                    <pre style=${{
                        margin: 0, padding: 0,
                        fontFamily: codeFont,
                        fontSize: codeFontSize,
                        lineHeight: codeLineHeight,
                        overflowX: "auto",
                        background: "transparent",
                    }}>
                        <code style=${{ display: "block" }}>
                            ${(visibleRange
                                ? linesWithHighlights.slice(visibleRange.start, visibleRange.end + 1)
                                : linesWithHighlights
                            ).map((lineHtml, sliceIdx) => {
                                const i = visibleRange ? visibleRange.start + sliceIdx : sliceIdx;
                                return html`
                                    <div
                                        key=${i}
                                        id=${`code-line-${i + 1}`}
                                        style=${{
                                            display: "flex",
                                            minHeight: `${codeFontSize * codeLineHeight}px`,
                                            animation: flashLine === i + 1 ? "line-flash 1.2s ease-out forwards" : "none",
                                        }}>
                                        <span style=${{
                                            color: "#aab1bf",
                                            minWidth: 48,
                                            textAlign: "right",
                                            paddingRight: 20,
                                            userSelect: "none",
                                            flexShrink: 0,
                                        }}>
                                            ${i + 1}
                                        </span>
                                        <span dangerouslySetInnerHTML=${{ __html: lineHtml || " " }}></span>
                                    </div>
                                `;
                            })}
                        </code>
                    </pre>
                ` : html`
                    <table className="bp5-html-table bp5-html-table-condensed" style=${{ width: "100%" }}>
                        <tbody>
                            ${Object.entries({
                                "Total lines":  selectedNode.totalLines,
                                "Longest line": selectedNode.longestLine,
                                "Width":  selectedNode.width  != null ? selectedNode.width.toFixed(1) + " px" : undefined,
                                "Height": selectedNode.height != null ? selectedNode.height + " px" : undefined,
                            })
                            .filter(([, v]) => v != null)
                            .map(([k, v]) => html`
                                <tr key=${k}>
                                    <td className="bp5-text-muted">${k}</td>
                                    <td>${v}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                `}

            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: TabBar
// ---------------------------------------------------------------------------

/**
 * TabBar — horizontal row of open-file tabs above a single editor pane.
 *
 * Appearance: VS Code-style light tab bar. Active tab has a 2 px top accent
 * border (blue when focused, grey when blurred) and white background. Inactive
 * tabs darken on hover. Tabs overflow horizontally with scrollbar hidden.
 *
 * Drag-and-drop (HTML5 Drag and Drop API):
 *   handleDragStart — stores { side, index } in dataTransfer as
 *     "application/json" so drops on the other pane's TabBar know the source.
 *
 *   handleDragOver — computes dragOverIdx (an insertion slot, 0 = before the
 *     first tab, tabs.length = after the last). It queries all [data-tab-idx]
 *     elements and finds the first tab whose midpoint is right of the cursor;
 *     the slot is the index of that tab (or tabs.length if none found).
 *
 *   Insertion indicator — drawn with CSS box-shadow (no extra DOM elements):
 *     showLeft  (dragOverIdx === i)            → "-3px 0 0 0 #0078d4" on tab i
 *     showRight (i === last && slot === last+1) → "3px 0 0 0 #0078d4" on last tab
 *     This draws a 3 px blue bar on the left or right edge of an existing tab,
 *     indicating where the dragged tab will be inserted.
 *
 *   handleDrop — calls onTabDrop(srcSide, srcIdx, dstSide, dstIdx). StudyApp's
 *     handleTabDrop applies the reorder or cross-pane move. For same-pane
 *     reorders the index must be adjusted: after splicing out the source tab
 *     the remaining indices shift, so insertAt = dstIdx > srcIdx ? dstIdx-1 : dstIdx.
 *
 * Props:
 *   tabs       {object[]}  - TreeFile nodes for the open files
 *   activeIdx  {number}    - 0-based index of the visible tab (-1 = none)
 *   isFocused  {bool}      - true when this pane has keyboard/UI focus
 *   side       {string}    - "left" or "right" — identifies this pane in drag data
 *   onTabClick {function}  - (index) => void
 *   onTabClose {function}  - (index) => void
 *   onTabDrop  {function}  - (srcSide, srcIdx, dstSide, dstIdx) => void
 */
function TabBar({ tabs, activeIdx, isFocused, side, onTabClick, onTabClose, onTabDrop }) {
    const [dragOverIdx, setDragOverIdx] = useState(-1);

    if (!tabs.length) return null;

    function handleDragStart(e, tabIdx) {
        e.dataTransfer.setData("application/json", JSON.stringify({ side, index: tabIdx }));
        e.dataTransfer.effectAllowed = "move";
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Find insertion slot: first tab whose midpoint is right of the cursor.
        const els = e.currentTarget.querySelectorAll("[data-tab-idx]");
        let target = els.length;
        for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) {
                target = parseInt(el.dataset.tabIdx, 10);
                break;
            }
        }
        setDragOverIdx(target);
    }

    function handleDragLeave(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOverIdx(-1);
    }

    function handleDrop(e) {
        e.preventDefault();
        const target = dragOverIdx;
        setDragOverIdx(-1);
        try {
            const src = JSON.parse(e.dataTransfer.getData("application/json"));
            onTabDrop?.(src.side, src.index, side, target);
        } catch (_) {}
    }

    return html`
        <div
            onDragOver=${handleDragOver}
            onDragLeave=${handleDragLeave}
            onDrop=${handleDrop}
            style=${{
                display: "flex",
                background: "#f3f3f3",
                borderBottom: "1px solid #e1e8ed",
                overflowX: "auto",
                flexShrink: 0,
                scrollbarWidth: "none",
            }}>
            ${tabs.map((node, i) => {
                const isActive  = i === activeIdx;
                // Left shadow = insert before tab i; right shadow on last tab = append.
                const showLeft  = dragOverIdx === i;
                const showRight = i === tabs.length - 1 && dragOverIdx === tabs.length;
                const indicator = showLeft  ? "-3px 0 0 0 #0078d4"
                                : showRight ? "3px 0 0 0 #0078d4"
                                : "none";
                return html`
                    <div key=${node.id}
                        data-tab-idx=${i}
                        draggable=${true}
                        onDragStart=${e => handleDragStart(e, i)}
                        onDragEnd=${()  => setDragOverIdx(-1)}
                        onClick=${() => onTabClick(i)}
                        onMouseEnter=${e => { if (!isActive) e.currentTarget.style.background = "#eaeaea"; }}
                        onMouseLeave=${e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        style=${{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "0 10px",
                            height: 35,
                            cursor: "grab",
                            flexShrink: 0,
                            maxWidth: 180,
                            background: isActive ? "#ffffff" : "transparent",
                            borderTop: isActive
                                ? `2px solid ${isFocused ? "#0078d4" : "#c5cbd3"}`
                                : "2px solid transparent",
                            color: isActive ? "#1a1a1a" : "#717171",
                            fontSize: 13,
                            userSelect: "none",
                            boxShadow: indicator,
                        }}>
                        <span style=${{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            ${node.name}
                        </span>
                        <span
                            onClick=${e => { e.stopPropagation(); onTabClose(i); }}
                            onMouseEnter=${e => e.currentTarget.style.background = "rgba(0,0,0,0.12)"}
                            onMouseLeave=${e => e.currentTarget.style.background = "transparent"}
                            style=${{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 18, height: 18, borderRadius: 3,
                                fontSize: 14, lineHeight: 1, flexShrink: 0,
                                color: "#717171",
                            }}>
                            ×
                        </span>
                    </div>
                `;
            })}
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: StudyApp
// ---------------------------------------------------------------------------

/**
 * StudyApp — root component that fetches data and owns all shared state.
 *
 * Editor area: one or two panes side-by-side, each with an independent TabBar
 * and DocumentView. The "focused" pane (focusSide) receives all new file opens
 * from the sidebar, search results, or command palette.
 *
 * Ctrl+backslash (splitMoveTab): moves the active tab from the focused pane
 * into the other pane, creating the right pane if it doesn't exist. If the
 * right pane's last tab is moved back left, isSplit is set to false and the
 * right pane unmounts.
 *
 * Stale closure note: splitMoveTab closes over pane state. It is re-registered
 * in a useEffect whose dependency array includes all pane state values so the
 * handler always sees fresh values. Same pattern applies wherever a keydown
 * handler needs current state.
 *
 * revealNodeId pattern: set to a file node's id whenever a search result or
 * SearchBar result is opened. ExplorerPanel watches this via useEffect,
 * expands ancestors, selects the node, then calls onRevealComplete, which
 * resets revealNodeId to null. The reset allows the same file to be revealed
 * again on a second click.
 *
 * Pane state (left and right, symmetrical):
 *   tabs      {object[]}    - open TreeFile nodes in tab order
 *   active    {number}      - index of the visible tab (-1 when empty)
 *   goToLine  {number|null} - pending 1-based line jump for the pane's DocumentView
 *
 * Shared state:
 *   rawTree        {object|null}    - fetched root.json tree
 *   activeActivity {string}         - active ActivityBar item id
 *   revealNodeId   {string|null}    - node id for ExplorerPanel to expand+select
 *   isSplit        {bool}           - whether the right pane is visible
 *   focusSide      {"left"|"right"} - which pane receives new file opens
 *
 * Thumbview additions:
 *   isThumbview   {bool}           - derived from condition_name + debugMode
 *   lockedLine     {number|null}    - target line set by window.studyNavigateTo;
 *                                    passed to DocumentView to engage the locked view
 *
 * window.studyNavigateTo(nodeId, lineNum):
 *   Called by the p5 spatial overview to open a file at a specific line.
 *   Implemented via a ref so it always has fresh closures without needing to
 *   re-register the handler on every render. In debug mode, the UI switch is
 *   skipped so you can call it from the console while the React UI is visible.
 */
function StudyApp() {
    // Derived once from the server-set global and the debugMode config flag.
    // condition_name is a const set by task.html before the module scripts run.
    const isThumbview = !debugMode && condition_name === "Thumbview";

    const [rawTree,       setRawTree]       = useState(null);
    const [activeActivity, setActiveActivity] = useState("Explorer (Ctrl+Shift+E)");
    const [revealNodeId,  setRevealNodeId]  = useState(null);

    // --- Left pane ---
    const [leftTabs,      setLeftTabs]      = useState([]);
    const [leftActive,    setLeftActive]    = useState(-1);
    const [leftGoToLine,  setLeftGoToLine]  = useState(null);

    // --- Right pane ---
    const [rightTabs,     setRightTabs]     = useState([]);
    const [rightActive,   setRightActive]   = useState(-1);
    const [rightGoToLine, setRightGoToLine] = useState(null);

    // --- Split / focus ---
    const [isSplit,       setIsSplit]       = useState(false);
    const [focusSide,     setFocusSide]     = useState("left");

    // Thumbview: line that DocumentView's locked view centres on.
    const [lockedLine, setLockedLine] = useState(null);

    useEffect(() => {
        fetch(TREE_URL).then(r => r.json()).then(setRawTree);
    }, []);

    const allFiles = useMemo(() => rawTree ? collectFiles(rawTree) : [], [rawTree]);

    const leftNode  = leftTabs[leftActive]   ?? null;
    const rightNode = rightTabs[rightActive] ?? null;
    const activeNode = focusSide === "left" ? leftNode : rightNode;

    const totalLines = useMemo(() =>
        activeNode?.lines ? activeNode.lines.length : null,
    [activeNode]);

    // --- Pane helpers ---

    // Open a file in the focused pane.
    //
    // Thumbview: replaces the current tab rather than appending, so only one
    // file is ever open at a time. The sidebar and tree are hidden in Thumbview
    // so this is only reached via window.studyNavigateTo (canvas click).
    //
    // Standard: switches to the tab if already open, otherwise appends a new tab.
    function openFile(node) {
        if (isThumbview) {
            setLeftTabs([node]);
            setLeftActive(0);
            return;
        }
        if (focusSide === "left") {
            const idx = leftTabs.findIndex(t => t.id === node.id);
            if (idx !== -1) { setLeftActive(idx); return; }
            const newIdx = leftTabs.length;
            setLeftTabs(prev => [...prev, node]);
            setLeftActive(newIdx);
        } else {
            const idx = rightTabs.findIndex(t => t.id === node.id);
            if (idx !== -1) { setRightActive(idx); return; }
            const newIdx = rightTabs.length;
            setRightTabs(prev => [...prev, node]);
            setRightActive(newIdx);
        }
    }

    // Close a tab from one of the panes. Collapses the right pane when it
    // empties; switches focus to right when the left pane empties in split mode.
    function closeTab(side, tabIdx) {
        if (side === "left") {
            const next = leftTabs.filter((_, i) => i !== tabIdx);
            setLeftTabs(next);
            if (next.length === 0) {
                setLeftActive(-1);
                if (isSplit) setFocusSide("right");
            } else if (leftActive === tabIdx) {
                setLeftActive(Math.min(tabIdx, next.length - 1));
            } else if (leftActive > tabIdx) {
                setLeftActive(leftActive - 1);
            }
        } else {
            const next = rightTabs.filter((_, i) => i !== tabIdx);
            setRightTabs(next);
            if (next.length === 0) {
                setRightActive(-1);
                setIsSplit(false);
                setFocusSide("left");
            } else if (rightActive === tabIdx) {
                setRightActive(Math.min(tabIdx, next.length - 1));
            } else if (rightActive > tabIdx) {
                setRightActive(rightActive - 1);
            }
        }
    }

    // Ctrl+backslash: move the active tab from the focused pane into the other
    // pane, creating a split if needed. Collapses the split when the right pane
    // would otherwise become empty after a right-to-left move.
    function splitMoveTab() {
        if (focusSide === "left") {
            if (!leftTabs.length || leftActive < 0) return;
            const node = leftTabs[leftActive];

            // Add to right pane
            const rIdx = rightTabs.findIndex(t => t.id === node.id);
            if (rIdx !== -1) { setRightActive(rIdx); }
            else { setRightTabs(prev => [...prev, node]); setRightActive(rightTabs.length); }

            // Remove from left pane
            const nextLeft = leftTabs.filter((_, i) => i !== leftActive);
            setLeftTabs(nextLeft);
            setLeftActive(nextLeft.length === 0 ? -1 : Math.min(leftActive, nextLeft.length - 1));

            setIsSplit(true);
            setFocusSide("right");
        } else {
            if (!rightTabs.length || rightActive < 0) return;
            const node = rightTabs[rightActive];

            // Add to left pane
            const lIdx = leftTabs.findIndex(t => t.id === node.id);
            if (lIdx !== -1) { setLeftActive(lIdx); }
            else { setLeftTabs(prev => [...prev, node]); setLeftActive(leftTabs.length); }

            // Remove from right pane
            const nextRight = rightTabs.filter((_, i) => i !== rightActive);
            setRightTabs(nextRight);
            if (nextRight.length === 0) {
                setRightActive(-1);
                setIsSplit(false);
            } else {
                setRightActive(Math.min(rightActive, nextRight.length - 1));
            }

            setFocusSide("left");
        }
    }

    function handleGoToLine(lineNum) {
        if (focusSide === "left") setLeftGoToLine(lineNum);
        else setRightGoToLine(lineNum);
    }

    // window.studyNavigateTo — called by the p5 spatial overview (condition 2)
    // or from the browser console (debug mode) to open a file at a specific line.
    //
    // Uses a ref so the handler is registered once (empty dep array) but always
    // closes over the latest openFile / handleGoToLine / allFiles values.
    const navigateRef = useRef({});
    navigateRef.current = { allFiles, openFile, handleGoToLine, setLockedLine };

    useEffect(() => {
        window.studyNavigateTo = (nodeId, lineNum) => {
            const { allFiles, openFile, handleGoToLine, setLockedLine } = navigateRef.current;
            const node = allFiles.find(f => f.id === nodeId);
            if (!node) return;
            openFile(node);
            setLockedLine(lineNum ?? null);
            if (lineNum != null) handleGoToLine(lineNum);
            // Switch canvas → React UI. Skipped in debug mode so both stay visible.
            if (!debugMode) {
                const reactEl = document.getElementById("react-container");
                const canvasEl = document.getElementById("study-container");
                if (reactEl) reactEl.style.display = "block";
                if (canvasEl) canvasEl.style.display = "none";
            }
        };
        return () => { delete window.studyNavigateTo; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Ctrl+Shift+F — switch to Search panel (condition 1 / debug only).
    useEffect(() => {
        function onKeyDown(e) {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
                if (isThumbview) return;
                e.preventDefault();
                setActiveActivity("Search (Ctrl+Shift+F)");
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // Ctrl+backslash — move active tab to other pane. All pane state values are
    // listed in the dep array so the handler is re-registered with fresh closure
    // values on every state change (avoids the stale-closure bug where the handler
    // would operate on the tab list from when it was first registered).
    useEffect(() => {
        function onKeyDown(e) {
            if (e.ctrlKey && !e.shiftKey && e.key === "\\") {
                if (isThumbview) return;
                e.preventDefault();
                splitMoveTab();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [leftTabs, leftActive, rightTabs, rightActive, isSplit, focusSide]);

    // Drop handler shared by both tab bars. Handles same-pane reorder and
    // cross-pane moves. dstIdx is the insertion slot (0 = before first tab,
    // tabs.length = after the last tab) as computed by TabBar's handleDragOver.
    function handleTabDrop(srcSide, srcIdx, dstSide, dstIdx) {
        if (srcSide === dstSide) {
            // Same-pane reorder — no-op when dropped on itself or adjacent slot.
            if (dstIdx === srcIdx || dstIdx === srcIdx + 1) return;
            const [tabs, setTabs, active, setActive] = srcSide === "left"
                ? [leftTabs,  setLeftTabs,  leftActive,  setLeftActive]
                : [rightTabs, setRightTabs, rightActive, setRightActive];
            const next = [...tabs];
            const [moved] = next.splice(srcIdx, 1);
            // After splicing out srcIdx, all indices above it shift down by 1.
            // Compensate by subtracting 1 from dstIdx when the destination was
            // to the right of the source (dstIdx > srcIdx).
            const insertAt = dstIdx > srcIdx ? dstIdx - 1 : dstIdx;
            next.splice(insertAt, 0, moved);
            setTabs(next);
            setActive(insertAt);
        } else if (srcSide === "left") {
            // Left → Right
            const node     = leftTabs[srcIdx];
            const newLeft  = leftTabs.filter((_, i) => i !== srcIdx);
            const newRight = [...rightTabs];
            newRight.splice(dstIdx, 0, node);
            setLeftTabs(newLeft);
            setLeftActive(newLeft.length === 0 ? -1 : Math.min(leftActive, newLeft.length - 1));
            setRightTabs(newRight);
            setRightActive(dstIdx);
            setIsSplit(true);
            setFocusSide("right");
        } else {
            // Right → Left
            const node     = rightTabs[srcIdx];
            const newRight = rightTabs.filter((_, i) => i !== srcIdx);
            const newLeft  = [...leftTabs];
            newLeft.splice(dstIdx, 0, node);
            setRightTabs(newRight);
            if (newRight.length === 0) { setRightActive(-1); setIsSplit(false); }
            else setRightActive(Math.min(rightActive, newRight.length - 1));
            setLeftTabs(newLeft);
            setLeftActive(dstIdx);
            setFocusSide("left");
        }
    }

    function handleSearchSelect(node) {
        openFile(node);
        setRevealNodeId(node.id);
    }

    function handleSelectSearchResult(node, lineNum) {
        openFile(node);
        setRevealNodeId(node.id);
        handleGoToLine(lineNum);
    }

    return html`
        <${AppModeContext.Provider} value=${{ isThumbview }}>
            <div style=${{ display: "flex", flexDirection: "column", height: "100%" }}>
                <${TopNav}
                    allFiles=${allFiles}
                    onSearchSelect=${handleSearchSelect}
                    totalLines=${totalLines}
                    onGoToLine=${handleGoToLine} />
                <div style=${{ display: "flex", flex: 1, overflow: "hidden" }}>

                    <!-- ActivityBar and Sidebar are always rendered. In Thumbview
                         they are shown at reduced opacity with a transparent
                         not-allowed overlay so they appear disabled but remain
                         visible — navigation happens via the p5 canvas instead. -->
                    <div style=${{ position: "relative", display: "flex", flexShrink: 0 }}>
                        <div style=${{
                            display: "flex",
                            opacity: isThumbview ? 0.4 : 1,
                            pointerEvents: isThumbview ? "none" : "auto",
                        }}>
                            <${ActivityBar} activeItem=${activeActivity} onItemClick=${setActiveActivity} />
                            <${Sidebar}
                                activeActivity=${activeActivity}
                                rawTree=${rawTree}
                                revealNodeId=${revealNodeId}
                                onRevealComplete=${() => setRevealNodeId(null)}
                                onSelect=${openFile}
                                allFiles=${allFiles}
                                onSelectSearchResult=${handleSelectSearchResult} />
                        </div>
                        ${isThumbview && html`
                            <div style=${{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: "not-allowed" }} />
                        `}
                    </div>

                    <!-- Editor area: one or two panes (split disabled in condition 2) -->
                    <div style=${{ flex: 1, display: "flex", overflow: "hidden" }}>

                        <!-- Left pane -->
                        <div
                            onClick=${() => setFocusSide("left")}
                            style=${{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                            ${!isThumbview && html`
                                <${TabBar}
                                    tabs=${leftTabs}
                                    activeIdx=${leftActive}
                                    isFocused=${focusSide === "left"}
                                    side="left"
                                    onTabClick=${i => { setLeftActive(i); setFocusSide("left"); }}
                                    onTabClose=${i => closeTab("left", i)}
                                    onTabDrop=${handleTabDrop} />
                            `}
                            <${DocumentView}
                                selectedNode=${leftNode}
                                goToLine=${leftGoToLine}
                                onGoToLineDone=${() => setLeftGoToLine(null)}
                                isActive=${focusSide === "left"}
                                lockedLine=${isThumbview ? lockedLine : null} />
                        </div>

                        ${!isThumbview && isSplit && html`
                            <div style=${{ width: 1, background: "#c5cbd3", flexShrink: 0 }} />

                            <!-- Right pane -->
                            <div
                                onClick=${() => setFocusSide("right")}
                                style=${{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                                <${TabBar}
                                    tabs=${rightTabs}
                                    activeIdx=${rightActive}
                                    isFocused=${focusSide === "right"}
                                    side="right"
                                    onTabClick=${i => { setRightActive(i); setFocusSide("right"); }}
                                    onTabClose=${i => closeTab("right", i)}
                                    onTabDrop=${handleTabDrop} />
                                <${DocumentView}
                                    selectedNode=${rightNode}
                                    goToLine=${rightGoToLine}
                                    onGoToLineDone=${() => setRightGoToLine(null)}
                                    isActive=${focusSide === "right"} />
                            </div>
                        `}

                    </div>
                </div>
            </div>
        <//>
    `;
}

// ---------------------------------------------------------------------------
// MARK: Canvas toggle
// ---------------------------------------------------------------------------

/**
 * setupCanvasToggle — attaches a right-click listener that swaps visibility
 * between the React UI and the p5 canvas (#react-container / #study-container).
 * Only active during a trial (window.studyTrialActive guard).
 *
 * getComputedStyle is used instead of element.style.display because the initial
 * display:none on #react-container comes from the stylesheet in task.html, not
 * an inline style. Before trialManager first sets element.style.display, reading
 * element.style.display returns "" (empty string) rather than "none", which would
 * incorrectly conclude the element is visible.
 */
(function setupCanvasToggle() {
    const reactEl  = document.getElementById("react-container");
    const canvasEl = document.getElementById("study-container");

    document.addEventListener("contextmenu", e => {
        if (!window.studyTrialActive) return;
        e.preventDefault();
        // In Standard condition, all navigation happens in the React IDE; the
        // canvas should remain hidden. Suppress the context menu but do not swap.
        if (!debugMode && condition_name !== "Thumbview") return;
        const reactVisible = getComputedStyle(reactEl).display !== "none";
        reactEl.style.display  = reactVisible ? "none"  : "block";
        canvasEl.style.display = reactVisible ? "block" : "none";
    });
}());

// ---------------------------------------------------------------------------
// MARK: Mount
// ---------------------------------------------------------------------------

const root = createRoot(document.getElementById("react-container"));
root.render(html`<${StudyApp} />`);
