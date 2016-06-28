/*global Components: false*/
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// const Ec is already defined in annealmailKeygen.js

// modules
/* global AnnealMailData: false, AnnealMailLog: false, AnnealMailLocale: false, AnnealMailCcr: false, AnnealMailKeyEditor: false */
/* global AnnealMailOS: false, AnnealMailPrefs: false, AnnealMailCcrAgent: false */

// variables from annealmailKeygen.js and annealmailCommon.js */
/* global EnigGetWindowOptions: false, gKeygenRequest: true, gGeneratedKey: true, EnigConfirm: false, EnigGetString: false*/
/* global annealmailKeygenCloseRequest: true, EnigLongAlert: false, EnigAlert: false, gAnnealMailSvc: true, gAllData: true */
/* global EnigGetPref: false, EnigSetPref: false, EnigFilePicker: false, EnigGetFilePath: false, KEYGEN_CANCELLED: false */
/* global ENIG_C: false, ENIG_I: false, ENIG_ANNEALMAIL_CONTRACTID: false, EnigGetVersion: false, ENIG_KEYTYPE_RSA: false */
/* global genAndSaveRevCert: false, ENIG_ACCOUNT_MANAGER_CONTRACTID: false, annealmailCheckPassphrase: false */


"use strict";

Components.utils.import("resource://annealmail/files.jsm"); /* global AnnealMailFiles: false */
Components.utils.import("resource://annealmail/configBackup.jsm"); /*global AnnealMailConfigBackup: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/installGnuPG.jsm"); /*global InstallGnuPG: false */
Components.utils.import("resource://annealmail/passwordCheck.jsm"); /*global AnnealMailPasswordCheck: false */

const Cc = Components.classes;
const Ci = Components.interfaces;

var gLastDirection = 0;
var gWizardUserMode = "beginner";
var gEnigAccountMgr;
var gPubkeyFile = {
  value: null
};
var gSeckeyFile = {
  value: null
};
var gImportSettingsFile = {
  value: null
};
var gCreateNewKey = false;
var gDownoadObj = null;
var gPassPhraseQuality = null;
var gPageStack = []; // required for correct stepping back

