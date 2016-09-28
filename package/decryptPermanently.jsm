/*global Components: false, btoa: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailDecryptPermanently"];

const Cu = Components.utils;

Cu.import("resource://gre/modules/AddonManager.jsm"); /*global AddonManager: false */
Cu.import("resource://gre/modules/XPCOMUtils.jsm"); /*global XPCOMUtils: false */
Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/armor.jsm"); /*global AnnealMailArmor: false */
Cu.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Cu.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Cu.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Cu.import("resource://annealmail/glodaUtils.jsm"); /*global GlodaUtils: false */
Cu.import("resource://annealmail/promise.jsm"); /*global Promise: false */
Cu.import("resource:///modules/MailUtils.js"); /*global MailUtils: false */
Cu.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Cu.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Cu.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Cu.import("resource://annealmail/streams.jsm"); /*global AnnealMailStreams: false */
Cu.import("resource://annealmail/passwords.jsm"); /*global AnnealMailPassword: false */
Cu.import("resource://annealmail/mime.jsm"); /*global AnnealMailMime: false */
Cu.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */
Cu.import("resource://annealmail/attachment.jsm"); /*global AnnealMailAttachment: false */

/*global MimeBody: false, MimeUnknown: false, MimeMessageAttachment: false */
/*global msgHdrToMimeMessage: false, MimeMessage: false, MimeContainer: false */
Cu.import("resource://annealmail/glodaMime.jsm");

var EC = AnnealMailCore;

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

const STATUS_OK = 0;
const STATUS_FAILURE = 1;
const STATUS_NOT_REQUIRED = 2;

const IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";

/*
 *  Decrypt a message and copy it to a folder
 *
 * @param nsIMsgDBHdr hdr   Header of the message
 * @param String destFolder   Folder URI
 * @param Boolean move      If true the original message will be deleted
 *
 * @return a Promise that we do that
 */
const AnnealMailDecryptPermanently = {

  /***
   *  dispatchMessages
   *
   *  Because Thunderbird throws all messages at once at us thus we have to rate limit the dispatching
   *  of the message processing. Because there is only a negligible performance gain when dispatching
   *  several message at once we serialize to not overwhelm low power devices.
   *
   *  The function is implemented such that the 1st call (requireSync == true) is a synchronous function,
   *  while any other call is asynchronous. This is required to make the filters work correctly in case
   *  there are other filters that work on the message. (see bug 374).
   *
   *  Parameters
   *   aMsgHdrs:     Array of nsIMsgDBHdr
   *   targetFolder: String; target folder URI
   *   move:         Boolean: type of action; true = "move" / false = "copy"
   *   requireSync:  Boolean: true = require  function to behave synchronously
   *                          false = async function (no useful return value)
   *
   **/

  dispatchMessages: function(aMsgHdrs, targetFolder, move, requireSync) {
    var inspector = Cc["@mozilla.org/jsinspector;1"].getService(Ci.nsIJSInspector);

    var promise = AnnealMailDecryptPermanently.decryptMessage(aMsgHdrs[0], targetFolder, move);
    var done = false;

    var processNext = function(data) {
      aMsgHdrs.splice(0, 1);
      if (aMsgHdrs.length > 0) {
        AnnealMailDecryptPermanently.dispatchMessages(aMsgHdrs, targetFolder, move, false);
      }
      else {
        // last message was finished processing
        done = true;
        inspector.exitNestedEventLoop();
      }
    };

    promise.then(processNext);

    promise.catch(function(err) {
      processNext(null);
    });

    if (requireSync && !done) {
      // wait here until all messages processed, such that the function returns
      // synchronously
      inspector.enterNestedEventLoop({
        value: 0
      });
    }
  },

  decryptMessage: function(hdr, destFolder, move) {
    return new Promise(
      function(resolve, reject) {
        let msgUriSpec = hdr.folder.getUriForMsg(hdr);

        const msgSvc = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger).
        messageServiceFromURI(msgUriSpec);

        const decrypt = new DecryptMessageIntoFolder(destFolder, move, resolve);

        try {
          msgHdrToMimeMessage(hdr, decrypt, decrypt.messageParseCallback, true, {
            examineEncryptedParts: false,
            partsOnDemand: false
          });
        }
        catch (ex) {
          reject("msgHdrToMimeMessage failed");
        }
        return;
      }
    );
  }
};

function DecryptMessageIntoFolder(destFolder, move, resolve) {
  this.destFolder = destFolder;
  this.move = move;
  this.resolve = resolve;

  this.foundPGP = 0;
  this.mime = null;
  this.hdr = null;
  this.decryptionTasks = [];
  this.subject = "";
}

