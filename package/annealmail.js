/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm"); /*global XPCOMUtils: false */
Cu.import("resource://annealmail/subprocess.jsm"); /*global subprocess: false */
Cu.import("resource://annealmail/pipeConsole.jsm"); /*global AnnealMailConsole: false */
Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Cu.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Cu.import("resource://annealmail/encryption.jsm"); /*global AnnealMailEncryption: false */
Cu.import("resource://annealmail/decryption.jsm"); /*global AnnealMailDecryption: false */
Cu.import("resource://annealmail/protocolHandler.jsm"); /*global AnnealMailProtocolHandler: false */
Cu.import("resource://annealmail/rules.jsm"); /*global AnnealMailRules: false */
Cu.import("resource://annealmail/filters.jsm"); /*global AnnealMailFilters: false */
Cu.import("resource://annealmail/armor.jsm"); /*global AnnealMailArmor: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/os.jsm"); /*global AnnealMailOS: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/commandLine.jsm"); /*global AnnealMailCommandLine: false */
Cu.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Cu.import("resource://annealmail/uris.jsm"); /*global AnnealMailURIs: false */
Cu.import("resource://annealmail/verify.jsm"); /*global AnnealMailVerifyAttachment: false */
Cu.import("resource://annealmail/mimeVerify.jsm"); /*global AnnealMailVerify: false */
Cu.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */
Cu.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Cu.import("resource://annealmail/configure.jsm"); /*global AnnealMailConfigure: false */
Cu.import("resource://annealmail/app.jsm"); /*global AnnealMailApp: false */

/* Implementations supplied by this module */
const NS_ANNEALMAIL_CONTRACTID = "@mozdev.org/annealmail/annealmail;1";

const NS_ANNEALMAIL_CID =
  Components.ID("{847b3a01-7ab1-11d4-8f02-006008948af5}");

// Contract IDs and CIDs used by this module
const NS_OBSERVERSERVICE_CONTRACTID = "@mozilla.org/observer-service;1";

const Cc = Components.classes;
const Ci = Components.interfaces;

// Interfaces
const nsISupports = Ci.nsISupports;
const nsIObserver = Ci.nsIObserver;
const nsIEnvironment = Ci.nsIEnvironment;
const nsIAnnealMail = Ci.nsIAnnealMail;

const NS_XPCOM_SHUTDOWN_OBSERVER_ID = "xpcom-shutdown";

///////////////////////////////////////////////////////////////////////////////
// AnnealMail encryption/decryption service
///////////////////////////////////////////////////////////////////////////////

function getLogDirectoryPrefix() {
  try {
    return AnnealMailPrefs.getPrefBranch().getCharPref("logDirectory") || "";
  }
  catch (ex) {
    return "";
  }
}

function initializeLogDirectory() {
  const prefix = getLogDirectoryPrefix();
  if (prefix) {
    AnnealMailLog.setLogLevel(5);
    AnnealMailLog.setLogDirectory(prefix);
    AnnealMailLog.DEBUG("annealmail.js: Logging debug output to " + prefix + "/enigdbug.txt\n");
  }
}

function initializeLogging(env) {
  const nspr_log_modules = env.get("NSPR_LOG_MODULES");
  const matches = nspr_log_modules.match(/annealmail.js:(\d+)/);

  if (matches && (matches.length > 1)) {
    AnnealMailLog.setLogLevel(Number(matches[1]));
    AnnealMailLog.WARNING("annealmail.js: AnnealMail: LogLevel=" + matches[1] + "\n");
  }
}

function initializeSubprocessLogging(env) {
  const nspr_log_modules = env.get("NSPR_LOG_MODULES");
  const matches = nspr_log_modules.match(/subprocess:(\d+)/);

  subprocess.registerLogHandler(function(txt) {
    AnnealMailLog.ERROR("subprocess.jsm: " + txt);
  });

  if (matches && matches.length > 1 && matches[1] > 2) {
    subprocess.registerDebugHandler(function(txt) {
      AnnealMailLog.DEBUG("subprocess.jsm: " + txt);
    });
  }
}

function initializeAgentInfo() {
  if (AnnealMailCcrAgent.useCcrAgent() && (!AnnealMailOS.isDosLike())) {
    if (!AnnealMailCcrAgent.isDummy()) {
      AnnealMailCore.addToEnvList("CCR_AGENT_INFO=" + AnnealMailCcrAgent.ccrAgentInfo.envStr);
    }
  }
}

