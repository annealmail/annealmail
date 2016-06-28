/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint no-invalid-this: 0 */

// Uses: chrome://annealmail/content/annealmailCommon.js

"use strict";

/*global Components: false */
/*global AnnealMailLocale: false, AnnealMailData: false, AnnealMailDialog: false, AnnealMailLog: false, AnnealMailPrefs: false */
/*global AnnealMailKeyRing: false, AnnealMailErrorHandling: false, AnnealMailEvents: false, AnnealMailKeyServer: false */

// from annealmailCommon.js:
/*global nsIAnnealMail: false, EnigSetActive: false, GetAnnealMailSvc: false */

const INPUT = 0;
const RESULT = 1;

const ENIG_DEFAULT_HKP_PORT = "11371";
const ENIG_DEFAULT_HKPS_PORT = "443";
const ENIG_DEFAULT_LDAP_PORT = "389";

const ENIG_CONN_TYPE_HTTP = 1;
const ENIG_CONN_TYPE_CCRKEYS = 2;
const ENIG_CONN_TYPE_KEYBASE = 3;

const KEY_EXPIRED = "e";
const KEY_REVOKED = "r";
const KEY_INVALID = "i";
const KEY_DISABLED = "d";
const KEY_NOT_VALID = KEY_EXPIRED + KEY_REVOKED + KEY_INVALID + KEY_DISABLED;

var gErrorData = "";
var gOutputData = "";
var gEnigRequest;
var gEnigHttpReq = null;
var gAllKeysSelected = 0;

function trim(str) {
  return str.replace(/^(\s*)(.*)/, "$2").replace(/\s+$/, "");
}

