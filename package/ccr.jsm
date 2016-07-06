/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailCcr"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Cu.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/subprocess.jsm"); /*global subprocess: false */
Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */

const CCR_BATCH_OPT_LIST = ["--batch", "--no-tty", "--status-fd", "2"];

function pushTrimmedStr(arr, str, splitStr) {
  // Helper function for pushing a string without leading/trailing spaces
  // to an array
  str = str.replace(/^ */, "").replace(/ *$/, "");
  if (str.length > 0) {
    if (splitStr) {
      const tmpArr = str.split(/[\t ]+/);
      for (let i = 0; i < tmpArr.length; i++) {
        arr.push(tmpArr[i]);
      }
    }
    else {
      arr.push(str);
    }
  }
  return (str.length > 0);
}

const AnnealMailCcr = {
  agentVersion: "",
  _agentPath: null,

  get agentPath() {
    return this._agentPath;
  },

  setAgentPath: function(path) {
    this._agentPath = path;
  },
  /***
   determine if a specific feature is available in the GnuPG version used

   @featureName:  String; one of the following values:
   version-supported    - is the ccr version supported at all
   supports-ccr-agent   - is ccr-agent is usually provided
   autostart-ccr-agent  - is ccr-agent started automatically by ccr
   keygen-passphrase    - can the passphrase be specified when generating keys
   windows-photoid-bug  - is there a bug in ccr with the output of photoid on Windows
   genkey-no-protection - is "%no-protection" supported for generting keys

   @return: depending on featureName - Boolean unless specified differently:
   (true if feature is available / false otherwise)
   If the feature cannot be found, undefined is returned
   */
  getCcrFeature: function(featureName) {
    let ccrVersion = AnnealMailCcr.agentVersion;

    if (!ccrVersion || typeof(ccrVersion) != "string" || ccrVersion.length === 0) {
      return undefined;
    }

    ccrVersion = ccrVersion.replace(/\-.*$/, "");
    if (ccrVersion.search(/^\d+\.\d+/) < 0) {
      // not a valid version number
      return undefined;
    }

    const vc = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

    switch (featureName) {
      case 'version-supported':
        return vc.compare(ccrVersion, "0.0.7") >= 0;
      case 'supports-ccr-agent':
        return vc.compare(ccrVersion, "2.0") >= 0;
      case 'autostart-ccr-agent':
        return vc.compare(ccrVersion, "2.0.16") >= 0;
      case 'keygen-passphrase':
        return vc.compare(ccrVersion, "2.1") < 0 || vc.compare(ccrVersion, "2.1.2") >= 0;
      case 'genkey-no-protection':
        return vc.compare(ccrVersion, "2.1") > 0;
      case 'windows-photoid-bug':
        return vc.compare(ccrVersion, "2.0.16") < 0;
    }

    return undefined;
  },

  /**
   * get the standard arguments to pass to every GnuPG subprocess
   *
   * @withBatchOpts: Boolean - true: use --batch and some more options
   *                           false: don't use --batch and co.
   *
   * @return: Array of String - the list of arguments
   */
  getStandardArgs: function(withBatchOpts) {
    // return the arguments to pass to every GnuPG subprocess
    let r = ["--charset", "utf-8", "--display-charset", "utf-8", "--use-agent"]; // mandatory parameter to add in all cases

    try {
      let p = AnnealMailPrefs.getPref("agentAdditionalParam").replace(/\\\\/g, "\\");

      let i = 0;
      let last = 0;
      let foundSign = "";
      let startQuote = -1;

      while ((i = p.substr(last).search(/['"]/)) >= 0) {
        if (startQuote == -1) {
          startQuote = i;
          foundSign = p.substr(last).charAt(i);
          last = i + 1;
        }
        else if (p.substr(last).charAt(i) == foundSign) {
          // found enquoted part
          if (startQuote > 1) pushTrimmedStr(r, p.substr(0, startQuote), true);

          pushTrimmedStr(r, p.substr(startQuote + 1, last + i - startQuote - 1), false);
          p = p.substr(last + i + 1);
          last = 0;
          startQuote = -1;
          foundSign = "";
        }
        else {
          last = last + i + 1;
        }
      }

      pushTrimmedStr(r, p, true);
    }
    catch (ex) {}


    if (withBatchOpts) {
      r = r.concat(CCR_BATCH_OPT_LIST);
    }

    return r;
  },

  // returns the output of --with-colons --list-config
  getGnupgConfig: function(exitCodeObj, errorMsgObj) {
    const args = AnnealMailCcr.getStandardArgs(true).
    concat(["--fixed-list-mode", "--with-colons", "--list-config"]);

    const statusMsgObj = {};
    const cmdErrorMsgObj = {};
    const statusFlagsObj = {};

    const listText = AnnealMailExecution.execCmd(AnnealMailCcr.agentPath, args, "", exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value !== 0) {
      errorMsgObj.value = AnnealMailLocale.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + AnnealMailFiles.formatCmdLine(AnnealMailCcr.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    return listText.replace(/(\r\n|\r)/g, "\n");
  },

  /**
   * return an array containing the aliases and the email addresses
   * of groups defined in ccr.conf
   *
   * @return: array of objects with the following properties:
   *  - alias: group name as used by GnuPG
   *  - keylist: list of keys (any form that GnuPG accepts), separated by ";"
   *
   * (see docu for gnupg parameter --group)
   */
  getCcrGroups: function() {
    let exitCodeObj = {};
    let errorMsgObj = {};

    let cfgStr = AnnealMailCcr.getGnupgConfig(exitCodeObj, errorMsgObj);

    if (exitCodeObj.value !== 0) {
      AnnealMailDialog.alert(errorMsgObj.value);
      return null;
    }

    let groups = [];
    let cfg = cfgStr.split(/\n/);

    for (let i = 0; i < cfg.length; i++) {
      if (cfg[i].indexOf("cfg:group") === 0) {
        let groupArr = cfg[i].split(/:/);
        groups.push({
          alias: groupArr[2],
          keylist: groupArr[3]
        });
      }
    }

    return groups;
  },

  /**
   * Force GnuPG to recalculate the trust db. This is sometimes required after importing keys.
   *
   * no return value
   */
  recalcTrustDb: function() {
    AnnealMailLog.DEBUG("annealmailCommon.jsm: recalcTrustDb:\n");

    const command = AnnealMailCcr.agentPath;
    const args = AnnealMailCcr.getStandardArgs(false).
    concat(["--check-trustdb"]);

    try {
      const proc = subprocess.call({
        command: AnnealMailCcr.agentPath,
        arguments: args,
        environment: AnnealMailCore.getEnvList(),
        charset: null,
        mergeStderr: false
      });
      proc.wait();
    }
    catch (ex) {
      AnnealMailLog.ERROR("annealmailCommon.jsm: recalcTrustDb: subprocess.call failed with '" + ex.toString() + "'\n");
      throw ex;
    }
  },

  signingAlgIdToString: function(id) {
    // RFC 4880 Sec. 9.1, RFC 6637 Sec. 5 and draft-koch-eddsa-for-openpgp-03 Sec. 8
    switch (parseInt(id, 10)) {
      case 1:
      case 2:
      case 3:
        return "RSA";
      case 16:
        return "Elgamal";
      case 17:
        return "DSA";
      case 18:
        return "ECDH";
      case 19:
        return "ECDSA";
      case 20:
        return "ELG";
      case 22:
        return "EDDSA";
      default:
        return AnnealMailLocale.getString("unknownSigningAlg", [parseInt(id, 10)]);
    }
  },

  hashAlgIdToString: function(id) {
    // RFC 4880 Sec. 9.4
    switch (parseInt(id, 10)) {
      case 1:
        return "MD5";
      case 2:
        return "SHA-1";
      case 3:
        return "RIPE-MD/160";
      case 8:
        return "SHA256";
      case 9:
        return "SHA384";
      case 10:
        return "SHA512";
      case 11:
        return "SHA224";
      default:
        return AnnealMailLocale.getString("unknownHashAlg", [parseInt(id, 10)]);
    }
  }
};
