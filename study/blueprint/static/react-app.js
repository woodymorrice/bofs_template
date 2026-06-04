/**
 * react-app.js
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
 *   |      |            |                           |
 *   | Act. |  Sidebar   |  DocumentView             |
 *   | Bar  |  (tree)    |  (source / metadata)      |
 *   |      |            |                           |
 *   +------+------------+---------------------------+
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "https://esm.sh/react@18";
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
    highlightTheme,
    codeFont,
    codeFontSize,
    codeLineHeight,
} from "./study-config.js";

const html = htm.bind(React.createElement);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TREE_URL = "/blueprint/boltz/root.json";

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
 * Props:
 *   allFiles       {object[]}     - passed to SearchBar for the file index
 *   onSearchSelect {function}     - called when the user picks a search result
 *   totalLines     {number|null}  - line count of the open file, for go-to-line
 *   onGoToLine     {function}     - called with a line number from go-to-line
 */
function TopNav({ allFiles, onSearchSelect, totalLines, onGoToLine }) {
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
                <${Button} minimal icon="help" />
                <${Button} minimal icon="cog" />
            <//>
            <${SearchBar}
                allFiles=${allFiles}
                onSelect=${onSearchSelect}
                totalLines=${totalLines}
                onGoToLine=${onGoToLine} />
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
                <${Button} minimal large icon="cog"
                    style=${{ color: "#858585", width: "100%", borderRadius: 0 }} />
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: Sidebar
// ---------------------------------------------------------------------------

/**
 * SidebarHeader — small uppercase label used at the top of each sidebar panel,
 * styled after VS Code's section headers.
 *
 * Appearance: all-caps, 11 px, semi-bold, muted colour, with horizontal
 * padding that aligns with the tree node labels below it.
 *
 * Props:
 *   title {string} - the label text (rendered as-is, uppercasing via CSS)
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

/**
 * ExplorerPanel — the file tree panel shown when the Explorer activity is active.
 *
 * Shows a spinner while rawTree is loading, then a Blueprint Tree of the
 * directory structure. Handles expand/collapse and selection, and responds to
 * revealNodeId to programmatically expand and highlight a node (used by search).
 *
 * Props:
 *   rawTree          {object|null} - raw root.json tree, or null while loading
 *   revealNodeId     {string|null} - node id to expand and select, or null
 *   onRevealComplete {function}   - called after the reveal so parent can clear it
 *   onSelect         {function}   - called with a raw TreeFile node on click
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

/**
 * SearchPanel — placeholder panel shown when the Search activity is active.
 * To be implemented.
 */
function SearchPanel() {
    return html`
        <p className="bp5-text-muted" style=${{ padding: "16px 12px", fontSize: 12 }}>
            Search is not yet implemented.
        </p>
    `;
}

/**
 * Sidebar — the panel area to the right of the ActivityBar.
 *
 * Appearance: 240 px wide, light grey background, 1 px right border.
 * Renders a panel header and content determined by activeActivity:
 *   Explorer activity  — SidebarHeader "EXPLORER" + ExplorerPanel (file tree)
 *   Search activity    — SidebarHeader "SEARCH"   + SearchPanel (placeholder)
 *   Any other activity — nothing (panel is blank)
 *
 * Props:
 *   activeActivity   {string}      - id of the active ActivityBar item
 *   rawTree          {object|null} - passed through to ExplorerPanel
 *   revealNodeId     {string|null} - passed through to ExplorerPanel
 *   onRevealComplete {function}    - passed through to ExplorerPanel
 *   onSelect         {function}    - passed through to ExplorerPanel
 */
function Sidebar({ activeActivity, rawTree, revealNodeId, onRevealComplete, onSelect }) {
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
                <${SearchPanel} />
            `}
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: DocumentView
// ---------------------------------------------------------------------------

/**
 * DocumentView — main reading/viewing area to the right of the sidebar.
 *
 * Appearance: fills remaining horizontal space, white background, 24 px
 * padding, vertically scrollable. Three states:
 *
 *   Empty  — NonIdealState prompt when no file is selected.
 *   Source — numbered, syntax-highlighted code when the node has a "lines"
 *            array. Font/size/line-height come from study-config.js.
 *   Meta   — condensed key/value table for nodes without source lines.
 *
 * Props:
 *   selectedNode    {object|null}  - raw root.json TreeFile node, or null
 *   goToLine        {number|null}  - 1-based line number to jump to, or null
 *   onGoToLineDone  {function}     - called after the jump so the parent can
 *                                    reset goToLine (allowing the same line to
 *                                    be jumped to again)
 */
function DocumentView({ selectedNode, goToLine, onGoToLineDone }) {
    const [flashLine, setFlashLine] = useState(null);

    const highlightedLines = useMemo(() => {
        if (!selectedNode || !Array.isArray(selectedNode.lines)) return [];
        const lang = getLanguage(selectedNode.name);
        return selectedNode.lines.map(line =>
            hljs.highlight(line, { language: lang, ignoreIllegals: true }).value
        );
    }, [selectedNode]);

    // When goToLine changes to a valid number, scroll that line into the centre
    // of the viewport and trigger the flash animation on it.
    useEffect(() => {
        if (!goToLine) return;
        const el = document.getElementById(`code-line-${goToLine}`);
        if (!el) return;

        el.scrollIntoView({ block: "center" });
        setFlashLine(goToLine);

        const timer = setTimeout(() => {
            setFlashLine(null);
            onGoToLineDone?.();
        }, 1200);
        return () => clearTimeout(timer);
    }, [goToLine]);

    if (!selectedNode) {
        return html`
            <div style=${{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <${NonIdealState}
                    icon="document"
                    title="No file selected"
                    description="Select a file from the sidebar or use Ctrl+Shift+P to search." />
            </div>
        `;
    }

    const hasSource = highlightedLines.length > 0;

    return html`
        <div style=${{ flex: 1, overflowY: "auto", padding: 24 }}>

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
                        ${highlightedLines.map((lineHtml, i) => html`
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
                        `)}
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
    `;
}

// ---------------------------------------------------------------------------
// MARK: StudyApp
// ---------------------------------------------------------------------------

/**
 * StudyApp — root component that fetches data and owns all shared state.
 *
 * Data flow:
 *   rawTree is fetched here and passed to Sidebar (for tree rendering) and
 *   used to derive allFiles (for search). When the user picks a search result,
 *   selectedNode is set (DocumentView updates) and revealNodeId is set
 *   (Sidebar expands/selects that node). Sidebar calls onRevealComplete when
 *   done, which resets revealNodeId to null so the same file can be revealed
 *   again if searched a second time.
 *
 * State:
 *   rawTree        {object|null}  - raw fetched root.json tree
 *   selectedNode   {object|null}  - currently open TreeFile node
 *   activeActivity {string}       - active ActivityBar item id
 *   revealNodeId   {string|null}  - id of node Sidebar should expand+select
 *   goToLine       {number|null}  - 1-based line number DocumentView should jump to
 */
function StudyApp() {
    const [rawTree, setRawTree] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [activeActivity, setActiveActivity] = useState("Explorer (Ctrl+Shift+E)");
    const [revealNodeId, setRevealNodeId] = useState(null);
    const [goToLine, setGoToLine] = useState(null);

    useEffect(() => {
        fetch(TREE_URL).then(r => r.json()).then(setRawTree);
    }, []);

    const allFiles = useMemo(() => rawTree ? collectFiles(rawTree) : [], [rawTree]);

    // Only non-null when a file with rendered source lines is open, so that
    // SearchBar only enables Ctrl+G when there is actually a line to jump to.
    const totalLines = useMemo(() =>
        selectedNode && Array.isArray(selectedNode.lines)
            ? selectedNode.lines.length
            : null,
    [selectedNode]);

    function handleSearchSelect(node) {
        setSelectedNode(node);
        setRevealNodeId(node.id);
    }

    return html`
        <div style=${{ display: "flex", flexDirection: "column", height: "100%" }}>
            <${TopNav}
                allFiles=${allFiles}
                onSearchSelect=${handleSearchSelect}
                totalLines=${totalLines}
                onGoToLine=${setGoToLine} />
            <div style=${{ display: "flex", flex: 1, overflow: "hidden" }}>
                <${ActivityBar} activeItem=${activeActivity} onItemClick=${setActiveActivity} />
                <${Sidebar}
                    activeActivity=${activeActivity}
                    rawTree=${rawTree}
                    revealNodeId=${revealNodeId}
                    onRevealComplete=${() => setRevealNodeId(null)}
                    onSelect=${setSelectedNode} />
                <${DocumentView}
                    selectedNode=${selectedNode}
                    goToLine=${goToLine}
                    onGoToLineDone=${() => setGoToLine(null)} />
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// MARK: Canvas toggle
// ---------------------------------------------------------------------------

// Right-clicking anywhere switches between the React UI and the p5 canvas.
// getComputedStyle is used instead of element.style.display because the
// initial display:none comes from the stylesheet (not an inline style), so
// element.style.display would return "" before the trial manager first sets it.
(function setupCanvasToggle() {
    const reactEl  = document.getElementById("react-container");
    const canvasEl = document.getElementById("study-container");

    document.addEventListener("contextmenu", e => {
        if (!window.studyTrialActive) return;
        e.preventDefault();
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
