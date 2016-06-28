/*global Components: false, AnnealMailLog: false, AnnealMailLocale: false, AnnealMailData: false, AnnealMailCore: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailErrorHandling"];

const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://annealmail/log.jsm");
Cu.import("resource://annealmail/locale.jsm");
Cu.import("resource://annealmail/data.jsm");
Cu.import("resource://annealmail/core.jsm");
Cu.import("resource://annealmail/system.jsm"); /* global AnnealMailSystem: false */
Cu.import("resource://annealmail/lazy.jsm"); /* global AnnealMailLazy: false */
const getAnnealMailKeyRing = AnnealMailLazy.loader("annealmail/keyRing.jsm", "AnnealMailKeyRing");


const nsIAnnealMail = Ci.nsIAnnealMail;

const gStatusFlags = {
  GOODSIG: nsIAnnealMail.GOOD_SIGNATURE,
  BADSIG: nsIAnnealMail.BAD_SIGNATURE,
  ERRSIG: nsIAnnealMail.UNVERIFIED_SIGNATURE,
  EXPSIG: nsIAnnealMail.EXPIRED_SIGNATURE,
  REVKEYSIG: nsIAnnealMail.GOOD_SIGNATURE,
  EXPKEYSIG: nsIAnnealMail.EXPIRED_KEY_SIGNATURE,
  KEYEXPIRED: nsIAnnealMail.EXPIRED_KEY,
  KEYREVOKED: nsIAnnealMail.REVOKED_KEY,
  NO_PUBKEY: nsIAnnealMail.NO_PUBKEY,
  NO_SECKEY: nsIAnnealMail.NO_SECKEY,
  IMPORTED: nsIAnnealMail.IMPORTED_KEY,
  INV_RECP: nsIAnnealMail.INVALID_RECIPIENT,
  MISSING_PASSPHRASE: nsIAnnealMail.MISSING_PASSPHRASE,
  BAD_PASSPHRASE: nsIAnnealMail.BAD_PASSPHRASE,
  BADARMOR: nsIAnnealMail.BAD_ARMOR,
  NODATA: nsIAnnealMail.NODATA,
  ERROR: nsIAnnealMail.BAD_SIGNATURE | nsIAnnealMail.DECRYPTION_FAILED,
  DECRYPTION_FAILED: nsIAnnealMail.DECRYPTION_FAILED,
  DECRYPTION_OKAY: nsIAnnealMail.DECRYPTION_OKAY,
  TRUST_UNDEFINED: nsIAnnealMail.UNTRUSTED_IDENTITY,
  TRUST_NEVER: nsIAnnealMail.UNTRUSTED_IDENTITY,
  TRUST_MARGINAL: nsIAnnealMail.UNTRUSTED_IDENTITY,
  TRUST_FULLY: nsIAnnealMail.TRUSTED_IDENTITY,
  TRUST_ULTIMATE: nsIAnnealMail.TRUSTED_IDENTITY,
  CARDCTRL: nsIAnnealMail.CARDCTRL,
  SC_OP_FAILURE: nsIAnnealMail.SC_OP_FAILURE,
  UNKNOWN_ALGO: nsIAnnealMail.UNKNOWN_ALGO,
  SIG_CREATED: nsIAnnealMail.SIG_CREATED,
  END_ENCRYPTION: nsIAnnealMail.END_ENCRYPTION,
  INV_SGNR: 0x100000000,
  IMPORT_OK: 0x200000000,
  FAILURE: 0x400000000
};

// taken from libgpg-error: gpg-error.h
const GPG_SOURCE_SYSTEM = {
  GPG_ERR_SOURCE_UNKNOWN: 0,
  GPG_ERR_SOURCE_GCRYPT: 1,
  GPG_ERR_SOURCE_GPG: 2,
  GPG_ERR_SOURCE_GPGSM: 3,
  GPG_ERR_SOURCE_GPGAGENT: 4,
  GPG_ERR_SOURCE_PINENTRY: 5,
  GPG_ERR_SOURCE_SCD: 6,
  GPG_ERR_SOURCE_GPGME: 7,
  GPG_ERR_SOURCE_KEYBOX: 8,
  GPG_ERR_SOURCE_KSBA: 9,
  GPG_ERR_SOURCE_DIRMNGR: 10,
  GPG_ERR_SOURCE_GSTI: 11,
  GPG_ERR_SOURCE_GPA: 12,
  GPG_ERR_SOURCE_KLEO: 13,
  GPG_ERR_SOURCE_G13: 14,
  GPG_ERR_SOURCE_ASSUAN: 15,
  GPG_ERR_SOURCE_TLS: 17,
  GPG_ERR_SOURCE_ANY: 31
};

