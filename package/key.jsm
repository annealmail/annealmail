/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailKey"];

const Cu = Components.utils;

const KEY_BLOCK_UNKNOWN = 0;
const KEY_BLOCK_KEY = 1;
const KEY_BLOCK_REVOCATION = 2;

Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/armor.jsm"); /*global AnnealMailArmor: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/lazy.jsm"); /*global AnnealMailLazy: false */
const getKeyRing = AnnealMailLazy.loader("annealmail/keyRing.jsm", "AnnealMailKeyRing");
const getDialog = AnnealMailLazy.loader("annealmail/dialog.jsm", "AnnealMailDialog");


function KeyEntry(key) {
  if (!(this instanceof KeyEntry)) {
    return new KeyEntry(key);
  }
  // same data as in packetlist but in structured form
  this.primaryKey = null;
  this.revocationSignature = null;
  this.directSignatures = null;
  this.users = null;
  this.subKeys = null;
  this.packetlist2structure(this.parsePackets(key));
  if (!this.primaryKey || !this.users) {
    throw new Error('Invalid key: need at least key and user ID packet');
  }
  return this;
}

KeyEntry.prototype = {
  parsePackets: function(key) {
    const packetHeaders = [":public key packet:",
      ":user ID packet:",
      ":public sub key packet:",
      ":secret sub key packet:",
      ":signature packet:",
      ":secret key packet:"
    ];
    var _packets = [];

    function extractPackets(line) {
      var is_packet_hr = false;
      packetHeaders.forEach(
        function(packet) {
          if (line.search(packet) > -1) {
            is_packet_hr = true;
            var obj = {
              tag: packet,
              value: ""
            };
            _packets.push(obj);
          }
        });
      if (!is_packet_hr) {
        var obj = _packets.pop();
        obj.value += line + "\n";
        _packets.push(obj);
      }
    }
    var lines = key.split("\n");
    for (var i in lines) {
      if (!lines[i].startsWith("ccr:")) extractPackets(lines[i]);
    }
    return _packets;
  },

  packetlist2structure: function(packetlist) {
    for (var i = 0; i < packetlist.length; i++) {
      var user, subKey;

      switch (packetlist[i].tag) {
        case ":secret key packet:":
          this.primaryKey = packetlist[i];
          break;
        case ":user ID packet:":
          if (!this.users) this.users = [];
          user = packetlist[i];
          this.users.push(user);
          break;
        case ":public sub key packet:":
        case ":secret sub key packet:":
          user = null;
          if (!this.subKeys) this.subKeys = [];
          subKey = packetlist[i];
          this.subKeys.push(subKey);
          break;
        case ":signature packet:":
          break;
      }
    }
  }
};