function onLoad() {
  gEnigAccountMgr = Components.classes["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager);

  fillIdentities('checkbox');

  let winOptions = EnigGetWindowOptions();
  if ("skipIntro" in winOptions) {
    if (winOptions.skipIntro == "true") {
      let wizard = getWizard();
      wizard.goTo("pgWelcome");
    }
  }
  else if ("doRestore" in winOptions) {
    if (winOptions.doRestore == "true") {
      let wizard = getWizard();

      gWizardUserMode = "import";
      wizard.goTo("pgImportSettings");
    }
  }
}


function onCancel() {
  if (gKeygenRequest) {
    if (EnigConfirm(EnigGetString("keyAbort"), EnigGetString("keyMan.button.generateKeyAbort"), EnigGetString("keyMan.button.generateKeyContinue"))) {
      annealmailKeygenCloseRequest();
      return true;
    }
    else {
      return false;
    }
  }
  else {
    var r = (EnigLongAlert(EnigGetString("setupWizard.reallyCancel"), null, EnigGetString("dlg.button.close"), EnigGetString("dlg.button.continue")) === 0);

    if (r && gDownoadObj) {
      gDownoadObj.abort();
      gDownoadObj = null;
    }

    return r;
  }
}


function getWizard() {
  return document.getElementById("annealmailSetupWizard");
}

function setLastPage() {
  var wizard = getWizard();

  if (wizard.currentPage) {
    gPageStack.push(wizard.currentPage.id);
  }
}

function onBack() {
  AnnealMailLog.DEBUG("onBack");
  var wizard = getWizard();
  gLastDirection = -1;

  gPageStack.pop();
}

function onPageShow() {
  var wizard = getWizard();
  wizard.canRewind = (gPageStack.length > 0);
}

/***
 * State machine to decide which is the next page to show in the wizard.
 * This function is called when the "Next" button is pressed, before the
 * next page is opened, allowing to still modify the wiazrd's sequence.
 */

function onNext() {

  var enableNext = true;

  // private function to se the next page of the wizard
  function setNextPage(pageId) {
    if (pageId === "") {
      enableNext = false;
    }
    else {
      let wizard = getWizard();
      wizard.currentPage.next = pageId;
      enableNext = true;
    }
  }

  AnnealMailLog.DEBUG("onNext\n");
  gLastDirection = 1;
  setLastPage();
  var wizard = getWizard();
  if (wizard.currentPage) {
    switch (wizard.currentPage.pageid) {
      case "pgWelcome":
        setNextPage(onAfterPgWelcome());
        break;
      case "pgInstallGnuPG":
        setNextPage(onAfterPgInstallGnuPG());
        break;
      case "pgSelectId":
        setNextPage(onAfterPgSelectId());
        break;
      case "pgKeySel":
        setNextPage(onAfterPgKeySel());
        break;
      case "pgNoKeyFound":
        setNextPage(onAfterPgNoKeyFound());
        break;
      case "pgKeyImport":
        setNextPage(onAfterPgKeyImport());
        break;
      case "pgKeyCreate":
        setNextPage(onAfterPgKeyCreate());
        break;
      case "pgKeygen":
        setNextPage(onAfterPgKeygen());
        break;
    }
  }
  return enableNext;
}

/**** State machine helper functions ****
 *
 * All functions:
 * return the next page ID or "" in case the 'Next' button should be disabled
 */
function onAfterPgWelcome() {

  if (checkGnupgInstallation()) {
    let hasSecretKeys = checkSecretKeys();
    switch (gWizardUserMode) {
      case "beginner":
        if (hasSecretKeys) {
          loadKeys();
          return "pgKeySel";
        }
        return "pgKeyCreate";
      case "advanced":
        if (countIdentities() > 1) {
          return "pgSelectId";
        }
        else {
          if (hasSecretKeys) {
            loadKeys();
            return "pgKeySel";
          }
          else {
            return "pgNoKeyFound";
          }
        }
      case "expert":
        return "pgExpert";
      case "import":
        return "pgImportSettings";
    }
  }

  return "pgInstallGnuPG";
}

function onAfterPgInstallGnuPG() {
  let hasSecretKeys = checkSecretKeys();
  switch (gWizardUserMode) {
    case "beginner":
      if (hasSecretKeys) {
        loadKeys();
        return "pgKeySel";
      }
      else {
        return "pgKeyCreate";
      }
    case "advanced":
      if (countIdentities() > 1) {
        return "pgSelectId";
      }
      else {
        if (hasSecretKeys) {
          loadKeys();
          return "pgKeySel";
        }
        else {
          return "pgNoKeyFound";
        }
      }
    case "expert":
      return "pgExpert";
  }

  return null;
}

function onAfterPgSelectId() {
  let hasSecretKeys = checkSecretKeys();
  if (hasSecretKeys) {
    loadKeys();
    return "pgKeySel";
  }
  else {
    return "pgNoKeyFound";
  }
}

function onAfterPgKeySel() {
  if (gCreateNewKey) {
    return "pgKeyCreate";
  }
  else {
    return "pgComplete";
  }
}

function onAfterPgNoKeyFound() {
  if (gCreateNewKey) {
    return "pgKeyCreate";
  }
  else {
    return "pgKeyImport";
  }
}

function onAfterPgKeyImport() {
  return "pgKeySel";
}

function onAfterPgKeyCreate() {
  if (checkPassphrase()) {
    return "pgKeygen";
  }

  return "";
}

function onAfterPgKeygen() {
  return "pgComplete";
}

/**
 * Check if GnuPG is available
 */
function checkGnupgInstallation() {
  var s = enigGetSvc(true);
  return (s ? true : false);
}

/**
 * Check if secret keys are available
 */
function checkSecretKeys() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: checkSecretKeys\n");

  var keyList = AnnealMailKeyRing.getAllSecretKeys(true);
  if (keyList && keyList.length > 0) {
    return true;
  }

  return false;
}

/**
 * Enable or disable the "Next" (or "Done") button
 *
 * disable: boolean: true = button is disabled / false = button is enabled
 */
function disableNext(disable) {
  var wizard = getWizard();
  wizard.canAdvance = !disable;
}


function countSelectedId() {
  var idCount = 0;
  var node = document.getElementById("idSelection").firstChild;
  while (node) {
    if (node.checked) {
      ++idCount;
    }
    node = node.nextSibling;
  }
  return idCount;
}

function onShowPgInstallGnuPG() {
  var ok = enigGetSvc(true);
  disableNext(!ok);

  if (InstallGnuPG.checkAvailability()) {
    document.getElementById("installBox").removeAttribute("collapsed");
  }
  else {
    document.getElementById("findCcrBox").removeAttribute("collapsed");
  }
}



