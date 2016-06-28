/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailPassword"];

const Cu = Components.utils;

Cu.import("resource://annealmail/lazy.jsm"); /*global AnnealMailLazy: false */
Cu.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Cu.import("resource://annealmail/subprocess.jsm"); /*global subprocess: false */


const ccrAgent = AnnealMailLazy.loader("annealmail/ccrAgent.jsm", "AnnealMailCcrAgent");
const getDialog = AnnealMailLazy.loader("annealmail/dialog.jsm", "AnnealMailDialog");
const getLocale = AnnealMailLazy.loader("annealmail/locale.jsm", "AnnealMailLocale");

const AnnealMailPassword = {
  /*
   * Get GnuPG command line options for receiving the password depending
   * on the various user and system settings (ccr-agent/no passphrase)
   *
   * @return: Array the GnuPG command line options
   */
  command: function() {
    if (ccrAgent().useCcrAgent()) {
      return ["--use-agent"];
    }
    else {
      if (!AnnealMailPrefs.getPref("noPassphrase")) {
        return ["--passphrase-fd", "0", "--no-use-agent"];
      }
    }
    return [];
  },

  getMaxIdleMinutes: function() {
    try {
      return AnnealMailPrefs.getPref("maxIdleMinutes");
    }
    catch (ex) {}

    return 5;
  },

  clearPassphrase: function(win) {
    // clear all passphrases from ccr-agent by reloading the config
    if (!AnnealMailCore.getService()) return;

    if (!ccrAgent().useCcrAgent()) {
      return;
    }

    let exitCode = -1;
    let isError = 0;

    const proc = {
      command: ccrAgent().connCcrAgentPath,
      arguments: [],
      charset: null,
      environment: AnnealMailCore.getEnvList(),
      stdin: function(pipe) {
        pipe.write("RELOADAGENT\n");
        pipe.write("/bye\n");
        pipe.close();
      },
      stdout: function(data) {
        if (data.search(/^ERR/m) >= 0) {
          ++isError;
        }
      },
      done: function(result) {
        exitCode = result.exitCode;
      }
    };

    try {
      subprocess.call(proc).wait();
    }
    catch (ex) {}

    if (isError === 0) {
      getDialog().alert(win, getLocale().getString("passphraseCleared"));
    }
    else {
      getDialog().alert(win, getLocale().getString("cannotClearPassphrase"));
    }
  }
};
