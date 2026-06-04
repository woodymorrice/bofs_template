/**
 * react-app.js
 *
 * Renders a three-panel study UI into #react-container using React 18 and
 * BlueprintJS 5. All imports are served from the esm.sh CDN — no build step
 * required. The `htm` library provides JSX-like tagged template literals that
 * call React.createElement at runtime.
 *
 * Layout (top to bottom, left to right):
 *
 *   +--------------------------------------------------+
 *   |  TopNav  (Navbar, full width, ~50 px tall)       |
 *   +------------------+-------------------------------+
 *   |                  |                               |
 *   |  Sidebar         |  DocumentView                 |
 *   |  (240 px wide)   |  (fills remaining width)      |
 *   |                  |                               |
 *   +------------------+-------------------------------+
 */

import React, { useState, useEffect, useMemo } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import htm from "https://esm.sh/htm@3";
import hljs from "https://esm.sh/highlight.js@11";
import {
    Navbar, NavbarGroup, NavbarHeading, NavbarDivider,
    Button,
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

/**
 * Bind htm to React.createElement so that tagged template literals like
 *   html`<div>hello</div>`
 * compile into React element trees at runtime without a JSX transpiler.
 */
const html = htm.bind(React.createElement);

// ---------------------------------------------------------------------------
// URL for the tree data. Mirrors how main.js loads the dataset.
// ---------------------------------------------------------------------------
const TREE_URL = "/blueprint/boltz/root.json";

// ---------------------------------------------------------------------------
// Inject the highlight.js theme CSS from study-config.js
//
// Creates a <link> element in <head> once when this module loads.
// To change the theme, edit highlightTheme in study-config.js and refresh.
// ---------------------------------------------------------------------------
(function loadHighlightTheme() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://unpkg.com/highlight.js@11/styles/${highlightTheme}.min.css`;
    document.head.appendChild(link);
}());

// ---------------------------------------------------------------------------
// Tree utility functions
// ---------------------------------------------------------------------------

/**
 * toTreeNodes — recursively converts a root.json node into the shape that
 * Blueprint's Tree component expects (TreeNodeInfo).
 *
 * Directories get a folder icon, are expanded at depth 0, and carry their
 * children. Files get a document icon and store the raw node in nodeData so
 * DocumentView can read file-specific fields (lines, width, height, etc.).
 *
 * @param {object} node  - a root.json node (type "TreeDir" or "TreeFile")
 * @param {number} depth - nesting depth, used to auto-expand only the root
 * @returns {object} a Blueprint TreeNodeInfo object
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
 * updateNodeAtPath — returns a new nodes array with the node at nodePath
 * replaced by the result of calling updater(node). All other nodes are
 * returned as-is (structurally shared).
 *
 * @param {object[]} nodes    - current Blueprint TreeNodeInfo array
 * @param {number[]} nodePath - array of child indices from root to target
 * @param {function} updater  - receives the target node, returns updated node
 * @returns {object[]} new nodes array
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
 * deselectAll — walks the entire tree and sets isSelected: false on every
 * node. Called before selecting a new node so only one item is highlighted.
 *
 * @param {object[]} nodes - Blueprint TreeNodeInfo array
 * @returns {object[]} new nodes array with all selections cleared
 */
function deselectAll(nodes) {
    return nodes.map(node => ({
        ...node,
        isSelected: false,
        childNodes: node.childNodes ? deselectAll(node.childNodes) : undefined,
    }));
}

/**
 * getLanguage — maps a filename's extension to a highlight.js language ID.
 * Falls back to "plaintext" for unrecognised extensions so hljs never errors.
 *
 * @param {string} filename - e.g. "train.py"
 * @returns {string} highlight.js language identifier
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
// TopNav
// ---------------------------------------------------------------------------

/**
 * TopNav — thin horizontal bar pinned to the top of the layout.
 *
 * Appearance: a Blueprint Navbar (~50 px tall) with a white/light background
 * and a subtle bottom shadow. Left side shows the app title and two nav
 * buttons; right side has Help and Settings icon buttons.
 *
 * Props: none
 */
function TopNav() {
    return html`
        <${Navbar}>
            <${NavbarGroup} align=${Alignment.LEFT}>
                <${NavbarHeading}>Interfile Study<//>
                <${NavbarDivider} />
                <${Button} minimal icon="home" text="Overview" />
                <${Button} minimal icon="folder-open" text="Files" />
            <//>
            <${NavbarGroup} align=${Alignment.RIGHT}>
                <${Button} minimal icon="help" />
                <${Button} minimal icon="cog" />
            <//>
        <//>
    `;
}

