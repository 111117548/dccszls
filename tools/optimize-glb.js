#!/usr/bin/env node
'use strict';

// Removes export-only metadata from the ESP model while preserving every
// renderable mesh, accessor, material, node relationship and binary buffer.
// The current mini-program renderer reads node name/matrix/mesh/children only;
// node.extras is therefore intentionally excluded from the runtime asset.

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var JSON_CHUNK = 0x4e4f534a;
var BIN_CHUNK = 0x004e4942;
var GLB_MAGIC = 0x46546c67;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Not a valid GLB file');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 is supported');
  var offset = 12;
  var doc = null;
  var bin = null;
  while (offset + 8 <= buffer.length) {
    var length = buffer.readUInt32LE(offset);
    var type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > buffer.length) throw new Error('GLB chunk exceeds file length');
    if (type === JSON_CHUNK) doc = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').replace(/\u0000+$/g, '').trim());
    if (type === BIN_CHUNK) bin = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
  }
  if (!doc || !bin) throw new Error('GLB must contain JSON and BIN chunks');
  return { doc: doc, bin: bin };
}

function padChunk(buffer, byte) {
  var padding = (4 - buffer.length % 4) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer;
}

function buildGlb(doc, bin) {
  var json = padChunk(Buffer.from(JSON.stringify(doc), 'utf8'), 0x20);
  var binary = padChunk(bin, 0x00);
  var total = 12 + 8 + json.length + 8 + binary.length;
  var output = Buffer.alloc(total);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(JSON_CHUNK, 16);
  json.copy(output, 20);
  var binHeader = 20 + json.length;
  output.writeUInt32LE(binary.length, binHeader);
  output.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  binary.copy(output, binHeader + 8);
  return output;
}

function countPrimitives(doc) {
  return (doc.meshes || []).reduce(function (sum, mesh) { return sum + (mesh.primitives || []).length; }, 0);
}

function structure(doc) {
  return {
    scenes: (doc.scenes || []).length,
    nodes: (doc.nodes || []).length,
    meshes: (doc.meshes || []).length,
    primitives: countPrimitives(doc),
    materials: (doc.materials || []).length,
    accessors: (doc.accessors || []).length,
    bufferViews: (doc.bufferViews || []).length
  };
}

function sameStructure(left, right) {
  return Object.keys(left).every(function (key) { return left[key] === right[key]; });
}

function optimize(doc, precision) {
  var removedExtras = 0;
  var roundedValues = 0;
  (doc.nodes || []).forEach(function (node) {
    if (Object.prototype.hasOwnProperty.call(node, 'extras')) {
      delete node.extras;
      removedExtras++;
    }
    if (Array.isArray(node.matrix)) {
      node.matrix = node.matrix.map(function (value) {
        var rounded = Number(Number(value).toFixed(precision));
        if (rounded !== value) roundedValues++;
        return rounded;
      });
    }
  });
  return { removedExtras: removedExtras, roundedValues: roundedValues };
}

var input = process.argv[2];
if (!input) {
  console.error('Usage: node tools/optimize-glb.js <model.glb> [precision]');
  process.exit(2);
}
var precision = Math.max(4, Math.min(10, Number(process.argv[3]) || 6));
var absolute = path.resolve(input);
var before = fs.readFileSync(absolute);
var parsed = parseGlb(before);
var beforeStructure = structure(parsed.doc);
var beforeBinHash = sha256(parsed.bin);
var changes = optimize(parsed.doc, precision);
var after = buildGlb(parsed.doc, parsed.bin);
var verified = parseGlb(after);
var afterStructure = structure(verified.doc);

if (!sameStructure(beforeStructure, afterStructure)) throw new Error('Model structure changed during optimization');
if (sha256(verified.bin) !== beforeBinHash) throw new Error('Binary geometry changed during optimization');
if (after.length >= before.length) throw new Error('Optimized model is not smaller than the source');

fs.writeFileSync(absolute, after);
console.log(JSON.stringify({
  file: absolute,
  precision: precision,
  beforeBytes: before.length,
  afterBytes: after.length,
  savedBytes: before.length - after.length,
  savedPercent: Number(((before.length - after.length) / before.length * 100).toFixed(1)),
  removedExtras: changes.removedExtras,
  roundedMatrixValues: changes.roundedValues,
  structure: afterStructure,
  binarySha256: beforeBinHash
}, null, 2));
