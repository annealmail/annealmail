/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

"use strict";

Components.utils.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */
Components.utils.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */


var logFileData; // global definition of log file data to be able to save
// same data as displayed

function saveLogFile() {
  let fileObj = AnnealMailDialog.filePicker(window, AnnealMailLocale.getString("saveLogFile.title"), null,
    true, "txt");

  AnnealMailFiles.writeFileContents(fileObj, logFileData, null);

}

function enigLoadPage() {
  AnnealMailLog.DEBUG("annealmailHelp.js: enigLoadPage\n");
  AnnealMailCore.getService();

  var contentFrame = AnnealMailWindows.getFrame(window, "contentFrame");
  if (!contentFrame)
    return;

  var winOptions = getWindowOptions();

  if ("fileUrl" in winOptions) {
    contentFrame.document.location.href = winOptions.fileUrl;
  }

  if ("viewLog" in winOptions) {
    let cf = document.getElementById("contentFrame");
    cf.setAttribute("collapsed", "true");

    let cb = document.getElementById("contentBox");
    logFileData = AnnealMailLog.getLogData(AnnealMailCore.version, AnnealMailPrefs);
    cb.value = logFileData;

    let cfb = document.getElementById("logFileBox");
    cfb.removeAttribute("collapsed");
  }

  if ("title" in winOptions) {
    document.getElementById("AnnealMailViewFile").setAttribute("title", winOptions.title);
  }
}

function getWindowOptions() {
  var winOptions = [];
  if (window.location.search) {
    var optList = window.location.search.substr(1).split(/\&/);
    for (var i = 0; i < optList.length; i++) {
      var anOption = optList[i].split(/\=/);
      winOptions[anOption[0]] = unescape(anOption[1]);
    }
  }
  return winOptions;
}