// ---------------------------------------------------------------------------
// ActivityBar
// ---------------------------------------------------------------------------

/**
 * ActivityBar — narrow icon strip on the far left of the body area, VS Code style.
 *
 * Appearance: 48 px wide, dark background (#333333). Icon buttons are stacked
 * vertically and centred horizontally. The active item is indicated by a 2 px
 * white accent bar on the left edge and a brighter icon colour. A utility area
 * at the bottom holds secondary icons (currently a placeholder).
 *
 * Each entry in ACTIVITY_ITEMS has an id and a Blueprint icon name. Add more
 * entries to the array to grow the bar; the rest of the component adapts.
 *
 * Props:
 *   activeItem  {string}   - id of the currently active activity
 *   onItemClick {function} - called with the item id when an icon is clicked
 */

const ACTIVITY_ITEMS = [
    { id: "files", icon: "document" },
    // Add more activity items here, e.g.:
    // { id: "search", icon: "search" },
    // { id: "git",    icon: "git-branch" },
];

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

            <!--
                Top section — primary activity icons. Each item is wrapped in a
                relative-positioned div so the active accent bar can be placed
                absolutely against the left edge without affecting layout.
            -->
            <div style=${{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 4 }}>
                ${ACTIVITY_ITEMS.map(item => {
                    const isActive = activeItem === item.id;
                    return html`
                        <div key=${item.id} style=${{ position: "relative" }}>

                            <!--
                                Active accent — a 2 px white bar on the left edge,
                                only rendered for the currently active item.
                            -->
                            ${isActive && html`
                                <div style=${{
                                    position: "absolute",
                                    left: 0, top: 0, bottom: 0,
                                    width: 2,
                                    background: "#ffffff",
                                }} />
                            `}

                            <!--
                                Activity icon button — minimal removes Blueprint's
                                default raised styling. The colour transitions between
                                muted grey (inactive) and white (active).
                            -->
                            <${Button}
                                minimal
                                large
                                icon=${item.icon}
                                style=${{
                                    color: isActive ? "#ffffff" : "#858585",
                                    width: "100%",
                                    borderRadius: 0,
                                }}
                                onClick=${() => onItemClick(item.id)} />
                        </div>
                    `;
                })}
            </div>

            <!--
                Bottom section — utility icons that are not primary activities
                (e.g. settings, account). Currently a single placeholder.
            -->
            <div style=${{ paddingBottom: 4, display: "flex", flexDirection: "column" }}>
                <${Button}
                    minimal
                    large
                    icon="cog"
                    style=${{ color: "#858585", width: "100%", borderRadius: 0 }} />
            </div>

        </div>
    `;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/**
 * Sidebar — narrow scrollable panel on the left containing a collapsible
 * file tree.
 *
 * Appearance: 240 px wide, light grey background, separated from the main
 * content by a 1 px right border. Renders a Blueprint Tree whose nodes
 * represent directories (folder icons, collapsible) and files (document
 * icons, selectable). The selected file is highlighted in blue.
 *
 * On mount, fetches TREE_URL and converts the JSON into Blueprint
 * TreeNodeInfo format. Expansion and selection state are managed here and
 * updated immutably via updateNodeAtPath / deselectAll.
 *
 * Props:
 *   onSelect {function} - called with the raw root.json node when a file is clicked
 */
function Sidebar({ onSelect }) {
    const [nodes, setNodes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(TREE_URL)
            .then(r => r.json())
            .then(data => {
                setNodes([toTreeNodes(data, 0)]);
                setLoading(false);
            });
    }, []);

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

    return html`
        <div style=${{
            width: 240,
            borderRight: "1px solid #e1e8ed",
            overflowY: "auto",
            flexShrink: 0,
            background: "#f6f7f9",
        }}>
            ${loading
                ? html`<${Spinner} size=${20} style=${{ margin: "24px auto", display: "block" }} />`
                : html`
                    <${Tree}
                        contents=${nodes}
                        onNodeClick=${handleNodeClick}
                        onNodeExpand=${handleNodeExpand}
                        onNodeCollapse=${handleNodeCollapse} />
                `
            }
        </div>
    `;
}

// ---------------------------------------------------------------------------
// DocumentView
// ---------------------------------------------------------------------------

/**
 * DocumentView — main reading/viewing area to the right of the sidebar.
 *
 * Appearance: fills all remaining horizontal space, white background, 24 px
 * padding, vertically scrollable. Renders one of three states:
 *
 *   Empty state  — a centred NonIdealState prompt when no file is selected.
 *
 *   Source view  — when the node has a "lines" array (e.g. boltz dataset).
 *     Each line is syntax-highlighted individually using highlight.js with
 *     the language inferred from the file extension. Line numbers appear in
 *     a muted column to the left. Font, size, and line-height come from
 *     study-config.js.
 *
 *   Metadata view — when the node has width/height/totalLines but no source
 *     (e.g. test/whisper dataset). Shows a condensed key/value table.
 *
 * Props:
 *   selectedNode {object|null} - the raw root.json TreeFile node, or null
 */
function DocumentView({ selectedNode }) {
    /**
     * Pre-compute syntax-highlighted HTML for every line.
     *
     * Each line is passed through hljs.highlight() individually so we can
     * attach a line number to each row. ignoreIllegals prevents errors on
     * lines that are incomplete snippets (e.g. a bare closing paren).
     *
     * The result is memoized on selectedNode so we do not re-highlight on
     * every render. Returns an empty array when there are no source lines.
     */
    const highlightedLines = useMemo(() => {
        if (!selectedNode || !Array.isArray(selectedNode.lines)) return [];
        const lang = getLanguage(selectedNode.name);
        return selectedNode.lines.map(line =>
            hljs.highlight(line, { language: lang, ignoreIllegals: true }).value
        );
    }, [selectedNode]);

    if (!selectedNode) {
        return html`
            <div style=${{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <${NonIdealState}
                    icon="document"
                    title="No file selected"
                    description="Select a file from the sidebar to view its contents." />
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
                <!--
                    Code block — a scrollable pre element styled with values from
                    study-config.js. Each line is a flex row: the left column shows
                    the line number (muted, non-selectable), the right column renders
                    the highlighted HTML via dangerouslySetInnerHTML so the hljs
                    colour spans are preserved.
                -->
                <pre style=${{
                    margin: 0,
                    padding: 0,
                    fontFamily: codeFont,
                    fontSize: codeFontSize,
                    lineHeight: codeLineHeight,
                    overflowX: "auto",
                    background: "transparent",
                }}>
                    <code style=${{ display: "block" }}>
                        ${highlightedLines.map((lineHtml, i) => html`
                            <div key=${i} style=${{ display: "flex", minHeight: `${codeFontSize * codeLineHeight}px` }}>
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
                <!--
                    Metadata table — shown when the node carries layout fields but
                    no source lines (e.g. the test/whisper dataset).
                -->
                <table className="bp5-html-table bp5-html-table-condensed" style=${{ width: "100%" }}>
                    <tbody>
                        ${Object.entries({
                            "Total lines": selectedNode.totalLines,
                            "Longest line": selectedNode.longestLine,
                            "Width": selectedNode.width != null ? selectedNode.width.toFixed(1) + " px" : undefined,
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
// StudyApp (root)
// ---------------------------------------------------------------------------

/**
 * StudyApp — top-level component that owns shared state and composes all
 * four panels into a full-viewport column layout.
 *
 * State:
 *   selectedNode   {object|null} - the currently selected root.json TreeFile
 *     node, lifted here so Sidebar and DocumentView stay in sync.
 *   activeActivity {string}      - id of the active ActivityBar item, used to
 *     control which panel the sidebar shows (currently only "files").
 *
 * Layout:
 *   +------------------------------------------------+
 *   |  TopNav  (full width)                          |
 *   +------+------------+---------------------------+
 *   |      |            |                           |
 *   | Act. |  Sidebar   |  DocumentView             |
 *   | Bar  |            |                           |
 *   +------+------------+---------------------------+
 *
 *   flex column filling #react-container (100 vh).
 *   The body row uses overflow: hidden so each child scrolls independently.
 */
function StudyApp() {
    const [selectedNode, setSelectedNode] = useState(null);
    const [activeActivity, setActiveActivity] = useState("files");

    return html`
        <div style=${{ display: "flex", flexDirection: "column", height: "100%" }}>
            <${TopNav} />
            <div style=${{ display: "flex", flex: 1, overflow: "hidden" }}>
                <${ActivityBar} activeItem=${activeActivity} onItemClick=${setActiveActivity} />
                <${Sidebar} onSelect=${setSelectedNode} />
                <${DocumentView} selectedNode=${selectedNode} />
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount the React tree into #react-container (defined in task.html).
 * createRoot enables React 18 concurrent rendering.
 */
const root = createRoot(document.getElementById("react-container"));
root.render(html`<${StudyApp} />`);
