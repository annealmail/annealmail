/*global Components: false */

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/trust.jsm"); /*global AnnealMailTrust: false */
Components.utils.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */

var gRepaintCount = 0;
var gKeyId;

/* imports from annealmailCommon.js: */
/* global EnigGetTrustLabel: false */


function appendUid(uidStr) {
  let uidCont = document.getElementById("uidContainer");
  let l = document.createElement("label");
  l.setAttribute("value", uidStr);
  uidCont.appendChild(l);
}

function onLoad() {
  window.addEventListener("MozAfterPaint", resizeDlg, false);

  let key = AnnealMailKeyRing.getKeyById(window.arguments[0].keyId);
  gKeyId = key.keyId;

  document.getElementById("photoImage").setAttribute("src", window.arguments[0].photoUri);
  for (let su of key.userIds) {
    if (su.type === "uid") {
      appendUid(su.userId);
    }
  }
  document.getElementById("keyId").setAttribute("value", AnnealMailLocale.getString("keyId") + ": 0x" + gKeyId);
  document.getElementById("keyValidity").setAttribute("value", AnnealMailTrust.getTrustLabel(key.keyTrust));
}

function resizeDlg(event) {
  ++gRepaintCount;
  window.sizeToContent();
  if (gRepaintCount > 3) {
    removeListener();
  }
}

function removeListener() {
  window.removeEventListener("MozAfterPaint", resizeDlg, false);
}

function displayKeyProps() {
  AnnealMailWindows.openKeyDetails(window, gKeyId, false);
}
