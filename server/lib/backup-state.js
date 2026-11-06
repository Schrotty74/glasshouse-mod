/* Private, bounded settings and image snapshots. Paths are selected here,
 * never by a backup. Strict ES5 for the TV's Node 0.10/0.12. */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var util = require('./util');
var wallpapers = require('./home-wallpapers');
var lineup = require('./iptv-lineup');
var ROOT = '/var/lib/tvweb';
var MAX_BYTES = 64 * 1024 * 1024;
var FILES = ['local-weather-place.json', 'home-wallpaper.json', 'home-recent.json',
  'remotekeys.json', 'preload.json', 'disabled_services.json', 'hidden_apps', 'tile_hiding_enabled', 'saved_page_titles.json', 'adblock_custom.json',
  'iptv/config.json', 'iptv/selection.json'];
var SLOTS = ['morning', 'afternoon', 'evening', 'night'];
['home-wallpaper-uploads', 'home-wallpaper-sets/landscape', 'home-wallpaper-sets/abstract'].forEach(function (dir) {
  SLOTS.forEach(function (slot) { FILES.push(dir + '/' + slot + '.jpg'); });
});
var MAX_FILE = 5 * 1024 * 1024;


function init(dir) { ROOT = dir; }
function digest(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function clean(value, depth) {
  if (depth > 20) throw new Error('Settings are nested too deeply');
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(function (key) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Unsafe settings key');
    clean(value[key], depth + 1);
  });
}
function safePath(name) {
  var parts = name.split('/'), at = ROOT;
  if (fs.lstatSync(ROOT).isSymbolicLink()) throw new Error('Settings directory is a symbolic link');
  parts.forEach(function (part) {
    at = path.join(at, part);
    try { if (fs.lstatSync(at).isSymbolicLink()) throw new Error('Settings path is a symbolic link'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  });
  return at;
}
function checkConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 1024 * 1024) {
    throw new Error('Invalid Glasshouse configuration');
  }
  clean(value, 0);
  ['allowControl', 'allowPower', 'allowExperimentalHome', 'allowExperimentalScreensavers',
    'allowTileHiding', 'allowNetworkDebugger', 'iconServer', 'emulateSetup'].forEach(function (key) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error('Invalid configuration: ' + key);
  });
  if (value.emulateSetup === true) throw new Error('Setup emulation cannot be restored');
  if (value.port !== undefined && (typeof value.port !== 'number' || value.port % 1 || value.port < 1 || value.port > 65535)) {
    throw new Error('Invalid dashboard port');
  }
  ['host', 'token'].forEach(function (key) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 2048 || /[\u0000-\u001f]/.test(value[key]))) {
      throw new Error('Invalid configuration: ' + key);
    }
  });
  ['web', 'logging', 'mqtt', 'syslog', 'ntp', 'apps', 'history', 'backup', 'screenTime',
    'prometheus', 'update', 'device', 'piccap', 'huesync', 'fetch', 'iptv'].forEach(function (key) {
    if (value[key] !== undefined && (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))) {
      throw new Error('Invalid configuration section: ' + key);
    }
  });
}
function validate(name, buf) {
  if (name === 'hidden_apps') {
    if (buf.toString('utf8').split('\n').some(function (id) { return id && !/^[A-Za-z0-9._-]{1,128}$/.test(id); })) throw new Error('Invalid hidden app id');
    return;
  }
  if (name === 'tile_hiding_enabled') {
    if (!/^[01]\s*$/.test(buf.toString('utf8'))) throw new Error('Invalid tile hiding preference');
    return;
  }
  if (/\.jpg$/.test(name)) {
    if (!wallpapers.validJpeg(buf)) throw new Error('Invalid wallpaper image');
    return;
  }
  var value = JSON.parse(buf.toString('utf8'));
  clean(value, 0);
  if (name === 'disabled_services.json' && (!Array.isArray(value) || value.some(function (id) { return typeof id !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(id); }))) throw new Error('Invalid service preference');
  if (name === 'local-weather-place.json' && value !== null &&
      (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160 ||
       typeof value.label !== 'string' || value.label.length > 260 || typeof value.lat !== 'number' ||
       !isFinite(value.lat) || Math.abs(value.lat) > 90 || typeof value.lon !== 'number' ||
       !isFinite(value.lon) || Math.abs(value.lon) > 180)) throw new Error('Invalid weather location');
  if (name === 'home-wallpaper.json' && (!value || ['black', 'own', 'landscape', 'abstract'].indexOf(value.choice) < 0)) {
    throw new Error('Invalid wallpaper choice');
  }
  if (name === 'iptv/config.json') {
    if (!value || !Array.isArray(value.playlists) || value.playlists.length > 8) throw new Error('Invalid IPTV playlists');
    var seen = {};
    value.playlists.forEach(function (p) {
      if (!p || !/^p[0-9a-f]{6,12}$/.test(p.id) || seen[p.id] || ['m3u', 'xtream'].indexOf(p.kind) < 0) {
        throw new Error('Invalid IPTV playlist');
      }
      seen[p.id] = true;
    });
  }
  if (name === 'iptv/selection.json') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid IPTV selection');
    // Exercise the same compatibility reader as IPTV before accepting it.
    lineup.normalise(value);
  }
}
function create() {
  var files = [], total = 0;
  FILES.forEach(function (name) {
    var file;
    try { file = safePath(name); if (!fs.existsSync(file)) return; }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
    var st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_FILE) throw new Error('Settings file exceeds backup limit: ' + name);
    var buf = fs.readFileSync(file);
    validate(name, buf);
    total += buf.length;
    if (total > 40 * 1024 * 1024) throw new Error('Settings and images exceed the 40 MB backup limit');
    files.push({ name: name, data: buf.toString('base64'), sha256: digest(buf) });
  });
  return { version: 1, files: files };
}
function prepare(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.files) || snapshot.files.length > FILES.length) {
    throw new Error('Invalid settings snapshot');
  }
  var seen = {}, total = 0;
  var entries = snapshot.files.map(function (entry) {
    if (!entry || FILES.indexOf(entry.name) < 0 || seen[entry.name] || typeof entry.data !== 'string' ||
        entry.data.length > Math.ceil(MAX_FILE / 3) * 4 || (!/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data) || entry.data.length % 4 !== 0)) {
      throw new Error('Invalid backup file');
    }
    seen[entry.name] = true;
    var buf = new Buffer(entry.data, 'base64');
    total += buf.length;
    if (buf.length > MAX_FILE || total > 40 * 1024 * 1024 || digest(buf) !== entry.sha256) throw new Error('Backup checksum or size mismatch');
    validate(entry.name, buf);
    if (entry.name === 'iptv/config.json') {
      var playlists = JSON.parse(buf.toString('utf8'));
      playlists.playlists.forEach(function (p) { p.due = {}; delete p.loginRefused; });
      buf = new Buffer(JSON.stringify(playlists), 'utf8');
    }
    return { name: entry.name, data: buf };
  });
  entries.slice().forEach(function (entry) {
    if (entry.name !== 'iptv/config.json') return;
    JSON.parse(entry.data.toString('utf8')).playlists.forEach(function (p) {
      entries.push({ name: 'iptv/' + p.id + '/current.json', data: new Buffer('{}', 'utf8') });
    });
  });
  return entries;
}
/* Stage every file before replacing any. Keep previous bytes until the whole
 * transaction succeeds, so ENOSPC or a rename failure preserves the old state. */
