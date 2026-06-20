/*
 * SPDX-FileCopyrightText: 2026 Kaito Udagawa
 *
 * SPDX-License-Identifier: Apache-2.0
 */

let sukiCircleReadonlyScriptPromise = null;

/**
 * @returns {string}
 */
function makeId() {
  return SukiCircleEdit.ID_ALPHABET[Math.floor(Math.random() * SukiCircleEdit.ID_ALPHABET.length)]
    + SukiCircleEdit.ID_ALPHABET[Math.floor(Math.random() * SukiCircleEdit.ID_ALPHABET.length)];
}

/**
 * @param {SukiGraph} graph
 * @returns {string}
 */
function makeUniqueId(graph) {
  let id = makeId();
  while (findEntity(graph, id)) {
    id = makeId();
  }
  return id;
}

/**
 * @returns {string}
 */
function makeDocumentId() {
  let id = "";
  for (let index = 0; index < 5; index += 1) {
    id += SukiCircleEdit.ID_ALPHABET[Math.floor(Math.random() * SukiCircleEdit.ID_ALPHABET.length)];
  }
  return `sc-${id}`;
}

/**
 * @param {SukiEdge} edge
 * @returns {string}
 */
function getEdgeColor(edge) {
  return edge.color || SukiCircleEdit.DEFAULT_EDGE_COLOR;
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {string | number} from
 * @param {string | number} to
 * @param {number} duration
 */
function animateSvgAttributeElement(element, name, from, to, duration) {
  if (String(from) === String(to)) return;

  for (const animation of element.querySelectorAll(`animate[data-suki-animation="${name}"]`)) {
    animation.remove();
  }
  const animation = document.createElementNS(SVG_NS, "animate");
  animation.dataset.sukiAnimation = name;
  animation.setAttribute("attributeName", name);
  animation.setAttribute("from", from);
  animation.setAttribute("to", to);
  animation.setAttribute("dur", `${duration}ms`);
  animation.setAttribute("fill", "freeze");
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
function animateSvgTransformElement(element, fromX, fromY, toX, toY, duration) {
  if (fromX === toX && fromY === toY) return;

  for (const animation of element.querySelectorAll('animateTransform[data-suki-animation="transform"]')) {
    animation.remove();
  }
  const animation = document.createElementNS(SVG_NS, "animateTransform");
  animation.dataset.sukiAnimation = "transform";
  animation.setAttribute("attributeName", "transform");
  animation.setAttribute("type", "translate");
  animation.setAttribute("from", `${fromX} ${fromY}`);
  animation.setAttribute("to", `${toX} ${toY}`);
  animation.setAttribute("dur", `${duration}ms`);
  animation.setAttribute("fill", "freeze");
  element.append(animation);
  if ("beginElement" in animation) animation.beginElement();
  window.setTimeout(() => animation.remove(), duration + 50);
}

/**
 * @returns {Promise<string | null>}
 */
const loadReadonlyScript = () => {
  if (sukiCircleReadonlyScriptPromise) return sukiCircleReadonlyScriptPromise;
  const editScript = [...document.scripts].find((script) => {
    return script.src && new URL(script.src, location.href).pathname.endsWith("/suki-circle.edit.js");
  });
  const url = new URL("suki-circle.min.js", editScript?.src ?? location.href);
  sukiCircleReadonlyScriptPromise = fetch(url).then((response) => {
    if (!response.ok) throw new Error("スクリプトを取得できませんでした。");
    return response.text();
  }).catch(() => null);
  return sukiCircleReadonlyScriptPromise;
};

/**
 * @param {string} source
 * @returns {string}
 */
const prettyPrintSvg = (source) => {
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
};

/**
 * @returns {Promise<string>}
 */
const createReadonlyScript = async () => {
  const source = await loadReadonlyScript();
  if (!source) throw new Error("読み取り専用HTML用のスクリプトを取得できませんでした。");
  return source;
};

/**
 * @param {string} documentName
 * @param {string} circleMarkup
 * @returns {Promise<string>}
 */
const createReadonlyHtml = async (documentName, circleMarkup) => {
  const script = (await createReadonlyScript()).replace(/<\/script/gi, "<\\/script");
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
};
suki-circle {
  display: grid;
  min-block-size: calc(100dvh - 2rem);
  place-items: center;
}
suki-circle > section,
suki-circle > suki-node,
suki-circle > suki-edge {
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
const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("画像を生成できませんでした。")), { once: true });
    image.src = url;
  });
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number | undefined} quality
 * @returns {Promise<Blob | null>}
 */
const canvasToBlob = (canvas, type, quality) => {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
};

class SukiCircleEdit {
  static ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  static GROUP_PALETTE = ["#5fb2cb", "#f08a6b", "#79a96b", "#c88dd8", "#e0b94f"];
  static DEFAULT_EDGE_COLOR = "#4f5653";
  static CANVAS_PADDING = 96;
  static DRAG_START_THRESHOLD = 10;
  static ZOOM_STEP = 0.8;
  static DOUBLE_TAP_MS = 320;
  static DOUBLE_TAP_DISTANCE = 24;
  static ADD_HINT_RADIUS = 34;
  static NODE_EDIT_TAP_COUNT = 3;
  static NODE_EJECT_SPEED = 1.8;
  static NODE_EJECT_MARGIN = 24;
  static DRAFT_GROUP_ID = "__draft-group";
  static GRID_SIZE = 32;
  static UNDO_LIMIT = 80;
  static GROUP_LAYOUT_SPACING = 140;
  static GROUP_LAYOUT_RELAXATION = 0.35;
  static LOOSE_LAYOUT_RELAXATION = SukiCircleEdit.GROUP_LAYOUT_RELAXATION / 4;
  static NODE_LABEL_CANDIDATES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
  static MOVE_ANIMATION_MS = 180;
  static GROUP_RESIZE_ANIMATION_MS = 520;
  static SAVE_SPINNER_MIN_MS = 150;
  static SAVE_SPINNER_MAX_MS = 1500;
  static SAVE_SPINNER_CURVE_NODES = 18;
  static SVG_VIEWBOX_PADDING = 36;

  /**
   * @param {Element} element
   * @param {string} name
   * @param {string | number} from
   * @param {string | number} to
   * @param {number} duration
   */
  static animateSvgAttribute(element, name, from, to, duration) {
    animateSvgAttributeElement(element, name, from, to, duration);
  }

  /**
   * @param {SVGElement} element
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @param {number} duration
   */
  static animateSvgTransform(element, fromX, fromY, toX, toY, duration) {
    animateSvgTransformElement(element, fromX, fromY, toX, toY, duration);
  }