function installGnuPG() {
  var progressBox = document.getElementById("progressBox");
  var downloadProgress = document.getElementById("downloadProgress");
  var installLabel = document.getElementById("installLabel");
  var installProgress = document.getElementById("installProgress");
  var btnInstallGnupg = document.getElementById("btnInstallGnupg");
  var btnLocateGnuPG = document.getElementById("btnLocateGnuPG");

  btnInstallGnupg.setAttribute("disabled", true);
  btnLocateGnuPG.setAttribute("disabled", true);
  progressBox.removeAttribute("collapsed");

  InstallGnuPG.startInstaller({
    onStart: function(reqObj) {
      gDownoadObj = reqObj;
    },

    onError: function(errorMessage) {
      if (typeof(errorMessage) == "object") {
        var s = EnigGetString("errorType." + errorMessage.type);
        if (errorMessage.type.startsWith("Security")) {
          s += "\n" + EnigGetString("setupWizard.downloadForbidden");
        }
        else
          s += "\n" + EnigGetString("setupWizard.downloadImpossible");

        EnigAlert(s);
      }
      else {
        EnigAlert(EnigGetString(errorMessage));
      }

      this.returnToDownload();
    },

    onWarning: function(message) {
      var ret = false;
      if (message == "hashSumMismatch") {
        ret = EnigConfirm(EnigGetString("setupWizard.hashSumError"), EnigGetString("dlgYes"),
          EnigGetString("dlgNo"));
      }

      if (!ret) this.returnToDownload();

      return ret;
    },

    onProgress: function(event) {
      if (event.lengthComputable) {
        var percentComplete = event.loaded / event.total * 100;
        downloadProgress.setAttribute("value", percentComplete);
      }
      else {
        downloadProgress.setAttribute("mode", "undetermined");
      }
    },

    onDownloaded: function() {
      gDownoadObj = null;
      downloadProgress.setAttribute("value", 100);
      installLabel.removeAttribute("collapsed");
      installProgress.removeAttribute("collapsed");
    },


    returnToDownload: function() {
      btnInstallGnupg.removeAttribute("disabled");
      btnLocateGnuPG.removeAttribute("disabled");
      progressBox.setAttribute("collapsed", "true");
      downloadProgress.setAttribute("value", 0);
      installLabel.setAttribute("collapsed", "true");
      installProgress.setAttribute("collapsed", "true");
    },

    onLoaded: function() {
      installProgress.setAttribute("value", 100);
      installProgress.setAttribute("mode", "determined");

      document.getElementById("installComplete").removeAttribute("collapsed");

      var origPath = EnigGetPref("agentPath");
      EnigSetPref("agentPath", "");

      var s = enigGetSvc(true);
      if (s) {
        disableNext(false);
      }
      else {
        EnigSetPref("agentPath", origPath);
        this.returnToDownload();
        EnigAlert(EnigGetString("setupWizard.installFailed"));
      }
    }
  });
}

function browseKeyFile(referencedId, referencedVar) {
  var filePath = EnigFilePicker(EnigGetString("importKeyFile"),
    "", false, "*.asc", "", [EnigGetString("gnupgFile"), "*.asc;*.ccr;*.pgp"]);

  if (filePath) {
    document.getElementById(referencedId).value = EnigGetFilePath(filePath);
    referencedVar.value = filePath;
  }
}

function browseBackupFile(referencedId, referencedVar) {
  var filePath = EnigFilePicker(EnigGetString("setupWizard.importSettingsFile"),
    "", false, "*.zip", AnnealMailLocale.getString("defaultBackupFileName") + ".zip", [AnnealMailLocale.getString("annealmailSettings"), "*.zip"]);

  if (filePath) {
    document.getElementById(referencedId).value = EnigGetFilePath(filePath);
    referencedVar.value = filePath;
    getWizard().canAdvance = true;
  }
}


function importKeyFiles() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: importKeyFiles\n");
  if (document.getElementById("publicKeysFile").value.length === 0) {
    EnigAlert(EnigGetString("setupWizard.specifyFile"));
    return false;
  }

  var importedKeys;
  var exitCode;

  var annealmailSvc = enigGetSvc(false);
  if (!annealmailSvc) return false;

  disableNext(true);

  var errorMsgObj = {};
  var keyListObj = {};
  exitCode = AnnealMailKeyRing.importKeyFromFile(gPubkeyFile.value, errorMsgObj, keyListObj);
  if (exitCode !== 0) {
    EnigAlert(EnigGetString("importKeysFailed") + "\n\n" + errorMsgObj.value);
    return false;
  }
  importedKeys = keyListObj.value;

  if (document.getElementById("privateKeysFile").value.trim().length > 0) {
    AnnealMailLog.DEBUG("annealmailSetupWizard.js: importKeyFiles - private Keys\n");

    exitCode = AnnealMailKeyRing.importKeyFromFile(gSeckeyFile.value, errorMsgObj, keyListObj);
    if (exitCode !== 0) {
      EnigAlert(EnigGetString("importKeysFailed") + "\n\n" + errorMsgObj.value);
      return false;
    }
    importedKeys += keyListObj.value;
  }


  exitCode = 0;
  var keyList = importedKeys.split(/;/);

  AnnealMailLog.DEBUG("annealmailSetupWizard.js: importKeyFiles - importing " + keyList.length + " keys\n");

  setKeyTrustNextKey(keyList, 0);

  return true;
}

