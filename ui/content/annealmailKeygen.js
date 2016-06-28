/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://annealmail/content/annealmailCommon.js

"use strict";

// modules
/* global AnnealMailData: false, AnnealMailLog: false, AnnealMailLocale: false, AnnealMailCcr: false, AnnealMailKeyEditor: false */
/* global AnnealMailOS: false, AnnealMailPrefs: false, AnnealMailCcrAgent: false, AnnealMailApp: false, AnnealMailKeyRing: false */
/* global AnnealMailDialog: false */

// from annealmailCommon.js:
/* global EnigGetWindowOptions: false, EnigConfirm: false, EnigGetString: false, GetAnnealMailSvc: false */
/* global EnigLongAlert: false, EnigAlert: false, EnigInitCommon: false, ENIG_ACCOUNT_MANAGER_CONTRACTID: false */
/* global EnigGetPref: false, EnigSetPref: false, EnigSavePrefs: false, EnigFilePicker: false, EnigGetFilePath: false */
/* global AnnealMailWindows: false, EnigCreateRevokeCert: false */

// Initialize annealmailCommon
EnigInitCommon("annealmailKeygen");

var gAccountManager = Components.classes[ENIG_ACCOUNT_MANAGER_CONTRACTID].getService(Components.interfaces.nsIMsgAccountManager);

var gUserIdentityList;
var gUserIdentityListPopup;
var gUseForSigning;

var gKeygenRequest;
var gAllData = "";
var gGeneratedKey = null;
var gUsedId;

const KEYGEN_CANCELLED = "cancelled";
const KEYTYPE_DSA = 1;
const KEYTYPE_RSA = 2;

function annealmailKeygenLoad() {
  AnnealMailLog.DEBUG("annealmailKeygen.js: Load\n");

  gUserIdentityList = document.getElementById("userIdentity");
  gUserIdentityListPopup = document.getElementById("userIdentityPopup");
  gUseForSigning = document.getElementById("useForSigning");

  var noPassphrase = document.getElementById("noPassphrase");

  if (!AnnealMailCcr.getCcrFeature("keygen-passphrase")) {
    document.getElementById("passphraseRow").setAttribute("collapsed", "true");
    noPassphrase.setAttribute("collapsed", "true");
  }

  if (gUserIdentityListPopup) {
    fillIdentityListPopup();
  }
  gUserIdentityList.focus();

  // restore safe setting, which you ALWAYS explicitly have to overrule,
  // if you don't want them:
  // - specify passphrase
  // - specify expiry date
  noPassphrase.checked = false;
  EnigSetPref("noPassphrase", noPassphrase.checked);
  var noExpiry = document.getElementById("noExpiry");
  noExpiry.checked = false;

  annealmailKeygenUpdate(true, false);

  var annealmailSvc = GetAnnealMailSvc();
  if (!annealmailSvc) {
    EnigAlert(EnigGetString("accessError"));
  }

  if (AnnealMailCcrAgent.agentType != "ccr") {
    EnigAlert(EnigGetString("onlyCCR"));
    return;
  }
}

function annealmailOnClose() {
  var closeWin = true;
  if (gKeygenRequest) {
    closeWin = EnigConfirm(EnigGetString("keyAbort"), EnigGetString("keyMan.button.generateKeyAbort"), EnigGetString("keyMan.button.generateKeyContinue"));
  }
  if (closeWin) abortKeyGeneration();
  return closeWin;
}

function annealmailKeygenUnload() {
  AnnealMailLog.DEBUG("annealmailKeygen.js: Unload\n");

  annealmailKeygenCloseRequest();
}


function annealmailKeygenUpdate(getPrefs, setPrefs) {
  AnnealMailLog.DEBUG("annealmailKeygen.js: Update: " + getPrefs + ", " + setPrefs + "\n");

  var noPassphrase = document.getElementById("noPassphrase");
  var noPassphraseChecked = getPrefs ? EnigGetPref("noPassphrase") : noPassphrase.checked;

  if (setPrefs) {
    EnigSetPref("noPassphrase", noPassphraseChecked);
  }

  noPassphrase.checked = noPassphraseChecked;

  var passphrase1 = document.getElementById("passphrase");
  var passphrase2 = document.getElementById("passphraseRepeat");
  passphrase1.disabled = noPassphraseChecked;
  passphrase2.disabled = noPassphraseChecked;
}

