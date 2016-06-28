/*global Components: false, AnnealMailCore: false, XPCOMUtils: false, AnnealMailData: false, AnnealMailLog: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailProtocolHandler"];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://annealmail/core.jsm");
Components.utils.import("resource://annealmail/data.jsm");
Components.utils.import("resource://annealmail/log.jsm");
Components.utils.import("resource://annealmail/streams.jsm"); /*global AnnealMailStreams: false */
Components.utils.import("resource://annealmail/uris.jsm"); /*global AnnealMailURIs: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */

const NS_SIMPLEURI_CONTRACTID = "@mozilla.org/network/simple-uri;1";
const NS_ANNEALMAILPROTOCOLHANDLER_CONTRACTID = "@mozilla.org/network/protocol;1?name=annealmail";
const NS_ANNEALMAILPROTOCOLHANDLER_CID = Components.ID("{847b3a11-7ab1-11d4-8f02-006008948af5}");
const ASS_CONTRACTID = "@mozilla.org/appshell/appShellService;1";
const WMEDIATOR_CONTRACTID = "@mozilla.org/appshell/window-mediator;1";

const Cc = Components.classes;
const Ci = Components.interfaces;

const nsIProtocolHandler = Ci.nsIProtocolHandler;

var EC = AnnealMailCore;

const gDummyPKCS7 =
  'Content-Type: multipart/mixed;\r\n boundary="------------060503030402050102040303\r\n\r\nThis is a multi-part message in MIME format.\r\n--------------060503030402050102040303\r\nContent-Type: application/x-pkcs7-mime\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303\r\nContent-Type: application/x-annealmail-dummy\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303--\r\n';


function AnnealMailProtocolHandler() {}

AnnealMailProtocolHandler.prototype = {
  classDescription: "AnnealMail Protocol Handler",
  classID: NS_ANNEALMAILPROTOCOLHANDLER_CID,
  contractID: NS_ANNEALMAILPROTOCOLHANDLER_CONTRACTID,
  scheme: "annealmail",
  defaultPort: -1,
  protocolFlags: nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT |
    nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
    nsIProtocolHandler.URI_NORELATIVE |
    nsIProtocolHandler.URI_NOAUTH |
    nsIProtocolHandler.URI_OPENING_EXECUTES_SCRIPT,

  QueryInterface: XPCOMUtils.generateQI([nsIProtocolHandler]),

  newURI: function(aSpec, originCharset, aBaseURI) {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMailProtocolHandler.newURI: aSpec='" + aSpec + "'\n");

    // cut of any parameters potentially added to the URI; these cannot be handled
    if (aSpec.substr(0, 14) == "annealmail:dummy") aSpec = "annealmail:dummy";

    var uri = Cc[NS_SIMPLEURI_CONTRACTID].createInstance(Ci.nsIURI);
    uri.spec = aSpec;

    return uri;
  },

  newChannel: function(aURI) {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMailProtocolHandler.newChannel: URI='" + aURI.spec + "'\n");

    var messageId = AnnealMailData.extractMessageId(aURI.spec);
    var mimeMessageId = AnnealMailData.extractMimeMessageId(aURI.spec);
    var contentType, contentCharset, contentData;

    if (messageId) {
      // Handle annealmail:message/...

      if (!EC.getAnnealMailService()) {
        throw Components.results.NS_ERROR_FAILURE;
      }

      if (AnnealMailURIs.getMessageURI(messageId)) {
        var messageUriObj = AnnealMailURIs.getMessageURI(messageId);

        contentType = messageUriObj.contentType;
        contentCharset = messageUriObj.contentCharset;
        contentData = messageUriObj.contentData;

        AnnealMailLog.DEBUG("annealmail.js: AnnealMailProtocolHandler.newChannel: messageURL=" + messageUriObj.originalUrl + ", content length=" + contentData.length + ", " + contentType + ", " +
          contentCharset + "\n");

        // do NOT delete the messageUriObj now from the list, this will be done once the message is unloaded (fix for bug 9730).

      }
      else if (mimeMessageId) {
        this.handleMimeMessage(mimeMessageId);
      }
      else {

        contentType = "text/plain";
        contentCharset = "";
        contentData = "AnnealMail error: invalid URI " + aURI.spec;
      }

      let channel = AnnealMailStreams.newStringChannel(aURI, contentType, "UTF-8", contentData);

      return channel;
    }

    if (aURI.spec.indexOf(aURI.scheme + "://photo/") === 0) {
      // handle photo ID
      contentType = "image/jpeg";
      contentCharset = "";
      let keyId = aURI.spec.substr(17);
      let exitCodeObj = {};
      let errorMsgObj = {};
      let f = AnnealMailKeyRing.getPhotoFile(keyId, 0, exitCodeObj, errorMsgObj);
      if (exitCodeObj.value === 0) {
        let channel = AnnealMailStreams.newFileChannel(aURI, f, "image/jpeg", true);
        return channel;
      }

      return null;
    }

    if (aURI.spec == aURI.scheme + ":dummy") {
      // Dummy PKCS7 content (to access mimeEncryptedClass)
      return AnnealMailStreams.newStringChannel(aURI, "message/rfc822", "", gDummyPKCS7);
    }

    var winName, spec;
    if (aURI.spec == "about:" + aURI.scheme) {
      // About AnnealMail
      //            winName = "about:"+annealmail;
      winName = "about:annealmail";
      spec = "chrome://annealmail/content/annealmailAbout.xul";

    }
    else if (aURI.spec == aURI.scheme + ":console") {
      // Display annealmail console messages
      winName = "annealmail:console";
      spec = "chrome://annealmail/content/annealmailConsole.xul";

    }
    else if (aURI.spec == aURI.scheme + ":keygen") {
      // Display annealmail key generation console
      winName = "annealmail:keygen";
      spec = "chrome://annealmail/content/annealmailKeygen.xul";

    }
    else {
      // Display AnnealMail about page
      winName = "about:annealmail";
      spec = "chrome://annealmail/content/annealmailAbout.xul";
    }

    var windowManager = Cc[WMEDIATOR_CONTRACTID].getService(Ci.nsIWindowMediator);

    var winEnum = windowManager.getEnumerator(null);
    var recentWin = null;
    while (winEnum.hasMoreElements() && !recentWin) {
      var thisWin = winEnum.getNext();
      if (thisWin.location.href == spec) {
        recentWin = thisWin;
      }
    }

    if (recentWin) {
      recentWin.focus();
    }
    else {
      var appShellSvc = Cc[ASS_CONTRACTID].getService(Ci.nsIAppShellService);
      var domWin = appShellSvc.hiddenDOMWindow;

      domWin.open(spec, "_blank", "chrome,menubar,toolbar,resizable");
    }

    throw Components.results.NS_ERROR_FAILURE;
  },

  handleMimeMessage: function(messageId) {
    //        AnnealMailLog.DEBUG("annealmail.js: AnnealMailProtocolHandler.handleMimeMessage: messageURL="+messageUriObj.originalUrl+", content length="+contentData.length+", "+contentType+", "+contentCharset+"\n");
    AnnealMailLog.DEBUG("annealmail.js: AnnealMailProtocolHandler.handleMimeMessage: messageURL=, content length=, , \n");
  },

  allowPort: function(port, scheme) {
    // non-standard ports are not allowed
    return false;
  }
};
