/*global Components: false, unescape: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailCcrAgent"];

const Cu = Components.utils;

Cu.import("resource://gre/modules/ctypes.jsm"); /*global ctypes: false */
Cu.import("resource://annealmail/subprocess.jsm"); /*global subprocess: false */
Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Cu.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Cu.import("resource://annealmail/os.jsm"); /*global AnnealMailOS: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Cu.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */
Cu.import("resource://annealmail/app.jsm"); /*global AnnealMailApp: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/passwords.jsm"); /*global AnnealMailPassword: false */
Cu.import("resource://annealmail/system.jsm"); /*global AnnealMailSystem: false */
Cu.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */

const Cc = Components.classes;
const Ci = Components.interfaces;

const nsIAnnealMail = Ci.nsIAnnealMail;

const NS_LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";
const DIR_SERV_CONTRACTID = "@mozilla.org/file/directory_service;1";
const NS_LOCALFILEOUTPUTSTREAM_CONTRACTID = "@mozilla.org/network/file-output-stream;1";

const DEFAULT_FILE_PERMS = 0x180; // equals 0600

// Making this a var makes it possible to test windows things on linux
var nsIWindowsRegKey = Ci.nsIWindowsRegKey;

var gIsCcrAgent = -1;

const DUMMY_AGENT_INFO = "none";

function cloneOrNull(v) {
  if (v && typeof v.clone === "function") {
    return v.clone();
  }
  else {
    return v;
  }
}

function extractAgentInfo(fullStr) {
  if (fullStr) {
    return fullStr.
    replace(/[\r\n]/g, "").
    replace(/^.*\=/, "").
    replace(/\;.*$/, "");
  }
  else {
    return "";
  }
}

