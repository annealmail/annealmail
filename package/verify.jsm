/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailVerifyAttachment"];

const Cu = Components.utils;

Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Cu.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/time.jsm"); /*global AnnealMailTime: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/decryption.jsm"); /*global AnnealMailDecryption: false */

const Ci = Components.interfaces;

const nsIAnnealMail = Ci.nsIAnnealMail;

const AnnealMailVerifyAttachment = {
  attachment: function(parent, verifyFile, sigFile, statusFlagsObj, errorMsgObj) {
    AnnealMailLog.DEBUG("verify.jsm: AnnealMailVerifyAttachment.attachment:\n");

    const verifyFilePath = AnnealMailFiles.getEscapedFilename(AnnealMailFiles.getFilePathReadonly(verifyFile.QueryInterface(Ci.nsIFile)));
    const sigFilePath = AnnealMailFiles.getEscapedFilename(AnnealMailFiles.getFilePathReadonly(sigFile.QueryInterface(Ci.nsIFile)));

    var args = []; // AnnealMailCcr.getStandardArgs(true).
    args = args.concat(["-vC", sigFilePath, verifyFilePath]);

    const listener = AnnealMailExecution.newSimpleListener();

    const proc = AnnealMailExecution.execStart(AnnealMailCcrAgent.agentPath, args, false, parent, listener, statusFlagsObj);

    if (!proc) {
      return -1;
    }

    proc.wait();

    const retObj = {};
    AnnealMailDecryption.decryptMessageEnd(listener.stderrData, listener.exitCode, 1, true, true, nsIAnnealMail.UI_INTERACTIVE, retObj);

    if (listener.exitCode === 0) {
      const detailArr = retObj.sigDetails.split(/ /);
      const dateTime = AnnealMailTime.getDateTime(detailArr[2], true, true);
      const msg1 = retObj.errorMsg.split(/\n/)[0];
      const msg2 = AnnealMailLocale.getString("keyAndSigDate", ["0x" + retObj.keyId.substr(-8, 8), dateTime]);
      errorMsgObj.value = msg1 + "\n" + msg2;
    }
    else {
      errorMsgObj.value = retObj.errorMsg;
    }

    return listener.exitCode;
  },

  registerOn: function(target) {
    target.verifyAttachment = AnnealMailVerifyAttachment.attachment;
  }
};
