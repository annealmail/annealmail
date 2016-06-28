/*global Components: false, AnnealMailData: false, AnnealMailFiles: false, AnnealMailLog: false, subprocess: false, AnnealMailErrorHandling: false, AnnealMailCore: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailExecution"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://annealmail/data.jsm");
Cu.import("resource://annealmail/files.jsm");
Cu.import("resource://annealmail/log.jsm");
Cu.import("resource://annealmail/subprocess.jsm");
Cu.import("resource://annealmail/errorHandling.jsm");
Cu.import("resource://annealmail/core.jsm");
Cu.import("resource://annealmail/os.jsm"); /*global AnnealMailOS: false */
Cu.import("resource://annealmail/system.jsm"); /*global AnnealMailSystem: false */

const nsIAnnealMail = Ci.nsIAnnealMail;

const AnnealMailExecution = {
  agentType: "",

  /**
   * execStart Listener Object
   *
   * The listener object must implement at least the following methods:
   *
   *  stdin(pipe)    - OPTIONAL - write data to subprocess stdin via |pipe| hanlde
   *  stdout(data)   - receive |data| from subprocess stdout
   *  stderr(data)   - receive |data| from subprocess stderr
   *  done(exitCode) - receive signal when subprocess has terminated
   */

  /**
   *  start a subprocess (usually ccr) that gets and/or receives data via stdin/stdout/stderr.
   *
   * @command:        either: String - full path to executable
   *                  or:     nsIFile object referencing executable
   * @args:           Array of Strings: command line parameters for executable
   * @needPassphrase: Boolean - is a passphrase required for the action?
   *                    if true, the password may be promted using a dialog
   *                    (unless already cached or ccr-agent is used)
   * @domWindow:      nsIWindow - window on top of which password dialog is shown
   * @listener:       Object - Listener to interact with subprocess; see spec. above
   * @statusflagsObj: Object - .value will hold status Flags
   *
   * @return:         handle to suprocess
   */
  execStart: function(command, args, needPassphrase, domWindow, listener, statusFlagsObj) {
    AnnealMailLog.WRITE("execution.jsm: execStart: " +
      "command = " + AnnealMailFiles.formatCmdLine(command, args) +
      ", needPassphrase=" + needPassphrase +
      ", domWindow=" + domWindow +
      ", listener=" + listener + "\n");

    listener = listener || {};

    statusFlagsObj.value = 0;

    var proc = null;

    listener.command = command;

    AnnealMailLog.CONSOLE("annealmail> " + AnnealMailFiles.formatCmdLine(command, args) + "\n");

    try {
      proc = subprocess.call({
        command: command,
        arguments: args,
        environment: AnnealMailCore.getEnvList(),
        charset: null,
        bufferedOutput: true,
        stdin: function(pipe) {
          if (listener.stdin) listener.stdin(pipe);
        },
        stdout: function(data) {
          listener.stdout(data);
        },
        stderr: function(data) {
          listener.stderr(data);
        },
        done: function(result) {
          try {
            listener.done(result.exitCode);
          }
          catch (ex) {
            AnnealMailLog.writeException("execution.jsm", ex);
          }
        },
        mergeStderr: false
      });
    }
    catch (ex) {
      AnnealMailLog.ERROR("execution.jsm: execStart: subprocess.call failed with '" + ex.toString() + "'\n");
      AnnealMailLog.DEBUG("  annealmail> DONE with FAILURE\n");
      return null;
    }
    AnnealMailLog.DEBUG("  annealmail> DONE\n");

    return proc;
  },

  /*
   requirements for listener object:
   exitCode
   stderrData
   */
  execEnd: function(listener, statusFlagsObj, statusMsgObj, cmdLineObj, errorMsgObj, blockSeparationObj) {
    AnnealMailLog.DEBUG("execution.jsm: execEnd:\n");

    cmdLineObj.value = listener.command;

    var exitCode = listener.exitCode;
    var errOutput = listener.stderrData;

    AnnealMailLog.DEBUG("execution.jsm: execEnd: exitCode = " + exitCode + "\n");
    AnnealMailLog.DEBUG("execution.jsm: execEnd: errOutput = " + errOutput + "\n");

    var retObj = {};
    errorMsgObj.value = AnnealMailErrorHandling.parseErrorOutput(errOutput, retObj);
    statusFlagsObj.value = retObj.statusFlags;
    statusMsgObj.value = retObj.statusMsg;
    if (!blockSeparationObj) blockSeparationObj = {};
    blockSeparationObj.value = retObj.blockSeparation;

    if (errOutput.search(/jpeg image of size \d+/) > -1) {
      statusFlagsObj.value |= nsIAnnealMail.PHOTO_AVAILABLE;
    }
    if (blockSeparationObj && blockSeparationObj.value.indexOf(" ") > 0) {
      exitCode = 2;
    }

    AnnealMailLog.CONSOLE(AnnealMailData.convertFromUnicode(errorMsgObj.value) + "\n");

    return exitCode;
  },

  /**
   * Execute a command and return the output from stdout
   * No input and no statusFlags are returned.
   */
  simpleExecCmd: function(command, args, exitCodeObj, errorMsgObj) {
    AnnealMailLog.WRITE("execution.jsm: AnnealMailExecution.simpleExecCmd: command = " + command + " " + args.join(" ") + "\n");

    var outputData = "";
    var errOutput = "";

    AnnealMailLog.CONSOLE("annealmail> " + AnnealMailFiles.formatCmdLine(command, args) + "\n");

    try {
      subprocess.call({
        command: command,
        arguments: args,
        charset: null,
        environment: AnnealMailCore.getEnvList(),
        done: function(result) {
          exitCodeObj.value = result.exitCode;
          outputData = result.stdout;
          errOutput = result.stderr;
        },
        mergeStderr: false
      }).wait();
    }
    catch (ex) {
      AnnealMailLog.ERROR("execution.jsm: AnnealMailExecution.simpleExecCmd: " + command.path + " failed\n");
      AnnealMailLog.DEBUG("  annealmail> DONE with FAILURE\n");
      exitCodeObj.value = -1;
    }
    AnnealMailLog.DEBUG("  annealmail> DONE\n");

    if (errOutput) {
      errorMsgObj.value = errOutput;
    }

    AnnealMailLog.DEBUG("execution.jsm: AnnealMailExecution.simpleExecCmd: exitCode = " + exitCodeObj.value + "\n");
    AnnealMailLog.DEBUG("execution.jsm: AnnealMailExecution.simpleExecCmd: errOutput = " + errOutput + "\n");

    return outputData;
  },

  /**
   * Execute a command and return the output from stdout.
   * Accepts input and returns error message and statusFlags.
   */
  execCmd: function(command, args, input, exitCodeObj, statusFlagsObj, statusMsgObj,
    errorMsgObj, retStatusObj) {
    AnnealMailLog.WRITE("execution.jsm: AnnealMailExecution.execCmd: subprocess = '" + command.path + "'\n");

    if ((typeof input) != "string") input = "";

    var preInput = "";
    var outputData = "";
    var errOutput = "";
    AnnealMailLog.CONSOLE("annealmail> " + AnnealMailFiles.formatCmdLine(command, args) + "\n");
    var procBuilder = new AnnealMailExecution.processBuilder();
    procBuilder.setCommand(command);
    procBuilder.setArguments(args);
    procBuilder.setEnvironment(AnnealMailCore.getEnvList());
    procBuilder.setStdin(
      function(pipe) {
        if (input.length > 0 || preInput.length > 0) {
          pipe.write(preInput + input);
        }
        pipe.close();
      }
    );
    procBuilder.setDone(
      function(result) {
        if (result.stdout) outputData = result.stdout;
        if (result.stderr) errOutput = result.stderr;
        exitCodeObj.value = result.exitCode;
      }
    );

    var proc = procBuilder.build();
    try {
      subprocess.call(proc).wait();
    }
    catch (ex) {
      AnnealMailLog.ERROR("execution.jsm: AnnealMailExecution.execCmd: subprocess.call failed with '" + ex.toString() + "'\n");
      AnnealMailLog.DEBUG("  annealmail> DONE with FAILURE\n");
      exitCodeObj.value = -1;
    }
    AnnealMailLog.DEBUG("  annealmail> DONE\n");

    if (proc.resultData) outputData = proc.resultData;
    if (proc.errorData) errOutput = proc.errorData;

    AnnealMailLog.DEBUG("execution.jsm: AnnealMailExecution.execCmd: exitCode = " + exitCodeObj.value + "\n");
    AnnealMailLog.DEBUG("execution.jsm: AnnealMailExecution.execCmd: errOutput = " + errOutput + "\n");


    if (!retStatusObj) {
      retStatusObj = {};
    }

    errorMsgObj.value = AnnealMailErrorHandling.parseErrorOutput(errOutput, retStatusObj);

    statusFlagsObj.value = retStatusObj.statusFlags;
    statusMsgObj.value = retStatusObj.statusMsg;
    var blockSeparation = retStatusObj.blockSeparation;

    exitCodeObj.value = AnnealMailExecution.fixExitCode(exitCodeObj.value, statusFlagsObj);

    if (blockSeparation.indexOf(" ") > 0) {
      exitCodeObj.value = 2;
    }

    AnnealMailLog.CONSOLE(errorMsgObj.value + "\n");

    return outputData;
  },

  /**
   * Fix the exit code of GnuPG (which may be wrong in some circumstances)
   *
   * @exitCode:       Number - the exitCode obtained from GnuPG
   * @statusFlagsObj: Object - the statusFlagsObj as received from parseErrorOutput()
   *
   * @return: Number - fixed exit code
   */
  fixExitCode: function(exitCode, statusFlagsObj) {
    AnnealMailLog.DEBUG("execution.jsm: AnnealMailExecution.fixExitCode: agentType: " + AnnealMailExecution.agentType + " exitCode: " + exitCode + " statusFlags " + statusFlagsObj.statusFlags + "\n");

    let statusFlags = statusFlagsObj.statusFlags;

    if (exitCode !== 0) {
      if ((statusFlags & (nsIAnnealMail.BAD_PASSPHRASE | nsIAnnealMail.UNVERIFIED_SIGNATURE)) &&
        (statusFlags & nsIAnnealMail.DECRYPTION_OKAY)) {
        AnnealMailLog.DEBUG("annealmailCommon.jsm: AnnealMail.fixExitCode: Changing exitCode for decrypted msg " + exitCode + "->0\n");
        exitCode = 0;
      }
      if ((AnnealMailExecution.agentType === "ccr") && (exitCode == 256) && (AnnealMailOS.getOS() == "WINNT")) {
        AnnealMailLog.WARNING("annealmailCommon.jsm: AnnealMail.fixExitCode: Using ccr and exit code is 256. You seem to use cygwin, activating countermeasures.\n");
        if (statusFlags & (nsIAnnealMail.BAD_PASSPHRASE | nsIAnnealMail.UNVERIFIED_SIGNATURE)) {
          AnnealMailLog.WARNING("annealmailCommon.jsm: AnnealMail.fixExitCode: Changing exitCode 256->2\n");
          exitCode = 2;
        }
        else {
          AnnealMailLog.WARNING("annealmailCommon.jsm: AnnealMail.fixExitCode: Changing exitCode 256->0\n");
          exitCode = 0;
        }
      }
    }
    else {
      if (statusFlags & (nsIAnnealMail.INVALID_RECIPIENT | nsIAnnealMail.DECRYPTION_FAILED | nsIAnnealMail.BAD_ARMOR |
          nsIAnnealMail.MISSING_PASSPHRASE | nsIAnnealMail.BAD_PASSPHRASE)) {
        exitCode = 1;
      }
      else if (typeof(statusFlagsObj.extendedStatus) === "string" && statusFlagsObj.extendedStatus.search(/\bdisp:/) >= 0) {
        exitCode = 1;
      }
    }

    return exitCode;
  },

  processBuilder: function() {
    this.process = {};
    this.setCommand = function(command) {
      this.process.command = command;
    };
    this.setArguments = function(args) {
      this.process.arguments = args;
    };
    this.setEnvironment = function(envList) {
      this.process.environment = envList;
    };
    this.setStdin = function(stdin) {
      this.process.stdin = stdin;
    };
    this.setStdout = function(stdout) {
      this.process.stdout = stdout;
    };
    this.setDone = function(done) {
      this.process.done = done;
    };
    this.build = function() {
      this.process.charset = null;
      this.process.mergeStderr = false;
      this.process.resultData = "";
      this.process.errorData = "";
      this.process.exitCode = -1;
      return this.process;
    };
    return this;
  },

  execCmd2: function(command, args, stdinFunc, stdoutFunc, doneFunc) {
    var procBuilder = new AnnealMailExecution.processBuilder();
    procBuilder.setCommand(command);
    procBuilder.setArguments(args);
    procBuilder.setEnvironment(AnnealMailCore.getEnvList());
    procBuilder.setStdin(stdinFunc);
    procBuilder.setStdout(stdoutFunc);
    procBuilder.setDone(doneFunc);
    var proc = procBuilder.build();
    subprocess.call(proc).wait();
  },


  /**
   * simple listener for using with execStart
   *
   * stdinFunc: optional function to write to stdin
   * doneFunc : optional function that is called when the process is terminated
   */
  newSimpleListener: function(stdinFunc, doneFunc) {
    let simpleListener = {
      stdoutData: "",
      stderrData: "",
      exitCode: -1,
      stdin: function(pipe) {
        if (stdinFunc) {
          stdinFunc(pipe);
        }
        else {
          pipe.close();
        }
      },
      stdout: function(data) {
        simpleListener.stdoutData += data;
      },
      stderr: function(data) {
        simpleListener.stderrData += data;
      },
      done: function(exitCode) {
        simpleListener.exitCode = exitCode;
        if (doneFunc) {
          doneFunc(exitCode);
        }
      }
    };

    return simpleListener;
  }
};
