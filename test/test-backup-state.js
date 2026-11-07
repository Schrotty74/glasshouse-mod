var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var state = require('../server/lib/backup-state');
var util = require('../server/lib/util');
var dir = path.join(os.tmpdir(), 'glasshouse-backup-state-' + process.pid + '-' + Date.now());
util.mkdirp(dir);
state.init(dir);
function put(name, value) { util.mkdirp(path.dirname(path.join(dir, name))); fs.writeFileSync(path.join(dir, name), value); }
var place = JSON.stringify({ name: 'Test', label: 'Test', lat: 48, lon: 16 });
put('local-weather-place.json', place);
put('home-wallpaper.json', '{"choice":"own"}');
var jpeg = fs.readFileSync(path.join(__dirname, 'fixtures/home-wallpaper.jpg'));
put('home-wallpaper-uploads/morning.jpg', jpeg);
put('iptv/config.json', '{"playlists":[{"id":"p123456","kind":"m3u","url":"https://example.com/test.m3u"}]}');
put('iptv/selection.json', '{"version":2,"generation":1,"sections":[],"favourites":[]}');
put('disabled_services.json', '[\"test-service\"]');
put('hidden_apps', 'com.example.test\n');
put('tile_hiding_enabled', '0\n');
var snapshot = state.create();
assert.strictEqual(snapshot.files.length, 9);
put('local-weather-place.json', 'null');
state.restore(state.prepare(JSON.parse(JSON.stringify(snapshot))));
assert.strictEqual(fs.readFileSync(path.join(dir, 'local-weather-place.json'), 'utf8'), place);
assert.deepEqual(fs.readFileSync(path.join(dir, 'home-wallpaper-uploads/morning.jpg')), jpeg);
var broken = JSON.parse(JSON.stringify(snapshot));
broken.files[0].data = 'e30=';
assert.throws(function () { state.prepare(broken); }, /checksum/);
broken = JSON.parse(JSON.stringify(snapshot));
broken.files[0].name = '../config.json';
assert.throws(function () { state.prepare(broken); }, /Invalid/);
assert.throws(function () { state.prepare({ version: 1, files: [snapshot.files[0], snapshot.files[0]] }); }, /Invalid/);
var before = fs.readFileSync(path.join(dir, 'local-weather-place.json'));
var rename = fs.renameSync, calls = 0;
fs.renameSync = function (a, b) { if (++calls === 2) throw new Error('simulated failure'); return rename(a, b); };
try { assert.throws(function () { state.restore(state.prepare(snapshot)); }, /simulated failure/); }
finally { fs.renameSync = rename; }
assert.deepEqual(fs.readFileSync(path.join(dir, 'local-weather-place.json')), before);
var backup = require('../server/lib/backup');
var collectCalls = 0, written = null;
var config = { allowControl: true, port: 8080, host: '127.0.0.1', token: 'synthetic-token',
  mqtt: { password: 'synthetic-password', enabled: false }, customPreference: { value: 7 }, update: { client: '' } };
var lg = { collect: function (sections, cb) { collectCalls++; cb({ rows: [] }); }, set: function () {} };
backup.init({ lgSettings: lg, config: config, stateDir: dir, pendingFile: path.join(dir, 'pending.json'),
  readSettings: function () { return config; }, writeSettings: function (patch, cb) { written = patch; cb(null); } });
var document;
backup.create(function (b) { document = b; });
assert.equal(document.configuration.mqtt.password, 'synthetic-password');
assert.equal(document.configuration.customPreference.value, 7);
config.customPreference.value = 8;
put('local-weather-place.json', 'null');
backup.restore(document, function (r) {
  assert.equal(r.ok, true);
  assert.equal(r.restart, true);
  assert.equal(written.customPreference.value, 7);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'local-weather-place.json'), 'utf8')).name, 'Test');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'iptv/p123456/current.json'), 'utf8')), {});
});
var n = collectCalls;
var invalid = JSON.parse(JSON.stringify(document));
invalid.state.files[0].sha256 = 'bad';
backup.restore(invalid, function (r) { assert.equal(r.ok, false); });
assert.equal(collectCalls, n, 'invalid snapshot rejected before any LG changes');
invalid = JSON.parse(JSON.stringify(document));
invalid.configuration.update.client = '/tmp/unknown-executable';
backup.restore(invalid, function (r) { assert.equal(r.ok, false); });
assert.equal(collectCalls, n, 'new executable rejected before changes');
assert.throws(function () { state.checkConfiguration(JSON.parse('{"__proto__":{"polluted":true}}')); }, /Unsafe/);
// Exercise the actual HTTP route with an image larger than the former 64 KB limit.
var routes = require('../server/lib/routes'), http = require('http');
put('home-wallpaper-uploads/afternoon.jpg', Buffer.concat([jpeg.slice(0, -2), util.allocBuffer(100000), jpeg.slice(-2)]));
backup.create(function (b) { document = b; });
routes.init({ config: { allowControl: true }, backup: backup, restartSelf: function () { return true; } });
var server = http.createServer(routes.handleRequest);
function removeTree(file) {
  if (fs.statSync(file).isDirectory()) { fs.readdirSync(file).forEach(function (name) { removeTree(path.join(file, name)); }); fs.rmdirSync(file); }
  else fs.unlinkSync(file);
}
server.listen(0, '127.0.0.1', function () {
  var body = JSON.stringify(document);
  assert.ok(body.length > 65536);
  var req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/backup', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function (res) {
    var data = '';
    res.on('data', function (chunk) { data += chunk; });
    res.on('end', function () { assert.equal(res.statusCode, 200, data); assert.equal(JSON.parse(data).ok, true);
      server.close(function () { removeTree(dir); console.log('HTTP backup/restore above 64 KB passed'); }); });
  });
  req.on('error', function (err) { throw err; });
  req.end(body);
});
console.log('test-backup-state.js passed (round trip, images, IPTV, corruption, paths, rollback)');
