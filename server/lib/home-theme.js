/*
 * lib/home-theme.js - Hearth themes on Glasshouse Home.
 *
 * Hearth (github.com/rudra-avatar/Hearth, MIT) is another home screen for
 * webOS; its themes are one zip with a manifest.json (format 1) and pictures
 * and fonts beside it. The format and its rules follow Hearth's theme guide
 * (docs/theme/theme-guide.md there): every part is optional, an unknown key
 * refuses the theme, and only pictures, fonts, the manifest and notes may be
 * in the zip, so a theme never carries code.
 *
 * What Glasshouse Home has an equivalent for is used: the colours (as its
 * text and accent colour and the page's background), the fonts (the clock and
 * the tile names), the wallpaper or slideshow, the apps' order and names and
 * their icons, their style (mono, soft, tinted and the rest, drawn with CSS
 * filters) and colour, and its cities as places offered for the weather.
 * The icon tile's light or dark has nothing to change and is listed as
 * ignored.
 *
 * Adapted from quzopl/glasshouse (MIT), commits d3f5594 and 808989f.
 * The active theme and its referenced assets live in one atomic state file.
 * Hearth's ZIPs are offered from /media/developer/themes.
 *
 * Strict ES5: runs on node 0.12.
 */
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');
var util = require('./util');

var stateDir = '/var/lib/tvweb';
var themesDir = '/media/developer/themes';

// Hearth refuses a file above 100 MB. The TV unpacks in memory, so the zip and
// what it unpacks to are held to less.
var MAX_ZIP = 40 * 1024 * 1024;
var MAX_UNPACKED = 60 * 1024 * 1024;
var MAX_ENTRIES = 2000;
var MAX_SAVED = 20 * 1024 * 1024;
var STATE_FILE = 'home-theme.json';
var ALLOWED_EXT = /\.(png|jpe?g|woff2?|ttf|otf|json|md|txt)$/i;
var PICTURE_EXT = /\.(png|jpe?g)$/i;
var FONT_EXT = /\.(woff2?|ttf|otf)$/i;
var FONT_ID_RE = /^[a-z0-9-]{1,32}$/;
var HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Hearth's palettes (src/theme/tokens.ts): the background, the widget's own
// colour (the clock and date) and the accent.
var PALETTES = {
  black: { bg: '#000000', ink: '#f2f2f2', accent: '#e6e6e6' },
  grey: { bg: '#101a24', ink: '#cfe3f5', accent: '#6fb3d9' },
  midnight: { bg: '#0a1020', ink: '#c3ceff', accent: '#7f9bff' },
  forest: { bg: '#0b1a12', ink: '#c2ebcf', accent: '#7fd19a' },
  teal: { bg: '#08191b', ink: '#a9efe8', accent: '#6fd3cc' },
  graphite: { bg: '#17140f', ink: '#f0cf8e', accent: '#d9b36c' }
};
// Hearth's plain widget colours (src/lib/clockcolor.ts); "theme" follows the palette.
var INKS = {
  white: '#f2f2f2', warm: '#ffe9c7', blue: '#c4e2ff', amber: '#ffb74d',
  grey: '#9aa0a6', charcoal: '#3c4043', black: '#0a0a0a'
};
var ICON_STYLES = ['original', 'mono', 'soft', 'accent', 'gradient', 'tinted'];

function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
function isObject(v) { return !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype; }
function own(obj, key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key); }
function themeFile() { return path.join(stateDir, STATE_FILE); }

/*
 * A zip's entries from its central directory, still packed: stored and
 * deflated only, no encryption, no zip64. The sizes it states are held to
 * MAX_UNPACKED here, and inflate holds each entry to its stated size.
 * errors gets each problem.
 */
