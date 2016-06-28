/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

/**
 * helper functions for message composition
 */

Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/funcs.jsm"); /*global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Components.utils.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Components.utils.import("resource://annealmail/trust.jsm"); /*global AnnealMailTrust: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/constants.jsm"); /*global AnnealMailConstants: false */

if (!AnnealMail) var AnnealMail = {};

AnnealMail.hlp = {

  /* try to find valid key to passed email addresses (or keys)
   * @return: list of all found key (with leading "0x") or null
   *          details in details parameter
   */
  validKeysForAllRecipients: function(emailsOrKeys, details) {
    AnnealMailLog.DEBUG("=====> validKeysForAllRecipients()\n");
    AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: validKeysForAllRecipients(): emailsOrKeys='" + emailsOrKeys + "'\n");

    // use helper to see when we enter and leave this function
    let resultingArray = this.doValidKeysForAllRecipients(emailsOrKeys, details);

    AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: validKeysForAllRecipients(): return '" + resultingArray + "'\n");
    AnnealMailLog.DEBUG("  <=== validKeysForAllRecipients()\n");
    return resultingArray;
  },


  // helper for validKeysForAllRecipients()
  doValidKeysForAllRecipients: function(emailsOrKeys, details) {
    AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: doValidKeysForAllRecipients(): emailsOrKeys='" + emailsOrKeys + "'\n");

    // check which keys are accepted
    let minTrustLevel;
    let acceptedKeys = AnnealMailPrefs.getPref("acceptedKeys");
    switch (acceptedKeys) {
      case 0: // accept valid/authenticated keys only
        minTrustLevel = "f"; // first value for trusted keys
        break;
      case 1: // accept all but revoked/disabled/expired keys
        minTrustLevel = "?"; // value between invalid and unknown keys
        break;
      default:
        AnnealMailLog.DEBUG("annealmailMsgComposeOverlay.js: doValidKeysForAllRecipients(): return null (INVALID VALUE for acceptedKeys: \"" + acceptedKeys + "\")\n");
        return null;
    }

    AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: doValidKeysForAllRecipients(): find keys with minTrustLevel=\"" + minTrustLevel + "\"\n");

    let keyMissing;
    let resultingArray = []; // resulting key list (if all valid)
    try {
      // create array of address elements (email or key)
      let addresses = AnnealMailFuncs.stripEmail(emailsOrKeys).split(',');

      // resolve GnuPG groups
      let ccrGroups = AnnealMailCcr.getCcrGroups();
      for (let i = 0; i < addresses.length; i++) {
        let addr = addresses[i].toLowerCase();
        for (let j = 0; j < ccrGroups.length; j++) {
          if (addr == ccrGroups[j].alias.toLowerCase() ||
            "<" + addr + ">" == ccrGroups[j].alias.toLowerCase()) {
            // replace address with keylist
            let grpList = ccrGroups[j].keylist.split(/;/);
            addresses[i] = grpList[0];
            for (let k = 1; k < grpList.length; k++) {
              addresses.push(grpList[k]);
            }
          }
        }
      }

      // resolve all the email addresses if possible:
      keyMissing = AnnealMailKeyRing.getValidKeysForAllRecipients(addresses, minTrustLevel, details, resultingArray);
    }
    catch (ex) {
      AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return null (exception: " + ex.description + ")\n");
      return null;
    }
    if (keyMissing) {
      AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return null (key missing)\n");
      return null;
    }
    AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return \"" + resultingArray + "\"\n");
    return resultingArray;
  },


  /**
   * processConflicts
   * - handle sign/encrypt/pgpMime conflicts if any
   * - NOTE: conflicts result into disabling the feature (0/never)
   * Input parameters:
   *  @encrypt: email would currently get encrypted
   *  @sign:    email would currently get signed
   * @return:  false if error occurred or processing was canceled
   */
  processConflicts: function(encrypt, sign) {
    // process message about whether we still sign/encrypt
    let msg = "";
    msg += "\n- " + AnnealMailLocale.getString(encrypt ? "encryptYes" : "encryptNo");
    msg += "\n- " + AnnealMailLocale.getString(sign ? "signYes" : "signNo");
    if (AnnealMailPrefs.getPref("warnOnRulesConflict") == 2) {
      AnnealMailPrefs.setPref("warnOnRulesConflict", 0);
    }
    if (!AnnealMailDialog.confirmPref(window, AnnealMailLocale.getString("rulesConflict", [msg]), "warnOnRulesConflict")) {
      return false;
    }
    return true;
  },


  /**
   * determine invalid recipients as returned from GnuPG
   *
   * @ccrMsg: output from GnuPG
   *
   * @return: space separated list of invalid addresses
   */
  getInvalidAddress: function(ccrMsg) {
    AnnealMailLog.DEBUG("annealmailMsgComposeHelper.js: getInvalidAddress(): ccrMsg=\"" + ccrMsg + "\"\n\n");
    var invalidAddr = [];
    var lines = ccrMsg.split(/[\n\r]+/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(INV_RECP \d+ )(.*)$/);
      if (m && m.length == 3) {
        invalidAddr.push(AnnealMailFuncs.stripEmail(m[2].toLowerCase()));
      }
    }
    return invalidAddr.join(" ");
  }

};