function onLoad() {

  window.arguments[RESULT].importedKeys = 0;

  var keyserver = window.arguments[INPUT].keyserver.toLowerCase();
  var protocol = "";
  if (keyserver.search(/^[a-zA-Z0-9\-\_\.]+:\/\//) === 0) {
    protocol = keyserver.replace(/^([a-zA-Z0-9\-\_\.]+)(:\/\/.*)/, "$1");
    keyserver = keyserver.replace(/^[a-zA-Z0-9\-\_\.]+:\/\//, "");
  }
  else {
    protocol = "hkp";
  }

  var port = "";
  switch (protocol) {
    case "hkp":
      port = ENIG_DEFAULT_HKP_PORT;
      break;
    case "hkps":
      port = ENIG_DEFAULT_HKPS_PORT;
      break;
    case "ldap":
      port = ENIG_DEFAULT_LDAP_PORT;
      break;
  }

  var m = keyserver.match(/^(.+)(:)(\d+)$/);
  if (m && m.length == 4) {
    keyserver = m[1];
    port = m[3];
  }

  let reqType;
  if (protocol === "keybase" || keyserver === "keybase.io") {
    reqType = ENIG_CONN_TYPE_KEYBASE;
    protocol = "keybase";
  }
  else if (AnnealMailPrefs.getPref("useCcrKeysTool")) {
    reqType = ENIG_CONN_TYPE_CCRKEYS;
  }
  else {
    reqType = ENIG_CONN_TYPE_HTTP;
  }

  gEnigRequest = {
    searchList: window.arguments[INPUT].searchList,
    keyNum: 0,
    keyserver: keyserver,
    port: port,
    protocol: protocol,
    keyList: [],
    requestType: reqType,
    ccrkeysRequest: null,
    progressMeter: document.getElementById("dialog.progress"),
    httpInProgress: false
  };

  gEnigRequest.progressMeter.mode = "undetermined";

  if (window.arguments[INPUT].searchList.length == 1 &&
    window.arguments[INPUT].searchList[0].search(/^0x[A-Fa-f0-9]{8,16}$/) === 0) {
    // shrink dialog and start download if just one key ID provided

    gEnigRequest.dlKeyList = window.arguments[INPUT].searchList;
    document.getElementById("keySelGroup").setAttribute("collapsed", "true");
    window.sizeToContent();

    AnnealMailEvents.dispatchEvent(startDownload, 10);
  }
  else {
    switch (gEnigRequest.requestType) {
      case ENIG_CONN_TYPE_HTTP:
      case ENIG_CONN_TYPE_KEYBASE:
        newHttpRequest(nsIAnnealMail.SEARCH_KEY, scanKeys);
        break;
      case ENIG_CONN_TYPE_CCRKEYS:
        newCcrKeysRequest(nsIAnnealMail.SEARCH_KEY, scanKeys);
        break;
    }
  }

  return true;
}


function selectAllKeys() {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: selectAllkeys\n");
  var keySelList = document.getElementById("annealmailKeySel");
  var treeChildren = keySelList.getElementsByAttribute("id", "annealmailKeySelChildren")[0];

  gEnigRequest.dlKeyList = [];

  // Toggle flag to select/deselect all when hotkey is pressed repeatedly
  gAllKeysSelected ^= 1;

  var item = treeChildren.firstChild;
  while (item) {
    var aRows = item.getElementsByAttribute("id", "indicator");
    if (aRows.length) {
      var elem = aRows[0];
      EnigSetActive(elem, gAllKeysSelected);
    }
    item = item.nextSibling;
  }
}


function onAccept() {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: onAccept\n");

  var keySelList = document.getElementById("annealmailKeySel");
  var treeChildren = keySelList.getElementsByAttribute("id", "annealmailKeySelChildren")[0];

  gEnigRequest.dlKeyList = [];
  var item = treeChildren.firstChild;
  while (item) {
    var aRows = item.getElementsByAttribute("id", "indicator");
    if (aRows.length) {
      var elem = aRows[0];
      if (elem.getAttribute("active") == "1") {
        gEnigRequest.dlKeyList.push(item.getAttribute("id"));
      }
    }
    item = item.nextSibling;
  }
  return startDownload();
}


function startDownload() {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: startDownload\n");
  if (gEnigRequest.dlKeyList.length > 0) {
    gEnigRequest.progressMeter.value = 0;
    gEnigRequest.progressMeter.mode = "undetermined";
    document.getElementById("progress.box").removeAttribute("hidden");
    document.getElementById("selall-button").setAttribute("hidden", "true");
    document.getElementById("dialog.accept").setAttribute("disabled", "true");
    gEnigRequest.keyNum = 0;
    gEnigRequest.errorTxt = "";
    switch (gEnigRequest.requestType) {
      case ENIG_CONN_TYPE_HTTP:
        newHttpRequest(nsIAnnealMail.DOWNLOAD_KEY, importKeys);
        break;
      case ENIG_CONN_TYPE_CCRKEYS:
        newCcrKeysRequest(nsIAnnealMail.DOWNLOAD_KEY, importKeys);
        break;
      case ENIG_CONN_TYPE_KEYBASE:
        newHttpRequest(nsIAnnealMail.DOWNLOAD_KEY, importKeys);
        break;
    }

    // do not yet close the window, so that we can display some progress info
    return false;
  }

  return true;
}

function onCancel() {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: onCancel\n");

  if (gEnigRequest.httpInProgress) {
    // stop download
    try {
      if ((typeof(gEnigHttpReq) == "object") &&
        (gEnigHttpReq.readyState != 4)) {
        gEnigHttpReq.abort();
      }
      gEnigRequest.httpInProgress = false;
    }
    catch (ex) {}
  }

  if (gEnigRequest.ccrkeysRequest) {

    try {
      var p = gEnigRequest.ccrkeysRequest;
      gEnigRequest.ccrkeysRequest = null;
      p.kill(false);
    }
    catch (ex) {}
  }

  gOutputData = "";
  window.close();
}


function statusError() {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: statusError\n");
  gEnigRequest.httpInProgress = false;
  AnnealMailDialog.alert(window, AnnealMailLocale.getString("noKeyserverConn", this.channel.originalURI.prePath));
  closeDialog();
}

function closeDialog() {
  if (window.arguments[RESULT].importedKeys > 0) {
    AnnealMailKeyRing.clearCache();
  }

  document.getElementById("annealmailSearchKeyDlg").cancelDialog();
  window.close();
}

function onStatusLoaded(request, connectionType) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: onStatusLoaded\n");

  if (request.status == 200) {
    // de-HTMLize the result
    var htmlTxt = request.responseText.replace(/<([^<>]+)>/g, "");

    request.requestCallbackFunc(connectionType, htmlTxt, "");
  }
  else if (request.status == 500 && request.statusText == "OK") {
    request.requestCallbackFunc(ENIG_CONN_TYPE_HTTP, "no keys found", "[GNUPG:] NODATA 1\n");
  }
  else if (request.statusText != "OK") {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("keyDownloadFailed", request.statusText));
    closeDialog();
    return;
  }
}