var AnnealMailKey = {
  Entry: KeyEntry,

  /**
   * Format a key fingerprint
   * @fingerprint |string|  -  unformated OpenPGP fingerprint
   *
   * @return |string| - formatted string
   */
  formatFpr: function(fingerprint) {
    //AnnealMailLog.DEBUG("key.jsm: AnnealMailKey.formatFpr(" + fingerprint + ")\n");
    // format key fingerprint
    let r = "";
    const fpr = fingerprint.match(/(....)(....)(....)(....)(....)(....)(....)(....)(....)?(....)?/);
    if (fpr && fpr.length > 2) {
      fpr.shift();
      r = fpr.join(" ");
    }

    return r;
  },

  // Extract public key from Status Message
  extractPubkey: function(statusMsg) {
    const matchb = statusMsg.match(/(^|\n)NO_PUBKEY (\w{8})(\w{8})/);
    if (matchb && (matchb.length > 3)) {
      AnnealMailLog.DEBUG("annealmailCommon.jsm:: AnnealMail.extractPubkey: NO_PUBKEY 0x" + matchb[3] + "\n");
      return matchb[2] + matchb[3];
    }
    else {
      return null;
    }
  },

  /**
   * import a revocation certificate form a given keyblock string.
   * Ask the user before importing the cert, and display an error
   * message in case of failures.
   */
  importRevocationCert: function(keyBlockStr, packetStr) {
    let keyId;
    let m = packetStr.match(/(:signature packet: algo [0-9]+, keyid )([0-9A-Z]+)/i);
    if (m && m.length > 2) {
      keyId = m[2];

      let key = getKeyRing().getKeyById(keyId);

      if (key) {
        if (key.keyTrust==="r") {
          // Key has already been revoked
          getDialog().alert(null, AnnealMailLocale.getString("revokeKeyAlreadyRevoked", keyId.substr(-8, 8)));
        }
        else {

          let userId = key.userId + " - 0x" + key.keyId.substr(-8, 8);
          if (!getDialog().confirmDlg(null,
              AnnealMailLocale.getString("revokeKeyQuestion", userId),
              AnnealMailLocale.getString("keyMan.button.revokeKey"))) {
            return;
          }

          let errorMsgObj = {};
          if (getKeyRing().importKey(null, false, keyBlockStr, keyId, errorMsgObj) > 0) {
            getDialog().alert(null, errorMsgObj.value);
          }
        }
      }
      else {
        // Suitable key for revocation certificate is not present in keyring
        getDialog().alert(null, AnnealMailLocale.getString("revokeKeyNotPresent", keyId.substr(-8, 8)));
      }
    }
  },


  /**
   * determine the type of the contents in a given string
   * @param keyBlockStr: String - input string
   *
   * @return: Object:
   *    - keyType - Number:
   *       0 - no key data
   *       1 - public and/or secret key(s)
   *       2 - revocation certificate
   *    - packetStr - String: the packet list as received from GnuPG
   */
  getKeyFileType: function(keyBlockStr) {
    let args = AnnealMailCcr.getStandardArgs(true).concat("--list-packets");
    const exitCodeObj = {};
    const statusMsgObj = {};
    const errorMsgObj = {};

    let packetStr = AnnealMailExecution.execCmd(AnnealMailCcr.agentPath, args, keyBlockStr, exitCodeObj, {}, statusMsgObj, errorMsgObj);

    if (packetStr.search(/^:(public|secret) key packet:/m) >= 0) {
      return {
        keyType: KEY_BLOCK_KEY,
        packetStr: packetStr
      };
    }

    // simple detection of revocation certificate
    // TODO: improve algorithm
    let i = packetStr.search(/^:signature packet:/m);
    if (i >= 0) {
      if (packetStr.search(/sigclass 0x20/) > i)
        return {
          keyType: KEY_BLOCK_REVOCATION,
          packetStr: packetStr
        };
    }

    return {
      keyType: KEY_BLOCK_UNKNOWN,
      packetStr: packetStr
    };
  },

  /**
   * Get details (key ID, UID) of the data contained in a OpenPGP key block
   *
   * @param keyBlockStr  String: the contents of one or more public keys
   * @param errorMsgObj  Object: obj.value will contain an error message in case of failures
   *
   * @return Array of objects with the following structure:
   *          - id (key ID)
   *          - name (the UID of the key)
   *          - state (one of "old" [existing key], "new" [new key], "invalid" [key could not be imported])
   */
  getKeyListFromKeyBlock: function(keyBlockStr, errorMsgObj) {
    var ret = [];

    let keyTypeObj = this.getKeyFileType(keyBlockStr);

    if (keyTypeObj.keyType === KEY_BLOCK_UNKNOWN) {
      errorMsgObj.value = AnnealMailLocale.getString("notFirstBlock");
      return ret;
    }

    if (keyTypeObj.keyType === KEY_BLOCK_REVOCATION) {
      this.importRevocationCert(keyBlockStr, keyTypeObj.packetStr);
      errorMsgObj.value = "";
      return ret;
    }

    const tempDir = AnnealMailFiles.createTempSubDir("annealmail_import");
    const tempPath = AnnealMailFiles.getFilePath(tempDir);
    const args = AnnealMailCcr.getStandardArgs(true).concat([
      "--import",
      "--trustdb", tempPath + "/trustdb",
      "--no-default-keyring", "--keyring", tempPath + "/keyring"
    ]);

    const exitCodeObj = {};
    const statusMsgObj = {};

    AnnealMailExecution.execCmd(AnnealMailCcr.agentPath, args, keyBlockStr, exitCodeObj, {}, statusMsgObj, errorMsgObj);

    const statusMsg = statusMsgObj.value;

    tempDir.remove(true);

    var state = "newOrResult";
    var lines = statusMsg.split("\n");
    var idx = 0;
    var cur = {};
    var keyexpired;

    while (state != "end") {
      if (idx >= lines.length) {
        errorMsgObj.value = AnnealMailLocale.getString("cantImport");
        return [];
      }

      // Ignore all lines starting with "KEYEXPIRED"
      keyexpired = lines[idx].match(/^KEYEXPIRED/);

      while (keyexpired && (keyexpired.length > 0) && (idx < (lines.length - 1))) {
        AnnealMailLog.DEBUG("Ignoring KEYEXPIRED line: '" + lines[idx] + "'\n");
        idx += 1;
        keyexpired = lines[idx].match(/^KEYEXPIRED/);
      }

      AnnealMailLog.DEBUG("state: '" + state + "', line: '" + lines[idx] + "'\n");

      switch (state) {
        case "newOrResult":
          {
            const imported = lines[idx].match(/^IMPORTED (\w+) (.+)/);
            if (imported && (imported.length > 2)) {
              AnnealMailLog.DEBUG("new imported: " + imported[1] + " (" + imported[2] + ")\n");
              state = "summary";
              cur.id = imported[1];
              cur.name = imported[2];
              cur.state = "new";
              idx += 1;
              break;
            }

            const import_res = lines[idx].match(/^IMPORT_RES ([0-9 ]+)/);
            if (import_res && (import_res.length > 1)) {
              AnnealMailLog.DEBUG("import result: " + import_res[1] + "\n");
              state = "end";
            }
            else {
              state = "summary";
            }

            break;
          }

        case "summary":
          {
            const import_ok = lines[idx].match(/^IMPORT_OK (\d+) (\w+)/);
            if (import_ok && (import_ok.length > 2)) {
              AnnealMailLog.DEBUG("import ok: " + import_ok[1] + " (" + import_ok[2] + ")\n");

              state = "newOrResult";
              if (!(import_ok[1] === "16" || import_ok[1] === "0")) { // skip unchanged and private keys
                cur.fingerprint = import_ok[2];

                if (cur.state === undefined) {
                  cur.state = "old";
                }

                ret.push(cur);
                cur = {};
              }
              idx += 1;
              break;
            }

            const import_err = lines[idx].match(/^IMPORT_PROBLEM (\d+) (\w+)/);
            if (import_err && (import_err.length > 2)) {
              AnnealMailLog.DEBUG("import err: " + import_err[1] + " (" + import_err[2] + ")\n");
              state = "newOrResult";
              cur.fingerprint = import_err[2];

              if (cur.state === undefined) {
                cur.state = "invalid";
              }

              ret.push(cur);
              cur = {};
              idx += 1;
              break;
            }

            errorMsgObj.value = AnnealMailLocale.getString("cantImport");
            return [];
          }

        default:
          {
            AnnealMailLog.DEBUG("skip line '" + lines[idx] + "'\n");
            idx += 1;
            break;
          }
      }
    }
    errorMsgObj.value = "";

    return ret;
  },

  /**
   * Get details of a key block to import. Works identically as getKeyListFromKeyBlock();
   * except that the input is a file instead of a string
   *
   * @param file         nsIFile object - file to read
   * @param errorMsgObj  Object - obj.value will contain error message
   *
   * @return Array (same as for getKeyListFromKeyBlock())
   */
  getKeyListFromKeyFile: function(path, errorMsgObj) {
    var contents = AnnealMailFiles.readFile(path);
    return this.getKeyListFromKeyBlock(contents, errorMsgObj);
  }

};
