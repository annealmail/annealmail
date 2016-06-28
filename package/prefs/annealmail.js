/* global pref: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Default pref values for AnnealMail
 */

// the last configured AnnealMail version
pref("extensions.annealmail.configuredVersion", "");

// Hide prefs and menu entries from non-advanced users
pref("extensions.annealmail.advancedUser", false);

// additional parameter(s) to pass to GnuPG
pref("extensions.annealmail.agentAdditionalParam", "");

// path to ccr executable
pref("extensions.annealmail.agentPath", "");

// allow empty subject line without asking for confirmation
pref("extensions.annealmail.allowEmptySubject", false);

// ** annealmail keySel preferences:
// use rules to assign keys
pref("extensions.annealmail.assignKeysByRules", true);
// use email addresses to assign keys
pref("extensions.annealmail.assignKeysByEmailAddr", true);
// use manual dialog to assign missing keys
pref("extensions.annealmail.assignKeysManuallyIfMissing", true);
// always srats manual dialog for keys
pref("extensions.annealmail.assignKeysManuallyAlways", false);

// automatically download missing keys from keyserver
pref("extensions.annealmail.autoKeyRetrieve", "");

// enable automatically decrypt/verify
pref("extensions.annealmail.autoDecrypt", true);

// enable X-AnnealMail-xxx headers
pref("extensions.annealmail.addHeaders", false);

// countdown for alerts when composing inline PGP HTML msgs
pref("extensions.annealmail.composeHtmlAlertCount", 3);

// prefer S/MIME or PGP/MIME (0: PGP/MIME, 1: ask, 2: S/MIME)
pref("extensions.annealmail.mimePreferPgp", 1);

// show warning message when clicking on sign icon
pref("extensions.annealmail.displaySignWarn", true);

// display warning as info for partially signed message
pref("extensions.annealmail.displayPartiallySigned", true);

// try to match secondary uid to from address
pref("extensions.annealmail.displaySecondaryUid", true);

// treat '-- ' as signature separator
pref("extensions.annealmail.doubleDashSeparator", true);

// last state of dialog to choose encryption method if there are attachments
pref("extensions.annealmail.encryptAttachments", 1);

// skip the attachments dialog
pref("extensions.annealmail.encryptAttachmentsSkipDlg", 0);

// Encrypt to self
pref("extensions.annealmail.encryptToSelf", true);

// enable 'Decrypt & open' for double click on attachment (if possible)
pref("extensions.annealmail.handleDoubleClick", true);

// disable '<' and '>' around email addresses
pref("extensions.annealmail.hushMailSupport", false);

// display alert for 'failed to initialize enigmime'
pref("extensions.annealmail.initAlert", true);

// use -a for encrypting attachments for inline PGP
pref("extensions.annealmail.inlineAttachAsciiArmor", false);

// extension to append for inline-encrypted attachments
pref("extensions.annealmail.inlineAttachExt", ".pgp");

// extension to append for inline-signed attachments
pref("extensions.annealmail.inlineSigAttachExt", ".sig");

// debug log directory (if set, also enabled debugging)
pref("extensions.annealmail.logDirectory", "");

// display all or no keys by default in the key manager
pref("extensions.annealmail.keyManShowAllKeys", true);


// list of keyservers to use
pref("extensions.annealmail.keyserver", "pool.sks-keyservers.net, keys.gnupg.net, pgp.mit.edu");

// auto select the first keyserver in the key server list
pref("extensions.annealmail.autoKeyServerSelection", true);

// keep passphrase for ... minutes
pref("extensions.annealmail.maxIdleMinutes", 5);

// GnuPG hash algorithm
// 0: automatic seletion (i.e. let GnuPG choose)
// 1: SHA1, 2: RIPEMD160, 3: SHA256, 4: SHA384, 5: SHA512, 6: SHA224
pref("extensions.annealmail.mimeHashAlgorithm", 0);

// no passphrase for GnuPG key needed
pref("extensions.annealmail.noPassphrase", false);

// show quoted printable warning message (and remember selected state)
pref("extensions.annealmail.quotedPrintableWarn", 0);

// use http proxy settings as set in Mozilla/Thunderbird
pref("extensions.annealmail.respectHttpProxy", true);

