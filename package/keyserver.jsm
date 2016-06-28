/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailKeyServer"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/httpProxy.jsm"); /*global AnnealMailHttpProxy: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Cu.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Cu.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Cu.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Cu.import("resource://annealmail/subprocess.jsm"); /*global subprocess: false */
Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */

const nsIAnnealMail = Ci.nsIAnnealMail;

const AnnealMailKeyServer = {
  /**
   * search, download or upload key on, from or to a keyserver
   *
   * @actionFlags: Integer - flags (bitmap) to determine the required action
   *                         (see nsIAnnealMail - Keyserver action flags for details)
   * @keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @searchTerms: String  - space-separated list of search terms or key IDs
   * @listener:    Object  - execStart Listener Object. See execStart for details.
   * @errorMsgObj: Object  - object to hold error message in .value
   *
   * @return:      Subprocess object, or null in case process could not be started
   */
  access: function(actionFlags, keyserver, searchTerms, listener, errorMsgObj) {
    AnnealMailLog.DEBUG("keyserver.jsm: access: " + searchTerms + "\n");

    if (!keyserver) {
      errorMsgObj.value = AnnealMailLocale.getString("failNoServer");
      return null;
    }

    if (!searchTerms && !(actionFlags & nsIAnnealMail.REFRESH_KEY)) {
      errorMsgObj.value = AnnealMailLocale.getString("failNoID");
      return null;
    }

    const proxyHost = AnnealMailHttpProxy.getHttpProxy(keyserver);
    let args = AnnealMailCcr.getStandardArgs(true);

    if (actionFlags & nsIAnnealMail.SEARCH_KEY) {
      args = AnnealMailCcr.getStandardArgs(false).
      concat(["--command-fd", "0", "--fixed-list", "--with-colons"]);
    }
    if (proxyHost) {
      args = args.concat(["--keyserver-options", "http-proxy=" + proxyHost]);
    }
    args = args.concat(["--keyserver", keyserver.trim()]);

    //     if (actionFlags & nsIAnnealMail.SEARCH_KEY | nsIAnnealMail.DOWNLOAD_KEY | nsIAnnealMail.REFRESH_KEY) {
    //       args = args.concat(["--command-fd", "0", "--fixed-list", "--with-colons"]);
    //     }

    let inputData = null;
    const searchTermsList = searchTerms.split(" ");

    if (actionFlags & nsIAnnealMail.DOWNLOAD_KEY) {
      args.push("--recv-keys");
      args = args.concat(searchTermsList);
    }
    else if (actionFlags & nsIAnnealMail.REFRESH_KEY) {
      args.push("--refresh-keys");
    }
    else if (actionFlags & nsIAnnealMail.SEARCH_KEY) {
      args.push("--search-keys");
      args = args.concat(searchTermsList);
      inputData = "quit\n";
    }
    else if (actionFlags & nsIAnnealMail.UPLOAD_KEY) {
      args.push("--send-keys");
      args = args.concat(searchTermsList);
    }

    const isDownload = actionFlags & (nsIAnnealMail.REFRESH_KEY | nsIAnnealMail.DOWNLOAD_KEY);

    AnnealMailLog.CONSOLE("annealmail> " + AnnealMailFiles.formatCmdLine(AnnealMailCcrAgent.agentPath, args) + "\n");

    let proc = null;
    let exitCode = null;

    try {
      proc = subprocess.call({
        command: AnnealMailCcrAgent.agentPath,
        arguments: args,
        environment: AnnealMailCore.getEnvList(),
        charset: null,
        stdin: inputData,
        stdout: function(data) {
          listener.stdout(data);
        },
        stderr: function(data) {
          if (data.search(/^\[GNUPG:\] ERROR/m) >= 0) {
            exitCode = 4;
          }
          listener.stderr(data);
        },
        done: function(result) {
          try {
            if (result.exitCode === 0 && isDownload) {
              AnnealMailKeyRing.clearCache();
            }
            if (exitCode === null) {
              exitCode = result.exitCode;
            }
            listener.done(exitCode);
          }
          catch (ex) {}
        },
        mergeStderr: false
      });
    }
    catch (ex) {
      AnnealMailLog.ERROR("keyserver.jsm: access: subprocess.call failed with '" + ex.toString() + "'\n");
      throw ex;
    }

    if (!proc) {
      AnnealMailLog.ERROR("keyserver.jsm: access: subprocess failed due to unknown reasons\n");
      return null;
    }

    return proc;
  }
};