/**
 * Handling of specific error codes from GnuPG
 *
 * @param c           Object - the retStatusObj
 * @param errorNumber String - the error number as printed by GnuPG
 */
function handleErrorCode(c, errorNumber) {
  if (errorNumber && errorNumber.search(/^[0-9]+$/) === 0) {
    let errNum = Number(errorNumber);
    let sourceSystem = errNum >> 24;
    let errorCode = errNum & 0xFFFFFF;

    switch (errorCode) {
      case 11: // bad Passphrase
      case 87: // bad PIN
        badPassphrase(c);
        break;
      case 177: // no passphrase
      case 178: // no PIN
        missingPassphrase(c);
        break;
      case 99: // operation canceled
        if (sourceSystem === GPG_SOURCE_SYSTEM.GPG_ERR_SOURCE_PINENTRY) {
          missingPassphrase(c);
        }
        break;
      case 77: // no agent
      case 78: // agent error
      case 80: // assuan server fault
      case 81: // assuan error
        c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = AnnealMailLocale.getString("errorHandling.gpgAgentError") + "\n\n" + AnnealMailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case 85: // no pinentry
      case 86: // pinentry error
        c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = AnnealMailLocale.getString("errorHandling.pinentryError") + "\n\n" + AnnealMailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case 92: // no dirmngr
      case 93: // dirmngr error
        c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = AnnealMailLocale.getString("errorHandling.dirmngrError") + "\n\n" + AnnealMailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case 2:
      case 3:
      case 149:
      case 188:
        c.statusFlags |= Ci.nsIAnnealMail.UNKNOWN_ALGO;
        break;
      case 15:
        c.statusFlags |= Ci.nsIAnnealMail.BAD_ARMOR;
        break;
      case 58:
        c.statusFlags |= Ci.nsIAnnealMail.NODATA;
        break;
    }
  }
}

/**
 * Special treatment for some ERROR messages from GnuPG
 *
 * extendedStatus are preceeded by "disp:" if an error message is set in statusMsg
 *
 * isError is set to true if this is a hard error that makes further processing of
 * the status codes useless
 */
function handleError(c) {
  /*
    check_hijacking: ccr-agent was hijacked by some other process (like gnome-keyring)
    proc_pkt.plaintext: multiple plaintexts seen
    pkdecrypt_failed: public key decryption failed
    keyedit.passwd: error changing the passphrase
    card_key_generate: key generation failed (card)
    key_generate: key generation failed
    keyserver_send: keyserver send failed
    get_passphrase: ccr-agent cannot query the passphrase from pinentry (GnuPG 2.0.x)
  */

  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length > 0) {

    if (lineSplit.length >= 3) {
      // first check if the error code is a specifically treated hard failure
      handleErrorCode(c, lineSplit[2]);
      if (c.isError) return true;
    }

    switch (lineSplit[1]) {
      case "check_hijacking":
        c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:invalid_gpg_agent ";
        c.retStatusObj.statusMsg = AnnealMailLocale.getString("errorHandling.gpgAgentInvalid") + "\n\n" + AnnealMailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case "get_passphrase":
        c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
        c.retStatusObj.extendedStatus += "disp:get_passphrase ";
        c.retStatusObj.statusMsg = AnnealMailLocale.getString("errorHandling.pinentryError") + "\n\n" + AnnealMailLocale.getString("errorHandling.readFaq");
        c.isError = true;
        break;
      case "proc_pkt.plaintext":
        c.retStatusObj.extendedStatus += "multiple_plaintexts ";
        c.isError = true;
        break;
      case "pkdecrypt_failed":
        c.retStatusObj.extendedStatus += "pubkey_decrypt ";
        handleErrorCode(c, lineSplit[2]);
        break;
      case "keyedit.passwd":
        c.retStatusObj.extendedStatus += "passwd_change_failed ";
        break;
      case "card_key_generate":
      case "key_generate":
        c.retStatusObj.extendedStatus += "key_generate_failure ";
        break;
      case "keyserver_send":
        c.retStatusObj.extendedStatus += "keyserver_send_failed ";
        c.isError = true;
        break;
      default:
        return false;
    }
    return true;
  }
  else {
    return false;
  }
}

// handle GnuPG FAILURE message (GnuPG 2.1.10 and newer)
function failureMessage(c) {
  let lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length >= 3) {
    handleErrorCode(c, lineSplit[2]);
  }
}