function statusLoadedKeybase(event) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: statusLoadedKeybase\n");

  onStatusLoaded(this, ENIG_CONN_TYPE_KEYBASE);
}

function statusLoadedHttp(event) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: statusLoadedHttp\n");

  onStatusLoaded(this, ENIG_CONN_TYPE_HTTP);
}

function importKeys(connType, txt, errorTxt) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: importKeys\n");

  gEnigRequest.keyNum++;
  gEnigRequest.progressMeter.mode = "determined";
  gEnigRequest.progressMeter.value = (100 * gEnigRequest.keyNum / gEnigRequest.dlKeyList.length).toFixed(0);

  if (connType == ENIG_CONN_TYPE_KEYBASE) {
    importKeybaseKeys(txt);
  }
  else {
    if (errorTxt.search(/^\[GNUPG:\] IMPORT_RES/m) < 0) {
      if (!importHtmlKeys(txt)) return;
    }
    else if (errorTxt) {
      let resStatusObj = {};

      gEnigRequest.errorTxt = AnnealMailErrorHandling.parseErrorOutput(errorTxt, resStatusObj) + "\n";
    }

    if (errorTxt.search(/^\[GNUPG:\] IMPORT_RES [^0]/m) >= 0) {
      window.arguments[RESULT].importedKeys++;
    }
  }

  if (gEnigRequest.dlKeyList.length > gEnigRequest.keyNum) {
    switch (connType) {
      case ENIG_CONN_TYPE_HTTP:
        newHttpRequest(nsIAnnealMail.DOWNLOAD_KEY, gEnigHttpReq.requestCallbackFunc);
        break;
      case ENIG_CONN_TYPE_CCRKEYS:
        newCcrKeysRequest(nsIAnnealMail.DOWNLOAD_KEY, gEnigRequest.callbackFunction);
        break;
      case ENIG_CONN_TYPE_KEYBASE:
        newHttpRequest(nsIAnnealMail.DOWNLOAD_KEY, gEnigHttpReq.requestCallbackFunc);
    }
    return;
  }
  else if (window.arguments[RESULT].importedKeys > 0) {
    AnnealMailDialog.keyImportDlg(window, gEnigRequest.dlKeyList);
  }
  else if (gEnigRequest.errorTxt) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("noKeyFound"));
  }

  gEnigRequest.httpInProgress = false;

  closeDialog();
}

function importHtmlKeys(txt) {
  let errorMsgObj = {};

  if (txt.length === 0) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("noKeyFound"));
  }
  else {
    let annealmailSvc = GetAnnealMailSvc();
    if (!annealmailSvc)
      return false;

    let r = AnnealMailKeyRing.importKey(window, true, txt, gEnigRequest.dlKeyList[gEnigRequest.keyNum - 1], errorMsgObj);

    if (r === 0) {
      window.arguments[RESULT].importedKeys++;
      return true;
    }
    else if (errorMsgObj.value) {
      AnnealMailDialog.alert(window, errorMsgObj.value);
    }
  }

  closeDialog();
  return false;
}