  /**
   * @param {HTMLElement} circleElement
   */
  constructor(circleElement) {
    this.rootElement = circleElement;
  }

  /**
   * @param {Event} event
   */
  handleEvent(event) {
    const root = this.rootElement;
    if (event.type === "click") this.onClick(event);
    if (event.type === "input") this.onInput(event);
    if (event.type === "pointerdown") this.onPointerDown(event);
    if (event.type === "pointermove") this.onPointerMove(event);
    if (event.type === "pointerup" || event.type === "pointercancel") this.onPointerUp(event);
    if (event.type === "wheel") this.onWheel(event);
    if (event.type === "touchmove") this.onTouchMove(event);
    if (event.type === "keydown") this.onKeyDown(event);
    if (event.type === "gesturestart" || event.type === "gesturechange" || event.type === "gestureend") this.onGesture(event);
  }

  /**
   * @param {Event} event
   */
  onClick(event) {
    const root = this.rootElement;
    const target = /** @type {Element} */ (event.target);
    if (target.closest(".suki-node-editor")) return;
    if (root.suppressNextClickAfterEditing) {
      root.suppressNextClickAfterEditing = false;
      return;
    }

    const actionButton = target.closest("[data-action]");
    const entity = target.closest("[data-entity-kind]");

    if (root.suppressNextCanvasClick && target.closest(".suki-canvas") && !actionButton && !entity) {
      root.suppressNextCanvasClick = false;
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
      root.selectedId = actionButton.dataset.id || root.selectedId;
      root.visibleNodeActionId = null;
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

    if (actionButton instanceof Element && actionButton.dataset.action === "share-svg-preview") {
      void this.shareSvgPreview();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "share-html-preview") {
      void this.shareHtmlPreview();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "share-png-preview") {
      void this.sharePngPreview();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "share-jpeg-preview") {
      void this.shareJpegPreview();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "share-url") {
      void this.shareUrl();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "undo") {
      this.undo();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "zoom-in") {
      this.zoomCanvas(SukiCircleEdit.ZOOM_STEP);
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "zoom-out") {
      this.zoomCanvas(1 / SukiCircleEdit.ZOOM_STEP);
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "reset-view") {
      root.resetNonGraphState();
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
      root.selectedId = actionButton.dataset.id || root.selectedId;
      this.deleteSelected();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "layout") {
      root.updateCanvasViewBox();
      this.pushUndoSnapshot();
      root.graph = autoLayout(root.graph, {
        x: root.viewBox.x,
        y: root.viewBox.y,
        width: root.viewBox.width,
        height: root.viewBox.height,
      }, root.geometry);
      root.render();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "reset") {
      location.href = `${location.pathname}${location.search}`;
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "export-svg") {
      void this.save();
      return;
    }

    if (actionButton instanceof Element && actionButton.dataset.action === "delete") {
      root.selectedId = actionButton.dataset.id || root.selectedId;
      this.deleteSelected();
      return;
    }

    if (entity instanceof SVGElement && entity.dataset.id) {
      if (root.suppressNextEntityClickId === entity.dataset.id) {
        root.suppressNextEntityClickId = null;
        return;
      }
      root.lastCanvasTap = null;
      root.lastNodeTap = null;
      this.selectEntity(entity.dataset.id);
      return;
    }

    if (target.closest(".suki-canvas")) {
      if (root.suppressNextCanvasClick) {
        root.suppressNextCanvasClick = false;
        return;
      }
      this.onCanvasClick(/** @type {PointerEvent} */ (event));
    }
  }

  /**
   * @param {Event} event
   */
  onInput(event) {
    const root = this.rootElement;
    const input = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
    if (input instanceof HTMLInputElement && input.dataset.action === "document-name") {
      this.pushUndoSnapshot();
      root.documentName = input.value;
      document.title = root.documentName || "スキサークル";
      return;
    }

    if (input instanceof HTMLInputElement && input.dataset.action === "node-color-picker") {
      this.applyPickedColor(input);
      return;
    }

    const entity = root.selectedId ? findEntity(root.graph, root.selectedId) : null;
    if (!entity || !input.name) return;

    this.pushUndoSnapshot();
    if (input.name === "label") {
      const kind = getEntityKind(root.graph, entity);
      entity.label = kind === "node" ? input.value.trim().slice(0, 1) : input.value;
    }
    if (input.name === "color") {
      const kind = getEntityKind(root.graph, entity);
      if (kind === "edge") {
        /** @type {SukiEdge} */ (entity).color = input.value;
      } else if ("color" in entity) {
        entity.color = input.value;
      }
    }
    if (input.name === "groupId" && "groupId" in entity) entity.groupId = input.value || null;
    root.render();
  }

  /**
   * @param {Event} event
   */
  onWheel(event) {
    const wheel = /** @type {WheelEvent} */ (event);
    if (wheel.ctrlKey || wheel.metaKey) wheel.preventDefault();
  }

  /**
   * @param {Event} event
   */
  onGesture(event) {
    event.preventDefault();
  }

  /**
   * @param {Event} event
   */
  onTouchMove(event) {
    const touch = /** @type {TouchEvent} */ (event);
    if (touch.touches.length > 1) touch.preventDefault();
  }

  /**
   * @param {Event} event
   */
  onKeyDown(event) {
    const keyboard = /** @type {KeyboardEvent} */ (event);
    if (!keyboard.ctrlKey && !keyboard.metaKey) return;
    const zoomKeys = ["+", "-", "=", "0"];
    const zoomCodes = ["Equal", "Minus", "Digit0", "NumpadAdd", "NumpadSubtract", "Numpad0"];
    if (zoomKeys.includes(keyboard.key) || zoomCodes.includes(keyboard.code)) keyboard.preventDefault();
  }

  /**
   * @param {Event} event
   */
  onPointerDown(event) {
    const root = this.rootElement;
    const pointer = /** @type {PointerEvent} */ (event);
    const target = /** @type {Element} */ (event.target);
    if (root.activePointers.has(pointer.pointerId)) return;
    if (root.activePointers.size >= 2) {
      pointer.preventDefault();
      return;
    }
    root.activePointers.add(pointer.pointerId);
    root.activePointerPositions.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY });
    if (root.activePointers.size === 2) {
      pointer.preventDefault();
      root.lastNodeTap = null;
      this.startCanvasPinch(pointer);
      return;
    }
    if (root.editingNodeId) {
      if (target.closest(".suki-node-editor")) return;
      pointer.preventDefault();
      this.commitNodeEditing();
      root.suppressNextClickAfterEditing = true;
      return;
    }