function annealmailKeygenTerminate(exitCode) {
  AnnealMailLog.DEBUG("annealmailKeygen.js: Terminate:\n");

  var curId = gUsedId;

  gKeygenRequest = null;

  if ((!gGeneratedKey) || gGeneratedKey == KEYGEN_CANCELLED) {
    if (!gGeneratedKey)
      EnigAlert(EnigGetString("keyGenFailed"));
    return;
  }

  var progMeter = document.getElementById("keygenProgress");
  progMeter.setAttribute("value", 100);

  if (gGeneratedKey) {
    if (gUseForSigning.checked) {
      curId.setBoolAttribute("enablePgp", true);
      curId.setIntAttribute("pgpKeyMode", 1);
      curId.setCharAttribute("pgpkeyId", "0x" + gGeneratedKey.substr(-8, 8));

      annealmailKeygenUpdate(false, true);

      EnigSavePrefs();

      AnnealMailWindows.keyManReloadKeys();

      if (EnigConfirm(EnigGetString("keygenComplete", curId.email) + "\n\n" + EnigGetString("revokeCertRecommended"), EnigGetString("keyMan.button.generateCert"))) {
        EnigCreateRevokeCert(gGeneratedKey, curId.email, closeAndReset);
      }
      else
        closeAndReset();
    }
    else {
      if (EnigConfirm(EnigGetString("genCompleteNoSign") + "\n\n" + EnigGetString("revokeCertRecommended"), EnigGetString("keyMan.button.generateCert"))) {
        EnigCreateRevokeCert(gGeneratedKey, curId.email, closeAndReset);
        genAndSaveRevCert(gGeneratedKey, curId.email).then(
          function _resolve() {
            closeAndReset();
          },
          function _reject() {
            // do nothing
          }
        );
      }
      else
        closeAndReset();
    }
  }
  else {
    EnigAlert(EnigGetString("keyGenFailed"));
    window.close();
  }
}

/**
 * generate and save a revokation certificate.
 *
 * return: Promise object
 */

function genAndSaveRevCert(keyId, uid) {
  AnnealMailLog.DEBUG("annealmailKeygen.js: genAndSaveRevCert\n");

  return new Promise(
    function(resolve, reject) {

      let keyIdShort = "0x" + keyId.substr(-16, 16);
      let keyFile = AnnealMailApp.getProfileDirectory();
      keyFile.append(keyIdShort + "_rev.asc");

      // create a revokation cert in the TB profile directoy
      AnnealMailKeyEditor.genRevokeCert(window, "0x" + keyId, keyFile, "1", "",
        function _revokeCertCb(exitCode, errorMsg) {
          if (exitCode !== 0) {
            EnigAlert(EnigGetString("revokeCertFailed") + "\n\n" + errorMsg);
            reject(1);
          }
          saveRevCert(keyFile, keyId, uid, resolve, reject);
        });
    }
  );
}

/**
 *  create a copy of the revokation cert at a user defined location
 */
function saveRevCert(inputKeyFile, keyId, uid, resolve, reject) {

  let defaultFileName = uid.replace(/[\\\/<\>]/g, "");
  defaultFileName += " (0x" + keyId.substr(-8, 8) + ") rev.asc";

  let outFile = EnigFilePicker(EnigGetString("saveRevokeCertAs"),
    "", true, "*.asc",
    defaultFileName, [EnigGetString("asciiArmorFile"), "*.asc"]);

  if (outFile) {
    try {
      inputKeyFile.copyToFollowingLinks(outFile.parent, outFile.leafName);
      EnigAlert(EnigGetString("revokeCertOK"));
    }
    catch (ex) {
      EnigAlert(EnigGetString("revokeCertFailed"));
      reject(2);
    }
  }
  resolve();
}

function closeAndReset() {
  AnnealMailKeyRing.clearCache();
  window.close();
}

// Cleanup
function annealmailKeygenCloseRequest() {
  AnnealMailLog.DEBUG("annealmailKeygen.js: CloseRequest\n");

  if (gKeygenRequest) {
    var p = gKeygenRequest;
    gKeygenRequest = null;
    p.kill(false);
  }
}

function annealmailCheckPassphrase() {
  var passphraseElement = document.getElementById("passphrase");
  var passphrase2Element = document.getElementById("passphraseRepeat");

  var passphrase = passphraseElement.value;

  if (passphrase != passphrase2Element.value) {
    EnigAlert(EnigGetString("passNoMatch"));
    return null;
  }

  if (passphrase.search(/[^\x20-\x7E]/) >= 0) {
    if (!AnnealMailDialog.confirmDlg(window, AnnealMailLocale.getString("keygen.passCharProblem"),
        AnnealMailLocale.getString("dlg.button.ignore"), AnnealMailLocale.getString("dlg.button.cancel"))) {
      return null;
    }
  }
  if ((passphrase.search(/^\s/) === 0) || (passphrase.search(/\s$/) >= 0)) {
    EnigAlert(EnigGetString("passSpaceProblem"));
    return null;
  }

  if (passphrase.length < 8) {
    EnigAlert(EnigGetString("passphrase.min8keys"));
    return null;
  }
  return passphrase;
}