function importKeybaseKeys(txt) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: importKeybaseKeys\n");
  var errorMsgObj = {};

  var annealmailSvc = GetAnnealMailSvc();
  if (!annealmailSvc)
    return false;

  var resp = JSON.parse(txt);

  if (resp.status.code === 0) {
    for (var hit in resp.them) {
      AnnealMailLog.DEBUG(JSON.stringify(resp.them[hit].public_keys.primary) + "\n");

      if (resp.them[hit] !== null) {
        var uiFlags = nsIAnnealMail.UI_ALLOW_KEY_IMPORT;
        var r = AnnealMailKeyRing.importKey(window, false,
          resp.them[hit].public_keys.primary.bundle,
          gEnigRequest.dlKeyList[gEnigRequest.keyNum - 1],
          errorMsgObj);

        if (r === 0) {
          window.arguments[RESULT].importedKeys++;
        }
        else if (errorMsgObj.value) {
          AnnealMailDialog.alert(window, errorMsgObj.value);
        }
      }
    }
  }

  return true;
}


function newHttpRequest(requestType, requestCallbackFunc) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: newHttpRequest\n");

  switch (gEnigRequest.protocol) {
    case "hkp":
      gEnigRequest.protocol = "http";
      break;
    case "hkps":
      gEnigRequest.protocol = "https";
      break;
    case "http":
    case "https":
    case "keybase":
      break;
    default:
      var msg = AnnealMailLocale.getString("protocolNotSupported", gEnigRequest.protocol);
      if (!AnnealMailPrefs.getPref("useCcrKeysTool"))
        msg += " " + AnnealMailLocale.getString("ccrkeysDisabled");
      AnnealMailDialog.alert(window, msg);
      closeDialog();
      return;
  }

  var httpReq = new XMLHttpRequest();
  var reqCommand;
  switch (requestType) {
    case nsIAnnealMail.SEARCH_KEY:
      var pubKey = trim(gEnigRequest.searchList[gEnigRequest.keyNum]);

      if (gEnigRequest.protocol == "keybase") {
        reqCommand = "https://keybase.io/_/api/1.0/user/autocomplete.json?q=" + escape(pubKey);
      }
      else {
        pubKey = escape("<" + pubKey + ">");
        reqCommand = gEnigRequest.protocol + "://" + gEnigRequest.keyserver + ":" + gEnigRequest.port + "/pks/lookup?search=" + pubKey + "&op=index";
      }
      break;
    case nsIAnnealMail.DOWNLOAD_KEY:
      var keyId = escape(trim(gEnigRequest.dlKeyList[gEnigRequest.keyNum]));

      AnnealMailLog.DEBUG("annealmailSearchKey.js: keyId: " + keyId + "\n");

      if (gEnigRequest.protocol == "keybase") {
        reqCommand = "https://keybase.io/_/api/1.0/user/lookup.json?key_fingerprint=" + escape(keyId.substr(2, 40)) + "&fields=public_keys";
      }
      else {
        reqCommand = gEnigRequest.protocol + "://" + gEnigRequest.keyserver + ":" + gEnigRequest.port + "/pks/lookup?search=" + keyId + "&op=get";
      }
      break;
    default:
      AnnealMailDialog.alert(window, "Unknown request type " + requestType);
      return;
  }

  AnnealMailLog.DEBUG("annealmailSearchKey.js: newHttpRequest: requesting " + reqCommand + "\n");

  gEnigRequest.httpInProgress = true;
  httpReq.open("GET", reqCommand);
  httpReq.onerror = statusError;

  if (gEnigRequest.protocol == "keybase") {
    httpReq.onload = statusLoadedKeybase;
  }
  else {
    httpReq.onload = statusLoadedHttp;
  }

  httpReq.requestCallbackFunc = requestCallbackFunc;
  gEnigHttpReq = httpReq;
  httpReq.send("");
}


