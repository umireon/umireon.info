// SPDX-FileCopyrightText: 2026 Kaito Udagawa
//
// SPDX-License-Identifier: Apache-2.0

/**
 * @typedef {Object} SukiNode
 * @property {string} id
 * @property {string} label
 * @property {number} x
 * @property {number} y
 * @property {string | null} groupId
 * @property {string} color
 *
 * @typedef {Object} SukiGroup
 * @property {string} id
 * @property {string} label
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} color
 *
 * @typedef {Object} SukiEdge
 * @property {string} id
 * @property {string} sourceId
 * @property {string} targetId
 * @property {string} label
 * @property {"related" | "strong" | "weak" | "oneway"} type
 * @property {string} color
 *
 * @typedef {Object} SukiGraph
 * @property {SukiNode[]} nodes
 * @property {SukiGroup[]} groups
 * @property {SukiEdge[]} edges
 *
 * @typedef {SukiNode | SukiGroup | SukiEdge} SukiEntity
 *
 * @typedef {Object} SukiSvgExportContext
 * @property {HTMLElement} graphElement
 * @property {SukiGraph} graph
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_SIZE = 88;
const NODE_RADIUS = NODE_SIZE / 2;
const CANVAS_PADDING = 96;
const GROUP_PADDING_X = 28;
const GROUP_PADDING_TOP = 42;
const GROUP_PADDING_BOTTOM = 24;
const GROUP_MIN_WIDTH = 180;
const GROUP_MIN_HEIGHT = 150;
const CANVAS_WORLD_WIDTH = 3200;
const CANVAS_WORLD_HEIGHT = 2200;
const SVG_VIEWBOX_PADDING = 36;
const DRAG_START_THRESHOLD = 10;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 24;
const ADD_HINT_RADIUS = 34;
const NODE_EDIT_TAP_COUNT = 3;
const NODE_EJECT_SPEED = 1.8;
const NODE_EJECT_MARGIN = 24;
const DRAFT_GROUP_ID = "__draft-group";
const GRID_SIZE = 32;
const UNDO_LIMIT = 80;
const GROUP_LAYOUT_SPACING = 140;
const GROUP_LAYOUT_RELAXATION = 0.35;
const LOOSE_LAYOUT_RELAXATION = GROUP_LAYOUT_RELAXATION / 4;
const GROUP_PALETTE = ["#5fb2cb", "#f08a6b", "#79a96b", "#c88dd8", "#e0b94f"];
const NODE_PALETTE = ["#ffffff", "#fff2c2", "#dff5ff", "#f5e5ff", "#e6f6dc"];
const DEFAULT_EDGE_COLOR = "#4f5653";
const NODE_LABEL_CANDIDATES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const MOVE_ANIMATION_MS = 180;
const GROUP_RESIZE_ANIMATION_MS = 520;
const EXPORTED_SVG_STYLE = `
  .suki-edge-line { stroke: #4f5653; stroke-width: 5; stroke-linecap: round; }
  .suki-edge[data-type="strong"] .suki-edge-line { stroke-width: 8; }
  .suki-edge-label-background { fill: #ffffff; }
  .suki-edge-label { fill: #172026; font: 700 13px system-ui, sans-serif; }
  .suki-group-box { stroke-width: 2; fill-opacity: 0.22; }
  .suki-group-label { fill: #24342f; font: 700 15px system-ui, sans-serif; }
  .suki-node-circle { stroke: #9baaa4; stroke-width: 2; }
  .suki-node-label { fill: #172026; font: 700 34px system-ui, sans-serif; }
`;

/**
 * @typedef {Object} SukiUrlInitialState
 * @property {string} documentName
 * @property {SukiGraph} graph
 */

/**
 * @param {string} prefix
 * @returns {string}
 */
function makeId(prefix) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 7);
  return `${prefix}-${hex}`;
}

/**
 * @param {SukiGraph} graph
 * @param {string} prefix
 * @returns {string}
 */
function makeUniqueId(graph, prefix) {
  let id = makeId(prefix);
  while (findEntity(graph, id)) {
    id = makeId(prefix);
  }
  return id;
}

/**
 * @param {number} value
 * @returns {string}
 */
function toHexByte(value) {
  return Math.round(value).toString(16).padStart(2, "0");
}

/**
 * @returns {string}
 */
function randomPastelColor() {
  const hue = Math.random() * 360;
  const saturation = 0.42 + Math.random() * 0.18;
  const lightness = 0.84 + Math.random() * 0.08;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] = segment < 1
    ? [chroma, secondary, 0]
    : segment < 2
      ? [secondary, chroma, 0]
      : segment < 3
        ? [0, chroma, secondary]
        : segment < 4
          ? [0, secondary, chroma]
          : segment < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return `#${toHexByte((red + match) * 255)}${toHexByte((green + match) * 255)}${toHexByte((blue + match) * 255)}`;
}

/**
 * @returns {string}
 */