function annealmailKeygenStart() {
  AnnealMailLog.DEBUG("annealmailKeygen.js: Start\n");


  if (gKeygenRequest) {
    let req = gKeygenRequest.QueryInterface(Components.interfaces.nsIRequest);
    if (req.isPending()) {
      EnigAlert(EnigGetString("genGoing"));
      return;
    }
  }

  gGeneratedKey = null;
  gAllData = "";

  var annealmailSvc = GetAnnealMailSvc();
  if (!annealmailSvc) {
    EnigAlert(EnigGetString("accessError"));
    return;
  }

  var passphrase;
  // ccr >= 2.1 queries passphrase using ccr-agent only
  if (AnnealMailCcr.getCcrFeature("keygen-passphrase")) {
    var noPassphraseElement = document.getElementById("noPassphrase");
    var passphraseElement = document.getElementById("passphrase");

    if (!noPassphraseElement.checked) {
      if (passphraseElement.value.trim() === "") {
        EnigAlert(EnigGetString("passCheckBox"));
        return;
      }

      passphrase = annealmailCheckPassphrase();
      if (!passphrase) return;
    }

  }
  else {
    passphrase = "";
  }

  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  var expiryTime = 0;
  if (!noExpiry.checked) {
    expiryTime = Number(expireInput.value) * Number(timeScale.value);
    if (expiryTime > 36500) {
      EnigAlert(EnigGetString("expiryTooLong"));
      return;
    }
    if (expiryTime <= 0) {
      EnigAlert(EnigGetString("expiryTooShort"));
      return;
    }
  }
  var keySize = Number(document.getElementById("keySize").value);
  var keyType = Number(document.getElementById("keyType").value);

  if ((keyType == KEYTYPE_DSA) && (keySize > 3072)) {
    EnigAlert(EnigGetString("dsaSizeLimit"));
    keySize = 3072;
  }

  var curId = getCurrentIdentity();
  gUsedId = curId;

  var userName = curId.fullName;
  var userEmail = curId.email;

  if (!userName) {
    EnigAlert(EnigGetString("keygen.missingUserName"));
    return;
  }

  var idString = userName;

  idString += " <" + userEmail + ">";

  var confirmMsg = EnigGetString("keyConfirm", idString);

  if (!EnigConfirm(confirmMsg, EnigGetString("keyMan.button.generateKey"))) {
    return;
  }

  var proc = null;

  var listener = {
    onStartRequest: function() {},
    onStopRequest: function(status) {
      annealmailKeygenTerminate(status);
    },
    onDataAvailable: function(data) {
      AnnealMailLog.DEBUG("annealmailKeygen.js: onDataAvailable() " + data + "\n");

      gAllData += data;
      var keyCreatedIndex = gAllData.indexOf("[GNUPG:] KEY_CREATED");
      if (keyCreatedIndex > 0) {
        gGeneratedKey = gAllData.substr(keyCreatedIndex);
        gGeneratedKey = gGeneratedKey.replace(/(.*\[GNUPG:\] KEY_CREATED . )([a-fA-F0-9]+)([\n\r].*)*/, "$2");
        gAllData = gAllData.replace(/\[GNUPG:\] KEY_CREATED . [a-fA-F0-9]+[\n\r]/, "");
      }
      gAllData = gAllData.replace(/[\r\n]*\[GNUPG:\] GOOD_PASSPHRASE/g, "").replace(/([\r\n]*\[GNUPG:\] PROGRESS primegen )(.)( \d+ \d+)/g, "$2");
      var progMeter = document.getElementById("keygenProgress");
      var progValue = Number(progMeter.value);
      progValue += (1 + (100 - progValue) / 200);
      if (progValue >= 95) progValue = 10;
      progMeter.setAttribute("value", progValue);
    }
  };

  try {
    gKeygenRequest = AnnealMailKeyRing.generateKey(
      AnnealMailData.convertFromUnicode(userName),
      "", // user id comment
      AnnealMailData.convertFromUnicode(userEmail),
      expiryTime,
      keySize,
      keyType,
      AnnealMailData.convertFromUnicode(passphrase),
      listener);
  }
  catch (ex) {
    AnnealMailLog.DEBUG("annealmailKeygen.js: generateKey() failed with " + ex.toString() + "\n" + ex.stack + "\n");
  }

  if (!gKeygenRequest) {
    EnigAlert(EnigGetString("keyGenFailed"));
  }

  AnnealMailLog.WRITE("annealmailKeygen.js: Start: gKeygenRequest = " + gKeygenRequest + "\n");
}