function scanKeys(connType, htmlTxt) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: scanKeys\n");

  gEnigRequest.keyNum++;
  gEnigRequest.progressMeter.mode = "determined";
  gEnigRequest.progressMeter.value = (100 * gEnigRequest.keyNum / gEnigRequest.searchList.length).toFixed(0);

  switch (connType) {
    case ENIG_CONN_TYPE_HTTP:
      // interpret HTML codes (e.g. &lt;)
      var domParser = new DOMParser();
      // needs improvement: result is max. 4096 bytes long!
      var htmlNode = domParser.parseFromString("<p>" + htmlTxt + "</p>", "text/xml");

      if (htmlNode.firstChild.nodeName == "parsererror") {
        AnnealMailDialog.alert(window, "internalError");
        return false;
      }
      enigScanHtmlKeys(htmlNode.firstChild.firstChild.data);
      break;
    case ENIG_CONN_TYPE_CCRKEYS:
      scanCcrKeys(AnnealMailData.convertCcrToUnicode(htmlTxt));
      break;
    case ENIG_CONN_TYPE_KEYBASE:
      AnnealMailLog.DEBUG("annealmailSearchKey.js: htmlTxt: " + htmlTxt + "\n");
      var resp = JSON.parse(htmlTxt);

      if (resp.status.code === 0) {
        scanKeybaseKeys(resp.completions);
      }
      else {
        AnnealMailDialog.alert(window, "Internal Error: " + resp.status.name);
        return false;
      }
      break;
    default:
      AnnealMailLog.ERROR("Unkonwn connType: " + connType + "\n");
  }

  if (gEnigRequest.searchList.length > gEnigRequest.keyNum) {
    switch (connType) {
      case ENIG_CONN_TYPE_HTTP:
        newHttpRequest(nsIAnnealMail.SEARCH_KEY, gEnigHttpReq.requestCallbackFunc);
        break;
      case ENIG_CONN_TYPE_CCRKEYS:
        newCcrKeysRequest(nsIAnnealMail.SEARCH_KEY, gEnigRequest.callbackFunction);
        break;
      case ENIG_CONN_TYPE_KEYBASE:
        newHttpRequest(nsIAnnealMail.SEARCH_KEY, gEnigHttpReq.requestCallbackFunc);
    }
    return true;
  }

  gEnigRequest.httpInProgress = false;
  populateList(gEnigRequest.keyList);
  document.getElementById("progress.box").setAttribute("hidden", "true");
  document.getElementById("selall-button").removeAttribute("hidden");
  if (gEnigRequest.keyList.length === 0) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("noKeyFound"));
    closeDialog();
  }

  document.getElementById("dialog.accept").removeAttribute("disabled");

  return true;
}

function scanKeybaseKeys(completions) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: scanKeybaseKeys\n");

  for (var hit in completions) {
    if (completions[hit] && completions[hit].components.key_fingerprint !== undefined) {
      //      var date = new Date(parseInt(them[hit].components.public_keys.primary.ctime,10) * 1000);

      try {
        var key = {
          keyId: completions[hit].components.key_fingerprint.val,
          created: 0, //date.toDateString(),
          uid: [completions[hit].components.username.val + " (" + completions[hit].components.full_name.val + ")"],
          status: ""
        };

        gEnigRequest.keyList.push(key);
      }
      catch (e) {}
    }
  }
}

function enigScanHtmlKeys(txt) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: enigScanHtmlKeys\n");

  var lines = txt.split(/(\n\r|\n|\r)/);
  var key;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].search(/^\s*pub /) === 0) {
      // new key
      if (key) {
        // first, append prev. key to keylist
        gEnigRequest.keyList.push(key);
      }
      key = null;
      var m = lines[i].match(/(\d+[a-zA-Z]?\/)([0-9a-fA-F]+)(\s+[\d\/\-\.]+\s+)(.*)/);
      if (m && m.length > 0) {
        key = {
          keyId: m[2],
          created: m[3],
          uid: [],
          status: ""
        };
        if (m[4].search(/.+<.+@.+>/) >= 0) {
          if (!ignoreUid(m[4])) key.uid.push(trim(m[4]));
        }
        else if (m[4].search(/key (revoked|expired|disabled)/i) >= 0) {
          AnnealMailLog.DEBUG("revoked key id " + m[4] + "\n");
          key = null;
        }
      }
    }
    else {
      // amend to key
      if (key) {
        var uid = trim(lines[i]);
        if (uid.length > 0 && !ignoreUid(uid))
          key.uid.push(uid);
      }
    }
  }

  // append prev. key to keylist
  if (key) {
    gEnigRequest.keyList.push(key);
  }
}

