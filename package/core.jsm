/*global Components: false, AnnealMail: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailCore"];

const Cc = Components.classes;
const Ci = Components.interfaces;

const annealmailHolder = {
  svc: null
}; // Global AnnealMail Service
let envList = null; // currently filled from annealmail.js

function lazy(importName, name) {
  let holder = null;
  return function(f) {
    if (!holder) {
      if (f) {
        holder = f();
      }
      else {
        const result = {};
        Components.utils.import("resource://annealmail/" + importName, result);
        holder = result[name];
      }
    }
    return holder;
  };
}

const AnnealMailCore = {
  version: "",

  init: function(annealmailVersion) {
    this.version = annealmailVersion;
  },

  /**
   * get and or initialize the AnnealMail service,
   * including the handling for upgrading old preferences to new versions
   *
   * @win:                - nsIWindow: parent window (optional)
   * @startingPreferences - Boolean: true - called while switching to new preferences
   *                        (to avoid re-check for preferences)
   */
  getService: function(win, startingPreferences) {
    // Lazy initialization of AnnealMail JS component (for efficiency)

    if (annealmailHolder.svc) {
      return annealmailHolder.svc.initialized ? annealmailHolder.svc : null;
    }

    try {
      annealmailHolder.svc = Cc["@mozdev.org/annealmail/annealmail;1"].createInstance(Ci.nsIAnnealMail);
      return annealmailHolder.svc.wrappedJSObject.getService(annealmailHolder, win, startingPreferences);
    }
    catch (ex) {
      return null;
    }

  },

  getAnnealMailService: function() {
    return annealmailHolder.svc;
  },

  setAnnealMailService: function(v) {
    annealmailHolder.svc = v;
  },

  ensuredAnnealMailService: function(f) {
    if (!annealmailHolder.svc) {
      AnnealMailCore.setAnnealMailService(f());
    }
    return annealmailHolder.svc;
  },

  getKeyRing: lazy("keyRing.jsm", "AnnealMailKeyRing"),

  /**
   * obtain a list of all environment variables
   *
   * @return: Array of Strings with the following structrue
   *          variable_name=variable_content
   */
  getEnvList: function() {
    return envList;
  },

  addToEnvList: function(str) {
    AnnealMailCore.getEnvList().push(str);
  },

  initEnvList: function() {
    envList = [];
  }
};
