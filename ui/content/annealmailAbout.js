/*global Components: false, AnnealMailApp: false, AnnealMailWindows: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://annealmail/content/annealmailCommon.js
//       chrome://annealmail/content/annealmailBuildDate.js


"use strict";

/* global AnnealMailLog: false, AnnealMailLocale: false, AnnealMailCore: false, AnnealMailCcrAgent: false */

/* global EnigBuildDate: false, EnigGetHttpUri: false, EnigOpenUrlExternally: false */

function enigAboutLoad() {
  AnnealMailLog.DEBUG("annealmailAbout.js: enigAboutLoad\n");

  var contentFrame = AnnealMailWindows.getFrame(window, "contentFrame");
  if (!contentFrame)
    return;

  var enigVersion = AnnealMailApp.getVersion() + " (" + EnigBuildDate + ")";
  var versionElement = contentFrame.document.getElementById('version');
  if (versionElement)
    versionElement.firstChild.data = AnnealMailLocale.getString("usingVersion", enigVersion);

  var annealmailSvc = AnnealMailCore.getService();

  var agentStr;
  if (annealmailSvc) {
    agentStr = AnnealMailLocale.getString("usingAgent", [AnnealMailCcrAgent.agentType, AnnealMailCcrAgent.agentPath.path]);
  }
  else {
    agentStr = AnnealMailLocale.getString("agentError");

    if (annealmailSvc && annealmailSvc.initializationError)
      agentStr += "\n" + annealmailSvc.initializationError;
  }

  var agentElement = contentFrame.document.getElementById('agent');
  if (agentElement)
    agentElement.firstChild.data = agentStr;

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