/**
 * Unescape output from keysearch and convert UTF-8 to Unicode.
 * Output looks like this:
 * uid:Ludwig H%C3%BCgelsch%C3%A4fer <ludwig@hammernoch.net>:1240988030::
 *
 * @txt - String to convert in ASCII format
 *
 * @return - Unicode representation
 */
function unescapeAndConvert(txt) {
  return AnnealMailData.convertToUnicode(unescape(txt), "utf-8");
}

function scanCcrKeys(txt) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: scanCcrKeys\n");
  AnnealMailLog.DEBUG("got text: " + txt + "\n");

  // protocol version 0: GnuPG 1.2 and older versions of GnuPG 1.4.x
  // protocol version 1: GnuPG 2.x and newer versions of GnuPG 1.4.x

  var lines = txt.split(/(\r\n|\n|\r)/);
  var outputType = 0;
  var key;
  for (var i = 0; i < lines.length; i++) {
    if (outputType === 0 && lines[i].search(/^COUNT \d+\s*$/) === 0) {
      outputType = 1;
      continue;
    }
    if (outputType === 0 && lines[i].search(/^info:\d+:\d+/) === 0) {
      outputType = 2;
      continue;
    }
    if (outputType === 0 && lines[i].search(/^pub:[\da-fA-F]{8}/) === 0) {
      outputType = 2;
    }
    var m, dat, month, day;
    if (outputType == 1 && (lines[i].search(/^([a-fA-F0-9]{8}){1,2}:/)) === 0) {
      // output from ccrkeys_* protocol version 0
      // new key
      m = lines[i].split(/:/).map(unescape);
      if (m && m.length > 0) {
        if (key) {
          if (key.keyId == m[0]) {
            if (!ignoreUid(m[i])) key.uid.push(trim(m[1]));
          }
          else {
            gEnigRequest.keyList.push(key);
            key = null;
          }
        }
        if (!key) {
          dat = new Date(m[3] * 1000);
          month = String(dat.getMonth() + 101).substr(1);
          day = String(dat.getDate() + 100).substr(1);
          key = {
            keyId: m[0],
            created: dat.getFullYear() + "-" + month + "-" + day,
            uid: [],
            status: ""

          };
          if (!ignoreUid(m[1])) key.uid.push(m[1]);
        }
      }
    }
    if (outputType == 2 && (lines[i].search(/^pub:/)) === 0) {
      // output from ccrkeys_* protocol version 1
      // new key
      m = lines[i].split(/:/).map(unescape);
      if (m && m.length > 1) {
        if (key) {
          gEnigRequest.keyList.push(key);
          key = null;
        }
        dat = new Date(m[4] * 1000);
        month = String(dat.getMonth() + 101).substr(1);
        day = String(dat.getDate() + 100).substr(1);
        key = {
          keyId: m[1],
          created: dat.getFullYear() + "-" + month + "-" + day,
          uid: [],
          status: (m.length >= 5 ? m[6] : "")
        };
      }
    }
    if (outputType == 2 && (lines[i].search(/^uid:.+/)) === 0) {
      // output from ccrkeys_* protocol version 1
      // uid for key
      m = lines[i].split(/:/).map(unescapeAndConvert);
      if (m && m.length > 1) {
        if (key && !ignoreUid(m[1])) key.uid.push(trim(m[1]));
      }
    }
  }

  // append prev. key to keylist
  if (key) {
    gEnigRequest.keyList.push(key);
  }
}

