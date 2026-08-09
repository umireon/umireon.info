/*
 * SPDX-FileCopyrightText: 2026 Kaito Udagawa
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { minify } from "terser";

const staticFiles = [
  "_headers",
  "favicon.png",
  "index.html",
  "my-bio.css",
  "my-bio.js",
  "suki-circle.css",
  "suki-circle.edit.js",
  "suki-circle.html",
  "suki-circle.js",
  "suki-circle.nav.js",
  "umireon-avatar.webp",
  "umireon-honeycomb-wallpaper.svg",
  "umireon-honeycomb.svg",
  "umireon.css",
  "umireon-senga.brush",
];

const source = (await readFile("suki-circle.js", "utf8"))
  .replace(
    'customElements.define("suki-circle", SukiCircleElement);',
    'if (false) customElements.define("suki-circle", SukiCircleElement);',
  );

const readonlyEntry = `customElements.define("suki-circle", class extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered) return;
    this.dataset.rendered = "true";
    if (this.querySelector(":scope > section, :scope > suki-node, :scope > suki-edge")) {
      this.replaceChildren(graphToSvgDocument(graphFromElement(this)));
    }
  }
});`;

const cssClassNames = [
  ["suki-edge-label-background", "a"],
  ["suki-edge-label-item", "b"],
  ["suki-node-circle", "c"],
  ["suki-group-label", "d"],
  ["suki-edge-labels", "e"],
  ["suki-edge-label", "f"],
  ["suki-edge-line", "g"],
  ["suki-group-box", "h"],
  ["suki-node-label", "i"],
  ["suki-viewport", "j"],
  ["suki-groups", "k"],
  ["suki-edges", "m"],
  ["suki-nodes", "o"],
  ["suki-group", "p"],
  ["suki-node", "q"],
  ["suki-edge", "r"],
];

let minSource = `${source}
${readonlyEntry}`;

for (const [from, to] of cssClassNames) {
  minSource = minSource
    .replaceAll(`.${from}`, `.${to}`)
    .replaceAll(`classList.add("${from}")`, `classList.add("${to}")`);
  if (from !== "suki-node" && from !== "suki-edge") minSource = minSource.replaceAll(`"${from}"`, `"${to}"`);
}

minSource = minSource
  .replaceAll(".createElementNS(", "[CREATE_ELEMENT_NS](")
  .replaceAll(".createElement(", "[CREATE_ELEMENT](")
  .replaceAll(".querySelectorAll(", "[QUERY_SELECTOR_ALL](")
  .replaceAll(".querySelector(", "[QUERY_SELECTOR](")
  .replaceAll(".getAttribute(", "[GET_ATTRIBUTE](")
  .replaceAll(".setAttribute(", "[SET_ATTRIBUTE](")
  .replaceAll(".removeAttribute(", "[REMOVE_ATTRIBUTE](")
  .replaceAll("?.classList", "?.[CLASS_LIST]")
  .replaceAll(".classList", "[CLASS_LIST]");

const result = await minify(`((customElements, document, HTMLElement, window, CREATE_ELEMENT_NS, CREATE_ELEMENT, QUERY_SELECTOR_ALL, QUERY_SELECTOR, GET_ATTRIBUTE, SET_ATTRIBUTE, REMOVE_ATTRIBUTE, CLASS_LIST) => {
${minSource}
})(customElements, document, HTMLElement, window, "createElementNS", "createElement", "querySelectorAll", "querySelector", "getAttribute", "setAttribute", "removeAttribute", "classList");`, {
  compress: {
    dead_code: true,
    conditionals: true,
    evaluate: true,
    global_defs: {
      SukiCircleEdit: null,
    },
    inline: 3,
    passes: 2,
    reduce_funcs: true,
    reduce_vars: true,
    toplevel: true,
    unused: true,
  },
  mangle: {
    properties: {
      builtins: false,
      keep_quoted: "strict",
      regex: /^(groups|nodes|edges|label|groupId|sourceId|targetId|left|top|right|bottom|members|fromNode|toGraphNode|fromEdge|toGraphEdge)$/,
    },
    toplevel: true,
  },
  module: false,
  format: {
    comments: false,
  },
});

await rm("dist", { force: true, recursive: true });
await mkdir("dist", { recursive: true });
if (!result.code) throw new Error("dist/suki-circle.min.js を生成できませんでした。");
await writeFile("dist/suki-circle.min.js", `/* SPDX-License-Identifier: Apache-2.0 */\n${result.code}\n`);
for (const file of staticFiles) {
  await copyFile(file, `dist/${file}`);
}
