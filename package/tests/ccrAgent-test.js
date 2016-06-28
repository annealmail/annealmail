/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false */
/*global TestHelper: false, withEnvironment: false, nsIWindowsRegKey: true */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js");
/*global TestHelper: false, withEnvironment: false, withAnnealMail: false, component: false,
  withTestCcrHome: false, osUtils: false, AnnealMailFiles */

testing("ccrAgent.jsm"); /*global AnnealMailCcrAgent: false, AnnealMailOS: false, getHomedirFromParam: false */
component("annealmail/prefs.jsm"); /*global AnnealMailPrefs: false */
component("annealmail/ccr.jsm"); /*global AnnealMailCcr: false */

// testing: determineCcrHomeDir
//   environment: GNUPGHOME
//   isWin32:
//     registry Software\GNU\GNUPG\HomeDir
//     environment: USERPROFILE + \Application Data\GnuPG
//     environment: SystemRoot + \Application Data\GnuPG
//     c:\gnupg
//   environment: HOME + .gnupg

test(function determineCcrHomeDirReturnsGNUPGHOMEIfExists() {
  withEnvironment({
    "GNUPGHOME": "stuffResult1"
  }, function(e) {
    var annealmail = {
      environment: e
    };
    Assert.equal("stuffResult1", AnnealMailCcrAgent.determineCcrHomeDir(annealmail));
  });
});

// this test cannot be reliably performed on Windows
if (JSUnit.getOS() != "WINNT") {
  test(function determineCcrHomeDirReturnsHomePlusGnupgForNonWindowsIfNoGNUPGHOMESpecificed() {
    withEnvironment({
      "HOME": "/my/little/home"
    }, function(e) {
      e.set("GNUPGHOME", null);
      var annealmail = {
        environment: e
      };
      Assert.equal("/my/little/home/.gnupg", AnnealMailCcrAgent.determineCcrHomeDir(annealmail));
    });
  });
}

test(function determineCcrHomeDirReturnsRegistryValueForWindowsIfExists() {
  withEnvironment({}, function(e) {
    e.set("GNUPGHOME", null);
    resetting(AnnealMailOS, 'getWinRegistryString', function(a, b, c) {
      if (a === "Software\\GNU\\GNUPG" && b === "HomeDir" && c === "foo bar") {
        return "\\foo\\bar\\gnupg";
      }
      else {
        return "\\somewhere\\else";
      }
    }, function() {
      resetting(AnnealMailOS, 'isWin32', true, function() {
        var annealmail = {
          environment: e
        };
        nsIWindowsRegKey = {
          ROOT_KEY_CURRENT_USER: "foo bar"
        };
        Assert.equal("\\foo\\bar\\gnupg", AnnealMailCcrAgent.determineCcrHomeDir(annealmail));
      });
    });
  });
});

test(function determineCcrHomeDirReturnsUserprofileIfItExists() {
  withEnvironment({
    "USERPROFILE": "\\bahamas"
  }, function(e) {
    e.set("GNUPGHOME", null);
    resetting(AnnealMailOS, 'getWinRegistryString', function(a, b, c) {}, function() {
      resetting(AnnealMailOS, 'isWin32', true, function() {
        var annealmail = {
          environment: e
        };
        nsIWindowsRegKey = {
          ROOT_KEY_CURRENT_USER: "foo bar"
        };
        Assert.equal("\\bahamas\\Application Data\\GnuPG", AnnealMailCcrAgent.determineCcrHomeDir(annealmail));
      });
    });
  });
});

test(function determineCcrHomeDirReturnsSystemrootIfItExists() {
  withEnvironment({
    "SystemRoot": "\\tahiti",
    "USERPROFILE": null
  }, function(e) {
    e.set("GNUPGHOME", null);
    resetting(AnnealMailOS, 'getWinRegistryString', function(a, b, c) {}, function() {
      resetting(AnnealMailOS, 'isWin32', true, function() {
        var annealmail = {
          environment: e
        };
        nsIWindowsRegKey = {
          ROOT_KEY_CURRENT_USER: "foo bar"
        };
        Assert.equal("\\tahiti\\Application Data\\GnuPG", AnnealMailCcrAgent.determineCcrHomeDir(annealmail));
      });
    });
  });
});

test(function determineCcrHomeDirReturnsDefaultForWin32() {
  withEnvironment({
    "SystemRoot": null,
    "USERPROFILE": null
  }, function(e) {
    e.set("GNUPGHOME", null);
    resetting(AnnealMailOS, 'getWinRegistryString', function(a, b, c) {}, function() {
      resetting(AnnealMailOS, 'isWin32', true, function() {
        var annealmail = {
          environment: e
        };
        nsIWindowsRegKey = {
          ROOT_KEY_CURRENT_USER: "foo bar"
        };
        Assert.equal("C:\\gnupg", AnnealMailCcrAgent.determineCcrHomeDir(annealmail));
      });
    });
  });
});


// // testing: useCcrAgent
// // useCcrAgent depends on several values:
// //   AnnealMailOS.isDosLike()
// //   Ccr.getCcrFeature("supports-ccr-agent")
// //   Ccr.getCcrFeature("autostart-ccr-agent")
// //   AnnealMailCcrAgent.ccrAgentInfo.envStr.length>0
// //   AnnealMailPrefs.getPrefBranch().getBoolPref("useCcrAgent")

