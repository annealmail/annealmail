/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailURIs"];

const Cu = Components.utils;

Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */

const messageIdList = {};
const encryptedUris = [];

const AnnealMailURIs = {
  createMessageURI: function(originalUrl, contentType, contentCharset, contentData, persist) {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.createMessageURI: " + originalUrl +
      ", " + contentType + ", " + contentCharset + "\n");

    const messageId = "msg" + Math.floor(Math.random() * 1.0e9);

    messageIdList[messageId] = {
      originalUrl: originalUrl,
      contentType: contentType,
      contentCharset: contentCharset,
      contentData: contentData,
      persist: persist
    };

    return "annealmail:message/" + messageId;
  },

  deleteMessageURI: function(uri) {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.deleteMessageURI: " + uri + "\n");

    const messageId = AnnealMailData.extractMessageId(uri);

    if (!messageId) {
      return false;
    }
    else {
      return (delete messageIdList[messageId]);
    }
  },

  getMessageURI: function(messageId) {
    return messageIdList[messageId];
  },

  /*
   * remember the fact a URI is encrypted
   *
   * @param String msgUri
   *
   * @return null
   */
  rememberEncryptedUri: function(uri) {
    AnnealMailLog.DEBUG("uris.jsm: rememberEncryptedUri: uri=" + uri + "\n");
    if (encryptedUris.indexOf(uri) < 0) {
      encryptedUris.push(uri);
    }
  },

  /*
   * unremember the fact a URI is encrypted
   *
   * @param String msgUri
   *
   * @return null
   */
  forgetEncryptedUri: function(uri) {
    AnnealMailLog.DEBUG("uris.jsm: forgetEncryptedUri: uri=" + uri + "\n");
    const pos = encryptedUris.indexOf(uri);
    if (pos >= 0) {
      encryptedUris.splice(pos, 1);
    }
  },

  /*
   * determine if a URI was remebered as encrypted
   *
   * @param String msgUri
   *
   * @return: Boolean true if yes, false otherwise
   */
  isEncryptedUri: function(uri) {
    AnnealMailLog.DEBUG("uris.jsm: isEncryptedUri: uri=" + uri + "\n");
    return encryptedUris.indexOf(uri) >= 0;
  },

  registerOn: function(target) {
    target.createMessageURI = AnnealMailURIs.createMessageURI;
    target.deleteMessageURI = AnnealMailURIs.deleteMessageURI;
  }
};
