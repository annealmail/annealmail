/*global Components: false, escape: false, unescape: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailAttachment"];

const Cu = Components.utils;

Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Cu.import("resource://annealmail/passwords.jsm"); /*global AnnealMailPassword: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Cu.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */

const AnnealMailAttachment = {
  getFileName: function(parent, byteData) {
    AnnealMailLog.DEBUG("attachment.jsm: getFileName\n");

    const args = AnnealMailCcr.getStandardArgs(true).
    concat(AnnealMailPassword.command()).
    concat(["--list-packets"]);

    const listener = AnnealMailExecution.newSimpleListener(
      function _stdin(pipe) {
        AnnealMailLog.DEBUG("attachment.jsm: getFileName: _stdin\n");
        pipe.write(byteData);
        pipe.write("\n");
        pipe.close();
      });

    const proc = AnnealMailExecution.execStart(AnnealMailCcrAgent.agentPath, args, false, parent, listener, {});

    if (!proc) {
      return null;
    }

    proc.wait();

    const matches = listener.stdoutData.match(/:literal data packet:\r?\n.*name="(.*)",/m);
    if (matches && (matches.length > 1)) {
      var filename = escape(matches[1]).replace(/%5Cx/g, "%");
      return AnnealMailData.convertToUnicode(unescape(filename), "utf-8");
    }
    else {
      return null;
    }
  }
};