function entries(buf, errors) {
  var out = [], seen = Object.create(null), total = 0, i, eocd = -1;
  for (i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { errors.push('not a zip file'); return null; }
  var count = buf.readUInt16LE(eocd + 10), at = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) { errors.push('too many files in the zip'); return null; }
  for (i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) { errors.push('damaged zip'); return null; }
    var flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10);
    var csize = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24);
    var nlen = buf.readUInt16LE(at + 28), elen = buf.readUInt16LE(at + 30), clen = buf.readUInt16LE(at + 32);
    var local = buf.readUInt32LE(at + 42);
    if (at + 46 + nlen + elen + clen > eocd) { errors.push('damaged zip directory'); return null; }
    var name = buf.toString('utf8', at + 46, at + 46 + nlen);
    at += 46 + nlen + elen + clen;
    // Folders, and what macOS's Archive Utility adds, are not files of the theme.
    if (/\/$/.test(name) || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name)) continue;
    var bad = badName(name);
    if (bad) { errors.push(name + ': ' + bad); continue; }
    if (seen[name]) { errors.push(name + ': duplicate file'); continue; }
    seen[name] = true;
    if (flags & 1) { errors.push(name + ': encrypted'); continue; }
    if (method !== 0 && method !== 8) { errors.push(name + ': unsupported compression'); continue; }
    if (size === 0xffffffff || csize === 0xffffffff) { errors.push(name + ': too large'); continue; }
    total += size;
    if (total > MAX_UNPACKED) { errors.push('the theme unpacks to more than ' + (MAX_UNPACKED >> 20) + ' MB'); return null; }
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) { errors.push(name + ': damaged'); continue; }
    var start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + csize > buf.readUInt32LE(eocd + 16)) { errors.push(name + ': damaged'); continue; }
    out.push({ name: name, method: method, size: size, data: buf.slice(start, start + csize) });
  }
  return out;
}

/*
 * One entry unpacked, stopped as soon as it gives more than the size the zip
 * states for it: a zip bomb states a small size and unpacks to gigabytes,
 * and node 0.12's inflateRawSync has no limit on what it gives. The packed
 * data goes in a piece at a time and no more is given once the limit is
 * passed; the stream is left to end rather than closed, since closing zlib
 * while it still works through a write aborts the server (node 8, a CX).
 * Deflate packs at most 1032 to 1, so a piece of about size / 1032 bytes
 * holds all an honest entry has, and the piece that passes the limit can
 * unpack to at most about a megabyte more.
 */
function inflateStep(size) { return Math.min(16384, Math.max(1024, Math.ceil(size / 1032) + 64)); }
function inflate(entry, cb) {
  if (entry.method === 0) return cb(entry.data.length === entry.size ? null : new Error('damaged'), entry.data);
  var inf = zlib.createInflateRaw(), chunks = [], got = 0, done = false, at = 0, step = inflateStep(entry.size);
  function finish(err) {
    if (done) return;
    done = true;
    if (err) { chunks = []; return cb(err); }
    cb(got === entry.size ? null : new Error('damaged'), Buffer.concat(chunks, got));
  }
  inf.on('data', function (d) {
    if (done) return;
    got += d.length;
    if (got > entry.size) {
      /** @type {any} */
      var over = new Error('unpacks to more than it states');
      over.oversize = true;
      return finish(over);
    }
    chunks.push(d);
  });
  inf.on('error', function () { finish(new Error('damaged')); });
  inf.on('end', function () { finish(null); });
  (function feed() {
    if (done || at >= entry.data.length) return inf.end();
    var piece = entry.data.slice(at, at + step);
    at += step;
    inf.write(piece, feed);
  })();
}

// The zip's files as cb({ name: Buffer }), or cb(null) with errors.
function unzip(buf, errors, cb) {
  var list = entries(buf, errors);
  if (!list) return cb(null);
  var out = Object.create(null), i = 0;
  (function next() {
    if (i >= list.length) return cb(out);
    var e = list[i++];
    inflate(e, function (err, data) {
      if (err) errors.push(e.name + ': ' + err.message);
      else out[e.name] = data;
      // One entry that lies about its size refuses the zip: the rest are not unpacked.
      if (err && err.oversize) return cb(null);
      if (e.method === 0) process.nextTick(next);
      else next();
    });
  })();
}

