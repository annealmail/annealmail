/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */


"use strict";
Components.utils.import("resource://annealmail/core.jsm"); /* global AnnealMailCore: false */
Components.utils.import("resource://annealmail/keyEditor.jsm"); /* global AnnealMailKeyEditor: false */
Components.utils.import("resource://annealmail/locale.jsm"); /* global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/data.jsm"); /* global AnnealMailData: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /* global AnnealMailDialog: false */

function onAccept() {
  var name = document.getElementById("addUid_name");
  var email = document.getElementById("addUid_email");

  if ((email.value.search(/^ *$/) === 0) || (name.value.search(/^ *$/) === 0)) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("addUidDlg.nameOrEmailError"));
    return false;
  }
  if (name.value.replace(/ *$/, "").length < 5) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("addUidDlg.nameMinLengthError"));
    return false;
  }
  if (email.value.search(/.@./) < 0) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("addUidDlg.invalidEmailError"));
    return false;
  }

  var annealmailSvc = AnnealMailCore.getService();
  if (!annealmailSvc) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("accessError"));
    return true;
  }

  AnnealMailKeyEditor.addUid(window,
    window.arguments[0].keyId,
    AnnealMailData.convertFromUnicode(name.value),
    AnnealMailData.convertFromUnicode(email.value),
    "", // user id comment
    function _addUidCb(exitCode, errorMsg) {
      if (exitCode !== 0) {
        AnnealMailDialog.alert(window, AnnealMailLocale.getString("addUidFailed") + "\n\n" + errorMsg);
      }
      else {
        window.arguments[1].refresh = true;
        AnnealMailDialog.alert(window, AnnealMailLocale.getString("addUidOK"));
      }
      window.close();
    });

  return false;
}
