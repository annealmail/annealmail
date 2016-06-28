/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false*/
Components.utils.import("resource://annealmail/pipeConsole.jsm"); /*global AnnealMailConsole: false */
Components.utils.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Components.utils.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */
Components.utils.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */

/* global goUpdateCommand: false */

var gConsoleIntervalId;

function consoleLoad() {
  AnnealMailLog.DEBUG("annealmailConsole.js: consoleLoad\n");

  top.controllers.insertControllerAt(0, CommandController);

  AnnealMailCore.getService(window);

  // Refresh console every 2 seconds
  gConsoleIntervalId = window.setInterval(refreshConsole, 2000);
  updateData();
}

function consoleUnload() {
  AnnealMailLog.DEBUG("annealmailConsole.js: consoleUnload\n");

  // Cancel console refresh
  if (window.consoleIntervalId) {
    window.clearInterval(gConsoleIntervalId);
    gConsoleIntervalId = null;
  }
}

function refreshConsole() {
  //AnnealMailLog.DEBUG("annealmailConsole.js: refreshConsole():\n");

  if (AnnealMailConsole.hasNewData()) {
    AnnealMailLog.DEBUG("annealmailConsole.js: refreshConsole(): hasNewData\n");

    updateData();
  }

  return false;
}

function updateData() {
  //AnnealMailLog.DEBUG("annealmailConsole.js: updateData():\n");

  var contentFrame = AnnealMailWindows.getFrame(window, "contentFrame");
  if (!contentFrame)
    return;

  var consoleElement = contentFrame.document.getElementById('console');

  consoleElement.firstChild.data = AnnealMailData.convertToUnicode(AnnealMailConsole.getData(), "utf-8");

  if (!contentFrame.mouseDownState)
    contentFrame.scrollTo(0, 9999);
}


function annealmailConsoleCopy() {
  var selText = getSelectionStr();

  AnnealMailLog.DEBUG("annealmailConsole.js: annealmailConsoleCopy: selText='" + selText + "'\n");

  if (selText) {
    var clipHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"].createInstance(Components.interfaces.nsIClipboardHelper);

    clipHelper.copyString(selText);
  }

  return true;
}

function getSelectionStr() {
  try {
    var contentFrame = AnnealMailWindows.getFrame(window, "contentFrame");

    var sel = contentFrame.getSelection();
    return sel.toString();

  }
  catch (ex) {
    return "";
  }
}

function isItemSelected() {
  AnnealMailLog.DEBUG("annealmailConsole.js: isItemSelected\n");
  return getSelectionStr() !== "";
}

function UpdateCopyMenu() {
  AnnealMailLog.DEBUG("annealmailConsole.js: UpdateCopyMenu\n");
  goUpdateCommand("cmd_copy");
}

var CommandController = {
  isCommandEnabled: function(aCommand) {
    switch (aCommand) {
      case "cmd_copy":
        return isItemSelected();
      default:
        return false;
    }
  },

  supportsCommand: function(aCommand) {
    switch (aCommand) {
      case "cmd_copy":
        return true;
      default:
        return false;
    }
  },

  doCommand: function(aCommand) {
    switch (aCommand) {
      case "cmd_copy":
        annealmailConsoleCopy();
        break;
      default:
        break;
    }
  },

  onEvent: function(aEvent) {}
};
