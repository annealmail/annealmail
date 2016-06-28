/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global Components: false */

// modules:
/* global AnnealMailLocale: false, AnnealMailWindows: false, AnnealMailLog: false, AnnealMailCore: false, AnnealMailDialog: false */
/* global AnnealMailKeyEditor: false, fillIdentityListPopup: false, getCurrentIdentity: false */

// annealmailCommon.js:
/* global EnigConfirm: false, EnigCreateRevokeCert: false */

var gUserIdentityList;
var gUserIdentityListPopup;
var gUseForSigning;
var gUsedId;

function onLoad() {
  gUserIdentityList = document.getElementById("userIdentity");
  gUserIdentityListPopup = document.getElementById("userIdentityPopup");
  gUseForSigning = document.getElementById("useForSigning");
  //document.getElementById("bcNoExpiry")
  if (gUserIdentityListPopup) {
    fillIdentityListPopup();
  }
}

function onClose() {
  window.close();
}

function enableDisable(watchElement, bcElement, inverted) {
  var bcBackupKey = document.getElementById(bcElement);

  if (document.getElementById(watchElement).checked) {
    if (inverted) {
      bcBackupKey.setAttribute("disabled", "true");
    }
    else {
      bcBackupKey.removeAttribute("disabled");
    }
  }
  else {
    if (inverted) {
      bcBackupKey.removeAttribute("disabled");
    }
    else {
      bcBackupKey.setAttribute("disabled", "true");
    }
  }
}

function enigGenKeyObserver() {}

enigGenKeyObserver.prototype = {
  keyId: null,
  backupLocation: null,
  _state: 0,

  QueryInterface: function(iid) {
    //AnnealMailLog.DEBUG("annealmailGenCardKey: EnigMimeReadCallback.QI: "+iid+"\n");
    if (iid.equals(Components.interfaces.nsIEnigMimeReadCallback) ||
      iid.equals(Components.interfaces.nsISupports))
      return this;

    throw Components.results.NS_NOINTERFACE;
  },

  onDataAvailable: function(data) {

    var txt = "";
    var aLine = data.split(/ +/);

    if (aLine[0] == "[GNUPG:]") {

      if (aLine[1] == "GET_LINE" && aLine[2] == "keygen.comment") {
        txt = AnnealMailLocale.getString("keygen.started") + "\n";
        this._state = 1;
      }
      else if (aLine[1] == "PROGRESS" && aLine[2] == "primegen") {
        txt = aLine[3];
      }
      else if (aLine[1] == "BACKUP_KEY_CREATED") {
        this.backupLocation = data.replace(/^.*BACKUP_KEY_CREATED [A-Z0-9]+ +/, "");
      }
      else if (aLine[1] == "KEY_CREATED") {
        this.keyId = aLine[3].substr(-16);
      }

    }
    else if (this._state > 0) {
      txt = data + "\n";
    }

    if (txt) {
      var contentFrame = AnnealMailWindows.getFrame(window, "keygenConsole");

      if (contentFrame) {
        var consoleElement = contentFrame.document.getElementById('console');
        consoleElement.firstChild.data += txt;
        if (!contentFrame.mouseDownState)
          contentFrame.scrollTo(0, 9999);
      }
    }

    return "";
  }
};

function startKeyGen() {
  AnnealMailLog.DEBUG("annealmailGenCardKey: startKeyGen(): Start\n");

  var annealmailSvc = AnnealMailCore.getService(window);
  if (!annealmailSvc) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("accessError"));
    return;
  }

  var passphraseElement = document.getElementById("passphrase");
  var passphrase2Element = document.getElementById("passphraseRepeat");
  var createBackupElement = document.getElementById("createBackup");

  var passphrase = passphraseElement.value;

  if (!createBackupElement.checked) {
    passphrase = "";
  }
  else {
    if (passphrase != passphrase2Element.value) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("passNoMatch"));
      return;
    }

    if (passphrase.search(/[^\x20-\x7E]/) >= 0) {
      if (!AnnealMailDialog.confirmDlg(window, AnnealMailLocale.getString("keygen.passCharProblem"),
          AnnealMailLocale.getString("dlg.button.ignore"), AnnealMailLocale.getString("dlg.button.cancel"))) {
        return;
      }
    }

    if (!passphrase) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("keygen.passRequired"));
      return;
    }
  }

  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  var expiryTime = 0;
  var valid = "0";
  if (!noExpiry.checked) {
    expiryTime = Number(expireInput.value) * (timeScale.value == "y" ? 365 : (timeScale.value == "m" ? 30 : 1));
    if (expiryTime > 36500) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("expiryTooLong"));
      return;
    }
    if (expiryTime <= 0) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("expiryTooShort"));
      return;
    }
    valid = String(Number(expireInput.value));
    if (timeScale.value != "d") valid += timeScale.value;
  }
  var curId = getCurrentIdentity();
  gUsedId = curId;

  var userName = curId.fullName;
  var userEmail = curId.email;

  if (!userName) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("passUserName"));
    return;
  }

  var idString = userName;

  idString += " <" + userEmail + ">";

  var confirmMsg = AnnealMailLocale.getString("keyConfirm", idString);

  if (!EnigConfirm(confirmMsg, AnnealMailLocale.getString("keyMan.button.generateKey"))) {
    return;
  }
  var contentFrame = AnnealMailWindows.getFrame(window, "keygenConsole");
  if (contentFrame) {
    var consoleElement = contentFrame.document.getElementById('console');
    consoleElement.firstChild.data = "";
  }

  var generateObserver = new enigGenKeyObserver();
  AnnealMailKeyEditor.genCardKey(window,
    userName,
    userEmail,
    "", // user id comment
    valid,
    passphrase,
    generateObserver,
    function _keyGenCb(exitCode, errorMsg) {

      if (exitCode === 0 && generateObserver.keyId) {

        if (document.getElementById("useForSigning").checked && generateObserver.keyId) {
          gUsedId.setBoolAttribute("enablePgp", true);
          gUsedId.setIntAttribute("pgpKeyMode", 1);
          gUsedId.setCharAttribute("pgpkeyId", "0x" + generateObserver.keyId.substr(-8, 8));
        }

        var msg = AnnealMailLocale.getString("keygen.completed", generateObserver.keyId);

        if (generateObserver.backupLocation) {
          msg += "\n" + AnnealMailLocale.getString("keygen.keyBackup", generateObserver.backupLocation);
        }

        if (AnnealMailDialog.confirmDlg(window, msg + "\n\n" + AnnealMailLocale.getString("revokeCertRecommended"), AnnealMailLocale.getString("keyMan.button.generateCert"))) {
          EnigCreateRevokeCert(generateObserver.keyId, curId.email, closeWin);
        }
        else
          closeWin();
      }
      else {
        AnnealMailDialog.alert(window, errorMsg);
      }
    });
}

function closeWin() {
  window.close();
}