function restore(entries) {
  var staged = [], committed = [];
  try {
    entries.forEach(function (entry) {
      var file = safePath(entry.name);
      util.mkdirp(path.dirname(file));
      var temporary = file + '.backup-restore-' + crypto.randomBytes(8).toString('hex');
      var previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
      staged.push({ file: file, temporary: temporary, previous: previous });
      fs.writeFileSync(temporary, entry.data, { flag: 'wx', mode: 384 });
    });
    staged.forEach(function (entry) { fs.renameSync(entry.temporary, entry.file); committed.push(entry); });
  } catch (e) {
    /** @type {string[]} */
    var rollbackErrors = [];
    committed.reverse().forEach(function (entry) {
      try {
        if (entry.previous === null) fs.unlinkSync(entry.file);
        else { fs.writeFileSync(entry.temporary, entry.previous, { mode: 384 }); fs.renameSync(entry.temporary, entry.file); }
      } catch (r) { rollbackErrors.push(r.message); }
    });
    staged.forEach(function (entry) { util.unlinkQuiet(entry.temporary); });
    if (rollbackErrors.length) throw new Error('Restore failed and rollback was incomplete: ' + rollbackErrors.join('; '));
    throw e;
  }
  return entries.map(function (entry) { return entry.name; });
}
module.exports = { init: init, create: create, prepare: prepare, restore: restore, checkConfiguration: checkConfiguration, MAX_BYTES: MAX_BYTES };
