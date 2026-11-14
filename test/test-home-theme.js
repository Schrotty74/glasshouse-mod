/**
 * test/test-home-theme.js - Hearth themes on Glasshouse Home: a zip is
 * checked as Hearth checks it, kept, put on the apps and taken off again
 *
 * Strict ES5: runs on node 0.12.
 */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var theme = require('../server/lib/home-theme');
var backupState = require('../server/lib/backup-state');

console.log('Running test-home-theme.js ...');

// A zip of { name: text or Buffer }, deflated, as Hearth's export writes one.
function zip(files, statedSize) {
  var parts = [], dir = [], off = 0;
  Object.keys(files).forEach(function (name) {
    var data = Buffer.isBuffer(files[name]) ? files[name] : new Buffer(files[name]);
    var method = zlib.deflateRawSync ? 8 : 0;
    var packed = method ? zlib.deflateRawSync(data) : data, nb = new Buffer(name);
    var local = new Buffer(30);
    local.fill(0);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(statedSize || data.length, 22);
    local.writeUInt16LE(nb.length, 26);
    parts.push(local, nb, packed);
    var central = new Buffer(46);
    central.fill(0);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(statedSize || data.length, 24);
    central.writeUInt16LE(nb.length, 28);
    central.writeUInt32LE(off, 42);
    dir.push(central, nb);
    off += 30 + nb.length + packed.length;
  });
  var cd = Buffer.concat(dir), end = new Buffer(22), n = Object.keys(files).length;
  end.fill(0);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(n, 8);
  end.writeUInt16LE(n, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, end]));
}

var PNG = new Buffer('89504e470d0a1a0a', 'hex');
var FULL = {
  format: 1, name: 'Teal night', author: 'Someone',
  colors: { theme: 'teal', widget: 'amber', icon: 'warm' },
  fonts: { files: [{ id: 'my-font', label: 'My font', file: 'fonts/my.woff2' }], widget: 'my-font', names: 'inter' },
  iconStyle: { style: 'mono', tile: 'dark' },
  wallpaper: { folder: 'wallpaper', intervalSec: 30, shuffle: true },
  icons: [{ app: 'netflix', file: 'icons/netflix.png' }],
  apps: [{ id: 'youtube.leanback.v4', name: 'Videos' }, { id: 'netflix' }],
  cities: [{ name: 'Delhi', lat: 28.6, lon: 77.2, detail: 'India' }]
};
function fullZip(manifest) {
  return zip({
    'manifest.json': JSON.stringify(manifest || FULL), 'theme-guide.md': '# notes',
    'fonts/my.woff2': 'font', 'icons/netflix.png': PNG,
    'wallpaper/b.jpg': 'jpg', 'wallpaper/a.png': PNG, 'wallpaper/old/c.jpg': 'jpg'
  });
}

function step1(parsed) {
assert.ok(!parsed.errors, JSON.stringify(parsed.errors));
var th = parsed.theme;
assert.deepEqual(th.colours, { bg: '#08191b', accent: '#6fd3cc', text: '#ffb74d' });
assert.deepEqual(th.fonts, { files: [{ id: 'my-font', file: 'fonts/my.woff2' }], widget: 'my-font', names: null });
assert.deepEqual(th.wallpaper, { files: ['wallpaper/a.png', 'wallpaper/b.jpg'], intervalSec: 30, shuffle: true });
assert.deepEqual(th.order, ['youtube.leanback.v4', 'netflix']);
assert.deepEqual(th.names, { 'youtube.leanback.v4': 'Videos' });
assert.deepEqual(th.icons, { netflix: 'icons/netflix.png' });
assert.deepEqual(th.ignored, ['fonts.names (inter)', 'iconStyle.tile']);
assert.strictEqual(th.iconStyle, 'mono');
assert.strictEqual(th.iconInk, '#ffe9c7', 'the icon colour from Hearth\'s list');
assert.deepEqual(th.cities, [{ name: 'Delhi', lat: 28.6, lon: 77.2, detail: 'India' }]);
console.log('  ✓ a full theme: its palette, fonts, slideshow (pictures directly in the folder), apps and icons');
step2(parsed);
}