DecryptMessageIntoFolder.prototype = {
  messageParseCallback: function(hdr, mime) {
    this.hdr = hdr;
    this.mime = mime;
    var self = this;

    try {
      if (!mime) {
        this.resolve(true);
        return;
      }

      if (!("content-type" in mime.headers)) {
        mime.headers["content-type"] = ["text/plain"];
      }

      var ct = getContentType(getHeaderValue(mime, 'content-type'));
      var pt = getProtocol(getHeaderValue(mime, 'content-type'));

      this.subject = GlodaUtils.deMime(getHeaderValue(mime, 'subject'));

      if (!ct) {
        this.resolve(true);
        return;
      }


      this.walkMimeTree(this.mime, this.mime);

      this.decryptINLINE(this.mime);
      if (this.foundPGP < 0) {
        // decryption failed
        this.resolve(true);
        return;
      }


      for (let i in this.mime.allAttachments) {
        let a = this.mime.allAttachments[i];
        let suffixIndexEnd = a.name.toLowerCase().lastIndexOf('.pgp');
        if (suffixIndexEnd < 0) {
          suffixIndexEnd = a.name.toLowerCase().lastIndexOf('.asc');
        }

        if (suffixIndexEnd > 0 &&
          a.contentType.search(/application\/pgp-signature/i) < 0) {

          // possible key attachment
          let p = self.decryptAttachment(a, a.name.substring(0, suffixIndexEnd));
          this.decryptionTasks.push(p);
        }
        else {
          let p = this.readAttachment(a);
          this.decryptionTasks.push(p);
        }
      }

      Promise.all(this.decryptionTasks).then(
        function(tasks) {
          self.allTasks = tasks;
          for (let a in tasks) {
            switch (tasks[a].status) {
              case STATUS_NOT_REQUIRED:
                tasks[a].name = tasks[a].origName;
                break;
              case STATUS_OK:
                ++self.foundPGP;
                break;
              case STATUS_FAILURE:
                // attachment did not decrypt successfully
                self.resolve(true);
                return;
              default:
                // no valid result?!
                tasks[a].name = tasks[a].origName;
            }
          }

          if (self.foundPGP === 0) {
            self.resolve(true);
            return;
          }

          var msg = self.mimeToString(self.mime, true);

          if (!msg || msg === "") {
            // no message data found
            self.resolve(true);
            return;
          }

          //XXX Do we wanna use the tmp for this?
          var tempFile = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile);
          tempFile.append("message.eml");
          tempFile.createUnique(0, 384); // == 0600, octal is deprecated

          // ensure that file gets deleted on exit, if something goes wrong ...
          var extAppLauncher = Cc["@mozilla.org/mime;1"].getService(Ci.nsPIExternalAppLauncher);

          var foStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
          foStream.init(tempFile, 2, 0x200, false); // open as "write only"
          foStream.write(msg, msg.length);
          foStream.close();

          extAppLauncher.deleteTemporaryFileOnExit(tempFile);

          //
          //  This was taken from the HeaderToolsLite Example Addon "original by Frank DiLecce"
          //
          // this is interesting: nsIMsgFolder.copyFileMessage seems to have a bug on Windows, when
          // the nsIFile has been already used by foStream (because of Windows lock system?), so we
          // must initialize another nsIFile object, pointing to the temporary file
          var fileSpec = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          fileSpec.initWithPath(tempFile.path);

          const copySvc = Cc["@mozilla.org/messenger/messagecopyservice;1"].getService(Ci.nsIMsgCopyService);

          var copyListener = {
            QueryInterface: function(iid) {
              if (iid.equals(Ci.nsIMsgCopyServiceListener) || iid.equals(Ci.nsISupports)) {
                return this;
              }
              AnnealMailLog.DEBUG("decryptPermanently.jsm: copyListener error\n");
              throw Components.results.NS_NOINTERFACE;
            },
            GetMessageId: function(messageId) {},
            OnProgress: function(progress, progressMax) {},
            OnStartCopy: function() {},
            SetMessageKey: function(key) {},
            OnStopCopy: function(statusCode) {
              if (statusCode !== 0) {
                //XXX complain?
                AnnealMailLog.DEBUG("decryptPermanently.jsm: Error copying message: " + statusCode + "\n");
                try {
                  tempFile.remove(false);
                }
                catch (ex) {
                  try {
                    fileSpec.remove(false);
                  }
                  catch (e2) {
                    AnnealMailLog.DEBUG("decryptPermanently.jsm: Could not delete temp file\n");
                  }
                }
                self.resolve(true);
                return;
              }
              AnnealMailLog.DEBUG("decryptPermanently.jsm: Copy complete\n");

              if (self.move) {
                AnnealMailLog.DEBUG("decryptPermanently.jsm: Delete original\n");
                var folderInfoObj = {};
                self.hdr.folder.getDBFolderInfoAndDB(folderInfoObj).DeleteMessage(self.hdr.messageKey, null, true);
              }

              try {
                tempFile.remove(false);
              }
              catch (ex) {
                try {
                  fileSpec.remove(false);
                }
                catch (e2) {
                  AnnealMailLog.DEBUG("decryptPermanently.jsm: Could not delete temp file\n");
                }
              }

              AnnealMailLog.DEBUG("decryptPermanently.jsm: Cave Johnson. We're done\n");
              self.resolve(true);
            }
          };

          copySvc.CopyFileMessage(fileSpec, MailUtils.getFolderForURI(self.destFolder, false), self.hdr,
            false, 0, null, copyListener, null);
        }
      ).catch(
        function catchErr(errorMsg) {
          AnnealMailLog.DEBUG("decryptPermanently.jsm: Promise.catchErr: " + errorMsg + "\n");
          self.resolve(false);
        }
      );

    }
    catch (ex) {
      AnnealMailLog.DEBUG("decryptPermanently.jsm: messageParseCallback: caught error " + ex.toString() + "\n");
      self.resolve(false);
    }
  },

  readAttachment: function(attachment, strippedName) {
    return new Promise(
      function(resolve, reject) {
        AnnealMailLog.DEBUG("decryptPermanently.jsm: readAttachment\n");
        let o;
        var f = function _cb(data) {
          AnnealMailLog.DEBUG("decryptPermanently.jsm: readAttachment - got data (" + data.length + ")\n");
          o = {
            type: "attachment",
            data: data,
            name: strippedName ? strippedName : attachment.name,
            partName: attachment.partName,
            origName: attachment.name,
            status: STATUS_NOT_REQUIRED
          };
          resolve(o);
        };

        try {
          var bufferListener = AnnealMailStreams.newStringStreamListener(f);
          var ioServ = Cc[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
          var msgUri = ioServ.newURI(attachment.url, null, null);

          var channel = ioServ.newChannelFromURI(msgUri);
          channel.asyncOpen(bufferListener, msgUri);
        }
        catch (ex) {
          reject(o);
        }
      }
    );
  },

  decryptAttachment: function(attachment, strippedName) {
    var self = this;

    return new Promise(
      function(resolve, reject) {
        AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptAttachment\n");
        self.readAttachment(attachment, strippedName).then(
          function(o) {
            var attachmentHead = o.data.substr(0, 30);
            if (attachmentHead.match(/\-\-\-\-\-BEGIN PGP \w+ KEY BLOCK\-\-\-\-\-/)) {
              // attachment appears to be a PGP key file, we just go-a-head
              resolve(o);
              return;
            }
            var annealmailSvc = AnnealMailCore.getService();
            var args = AnnealMailCcr.getStandardArgs(true);
            args = args.concat(AnnealMailPassword.command());
            args.push("-d");

            var statusMsgObj = {};
            var cmdLineObj = {};
            var exitCode = -1;
            var statusFlagsObj = {};
            var errorMsgObj = {};
            statusFlagsObj.value = 0;

            var listener = AnnealMailExecution.newSimpleListener(
              function _stdin(pipe) {

                // try to get original file name if file does not contain suffix
                if (strippedName.indexOf(".") < 0) {
                  let s = AnnealMailAttachment.getFileName(null, o.data);
                  if (s) o.name = s;
                }

                pipe.write(o.data);
                pipe.close();

              }
            );


            do {

              var proc = AnnealMailExecution.execStart(AnnealMailCcrAgent.agentPath, args, false, null, listener, statusFlagsObj);
              if (!proc) {
                resolve(o);
                return;
              }
              // Wait for child STDOUT to close
              proc.wait();
              AnnealMailExecution.execEnd(listener, statusFlagsObj, statusMsgObj, cmdLineObj, errorMsgObj);

              if ((listener.stdoutData && listener.stdoutData.length > 0) ||
                (statusFlagsObj.value & nsIAnnealMail.DECRYPTION_OKAY)) {
                AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptAttachment: decryption OK\n");
                exitCode = 0;
              }
              else if (statusFlagsObj.value & nsIAnnealMail.DECRYPTION_FAILED) {
                AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptAttachment: decryption failed\n");
                if (AnnealMailCcrAgent.useCcrAgent()) {
                  // since we cannot find out if the user wants to cancel
                  // we should ask
                  let msg = AnnealMailLocale.getString("converter.decryptAtt.failed", [attachment.name, self.subject]);

                  if (!AnnealMailDialog.confirmDlg(null, msg,
                      AnnealMailLocale.getString("dlg.button.retry"), AnnealMailLocale.getString("dlg.button.skip"))) {
                    o.status = STATUS_FAILURE;
                    resolve(o);
                    return;
                  }
                }

              }
              else if (statusFlagsObj.value & nsIAnnealMail.DECRYPTION_INCOMPLETE) {
                // failure; message not complete
                AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptAttachment: decryption incomplete\n");
                o.status = STATUS_FAILURE;
                resolve(o);
                return;
              }
              else {
                // there is nothing to be decrypted
                AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptAttachment: no decryption required\n");
                o.status = STATUS_NOT_REQUIRED;
                resolve(o);
                return;
              }

            } while (exitCode !== 0);


            AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptAttachment: decrypted to " + listener.stdoutData.length + " bytes\n");

            o.data = listener.stdoutData;
            o.status = STATUS_OK;

            resolve(o);
          }
        );
      }
    );
  },


  /*
   * The following functions walk the MIME message structure and decrypt if they find something to decrypt
   */

  // the sunny world of PGP/MIME

  walkMimeTree: function(mime, parent) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: walkMimeTree:\n");
    let ct = getContentType(getHeaderValue(mime, 'content-type'));

    AnnealMailLog.DEBUG("decryptPermanently.jsm: walkMimeTree: part=" + mime.partName + " - " + ct + "\n");

    // assign part name on lowest possible level -> that's where the attachment
    // really belongs to
    for (let i in mime.allAttachments) {
      mime.allAttachments[i].partName = mime.partName;
    }
    if (this.isPgpMime(mime) || this.isSMime(mime)) {
      let p = this.decryptPGPMIME(parent, mime.partName);
      this.decryptionTasks.push(p);
    }
    else if (this.isBrokenByExchange(mime)) {
      let p = this.decryptAttachment(mime.parts[0].parts[2], "decrypted.txt");
      mime.isBrokenByExchange = true;
      mime.parts[0].parts[2].name = "ignore.txt";
      this.decryptionTasks.push(p);
    }
    else if (typeof(mime.body) == "string") {
      AnnealMailLog.DEBUG("    body size: " + mime.body.length + "\n");
    }

    for (var i in mime.parts) {
      this.walkMimeTree(mime.parts[i], mime);
    }
  },

  /***
   *
   * Detect if mime part is PGP/MIME message that got modified by MS-Exchange:
   *
   * - multipart/mixed Container with
   *   - application/pgp-encrypted Attachment with name "PGPMIME Version Identification"
   *   - application/octet-stream Attachment with name "encrypted.asc" having the encrypted content in base64
   * - see:
   *   - http://www.mozilla-annealmail.org/forum/viewtopic.php?f=4&t=425
   *  - http://sourceforge.net/p/annealmail/forum/support/thread/4add2b69/
   */

  isBrokenByExchange: function(mime) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: isBrokenByExchange:\n");

    try {
      if (mime.parts && mime.parts.length && mime.parts.length == 1 &&
        mime.parts[0].parts && mime.parts[0].parts.length && mime.parts[0].parts.length == 3 &&
        mime.parts[0].headers["content-type"][0].indexOf("multipart/mixed") >= 0 &&
        mime.parts[0].parts[0].size === 0 &&
        mime.parts[0].parts[0].headers["content-type"][0].search(/multipart\/encrypted/i) < 0 &&
        mime.parts[0].parts[0].headers["content-type"][0].indexOf("text/plain") >= 0 &&
        mime.parts[0].parts[1].headers["content-type"][0].indexOf("application/pgp-encrypted") >= 0 &&
        mime.parts[0].parts[1].headers["content-type"][0].search(/multipart\/encrypted/i) < 0 &&
        mime.parts[0].parts[1].headers["content-type"][0].search(/PGPMIME Versions? Identification/i) >= 0 &&
        mime.parts[0].parts[2].headers["content-type"][0].indexOf("application/octet-stream") >= 0 &&
        mime.parts[0].parts[2].headers["content-type"][0].indexOf("encrypted.asc") >= 0) {

        AnnealMailLog.DEBUG("decryptPermanently.jsm: isBrokenByExchange: found message broken by MS-Exchange\n");
        return true;
      }
    }
    catch (ex) {}

    return false;
  },

  isPgpMime: function(mime) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: isPgpMime:\n");
    try {
      var ct = mime.contentType;
      if (!ct) return false;
      if (!('content-type' in mime.headers)) return false;

      var pt = getProtocol(getHeaderValue(mime, 'content-type'));
      if (!pt) return false;

      if (ct.toLowerCase() == "multipart/encrypted" && pt == "application/pgp-encrypted") {
        return true;
      }
    }
    catch (ex) {
      //AnnealMailLog.DEBUG("decryptPermanently.jsm: isPgpMime:"+ex+"\n");
    }
    return false;
  },

  // smime-type=enveloped-data
  isSMime: function(mime) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: isSMime:\n");
    try {
      var ct = mime.contentType;
      if (!ct) return false;
      if (!('content-type' in mime.headers)) return false;

      var pt = getSMimeProtocol(getHeaderValue(mime, 'content-type'));
      if (!pt) return false;

      if (ct.toLowerCase() == "application/pkcs7-mime" && pt == "enveloped-data") {
        return true;
      }
    }
    catch (ex) {
      AnnealMailLog.DEBUG("decryptPermanently.jsm: isSMime:" + ex + "\n");
    }
    return false;
  },

  decryptPGPMIME: function(mime, part) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptPGPMIME: part=" + part + "\n");

    var self = this;

    return new Promise(
      function(resolve, reject) {
        var m = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(Ci.nsIMimeHeaders);

        var messenger = Cc["@mozilla.org/messenger;1"].getService(Ci.nsIMessenger);
        let msgSvc = messenger.messageServiceFromURI(self.hdr.folder.getUriForMsg(self.hdr));
        let u = {};
        msgSvc.GetUrlForUri(self.hdr.folder.getUriForMsg(self.hdr), u, null);

        let op = (u.value.spec.indexOf("?") > 0 ? "&" : "?");
        let url = u.value.spec + op + 'part=' + part + "&header=annealmailConvert";

        AnnealMailLog.DEBUG("decryptPermanently.jsm: getting data from URL " + url + "\n");

        let s = AnnealMailStreams.newStringStreamListener(
          function analyzeDecryptedData(data) {
            AnnealMailLog.DEBUG("decryptPermanently.jsm: analyzeDecryptedData: got " + data.length + " bytes\n");

            if (AnnealMailLog.getLogLevel() > 5) {
              AnnealMailLog.DEBUG("*** start data ***\n'" + data + "'\n***end data***\n");
            }


            let subpart = mime.parts[0];

            let o = {
              type: "mime",
              name: "",
              origName: "",
              data: "",
              partName: part,
              status: STATUS_OK
            };

            if (data.length === 0) {
              // fail if no data found
              o.status = STATUS_FAILURE;
              resolve(o);
              return;
            }

            let bodyIndex = data.search(/\n\s*\r?\n/);
            if (bodyIndex < 0) {
              bodyIndex = 0;
            }
            else {
              ++bodyIndex;
            }

            if (data.substr(bodyIndex).search(/\r?\n$/) === 0) {
              o.status = STATUS_FAILURE;
              resolve(o);
              return;

            }
            m.initialize(data.substr(0, bodyIndex));
            let ct = m.extractHeader("content-type", false) || "";

            let boundary = getBoundary(getHeaderValue(mime, 'content-type'));
            if (!boundary) boundary = AnnealMailMime.createBoundary();

            // append relevant headers
            mime.headers['content-type'] = "multipart/mixed; boundary=\"" + boundary + "\"";

            o.data = "--" + boundary + "\n";
            o.data += "Content-Type: " + ct + "\n";

            let h = m.extractHeader("content-transfer-encoding", false);
            if (h) o.data += "content-transfer-encoding: " + h + "\n";

            h = m.extractHeader("content-description", true);
            if (h) o.data += "content-description: " + h + "\n";

            o.data += data.substr(bodyIndex);
            if (subpart) {
              subpart.body = undefined;
              subpart.headers['content-type'] = ct;
            }

            resolve(o);
          }
        );

        var ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
        try {
          var channel = ioServ.newChannel(url, null, null);
          channel.asyncOpen(s, null);
        }
        catch (e) {
          AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptPGPMIME: exception " + e + "\n");
        }
      }
    );
  },

  //inline wonderland
  decryptINLINE: function(mime) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: decryptINLINE:\n");
    if (typeof mime.body !== 'undefined') {
      let ct = getContentType(getHeaderValue(mime, 'content-type'));

      if (ct == "text/html") {
        mime.body = this.stripHTMLFromArmoredBlocks(mime.body);
      }


      var annealmailSvc = AnnealMailCore.getService();
      var exitCodeObj = {};
      var statusFlagsObj = {};
      var userIdObj = {};
      var sigDetailsObj = {};
      var errorMsgObj = {};
      var keyIdObj = {};
      var blockSeparationObj = {
        value: ""
      };
      var encToDetailsObj = {};
      var signatureObj = {};
      signatureObj.value = "";

      var uiFlags = nsIAnnealMail.UI_INTERACTIVE | nsIAnnealMail.UI_UNVERIFIED_ENC_OK;

      var plaintexts = [];
      var blocks = AnnealMailArmor.locateArmoredBlocks(mime.body);
      var tmp = [];

      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].blocktype == "MESSAGE") {
          tmp.push(blocks[i]);
        }
      }

      blocks = tmp;

      if (blocks.length < 1) {
        return 0;
      }

      let charset = "utf-8";

      for (let i = 0; i < blocks.length; i++) {
        let plaintext = null;
        do {
          let ciphertext = mime.body.substring(blocks[i].begin, blocks[i].end + 1);

          if (ciphertext.length === 0) {
            break;
          }

          let hdr = ciphertext.search(/(\r\r|\n\n|\r\n\r\n)/);
          if (hdr > 0) {
            let chset = ciphertext.substr(0, hdr).match(/^(charset:)(.*)$/mi);
            if (chset && chset.length == 3) {
              charset = chset[2].trim();
            }
          }

          plaintext = annealmailSvc.decryptMessage(null, uiFlags, ciphertext, signatureObj, exitCodeObj, statusFlagsObj,
            keyIdObj, userIdObj, sigDetailsObj, errorMsgObj, blockSeparationObj, encToDetailsObj);
          if (!plaintext || plaintext.length === 0) {
            if (statusFlagsObj.value & nsIAnnealMail.DISPLAY_MESSAGE) {
              AnnealMailDialog.alert(null, errorMsgObj.value);
              this.foundPGP = -1;
              return -1;
            }

            if (statusFlagsObj.value & nsIAnnealMail.DECRYPTION_FAILED) {

              if (AnnealMailCcrAgent.useCcrAgent()) {
                // since we cannot find out if the user wants to cancel
                // we should ask
                let msg = AnnealMailLocale.getString("converter.decryptBody.failed", this.subject);

                if (!AnnealMailDialog.confirmDlg(null, msg,
                    AnnealMailLocale.getString("dlg.button.retry"), AnnealMailLocale.getString("dlg.button.skip"))) {
                  this.foundPGP = -1;
                  return -1;
                }
              }
            }
            else if (statusFlagsObj.value & nsIAnnealMail.DECRYPTION_INCOMPLETE) {
              this.foundPGP = -1;
              return -1;
            }
          }

          if (ct == "text/html") {
            plaintext = plaintext.replace(/\n/ig, "<br/>\n");
          }

          if (plaintext) {
            plaintexts.push(plaintext);
          }
        } while (!plaintext || plaintext === "");
      }



      var decryptedMessage = mime.body.substring(0, blocks[0].begin) + plaintexts[0];
      for (let i = 1; i < blocks.length; i++) {
        decryptedMessage += mime.body.substring(blocks[i - 1].end + 1, blocks[i].begin + 1) + plaintexts[i];
      }

      decryptedMessage += mime.body.substring(blocks[(blocks.length - 1)].end + 1);

      // enable base64 encoding if non-ASCII character(s) found
      let j = decryptedMessage.search(/[^\x01-\x7F]/);
      if (j >= 0) {
        mime.headers['content-transfer-encoding'] = ['base64'];
        mime.body = AnnealMailData.encodeBase64(decryptedMessage);
      }
      else {
        mime.body = decryptedMessage;
        mime.headers['content-transfer-encoding'] = ['8bit'];
      }

      let origCharset = getCharset(getHeaderValue(mime, 'content-type'));
      if (origCharset) {
        mime.headers['content-type'] = getHeaderValue(mime, 'content-type').replace(origCharset, charset);
      }
      else {
        mime.headers['content-type'] = getHeaderValue(mime, 'content-type') + "; charset=" + charset;
      }

      this.foundPGP = 1;
      return 1;
    }



    if (typeof mime.parts !== 'undefined' && mime.parts.length > 0) {
      var ret = 0;
      for (let part in mime.parts) {
        ret += this.decryptINLINE(mime.parts[part]);
      }

      return ret;
    }

    let ct = getContentType(getHeaderValue(mime, 'content-type'));
    AnnealMailLog.DEBUG("decryptPermanently.jsm: Decryption skipped:  " + ct + "\n");

    return 0;
  },

  stripHTMLFromArmoredBlocks: function(text) {

    var index = 0;
    var begin = text.indexOf("-----BEGIN PGP");
    var end = text.indexOf("-----END PGP");

    while (begin > -1 && end > -1) {
      let sub = text.substring(begin, end);

      sub = sub.replace(/(<([^>]+)>)/ig, "");
      sub = sub.replace(/&[A-z]+;/ig, "");

      text = text.substring(0, begin) + sub + text.substring(end);

      index = end + 10;
      begin = text.indexOf("-----BEGIN PGP", index);
      end = text.indexOf("-----END PGP", index);
    }

    return text;
  },


  /******
   *
   *    We have the technology we can rebuild.
   *
   *    Function to reassemble the message from the MIME Tree
   *    into a String.
   *
   ******/

  mimeToString: function(mime, topLevel) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: mimeToString: part: '" + mime.partName + "', is of type '" + typeof(mime) + "'\n");

    let ct = getContentType(getHeaderValue(mime, 'content-type'));

    if (!ct) {
      return "";
    }

    let boundary = getBoundary(getHeaderValue(mime, 'content-type'));

    let msg = "";

    if (mime.isBrokenByExchange) {
      AnnealMailLog.DEBUG("decryptPermanently.jsm: mimeToString: MS-Exchange fix\n");
      for (let j in this.allTasks) {
        if (this.allTasks[j].partName == mime.parts[0].partName) {

          boundary = AnnealMailMime.createBoundary();

          msg += getRfc822Headers(mime.headers, ct, "content-type");
          msg += 'Content-Type: multipart/mixed; boundary="' + boundary + '"\r\n\r\n';

          msg += "This is a multi-part message in MIME format.";
          msg += "\r\n--" + boundary + "\r\n";
          msg += this.allTasks[j].data;
          msg += "\r\n--" + boundary + "--\r\n";

          return msg;
        }
      }
    }
    else if (mime instanceof MimeMessageAttachment) {
      for (let j in this.allTasks) {
        if (this.allTasks[j].partName == mime.partName &&
          this.allTasks[j].origName == mime.name) {

          let a = this.allTasks[j];
          AnnealMailLog.DEBUG("decryptPermanently.jsm: mimeToString: attaching " + j + " as '" + a.name + "'\n");

          for (let header in mime.headers) {
            if (!(a.status == STATUS_OK && header == "content-type")) {
              msg += prettyPrintHeader(header, mime.headers[header]) + "\r\n";
            }
          }

          if (a.type == "attachment") {
            if (a.status == STATUS_OK) {
              msg += "Content-Type: application/octet-stream; name=\"" + a.name + "\"\r\n";
              msg += "Content-Disposition: attachment; filename\"" + a.name + "\"\r\n";
            }

            msg += "Content-Transfer-Encoding: base64\r\n\r\n";
            msg += AnnealMailData.encodeBase64(a.data) + "\r\n";

          }
        }
      }
    }
    else if (mime instanceof MimeContainer || mime instanceof MimeUnknown) {
      for (let j in this.allTasks) {
        if (this.allTasks[j].partName == mime.partName &&
          this.allTasks[j].type == "mime") {
          let a = this.allTasks[j];
          msg += a.data;
          mime.noBottomBoundary = true;
        }
      }
    }
    else if (mime instanceof MimeMessage && ct.substr(0, 5) == "text/") {
      let subct = mime.parts[0].headers['content-type'];
      if (subct) {
        mime.headers['content-type'] = subct;
      }

      subct = mime.parts[0].headers['content-transfer-encoding'];
      if (subct) {
        mime.headers['content-transfer-encoding'] = subct;
      }

      msg += getRfc822Headers(mime.headers, ct);

      msg += "\r\n" + mime.parts[0].body + "\r\n";

      return msg;
    }
    else {
      if (!topLevel && (mime instanceof MimeMessage)) {
        let mimeName = mime.name;
        if (!mimeName || mimeName === "") {
          mimeName = getHeaderValue(mime, 'subject') + ".eml";
        }

        msg += 'Content-Type: message/rfc822; name="' + AnnealMailMime.encodeHeaderValue(mimeName) + '\r\n';
        msg += 'Content-Transfer-Encoding: 7bit\r\n';
        msg += 'Content-Disposition: attachment; filename="' + AnnealMailMime.encodeHeaderValue(mimeName) + '"\r\n\r\n';
      }

      msg += getRfc822Headers(mime.headers, ct);

      msg += "\r\n";

      if (mime.body) {
        msg += mime.body + "\r\n";
      }
      else if ((mime instanceof MimeMessage) && ct.substr(0, 5) != "text/") {
        msg += "This is a multi-part message in MIME format.\r\n";
      }
    }

    for (let i in mime.parts) {
      let subPart = this.mimeToString(mime.parts[i], false);
      if (subPart.length > 0) {
        if (boundary && !(mime instanceof MimeMessage)) {
          msg += "--" + boundary + "\r\n";
        }
        msg += subPart + "\r\n";
      }
    }

    if (ct.indexOf("multipart/") === 0 && !(mime instanceof MimeContainer)) {
      if (!mime.noBottomBoundary) {
        msg += "--" + boundary + "--\r\n";
      }
    }
    return msg;
  }
};