// Hearth's rules for a name in the zip; '' when it passes.
function badName(name) {
  if (!name || name.length > 200) return 'name too long';
  if (name.charAt(0) === '/' || /\\|:/.test(name) || /(^|\/)\.\.(\/|$)/.test(name)) return 'not a plain relative path';
  if (/[\u0000-\u001f]/.test(name) || name.split('/').some(function (part) { return !part || part === '.'; })) return 'not a plain relative path';
  if (!ALLOWED_EXT.test(name)) return 'not allowed in a theme (only pictures, fonts, manifest.json and notes)';
  return '';
}

// Keys a part may have: any other refuses the theme, as in Hearth.
function onlyKeys(obj, keys, where, errors) {
  Object.keys(obj).forEach(function (k) {
    if (keys.indexOf(k) === -1) errors.push(where + ': unknown key "' + k + '"');
  });
}

function textOf(v, max) { return typeof v === 'string' && v.length >= 1 && v.length <= max; }

/*
 * The manifest checked against Hearth's format 1 and the zip's files. Returns
 * the parts Glasshouse uses, and pushes each problem onto errors.
 */
function checkManifest(m, files, errors) {
  if (!isObject(m)) { errors.push('manifest.json is not an object'); return null; }
  onlyKeys(m, ['format', 'name', 'author', 'colors', 'fonts', 'iconStyle', 'wallpaper', 'icons', 'apps', 'cities'], 'manifest', errors);
  if (m.format !== 1) errors.push('manifest: "format" must be 1');
  if (!textOf(m.name, 40)) errors.push('manifest: "name" must be text of 1 to 40 characters');
  if (m.author !== undefined && !textOf(m.author, 60)) errors.push('manifest: "author" must be text of at most 60 characters');
  /** @type {any} */
  var out = { name: String(m.name || ''), author: typeof m.author === 'string' ? m.author : '', ignored: [] };
  function file(rel, re, where) {
    if (typeof rel !== 'string' || !files[rel]) { errors.push(where + ': file "' + rel + '" is not in the zip'); return null; }
    if (!re.test(rel)) { errors.push(where + ': "' + rel + '" is the wrong kind of file'); return null; }
    return rel;
  }

  if (m.colors !== undefined) {
    var c = m.colors;
    if (!isObject(c)) errors.push('colors: must be an object');
    else {
      onlyKeys(c, ['theme', 'widget', 'widgetInk', 'icon'], 'colors', errors);
      if (c.theme !== undefined && !own(PALETTES, c.theme)) errors.push('colors.theme: unknown theme "' + c.theme + '"');
      if (c.widget !== undefined && c.widget !== 'theme' && !own(INKS, c.widget)) errors.push('colors.widget: unknown colour "' + c.widget + '"');
      if (c.widgetInk !== undefined && !HEX_RE.test(String(c.widgetInk))) errors.push('colors.widgetInk: must be #RRGGBB');
      if (c.widget !== undefined && c.widgetInk !== undefined) errors.push('colors: give "widget" or "widgetInk", not both');
      if (c.icon !== undefined) {
        if (c.icon !== 'theme' && !own(INKS, c.icon)) errors.push('colors.icon: unknown colour "' + c.icon + '"');
        else out.iconInk = own(INKS, c.icon) ? INKS[c.icon] : null;
      }
      var pal = own(PALETTES, c.theme) ? PALETTES[c.theme] : null;
      out.colours = {
        bg: pal ? pal.bg : null,
        accent: pal ? pal.accent : null,
        text: HEX_RE.test(String(c.widgetInk)) ? String(c.widgetInk).toLowerCase()
          : own(INKS, c.widget) ? INKS[c.widget] : pal ? pal.ink : null
      };
    }
  }

  if (m.fonts !== undefined) {
    var f = m.fonts;
    if (!isObject(f)) errors.push('fonts: must be an object');
    else {
      onlyKeys(f, ['files', 'widget', 'names'], 'fonts', errors);
      var ids = Object.create(null);
      out.fonts = { files: [], widget: null, names: null };
      if (f.files !== undefined && !isArray(f.files)) errors.push('fonts.files: must be a list');
      (isArray(f.files) ? f.files : []).forEach(function (ff, i) {
        var where = 'fonts.files[' + i + ']';
        if (!isObject(ff)) return errors.push(where + ': must be an object');
        onlyKeys(ff, ['id', 'label', 'file'], where, errors);
        if (!FONT_ID_RE.test(String(ff.id))) return errors.push(where + ': id must be 1-32 of a-z 0-9 -');
        if (ids[ff.id]) return errors.push(where + ': id "' + ff.id + '" given twice');
        if (ff.label !== undefined && !textOf(ff.label, 60)) errors.push(where + ': label must be text');
        var rel = file(ff.file, FONT_EXT, where);
        if (!rel) return;
        ids[ff.id] = true;
        out.fonts.files.push({ id: ff.id, file: rel });
      });
      // A font of the theme is used; Hearth's built-in fonts are not Glasshouse's, so naming one changes nothing.
      ['widget', 'names'].forEach(function (k) {
        if (f[k] === undefined) return;
        if (typeof f[k] !== 'string') return errors.push('fonts.' + k + ': must be a font id');
        if (ids[f[k]]) out.fonts[k] = f[k];
        else if (f[k] !== 'default') out.ignored.push('fonts.' + k + ' (' + f[k] + ')');
      });
    }
  }

  if (m.iconStyle !== undefined) {
    var s = m.iconStyle;
    if (!isObject(s)) errors.push('iconStyle: must be an object');
    else {
      onlyKeys(s, ['style', 'tile'], 'iconStyle', errors);
      if (s.style !== undefined && ICON_STYLES.indexOf(s.style) === -1) errors.push('iconStyle.style: unknown style "' + s.style + '"');
      if (s.tile !== undefined && s.tile !== 'dark' && s.tile !== 'light') errors.push('iconStyle.tile: must be dark or light');
      if (s.style !== undefined && s.style !== 'original') out.iconStyle = s.style;
      if (s.tile !== undefined) out.ignored.push('iconStyle.tile');
    }
  }

  if (m.wallpaper !== undefined) {
    var w = m.wallpaper;
    if (!isObject(w)) errors.push('wallpaper: must be an object');
    else {
      onlyKeys(w, ['file', 'folder', 'intervalSec', 'shuffle'], 'wallpaper', errors);
      if ((w.file === undefined) === (w.folder === undefined)) errors.push('wallpaper: give "file" or "folder", one of the two');
      else if (w.file !== undefined) {
        var one = file(w.file, PICTURE_EXT, 'wallpaper.file');
        if (one) out.wallpaper = { files: [one] };
      } else {
        var dir = String(w.folder).replace(/\/+$/, '');
        var pics = Object.keys(files).filter(function (n) {
          return n.indexOf(dir + '/') === 0 && n.slice(dir.length + 1).indexOf('/') === -1 && PICTURE_EXT.test(n);
        }).sort();
        if (!pics.length) errors.push('wallpaper.folder: no pictures directly inside "' + dir + '"');
        else out.wallpaper = { files: pics };
      }
      if (w.intervalSec !== undefined) {
        if (w.folder === undefined) errors.push('wallpaper.intervalSec: only with "folder"');
        else if (typeof w.intervalSec !== 'number' || w.intervalSec % 1 || w.intervalSec < 5 || w.intervalSec > 3600) {
          errors.push('wallpaper.intervalSec: whole seconds, 5 to 3600');
        } else if (out.wallpaper) out.wallpaper.intervalSec = w.intervalSec;
      }
      if (w.shuffle !== undefined) {
        if (w.folder === undefined) errors.push('wallpaper.shuffle: only with "folder"');
        else if (typeof w.shuffle !== 'boolean') errors.push('wallpaper.shuffle: true or false');
        else if (out.wallpaper) out.wallpaper.shuffle = w.shuffle;
      }
    }
  }

  if (m.icons !== undefined) {
    if (!isArray(m.icons)) errors.push('icons: must be a list');
    else {
      out.icons = Object.create(null);
      m.icons.forEach(function (ic, i) {
        var where = 'icons[' + i + ']';
        if (!isObject(ic)) return errors.push(where + ': must be an object');
        onlyKeys(ic, ['app', 'file'], where, errors);
        if (!textOf(ic.app, 200)) return errors.push(where + ': app must be an app id');
        var rel = file(ic.file, PICTURE_EXT, where);
        if (rel) out.icons[ic.app] = rel;
      });
    }
  }

  if (m.apps !== undefined) {
    if (!isArray(m.apps)) errors.push('apps: must be a list');
    else {
      out.order = [];
      out.names = Object.create(null);
      m.apps.forEach(function (a, i) {
        var where = 'apps[' + i + ']';
        if (!isObject(a)) return errors.push(where + ': must be an object');
        onlyKeys(a, ['id', 'name'], where, errors);
        if (!textOf(a.id, 200)) return errors.push(where + ': id must be an app id');
        if (a.name !== undefined) {
          if (!textOf(a.name, 24)) return errors.push(where + ': name must be text of at most 24 characters');
          out.names[a.id] = a.name;
        }
        if (out.order.indexOf(a.id) === -1) out.order.push(a.id);
      });
    }
  }

  if (m.cities !== undefined) {
    if (!isArray(m.cities)) errors.push('cities: must be a list');
    else {
      out.cities = [];
      m.cities.forEach(function (ct, i) {
        var where = 'cities[' + i + ']';
        if (!isObject(ct)) return errors.push(where + ': must be an object');
        onlyKeys(ct, ['name', 'lat', 'lon', 'detail'], where, errors);
        if (!textOf(ct.name, 60) || typeof ct.lat !== 'number' || typeof ct.lon !== 'number' || !isFinite(ct.lat) || !isFinite(ct.lon) || Math.abs(ct.lat) > 90 || Math.abs(ct.lon) > 180) return errors.push(where + ': needs name, lat and lon');
        if (ct.detail !== undefined && !textOf(ct.detail, 120)) return errors.push(where + ': detail must be text');
        out.cities.push({ name: ct.name, lat: ct.lat, lon: ct.lon, detail: typeof ct.detail === 'string' ? ct.detail : '' });
      });
    }
  }
  return out;
}