// selection for which encryption model to prefer
// 0: convenient encryption settings DEFAULT
// 1: manual encryption settings
pref("extensions.annealmail.encryptionModel", 0);

// enable encryption for replies to encrypted mails
pref("extensions.annealmail.keepSettingsForReply", true);

// Warn if a key expires in less than N days.
// 0 will disable the check
pref("extensions.annealmail.warnKeyExpiryNumDays", 30);

// holds the last result of the dayily key expiry check
pref("extensions.annealmail.keyCheckResult", "");


// selection for which keys to accept
// 0: accept valid/authenticated keys
// 1: accept all keys (except disabled, ...) DEFAULT
pref("extensions.annealmail.acceptedKeys", 1);

// selection for automatic send encrypted if all keys valid
// 0: never
// 1: if all keys found and accepted DEFAULT
pref("extensions.annealmail.autoSendEncrypted", 1);

// ask to confirm before sending
// 0: never DEFAULT
// 1: always
// 2: if send encrypted
// 3: if send unencrypted
// 4: if send (un)encrypted due to rules
pref("extensions.annealmail.confirmBeforeSending", 0);

// show "Missing Trust in own keys" message (and remember selected state)
pref("extensions.annealmail.warnOnMissingOwnerTrust", true);

// use GnuPG's default instead of AnnealMail/Mozilla comment of for signed messages
pref("extensions.annealmail.useDefaultComment", true);

// allow encryption to newsgroups
pref("extensions.annealmail.encryptToNews", false);
pref("extensions.annealmail.warnOnSendingNewsgroups", true);

// set locale for GnuPG calls to en-US (Windows only)
pref("extensions.annealmail.ccrLocaleEn", true);

// use PGP/MIME (0=never, 1=allow, 2=always)
// pref("extensions.annealmail.usePGPMimeOption",1); -- OBSOLETE, see mail.identity.default.pgpMimeMode

// enable using ccrkeys_*
pref("extensions.annealmail.useCcrKeysTool", true);

// show "conflicting rules" message (and remember selected state)
pref("extensions.annealmail.warnOnRulesConflict", 0);

// display a warning when the passphrase is cleared
pref("extensions.annealmail.warnClearPassphrase", true);

// display a warning if the GnuPG version is deprecated
pref("extensions.annealmail.warnDeprecatedGnuPG", true);

// warn if ccr-agent is found and "remember passphrase for X minutes is active"
pref("extensions.annealmail.warnCcrAgentAndIdleTime", true);

// display a warning when all keys are to be refreshed
pref("extensions.annealmail.warnRefreshAll", true);

// display a warning when the keys for all contacts are downloaded
pref("extensions.annealmail.warnDownloadContactKeys", true);

// wrap HTML messages before sending inline PGP messages
pref("extensions.annealmail.wrapHtmlBeforeSend", true);

// enable encryption/signing of headers like subject, from, to
pref("extensions.annealmail.protectHeaders", true);
pref("extensions.annealmail.protectedSubjectText", "");

// do reset the "references" and "in-reply-to" headers?
pref("extensions.annealmail.protectReferencesHdr", false);

// enable experimental features.
// WARNING: such features may unfinished functions or tests that can break
// existing functionality in AnnealMail and Thunderbird!
pref("extensions.annealmail.enableExperiments", false);


/*
   Default pref values for the annealmail per-identity
   settings
*/

pref("mail.identity.default.enablePgp", false);
pref("mail.identity.default.pgpkeyId", "");
pref("mail.identity.default.pgpKeyMode", 0);
pref("mail.identity.default.pgpSignPlain", false);
pref("mail.identity.default.pgpSignEncrypted", false);
pref("mail.identity.default.defaultSigningPolicy", 0);
pref("mail.identity.default.defaultEncryptionPolicy", 0);
pref("mail.identity.default.openPgpHeaderMode", 0);
pref("mail.identity.default.openPgpUrlName", "");
pref("mail.identity.default.pgpMimeMode", true);
pref("mail.identity.default.attachPgpKey", false);
pref("mail.identity.default.autoEncryptDrafts", true);

/*
   Other settings (change Mozilla behaviour)
*/

// disable flowed text by default
pref("mailnews.send_plaintext_flowed", false);
