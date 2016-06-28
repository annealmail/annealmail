/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false */
/*global Cc: false, Ci: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js"); /*global TestHelper: false, component: false, withTestCcrHome: false, withAnnealMail: false */
TestHelper.loadDirectly("tests/mailHelper.js"); /*global MailHelper: false */

testing("decryptPermanently.jsm"); /*global AnnealMailDecryptPermanently: false, Promise: false */
component("annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
/*global msgHdrToMimeMessage: false, MimeMessage: false, MimeContainer: false */
component("annealmail/glodaMime.jsm");
component("annealmail/streams.jsm"); /*global AnnealMailStreams: false */

test(withTestCcrHome(withAnnealMail(function messageIsCopiedToNewDir() {
  loadSecretKey();
  MailHelper.cleanMailFolder(MailHelper.getRootFolder());
  const sourceFolder = MailHelper.createMailFolder("source-box");
  MailHelper.loadEmailToMailFolder("resources/encrypted-email.eml", sourceFolder);

  const header = MailHelper.fetchFirstMessageHeaderIn(sourceFolder);
  const targetFolder = MailHelper.createMailFolder("target-box");
  const move = false;
  const reqSync = true;
  AnnealMailDecryptPermanently.dispatchMessages([header], targetFolder.URI, move, reqSync);

  Assert.equal(targetFolder.getTotalMessages(false), 1);
  Assert.equal(sourceFolder.getTotalMessages(false), 1);
})));

test(withTestCcrHome(withAnnealMail(function messageIsMovedToNewDir() {
  loadSecretKey();
  MailHelper.cleanMailFolder(MailHelper.rootFolder);
  const sourceFolder = MailHelper.createMailFolder("source-box");
  MailHelper.loadEmailToMailFolder("resources/encrypted-email.eml", sourceFolder);

  const header = MailHelper.fetchFirstMessageHeaderIn(sourceFolder);
  const targetFolder = MailHelper.createMailFolder("target-box");
  const move = true;
  const reqSync = true;
  AnnealMailDecryptPermanently.dispatchMessages([header], targetFolder.URI, move, reqSync);

  Assert.equal(targetFolder.getTotalMessages(false), 1);
  Assert.equal(sourceFolder.getTotalMessages(false), 0);
})));

test(withTestCcrHome(withAnnealMail(function messageIsMovedAndDecrypted() {
  loadSecretKey();
  MailHelper.cleanMailFolder(MailHelper.rootFolder);
  const sourceFolder = MailHelper.createMailFolder("source-box");
  MailHelper.loadEmailToMailFolder("resources/encrypted-email.eml", sourceFolder);

  const header = MailHelper.fetchFirstMessageHeaderIn(sourceFolder);
  const targetFolder = MailHelper.createMailFolder("target-box");
  const move = true;
  const reqSync = true;
  AnnealMailDecryptPermanently.dispatchMessages([header], targetFolder.URI, move, reqSync);

  const dispatchedHeader = MailHelper.fetchFirstMessageHeaderIn(targetFolder);
  do_test_pending();
  msgHdrToMimeMessage(
    dispatchedHeader,
    null,
    function(header, mime) {
      Assert.ok(!mime.isEncrypted);
      Assert.assertContains(mime.parts[0].body, "This is encrypted");
      do_test_finished();
    },
    false
  );
})));

test(withTestCcrHome(withAnnealMail(function messageWithAttachemntIsMovedAndDecrypted() {
  loadSecretKey();
  loadPublicKey();
  MailHelper.cleanMailFolder(MailHelper.getRootFolder());
  const sourceFolder = MailHelper.createMailFolder("source-box");
  MailHelper.loadEmailToMailFolder("resources/encrypted-email-with-attachment.eml", sourceFolder);

  const header = MailHelper.fetchFirstMessageHeaderIn(sourceFolder);
  const targetFolder = MailHelper.createMailFolder("target-box");
  const move = true;
  const reqSync = true;
  AnnealMailDecryptPermanently.dispatchMessages([header], targetFolder.URI, move, reqSync);

  const dispatchedHeader = MailHelper.fetchFirstMessageHeaderIn(targetFolder);
  do_test_pending();
  msgHdrToMimeMessage(
    dispatchedHeader,
    null,
    function(header, mime) {
      Assert.ok(!mime.isEncrypted);
      Assert.assertContains(mime.parts[0].parts[0].body, "This is encrypted");
      const atts = extractAttachments(mime);
      Assert.ok(!atts[0].isEncrypted);
      Assert.assertContains(atts[0].body, "This is an attachment.");
      do_test_finished();
    },
    false
  );
})));

var loadSecretKey = function() {
  const secretKey = do_get_file("resources/dev-strike.sec", false);
  AnnealMailKeyRing.importKeyFromFile(secretKey, [], {});
};

var loadPublicKey = function() {
  const publicKey = do_get_file("resources/dev-strike.asc", false);
  AnnealMailKeyRing.importKeyFromFile(publicKey, [], {});
};

function stringFromUrl(url) {
  const inspector = Cc["@mozilla.org/jsinspector;1"].getService(Ci.nsIJSInspector);
  let result = null;
  const p = new Promise(function(resolve, reject) {
    const iOService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    const uri = iOService.newURI(url, null, null);
    const attChannel = iOService.newChannelFromURI(uri);
    const listener = AnnealMailStreams.newStringStreamListener(function(data) {
      result = data;
      inspector.exitNestedEventLoop();
      resolve();
    });
    attChannel.asyncOpen(listener, uri);
  });

  if (!result) {
    inspector.enterNestedEventLoop({
      value: 0
    });
  }
  return result;
}

function extractAttachment(att) {
  const name = att.name;
  const body = stringFromUrl(att.url);
  const isEncrypted = att.isEncrypted;
  return {
    name: name,
    body: body,
    isEncrypted: isEncrypted
  };
}

function extractAttachments(msg) {
  const result = [];
  for (let i = 0; i < msg.allAttachments.length; i++) {
    result.push(extractAttachment(msg.allAttachments[i]));
  }
  return result;
}
