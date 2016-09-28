/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailApp"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/AddonManager.jsm"); /*global AddonManager: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */

const DIR_SERV_CONTRACTID = "@mozilla.org/file/directory_service;1";
const ENIG_EXTENSION_GUID = "annealmail@mapmeld.com";
const SEAMONKEY_ID = "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";
const XPCOM_APPINFO = "@mozilla.org/xre/app-info;1";

const AnnealMailApp = {
  /**
   * Platform application name (e.g. Thunderbird)
   */
  getName: function() {
    return Cc[XPCOM_APPINFO].getService(Ci.nsIXULAppInfo).name;
  },

  /**
   * Return the directory holding the current profile as nsIFile object
   */
  getProfileDirectory: function() {
    let ds = Cc[DIR_SERV_CONTRACTID].getService(Ci.nsIProperties);
    return ds.get("ProfD", Ci.nsIFile);
  },

  isSuite: function() {
    // return true if Seamonkey, false otherwise
    return Cc[XPCOM_APPINFO].getService(Ci.nsIXULAppInfo).ID == SEAMONKEY_ID;
  },

  getVersion: function() {
    AnnealMailLog.DEBUG("app.jsm: getVersion\n");
    AnnealMailLog.DEBUG("app.jsm: installed version: " + AnnealMailApp.version + "\n");
    return AnnealMailApp.version;
  },

  getInstallLocation: function() {
    return AnnealMailApp.installLocation;
  },

  setVersion: function(version) {
    AnnealMailApp.version = version;
  },

  setInstallLocation: function(location) {
    AnnealMailApp.installLocation = location;
  },

  registerAddon: function(addon) {
    AnnealMailApp.setVersion(addon.version);
    AnnealMailApp.setInstallLocation(addon.getResourceURI("").QueryInterface(Ci.nsIFileURL).file);
  },

  initAddon: function() {
    AddonManager.getAddonByID(ENIG_EXTENSION_GUID, AnnealMailApp.registerAddon);
  }
};

AnnealMailApp.initAddon();