var REFUSED = [
  [{ 'theme/manifest.json': '{}' }, 'manifest.json is not at the top'],
  [{ 'manifest.json': '{', 'a.txt': '' }, 'not valid JSON'],
  [{ 'manifest.json': 'null' }, 'not an object'],
  [manifest({ format: 1, name: 'x', colors: { theme: 'constructor' } }), 'unknown theme'],
  [manifest({ format: 2, name: 'x' }), '"format" must be 1'],
  [manifest({ format: 1, name: 'x', colour: {} }), 'unknown key "colour"'],
  [manifest({ format: 1, name: 'x', colors: { widget: 'white', widgetInk: '#ffffff' } }), 'not both'],
  [manifest({ format: 1, name: 'x', icons: [{ app: 'netflix', file: 'icons/none.png' }] }), 'is not in the zip'],
  [{ 'manifest.json': JSON.stringify({ format: 1, name: 'x' }), 'run.sh': 'echo' }, 'run.sh: not allowed'],
  [{ 'manifest.json': JSON.stringify({ format: 1, name: 'x' }), '../evil.png': PNG }, 'not a plain relative path'],
  [{ 'manifest.json': JSON.stringify({ format: 1, name: 'x' }), 'page.html': '<script>' }, 'page.html: not allowed']
];
function manifest(m) { return { 'manifest.json': JSON.stringify(m) }; }
function refusedAll(i, done) {
  if (i >= REFUSED.length) return done();
  theme.parse(zip(REFUSED[i][0]), function (r) {
    var why = REFUSED[i][1];
    assert.ok(r.errors && r.errors.join('\n').indexOf(why) !== -1, why + ' in ' + JSON.stringify(r.errors));
    refusedAll(i + 1, done);
  });
}
function step2(parsed) {
  refusedAll(0, function () {
    theme.parse(new Buffer('not a zip at all, longer than a header'), function (r) {
      assert.deepEqual(r.errors, ['not a zip file']);
      var mac = zip({ 'manifest.json': JSON.stringify({ format: 1, name: 'x' }), '__MACOSX/._manifest.json': 'x', '.DS_Store': 'x' });
      theme.parse(mac, function (r2) {
        assert.ok(!r2.errors, 'what macOS adds to a zip is passed over');
        if (!zlib.deflateRawSync) return step3(parsed);
        var big = new Buffer(20 * 1024 * 1024);
        big.fill(0);
        theme.parse(zip({ 'manifest.json': JSON.stringify({ format: 1, name: 'x' }), 'bomb.png': big }, 10), function (r3) {
          assert.ok(r3.errors && r3.errors.join('\n').indexOf('unpacks to more than it states') !== -1, JSON.stringify(r3.errors));
          console.log('  ✓ refused as Hearth refuses: unknown keys, missing files, scripts and pages, paths out of the zip');
          console.log('  ✓ an entry unpacking to more than its stated size is stopped (a zip bomb)');
          step3(parsed);
        });
      });
    });
  });
}