// interaction with ccrkeys_xxx

function newCcrKeysRequest(requestType, callbackFunction) {
  AnnealMailLog.DEBUG("annealmailSearchkey.js: newCcrKeysRequest\n");

  var annealmailSvc = GetAnnealMailSvc();
  if (!annealmailSvc) {
    AnnealMailDialog.alert(window, AnnealMailLocale.getString("accessError"));
    return;
  }

  gEnigRequest.callbackFunction = callbackFunction;
  gEnigRequest.ccrkeysRequest = null;

  gErrorData = "";
  gOutputData = "";

  var procListener = {
    done: function(exitCode) {
      ccrkeysTerminate(exitCode);
    },
    stdout: function(data) {
      gOutputData += data;
    },
    stderr: function(data) {
      gErrorData += data;
    }
  };

  var keyValue;
  if (requestType == nsIAnnealMail.SEARCH_KEY) {
    keyValue = gEnigRequest.searchList[gEnigRequest.keyNum];
  }
  else {
    keyValue = gEnigRequest.dlKeyList[gEnigRequest.keyNum];
  }

  var keyServer = "";
  if (gEnigRequest.protocol) keyServer = gEnigRequest.protocol + "://";
  keyServer += gEnigRequest.keyserver;
  if (gEnigRequest.port) keyServer += ":" + gEnigRequest.port;

  if (gEnigRequest.protocol == "keybase") {
    gEnigRequest.requestType = ENIG_CONN_TYPE_KEYBASE;
    newHttpRequest(requestType, scanKeys);
  }
  else {
    var errorMsgObj = {};
    gEnigRequest.ccrkeysRequest = AnnealMailKeyServer.access(requestType,
      keyServer,
      keyValue,
      procListener,
      errorMsgObj);

    if (!gEnigRequest.ccrkeysRequest) {
      // calling ccrkeys_xxx failed, let's try builtin http variant
      switch (gEnigRequest.protocol) {
        case "hkp":
        case "http":
        case "https":
          gEnigRequest.requestType = ENIG_CONN_TYPE_HTTP;
          newHttpRequest(requestType, scanKeys);
          return;
        default:
          AnnealMailDialog.alert(window, AnnealMailLocale.getString("ccrKeysFailed", gEnigRequest.protocol));
          closeDialog();
          return;
      }
    }

    AnnealMailLog.DEBUG("annealmailSearchkey.js: Start: gEnigRequest.ccrkeysRequest = " + gEnigRequest.ccrkeysRequest + "\n");
  }
}


function ccrkeysTerminate(exitCode) {
  AnnealMailLog.DEBUG("annealmailSearchkey.js: ccrkeysTerminate: exitCode=" + exitCode + "\n");

  gEnigRequest.ccrkeysRequest = null;

  try {
    if (gErrorData.length > 0) {
      AnnealMailLog.DEBUG("annealmailSearchkey.js: Terminate(): stderr has data:\n");
      AnnealMailLog.CONSOLE(gErrorData + "\n");
    }

    // ignore exit code --> try next key if any
    gEnigRequest.callbackFunction(ENIG_CONN_TYPE_CCRKEYS, gOutputData, gErrorData);

  }
  catch (ex) {}
}

// GUI related stuff

