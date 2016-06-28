/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailCard"];

const Cu = Components.utils;

Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */

const AnnealMailCard = {
  getCardStatus: function(exitCodeObj, errorMsgObj) {
    AnnealMailLog.DEBUG("card.jsm: AnnealMailCard.getCardStatus\n");
    const args = AnnealMailCcr.getStandardArgs(false).
    concat(["--status-fd", "2", "--fixed-list-mode", "--with-colons", "--card-status"]);
    const statusMsgObj = {};
    const statusFlagsObj = {};

    const outputTxt = AnnealMailExecution.execCmd(AnnealMailCcr.agentPath, args, "", exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    if ((exitCodeObj.value === 0) && !outputTxt) {
      exitCodeObj.value = -1;
      return "";
    }

    return outputTxt;
  }
};