function step3(parsed) {
  var dir = path.join(os.tmpdir(), 'gh-theme-' + process.pid);
fs.mkdirSync(dir);
var themesDir = path.join(dir, 'themes');
fs.mkdirSync(themesDir);
fs.writeFileSync(path.join(themesDir, 'teal.zip'), fullZip());
fs.writeFileSync(path.join(themesDir, 'notes.txt'), 'x');
theme.init({ stateDir: dir, themesDir: themesDir });
assert.strictEqual(theme.current(), null);
theme.store(parsed, 'teal.zip');
assert.strictEqual(theme.asset('fonts/my.woff2').toString('utf8'), 'font');
assert.strictEqual(theme.asset('theme-guide.md'), null, 'notes are not kept');
assert.strictEqual(theme.asset('../theme.json'), null);
assert.strictEqual(theme.asset('wallpaper/old/c.jpg'), null, 'a picture the theme does not use is not served');
assert.strictEqual(theme.asset('icons/netflix.png', 'stale-revision'), null);
var apps = theme.dressApps([{ id: 'netflix', title: 'Netflix', icon: '/api/home/icon?id=netflix' }, { id: 'youtube.leanback.v4', title: 'YouTube', icon: null }, { id: 'other', title: 'Other' }]);
assert.ok(/^\/api\/home\/theme\/file\?path=icons%2Fnetflix\.png&v=/.test(apps[0].icon));
assert.strictEqual(apps[1].title, 'Videos');
assert.deepEqual(apps[2], { id: 'other', title: 'Other' });
var v = theme.view();
assert.strictEqual(v.colours.bg, '#08191b');
  assert.deepEqual([v.iconStyle, v.iconInk], ['mono', '#ffe9c7']);
assert.deepEqual(v.fonts.map(function (f) { return f.format; }), ['woff2']);
assert.strictEqual(v.wallpaper.urls.length, 2);
assert.strictEqual(theme.summary().source, 'teal.zip');
console.log('  ✓ kept with only the files it uses, its names and icons on the apps it names');

theme.init({ stateDir: dir, themesDir: themesDir });
assert.strictEqual(theme.current().theme.name, 'Teal night', 'read back after a restart');
theme.listZips(function (zips) {
  assert.deepEqual(zips.map(function (z) { return z.name; }), ['teal.zip']);
  theme.readZip('../teal.zip', function (err) {
    assert.ok(err, 'only a plain name in the themes folder');
    backupState.init(dir);
    var active = backupState.create();
    theme.clear();
    assert.strictEqual(theme.current(), null);
    var inactive = backupState.create();
    backupState.restore(backupState.prepare(active));
    assert.strictEqual(theme.current().theme.name, 'Teal night');
    assert.strictEqual(theme.asset('icons/netflix.png').toString('hex'), PNG.toString('hex'));
    backupState.restore(backupState.prepare({ version: 1, files: [] }));
    assert.strictEqual(theme.current().theme.name, 'Teal night', 'older backups leave the active theme alone');
    backupState.restore(backupState.prepare(inactive));
    assert.strictEqual(theme.current(), null, 'a backup without an active theme removes the overlay');
    fs.unlinkSync(path.join(dir, theme.STATE_FILE));
    assert.strictEqual(theme.dressApps([{ id: 'netflix', title: 'Netflix' }])[0].title, 'Netflix');
    console.log('  ✓ the zips in Hearth\'s folder are offered by name, and backup restore keeps the theme assets and inactive state');
    fs.unlinkSync(path.join(themesDir, 'teal.zip'));
    fs.unlinkSync(path.join(themesDir, 'notes.txt'));
    fs.rmdirSync(themesDir);
    fs.rmdirSync(dir);
    httpRoundTrip();
  });
});
}

function httpRoundTrip() {
  var http = require('http');
  var home = require('../server/lib/home');
  var routes = require('../server/lib/routes');
  var dir = path.join(os.tmpdir(), 'gh-theme-http-' + process.pid);
  fs.mkdirSync(dir);
  home.init({ stateDir: dir, webosVersion: '9.2.2', port: 8080, themesDir: path.join(dir, 'themes') });
  routes.init({ config: { allowControl: true }, home: home });
  var layout = JSON.parse(JSON.stringify(home.layout()));
  var server = http.createServer(routes.handleRequest);

  function request(method, url, type, data, done) {
    var headers = { 'Content-Length': data ? data.length : 0 };
    if (type) headers['Content-Type'] = type;
    var req = http.request({ hostname: '127.0.0.1', port: server.address().port,
      method: method, path: url, headers: headers }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () { done(res, Buffer.concat(chunks)); });
    });
    req.on('error', function (err) { throw err; });
    req.end(data || undefined);
  }
  function removeTree(folder) {
    fs.readdirSync(folder).forEach(function (name) {
      var file = path.join(folder, name);
      if (fs.lstatSync(file).isDirectory()) removeTree(file);
      else fs.unlinkSync(file);
    });
    fs.rmdirSync(folder);
  }

  server.listen(0, '127.0.0.1', function () {
    request('POST', '/api/home/theme/upload?name=teal.zip', 'application/zip', fullZip(), function (res, body) {
      assert.strictEqual(res.statusCode, 200, body.toString());
      assert.strictEqual(JSON.parse(body.toString()).theme.name, 'Teal night');
      assert.deepEqual(home.layout(), layout);
      var imageUrl = theme.view().wallpaper.urls[0];
      request('GET', imageUrl, null, null, function (imageRes, image) {
        assert.strictEqual(imageRes.headers['content-type'], 'image/png');
        assert.strictEqual(image.toString('hex'), PNG.toString('hex'));
        request('POST', '/api/home/theme/remove', 'application/json', new Buffer('{}'), function (removeRes) {
          assert.strictEqual(removeRes.statusCode, 200);
          assert.deepEqual(home.layout(), layout);
          assert.strictEqual(theme.view(), null);
          request('GET', imageUrl, null, null, function (staleRes) {
            assert.strictEqual(staleRes.statusCode, 404);
            server.close(function () {
              removeTree(dir);
              console.log('  ✓ HTTP import, asset and removal preserve the saved Home layout');
              console.log('ALL test-home-theme.js assertions passed!');
            });
          });
        });
      });
    });
  });
}

theme.parse(fullZip(), step1);
