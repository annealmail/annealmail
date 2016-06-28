/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

if (!AnnealMail) var AnnealMail = {};

var gPref = null;

function onInit() {
  AnnealMail.edit.onInit();
}

function onAcceptEditor() {
  AnnealMail.edit.onSave();
}

function onPreInit(account, accountValues) {
  AnnealMail.edit.identity = account.defaultIdentity;
  AnnealMail.edit.account = account;
}

function onSave() {
  AnnealMail.edit.onSave();
}

function onLockPreference() {
  // do nothing
}

// Does the work of disabling an element given the array which contains xul id/prefstring pairs.
// Also saves the id/locked state in an array so that other areas of the code can avoid
// stomping on the disabled state indiscriminately.
function disableIfLocked(prefstrArray) {
  // do nothing
}

function annealmailOnAcceptEditor() {
  AnnealMail.edit.onSave();

  return true; // allow to close dialog in all cases
}
