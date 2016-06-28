/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false, withTestCcrHome:false */
/*global AnnealMailCore: false, AnnealMail: false, component: false, Cc: false, Ci: false, withEnvironment: false, nsIAnnealMail: false, nsIEnvironment: false, Ec: false, AnnealMailPrefs: false, AnnealMailOS: false, AnnealMailArmor: false */
/*jshint -W120 */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js");

testing("annealmail.js");

function newAnnealMail(f) {
  var oldAnnealMail = AnnealMailCore.getAnnealMailService();
  try {
    var annealmail = new AnnealMail();
    AnnealMailCore.setAnnealMailService(annealmail);
    f(annealmail);
  }
  finally {
    AnnealMailCore.setAnnealMailService(oldAnnealMail);
  }
}

// testing: initialize
test(function initializeWillPassEnvironmentIfAskedTo() {
  var window = JSUnit.createStubWindow();
  withEnvironment({
    "ANNEALMAIL_PASS_ENV": "STUFF:BLARG",
    "STUFF": "testing"
  }, function() {
    newAnnealMail(function(annealmail) {
      annealmail.initialize(window, "");
      Assert.assertArrayContains(AnnealMailCore.getEnvList(), "STUFF=testing");
    });
  });
});

test(function initializeWillNotPassEnvironmentsNotAskedTo() {
  var window = JSUnit.createStubWindow();
  var environment = Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);
  environment.set("ANNEALMAIL_PASS_ENV", "HOME");
  environment.set("STUFF", "testing");
  newAnnealMail(function(annealmail) {
    annealmail.initialize(window, "");
    Assert.assertArrayNotContains(AnnealMailCore.getEnvList(), "STUFF=testing");
  });
});

test(function initializeWillNotSetEmptyEnvironmentValue() {
  var window = JSUnit.createStubWindow();
  var environment = Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);
  environment.set("APPDATA", "");
  newAnnealMail(function(annealmail) {
    annealmail.initialize(window, "");
    Assert.assertArrayNotContains(AnnealMailCore.getEnvList(), "APPDATA=");
  });
});
