/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://annealmail/content/annealmailCommon.js

/* global AnnealMailLog: false */


"use strict";

function onLoad() {
  AnnealMailLog.DEBUG("annealmailwrapSelection.js: onLoad\n");
  window.arguments[0].cancelled = true;
  window.arguments[0].Select = "";
}

function onAccept() {
  AnnealMailLog.DEBUG("annealmailwrapSelection.js: onAccept\n");
  let wrapSelect = document.getElementById("wrapSelectGroup");
  AnnealMailLog.DEBUG("annealmailwrapSelection.js: onAccept, selected value='" + wrapSelect.value + "'\n");
  if (wrapSelect.value !== "") {
    window.arguments[0].Select = wrapSelect.value;
    window.arguments[0].cancelled = false;
    AnnealMailLog.DEBUG("annealmailwrapSelection.js: onAccept, setting return value, disable cancel\n");
  }
  else {
    AnnealMailLog.DEBUG("annealmailwrapSelection.js: onAccept, enable cancel\n");
    window.arguments[0].cancelled = true;
  }
}

function onCancel() {
  AnnealMailLog.DEBUG("annealmailwrapSelection.js: onCancel, enable cancel\n");
  window.arguments[0].cancelled = true;
}
