/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false, withTestCcrHome:false */
/*global Ec: false, Cc: false, Ci: false, do_print: false, AnnealMailCore: false, AnnealMailKeyEditor: false, Components: false, component: false, AnnealMailPrefs: false, AnnealMailExecution: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js"); /*global withAnnealMail: false */

testing("keyEditor.jsm"); /*global editKey: false */
component("annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
component("annealmail/time.jsm"); /*global AnnealMailTime: false */

test(withTestCcrHome(withAnnealMail(function shouldEditKey() {
  importKeys();
  do_test_pending();
  var window = JSUnit.createStubWindow();
  editKey(
    window,
    false,
    null,
    "781617319CE311C4",
    "trust", {
      trustLevel: 5
    },
    function(inputData, keyEdit, ret) {
      ret.writeTxt = "";
      ret.errorMsg = "";
      ret.quitNow = true;
      ret.exitCode = 0;
    },
    null,
    function(exitCode, errorMsg) {
      Assert.equal(exitCode, 0);
      Assert.equal("", errorMsg);
      do_test_finished();
    }
  );
})));

test(withTestCcrHome(withAnnealMail(function shouldSetTrust() {
  importKeys();
  do_test_pending();
  var window = JSUnit.createStubWindow();
  AnnealMailKeyEditor.setKeyTrust(window,
    "781617319CE311C4",
    5,
    function(exitCode, errorMsg) {
      Assert.equal(exitCode, 0);
      Assert.equal("", errorMsg);
      do_test_finished();
    }
  );
})));

test(withTestCcrHome(withAnnealMail(function shouldSignKey() {
  importKeys();
  do_test_pending();
  var window = JSUnit.createStubWindow();
  AnnealMailKeyEditor.signKey(window,
    "anonymous strike <strike.devtest@gmail.com>",
    "781617319CE311C4",
    false,
    5,
    function(exitCode, errorMsg) {
      Assert.equal(exitCode, -1);
      Assert.equal("The key is already signed, you cannot sign it twice.", errorMsg);
      do_test_finished();
    }
  );
})));

test(withTestCcrHome(function importKeyForEdit() {
  const result = importKeys();
  Assert.equal(result[0], 0);
  Assert.equal(result[1], 0);
}));


test(withTestCcrHome(withAnnealMail(function shouldGetSecretKeys() {
  const secretKey = do_get_file("resources/dev-strike.sec", false);
  const errorMsgObj = {};
  const importedKeysObj = {};
  const window = JSUnit.createStubWindow();
  const importResult = AnnealMailKeyRing.importKeyFromFile(secretKey, errorMsgObj, importedKeysObj);

  const createDate = AnnealMailTime.getDateTime(1430756251, true, false);

  const expectedKey = [{
    userId: "anonymous strike <strike.devtest@gmail.com>",
    keyId: "781617319CE311C4",
    created: createDate,
    keyTrust: "u"
  }];
  do_test_pending();
  AnnealMailKeyEditor.setKeyTrust(window,
    "781617319CE311C4",
    5,
    function() {
      let result = AnnealMailKeyRing.getAllSecretKeys();
      Assert.equal(result.length, 1);
      Assert.equal(result[0].userId, expectedKey[0].userId);
      Assert.equal(result[0].keyId, expectedKey[0].keyId);
      // FIXME: The expected date needs to be converted to the locale of the enviroment
      Assert.equal(result[0].created, expectedKey[0].created);
      Assert.equal(result[0].keyTrust, expectedKey[0].keyTrust);
      do_test_finished();
    }
  );
})));

test(function shouldDoErrorHandling() {
  let nextCmd = "";

  /* global CcrEditorInterface: false */
  let editor = new CcrEditorInterface(null, null, "");
  editor._stdin = {
    write: function processStdin(data) {
      nextCmd = data;
    }
  };

  editor.gotData("[GNUPG:] FAILURE sign 85\n");
  Assert.ok(editor.errorMsg.length > 0);
  Assert.equal("save\n", nextCmd);

});

function importKeys() {
  var publicKey = do_get_file("resources/dev-strike.asc", false);
  var secretKey = do_get_file("resources/dev-strike.sec", false);
  var errorMsgObj = {};
  var importedKeysObj = {};
  var publicImportResult = AnnealMailKeyRing.importKeyFromFile(publicKey, errorMsgObj, importedKeysObj);
  var secretImportResult = AnnealMailKeyRing.importKeyFromFile(secretKey, errorMsgObj, importedKeysObj);
  return [publicImportResult, secretImportResult];
}