/*
 * A zip checked into a theme: cb({ theme, files }) or cb({ errors }), with
 * Hearth's first six problems at most, as its pop-up shows.
 */
function parse(buf, cb) {
  var errors = [];
  if (!buf || buf.length < 22) return cb({ errors: ['not a zip file'] });
  if (buf.length > MAX_ZIP) return cb({ errors: ['the zip is larger than ' + (MAX_ZIP >> 20) + ' MB'] });
  unzip(buf, errors, function (files) {
    if (!files) return cb({ errors: errors.slice(0, 6) });
    var m = null;
    if (!files['manifest.json']) errors.push('manifest.json is not at the top of the zip');
    else {
      try { m = JSON.parse(files['manifest.json'].toString('utf8').replace(/^\ufeff/, '')); }
      catch (e) { errors.push('manifest.json is not valid JSON'); }
    }
    var theme = errors.length ? null : checkManifest(m, files, errors);
    if (errors.length) return cb({ errors: errors.slice(0, 6) });
    cb({ theme: theme, manifest: m, files: files });
  });
}

// The files the theme uses: what is kept on the TV.
function usedFiles(theme) {
  var used = [];
  function add(rel) { if (rel && used.indexOf(rel) === -1) used.push(rel); }
  if (theme.fonts) theme.fonts.files.forEach(function (f) { add(f.file); });
  if (theme.wallpaper) theme.wallpaper.files.forEach(add);
  if (theme.icons) Object.keys(theme.icons).forEach(function (k) { add(theme.icons[k]); });
  return used;
}