function missingPassphrase(c) {
  c.statusFlags |= Ci.nsIAnnealMail.MISSING_PASSPHRASE;
  if (c.retStatusObj.statusMsg.indexOf(AnnealMailLocale.getString("missingPassphrase")) < 0) {
    c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
    c.flag = 0;
    AnnealMailLog.DEBUG("errorHandling.jsm: missingPassphrase: missing passphrase\n");
    c.retStatusObj.statusMsg += AnnealMailLocale.getString("missingPassphrase") + "\n";
  }
}

function badPassphrase(c) {
  c.statusFlags |= Ci.nsIAnnealMail.MISSING_PASSPHRASE;
  if (!(c.statusFlags & Ci.nsIAnnealMail.BAD_PASSPHRASE)) {
    c.statusFlags |= Ci.nsIAnnealMail.BAD_PASSPHRASE;
    c.flag = 0;
    AnnealMailLog.DEBUG("errorHandling.jsm: badPassphrase: bad passphrase\n");
    c.retStatusObj.statusMsg += AnnealMailLocale.getString("badPhrase") + "\n";
  }
}


function invalidSignature(c) {
  if (c.isError) return;
  var lineSplit = c.statusLine.split(/ +/);
  c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
  c.flag = 0;

  let keySpec = lineSplit[2];

  if (keySpec) {
    AnnealMailLog.DEBUG("errorHandling.jsm: invalidRecipient: detected invalid sender " + keySpec + " / code: " + lineSplit[1] + "\n");
    c.retStatusObj.errorMsg += AnnealMailErrorHandling.determineInvSignReason(keySpec);
  }
}

function invalidRecipient(c) {
  if (c.isError) return;
  var lineSplit = c.statusLine.split(/ +/);
  c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
  c.flag = 0;

  let keySpec = lineSplit[2];

  if (keySpec) {
    AnnealMailLog.DEBUG("errorHandling.jsm: invalidRecipient: detected invalid recipient " + keySpec + " / code: " + lineSplit[1] + "\n");
    c.retStatusObj.errorMsg += AnnealMailErrorHandling.determineInvRcptReason(keySpec);
  }
}

function importOk(c) {
  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length > 1) {
    AnnealMailLog.DEBUG("errorHandling.jsm: importOk: key imported: " + lineSplit[2] + "\n");
  }
  else {
    AnnealMailLog.DEBUG("errorHandling.jsm: importOk: key without FPR imported\n");
  }

  let importFlag = Number(lineSplit[1]);
  if (importFlag & (1 | 2 | 8)) {
    AnnealMailCore.getKeyRing().clearCache();
  }
}

function unverifiedSignature(c) {
  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit.length > 7 && lineSplit[7] == "4") {
    c.flag = Ci.nsIAnnealMail.UNKNOWN_ALGO;
  }
}

function noData(c) {
  // Recognize only "NODATA 1"
  if (c.statusLine.search(/NODATA 1\b/) < 0) {
    c.flag = 0;
  }
}

function decryptionFailed(c) {
  c.inDecryptionFailed = true;
}

function cardControl(c) {
  var lineSplit = c.statusLine.split(/ +/);
  if (lineSplit[1] == "3") {
    c.detectedCard = lineSplit[2];
  }
  else {
    c.errCode = Number(lineSplit[1]);
    if (c.errCode == 1) c.requestedCard = lineSplit[2];
  }
}

function setupFailureLookup() {
  var result = {};
  result[Ci.nsIAnnealMail.DECRYPTION_FAILED] = decryptionFailed;
  result[Ci.nsIAnnealMail.NODATA] = noData;
  result[Ci.nsIAnnealMail.CARDCTRL] = cardControl;
  result[Ci.nsIAnnealMail.UNVERIFIED_SIGNATURE] = unverifiedSignature;
  result[Ci.nsIAnnealMail.MISSING_PASSPHRASE] = missingPassphrase;
  result[Ci.nsIAnnealMail.BAD_PASSPHRASE] = badPassphrase;
  result[gStatusFlags.INV_RECP] = invalidRecipient;
  result[gStatusFlags.INV_SGNR] = invalidSignature;
  result[gStatusFlags.IMPORT_OK] = importOk;
  result[gStatusFlags.FAILURE] = failureMessage;
  return result;
}

function ignore() {}

const failureLookup = setupFailureLookup();

