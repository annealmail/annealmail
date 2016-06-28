/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

/* global Components: false, DirPaneHasFocus: false, GetSelectedAddressesFromDirTree: false, GetSelectedAddresses: false */

Components.utils.import("resource://annealmail/funcs.jsm"); /*global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/windows.jsm"); /*global AnnealMailWindows: false */

var AnnealMail = {
  createRuleFromAddress: function(emailAddressNode) {
    if (emailAddressNode) {
      var r = new RegExp("^" + emailAddressNode.protocol);
      var emailAddress = emailAddressNode.href.replace(r, "");
      AnnealMailWindows.createNewRule(window, emailAddress);
    }
  },

  createRuleFromCard: function() {
    var emailAddress = "";
    if (DirPaneHasFocus())
      emailAddress = GetSelectedAddressesFromDirTree();
    else
      emailAddress = GetSelectedAddresses();

    if (emailAddress)
      AnnealMailWindows.createNewRule(window, AnnealMailFuncs.stripEmail(emailAddress).replace(/,/g, " "));
  }
};
