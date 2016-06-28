/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

try {
  // TB with omnijar
  Components.utils.import("resource:///modules/gloda/mimemsg.js"); /* global MsgHdrToMimeMessage: false */
}
catch (ex) {
  // "old style" TB
  Components.utils.import("resource://app/modules/gloda/mimemsg.js");
}

/* global AnnealMailData: false, AnnealMailApp: false, AnnealMailDialog: false, AnnealMailTimer: false, AnnealMailWindows: false, AnnealMailTime: false */
/* global AnnealMailLocale: false, AnnealMailLog: false, XPCOMUtils: false, AnnealMailPrefs: false */

/* globals from Thunderbird: */
/* global ReloadMessage: false, gDBView: false, gSignatureStatus: false, gEncryptionStatus: false, showMessageReadSecurityInfo: false */
/* global gFolderDisplay: false, messenger: false, currentAttachments: false, msgWindow: false, ChangeMailLayout: false, MsgToggleMessagePane: false */
/* global currentHeaderData: false, gViewAllHeaders: false, gExpandedHeaderList: false, goDoCommand: false, HandleSelectedAttachments: false */
/* global statusFeedback: false */

Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/funcs.jsm"); /* global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/mimeVerify.jsm"); /* global AnnealMailVerify: false */
Components.utils.import("resource://annealmail/fixExchangeMsg.jsm"); /* global AnnealMailFixExchangeMsg: false */
Components.utils.import("resource://annealmail/log.jsm");
Components.utils.import("resource://annealmail/prefs.jsm");
Components.utils.import("resource://annealmail/os.jsm"); /* global AnnealMailOS: false */
Components.utils.import("resource://annealmail/locale.jsm");
Components.utils.import("resource://annealmail/files.jsm"); /* global AnnealMailFiles: false */
Components.utils.import("resource://annealmail/key.jsm"); /* global AnnealMailKey: false */
Components.utils.import("resource://annealmail/data.jsm");
Components.utils.import("resource://annealmail/app.jsm");
Components.utils.import("resource://annealmail/dialog.jsm");
Components.utils.import("resource://annealmail/timer.jsm");
Components.utils.import("resource://annealmail/windows.jsm");
Components.utils.import("resource://annealmail/time.jsm");
Components.utils.import("resource://annealmail/decryptPermanently.jsm"); /* global AnnealMailDecryptPermanently: false */
Components.utils.import("resource://annealmail/streams.jsm"); /*global AnnealMailStreams: false */
Components.utils.import("resource://annealmail/events.jsm"); /*global AnnealMailEvents: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
Components.utils.import("resource://annealmail/attachment.jsm"); /*global AnnealMailAttachment: false */
Components.utils.import("resource://annealmail/constants.jsm"); /*global AnnealMailConstants: false */
Components.utils.import("resource://annealmail/passwords.jsm"); /*global AnnealMailPassword: false */
Components.utils.import("resource://annealmail/keyUsability.jsm"); /*global AnnealMailKeyUsability: false */
Components.utils.import("resource://annealmail/uris.jsm"); /*global AnnealMailURIs: false */
Components.utils.import("resource://annealmail/protocolHandler.jsm"); /*global AnnealMailProtocolHandler: false */

if (!AnnealMail) var AnnealMail = {};

AnnealMail.getAnnealMailSvc = function() {
  return AnnealMailCore.getService(window);
};

const IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";

