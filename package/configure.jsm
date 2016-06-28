/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*global Components: false */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailConfigure"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;


/*global AnnealMailLog: false, AnnealMailPrefs: false, AnnealMailTimer: false, AnnealMailApp: false, AnnealMailLocale: false, AnnealMailDialog: false, AnnealMailWindows: false */

Cu.import("resource://annealmail/log.jsm");
Cu.import("resource://annealmail/prefs.jsm");
Cu.import("resource://annealmail/timer.jsm");
Cu.import("resource://annealmail/app.jsm");
Cu.import("resource://annealmail/locale.jsm");
Cu.import("resource://annealmail/dialog.jsm");
Cu.import("resource://annealmail/windows.jsm");

function upgradeRecipientsSelection() {
  // Upgrade perRecipientRules and recipientsSelectionOption to
  // new recipientsSelection

  var keySel = AnnealMailPrefs.getPref("recipientsSelectionOption");
  var perRecipientRules = AnnealMailPrefs.getPref("perRecipientRules");

  var setVal = 2;

  /*
   1: rules only
   2: rules & email addresses (normal)
   3: email address only (no rules)
   4: manually (always prompt, no rules)
   5: no rules, no key selection
   */

  switch (perRecipientRules) {
    case 0:
      switch (keySel) {
        case 0:
          setVal = 5;
          break;
        case 1:
          setVal = 3;
          break;
        case 2:
          setVal = 4;
          break;
        default:
          setVal = 2;
      }
      break;
    case 1:
      setVal = 2;
      break;
    case 2:
      setVal = 1;
      break;
    default:
      setVal = 2;
  }

  // set new pref
  AnnealMailPrefs.setPref("recipientsSelection", setVal);

  // clear old prefs
  AnnealMailPrefs.getPrefBranch().clearUserPref("perRecipientRules");
  AnnealMailPrefs.getPrefBranch().clearUserPref("recipientsSelectionOption");
}

function upgradePrefsSending() {
  AnnealMailLog.DEBUG("annealmailCommon.jsm: upgradePrefsSending()\n");

  var cbs = AnnealMailPrefs.getPref("confirmBeforeSend");
  var ats = AnnealMailPrefs.getPref("alwaysTrustSend");
  var ksfr = AnnealMailPrefs.getPref("keepSettingsForReply");
  AnnealMailLog.DEBUG("annealmailCommon.jsm: upgradePrefsSending cbs=" + cbs + " ats=" + ats + " ksfr=" + ksfr + "\n");

  // Upgrade confirmBeforeSend (bool) to confirmBeforeSending (int)
  switch (cbs) {
    case false:
      AnnealMailPrefs.setPref("confirmBeforeSending", 0); // never
      break;
    case true:
      AnnealMailPrefs.setPref("confirmBeforeSending", 1); // always
      break;
  }

  // Upgrade alwaysTrustSend (bool)   to acceptedKeys (int)
  switch (ats) {
    case false:
      AnnealMailPrefs.setPref("acceptedKeys", 0); // valid
      break;
    case true:
      AnnealMailPrefs.setPref("acceptedKeys", 1); // all
      break;
  }

  // if all settings are default settings, use convenient encryption
  if (cbs === false && ats === true && ksfr === true) {
    AnnealMailPrefs.setPref("encryptionModel", 0); // convenient
    AnnealMailLog.DEBUG("annealmailCommon.jsm: upgradePrefsSending() encryptionModel=0 (convenient)\n");
  }
  else {
    AnnealMailPrefs.setPref("encryptionModel", 1); // manually
    AnnealMailLog.DEBUG("annealmailCommon.jsm: upgradePrefsSending() encryptionModel=1 (manually)\n");
  }

  // clear old prefs
  AnnealMailPrefs.getPrefBranch().clearUserPref("confirmBeforeSend");
  AnnealMailPrefs.getPrefBranch().clearUserPref("alwaysTrustSend");
}


function upgradeHeadersView() {
  // all headers hack removed -> make sure view is correct
  var hdrMode = null;
  try {
    hdrMode = AnnealMailPrefs.getPref("show_headers");
  }
  catch (ex) {}

  if (!hdrMode) hdrMode = 1;
  try {
    AnnealMailPrefs.getPrefBranch().clearUserPref("show_headers");
  }
  catch (ex) {}

  AnnealMailPrefs.getPrefRoot().setIntPref("mail.show_headers", hdrMode);
}

function upgradeCustomHeaders() {
  try {
    var extraHdrs = " " + AnnealMailPrefs.getPrefRoot().getCharPref("mailnews.headers.extraExpandedHeaders").toLowerCase() + " ";

    var extraHdrList = [
      "x-annealmail-version",
      "content-transfer-encoding",
      "openpgp",
      "x-mimeole",
      "x-bugzilla-reason",
      "x-php-bug"
    ];

    for (let hdr in extraHdrList) {
      extraHdrs = extraHdrs.replace(" " + extraHdrList[hdr] + " ", " ");
    }

    extraHdrs = extraHdrs.replace(/^ */, "").replace(/ *$/, "");
    AnnealMailPrefs.getPrefRoot().setCharPref("mailnews.headers.extraExpandedHeaders", extraHdrs);
  }
  catch (ex) {}
}

