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
 * @typedef {Object} SukiGeometry
 * @property {number} nodeRadius
 * @property {number} groupPaddingX
 * @property {number} groupPaddingTop
 * @property {number} groupPaddingBottom
 * @property {number} groupMinWidth
 * @property {number} groupMinHeight
 *
 * @typedef {SukiNode | SukiGroup | SukiEdge} SukiEntity
 *
 * @typedef {Object} SukiSvgExportContext
 * @property {HTMLElement} graphElement
 * @property {SukiGraph} graph
 */

const SVG_NS = "http://www.w3.org/2000/svg";
let CANVAS_WORLD_WIDTH = 3200;
let CANVAS_WORLD_HEIGHT = 2200;
const ID_ATTRIBUTE_PREFIX = "sc-";
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
 * @property {string} documentId
 * @property {string} documentName
 * @property {SukiGraph} graph
 */

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
  const candidates = SukiCircleEdit.NODE_LABEL_CANDIDATES;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? "A";
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
 * @param {Element} element
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readNumberAttribute(element, name, fallback) {
  const attribute = element.getAttribute(`data-${name}`) ?? element.getAttribute(name);
  const value = Number(attribute);
  return attribute !== null && Number.isFinite(value) ? value : fallback;
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readCssNumber(element, name, fallback) {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * @returns {SukiGeometry}
 */
function defaultGeometry() {
  return {
    nodeRadius: 44,
    groupPaddingX: 28,
    groupPaddingTop: 42,
    groupPaddingBottom: 24,
    groupMinWidth: 180,
    groupMinHeight: 150,
  };
}

/**
 * @param {Element} element
 * @returns {SukiGeometry}
 */
function readGeometryAttributes(element) {
  CANVAS_WORLD_WIDTH = readNumberAttribute(element, "canvas-world-width", 3200);
  CANVAS_WORLD_HEIGHT = readNumberAttribute(element, "canvas-world-height", 2200);
  return {
    groupMinWidth: readCssNumber(element, "--suki-group-min-width", 180),
    groupMinHeight: readCssNumber(element, "--suki-group-min-height", 150),
    nodeRadius: readCssNumber(element, "--suki-node-radius", 44),
    groupPaddingX: readCssNumber(element, "--suki-group-padding-x", 28),
    groupPaddingTop: readCssNumber(element, "--suki-group-padding-top", 42),
    groupPaddingBottom: readCssNumber(element, "--suki-group-padding-bottom", 24),
  };
}

/**
 * @param {SukiGeometry} geometry
 * @returns {string}
 */
function presentationStyleText(geometry) {
  return `@scope {
  :scope {
  --suki-group-min-width: ${geometry.groupMinWidth};
  --suki-group-min-height: ${geometry.groupMinHeight};
  --suki-node-radius: ${geometry.nodeRadius};
  --suki-group-padding-x: ${geometry.groupPaddingX};
  --suki-group-padding-top: ${geometry.groupPaddingTop};
  --suki-group-padding-bottom: ${geometry.groupPaddingBottom};
  }
}
`;
}

/**
 * @param {SukiGeometry} geometry
 * @returns {HTMLStyleElement}
 */
function presentationStyleElement(geometry) {
  const style = document.createElement("style");
  style.textContent = presentationStyleText(geometry);
  return style;
}

/**
 * @param {Element} element
 * @returns {string}
 */
function readGroupTitleText(element) {
  return element.querySelector(":scope > p")?.textContent ?? element.getAttribute("data-label") ?? "";
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
  return /** @type {SukiGraph} */ (value);
}

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isSukiId(value) {
  return value !== undefined && /^[0-9a-zA-Z]{2}$/.test(value);
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function sukiIdFromValue(value) {
  if (!value) return null;
  if (isSukiId(value)) return value;
  if (value.startsWith(ID_ATTRIBUTE_PREFIX) && isSukiId(value.slice(ID_ATTRIBUTE_PREFIX.length))) {
    return value.slice(ID_ATTRIBUTE_PREFIX.length);
  }
  return null;
}

/**
 * @param {string} id
 * @returns {string}
 */
function idAttributeValue(id) {
  return isSukiId(id) ? `${ID_ATTRIBUTE_PREFIX}${id}` : id;
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
  const entries = new URLSearchParams(search);
  const version = entries.get("suki-circle");
  const documentIdMatch = version?.match(/^v1_([0-9a-zA-Z]{5})$/);
  if (version !== "v1" && !documentIdMatch) return null;

  /** @type {Map<string, SukiGroup>} */
  const groupsById = new Map();
  /** @type {Map<string, SukiNode>} */
  const nodesById = new Map();
  /** @type {Map<string, string>} */
  const labelsById = new Map();
  /** @type {Map<string, string>} */
  const colorsById = new Map();
  /** @type {{ id: string, sourceId: string, targetId: string, label: string, color: string }[]} */
  const edgeEntries = [];
  let documentName = "スキサークル";

  for (const [key, value] of entries) {
    if (key === "t") {
      documentName = value.trim() || documentName;
      continue;
    }

    const match = key.match(/^(g|n|e|l|c)\.([0-9a-zA-Z]{2})$/);
    if (!match) continue;

    const id = match[2];

    if (match[1] === "l") {
      labelsById.set(id, value);
      continue;
    }

    if (match[1] === "c") {
      colorsById.set(id, value.startsWith("#") ? value : `#${value}`);
      continue;
    }

    const fields = value.split("_");
    if (match[1] === "g") {
      groupsById.set(id, {
        id,
        label: "",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        color: "",
      });
      continue;
    }

    if (match[1] === "n") {
      const x = Number(fields[0]);
      const y = Number(fields[1]);
      nodesById.set(id, {
        id,
        label: "",
        x: Number.isFinite(x) ? x : CANVAS_WORLD_WIDTH / 2,
        y: Number.isFinite(y) ? y : CANVAS_WORLD_HEIGHT / 2,
        groupId: sukiIdFromValue(fields[2]),
        color: "",
      });
      continue;
    }

    const sourceId = sukiIdFromValue(fields[0]);
    const targetId = sukiIdFromValue(fields[1]);
    if (!sourceId || !targetId) continue;
    edgeEntries.push({
      id,
      sourceId,
      targetId,
      label: "",
      color: "",
    });
  }

  for (const [id, label] of labelsById) {
    const group = groupsById.get(id);
    if (group) group.label = label;
    const node = nodesById.get(id);
    if (node) node.label = label;
    const edge = edgeEntries.find((item) => item.id === id);
    if (edge) edge.label = label;
  }

  for (const [id, color] of colorsById) {
    const group = groupsById.get(id);
    if (group) group.color = color;
    const node = nodesById.get(id);
    if (node) node.color = color;
    const edge = edgeEntries.find((item) => item.id === id);
    if (edge) edge.color = color;
  }

  const groupIds = new Set(groupsById.keys());
  const nodeIds = new Set(nodesById.keys());
  const graph = normalizeGraph({
    groups: [...groupsById.values()],
    nodes: [...nodesById.values()].map((node) => {
      if (node.groupId && !groupIds.has(node.groupId)) node.groupId = null;
      return node;
    }),
    edges: edgeEntries
      .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
      .map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        label: edge.label,
        type: "related",
        color: edge.color,
      })),
  });

  updateGroupGeometry(graph);
  return { documentId: documentIdMatch ? `sc-${documentIdMatch[1]}` : "", documentName, graph };
}

