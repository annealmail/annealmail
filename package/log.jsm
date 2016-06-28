/*global Components: false, AnnealMailConsole: false, dump: false, AnnealMailFiles: false, AnnealMailOS: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailLog"];

Components.utils.import("resource://annealmail/pipeConsole.jsm");
Components.utils.import("resource://annealmail/files.jsm");
Components.utils.import("resource://annealmail/os.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

const XPCOM_APPINFO = "@mozilla.org/xre/app-info;1";
const NS_IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";


const AnnealMailLog = {
  level: 3,
  data: null,
  directory: null,
  fileStream: null,

  setLogLevel: function(newLogLevel) {
    AnnealMailLog.level = newLogLevel;
  },

  getLogLevel: function() {
    return AnnealMailLog.level;
  },

  setLogDirectory: function(newLogDirectory) {
    AnnealMailLog.directory = newLogDirectory + (AnnealMailOS.isDosLike() ? "\\" : "/");
    AnnealMailLog.createLogFiles();
  },

  createLogFiles: function() {
    if (AnnealMailLog.directory && (!AnnealMailLog.fileStream) && AnnealMailLog.level >= 5) {
      AnnealMailLog.fileStream = AnnealMailFiles.createFileStream(AnnealMailLog.directory + "enigdbug.txt");
    }
  },

  onShutdown: function() {
    if (AnnealMailLog.fileStream) {
      AnnealMailLog.fileStream.close();
    }
    AnnealMailLog.fileStream = null;
  },

  getLogData: function(version, prefs) {
    let ioServ = Cc[NS_IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);

    let oscpu = "";
    let platform = "";

    try {
      let httpHandler = ioServ.getProtocolHandler("http");
      httpHandler = httpHandler.QueryInterface(Ci.nsIHttpProtocolHandler);
      oscpu = httpHandler.oscpu;
      platform = httpHandler.platform;
    }
    catch (ex) {}

    let data = "AnnealMail version " + version + "\n" +
      "OS/CPU=" + oscpu + "\n" +
      "Platform=" + platform + "\n" +
      "Non-default preference values:\n";

    let p = prefs.getPrefBranch().getChildList("");

    for (let i in p) {
      if (prefs.getPrefBranch().prefHasUserValue(p[i])) {
        data += p[i] + ": " + prefs.getPref(p[i]) + "\n";
      }
    }

    return data + "\n" + AnnealMailLog.data;
  },

  WRITE: function(str) {
    function withZeroes(val, digits) {
      return ("0000" + val.toString()).substr(-digits);
    }

    var d = new Date();
    var datStr = d.getFullYear() + "-" + withZeroes(d.getMonth() + 1, 2) + "-" + withZeroes(d.getDate(), 2) + " " + withZeroes(d.getHours(), 2) + ":" + withZeroes(d.getMinutes(), 2) + ":" +
      withZeroes(d.getSeconds(), 2) + "." + withZeroes(d.getMilliseconds(), 3) + " ";
    if (AnnealMailLog.level >= 4)
      dump(datStr + str);

    if (AnnealMailLog.data === null) {
      AnnealMailLog.data = "";
      let appInfo = Cc[XPCOM_APPINFO].getService(Ci.nsIXULAppInfo);
      AnnealMailLog.WRITE("Mozilla Platform: " + appInfo.name + " " + appInfo.version + "\n");
    }
    // truncate first part of log data if it grow too much
    if (AnnealMailLog.data.length > 5120000) {
      AnnealMailLog.data = AnnealMailLog.data.substr(-400000);
    }

    AnnealMailLog.data += datStr + str;

    if (AnnealMailLog.fileStream) {
      AnnealMailLog.fileStream.write(datStr, datStr.length);
      AnnealMailLog.fileStream.write(str, str.length);
    }
  },

  DEBUG: function(str) {
    AnnealMailLog.WRITE("[DEBUG] " + str);
  },

  WARNING: function(str) {
    AnnealMailLog.WRITE("[WARN] " + str);
    AnnealMailConsole.write(str);
  },

  ERROR: function(str) {
    try {
      var consoleSvc = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
      var scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
      scriptError.init(str, null, null, 0, 0, scriptError.errorFlag, "AnnealMail");
      consoleSvc.logMessage(scriptError);
    }
    catch (ex) {}

    AnnealMailLog.WRITE("[ERROR] " + str);
  },

  CONSOLE: function(str) {
    if (AnnealMailLog.level >= 3) {
      AnnealMailLog.WRITE("[CONSOLE] " + str);
    }

    AnnealMailConsole.write(str);
  },

  /**
   *  Log an exception including the stack trace
   *
   *  referenceInfo: String - arbitraty text to write before the exception is logged
   *  ex:            exception object
   */
  writeException: function(referenceInfo, ex) {
    AnnealMailLog.ERROR(referenceInfo + ": caught exception: " +
      ex.name + "\n" +
      "Message: '" + ex.message + "'\n" +
      "File:    " + ex.fileName + "\n" +
      "Line:    " + ex.lineNumber + "\n" +
      "Stack:   " + ex.stack + "\n");
  }
};
