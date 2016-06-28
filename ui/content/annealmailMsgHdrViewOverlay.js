/*global Components: false, AnnealMailWindows: false, AnnealMailLocale: false, AnnealMailPrefs: false, AnnealMailTime: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

/* globals from Thunderbird: */
/* global gFolderDisplay: false, currentAttachments: false, gSMIMEContainer: false, gSignedUINode: false, gEncryptedUINode: false */
/* global gDBView: false, msgWindow: false, messageHeaderSink: false: gMessageListeners: false, findEmailNodeFromPopupNode: true */
/* global gExpandedHeaderView: false, gMessageListeners: false, onShowAttachmentItemContextMenu: false, onShowAttachmentContextMenu: false */
/* global attachmentList: false, MailOfflineMgr: false, currentHeaderData: false, ContentTypeIsSMIME: false */

Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/funcs.jsm"); /*global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/mimeVerify.jsm"); /*global AnnealMailVerify: false */
Components.utils.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Components.utils.import("resource://annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */
Components.utils.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */
Components.utils.import("resource://annealmail/dialog.jsm"); /*global AnnealMailDialog: false */
Components.utils.import("resource://annealmail/time.jsm"); /*global AnnealMailTime: false */
Components.utils.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Components.utils.import("resource://annealmail/key.jsm"); /*global AnnealMailKey: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/uris.jsm"); /*global AnnealMailURIs: false */
Components.utils.import("resource://annealmail/constants.jsm"); /*global AnnealMailConstants: false */
Components.utils.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */

if (!AnnealMail) var AnnealMail = {};

const EC = AnnealMailCore;

AnnealMail.hdrView = {

  statusBar: null,
  annealmailBox: null,
  lastEncryptedMsgKey: null,


  hdrViewLoad: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.hdrViewLoad\n");

    // Override SMIME ui
    var signedHdrElement = document.getElementById("signedHdrIcon");
    if (signedHdrElement) {
      signedHdrElement.setAttribute("onclick", "AnnealMail.msg.viewSecurityInfo(event, true);");
    }

    var encryptedHdrElement = document.getElementById("encryptedHdrIcon");
    if (encryptedHdrElement) {
      encryptedHdrElement.setAttribute("onclick", "AnnealMail.msg.viewSecurityInfo(event, true);");
    }

    this.statusBar = document.getElementById("annealmail-status-bar");
    this.annealmailBox = document.getElementById("annealmailBox");

    var addrPopup = document.getElementById("emailAddressPopup");
    if (addrPopup) {
      var attr = addrPopup.getAttribute("onpopupshowing");
      attr = "AnnealMailFuncs.collapseAdvanced(this, 'hidden'); " + attr;
      addrPopup.setAttribute("onpopupshowing", attr);
    }
  },


  statusBarHide: function() {
    try {
      this.statusBar.removeAttribute("signed");
      this.statusBar.removeAttribute("encrypted");
      this.annealmailBox.setAttribute("collapsed", "true");
      AnnealMail.msg.setAttachmentReveal(null);
      if (AnnealMail.msg.securityInfo) {
        AnnealMail.msg.securityInfo.statusFlags = 0;
        AnnealMail.msg.securityInfo.msgSigned = 0;
        AnnealMail.msg.securityInfo.msgEncrypted = 0;
      }

    }
    catch (ex) {}
  },

  // Match the userId from ccr to the sender's from address
  matchUidToSender: function(userId) {
    if (!gFolderDisplay.selectedMessage) {
      return userId;
    }

    var fromAddr = gFolderDisplay.selectedMessage.author;
    try {
      fromAddr = AnnealMailFuncs.stripEmail(fromAddr);
    }
    catch (ex) {}

    var userIdList = userId.split(/\n/);
    try {
      let i;
      for (i = 0; i < userIdList.length; i++) {
        if (fromAddr.toLowerCase() == AnnealMailFuncs.stripEmail(userIdList[i]).toLowerCase()) {
          userId = userIdList[i];
          break;
        }
      }
      if (i >= userIdList.length) userId = userIdList[0];
    }
    catch (ex) {
      userId = userIdList[0];
    }
    return userId;
  },


  setStatusText: function(txt) {
    let s = document.getElementById("annealmailStatusText");
    s.firstChild.data = txt;
  },

  updateHdrIcons: function(exitCode, statusFlags, keyId, userId, sigDetails, errorMsg, blockSeparation, encToDetails, xtraStatus, encMimePartNumber) {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.updateHdrIcons: exitCode=" + exitCode + ", statusFlags=" + statusFlags + ", keyId=" + keyId + ", userId=" + userId + ", " + errorMsg +
      "\n");

    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    this.statusBar = document.getElementById("annealmail-status-bar");
    this.annealmailBox = document.getElementById("annealmailBox");

    if (gFolderDisplay.selectedMessageUris && gFolderDisplay.selectedMessageUris.length > 0) {
      this.lastEncryptedMsgKey = gFolderDisplay.selectedMessageUris[0];
    }

    if (!errorMsg) errorMsg = "";

    var replaceUid = null;
    if (userId && (userId.indexOf("\n") >= 0)) {
      replaceUid = this.matchUidToSender(userId);
    }
    else {
      replaceUid = userId;
    }

    if (AnnealMail.msg.savedHeaders && (AnnealMail.msg.savedHeaders["x-pgp-encoding-format"].search(/partitioned/i) === 0)) {
      if (currentAttachments && currentAttachments.length) {
        AnnealMail.msg.setAttachmentReveal(currentAttachments);
      }
    }

    if (userId && replaceUid) {
      // no EnigConvertCcrToUnicode() here; strings are already UTF-8
      replaceUid = replaceUid.replace(/\\[xe]3a/gi, ":");
      errorMsg = errorMsg.replace(userId, replaceUid);
    }

    var errorLines = "";
    var fullStatusInfo = "";

    if (exitCode == AnnealMailConstants.POSSIBLE_PGPMIME) {
      exitCode = 0;
    }
    else {
      if (errorMsg) {
        // no EnigConvertCcrToUnicode() here; strings are already UTF-8
        errorLines = errorMsg.split(/\r?\n/);
        fullStatusInfo = errorMsg;
      }
    }

    if (errorLines && (errorLines.length > 22)) {
      // Retain only first twenty lines and last two lines of error message
      var lastLines = errorLines[errorLines.length - 2] + "\n" +
        errorLines[errorLines.length - 1] + "\n";

      while (errorLines.length > 20)
        errorLines.pop();

      errorMsg = errorLines.join("\n") + "\n...\n" + lastLines;
    }

    var statusInfo = "";
    var statusLine = "";
    var statusArr = [];

    if (statusFlags & nsIAnnealMail.NODATA) {
      if (statusFlags & nsIAnnealMail.PGP_MIME_SIGNED)
        statusFlags |= nsIAnnealMail.UNVERIFIED_SIGNATURE;

      if (statusFlags & nsIAnnealMail.PGP_MIME_ENCRYPTED)
        statusFlags |= nsIAnnealMail.DECRYPTION_INCOMPLETE;
    }

    if (!(statusFlags & nsIAnnealMail.PGP_MIME_ENCRYPTED)) {
      encMimePartNumber = "";
    }

    if (!AnnealMailPrefs.getPref("displayPartiallySigned")) {
      if ((statusFlags & (nsIAnnealMail.PARTIALLY_PGP)) &&
        (statusFlags & (nsIAnnealMail.BAD_SIGNATURE))) {
        statusFlags &= ~(nsIAnnealMail.BAD_SIGNATURE | nsIAnnealMail.PARTIALLY_PGP);
        if (statusFlags === 0) {
          errorMsg = "";
          fullStatusInfo = "";
        }
      }
    }

    var msgSigned = (statusFlags & (nsIAnnealMail.BAD_SIGNATURE |
      nsIAnnealMail.GOOD_SIGNATURE |
      nsIAnnealMail.EXPIRED_KEY_SIGNATURE |
      nsIAnnealMail.EXPIRED_SIGNATURE |
      nsIAnnealMail.UNVERIFIED_SIGNATURE |
      nsIAnnealMail.REVOKED_KEY |
      nsIAnnealMail.EXPIRED_KEY_SIGNATURE |
      nsIAnnealMail.EXPIRED_SIGNATURE));
    var msgEncrypted = (statusFlags & (nsIAnnealMail.DECRYPTION_OKAY |
      nsIAnnealMail.DECRYPTION_INCOMPLETE |
      nsIAnnealMail.DECRYPTION_FAILED));

    if (msgSigned && (statusFlags & nsIAnnealMail.IMPORTED_KEY)) {
      statusFlags &= (~nsIAnnealMail.IMPORTED_KEY);
    }

    if (!(statusFlags & nsIAnnealMail.DECRYPTION_FAILED) &&
      ((!(statusFlags & (nsIAnnealMail.DECRYPTION_INCOMPLETE |
          nsIAnnealMail.UNVERIFIED_SIGNATURE |
          nsIAnnealMail.DECRYPTION_FAILED |
          nsIAnnealMail.BAD_SIGNATURE))) ||
        (statusFlags & nsIAnnealMail.DISPLAY_MESSAGE) &&
        !(statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE)) &&
      !(statusFlags & nsIAnnealMail.IMPORTED_KEY)) {
      // normal exit / display message
      statusLine = errorMsg;
      statusInfo = statusLine;

      if (sigDetails) {
        var detailArr = sigDetails.split(/ /);

        let dateTime = AnnealMailTime.getDateTime(detailArr[2], true, true);
        var txt = AnnealMailLocale.getString("keyAndSigDate", [keyId.substr(-8, 8), dateTime]);
        statusArr.push(txt);
        statusInfo += "\n" + txt;
        var fpr = "";
        if (detailArr.length >= 10) {
          fpr = AnnealMailKey.formatFpr(detailArr[9]);
        }
        else {
          fpr = AnnealMailKey.formatFpr(detailArr[0]);
        }
        if (fpr) {
          statusInfo += "\n" + AnnealMailLocale.getString("keyFpr", [fpr]);
        }
        if (detailArr.length > 7) {
          var signingAlg = AnnealMailCcr.signingAlgIdToString(detailArr[6]);
          var hashAlg = AnnealMailCcr.hashAlgIdToString(detailArr[7]);

          statusInfo += "\n\n" + AnnealMailLocale.getString("usedAlgorithms", [signingAlg, hashAlg]);
        }
      }
      fullStatusInfo = statusInfo;

    }
    else {
      // no normal exit / don't display message
      // - process failed decryptions first because they imply bad signature handling
      if (statusFlags & nsIAnnealMail.BAD_PASSPHRASE) {
        statusInfo = AnnealMailLocale.getString("badPhrase");
        statusLine = statusInfo + AnnealMailLocale.getString("clickDecryptRetry");
      }
      else if (statusFlags & nsIAnnealMail.DECRYPTION_FAILED) {
        if (statusFlags & nsIAnnealMail.MISSING_PASSPHRASE) {
          statusInfo = AnnealMailLocale.getString("missingPassphrase");
          statusLine = statusInfo + AnnealMailLocale.getString("clickDecryptRetry");
        }
        else if (statusFlags & nsIAnnealMail.NO_SECKEY) {
          statusInfo = AnnealMailLocale.getString("needKey");
        }
        else {
          statusInfo = AnnealMailLocale.getString("failedDecrypt");
        }
        statusLine = statusInfo + AnnealMailLocale.getString("clickDetailsButton");
      }
      else if (statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE) {
        statusInfo = AnnealMailLocale.getString("unverifiedSig");
        if (keyId) {
          statusLine = statusInfo + AnnealMailLocale.getString("clickImportButton");
        }
        else {
          statusLine = statusInfo + AnnealMailLocale.getString("keyTypeUnsupported");
        }
      }
      else if (statusFlags & (nsIAnnealMail.BAD_SIGNATURE |
          nsIAnnealMail.EXPIRED_SIGNATURE |
          nsIAnnealMail.EXPIRED_KEY_SIGNATURE)) {
        statusInfo = AnnealMailLocale.getString("unverifiedSig");
        statusLine = statusInfo + AnnealMailLocale.getString("clickDetailsButton");
      }
      else if (statusFlags & nsIAnnealMail.DECRYPTION_INCOMPLETE) {
        statusInfo = AnnealMailLocale.getString("incompleteDecrypt");
        statusLine = statusInfo + AnnealMailLocale.getString("clickDetailsButton");
      }
      else if (statusFlags & nsIAnnealMail.IMPORTED_KEY) {
        statusLine = "";
        statusInfo = "";
        AnnealMailDialog.alert(window, errorMsg);
      }
      else {
        statusInfo = AnnealMailLocale.getString("failedDecryptVerify");
        statusLine = statusInfo + AnnealMailLocale.getString("viewInfo");
      }
      // add key infos if available
      if (keyId) {
        var si = AnnealMailLocale.getString("unverifiedSig"); // "Unverified signature"
        if (statusInfo === "") {
          statusInfo += si;
          statusLine = si + AnnealMailLocale.getString("clickDetailsButton");
        }
        if (statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE) {
          statusInfo += "\n" + AnnealMailLocale.getString("keyNeeded", [keyId]); // "public key ... needed"
        }
        else {
          statusInfo += "\n" + AnnealMailLocale.getString("keyUsed", [keyId]); // "public key ... used"
        }
      }
      statusInfo += "\n\n" + errorMsg;
    }

    if (statusFlags & nsIAnnealMail.DECRYPTION_OKAY ||
      (this.statusBar.getAttribute("encrypted") == "ok")) {
      var statusMsg;
      if (xtraStatus && xtraStatus == "buggyMailFormat") {
        statusMsg = AnnealMailLocale.getString("decryptedMsgWithFormatError");
      }
      else {
        statusMsg = AnnealMailLocale.getString("decryptedMsg");
      }
      if (!statusInfo) {
        statusInfo = statusMsg;
      }
      else {
        statusInfo = statusMsg + "\n" + statusInfo;
      }
      if (!statusLine) {
        statusLine = statusInfo;
      }
      else {
        statusLine = statusMsg + "; " + statusLine;
      }
    }

    if (AnnealMailPrefs.getPref("displayPartiallySigned")) {
      if (statusFlags & nsIAnnealMail.PARTIALLY_PGP) {
        if (msgSigned && msgEncrypted) {
          statusLine = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgSignedAndEnc")]);
          statusLine += AnnealMailLocale.getString("clickDetailsButton");
          statusInfo = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgSigned")]) +
            "\n" + statusInfo;
        }
        else if (msgEncrypted) {
          statusLine = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgEncrypted")]);
          statusLine += AnnealMailLocale.getString("clickDetailsButton");
          statusInfo = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgEncrypted")]) +
            "\n" + statusInfo;
        }
        else if (msgSigned) {
          if (statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE) {
            statusLine = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgSignedUnkownKey")]);
            if (keyId) {
              statusLine += AnnealMailLocale.getString("clickImportButton");
            }
            else {
              statusLine += AnnealMailLocale.getString("keyTypeUnsupported");
            }
          }
          else {
            statusLine = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgSigned")]);
            statusLine += AnnealMailLocale.getString("clickDetailsButton");
          }
          statusInfo = AnnealMailLocale.getString("msgPart", [AnnealMailLocale.getString("msgSigned")]) +
            "\n" + statusInfo;
        }
      }
    }

    // if we have parsed ENC_TO entries, add them as status info
    if (encToDetails && encToDetails.length > 0) {
      statusInfo += "\n\n" + AnnealMailLocale.getString("encryptKeysNote", [encToDetails]);
    }

    if (!statusLine) {
      return;
    }

    AnnealMail.msg.securityInfo = {
      statusFlags: statusFlags,
      keyId: keyId,
      userId: userId,
      statusLine: statusLine,
      msgSigned: msgSigned,
      statusArr: statusArr,
      statusInfo: statusInfo,
      fullStatusInfo: fullStatusInfo,
      blockSeparation: blockSeparation,
      xtraStatus: xtraStatus,
      encryptedMimePart: encMimePartNumber
    };

    this.displayStatusBar();
    this.updateMsgDb();

  },

  displayStatusBar: function() {
    const nsIAnnealMail = AnnealMailConstants.nsIAnnealMail;

    let statusText = document.getElementById("annealmailStatusText");
    let expStatusText = document.getElementById("expandedAnnealMailStatusText");
    let icon = document.getElementById("enigToggleHeaderView2");
    let bodyElement = document.getElementById("messagepanebox");

    let secInfo = AnnealMail.msg.securityInfo;
    let statusFlags = secInfo.statusFlags;

    if (secInfo.statusArr.length > 0) {
      expStatusText.value = secInfo.statusArr[0];
      expStatusText.setAttribute("state", "true");
      icon.removeAttribute("collapsed");
    }
    else {
      expStatusText.value = "";
      expStatusText.setAttribute("state", "false");
      icon.setAttribute("collapsed", "true");
    }

    if (secInfo.statusLine) {
      this.setStatusText(secInfo.statusLine + " ");
      this.annealmailBox.removeAttribute("collapsed");
      this.displayExtendedStatus(true);

      if ((secInfo.keyId && (statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE)) ||
        (statusFlags & nsIAnnealMail.INLINE_KEY)) {
        document.getElementById("annealmail_importKey").removeAttribute("hidden");
      }
      else {
        document.getElementById("annealmail_importKey").setAttribute("hidden", "true");
      }

    }
    else {
      this.setStatusText("");
      this.annealmailBox.setAttribute("collapsed", "true");
      this.displayExtendedStatus(false);
    }

    if (!gSMIMEContainer)
      return;

    // Update icons and header-box css-class
    try {
      gSMIMEContainer.collapsed = false;
      gSignedUINode.collapsed = false;
      gEncryptedUINode.collapsed = false;

      if ((statusFlags & nsIAnnealMail.BAD_SIGNATURE) &&
        !(statusFlags & nsIAnnealMail.GOOD_SIGNATURE)) {
        // Display untrusted/bad signature icon
        gSignedUINode.setAttribute("signed", "unknown");
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureUnknown");
        this.statusBar.setAttribute("signed", "unknown");
      }
      else if ((statusFlags & nsIAnnealMail.GOOD_SIGNATURE) &&
        (statusFlags & nsIAnnealMail.TRUSTED_IDENTITY) &&
        !(statusFlags & (nsIAnnealMail.REVOKED_KEY |
          nsIAnnealMail.EXPIRED_KEY_SIGNATURE |
          nsIAnnealMail.EXPIRED_SIGNATURE))) {
        // Display trusted good signature icon
        gSignedUINode.setAttribute("signed", "ok");
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureOk");
        this.statusBar.setAttribute("signed", "ok");
        bodyElement.setAttribute("enigSigned", "ok");
      }
      else if (statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE) {
        // Display unverified signature icon
        gSignedUINode.setAttribute("signed", "unknown");
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureUnknown");
        this.statusBar.setAttribute("signed", "unknown");
      }
      else if (statusFlags & (nsIAnnealMail.REVOKED_KEY |
          nsIAnnealMail.EXPIRED_KEY_SIGNATURE |
          nsIAnnealMail.EXPIRED_SIGNATURE |
          nsIAnnealMail.GOOD_SIGNATURE)) {
        // Display unverified signature icon
        gSignedUINode.setAttribute("signed", "unknown");
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureVerified");
        this.statusBar.setAttribute("signed", "unknown");
      }
      else if (statusFlags & nsIAnnealMail.INLINE_KEY) {
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureUnknown");
      }
      else {
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelNoSignature");
      }

      if (statusFlags & nsIAnnealMail.DECRYPTION_OKAY) {
        AnnealMailURIs.rememberEncryptedUri(this.lastEncryptedMsgKey);

        // Display encrypted icon
        gEncryptedUINode.setAttribute("encrypted", "ok");
        this.statusBar.setAttribute("encrypted", "ok");
      }
      else if (statusFlags &
        (nsIAnnealMail.DECRYPTION_INCOMPLETE | nsIAnnealMail.DECRYPTION_FAILED)) {
        // Display un-encrypted icon
        gEncryptedUINode.setAttribute("encrypted", "notok");
        this.statusBar.setAttribute("encrypted", "notok");
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureNotOk");
      }

      // special handling after trying to fix buggy mail format (see buggyExchangeEmailContent in code)
      if (secInfo.xtraStatus && secInfo.xtraStatus == "buggyMailFormat") {
        this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelBuggyMailFormat");
      }

    }
    catch (ex) {
      AnnealMailLog.writeException("displayStatusBar", ex);
    }
  },

  dispSecurityContext: function() {

    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    try {
      if (AnnealMail.msg.securityInfo) {
        if ((AnnealMail.msg.securityInfo.statusFlags & nsIAnnealMail.NODATA) &&
          (AnnealMail.msg.securityInfo.statusFlags &
            (nsIAnnealMail.PGP_MIME_SIGNED | nsIAnnealMail.PGP_MIME_ENCRYPTED))) {
          document.getElementById("annealmail_reloadMessage").removeAttribute("hidden");
        }
        else {
          document.getElementById("annealmail_reloadMessage").setAttribute("hidden", "true");
        }
      }

      var optList = ["pgpSecurityInfo", "copySecurityInfo"];
      for (var j = 0; j < optList.length; j++) {
        var menuElement = document.getElementById("annealmail_" + optList[j]);
        if (AnnealMail.msg.securityInfo) {
          menuElement.removeAttribute("disabled");
        }
        else {
          menuElement.setAttribute("disabled", "true");
        }
      }

      this.setSenderStatus("signSenderKey", "editSenderKeyTrust", "showPhoto", "dispKeyDetails");
    }
    catch (ex) {
      AnnealMailLog.ERROR("error on displaying Security menu:\n" + ex.toString() + "\n");
    }
  },


  updateSendersKeyMenu: function() {
    this.setSenderStatus("keyMgmtSignKey",
      "keyMgmtKeyTrust",
      "keyMgmtShowPhoto",
      "keyMgmtDispKeyDetails",
      "importpublickey");
  },

  setSenderStatus: function(elemSign, elemTrust, elemPhoto, elemKeyProps, elemImportKey) {

    function setElemStatus(elemName, disabledValue) {
      document.getElementById("annealmail_" + elemName).setAttribute("disabled", !disabledValue);

      let secondElem = document.getElementById("annealmail_" + elemName + "2");
      if (secondElem) secondElem.setAttribute("disabled", !disabledValue);
    }

    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    var photo = false;
    var sign = false;
    var trust = false;
    var unknown = false;
    var signedMsg = false;

    if (AnnealMail.msg.securityInfo) {
      if (AnnealMail.msg.securityInfo.statusFlags & nsIAnnealMail.PHOTO_AVAILABLE) {
        photo = true;
      }
      if (AnnealMail.msg.securityInfo.msgSigned) {
        signedMsg = true;
        if (!(AnnealMail.msg.securityInfo.statusFlags &
            (nsIAnnealMail.REVOKED_KEY | nsIAnnealMail.EXPIRED_KEY_SIGNATURE | nsIAnnealMail.UNVERIFIED_SIGNATURE))) {
          sign = true;
        }
        if (!(AnnealMail.msg.securityInfo.statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE)) {
          trust = true;
        }

        if (AnnealMail.msg.securityInfo.statusFlags & nsIAnnealMail.UNVERIFIED_SIGNATURE) {
          unknown = true;
        }
      }
    }

    if (elemTrust) setElemStatus(elemTrust, trust);
    if (elemSign) setElemStatus(elemSign, sign);
    if (elemPhoto) setElemStatus(elemPhoto, photo);
    if (elemKeyProps) setElemStatus(elemKeyProps, (signedMsg && !unknown));
    if (elemImportKey) setElemStatus(elemImportKey, unknown);
  },

  editKeyExpiry: function() {
    AnnealMailWindows.editKeyExpiry(window, [AnnealMail.msg.securityInfo.userId], [AnnealMail.msg.securityInfo.keyId]);
    gDBView.reloadMessageWithAllParts();
  },

  editKeyTrust: function() {
    let annealmailSvc = AnnealMailCore.getService();
    let key = AnnealMailKeyRing.getKeyById(AnnealMail.msg.securityInfo.keyId);

    AnnealMailWindows.editKeyTrust(window, [AnnealMail.msg.securityInfo.userId], [key.keyId]);
    gDBView.reloadMessageWithAllParts();
  },

  signKey: function() {
    let annealmailSvc = AnnealMailCore.getService();
    let key = AnnealMailKeyRing.getKeyById(AnnealMail.msg.securityInfo.keyId);

    AnnealMailWindows.signKey(window, AnnealMail.msg.securityInfo.userId, key.keyId, null);
    gDBView.reloadMessageWithAllParts();
  },


  msgHdrViewLoad: function(event) {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.msgHdrViewLoad\n");

    var listener = {
      annealmailBox: document.getElementById("annealmailBox"),
      onStartHeaders: function _listener_onStartHeaders() {
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: _listener_onStartHeaders\n");

        try {

          AnnealMail.hdrView.statusBarHide();

          AnnealMailVerify.setMsgWindow(msgWindow, AnnealMail.msg.getCurrentMsgUriSpec());

          AnnealMail.hdrView.setStatusText("");

          this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureOk");

          var msgFrame = AnnealMailWindows.getFrame(window, "messagepane");

          if (msgFrame) {
            AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: msgFrame=" + msgFrame + "\n");

            msgFrame.addEventListener("unload", AnnealMail.hdrView.messageUnload.bind(AnnealMail.hdrView), true);
            msgFrame.addEventListener("load", AnnealMail.msg.messageAutoDecrypt.bind(AnnealMail.msg), false);
            msgFrame.addEventListener("load", AnnealMail.msg.handleAttchmentEvent.bind(AnnealMail.msg), true);
          }

          AnnealMail.hdrView.forgetEncryptedMsgKey();

          if (messageHeaderSink) {
            try {
              messageHeaderSink.annealmailPrepSecurityInfo();
            }
            catch (ex) {}
          }
        }
        catch (ex) {}
      },

      onEndHeaders: function _listener_onEndHeaders() {
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: _listener_onEndHeaders\n");

        try {
          AnnealMail.hdrView.statusBarHide();

          this.annealmailBox.setAttribute("class", "expandedAnnealMailBox annealmailHeaderBoxLabelSignatureOk");
        }
        catch (ex) {}
      },

      beforeStartHeaders: function _listener_beforeStartHeaders() {
        return true;
      }
    };

    gMessageListeners.push(listener);
  },

  messageUnload: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.messageUnload\n");
  },

  hdrViewUnload: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.hdrViewUnLoad\n");
    this.forgetEncryptedMsgKey();
  },

  copyStatusInfo: function() {
    if (AnnealMail.msg.securityInfo) {
      var clipHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"].createInstance(Components.interfaces.nsIClipboardHelper);
      clipHelper.copyString(AnnealMail.msg.securityInfo.statusInfo);
    }

  },

  showPhoto: function() {
    if (!AnnealMail.msg.securityInfo) return;

    let annealmailSvc = AnnealMailCore.getService();
    let key = AnnealMailKeyRing.getKeyById(AnnealMail.msg.securityInfo.keyId);

    AnnealMailWindows.showPhoto(window, key.keyId, AnnealMail.msg.securityInfo.userId);
  },


  dispKeyDetails: function() {
    if (!AnnealMail.msg.securityInfo) return;

    let annealmailSvc = AnnealMailCore.getService();
    let key = AnnealMailKeyRing.getKeyById(AnnealMail.msg.securityInfo.keyId);

    AnnealMailWindows.openKeyDetails(window, key.keyId, false);
  },

  createRuleFromAddress: function(emailAddressNode) {
    if (emailAddressNode) {
      if (typeof(findEmailNodeFromPopupNode) == "function") {
        emailAddressNode = findEmailNodeFromPopupNode(emailAddressNode, 'emailAddressPopup');
      }
      AnnealMailWindows.createNewRule(window, emailAddressNode.getAttribute("emailAddress"));
    }
  },

  forgetEncryptedMsgKey: function() {
    if (AnnealMail.hdrView.lastEncryptedMsgKey) {
      AnnealMailURIs.forgetEncryptedUri(AnnealMail.hdrView.lastEncryptedMsgKey);
      AnnealMail.hdrView.lastEncryptedMsgKey = null;
    }
  },

  msgHdrViewHide: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.msgHdrViewHide\n");
    this.annealmailBox.setAttribute("collapsed", true);

    AnnealMail.msg.securityInfo = {
      statusFlags: 0,
      keyId: "",
      userId: "",
      statusLine: "",
      statusInfo: "",
      fullStatusInfo: "",
      encryptedMimePart: ""
    };

  },

  msgHdrViewUnhide: function(event) {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.msgHdrViewUnhide:\n");

    if (AnnealMail.msg.securityInfo.statusFlags !== 0) {
      this.annealmailBox.removeAttribute("collapsed");
    }
  },

  displayExtendedStatus: function(displayOn) {
    var expStatusText = document.getElementById("expandedAnnealMailStatusText");
    if (displayOn && expStatusText.getAttribute("state") == "true") {
      if (expStatusText.getAttribute("display") == "true") {
        expStatusText.removeAttribute("collapsed");
      }
      else {
        expStatusText.setAttribute("collapsed", "true");
      }
    }
    else {
      expStatusText.setAttribute("collapsed", "true");
    }
  },

  toggleHeaderView: function() {
    var viewToggle = document.getElementById("enigToggleHeaderView2");
    var expandedText = document.getElementById("expandedAnnealMailStatusText");
    var state = viewToggle.getAttribute("state");

    if (state == "true") {
      viewToggle.setAttribute("state", "false");
      viewToggle.setAttribute("class", "annealmailExpandViewButton");
      expandedText.setAttribute("display", "false");
      this.displayExtendedStatus(false);
    }
    else {
      viewToggle.setAttribute("state", "true");
      viewToggle.setAttribute("class", "annealmailCollapseViewButton");
      expandedText.setAttribute("display", "true");
      this.displayExtendedStatus(true);
    }
  },

  enigOnShowAttachmentContextMenu: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.enigOnShowAttachmentContextMenu\n");
    // first, call the original function ...

    try {
      // Thunderbird
      onShowAttachmentItemContextMenu();
    }
    catch (ex) {
      // SeaMonkey
      onShowAttachmentContextMenu();
    }

    // then, do our own additional stuff ...

    // Thunderbird
    var contextMenu = document.getElementById('attachmentItemContext');
    var selectedAttachments = contextMenu.attachments;

    if (!contextMenu) {
      // SeaMonkey
      contextMenu = document.getElementById('attachmentListContext');
      selectedAttachments = attachmentList.selectedItems;
    }

    var decryptOpenMenu = document.getElementById('annealmail_ctxDecryptOpen');
    var decryptSaveMenu = document.getElementById('annealmail_ctxDecryptSave');
    var importMenu = document.getElementById('annealmail_ctxImportKey');
    var verifyMenu = document.getElementById('annealmail_ctxVerifyAtt');

    if (selectedAttachments.length > 0) {
      if (selectedAttachments[0].contentType.search(/^application\/pgp-keys/i) === 0) {
        importMenu.removeAttribute('disabled');
        decryptOpenMenu.setAttribute('disabled', true);
        decryptSaveMenu.setAttribute('disabled', true);
        verifyMenu.setAttribute('disabled', true);
      }
      else if (AnnealMail.msg.checkSignedAttachment(selectedAttachments[0], null)) {
        importMenu.setAttribute('disabled', true);
        decryptOpenMenu.setAttribute('disabled', true);
        decryptSaveMenu.setAttribute('disabled', true);
        verifyMenu.removeAttribute('disabled');
      }
      else if (AnnealMail.msg.checkEncryptedAttach(selectedAttachments[0])) {
        importMenu.setAttribute('disabled', true);
        decryptOpenMenu.removeAttribute('disabled');
        decryptSaveMenu.removeAttribute('disabled');
        verifyMenu.setAttribute('disabled', true);
        if (typeof(selectedAttachments[0].displayName) == "undefined") {
          if (!selectedAttachments[0].name) {
            selectedAttachments[0].name = "message.pgp";
          }
        }
        else
        if (!selectedAttachments[0].displayName) {
          selectedAttachments[0].displayName = "message.pgp";
        }
      }
      else {
        importMenu.setAttribute('disabled', true);
        decryptOpenMenu.setAttribute('disabled', true);
        decryptSaveMenu.setAttribute('disabled', true);
        verifyMenu.setAttribute('disabled', true);
      }
    }
    else {
      openMenu.setAttribute('disabled', true); /* global openMenu: false */
      saveMenu.setAttribute('disabled', true); /* global saveMenu: false */
      decryptOpenMenu.setAttribute('disabled', true);
      decryptSaveMenu.setAttribute('disabled', true);
      importMenu.setAttribute('disabled', true);
      verifyMenu.setAttribute('disabled', true);
    }
  },

  updateMsgDb: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.updateMsgDb\n");
    var msg = gFolderDisplay.selectedMessage;
    if (!msg || !msg.folder) return;

    var msgHdr = msg.folder.GetMessageHeader(msg.messageKey);
    if (this.statusBar.getAttribute("encrypted") == "ok")
      AnnealMail.msg.securityInfo.statusFlags |= Components.interfaces.nsIAnnealMail.DECRYPTION_OKAY;
    msgHdr.setUint32Property("annealmail", AnnealMail.msg.securityInfo.statusFlags);
  },

  enigCanDetachAttachments: function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: this.enigCanDetachAttachments\n");

    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    var canDetach = true;
    if (AnnealMail.msg.securityInfo && (typeof(AnnealMail.msg.securityInfo.statusFlags) != "undefined")) {
      canDetach = ((AnnealMail.msg.securityInfo.statusFlags &
        (nsIAnnealMail.PGP_MIME_SIGNED | nsIAnnealMail.PGP_MIME_ENCRYPTED)) ? false : true);
    }
    return canDetach;
  },

  fillAttachmentListPopup: function(item) {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: AnnealMail.hdrView.fillAttachmentListPopup\n");
    FillAttachmentListPopup(item); /* global FillAttachmentListPopup: false */

    if (!this.enigCanDetachAttachments()) {
      for (var i = 0; i < item.childNodes.length; i++) {
        if (item.childNodes[i].className == "menu-iconic") {
          var mnu = item.childNodes[i].firstChild.firstChild;
          while (mnu) {
            if (mnu.getAttribute("oncommand").search(/(detachAttachment|deleteAttachment)/) >= 0) {
              mnu.setAttribute("disabled", true);
            }
            mnu = mnu.nextSibling;
          }
        }
      }
    }
  }

};