/**
 * @returns {SukiUrlInitialState | null}
 */
function readInitialStateFromLocation() {
  return readInitialStateFromUrlSearch(queryFromHash(location.hash))
    || readInitialStateFromUrlSearch(location.search);
}

/**
 * @param {SukiGraph} graph
 * @param {string} documentName
 * @param {string} documentId
 * @returns {string}
 */
function createUrlQueryFromGraph(graph, documentName, documentId = "") {
  const sourceGraph = cloneGraph(graph);
  updateGroupGeometry(sourceGraph);
  const documentIdMatch = documentId.match(/^sc-([0-9a-zA-Z]{5})$/);
  const query = new URLSearchParams({ "suki-circle": documentIdMatch ? `v1_${documentIdMatch[1]}` : "v1" });
  const title = documentName.trim();
  if (title) query.set("t", title);

  for (const group of sourceGraph.groups) {
    query.set(`g.${group.id}`, "");
    if (group.color) query.set(`c.${group.id}`, group.color.replace(/^#/, ""));
    if (group.label) query.set(`l.${group.id}`, group.label);
  }

  for (const node of sourceGraph.nodes) {
    const fields = [
      String(Math.round(node.x)),
      String(Math.round(node.y)),
    ];
    if (node.groupId && sourceGraph.groups.some((group) => group.id === node.groupId)) fields.push(node.groupId);
    query.set(`n.${node.id}`, fields.join("_"));
    if (node.color) query.set(`c.${node.id}`, node.color.replace(/^#/, ""));
    if (node.label) query.set(`l.${node.id}`, node.label);
  }

  for (const edge of sourceGraph.edges) {
    if (!sourceGraph.nodes.some((node) => node.id === edge.sourceId) || !sourceGraph.nodes.some((node) => node.id === edge.targetId)) continue;
    query.set(`e.${edge.id}`, [
      edge.sourceId,
      edge.targetId,
    ].join("_"));
    if (edge.color) query.set(`c.${edge.id}`, edge.color.replace(/^#/, ""));
    if (edge.label) query.set(`l.${edge.id}`, edge.label);
  }

  return query.toString();
}

/**
 * @param {SukiGraph} graph
 * @param {string} id
 * @returns {SukiEntity | null}
 */
function findEntity(graph, id) {
  return graph.nodes.find((node) => node.id === id)
    ?? graph.groups.find((group) => group.id === id)
    ?? graph.edges.find((edge) => edge.id === id)
    ?? null;
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
 * @param {SukiGeometry} geometry
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
function getGroupBox(group, geometry = defaultGeometry()) {
  const width = group.width ?? geometry.groupMinWidth;
  const height = group.height ?? geometry.groupMinHeight;
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
 * @param {SukiGeometry} geometry
 * @param {number} padding
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function getGraphContentViewBox(graph, geometry = defaultGeometry(), padding = 0) {
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let bounds = null;

  for (const group of graph.groups) {
    const box = getGroupBox(group, geometry);
    bounds = includeBounds(bounds, {
      left: box.left,
      top: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
    });
  }

  for (const node of graph.nodes) {
    bounds = includeBounds(bounds, {
      left: node.x - geometry.nodeRadius,
      top: node.y - geometry.nodeRadius,
      right: node.x + geometry.nodeRadius,
      bottom: node.y + geometry.nodeRadius,
    });
  }

  for (const edge of graph.edges) {
    const source = graph.nodes.find((node) => node.id === edge.sourceId);
    const target = graph.nodes.find((node) => node.id === edge.targetId);
    if (!source || !target) continue;
    const strokePadding = edge.type === "strong" ? 8 : 5;
    bounds = includeBounds(bounds, {
      left: Math.min(source.x, target.x) - strokePadding,
      top: Math.min(source.y, target.y) - strokePadding,
      right: Math.max(source.x, target.x) + strokePadding,
      bottom: Math.max(source.y, target.y) + strokePadding,
    });

    if (!edge.label) continue;
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
  }

  if (!bounds) return { x: 0, y: 0, width: CANVAS_WORLD_WIDTH, height: CANVAS_WORLD_HEIGHT };

  return {
    x: bounds.left - padding,
    y: bounds.top - padding,
    width: Math.max(1, bounds.right - bounds.left + padding * 2),
    height: Math.max(1, bounds.bottom - bounds.top + padding * 2),
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
    [...layer.querySelectorAll(selector)].map((element) => [/** @type {SVGElement} */ (element).dataset.id ?? "", /** @type {SVGElement} */ (element)]),
  );
  const elements = orderedIds.map((id) => {
    const current = existing.get(id);
    if (current) return current;
    const created = document.createElementNS(SVG_NS, tagName);
    created.dataset.id = id;
    return created;
  });

  layer.replaceChildren(...elements);
  return new Map(elements.map((element) => [element.dataset.id ?? "", element]));
}

/**
 * @param {SukiNode[]} members
 * @param {SukiGeometry} geometry
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function getGroupGeometryForMembers(members, geometry = defaultGeometry()) {
  if (members.length === 0) {
    return {
      x: 0,
      y: 0,
      width: geometry.groupMinWidth,
      height: geometry.groupMinHeight,
    };
  }

  const minX = Math.min(...members.map((node) => node.x - geometry.nodeRadius));
  const maxX = Math.max(...members.map((node) => node.x + geometry.nodeRadius));
  const minY = Math.min(...members.map((node) => node.y - geometry.nodeRadius));
  const maxY = Math.max(...members.map((node) => node.y + geometry.nodeRadius));
  const left = minX - geometry.groupPaddingX;
  const top = minY - geometry.groupPaddingTop;
  const width = Math.max(geometry.groupMinWidth, maxX - minX + geometry.groupPaddingX * 2);
  const height = Math.max(geometry.groupMinHeight, maxY - minY + geometry.groupPaddingTop + geometry.groupPaddingBottom);

  return {
    x: left + width / 2,
    y: top + height / 2,
    width,
    height,
  };
}

/**
 * @param {SukiGraph} graph
 * @param {SukiGeometry} geometry
 */
function updateGroupGeometry(graph, geometry = defaultGeometry()) {
  for (const group of graph.groups) {
    const members = getGroupMembers(graph, group.id);
    if (members.length === 0) {
      group.width = group.width ?? geometry.groupMinWidth;
      group.height = group.height ?? geometry.groupMinHeight;
      continue;
    }

    Object.assign(group, getGroupGeometryForMembers(members, geometry));
  }
}

/**
 * @param {SukiGraph} graph
 * @param {{ x?: number, y?: number, width: number, height: number }} viewport
 * @param {SukiGeometry} geometry
 * @returns {SukiGraph}
 */
function autoLayout(graph, viewport, geometry = defaultGeometry()) {
  const next = cloneGraph(graph);
  void viewport;

  for (const group of next.groups) {
    const members = getGroupMembers(next, group.id);
    if (members.length < 2) continue;

    const centroidX = members.reduce((sum, node) => sum + node.x, 0) / members.length;
    const centroidY = members.reduce((sum, node) => sum + node.y, 0) / members.length;
    const targetRadius = members.length === 2
      ? SukiCircleEdit.GROUP_LAYOUT_SPACING / 2
      : SukiCircleEdit.GROUP_LAYOUT_SPACING / (2 * Math.sin(Math.PI / members.length));

    for (const [index, node] of members.entries()) {
      const currentDx = node.x - centroidX;
      const currentDy = node.y - centroidY;
      const currentDistance = Math.hypot(currentDx, currentDy);
      const fallbackAngle = (-Math.PI / 2) + (Math.PI * 2 * index) / members.length;
      const unitX = currentDistance > 0 ? currentDx / currentDistance : Math.cos(fallbackAngle);
      const unitY = currentDistance > 0 ? currentDy / currentDistance : Math.sin(fallbackAngle);
      const nextDistance = currentDistance + (targetRadius - currentDistance) * SukiCircleEdit.GROUP_LAYOUT_RELAXATION;
      node.x = Math.min(
        CANVAS_WORLD_WIDTH - SukiCircleEdit.CANVAS_PADDING,
        Math.max(SukiCircleEdit.CANVAS_PADDING, centroidX + unitX * nextDistance),
      );
      node.y = Math.min(
        CANVAS_WORLD_HEIGHT - SukiCircleEdit.CANVAS_PADDING,
        Math.max(SukiCircleEdit.CANVAS_PADDING, centroidY + unitY * nextDistance),
      );
    }
  }

  for (const node of next.nodes.filter((candidate) => !candidate.groupId)) {
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
    if (!nearest) continue;

    const dx = node.x - nearest.node.x;
    const dy = node.y - nearest.node.y;
    const distance = Math.max(1, nearest.distance);
    const nextDistance = distance + (SukiCircleEdit.GROUP_LAYOUT_SPACING - distance) * SukiCircleEdit.LOOSE_LAYOUT_RELAXATION;
    const unitX = dx / distance;
    const unitY = dy / distance;
    node.x = Math.min(
      CANVAS_WORLD_WIDTH - SukiCircleEdit.CANVAS_PADDING,
      Math.max(SukiCircleEdit.CANVAS_PADDING, nearest.node.x + unitX * nextDistance),
    );
    node.y = Math.min(
      CANVAS_WORLD_HEIGHT - SukiCircleEdit.CANVAS_PADDING,
      Math.max(SukiCircleEdit.CANVAS_PADDING, nearest.node.y + unitY * nextDistance),
    );
  }

  updateGroupGeometry(next, geometry);
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
  if (typeof SukiCircleEdit === "function") SukiCircleEdit.animateSvgAttribute(element, name, from, to, duration);
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
  if (typeof SukiCircleEdit === "function") SukiCircleEdit.animateSvgTransform(element, fromX, fromY, toX, toY, duration);
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
  if (typeof SukiCircleEdit === "function" && duration > 0 && hasPrevious) {
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
 * @param {SukiGeometry} geometry
 */
function renderSvgGroup(element, group, selected, pending, moveDuration, resizeDuration, geometry = defaultGeometry()) {
  const box = getGroupBox(group, geometry);
  element.classList.add("suki-group");
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-pending", pending);
  element.classList.toggle("is-draft", typeof SukiCircleEdit === "function" && group.id === SukiCircleEdit.DRAFT_GROUP_ID);
  element.dataset.entityKind = "group";
  element.dataset.id = group.id;
  element.id = idAttributeValue(group.id);
  element.removeAttribute("transform");
  element.removeAttribute("style");

  let rect = element.querySelector(".suki-group-box");
  if (!rect) {
    rect = document.createElementNS(SVG_NS, "rect");
    rect.classList.add("suki-group-box");
    element.append(rect);
  }
  const previousX = rect.dataset.x;
  const previousY = rect.dataset.y;
  const previousWidth = rect.dataset.width;
  const previousHeight = rect.dataset.height;
  rect.setAttribute("x", box.left);
  rect.setAttribute("y", box.top);
  rect.setAttribute("width", box.width);
  rect.setAttribute("height", box.height);
  rect.setAttribute("rx", 8);
  if (group.color) {
    rect.setAttribute("fill", group.color);
    rect.setAttribute("stroke", group.color);
  } else {
    rect.removeAttribute("fill");
    rect.removeAttribute("stroke");
  }
  if (typeof SukiCircleEdit === "function") {
    if (moveDuration > 0 && previousX) animateSvgAttribute(rect, "x", previousX, box.left, moveDuration);
    if (moveDuration > 0 && previousY) animateSvgAttribute(rect, "y", previousY, box.top, moveDuration);
    if (resizeDuration > 0 && previousWidth) animateSvgAttribute(rect, "width", previousWidth, box.width, resizeDuration);
    if (resizeDuration > 0 && previousHeight) animateSvgAttribute(rect, "height", previousHeight, box.height, resizeDuration);
  }
  rect.dataset.x = String(box.left);
  rect.dataset.y = String(box.top);
  rect.dataset.width = String(box.width);
  rect.dataset.height = String(box.height);

  let text = element.querySelector(".suki-group-label");
  if (!text) {
    text = document.createElementNS(SVG_NS, "text");
    text.classList.add("suki-group-label");
    element.append(text);
  }
  const textX = box.left + 14;
  const textY = box.top + 28;
  const previousTextX = text.dataset.x;
  const previousTextY = text.dataset.y;
  text.setAttribute("x", textX);
  text.setAttribute("y", textY);
  if (typeof SukiCircleEdit === "function") {
    if (moveDuration > 0 && previousTextX) animateSvgAttribute(text, "x", previousTextX, textX, moveDuration);
    if (moveDuration > 0 && previousTextY) animateSvgAttribute(text, "y", previousTextY, textY, moveDuration);
  }
  text.dataset.x = String(textX);
  text.dataset.y = String(textY);
  text.replaceChildren(...getLabelLines(group.label).map((line, index) => {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", textX);
    tspan.setAttribute("dy", index === 0 ? 0 : "1.25em");
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
 * @param {SukiGeometry} geometry
 */
function renderSvgNode(element, node, selected, pending, moveDuration, geometry = defaultGeometry()) {
  element.classList.add("suki-node");
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-pending", pending);
  element.dataset.entityKind = "node";
  element.dataset.id = node.id;
  element.id = idAttributeValue(node.id);
  setSvgTransform(element, node.x, node.y, moveDuration);

  let circle = element.querySelector(".suki-node-circle");
  if (!circle) {
    circle = document.createElementNS(SVG_NS, "circle");
    circle.classList.add("suki-node-circle");
    element.append(circle);
  }
  circle.setAttribute("cx", 0);
  circle.setAttribute("cy", 0);
  circle.setAttribute("r", geometry.nodeRadius);
  if (node.color) {
    circle.setAttribute("fill", node.color);
  } else {
    circle.removeAttribute("fill");
  }

  let text = element.querySelector(".suki-node-label");
  if (!text) {
    text = document.createElementNS(SVG_NS, "text");
    text.classList.add("suki-node-label");
    element.append(text);
  }
  text.setAttribute("x", 0);
  text.setAttribute("y", 0);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.textContent = node.label;
}

/**
 * @param {string} id
 * @param {number} cx
 * @param {number} cy
 * @returns {SVGElement}
 */
function createSvgPropertiesAction(id, cx, cy) {
  const action = document.createElementNS(SVG_NS, "g");
  action.classList.add("suki-properties-action");
  action.dataset.action = "open-properties";
  action.dataset.id = id;

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = "プロパティ";

  const border = document.createElementNS(SVG_NS, "circle");
  border.classList.add("suki-properties-action-border");
  border.setAttribute("cx", cx);
  border.setAttribute("cy", cy);
  border.setAttribute("r", 14);

  const icon = document.createElementNS(SVG_NS, "g");
  icon.classList.add("suki-properties-action-icon");
  for (const offset of [-5, 0, 5]) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", cx - 7);
    line.setAttribute("y1", cy + offset);
    line.setAttribute("x2", cx + 7);
    line.setAttribute("y2", cy + offset);
    icon.append(line);
  }

  action.append(title, border, icon);
  return action;
}

/**
 * @param {SVGElement} element
 * @param {SukiNode} node
 * @param {SukiGeometry} geometry
 */
function renderSvgNodeAction(element, node, geometry = defaultGeometry()) {
  const connectWidth = 48;
  const height = 28;
  const gap = 8;
  const colorSize = 28;
  const deleteSize = 28;
  const propertiesSize = 28;
  const totalWidth = connectWidth + gap + colorSize + gap + deleteSize;
  const x = node.x - totalWidth / 2;
  const y = node.y + geometry.nodeRadius + 12;

  element.setAttribute("class", "suki-node-action");
  element.dataset.id = node.id;

  const connectAction = document.createElementNS(SVG_NS, "g");
  connectAction.classList.add("suki-node-connect-action");
  connectAction.dataset.action = "start-connect";
  connectAction.dataset.id = node.id;

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.classList.add("suki-node-action-box");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", connectWidth);
  rect.setAttribute("height", height);
  rect.setAttribute("rx", 6);

  const text = document.createElementNS(SVG_NS, "text");
  text.classList.add("suki-node-action-label");
  text.setAttribute("x", x + connectWidth / 2);
  text.setAttribute("y", y + height / 2);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.textContent = "接続";
  connectAction.append(rect, text);

  const colorAction = document.createElementNS(SVG_NS, "g");
  colorAction.classList.add("suki-node-color-action");
  colorAction.dataset.action = "change-node-color";
  colorAction.dataset.id = node.id;

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = "色変更";
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.classList.add("suki-node-color-action-swatch");
  circle.setAttribute("cx", x + connectWidth + gap + colorSize / 2);
  circle.setAttribute("cy", y + colorSize / 2);
  circle.setAttribute("r", colorSize / 2);
  if (node.color) {
    circle.setAttribute("fill", node.color);
  } else {
    circle.removeAttribute("fill");
  }
  colorAction.append(title, circle);

  const deleteAction = document.createElementNS(SVG_NS, "g");
  deleteAction.classList.add("suki-node-delete-action");
  deleteAction.dataset.action = "delete-node";
  deleteAction.dataset.id = node.id;

  const deleteX = x + connectWidth + gap + colorSize + gap;
  const deleteCenterX = deleteX + deleteSize / 2;
  const deleteCenterY = y + deleteSize / 2;

  const deleteTitle = document.createElementNS(SVG_NS, "title");
  deleteTitle.textContent = "削除";
  const deleteCircle = document.createElementNS(SVG_NS, "circle");
  deleteCircle.classList.add("suki-node-delete-action-circle");
  deleteCircle.setAttribute("cx", deleteCenterX);
  deleteCircle.setAttribute("cy", deleteCenterY);
  deleteCircle.setAttribute("r", deleteSize / 2);

  const deleteMinus = document.createElementNS(SVG_NS, "line");
  deleteMinus.classList.add("suki-node-delete-action-minus");
  deleteMinus.setAttribute("x1", deleteCenterX - 6);
  deleteMinus.setAttribute("y1", deleteCenterY);
  deleteMinus.setAttribute("x2", deleteCenterX + 6);
  deleteMinus.setAttribute("y2", deleteCenterY);
  deleteAction.append(deleteTitle, deleteCircle, deleteMinus);

  const propertiesAction = createSvgPropertiesAction(
    node.id,
    deleteCenterX,
    node.y - geometry.nodeRadius - 1 - propertiesSize / 2,
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

  const deleteAction = document.createElementNS(SVG_NS, "g");
  deleteAction.classList.add("suki-edge-delete-action");
  deleteAction.dataset.action = "delete";
  deleteAction.dataset.id = edge.id;

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.classList.add("suki-node-action-box");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", width);
  rect.setAttribute("height", height);
  rect.setAttribute("rx", 6);

  const text = document.createElementNS(SVG_NS, "text");
  text.classList.add("suki-node-action-label");
  text.setAttribute("x", x + width / 2);
  text.setAttribute("y", y + height / 2);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.textContent = "削除";
  deleteAction.append(rect, text);

  const colorAction = document.createElementNS(SVG_NS, "g");
  colorAction.classList.add("suki-edge-color-action");
  colorAction.dataset.action = "change-edge-color";
  colorAction.dataset.id = edge.id;

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = "色変更";
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.classList.add("suki-node-color-action-swatch");
  circle.setAttribute("cx", x + width + gap + colorSize / 2);
  circle.setAttribute("cy", y + colorSize / 2);
  circle.setAttribute("r", colorSize / 2);
  circle.style.fill = edge.color;
  colorAction.append(title, circle);

  const propertiesX = x + width + gap + colorSize + gap;
  const propertiesAction = createSvgPropertiesAction(edge.id, propertiesX + propertiesSize / 2, y + propertiesSize / 2);

  element.replaceChildren(deleteAction, colorAction, propertiesAction);
}

/**
 * @param {SVGElement} element
 * @param {SukiGroup} group
 * @param {SukiGeometry} geometry
 */
function renderSvgGroupAction(element, group, geometry = defaultGeometry()) {
  const box = getGroupBox(group, geometry);
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

  const deleteAction = document.createElementNS(SVG_NS, "g");
  deleteAction.classList.add("suki-group-delete-action");
  deleteAction.dataset.action = "delete";
  deleteAction.dataset.id = group.id;

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.classList.add("suki-node-action-box");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", width);
  rect.setAttribute("height", height);
  rect.setAttribute("rx", 6);

  const text = document.createElementNS(SVG_NS, "text");
  text.classList.add("suki-node-action-label");
  text.setAttribute("x", x + width / 2);
  text.setAttribute("y", y + height / 2);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.textContent = "削除";
  deleteAction.append(rect, text);

  const colorAction = document.createElementNS(SVG_NS, "g");
  colorAction.classList.add("suki-group-color-action");
  colorAction.dataset.action = "change-group-color";
  colorAction.dataset.id = group.id;

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = "色変更";
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.classList.add("suki-node-color-action-swatch");
  circle.setAttribute("cx", x + width + gap + colorSize / 2);
  circle.setAttribute("cy", y + colorSize / 2);
  circle.setAttribute("r", colorSize / 2);
  if (group.color) {
    circle.setAttribute("fill", group.color);
  } else {
    circle.removeAttribute("fill");
  }
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
  element.id = idAttributeValue(edge.id);
  if (!source || !target) return;

  let line = element.querySelector(".suki-edge-line");
  if (!line) {
    line = document.createElementNS(SVG_NS, "line");
    line.classList.add("suki-edge-line");
    element.append(line);
  }
  line.style.stroke = edge.color;
  line.setAttribute("x1", source.x);
  line.setAttribute("y1", source.y);
  line.setAttribute("x2", target.x);
  line.setAttribute("y2", target.y);
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
    hitLine = document.createElementNS(SVG_NS, "line");
    hitLine.classList.add("suki-edge-hit-line");
    element.append(hitLine);
  }
  hitLine.setAttribute("x1", source.x);
  hitLine.setAttribute("y1", source.y);
  hitLine.setAttribute("x2", target.x);
  hitLine.setAttribute("y2", target.y);
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
  element.id = `${idAttributeValue(edge.id)}-label`;
  if (!source || !target) return;

  const labelX = (source.x + target.x) / 2;
  const labelY = (source.y + target.y) / 2 + 14;
  const labelWidth = Math.max(34, edge.label.length * 14 + 18);
  const labelHeight = 24;
  let labelBackground = element.querySelector(".suki-edge-label-background");
  if (!labelBackground) {
    labelBackground = document.createElementNS(SVG_NS, "rect");
    labelBackground.classList.add("suki-edge-label-background");
    element.append(labelBackground);
  }
  labelBackground.setAttribute("x", labelX - labelWidth / 2);
  labelBackground.setAttribute("y", labelY - labelHeight / 2);
  labelBackground.setAttribute("width", labelWidth);
  labelBackground.setAttribute("height", labelHeight);
  labelBackground.setAttribute("rx", 6);
  labelBackground.toggleAttribute("hidden", !edge.label);

  let label = element.querySelector(".suki-edge-label");
  if (!label) {
    label = document.createElementNS(SVG_NS, "text");
    label.classList.add("suki-edge-label");
    element.append(label);
  }
  label.setAttribute("x", labelX);
  label.setAttribute("y", labelY);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "central");
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
  const defs = document.createElementNS(SVG_NS, "defs");

  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", filterId);
  filter.setAttribute("x", "-35%");
  filter.setAttribute("y", "-35%");
  filter.setAttribute("width", "170%");
  filter.setAttribute("height", "170%");
  const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
  blur.setAttribute("stdDeviation", 1.8);
  filter.append(blur);

  defs.append(filter);

  const disc = document.createElementNS(SVG_NS, "circle");
  disc.classList.add("suki-add-hint-disc");
  disc.setAttribute("cx", 0);
  disc.setAttribute("cy", 0);
  disc.setAttribute("r", SukiCircleEdit.ADD_HINT_RADIUS);
  disc.setAttribute("filter", `url(#${filterId})`);

  const plus = document.createElementNS(SVG_NS, "g");
  plus.classList.add("suki-add-hint-plus");
  const vertical = document.createElementNS(SVG_NS, "rect");
  vertical.setAttribute("x", -4);
  vertical.setAttribute("y", -17);
  vertical.setAttribute("width", 8);
  vertical.setAttribute("height", 34);
  vertical.setAttribute("rx", 3);
  const horizontal = document.createElementNS(SVG_NS, "rect");
  horizontal.setAttribute("x", -17);
  horizontal.setAttribute("y", -4);
  horizontal.setAttribute("width", 34);
  horizontal.setAttribute("height", 8);
  horizontal.setAttribute("rx", 3);
  plus.append(vertical, horizontal);

  element.replaceChildren(defs, disc, plus);
}

class SukiNodeElement extends HTMLElement {
  connectedCallback() {
    this.replaceChildren();
  }

  /**
   * @param {SukiNode} node
   * @param {boolean} includeGroup
   * @returns {SukiNodeElement}
   */
  static fromNode(node, includeGroup = true) {
    const element = /** @type {SukiNodeElement} */ (document.createElement("suki-node"));
    element.id = idAttributeValue(node.id);
    element.dataset.x = String(node.x);
    element.dataset.y = String(node.y);
    if (node.color) element.dataset.color = node.color;
    if (includeGroup && node.groupId) element.dataset.group = node.groupId;
    element.title = node.label;
    return element;
  }

  /**
   * @param {string | null} groupId
   * @returns {SukiNode}
   */
  toGraphNode(groupId = null) {
    return {
      id: sukiIdFromValue(this.id) ?? "",
      label: this.getAttribute("title") ?? "",
      x: readNumberAttribute(this, "x", CANVAS_WORLD_WIDTH / 2),
      y: readNumberAttribute(this, "y", CANVAS_WORLD_HEIGHT / 2),
      groupId: groupId ?? sukiIdFromValue(this.dataset.group) ?? null,
      color: this.dataset.color ?? "",
    };
  }
}

customElements.define("suki-node", SukiNodeElement);

class SukiEdgeElement extends HTMLElement {
  connectedCallback() {
    this.replaceChildren();
  }

  /**
   * @param {SukiEdge} edge
   * @returns {SukiEdgeElement}
   */
  static fromEdge(edge) {
    const element = /** @type {SukiEdgeElement} */ (document.createElement("suki-edge"));
    element.id = idAttributeValue(edge.id);
    element.dataset.conn = `${edge.sourceId}-${edge.targetId}`;
    if (edge.type !== "related") element.dataset.type = edge.type;
    if (edge.color) element.dataset.color = edge.color;
    if (edge.label) element.title = edge.label;
    return element;
  }

  /**
   * @returns {SukiEdge}
   */
  toGraphEdge() {
    const [sourceId = "", targetId = ""] = (this.dataset.conn ?? "").split("-");
    return {
      id: sukiIdFromValue(this.id) ?? "",
      sourceId: sukiIdFromValue(sourceId) ?? sourceId,
      targetId: sukiIdFromValue(targetId) ?? targetId,
      label: this.getAttribute("title") ?? "",
      type: /** @type {SukiEdge["type"]} */ (this.dataset.type ?? "related"),
      color: this.dataset.color ?? "",
    };
  }
}

customElements.define("suki-edge", SukiEdgeElement);

/**
 * @param {string} title
 * @returns {HTMLParagraphElement}
 */
function groupTitleElement(title) {
  const element = document.createElement("p");
  element.textContent = title;
  return element;
}

/**
 * @param {SukiNode} node
 * @param {boolean} includeGroup
 * @returns {HTMLElement}
 */
function nodeElement(node, includeGroup = true) {
  return SukiNodeElement.fromNode(node, includeGroup);
}

/**
 * @param {SukiGroup} group
 * @param {number} memberCount
 * @returns {HTMLElement}
 */
function groupElement(group, memberCount) {
  const element = document.createElement("section");
  element.dataset.sukiGroup = "";
  element.id = idAttributeValue(group.id);
  if (group.color) element.dataset.color = group.color;
  element.append(groupTitleElement(group.label));
  if (memberCount === 0) {
    element.dataset.x = String(group.x);
    element.dataset.y = String(group.y);
    element.dataset.width = String(group.width);
    element.dataset.height = String(group.height);
  }
  return element;
}

/**
 * @param {SukiEdge} edge
 * @returns {HTMLElement}
 */
function edgeElement(edge) {
  return SukiEdgeElement.fromEdge(edge);
}

/**
 * @param {Element} element
 * @param {string | null} groupId
 * @returns {SukiNode}
 */
function nodeFromElement(element, groupId = null) {
  return element instanceof SukiNodeElement
    ? element.toGraphNode(groupId)
    : {
      id: sukiIdFromValue(element.id) ?? "",
      label: element.getAttribute("title") ?? "",
      x: readNumberAttribute(element, "x", CANVAS_WORLD_WIDTH / 2),
      y: readNumberAttribute(element, "y", CANVAS_WORLD_HEIGHT / 2),
      groupId: groupId ?? sukiIdFromValue(element.getAttribute("data-group")),
      color: element.getAttribute("data-color") ?? "",
    };
}

/**
 * @param {Element} element
 * @param {SukiGeometry} geometry
 * @returns {SukiGroup}
 */
function groupFromElement(element, geometry = defaultGeometry()) {
  return {
    id: sukiIdFromValue(element.id) ?? "",
    label: readGroupTitleText(element),
    x: readNumberAttribute(element, "x", 0),
    y: readNumberAttribute(element, "y", 0),
    width: readNumberAttribute(element, "width", geometry.groupMinWidth),
    height: readNumberAttribute(element, "height", geometry.groupMinHeight),
    color: element.getAttribute("data-color") ?? "",
  };
}

/**
 * @param {Element} element
 * @returns {SukiEdge}
 */
function edgeFromElement(element) {
  if (element instanceof SukiEdgeElement) return element.toGraphEdge();
  const [sourceId = "", targetId = ""] = (element.getAttribute("data-conn") ?? "").split("-");
  return {
    id: sukiIdFromValue(element.id) ?? "",
    sourceId: sukiIdFromValue(sourceId) ?? sourceId,
    targetId: sukiIdFromValue(targetId) ?? targetId,
    label: element.getAttribute("title") ?? "",
    type: /** @type {SukiEdge["type"]} */ (element.getAttribute("data-type") ?? "related"),
    color: element.getAttribute("data-color") ?? "",
  };
}

/**
 * @param {SukiGraph} sourceGraph
 * @param {SukiGeometry} geometry
 * @returns {HTMLElement[]}
 */
function graphElements(sourceGraph, geometry = defaultGeometry()) {
  const graph = cloneGraph(sourceGraph);
  updateGroupGeometry(graph, geometry);

  /** @type {HTMLElement[]} */
  const elements = [];
  for (const group of graph.groups) {
    const members = getGroupMembers(graph, group.id);
    const groupMarkup = groupElement(group, members.length);
    for (const node of members) {
      groupMarkup.append(nodeElement(node, false));
    }
    elements.push(groupMarkup);
  }
  for (const edge of graph.edges) elements.push(edgeElement(edge));
  for (const node of graph.nodes) {
    if (!node.groupId) elements.push(nodeElement(node));
  }
  return elements;
}

/**
 * @param {Element} element
 * @param {SukiGeometry} geometry
 * @returns {SukiGraph}
 */
function graphFromElement(element, geometry = readGeometryAttributes(element)) {
  const groupedNodes = [...element.querySelectorAll(":scope > section")].flatMap((groupMarkup) => {
    const groupId = sukiIdFromValue(groupMarkup.id) ?? groupMarkup.id;
    return [...groupMarkup.querySelectorAll(":scope > suki-node")].map((nodeMarkup) => nodeFromElement(nodeMarkup, groupId));
  });
  const graph = {
    groups: [...element.querySelectorAll(":scope > section")].map((groupMarkup) => groupFromElement(groupMarkup, geometry)),
    edges: [...element.querySelectorAll(":scope > suki-edge")].map(edgeFromElement),
    nodes: groupedNodes.concat([...element.querySelectorAll(":scope > suki-node")].map((nodeMarkup) => nodeFromElement(nodeMarkup))),
  };
  updateGroupGeometry(graph, geometry);
  return normalizeGraph(graph);
}

/**
 * @param {SukiGraph} sourceGraph
 * @param {SukiGeometry} geometry
 * @param {number} padding
 * @returns {SVGSVGElement}
 */
function graphToSvgDocument(sourceGraph, geometry = defaultGeometry(), padding = 0) {
  const graph = cloneGraph(sourceGraph);
  updateGroupGeometry(graph, geometry);
  const viewBox = getGraphContentViewBox(graph, geometry, padding);
  const svg = /** @type {SVGSVGElement} */ (document.createElementNS(SVG_NS, "svg"));
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", formatSvgNumber(viewBox.width));
  svg.setAttribute("height", formatSvgNumber(viewBox.height));
  svg.setAttribute("viewBox", `${formatSvgNumber(viewBox.x)} ${formatSvgNumber(viewBox.y)} ${formatSvgNumber(viewBox.width)} ${formatSvgNumber(viewBox.height)}`);

  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = EXPORTED_SVG_STYLE;

  const viewport = document.createElementNS(SVG_NS, "g");
  viewport.classList.add("suki-viewport");
  const groupsLayer = document.createElementNS(SVG_NS, "g");
  groupsLayer.classList.add("suki-groups");
  const edgesLayer = document.createElementNS(SVG_NS, "g");
  edgesLayer.classList.add("suki-edges");
  const nodesLayer = document.createElementNS(SVG_NS, "g");
  nodesLayer.classList.add("suki-nodes");
  const edgeLabelsLayer = document.createElementNS(SVG_NS, "g");
  edgeLabelsLayer.classList.add("suki-edge-labels");

  for (const group of graph.groups) {
    const element = document.createElementNS(SVG_NS, "g");
    renderSvgGroup(element, group, false, false, 0, 0, geometry);
    groupsLayer.append(element);
  }
  for (const edge of graph.edges) {
    const element = document.createElementNS(SVG_NS, "g");
    renderSvgEdge(element, graph, edge, false);
    edgesLayer.append(element);
  }
  for (const node of graph.nodes) {
    const element = document.createElementNS(SVG_NS, "g");
    renderSvgNode(element, node, false, false, 0, geometry);
    nodesLayer.append(element);
  }
  for (const edge of graph.edges) {
    if (!edge.label) continue;
    const element = document.createElementNS(SVG_NS, "g");
    renderSvgEdgeLabel(element, graph, edge);
    edgeLabelsLayer.append(element);
  }

  viewport.append(groupsLayer, edgesLayer, nodesLayer, edgeLabelsLayer);
  svg.append(style, viewport);
  for (const element of svg.querySelectorAll("*")) {
    for (const { name } of [...element.attributes]) {
      if (name.startsWith("data-")) element.removeAttribute(name);
    }
  }
  return svg;
}

class SukiCircleElement extends HTMLElement {
  constructor() {
    super();

    /** @type {SukiGraph} */
    this.graph = {
      groups: [],
      nodes: [],
      edges: [],
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
    /** @type {SukiGeometry} */
    this.geometry = defaultGeometry();
    updateGroupGeometry(this.graph, this.geometry);

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
    /** @type {object | null} */
    this.edit = null;
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
    this.geometry = readGeometryAttributes(this);
    if (urlInitialState?.documentId) this.id = urlInitialState.documentId;
    this.documentName = urlInitialState?.documentName || this.readInitialDocumentNameFromMarkup();
    const initialGraph = urlInitialState?.graph || this.readInitialGraphFromMarkup();
    const presentationStyle = presentationStyleElement(this.geometry);
    const navigation = this.readInitialNavigationFromMarkup();
    if (initialGraph) {
      this.graph = initialGraph;
      this.selectedId = null;
      updateGroupGeometry(this.graph, this.geometry);
    }

    this.innerHTML = `
      <section class="suki-shell" aria-label="スキサークル">
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
    this.prepend(presentationStyle);
    this.querySelector(".suki-shell")?.prepend(navigation);

    this.addEventListener("click", this);
    this.addEventListener("input", this);
    this.addEventListener("pointerdown", this);
    window.addEventListener("pointermove", this);
    window.addEventListener("pointerup", this);
    window.addEventListener("pointercancel", this);
    window.addEventListener("popstate", this);
    window.addEventListener("hashchange", this);
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
    if (!this.querySelector(":scope > section, :scope > suki-node, :scope > suki-edge")) return null;
    return graphFromElement(this, this.geometry);
  }

  /**
   * @returns {string}
   */
  readInitialDocumentNameFromMarkup() {
    return this.getAttribute("title")?.trim() || "スキサークル";
  }

  /**
   * @returns {HTMLElement}
   */
  readInitialNavigationFromMarkup() {
    const navigation = this.querySelector(":scope > nav")?.cloneNode(true);
    const element = navigation instanceof HTMLElement ? navigation : this.createDefaultNavigationElement();
    element.classList.add("suki-toolbar");
    element.querySelector("[data-action='document-name']")?.classList.add("suki-document-name");
    return element;
  }

  /**
   * @returns {HTMLElement}
   */
  createDefaultNavigationElement() {
    const element = document.createElement("nav");
    element.innerHTML = `
      <input class="suki-document-name" name="documentName" data-action="document-name" aria-label="ドキュメント名" value="スキサークル" />
      <button type="button" data-action="layout">自動配置</button>
      <button type="button" data-action="reset">リセット</button>
      <button type="button" data-action="export-svg">保存</button>
    `;
    return element;
  }

  disconnectedCallback() {
    window.removeEventListener("pointermove", this);
    window.removeEventListener("pointerup", this);
    window.removeEventListener("pointercancel", this);
    window.removeEventListener("popstate", this);
    window.removeEventListener("hashchange", this);
    this.resizeObserver?.disconnect();
    this.addHint = null;
  }

  /**
   * @param {Event} event
   */
  handleEvent(event) {
    if (event.type === "popstate" || event.type === "hashchange") {
      this.undoStack = [];
      location.reload();
      return;
    }
    if (typeof SukiCircleEdit === "function" && !this.edit) this.edit = new SukiCircleEdit(this);
    if (typeof SukiCircleEdit === "function") this.edit.handleEvent(event);
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
    if (typeof SukiCircleEdit === "function" && !this.edit) this.edit = new SukiCircleEdit(this);
    const editingEnabled = typeof SukiCircleEdit === "function";
    const canvas = this.getCanvas();
    const disableAnimation = editingEnabled && Boolean(this.drag);
    if (disableAnimation) {
      canvas.classList.add("is-animation-disabled");
      for (const element of canvas.querySelectorAll("[data-suki-animation]")) element.remove();
      canvas.getBoundingClientRect();
    }
    if (!options.freezeGroups) updateGroupGeometry(this.graph, this.geometry);
    this.updateCanvasViewBox();

    const undoButton = this.querySelector('[data-action="undo"]');
    if (undoButton instanceof HTMLButtonElement) {
      undoButton.hidden = !editingEnabled;
      undoButton.disabled = this.undoStack.length === 0;
    }

    const groupsLayer = this.querySelector(".suki-groups");
    const nodesLayer = this.querySelector(".suki-nodes");
    const edgesLayer = this.querySelector(".suki-edges");
    const edgeLabelsLayer = this.querySelector(".suki-edge-labels");
    const edgeHitAreasLayer = this.querySelector(".suki-edge-hit-areas");
    const nodeActionsLayer = this.querySelector(".suki-node-actions");
    if (!groupsLayer || !nodesLayer || !edgesLayer || !edgeLabelsLayer || !edgeHitAreasLayer || !nodeActionsLayer) return;
    const moveDuration = editingEnabled && !disableAnimation ? SukiCircleEdit.MOVE_ANIMATION_MS : 0;
    const resizeDuration = editingEnabled && !disableAnimation ? SukiCircleEdit.GROUP_RESIZE_ANIMATION_MS : 0;

    const draftGroup = typeof SukiCircleEdit === "function" ? this.edit.getDraftGroup() : null;
    const renderedGroups = draftGroup ? [...this.graph.groups, draftGroup] : this.graph.groups;
    const groupElements = syncSvgLayerElements(groupsLayer, ".suki-group", "g", renderedGroups.map((group) => group.id));
    for (const group of renderedGroups) {
      const element = groupElements.get(group.id);
      if (element) renderSvgGroup(
        element,
        group,
        editingEnabled && this.selectedId === group.id,
        editingEnabled && (group.id === SukiCircleEdit.DRAFT_GROUP_ID || this.pendingConnectionId === group.id),
        moveDuration,
        resizeDuration,
        this.geometry,
      );
    }

    const edgeElements = syncSvgLayerElements(edgesLayer, ".suki-edge", "g", this.graph.edges.map((edge) => edge.id));
    for (const edge of this.graph.edges) {
      const element = edgeElements.get(edge.id);
      if (element) renderSvgEdge(element, this.graph, edge, editingEnabled && this.selectedId === edge.id);
    }

    const nodeElements = syncSvgLayerElements(nodesLayer, ".suki-node", "g", this.graph.nodes.map((node) => node.id));
    for (const node of this.graph.nodes) {
      const element = nodeElements.get(node.id);
      if (element) renderSvgNode(element, node, editingEnabled && this.selectedId === node.id, editingEnabled && this.pendingConnectionId === node.id, moveDuration, this.geometry);
    }

    const edgeLabelElements = syncSvgLayerElements(
      edgeLabelsLayer,
      ".suki-edge-label-item",
      "g",
      this.graph.edges.filter((edge) => edge.label).map((edge) => edge.id),
    );
    for (const edge of this.graph.edges) {
      const element = edgeLabelElements.get(edge.id);
      if (element) renderSvgEdgeLabel(element, this.graph, edge);
    }

    if (!editingEnabled) {
      edgeHitAreasLayer.replaceChildren();
      nodeActionsLayer.replaceChildren();
      return;
    }

    const edgeHitAreaElements = syncSvgLayerElements(edgeHitAreasLayer, ".suki-edge-hit-area", "g", this.graph.edges.map((edge) => edge.id));
    for (const edge of this.graph.edges) {
      const element = edgeHitAreaElements.get(edge.id);
      if (element) renderSvgEdgeHitArea(element, this.graph, edge);
    }

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
      if (element) renderSvgNodeAction(element, actionNode, this.geometry);
    }
    if (actionEdge) {
      const element = actionElements.get(actionEdge.id);
      if (element) renderSvgEdgeDeleteAction(element, this.graph, actionEdge);
    }
    if (actionGroup) {
      const element = actionElements.get(actionGroup.id);
      if (element) renderSvgGroupAction(element, actionGroup, this.geometry);
    }

    let addHintElement = nodeActionsLayer.querySelector(".suki-add-hint");
    if (this.addHint) {
      if (!(addHintElement instanceof SVGElement)) {
        addHintElement = document.createElementNS(SVG_NS, "g");
        nodeActionsLayer.append(addHintElement);
      }
      renderSvgAddHint(addHintElement, this.addHint);
    } else {
      addHintElement?.remove();
    }

    if (typeof SukiCircleEdit === "function") {
      this.edit.positionNodeEditor();
      this.edit.renderInspector();
    }
    if (!this.drag) {
      canvas.classList.remove("is-animation-disabled");
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
    const canvas = /** @type {SVGSVGElement} */ (document.createElementNS(SVG_NS, "svg"));
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
    const gridSize = typeof SukiCircleEdit === "function" ? SukiCircleEdit.GRID_SIZE : 32;
    const gridSizeX = gridSize * scaleX;
    const gridSizeY = gridSize * scaleY;
    const workspace = this.querySelector(".suki-workspace");
    if (!(workspace instanceof HTMLElement)) return;
    workspace.style.setProperty("--suki-grid-size-x", `${gridSizeX}px`);
    workspace.style.setProperty("--suki-grid-size-y", `${gridSizeY}px`);
    workspace.style.setProperty("--suki-grid-x", `${(-this.viewBox.x * scaleX) % gridSizeX}px`);
    workspace.style.setProperty("--suki-grid-y", `${(-this.viewBox.y * scaleY) % gridSizeY}px`);
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
      const box = getGroupBox(group, this.geometry);
      return isPointInsideBox(box, x, y);
    }) || null;
  }
}

customElements.define("suki-circle", SukiCircleElement);