// Read the exact same format from disk and from backups. ZIP import saves only
// the referenced files, so restore can validate without unpacking a second ZIP.
function validateSaved(buf) {
  if (buf.length > MAX_SAVED) throw new Error('Theme exceeds the 20 MB saved size limit');
  var record = JSON.parse(buf.toString('utf8'));
  if (record === null) return null;
  if (!isObject(record) || record.version !== 1 || !isObject(record.files) ||
      typeof record.source !== 'string' || record.source.length > 200 ||
      typeof record.revision !== 'string' || !/^[0-9a-f]{16}$/.test(record.revision)) {
    throw new Error('Invalid saved theme');
  }
  var keys = Object.keys(record.files);
  if (keys.length > MAX_ENTRIES || keys.some(function (name) {
    var data = record.files[name];
    return badName(name) || !(PICTURE_EXT.test(name) || FONT_EXT.test(name)) ||
      typeof data !== 'string' || !data.length || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data);
  })) throw new Error('Invalid theme asset');
  var errors = [];
  var theme = checkManifest(record.manifest, record.files, errors);
  if (errors.length || usedFiles(theme).length !== keys.length) {
    throw new Error('Invalid saved theme: ' + (errors[0] || 'unused asset'));
  }
  return { theme: theme, files: record.files, source: record.source, revision: record.revision };
}