window.addEventListener("load", AnnealMail.hdrView.hdrViewLoad.bind(AnnealMail.hdrView), false);
addEventListener('messagepane-loaded', AnnealMail.hdrView.msgHdrViewLoad.bind(AnnealMail.hdrView), true);
addEventListener('messagepane-unloaded', AnnealMail.hdrView.hdrViewUnload.bind(AnnealMail.hdrView), true);
addEventListener('messagepane-hide', AnnealMail.hdrView.msgHdrViewHide.bind(AnnealMail.hdrView), true);
addEventListener('messagepane-unhide', AnnealMail.hdrView.msgHdrViewUnhide.bind(AnnealMail.hdrView), true);

////////////////////////////////////////////////////////////////////////////////
// THE FOLLOWING OVERRIDES CODE IN msgHdrViewOverlay.js
////////////////////////////////////////////////////////////////////////////////

// there is unfortunately no other way to add AnnealMail to the validator than this

function CanDetachAttachments() {
  var canDetach = !gFolderDisplay.selectedMessageIsNews &&
    (!gFolderDisplay.selectedMessageIsImap || MailOfflineMgr.isOnline());

  if (canDetach && ("content-type" in currentHeaderData)) {
    var contentType = currentHeaderData["content-type"].headerValue;

    canDetach = !ContentTypeIsSMIME(currentHeaderData["content-type"].headerValue);
  }
  return canDetach && AnnealMail.hdrView.enigCanDetachAttachments();
}