function handleFailure(c, errorFlag) {
  c.flag = gStatusFlags[errorFlag]; // yields known flag or undefined

  (failureLookup[c.flag] || ignore)(c);

  // if known flag, story it in our status
  if (c.flag) {
    c.statusFlags |= c.flag;
  }
}

function newContext(errOutput, retStatusObj) {
  retStatusObj.statusMsg = "";
  retStatusObj.errorMsg = "";
  retStatusObj.extendedStatus = "";
  retStatusObj.blockSeparation = "";

  return {
    errOutput: errOutput,
    retStatusObj: retStatusObj,
    errArray: [],
    statusArray: [],
    errCode: 0,
    detectedCard: null,
    requestedCard: null,
    errorMsg: "",
    statusPat: /^\[GNUPG:\] /,
    statusFlags: 0,
    plaintextCount: 0,
    withinCryptoMsg: false,
    cryptoStartPat: /^BEGIN_DECRYPTION/,
    cryptoEndPat: /^END_DECRYPTION/,
    plaintextPat: /^PLAINTEXT /,
    plaintextLengthPat: /^PLAINTEXT_LENGTH /
  };
}

function splitErrorOutput(errOutput) {
  var errLines = errOutput.split(/\r?\n/);

  // Discard last null string, if any
  if ((errLines.length > 1) && !errLines[errLines.length - 1]) {
    errLines.pop();
  }

  return errLines;
}

function parseErrorLine(errLine, c) {
  if (errLine.search(c.statusPat) === 0) {
    // status line
    c.statusLine = errLine.replace(c.statusPat, "");
    c.statusArray.push(c.statusLine);

    // extract first word as flag
    var matches = c.statusLine.match(/^((\w+)\b)/);

    if (matches && (matches.length > 1)) {
      let isError = (matches[1] == "ERROR");
      (isError ? handleError : handleFailure)(c, matches[1]);
    }
  }
  else {
    // non-status line (details of previous status command)
    c.errArray.push(errLine);
    // save details of DECRYPTION_FAILED message ass error message
    if (c.inDecryptionFailed) {
      c.errorMsg += errLine;
    }
  }
}

function detectForgedInsets(c) {
  // detect forged message insets
  for (var j = 0; j < c.statusArray.length; j++) {
    if (c.statusArray[j].search(c.cryptoStartPat) === 0) {
      c.withinCryptoMsg = true;
    }
    else if (c.withinCryptoMsg && c.statusArray[j].search(c.cryptoEndPat) === 0) {
      c.withinCryptoMsg = false;
    }
    else if (c.statusArray[j].search(c.plaintextPat) === 0) {
      ++c.plaintextCount;
      if ((c.statusArray.length > j + 1) && (c.statusArray[j + 1].search(c.plaintextLengthPat) === 0)) {
        var matches = c.statusArray[j + 1].match(/(\w+) (\d+)/);
        if (matches.length >= 3) {
          c.retStatusObj.blockSeparation += (c.withinCryptoMsg ? "1" : "0") + ":" + matches[2] + " ";
        }
      }
      else {
        // strange: we got PLAINTEXT XX, but not PLAINTEXT_LENGTH XX
        c.retStatusObj.blockSeparation += (c.withinCryptoMsg ? "1" : "0") + ":0 ";
      }
    }
  }
  if (c.plaintextCount > 1) {
    c.statusFlags |= (Ci.nsIAnnealMail.PARTIALLY_PGP | Ci.nsIAnnealMail.DECRYPTION_FAILED | Ci.nsIAnnealMail.BAD_SIGNATURE);
  }
}

function buildErrorMessageForCardCtrl(c, errCode, detectedCard) {
  var errorMsg = "";
  switch (errCode) {
    case 1:
      if (detectedCard) {
        errorMsg = AnnealMailLocale.getString("sc.wrongCardAvailable", [c.detectedCard, c.requestedCard]);
      }
      else {
        errorMsg = AnnealMailLocale.getString("sc.insertCard", [c.requestedCard]);
      }
      break;
    case 2:
      errorMsg = AnnealMailLocale.getString("sc.removeCard");
      break;
    case 4:
      errorMsg = AnnealMailLocale.getString("sc.noCardAvailable");
      break;
    case 5:
      errorMsg = AnnealMailLocale.getString("sc.noReaderAvailable");
      break;
  }
  return errorMsg;
}