var cache;
function current() {
  if (cache !== undefined) return cache;
  try {
    var st = fs.lstatSync(themeFile());
    if (!st.isFile() || st.size > MAX_SAVED) throw new Error('Invalid theme state file');
    cache = validateSaved(fs.readFileSync(themeFile()));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('home: could not read Hearth theme');
    cache = null;
  }
  return cache;
}

function store(parsed, source) {
  var files = Object.create(null);
  usedFiles(parsed.theme).forEach(function (rel) { files[rel] = parsed.files[rel].toString('base64'); });
  var record = {
    version: 1, manifest: parsed.manifest, files: files,
    source: typeof source === 'string' ? source.slice(0, 200) : '',
    revision: crypto.randomBytes(8).toString('hex')
  };
  var body = JSON.stringify(record);
  if (Buffer.byteLength(body, 'utf8') > MAX_SAVED) throw new Error('Theme exceeds the 20 MB saved size limit');
  util.writeJsonAtomic(themeFile(), record, 384, true);
  cache = { theme: parsed.theme, files: files, source: record.source, revision: record.revision };
}

function clear() {
  util.writeJsonAtomic(themeFile(), null, 384, true);
  cache = null;
}

// The zips Hearth's folder holds, for the dashboards to offer.
function listZips(cb) {
  fs.readdir(themesDir, function (err, names) {
    if (err) return cb([]);
    var out = [];
    (names || []).filter(function (n) { return /\.zip$/i.test(n); }).sort().forEach(function (n) {
      try {
        var st = fs.lstatSync(path.join(themesDir, n));
        if (st.isFile() && st.size <= MAX_ZIP) out.push({ name: n, size: st.size });
      } catch (e) { /* gone meanwhile */ }
    });
    cb(out);
  });
}