function setKeyTrustNextKey(keyList, index) {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: setKeyTrustNextKey(" + index + ")\n");

  if (index == keyList.length) {
    // end of list reached
    AnnealMailCcr.recalcTrustDb();
    loadKeys();
    return;
  }

  var aKey = keyList[index].split(/:/);

  let keyType;
  try {
    keyType = Number(aKey[1]);
  }
  catch (ex) {
    keyType = 0;
  }

  if (keyType & 16) {
    // imported key contains secret key
    AnnealMailKeyEditor.setKeyTrust(window, aKey[0], 5,
      function(exitCode, errorMsg) {
        if (exitCode !== 0) {
          return;
        }

        if (index < keyList.length) {
          setKeyTrustNextKey(keyList, index + 1);
        }
      }
    );
  }
  else {
    if (index < keyList.length) {
      setKeyTrustNextKey(keyList, index + 1);
    }
  }
}


function displayKeyCreate() {
  if (gLastDirection == 1) {
    fillIdentities('menulist');
  }

  gPassPhraseQuality = document.getElementById("passphraseQuality");

  // ccr 2.1.0 and 2.1.1 queries passphrase only ccr-agent only
  if (!AnnealMailCcr.getCcrFeature("keygen-passphrase")) {
    document.getElementById("keyCreateDescSec1").setAttribute("collapsed", "true");
    document.getElementById("passphraseBox").setAttribute("collapsed", "true");
    document.getElementById("keyCreateDescSec2").removeAttribute("collapsed");
  }
  else {
    checkPassphrasesEqual();
  }

  if (countSelectedId() == 1) {
    var node = document.getElementById("idSelection").firstChild;
    while (node) {
      if (node.checked) {
        var identity = gEnigAccountMgr.getIdentity(node.getAttribute("account-id"));
        var idName = identity.identityName;

        var serverList = queryISupArray(
          getServersForIdentity(gEnigAccountMgr, identity),
          Components.interfaces.nsIMsgIncomingServer);

        if (serverList.length > 0) {
          var inServer = serverList[0];

          idName += " - " + inServer.prettyName;
        }
        document.getElementById("userIdentityLabel").value = idName;
        break;
      }
      node = node.nextSibling;
    }
    document.getElementById("userIdentity").setAttribute("collapsed", "true");
    document.getElementById("userIdentityLabel").removeAttribute("collapsed");

  }
  else {
    document.getElementById("userIdentityLabel").setAttribute("collapsed", "true");
    document.getElementById("userIdentity").removeAttribute("collapsed");
  }

}


function checkPassphraseQuality(txtBox) {
  var qualityRes = AnnealMailPasswordCheck.checkQuality(txtBox.value);

  if (qualityRes.valid) {
    gPassPhraseQuality.value = qualityRes.complexity;
  }
  else if (txtBox.value.length > 0) {
    gPassPhraseQuality.value = (qualityRes.complexity / 2);
  }
  else {
    gPassPhraseQuality.value = 0;
  }

  checkPassphrasesEqual();
}

/**
 * Check if entered passphrases are equal. If yes, enable the next button
 */
function checkPassphrasesEqual() {
  let p1 = document.getElementById("passphrase").value;
  let p2 = document.getElementById("passphraseRepeat").value;

  disableNext(p1.length === 0 || p1 != p2);
}


function displayKeySel() {
  var uidChildren = document.getElementById("uidSelectionChildren");
  if (document.getElementById("createPgpKey").value == "0") {
    setUseKey();
  }
  else {
    setNewKey();
  }
}

function clearKeyListEntries() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: clearKeyListEntries\n");

  // remove all rows
  var treeChildren = document.getElementById("uidSelectionChildren");
  while (treeChildren.firstChild) {
    treeChildren.removeChild(treeChildren.firstChild);
  }
}

function onSetStartNow(mode) {
  var wizard = getWizard();
  if (mode === 0) {
    wizard.lastPage = true;
    wizard.getButton("next").hidden = true;
    wizard.getButton("finish").hidden = false;
    wizard.currentPage.next = "";
  }
  else {
    wizard.lastPage = false;
    wizard.getButton("next").hidden = false;
    wizard.getButton("finish").hidden = true;
    wizard.currentPage.next = "pgWelcome";
  }
}

function onSetSelectMode(userMode) {
  gWizardUserMode = userMode;
}

function onKeySelected() {
  var wizard = getWizard();
  var uidSel = document.getElementById("uidSelection");

  if (uidSel.view.selection.count == 1) {
    var currIndex = uidSel.view.selection.currentIndex;
    var currItem = uidSel.view.getItemAtIndex(currIndex);
    gGeneratedKey = currItem.getAttribute("keyId");
  }
  else {
    gGeneratedKey = null;
  }

  disableNext(uidSel.view.selection.count === 0);
}

function wizardSetFocus() {
  document.getElementById("selectMode").focus();
  disableNext(false);

}

