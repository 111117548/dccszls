var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var modelPath = path.join(__dirname, '..', 'assets', 'models', 'esp-two-chamber-assembled.glb');
var buffer = fs.readFileSync(modelPath);
var offset = 12;
var doc = null;
var bin = null;

assert.strictEqual(buffer.readUInt32LE(0), 0x46546c67, 'model must be a GLB file');
assert.strictEqual(buffer.readUInt32LE(4), 2, 'model must use glTF 2.0');
assert.strictEqual(buffer.readUInt32LE(8), buffer.length, 'GLB header length must match file length');

while (offset + 8 <= buffer.length) {
  var length = buffer.readUInt32LE(offset);
  var type = buffer.readUInt32LE(offset + 4);
  offset += 8;
  if (type === 0x4e4f534a) doc = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').trim());
  if (type === 0x004e4942) bin = buffer.subarray(offset, offset + length);
  offset += length;
}

assert(doc, 'model JSON chunk is required');
assert(bin, 'model binary chunk is required');
assert(buffer.length < 700 * 1024, 'runtime model should remain below 700 KB');
assert.strictEqual((doc.nodes || []).length, 6620, 'node count changed unexpectedly');
assert.strictEqual((doc.meshes || []).length, 55, 'mesh count changed unexpectedly');
assert.strictEqual((doc.materials || []).length, 40, 'material count changed unexpectedly');
assert.strictEqual((doc.accessors || []).length, 110, 'accessor count changed unexpectedly');
assert.strictEqual((doc.nodes || []).filter(function (node) { return node.extras; }).length, 0, 'runtime model contains export-only extras');
assert.strictEqual(
  crypto.createHash('sha256').update(bin).digest('hex'),
  '4b8972ae60e8811b8e9abf01fee485696ca9c49e8fd5b5f223fce0836ed5f612',
  'geometry binary changed unexpectedly'
);

var names = (doc.nodes || []).map(function (node) { return node.name || ''; });
['STAGE_01_SUPPORT', 'STAGE_02_FOUNDATION_BEAM', 'STAGE_03_STEEL', 'STAGE_04_HOPPER', 'STAGE_05_CASING', 'STAGE_06_HORN', 'STAGE_10_HV', 'STAGE_11_CANOPY', 'STAGE_12_INSULATION'].forEach(function (name) {
  assert(names.indexOf(name) >= 0, 'missing stage anchor: ' + name);
});

console.log(JSON.stringify({
  success: true,
  modelKB: Number((buffer.length / 1024).toFixed(1)),
  nodes: doc.nodes.length,
  meshes: doc.meshes.length,
  materials: doc.materials.length,
  binaryKB: Number((bin.length / 1024).toFixed(1))
}, null, 2));
