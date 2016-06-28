/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

"use strict";

/* global AnnealMailLog: false, AnnealMailCore: false, AnnealMailConstants: false */

function annealmailEncryptionDlgLoad() {
  AnnealMailLog.DEBUG("annealmailEncryptionDlgLoad.js: Load\n");

  // Get AnnealMail service, such that e.g. the wizard can be executed
  // if needed.
  var annealmailSvc = AnnealMailCore.getService();
  if (!annealmailSvc) {
    window.close();
    return;
  }

  var inputObj = window.arguments[0];

  var signElement = document.getElementById("signMsg");
  switch (inputObj.statusSigned) {
    case AnnealMailConstants.ENIG_FINAL_FORCEYES:
    case AnnealMailConstants.ENIG_FINAL_YES:
      signElement.setAttribute("checked", true);
      break;
    default:
      signElement.removeAttribute("checked");
  }

  var encElement = document.getElementById("encryptMsg");
  switch (inputObj.statusEncrypted) {
    case AnnealMailConstants.ENIG_FINAL_FORCEYES:
    case AnnealMailConstants.ENIG_FINAL_YES:
      encElement.setAttribute("checked", true);
      break;
    default:
      encElement.removeAttribute("checked");
  }

  var pgpmimeElement = document.getElementById("pgpmimeGroup");
  switch (inputObj.statusPGPMime) {
    case AnnealMailConstants.ENIG_FINAL_FORCEYES:
    case AnnealMailConstants.ENIG_FINAL_YES:
      pgpmimeElement.selectedItem = document.getElementById("usePgpMime");
      break;
    default:
      pgpmimeElement.selectedItem = document.getElementById("useInlinePgp");
  }
}

// Reset to defaults and close dialog
function resetDefaults() {
  var resultObj = window.arguments[0];

  resultObj.success = true;
  resultObj.sign = AnnealMailConstants.ENIG_UNDEF;
  resultObj.encrypt = AnnealMailConstants.ENIG_UNDEF;
  resultObj.pgpmime = AnnealMailConstants.ENIG_UNDEF;
  resultObj.resetDefaults = true;
  window.close();
}


function getResultStatus(newStatus) {
  if (newStatus) {
    return AnnealMailConstants.ENIG_ALWAYS;
  }
  else {
    return AnnealMailConstants.ENIG_NEVER;
  }
}

function annealmailEncryptionDlgAccept() {
  var resultObj = window.arguments[0];
  var sign = document.getElementById("signMsg").checked;
  var encrypt = document.getElementById("encryptMsg").checked;
  var pgpmimeElement = document.getElementById("pgpmimeGroup");
  var usePgpMime = (pgpmimeElement.selectedItem.getAttribute("value") == "1");

  resultObj.sign = getResultStatus(sign);
  resultObj.encrypt = getResultStatus(encrypt);
  resultObj.pgpmime = getResultStatus(usePgpMime);
  resultObj.resetDefaults = false;

  resultObj.success = true;
}
