/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global EnigInitCommon: false, AnnealMailLog: false, EnigGetFrame: false */

// Initialize annealmailCommon
EnigInitCommon("annealmailGenericDisplay");

function enigLoadPage() {
  AnnealMailLog.DEBUG("annealmailGenricDisplay: enigLoadPage\n");

  var contentFrame = EnigGetFrame(window, "contentFrame");
  if (!contentFrame)
    return;

  var placeholderElement = contentFrame.document.getElementById('placeholder');
  placeholderElement.appendChild(window.arguments[0]);

}

// window.onload = enigLoadPage;
