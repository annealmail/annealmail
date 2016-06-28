/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global gAccount: false, gIdentity: false, onOk: false, smimeOnAcceptEditor: false */

"use strict";

Components.utils.import("resource://annealmail/funcs.jsm"); /* global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/locale.jsm"); /* global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/windows.jsm"); /* global AnnealMailWindows: false */

if (!AnnealMail) var AnnealMail = {};

AnnealMail.edit = {
  account: null,
  identity: null,
  enablePgp: null,
  pgpKeyMode: null,
  pgpKeyId: null,
  cryptoChoicesEnabled: null,
  signingPolicy: null, // account specific: by default sign
  encryptionPolicy: null, // account specific: by default encrypt
  pgpMimeMode: null, // account specific: by default pgp/mime
  pgpSignPlainPolicy: null,
  pgpSignEncPolicy: null,
  autoEncryptDrafts: null,
  advancedSettings: null,

  onInit: function() {
    // initialize all of our elements based on the current identity values....
    AnnealMailFuncs.collapseAdvanced(document.getElementById("annealmail_PrefsBox"), "hidden");

    this.enablePgp = document.getElementById("annealmail_enablePgp");
    this.pgpKeyMode = document.getElementById("annealmail_pgpKeyMode");
    this.pgpKeyId = document.getElementById("annealmail_identity.pgpkeyId");
    this.signingPolicy = document.getElementById("annealmail_sign_ifPossible");
    this.encryptionPolicy = document.getElementById("annealmail_encrypt_ifPossible");
    this.pgpMimeMode = document.getElementById("annealmail_pgpMimeMode");
    this.pgpSignEncPolicy = document.getElementById("annealmail_sign_encrypted");
    this.pgpSignPlainPolicy = document.getElementById("annealmail_sign_notEncrypted");
    this.autoEncryptDrafts = document.getElementById("annealmail_autoEncryptDrafts");

    if (this.identity) {
      this.enablePgp.checked = this.identity.getBoolAttribute("enablePgp");
      this.cryptoChoicesEnabled = this.enablePgp.checked;

      var selectedItemId = null;
      var keyPolicy = this.identity.getIntAttribute("pgpKeyMode");
      switch (keyPolicy) {
        case 1:
          selectedItemId = 'annealmail_keymode_usePgpkeyId';
          break;
        default:
          selectedItemId = 'annealmail_keymode_useFromAddress';
          break;
      }
      this.pgpKeyMode.selectedItem = document.getElementById(selectedItemId);

      this.pgpKeyId.value = this.identity.getCharAttribute("pgpkeyId");
      AnnealMailFuncs.getSignMsg(this.identity);
      this.signingPolicy.checked = (this.identity.getIntAttribute("defaultSigningPolicy") > 0);
      this.encryptionPolicy.checked = (this.identity.getIntAttribute("defaultEncryptionPolicy") > 0);
      this.pgpMimeMode.checked = this.identity.getBoolAttribute("pgpMimeMode");
      this.pgpSignEncPolicy.checked = this.identity.getBoolAttribute("pgpSignEncrypted");
      this.pgpSignPlainPolicy.checked = this.identity.getBoolAttribute("pgpSignPlain");
      this.autoEncryptDrafts.checked = this.identity.getBoolAttribute("autoEncryptDrafts");
      this.advancedSettings = {
        openPgpHeaderMode: this.identity.getIntAttribute("openPgpHeaderMode"),
        openPgpUrlName: this.identity.getCharAttribute("openPgpUrlName"),
        attachPgpKey: this.identity.getBoolAttribute("attachPgpKey")
      };

    }
    else {
      this.enablePgp.checked = false;
      this.cryptoChoicesEnabled = false;
      this.pgpMimeMode.checked = true;
      this.advancedSettings = {
        openPgpHeaderMode: 0,
        openPgpUrlName: "",
        attachPgpKey: false
      };
    }

    // Disable all locked elements on the panel
    //onLockPreference();
    this.enableAllPrefs();
  },

  onLoadEditor: function() {
    if (typeof(gAccount) == "object") {
      this.account = gAccount;
      this.identity = gIdentity;
    }
    else {
      this.identity = window.arguments[0].identity;
      this.account = window.arguments[0].account;
    }

    if (this.identity) {
      var idLabel = AnnealMailLocale.getString("identityName", [this.identity.identityName]);
      document.getElementById("annealmail_identityName").value = idLabel;
    }

    var dlg = document.getElementsByTagName("dialog")[0];
    dlg.setAttribute("ondialogaccept", "return AnnealMail.edit.onAcceptEditor();");

    this.onInit();
  },

  onAcceptEditor: function() {
    try {
      if (onOk() === false) {
        return false;
      }
    }
    catch (ex) {}
    this.onSave();
    if (typeof(smimeOnAcceptEditor) == "function") {
      return smimeOnAcceptEditor();
    }
    else
      return true;
  },

  onSave: function() {
    if (!this.identity) {
      this.identity = gIdentity;
    }
    this.identity.setBoolAttribute("enablePgp", this.enablePgp.checked);

    if (this.enablePgp.checked) {
      // PGP is enabled
      this.identity.setIntAttribute("pgpKeyMode", this.pgpKeyMode.selectedItem.value);
      this.identity.setCharAttribute("pgpkeyId", this.pgpKeyId.value);
      this.identity.setIntAttribute("defaultSigningPolicy", (this.signingPolicy.checked ? 1 : 0));
      this.identity.setIntAttribute("defaultEncryptionPolicy", (this.encryptionPolicy.checked ? 1 : 0));
      this.identity.setBoolAttribute("pgpMimeMode", this.pgpMimeMode.checked);
      this.identity.setBoolAttribute("pgpSignEncrypted", this.pgpSignEncPolicy.checked);
      this.identity.setBoolAttribute("pgpSignPlain", this.pgpSignPlainPolicy.checked);
      this.identity.setBoolAttribute("autoEncryptDrafts", this.autoEncryptDrafts.checked);
      this.identity.setIntAttribute("openPgpHeaderMode", this.advancedSettings.openPgpHeaderMode);
      this.identity.setCharAttribute("openPgpUrlName", this.advancedSettings.openPgpUrlName);
      this.identity.setBoolAttribute("attachPgpKey", this.advancedSettings.attachPgpKey);

    }
  },

  toggleEnable: function() {
    this.cryptoChoicesEnabled = (!this.cryptoChoicesEnabled);
    this.enableAllPrefs();
  },

  enableAllPrefs: function() {
    var elem = document.getElementById("annealmail_bcEnablePgp");
    if (this.cryptoChoicesEnabled) {
      if (elem) elem.removeAttribute("disabled");
    }
    else {
      if (elem) elem.setAttribute("disabled", "true");
    }

    this.enableKeySel(this.cryptoChoicesEnabled && (this.pgpKeyMode.value == 1));

  },

  enableKeySel: function(enable) {
    if (enable) {
      document.getElementById("annealmail_bcUseKeyId").removeAttribute("disabled");
    }
    else {
      document.getElementById("annealmail_bcUseKeyId").setAttribute("disabled", "true");
    }
  },

  selectKeyId: function() {
    var resultObj = {};
    var inputObj = {};
    inputObj.dialogHeader = AnnealMailLocale.getString("encryptKeyHeader");
    inputObj.options = "single,hidexpired,private,nosending";
    var button = document.getElementById("annealmail_selectPgpKey");
    var label = button.getAttribute("label");
    inputObj.options += ",sendlabel=" + label;
    inputObj.options += ",";

    window.openDialog("chrome://annealmail/content/annealmailKeySelection.xul", "", "dialog,modal,centerscreen,resizable", inputObj, resultObj);
    try {
      if (resultObj.cancelled) return;
      var selKey = resultObj.userList[0];
      //selKey = "0x"+selKey.substring(10,18);
      this.pgpKeyId.value = selKey;
    }
    catch (ex) {
      // cancel pressed -> don't send mail
      return;
    }
  },

  advancedIdentitySettings: function() {
    var inputObj = {
      identitySettings: this.advancedSettings,
      pgpKeyMode: this.pgpKeyMode.selectedItem.value
    };
    window.openDialog("chrome://annealmail/content/annealmailAdvancedIdentityDlg.xul", "", "dialog,modal,centerscreen", inputObj);
  }
};