function failureOn(ex, status) {
  status.initializationError = AnnealMailLocale.getString("annealmailNotAvailable");
  AnnealMailLog.ERROR("annealmail.js: AnnealMail.initialize: Error - " + status.initializationError + "\n");
  AnnealMailLog.DEBUG("annealmail.js: AnnealMail.initialize: exception=" + ex.toString() + "\n");
  throw Components.results.NS_ERROR_FAILURE;
}

function getEnvironment(status) {
  try {
    return Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);
  }
  catch (ex) {
    failureOn(ex, status);
  }
  return null;
}

function initializeEnvironment(env) {
  // Initialize global environment variables list
  let passEnv = ["GNUPGHOME", "CCRDIR", "ETC",
    "ALLUSERSPROFILE", "APPDATA", "BEGINLIBPATH",
    "COMMONPROGRAMFILES", "COMSPEC", "DBUS_SESSION_BUS_ADDRESS", "DISPLAY",
    "ANNEALMAIL_PASS_ENV", "ENDLIBPATH",
    "GTK_IM_MODULE",
    "HOME", "HOMEDRIVE", "HOMEPATH",
    "LOCPATH", "LOGNAME", "LD_LIBRARY_PATH", "MOZILLA_FIVE_HOME",
    "NLSPATH", "PATH", "PATHEXT", "PROGRAMFILES", "PWD",
    "QT_IM_MODULE",
    "SHELL", "SYSTEMDRIVE", "SYSTEMROOT",
    "TEMP", "TMP", "TMPDIR", "TZ", "TZDIR", "UNIXROOT",
    "USER", "USERPROFILE", "WINDIR", "XAUTHORITY",
    "XMODIFIERS"
  ];

  if (!(AnnealMailOS.getOS() === "WINNT" && AnnealMailPrefs.getPref("ccrLocaleEn"))) {
    passEnv = passEnv.concat([
      "LANG", "LANGUAGE", "LC_ALL", "LC_COLLATE", "LC_CTYPE",
      "LC_MESSAGES", "LC_MONETARY", "LC_NUMERIC", "LC_TIME"
    ]);
  }

  const passList = env.get("ANNEALMAIL_PASS_ENV");
  if (passList) {
    const passNames = passList.split(":");
    for (var k = 0; k < passNames.length; k++) {
      passEnv.push(passNames[k]);
    }
  }

  AnnealMailCore.initEnvList();

  if (AnnealMailOS.getOS() === "WINNT" && AnnealMailPrefs.getPref("ccrLocaleEn")) {
    // force output on Windows to EN-US
    AnnealMailCore.addToEnvList("LC_ALL=en_US");
    AnnealMailCore.addToEnvList("LANG=en_US");
  }

  for (var j = 0; j < passEnv.length; j++) {
    const envName = passEnv[j];
    const envValue = env.get(envName);
    if (envValue) {
      AnnealMailCore.addToEnvList(envName + "=" + envValue);
    }
  }

  AnnealMailLog.DEBUG("annealmail.js: AnnealMail.initialize: Ec.envList = " + AnnealMailCore.getEnvList() + "\n");
}

function initializeObserver(on) {
  // Register to observe XPCOM shutdown
  const obsServ = Cc[NS_OBSERVERSERVICE_CONTRACTID].getService().
  QueryInterface(Ci.nsIObserverService);
  obsServ.addObserver(on, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);
}

function AnnealMail() {
  this.wrappedJSObject = this;
}