/**
 * Format a mime header
 *
 * e.g. content-type -> Content-Type
 */

function formatHeader(headerLabel) {
  return headerLabel.replace(/^.|(\-.)/g, function(match) {
    return match.toUpperCase();
  });
}

function formatMimeHeader(headerLabel, headerValue) {
  if (headerLabel.search(/^(sender|from|reply-to|to|cc|bcc)$/i) === 0) {
    return formatHeader(headerLabel) + ": " + AnnealMailMime.formatHeaderData(AnnealMailMime.formatEmailAddress(headerValue));
  }
  else {
    return formatHeader(headerLabel) + ": " + AnnealMailMime.formatHeaderData(AnnealMailMime.encodeHeaderValue(headerValue));
  }
}


function prettyPrintHeader(headerLabel, headerData) {
  let hdrData = "";
  if (Array.isArray(headerData)) {
    let h = [];
    for (let i in headerData) {
      h.push(formatMimeHeader(headerLabel, GlodaUtils.deMime(headerData[i])));
    }
    return h.join("\r\n");
  }
  else {
    return formatMimeHeader(headerLabel, GlodaUtils.deMime(String(headerData)));
  }
}

function getHeaderValue(mimeStruct, header) {
  AnnealMailLog.DEBUG("decryptPermanently.jsm: getHeaderValue: '" + header + "'\n");

  try {
    if (header in mimeStruct.headers) {
      if (typeof mimeStruct.headers[header] == "string") {
        return mimeStruct.headers[header];
      }
      else {
        return mimeStruct.headers[header].join(" ");
      }
    }
    else {
      return "";
    }
  }
  catch (ex) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: getHeaderValue: header not present\n");
    return "";
  }
}