    const actionButton = target.closest("[data-action]");
    const entityElement = target.closest("[data-entity-kind]");
    root.pointerDownSelectedId = null;
    if (root.pendingConnectionId) {
      if (entityElement instanceof SVGElement && entityElement.dataset.id) {
        const node = root.graph.nodes.find((item) => item.id === entityElement.dataset.id);
        pointer.preventDefault();
        if (node) {
          this.selectEntity(entityElement.dataset.id);
        } else {
          root.pendingConnectionId = null;
          root.visibleNodeActionId = null;
          root.render();
        }
        return;
      }
      if (target.closest(".suki-canvas") && !actionButton) {
        pointer.preventDefault();
        root.pendingConnectionId = null;
        root.visibleNodeActionId = null;
        root.render();
      }
      return;
    }
    if (!(entityElement instanceof SVGElement) || !entityElement.dataset.id) {
      if (target.closest(".suki-canvas") && !entityElement && !actionButton) {
        root.lastNodeTap = null;
        this.startCanvasPan(pointer);
      }
      return;
    }

    const entity = findEntity(root.graph, entityElement.dataset.id);
    if (!entity) return;
    this.clearAddHint();
    const entityKind = getEntityKind(root.graph, entity);
    if (entityKind === "edge") {
      pointer.preventDefault();
      root.suppressNextEntityClickId = entity.id;
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
    root.pointerDownSelectedId = root.selectedId;
    const entityIsNode = entityKind === "node";
    root.visibleNodeActionId = entityIsNode && root.selectedId === entity.id ? entity.id : null;
    const originalGroup = "groupId" in entity && entity.groupId
      ? root.graph.groups.find((group) => group.id === entity.groupId) || null
      : null;
    const startPoint = root.getCanvasPoint(pointer);
    root.selectedId = entity.id;
    root.drag = {
      pointerId: pointer.pointerId,
      id: entity.id,
      startX: startPoint.x,
      startY: startPoint.y,
      previousX: pointer.clientX,
      previousY: pointer.clientY,
      previousTime: performance.now(),
      lastSpeed: 0,
      startTime: performance.now(),
      entityX: entity.x,
      entityY: entity.y,
      memberStarts: getEntityKind(root.graph, entity) === "group"
        ? getGroupMembers(root.graph, entity.id).map((node) => ({ id: node.id, x: node.x, y: node.y }))
        : [],
      originalGroupId: originalGroup?.id || null,
      originalGroupBox: originalGroup ? getGroupBox(originalGroup, root.geometry) : null,
      groupBoxes: root.graph.groups.map((group) => ({ id: group.id, ...getGroupBox(group, root.geometry) })),
      proposedGroupNodeId: null,
      ejected: false,
      active: false,
      historySaved: false,
    };
    root.render();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  applyDragUpdate(clientX, clientY) {
    const root = this.rootElement;
    if (!root.drag) return;

    const entity = findEntity(root.graph, root.drag.id);
    if (!entity) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - root.drag.previousTime);
    root.drag.lastSpeed = Math.hypot(clientX - root.drag.previousX, clientY - root.drag.previousY) / elapsed;
    root.drag.previousX = clientX;
    root.drag.previousY = clientY;
    root.drag.previousTime = now;

    const point = root.getCanvasPoint({ clientX, clientY });
    const dx = point.x - root.drag.startX;
    const dy = point.y - root.drag.startY;
    if (!root.drag.active) {
      if (Math.hypot(dx, dy) < SukiCircleEdit.DRAG_START_THRESHOLD) return;
      root.drag.active = true;
      if (!root.drag.historySaved) {
        this.pushUndoSnapshot();
        root.drag.historySaved = true;
      }
      root.visibleNodeActionId = null;
      root.pointerDownSelectedId = null;
      root.suppressNextCanvasClick = true;
    }

    entity.x = root.drag.entityX + dx;
    entity.y = root.drag.entityY + dy;
    for (const start of root.drag.memberStarts) {
      const node = root.graph.nodes.find((item) => item.id === start.id);
      if (!node) continue;
      node.x = start.x + dx;
      node.y = start.y + dy;
    }
    const membershipChanged = this.updateDraggedNodeMembership(entity);
    this.updateDraftGroupCandidate(entity);
    root.render({ freezeGroups: membershipChanged });
    if (membershipChanged) root.render();
  }

  /**
   * @param {SukiEntity} entity
   * @returns {boolean}
   */
  updateDraggedNodeMembership(entity) {
    const root = this.rootElement;
    if (!root.drag || !("groupId" in entity)) {
      return false;
    }

    const containingGroupBox = root.drag.groupBoxes.find((box) => {
      return isPointInsideBox(box, entity.x, entity.y);
    });
    if (containingGroupBox && !entity.groupId) {
      entity.groupId = containingGroupBox.id;
      root.drag.ejected = false;
      return true;
    }

    if (
      !root.drag.ejected
      && entity.groupId
      && root.drag.originalGroupId
      && root.drag.originalGroupBox
      && root.drag.lastSpeed >= SukiCircleEdit.NODE_EJECT_SPEED
      && !isPointInsideBox(root.drag.originalGroupBox, entity.x, entity.y, SukiCircleEdit.NODE_EJECT_MARGIN)
    ) {
      if (getGroupMembers(root.graph, entity.groupId).length <= 1) return false;
      entity.groupId = null;
      root.drag.ejected = true;
      return true;
    }

    return false;
  }