// A zip from Hearth's folder, by its plain name only.
function readZip(name, cb) {
  if (typeof name !== 'string' || !/^[^\/\\]{1,200}\.zip$/i.test(name) || /^\./.test(name)) return cb(new Error('no such theme zip'));
  var file = path.join(themesDir, name);
  fs.lstat(file, function (err, st) {
    if (err || !st.isFile()) return cb(new Error('no such theme zip'));
    if (st.size > MAX_ZIP) return cb(new Error('the zip is larger than ' + (MAX_ZIP >> 20) + ' MB'));
    fs.readFile(file, cb);
  });
}

function asset(rel, revision) {
  var t = current();
  if (!t || !own(t.files, rel) || (revision && revision !== t.revision)) return null;
  return util.toBuffer(t.files[rel], 'base64');
}

function fileUrl(rel, t) {
  return '/api/home/theme/file?path=' + encodeURIComponent(rel).replace(/'/g, '%27') + '&v=' + t.revision;
}

/*
 * The apps as Home shows them: the theme's names and icons in place of the
 * TV's, for the apps it names.
 */
function dressApps(apps) {
  var t = current();
  if (!t) return apps;
  var names = t.theme.names || {}, icons = t.theme.icons || {};
  return apps.map(function (a) {
    if (!own(names, a.id) && !own(icons, a.id)) return a;
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    if (own(names, a.id)) out.title = names[a.id];
    if (own(icons, a.id)) out.icon = fileUrl(icons[a.id], t);
    return out;
  });
}

// What the view draws from the theme: fonts, background and wallpaper.
function view() {
  var t = current();
  if (!t) return null;
  var th = t.theme, out = { name: th.name, revision: t.revision };
  if (th.colours) out.colours = th.colours;
  // The icons' style, and the colour accent and tinted icons take: the
  // theme's icon colour, else its text colour (Hearth's "follow theme"),
  // else its palette's accent.
  if (th.iconStyle) {
    out.iconStyle = th.iconStyle;
    out.iconInk = th.iconInk || (th.colours && (th.colours.text || th.colours.accent)) || null;
  }
  if (th.fonts) {
    out.fonts = th.fonts.files.map(function (f) {
      var ext = path.extname(f.file).slice(1).toLowerCase();
      return { id: f.id, url: fileUrl(f.file, t), format: ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext };
    });
    out.widgetFont = th.fonts.widget;
    out.namesFont = th.fonts.names;
  }
  if (th.wallpaper) {
    out.wallpaper = {
      urls: th.wallpaper.files.map(function (f) { return fileUrl(f, t); }),
      intervalSec: th.wallpaper.intervalSec || 60,
      shuffle: th.wallpaper.shuffle === true
    };
  }
  return out;
}

// For the dashboards: the theme in use and what it could not change.
function summary() {
  var t = current();
  if (!t) return null;
  var th = t.theme;
  return {
    name: th.name, author: th.author, source: t.source, ignored: th.ignored || [],
    parts: {
      colours: !!th.colours, fonts: !!(th.fonts && (th.fonts.widget || th.fonts.names)),
      wallpaper: th.wallpaper ? th.wallpaper.files.length : 0,
      icons: th.icons ? Object.keys(th.icons).length : 0,
      apps: th.order ? th.order.length : 0
    },
    // Offered as places for the weather, as Hearth puts them first in its city list.
    cities: th.cities || []
  };
}

function revision() { var t = current(); return t ? t.revision : ''; }

function init(opts) {
  opts = opts || {};
  if (opts.stateDir) stateDir = opts.stateDir;
  if (opts.themesDir) themesDir = opts.themesDir;
  cache = undefined;
}

module.exports = {
  init: init,
  parse: parse,
  store: store,
  clear: clear,
  current: current,
  listZips: listZips,
  readZip: readZip,
  asset: asset,
  validateSaved: validateSaved,
  STATE_FILE: STATE_FILE,
  MAX_SAVED: MAX_SAVED,
  dressApps: dressApps,
  view: view,
  summary: summary,
  revision: revision,
  PALETTES: PALETTES,
  MAX_ZIP: MAX_ZIP
};