AnnealMail.msg = {
  createdURIs: [],
  decryptedMessage: null,
  securityInfo: null,
  lastSaveDir: "",
  messagePane: null,
  noShowReload: false,
  decryptButton: null,
  savedHeaders: null,
  removeListener: false,
  enableExperiments: false,
  headersList: ["content-type", "content-transfer-encoding",
    "x-annealmail-version", "x-pgp-encoding-format"
  ],
  buggyExchangeEmailContent: null, // for HACK for MS-EXCHANGE-Server Problem
  buggyMailType: null,

  messengerStartup: function() {

    // private function to overwrite attributes
    function overrideAttribute(elementIdList, attrName, prefix, suffix) {
      for (var index = 0; index < elementIdList.length; index++) {
        var elementId = elementIdList[index];
        var element = document.getElementById(elementId);
        if (element) {
          try {
            var oldValue = element.getAttribute(attrName);
            AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: overrideAttribute " + attrName + ": oldValue=" + oldValue + "\n");
            var newValue = prefix + elementId + suffix;

            element.setAttribute(attrName, newValue);
          }
          catch (ex) {}
        }
        else {
          AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: *** UNABLE to override id=" + elementId + "\n");
        }
      }
    }

    AnnealMail.msg.messagePane = document.getElementById("messagepane");

    if (!AnnealMail.msg.messagePane) return; // TB on Mac OS X calls this twice -- once far too early

    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: Startup\n");

    // Override SMIME ui
    var viewSecurityCmd = document.getElementById("cmd_viewSecurityStatus");
    if (viewSecurityCmd) {
      viewSecurityCmd.setAttribute("oncommand", "AnnealMail.msg.viewSecurityInfo(null, true);");
    }

    // Override print command
    var printElementIds = ["cmd_print", "cmd_printpreview", "key_print", "button-print",
      "mailContext-print", "mailContext-printpreview"
    ];

    overrideAttribute(printElementIds, "oncommand",
      "AnnealMail.msg.msgPrint('", "');");

    AnnealMail.msg.overrideLayoutChange();

    AnnealMail.msg.savedHeaders = null;

    AnnealMail.msg.decryptButton = document.getElementById("button-annealmail-decrypt");

    AnnealMail.msg.expiryTimer = AnnealMailTimer.setTimeout(function _f() {
      let msg = AnnealMailKeyUsability.keyExpiryCheck();

      if (msg && msg.length > 0) {
        AnnealMailDialog.alert(window, msg);
      }

      this.expiryTimer = undefined;
    }.bind(AnnealMail.msg), 60000); // 1 minute

    // Enable automatic check for suitable Ownertrust ("You rely on certifications")
    AnnealMail.msg.OTcheckTimer = AnnealMailTimer.setTimeout(AnnealMail.msg.checkOwnertrust.bind(AnnealMail.msg), 10000); // 10 seconds

    // Need to add event listener to AnnealMail.msg.messagePane to make it work
    // Adding to msgFrame doesn't seem to work
    AnnealMail.msg.messagePane.addEventListener("unload", AnnealMail.msg.messageFrameUnload.bind(AnnealMail.msg), true);

    var treeController = {
      supportsCommand: function(command) {
        // AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: treeCtrl: supportsCommand: "+command+"\n");
        switch (command) {
          case "button_annealmail_decrypt":
            return true;
        }
        return false;
      },
      isCommandEnabled: function(command) {
        // AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: treeCtrl: isCommandEnabled: "+command+"\n");
        try {
          if (gFolderDisplay.messageDisplay.visible) {
            if (gFolderDisplay.selectedCount != 1) AnnealMail.hdrView.statusBarHide();
            return (gFolderDisplay.selectedCount == 1);
          }
          AnnealMail.hdrView.statusBarHide();
        }
        catch (ex) {}
        return false;
      },
      doCommand: function(command) {
        //AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: treeCtrl: doCommand: "+command+"\n");
        // nothing
      },
      onEvent: function(event) {
        // AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: treeCtrl: onEvent: "+command+"\n");
        // nothing
      }
    };

    top.controllers.appendController(treeController);

    if (AnnealMailPrefs.getPref("configuredVersion") === "") {
      AnnealMailPrefs.setPref("configuredVersion", AnnealMailApp.getVersion());
      AnnealMailWindows.openSetupWizard(window, false);
    }
  },

  viewSecurityInfo: function(event, displaySmimeMsg) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: viewSecurityInfo\n");

    if (event && event.button !== 0)
      return;

    if (gSignatureStatus >= 0 || gEncryptionStatus >= 0) {
      showMessageReadSecurityInfo();
    }
    else {
      if (AnnealMail.msg.securityInfo)
        this.viewOpenpgpInfo();
      else
        showMessageReadSecurityInfo();
    }
  },

  viewOpenpgpInfo: function() {
    if (AnnealMail.msg.securityInfo) {
      AnnealMailDialog.longAlert(window, AnnealMailLocale.getString("securityInfo") + AnnealMail.msg.securityInfo.statusInfo);
    }
  },


  messageReload: function(noShowReload) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageReload: " + noShowReload + "\n");

    AnnealMail.msg.noShowReload = noShowReload;

    ReloadMessage();
  },


  reloadCompleteMsg: function() {
    gDBView.reloadMessageWithAllParts();
  },


  setAttachmentReveal: function(attachmentList) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: setAttachmentReveal\n");

    var revealBox = document.getElementById("annealmailRevealAttachments");
    if (revealBox) {
      // there are situations when evealBox is not yet present
      revealBox.setAttribute("hidden", !attachmentList ? "true" : "false");
    }
  },


  messageCleanup: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageCleanup\n");

    var annealmailBox = document.getElementById("annealmailBox");

    if (annealmailBox && !annealmailBox.collapsed) {
      annealmailBox.setAttribute("collapsed", "true");

      var statusText = document.getElementById("expandedAnnealMailStatusText");

      if (statusText)
        statusText.value = "";
    }

    document.getElementById("annealmailBrokenExchangeBox").setAttribute("collapsed", "true");

    this.setAttachmentReveal(null);

    if (AnnealMail.msg.createdURIs.length) {
      // Cleanup messages belonging to this window (just in case)
      var annealmailSvc = AnnealMail.getAnnealMailSvc();
      if (annealmailSvc) {
        AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: Cleanup: Deleting messages\n");
        for (var index = 0; index < AnnealMail.msg.createdURIs.length; index++) {
          annealmailSvc.deleteMessageURI(AnnealMail.msg.createdURIs[index]);
        }
        AnnealMail.msg.createdURIs = [];
      }
    }

    AnnealMail.msg.decryptedMessage = null;
    AnnealMail.msg.securityInfo = null;
  },

  messageFrameUnload: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageFrameUnload\n");

    if (AnnealMail.msg.noShowReload) {
      AnnealMail.msg.noShowReload = false;

    }
    else {
      AnnealMail.msg.savedHeaders = null;

      AnnealMail.msg.messageCleanup();
    }
  },

  overrideLayoutChange: function() {
    // AnnealMail needs to listen to some layout changes in order to decrypt
    // messages in case the user changes the layout
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: overrideLayoutChange\n");
    var viewTypeElementIds = ["messagePaneVertical",
      "messagePaneClassic",
      "messagePaneWide"
    ];
    var i;
    for (i = 0; i < viewTypeElementIds.length; i++) {
      let elementId = viewTypeElementIds[i];
      let element = document.getElementById(elementId);
      if (element) {
        try {
          var oldValue = element.getAttribute("oncommand").replace(/;/g, "");
          var arg = oldValue.replace(/^(.*)(\(.*\))/, "$2");
          element.setAttribute("oncommand", "AnnealMail.msg.changeMailLayout" + arg);
        }
        catch (ex) {}
      }
    }

    var toggleMsgPaneElementIds = ["cmd_toggleMessagePane"];
    for (i = 0; i < toggleMsgPaneElementIds.length; i++) {
      let elementId = toggleMsgPaneElementIds[i];
      let element = document.getElementById(elementId);
      if (element) {
        try {
          element.setAttribute("oncommand", "AnnealMail.msg.toggleMessagePane()");
        }
        catch (ex) {}
      }
    }
  },

  changeMailLayout: function(viewType) {
    // call the original layout change 1st
    ChangeMailLayout(viewType);

    // This event requires that we re-subscribe to these events!
    AnnealMail.msg.messagePane.addEventListener("unload", AnnealMail.msg.messageFrameUnload.bind(AnnealMail.msg), true);
    this.messageReload(false);
  },

  toggleMessagePane: function() {
    AnnealMail.hdrView.statusBarHide();
    MsgToggleMessagePane(true);

    var button = document.getElementById("button_annealmail_decrypt");
    if (gFolderDisplay.messageDisplay.visible) {
      button.removeAttribute("disabled");
    }
    else {
      button.setAttribute("disabled", "true");
    }
  },

  getCurrentMsgUriSpec: function() {
    try {
      if (gFolderDisplay.selectedMessages.length != 1)
        return "";

      var uriSpec = gFolderDisplay.selectedMessageUris[0];
      //AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: getCurrentMsgUriSpec: uriSpec="+uriSpec+"\n");

      return uriSpec;

    }
    catch (ex) {
      return "";
    }
  },

  getCurrentMsgUrl: function() {
    var uriSpec = this.getCurrentMsgUriSpec();
    return this.getUrlFromUriSpec(uriSpec);
  },

  getUrlFromUriSpec: function(uriSpec) {
    try {
      if (!uriSpec)
        return null;

      var msgService = messenger.messageServiceFromURI(uriSpec);

      var urlObj = {};
      msgService.GetUrlForUri(uriSpec, urlObj, msgWindow);

      var url = urlObj.value;

      if (url.scheme == "file") {
        return url;
      }
      else {
        return url.QueryInterface(Components.interfaces.nsIMsgMailNewsUrl);
      }

    }
    catch (ex) {
      return null;
    }
  },

  updateOptionsDisplay: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: updateOptionsDisplay: \n");
    var optList = ["autoDecrypt"];

    for (let j = 0; j < optList.length; j++) {
      let menuElement = document.getElementById("annealmail_" + optList[j]);
      menuElement.setAttribute("checked", AnnealMailPrefs.getPref(optList[j]) ? "true" : "false");

      menuElement = document.getElementById("annealmail_" + optList[j] + "2");
      if (menuElement)
        menuElement.setAttribute("checked", AnnealMailPrefs.getPref(optList[j]) ? "true" : "false");
    }

    optList = ["decryptverify"];
    for (let j = 0; j < optList.length; j++) {
      let menuElement = document.getElementById("annealmail_" + optList[j]);
      if (AnnealMail.msg.decryptButton && AnnealMail.msg.decryptButton.disabled) {
        menuElement.setAttribute("disabled", "true");
      }
      else {
        menuElement.removeAttribute("disabled");
      }

      menuElement = document.getElementById("annealmail_" + optList[j] + "2");
      if (menuElement) {
        if (AnnealMail.msg.decryptButton && AnnealMail.msg.decryptButton.disabled) {
          menuElement.setAttribute("disabled", "true");
        }
        else {
          menuElement.removeAttribute("disabled");
        }
      }
    }
  },

  displayMainMenu: function(menuPopup) {

    function traverseTree(currentElement, func) {
      if (currentElement) {
        func(currentElement);
        if (currentElement.id)
          AnnealMailLog.DEBUG("traverseTree: " + currentElement.id + "\n");

        // Traverse the tree
        var i = 0;
        var currentElementChild = currentElement.childNodes[i];
        while (currentElementChild) {
          // Recursively traverse the tree structure of the child node
          traverseTree(currentElementChild, func);
          i++;
          currentElementChild = currentElement.childNodes[i];
        }
      }
    }

    var p = menuPopup.parentNode;
    var a = document.getElementById("menu_AnnealMailPopup");
    var c = a.cloneNode(true);
    p.removeChild(menuPopup);


    traverseTree(c, function _updNode(node) {
      if (node.id && node.id.length > 0) node.id += "2";
    });
    p.appendChild(c);

  },

  toggleAttribute: function(attrName) {
    AnnealMailLog.DEBUG("annealmailMsgessengerOverlay.js: toggleAttribute('" + attrName + "')\n");

    var menuElement = document.getElementById("annealmail_" + attrName);

    var oldValue = AnnealMailPrefs.getPref(attrName);
    AnnealMailPrefs.setPref(attrName, !oldValue);

    this.updateOptionsDisplay();

    if (attrName == "autoDecrypt")
      this.messageReload(false);
  },

  messageImport: function(event) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageImport: " + event + "\n");

    return this.messageParse(!event, true, "", this.getCurrentMsgUriSpec());
  },

  /***
   * check that handler for multipart/signed is set to AnnealMail.
   * if handler is different, change it and reload message
   *
   * @return: - true if handler is OK
   *          - false if handler was changed and message is reloaded
   */
  checkPgpmimeHandler: function() {
    if (AnnealMailVerify.currentCtHandler !== AnnealMailConstants.MIME_HANDLER_PGPMIME) {
      AnnealMailVerify.registerContentTypeHandler();
      this.messageReload();
      return false;
    }

    return true;
  },

  // callback function for automatic decryption
  messageAutoDecrypt: function(event) {
    AnnealMail.msg.messageDecrypt(event, true);
  },

  // analyse message header and decrypt/verify message
  messageDecrypt: function(event, isAuto) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageDecrypt: " + event + "\n");

    var cbObj = {
      event: event,
      isAuto: isAuto
    };

    if (!isAuto) {
      AnnealMailVerify.setManualUri(this.getCurrentMsgUriSpec());
    }

    let contentType = "text/plain";
    if ('content-type' in currentHeaderData) contentType = currentHeaderData['content-type'].headerValue;


    // don't parse message if we know it's a PGP/MIME message
    if (((contentType.search(/^multipart\/signed(;|$)/i) === 0) && (contentType.search(/application\/pgp-signature/i) > 0)) ||
      ((contentType.search(/^multipart\/encrypted(;|$)/i) === 0) && (contentType.search(/application\/pgp-encrypted/i) > 0))) {
      this.messageDecryptCb(event, isAuto, null);
      return;
    }

    try {
      if (gFolderDisplay.selectedMessageIsNews) throw "dummy"; // workaround for broken NNTP support in Gloda
      MsgHdrToMimeMessage(gFolderDisplay.selectedMessage, cbObj, AnnealMail.msg.msgDecryptMimeCb, true, {
        examineEncryptedParts: true,
        partsOnDemand: false
      });
    }
    catch (ex) {
      AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: enigMessageDecrypt: cannot use MsgHdrToMimeMessage\n");
      this.messageDecryptCb(event, isAuto, null);
    }
  },


  msgDecryptMimeCb: function(msg, mimeMsg) {
    // MsgHdrToMimeMessage is not on the main thread which may lead to problems with
    // accessing DOM and debugging

    AnnealMailEvents.dispatchEvent(
      function(argList) {
        var annealmailSvc = AnnealMail.getAnnealMailSvc();
        if (!annealmailSvc) return;

        var event = argList[0];
        var isAuto = argList[1];
        var mimeMsg = argList[2];
        AnnealMail.msg.messageDecryptCb(event, isAuto, mimeMsg);
      }, 0, [this.event, this.isAuto, mimeMsg]);
  },

  /***
   * walk through the (sub-) mime tree and determine PGP/MIME encrypted and signed message parts
   *
   * @mimePart: parent object to walk through
   * @resultObj: object containing two arrays. The resultObj must be pre-initialized by the caller
   *               - encrypted
   *               - signed
   */
  enumerateMimeParts: function(mimePart, resultObj) {
    AnnealMailLog.DEBUG("enumerateMimeParts: partName=\"" + mimePart.partName + "\"\n");
    AnnealMailLog.DEBUG("                    " + mimePart.headers["content-type"] + "\n");
    AnnealMailLog.DEBUG("                    " + mimePart + "\n");
    if (mimePart.parts) {
      AnnealMailLog.DEBUG("                    " + mimePart.parts.length + " subparts\n");
    }
    else {
      AnnealMailLog.DEBUG("                    0 subparts\n");
    }

    try {
      if (typeof(mimePart.contentType) == "string" &&
        mimePart.contentType == "multipart/fake-container") {
        // workaround for wrong content type of signed message
        let signedPart = mimePart.parts[1];
        if (typeof(signedPart.headers["content-type"][0]) == "string") {
          if (signedPart.headers["content-type"][0].search(/application\/pgp-signature/i) >= 0) {
            resultObj.signed.push(signedPart.partName.replace(/\.[0-9]+$/, ""));
            AnnealMailLog.DEBUG("enumerateMimeParts: found signed subpart " + resultObj.signed + "\n");
          }
        }
      }

      var ct = mimePart.headers["content-type"][0];
      if (typeof(ct) == "string") {
        ct = ct.replace(/[\r\n]/g, " ");
        if (ct.search(/multipart\/signed.*application\/pgp-signature/i) >= 0) {
          resultObj.signed.push(mimePart.partName);
        }
        else if (ct.search(/application\/pgp-encrypted/i) >= 0)
          resultObj.encrypted.push(mimePart.partName);
      }
    }
    catch (ex) {
      // catch exception if no headers or no content-type defined.
    }

    var i;
    for (i in mimePart.parts) {
      this.enumerateMimeParts(mimePart.parts[i], resultObj);
    }
  },

  messageDecryptCb: function(event, isAuto, mimeMsg) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageDecryptCb:\n");

    this.buggyExchangeEmailContent = null; // reinit HACK for MS-EXCHANGE-Server Problem

    var annealmailSvc;
    try {
      var showHeaders = 0;
      var contentType = "";

      if (!mimeMsg) {
        AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageDecryptCb: mimeMsg is null\n");
        try {
          contentType = currentHeaderData['content-type'].headerValue;
        }
        catch (ex) {
          contentType = "text/plain";
        }
        mimeMsg = {
          headers: {
            'content-type': [contentType]
          },
          contentType: contentType,
          partName: "1",
          parts: []
        };
      }

      // Copy selected headers
      AnnealMail.msg.savedHeaders = {};

      for (var index = 0; index < AnnealMail.msg.headersList.length; index++) {
        var headerName = AnnealMail.msg.headersList[index];
        var headerValue = "";

        if (mimeMsg.headers[headerName]) {
          headerValue = mimeMsg.headers[headerName].toString();
        }

        AnnealMail.msg.savedHeaders[headerName] = headerValue;
        AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: header " + headerName + ": " + headerValue + "\n");
      }

      var msgSigned = null;
      var msgEncrypted = null;
      var resultObj = {
        encrypted: [],
        signed: []
      };

      if (mimeMsg.parts) {
        this.enumerateMimeParts(mimeMsg, resultObj);
        AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: embedded objects: " + resultObj.encrypted.join(", ") + " / " + resultObj.signed.join(", ") + "\n");

        msgSigned = resultObj.signed.length > 0;
        msgEncrypted = resultObj.encrypted.length > 0;

        // HACK for Zimbra OpenPGP Zimlet
        // Zimbra illegally changes attachment content-type to application/pgp-encrypted which interfers with below
        // see https://sourceforge.net/p/annealmail/bugs/600/

        try {

          if (mimeMsg.parts && mimeMsg.parts.length && mimeMsg.parts.length == 1 &&
            mimeMsg.headers["x-mailer"][0].indexOf("ZimbraWebClient") >= 0 &&
            mimeMsg.parts[0].parts[0].headers["content-type"][0].indexOf("text/plain") >= 0 &&
            mimeMsg.parts[0].headers["content-type"][0].indexOf("multipart/mixed") >= 0 &&
            mimeMsg.parts[0].parts[0].body.indexOf("Version: OpenPGP.js") >= 0 &&
            mimeMsg.parts[0].parts[1].headers["content-type"][0].indexOf("application/pgp-encrypted") >= 0) {
            this.messageParse(!event, false, AnnealMail.msg.savedHeaders["content-transfer-encoding"], this.getCurrentMsgUriSpec());
            return;
          }
        }
        catch (ex) {}


        // HACK for MS-EXCHANGE-Server Problem:
        // check for possible bad mime structure due to buggy exchange server:
        // - multipart/mixed Container with
        //   - application/pgp-encrypted Attachment with name "PGPMIME Versions Identification"
        //   - application/octet-stream Attachment with name "encrypted.asc" having the encrypted content in base64
        // - see:
        //   - http://www.mozilla-annealmail.org/forum/viewtopic.php?f=4&t=425
        //   - http://sourceforge.net/p/annealmail/forum/support/thread/4add2b69/

        // iPGMail produces a similar broken structure, see here:
        //   - https://sourceforge.net/p/annealmail/forum/support/thread/afc9c246/#5de7

        if (mimeMsg.parts && mimeMsg.parts.length && mimeMsg.parts.length == 1 &&
          mimeMsg.parts[0].parts && mimeMsg.parts[0].parts.length && mimeMsg.parts[0].parts.length == 3 &&
          mimeMsg.parts[0].headers["content-type"][0].indexOf("multipart/mixed") >= 0 &&
          mimeMsg.parts[0].parts[0].headers["content-type"][0].search(/multipart\/encrypted/i) < 0 &&
          mimeMsg.parts[0].parts[0].headers["content-type"][0].indexOf("text/plain") >= 0 &&
          mimeMsg.parts[0].parts[1].headers["content-type"][0].indexOf("application/pgp-encrypted") >= 0) {
          if (mimeMsg.parts[0].parts[1].headers["content-type"][0].search(/multipart\/encrypted/i) < 0 &&
            mimeMsg.parts[0].parts[1].headers["content-type"][0].search(/PGPMIME Versions? Identification/i) >= 0 &&
            mimeMsg.parts[0].parts[2].headers["content-type"][0].indexOf("application/octet-stream") >= 0 &&
            mimeMsg.parts[0].parts[2].headers["content-type"][0].indexOf("encrypted.asc") >= 0) {
            this.buggyMailType = "exchange";
          }
          else {
            this.buggyMailType = "iPGMail";
          }

          // signal that the structure matches to save the content later on
          AnnealMailLog.DEBUG("annealmailMessengerOverlay: messageDecryptCb: enabling MS-Exchange hack\n");
          this.buggyExchangeEmailContent = "???";

          this.buggyMailHeader();
          return;
        }
      }

      var contentEncoding = "";
      var xAnnealMailVersion = "";
      var msgUriSpec = this.getCurrentMsgUriSpec();
      var encrypedMsg;

      if (AnnealMail.msg.savedHeaders) {
        contentType = AnnealMail.msg.savedHeaders["content-type"];
        contentEncoding = AnnealMail.msg.savedHeaders["content-transfer-encoding"];
        xAnnealMailVersion = AnnealMail.msg.savedHeaders["x-annealmail-version"];
      }

      let smime = (contentType.search(/multipart\/signed; protocol="application\/pkcs7-signature/i) >= 0);
      if (!smime && (msgSigned || msgEncrypted)) {
        // PGP/MIME messages
        annealmailSvc = AnnealMail.getAnnealMailSvc();
        if (!annealmailSvc)
          return;

        if (!AnnealMail.msg.checkPgpmimeHandler()) return;

        if (isAuto && (!AnnealMailPrefs.getPref("autoDecrypt"))) {

          if (AnnealMailVerify.getManualUri() != this.getCurrentMsgUriSpec()) {
            // decryption set to manual
            AnnealMail.hdrView.updateHdrIcons(AnnealMailConstants.POSSIBLE_PGPMIME, 0, // exitCode, statusFlags
              "", "", // keyId, userId
              "", // sigDetails
              AnnealMailLocale.getString("possiblyPgpMime"), // infoMsg
              null, // blockSeparation
              "", // encToDetails
              null); // xtraStatus
          }
        }
        else if (!isAuto) {
          AnnealMail.msg.messageReload(false);
        }
        return;
      }

      // inline-PGP messages
      if (!isAuto || AnnealMailPrefs.getPref("autoDecrypt")) {
        this.messageParse(!event, false, contentEncoding, msgUriSpec);
      }
    }
    catch (ex) {
      AnnealMailLog.writeException("annealmailMessengerOverlay.js: messageDecryptCb", ex);
    }
  },

  // display header about reparing buggy MS-Exchange messages
  buggyMailHeader: function() {
    let headerSink = msgWindow.msgHeaderSink.securityInfo.QueryInterface(Components.interfaces.nsIEnigMimeHeaderSink);


    let uriStr = AnnealMailURIs.createMessageURI(this.getCurrentMsgUrl(),
      "message/rfc822",
      "",
      "??",
      false);

    let ph = new AnnealMailProtocolHandler();
    let uri = ph.newURI(uriStr, "", "");
    headerSink.updateSecurityStatus("", 0, 0, "", "", "", "", "", uri, "", "1");
  },

  messageParse: function(interactive, importOnly, contentEncoding, msgUriSpec) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParse: " + interactive + "\n");
    var msgFrame = AnnealMailWindows.getFrame(window, "messagepane");
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: msgFrame=" + msgFrame + "\n");

    var bodyElement = msgFrame.document.getElementsByTagName("body")[0];
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: bodyElement=" + bodyElement + "\n");

    if (!bodyElement) return;

    let topElement = bodyElement;
    var findStr = /* interactive ? null : */ "-----BEGIN PGP";
    var msgText = null;
    var foundIndex = -1;

    if (bodyElement.firstChild) {
      let node = bodyElement.firstChild;
      while (node) {
        if (node.nodeName == "DIV") {
          foundIndex = node.textContent.indexOf(findStr);

          if (foundIndex >= 0) {
            if (node.textContent.indexOf(findStr + " LICENSE AUTHORIZATION") == foundIndex)
              foundIndex = -1;
          }
          if (foundIndex >= 0) {
            bodyElement = node;
            break;
          }
        }
        node = node.nextSibling;
      }
    }

    if (foundIndex >= 0) {
      if (AnnealMail.msg.savedHeaders["content-type"].search(/^text\/html/i) === 0) {
        let p = Components.classes["@mozilla.org/parserutils;1"].createInstance(Components.interfaces.nsIParserUtils);
        const de = Components.interfaces.nsIDocumentEncoder;
        msgText = p.convertToPlainText(topElement.innerHTML, de.OutputRaw | de.OutputBodyOnly, 0);
      }
      else {
        msgText = bodyElement.textContent;
      }
    }

    if (!msgText) {
      // No PGP content

      // but this might be caused by the HACK for MS-EXCHANGE-Server Problem
      // - so return only if:
      if (!this.buggyExchangeEmailContent || this.buggyExchangeEmailContent == "???") {
        return;
      }

      AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParse: got buggyExchangeEmailContent = " + this.buggyExchangeEmailContent.substr(0, 50) + "\n");

      // fix the whole invalid email by replacing the contents by the decoded text
      // as plain inline format
      if (this.displayBuggyExchangeMail()) {
        return;
      }
      else {
        msgText = this.buggyExchangeEmailContent;
      }

      msgText = msgText.replace(/\r\n/g, "\n");
      msgText = msgText.replace(/\r/g, "\n");

      // content is in encrypted.asc part:
      let idx = msgText.search(/Content-Type: application\/octet\-stream; name=\"encrypted.asc\"/i);
      if (idx >= 0) {
        msgText = msgText.slice(idx);
      }
      // check whether we have base64 encoding
      var isBase64 = false;
      idx = msgText.search(/Content-Transfer-Encoding: base64/i);
      if (idx >= 0) {
        isBase64 = true;
      }
      // find content behind part header
      idx = msgText.search(/\n\n/);
      if (idx >= 0) {
        msgText = msgText.slice(idx);
      }
      // remove stuff behind content block (usually a final boundary row)
      idx = msgText.search(/\n\n--/);
      if (idx >= 0) {
        msgText = msgText.slice(0, idx + 1);
      }
      // decode base64 if it is encoded that way
      if (isBase64) {
        try {
          msgText = AnnealMailData.decodeBase64(msgText);
        }
        catch (ex) {
          AnnealMailLog.writeException("annealmailMessengerOverlay.js: decodeBase64() ", ex);
        }
        //AnnealMailLog.DEBUG("nach base64 decode: \n" + msgText + "\n");
      }
    }

    var charset = msgWindow ? msgWindow.mailCharacterSet : "";

    // Encode ciphertext to charset from unicode
    msgText = AnnealMailData.convertFromUnicode(msgText, charset);

    var mozPlainText = bodyElement.innerHTML.search(/class=\"moz-text-plain\"/);

    if ((mozPlainText >= 0) && (mozPlainText < 40)) {
      // workaround for too much expanded emoticons in plaintext msg
      var r = new RegExp(/( )(;-\)|:-\)|;\)|:\)|:-\(|:\(|:-\\|:-P|:-D|:-\[|:-\*|\>:o|8-\)|:-\$|:-X|\=-O|:-\!|O:-\)|:\'\()( )/g);
      if (msgText.search(r) >= 0) {
        AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParse: performing emoticons fixing\n");
        msgText = msgText.replace(r, "$2");
      }
    }

    // extract text preceeding and/or following armored block
    var head = "";
    var tail = "";
    if (findStr) {
      head = msgText.substring(0, msgText.indexOf(findStr)).replace(/^[\n\r\s]*/, "");
      head = head.replace(/[\n\r\s]*$/, "");
      var endStart = msgText.indexOf("-----END PGP");
      var nextLine = msgText.substring(endStart).search(/[\n\r]/);
      if (nextLine > 0) {
        tail = msgText.substring(endStart + nextLine).replace(/^[\n\r\s]*/, "");
      }
    }

    //AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: msgText='"+msgText+"'\n");

    var mailNewsUrl = this.getUrlFromUriSpec(msgUriSpec);

    var urlSpec = mailNewsUrl ? mailNewsUrl.spec : "";

    let retry = (charset != "UTF-8" ? 1 : 2);

    AnnealMail.msg.messageParseCallback(msgText, contentEncoding, charset, interactive,
      importOnly, urlSpec, "", retry, head, tail,
      msgUriSpec);
  },


  messageParseCallback: function(msgText, contentEncoding, charset, interactive,
    importOnly, messageUrl, signature, retry,
    head, tail, msgUriSpec) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParseCallback: " + interactive + ", " + interactive + ", importOnly=" + importOnly + ", charset=" + charset + ", msgUrl=" +
      messageUrl +
      ", retry=" + retry + ", signature='" + signature + "'\n");

    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    if (!msgText)
      return;

    var annealmailSvc = AnnealMail.getAnnealMailSvc();
    if (!annealmailSvc)
      return;

    var plainText;
    var exitCode;
    var newSignature = "";
    var statusFlags = 0;

    var errorMsgObj = {};
    var keyIdObj = {};
    var userIdObj = {};
    var sigDetailsObj = {};
    var encToDetailsObj = {};
    var blockSeparationObj = {
      value: ""
    };

    if (importOnly) {
      // Import public key
      exitCode = AnnealMailKeyRing.importKey(window, true, msgText, "",
        errorMsgObj);

    }
    else {

      if (msgText.indexOf("\nCharset:") > 0) {
        // Check if character set needs to be overridden
        var startOffset = msgText.indexOf("-----BEGIN PGP ");

        if (startOffset >= 0) {
          var subText = msgText.substr(startOffset);

          subText = subText.replace(/\r\n/g, "\n");
          subText = subText.replace(/\r/g, "\n");

          var endOffset = subText.search(/\n\n/);
          if (endOffset > 0) {
            subText = subText.substr(0, endOffset) + "\n";

            let matches = subText.match(/\nCharset: *(.*) *\n/i);
            if (matches && (matches.length > 1)) {
              // Override character set
              charset = matches[1];
              AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParseCallback: OVERRIDING charset=" + charset + "\n");
            }
          }
        }
      }

      var exitCodeObj = {};
      var statusFlagsObj = {};

      var signatureObj = {};
      signatureObj.value = signature;

      var uiFlags = interactive ? (nsIAnnealMail.UI_INTERACTIVE |
        nsIAnnealMail.UI_ALLOW_KEY_IMPORT |
        nsIAnnealMail.UI_UNVERIFIED_ENC_OK) : 0;


      plainText = annealmailSvc.decryptMessage(window, uiFlags, msgText,
        signatureObj, exitCodeObj, statusFlagsObj,
        keyIdObj, userIdObj, sigDetailsObj,
        errorMsgObj, blockSeparationObj, encToDetailsObj);

      //AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParseCallback: plainText='"+plainText+"'\n");

      exitCode = exitCodeObj.value;
      newSignature = signatureObj.value;

      if (plainText === "" && exitCode === 0) {
        plainText = " ";
      }

      statusFlags = statusFlagsObj.value;

      AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageParseCallback: newSignature='" + newSignature + "'\n");
    }

    var errorMsg = errorMsgObj.value;

    if (importOnly) {
      if (interactive && errorMsg)
        AnnealMailDialog.longAlert(window, errorMsg);
      return;
    }

    var displayedUriSpec = AnnealMail.msg.getCurrentMsgUriSpec();
    if (!msgUriSpec || (displayedUriSpec == msgUriSpec)) {
      AnnealMail.hdrView.updateHdrIcons(exitCode, statusFlags, keyIdObj.value, userIdObj.value,
        sigDetailsObj.value,
        errorMsg,
        null, // blockSeparation
        encToDetailsObj.value,
        null); // xtraStatus
    }

    var noSecondTry = nsIAnnealMail.GOOD_SIGNATURE |
      nsIAnnealMail.EXPIRED_SIGNATURE |
      nsIAnnealMail.EXPIRED_KEY_SIGNATURE |
      nsIAnnealMail.EXPIRED_KEY |
      nsIAnnealMail.REVOKED_KEY |
      nsIAnnealMail.NO_PUBKEY |
      nsIAnnealMail.NO_SECKEY |
      nsIAnnealMail.IMPORTED_KEY |
      nsIAnnealMail.MISSING_PASSPHRASE |
      nsIAnnealMail.BAD_PASSPHRASE |
      nsIAnnealMail.UNKNOWN_ALGO |
      nsIAnnealMail.DECRYPTION_OKAY |
      nsIAnnealMail.OVERFLOWED;

    if ((exitCode !== 0) && (!(statusFlags & noSecondTry))) {
      // Bad signature/armor
      if (retry == 1) {
        msgText = AnnealMailData.convertFromUnicode(msgText, "UTF-8");
        AnnealMail.msg.messageParseCallback(msgText, contentEncoding, charset,
          interactive, importOnly, messageUrl,
          signature, retry + 1,
          head, tail, msgUriSpec);
        return;
      }
      else if (retry == 2) {
        // Try to verify signature by accessing raw message text directly
        // (avoid recursion by setting retry parameter to false on callback)
        newSignature = "";
        AnnealMail.msg.msgDirectDecrypt(interactive, importOnly, contentEncoding, charset,
          newSignature, 0, head, tail, msgUriSpec,
          AnnealMail.msg.messageParseCallback);
        return;
      }
      else if (retry == 3) {
        msgText = AnnealMailData.convertToUnicode(msgText, "UTF-8");
        AnnealMail.msg.messageParseCallback(msgText, contentEncoding, charset, interactive,
          importOnly, messageUrl, null, retry + 1,
          head, tail, msgUriSpec);
        return;
      }
    }

    if (!plainText) {
      if (interactive && AnnealMail.msg.securityInfo && AnnealMail.msg.securityInfo.statusInfo)
        AnnealMailDialog.longAlert(window, AnnealMail.msg.securityInfo.statusInfo);
      return;
    }

    if (retry >= 2) {
      plainText = AnnealMailData.convertFromUnicode(AnnealMailData.convertToUnicode(plainText, "UTF-8"), charset);
    }

    if (blockSeparationObj.value.indexOf(" ") >= 0) {
      var blocks = blockSeparationObj.value.split(/ /);
      var blockInfo = blocks[0].split(/:/);
      plainText = AnnealMailData.convertFromUnicode(AnnealMailLocale.getString("notePartEncrypted"), charset) +
        "\n\n" + plainText.substr(0, blockInfo[1]) + "\n\n" + AnnealMailLocale.getString("noteCutMessage");
    }

    // Save decrypted message status, headers, and content
    var headerList = {
      "subject": "",
      "from": "",
      "date": "",
      "to": "",
      "cc": ""
    };

    var index, headerName;

    if (!gViewAllHeaders) {
      for (index = 0; index < headerList.length; index++) {
        headerList[index] = "";
      }

    }
    else {
      for (index = 0; index < gExpandedHeaderList.length; index++) {
        headerList[gExpandedHeaderList[index].name] = "";
      }

      for (headerName in currentHeaderData) {
        headerList[headerName] = "";
      }
    }

    for (headerName in headerList) {
      if (currentHeaderData[headerName])
        headerList[headerName] = currentHeaderData[headerName].headerValue;
    }

    // WORKAROUND
    if (headerList.cc == headerList.to)
      headerList.cc = "";

    var hasAttachments = currentAttachments && currentAttachments.length;
    var attachmentsEncrypted = true;

    for (index in currentAttachments) {
      if (!AnnealMail.msg.checkEncryptedAttach(currentAttachments[index])) {
        if (!AnnealMail.msg.checkSignedAttachment(currentAttachments, index)) attachmentsEncrypted = false;
      }
    }

    var msgRfc822Text = "";
    if (head || tail) {
      if (head) {
        // print a warning if the signed or encrypted part doesn't start
        // quite early in the message
        let matches = head.match(/(\n)/g);
        if (matches && matches.length > 10) {
          msgRfc822Text = AnnealMailData.convertFromUnicode(AnnealMailLocale.getString("notePartEncrypted"), charset) + "\n\n";
        }
        msgRfc822Text += head + "\n\n";
      }
      msgRfc822Text += AnnealMailData.convertFromUnicode(AnnealMailLocale.getString("beginPgpPart"), charset) + "\n\n";
    }
    msgRfc822Text += plainText;
    if (head || tail) {
      msgRfc822Text += "\n\n" + AnnealMailData.convertFromUnicode(AnnealMailLocale.getString("endPgpPart"), charset) + "\n\n" + tail;
    }

    AnnealMail.msg.decryptedMessage = {
      url: messageUrl,
      uri: msgUriSpec,
      headerList: headerList,
      hasAttachments: hasAttachments,
      attachmentsEncrypted: attachmentsEncrypted,
      charset: charset,
      plainText: msgRfc822Text
    };

    var msgFrame = AnnealMailWindows.getFrame(window, "messagepane");
    var bodyElement = msgFrame.document.getElementsByTagName("body")[0];

    // don't display decrypted message if message selection has changed
    displayedUriSpec = AnnealMail.msg.getCurrentMsgUriSpec();
    if (msgUriSpec && displayedUriSpec && (displayedUriSpec != msgUriSpec)) return;


    // Create and load one-time message URI
    var messageContent = AnnealMail.msg.getDecryptedMessage("message/rfc822", false);

    AnnealMail.msg.noShowReload = true;
    var node;
    bodyElement = msgFrame.document.getElementsByTagName("body")[0];
    if (bodyElement.firstChild) {
      node = bodyElement.firstChild;
      var foundIndex = -1;
      var findStr = "-----BEGIN PGP";

      while (node) {
        if (node.nodeName == "DIV") {
          foundIndex = node.textContent.indexOf(findStr);

          if (foundIndex >= 0) {
            if (node.textContent.indexOf(findStr + " LICENSE AUTHORIZATION") == foundIndex)
              foundIndex = -1;
          }
          if (foundIndex >= 0) {
            node.innerHTML = AnnealMailFuncs.formatPlaintextMsg(AnnealMailData.convertToUnicode(messageContent, charset));
            return;
          }
        }
        node = node.nextSibling;
      }

      // if no <DIV> node is found, try with <PRE> (bug 24762)
      node = bodyElement.firstChild;
      foundIndex = -1;
      while (node) {
        if (node.nodeName == "PRE") {
          foundIndex = node.textContent.indexOf(findStr);

          if (foundIndex >= 0) {
            if (node.textContent.indexOf(findStr + " LICENSE AUTHORIZATION") == foundIndex)
              foundIndex = -1;
          }
          if (foundIndex >= 0) {
            node.innerHTML = AnnealMailFuncs.formatPlaintextMsg(AnnealMailData.convertToUnicode(messageContent, charset));
            return;
          }
        }
        node = node.nextSibling;
      }

      // HACK for MS-EXCHANGE-Server Problem:
      // - remove empty text/plain part
      //   and set message content as inner text
      // - missing:
      //   - signal in statusFlags so that we warn in AnnealMail.hdrView.updateHdrIcons()
      if (this.buggyExchangeEmailContent) {
        if (this.displayBuggyExchangeMail()) {
          return;
        }

        AnnealMailLog.DEBUG("annealmailMessengerOverlay: messageParseCallback: got broken MS-Exchange mime message\n");
        messageContent = messageContent.replace(/^\s{0,2}Content-Transfer-Encoding: quoted-printable\s*Content-Type: text\/plain;\s*charset=windows-1252/i, "");
        node = bodyElement.firstChild;
        while (node) {
          if (node.nodeName == "DIV") {
            node.innerHTML = AnnealMailFuncs.formatPlaintextMsg(AnnealMailData.convertToUnicode(messageContent, charset));
            AnnealMail.hdrView.updateHdrIcons(exitCode, statusFlags, keyIdObj.value, userIdObj.value,
              sigDetailsObj.value,
              errorMsg,
              null, // blockSeparation
              encToDetailsObj.value,
              "buggyMailFormat");
            return;
          }
          node = node.nextSibling;
        }
      }

    }

    AnnealMailLog.ERROR("annealmailMessengerOverlay.js: no node found to replace message display\n");

    return;
  },


  // check if an attachment could be signed
  checkSignedAttachment: function(attachmentObj, index) {
    var attachmentList;
    if (index !== null) {
      attachmentList = attachmentObj;
    }
    else {
      attachmentList = currentAttachments;
      for (let i = 0; i < attachmentList.length; i++) {
        if (attachmentList[i].url == attachmentObj.url) {
          index = i;
          break;
        }
      }
      if (index === null) return false;
    }

    var signed = false;
    var findFile;

    var attName = this.getAttachmentName(attachmentList[index]).toLowerCase().replace(/\+/g, "\\+");

    // check if filename is a signature
    if ((this.getAttachmentName(attachmentList[index]).search(/\.(sig|asc)$/i) > 0) ||
      (attachmentList[index].contentType.match(/^application\/pgp\-signature/i))) {
      findFile = new RegExp(attName.replace(/\.(sig|asc)$/, ""));
    }
    else
      findFile = new RegExp(attName + ".(sig|asc)$");

    for (let i in attachmentList) {
      if ((i != index) &&
        (this.getAttachmentName(attachmentList[i]).toLowerCase().search(findFile) === 0))
        signed = true;
    }

    return signed;
  },

  /**
   * Fix broken PGP/MIME messages from MS-Exchange by replacing the broken original
   * message with a fixed copy.
   *
   * no return
   */
  fixBuggyExchangeMail: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: fixBuggyExchangeMail:\n");

    function hideAndResetExchangePane() {
      document.getElementById("annealmailBrokenExchangeBox").setAttribute("collapsed", "true");
      document.getElementById("annealmailFixBrokenMessageProgress").setAttribute("collapsed", "true");
      document.getElementById("annealmailFixBrokenMessageButton").removeAttribute("collapsed");
    }

    document.getElementById("annealmailFixBrokenMessageButton").setAttribute("collapsed", "true");
    document.getElementById("annealmailFixBrokenMessageProgress").removeAttribute("collapsed");

    let msg = gFolderDisplay.messageDisplay.displayedMessage;

    let p = AnnealMailFixExchangeMsg.fixExchangeMessage(msg, this.buggyMailType);
    p.then(
      function _success(msgKey) {
        // display message with given msgKey

        AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: fixBuggyExchangeMail: _success: msgKey=" + msgKey + "\n");

        if (msgKey) {
          let index = gFolderDisplay.view.dbView.findIndexFromKey(msgKey, true);
          AnnealMailLog.DEBUG("  ** index = " + index + "\n");

          AnnealMailTimer.setTimeout(function() {
            gFolderDisplay.view.dbView.selectMsgByKey(msgKey);
          }, 750);
        }

        hideAndResetExchangePane();
      }
    );
    p.catch(function _rejected() {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("fixBrokenExchangeMsg.failed"));
      hideAndResetExchangePane();
    });
  },

  /**
   * Attempt to work around bug with headers of MS-Exchange message.
   * Reload message content
   *
   * @return: true:  message displayed
   *          false: could not handle message
   */
  displayBuggyExchangeMail: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: displayBuggyExchangeMail\n");
    let hdrs = Components.classes["@mozilla.org/messenger/mimeheaders;1"].createInstance(Components.interfaces.nsIMimeHeaders);
    hdrs.initialize(this.buggyExchangeEmailContent);
    let ct = hdrs.extractHeader("content-type", true);

    if (ct && ct.search(/^text\/plain/i) === 0) {
      let bi = this.buggyExchangeEmailContent.search(/\r?\n/);
      let boundary = this.buggyExchangeEmailContent.substr(2, bi - 2);
      let startMsg = this.buggyExchangeEmailContent.search(/\r?\n\r?\n/);
      let msgText;

      if (this.buggyMailType == "exchange") {
        msgText = 'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="' + boundary + '"\r\n' +
          this.buggyExchangeEmailContent.substr(startMsg);
      }
      else {
        msgText = 'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="' + boundary + '"\r\n' +
          "\r\n" + boundary + "\r\n" +
          "Content-Type: application/pgp-encrypted\r\n" +
          "Content-Description: PGP/MIME version identification\r\n\r\n" +
          "Version: 1\r\n\r\n" +
          this.buggyExchangeEmailContent.substr(startMsg).replace(/^Content-Type: +application\/pgp-encrypted/im,
            "Content-Type: application/octet-stream");

      }

      let annealmailSvc = AnnealMail.getAnnealMailSvc();
      if (!annealmailSvc) return false;

      let uri = annealmailSvc.createMessageURI(this.getCurrentMsgUrl(),
        "message/rfc822",
        "",
        msgText,
        false);

      AnnealMailVerify.setMsgWindow(msgWindow, null);
      messenger.loadURL(window, uri);

      // Thunderbird
      let atv = document.getElementById("attachmentView");
      if (atv) {
        atv.setAttribute("collapsed", "true");
      }

      // SeaMonkey
      let eab = document.getElementById("expandedAttachmentBox");
      if (eab) {
        eab.setAttribute("collapsed", "true");
      }

      return true;
    }

    return false;
  },

  // check if the attachment could be encrypted
  checkEncryptedAttach: function(attachment) {
    return (this.getAttachmentName(attachment).match(/\.(ccr|pgp|asc)$/i) ||
      (attachment.contentType.match(/^application\/pgp(\-.*)?$/i)) &&
      (attachment.contentType.search(/^application\/pgp\-signature/i) < 0));
  },

  getAttachmentName: function(attachment) {
    if ("name" in attachment) {
      // Thunderbird
      return attachment.name;
    }
    else
    // SeaMonkey
      return attachment.displayName;
  },

  escapeTextForHTML: function(text, hyperlink) {
    // Escape special characters
    if (text.indexOf("&") > -1)
      text = text.replace(/&/g, "&amp;");

    if (text.indexOf("<") > -1)
      text = text.replace(/</g, "&lt;");

    if (text.indexOf(">") > -1)
      text = text.replace(/>/g, "&gt;");

    if (text.indexOf("\"") > -1)
      text = text.replace(/"/g, "&quot;");

    if (!hyperlink)
      return text;

    // Hyperlink email addresses
    var addrs = text.match(/\b[A-Za-z0-9_+\-\.]+@[A-Za-z0-9\-\.]+\b/g);

    var newText, offset, loc;
    if (addrs && addrs.length) {
      newText = "";
      offset = 0;

      for (var j = 0; j < addrs.length; j++) {
        var addr = addrs[j];

        loc = text.indexOf(addr, offset);
        if (loc < offset)
          break;

        if (loc > offset)
          newText += text.substr(offset, loc - offset);

        // Strip any period off the end of address
        addr = addr.replace(/[\.]$/, "");

        if (!addr.length)
          continue;

        newText += "<a href=\"mailto:" + addr + "\">" + addr + "</a>";

        offset = loc + addr.length;
      }

      newText += text.substr(offset, text.length - offset);

      text = newText;
    }

    // Hyperlink URLs
    var urls = text.match(/\b(http|https|ftp):\S+\s/g);

    if (urls && urls.length) {
      newText = "";
      offset = 0;

      for (var k = 0; k < urls.length; k++) {
        var url = urls[k];

        loc = text.indexOf(url, offset);
        if (loc < offset)
          break;

        if (loc > offset)
          newText += text.substr(offset, loc - offset);

        // Strip delimiters off the end of URL
        url = url.replace(/\s$/, "");
        url = url.replace(/([\),\.']|&gt;|&quot;)$/, "");

        if (!url.length)
          continue;

        newText += "<a href=\"" + url + "\">" + url + "</a>";

        offset = loc + url.length;
      }

      newText += text.substr(offset, text.length - offset);

      text = newText;
    }

    return text;
  },

  getDecryptedMessage: function(contentType, includeHeaders) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: getDecryptedMessage: " + contentType + ", " + includeHeaders + "\n");

    if (!AnnealMail.msg.decryptedMessage)
      return "No decrypted message found!\n";

    var annealmailSvc = AnnealMail.getAnnealMailSvc();
    if (!annealmailSvc)
      return "";

    var headerList = AnnealMail.msg.decryptedMessage.headerList;

    var statusLine = AnnealMail.msg.securityInfo ? AnnealMail.msg.securityInfo.statusLine : "";

    var contentData = "";

    var headerName;

    if (contentType == "message/rfc822") {
      // message/rfc822

      if (includeHeaders) {
        try {

          var msg = gFolderDisplay.selectedMessage;
          if (msg) {
            let msgHdr = {
              "From": msg.author,
              "Subject": msg.subject,
              "To": msg.recipients,
              "Cc": msg.ccList,
              "Date": AnnealMailTime.getDateTime(msg.dateInSeconds, true, true)
            };


            if (gFolderDisplay.selectedMessageIsNews) {
              if (currentHeaderData.newsgroups) {
                msgHdr.Newsgroups = currentHeaderData.newsgroups.headerValue;
              }
            }

            for (let headerName in msgHdr) {
              if (msgHdr[headerName] && msgHdr[headerName].length > 0)
                contentData += headerName + ": " + msgHdr[headerName] + "\r\n";
            }

          }
        }
        catch (ex) {
          // the above seems to fail every now and then
          // so, here is the fallback
          for (let headerName in headerList) {
            let headerValue = headerList[headerName];
            contentData += headerName + ": " + headerValue + "\r\n";
          }
        }

        contentData += "Content-Type: text/plain";

        if (AnnealMail.msg.decryptedMessage.charset) {
          contentData += "; charset=" + AnnealMail.msg.decryptedMessage.charset;
        }

        contentData += "\r\n";
      }

      contentData += "\r\n";

      if (AnnealMail.msg.decryptedMessage.hasAttachments && (!AnnealMail.msg.decryptedMessage.attachmentsEncrypted)) {
        contentData += AnnealMailData.convertFromUnicode(AnnealMailLocale.getString("enigContentNote"), AnnealMail.msg.decryptedMessage.charset);
      }

      contentData += AnnealMail.msg.decryptedMessage.plainText;

    }
    else {
      // text/html or text/plain

      if (contentType == "text/html") {
        contentData += "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=" + AnnealMail.msg.decryptedMessage.charset + "\">\r\n";

        contentData += "<html><head></head><body>\r\n";
      }

      if (statusLine) {
        if (contentType == "text/html") {
          contentData += "<b>" + AnnealMailLocale.getString("enigHeader") + "</b> " +
            this.escapeTextForHTML(statusLine, false) + "<br>\r\n<hr>\r\n";
        }
        else {
          contentData += AnnealMailLocale.getString("enigHeader") + " " + statusLine + "\r\n\r\n";
        }
      }

      if (includeHeaders) {
        for (headerName in headerList) {
          let headerValue = headerList[headerName];

          if (headerValue) {
            if (contentType == "text/html") {
              contentData += "<b>" + this.escapeTextForHTML(headerName, false) + ":</b> " +
                this.escapeTextForHTML(headerValue, false) + "<br>\r\n";
            }
            else {
              contentData += headerName + ": " + headerValue + "\r\n";
            }
          }
        }
      }

      if (contentType == "text/html") {
        contentData += "<pre>" + this.escapeTextForHTML(AnnealMail.msg.decryptedMessage.plainText, false) + "</pre>\r\n";

        contentData += "</body></html>\r\n";

      }
      else {

        contentData += "\r\n" + AnnealMail.msg.decryptedMessage.plainText;
      }

      if (!(AnnealMailOS.isDosLike())) {
        contentData = contentData.replace(/\r\n/g, "\n");
      }
    }

    return contentData;
  },


  msgDefaultPrint: function(elementId) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: this.msgDefaultPrint: " + elementId + "\n");

    goDoCommand(elementId.indexOf("printpreview") >= 0 ? "cmd_printpreview" : "cmd_print");
  },

  msgPrint: function(elementId) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: msgPrint: " + elementId + "\n");

    var contextMenu = (elementId.search("Context") > -1);

    if (!AnnealMail.msg.decryptedMessage || typeof(AnnealMail.msg.decryptedMessage) == "undefined") {
      this.msgDefaultPrint(elementId);
      return;
    }

    var mailNewsUrl = this.getCurrentMsgUrl();

    if (!mailNewsUrl) {
      this.msgDefaultPrint(elementId);
      return;
    }

    if (AnnealMail.msg.decryptedMessage.url != mailNewsUrl.spec) {
      AnnealMail.msg.decryptedMessage = null;
      this.msgDefaultPrint(elementId);
      return;
    }

    var annealmailSvc = AnnealMail.getAnnealMailSvc();
    if (!annealmailSvc) {
      this.msgDefaultPrint(elementId);
      return;
    }

    // Note: Trying to print text/html content does not seem to work with
    //       non-ASCII chars
    var msgContent = this.getDecryptedMessage("message/rfc822", true);

    var uri = annealmailSvc.createMessageURI(AnnealMail.msg.decryptedMessage.url,
      "message/rfc822",
      "",
      msgContent,
      false);

    AnnealMail.msg.createdURIs.push(uri);

    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: msgPrint: uri=" + uri + "\n");

    var messageList = [uri];

    var printPreview = (elementId.indexOf("printpreview") >= 0);

    window.openDialog("chrome://messenger/content/msgPrintEngine.xul",
      "",
      "chrome,dialog=no,all,centerscreen",
      1, messageList, statusFeedback,
      printPreview, Components.interfaces.nsIMsgPrintEngine.MNAB_PRINTPREVIEW_MSG,
      window);

    return;
  },

  messageSave: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageSave: \n");

    if (!AnnealMail.msg.decryptedMessage) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("noDecrypted"));
      return;
    }

    var mailNewsUrl = this.getCurrentMsgUrl();

    if (!mailNewsUrl) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("noMessage"));
      return;
    }

    if (AnnealMail.msg.decryptedMessage.url != mailNewsUrl.spec) {
      AnnealMail.msg.decryptedMessage = null;
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("useButton"));
      return;
    }

    var saveFile = AnnealMailDialog.filePicker(window, AnnealMailLocale.getString("saveHeader"),
      AnnealMail.msg.lastSaveDir, true, "txt",
      null, ["Text files", "*.txt"]);
    if (!saveFile) return;

    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: messageSave: path=" + saveFile.path + "\n");

    if (saveFile.parent)
      AnnealMail.msg.lastSaveDir = AnnealMailFiles.getFilePath(saveFile.parent);

    var textContent = this.getDecryptedMessage("text/plain", true);

    if (!AnnealMailFiles.writeFileContents(saveFile.path, textContent, null)) {
      AnnealMailDialog.alert(window, "Error in saving to file " + saveFile.path);
      return;
    }

    return;
  },

  msgDirectDecrypt: function(interactive, importOnly, contentEncoding, charset, signature,
    bufferSize, head, tail, msgUriSpec, callbackFunction) {
    AnnealMailLog.WRITE("annealmailMessengerOverlay.js: msgDirectDecrypt: contentEncoding=" + contentEncoding + ", signature=" + signature + "\n");
    var mailNewsUrl = this.getCurrentMsgUrl();
    if (!mailNewsUrl)
      return;

    var callbackArg = {
      interactive: interactive,
      importOnly: importOnly,
      contentEncoding: contentEncoding,
      charset: charset,
      messageUrl: mailNewsUrl.spec,
      msgUriSpec: msgUriSpec,
      signature: signature,
      data: "",
      head: head,
      tail: tail,
      callbackFunction: callbackFunction
    };

    var msgSvc = messenger.messageServiceFromURI(msgUriSpec);

    var listener = {
      QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIStreamListener]),
      onStartRequest: function() {
        this.data = "";
        this.inStream = Components.classes["@mozilla.org/scriptableinputstream;1"].
        createInstance(Components.interfaces.nsIScriptableInputStream);

      },
      onDataAvailable: function(req, sup, stream, offset, count) {
        this.inStream.init(stream);
        this.data += this.inStream.read(count);
      },
      onStopRequest: function() {
        var start = this.data.indexOf("-----BEGIN PGP");
        var end = this.data.indexOf("-----END PGP");

        if (start >= 0 && end > start) {
          var tStr = this.data.substr(end);
          var n = tStr.indexOf("\n");
          var r = tStr.indexOf("\r");
          var lEnd = -1;
          if (n >= 0 && r >= 0) {
            lEnd = Math.min(r, n);
          }
          else if (r >= 0) {
            lEnd = r;
          }
          else if (n >= 0)
            lEnd = n;

          if (lEnd >= 0) {
            end += lEnd;
          }

          callbackArg.data = this.data.substring(start, end + 1);
          AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: data: >" + callbackArg.data + "<\n");
          AnnealMail.msg.msgDirectCallback(callbackArg);
        }
      }
    };

    msgSvc.streamMessage(msgUriSpec,
      listener,
      msgWindow,
      null,
      false,
      null,
      false);

  },


  msgDirectCallback: function(callbackArg) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: msgDirectCallback: \n");

    var mailNewsUrl = AnnealMail.msg.getCurrentMsgUrl();
    var urlSpec = mailNewsUrl ? mailNewsUrl.spec : "";
    var newBufferSize = 0;

    var l = urlSpec.length;

    if (urlSpec.substr(0, l) != callbackArg.messageUrl.substr(0, l)) {
      AnnealMailLog.ERROR("annealmailMessengerOverlay.js: msgDirectCallback: Message URL mismatch " + mailNewsUrl.spec + " vs. " + callbackArg.messageUrl + "\n");
      return;
    }

    var msgText = callbackArg.data;
    msgText = AnnealMailData.convertFromUnicode(msgText, "UTF-8");

    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: msgDirectCallback: msgText='" + msgText + "'\n");

    var f = function(argList) {
      var msgText = argList[0];
      var cb = argList[1];
      cb.callbackFunction(msgText, cb.contentEncoding,
        cb.charset,
        cb.interactive,
        cb.importOnly,
        cb.messageUrl,
        cb.signature,
        3,
        cb.head,
        cb.tail,
        cb.msgUriSpec);
    };

    AnnealMailEvents.dispatchEvent(f, 0, [msgText, callbackArg]);
  },


  verifyEmbeddedMsg: function(window, msgUrl, msgWindow, msgUriSpec, contentEncoding, event) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: verifyEmbeddedMsg: msgUrl" + msgUrl + "\n");

    var callbackArg = {
      data: "",
      window: window,
      msgUrl: msgUrl,
      msgWindow: msgWindow,
      msgUriSpec: msgUriSpec,
      contentEncoding: contentEncoding,
      event: event
    };

    var requestCallback = function _cb(data) {
      callbackArg.data = data;
      AnnealMail.msg.verifyEmbeddedCallback(callbackArg);
    };

    var bufferListener = AnnealMailStreams.newStringStreamListener(requestCallback);

    var ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);

    var channel = ioServ.newChannelFromURI(msgUrl);

    channel.asyncOpen(bufferListener, msgUrl);
  },

  verifyEmbeddedCallback: function(callbackArg) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: verifyEmbeddedCallback: \n");


    // HACK for MS-EXCHANGE-Server Problem:
    // - now let's save the mail content for later processing
    if (this.buggyExchangeEmailContent == "???") {
      AnnealMailLog.DEBUG("annealmailMessengerOverlay: verifyEmbeddedCallback: got broken MS-Exchange mime message\n");
      this.buggyExchangeEmailContent = callbackArg.data.replace(/^(\r?\n)*/, "");
      if (this.displayBuggyExchangeMail()) {
        return;
      }
    }

    // try inline PGP
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: verifyEmbeddedCallback: try inline PGP\n");

    AnnealMail.msg.messageParse(!callbackArg.event, false, callbackArg.contentEncoding, callbackArg.msgUriSpec);
  },


  revealAttachments: function(index) {
    if (!index) index = 0;

    if (index < currentAttachments.length) {
      this.handleAttachment("revealName/" + index.toString(), currentAttachments[index]);
    }
  },

  // handle the attachment view toggle
  handleAttchmentEvent: function() {
    let attList = document.getElementById("attachmentList");

    if (attList && attList.itemCount > 0) {
      for (let i = 0; i < attList.itemCount; i++) {
        let att = attList.getItemAtIndex(i);
        att.addEventListener("click", function _f(event) {
          AnnealMail.msg.attachmentListClick('attachmentList', event);
        }, true);
      }
    }
  },

  // handle a selected attachment (decrypt & open or save)
  handleAttachmentSel: function(actionType) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: handleAttachmentSel: actionType=" + actionType + "\n");
    var selectedAttachments;
    var anAttachment;

    // Thunderbird
    var contextMenu = document.getElementById('attachmentItemContext');

    if (contextMenu) {
      // Thunderbird
      selectedAttachments = contextMenu.attachments;
      anAttachment = selectedAttachments[0];
    }
    else {
      // SeaMonkey
      contextMenu = document.getElementById('attachmentListContext');
      selectedAttachments = document.getElementById('attachmentList').selectedItems;
      anAttachment = selectedAttachments[0].attachment;
    }

    switch (actionType) {
      case "saveAttachment":
      case "openAttachment":
      case "importKey":
      case "revealName":
        this.handleAttachment(actionType, anAttachment);
        break;
      case "verifySig":
        this.verifyDetachedSignature(anAttachment);
        break;
    }
  },

  /**
   * save the original file plus the signature file to disk and then verify the signature
   */
  verifyDetachedSignature: function(anAttachment) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: verifyDetachedSignature: url=" + anAttachment.url + "\n");

    var annealmailSvc = AnnealMail.getAnnealMailSvc();
    if (!annealmailSvc) return;

    var origAtt, signatureAtt;

    if ((this.getAttachmentName(anAttachment).search(/\.sig$/i) > 0) ||
      (anAttachment.contentType.search(/^application\/pgp\-signature/i) === 0)) {
      // we have the .sig file; need to know the original file;

      signatureAtt = anAttachment;
      var origName = this.getAttachmentName(anAttachment).replace(/\.sig$/i, "");

      for (let i = 0; i < currentAttachments.length; i++) {
        if (origName == this.getAttachmentName(currentAttachments[i])) {
          origAtt = currentAttachments[i];
          break;
        }
      }
    }
    else {
      // we have a supposedly original file; need to know the .sig file;

      origAtt = anAttachment;
      var sigName = this.getAttachmentName(anAttachment) + ".sig";

      for (let i = 0; i < currentAttachments.length; i++) {
        if (sigName == this.getAttachmentName(currentAttachments[i])) {
          signatureAtt = currentAttachments[i];
          break;
        }
      }
    }

    if (!signatureAtt) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("attachment.noMatchToSignature", [this.getAttachmentName(origAtt)]));
      return;
    }
    if (!origAtt) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("attachment.noMatchFromSignature", [this.getAttachmentName(signatureAtt)]));
      return;
    }

    // open
    var tmpDir = AnnealMailFiles.getTempDir();
    var outFile1, outFile2;
    outFile1 = Components.classes[LOCAL_FILE_CONTRACTID].
    createInstance(Components.interfaces.nsIFile);
    outFile1.initWithPath(tmpDir);
    if (!(outFile1.isDirectory() && outFile1.isWritable())) {
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("noTempDir"));
      return;
    }
    outFile1.append(this.getAttachmentName(origAtt));
    outFile1.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0x180); // equals 0800
    this.writeUrlToFile(origAtt.url, outFile1);

    outFile2 = Components.classes[LOCAL_FILE_CONTRACTID].
    createInstance(Components.interfaces.nsIFile);
    outFile2.initWithPath(tmpDir);
    outFile2.append(this.getAttachmentName(signatureAtt));
    outFile2.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0x180); // equals 0800
    this.writeUrlToFile(signatureAtt.url, outFile2);

    var statusFlagsObj = {};
    var errorMsgObj = {};
    var r = annealmailSvc.verifyAttachment(window, outFile1, outFile2, statusFlagsObj, errorMsgObj);

    if (r === 0)
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("signature.verifiedOK", [this.getAttachmentName(origAtt)]) + "\n\n" + errorMsgObj.value);
    else
      AnnealMailDialog.alert(window, AnnealMailLocale.getString("signature.verifyFailed", [this.getAttachmentName(origAtt)]) + "\n\n" +
        errorMsgObj.value);

    outFile1.remove(false);
    outFile2.remove(false);
  },

  writeUrlToFile: function(srcUrl, outFile) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: writeUrlToFile: outFile=" + outFile.path + "\n");
    var ioServ = Components.classes[IOSERVICE_CONTRACTID].
    getService(Components.interfaces.nsIIOService);
    var msgUri = ioServ.newURI(srcUrl, null, null);
    var channel = ioServ.newChannelFromURI(msgUri);
    var istream = channel.open();

    var fstream = Components.classes["@mozilla.org/network/safe-file-output-stream;1"]
      .createInstance(Components.interfaces.nsIFileOutputStream);
    var buffer = Components.classes["@mozilla.org/network/buffered-output-stream;1"]
      .createInstance(Components.interfaces.nsIBufferedOutputStream);
    fstream.init(outFile, 0x04 | 0x08 | 0x20, 0x180, 0); // write, create, truncate
    buffer.init(fstream, 8192);

    while (istream.available() > 0) {
      buffer.writeFrom(istream, istream.available());
    }

    // Close the output streams
    if (buffer instanceof Components.interfaces.nsISafeOutputStream)
      buffer.finish();
    else
      buffer.close();

    if (fstream instanceof Components.interfaces.nsISafeOutputStream)
      fstream.finish();
    else
      fstream.close();

    // Close the input stream
    istream.close();
  },

  handleAttachment: function(actionType, anAttachment) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: handleAttachment: actionType=" + actionType + ", anAttachment(url)=" + anAttachment.url + "\n");

    var argumentsObj = {
      actionType: actionType,
      attachment: anAttachment,
      forceBrowser: false,
      data: ""
    };

    var f = function _cb(data) {
      argumentsObj.data = data;
      AnnealMail.msg.decryptAttachmentCallback([argumentsObj]);
    };

    var bufferListener = AnnealMailStreams.newStringStreamListener(f);
    var ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
    var msgUri = ioServ.newURI(argumentsObj.attachment.url, null, null);

    var channel = ioServ.newChannelFromURI(msgUri);
    channel.asyncOpen(bufferListener, msgUri);
  },

  setAttachmentName: function(attachment, newLabel, index) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: setAttachmentName (" + newLabel + "):\n");

    var attList = document.getElementById("attachmentList");
    if (attList) {
      var attNode = attList.firstChild;
      while (attNode) {
        // TB <= 9
        if (attNode.getAttribute("attachmentUrl") == attachment.url)
          attNode.setAttribute("label", newLabel);
        // TB >= 10
        if (attNode.getAttribute("name") == attachment.name)
          attNode.setAttribute("name", newLabel);
        attNode = attNode.nextSibling;
      }
    }

    if (typeof(attachment.displayName) == "undefined") {
      attachment.name = newLabel;
    }
    else
      attachment.displayName = newLabel;

    if (index && index.length > 0) {
      this.revealAttachments(parseInt(index, 10) + 1);
    }
  },

  decryptAttachmentCallback: function(cbArray) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: decryptAttachmentCallback:\n");

    var callbackArg = cbArray[0];
    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    var exitCodeObj = {};
    var statusFlagsObj = {};
    var errorMsgObj = {};
    var exitStatus = -1;

    var annealmailSvc = AnnealMail.getAnnealMailSvc();
    var outFile;
    var origFilename;
    var rawFileName = AnnealMail.msg.getAttachmentName(callbackArg.attachment).replace(/\.(asc|pgp|ccr)$/i, "");

    if (callbackArg.actionType != "importKey") {
      origFilename = AnnealMailAttachment.getFileName(window, callbackArg.data);
      if (origFilename && origFilename.length > rawFileName.length) rawFileName = origFilename;
    }

    if (callbackArg.actionType == "saveAttachment") {
      outFile = AnnealMailDialog.filePicker(window, AnnealMailLocale.getString("saveAttachmentHeader"),
        AnnealMail.msg.lastSaveDir, true, "",
        rawFileName, null);
      if (!outFile) return;
    }
    else if (callbackArg.actionType.substr(0, 10) == "revealName") {
      if (origFilename && origFilename.length > 0) {
        AnnealMail.msg.setAttachmentName(callbackArg.attachment, origFilename + ".pgp", callbackArg.actionType.substr(11, 10));
      }
      AnnealMail.msg.setAttachmentReveal(null);
      return;
    }
    else {
      // open
      var tmpDir = AnnealMailFiles.getTempDir();
      try {
        outFile = Components.classes[LOCAL_FILE_CONTRACTID].createInstance(Components.interfaces.nsIFile);
        outFile.initWithPath(tmpDir);
        if (!(outFile.isDirectory() && outFile.isWritable())) {
          errorMsgObj.value = AnnealMailLocale.getString("noTempDir");
          return;
        }
        outFile.append(rawFileName);
        outFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0x180); // equals 0800
      }
      catch (ex) {
        errorMsgObj.value = AnnealMailLocale.getString("noTempDir");
        return;
      }
    }

    if (callbackArg.actionType == "importKey") {
      var preview = AnnealMailKey.getKeyListFromKeyBlock(callbackArg.data, errorMsgObj);

      if (errorMsgObj.value === "") {
        if (preview.length > 0) {
          if (preview.length == 1) {
            exitStatus = AnnealMailDialog.confirmDlg(window, AnnealMailLocale.getString("doImportOne", [preview[0].name, preview[0].id]));
          }
          else {
            exitStatus = AnnealMailDialog.confirmDlg(window,
              AnnealMailLocale.getString("doImportMultiple", [
                preview.map(function(a) {
                  return "\t" + a.name + " (" + a.id + ")";
                }).
                join("\n")
              ]));
          }

          if (exitStatus) {
            try {
              exitStatus = AnnealMailKeyRing.importKey(parent, false, callbackArg.data, "", errorMsgObj);
            }
            catch (ex) {}

            if (exitStatus === 0) {
              var keyList = preview.map(function(a) {
                return a.id;
              });
              AnnealMailDialog.keyImportDlg(window, keyList);
            }
            else {
              AnnealMailDialog.alert(window, AnnealMailLocale.getString("failKeyImport") + "\n" + errorMsgObj.value);
            }
          }
        }
        else {
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("noKeyFound") + "\n" + errorMsgObj.value);
        }
      }
      else {
        AnnealMailDialog.alert(window, AnnealMailLocale.getString("previewFailed") + "\n" + errorMsgObj.value);
      }

      return;
    }

    exitStatus = annealmailSvc.decryptAttachment(window, outFile,
      AnnealMail.msg.getAttachmentName(callbackArg.attachment),
      callbackArg.data,
      exitCodeObj, statusFlagsObj,
      errorMsgObj);

    if ((!exitStatus) || exitCodeObj.value !== 0) {
      exitStatus = false;
      if ((statusFlagsObj.value & nsIAnnealMail.DECRYPTION_OKAY) &&
        (statusFlagsObj.value & nsIAnnealMail.UNVERIFIED_SIGNATURE)) {

        if (callbackArg.actionType == "openAttachment") {
          exitStatus = AnnealMailDialog.confirmDlg(window, AnnealMailLocale.getString("decryptOkNoSig"), AnnealMailLocale.getString("msgOvl.button.contAnyway"));
        }
        else {
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("decryptOkNoSig"));
        }
      }
      else {
        AnnealMailDialog.alert(window, AnnealMailLocale.getString("failedDecrypt") + "\n\n" + errorMsgObj.value);
        exitStatus = false;
      }
    }
    if (exitStatus) {
      if (statusFlagsObj.value & nsIAnnealMail.IMPORTED_KEY) {

        if (exitCodeObj.keyList) {
          let importKeyList = exitCodeObj.keyList.map(function(a) {
            return a.id;
          });
          AnnealMailDialog.keyImportDlg(window, importKeyList);
        }
      }
      else if (statusFlagsObj.value & nsIAnnealMail.DISPLAY_MESSAGE) {
        HandleSelectedAttachments('open');
      }
      else if ((statusFlagsObj.value & nsIAnnealMail.DISPLAY_MESSAGE) ||
        (callbackArg.actionType == "openAttachment")) {
        var ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
        var outFileUri = ioServ.newFileURI(outFile);
        var fileExt = outFile.leafName.replace(/(.*\.)(\w+)$/, "$2");
        if (fileExt && !callbackArg.forceBrowser) {
          var extAppLauncher = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsPIExternalAppLauncher);
          extAppLauncher.deleteTemporaryFileOnExit(outFile);

          try {
            var mimeService = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
            var fileMimeType = mimeService.getTypeFromFile(outFile);
            var fileMimeInfo = mimeService.getFromTypeAndExtension(fileMimeType, fileExt);

            fileMimeInfo.launchWithFile(outFile);
          }
          catch (ex) {
            // if the attachment file type is unknown, an exception is thrown,
            // so let it be handled by a browser window
            AnnealMail.msg.loadExternalURL(outFileUri.asciiSpec);
          }
        }
        else {
          // open the attachment using an external application
          AnnealMail.msg.loadExternalURL(outFileUri.asciiSpec);
        }
      }
    }
  },

  loadExternalURL: function(url) {
    if (AnnealMailApp.isSuite()) {
      AnnealMail.msg.loadURLInNavigatorWindow(url, true);
    }
    else {
      messenger.launchExternalURL(url);
    }
  },

  // retrieves the most recent navigator window (opens one if need be)
  loadURLInNavigatorWindow: function(url, aOpenFlag) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: loadURLInNavigatorWindow: " + url + ", " + aOpenFlag + "\n");

    var navWindow;

    // if this is a browser window, just use it
    if ("document" in top) {
      var possibleNavigator = top.document.getElementById("main-window");
      if (possibleNavigator &&
        possibleNavigator.getAttribute("windowtype") == "navigator:browser")
        navWindow = top;
    }

    // if not, get the most recently used browser window
    if (!navWindow) {
      var wm;
      wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(
        Components.interfaces.nsIWindowMediator);
      navWindow = wm.getMostRecentWindow("navigator:browser");
    }

    if (navWindow) {

      if ("loadURI" in navWindow)
        navWindow.loadURI(url);
      else
        navWindow._content.location.href = url;

    }
    else if (aOpenFlag) {
      // if no browser window available and it's ok to open a new one, do so
      navWindow = window.open(url, "AnnealMail");
    }

    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: loadURLInNavigatorWindow: navWindow=" + navWindow + "\n");

    return navWindow;
  },

  // handle double click events on Attachments
  attachmentListClick: function(elementId, event) {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: attachmentListClick: event=" + event + "\n");

    var attachment = event.target.attachment;
    if (this.checkEncryptedAttach(attachment)) {
      if (event.button === 0 && event.detail == 2) { // double click
        this.handleAttachment("openAttachment", attachment);
        event.stopPropagation();
      }
    }
  },

  // create a decrypted copy of all selected messages in a target folder

  decryptToFolder: function(destFolder) {
    let msgHdrs = gFolderDisplay ? gFolderDisplay.selectedMessages : null;
    if (!msgHdrs || msgHdrs.length === 0) return;

    AnnealMailDecryptPermanently.dispatchMessages(msgHdrs, destFolder.URI, false, false);
  },

  importAttachedKeys: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: importAttachedKeys\n");

    let keyFound = false;
    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    for (let i in currentAttachments) {
      if (currentAttachments[i].contentType.search(/application\/pgp-keys/i) >= 0) {
        // found attached key
        this.handleAttachment("importKey", currentAttachments[i]);
        keyFound = true;
      }
    }

    return keyFound;
  },

  importKeyFromKeyserver: function() {
    var pubKeyId = "0x" + AnnealMail.msg.securityInfo.keyId;
    var inputObj = {
      searchList: [pubKeyId],
      autoKeyServer: AnnealMailPrefs.getPref("autoKeyServerSelection") ? AnnealMailPrefs.getPref("keyserver").split(/[ ,;]/g)[0] : null
    };
    var resultObj = {};
    AnnealMailWindows.downloadKeys(window, inputObj, resultObj);


    if (resultObj.importedKeys > 0) {
      return true;
    }

    return false;
  },

  // download or import keys
  handleUnknownKey: function() {
    const nsIAnnealMail = Components.interfaces.nsIAnnealMail;

    let imported = false;
    // handline keys embedded in message body

    if (AnnealMail.msg.securityInfo.statusFlags & nsIAnnealMail.INLINE_KEY) {
      return AnnealMail.msg.messageDecrypt(null, false);
    }

    imported = this.importAttachedKeys();
    if (!imported) imported = this.importKeyFromKeyserver();

    if (imported) this.messageReload(false);

    return null;
  },

  // check if all used keys have suitable Ownertrust ("You rely on certifications")
  checkOwnertrust: function() {
    AnnealMailLog.DEBUG("annealmailMessengerOverlay.js: checkOwnertrust\n");

    var resultObj = {};
    let msg = AnnealMailKeyUsability.keyOwnerTrustCheck(resultObj);

    if (msg && (msg.length > 0) && AnnealMailPrefs.getPref("warnOnMissingOwnerTrust")) {
      let actionButtonText = "";

      if (resultObj && resultObj.Count === 1) {
        // single key is concerned
        actionButtonText = AnnealMailLocale.getString("expiry.OpenKeyProperties");
      }
      else {
        // Multiple keys concerned
        actionButtonText = AnnealMailLocale.getString("expiry.OpenKeyManager");
      }

      let checkedObj = {};
      const r = AnnealMailDialog.longAlert(window, msg,
        AnnealMailLocale.getString("dlgNoPrompt"), // checkBoxLabel
        AnnealMailLocale.getString("dlg.button.close"), // okLabel
        actionButtonText, // labelButton2
        null, // labelButton3
        checkedObj); // checkedObj
      if (r >= 0 && checkedObj.value) {
        // Do not show me this dialog again
        AnnealMailPrefs.setPref("warnOnMissingOwnerTrust", false);
      }
      if (r == 1) {
        if (resultObj && resultObj.Count === 1) {
          // single key is concerned, open key details dialog
          AnnealMailWindows.openKeyDetails(window, resultObj.keyId, false);
        }
        else {
          // Multiple keys concerned, open Key Manager
          AnnealMailWindows.openKeyManager(window);
        }
      }
    }

    this.expiryTimer = undefined;
  }
};

window.addEventListener("load", AnnealMail.msg.messengerStartup.bind(AnnealMail.msg), false);