function loadKeys() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: loadKeys\n");

  var annealmailSvc = enigGetSvc(false);

  if (!annealmailSvc) {
    return;
  }
  clearKeyListEntries();


  var exitCodeObj = {};
  var statusFlagsObj = {};
  var errorMsgObj = {};
  AnnealMailKeyRing.clearCache();
  var keyList = AnnealMailKeyRing.getAllSecretKeys(true);
  if (!keyList) {
    return;
  }

  var uidChildren = document.getElementById("uidSelectionChildren");
  for (let i = 0; i < keyList.length; i++) {
    var item = uidChildren.appendChild(document.createElement('treeitem'));
    item.setAttribute("keyId", keyList[i].keyId);
    var row = item.appendChild(document.createElement('treerow'));
    var cell = row.appendChild(document.createElement('treecell'));
    cell.setAttribute('label', keyList[i].userId);
    cell.setAttribute('observes', "bcKeyEnabled");
    cell = row.appendChild(document.createElement('treecell'));
    cell.setAttribute('label', "0x" + keyList[i].keyId.substr(-8, 8));
    cell.setAttribute('observes', "bcKeyEnabled");
    cell = row.appendChild(document.createElement('treecell'));
    cell.setAttribute('label', keyList[i].created);
    cell.setAttribute('observes', "bcKeyEnabled");
  }

  // if there is only one key available, select it.
  if (keyList.length == 1) {
    var uidSel = document.getElementById("uidSelection");
    uidSel.view.selection.select(0);
  }

  onKeySelected();
  return;
}

function enigGetSvc(resetCheck) {
  // Lazy initialization of annealmail JS component (for efficiency)
  // variant of GetAnnealMailSvc function

  if (resetCheck) gAnnealMailSvc = null;

  if (gAnnealMailSvc) {
    return gAnnealMailSvc.initialized ? gAnnealMailSvc : null;
  }

  try {
    gAnnealMailSvc = ENIG_C[ENIG_ANNEALMAIL_CONTRACTID].createInstance(ENIG_I.nsIAnnealMail);

  }
  catch (ex) {
    AnnealMailLog.ERROR("annealmailWizard.js: Error in instantiating AnnealMailService\n");
    return null;
  }

  AnnealMailLog.DEBUG("annealmailWizard.js: gAnnealMailSvc = " + gAnnealMailSvc + "\n");

  if (!gAnnealMailSvc.initialized) {
    // Try to initialize annealmail

    try {
      // Initialize annealmail
      gAnnealMailSvc.initialize(window, EnigGetVersion());

      try {
        // Reset alert count to default value
        AnnealMailPrefs.getPrefBranch().clearUserPref("initAlert");
      }
      catch (ex) {}

    }
    catch (ex) {

      return null;
    }

    var configuredVersion = EnigGetPref("configuredVersion");

    AnnealMailLog.DEBUG("annealmailWizard.js: enigGetSvc: " + configuredVersion + "\n");

  }

  return gAnnealMailSvc.initialized ? gAnnealMailSvc : null;
}



function wizardLocateCcr() {
  var fileName = "ccr";
  var ext = "";
  if (AnnealMailOS.isDosLike()) {
    ext = ".exe";
  }
  var filePath = EnigFilePicker(EnigGetString("locateCcr"),
    "", false, ext,
    fileName + ext, null);

  if (filePath) {
    EnigSetPref("agentPath", EnigGetFilePath(filePath));
    var svc = enigGetSvc(true);

    if (!svc) {
      EnigAlert(EnigGetString("setupWizard.invalidCcr"));
    }
    else {
      document.getElementById("ccrFoundBox").removeAttribute("collapsed");
      disableNext(false);
    }
  }

}

function checkPassphrase() {

  // ccr >= 2.1 queries passphrase using ccr-agent only

  if (AnnealMailCcr.getCcrFeature("keygen-passphrase")) {
    var passphrase = annealmailCheckPassphrase();
    if (!passphrase) return false;

    if (passphrase.length < 8) {
      EnigAlert(EnigGetString("passphrase.min8keys"));
      return false;
    }
  }

  return true;

}

function wizardGenKey() {
  var wizard = getWizard();

  disableNext(true);
  wizard.canRewind = false;

  var passphrase = document.getElementById("passphrase").value;

  // ccr >= 2.1 queries passphrase using ccr-agent only
  if (!AnnealMailCcr.getCcrFeature("keygen-passphrase")) {
    passphrase = "";
  }

  var curId = wizardGetSelectedIdentity();

  var userName = curId.fullName;
  var userEmail = curId.email;

  var ipcRequest = null;
  var listener = {
    onStartRequest: function() {},
    onStopRequest: function(status) {
      wizardKeygenTerminate(status);
    },
    onDataAvailable: function(data) {
      AnnealMailLog.DEBUG("annealmailSetupWizard.js: genKey - onDataAvailable() " + data + "\n");

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
      "",
      AnnealMailData.convertFromUnicode(userEmail),
      365 * 5 /* 5 years */ ,
      4096,
      ENIG_KEYTYPE_RSA,
      AnnealMailData.convertFromUnicode(passphrase),
      listener);
  }
  catch (ex) {
    AnnealMailLog.DEBUG("annealmailSetupWizard.js: genKey - generateKey() failed with " + ex.toString() + "\n" + ex.stack + "\n");
  }

  if (!gKeygenRequest) {
    EnigAlert(EnigGetString("keyGenFailed"));
    wizard.getButton("back").disabled = false;
    return false;
  }

  AnnealMailLog.WRITE("annealmailKeygen.js: Start: gKeygenRequest = " + gKeygenRequest + "\n");
  return false;
}