AnnealMail.prototype = {
  classDescription: "AnnealMail",
  classID: NS_ANNEALMAIL_CID,
  contractID: NS_ANNEALMAIL_CONTRACTID,

  initialized: false,
  initializationAttempted: false,
  initializationError: "",

  _xpcom_factory: {
    createInstance: function(aOuter, iid) {
      // AnnealMail is a service -> only instanciate once
      return AnnealMailCore.ensuredAnnealMailService(function() {
        return new AnnealMail();
      });
    },
    lockFactory: function(lock) {}
  },
  QueryInterface: XPCOMUtils.generateQI([nsIAnnealMail, nsIObserver, nsISupports]),

  observe: function(aSubject, aTopic, aData) {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.observe: topic='" + aTopic + "' \n");

    if (aTopic == NS_XPCOM_SHUTDOWN_OBSERVER_ID) {
      // XPCOM shutdown
      this.finalize();

    }
    else {
      AnnealMailLog.DEBUG("annealmail.js: AnnealMail.observe: no handler for '" + aTopic + "'\n");
    }
  },


  finalize: function() {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.finalize:\n");
    if (!this.initialized) return;

    AnnealMailCcrAgent.finalize();
    AnnealMailLog.onShutdown();

    AnnealMailLog.setLogLevel(3);
    this.initializationError = "";
    this.initializationAttempted = false;
    this.initialized = false;
  },


  initialize: function(domWindow, version) {
    this.initializationAttempted = true;

    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.initialize: START\n");

    if (this.initialized) return;

    initializeLogDirectory();

    AnnealMailCore.setAnnealMailService(this);

    this.environment = getEnvironment(this);

    initializeLogging(this.environment);
    initializeSubprocessLogging(this.environment);
    initializeEnvironment(this.environment);

    try {
      AnnealMailConsole.write("Initializing AnnealMail service ...\n");
    }
    catch (ex) {
      failureOn(ex, this);
    }

    AnnealMailCcrAgent.setAgentPath(domWindow, this);
    AnnealMailCcrAgent.detectCcrAgent(domWindow, this);

    initializeAgentInfo();

    initializeObserver(this);

    this.initialized = true;

    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.initialize: END\n");
  },

  reinitialize: function() {
    this.initialized = false;
    this.initializationAttempted = true;

    AnnealMailConsole.write("Reinitializing AnnealMail service ...\n");
    AnnealMailCcrAgent.setAgentPath(null, this);
    this.initialized = true;
  },

  getService: function(holder, win, startingPreferences) {
    if (!win) {
      win = AnnealMailWindows.getBestParentWin();
    }

    AnnealMailLog.DEBUG("annealmail.js: svc = " + holder.svc + "\n");

    if (!holder.svc.initialized) {
      const firstInitialization = !holder.svc.initializationAttempted;

      try {
        // Initialize annealmail
        AnnealMailCore.init(AnnealMailApp.getVersion());
        holder.svc.initialize(win, AnnealMailApp.getVersion());

        try {
          // Reset alert count to default value
          AnnealMailPrefs.getPrefBranch().clearUserPref("initAlert");
        }
        catch (ex) {}
      }
      catch (ex) {
        if (firstInitialization) {
          // Display initialization error alert
          const errMsg = (holder.svc.initializationError ? holder.svc.initializationError : AnnealMailLocale.getString("accessError")) +
            "\n\n" + AnnealMailLocale.getString("initErr.howToFixIt");

          const checkedObj = {
            value: false
          };
          if (AnnealMailPrefs.getPref("initAlert")) {
            const r = AnnealMailDialog.longAlert(win, "AnnealMail: " + errMsg,
              AnnealMailLocale.getString("dlgNoPrompt"),
              null, AnnealMailLocale.getString("initErr.setupWizard.button"),
              null, checkedObj);
            if (r >= 0 && checkedObj.value) {
              AnnealMailPrefs.setPref("initAlert", false);
            }
            if (r == 1) {
              // start setup wizard
              AnnealMailWindows.openSetupWizard(win, false);
              return AnnealMail.getService(holder, win);
            }
          }
          if (AnnealMailPrefs.getPref("initAlert")) {
            holder.svc.initializationAttempted = false;
            holder.svc = null;
          }
        }

        return null;
      }

      const configuredVersion = AnnealMailPrefs.getPref("configuredVersion");

      AnnealMailLog.DEBUG("annealmailCommon.jsm: getService: " + configuredVersion + "\n");

      if (firstInitialization && holder.svc.initialized &&
        AnnealMailCcrAgent.agentType === "pgp") {
        AnnealMailDialog.alert(win, AnnealMailLocale.getString("pgpNotSupported"));
      }

      if (holder.svc.initialized && (AnnealMailApp.getVersion() != configuredVersion)) {
        AnnealMailConfigure.configureAnnealMail(win, startingPreferences);
      }
    }

    return holder.svc.initialized ? holder.svc : null;
  }
}; // AnnealMail.prototype


AnnealMailArmor.registerOn(AnnealMail.prototype);
AnnealMailDecryption.registerOn(AnnealMail.prototype);
AnnealMailEncryption.registerOn(AnnealMail.prototype);
AnnealMailRules.registerOn(AnnealMail.prototype);
AnnealMailURIs.registerOn(AnnealMail.prototype);
AnnealMailVerifyAttachment.registerOn(AnnealMail.prototype);
AnnealMailVerify.registerContentTypeHandler();

// This variable is exported implicitly and should not be refactored or removed
const NSGetFactory = XPCOMUtils.generateNSGetFactory([AnnealMail, AnnealMailProtocolHandler, AnnealMailCommandLine.Handler]);

AnnealMailFilters.registerAll();
