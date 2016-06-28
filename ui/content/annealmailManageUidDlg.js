/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global Components: false */

Components.utils.import("resource://annealmail/funcs.jsm"); /* global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/keyEditor.jsm"); /* global AnnealMailKeyEditor: false */
Components.utils.import("resource://annealmail/locale.jsm"); /* global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/data.jsm"); /* global AnnealMailData: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /* global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */

var gUserId;
var gAnnealMailUid;

function onLoad() {
  window.arguments[1].refresh = false;
  reloadUidList();
  var keyId = gUserId + " - 0x" + window.arguments[0].keyId.substr(-8, 8);
  document.getElementById("keyId").value = keyId;

  if (!window.arguments[0].ownKey) {
    document.getElementById("addUid").setAttribute("disabled", "true");
    document.getElementById("setPrimary").setAttribute("disabled", "true");
    document.getElementById("revokeUid").setAttribute("disabled", "true");
  }
}

function appendUid(uidList, uidObj, uidNum) {
  let uidTxt;
  let uidType = uidObj.type;
  if (uidType === "uat") {
    if (uidObj.userId.indexOf("1 ") === 0) {
      uidTxt = AnnealMailLocale.getString("userAtt.photo");
    }
    else return;
  }
  else {
    uidTxt = uidObj.userId;
    if (!gAnnealMailUid) {
      gAnnealMailUid = uidTxt;
    }
  }

  if (uidObj.keyTrust === "r") {
    uidTxt += " - " + AnnealMailLocale.getString("keyValid.revoked");
    uidType = uidType.replace(/^./, "r");
  }
  let item = uidList.appendItem(uidTxt, uidType + ":" + String(uidNum));
  if (uidObj.keyTrust == "r") {
    item.setAttribute("class", "annealmailUidInactive");
  }
}

function reloadUidList() {
  var uidList = document.getElementById("uidList");
  while (uidList.getRowCount() > 0) {
    uidList.removeItemAt(0);
  }

  var annealmailSvc = AnnealMailCore.getService();
  if (!annealmailSvc)
    return;

  var keyObj = AnnealMailKeyRing.getKeyById(window.arguments[0].keyId);
  if (keyObj) {
    gUserId = keyObj.userId;

    for (var i = 0; i < keyObj.userIds.length; i++) {
      appendUid(uidList, keyObj.userIds[i], i + 1);
    }
  }

  uidSelectCb();
}

function handleDblClick() {
  var uidList = document.getElementById("uidList");
  if (uidList.selectedCount > 0) {
    var selValue = uidList.selectedItem.value;
    var uidType = selValue.substr(0, 3);
    if (uidType == "uat" || uidType == "rat") {
      AnnealMailWindows.showPhoto(window, window.arguments[0].keyId, gAnnealMailUid);
    }
  }
}

function uidSelectCb() {
  var uidList = document.getElementById("uidList");
  var selValue;

  if (uidList.selectedCount > 0) {
    selValue = uidList.selectedItem.value;
  }
  else {
    selValue = "uid:1";
  }
  if (window.arguments[0].ownKey) {
    var uidType = selValue.substr(0, 3);
    if (uidType == "uat" || uidType == "rat" || uidType == "rid" || selValue.substr(4) == "1") {
      document.getElementById("setPrimary").setAttribute("disabled", "true");
    }
    else {
      document.getElementById("setPrimary").removeAttribute("disabled");
    }
    if (selValue.substr(4) == "1") {
      document.getElementById("deleteUid").setAttribute("disabled", "true");
      document.getElementById("revokeUid").setAttribute("disabled", "true");
    }
    else {
      document.getElementById("deleteUid").removeAttribute("disabled");
      if (uidType == "rid" || uidType == "rat") {
        document.getElementById("revokeUid").setAttribute("disabled", "true");
      }
      else {
        document.getElementById("revokeUid").removeAttribute("disabled");
      }
    }
  }
  else {
    if (selValue.substr(4) == "1") {
      document.getElementById("deleteUid").setAttribute("disabled", "true");
    }
    else {
      document.getElementById("deleteUid").removeAttribute("disabled");
    }
  }
}

function addUid() {
  var inputObj = {
    keyId: "0x" + window.arguments[0].keyId,
    userId: gAnnealMailUid
  };
  var resultObj = {
    refresh: false
  };
  window.openDialog("chrome://annealmail/content/annealmailAddUidDlg.xul",
    "", "dialog,modal,centerscreen", inputObj, resultObj);
  window.arguments[1].refresh = resultObj.refresh;
  reloadUidList();
}

function setPrimaryUid() {
  var annealmailSvc = AnnealMailCore.getService();
  if (!annealmailSvc)
    return;

  var errorMsgObj = {};
  var uidList = document.getElementById("uidList");
  if (uidList.selectedItem.value.substr(0, 3) == "uid") {

    AnnealMailKeyEditor.setPrimaryUid(window,
      "0x" + window.arguments[0].keyId,
      uidList.selectedItem.value.substr(4),
      function _cb(exitCode, errorMsg) {
        if (exitCode === 0) {
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("changePrimUidOK"));
          window.arguments[1].refresh = true;
          reloadUidList();
        }
        else
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("changePrimUidFailed") + "\n\n" + errorMsg);
      });
  }
}

function revokeUid() {
  var annealmailSvc = AnnealMailCore.getService();
  if (!annealmailSvc)
    return;
  var uidList = document.getElementById("uidList");
  if (!AnnealMailDialog.confirmDlg(window, AnnealMailLocale.getString("revokeUidQuestion", uidList.selectedItem.label))) return;
  if (uidList.selectedItem.value.substr(4) != "1") {
    AnnealMailKeyEditor.revokeUid(window,
      "0x" + window.arguments[0].keyId,
      uidList.selectedItem.value.substr(4),
      function _cb(exitCode, errorMsg) {
        if (exitCode === 0) {
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("revokeUidOK", uidList.selectedItem.label));
          window.arguments[1].refresh = true;
          reloadUidList();
        }
        else
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("revokeUidFailed", uidList.selectedItem.label) + "\n\n" + errorMsg);
      });
  }
}

function deleteUid() {
  var annealmailSvc = AnnealMailCore.getService();
  if (!annealmailSvc)
    return;
  var uidList = document.getElementById("uidList");
  if (!AnnealMailDialog.confirmDlg(window, AnnealMailLocale.getString("deleteUidQuestion", uidList.selectedItem.label))) return;
  if (uidList.selectedItem.value.substr(4) != "1") {
    AnnealMailKeyEditor.deleteUid(window,
      "0x" + window.arguments[0].keyId,
      uidList.selectedItem.value.substr(4),
      function _cb(exitCode, errorMsg) {
        if (exitCode === 0) {
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("deleteUidOK", uidList.selectedItem.label));
          window.arguments[1].refresh = true;
          reloadUidList();
        }
        else
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("deleteUidFailed", uidList.selectedItem.label) + "\n\n" + errorMsg);
      });
  }
}