/**
 * Change from global PGP/MIME setting to per-identity setting
 */
function upgradeOldPgpMime() {
  var pgpMimeMode = false;
  try {
    pgpMimeMode = (AnnealMailPrefs.getPref("usePGPMimeOption") == 2);
  }
  catch (ex) {
    return;
  }

  try {
    var accountManager = Cc["@mozilla.org/messenger/account-manager;1"].getService(Ci.nsIMsgAccountManager);
    for (var i = 0; i < accountManager.allIdentities.length; i++) {
      var id = accountManager.allIdentities.queryElementAt(i, Ci.nsIMsgIdentity);
      if (id.getBoolAttribute("enablePgp")) {
        id.setBoolAttribute("pgpMimeMode", pgpMimeMode);
      }
    }

    AnnealMailPrefs.getPrefBranch().clearUserPref("usePGPMimeOption");
  }
  catch (ex) {}
}

/**
 * Change the default to PGP/MIME for all accounts, except nntp
 */
function defaultPgpMime() {
  let accountManager = Cc["@mozilla.org/messenger/account-manager;1"].getService(Ci.nsIMsgAccountManager);
  let changedSomething = false;

  for (let acct = 0; acct < accountManager.accounts.length; acct++) {
    let ac = accountManager.accounts.queryElementAt(acct, Ci.nsIMsgAccount);
    if (ac.incomingServer.type.search(/(pop3|imap|movemail)/) >= 0) {

      for (let i = 0; i < ac.identities.length; i++) {
        let id = ac.identities.queryElementAt(i, Ci.nsIMsgIdentity);
        if (id.getBoolAttribute("enablePgp") && !id.getBoolAttribute("pgpMimeMode")) {
          changedSomething = true;
        }
        id.setBoolAttribute("pgpMimeMode", true);
      }
    }
  }

  if (AnnealMailPrefs.getPref("advancedUser") && changedSomething) {
    AnnealMailDialog.alert(null,
      AnnealMailLocale.getString("preferences.defaultToPgpMime"));
  }
}

const AnnealMailConfigure = {
  configureAnnealMail: function(win, startingPreferences) {
    AnnealMailLog.DEBUG("configure.jsm: configureAnnealMail\n");
    let oldVer = AnnealMailPrefs.getPref("configuredVersion");

    let vc = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
    if (oldVer === "") {
      AnnealMailWindows.openSetupWizard(win, false);
    }
    else {
      if (oldVer < "0.95") {
        try {
          upgradeHeadersView();
          upgradeOldPgpMime();
          upgradeRecipientsSelection();
        }
        catch (ex) {}
      }
      if (vc.compare(oldVer, "1.0") < 0) {
        upgradeCustomHeaders();
      }
      if (vc.compare(oldVer, "1.7a1pre") < 0) {
        // 1: rules only
        //     => assignKeysByRules true; rest false
        // 2: rules & email addresses (normal)
        //     => assignKeysByRules/assignKeysByEmailAddr/assignKeysManuallyIfMissing true
        // 3: email address only (no rules)
        //     => assignKeysByEmailAddr/assignKeysManuallyIfMissing true
        // 4: manually (always prompt, no rules)
        //     => assignKeysManuallyAlways true
        // 5: no rules, no key selection
        //     => assignKeysByRules/assignKeysByEmailAddr true

        upgradePrefsSending();
      }
      if (vc.compare(oldVer, "1.7") < 0) {
        // open a modal dialog. Since this might happen during the opening of another
        // window, we have to do this asynchronously
        AnnealMailTimer.setTimeout(
          function _cb() {
            var doIt = AnnealMailDialog.confirmDlg(win,
              AnnealMailLocale.getString("annealmailCommon.versionSignificantlyChanged"),
              AnnealMailLocale.getString("annealmailCommon.checkPreferences"),
              AnnealMailLocale.getString("dlg.button.close"));
            if (!startingPreferences && doIt) {
              // same as:
              // - AnnealMailWindows.openPrefWindow(window, true, 'sendingTab');
              // but
              // - without starting the service again because we do that right now
              // - and modal (waiting for its end)
              win.openDialog("chrome://annealmail/content/pref-annealmail.xul",
                "_blank", "chrome,resizable=yes,modal", {
                  'showBasic': true,
                  'clientType': 'thunderbird',
                  'selectTab': 'sendingTab'
                });
            }
          }, 100);
      }

      if (vc.compare(oldVer, "1.9a2pre") < 0) {
        defaultPgpMime();
      }
    }

    AnnealMailPrefs.setPref("configuredVersion", AnnealMailApp.getVersion());
    AnnealMailPrefs.savePrefs();
  }
};
