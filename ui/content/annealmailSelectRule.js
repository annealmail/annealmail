/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

// uses annealmailCommon.js:
/* global EnigInitCommon: false, EnigGetString: false */

// uses annealmailRulesEditor.js:
/* global annealmailDlgOnAccept: false, createRow: false, getCurrentNode: false, annealmailDlgOnLoad: false */

"use strict";

EnigInitCommon("annealmailSelectRule");

Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/funcs.jsm"); /*global AnnealMailFuncs: false */

function addKeyToRule() {
  var node = getCurrentNode();

  var keyId = node.getAttribute("keyId").split(/[ ,]+/);
  keyId.push("0x" + window.arguments[0].keyId);

  var inputObj = {
    email: node.getAttribute("email"),
    keyId: keyId.join(", "),
    sign: Number(node.getAttribute("sign")),
    encrypt: Number(node.getAttribute("encrypt")),
    pgpMime: Number(node.getAttribute("pgpMime")),
    negate: Number(node.getAttribute("negateRule"))
  };

  createRow(node, inputObj);

  annealmailDlgOnAccept();
  window.close();

}


function createNewRuleWithKey() {
  let inputObj = {};
  let resultObj = {};
  let keyObj = AnnealMailKeyRing.getKeyById(window.arguments[0].keyId);

  inputObj.options = "nosave";
  inputObj.toAddress = "{}";
  inputObj.keyId = ["0x" + window.arguments[0].keyId];
  inputObj.command = "add";

  if (keyObj) {
    inputObj.toAddress = "{" + AnnealMailFuncs.stripEmail(keyObj.userId) + "}";
  }

  window.openDialog("chrome://annealmail/content/annealmailSingleRcptSettings.xul", "", "dialog,modal,centerscreen,resizable", inputObj, resultObj);
  if (!resultObj.cancelled) {
    var treeItem = document.createElement("treeitem");
    createRow(treeItem, resultObj);
    var treeChildren = document.getElementById("rulesTreeChildren");
    if (treeChildren.firstChild) {
      treeChildren.insertBefore(treeItem, treeChildren.firstChild);
    }
    else {
      treeChildren.appendChild(treeItem);
    }

    annealmailDlgOnAccept();
  }
  window.close();
}

function editDlgOnLoad() {
  annealmailDlgOnLoad();
  document.getElementById("editDialogTitle").setAttribute("value", EnigGetString("addKeyToRule", window.arguments[0].userId, "0x" + window.arguments[0].keyId.substr(-8, 8)));
}
