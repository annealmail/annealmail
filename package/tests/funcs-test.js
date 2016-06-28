/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, AnnealMailApp: false */
/*global AnnealMailFuncs: false, rulesListHolder: false, EC: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js");

testing("funcs.jsm");

var AnnealMailFuncsTests = {
  testStripEmail(str, res) {
    let addr;
    addr = AnnealMailFuncs.stripEmail(str);
    Assert.equal(addr, res);
  }
};

test(function stripEmail() {
  AnnealMailFuncsTests.testStripEmail("some stuff <a@b.de> some stuff",
    "a@b.de");

  AnnealMailFuncsTests.testStripEmail("\"some stuff\" a@b.de",
    "a@b.de");

  AnnealMailFuncsTests.testStripEmail("\"some, stuff\" a@b.de",
    "a@b.de");

  AnnealMailFuncsTests.testStripEmail("some stuff <a@b.de> some stuff, xyz<xy@a.xx>xyc",
    "a@b.de,xy@a.xx");

  AnnealMailFuncsTests.testStripEmail(" a@b.de , <aa@bb.de>",
    "a@b.de,aa@bb.de");

  AnnealMailFuncsTests.testStripEmail("    ,,,,;;;; , ; , ;",
    "");

  AnnealMailFuncsTests.testStripEmail(";",
    "");


  AnnealMailFuncsTests.testStripEmail("    ,,oneRule,;;; , ;",
    "oneRule");

  AnnealMailFuncsTests.testStripEmail("    ,,,nokey,;;;; , nokey2 ; , ;",
    "nokey,nokey2");

  AnnealMailFuncsTests.testStripEmail(",,,newsgroupa ",
    "newsgroupa");

  // test invalid email addresses:
  Assert.throws(
    function() {
      AnnealMailFuncs.stripEmail(" a@b.de , <aa@bb.de> <aa@bb.dd>");
    }
  );
  Assert.throws(
    function() {
      AnnealMailFuncs.stripEmail("\"some stuff a@b.de");
    }
  );

});

test(function compareMimePartLevel() {
  Assert.throws(
    function() {
      AnnealMailFuncs.compareMimePartLevel("1.2.e", "1.2");
    }
  );

  let e = AnnealMailFuncs.compareMimePartLevel("1.1", "1.1.2");
  Assert.equal(e, -2);

  e = AnnealMailFuncs.compareMimePartLevel("1.1", "1.2.2");
  Assert.equal(e, -1);

  e = AnnealMailFuncs.compareMimePartLevel("1", "2");
  Assert.equal(e, -1);

  e = AnnealMailFuncs.compareMimePartLevel("1.2", "1.1.2");
  Assert.equal(e, 1);

  e = AnnealMailFuncs.compareMimePartLevel("1.2.2", "1.2");
  Assert.equal(e, 2);

  e = AnnealMailFuncs.compareMimePartLevel("1.2.2", "1.2.2");
  Assert.equal(e, 0);

});