////////////////////////////////////////////////////////////////////////////////
// THE FOLLOWING EXTENDS CODE IN msgHdrViewOverlay.js
////////////////////////////////////////////////////////////////////////////////

if (messageHeaderSink) {
  messageHeaderSink.annealmailPrepSecurityInfo = function() {
    AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: annealmailPrepSecurityInfo\n");


    /// BEGIN EnigMimeHeaderSink definition
    function EnigMimeHeaderSink(innerSMIMEHeaderSink) {
      AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.innerSMIMEHeaderSink=" + innerSMIMEHeaderSink + "\n");
      this._smimeHeaderSink = innerSMIMEHeaderSink;
    }

    EnigMimeHeaderSink.prototype = {
      _smimeHeaderSink: null,

      workaroundMode: null,

      QueryInterface: function(iid) {
        //AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.QI: "+iid+"\n");
        if (iid.equals(Components.interfaces.nsIMsgSMIMEHeaderSink) &&
          this._smimeHeaderSink)
          return this;

        if (iid.equals(Components.interfaces.nsIEnigMimeHeaderSink) ||
          iid.equals(Components.interfaces.nsISupports))
          return this;

        throw Components.results.NS_NOINTERFACE;
      },

      isCurrentMessage: function(uri) {
        let uriSpec = (uri ? uri.spec : null);

        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: uri.spec=" + uriSpec + "\n");

        let msgUriSpec = AnnealMail.msg.getCurrentMsgUriSpec();

        let url = {};
        try {
          let messenger = Components.classes["@mozilla.org/messenger;1"].getService(Components.interfaces.nsIMessenger);
          let msgSvc = messenger.messageServiceFromURI(msgUriSpec);
          msgSvc.GetUrlForUri(msgUriSpec, url, null);
        }
        catch (ex) {
          AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: could not determine URL\n");
          url.value = {
            spec: "annealmail://invalid/message"
          };
        }

        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: url=" + url.value.spec + "\n");

        if (!uriSpec || uriSpec.search(/^annealmail:/) === 0 || (uriSpec.indexOf(url.value.spec) === 0 &&
            uriSpec.substr(url.value.spec.length).search(/([\?&].*)?$/) === 0)) {
          return true;
        }

        return false;
      },

      /**
       * Determine if a given mime part number should be displayed.
       * Returns true if one of these conditions is true:
       *  - this is the 1st crypto-mime part
       *  - the mime part is earlier in the mime tree
       *  - the mime part is the 1st child of an already displayed mime part
       */
      displaySubPart: function(mimePartNumber) {
        if (!mimePartNumber) return true;

        let securityInfo = AnnealMail.msg.securityInfo;
        if (mimePartNumber.length > 0 && securityInfo && securityInfo.encryptedMimePart && securityInfo.encryptedMimePart.length > 0) {
          let c = AnnealMailFuncs.compareMimePartLevel(securityInfo.encryptedMimePart, mimePartNumber);

          if (c === -1) {
            AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: displaySubPart: MIME part after already processed part\n");
            return false;
          }
          if (c === -2 && mimePartNumber !== securityInfo.encryptedMimePart + ".1") {
            AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: displaySubPart: MIME part not 1st child of parent\n");
            return false;
          }
        }

        return true;
      },

      updateSecurityStatus: function(unusedUriSpec, exitCode, statusFlags, keyId, userId, sigDetails, errorMsg, blockSeparation, uri, encToDetails, mimePartNumber) {
        // unusedUriSpec is not used anymore. It is here becaue other addons rely on the same API

        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: updateSecurityStatus: mimePart=" + mimePartNumber + "\n");

        let uriSpec = (uri ? uri.spec : null);

        if (this.isCurrentMessage(uri)) {

          if (!this.displaySubPart(mimePartNumber)) return;

          AnnealMail.hdrView.updateHdrIcons(exitCode, statusFlags, keyId, userId, sigDetails,
            errorMsg, blockSeparation, encToDetails,
            null, mimePartNumber);
        }

        if (uriSpec && uriSpec.search(/^annealmail:message\//) === 0) {
          // display header for broken MS-Exchange message
          let ebeb = document.getElementById("annealmailBrokenExchangeBox");
          ebeb.removeAttribute("collapsed");
        }

        return;
      },

      modifyMessageHeaders: function(uri, headerData, mimePartNumber) {
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.modifyMessageHeaders:\n");
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: headerData= " + headerData + ", mimePart=" + mimePartNumber + "\n");

        function updateHdrBox(header, value) {
          let e = document.getElementById("expanded" + header + "Box");
          if (e) {
            e.headerValue = value;
          }
        }

        let hdr;
        try {
          hdr = JSON.parse(headerData);
        }
        catch (ex) {
          AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: modifyMessageHeaders: - no headers to display\n");
          return;
        }

        let msg = gFolderDisplay.selectedMessage;

        if (!msg) return;

        if (typeof(hdr) !== "object") return;
        if (!this.isCurrentMessage(uri) || gFolderDisplay.selectedMessages.length !== 1) return;

        if (!this.displaySubPart(mimePartNumber)) return;

        if ("subject" in hdr) {
          msg.subject = AnnealMailData.convertFromUnicode(hdr.subject, "utf-8");
          updateHdrBox("subject", hdr.subject);
        }

        if ("date" in hdr) {
          msg.date = Date.parse(hdr.date) * 1000;
        }

        if ("newsgroups" in hdr) {
          updateHdrBox("newsgroups", hdr.newsgroups);
        }

        if ("followup-to" in hdr) {
          updateHdrBox("followup-to", hdr["followup-to"]);
        }

        if ("from" in hdr) {
          gExpandedHeaderView.from.outputFunction(gExpandedHeaderView.from, AnnealMailData.convertFromUnicode(hdr.from, "utf-8"));
          msg.setStringProperty("AnnealMail-From", hdr.from);
        }

        if ("to" in hdr) {
          gExpandedHeaderView.to.outputFunction(gExpandedHeaderView.to, AnnealMailData.convertFromUnicode(hdr.to, "utf-8"));
          msg.setStringProperty("AnnealMail-To", hdr.to);
        }

        if ("cc" in hdr) {
          gExpandedHeaderView.cc.outputFunction(gExpandedHeaderView.cc, AnnealMailData.convertFromUnicode(hdr.cc, "utf-8"));
          msg.setStringProperty("AnnealMail-Cc", hdr.cc);
        }

        if ("reply-to" in hdr) {
          gExpandedHeaderView["reply-to"].outputFunction(gExpandedHeaderView["reply-to"], AnnealMailData.convertFromUnicode(hdr["reply-to"], "utf-8"));
          msg.setStringProperty("AnnealMail-ReplyTo", hdr["reply-to"]);
        }

      },

      handleSMimeMessage: function(uri) {
        if (this.isCurrentMessage(uri)) {
          AnnealMailVerify.unregisterContentTypeHandler();
          AnnealMail.msg.messageReload(false);
        }
      },

      maxWantedNesting: function() {
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.maxWantedNesting:\n");
        return this._smimeHeaderSink.maxWantedNesting();
      },

      signedStatus: function(aNestingLevel, aSignatureStatus, aSignerCert) {
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.signedStatus:\n");
        return this._smimeHeaderSink.signedStatus(aNestingLevel, aSignatureStatus, aSignerCert);
      },

      encryptionStatus: function(aNestingLevel, aEncryptionStatus, aRecipientCert) {
        AnnealMailLog.DEBUG("annealmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.encryptionStatus:\n");
        return this._smimeHeaderSink.encryptionStatus(aNestingLevel, aEncryptionStatus, aRecipientCert);
      }

    };
    /// END EnigMimeHeaderSink definition

    var innerSMIMEHeaderSink = null;
    var annealmailHeaderSink = null;

    try {
      innerSMIMEHeaderSink = this.securityInfo.QueryInterface(Components.interfaces.nsIMsgSMIMEHeaderSink);

      try {
        annealmailHeaderSink = innerSMIMEHeaderSink.QueryInterface(Components.interfaces.nsIEnigMimeHeaderSink);
      }
      catch (ex) {}
    }
    catch (ex) {}

    if (!annealmailHeaderSink) {
      this.securityInfo = new EnigMimeHeaderSink(innerSMIMEHeaderSink);
    }
  };
}