function randomNodeLabel() {
  return NODE_LABEL_CANDIDATES[Math.floor(Math.random() * NODE_LABEL_CANDIDATES.length)] || "A";
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function getLabelLines(text) {
  const lines = text.split(/\r?\n/);
  return lines.length > 0 ? lines : [""];
}

/**
 * @param {SukiEdge} edge
 * @returns {string}
 */
function getEdgeColor(edge) {
  return edge.color || DEFAULT_EDGE_COLOR;
}

/**
 * @param {string} tagName
 * @returns {SVGElement}
 */
function svgElement(tagName) {
  return document.createElementNS(SVG_NS, tagName);
}

/**
 * @param {Element} element
 * @param {Record<string, string | number>} attributes
 */
function setAttributes(element, attributes) {
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {string | number | null | undefined} value
 */
function setOptionalAttribute(element, name, value) {
  if (value === null || value === undefined || value === "") {
    element.removeAttribute(name);
    return;
  }

  element.setAttribute(name, String(value));
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readNumberAttribute(element, name, fallback) {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * @param {Element} element
 * @returns {string}
 */
function readLabelElementText(element) {
  return element.querySelector(":scope > suki-label")?.textContent || element.getAttribute("label") || "";
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} value
 * @returns {string}
 */
function fileNameStem(value) {
  const stem = value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return stem || "suki-circle";
}

/**
 * @param {SukiGraph} graph
 * @returns {SukiGraph}
 */
function cloneGraph(graph) {
  return structuredClone(graph);
}

/**
 * @param {unknown} value
 * @returns {SukiGraph}
 */
function normalizeGraph(value) {
  const graph = /** @type {SukiGraph & { customCss?: string }} */ (value);
  delete graph.customCss;
  return graph;
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function decodeCommaFields(value) {
  return value.split(",").map((field) => decodeQueryComponent(field));
}

/**
 * @param {string} color
 * @param {string} fallback
 * @returns {string}
 */
function normalizeUrlColor(color, fallback) {
  const value = color.trim();
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) return value;
  if (/^[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) return `#${value}`;
  return fallback;
}

/**
 * @param {string} prefix
 * @param {number} reference
 * @returns {string}
 */
function idFromUrlReference(prefix, reference) {
  return `${prefix}-${Math.max(0, reference).toString(16).padStart(7, "0").slice(-7)}`;
}

/**
 * @param {string} search
 * @returns {{ key: string, value: string }[]}
 */
function parseRawQueryEntries(search) {
  const source = search.startsWith("?") ? search.slice(1) : search;
  if (!source) return [];
  return source.split("&").filter(Boolean).map((entry) => {
    const separatorIndex = entry.indexOf("=");
    const rawKey = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
    const rawValue = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : "";
    return {
      key: decodeQueryComponent(rawKey),
      value: rawValue,
    };
  });
}

/**
 * @param {string} hash
 * @returns {string}
 */
function queryFromHash(hash) {
  if (hash.startsWith("#?")) return hash.slice(1);
  if (hash.startsWith("#")) return `?${hash.slice(1)}`;
  return "";
}

/**
 * @param {string} search
 * @returns {SukiUrlInitialState | null}
 */
function readInitialStateFromUrlSearch(search) {
  const entries = parseRawQueryEntries(search);
  if (!entries.some((entry) => entry.key === "suki-circle" && decodeQueryComponent(entry.value) === "v1")) return null;

  /** @type {Map<number, SukiGroup>} */
  const groupsByReference = new Map();
  /** @type {Map<number, SukiNode>} */
  const nodesByReference = new Map();
  /** @type {Map<number, string>} */
  const labelsByReference = new Map();
  /** @type {Map<number, string>} */
  const colorsByReference = new Map();
  /** @type {{ reference: number, sourceReference: number, targetReference: number, label: string, color: string }[]} */
  const edgeEntries = [];
  let documentName = "スキサークル";

  entries.forEach(({ key, value }) => {
    if (key === "t") {
      documentName = decodeQueryComponent(value).trim() || documentName;
      return;
    }

    const match = key.match(/^(g|n|e|l|c)\[(\d+)\]$/);
    if (!match) return;

    const reference = Number(match[2]);
    if (!Number.isInteger(reference) || reference < 0) return;

    if (match[1] === "l") {
      labelsByReference.set(reference, decodeQueryComponent(value));
      return;
    }

    if (match[1] === "c") {
      colorsByReference.set(reference, decodeQueryComponent(value));
      return;
    }

    const fields = decodeCommaFields(value);
    if (match[1] === "g") {
      groupsByReference.set(reference, {
        id: idFromUrlReference("group", reference),
        label: fields.length >= 2 ? fields[0] || "" : "",
        x: 0,
        y: 0,
        width: GROUP_MIN_WIDTH,
        height: GROUP_MIN_HEIGHT,
        color: normalizeUrlColor(fields.length >= 2 ? fields[1] || "" : fields[0] || "", GROUP_PALETTE[0]),
      });
      return;
    }

    if (match[1] === "n") {
      const x = Number(fields[0]);
      const y = Number(fields[1]);
      const groupReferenceField = fields.length >= 5 ? fields[4] : fields.length >= 4 ? fields[3] : fields[2];
      const groupReference = groupReferenceField === "" || groupReferenceField === undefined ? NaN : Number(groupReferenceField);
      nodesByReference.set(reference, {
        id: idFromUrlReference("node", reference),
        label: fields.length >= 5 ? fields[3] || "" : "",
        x: Number.isFinite(x) ? x : CANVAS_WORLD_WIDTH / 2,
        y: Number.isFinite(y) ? y : CANVAS_WORLD_HEIGHT / 2,
        groupId: Number.isFinite(groupReference) ? idFromUrlReference("group", groupReference) : null,
        color: normalizeUrlColor(fields.length >= 4 ? fields[2] || "" : "", NODE_PALETTE[0]),
      });
      return;
    }

    const sourceReference = Number(fields[0]);
    const targetReference = Number(fields[1]);
    if (!Number.isFinite(sourceReference) || !Number.isFinite(targetReference)) return;
    edgeEntries.push({
      reference,
      sourceReference,
      targetReference,
      label: fields.length >= 4 ? fields[2] || "" : "",
      color: normalizeUrlColor(fields.length >= 4 ? fields[3] || "" : fields[2] || "", DEFAULT_EDGE_COLOR),
    });
  });

  labelsByReference.forEach((label, reference) => {
    const group = groupsByReference.get(reference);
    if (group) group.label = label;
    const node = nodesByReference.get(reference);
    if (node) node.label = label;
    const edge = edgeEntries.find((item) => item.reference === reference);
    if (edge) edge.label = label;
  });

  colorsByReference.forEach((color, reference) => {
    const group = groupsByReference.get(reference);
    if (group) group.color = normalizeUrlColor(color, group.color);
    const node = nodesByReference.get(reference);
    if (node) node.color = normalizeUrlColor(color, node.color);
    const edge = edgeEntries.find((item) => item.reference === reference);
    if (edge) edge.color = normalizeUrlColor(color, edge.color);
  });

  const graph = normalizeGraph({
    groups: [...groupsByReference.entries()].sort(([left], [right]) => left - right).map(([, group]) => group),
    nodes: [...nodesByReference.entries()].sort(([left], [right]) => left - right).map(([, node]) => {
      if (node.groupId && !groupsByReference.has(Number.parseInt(node.groupId.slice("group-".length), 16))) {
        node.groupId = null;
      }
      return node;
    }),
    edges: edgeEntries
      .filter((edge) => nodesByReference.has(edge.sourceReference) && nodesByReference.has(edge.targetReference))
      .sort((left, right) => left.reference - right.reference)
      .map((edge) => ({
        id: idFromUrlReference("edge", edge.reference),
        sourceId: idFromUrlReference("node", edge.sourceReference),
        targetId: idFromUrlReference("node", edge.targetReference),
        label: edge.label,
        type: "related",
        color: edge.color,
      })),
  });

  updateGroupGeometry(graph);
  return { documentName, graph };
}

/**
 * @returns {SukiUrlInitialState | null}
 */
function readInitialStateFromLocation() {
  return readInitialStateFromUrlSearch(queryFromHash(location.hash))
    || readInitialStateFromUrlSearch(location.search);
}

/**
 * @param {string} value
 * @returns {string}
 */
function encodeUrlValue(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/**
 * @param {string} name
 * @param {number} reference
 * @returns {string}
 */
function urlReferenceKey(name, reference) {
  return `${name}[${reference}]`;
}

/**
 * @param {string} id
 * @param {Map<string, number>} references
 * @returns {number}
 */
function referenceForId(id, references) {
  const value = references.get(id);
  if (value === undefined) throw new Error(`Missing URL reference for ${id}.`);
  return value;
}

/**
 * @param {SukiGraph} graph
 * @returns {Map<string, number>}
 */
function createUrlReferences(graph) {
  /** @type {Map<string, number>} */
  const references = new Map();
  let nextReference = 1;
  graph.groups.forEach((group) => {
    references.set(group.id, nextReference);
    nextReference += 1;
  });
  graph.nodes.forEach((node) => {
    references.set(node.id, nextReference);
    nextReference += 1;
  });
  graph.edges.forEach((edge) => {
    references.set(edge.id, nextReference);
    nextReference += 1;
  });
  return references;
}

/**
 * @param {SukiGraph} graph
 * @param {string} documentName
 * @returns {string}
 */
function createUrlQueryFromGraph(graph, documentName) {
  const sourceGraph = cloneGraph(graph);
  updateGroupGeometry(sourceGraph);
  const references = createUrlReferences(sourceGraph);
  /** @type {string[]} */
  const entries = [`suki-circle=${encodeUrlValue("v1")}`];
  const title = documentName.trim();
  if (title) entries.push(`t=${encodeUrlValue(title)}`);

  sourceGraph.groups.forEach((group) => {
    const reference = referenceForId(group.id, references);
    entries.push(`${urlReferenceKey("g", reference)}=`);
    if (group.color) entries.push(`${urlReferenceKey("c", reference)}=${encodeUrlValue(group.color.replace(/^#/, ""))}`);
    if (group.label) entries.push(`${urlReferenceKey("l", reference)}=${encodeUrlValue(group.label)}`);
  });

  sourceGraph.nodes.forEach((node) => {
    const reference = referenceForId(node.id, references);
    const fields = [
      String(Math.round(node.x)),
      String(Math.round(node.y)),
    ];
    if (node.groupId && references.has(node.groupId)) fields.push(String(referenceForId(node.groupId, references)));
    entries.push(`${urlReferenceKey("n", reference)}=${fields.map(encodeUrlValue).join(",")}`);
    if (node.color) entries.push(`${urlReferenceKey("c", reference)}=${encodeUrlValue(node.color.replace(/^#/, ""))}`);
    if (node.label) entries.push(`${urlReferenceKey("l", reference)}=${encodeUrlValue(node.label)}`);
  });

  sourceGraph.edges.forEach((edge) => {
    if (!references.has(edge.sourceId) || !references.has(edge.targetId)) return;
    const reference = referenceForId(edge.id, references);
    entries.push(`${urlReferenceKey("e", reference)}=${[
      String(referenceForId(edge.sourceId, references)),
      String(referenceForId(edge.targetId, references)),
    ].map(encodeUrlValue).join(",")}`);
    const edgeColor = getEdgeColor(edge);
    if (edgeColor !== DEFAULT_EDGE_COLOR) entries.push(`${urlReferenceKey("c", reference)}=${encodeUrlValue(edgeColor.replace(/^#/, ""))}`);
    if (edge.label) entries.push(`${urlReferenceKey("l", reference)}=${encodeUrlValue(edge.label)}`);
  });

  return entries.join("&");
}

/**
 * @param {SukiGraph} graph
 * @param {string} id
 * @returns {SukiEntity | null}
 */
function findEntity(graph, id) {
  return graph.nodes.find((node) => node.id === id)
    || graph.groups.find((group) => group.id === id)
    || graph.edges.find((edge) => edge.id === id)
    || null;
}

/**
 * @param {SukiGraph} graph
 * @param {SukiEntity} entity
 * @returns {"node" | "group" | "edge"}
 */
function getEntityKind(graph, entity) {
  if (graph.groups.some((group) => group.id === entity.id)) return "group";
  if (graph.edges.some((edge) => edge.id === entity.id)) return "edge";
  return "node";
}

/**
 * @param {SukiGraph} graph
 * @param {string} sourceId
 * @param {string} targetId
 * @returns {boolean}
 */
function hasEdge(graph, sourceId, targetId) {
  return graph.edges.some((edge) => {
    return (edge.sourceId === sourceId && edge.targetId === targetId)
      || (edge.sourceId === targetId && edge.targetId === sourceId);
  });
}

/**
 * @param {SukiGraph} graph
 * @param {string} groupId
 * @returns {SukiNode[]}
 */
function getGroupMembers(graph, groupId) {
  return graph.nodes.filter((node) => node.groupId === groupId);
}

/**
 * @param {SukiGroup} group
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
function getGroupBox(group) {
  const width = group.width || GROUP_MIN_WIDTH;
  const height = group.height || GROUP_MIN_HEIGHT;
  return {
    left: group.x - width / 2,
    top: group.y - height / 2,
    width,
    height,
  };
}

/**
 * @param {{ left: number, top: number, right: number, bottom: number } | null} bounds
 * @param {{ left: number, top: number, right: number, bottom: number }} box
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function includeBounds(bounds, box) {
  if (!bounds) return { ...box };
  return {
    left: Math.min(bounds.left, box.left),
    top: Math.min(bounds.top, box.top),
    right: Math.max(bounds.right, box.right),
    bottom: Math.max(bounds.bottom, box.bottom),
  };
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatSvgNumber(value) {
  return Number(value.toFixed(2)).toString();
}

/**
 * @param {SukiGraph} graph
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function getGraphContentViewBox(graph) {
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let bounds = null;

  graph.groups.forEach((group) => {
    const box = getGroupBox(group);
    bounds = includeBounds(bounds, {
      left: box.left,
      top: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
    });
  });

  graph.nodes.forEach((node) => {
    bounds = includeBounds(bounds, {
      left: node.x - NODE_RADIUS,
      top: node.y - NODE_RADIUS,
      right: node.x + NODE_RADIUS,
      bottom: node.y + NODE_RADIUS,
    });
  });

  graph.edges.forEach((edge) => {
    const source = graph.nodes.find((node) => node.id === edge.sourceId);
    const target = graph.nodes.find((node) => node.id === edge.targetId);
    if (!source || !target) return;
    const strokePadding = edge.type === "strong" ? 8 : 5;
    bounds = includeBounds(bounds, {
      left: Math.min(source.x, target.x) - strokePadding,
      top: Math.min(source.y, target.y) - strokePadding,
      right: Math.max(source.x, target.x) + strokePadding,
      bottom: Math.max(source.y, target.y) + strokePadding,
    });

    if (!edge.label) return;
    const labelX = (source.x + target.x) / 2;
    const labelY = (source.y + target.y) / 2 + 14;
    const labelWidth = Math.max(34, edge.label.length * 14 + 18);
    const labelHeight = 24;
    bounds = includeBounds(bounds, {
      left: labelX - labelWidth / 2,
      top: labelY - labelHeight / 2,
      right: labelX + labelWidth / 2,
      bottom: labelY + labelHeight / 2,
    });
  });

  if (!bounds) return { x: 0, y: 0, width: CANVAS_WORLD_WIDTH, height: CANVAS_WORLD_HEIGHT };

  const x = bounds.left - SVG_VIEWBOX_PADDING;
  const y = bounds.top - SVG_VIEWBOX_PADDING;
  return {
    x,
    y,
    width: Math.max(1, bounds.right - bounds.left + SVG_VIEWBOX_PADDING * 2),
    height: Math.max(1, bounds.bottom - bounds.top + SVG_VIEWBOX_PADDING * 2),
  };
}

/**
 * @param {{ left: number, top: number, width: number, height: number }} box
 * @param {number} x
 * @param {number} y
 * @param {number} margin
 * @returns {boolean}
 */
function isPointInsideBox(box, x, y, margin = 0) {
  return x >= box.left - margin
    && x <= box.left + box.width + margin
    && y >= box.top - margin
    && y <= box.top + box.height + margin;
}

/**
 * @param {Element} layer
 * @param {string} selector
 * @param {string} tagName
 * @param {string[]} orderedIds
 * @returns {Map<string, SVGElement>}
 */
function syncSvgLayerElements(layer, selector, tagName, orderedIds) {
  const existing = new Map(
    [...layer.querySelectorAll(selector)].map((element) => [/** @type {SVGElement} */ (element).dataset.id || "", /** @type {SVGElement} */ (element)]),
  );
  const elements = orderedIds.map((id) => {
    const current = existing.get(id);
    if (current) return current;
    const created = svgElement(tagName);
    created.dataset.id = id;
    return created;
  });

  layer.replaceChildren(...elements);
  return new Map(elements.map((element) => [element.dataset.id || "", element]));
}

/**
 * @param {SukiNode[]} members
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function getGroupGeometryForMembers(members) {
  if (members.length === 0) {
    return {
      x: 0,
      y: 0,
      width: GROUP_MIN_WIDTH,
      height: GROUP_MIN_HEIGHT,
    };
  }

  const minX = Math.min(...members.map((node) => node.x - NODE_RADIUS));
  const maxX = Math.max(...members.map((node) => node.x + NODE_RADIUS));
  const minY = Math.min(...members.map((node) => node.y - NODE_RADIUS));
  const maxY = Math.max(...members.map((node) => node.y + NODE_RADIUS));
  const left = minX - GROUP_PADDING_X;
  const top = minY - GROUP_PADDING_TOP;
  const width = Math.max(GROUP_MIN_WIDTH, maxX - minX + GROUP_PADDING_X * 2);
  const height = Math.max(GROUP_MIN_HEIGHT, maxY - minY + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM);

  return {
    x: left + width / 2,
    y: top + height / 2,
    width,
    height,
  };
}

/**
 * @param {SukiGraph} graph
 */
function updateGroupGeometry(graph) {
  graph.groups.forEach((group) => {
    const members = getGroupMembers(graph, group.id);
    if (members.length === 0) {
      group.width = group.width || GROUP_MIN_WIDTH;
      group.height = group.height || GROUP_MIN_HEIGHT;
      return;
    }

    Object.assign(group, getGroupGeometryForMembers(members));
  });
}

/**
 * @param {SukiGraph} graph
 * @param {{ x?: number, y?: number, width: number, height: number }} viewport
 * @returns {SukiGraph}
 */
function autoLayout(graph, viewport) {
  const next = cloneGraph(graph);
  void viewport;

  next.groups.forEach((group) => {
    const members = getGroupMembers(next, group.id);
    if (members.length < 2) return;

    const centroidX = members.reduce((sum, node) => sum + node.x, 0) / members.length;
    const centroidY = members.reduce((sum, node) => sum + node.y, 0) / members.length;
    const targetRadius = members.length === 2
      ? GROUP_LAYOUT_SPACING / 2
      : GROUP_LAYOUT_SPACING / (2 * Math.sin(Math.PI / members.length));

    members.forEach((node, index) => {
      const currentDx = node.x - centroidX;
      const currentDy = node.y - centroidY;
      const currentDistance = Math.hypot(currentDx, currentDy);
      const fallbackAngle = (-Math.PI / 2) + (Math.PI * 2 * index) / members.length;
      const unitX = currentDistance > 0 ? currentDx / currentDistance : Math.cos(fallbackAngle);
      const unitY = currentDistance > 0 ? currentDy / currentDistance : Math.sin(fallbackAngle);
      const nextDistance = currentDistance + (targetRadius - currentDistance) * GROUP_LAYOUT_RELAXATION;
      node.x = Math.min(
        CANVAS_WORLD_WIDTH - CANVAS_PADDING,
        Math.max(CANVAS_PADDING, centroidX + unitX * nextDistance),
      );
      node.y = Math.min(
        CANVAS_WORLD_HEIGHT - CANVAS_PADDING,
        Math.max(CANVAS_PADDING, centroidY + unitY * nextDistance),
      );
    });
  });

  next.nodes.filter((node) => !node.groupId).forEach((node) => {
    const nearest = next.nodes
      .filter((candidate) => candidate.id !== node.id)
      .map((candidate) => ({
        node: candidate,
        distance: Math.hypot(candidate.x - node.x, candidate.y - node.y),
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.node.id.localeCompare(right.node.id);
      })[0];
    if (!nearest) return;

    const dx = node.x - nearest.node.x;
    const dy = node.y - nearest.node.y;
    const distance = Math.max(1, nearest.distance);
    const nextDistance = distance + (GROUP_LAYOUT_SPACING - distance) * LOOSE_LAYOUT_RELAXATION;
    const unitX = dx / distance;
    const unitY = dy / distance;
    node.x = Math.min(
      CANVAS_WORLD_WIDTH - CANVAS_PADDING,
      Math.max(CANVAS_PADDING, nearest.node.x + unitX * nextDistance),
    );
    node.y = Math.min(
      CANVAS_WORLD_HEIGHT - CANVAS_PADDING,
      Math.max(CANVAS_PADDING, nearest.node.y + unitY * nextDistance),
    );
  });

  updateGroupGeometry(next);
  return next;
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {string | number} from
 * @param {string | number} to
 * @param {number} duration
 */
function animateSvgAttribute(element, name, from, to, duration) {
  if (String(from) === String(to)) return;

  element.querySelectorAll(`animate[data-suki-animation="${name}"]`).forEach((animation) => animation.remove());
  const animation = svgElement("animate");
  animation.dataset.sukiAnimation = name;
  setAttributes(animation, {
    attributeName: name,
    from,
    to,
    dur: `${duration}ms`,
    fill: "freeze",
  });
  element.append(animation);
  if ("beginElement" in animation) animation.beginElement();
  window.setTimeout(() => animation.remove(), duration + 50);
}

/**
 * @param {SVGElement} element
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {number} duration
 */
function animateSvgTransform(element, fromX, fromY, toX, toY, duration) {
  if (fromX === toX && fromY === toY) return;

  element.querySelectorAll('animateTransform[data-suki-animation="transform"]').forEach((animation) => animation.remove());
  const animation = svgElement("animateTransform");
  animation.dataset.sukiAnimation = "transform";
  setAttributes(animation, {
    attributeName: "transform",
    type: "translate",
    from: `${fromX} ${fromY}`,
    to: `${toX} ${toY}`,
    dur: `${duration}ms`,
    fill: "freeze",
  });
  element.append(animation);
  if ("beginElement" in animation) animation.beginElement();
  window.setTimeout(() => animation.remove(), duration + 50);
}

/**
 * @param {SVGElement} element
 * @param {number} x
 * @param {number} y
 * @param {number} duration
 */
function setSvgTransform(element, x, y, duration) {
  const previousX = Number(element.dataset.x);
  const previousY = Number(element.dataset.y);
  const hasPrevious = Number.isFinite(previousX) && Number.isFinite(previousY);
  if (duration > 0 && hasPrevious) {
    animateSvgTransform(element, previousX, previousY, x, y, duration);
  }

  element.dataset.x = String(x);
  element.dataset.y = String(y);
  element.setAttribute("transform", `translate(${x} ${y})`);
}

/**
 * @param {SVGElement} element
 * @param {SukiGroup} group
 * @param {boolean} selected
 * @param {boolean} pending
 * @param {number} moveDuration
 * @param {number} resizeDuration
 */
function renderSvgGroup(element, group, selected, pending, moveDuration, resizeDuration) {
  const box = getGroupBox(group);
  element.classList.add("suki-group");
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-pending", pending);
  element.classList.toggle("is-draft", group.id === DRAFT_GROUP_ID);
  element.dataset.entityKind = "group";
  element.dataset.id = group.id;
  element.id = group.id;
  element.removeAttribute("transform");
  element.removeAttribute("style");

  let rect = element.querySelector(".suki-group-box");
  if (!rect) {
    rect = svgElement("rect");
    rect.classList.add("suki-group-box");
    element.append(rect);
  }
  const previousX = rect.dataset.x;
  const previousY = rect.dataset.y;
  const previousWidth = rect.dataset.width;
  const previousHeight = rect.dataset.height;
  setAttributes(rect, { x: box.left, y: box.top, width: box.width, height: box.height, rx: 8, fill: group.color, stroke: group.color });
  if (moveDuration > 0 && previousX) animateSvgAttribute(rect, "x", previousX, box.left, moveDuration);
  if (moveDuration > 0 && previousY) animateSvgAttribute(rect, "y", previousY, box.top, moveDuration);
  if (resizeDuration > 0 && previousWidth) animateSvgAttribute(rect, "width", previousWidth, box.width, resizeDuration);
  if (resizeDuration > 0 && previousHeight) animateSvgAttribute(rect, "height", previousHeight, box.height, resizeDuration);
  rect.dataset.x = String(box.left);
  rect.dataset.y = String(box.top);
  rect.dataset.width = String(box.width);
  rect.dataset.height = String(box.height);

  let text = element.querySelector(".suki-group-label");
  if (!text) {
    text = svgElement("text");
    text.classList.add("suki-group-label");
    element.append(text);
  }
  const textX = box.left + 14;
  const textY = box.top + 28;
  const previousTextX = text.dataset.x;
  const previousTextY = text.dataset.y;
  setAttributes(text, { x: textX, y: textY });
  if (moveDuration > 0 && previousTextX) animateSvgAttribute(text, "x", previousTextX, textX, moveDuration);
  if (moveDuration > 0 && previousTextY) animateSvgAttribute(text, "y", previousTextY, textY, moveDuration);
  text.dataset.x = String(textX);
  text.dataset.y = String(textY);
  text.replaceChildren(...getLabelLines(group.label).map((line, index) => {
    const tspan = svgElement("tspan");
    setAttributes(tspan, {
      x: textX,
      dy: index === 0 ? 0 : "1.25em",
    });
    tspan.textContent = line || " ";
    return tspan;
  }));
}

/**
 * @param {SVGElement} element
 * @param {SukiNode} node
 * @param {boolean} selected
 * @param {boolean} pending
 * @param {number} moveDuration
 */
function renderSvgNode(element, node, selected, pending, moveDuration) {
  element.classList.add("suki-node");
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-pending", pending);
  element.dataset.entityKind = "node";
  element.dataset.id = node.id;
  element.id = node.id;
  setSvgTransform(element, node.x, node.y, moveDuration);

  let circle = element.querySelector(".suki-node-circle");
  if (!circle) {
    circle = svgElement("circle");
    circle.classList.add("suki-node-circle");
    element.append(circle);
  }
  setAttributes(circle, { cx: 0, cy: 0, r: NODE_RADIUS, fill: node.color });

  let text = element.querySelector(".suki-node-label");
  if (!text) {
    text = svgElement("text");
    text.classList.add("suki-node-label");
    element.append(text);
  }
  setAttributes(text, { x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "central" });
  text.textContent = node.label;
}

/**
 * @param {string} id
 * @param {number} cx
 * @param {number} cy
 * @returns {SVGElement}
 */
function createSvgPropertiesAction(id, cx, cy) {
  const action = svgElement("g");
  action.classList.add("suki-properties-action");
  action.dataset.action = "open-properties";
  action.dataset.id = id;

  const title = svgElement("title");
  title.textContent = "プロパティ";

  const border = svgElement("circle");
  border.classList.add("suki-properties-action-border");
  setAttributes(border, { cx, cy, r: 14 });

  const icon = svgElement("g");
  icon.classList.add("suki-properties-action-icon");
  [-5, 0, 5].forEach((offset) => {
    const line = svgElement("line");
    setAttributes(line, {
      x1: cx - 7,
      y1: cy + offset,
      x2: cx + 7,
      y2: cy + offset,
    });
    icon.append(line);
  });

  action.append(title, border, icon);
  return action;
}

/**
 * @param {SVGElement} element
 * @param {SukiNode} node
 */
function renderSvgNodeAction(element, node) {
  const connectWidth = 48;
  const height = 28;
  const gap = 8;
  const colorSize = 28;
  const deleteSize = 28;
  const propertiesSize = 28;
  const totalWidth = connectWidth + gap + colorSize + gap + deleteSize;
  const x = node.x - totalWidth / 2;
  const y = node.y + NODE_RADIUS + 12;

  element.setAttribute("class", "suki-node-action");
  element.dataset.id = node.id;

  const connectAction = svgElement("g");
  connectAction.classList.add("suki-node-connect-action");
  connectAction.dataset.action = "start-connect";
  connectAction.dataset.id = node.id;

  const rect = svgElement("rect");
  rect.classList.add("suki-node-action-box");
  setAttributes(rect, { x, y, width: connectWidth, height, rx: 6 });

  const text = svgElement("text");
  text.classList.add("suki-node-action-label");
  setAttributes(text, {
    x: x + connectWidth / 2,
    y: y + height / 2,
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = "接続";
  connectAction.append(rect, text);

  const colorAction = svgElement("g");
  colorAction.classList.add("suki-node-color-action");
  colorAction.dataset.action = "change-node-color";
  colorAction.dataset.id = node.id;

  const title = svgElement("title");
  title.textContent = "色変更";
  const circle = svgElement("circle");
  circle.classList.add("suki-node-color-action-swatch");
  setAttributes(circle, {
    cx: x + connectWidth + gap + colorSize / 2,
    cy: y + colorSize / 2,
    r: colorSize / 2,
    fill: node.color,
  });
  colorAction.append(title, circle);

  const deleteAction = svgElement("g");
  deleteAction.classList.add("suki-node-delete-action");
  deleteAction.dataset.action = "delete-node";
  deleteAction.dataset.id = node.id;

  const deleteX = x + connectWidth + gap + colorSize + gap;
  const deleteCenterX = deleteX + deleteSize / 2;
  const deleteCenterY = y + deleteSize / 2;

  const deleteTitle = svgElement("title");
  deleteTitle.textContent = "削除";
  const deleteCircle = svgElement("circle");
  deleteCircle.classList.add("suki-node-delete-action-circle");
  setAttributes(deleteCircle, {
    cx: deleteCenterX,
    cy: deleteCenterY,
    r: deleteSize / 2,
  });

  const deleteMinus = svgElement("line");
  deleteMinus.classList.add("suki-node-delete-action-minus");
  setAttributes(deleteMinus, {
    x1: deleteCenterX - 6,
    y1: deleteCenterY,
    x2: deleteCenterX + 6,
    y2: deleteCenterY,
  });
  deleteAction.append(deleteTitle, deleteCircle, deleteMinus);

  const propertiesAction = createSvgPropertiesAction(
    node.id,
    deleteCenterX,
    node.y - NODE_RADIUS - 1 - propertiesSize / 2,
  );

  element.replaceChildren(connectAction, colorAction, deleteAction, propertiesAction);
}

/**
 * @param {SVGElement} element
 * @param {SukiGraph} graph
 * @param {SukiEdge} edge
 */
function renderSvgEdgeDeleteAction(element, graph, edge) {
  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  const target = graph.nodes.find((node) => node.id === edge.targetId);
  if (!source || !target) return;

  const width = 58;
  const height = 28;
  const gap = 8;
  const colorSize = 28;
  const propertiesSize = 28;
  const centerX = (source.x + target.x) / 2;
  const centerY = (source.y + target.y) / 2;
  const totalWidth = width + gap + colorSize + gap + propertiesSize;
  const x = centerX - totalWidth / 2;
  const y = centerY - height - 12;

  element.setAttribute("class", "suki-node-action suki-edge-action");
  delete element.dataset.action;
  element.dataset.id = edge.id;

  const deleteAction = svgElement("g");
  deleteAction.classList.add("suki-edge-delete-action");
  deleteAction.dataset.action = "delete";
  deleteAction.dataset.id = edge.id;

  const rect = svgElement("rect");
  rect.classList.add("suki-node-action-box");
  setAttributes(rect, { x, y, width, height, rx: 6 });

  const text = svgElement("text");
  text.classList.add("suki-node-action-label");
  setAttributes(text, {
    x: x + width / 2,
    y: y + height / 2,
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = "削除";
  deleteAction.append(rect, text);

  const colorAction = svgElement("g");
  colorAction.classList.add("suki-edge-color-action");
  colorAction.dataset.action = "change-edge-color";
  colorAction.dataset.id = edge.id;

  const title = svgElement("title");
  title.textContent = "色変更";
  const circle = svgElement("circle");
  circle.classList.add("suki-node-color-action-swatch");
  setAttributes(circle, {
    cx: x + width + gap + colorSize / 2,
    cy: y + colorSize / 2,
    r: colorSize / 2,
    fill: getEdgeColor(edge),
  });
  colorAction.append(title, circle);

  const propertiesX = x + width + gap + colorSize + gap;
  const propertiesAction = createSvgPropertiesAction(edge.id, propertiesX + propertiesSize / 2, y + propertiesSize / 2);

  element.replaceChildren(deleteAction, colorAction, propertiesAction);
}

/**
 * @param {SVGElement} element
 * @param {SukiGroup} group
 */
function renderSvgGroupAction(element, group) {
  const box = getGroupBox(group);
  const width = 58;
  const height = 28;
  const gap = 8;
  const colorSize = 28;
  const propertiesSize = 28;
  const totalWidth = width + gap + colorSize + gap + propertiesSize;
  const x = box.left + box.width / 2 - totalWidth / 2;
  const y = box.top + box.height + 12;

  element.setAttribute("class", "suki-node-action suki-group-action");
  delete element.dataset.action;
  element.dataset.id = group.id;

  const deleteAction = svgElement("g");
  deleteAction.classList.add("suki-group-delete-action");
  deleteAction.dataset.action = "delete";
  deleteAction.dataset.id = group.id;

  const rect = svgElement("rect");
  rect.classList.add("suki-node-action-box");
  setAttributes(rect, { x, y, width, height, rx: 6 });

  const text = svgElement("text");
  text.classList.add("suki-node-action-label");
  setAttributes(text, {
    x: x + width / 2,
    y: y + height / 2,
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = "削除";
  deleteAction.append(rect, text);

  const colorAction = svgElement("g");
  colorAction.classList.add("suki-group-color-action");
  colorAction.dataset.action = "change-group-color";
  colorAction.dataset.id = group.id;

  const title = svgElement("title");
  title.textContent = "色変更";
  const circle = svgElement("circle");
  circle.classList.add("suki-node-color-action-swatch");
  setAttributes(circle, {
    cx: x + width + gap + colorSize / 2,
    cy: y + colorSize / 2,
    r: colorSize / 2,
    fill: group.color,
  });
  colorAction.append(title, circle);

  const propertiesX = x + width + gap + colorSize + gap;
  const propertiesAction = createSvgPropertiesAction(group.id, propertiesX + propertiesSize / 2, y + propertiesSize / 2);

  element.replaceChildren(deleteAction, colorAction, propertiesAction);
}

/**
 * @param {SVGElement} element
 * @param {SukiGraph} graph
 * @param {SukiEdge} edge
 * @param {boolean} selected
 */
function renderSvgEdge(element, graph, edge, selected) {
  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  const target = graph.nodes.find((node) => node.id === edge.targetId);
  element.classList.add("suki-edge");
  element.classList.toggle("is-selected", selected);
  element.dataset.entityKind = "edge";
  element.dataset.id = edge.id;
  element.dataset.type = edge.type;
  element.id = edge.id;
  if (!source || !target) return;

  let line = element.querySelector(".suki-edge-line");
  if (!line) {
    line = svgElement("line");
    line.classList.add("suki-edge-line");
    element.append(line);
  }
  line.style.stroke = getEdgeColor(edge);
  setAttributes(line, {
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
  });
}

/**
 * @param {SVGElement} element
 * @param {SukiGraph} graph
 * @param {SukiEdge} edge
 */
function renderSvgEdgeHitArea(element, graph, edge) {
  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  const target = graph.nodes.find((node) => node.id === edge.targetId);
  element.classList.add("suki-edge-hit-area");
  element.dataset.entityKind = "edge";
  element.dataset.id = edge.id;
  element.dataset.type = edge.type;
  if (!source || !target) return;

  let hitLine = element.querySelector(".suki-edge-hit-line");
  if (!hitLine) {
    hitLine = svgElement("line");
    hitLine.classList.add("suki-edge-hit-line");
    element.append(hitLine);
  }
  setAttributes(hitLine, {
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
  });
}

/**
 * @param {SVGElement} element
 * @param {SukiGraph} graph
 * @param {SukiEdge} edge
 */
function renderSvgEdgeLabel(element, graph, edge) {
  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  const target = graph.nodes.find((node) => node.id === edge.targetId);
  element.classList.add("suki-edge-label-item");
  element.dataset.entityKind = "edge";
  element.dataset.id = edge.id;
  element.id = `${edge.id}-label`;
  if (!source || !target) return;

  const labelX = (source.x + target.x) / 2;
  const labelY = (source.y + target.y) / 2 + 14;
  const labelWidth = Math.max(34, edge.label.length * 14 + 18);
  const labelHeight = 24;
  let labelBackground = element.querySelector(".suki-edge-label-background");
  if (!labelBackground) {
    labelBackground = svgElement("rect");
    labelBackground.classList.add("suki-edge-label-background");
    element.append(labelBackground);
  }
  setAttributes(labelBackground, {
    x: labelX - labelWidth / 2,
    y: labelY - labelHeight / 2,
    width: labelWidth,
    height: labelHeight,
    rx: 6,
  });
  labelBackground.toggleAttribute("hidden", !edge.label);

  let label = element.querySelector(".suki-edge-label");
  if (!label) {
    label = svgElement("text");
    label.classList.add("suki-edge-label");
    element.append(label);
  }
  setAttributes(label, {
    x: labelX,
    y: labelY,
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  label.textContent = edge.label;
  label.toggleAttribute("hidden", !edge.label);
}

/**
 * @param {SVGElement} element
 * @param {{ x: number, y: number }} hint
 */
function renderSvgAddHint(element, hint) {
  element.setAttribute("class", "suki-add-hint");
  element.setAttribute("transform", `translate(${hint.x} ${hint.y})`);
  element.dataset.action = "add-node-at";
  element.dataset.x = String(hint.x);
  element.dataset.y = String(hint.y);

  const filterId = "suki-add-hint-blur";
  const defs = svgElement("defs");

  const filter = svgElement("filter");
  setAttributes(filter, { id: filterId, x: "-35%", y: "-35%", width: "170%", height: "170%" });
  const blur = svgElement("feGaussianBlur");
  setAttributes(blur, { stdDeviation: 1.8 });
  filter.append(blur);

  defs.append(filter);

  const disc = svgElement("circle");
  disc.classList.add("suki-add-hint-disc");
  setAttributes(disc, {
    cx: 0,
    cy: 0,
    r: ADD_HINT_RADIUS,
    filter: `url(#${filterId})`,
  });

  const plus = svgElement("g");
  plus.classList.add("suki-add-hint-plus");
  const vertical = svgElement("rect");
  setAttributes(vertical, { x: -4, y: -17, width: 8, height: 34, rx: 3 });
  const horizontal = svgElement("rect");
  setAttributes(horizontal, { x: -17, y: -4, width: 34, height: 8, rx: 3 });
  plus.append(vertical, horizontal);

  element.replaceChildren(defs, disc, plus);
}

/**
 * @param {string} name
 * @returns {any}
 */
function sukiElementConstructor(name) {
  const constructor = customElements.get(name);
  if (!constructor) throw new Error(`${name} is not defined.`);
  return constructor;
}

if (!customElements.get("suki-label")) customElements.define("suki-label", class extends HTMLElement {
  /**
   * @param {string} label
   * @returns {HTMLElement}
   */
  static fromLabel(label) {
    const element = document.createElement("suki-label");
    element.textContent = label;
    return element;
  }
});

if (!customElements.get("suki-node")) customElements.define("suki-node", class extends HTMLElement {
  /**
   * @param {SukiNode} node
   * @returns {HTMLElement}
   */
  static fromNode(node) {
    const element = document.createElement("suki-node");
    element.setAttribute("id", node.id);
    element.setAttribute("x", String(node.x));
    element.setAttribute("y", String(node.y));
    element.setAttribute("color", node.color);
    setOptionalAttribute(element, "group", node.groupId);
    element.append(sukiElementConstructor("suki-label").fromLabel(node.label));
    return element;
  }

  /**
   * @returns {SukiNode}
   */
  toGraphNode() {
    return {
      id: this.getAttribute("id") || makeId("node"),
      label: readLabelElementText(this),
      x: readNumberAttribute(this, "x", CANVAS_WORLD_WIDTH / 2),
      y: readNumberAttribute(this, "y", CANVAS_WORLD_HEIGHT / 2),
      groupId: this.getAttribute("group") || null,
      color: this.getAttribute("color") || NODE_PALETTE[0],
    };
  }

  /**
   * @param {SukiSvgExportContext} context
   * @returns {SVGElement}
   */
  toSvg(context) {
    const node = context.graph.nodes.find((item) => item.id === this.getAttribute("id")) || this.toGraphNode();
    const element = svgElement("g");
    renderSvgNode(element, node, false, false, 0);
    return element;
  }
});

if (!customElements.get("suki-group")) customElements.define("suki-group", class extends HTMLElement {
  /**
   * @param {SukiGroup} group
   * @param {number} memberCount
   * @returns {HTMLElement}
   */
  static fromGroup(group, memberCount) {
    const element = document.createElement("suki-group");
    element.setAttribute("id", group.id);
    element.setAttribute("color", group.color);
    element.append(sukiElementConstructor("suki-label").fromLabel(group.label));
    if (memberCount === 0) {
      element.setAttribute("x", String(group.x));
      element.setAttribute("y", String(group.y));
      element.setAttribute("width", String(group.width));
      element.setAttribute("height", String(group.height));
    }
    return element;
  }

  /**
   * @returns {SukiGroup}
   */
  toGraphGroup() {
    return {
      id: this.getAttribute("id") || makeId("group"),
      label: readLabelElementText(this),
      x: readNumberAttribute(this, "x", 0),
      y: readNumberAttribute(this, "y", 0),
      width: readNumberAttribute(this, "width", GROUP_MIN_WIDTH),
      height: readNumberAttribute(this, "height", GROUP_MIN_HEIGHT),
      color: this.getAttribute("color") || GROUP_PALETTE[0],
    };
  }

  /**
   * @param {SukiSvgExportContext} context
   * @returns {SVGElement}
   */
  toSvg(context) {
    const group = context.graph.groups.find((item) => item.id === this.getAttribute("id")) || this.toGraphGroup();
    const element = svgElement("g");
    renderSvgGroup(element, group, false, false, 0, 0);
    return element;
  }
});

if (!customElements.get("suki-edge")) customElements.define("suki-edge", class extends HTMLElement {
  /**
   * @param {SukiEdge} edge
   * @returns {HTMLElement}
   */
  static fromEdge(edge) {
    const element = document.createElement("suki-edge");
    element.setAttribute("id", edge.id);
    element.setAttribute("source", edge.sourceId);
    element.setAttribute("target", edge.targetId);
    if (edge.type !== "related") element.setAttribute("type", edge.type);
    if (edge.color !== DEFAULT_EDGE_COLOR) element.setAttribute("color", edge.color);
    if (edge.label) element.append(sukiElementConstructor("suki-label").fromLabel(edge.label));
    return element;
  }

  /**
   * @returns {SukiEdge}
   */
  toGraphEdge() {
    return {
      id: this.getAttribute("id") || makeId("edge"),
      sourceId: this.getAttribute("source") || "",
      targetId: this.getAttribute("target") || "",
      label: readLabelElementText(this),
      type: /** @type {SukiEdge["type"]} */ (this.getAttribute("type") || "related"),
      color: this.getAttribute("color") || DEFAULT_EDGE_COLOR,
    };
  }

  /**
   * @param {SukiSvgExportContext} context
   * @returns {SVGElement}
   */
  toSvg(context) {
    const edge = context.graph.edges.find((item) => item.id === this.getAttribute("id")) || this.toGraphEdge();
    const element = svgElement("g");
    renderSvgEdge(element, context.graph, edge, false);
    return element;
  }

  /**
   * @param {SukiSvgExportContext} context
   * @returns {SVGElement | null}
   */
  toSvgLabel(context) {
    const edge = context.graph.edges.find((item) => item.id === this.getAttribute("id")) || this.toGraphEdge();
    if (!edge.label) return null;
    const element = svgElement("g");
    renderSvgEdgeLabel(element, context.graph, edge);
    return element;
  }
});

if (!customElements.get("suki-graph")) customElements.define("suki-graph", class extends HTMLElement {
  /**
   * @param {SukiGraph} sourceGraph
   * @returns {HTMLElement}
   */
  static fromGraph(sourceGraph) {
    const graph = cloneGraph(sourceGraph);
    updateGroupGeometry(graph);

    const element = document.createElement("suki-graph");
    graph.groups.forEach((group) => {
      const groupElement = sukiElementConstructor("suki-group").fromGroup(group, getGroupMembers(graph, group.id).length);
      getGroupMembers(graph, group.id).forEach((node) => {
        const nodeElement = sukiElementConstructor("suki-node").fromNode(node);
        nodeElement.removeAttribute("group");
        groupElement.append(nodeElement);
      });
      element.append(groupElement);
    });
    graph.edges.forEach((edge) => {
      element.append(sukiElementConstructor("suki-edge").fromEdge(edge));
    });
    graph.nodes.filter((node) => !node.groupId).forEach((node) => {
      element.append(sukiElementConstructor("suki-node").fromNode(node));
    });
    return element;
  }

  /**
   * @returns {SukiGraph}
   */
  toGraph() {
    const groupedNodes = [...this.querySelectorAll(":scope > suki-group")].flatMap((groupElement) => {
      const groupId = groupElement.getAttribute("id") || "";
      return [...groupElement.querySelectorAll(":scope > suki-node")].map((nodeElement) => {
        const node = /** @type {any} */ (nodeElement).toGraphNode();
        node.groupId = groupId || node.groupId;
        return node;
      });
    });
    const graph = {
      groups: [...this.querySelectorAll(":scope > suki-group")].map((element) => {
        return /** @type {any} */ (element).toGraphGroup();
      }),
      edges: [...this.querySelectorAll(":scope > suki-edge")].map((element) => {
        return /** @type {any} */ (element).toGraphEdge();
      }),
      nodes: groupedNodes.concat([...this.querySelectorAll(":scope > suki-node")].map((element) => {
        return /** @type {any} */ (element).toGraphNode();
      })),
    };
    updateGroupGeometry(graph);
    return normalizeGraph(graph);
  }

  /**
   * @returns {string}
   */
  toMarkup() {
    return this.outerHTML;
  }

  /**
   * @returns {SVGSVGElement}
   */
  toSvgDocument() {
    const graph = this.toGraph();
    const context = { graphElement: this, graph };
    const viewBox = getGraphContentViewBox(graph);
    const svg = /** @type {SVGSVGElement} */ (svgElement("svg"));
    setAttributes(svg, {
      xmlns: SVG_NS,
      width: formatSvgNumber(viewBox.width),
      height: formatSvgNumber(viewBox.height),
      viewBox: `${formatSvgNumber(viewBox.x)} ${formatSvgNumber(viewBox.y)} ${formatSvgNumber(viewBox.width)} ${formatSvgNumber(viewBox.height)}`,
    });

    const style = svgElement("style");
    style.textContent = EXPORTED_SVG_STYLE;

    const viewport = svgElement("g");
    viewport.classList.add("suki-viewport");
    const groupsLayer = svgElement("g");
    groupsLayer.classList.add("suki-groups");
    const edgesLayer = svgElement("g");
    edgesLayer.classList.add("suki-edges");
    const nodesLayer = svgElement("g");
    nodesLayer.classList.add("suki-nodes");
    const edgeLabelsLayer = svgElement("g");
    edgeLabelsLayer.classList.add("suki-edge-labels");

    [...this.querySelectorAll(":scope > suki-group")].forEach((element) => {
      groupsLayer.append(/** @type {any} */ (element).toSvg(context));
    });
    [...this.querySelectorAll(":scope > suki-edge")].forEach((element) => {
      edgesLayer.append(/** @type {any} */ (element).toSvg(context));
    });
    [...this.querySelectorAll("suki-node")].forEach((element) => {
      nodesLayer.append(/** @type {any} */ (element).toSvg(context));
    });
    [...this.querySelectorAll(":scope > suki-edge")].forEach((element) => {
      const label = /** @type {any} */ (element).toSvgLabel(context);
      if (label) edgeLabelsLayer.append(label);
    });

    viewport.append(groupsLayer, edgesLayer, nodesLayer, edgeLabelsLayer);
    svg.append(style, viewport);
    svg.querySelectorAll("[data-entity-kind], [data-id], [data-x], [data-y], [data-width], [data-height]").forEach((element) => {
      ["data-entity-kind", "data-id", "data-x", "data-y", "data-width", "data-height"].forEach((name) => {
        element.removeAttribute(name);
      });
    });
    return svg;
  }
});

/**
 * @param {SukiGraph} sourceGraph
 * @returns {SVGSVGElement}
 */
function createExportSvg(sourceGraph) {
  return sukiElementConstructor("suki-graph").fromGraph(sourceGraph).toSvgDocument();
}

/**
 * @param {string} source
 * @returns {string}
 */
function prettyPrintSvg(source) {
  const tokens = source.replace(/></g, ">\n<").split("\n");
  let indent = 0;
  const lines = tokens.map((token) => token.trim()).filter(Boolean).map((token) => {
    const isClosing = token.startsWith("</");
    const isDeclaration = token.startsWith("<?");
    const isSelfClosing = token.endsWith("/>");
    const isTextOnly = !token.startsWith("<");
    if (isClosing) indent = Math.max(0, indent - 1);
    const line = `${"  ".repeat(indent)}${token}`;
    if (!isClosing && !isDeclaration && !isSelfClosing && !isTextOnly && !token.includes("</")) {
      indent += 1;
    }
    return line;
  });
  return `${lines.join("\n")}\n`;
}

const READONLY_HTML_SCRIPT = `
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const NODE_RADIUS = 44;
  const GROUP_MIN_WIDTH = 180;
  const GROUP_MIN_HEIGHT = 150;
  const GROUP_PADDING_X = 28;
  const GROUP_PADDING_TOP = 42;
  const GROUP_PADDING_BOTTOM = 24;
  const SVG_VIEWBOX_PADDING = 36;
  const DEFAULT_EDGE_COLOR = "#4f5653";

  function svgElement(name) {
    return document.createElementNS(SVG_NS, name);
  }

  function setAttributes(element, attributes) {
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  }

  function readNumber(element, name, fallback) {
    const value = Number(element.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function readLabel(element) {
    return element.querySelector(":scope > suki-label")?.textContent || element.getAttribute("label") || "";
  }

  function labelLines(text) {
    const lines = text.split(/\\r?\\n/);
    return lines.length ? lines : [""];
  }

  function groupMembers(graph, id) {
    return graph.nodes.filter((node) => node.groupId === id);
  }

  function groupGeometry(members) {
    if (!members.length) return { x: 0, y: 0, width: GROUP_MIN_WIDTH, height: GROUP_MIN_HEIGHT };
    const minX = Math.min(...members.map((node) => node.x - NODE_RADIUS));
    const maxX = Math.max(...members.map((node) => node.x + NODE_RADIUS));
    const minY = Math.min(...members.map((node) => node.y - NODE_RADIUS));
    const maxY = Math.max(...members.map((node) => node.y + NODE_RADIUS));
    const left = minX - GROUP_PADDING_X;
    const top = minY - GROUP_PADDING_TOP;
    const width = Math.max(GROUP_MIN_WIDTH, maxX - minX + GROUP_PADDING_X * 2);
    const height = Math.max(GROUP_MIN_HEIGHT, maxY - minY + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM);
    return { x: left + width / 2, y: top + height / 2, width, height };
  }

  function updateGroups(graph) {
    graph.groups.forEach((group) => {
      const members = groupMembers(graph, group.id);
      if (members.length) Object.assign(group, groupGeometry(members));
    });
  }

  function groupBox(group) {
    const width = group.width || GROUP_MIN_WIDTH;
    const height = group.height || GROUP_MIN_HEIGHT;
    return { left: group.x - width / 2, top: group.y - height / 2, width, height };
  }

  function includeBounds(bounds, box) {
    if (!bounds) return { ...box };
    return {
      left: Math.min(bounds.left, box.left),
      top: Math.min(bounds.top, box.top),
      right: Math.max(bounds.right, box.right),
      bottom: Math.max(bounds.bottom, box.bottom),
    };
  }

  function graphViewBox(graph) {
    let bounds = null;
    graph.groups.forEach((group) => {
      const box = groupBox(group);
      bounds = includeBounds(bounds, { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height });
    });
    graph.nodes.forEach((node) => {
      bounds = includeBounds(bounds, { left: node.x - NODE_RADIUS, top: node.y - NODE_RADIUS, right: node.x + NODE_RADIUS, bottom: node.y + NODE_RADIUS });
    });
    graph.edges.forEach((edge) => {
      const source = graph.nodes.find((node) => node.id === edge.sourceId);
      const target = graph.nodes.find((node) => node.id === edge.targetId);
      if (!source || !target) return;
      const strokePadding = edge.type === "strong" ? 8 : 5;
      bounds = includeBounds(bounds, {
        left: Math.min(source.x, target.x) - strokePadding,
        top: Math.min(source.y, target.y) - strokePadding,
        right: Math.max(source.x, target.x) + strokePadding,
        bottom: Math.max(source.y, target.y) + strokePadding,
      });
      if (!edge.label) return;
      const labelX = (source.x + target.x) / 2;
      const labelY = (source.y + target.y) / 2 + 14;
      const labelWidth = Math.max(34, edge.label.length * 14 + 18);
      const labelHeight = 24;
      bounds = includeBounds(bounds, {
        left: labelX - labelWidth / 2,
        top: labelY - labelHeight / 2,
        right: labelX + labelWidth / 2,
        bottom: labelY + labelHeight / 2,
      });
    });
    if (!bounds) return { x: 0, y: 0, width: 1, height: 1 };
    return {
      x: bounds.left - SVG_VIEWBOX_PADDING,
      y: bounds.top - SVG_VIEWBOX_PADDING,
      width: Math.max(1, bounds.right - bounds.left + SVG_VIEWBOX_PADDING * 2),
      height: Math.max(1, bounds.bottom - bounds.top + SVG_VIEWBOX_PADDING * 2),
    };
  }

  function graphFromElement(root) {
    const graphElement = root.querySelector(":scope > suki-graph");
    if (!graphElement) return { groups: [], nodes: [], edges: [] };
    const groupedNodes = [...graphElement.querySelectorAll(":scope > suki-group")].flatMap((groupElement) => {
      const groupId = groupElement.getAttribute("id") || "";
      return [...groupElement.querySelectorAll(":scope > suki-node")].map((nodeElement) => ({
        id: nodeElement.getAttribute("id") || "",
        label: readLabel(nodeElement),
        x: readNumber(nodeElement, "x", 0),
        y: readNumber(nodeElement, "y", 0),
        color: nodeElement.getAttribute("color") || "#ffffff",
        groupId,
      }));
    });
    const looseNodes = [...graphElement.querySelectorAll(":scope > suki-node")].map((nodeElement) => ({
      id: nodeElement.getAttribute("id") || "",
      label: readLabel(nodeElement),
      x: readNumber(nodeElement, "x", 0),
      y: readNumber(nodeElement, "y", 0),
      color: nodeElement.getAttribute("color") || "#ffffff",
      groupId: null,
    }));
    const graph = {
      groups: [...graphElement.querySelectorAll(":scope > suki-group")].map((groupElement) => ({
        id: groupElement.getAttribute("id") || "",
        label: readLabel(groupElement),
        x: readNumber(groupElement, "x", 0),
        y: readNumber(groupElement, "y", 0),
        width: readNumber(groupElement, "width", GROUP_MIN_WIDTH),
        height: readNumber(groupElement, "height", GROUP_MIN_HEIGHT),
        color: groupElement.getAttribute("color") || "#5fb2cb",
      })),
      nodes: groupedNodes.concat(looseNodes),
      edges: [...graphElement.querySelectorAll(":scope > suki-edge")].map((edgeElement) => ({
        id: edgeElement.getAttribute("id") || "",
        sourceId: edgeElement.getAttribute("source") || "",
        targetId: edgeElement.getAttribute("target") || "",
        label: readLabel(edgeElement),
        type: edgeElement.getAttribute("type") || "related",
        color: edgeElement.getAttribute("color") || DEFAULT_EDGE_COLOR,
      })),
    };
    updateGroups(graph);
    return graph;
  }

  function renderGraph(graph) {
    const viewBox = graphViewBox(graph);
    const svg = svgElement("svg");
    setAttributes(svg, {
      xmlns: SVG_NS,
      width: Number(viewBox.width.toFixed(2)),
      height: Number(viewBox.height.toFixed(2)),
      viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map((value) => Number(value.toFixed(2))).join(" "),
    });

    const groupsLayer = svgElement("g");
    const edgesLayer = svgElement("g");
    const nodesLayer = svgElement("g");
    const labelsLayer = svgElement("g");

    graph.groups.forEach((group) => {
      const box = groupBox(group);
      const g = svgElement("g");
      g.id = group.id;
      const rect = svgElement("rect");
      setAttributes(rect, { x: box.left, y: box.top, width: box.width, height: box.height, rx: 8, fill: group.color, stroke: group.color, "stroke-width": 2, "fill-opacity": 0.22 });
      const text = svgElement("text");
      setAttributes(text, { x: box.left + 14, y: box.top + 28, fill: "#24342f", "font-family": "system-ui, sans-serif", "font-size": 15, "font-weight": 700 });
      labelLines(group.label).forEach((line, index) => {
        const tspan = svgElement("tspan");
        setAttributes(tspan, { x: box.left + 14, dy: index === 0 ? 0 : "1.25em" });
        tspan.textContent = line || " ";
        text.append(tspan);
      });
      g.append(rect, text);
      groupsLayer.append(g);
    });

    graph.edges.forEach((edge) => {
      const source = graph.nodes.find((node) => node.id === edge.sourceId);
      const target = graph.nodes.find((node) => node.id === edge.targetId);
      if (!source || !target) return;
      const g = svgElement("g");
      g.id = edge.id;
      const line = svgElement("line");
      setAttributes(line, { x1: source.x, y1: source.y, x2: target.x, y2: target.y, stroke: edge.color, "stroke-width": edge.type === "strong" ? 8 : 5, "stroke-linecap": "round" });
      g.append(line);
      edgesLayer.append(g);
      if (!edge.label) return;
      const labelX = (source.x + target.x) / 2;
      const labelY = (source.y + target.y) / 2 + 14;
      const labelWidth = Math.max(34, edge.label.length * 14 + 18);
      const labelGroup = svgElement("g");
      labelGroup.id = edge.id + "-label";
      const background = svgElement("rect");
      setAttributes(background, { x: labelX - labelWidth / 2, y: labelY - 12, width: labelWidth, height: 24, rx: 6, fill: "#ffffff" });
      const text = svgElement("text");
      setAttributes(text, { x: labelX, y: labelY, "text-anchor": "middle", "dominant-baseline": "central", fill: "#172026", "font-family": "system-ui, sans-serif", "font-size": 13, "font-weight": 700 });
      text.textContent = edge.label;
      labelGroup.append(background, text);
      labelsLayer.append(labelGroup);
    });

    graph.nodes.forEach((node) => {
      const g = svgElement("g");
      g.id = node.id;
      setAttributes(g, { transform: "translate(" + node.x + " " + node.y + ")" });
      const circle = svgElement("circle");
      setAttributes(circle, { cx: 0, cy: 0, r: NODE_RADIUS, fill: node.color, stroke: "#9baaa4", "stroke-width": 2 });
      const text = svgElement("text");
      setAttributes(text, { x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "central", fill: "#172026", "font-family": "system-ui, sans-serif", "font-size": 34, "font-weight": 700 });
      text.textContent = node.label;
      g.append(circle, text);
      nodesLayer.append(g);
    });

    svg.append(groupsLayer, edgesLayer, nodesLayer, labelsLayer);
    return svg;
  }

  ["suki-label", "suki-graph", "suki-group", "suki-node", "suki-edge"].forEach((name) => {
    if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
  });

  if (!customElements.get("suki-circle")) customElements.define("suki-circle", class extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered) return;
      this.dataset.rendered = "true";
      this.replaceChildren(renderGraph(graphFromElement(this)));
    }
  });
})();
`;

/**
 * @param {string} documentName
 * @param {string} circleMarkup
 * @returns {string}
 */
function createReadonlyHtml(documentName, circleMarkup) {
  const script = READONLY_HTML_SCRIPT.replace(/<\/script/gi, "<\\/script");
  const title = escapeHtml(documentName || "スキサークル");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
body {
  margin: 0;
  padding: 1rem;
  background: #f8fbfa;
  color: #172026;
  font-family: system-ui, sans-serif;
}
suki-circle {
  display: grid;
  min-block-size: calc(100dvh - 2rem);
  place-items: center;
}
suki-circle > suki-graph {
  display: none;
}
suki-circle svg {
  display: block;
  max-inline-size: 100%;
  max-block-size: calc(100dvh - 2rem);
  inline-size: auto;
  block-size: auto;
}
</style>
</head>
<body>
${circleMarkup}
<script>
${script}
</script>
</body>
</html>
`;
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("画像を生成できませんでした。")), { once: true });
    image.src = url;
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} quality
 * @returns {Promise<Blob | null>}
 */
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

if (!customElements.get("suki-circle")) customElements.define("suki-circle", class extends HTMLElement {
  constructor() {
    super();

    /** @type {SukiGraph} */
    this.graph = {
      groups: [
        { id: "group-5f2a9c1", label: "デザイン", x: 1430, y: 1040, width: GROUP_MIN_WIDTH, height: GROUP_MIN_HEIGHT, color: GROUP_PALETTE[0] },
        { id: "group-a18d4e2", label: "人", x: 1740, y: 1080, width: GROUP_MIN_WIDTH, height: GROUP_MIN_HEIGHT, color: GROUP_PALETTE[1] },
      ],
      nodes: [
        { id: "node-98ed003", label: "U", x: 1375, y: 1005, groupId: "group-5f2a9c1", color: NODE_PALETTE[1] },
        { id: "node-74b0a6f", label: "色", x: 1490, y: 1070, groupId: "group-5f2a9c1", color: NODE_PALETTE[2] },
        { id: "node-c31e8b4", label: "自", x: 1700, y: 1040, groupId: "group-a18d4e2", color: NODE_PALETTE[3] },
        { id: "node-0d9fa73", label: "友", x: 1800, y: 1110, groupId: "group-a18d4e2", color: NODE_PALETTE[4] },
      ],
      edges: [
        { id: "edge-e4a19c8", sourceId: "node-98ed003", targetId: "node-c31e8b4", label: "", type: "related", color: DEFAULT_EDGE_COLOR },
      ],
    };

    this.documentName = "スキサークル";
    /** @type {string | null} */
    this.selectedId = null;
    /** @type {string | null} */
    this.pendingConnectionId = null;
    /** @type {string | null} */
    this.visibleNodeActionId = null;
    /** @type {string | null} */
    this.pointerDownSelectedId = null;
    /** @type {string | null} */
    this.suppressNextEntityClickId = null;
    updateGroupGeometry(this.graph);

    /** @type {{ documentName: string, graph: SukiGraph, selectedId: string | null, pendingConnectionId: string | null, visibleNodeActionId: string | null, viewBox: { x: number, y: number, width: number, height: number, initialized: boolean } }[]} */
    this.undoStack = [];
    /** @type {{ id: string, startX: number, startY: number, previousX: number, previousY: number, previousTime: number, lastSpeed: number, startTime: number, entityX: number, entityY: number, memberStarts: { id: string, x: number, y: number }[], originalGroupId: string | null, originalGroupBox: { left: number, top: number, width: number, height: number } | null, groupBoxes: { id: string, left: number, top: number, width: number, height: number }[], proposedGroupNodeId: string | null, ejected: boolean, active: boolean, historySaved: boolean } | null} */
    this.drag = null;
    /** @type {{ x: number, y: number, width: number, height: number, initialized: boolean }} */
    this.viewBox = { x: 0, y: 0, width: 0, height: 0, initialized: false };
    /** @type {{ startX: number, startY: number, viewX: number, viewY: number, moved: boolean } | null} */
    this.pan = null;
    /** @type {{ x: number, y: number } | null} */
    this.addHint = null;
    this.suppressNextCanvasClick = false;
    /** @type {{ time: number, x: number, y: number } | null} */
    this.lastCanvasTap = null;
    /** @type {string | null} */
    this.editingNodeId = null;
    /** @type {{ id: string, time: number, x: number, y: number, count: number } | null} */
    this.lastNodeTap = null;
    this.suppressNextClickAfterEditing = false;
    /** @type {ResizeObserver | null} */
    this.resizeObserver = null;
    this.recreateCanvasNextRender = false;
    this.urlHashUpdateScheduled = false;
  }

  connectedCallback() {
    const urlInitialState = readInitialStateFromLocation();
    this.documentName = urlInitialState?.documentName || this.readInitialDocumentNameFromMarkup();
    const initialGraph = urlInitialState?.graph || this.readInitialGraphFromMarkup();
    if (initialGraph) {
      this.graph = initialGraph;
      this.selectedId = null;
      updateGroupGeometry(this.graph);
    }

    this.innerHTML = `
      <section class="suki-shell" aria-label="スキサークル">
        <header class="suki-toolbar">
          <input class="suki-document-name" name="documentName" data-action="document-name" aria-label="ドキュメント名" />
          <button type="button" data-action="layout">自動配置</button>
          <button type="button" data-action="export-svg">共有とエクスポート</button>
        </header>
        <div class="suki-workspace">
          <svg class="suki-canvas" tabindex="0" aria-label="相関図キャンバス" xmlns="${SVG_NS}">
            <g class="suki-viewport">
              <g class="suki-groups"></g>
              <g class="suki-edges"></g>
              <g class="suki-edge-hit-areas"></g>
              <g class="suki-nodes"></g>
              <g class="suki-edge-labels"></g>
              <g class="suki-node-actions"></g>
            </g>
          </svg>
          <div class="suki-node-editor" contenteditable="true" role="textbox" aria-label="文字編集" hidden></div>
          <input class="suki-node-color-input" type="color" data-action="node-color-picker" aria-label="色変更" />
          <dialog class="suki-properties-dialog" aria-label="プロパティ">
            <form class="suki-form" method="dialog" hidden>
              <div class="suki-dialog-header">
                <h2>プロパティ</h2>
                <button type="button" data-action="close-properties" aria-label="閉じる">×</button>
              </div>
              <div class="suki-id-field"><span>ID</span><output name="entityId"></output></div>
              <label class="suki-label-field"><span>名前</span><input name="label" /></label>
              <label>色<input name="color" type="color" /></label>
              <label class="suki-group-field">所属<select name="groupId"></select></label>
              <button type="button" data-action="delete">削除</button>
            </form>
            <div class="suki-empty">要素を選択してください</div>
          </dialog>
          <dialog class="suki-svg-preview-dialog" aria-label="SVG画像">
            <div class="suki-dialog-header">
              <h2>SVG画像</h2>
              <button type="button" data-action="close-svg-preview" aria-label="閉じる">×</button>
            </div>
            <div class="suki-svg-preview-actions">
              <button type="button" data-action="download-jpeg-preview">JPEG保存</button>
              <button type="button" data-action="download-html-preview">HTML保存</button>
              <button type="button" data-action="download-svg-preview">SVG保存</button>
            </div>
            <div class="suki-svg-preview"></div>
          </dialog>
        </div>
        <button class="suki-undo-button" type="button" data-action="undo">元に戻す</button>
      </section>
    `;

    this.addEventListener("click", this);
    this.addEventListener("input", this);
    this.addEventListener("pointerdown", this);
    window.addEventListener("pointermove", this);
    window.addEventListener("pointerup", this);
    this.resizeObserver = new ResizeObserver(() => {
      this.updateCanvasViewBox();
    });
    this.resizeObserver.observe(this.getCanvas());
    this.syncDocumentNameInput();
    this.render();
  }

  /**
   * @returns {SukiGraph | null}
   */
  readInitialGraphFromMarkup() {
    const graphElement = this.querySelector(":scope > suki-graph");
    if (!graphElement) return null;
    if (typeof /** @type {{ toGraph?: unknown }} */ (graphElement).toGraph !== "function") return null;
    return /** @type {any} */ (graphElement).toGraph();
  }

  /**
   * @returns {string}
   */
  readInitialDocumentNameFromMarkup() {
    return this.getAttribute("title")?.trim() || "スキサークル";
  }

  disconnectedCallback() {
    window.removeEventListener("pointermove", this);
    window.removeEventListener("pointerup", this);
    this.resizeObserver?.disconnect();
    this.clearAddHint();
  }

  /**
   * @param {Event} event
   */
  handleEvent(event) {
    if (event.type === "click") this.onClick(event);
    if (event.type === "input") this.onInput(event);
    if (event.type === "pointerdown") this.onPointerDown(event);
    if (event.type === "pointermove") this.onPointerMove(event);
    if (event.type === "pointerup") this.onPointerUp(event);
  }

  /**
   * @param {Event} event
   */
  onClick(event) {
    const target = /** @type {Element} */ (event.target);
    if (target.closest(".suki-node-editor")) return;
    if (this.suppressNextClickAfterEditing) {
      this.suppressNextClickAfterEditing = false;
      return;
    }

    const actionButton = target.closest("[data-action]");
    const entity = target.closest("[data-entity-kind]");

    if (this.suppressNextCanvasClick && target.closest(".suki-canvas") && !actionButton && !entity) {
      this.suppressNextCanvasClick = false;
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "start-connect") {
      this.startConnectionFromSelectedNode();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "change-node-color") {
      this.openNodeColorPicker(actionButton.dataset.id || null, actionButton);
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "change-edge-color") {
      this.openEdgeColorPicker(actionButton.dataset.id || null, actionButton);
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "change-group-color") {
      this.openGroupColorPicker(actionButton.dataset.id || null, actionButton);
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "open-properties") {
      this.selectedId = actionButton.dataset.id || this.selectedId;
      this.visibleNodeActionId = null;
      this.openPropertiesDialog();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "close-properties") {
      this.closePropertiesDialog();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "close-svg-preview") {
      this.closeSvgPreviewDialog();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "download-svg-preview") {
      this.downloadSvgPreview();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "download-html-preview") {
      this.downloadReadonlyHtml();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "download-jpeg-preview") {
      this.downloadJpegPreview();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "undo") {
      this.undo();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "add-node-at") {
      const x = Number(actionButton.dataset.x);
      const y = Number(actionButton.dataset.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.clearAddHint();
        this.addNodeAt(x, y);
      }
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "delete-node") {
      this.selectedId = actionButton.dataset.id || this.selectedId;
      this.deleteSelected();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "layout") {
      this.updateCanvasViewBox();
      this.pushUndoSnapshot();
      this.graph = autoLayout(this.graph, {
        x: this.viewBox.x,
        y: this.viewBox.y,
        width: this.viewBox.width,
        height: this.viewBox.height,
      });
      this.render();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "export-svg") {
      this.openSvgPreviewDialog();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "delete") {
      this.selectedId = actionButton.dataset.id || this.selectedId;
      this.deleteSelected();
      return;
    }

    if (entity instanceof SVGElement && entity.dataset.id) {
      if (this.suppressNextEntityClickId === entity.dataset.id) {
        this.suppressNextEntityClickId = null;
        return;
      }
      this.lastCanvasTap = null;
      this.lastNodeTap = null;
      this.selectEntity(entity.dataset.id);
      return;
    }

    if (target.closest(".suki-canvas")) {
      if (this.suppressNextCanvasClick) {
        this.suppressNextCanvasClick = false;
        return;
      }
      this.onCanvasClick(/** @type {PointerEvent} */ (event));
    }
  }

  /**
   * @param {Event} event
   */
  onInput(event) {
    const input = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
    if (input instanceof HTMLInputElement && input.dataset.action === "document-name") {
      this.pushUndoSnapshot();
      this.documentName = input.value;
      document.title = this.documentName || "スキサークル";
      return;
    }

    if (input instanceof HTMLInputElement && input.dataset.action === "node-color-picker") {
      this.applyPickedColor(input);
      return;
    }

    const entity = this.selectedId ? findEntity(this.graph, this.selectedId) : null;
    if (!entity || !input.name) return;

    this.pushUndoSnapshot();
    if (input.name === "label") {
      const kind = getEntityKind(this.graph, entity);
      entity.label = kind === "node" ? input.value.trim().slice(0, 1) : input.value;
    }
    if (input.name === "color") {
      const kind = getEntityKind(this.graph, entity);
      if (kind === "edge") {
        /** @type {SukiEdge} */ (entity).color = input.value;
      } else if ("color" in entity) {
        entity.color = input.value;
      }
    }
    if (input.name === "groupId" && "groupId" in entity) entity.groupId = input.value || null;
    this.render();
  }

  /**
   * @param {Event} event
   */
  onPointerDown(event) {
    const pointer = /** @type {PointerEvent} */ (event);
    const target = /** @type {Element} */ (event.target);
    if (this.editingNodeId) {
      if (target.closest(".suki-node-editor")) return;
      pointer.preventDefault();
      this.commitNodeEditing();
      this.suppressNextClickAfterEditing = true;
      return;
    }

    const actionButton = target.closest("[data-action]");
    const entityElement = target.closest("[data-entity-kind]");
    this.pointerDownSelectedId = null;
    if (this.pendingConnectionId) {
      if (entityElement instanceof SVGElement && entityElement.dataset.id) {
        const node = this.graph.nodes.find((item) => item.id === entityElement.dataset.id);
        pointer.preventDefault();
        if (node) {
          this.selectEntity(entityElement.dataset.id);
        } else {
          this.pendingConnectionId = null;
          this.visibleNodeActionId = null;
          this.render();
        }
        return;
      }
      if (target.closest(".suki-canvas") && !actionButton) {
        pointer.preventDefault();
        this.pendingConnectionId = null;
        this.visibleNodeActionId = null;
        this.render();
      }
      return;
    }
    if (!(entityElement instanceof SVGElement) || !entityElement.dataset.id) {
      if (target.closest(".suki-canvas") && !entityElement && !actionButton) {
        this.lastNodeTap = null;
        this.startCanvasPan(pointer);
      }
      return;
    }

    const entity = findEntity(this.graph, entityElement.dataset.id);
    if (!entity) return;
    this.clearAddHint();
    const entityKind = getEntityKind(this.graph, entity);
    if (entityKind === "edge") {
      pointer.preventDefault();
      this.suppressNextEntityClickId = entity.id;
      if (this.consumeNodeEditTap(entity.id, pointer.clientX, pointer.clientY)) {
        this.startNodeEditing(entity.id);
      } else {
        this.selectEntity(entity.id);
      }
      return;
    }

    pointer.preventDefault();
    if ((entityKind === "node" || entityKind === "group") && this.consumeNodeEditTap(entity.id, pointer.clientX, pointer.clientY)) {
      this.startNodeEditing(entity.id);
      return;
    }

    entityElement.setPointerCapture(pointer.pointerId);
    this.pointerDownSelectedId = this.selectedId;
    const entityIsNode = entityKind === "node";
    this.visibleNodeActionId = entityIsNode && this.selectedId === entity.id ? entity.id : null;
    const originalGroup = "groupId" in entity && entity.groupId
      ? this.graph.groups.find((group) => group.id === entity.groupId) || null
      : null;
    this.selectedId = entity.id;
    this.drag = {
      id: entity.id,
      startX: pointer.clientX,
      startY: pointer.clientY,
      previousX: pointer.clientX,
      previousY: pointer.clientY,
      previousTime: performance.now(),
      lastSpeed: 0,
      startTime: performance.now(),
      entityX: entity.x,
      entityY: entity.y,
      memberStarts: getEntityKind(this.graph, entity) === "group"
        ? getGroupMembers(this.graph, entity.id).map((node) => ({ id: node.id, x: node.x, y: node.y }))
        : [],
      originalGroupId: originalGroup?.id || null,
      originalGroupBox: originalGroup ? getGroupBox(originalGroup) : null,
      groupBoxes: this.graph.groups.map((group) => ({ id: group.id, ...getGroupBox(group) })),
      proposedGroupNodeId: null,
      ejected: false,
      active: false,
      historySaved: false,
    };
    this.render();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  applyDragUpdate(clientX, clientY) {
    if (!this.drag) return;

    const entity = findEntity(this.graph, this.drag.id);
    if (!entity) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - this.drag.previousTime);
    this.drag.lastSpeed = Math.hypot(clientX - this.drag.previousX, clientY - this.drag.previousY) / elapsed;
    this.drag.previousX = clientX;
    this.drag.previousY = clientY;
    this.drag.previousTime = now;

    const dx = clientX - this.drag.startX;
    const dy = clientY - this.drag.startY;
    if (!this.drag.active) {
      if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD) return;
      this.drag.active = true;
      if (!this.drag.historySaved) {
        this.pushUndoSnapshot();
        this.drag.historySaved = true;
      }
      this.visibleNodeActionId = null;
      this.pointerDownSelectedId = null;
      this.suppressNextCanvasClick = true;
    }

    entity.x = this.drag.entityX + dx;
    entity.y = this.drag.entityY + dy;
    this.drag.memberStarts.forEach((start) => {
      const node = this.graph.nodes.find((item) => item.id === start.id);
      if (!node) return;
      node.x = start.x + dx;
      node.y = start.y + dy;
    });
    const membershipChanged = this.updateDraggedNodeMembership(entity);
    this.updateDraftGroupCandidate(entity);
    this.render({ freezeGroups: membershipChanged });
    if (membershipChanged) this.render();
  }

  /**
   * @param {SukiEntity} entity
   * @returns {boolean}
   */
  updateDraggedNodeMembership(entity) {
    if (!this.drag || !("groupId" in entity)) {
      return false;
    }

    const containingGroupBox = this.drag.groupBoxes.find((box) => {
      return isPointInsideBox(box, entity.x, entity.y);
    });
    if (containingGroupBox && !entity.groupId) {
      entity.groupId = containingGroupBox.id;
      this.drag.ejected = false;
      return true;
    }

    if (
      !this.drag.ejected
      && entity.groupId
      && this.drag.originalGroupId
      && this.drag.originalGroupBox
      && this.drag.lastSpeed >= NODE_EJECT_SPEED
      && !isPointInsideBox(this.drag.originalGroupBox, entity.x, entity.y, NODE_EJECT_MARGIN)
    ) {
      if (getGroupMembers(this.graph, entity.groupId).length <= 1) return false;
      entity.groupId = null;
      this.drag.ejected = true;
      return true;
    }

    return false;
  }

  /**
   * @param {SukiEntity} entity
   */
  updateDraftGroupCandidate(entity) {
    if (!this.drag || !("groupId" in entity)) return;
    if (entity.groupId) {
      this.drag.proposedGroupNodeId = null;
      return;
    }

    const nearest = this.graph.nodes
      .filter((node) => node.id !== entity.id && !node.groupId)
      .map((node) => ({
        node,
        distance: Math.hypot(node.x - entity.x, node.y - entity.y),
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.node.id.localeCompare(right.node.id);
      })[0];

    this.drag.proposedGroupNodeId = nearest && nearest.distance <= NODE_SIZE
      ? nearest.node.id
      : null;
  }

  commitDraftGroup() {
    if (!this.drag?.proposedGroupNodeId) return;

    const draggedNode = this.graph.nodes.find((node) => node.id === this.drag?.id);
    const pairedNode = this.graph.nodes.find((node) => node.id === this.drag?.proposedGroupNodeId);
    if (!draggedNode || !pairedNode || draggedNode.groupId || pairedNode.groupId) return;
    if (Math.hypot(pairedNode.x - draggedNode.x, pairedNode.y - draggedNode.y) > NODE_SIZE) return;
    if (!this.drag.historySaved) {
      this.pushUndoSnapshot();
      this.drag.historySaved = true;
    }

    const group = {
      id: makeUniqueId(this.graph, "group"),
      label: `グループ${this.graph.groups.length + 1}`,
      x: 0,
      y: 0,
      width: GROUP_MIN_WIDTH,
      height: GROUP_MIN_HEIGHT,
      color: GROUP_PALETTE[this.graph.groups.length % GROUP_PALETTE.length],
    };
    this.graph.groups.push(group);
    draggedNode.groupId = group.id;
    pairedNode.groupId = group.id;
    Object.assign(group, getGroupGeometryForMembers([draggedNode, pairedNode]));
    this.selectedId = group.id;
    this.visibleNodeActionId = null;
  }

  /**
   * @param {Event} event
   */
  onPointerMove(event) {
    const pointer = /** @type {PointerEvent} */ (event);
    if (this.pan) {
      this.applyCanvasPan(pointer.clientX, pointer.clientY);
      return;
    }
    if (!this.drag) return;

    this.applyDragUpdate(pointer.clientX, pointer.clientY);
  }

  /**
   * @param {Event} event
   */
  onPointerUp(event) {
    const pointer = /** @type {PointerEvent} */ (event);
    if (this.pan) {
      this.applyCanvasPan(pointer.clientX, pointer.clientY);
      this.suppressNextCanvasClick = this.pan.moved;
      this.pan = null;
      this.getCanvas().classList.remove("is-panning");
      return;
    }
    if (!this.drag) return;

    this.applyDragUpdate(pointer.clientX, pointer.clientY);
    if (this.drag.active) {
      this.commitDraftGroup();
      this.pointerDownSelectedId = null;
      this.suppressNextCanvasClick = true;
    } else {
      this.suppressNextEntityClickId = this.drag.id;
      this.pointerDownSelectedId = null;
      this.drag = null;
      return;
    }
    this.pointerDownSelectedId = null;
    this.drag = null;
    this.render();
  }

  /**
   * @param {PointerEvent} pointer
   */
  startCanvasPan(pointer) {
    this.startCanvasPanFrom(pointer, pointer.clientX, pointer.clientY);
  }

  /**
   * @param {PointerEvent} pointer
   * @param {number} startX
   * @param {number} startY
   */
  startCanvasPanFrom(pointer, startX, startY) {
    const canvas = this.getCanvas();
    this.updateCanvasViewBox();
    pointer.preventDefault();
    canvas.setPointerCapture(pointer.pointerId);
    canvas.classList.add("is-panning");
    this.pan = {
      startX,
      startY,
      viewX: this.viewBox.x,
      viewY: this.viewBox.y,
      moved: false,
    };
  }

  clearAddHint() {
    this.addHint = null;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  applyCanvasPan(clientX, clientY) {
    if (!this.pan) return;

    const canvas = this.getCanvas();
    const scaleX = this.viewBox.width / Math.max(1, canvas.clientWidth);
    const scaleY = this.viewBox.height / Math.max(1, canvas.clientHeight);
    const dx = clientX - this.pan.startX;
    const dy = clientY - this.pan.startY;
    if (!this.pan.moved && Math.hypot(dx, dy) < DRAG_START_THRESHOLD) return;
    if (!this.pan.moved) {
      this.pan.moved = true;
      this.suppressNextCanvasClick = true;
    }

    this.viewBox.x = this.clampViewBoxX(this.pan.viewX - dx * scaleX);
    this.viewBox.y = this.clampViewBoxY(this.pan.viewY - dy * scaleY);
    this.applyCanvasViewBox();
  }

  /**
   * @param {PointerEvent} event
   */
  onCanvasClick(event) {
    if (this.pendingConnectionId) {
      this.pendingConnectionId = null;
      this.lastCanvasTap = null;
      this.clearAddHint();
      this.render();
      return;
    }

    const point = this.getCanvasPoint(event);
    this.selectedId = null;
    this.pendingConnectionId = null;
    this.visibleNodeActionId = null;
    this.lastCanvasTap = null;
    this.addHint = { x: point.x, y: point.y };
    this.render();
  }

  /**
   * @param {string} id
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  consumeNodeEditTap(id, x, y) {
    const now = performance.now();
    const previous = this.lastNodeTap;
    if (!previous || previous.id !== id) {
      this.lastNodeTap = { id, time: now, x, y, count: 1 };
      return false;
    }

    const elapsed = now - previous.time;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    if (elapsed > DOUBLE_TAP_MS || distance > DOUBLE_TAP_DISTANCE) {
      this.lastNodeTap = { id, time: now, x, y, count: 1 };
      return false;
    }

    const count = previous.count + 1;
    this.lastNodeTap = { id, time: now, x, y, count };
    if (count < NODE_EDIT_TAP_COUNT) return false;

    this.lastNodeTap = null;
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  addNodeAt(x, y) {
    const group = this.findGroupAt(x, y);
    this.pushUndoSnapshot();
    const node = {
      id: makeUniqueId(this.graph, "node"),
      label: randomNodeLabel(),
      x,
      y,
      groupId: group?.id || null,
      color: randomPastelColor(),
    };
    this.graph.nodes.push(node);
    this.selectedId = node.id;
    this.visibleNodeActionId = null;
    this.lastCanvasTap = null;
    this.clearAddHint();
    this.render();
  }

  /**
   * @param {string} id
   */
  selectEntity(id) {
    const node = this.graph.nodes.find((item) => item.id === id);
    const entity = findEntity(this.graph, id);
    this.lastCanvasTap = null;
    this.clearAddHint();
    if (this.pendingConnectionId) {
      if (node && this.pendingConnectionId !== id && !hasEdge(this.graph, this.pendingConnectionId, id)) {
        this.pushUndoSnapshot();
        this.graph.edges.push({
          id: makeUniqueId(this.graph, "edge"),
          sourceId: this.pendingConnectionId,
          targetId: id,
          label: "",
          type: "related",
          color: DEFAULT_EDGE_COLOR,
        });
      }
      this.pendingConnectionId = null;
      this.selectedId = id;
      this.visibleNodeActionId = null;
      this.pointerDownSelectedId = null;
      this.render();
      return;
    }

    this.selectedId = id;
    if (!node || (entity && getEntityKind(this.graph, entity) === "edge")) this.visibleNodeActionId = null;
    this.pointerDownSelectedId = null;
    this.render();
  }

  startConnectionFromSelectedNode() {
    const node = this.selectedId ? this.graph.nodes.find((item) => item.id === this.selectedId) : null;
    if (!node) return;
    this.pendingConnectionId = node.id;
    this.visibleNodeActionId = null;
    this.render();
  }

  /**
   * @param {string | null} id
   * @param {Element} anchor
   */
  openNodeColorPicker(id, anchor) {
    const node = id ? this.graph.nodes.find((item) => item.id === id) : null;
    if (!node) return;
    this.openColorPicker("node", node.id, node.color, anchor);
  }

  /**
   * @param {string | null} id
   * @param {Element} anchor
   */
  openEdgeColorPicker(id, anchor) {
    const edge = id ? this.graph.edges.find((item) => item.id === id) : null;
    if (!edge) return;
    this.openColorPicker("edge", edge.id, getEdgeColor(edge), anchor);
  }

  /**
   * @param {string | null} id
   * @param {Element} anchor
   */
  openGroupColorPicker(id, anchor) {
    const group = id ? this.graph.groups.find((item) => item.id === id) : null;
    if (!group) return;
    this.openColorPicker("group", group.id, group.color, anchor);
  }

  /**
   * @param {"node" | "edge" | "group"} kind
   * @param {string} id
   * @param {string} color
   * @param {Element} anchor
   */
  openColorPicker(kind, id, color, anchor) {
    const input = this.querySelector(".suki-node-color-input");
    if (!(input instanceof HTMLInputElement)) return;

    const swatch = anchor.querySelector(".suki-node-color-action-swatch");
    const rect = (swatch || anchor).getBoundingClientRect();
    input.dataset.entityKind = kind;
    input.dataset.entityId = id;
    input.value = color;
    input.style.left = `${rect.left}px`;
    input.style.top = `${rect.top}px`;
    input.style.inlineSize = `${Math.max(1, rect.width)}px`;
    input.style.blockSize = `${Math.max(1, rect.height)}px`;
    input.getBoundingClientRect();
    input.focus({ preventScroll: true });
    if ("showPicker" in input) {
      input.showPicker();
    } else {
      input.click();
    }
  }

  /**
   * @param {HTMLInputElement} input
   */
  applyPickedColor(input) {
    const id = input.dataset.entityId;
    const kind = input.dataset.entityKind;
    if (!id) return;

    if (kind === "edge") {
      const edge = this.graph.edges.find((item) => item.id === id);
      if (!edge) return;
      this.pushUndoSnapshot();
      edge.color = input.value;
      this.selectedId = edge.id;
      this.visibleNodeActionId = null;
      this.render();
      return;
    }

    if (kind === "group") {
      const group = this.graph.groups.find((item) => item.id === id);
      if (!group) return;
      this.pushUndoSnapshot();
      group.color = input.value;
      this.selectedId = group.id;
      this.visibleNodeActionId = null;
      this.render();
      return;
    }

    const node = this.graph.nodes.find((item) => item.id === id);
    if (!node) return;
    this.pushUndoSnapshot();
    node.color = input.value;
    this.selectedId = node.id;
    this.visibleNodeActionId = node.id;
    this.render();
  }

  openPropertiesDialog() {
    const dialog = this.querySelector(".suki-properties-dialog");
    if (!(dialog instanceof HTMLDialogElement)) return;
    this.renderInspector();
    if (!dialog.open) dialog.showModal();
  }

  closePropertiesDialog() {
    const dialog = this.querySelector(".suki-properties-dialog");
    if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  }

  createHistorySnapshot() {
    return {
      documentName: this.documentName,
      graph: cloneGraph(this.graph),
      selectedId: this.selectedId,
      pendingConnectionId: this.pendingConnectionId,
      visibleNodeActionId: this.visibleNodeActionId,
      viewBox: { ...this.viewBox },
    };
  }

  pushUndoSnapshot() {
    const snapshot = this.createHistorySnapshot();
    const previous = this.undoStack[this.undoStack.length - 1];
    if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.updateUndoButton();
    this.scheduleUrlHashUpdate();
  }

  scheduleUrlHashUpdate() {
    if (this.urlHashUpdateScheduled) return;
    this.urlHashUpdateScheduled = true;
    queueMicrotask(() => {
      this.urlHashUpdateScheduled = false;
      this.updateUrlHash();
    });
  }

  updateUrlHash() {
    const query = createUrlQueryFromGraph(this.graph, this.documentName || "スキサークル");
    const nextUrl = `${location.pathname}${location.search}#?${query}`;
    history.replaceState(history.state, "", nextUrl);
  }

  updateUndoButton() {
    const undoButton = this.querySelector('[data-action="undo"]');
    if (undoButton instanceof HTMLButtonElement) undoButton.disabled = this.undoStack.length === 0;
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;

    this.graph = cloneGraph(snapshot.graph);
    this.documentName = snapshot.documentName || "スキサークル";
    this.selectedId = snapshot.selectedId;
    this.pendingConnectionId = snapshot.pendingConnectionId;
    this.visibleNodeActionId = snapshot.visibleNodeActionId;
    this.viewBox = { ...snapshot.viewBox };
    this.drag = null;
    this.pan = null;
    this.editingNodeId = null;
    this.lastCanvasTap = null;
    this.lastNodeTap = null;
    const editor = this.getNodeEditor();
    if (editor) {
      editor.hidden = true;
      editor.textContent = "";
      editor.classList.remove("is-group-editor", "is-node-editor", "is-edge-editor");
    }
    this.recreateCanvasNextRender = true;
    this.syncDocumentNameInput();
    this.render();
    this.updateUrlHash();
  }

  /**
   * @returns {SukiGroup | null}
   */
  getDraftGroup() {
    if (!this.drag?.proposedGroupNodeId) return null;

    const draggedNode = this.graph.nodes.find((node) => node.id === this.drag?.id);
    const pairedNode = this.graph.nodes.find((node) => node.id === this.drag?.proposedGroupNodeId);
    if (!draggedNode || !pairedNode || draggedNode.groupId || pairedNode.groupId) return null;
    if (Math.hypot(pairedNode.x - draggedNode.x, pairedNode.y - draggedNode.y) > NODE_SIZE) return null;

    return {
      id: DRAFT_GROUP_ID,
      label: "新規グループ",
      color: GROUP_PALETTE[this.graph.groups.length % GROUP_PALETTE.length],
      ...getGroupGeometryForMembers([draggedNode, pairedNode]),
    };
  }

  /**
   * @param {string} id
   */
  startNodeEditing(id) {
    const entity = findEntity(this.graph, id);
    const editor = this.getNodeEditor();
    if (!entity) return;
    const kind = getEntityKind(this.graph, entity);
    if (kind !== "node" && kind !== "group" && kind !== "edge") return;
    if (!editor) return;

    this.editingNodeId = id;
    this.lastNodeTap = null;
    this.lastCanvasTap = null;
    this.selectedId = id;
    this.pendingConnectionId = null;
    this.visibleNodeActionId = null;
    this.drag = null;
    editor.classList.toggle("is-group-editor", kind === "group");
    editor.classList.toggle("is-node-editor", kind === "node");
    editor.classList.toggle("is-edge-editor", kind === "edge");
    editor.textContent = entity.label;
    editor.hidden = false;
    this.render();
    this.positionNodeEditor();
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  commitNodeEditing() {
    if (!this.editingNodeId) return;

    const entity = findEntity(this.graph, this.editingNodeId);
    const editor = this.getNodeEditor();
    const kind = entity ? getEntityKind(this.graph, entity) : null;
    const rawValue = editor?.innerText || editor?.textContent || "";
    const value = kind === "group"
      ? rawValue.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      : rawValue.replace(/\s+/g, " ").trim();
    if (entity && (kind === "node" || kind === "group" || kind === "edge")) {
      this.pushUndoSnapshot();
      entity.label = kind === "node" ? value.slice(0, 1) : value;
    }

    this.editingNodeId = null;
    this.lastNodeTap = null;
    if (editor) {
      editor.hidden = true;
      editor.textContent = "";
      editor.classList.remove("is-group-editor", "is-node-editor", "is-edge-editor");
    }
    this.render();
  }

  positionNodeEditor() {
    if (!this.editingNodeId) return;

    const entity = findEntity(this.graph, this.editingNodeId);
    const editor = this.getNodeEditor();
    const workspace = this.querySelector(".suki-workspace");
    if (!entity || !editor || !(workspace instanceof HTMLElement)) return;
    const kind = getEntityKind(this.graph, entity);
    if (kind !== "node" && kind !== "group" && kind !== "edge") return;

    const canvas = this.getCanvas();
    const canvasRect = canvas.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const scaleX = canvas.clientWidth / Math.max(1, this.viewBox.width);
    const scaleY = canvas.clientHeight / Math.max(1, this.viewBox.height);
    if (kind === "node") {
      const node = /** @type {SukiNode} */ (entity);
      const size = NODE_SIZE * Math.min(scaleX, scaleY);
      const x = canvasRect.left - workspaceRect.left + (node.x - this.viewBox.x) * scaleX;
      const y = canvasRect.top - workspaceRect.top + (node.y - this.viewBox.y) * scaleY;
      editor.style.inlineSize = `${size}px`;
      editor.style.blockSize = `${size}px`;
      editor.style.left = `${x - size / 2}px`;
      editor.style.top = `${y - size / 2}px`;
      return;
    }

    if (kind === "edge") {
      const edge = /** @type {SukiEdge} */ (entity);
      const source = this.graph.nodes.find((node) => node.id === edge.sourceId);
      const target = this.graph.nodes.find((node) => node.id === edge.targetId);
      if (!source || !target) return;
      const x = canvasRect.left - workspaceRect.left + ((source.x + target.x) / 2 - this.viewBox.x) * scaleX;
      const y = canvasRect.top - workspaceRect.top + ((source.y + target.y) / 2 + 16 - this.viewBox.y) * scaleY;
      editor.style.inlineSize = "9rem";
      editor.style.blockSize = "2rem";
      editor.style.left = `${x - 72}px`;
      editor.style.top = `${y - 16}px`;
      return;
    }

    const group = /** @type {SukiGroup} */ (entity);
    const box = getGroupBox(group);
    const left = canvasRect.left - workspaceRect.left + (box.left + 12 - this.viewBox.x) * scaleX;
    const top = canvasRect.top - workspaceRect.top + (box.top + 12 - this.viewBox.y) * scaleY;
    editor.style.inlineSize = `${Math.max(120, Math.min(260, (box.width - 24) * scaleX))}px`;
    editor.style.blockSize = `${Math.max(54, Math.min(150, (box.height - 24) * scaleY))}px`;
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this.pushUndoSnapshot();
    const id = this.selectedId;
    this.graph.nodes = this.graph.nodes.filter((node) => node.id !== id);
    this.graph.groups = this.graph.groups.filter((group) => group.id !== id);
    this.graph.edges = this.graph.edges.filter((edge) => edge.id !== id && edge.sourceId !== id && edge.targetId !== id);
    this.graph.nodes.forEach((node) => {
      if (node.groupId === id) node.groupId = null;
    });
    this.selectedId = null;
    this.pendingConnectionId = null;
    this.visibleNodeActionId = null;
    this.render();
  }

  /**
   * @returns {HTMLElement}
   */
  toGraphElement() {
    return sukiElementConstructor("suki-graph").fromGraph(this.graph);
  }

  /**
   * @returns {string}
   */
  toGraphMarkup() {
    return this.toGraphElement().toMarkup();
  }

  /**
   * @returns {string}
   */
  toCircleMarkup() {
    const circle = document.createElement("suki-circle");
    circle.setAttribute("title", this.documentName || "スキサークル");
    circle.append(this.toGraphElement());
    return circle.outerHTML;
  }

  /**
   * @returns {SVGSVGElement}
   */
  toSvgDocument() {
    return this.toGraphElement().toSvgDocument();
  }

  openSvgPreviewDialog() {
    const dialog = this.querySelector(".suki-svg-preview-dialog");
    const preview = this.querySelector(".suki-svg-preview");
    if (!(dialog instanceof HTMLDialogElement) || !(preview instanceof HTMLElement)) return;

    const svg = this.toSvgDocument();
    svg.classList.add("suki-svg-preview-image");
    preview.replaceChildren(svg);
    if (!dialog.open) dialog.showModal();
  }

  closeSvgPreviewDialog() {
    const dialog = this.querySelector(".suki-svg-preview-dialog");
    if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  }

  downloadSvgPreview() {
    const previewSvg = this.querySelector(".suki-svg-preview svg");
    const svg = previewSvg instanceof SVGSVGElement ? /** @type {SVGSVGElement} */ (previewSvg.cloneNode(true)) : this.toSvgDocument();
    const source = prettyPrintSvg(new XMLSerializer().serializeToString(svg));
    const blob = new Blob([source], { type: "image/svg+xml" });
    this.downloadBlob(blob, `${fileNameStem(this.documentName)}.svg`);
  }

  downloadReadonlyHtml() {
    const blob = new Blob([createReadonlyHtml(this.documentName || "スキサークル", this.toCircleMarkup())], { type: "text/html" });
    this.downloadBlob(blob, `${fileNameStem(this.documentName)}.html`);
  }

  async downloadJpegPreview() {
    const previewSvg = this.querySelector(".suki-svg-preview svg");
    const svg = previewSvg instanceof SVGSVGElement ? /** @type {SVGSVGElement} */ (previewSvg.cloneNode(true)) : this.toSvgDocument();
    const source = prettyPrintSvg(new XMLSerializer().serializeToString(svg));
    const blob = new Blob([source], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      const width = Math.max(1, Math.ceil(Number(svg.getAttribute("width")) || image.naturalWidth || image.width));
      const height = Math.max(1, Math.ceil(Number(svg.getAttribute("height")) || image.naturalHeight || image.height));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      if (!jpegBlob) return;
      this.downloadBlob(jpegBlob, `${fileNameStem(this.documentName)}.jpg`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  syncDocumentNameInput() {
    const input = this.querySelector('[data-action="document-name"]');
    if (input instanceof HTMLInputElement) input.value = this.documentName;
    document.title = this.documentName || "スキサークル";
  }

  /**
   * @param {{ freezeGroups?: boolean }} options
   */
  render(options = {}) {
    if (this.recreateCanvasNextRender) {
      this.recreateCanvas();
      this.recreateCanvasNextRender = false;
    }
    const canvas = this.getCanvas();
    const disableAnimation = Boolean(this.drag);
    if (disableAnimation) {
      canvas.classList.add("is-animation-disabled");
      canvas.querySelectorAll("[data-suki-animation]").forEach((element) => element.remove());
      canvas.getBoundingClientRect();
    }
    if (!options.freezeGroups) updateGroupGeometry(this.graph);
    this.updateCanvasViewBox();

    const undoButton = this.querySelector('[data-action="undo"]');
    if (undoButton instanceof HTMLButtonElement) undoButton.disabled = this.undoStack.length === 0;

    const groupsLayer = this.querySelector(".suki-groups");
    const nodesLayer = this.querySelector(".suki-nodes");
    const edgesLayer = this.querySelector(".suki-edges");
    const edgeLabelsLayer = this.querySelector(".suki-edge-labels");
    const edgeHitAreasLayer = this.querySelector(".suki-edge-hit-areas");
    const nodeActionsLayer = this.querySelector(".suki-node-actions");
    if (!groupsLayer || !nodesLayer || !edgesLayer || !edgeLabelsLayer || !edgeHitAreasLayer || !nodeActionsLayer) return;
    const moveDuration = disableAnimation ? 0 : MOVE_ANIMATION_MS;
    const resizeDuration = disableAnimation ? 0 : GROUP_RESIZE_ANIMATION_MS;

    const draftGroup = this.getDraftGroup();
    const renderedGroups = draftGroup ? [...this.graph.groups, draftGroup] : this.graph.groups;
    const groupElements = syncSvgLayerElements(groupsLayer, ".suki-group", "g", renderedGroups.map((group) => group.id));
    renderedGroups.forEach((group) => {
      const element = groupElements.get(group.id);
      if (element) renderSvgGroup(
        element,
        group,
        this.selectedId === group.id,
        group.id === DRAFT_GROUP_ID || this.pendingConnectionId === group.id,
        moveDuration,
        resizeDuration,
      );
    });

    const edgeElements = syncSvgLayerElements(edgesLayer, ".suki-edge", "g", this.graph.edges.map((edge) => edge.id));
    this.graph.edges.forEach((edge) => {
      const element = edgeElements.get(edge.id);
      if (element) renderSvgEdge(element, this.graph, edge, this.selectedId === edge.id);
    });

    const nodeElements = syncSvgLayerElements(nodesLayer, ".suki-node", "g", this.graph.nodes.map((node) => node.id));
    this.graph.nodes.forEach((node) => {
      const element = nodeElements.get(node.id);
      if (element) renderSvgNode(element, node, this.selectedId === node.id, this.pendingConnectionId === node.id, moveDuration);
    });

    const edgeLabelElements = syncSvgLayerElements(
      edgeLabelsLayer,
      ".suki-edge-label-item",
      "g",
      this.graph.edges.filter((edge) => edge.label).map((edge) => edge.id),
    );
    this.graph.edges.forEach((edge) => {
      const element = edgeLabelElements.get(edge.id);
      if (element) renderSvgEdgeLabel(element, this.graph, edge);
    });

    const edgeHitAreaElements = syncSvgLayerElements(edgeHitAreasLayer, ".suki-edge-hit-area", "g", this.graph.edges.map((edge) => edge.id));
    this.graph.edges.forEach((edge) => {
      const element = edgeHitAreaElements.get(edge.id);
      if (element) renderSvgEdgeHitArea(element, this.graph, edge);
    });

    const actionNode = this.pendingConnectionId
      ? null
      : this.graph.nodes.find((node) => node.id === this.visibleNodeActionId && node.id === this.selectedId) || null;
    const actionEdge = this.pendingConnectionId
      ? null
      : this.graph.edges.find((edge) => edge.id === this.selectedId) || null;
    const actionGroup = this.pendingConnectionId
      ? null
      : this.graph.groups.find((group) => group.id === this.selectedId) || null;
    const actionIds = actionNode ? [actionNode.id] : actionEdge ? [actionEdge.id] : actionGroup ? [actionGroup.id] : [];
    const actionElements = syncSvgLayerElements(nodeActionsLayer, ".suki-node-action", "g", actionIds);
    if (actionNode) {
      const element = actionElements.get(actionNode.id);
      if (element) renderSvgNodeAction(element, actionNode);
    }
    if (actionEdge) {
      const element = actionElements.get(actionEdge.id);
      if (element) renderSvgEdgeDeleteAction(element, this.graph, actionEdge);
    }
    if (actionGroup) {
      const element = actionElements.get(actionGroup.id);
      if (element) renderSvgGroupAction(element, actionGroup);
    }

    let addHintElement = nodeActionsLayer.querySelector(".suki-add-hint");
    if (this.addHint) {
      if (!(addHintElement instanceof SVGElement)) {
        addHintElement = svgElement("g");
        nodeActionsLayer.append(addHintElement);
      }
      renderSvgAddHint(addHintElement, this.addHint);
    } else {
      addHintElement?.remove();
    }

    this.positionNodeEditor();
    this.renderInspector();
    if (!this.drag) {
      canvas.classList.remove("is-animation-disabled");
    }
  }

  renderInspector() {
    const form = this.querySelector(".suki-form");
    const empty = this.querySelector(".suki-empty");
    if (!(form instanceof HTMLFormElement) || !empty) return;

    const entity = this.selectedId ? findEntity(this.graph, this.selectedId) : null;
    form.hidden = !entity;
    empty.toggleAttribute("hidden", !!entity);
    if (!entity) return;

    const kind = getEntityKind(this.graph, entity);

    const entityId = /** @type {HTMLOutputElement} */ (form.elements.namedItem("entityId"));
    const label = /** @type {HTMLInputElement} */ (form.elements.namedItem("label"));
    const color = /** @type {HTMLInputElement} */ (form.elements.namedItem("color"));
    const groupId = /** @type {HTMLSelectElement} */ (form.elements.namedItem("groupId"));
    const labelField = /** @type {HTMLElement | null} */ (label.closest("label"));
    const colorField = /** @type {HTMLElement | null} */ (color.closest("label"));
    const groupField = /** @type {HTMLElement | null} */ (groupId.closest("label"));

    labelField?.toggleAttribute("hidden", false);
    colorField?.toggleAttribute("hidden", false);
    groupField?.toggleAttribute("hidden", kind !== "node");

    entityId.textContent = entity.id;
    label.value = entity.label;
    label.maxLength = kind === "node" ? 1 : 80;
    label.placeholder = kind === "node" ? "一文字" : kind === "edge" ? "テキスト" : "名前";
    labelField?.querySelector("span")?.replaceChildren(kind === "node" ? "表示文字" : kind === "edge" ? "テキスト" : "名前");
    if (kind === "edge") {
      color.value = getEdgeColor(/** @type {SukiEdge} */ (entity));
    } else if ("color" in entity) {
      color.value = entity.color;
    }

    if ("groupId" in entity) {
      groupId.replaceChildren(
        new Option("なし", ""),
        ...this.graph.groups.map((group) => new Option(group.label, group.id, false, entity.groupId === group.id)),
      );
      groupId.value = entity.groupId || "";
    }
  }

  /**
   * @returns {SVGSVGElement}
   */
  getCanvas() {
    return /** @type {SVGSVGElement} */ (this.querySelector(".suki-canvas"));
  }

  /**
   * @returns {HTMLElement | null}
   */
  getNodeEditor() {
    return /** @type {HTMLElement | null} */ (this.querySelector(".suki-node-editor"));
  }

  /**
   * @returns {SVGSVGElement}
   */
  createCanvasElement() {
    const canvas = /** @type {SVGSVGElement} */ (svgElement("svg"));
    canvas.classList.add("suki-canvas");
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", "相関図キャンバス");
    canvas.setAttribute("xmlns", SVG_NS);
    canvas.innerHTML = `
      <g class="suki-viewport">
        <g class="suki-groups"></g>
        <g class="suki-edges"></g>
        <g class="suki-edge-hit-areas"></g>
        <g class="suki-nodes"></g>
        <g class="suki-edge-labels"></g>
        <g class="suki-node-actions"></g>
      </g>
    `;
    return canvas;
  }

  recreateCanvas() {
    const current = this.getCanvas();
    const next = this.createCanvasElement();
    current.replaceWith(next);
    if (this.resizeObserver) {
      this.resizeObserver.unobserve(current);
      this.resizeObserver.observe(next);
    }
  }

  updateCanvasViewBox() {
    const canvas = this.getCanvas();
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));

    if (!this.viewBox.initialized) {
      this.viewBox.x = Math.max(0, (CANVAS_WORLD_WIDTH - width) / 2);
      this.viewBox.y = Math.max(0, (CANVAS_WORLD_HEIGHT - height) / 2);
      this.viewBox.initialized = true;
    } else {
      const centerX = this.viewBox.x + this.viewBox.width / 2;
      const centerY = this.viewBox.y + this.viewBox.height / 2;
      this.viewBox.x = centerX - width / 2;
      this.viewBox.y = centerY - height / 2;
    }

    this.viewBox.width = width;
    this.viewBox.height = height;
    this.viewBox.x = this.clampViewBoxX(this.viewBox.x);
    this.viewBox.y = this.clampViewBoxY(this.viewBox.y);
    this.applyCanvasViewBox();
  }

  applyCanvasViewBox() {
    const canvas = this.getCanvas();
    canvas.setAttribute("viewBox", `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    const scaleX = canvas.clientWidth / Math.max(1, this.viewBox.width);
    const scaleY = canvas.clientHeight / Math.max(1, this.viewBox.height);
    const gridSizeX = GRID_SIZE * scaleX;
    const gridSizeY = GRID_SIZE * scaleY;
    canvas.style.setProperty("--suki-grid-size-x", `${gridSizeX}px`);
    canvas.style.setProperty("--suki-grid-size-y", `${gridSizeY}px`);
    canvas.style.setProperty("--suki-grid-x", `${(-this.viewBox.x * scaleX) % gridSizeX}px`);
    canvas.style.setProperty("--suki-grid-y", `${(-this.viewBox.y * scaleY) % gridSizeY}px`);
  }

  /**
   * @param {number} x
   * @returns {number}
   */
  clampViewBoxX(x) {
    return Math.min(Math.max(0, x), Math.max(0, CANVAS_WORLD_WIDTH - this.viewBox.width));
  }

  /**
   * @param {number} y
   * @returns {number}
   */
  clampViewBoxY(y) {
    return Math.min(Math.max(0, y), Math.max(0, CANVAS_WORLD_HEIGHT - this.viewBox.height));
  }

  /**
   * @param {PointerEvent} event
   * @returns {{ x: number, y: number }}
   */
  getCanvasPoint(event) {
    const canvas = this.getCanvas();
    const matrix = canvas.getScreenCTM();
    if (!matrix) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    const point = canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {SukiGroup | null}
   */
  findGroupAt(x, y) {
    return this.graph.groups.find((group) => {
      const box = getGroupBox(group);
      return isPointInsideBox(box, x, y);
    }) || null;
  }
});