function wizardKeygenTerminate(exitCode) {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: wizardKeygenTerminate\n");

  // Give focus to this window
  window.focus();

  gKeygenRequest = null;

  if ((!gGeneratedKey) || gGeneratedKey == KEYGEN_CANCELLED) return;

  var progMeter = document.getElementById("keygenProgress");
  progMeter.setAttribute("value", 100);


  annealmailKeygenCloseRequest();
  AnnealMailKeyRing.clearCache();

  document.getElementById("revCertBox").removeAttribute("hidden");
}

// create a revokation certificate

function wizardCreateRevCert() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: wizardCreateRevCert\n");

  let curId = wizardGetSelectedIdentity();

  genAndSaveRevCert(gGeneratedKey, curId.email).then(
    function _resolve() {
      disableNext(false);
    },
    function _reject() {
      disableNext(true);
    }
  );
}

function queryISupArray(supportsArray, iid) {
  var result = [];
  var i;

  for (i = 0; i < supportsArray.length; i++) {
    result.push(supportsArray.queryElementAt(i, iid));
  }

  return result;
}

function countIdentities() {
  var accountManager = Components.classes[ENIG_ACCOUNT_MANAGER_CONTRACTID].getService(Components.interfaces.nsIMsgAccountManager);
  var idSupports = accountManager.allIdentities;
  var identities = queryISupArray(idSupports,
    Components.interfaces.nsIMsgIdentity);
  return identities.length;
}

function fillIdentities(fillType) {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: fillIdentities\n");

  var defIdentity;
  var parentElement;
  var identities = queryISupArray(gEnigAccountMgr.allIdentities,
    Components.interfaces.nsIMsgIdentity);

  if (fillType == "checkbox") {
    parentElement = document.getElementById("idSelection");
  }
  else {
    parentElement = document.getElementById("userIdentityPopup");

    // Find out default identity
    var defIdentities = gEnigAccountMgr.defaultAccount.identities;
    if (defIdentities.length >= 1) {
      defIdentity = defIdentities.queryElementAt(0, Components.interfaces.nsIMsgIdentity);
    }
    else {
      defIdentity = identities[0];
    }

    if (document.getElementById("activateId").value == "0") {
      // try to match with selected id
      var node = document.getElementById("idSelection").firstChild;
      while (node) {
        if (node.checked) {
          var currId = gEnigAccountMgr.getIdentity(node.getAttribute("account-id"));
          if (currId.key == defIdentity.key) {
            break;
          }
        }
        node = node.nextSibling;
      }

      // default ID wasn't selected, take 1st selected ID
      if (!node) {
        node = document.getElementById("idSelection").firstChild;
        while (node) {
          if (node.checked) {
            defIdentity = gEnigAccountMgr.getIdentity(node.getAttribute("account-id"));
            break;
          }
          node = node.nextSibling;
        }
      }
    }
  }

  var child = parentElement.firstChild;
  while (child) {
    parentElement.removeChild(child);
    child = parentElement.firstChild;
  }

  AnnealMailLog.DEBUG("annealmailSetupWizard.js: fillIdentities: " + identities + "\n");

  var disableId = document.getElementById("activateId").value == "1";
  var selected = false;
  for (var i = 0; i < identities.length; i++) {
    var identity = identities[i];

    AnnealMailLog.DEBUG("id.valid=" + identity.valid + "\n");
    if (!identity.valid || !identity.email)
      continue;

    var serverList = queryISupArray(
      getServersForIdentity(gEnigAccountMgr, identity),
      Components.interfaces.nsIMsgIncomingServer);

    if (serverList.length > 0) {
      var inServer = serverList[0];

      var accountName = " - " + inServer.prettyName;

      AnnealMailLog.DEBUG("annealmailKeygen.js: accountName=" + accountName + "\n");
      AnnealMailLog.DEBUG("annealmailKeygen.js: email=" + identity.email + "\n");
      var item;
      if (fillType == "checkbox") {
        item = document.createElement('checkbox');
        item.setAttribute('checked', "true");
        item.setAttribute('disabled', disableId);
        item.setAttribute('oncommand', "checkIdSelection()");
      }
      else {
        item = document.createElement('menuitem');
        item.setAttribute('label', identity.identityName + accountName);
        item.setAttribute('class', 'identity-popup-item');
      }
      item.setAttribute('label', identity.identityName + accountName);
      item.setAttribute('accountname', accountName);
      item.setAttribute('id', "acc-" + identity.key);
      item.setAttribute('account-id', identity.key);
      item.setAttribute('email', identity.email);

      parentElement.appendChild(item);

      if (fillType != "checkbox") {
        // pre-select default ID
        var idList = document.getElementById("userIdentity");
        if (!selected)
          idList.selectedItem = item;
        if (identity.key == defIdentity.key) {
          idList.selectedItem = item;
          selected = true;
        }
      }
    }
  }
}