  /**
   * @param {SukiEntity} entity
   */
  updateDraftGroupCandidate(entity) {
    const root = this.rootElement;
    if (!root.drag || !("groupId" in entity)) return;
    if (entity.groupId) {
      root.drag.proposedGroupNodeId = null;
      return;
    }

    const nearest = root.graph.nodes
      .filter((node) => node.id !== entity.id && !node.groupId)
      .map((node) => ({
        node,
        distance: Math.hypot(node.x - entity.x, node.y - entity.y),
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.node.id.localeCompare(right.node.id);
      })[0];

    root.drag.proposedGroupNodeId = nearest && nearest.distance <= root.geometry.nodeRadius * 2
      ? nearest.node.id
      : null;
  }

  commitDraftGroup() {
    const root = this.rootElement;
    if (!root.drag?.proposedGroupNodeId) return;

    const draggedNode = root.graph.nodes.find((node) => node.id === root.drag?.id);
    const pairedNode = root.graph.nodes.find((node) => node.id === root.drag?.proposedGroupNodeId);
    if (!draggedNode || !pairedNode || draggedNode.groupId || pairedNode.groupId) return;
    if (Math.hypot(pairedNode.x - draggedNode.x, pairedNode.y - draggedNode.y) > root.geometry.nodeRadius * 2) return;
    if (!root.drag.historySaved) {
      this.pushUndoSnapshot();
      root.drag.historySaved = true;
    }

    const group = {
      id: makeUniqueId(root.graph),
      label: `グループ${root.graph.groups.length + 1}`,
      x: 0,
      y: 0,
      width: root.geometry.groupMinWidth,
      height: root.geometry.groupMinHeight,
      color: SukiCircleEdit.GROUP_PALETTE[root.graph.groups.length % SukiCircleEdit.GROUP_PALETTE.length],
    };
    root.graph.groups.push(group);
    draggedNode.groupId = group.id;
    pairedNode.groupId = group.id;
    Object.assign(group, getGroupGeometryForMembers([draggedNode, pairedNode], root.geometry));
    root.selectedId = group.id;
    root.visibleNodeActionId = null;
  }

  /**
   * @param {Event} event
   */
  onPointerMove(event) {
    const root = this.rootElement;
    const pointer = /** @type {PointerEvent} */ (event);
    if (root.activePointers.has(pointer.pointerId)) {
      root.activePointerPositions.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY });
    }
    if (root.pinch) {
      pointer.preventDefault();
      this.applyCanvasPinch();
      return;
    }
    if (root.pan?.pointerId === pointer.pointerId) {
      pointer.preventDefault();
      this.applyCanvasPan(pointer.clientX, pointer.clientY);
      return;
    }
    if (!root.drag) return;
    if (root.drag.pointerId !== pointer.pointerId) return;