function populateList(keyList) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: populateList\n");

  var sortUsers = function(a, b) {
    if (a.uid[0] < b.uid[0]) {
      return -1;
    }
    else {
      return 1;
    }
  };

  var sortKeyIds = function(c, d) {
    if (c.keyId < d.keyId) {
      return -1;
    }
    else {
      return 1;
    }
  };

  keyList.sort(sortKeyIds);

  // remove duplicates
  var z = 0;
  while (z < keyList.length - 1) {
    if (keyList[z].keyId == keyList[z + 1].keyId) {
      keyList.splice(z, 1);
    }
    else {
      z = z + 1;
    }
  }

  keyList.sort(sortUsers);

  var treeList = document.getElementById("annealmailKeySel");
  var treeChildren = treeList.getElementsByAttribute("id", "annealmailKeySelChildren")[0];
  var treeItem;

  for (let i = 0; i < keyList.length; i++) {
    treeItem = createListRow(keyList[i].keyId, false, keyList[i].uid[0], keyList[i].created, keyList[i].status);
    if (keyList[i].uid.length > 1) {
      treeItem.setAttribute("container", "true");
      var subChildren = document.createElement("treechildren");
      for (let j = 1; j < keyList[i].uid.length; j++) {
        var subItem = createListRow(keyList[i].keyId, true, keyList[i].uid[j], "", keyList[i].status);
        subChildren.appendChild(subItem);
      }
      treeItem.appendChild(subChildren);
    }
    treeChildren.appendChild(treeItem);
  }

  if (keyList.length == 1) {
    // activate found item if just one key found
    EnigSetActive(treeItem.firstChild.firstChild, 1);
  }
}

function createListRow(keyId, subKey, userId, dateField, trustStatus) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: createListRow\n");
  var selectCol = document.createElement("treecell");
  selectCol.setAttribute("id", "indicator");
  var expCol = document.createElement("treecell");
  var userCol = document.createElement("treecell");
  userCol.setAttribute("id", "name");
  if (trustStatus.indexOf(KEY_EXPIRED) >= 0) {
    expCol.setAttribute("label", AnnealMailLocale.getString("selKeyExpired", dateField));
  }
  else {
    expCol.setAttribute("label", dateField);
  }

  expCol.setAttribute("id", "expiry");
  userCol.setAttribute("label", userId);
  var keyCol = document.createElement("treecell");
  keyCol.setAttribute("id", "keyid");
  if (subKey) {
    EnigSetActive(selectCol, -1);
    keyCol.setAttribute("label", "");
  }
  else {
    EnigSetActive(selectCol, 0);
    keyCol.setAttribute("label", keyId.substr(-8));
  }


  var userRow = document.createElement("treerow");
  userRow.appendChild(selectCol);
  userRow.appendChild(userCol);
  userRow.appendChild(expCol);
  userRow.appendChild(keyCol);
  var treeItem = document.createElement("treeitem");
  treeItem.setAttribute("id", "0x" + keyId);

  if (trustStatus.length > 0 && KEY_NOT_VALID.indexOf(trustStatus.charAt(0)) >= 0) {
    // key invalid, mark it in grey
    for (var node = userRow.firstChild; node; node = node.nextSibling) {
      var attr = node.getAttribute("properties");
      if (typeof(attr) == "string") {
        node.setAttribute("properties", attr + " enigKeyInactive");
      }
      else {
        node.setAttribute("properties", "enigKeyInactive");
      }
    }
  }

  treeItem.appendChild(userRow);
  return treeItem;
}

function keySelectCallback(event) {
  AnnealMailLog.DEBUG("annealmailSearchKey.js: keySelectCallback\n");

  var Tree = document.getElementById("annealmailKeySel");
  var row = {};
  var col = {};
  var elt = {};
  Tree.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, elt);
  if (row.value == -1)
    return;


  var treeItem = Tree.contentView.getItemAtIndex(row.value);
  Tree.currentItem = treeItem;
  if (col.value.id != "selectionCol")
    return;

  var aRows = treeItem.getElementsByAttribute("id", "indicator");

  if (aRows.length) {
    var elem = aRows[0];
    if (elem.getAttribute("active") == "1") {
      EnigSetActive(elem, 0);
    }
    else if (elem.getAttribute("active") == "0") {
      EnigSetActive(elem, 1);
    }
  }
}

function ignoreUid(uid) {
  const ignoreList = "{Test 555 <sdfg@gga.com>}";
  return (ignoreList.indexOf("{" + trim(uid) + "}") >= 0);
}