function wizardGetSelectedIdentity() {
  var item = document.getElementById("userIdentity").selectedItem;
  var identityKey = item.getAttribute('account-id');

  return gEnigAccountMgr.getIdentity(identityKey);
}

function applyWizardSettings() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: applyWizardSettings\n");

  if (gWizardUserMode === "import") return;

  loadLastPage();

  AnnealMailPrefs.setPref("encryptionModel", 0);

  if (document.getElementById("activateId").value == "1") {
    // activate all identities
    var idSupports = gEnigAccountMgr.allIdentities;
    var identities = queryISupArray(idSupports,
      Components.interfaces.nsIMsgIdentity);
    for (var i = 0; i < identities.length; i++) {
      wizardApplyId(identities[i], gGeneratedKey);
    }
  }
  else {
    // activate selected identities
    var node = document.getElementById("idSelection").firstChild;
    while (node) {
      if (node.checked) {
        var identity = gEnigAccountMgr.getIdentity(node.getAttribute("account-id"));
        wizardApplyId(identity, gGeneratedKey);
      }
      node = node.nextSibling;
    }
  }

  applyMozSetting("mail.server.default.mime_parts_on_demand", false);
  applyMozSetting("mailnews.send_plaintext_flowed", false);
  applyMozSetting("mail.strictly_mime", false);

  EnigSetPref("configuredVersion", EnigGetVersion());
  AnnealMailPrefs.savePrefs();
}

function applyMozSetting(preference, newVal) {
  if (typeof(newVal) == "boolean") {
    AnnealMailPrefs.getPrefRoot().setBoolPref(preference, newVal);
  }
  else if (typeof(newVal) == "number") {
    AnnealMailPrefs.getPrefRoot().setIntPref(preference, newVal);
  }
  else if (typeof(newVal) == "string") {
    AnnealMailPrefs.getPrefRoot().setCharPref(preference, newVal);
  }
}


function wizardApplyId(identity, keyId) {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: wizardApplyId: identity.Key=" + identity.key + "\n");
  var accountManager = Components.classes[ENIG_ACCOUNT_MANAGER_CONTRACTID].getService(Components.interfaces.nsIMsgAccountManager);
  var idServers = getServersForIdentity(accountManager, identity);
  var servers = queryISupArray(idServers, Components.interfaces.nsIMsgIncomingServer);

  var newsServer = false;
  for (var i = 0; i < servers.length; i++) {
    newsServer = (servers[i].localStoreType == "news");
  }

  identity.setBoolAttribute("enablePgp", true);
  identity.setIntAttribute("pgpKeyMode", 1);
  identity.setCharAttribute("pgpkeyId", "0x" + keyId.substr(-8, 8));
  identity.setIntAttribute("openPgpHeaderMode", 0);

  // process signing settings:
  // NOTE: option defaultSigningPolicy is an INT
  identity.setIntAttribute("defaultSigningPolicy", 0);
  identity.setBoolAttribute("pgpSignEncrypted", false);
  identity.setBoolAttribute("pgpSignPlain", false);

  // process encryption settings:
  //  0: convenient encryption (global preference)
  //  1: by default encrypt (account preference)
  //  2: by default don't encrypt (account preference)
  // NOTE: option defaultEncryptionPolicy is an INT
  identity.setIntAttribute("defaultEncryptionPolicy", 0);
}

function disableIdSel(doDisable) {
  var idSelectionBox = document.getElementById("idSelection");
  var node = idSelectionBox.firstChild;
  while (node) {
    node.setAttribute('disabled', doDisable);
    node = node.nextSibling;
  }

  if (doDisable) {
    disableNext(false);
  }
  else {
    checkIdSelection();
  }
}

function checkIdSelection() {
  var node = document.getElementById("idSelection").firstChild;

  disableNext(countSelectedId() < 1);
}


function loadLastPage() {
  var wizard = getWizard();
  wizard.canRewind = false;
  wizard.getButton("cancel").disabled = true;
}


function setNewKey() {
  disableNext(false);
  gCreateNewKey = true;
  document.getElementById("uidSelection").boxObject.element.setAttribute("disabled", "true");
}