function asDosLike(f) {
  resetting(AnnealMailOS, 'isDosLikeVal', true, f);
}

function notDosLike(f) {
  resetting(AnnealMailOS, 'isDosLikeVal', false, f);
}

function withCcrFeatures(features, f) {
  resetting(AnnealMailCcr, 'getCcrFeature', function(feature) {
    return features.indexOf(feature) != -1;
  }, f);
}


// // setAgentPath

test(withAnnealMail(function setAgentPathDefaultValues(annealmail) {
  withEnvironment({}, function(e) {
    annealmail.environment = e;
    AnnealMailCcrAgent.setAgentPath(JSUnit.createStubWindow(), annealmail);
    Assert.equal("ccr", AnnealMailCcrAgent.agentType);
    Assert.equal("ccr", AnnealMailCcrAgent.agentPath.leafName.substr(0, 3));
    Assert.equal("ccrconf", AnnealMailCcrAgent.ccrconfPath.leafName.substr(0, 7));
    Assert.equal("ccr-connect-agent", AnnealMailCcrAgent.connCcrAgentPath.leafName.substr(0, 17));
    // Basic check to test if GnuPG version was properly extracted
    Assert.ok(AnnealMailCcr.agentVersion.search(/^[2-9]\.[0-9]+(\.[0-9]+)?/) === 0);
  });
}));

// // resolveToolPath

test(withAnnealMail(function resolveToolPathDefaultValues(annealmail) {
  withEnvironment({}, function(e) {
    resetting(AnnealMailCcrAgent, 'agentPath', "/usr/bin/ccr-agent", function() {
      annealmail.environment = e;
      var result = AnnealMailCcrAgent.resolveToolPath("zip");
      Assert.equal("zip", result.leafName.substr(0, 3));
    });
  });
}));

// route cannot be tested reliably on non-Unix systems
// test(withAnnealMail(function resolveToolPathFromPATH(annealmail) {
//     withEnvironment({PATH: "/sbin"}, function(e) {
//         resetting(AnnealMailCcrAgent, 'agentPath', "/usr/bin/ccr-agent", function() {
//             annealmail.environment = e;
//             var result = AnnealMailCcrAgent.resolveToolPath("route");
//             Assert.equal("/sbin/route", result.path);
//         });
//     });
// }));

// detectCcrAgent
test(withAnnealMail(function detectCcrAgentSetsAgentInfoFromEnvironmentVariable(annealmail) {
  withEnvironment({
    CCR_AGENT_INFO: "a happy agent"
  }, function(e) {
    annealmail.environment = e;
    AnnealMailCcrAgent.detectCcrAgent(JSUnit.createStubWindow(), annealmail);

    Assert.ok(AnnealMailCcrAgent.ccrAgentInfo.preStarted);
    Assert.equal("a happy agent", AnnealMailCcrAgent.ccrAgentInfo.envStr);
    Assert.ok(!AnnealMailCcrAgent.ccrAgentIsOptional);
  });
}));


test(withAnnealMail(function detectCcrAgentWithNoAgentInfoInEnvironment(annealmail) {
  withEnvironment({}, function(e) {
    annealmail.environment = e;
    AnnealMailCcrAgent.detectCcrAgent(JSUnit.createStubWindow(), annealmail);

    Assert.ok(!AnnealMailCcrAgent.ccrAgentInfo.preStarted);
    Assert.ok(!AnnealMailCcrAgent.ccrAgentIsOptional);
  });
}));

test(withAnnealMail(function detectCcrAgentWithAutostartFeatureWillDoNothing(annealmail) {
  withEnvironment({}, function(e) {
    withCcrFeatures(["autostart-ccr-agent"], function() {
      annealmail.environment = e;
      AnnealMailCcrAgent.detectCcrAgent(JSUnit.createStubWindow(), annealmail);
      Assert.equal("none", AnnealMailCcrAgent.ccrAgentInfo.envStr);
    });
  });
}));

//getCcrHomeDir
test(withTestCcrHome(withAnnealMail(function shouldGetCcrHomeDir() {
  let homedirExpected = osUtils.OS.Path.join(AnnealMailFiles.getTempDir(), ".gnupgTest");

  let homeDir = AnnealMailCcrAgent.getCcrHomeDir();
  Assert.equal(homedirExpected, homeDir);
})));

// getHomedirFromParam
test(function shouldGetHomedirFromParam() {
  let hd = getHomedirFromParam('--homedir /some1/path');
  Assert.equal(hd, "/some1/path");

  hd = getHomedirFromParam('--opt1 --homedir /some2/path --opt2');
  Assert.equal(hd, "/some2/path");

  hd = getHomedirFromParam('--opt1 --homedir   "C:\\My Path\\is\\Very \\"long 1\\"" --opt2');
  Assert.equal(hd, 'C:\\My Path\\is\\Very \\"long 1\\"');

  hd = getHomedirFromParam('--opt1 --homedir "C:\\My Path\\is\\Very \\"long 2\\"" --opt2 "Some \\"more\\" fun"');
  Assert.equal(hd, 'C:\\My Path\\is\\Very \\"long 2\\"');
});
