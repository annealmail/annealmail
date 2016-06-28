/*global Components: false, AnnealMailTimer: false */
/*  * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

"use strict";

/* global gActionListOrdered: false */

Components.utils.import("resource://annealmail/timer.jsm"); /*global AnnealMailTimer: false */

var annealmail_origCheckActionsReorder = function() {
  annealmail_origCheckActionsReorder();
  AnnealMailTimer.setTimeout(AnnealMailFilterEditor.checkMoveAction.bind(AnnealMailFilterEditor), 0);
};

var AnnealMailFilterEditor = {
  checkMoveAction: function() {
    let dlg = document.getElementById("FilterEditor");
    let acceptButton = dlg.getButton("accept");
    let forbidden = -1;
    let hasCopyAction = -1;
    let hasMoveAction = -1;

    const nsMsgFilterAction = Components.interfaces.nsMsgFilterAction;

    for (let i = 0; i < gActionListOrdered.length; i++) {
      let action = gActionListOrdered.queryElementAt(i, Components.interfaces.nsIMsgRuleAction);
      if (action.customId == "annealmail@annealmail.net#filterActionCopyDecrypt") {
        hasCopyAction = i;
        break;
      }

      if (action.customId == "annealmail@annealmail.net#filterActionMoveDecrypt") {
        hasMoveAction = i;
        if (i < gActionListOrdered.length - 1) {
          forbidden = i;
        }
      }

      if (action.type == nsMsgFilterAction.StopExecution &&
        i == gActionListOrdered.length - 1 &&
        forbidden == i - 1) {
        // allow "stop execution" if it's the only action after move
        forbidden = -1;
      }
    }

    if (forbidden >= 0 || (hasMoveAction >= 0 && hasCopyAction > hasMoveAction)) {
      document.getElementById("annealmailInfobar").setAttribute("style", "visibility: visible");
      acceptButton.setAttribute("disabled", "true");
    }
    else {
      document.getElementById("annealmailInfobar").setAttribute("style", "visibility: hidden");
      acceptButton.setAttribute("disabled", "false");
    }
  }
};