/***
 * get the formatted headers for MimeMessage objects
 *
 * @headerArr:        Array of headers (key/value pairs), such as mime.headers
 * @ignoreHeadersArr: Array of headers to exclude from returning
 *
 * @return:   String containing formatted header list
 */
function getRfc822Headers(headerArr, contentType, ignoreHeadersArr) {
  let hdrs = "";

  let ignore = [];
  if (contentType.indexOf("multipart/") >= 0) {
    ignore = ['content-transfer-encoding',
      'content-disposition',
      'content-description'
    ];
  }

  if (ignoreHeadersArr) {
    ignore = ignore.concat(ignoreHeadersArr);
  }

  for (let i in headerArr) {
    if (ignore.indexOf(i) < 0) {
      hdrs += prettyPrintHeader(i, headerArr[i]) + "\r\n";
    }
  }

  return hdrs;
}

function getContentType(shdr) {
  try {
    shdr = String(shdr);
    return shdr.match(/([A-z-]+\/[A-z-]+)/)[1].toLowerCase();
  }
  catch (e) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: getContentType: " + e + "\n");
    return null;
  }
}

// return the content of the boundary parameter
function getBoundary(shdr) {
  try {
    shdr = String(shdr);
    return shdr.match(/boundary="?([A-z0-9'()+_,-.\/:=?]+)"?/i)[1];
  }
  catch (e) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: getBoundary: " + e + "\n");
    return null;
  }
}

function getCharset(shdr) {
  try {
    shdr = String(shdr);
    return shdr.match(/charset="?([A-z0-9'()+_,-.\/:=?]+)"?/)[1].toLowerCase();
  }
  catch (e) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: getCharset: " + e + "\n");
    return null;
  }
}

function getProtocol(shdr) {
  try {
    shdr = String(shdr);
    return shdr.match(/protocol="?([A-z0-9'()+_,-.\/:=?]+)"?/)[1].toLowerCase();
  }
  catch (e) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: getProtocol: " + e + "\n");
    return "";
  }
}

function getSMimeProtocol(shdr) {
  try {
    shdr = String(shdr);
    return shdr.match(/smime-type="?([A-z0-9'()+_,-.\/:=?]+)"?/)[1].toLowerCase();
  }
  catch (e) {
    AnnealMailLog.DEBUG("decryptPermanently.jsm: getSMimeProtocol: " + e + "\n");
    return "";
  }
}
