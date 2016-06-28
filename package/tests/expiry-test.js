/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false */
/*global do_test_finished: false, component: false, Cc: false, Ci: false, setupTestAccounts: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js"); /*global withAnnealMail: false, withTestCcrHome: false */

testing("keyUsability.jsm"); /*global AnnealMailKeyUsability: false */
component("annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */
component("annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
component("annealmail/locale.jsm"); /*global AnnealMailLocale: false */

/*global Math: false, Date: false, uniqueKeyList: false, DAY: false */

setupTestAccounts();

test(function shouldCheckKeyExpiry() {

  AnnealMailKeyRing.clearCache();
  let keyListObj = AnnealMailKeyRing.getAllKeys();

  let now = Math.floor(Date.now() / 1000);

  let a = [{
    keyId: "123"
  }, {
    keyId: "456"
  }, {
    keyId: "123"
  }, {
    keyId: "763"
  }, {
    keyId: "456"
  }];
  let b = uniqueKeyList(a);
  Assert.equal(b.length, 3);

  keyListObj.keySortList.push(1); // ensure that key list is not reloaded
  keyListObj.keyList.push(createKeyObj("ABCDEF0123456789", "user1@annealmail-test.net", now + DAY * 5, true));
  keyListObj.keyList.push(createKeyObj("DBCDEF0123456789", "user2@annealmail-test.net", now - DAY * 5, true));
  keyListObj.keyList.push(createKeyObj("EBCDEF0123456789", "user2@annealmail-test.net", now + DAY * 100, true));
  keyListObj.keyList.push(createKeyObj("CBCDEF0123456789", "user3@annealmail-test.net", 0, true));
  keyListObj.keyList.push(createKeyObj("BBCDEF0123456789", "user4@annealmail-test.net", now - DAY * 5, true));
  keyListObj.keyList.push(createKeyObj("FBCDEF0123456789", "user5@annealmail-test.net", now - DAY * 5, true));
  keyListObj.keyList.push(createKeyObj("ACCDEF0123456789", "user5@annealmail-test.net", now + DAY * 5, true));

  AnnealMailKeyRing.rebuildKeyIndex();

  let k = AnnealMailKeyUsability.getExpiryForKeySpec([], 10);
  Assert.equal(k.length, 0);

  k = AnnealMailKeyUsability.getExpiryForKeySpec(["0xABCDEF0123456789", "BBCDEF0123456789", "CBCDEF0123456789"], 10);
  Assert.equal(k.map(getKeyId).join(" "), "ABCDEF0123456789");

  k = AnnealMailKeyUsability.getExpiryForKeySpec(["user1@annealmail-test.net", "user2@annealmail-test.net", "user5@annealmail-test.net"], 10);
  Assert.equal(k.map(getKeyId).join(" "), "ABCDEF0123456789 ACCDEF0123456789");
});

test(function shouldCheckKeySpecs() {
  let a = AnnealMailKeyUsability.getKeysSpecForIdentities();
  Assert.equal(a.join(" "), "ABCDEF0123456789 user2@annealmail-test.net user4@annealmail-test.net");
});

test(function shouldGetNewlyExpiredKeys() {
  AnnealMailPrefs.setPref("keyCheckResult", "");
  AnnealMailPrefs.setPref("warnKeyExpiryNumDays", 10);
  let a = AnnealMailKeyUsability.getNewlyExpiredKeys();
  Assert.equal(a.map(getKeyId).join(" "), "ABCDEF0123456789");

  AnnealMailPrefs.setPref("warnKeyExpiryNumDays", 101);
  a = AnnealMailKeyUsability.getNewlyExpiredKeys();
  Assert.equal(a, null);

  let keyCheckResult = JSON.parse(AnnealMailPrefs.getPref("keyCheckResult", ""));
  keyCheckResult.lastCheck = Date.now() - 86401000;
  AnnealMailPrefs.setPref("keyCheckResult", JSON.stringify(keyCheckResult));

  a = AnnealMailKeyUsability.getNewlyExpiredKeys();
  Assert.equal(a.map(getKeyId).join(" "), "EBCDEF0123456789");

  keyCheckResult = JSON.parse(AnnealMailPrefs.getPref("keyCheckResult", ""));
  keyCheckResult.lastCheck = Date.now() - 86401000;
  AnnealMailPrefs.setPref("keyCheckResult", JSON.stringify(keyCheckResult));

  a = AnnealMailKeyUsability.getNewlyExpiredKeys();
  Assert.equal(a.length, 0);
});

test(function shouldDoKeyExpiryCheck() {

  AnnealMailPrefs.setPref("keyCheckResult", "");
  AnnealMailPrefs.setPref("warnKeyExpiryNumDays", 101);

  let str = AnnealMailKeyUsability.keyExpiryCheck();
  Assert.equal(str, AnnealMailLocale.getString("expiry.keysExpireSoon", [101, '- "user1@annealmail-test.net" (key ID 123456781234567812345678ABCDEF0123456789)\n' +
    '- "user2@annealmail-test.net" (key ID 123456781234567812345678EBCDEF0123456789)\n'
  ]));


  let keyCheckResult = JSON.parse(AnnealMailPrefs.getPref("keyCheckResult", ""));
  keyCheckResult.lastCheck = Date.now() - 86401000;
  AnnealMailPrefs.setPref("keyCheckResult", JSON.stringify(keyCheckResult));

  AnnealMailPrefs.setPref("warnKeyExpiryNumDays", 10);
  str = AnnealMailKeyUsability.keyExpiryCheck();
  Assert.equal(str, "");
});

function getKeyId(key) {
  return key.keyId;
}

function createKeyObj(keyId, userId, expiryDate, hasSecretKey) {
  return {
    keyId: keyId,
    userId: userId,
    fpr: "123456781234567812345678" + keyId,
    expiryTime: expiryDate,
    keyUseFor: "escESC",
    secretAvailable: hasSecretKey,
    keyTrust: "u",
    type: "pub",
    userIds: [{
      userId: userId,
      type: "uid",
      keyTrust: "u"
    }],
    subKeys: [],
    signatures: [],
    getKeyExpiry: function() {
      if (this.expiryTime === 0) return Number.MAX_VALUE;
      return this.expiryTime;
    },
    get fprFormatted() {
      return this.fpr;
    }
  };
}
