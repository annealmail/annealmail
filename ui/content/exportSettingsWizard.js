/*global Components: false, document: false, window: false */
/*jshint -W097 */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Cu.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Cu.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Cu.import("resource://annealmail/configBackup.jsm"); /*global AnnealMailConfigBackup: false */
Cu.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */

var osUtils = {};
Components.utils.import("resource://gre/modules/FileUtils.jsm", osUtils);

var gWorkFile = {
  file: null
};

function getWizard() {
  return document.getElementById("overallWizard");
}

function enableNext(status) {
  let wizard = getWizard();
  wizard.canAdvance = status;
}


function onCancel() {
  return true;
}

function browseExportFile(referencedId) {
  var filePath = AnnealMailDialog.filePicker(window, AnnealMailLocale.getString("specifyExportFile"),
    "", true, "*.zip", AnnealMailLocale.getString("defaultBackupFileName") + ".zip", [AnnealMailLocale.getString("annealmailSettings"), "*.zip"]);

  if (filePath) {

    if (filePath.exists()) filePath.normalize();

    if ((filePath.exists() && !filePath.isDirectory() && filePath.isWritable()) ||
      (!filePath.exists() && filePath.parent.isWritable())) {
      document.getElementById(referencedId).value = filePath.path;
      gWorkFile.file = filePath;
    }
    else {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("cannotWriteToFile", filePath.path));
    }
  }

  enableNext(gWorkFile.file !== null);
}

function doExport(tmpDir) {

  let exitCodeObj = {},
    errorMsgObj = {};

  let keyRingFile = tmpDir.clone();
  keyRingFile.append("keyring.asc");

  AnnealMailLog.DEBUG("importExportWizard: doExport - temp file: " + keyRingFile.path + "\n");

  AnnealMailKeyRing.extractKey(true, null, keyRingFile, exitCodeObj, errorMsgObj);
  if (exitCodeObj.value !== 0) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("dataExportError"));
    return false;
  }

  let otFile = tmpDir.clone();
  otFile.append("ownertrust.txt");
  AnnealMailKeyRing.extractOwnerTrust(otFile, exitCodeObj, errorMsgObj);
  if (exitCodeObj.value !== 0) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("dataExportError"));
    return false;
  }

  let prefsFile = tmpDir.clone();
  prefsFile.append("prefs.json");
  if (AnnealMailConfigBackup.backupPrefs(prefsFile) !== 0) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("dataExportError"));
    return false;
  }

  let homeDir = AnnealMailCcrAgent.getCcrHomeDir();
  let ccrConfgFile = null;
  let zipW = AnnealMailFiles.createZipFile(gWorkFile.file);

  zipW.addEntryFile("keyring.asc", Ci.nsIZipWriter.COMPRESSION_DEFAULT, keyRingFile, false);
  zipW.addEntryFile("ownertrust.txt", Ci.nsIZipWriter.COMPRESSION_DEFAULT, otFile, false);
  zipW.addEntryFile("prefs.json", Ci.nsIZipWriter.COMPRESSION_DEFAULT, prefsFile, false);

  if (homeDir) {
    ccrConfgFile = new osUtils.FileUtils.File(homeDir);
    ccrConfgFile.append("ccr.conf");
  }

  if (ccrConfgFile && ccrConfgFile.exists()) {
    zipW.addEntryFile("ccr.conf", Ci.nsIZipWriter.COMPRESSION_DEFAULT, ccrConfgFile, false);
  }
  zipW.close();

  tmpDir.remove(true);
  document.getElementById("doneMessage").removeAttribute("hidden");

  return true;
}

function exportFailed() {
  let wizard = getWizard();
  wizard.getButton("cancel").removeAttribute("disabled");
  wizard.canRewind = true;
  document.getElementById("errorMessage").removeAttribute("hidden");

  return false;
}

function startExport() {
  AnnealMailLog.DEBUG("importExportWizard: doExport\n");
  document.getElementById("errorMessage").setAttribute("hidden", "true");

  let wizard = getWizard();
  wizard.canAdvance = false;
  wizard.canRewind = false;
  wizard.getButton("finish").setAttribute("disabled", "true");

  let svc = AnnealMailCore.getService();
  if (!svc) return exportFailed();

  if (!gWorkFile.file) return exportFailed();

  let tmpDir = AnnealMailFiles.createTempSubDir("enig-exp", true);

  wizard.getButton("cancel").setAttribute("disabled", "true");
  document.getElementById("spinningWheel").removeAttribute("hidden");

  let retVal = false;

  try {
    retVal = doExport(tmpDir);
  }
  catch (ex) {}

  // stop spinning the wheel
  document.getElementById("spinningWheel").setAttribute("hidden", "true");

  if (retVal) {
    wizard.getButton("finish").removeAttribute("disabled");
    wizard.canAdvance = true;
  }
  else {
    exportFailed();
  }

  return retVal;
}

function checkAdditionalParam() {
  let param = AnnealMailPrefs.getPref("agentAdditionalParam");

  if (param) {
    if (param.search(/--(homedir|trustdb-name|options)/) >= 0 || param.search(/--(primary-|secret-)?keyring/) >= 0) {
      AnnealMailDialog.alert(null, AnnealMailLocale.getString("homedirParamNotSUpported"));
      return false;
    }
  }
  return true;
}

function onLoad() {
  enableNext(false);

  if (!checkAdditionalParam()) {
    window.close();
  }
}