    pointer.preventDefault();
    this.applyDragUpdate(pointer.clientX, pointer.clientY);
  }

  /**
   * @param {Event} event
   */
  onPointerUp(event) {
    const root = this.rootElement;
    const pointer = /** @type {PointerEvent} */ (event);
    root.activePointers.delete(pointer.pointerId);
    root.activePointerPositions.delete(pointer.pointerId);
    if (root.pinch) {
      pointer.preventDefault();
      root.pinch = null;
      root.suppressNextCanvasClick = true;
      return;
    }
    if (root.pan?.pointerId === pointer.pointerId) {
      this.applyCanvasPan(pointer.clientX, pointer.clientY);
      root.suppressNextCanvasClick = root.pan.moved;
      root.pan = null;
      root.getCanvas().classList.remove("is-panning");
      return;
    }
    if (!root.drag) return;
    if (root.drag.pointerId !== pointer.pointerId) return;

    this.applyDragUpdate(pointer.clientX, pointer.clientY);
    if (root.drag.active) {
      this.commitDraftGroup();
      root.pointerDownSelectedId = null;
      root.suppressNextCanvasClick = true;
    } else {
      root.suppressNextEntityClickId = root.drag.id;
      root.pointerDownSelectedId = null;
      root.drag = null;
      return;
    }
    root.pointerDownSelectedId = null;
    root.drag = null;
    root.render();
    this.scheduleUrlHashUpdate();
  }

  /**
   * @param {PointerEvent} pointer
   */
  startCanvasPan(pointer) {
    const root = this.rootElement;
    this.startCanvasPanFrom(pointer, pointer.clientX, pointer.clientY);
  }

  /**
   * @param {PointerEvent} pointer
   * @param {number} startX
   * @param {number} startY
   */
  startCanvasPanFrom(pointer, startX, startY) {
    const root = this.rootElement;
    const canvas = root.getCanvas();
    if (!root.viewBox.initialized) root.updateCanvasViewBox();
    pointer.preventDefault();
    canvas.setPointerCapture(pointer.pointerId);
    canvas.classList.add("is-panning");
    root.pan = {
      pointerId: pointer.pointerId,
      startX,
      startY,
      viewX: root.viewBox.x,
      viewY: root.viewBox.y,
      moved: false,
    };
  }

  clearAddHint() {
    const root = this.rootElement;
    root.addHint = null;
  }

  /**
   * @param {PointerEvent} pointer
   */
  startCanvasPinch(pointer) {
    const root = this.rootElement;
    const pointerIds = [...root.activePointers].slice(0, 2);
    const points = pointerIds.map((id) => root.activePointerPositions.get(id));
    if (pointerIds.length < 2 || !points[0] || !points[1]) return;

    if (!root.viewBox.initialized) root.updateCanvasViewBox();
    pointer.preventDefault();
    root.getCanvas().setPointerCapture(pointer.pointerId);
    root.getCanvas().classList.remove("is-panning");
    root.drag = null;
    root.pan = null;
    root.pinch = {
      pointerIds: /** @type {[number, number]} */ (pointerIds),
      previousMidpointX: (points[0].x + points[1].x) / 2,
      previousMidpointY: (points[0].y + points[1].y) / 2,
      previousDistance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)),
    };
    root.suppressNextCanvasClick = true;
  }

  applyCanvasPinch() {
    const root = this.rootElement;
    if (!root.pinch) return;
    const [firstId, secondId] = root.pinch.pointerIds;
    const first = root.activePointerPositions.get(firstId);
    const second = root.activePointerPositions.get(secondId);
    if (!first || !second) return;

    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const midpointX = (first.x + second.x) / 2;
    const midpointY = (first.y + second.y) / 2;
    const factor = Math.min(2, Math.max(0.5, root.pinch.previousDistance / distance));
    const dx = midpointX - root.pinch.previousMidpointX;
    const dy = midpointY - root.pinch.previousMidpointY;
    root.pinch.previousDistance = distance;
    root.pinch.previousMidpointX = midpointX;
    root.pinch.previousMidpointY = midpointY;
    this.applyCanvasZoomStep(midpointX, midpointY, factor);
    this.applyCanvasPanStep(dx, dy);
  }

  /**
   * @param {number} dx
   * @param {number} dy
   */
  applyCanvasPanStep(dx, dy) {
    const root = this.rootElement;
    if (dx === 0 && dy === 0) return;

    const canvas = root.getCanvas();
    const scaleX = root.viewBox.width / Math.max(1, canvas.clientWidth);
    const scaleY = root.viewBox.height / Math.max(1, canvas.clientHeight);
    root.viewBox.x = root.clampViewBoxX(root.viewBox.x - dx * scaleX);
    root.viewBox.y = root.clampViewBoxY(root.viewBox.y - dy * scaleY);
    root.applyCanvasViewBox();
  }

  /**
   * @param {number} factor
   */
  zoomCanvas(factor) {
    const root = this.rootElement;
    const canvas = root.getCanvas();
    const rect = canvas.getBoundingClientRect();
    this.applyCanvasZoomStep(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} factor
   */
  applyCanvasZoomStep(clientX, clientY, factor) {
    const root = this.rootElement;
    const canvas = root.getCanvas();
    if (!root.viewBox.initialized) root.updateCanvasViewBox();

    const rect = canvas.getBoundingClientRect();
    const viewWidth = Math.max(1, root.viewBox.width);
    const viewHeight = Math.max(1, root.viewBox.height);
    const focusX = root.viewBox.x + (clientX - rect.left) * viewWidth / Math.max(1, canvas.clientWidth);
    const focusY = root.viewBox.y + (clientY - rect.top) * viewHeight / Math.max(1, canvas.clientHeight);
    const focusRatioX = (focusX - root.viewBox.x) / viewWidth;
    const focusRatioY = (focusY - root.viewBox.y) / viewHeight;
    const aspect = viewWidth / viewHeight;
    const minWidth = Math.min(CANVAS_WORLD_WIDTH, Math.max(1, canvas.clientWidth / 8));
    const maxWidth = Math.min(CANVAS_WORLD_WIDTH, CANVAS_WORLD_HEIGHT * aspect);
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, viewWidth * factor));
    const nextHeight = nextWidth / aspect;

    if (nextWidth === viewWidth && nextHeight === viewHeight) return;

    root.viewBox.width = nextWidth;
    root.viewBox.height = nextHeight;
    root.viewBox.x = root.clampViewBoxX(focusX - focusRatioX * nextWidth);
    root.viewBox.y = root.clampViewBoxY(focusY - focusRatioY * nextHeight);
    root.applyCanvasViewBox();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  applyCanvasPan(clientX, clientY) {
    const root = this.rootElement;
    if (!root.pan) return;

    const canvas = root.getCanvas();
    const scaleX = root.viewBox.width / Math.max(1, canvas.clientWidth);
    const scaleY = root.viewBox.height / Math.max(1, canvas.clientHeight);
    const dx = clientX - root.pan.startX;
    const dy = clientY - root.pan.startY;
    if (!root.pan.moved && Math.hypot(dx, dy) < SukiCircleEdit.DRAG_START_THRESHOLD) return;
    if (!root.pan.moved) {
      root.pan.moved = true;
      root.suppressNextCanvasClick = true;
    }

    root.viewBox.x = root.clampViewBoxX(root.pan.viewX - dx * scaleX);
    root.viewBox.y = root.clampViewBoxY(root.pan.viewY - dy * scaleY);
    root.applyCanvasViewBox();
  }

  /**
   * @param {PointerEvent} event
   */
  onCanvasClick(event) {
    const root = this.rootElement;
    if (root.pendingConnectionId) {
      root.pendingConnectionId = null;
      root.lastCanvasTap = null;
      this.clearAddHint();
      root.render();
      return;
    }

    const point = root.getCanvasPoint(event);
    root.selectedId = null;
    root.pendingConnectionId = null;
    root.visibleNodeActionId = null;
    root.lastCanvasTap = null;
    root.addHint = { x: point.x, y: point.y };
    root.render();
  }

  /**
   * @param {string} id
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  consumeNodeEditTap(id, x, y) {
    const root = this.rootElement;
    const now = performance.now();
    const previous = root.lastNodeTap;
    if (!previous || previous.id !== id) {
      root.lastNodeTap = { id, time: now, x, y, count: 1 };
      return false;
    }

    const elapsed = now - previous.time;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    if (elapsed > SukiCircleEdit.DOUBLE_TAP_MS || distance > SukiCircleEdit.DOUBLE_TAP_DISTANCE) {
      root.lastNodeTap = { id, time: now, x, y, count: 1 };
      return false;
    }

    const count = previous.count + 1;
    root.lastNodeTap = { id, time: now, x, y, count };
    if (count < SukiCircleEdit.NODE_EDIT_TAP_COUNT) return false;

    root.lastNodeTap = null;
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  addNodeAt(x, y) {
    const root = this.rootElement;
    const group = root.findGroupAt(x, y);
    this.pushUndoSnapshot();
    const node = {
      id: makeUniqueId(root.graph),
      label: randomNodeLabel(),
      x,
      y,
      groupId: group?.id || null,
      color: randomPastelColor(),
    };
    root.graph.nodes.push(node);
    root.selectedId = node.id;
    root.visibleNodeActionId = null;
    root.lastCanvasTap = null;
    this.clearAddHint();
    root.render();
  }

  /**
   * @param {string} id
   */
  selectEntity(id) {
    const root = this.rootElement;
    const node = root.graph.nodes.find((item) => item.id === id);
    const entity = findEntity(root.graph, id);
    root.lastCanvasTap = null;
    this.clearAddHint();
    if (root.pendingConnectionId) {
      if (node && root.pendingConnectionId !== id && !hasEdge(root.graph, root.pendingConnectionId, id)) {
        this.pushUndoSnapshot();
        root.graph.edges.push({
          id: makeUniqueId(root.graph),
          sourceId: root.pendingConnectionId,
          targetId: id,
          label: "",
          type: "related",
          color: SukiCircleEdit.DEFAULT_EDGE_COLOR,
        });
      }
      root.pendingConnectionId = null;
      root.selectedId = id;
      root.visibleNodeActionId = null;
      root.pointerDownSelectedId = null;
      root.render();
      return;
    }

    root.selectedId = id;
    if (!node || (entity && getEntityKind(root.graph, entity) === "edge")) root.visibleNodeActionId = null;
    root.pointerDownSelectedId = null;
    root.render();
  }

  startConnectionFromSelectedNode() {
    const root = this.rootElement;
    const node = root.selectedId ? root.graph.nodes.find((item) => item.id === root.selectedId) : null;
    if (!node) return;
    root.pendingConnectionId = node.id;
    root.visibleNodeActionId = null;
    root.render();
  }

  /**
   * @param {string | null} id
   * @param {Element} anchor
   */
  openNodeColorPicker(id, anchor) {
    const root = this.rootElement;
    const node = id ? root.graph.nodes.find((item) => item.id === id) : null;
    if (!node) return;
    this.openColorPicker("node", node.id, node.color, anchor);
  }

  /**
   * @param {string | null} id
   * @param {Element} anchor
   */
  openEdgeColorPicker(id, anchor) {
    const root = this.rootElement;
    const edge = id ? root.graph.edges.find((item) => item.id === id) : null;
    if (!edge) return;
    this.openColorPicker("edge", edge.id, getEdgeColor(edge), anchor);
  }

  /**
   * @param {string | null} id
   * @param {Element} anchor
   */
  openGroupColorPicker(id, anchor) {
    const root = this.rootElement;
    const group = id ? root.graph.groups.find((item) => item.id === id) : null;
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
    const root = this.rootElement;
    const input = root.querySelector(".suki-node-color-input");
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
    const root = this.rootElement;
    const id = input.dataset.entityId;
    const kind = input.dataset.entityKind;
    if (!id) return;

    if (kind === "edge") {
      const edge = root.graph.edges.find((item) => item.id === id);
      if (!edge) return;
      this.pushUndoSnapshot();
      edge.color = input.value;
      root.selectedId = edge.id;
      root.visibleNodeActionId = null;
      root.render();
      return;
    }

    if (kind === "group") {
      const group = root.graph.groups.find((item) => item.id === id);
      if (!group) return;
      this.pushUndoSnapshot();
      group.color = input.value;
      root.selectedId = group.id;
      root.visibleNodeActionId = null;
      root.render();
      return;
    }

    const node = root.graph.nodes.find((item) => item.id === id);
    if (!node) return;
    this.pushUndoSnapshot();
    node.color = input.value;
    root.selectedId = node.id;
    root.visibleNodeActionId = node.id;
    root.render();
  }

  openPropertiesDialog() {
    const root = this.rootElement;
    const dialog = root.querySelector(".suki-properties-dialog");
    if (!(dialog instanceof HTMLDialogElement)) return;
    this.renderInspector();
    if (!dialog.open) dialog.showModal();
  }

  closePropertiesDialog() {
    const root = this.rootElement;
    const dialog = root.querySelector(".suki-properties-dialog");
    if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  }

  createHistorySnapshot() {
    const root = this.rootElement;
    return {
      documentName: root.documentName,
      graph: cloneGraph(root.graph),
      selectedId: root.selectedId,
      pendingConnectionId: root.pendingConnectionId,
      visibleNodeActionId: root.visibleNodeActionId,
      viewBox: { ...root.viewBox },
    };
  }

  pushUndoSnapshot() {
    const root = this.rootElement;
    const snapshot = this.createHistorySnapshot();
    const previous = root.undoStack[root.undoStack.length - 1];
    if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
    root.undoStack.push(snapshot);
    if (root.undoStack.length > SukiCircleEdit.UNDO_LIMIT) root.undoStack.shift();
    this.updateUndoButton();
    this.scheduleUrlHashUpdate();
  }

  scheduleUrlHashUpdate() {
    const root = this.rootElement;
    if (root.urlHashUpdateScheduled) return;
    root.urlHashUpdateScheduled = true;
    queueMicrotask(() => {
      root.urlHashUpdateScheduled = false;
      this.updateUrlHash();
    });
  }

  updateUrlHash(push = false) {
    const root = this.rootElement;
    const query = createUrlQueryFromGraph(root.graph, root.documentName || "スキサークル", root.id, root.getViewportUrlState());
    const nextUrl = `${location.pathname}${location.search}#?${query}`;
    if (push) {
      history.pushState(history.state, "", nextUrl);
    } else {
      history.replaceState(history.state, "", nextUrl);
    }
  }

  async shareUrl() {
    const root = this.rootElement;
    this.updateUrlHash();
    const url = location.href;
    const shareData = {
      title: root.documentName || "スキサークル",
      url,
    };
    if (navigator.share && window.isSecureContext) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    if (await this.copyTextToClipboard(url)) {
      window.alert("URLをコピーしました。");
      return;
    }
    window.prompt("URLをコピーしてください。", url);
  }

  /**
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the selection-based fallback.
      }
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.readOnly = true;
    textArea.style.position = "fixed";
    textArea.style.insetBlockStart = "0";
    textArea.style.insetInlineStart = "0";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textArea.remove();
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async save() {
    const root = this.rootElement;
    if (!this.openSavingDialog()) return;
    this.updateUrlHash(true);
    const duration = Math.min(
      SukiCircleEdit.SAVE_SPINNER_MAX_MS,
      Math.max(
        SukiCircleEdit.SAVE_SPINNER_MIN_MS,
        SukiCircleEdit.SAVE_SPINNER_MAX_MS * (1 - Math.exp(-root.graph.nodes.length / SukiCircleEdit.SAVE_SPINNER_CURVE_NODES)),
      ),
    );
    await new Promise((resolve) => window.setTimeout(resolve, duration));
    this.openSvgPreviewDialog();
  }

  updateUndoButton() {
    const root = this.rootElement;
    const undoButton = root.querySelector('[data-action="undo"]');
    if (undoButton instanceof HTMLButtonElement) undoButton.disabled = root.undoStack.length === 0;
  }

  undo() {
    const root = this.rootElement;
    const snapshot = root.undoStack.pop();
    if (!snapshot) return;

    root.graph = cloneGraph(snapshot.graph);
    root.documentName = snapshot.documentName || "スキサークル";
    root.selectedId = snapshot.selectedId;
    root.pendingConnectionId = snapshot.pendingConnectionId;
    root.visibleNodeActionId = snapshot.visibleNodeActionId;
    root.viewBox = { ...snapshot.viewBox };
    root.drag = null;
    root.pan = null;
    root.activePointers.clear();
    root.activePointerPositions.clear();
    root.pinch = null;
    root.editingNodeId = null;
    root.lastCanvasTap = null;
    root.lastNodeTap = null;
    const editor = root.getNodeEditor();
    if (editor) {
      editor.hidden = true;
      editor.textContent = "";
      editor.classList.remove("is-group-editor", "is-node-editor", "is-edge-editor");
    }
    root.recreateCanvasNextRender = true;
    root.syncDocumentNameInput();
    root.render();
    this.updateUrlHash();
  }

  /**
   * @returns {SukiGroup | null}
   */
  getDraftGroup() {
    const root = this.rootElement;
    if (!root.drag?.proposedGroupNodeId) return null;

    const draggedNode = root.graph.nodes.find((node) => node.id === root.drag?.id);
    const pairedNode = root.graph.nodes.find((node) => node.id === root.drag?.proposedGroupNodeId);
    if (!draggedNode || !pairedNode || draggedNode.groupId || pairedNode.groupId) return null;
    if (Math.hypot(pairedNode.x - draggedNode.x, pairedNode.y - draggedNode.y) > root.geometry.nodeRadius * 2) return null;

    return {
      id: SukiCircleEdit.DRAFT_GROUP_ID,
      label: "新規グループ",
      color: SukiCircleEdit.GROUP_PALETTE[root.graph.groups.length % SukiCircleEdit.GROUP_PALETTE.length],
      ...getGroupGeometryForMembers([draggedNode, pairedNode], root.geometry),
    };
  }

  /**
   * @param {string} id
   */
  startNodeEditing(id) {
    const root = this.rootElement;
    const entity = findEntity(root.graph, id);
    const editor = root.getNodeEditor();
    if (!entity) return;
    const kind = getEntityKind(root.graph, entity);
    if (kind !== "node" && kind !== "group" && kind !== "edge") return;
    if (!editor) return;

    root.editingNodeId = id;
    root.lastNodeTap = null;
    root.lastCanvasTap = null;
    root.selectedId = id;
    root.pendingConnectionId = null;
    root.visibleNodeActionId = null;
    root.drag = null;
    editor.classList.toggle("is-group-editor", kind === "group");
    editor.classList.toggle("is-node-editor", kind === "node");
    editor.classList.toggle("is-edge-editor", kind === "edge");
    editor.textContent = entity.label;
    editor.hidden = false;
    root.render();
    this.positionNodeEditor();
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  commitNodeEditing() {
    const root = this.rootElement;
    if (!root.editingNodeId) return;

    const entity = findEntity(root.graph, root.editingNodeId);
    const editor = root.getNodeEditor();
    const kind = entity ? getEntityKind(root.graph, entity) : null;
    const rawValue = editor?.innerText || editor?.textContent || "";
    const value = kind === "group"
      ? rawValue.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      : rawValue.replace(/\s+/g, " ").trim();
    if (entity && (kind === "node" || kind === "group" || kind === "edge")) {
      this.pushUndoSnapshot();
      entity.label = kind === "node" ? value.slice(0, 1) : value;
    }

    root.editingNodeId = null;
    root.lastNodeTap = null;
    if (editor) {
      editor.hidden = true;
      editor.textContent = "";
      editor.classList.remove("is-group-editor", "is-node-editor", "is-edge-editor");
    }
    root.render();
  }

  positionNodeEditor() {
    const root = this.rootElement;
    if (!root.editingNodeId) return;

    const entity = findEntity(root.graph, root.editingNodeId);
    const editor = root.getNodeEditor();
    const workspace = root.querySelector(".suki-workspace");
    if (!entity || !editor || !(workspace instanceof HTMLElement)) return;
    const kind = getEntityKind(root.graph, entity);
    if (kind !== "node" && kind !== "group" && kind !== "edge") return;

    const canvas = root.getCanvas();
    const canvasRect = canvas.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const scaleX = canvas.clientWidth / Math.max(1, root.viewBox.width);
    const scaleY = canvas.clientHeight / Math.max(1, root.viewBox.height);
    if (kind === "node") {
      const node = /** @type {SukiNode} */ (entity);
      const size = root.geometry.nodeRadius * 2 * Math.min(scaleX, scaleY);
      const x = canvasRect.left - workspaceRect.left + (node.x - root.viewBox.x) * scaleX;
      const y = canvasRect.top - workspaceRect.top + (node.y - root.viewBox.y) * scaleY;
      editor.style.inlineSize = `${size}px`;
      editor.style.blockSize = `${size}px`;
      editor.style.left = `${x - size / 2}px`;
      editor.style.top = `${y - size / 2}px`;
      return;
    }

    if (kind === "edge") {
      const edge = /** @type {SukiEdge} */ (entity);
      const source = root.graph.nodes.find((node) => node.id === edge.sourceId);
      const target = root.graph.nodes.find((node) => node.id === edge.targetId);
      if (!source || !target) return;
      const x = canvasRect.left - workspaceRect.left + ((source.x + target.x) / 2 - root.viewBox.x) * scaleX;
      const y = canvasRect.top - workspaceRect.top + ((source.y + target.y) / 2 + 16 - root.viewBox.y) * scaleY;
      editor.style.inlineSize = "9rem";
      editor.style.blockSize = "2rem";
      editor.style.left = `${x - 72}px`;
      editor.style.top = `${y - 16}px`;
      return;
    }

    const group = /** @type {SukiGroup} */ (entity);
    const box = getGroupBox(group, root.geometry);
    const left = canvasRect.left - workspaceRect.left + (box.left + 12 - root.viewBox.x) * scaleX;
    const top = canvasRect.top - workspaceRect.top + (box.top + 12 - root.viewBox.y) * scaleY;
    editor.style.inlineSize = `${Math.max(120, Math.min(260, (box.width - 24) * scaleX))}px`;
    editor.style.blockSize = `${Math.max(54, Math.min(150, (box.height - 24) * scaleY))}px`;
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;
  }

  deleteSelected() {
    const root = this.rootElement;
    if (!root.selectedId) return;
    this.pushUndoSnapshot();
    const id = root.selectedId;
    root.graph.nodes = root.graph.nodes.filter((node) => node.id !== id);
    root.graph.groups = root.graph.groups.filter((group) => group.id !== id);
    root.graph.edges = root.graph.edges.filter((edge) => edge.id !== id && edge.sourceId !== id && edge.targetId !== id);
    for (const node of root.graph.nodes) {
      if (node.groupId === id) node.groupId = null;
    }
    root.selectedId = null;
    root.pendingConnectionId = null;
    root.visibleNodeActionId = null;
    root.render();
  }

  /**
   * @returns {string}
   */
  toCircleMarkup() {
    const root = this.rootElement;
    const circle = document.createElement("suki-circle");
    circle.id = makeDocumentId();
    circle.setAttribute("title", root.documentName || "スキサークル");
    circle.append(presentationStyleElement(root.geometry));
    circle.append(...graphElements(root.graph, root.geometry));
    return circle.outerHTML;
  }

  /**
   * @returns {SVGSVGElement}
   */
  toSvgDocument() {
    const root = this.rootElement;
    return graphToSvgDocument(root.graph, root.geometry, SukiCircleEdit.SVG_VIEWBOX_PADDING);
  }

  refreshDocumentId() {
    const root = this.rootElement;
    root.id = makeDocumentId();
    const style = root.querySelector(":scope > style") ?? document.createElement("style");
    style.textContent = presentationStyleText(root.geometry);
    if (!style.parentElement) root.prepend(style);
  }

  /**
   * @returns {boolean}
   */
  openSavingDialog() {
    const root = this.rootElement;
    const dialog = root.querySelector(".suki-svg-preview-dialog");
    const preview = root.querySelector(".suki-svg-preview");
    if (!(dialog instanceof HTMLDialogElement) || !(preview instanceof HTMLElement)) return false;
    if (dialog.classList.contains("is-saving")) return false;

    this.refreshDocumentId();
    const spinner = document.createElement("div");
    spinner.classList.add("suki-save-spinner");
    spinner.setAttribute("role", "status");
    spinner.setAttribute("aria-label", "保存中");
    preview.replaceChildren(spinner);
    dialog.classList.add("is-saving");
    dialog.setAttribute("aria-busy", "true");
    if (!dialog.open) dialog.showModal();
    return true;
  }

  openSvgPreviewDialog() {
    const root = this.rootElement;
    const dialog = root.querySelector(".suki-svg-preview-dialog");
    const preview = root.querySelector(".suki-svg-preview");
    if (!(dialog instanceof HTMLDialogElement) || !(preview instanceof HTMLElement)) return;

    const wasSaving = dialog.classList.contains("is-saving");
    if (!wasSaving) this.refreshDocumentId();
    const svg = this.toSvgDocument();
    svg.classList.add("suki-svg-preview-image");
    dialog.classList.remove("is-saving");
    dialog.removeAttribute("aria-busy");
    preview.replaceChildren(svg);
    if (!dialog.open) dialog.showModal();
  }

  closeSvgPreviewDialog() {
    const root = this.rootElement;
    const dialog = root.querySelector(".suki-svg-preview-dialog");
    if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  }

  /**
   * @returns {{ blob: Blob, filename: string }}
   */
  createSvgPreviewFileData() {
    const root = this.rootElement;
    const previewSvg = root.querySelector(".suki-svg-preview svg");
    const svg = previewSvg instanceof SVGSVGElement ? /** @type {SVGSVGElement} */ (previewSvg.cloneNode(true)) : this.toSvgDocument();
    const source = prettyPrintSvg(new XMLSerializer().serializeToString(svg));
    const blob = new Blob([source], { type: "image/svg+xml" });
    return { blob, filename: `${fileNameStem(root.documentName)}.svg` };
  }

  downloadSvgPreview() {
    const { blob, filename } = this.createSvgPreviewFileData();
    this.downloadBlob(blob, filename);
  }

  async shareSvgPreview() {
    const { blob, filename } = this.createSvgPreviewFileData();
    if (await this.shareFile(blob, filename, "image/svg+xml")) return;
    this.downloadBlob(blob, filename);
  }

  /**
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  async createReadonlyHtmlFileData() {
    const root = this.rootElement;
    const blob = new Blob([await createReadonlyHtml(root.documentName || "スキサークル", this.toCircleMarkup())], { type: "text/html" });
    return { blob, filename: `${fileNameStem(root.documentName)}.html` };
  }

  async downloadReadonlyHtml() {
    const { blob, filename } = await this.createReadonlyHtmlFileData();
    this.downloadBlob(blob, filename);
  }

  async shareHtmlPreview() {
    const { blob, filename } = await this.createReadonlyHtmlFileData();
    if (await this.shareFile(blob, filename, "text/html")) return;
    this.downloadBlob(blob, filename);
  }

  /**
   * @param {string} type
   * @param {string} extension
   * @param {number | undefined} quality
   * @param {string | null} background
   * @returns {Promise<{ blob: Blob, filename: string } | null>}
   */
  async createRasterPreviewFileData(type, extension, quality, background) {
    const root = this.rootElement;
    const previewSvg = root.querySelector(".suki-svg-preview svg");
    const svg = previewSvg instanceof SVGSVGElement ? /** @type {SVGSVGElement} */ (previewSvg.cloneNode(true)) : this.toSvgDocument();
    const source = prettyPrintSvg(new XMLSerializer().serializeToString(svg));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    const image = await loadImage(url);
    const width = Math.max(1, Math.ceil(Number(svg.getAttribute("width")) || image.naturalWidth || image.width));
    const height = Math.max(1, Math.ceil(Number(svg.getAttribute("height")) || image.naturalHeight || image.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    const imageBlob = await canvasToBlob(canvas, type, quality);
    if (!imageBlob) return null;
    return { blob: imageBlob, filename: `${fileNameStem(root.documentName)}.${extension}` };
  }

  /**
   * @returns {Promise<{ blob: Blob, filename: string } | null>}
   */
  async createJpegPreviewFileData() {
    return this.createRasterPreviewFileData("image/jpeg", "jpg", 0.9, "#ffffff");
  }

  /**
   * @returns {Promise<{ blob: Blob, filename: string } | null>}
   */
  async createPngPreviewFileData() {
    return this.createRasterPreviewFileData("image/png", "png", undefined, null);
  }

  async downloadJpegPreview() {
    const fileData = await this.createJpegPreviewFileData();
    if (!fileData) return;
    this.downloadBlob(fileData.blob, fileData.filename);
  }

  async shareJpegPreview() {
    const fileData = await this.createJpegPreviewFileData();
    if (!fileData) return;
    if (await this.shareFile(fileData.blob, fileData.filename, "image/jpeg")) return;
    this.downloadBlob(fileData.blob, fileData.filename);
  }

  async downloadPngPreview() {
    const fileData = await this.createPngPreviewFileData();
    if (!fileData) return;
    this.downloadBlob(fileData.blob, fileData.filename);
  }

  async sharePngPreview() {
    const fileData = await this.createPngPreviewFileData();
    if (!fileData) return;
    if (await this.shareFile(fileData.blob, fileData.filename, "image/png")) return;
    this.downloadBlob(fileData.blob, fileData.filename);
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   * @param {string} type
   * @returns {Promise<boolean>}
   */
  async shareFile(blob, filename, type) {
    if (!navigator.share || !window.isSecureContext) return false;
    const file = new File([blob], filename, { type });
    const shareData = {
      title: this.rootElement.documentName || "スキサークル",
      files: [file],
    };
    if (navigator.canShare && !navigator.canShare(shareData)) return false;
    try {
      await navigator.share(shareData);
      return true;
    } catch (error) {
      return error instanceof DOMException && error.name === "AbortError";
    }
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  downloadBlob(blob, filename) {
    const root = this.rootElement;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  renderInspector() {
    const root = this.rootElement;
    const form = root.querySelector(".suki-form");
    const empty = root.querySelector(".suki-empty");
    if (!(form instanceof HTMLFormElement) || !empty) return;

    const entity = root.selectedId ? findEntity(root.graph, root.selectedId) : null;
    form.hidden = !entity;
    empty.toggleAttribute("hidden", !!entity);
    if (!entity) return;

    const kind = getEntityKind(root.graph, entity);

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
        ...root.graph.groups.map((group) => new Option(group.label, group.id, false, entity.groupId === group.id)),
      );
      groupId.value = entity.groupId || "";
    }
  }
}
