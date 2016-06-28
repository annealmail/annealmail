/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";


Components.utils.import("resource://annealmail/funcs.jsm"); /*global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/keyEditor.jsm"); /*global AnnealMailKeyEditor: false */
Components.utils.import("resource://annealmail/key.jsm"); /*global AnnealMailKey: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/time.jsm"); /*global AnnealMailTime: false */
Components.utils.import("resource://annealmail/events.jsm"); /*global AnnealMailEvents: false */
Components.utils.import("resource://annealmail/card.jsm"); /*global AnnealMailCard: false */

var gCardData = {};

function onLoad() {
  var annealmailSvc = AnnealMailCore.getService(window);
  if (!annealmailSvc) {
    AnnealMailEvents.dispatchEvent(failWithError, 0, AnnealMailLocale.getString("accessError"));
    return;
  }
  var exitCodeObj = {};
  var errorMsgObj = {};

  var dryRun = false;
  try {
    dryRun = AnnealMailPrefs.getPref("dryRun");
  }
  catch (ex) {}

  var cardStr = AnnealMailCard.getCardStatus(exitCodeObj, errorMsgObj);
  if (exitCodeObj.value === 0) {
    var statusList = cardStr.split(/[\r\n]+/);
    for (var i = 0; i < statusList.length; i++) {
      var l = statusList[i].split(/:/);
      switch (l[0]) {
        case "name":
          setValue("firstname", AnnealMailData.convertCcrToUnicode(l[1]));
          setValue(l[0], AnnealMailData.convertCcrToUnicode(l[2]));
          break;
        case "vendor":
          setValue(l[0], AnnealMailData.convertCcrToUnicode(l[2].replace(/\\x3a/ig, ":")));
          break;
        case "sex":
        case "forcepin":
          var selItem = document.getElementById("card_" + l[0] + "_" + l[1]);
          document.getElementById("card_" + l[0]).selectedItem = selItem;
          gCardData[l[0]] = l[1];
          break;
        case "pinretry":
        case "maxpinlen":
          setValue(l[0], l[1] + " / " + l[2] + " / " + l[3]);
          break;
        case "fpr":
          setValue("key_fpr_1", AnnealMailKey.formatFpr(l[1]));
          setValue("key_fpr_2", AnnealMailKey.formatFpr(l[2]));
          setValue("key_fpr_3", AnnealMailKey.formatFpr(l[3]));
          break;
        case "fprtime":
          setValue("key_created_1", AnnealMailTime.getDateTime(l[1], true, false));
          setValue("key_created_2", AnnealMailTime.getDateTime(l[2], true, false));
          setValue("key_created_3", AnnealMailTime.getDateTime(l[3], true, false));
          break;
        default:
          if (l[0]) {
            setValue(l[0], AnnealMailData.convertCcrToUnicode(l[1].replace(/\\x3a/ig, ":")));
          }
      }
    }
  }
  else {
    if (!dryRun) {
      AnnealMailEvents.dispatchEvent(failWithError, 0, errorMsgObj.value);
    }
  }
  return;
}

function failWithError(errorMsg) {
  AnnealMailDialog.alert(window, errorMsg);
  window.close();
}


function setValue(attrib, value) {
  var elem = document.getElementById("card_" + attrib);
  if (elem) {
    elem.value = value;
  }
  gCardData[attrib] = value;
}

function getValue(attrib) {
  var elem = document.getElementById("card_" + attrib);
  if (elem) {
    return elem.value;
  }
  else {
    return "";
  }
}

function getSelection(attrib) {
  var elem = document.getElementById("card_" + attrib);
  if (elem) {
    return elem.selectedItem.value;
  }
  else {
    return "";
  }
}

function doEditData() {
  document.getElementById("bcEditMode").removeAttribute("readonly");
  document.getElementById("bcEnableMode").removeAttribute("disabled");
}

function doReset() {
  document.getElementById("bcEditMode").setAttribute("readonly", "true");
  document.getElementById("bcEnableMode").setAttribute("disabled", "true");
  onLoad();
}

function doSaveChanges() {
  document.getElementById("bcEditMode").setAttribute("readonly", "true");
  document.getElementById("bcEnableMode").setAttribute("disabled", "true");

  var annealmailSvc = AnnealMailCore.getService(window);
  if (!annealmailSvc) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("accessError"));
    window.close();
    return;
  }

  var forcepin = (getSelection("forcepin") == gCardData.forcepin ? 0 : 1);
  var dialogname = getValue("name");
  var dialogfirstname = getValue("firstname");
  if ((dialogname.search(/^[A-Za-z0-9\.\-,\?_ ]*$/) !== 0) || (dialogfirstname.search(/^[A-Za-z0-9\.\-,\?_ ]*$/) !== 0)) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("Carddetails.NoASCII"));
    onLoad();
    doEditData();
  }
  else {
    AnnealMailKeyEditor.cardAdminData(window,
      AnnealMailData.convertFromUnicode(dialogname),
      AnnealMailData.convertFromUnicode(dialogfirstname),
      getValue("lang"),
      getSelection("sex"),
      AnnealMailData.convertFromUnicode(getValue("url")),
      getValue("login"),
      forcepin,
      function _cardAdminCb(exitCode, errorMsg) {
        if (exitCode !== 0) {
          AnnealMailDialog.alert(window, errorMsg);
        }

        onLoad();
      });
  }
}

function engmailGenerateCardKey() {
  window.openDialog("chrome://annealmail/content/annealmailGenCardKey.xul",
    "", "dialog,modal,centerscreen");

  AnnealMailKeyRing.clearCache();
  onLoad();
}

function annealmailAdminPin() {
  window.openDialog("chrome://annealmail/content/annealmailSetCardPin.xul",
    "", "dialog,modal,centerscreen");
  onLoad();
}
