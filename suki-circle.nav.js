/*
 * SPDX-FileCopyrightText: 2026 Kaito Udagawa
 *
 * SPDX-License-Identifier: Apache-2.0
 */

window.SUKI_CIRCLE_NAV = document.querySelector("suki-circle > nav");

if (window.SUKI_CIRCLE_NAV) {
  const params = new URLSearchParams(location.hash.startsWith("#?") ? location.hash.slice(2) : location.search);
  const inputElem = SUKI_CIRCLE_NAV.querySelector("#nav-title");
  if (inputElem && inputElem instanceof HTMLInputElement) {
    switch (params.get("suki-circle")) {
      case "v1": {
        const title = params.get("t")?.trim();
        if (title) inputElem.value = title;
      }
    }
  }
}