function abortKeyGeneration() {
  gGeneratedKey = KEYGEN_CANCELLED;
  annealmailKeygenCloseRequest();
}

function annealmailKeygenCancel() {
  AnnealMailLog.DEBUG("annealmailKeygen.js: Cancel\n");
  var closeWin = false;

  if (gKeygenRequest) {
    closeWin = EnigConfirm(EnigGetString("keyAbort"), EnigGetString("keyMan.button.generateKeyAbort"), EnigGetString("keyMan.button.generateKeyContinue"));
    if (closeWin) abortKeyGeneration();
  }
  else {
    closeWin = true;
  }

  if (closeWin) window.close();
}

function onNoExpiry() {
  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  expireInput.disabled = noExpiry.checked;
  timeScale.disabled = noExpiry.checked;
}


function queryISupArray(supportsArray, iid) {
  var result = [];
  var i;
  // Gecko > 20
  for (i = 0; i < supportsArray.length; i++) {
    result.push(supportsArray.queryElementAt(i, iid));
  }

  return result;
}

function getCurrentIdentity() {
  var item = gUserIdentityList.selectedItem;
  var identityKey = item.getAttribute('id');

  var identity = gAccountManager.getIdentity(identityKey);

  return identity;
}

function fillIdentityListPopup() {
  AnnealMailLog.DEBUG("annealmailKeygen.js: fillIdentityListPopup\n");

  var idSupports = gAccountManager.allIdentities;
  var identities = queryISupArray(idSupports,
    Components.interfaces.nsIMsgIdentity);

  AnnealMailLog.DEBUG("annealmailKeygen.js: fillIdentityListPopup: " + identities + "\n");

  // Default identity
  var defIdentity;
  var defIdentities = gAccountManager.defaultAccount.identities;
  try {
    // Gecko >= 20
    if (defIdentities.length >= 1) {
      defIdentity = defIdentities.queryElementAt(0, Components.interfaces.nsIMsgIdentity);
    }
    else {
      defIdentity = identities[0];
    }
  }
  catch (ex) {
    // Gecko < 20
    if (defIdentities.Count() >= 1) {
      defIdentity = defIdentities.QueryElementAt(0, Components.interfaces.nsIMsgIdentity);
    }
    else {
      defIdentity = identities[0];
    }
  }

  AnnealMailLog.DEBUG("annealmailKeygen.js: fillIdentityListPopup: default=" + defIdentity.key + "\n");

  var selected = false;
  for (var i = 0; i < identities.length; i++) {
    var identity = identities[i];

    AnnealMailLog.DEBUG("id.valid=" + identity.valid + "\n");
    if (!identity.valid || !identity.email)
      continue;

    var serverSupports, inServer;
    try {
      // Gecko >= 20
      serverSupports = gAccountManager.getServersForIdentity(identity);
      if (serverSupports.length > 0) {
        inServer = serverSupports.queryElementAt(0, Components.interfaces.nsIMsgIncomingServer);
      }
    }
    catch (ex) {
      // Gecko < 20
      serverSupports = gAccountManager.GetServersForIdentity(identity);
      if (serverSupports.GetElementAt(0)) {
        inServer = serverSupports.GetElementAt(0).QueryInterface(Components.interfaces.nsIMsgIncomingServer);
      }
    }

    if (inServer) {
      var accountName = " - " + inServer.prettyName;

      AnnealMailLog.DEBUG("annealmailKeygen.js: accountName=" + accountName + "\n");
      AnnealMailLog.DEBUG("annealmailKeygen.js: email=" + identity.email + "\n");

      var item = document.createElement('menuitem');
      //      item.setAttribute('label', identity.identityName);
      item.setAttribute('label', identity.identityName + accountName);
      item.setAttribute('class', 'identity-popup-item');
      item.setAttribute('accountname', accountName);
      item.setAttribute('id', identity.key);
      item.setAttribute('email', identity.email);

      gUserIdentityListPopup.appendChild(item);

      if (!selected)
        gUserIdentityList.selectedItem = item;

      if (identity.key == defIdentity.key) {
        gUserIdentityList.selectedItem = item;
        selected = true;
      }
    }
  }

}