function getHomedirFromParam(param) {
  let i = param.search(/--homedir/);
  if (i >= 0) {
    param = param.substr(i + 9);

    let m = param.match(/^(\s*)([^\\]".+[^\\]")/);
    if (m && m.length > 2) {
      param = m[2].substr(1);
      let j = param.search(/[^\\]"/);
      return param.substr(1, j);
    }

    m = param.match(/^(\s*)([^\\]'.+[^\\]')/);
    if (m && m.length > 2) {
      param = m[2].substr(1);
      let j = param.search(/[^\\]'/);
      return param.substr(1, j);
    }

    m = param.match(/^(\s*)(\S+)/);
    if (m && m.length > 2) {
      return m[2];
    }
  }

  return null;
}

var AnnealMailCcrAgent = {
  agentType: "",
  agentPath: null,
  connCcrAgentPath: null,
  ccrconfPath: null,
  ccrAgentInfo: {
    preStarted: false,
    envStr: ""
  },
  ccrAgentProcess: null,
  ccrAgentIsOptional: true,

  isDummy: function() {
    return AnnealMailCcrAgent.ccrAgentInfo.envStr === DUMMY_AGENT_INFO;
  },

  useCcrAgent: function() {
    return true;
    /*
      TODO: Remove the following. We support GnuPG 2.x, which always requires ccr-agent
        let useAgent = false;

        try {
          if (AnnealMailOS.isDosLike() && !AnnealMailCcr.getCcrFeature("supports-ccr-agent")) {
            useAgent = false;
          }
          else {
            // ccr version >= 2.0.16 launches ccr-agent automatically
            if (AnnealMailCcr.getCcrFeature("autostart-ccr-agent")) {
              useAgent = true;
              AnnealMailLog.DEBUG("annealmail.js: Setting useAgent to " + useAgent + " for ccr2 >= 2.0.16\n");
            }
            else {
              useAgent = (AnnealMailCcrAgent.ccrAgentInfo.envStr.length > 0 || AnnealMailPrefs.getPrefBranch().getBoolPref("useCcrAgent"));
            }
          }
        }
        catch (ex) {}
        return useAgent;
    */
  },

  resetCcrAgent: function() {
    AnnealMailLog.DEBUG("ccrAgent.jsm: resetCcrAgent\n");
    gIsCcrAgent = -1;
  },

  isCmdCcrAgent: function(pid) {
    AnnealMailLog.DEBUG("ccrAgent.jsm: isCmdCcrAgent:\n");

    const environment = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
    let ret = false;

    let path = environment.get("PATH");
    if (!path || path.length === 0) {
      path = "/bin:/usr/bin:/usr/local/bin";
    }

    const psCmd = AnnealMailFiles.resolvePath("ps", path, false);

    const proc = {
      command: psCmd,
      arguments: ["-o", "comm", "-p", pid],
      environment: AnnealMailCore.getEnvList(),
      charset: null,
      done: function(result) {
        AnnealMailLog.DEBUG("ccrAgent.jsm: isCmdCcrAgent: got data: '" + result.stdout + "'\n");
        var data = result.stdout.replace(/[\r\n]/g, " ");
        if (data.search(/ccr-agent/) >= 0) {
          ret = true;
        }
      }
    };

    try {
      subprocess.call(proc).wait();
    }
    catch (ex) {}

    return ret;

  },

  isAgentTypeCcrAgent: function() {
    // determine if the used agent is a ccr-agent

    AnnealMailLog.DEBUG("ccrAgent.jsm: isAgentTypeCcrAgent:\n");

    // to my knowledge there is no other agent than ccr-agent on Windows
    if (AnnealMailOS.getOS() == "WINNT") return true;

    if (gIsCcrAgent >= 0) {
      return gIsCcrAgent == 1;
    }

    let pid = -1;
    let exitCode = -1;
    if (!AnnealMailCore.getService()) return false;

    const proc = {
      command: AnnealMailCcrAgent.connCcrAgentPath,
      arguments: [],
      charset: null,
      environment: AnnealMailCore.getEnvList(),
      stdin: function(pipe) {
        pipe.write("/subst\n");
        pipe.write("/serverpid\n");
        pipe.write("/echo pid: ${get serverpid}\n");
        pipe.write("/bye\n");
        pipe.close();
      },
      done: function(result) {
        exitCode = result.exitCode;
        const data = result.stdout.replace(/[\r\n]/g, "");
        if (data.search(/^pid: [0-9]+$/) === 0) {
          pid = data.replace(/^pid: /, "");
        }
      }
    };

    try {
      subprocess.call(proc).wait();
      if (exitCode) pid = -2;
    }
    catch (ex) {}

    AnnealMailLog.DEBUG("ccrAgent.jsm: isAgentTypeCcrAgent: pid=" + pid + "\n");

    AnnealMailCcrAgent.isCmdCcrAgent(pid);
    let isAgent = false;

    try {
      isAgent = AnnealMailCcrAgent.isCmdCcrAgent(pid);
      gIsCcrAgent = isAgent ? 1 : 0;
    }
    catch (ex) {}

    return isAgent;
  },

  getAgentMaxIdle: function() {
    AnnealMailLog.DEBUG("ccrAgent.jsm: getAgentMaxIdle:\n");
    let maxIdle = -1;

    if (!AnnealMailCore.getService()) return maxIdle;

    const DEFAULT = 7;
    const CFGVALUE = 9;

    const proc = {
      command: AnnealMailCcrAgent.ccrconfPath,
      arguments: ["--list-options", "ccr-agent"],
      charset: null,
      environment: AnnealMailCore.getEnvList(),
      done: function(result) {
        const lines = result.stdout.split(/[\r\n]/);

        for (let i = 0; i < lines.length; i++) {
          AnnealMailLog.DEBUG("ccrAgent.jsm: getAgentMaxIdle: line: " + lines[i] + "\n");

          if (lines[i].search(/^default-cache-ttl:/) === 0) {
            const m = lines[i].split(/:/);
            if (m[CFGVALUE].length === 0) {
              maxIdle = Math.round(m[DEFAULT] / 60);
            }
            else {
              maxIdle = Math.round(m[CFGVALUE] / 60);
            }

            break;
          }
        }
      }
    };

    subprocess.call(proc).wait();
    return maxIdle;
  },

  setAgentMaxIdle: function(idleMinutes) {
    AnnealMailLog.DEBUG("ccrAgent.jsm: setAgentMaxIdle:\n");
    if (!AnnealMailCore.getService()) return;

    const RUNTIME = 8;

    const proc = {
      command: AnnealMailCcrAgent.ccrconfPath,
      arguments: ["--runtime", "--change-options", "ccr-agent"],
      environment: AnnealMailCore.getEnvList(),
      charset: null,
      mergeStderr: true,
      stdin: function(pipe) {
        pipe.write("default-cache-ttl:" + RUNTIME + ":" + (idleMinutes * 60) + "\n");
        pipe.write("max-cache-ttl:" + RUNTIME + ":" + (idleMinutes * 600) + "\n");
        pipe.close();
      },
      stdout: function(data) {
        AnnealMailLog.DEBUG("ccrAgent.jsm: setAgentMaxIdle.stdout: " + data + "\n");
      },
      done: function(result) {
        AnnealMailLog.DEBUG("ccrAgent.jsm: setAgentMaxIdle.stdout: ccrconf exitCode=" + result.exitCode + "\n");
      }
    };

    try {
      subprocess.call(proc);
    }
    catch (ex) {
      AnnealMailLog.DEBUG("ccrAgent.jsm: setAgentMaxIdle: exception: " + ex.toString() + "\n");
    }
  },

  getMaxIdlePref: function(win) {
    let maxIdle = AnnealMailPrefs.getPref("maxIdleMinutes");

    try {
      if (AnnealMailCore.getService(win)) {
        if (AnnealMailCcrAgent.ccrconfPath &&
          AnnealMailCcrAgent.connCcrAgentPath) {

          if (AnnealMailCcrAgent.isAgentTypeCcrAgent()) {
            const m = AnnealMailCcrAgent.getAgentMaxIdle();
            if (m > -1) maxIdle = m;
          }
        }
      }
    }
    catch (ex) {}

    return maxIdle;
  },

  setMaxIdlePref: function(minutes) {
    AnnealMailPrefs.setPref("maxIdleMinutes", minutes);

    if (AnnealMailCcrAgent.isAgentTypeCcrAgent()) {
      try {
        AnnealMailCcrAgent.setAgentMaxIdle(minutes);
      }
      catch (ex) {}
    }
  },

  /**
   * Determine the "ccr home dir", i.e. the directory where ccr.conf and the keyring are
   * stored
   *
   * @return String - directory name, or NULL (in case the command did not succeed)
   */
  getCcrHomeDir: function() {


    let param = AnnealMailPrefs.getPref("agentAdditionalParam");

    if (param) {
      let hd = getHomedirFromParam(param);

      if (hd) return hd;
    }

    if (AnnealMailCcrAgent.ccrconfPath === null) return null;

    const command = AnnealMailCcrAgent.ccrconfPath;
    let args = ["--list-dirs"];

    let exitCode = -1;
    let outStr = "";
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.setAgentPath: calling subprocess with '" + command.path + "'\n");

    AnnealMailLog.CONSOLE("annealmail> " + AnnealMailFiles.formatCmdLine(command, args) + "\n");

    const proc = {
      command: command,
      arguments: args,
      environment: AnnealMailCore.getEnvList(),
      charset: null,
      done: function(result) {
        exitCode = result.exitCode;
        outStr = result.stdout;
      },
      mergeStderr: false
    };

    try {
      subprocess.call(proc).wait();
    }
    catch (ex) {
      AnnealMailLog.ERROR("annealmail.js: AnnealMail.getCcrHomeDir: subprocess.call failed with '" + ex.toString() + "'\n");
      AnnealMailLog.DEBUG("  annealmail> DONE with FAILURE\n");
      throw ex;
    }

    let m = outStr.match(/^(homedir:)(.*)$/mi);
    if (m && m.length > 2) {
      return AnnealMailData.convertCcrToUnicode(unescape(m[2]));
    }

    return null;
  },

  setAgentPath: function(domWindow, esvc) {
    let agentPath = "";
    try {
      agentPath = AnnealMailPrefs.getPrefBranch().getCharPref("agentPath");
    }
    catch (ex) {}

    var agentType = "ccr";
    var agentName = "";

    AnnealMailCcrAgent.resetCcrAgent();

    if (AnnealMailOS.isDosLike()) {
      agentName = "ccr2.exe;ccr.exe;ccr1.exe";
    }
    else {
      agentName = "ccr";
    }


    if (agentPath) {
      // Locate GnuPG executable

      // Append default .exe extension for DOS-Like systems, if needed
      if (AnnealMailOS.isDosLike() && (agentPath.search(/\.\w+$/) < 0)) {
        agentPath += ".exe";
      }

      try {
        let pathDir = Cc[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);

        if (!AnnealMailFiles.isAbsolutePath(agentPath, AnnealMailOS.isDosLike())) {
          // path relative to Mozilla installation dir
          const ds = Cc[DIR_SERV_CONTRACTID].getService();
          const dsprops = ds.QueryInterface(Ci.nsIProperties);
          pathDir = dsprops.get("CurProcD", Ci.nsIFile);

          const dirs = agentPath.split(new RegExp(AnnealMailOS.isDosLike() ? "\\\\" : "/"));
          for (let i = 0; i < dirs.length; i++) {
            if (dirs[i] != ".") {
              pathDir.append(dirs[i]);
            }
          }
          pathDir.normalize();
        }
        else {
          // absolute path
          AnnealMailFiles.initPath(pathDir, agentPath);
        }
        if (!(pathDir.isFile() /* && pathDir.isExecutable()*/ )) {
          throw Components.results.NS_ERROR_FAILURE;
        }
        agentPath = pathDir.QueryInterface(Ci.nsIFile);

      }
      catch (ex) {
        esvc.initializationError = AnnealMailLocale.getString("ccrNotFound", [agentPath]);
        AnnealMailLog.ERROR("annealmail.js: AnnealMail.initialize: Error - " + esvc.initializationError + "\n");
        throw Components.results.NS_ERROR_FAILURE;
      }
    }
    else {
      // Resolve relative path using PATH environment variable
      const envPath = esvc.environment.get("PATH");
      agentPath = AnnealMailFiles.resolvePath(agentName, envPath, AnnealMailOS.isDosLike());

      if (!agentPath && AnnealMailOS.isDosLike()) {
        // DOS-like systems: search for CCR in c:\gnupg, c:\gnupg\bin, d:\gnupg, d:\gnupg\bin
        let ccrPath = "c:\\gnupg;c:\\gnupg\\bin;d:\\gnupg;d:\\gnupg\\bin";
        agentPath = AnnealMailFiles.resolvePath(agentName, ccrPath, AnnealMailOS.isDosLike());
      }

      if ((!agentPath) && AnnealMailOS.isWin32) {
        // Look up in Windows Registry
        try {
          let ccrPath = AnnealMailOS.getWinRegistryString("Software\\GNU\\GNUPG", "Install Directory", nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE);
          agentPath = AnnealMailFiles.resolvePath(agentName, ccrPath, AnnealMailOS.isDosLike());
        }
        catch (ex) {}

        if (!agentPath) {
          let ccrPath = ccrPath + "\\pub";
          agentPath = AnnealMailFiles.resolvePath(agentName, ccrPath, AnnealMailOS.isDosLike());
        }
      }

      if (!agentPath && !AnnealMailOS.isDosLike()) {
        // Unix-like systems: check /usr/bin and /usr/local/bin
        let ccrPath = "/usr/bin:/usr/local/bin";
        agentPath = AnnealMailFiles.resolvePath(agentName, ccrPath, AnnealMailOS.isDosLike());
      }

      if (!agentPath) {
        esvc.initializationError = AnnealMailLocale.getString("ccrNotInPath");
        AnnealMailLog.ERROR("annealmail.js: AnnealMail: Error - " + esvc.initializationError + "\n");
        throw Components.results.NS_ERROR_FAILURE;
      }
      agentPath = agentPath.QueryInterface(Ci.nsIFile);
    }

    AnnealMailLog.CONSOLE("AnnealMailAgentPath=" + AnnealMailFiles.getFilePathDesc(agentPath) + "\n\n");

    AnnealMailCcrAgent.agentType = agentType;
    AnnealMailCcrAgent.agentPath = agentPath;
    AnnealMailCcr.setAgentPath(agentPath);
    AnnealMailExecution.agentType = agentType;

    const command = agentPath;
    let args = [];
    if (agentType == "ccr") {
      args = ["--version", "--version", "--batch", "--no-tty", "--charset", "utf-8", "--display-charset", "utf-8"];
    }

    let exitCode = -1;
    let outStr = "";
    let errStr = "";
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.setAgentPath: calling subprocess with '" + command.path + "'\n");

    AnnealMailLog.CONSOLE("annealmail> " + AnnealMailFiles.formatCmdLine(command, args) + "\n");

    const proc = {
      command: command,
      arguments: args,
      environment: AnnealMailCore.getEnvList(),
      charset: null,
      done: function(result) {
        exitCode = result.exitCode;
        outStr = result.stdout;
        errStr = result.stderr;
      },
      mergeStderr: false
    };

    try {
      subprocess.call(proc).wait();
    }
    catch (ex) {
      AnnealMailLog.ERROR("annealmail.js: AnnealMail.setAgentPath: subprocess.call failed with '" + ex.toString() + "'\n");
      AnnealMailLog.DEBUG("  annealmail> DONE with FAILURE\n");
      throw ex;
    }
    AnnealMailLog.DEBUG("  annealmail> DONE\n");

    outStr = AnnealMailSystem.convertNativeToUnicode(outStr);

    if (exitCode !== 0) {
      AnnealMailLog.ERROR("annealmail.js: AnnealMail.setAgentPath: ccr failed with exitCode " + exitCode + " msg='" + outStr + " " + errStr + "'\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    AnnealMailLog.CONSOLE(outStr + "\n");

    // detection for Ccr4Win wrapper
    if (outStr.search(/^ccrwrap.*;/) === 0) {
      const outLines = outStr.split(/[\n\r]+/);
      const firstLine = outLines[0];
      outLines.splice(0, 1);
      outStr = outLines.join("\n");
      agentPath = firstLine.replace(/^.*;[ \t]*/, "");

      AnnealMailLog.CONSOLE("ccr4win-ccrwrapper detected; AnnealMailAgentPath=" + agentPath + "\n\n");
    }

    const versionParts = outStr.replace(/[\r\n].*/g, "").replace(/ *\(ccr4win.*\)/i, "").split(/ /);
    const ccrVersion = versionParts[versionParts.length - 1];

    AnnealMailLog.DEBUG("annealmail.js: detected CodeCrypt version '" + ccrVersion + "'\n");
    AnnealMailCcr.agentVersion = ccrVersion;

    if (!AnnealMailCcr.getCcrFeature("version-supported")) {
      if (!domWindow) {
        domWindow = AnnealMailWindows.getBestParentWin();
      }
      AnnealMailDialog.alert(domWindow, AnnealMailLocale.getString("oldCcrVersion14", [ccrVersion]));
      throw Components.results.NS_ERROR_FAILURE;
    }

    AnnealMailCcrAgent.ccrconfPath = AnnealMailCcrAgent.resolveToolPath("ccrconf");
    AnnealMailCcrAgent.connCcrAgentPath = AnnealMailCcrAgent.resolveToolPath("ccr-connect-agent");

    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.setAgentPath: ccrconf found: " + (AnnealMailCcrAgent.ccrconfPath ? "yes" : "no") + "\n");
  },

  // resolve the path for GnuPG helper tools
  resolveToolPath: function(fileName) {
    if (AnnealMailOS.isDosLike()) {
      fileName += ".exe";
    }

    let filePath = cloneOrNull(AnnealMailCcrAgent.agentPath);

    if (filePath) filePath = filePath.parent;
    if (filePath) {
      filePath.append(fileName);
      if (filePath.exists()) {
        filePath.normalize();
        return filePath;
      }
    }

    const foundPath = AnnealMailFiles.resolvePath(fileName, AnnealMailCore.getAnnealMailService().environment.get("PATH"), AnnealMailOS.isDosLike());
    if (foundPath) {
      foundPath.normalize();
    }
    return foundPath;
  },

  detectCcrAgent: function(domWindow, esvc) {
    AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent\n");

    var ccrAgentInfo = esvc.environment.get("CCR_AGENT_INFO");
    if (ccrAgentInfo && ccrAgentInfo.length > 0) {
      AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: CCR_AGENT_INFO variable available\n");
      // env. variable suggests running ccr-agent
      AnnealMailCcrAgent.ccrAgentInfo.preStarted = true;
      AnnealMailCcrAgent.ccrAgentInfo.envStr = ccrAgentInfo;
      AnnealMailCcrAgent.ccrAgentIsOptional = false;
    }
    else {
      AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: no CCR_AGENT_INFO variable set\n");
      AnnealMailCcrAgent.ccrAgentInfo.preStarted = false;

      var command = null;
      var outStr = "";
      var errorStr = "";
      var exitCode = -1;
      AnnealMailCcrAgent.ccrAgentIsOptional = false;
      if (AnnealMailCcr.getCcrFeature("autostart-ccr-agent")) {
        AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: ccr 2.0.16 or newer - not starting agent\n");
      }
      else {
        if (AnnealMailCcrAgent.connCcrAgentPath && AnnealMailCcrAgent.connCcrAgentPath.isExecutable()) {
          // try to connect to a running ccr-agent

          AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: ccr-connect-agent is executable\n");

          AnnealMailCcrAgent.ccrAgentInfo.envStr = DUMMY_AGENT_INFO;

          command = AnnealMailCcrAgent.connCcrAgentPath.QueryInterface(Ci.nsIFile);

          AnnealMailLog.CONSOLE("annealmail> " + command.path + "\n");

          try {
            subprocess.call({
              command: command,
              environment: AnnealMailCore.getEnvList(),
              stdin: "/echo OK\n",
              charset: null,
              done: function(result) {
                AnnealMailLog.DEBUG("detectCcrAgent detection terminated with " + result.exitCode + "\n");
                exitCode = result.exitCode;
                outStr = result.stdout;
                errorStr = result.stderr;
                if (result.stdout.substr(0, 2) == "OK") exitCode = 0;
              },
              mergeStderr: false
            }).wait();
          }
          catch (ex) {
            AnnealMailLog.ERROR("annealmail.js: detectCcrAgent: " + command.path + " failed\n");
            AnnealMailLog.DEBUG("  annealmail> DONE with FAILURE\n");
            exitCode = -1;
          }
          AnnealMailLog.DEBUG("  annealmail> DONE\n");

          if (exitCode === 0) {
            AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: found running ccr-agent\n");
            return;
          }
          else {
            AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: no running ccr-agent. Output='" + outStr + "' error text='" + errorStr + "'\n");
          }

        }

        // and finally try to start ccr-agent
        var commandFile = AnnealMailCcrAgent.resolveToolPath("ccr-agent");
        var agentProcess = null;

        if ((!commandFile) || (!commandFile.exists())) {
          commandFile = AnnealMailCcrAgent.resolveToolPath("ccr-agent2");
        }

        if (commandFile && commandFile.exists()) {
          command = commandFile.QueryInterface(Ci.nsIFile);
        }

        if (command === null) {
          AnnealMailLog.ERROR("annealmail.js: detectCcrAgent: ccr-agent not found\n");
          AnnealMailDialog.alert(domWindow, AnnealMailLocale.getString("ccrAgentNotStarted", [AnnealMailCcr.agentVersion]));
          throw Components.results.NS_ERROR_FAILURE;
        }
      }

      if ((!AnnealMailOS.isDosLike()) && (!AnnealMailCcr.getCcrFeature("autostart-ccr-agent"))) {

        // create unique tmp file
        var ds = Cc[DIR_SERV_CONTRACTID].getService();
        var dsprops = ds.QueryInterface(Ci.nsIProperties);
        var tmpFile = dsprops.get("TmpD", Ci.nsIFile);
        tmpFile.append("ccr-wrapper.tmp");
        tmpFile.createUnique(tmpFile.NORMAL_FILE_TYPE, DEFAULT_FILE_PERMS);
        let args = [command.path,
          tmpFile.path,
          "--sh", "--no-use-standard-socket",
          "--daemon",
          "--default-cache-ttl", (AnnealMailPassword.getMaxIdleMinutes() * 60).toString(),
          "--max-cache-ttl", "999999"
        ]; // ca. 11 days

        try {
          var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
          var exec = AnnealMailApp.getInstallLocation().clone();
          exec.append("wrappers");
          exec.append("ccr-agent-wrapper.sh");
          process.init(exec);
          process.run(true, args, args.length);

          if (!tmpFile.exists()) {
            AnnealMailLog.ERROR("annealmail.js: detectCcrAgent no temp file created\n");
          }
          else {
            outStr = AnnealMailFiles.readFile(tmpFile);
            tmpFile.remove(false);
            exitCode = 0;
          }
        }
        catch (ex) {
          AnnealMailLog.ERROR("annealmail.js: detectCcrAgent: failed with '" + ex + "'\n");
          exitCode = -1;
        }

        if (exitCode === 0) {
          AnnealMailCcrAgent.ccrAgentInfo.envStr = extractAgentInfo(outStr);
          AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: started -> " + AnnealMailCcrAgent.ccrAgentInfo.envStr + "\n");
          AnnealMailCcrAgent.ccrAgentProcess = AnnealMailCcrAgent.ccrAgentInfo.envStr.split(":")[1];
        }
        else {
          AnnealMailLog.ERROR("annealmail.js: detectCcrAgent: ccr-agent output: " + outStr + "\n");
          AnnealMailDialog.alert(domWindow, AnnealMailLocale.getString("ccrAgentNotStarted", [AnnealMailCcr.agentVersion]));
          throw Components.results.NS_ERROR_FAILURE;
        }
      }
      else {
        AnnealMailCcrAgent.ccrAgentInfo.envStr = DUMMY_AGENT_INFO;
        var envFile = Components.classes[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);
        AnnealMailFiles.initPath(envFile, AnnealMailCcrAgent.determineCcrHomeDir(esvc));
        envFile.append("ccr-agent.conf");

        var data = "default-cache-ttl " + (AnnealMailPassword.getMaxIdleMinutes() * 60) + "\n";
        data += "max-cache-ttl 999999";
        if (!envFile.exists()) {
          try {
            var flags = 0x02 | 0x08 | 0x20;
            var fileOutStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
            fileOutStream.init(envFile, flags, 384, 0); // 0600
            fileOutStream.write(data, data.length);
            fileOutStream.flush();
            fileOutStream.close();
          }
          catch (ex) {} // ignore file write errors
        }
      }
    }
    AnnealMailLog.DEBUG("annealmail.js: detectCcrAgent: CCR_AGENT_INFO='" + AnnealMailCcrAgent.ccrAgentInfo.envStr + "'\n");
  },

  determineCcrHomeDir: function(esvc) {
    let homeDir = esvc.environment.get("GNUPGHOME");

    if (!homeDir && AnnealMailOS.isWin32) {
      homeDir = AnnealMailOS.getWinRegistryString("Software\\GNU\\GNUPG", "HomeDir", nsIWindowsRegKey.ROOT_KEY_CURRENT_USER);

      if (!homeDir) {
        homeDir = esvc.environment.get("USERPROFILE") || esvc.environment.get("SystemRoot");

        if (homeDir) homeDir += "\\Application Data\\GnuPG";
      }

      if (!homeDir) homeDir = "C:\\gnupg";
    }

    if (!homeDir) homeDir = esvc.environment.get("HOME") + "/.gnupg";

    return homeDir;
  },

  finalize: function() {
    if (AnnealMailCcrAgent.ccrAgentProcess) {
      AnnealMailLog.DEBUG("ccrAgent.jsm: AnnealMailCcrAgent.finalize: stopping ccr-agent PID=" + AnnealMailCcrAgent.ccrAgentProcess + "\n");
      try {
        const libc = ctypes.open(subprocess.getPlatformValue(0));

        //int kill(pid_t pid, int sig);
        const kill = libc.declare("kill",
          ctypes.default_abi,
          ctypes.int,
          ctypes.int32_t,
          ctypes.int);

        kill(parseInt(AnnealMailCcrAgent.ccrAgentProcess, 10), 15);
      }
      catch (ex) {
        AnnealMailLog.ERROR("ccrAgent.jsm: AnnealMailCcrAgent.finalize ERROR: " + ex + "\n");
      }
    }
  }
};
