/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false, component: false, Cc: false, Ci: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js"); /*global withAnnealMail: false, withTestCcrHome: false */

testing("encryption.jsm"); /*global AnnealMailEncryption: false, nsIAnnealMail: false */
component("annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: fales */
component("annealmail/armor.jsm"); /*global AnnealMailArmor: fales */
component("annealmail/Locale.jsm"); /*global AnnealMailLocale: fales */

test(withTestCcrHome(withAnnealMail(function shouldSignMessage() {
  const secretKey = do_get_file("resources/dev-strike.sec", false);
  const revocationCert = do_get_file("resources/dev-strike.rev", false);
  const errorMsgObj = {};
  const importedKeysObj = {};
  AnnealMailKeyRing.importKeyFromFile(secretKey, errorMsgObj, importedKeysObj);
  const parentWindow = JSUnit.createStubWindow();
  const plainText = "Hello there!";
  const strikeAccount = "strike.devtest@gmail.com";
  const exitCodeObj = {};
  const statusFlagObj = {};
  const encryptResult = AnnealMailEncryption.encryptMessage(parentWindow,
    nsIAnnealMail.UI_TEST,
    plainText,
    strikeAccount,
    strikeAccount,
    "",
    nsIAnnealMail.SEND_TEST | nsIAnnealMail.SEND_SIGNED,
    exitCodeObj,
    statusFlagObj,
    errorMsgObj
  );
  Assert.equal(0, exitCodeObj.value);
  Assert.equal(0, errorMsgObj.value);
  Assert.equal(true, (statusFlagObj.value == nsIAnnealMail.SIG_CREATED));
  const blockType = AnnealMailArmor.locateArmoredBlock(encryptResult, 0, "", {}, {}, {});
  Assert.equal("SIGNED MESSAGE", blockType);

  let r = AnnealMailEncryption.determineOwnKeyUsability(nsIAnnealMail.SEND_SIGNED, "strike.devtest@gmail.com");
  Assert.equal(r.keyId, "65537E212DC19025AD38EDB2781617319CE311C4");

  AnnealMailKeyRing.importKeyFromFile(revocationCert, errorMsgObj, importedKeysObj);
  r = AnnealMailEncryption.determineOwnKeyUsability(nsIAnnealMail.SEND_SIGNED, "0x65537E212DC19025AD38EDB2781617319CE311C4");
  Assert.equal(r.errorMsg, AnnealMailLocale.getString("keyRing.pubKeyRevoked", ["anonymous strike <strike.devtest@gmail.com>", "0x781617319CE311C4"]));
})));

test(withTestCcrHome(withAnnealMail(function shouldEncryptMessage() {
  const publicKey = do_get_file("resources/dev-strike.asc", false);
  const errorMsgObj = {};
  const importedKeysObj = {};
  AnnealMailKeyRing.importKeyFromFile(publicKey, errorMsgObj, importedKeysObj);
  const parentWindow = JSUnit.createStubWindow();
  const plainText = "Hello there!";
  const strikeAccount = "strike.devtest@gmail.com";
  const exitCodeObj = {};
  const statusFlagObj = {};
  const encryptResult = AnnealMailEncryption.encryptMessage(parentWindow,
    nsIAnnealMail.UI_TEST,
    plainText,
    strikeAccount,
    strikeAccount,
    "",
    nsIAnnealMail.SEND_TEST | nsIAnnealMail.SEND_ENCRYPTED | nsIAnnealMail.SEND_ALWAYS_TRUST,
    exitCodeObj,
    statusFlagObj,
    errorMsgObj
  );
  Assert.equal(0, exitCodeObj.value);
  Assert.equal(0, errorMsgObj.value);
  Assert.equal(true, (statusFlagObj.value & nsIAnnealMail.END_ENCRYPTION) !== 0);
  const blockType = AnnealMailArmor.locateArmoredBlock(encryptResult, 0, "", {}, {}, {});
  Assert.equal("MESSAGE", blockType);

  let r = AnnealMailEncryption.determineOwnKeyUsability(nsIAnnealMail.SEND_ENCRYPTED, "strike.devtest@gmail.com");
  Assert.equal(r.keyId, "65537E212DC19025AD38EDB2781617319CE311C4");
})));

test(withTestCcrHome(withAnnealMail(function shouldGetErrorReason() {
  let r = AnnealMailEncryption.determineOwnKeyUsability(nsIAnnealMail.SEND_SIGNED, "strike.devtest@gmail.com");
  let expected = AnnealMailLocale.getString("keyRing.noSecretKey", ["anonymous strike <strike.devtest@gmail.com>", "0x781617319CE311C4"]) + "\n";
  Assert.equal(r.errorMsg, expected);

  r = AnnealMailEncryption.determineOwnKeyUsability(nsIAnnealMail.SEND_SIGNED | nsIAnnealMail.SEND_ENCRYPTED, "nobody@notfound.net");
  expected = AnnealMailLocale.getString("errorOwnKeyUnusable", "nobody@notfound.net");
  Assert.equal(r.errorMsg, expected);

})));