function parseErrorOutputWith(c) {
  AnnealMailLog.DEBUG("errorHandling.jsm: parseErrorOutputWith: status message: \n" + c.errOutput + "\n");

  c.errLines = splitErrorOutput(c.errOutput);
  c.isError = false; // set to true if a hard error was found

  // parse all error lines
  c.inDecryptionFailed = false; // to save details of encryption failed messages
  for (var j = 0; j < c.errLines.length; j++) {
    var errLine = c.errLines[j];
    parseErrorLine(errLine, c);
    if (c.isError) break;
  }

  detectForgedInsets(c);

  c.retStatusObj.blockSeparation = c.retStatusObj.blockSeparation.replace(/ $/, "");
  c.retStatusObj.statusFlags = c.statusFlags;
  if (c.retStatusObj.statusMsg.length === 0) c.retStatusObj.statusMsg = c.statusArray.join("\n");
  if (c.errorMsg.length === 0) {
    c.errorMsg = c.errArray.map(function f(str, idx) {
      return AnnealMailSystem.convertNativeToUnicode(str);
    }, AnnealMailSystem).join("\n");
  }
  else {
    c.errorMsg = AnnealMailSystem.convertNativeToUnicode(c.errorMsg);
  }

  if ((c.statusFlags & Ci.nsIAnnealMail.CARDCTRL) && c.errCode > 0) {
    c.errorMsg = buildErrorMessageForCardCtrl(c, c.errCode, c.detectedCard);
    c.statusFlags |= Ci.nsIAnnealMail.DISPLAY_MESSAGE;
  }

  AnnealMailLog.DEBUG("errorHandling.jsm: parseErrorOutputWith: statusFlags = " + AnnealMailData.bytesToHex(AnnealMailData.pack(c.statusFlags, 4)) + "\n");
  AnnealMailLog.DEBUG("errorHandling.jsm: parseErrorOutputWith: return with c.errorMsg = " + c.errorMsg + "\n");
  return c.errorMsg;
}

var AnnealMailErrorHandling = {
  parseErrorOutput: function(errOutput, retStatusObj) {
    var context = newContext(errOutput, retStatusObj);
    return parseErrorOutputWith(context);
  },

  /**
   * Determin why a given key or userID cannot be used for signing
   *
   * @param keySpec String - key ID or user ID
   *
   * @return String - the reason(s) as message to display to the user
   *                  "" in case the key is valid
   */
  determineInvSignReason: function(keySpec) {
    AnnealMailLog.DEBUG("errorHandling.jsm: determineInvSignReason: keySpec: " + keySpec + "\n");

    let reasonMsg = "";

    if (keySpec.search(/^(0x)?[0-9A-F]+$/) === 0) {
      let key = getAnnealMailKeyRing().getKeyById(keySpec);
      if (!key) {
        reasonMsg = AnnealMailLocale.getString("keyError.keyIdNotFound", keySpec);
      }
      else {
        let r = key.getSigningValidity();
        if (!r.keyValid) reasonMsg = r.reason;
      }
    }
    else {
      let keys = getAnnealMailKeyRing().getKeysByUserId(keySpec);
      if (!keys || keys.length === 0) {
        reasonMsg = AnnealMailLocale.getString("keyError.keySpecNotFound", keySpec);
      }
      else {
        for (let i in keys) {
          let r = keys[i].getSigningValidity();
          if (!r.keyValid) reasonMsg += r.reason + "\n";
        }
      }
    }

    return reasonMsg;
  },

  /**
   * Determin why a given key or userID cannot be used for encryption
   *
   * @param keySpec String - key ID or user ID
   *
   * @return String - the reason(s) as message to display to the user
   *                  "" in case the key is valid
   */
  determineInvRcptReason: function(keySpec) {
    AnnealMailLog.DEBUG("errorHandling.jsm: determineInvRcptReason: keySpec: " + keySpec + "\n");

    let reasonMsg = "";

    if (keySpec.search(/^(0x)?[0-9A-F]+$/) === 0) {
      let key = getAnnealMailKeyRing().getKeyById(keySpec);
      if (!key) {
        reasonMsg = AnnealMailLocale.getString("keyError.keyIdNotFound", keySpec);
      }
      else {
        let r = key.getEncryptionValidity();
        if (!r.keyValid) reasonMsg = r.reason;
      }
    }
    else {
      let keys = getAnnealMailKeyRing().getKeysByUserId(keySpec);
      if (!keys || keys.length === 0) {
        reasonMsg = AnnealMailLocale.getString("keyError.keySpecNotFound", keySpec);
      }
      else {
        for (let i in keys) {
          let r = keys[i].getEncryptionValidity();
          if (!r.keyValid) reasonMsg += r.reason + "\n";
        }
      }
    }

    return reasonMsg;
  }
};
