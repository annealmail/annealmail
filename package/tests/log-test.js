/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false, component: false, Cc: false, Ci: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js");

testing("log.jsm"); /*global AnnealMailLog: false */
component("annealmail/files.jsm"); /*global AnnealMailFiles: false */

test(function shouldCreateLogFile() {
  AnnealMailLog.setLogDirectory(do_get_cwd().path);
  AnnealMailLog.setLogLevel(5);
  AnnealMailLog.createLogFiles();
  const filePath = AnnealMailLog.directory + "enigdbug.txt";
  const localFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  AnnealMailFiles.initPath(localFile, filePath);
  try {
    Assert.equal(localFile.exists(), true);
  }
  finally {
    if (localFile.exists()) {
      AnnealMailLog.fileStream.close();
      localFile.remove(false);
    }
  }
});
