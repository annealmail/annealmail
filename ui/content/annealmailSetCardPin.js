/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

"use strict";

Components.utils.import("resource://annealmail/keyEditor.jsm"); /* global AnnealMailKeyEditor: false */
Components.utils.import("resource://annealmail/log.jsm"); /* global AnnealMailLog: false */
Components.utils.import("resource://annealmail/locale.jsm"); /* global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /* global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/ccrAgent.jsm"); /* global AnnealMailCcrAgent: false */
Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */

const nsIAnnealMail = Components.interfaces.nsIAnnealMail;
const Ci = Components.interfaces;

const CHANGE_PIN = 'P';
const ADMIN_PIN = 'A';
const UNBLOCK_PIN = 'U';

var gAction = null;

function onLoad() {
  setDlgContent(CHANGE_PIN);
}

function onAccept() {
  var annealmailSvc = AnnealMailCore.getService(window);
  if (!annealmailSvc)
    return false;

  var pinItem1;
  var pinItem2;
  var minLen = 0;
  var action;

  switch (gAction) {
    case CHANGE_PIN:
      pinItem1 = "pinTxt";
      pinItem2 = "pinRepeatTxt";
      minLen = 6;
      action = nsIAnnealMail.CARD_PIN_CHANGE;
      break;
    case UNBLOCK_PIN:
      pinItem1 = "pinTxt";
      pinItem2 = "pinRepeatTxt";
      minLen = 6;
      action = nsIAnnealMail.CARD_PIN_UNBLOCK;
      break;
    case ADMIN_PIN:
      pinItem1 = "adminPinTxt";
      pinItem2 = "adminPinRepeatTxt";
      minLen = 8;
      action = nsIAnnealMail.CARD_ADMIN_PIN_CHANGE;
      break;
  }
  var adminPin = "";
  var oldPin = "";
  var newPin = "";

  if (!AnnealMailCcrAgent.useCcrAgent()) {
    adminPin = document.getElementById("currAdmPinTxt").value;
    oldPin = document.getElementById("currPinTxt").value;
    newPin = document.getElementById(pinItem1).value;

    if (newPin.length < minLen) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("cardPin.minLength", minLen));
      return false;
    }
    if (newPin != document.getElementById(pinItem2).value) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("cardPin.dontMatch"));
      return false;
    }
  }

  var pinObserver = new changePinObserver();

  AnnealMailKeyEditor.cardChangePin(window,
    action,
    oldPin,
    newPin,
    adminPin,
    pinObserver,
    function _ChangePinCb(exitCode, errorMsg) {
      if (exitCode !== 0) {
        AnnealMailDialog.alert(window, AnnealMailLocale.getString("cardPin.processFailed") + "\n" + pinObserver.result);
      }
      else
        window.close();
    });

  return false;
}

function dlgEnable(item) {
  document.getElementById(item).removeAttribute("collapsed");
}

function dlgDisable(item) {
  document.getElementById(item).setAttribute("collapsed", "true");
}

function setDlgContent(sel) {
  var annealmailSvc = AnnealMailCore.getService(window);
  if (!annealmailSvc)
    return;

  gAction = sel;

  if (AnnealMailCcrAgent.useCcrAgent()) {
    dlgDisable("currAdminPinRow");
    dlgDisable("adminPinRow");
    dlgDisable("adminPinRepeatRow");
    dlgDisable("currPinRow");
    dlgDisable("pinRow");
    dlgDisable("pinRepeatRow");
    return;
  }

  switch (sel) {
    case 'P':
      dlgDisable("currAdminPinRow");
      dlgDisable("adminPinRow");
      dlgDisable("adminPinRepeatRow");
      dlgEnable("currPinRow");
      dlgEnable("pinRow");
      dlgEnable("pinRepeatRow");
      break;
    case 'A':
      dlgEnable("currAdminPinRow");
      dlgEnable("adminPinRow");
      dlgEnable("adminPinRepeatRow");
      dlgDisable("currPinRow");
      dlgDisable("pinRow");
      dlgDisable("pinRepeatRow");
      break;
    case 'U':
      dlgEnable("currAdminPinRow");
      dlgDisable("adminPinRow");
      dlgDisable("adminPinRepeatRow");
      dlgDisable("currPinRow");
      dlgEnable("pinRow");
      dlgEnable("pinRepeatRow");
      break;
  }
}

function changePinObserver() {}

changePinObserver.prototype = {
  _data: "",
  result: "",

  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsIEnigMimeReadCallback) ||
      iid.equals(Ci.nsISupports))
      return this;

    throw Components.results.NS_NOINTERFACE;
  },

  onDataAvailable: function(data) {
    var ret = "";
    AnnealMailLog.DEBUG("annealmailSetCardPin: changePinObserver.onDataAvailable: data=" + data + "\n");
    if (data.indexOf("[GNUPG:] SC_OP_FAILURE") >= 0) {
      this.result = this._data;
    }
    else if (data.indexOf("[GNUPG:] BAD_PASSPHRASE") >= 0) {
      this.result = AnnealMailLocale.getString("badPhrase");
      return data;
    }
    else {
      this._data = data;
    }
    return "";
  }
};