function setUseKey() {
  gCreateNewKey = false;
  document.getElementById("uidSelection").boxObject.element.removeAttribute("disabled");
  onKeySelected();
}

function setImportKeys() {
  gCreateNewKey = false;
  disableNext(false);
  document.getElementById("uidSelection").boxObject.element.setAttribute("disabled", "true");
}


// Helper function
function getServersForIdentity(accMgr, identity) {
  return accMgr.getServersForIdentity(identity);
}

// ensure CcrHomeDir exists.

function ensureCcrHomeDir() {
  let homeDirPath = AnnealMailCcrAgent.getCcrHomeDir();
  if (!homeDirPath) throw "no ccrhome dir";

  let homeDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  homeDir.initWithPath(homeDirPath);

  if (!homeDir.exists()) {
    homeDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0x1C0);
    return {
      homeDir: homeDir,
      existed: false
    };
  }
  homeDir.normalize();

  if (!homeDir.isDirectory()) {
    EnigAlert("not a directory");
    throw "not a directory";
  }
  return {
    homeDir: homeDir,
    existed: true
  };
}
// import from backup file

function importSettings() {
  let r = doImportSettings();
  document.getElementById("importInProgress").setAttribute("hidden", "true");

  if (!r) {
    document.getElementById("errorMessage").removeAttribute("hidden");
  }

  return r;
}

function doImportSettings() {
  AnnealMailLog.DEBUG("annealmailSetupWizard.js: importSettings\n");
  let importFile = gImportSettingsFile.value;
  if (!importFile.exists()) return false;

  importFile.normalize();
  if (!importFile.isFile()) return false;

  document.getElementById("errorMessage").setAttribute("hidden", "true");
  document.getElementById("importInProgress").removeAttribute("hidden");

  let zipR;
  try {
    zipR = AnnealMailFiles.openZipFile(importFile);
  }
  catch (ex) {
    EnigAlert(EnigGetString("setupWizard.invalidSettingsFile"));
    return false;
  }

  let cfg;
  try {
    cfg = ensureCcrHomeDir();
  }
  catch (ex) {
    return false;
  }

  let tmpDir = AnnealMailFiles.createTempSubDir("enig-imp", true);

  AnnealMailLog.DEBUG("annealmailSetupWizard.js: tmpDir=" + tmpDir.path + "\n");

  let files = ["keyring.asc", "ownertrust.txt", "prefs.json"];

  // check if mandatory files are included
  for (let i in files) {
    if (!zipR.hasEntry(files[i])) {
      EnigAlert(EnigGetString("setupWizard.invalidSettingsFile"));
      return false;
    }
  }

  // append optional files
  files.push("ccr.conf");

  for (let i in files) {
    if (zipR.hasEntry(files[i])) {
      AnnealMailLog.DEBUG("annealmailSetupWizard.js: extracting " + files[i] + "\n");
      let outF = tmpDir.clone();
      outF.append(files[i]);
      zipR.extract(files[i], outF);
    }
  }


  let tmpFile = tmpDir.clone();
  tmpFile.append("keyring.asc");
  let errorMsgObj = {},
    importedKeysObj = {};
  AnnealMailKeyRing.importKeyFromFile(tmpFile, errorMsgObj, importedKeysObj);
  tmpFile = tmpDir.clone();
  tmpFile.append("ownertrust.txt");
  AnnealMailKeyRing.importOwnerTrust(tmpFile, errorMsgObj);

  tmpFile = tmpDir.clone();
  tmpFile.append("ccr.conf");

  if (tmpFile.exists()) {
    let doCfgFile = true;
    if (cfg.existed) {
      let cfgFile = cfg.homeDir.clone();
      cfgFile.append("ccr.conf");
      if (cfgFile.exists()) {
        if (!EnigConfirm(EnigGetString("setupWizard.ccrConfExists"), EnigGetString("dlg.button.overwrite"), EnigGetString("dlg.button.skip"))) {
          doCfgFile = false;
        }
      }
    }

    try {
      if (doCfgFile) tmpFile.moveTo(cfg.homeDir, "ccr.conf");
    }
    catch (ex) {
      AnnealMailLog.DEBUG("error with ccr.conf " + ex.toString() + "\n");
    }
  }
  else {
    AnnealMailLog.DEBUG("no ccr.conf file\n");
  }

  tmpFile = tmpDir.clone();
  tmpFile.append("prefs.json");
  let r = AnnealMailConfigBackup.restorePrefs(tmpFile);

  if (r.retVal === 0 && r.unmatchedIds.length > 0) {
    displayUnmatchedIds(r.unmatchedIds);
  }

  tmpDir.remove(true);

  return true;
}


function displayUnmatchedIds(emailArr) {
  EnigAlert("The following identities of your old setup could not be matched:\n- " + emailArr.join("\n- ") +
    "\nThe settings for these identities were skipped.");
}
