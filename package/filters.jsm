/*global Components: false, AnnealMailDecryptPermanently: false, AnnealMailCore: false, AnnealMailLog: false, AnnealMailLocale: false, AnnealMailDialog: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailFilters"];

Components.utils.import("resource://annealmail/core.jsm");
Components.utils.import("resource://annealmail/decryptPermanently.jsm");
Components.utils.import("resource://annealmail/log.jsm");
Components.utils.import("resource://annealmail/locale.jsm");
Components.utils.import("resource://annealmail/dialog.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

/********************************************************************************
 Filter actions for decrypting messages permanently
 ********************************************************************************/

/**
 * filter action for creating a decrypted version of the mail and
 * deleting the original mail at the same time
 */

const filterActionMoveDecrypt = {
  id: "annealmail@annealmail.org#filterActionMoveDecrypt",
  name: AnnealMailLocale.getString("filter.decryptMove.label"),
  value: "movemessage",
  apply: function(aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {

    AnnealMailLog.DEBUG("annealmail.js: filterActionMoveDecrypt: Move to: " + aActionValue + "\n");

    var msgHdrs = [];

    for (var i = 0; i < aMsgHdrs.length; i++) {
      msgHdrs.push(aMsgHdrs.queryElementAt(i, Ci.nsIMsgDBHdr));
    }

    AnnealMailDecryptPermanently.dispatchMessages(msgHdrs, aActionValue, true, true);

    return;
  },

  isValidForType: function(type, scope) {
    return true;
  },

  validateActionValue: function(value, folder, type) {
    AnnealMailDialog.alert(null, AnnealMailLocale.getString("filter.decryptMove.warnExperimental"));

    if (value === "") {
      return AnnealMailLocale.getString("filter.folderRequired");
    }

    return null;
  },

  allowDuplicates: false,
  isAsync: false,
  needsBody: true
};

/**
 * filter action for creating a decrypted copy of the mail, leaving the original
 * message untouched
 */
const filterActionCopyDecrypt = {
  id: "annealmail@annealmail.org#filterActionCopyDecrypt",
  name: AnnealMailLocale.getString("filter.decryptCopy.label"),
  value: "copymessage",
  apply: function(aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {
    AnnealMailLog.DEBUG("annealmail.js: filterActionCopyDecrypt: Copy to: " + aActionValue + "\n");

    var msgHdrs = [];

    for (var i = 0; i < aMsgHdrs.length; i++) {
      msgHdrs.push(aMsgHdrs.queryElementAt(i, Ci.nsIMsgDBHdr));
    }

    AnnealMailDecryptPermanently.dispatchMessages(msgHdrs, aActionValue, false, true);
    return;
  },

  isValidForType: function(type, scope) {
    return true;
  },

  validateActionValue: function(value, folder, type) {
    if (value === "") {
      return AnnealMailLocale.getString("filter.folderRequired");
    }

    return null;
  },

  allowDuplicates: false,
  isAsync: false,
  needsBody: true
};

const AnnealMailFilters = {
  registerAll: function() {
    var filterService = Cc["@mozilla.org/messenger/services/filters;1"].getService(Ci.nsIMsgFilterService);
    filterService.addCustomAction(filterActionMoveDecrypt);
    filterService.addCustomAction(filterActionCopyDecrypt);
  }
};
