/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

"use strict";

Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/keyEditor.jsm"); /*global AnnealMailKeyEditor: false */
Components.utils.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */

var gKeyList = [];

function onLoad() {
  // set current key trust if only one key is changed
  var annealmailSvc = AnnealMailCore.getService(window);
  if (!annealmailSvc)
    return;

  var errorMsgObj = {};
  var exitCodeObj = {};

  try {
    window.arguments[1].refresh = false;
    var currTrust = -1;
    var lastTrust = -1;

    gKeyList = [];
    let k = window.arguments[0].keyId;

    for (let i in k) {
      let o = AnnealMailKeyRing.getKeyById(k[i]);
      if (o) {
        gKeyList.push(o);
      }
    }

    if (gKeyList.length > 0) {
      for (let i = 0; i < gKeyList.length; i++) {
        currTrust = (("-nmfuq").indexOf(gKeyList[i].keyTrust) % 5) + 1;
        if (lastTrust == -1) lastTrust = currTrust;
        if (currTrust != lastTrust) {
          currTrust = -1;
          break;
        }
      }
    }
    if (currTrust > 0) {
      var t = document.getElementById("trustLevel" + currTrust.toString());
      document.getElementById("trustLevelGroup").selectedItem = t;
    }
  }
  catch (ex) {}

  var keyIdList = document.getElementById("keyIdList");

  for (let i = 0; i < gKeyList.length; i++) {
    var keyId = gKeyList[i].userId + " - 0x" + gKeyList[i].keyId.substr(-8, 8);
    keyIdList.appendItem(keyId);
  }
}

function processNextKey(index) {
  AnnealMailLog.DEBUG("annealmailEditKeyTrust: processNextKey(" + index + ")\n");

  var t = document.getElementById("trustLevelGroup");

  AnnealMailKeyEditor.setKeyTrust(window,
    gKeyList[index].keyId,
    Number(t.selectedItem.value),
    function(exitCode, errorMsg) {
      if (exitCode !== 0) {
        AnnealMailDialog.alert(window, AnnealMailLocale.getString("setKeyTrustFailed") + "\n\n" + errorMsg);
        window.close();
        return;
      }
      else {
        window.arguments[1].refresh = true;
      }

      ++index;
      if (index >= gKeyList.length)
        window.close();
      else {
        processNextKey(index);
      }
    });
}

function onAccept() {
  processNextKey(0);

  return false;
}
