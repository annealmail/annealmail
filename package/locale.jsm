/*global Components: false, AnnealMailLog: false, AnnealMailOS: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailLocale"];

Components.utils.import("resource://annealmail/log.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

var enigStringBundle = null;

const LOCALE_SVC_CONTRACTID = "@mozilla.org/intl/nslocaleservice;1";

const AnnealMailLocale = {
  get: function() {
    return Cc[LOCALE_SVC_CONTRACTID].getService(Ci.nsILocaleService).getApplicationLocale();
  },

  // retrieves a localized string from the annealmail.properties stringbundle
  getString: function(aStr, subPhrases) {
    if (!enigStringBundle) {
      try {
        var strBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService();
        strBundleService = strBundleService.QueryInterface(Ci.nsIStringBundleService);
        enigStringBundle = strBundleService.createBundle("chrome://annealmail/locale/annealmail.properties");
      }
      catch (ex) {
        AnnealMailLog.ERROR("locale.jsm: Error in instantiating stringBundleService\n");
      }
    }

    if (enigStringBundle) {
      try {
        if (subPhrases) {
          if (typeof(subPhrases) == "string") {
            return enigStringBundle.formatStringFromName(aStr, [subPhrases], 1);
          }
          else {
            return enigStringBundle.formatStringFromName(aStr, subPhrases, subPhrases.length);
          }
        }
        else {
          return enigStringBundle.GetStringFromName(aStr);
        }
      }
      catch (ex) {
        AnnealMailLog.ERROR("locale.jsm: Error in querying stringBundleService for string '" + aStr + "'\n");
      }
    }
    return aStr;
  }
};
