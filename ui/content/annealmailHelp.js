/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://annealmail/content/annealmailCommon.js

"use strict";

/* global AnnealMailLog: false */

/* global EnigInitCommon: false, EnigGetWindowOptions: false, EnigGetFrame: false, EnigGetHttpUri: false, EnigOpenUrlExternally: false */

// Initialize annealmailCommon
EnigInitCommon("annealmailHelp");

function enigHelpLoad() {
  AnnealMailLog.DEBUG("annealmailHelp.js: enigHelpLoad\n");

  var contentFrame = EnigGetFrame(window, "contentFrame");
  if (!contentFrame)
    return;

  var winOptions = EnigGetWindowOptions();
  var helpFile = winOptions.src;
  contentFrame.document.location.href = "chrome://annealmail/locale/help/" + helpFile + ".html";
}

function contentAreaClick(event) {
  let uri = EnigGetHttpUri(event);
  if (uri) {
    EnigOpenUrlExternally(uri);
    event.preventDefault();

    return false;
  }

  return true;
}
