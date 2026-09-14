var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
var homeView = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
assert(homeView.indexOf('component-progress="{{constructionStages}}"') >= 0, 'homepage must pass all 13 progress records into the model');
assert(homeView.indexOf('project-name="{{modelProjectName}}"') >= 0, 'homepage must pass a non-null project name');
assert(homeView.indexOf('device-name="{{modelDeviceName}}"') >= 0, 'homepage must pass a non-null device name');
assert(homeView.indexOf('双指缩放') >= 0, 'homepage must explain the zoom gesture');

var definition;
var source = fs.readFileSync(path.join(root, 'components/construction-twin-3d/construction-twin-3d.js'), 'utf8');
assert(source.indexOf("quality === 'low' ? 1.2 : 1.55") >= 0, 'mobile canvas must use a sharper adaptive pixel ratio');
assert(source.indexOf('index <= Number(self.data.stageIndex || 1)') >= 0, 'homepage replay must include every component through the selected stage');
assert(source.indexOf('Number(this.data.stageIndex || 1), false') >= 0, 'assembly replay must hide components before their build step');
vm.runInNewContext(source, {
  Component: function (value) { definition = value; },
  require: function () { return function FakeEngine() {}; },
  Number: Number,
  Array: Array,
  Object: Object,
  Math: Math,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
});

var methods = definition.methods;
assert.strictEqual(methods.normalizeProgress([]), null, 'empty business data must not hide the whole ESP');
var progress = methods.normalizeProgress([{ index: 1, installedProgress: 65 }, { index: 3, installedProgress: 40 }]);
assert.strictEqual(progress['COMP-01'], 65);
assert.strictEqual(progress['COMP-03'], 40);
assert.strictEqual(progress['COMP-13'], 0);

var clearCount = 0;
var applyCount = 0;
var appliedDisplayStage = 0;
var instance = {
  data: { componentProgress: [], stageIndex: 1 },
  progressRecords: null,
  normalizeProgress: methods.normalizeProgress,
  engine: {
    scene: { clearProgress: function () { clearCount += 1; }, setDisplayStage: function (value) { appliedDisplayStage = value; } },
    applyProgress: function (records, displayStage) { applyCount += 1; appliedDisplayStage = displayStage; },
    select: function () {},
    isolation: 'before'
  }
};
methods.applyBusinessProgress.call(instance);
assert.strictEqual(clearCount, 1, 'empty data should restore the staged construction model');
assert.strictEqual(applyCount, 0, 'empty data should not apply thirteen zero-progress overrides');
assert.strictEqual(instance.engine.phase, 3.7);

instance.progressRecords = progress;
methods.applyBusinessProgress.call(instance);
assert.strictEqual(applyCount, 1, 'real business progress must be applied');
assert.strictEqual(appliedDisplayStage, 1, 'business progress must be clipped to the selected component');
assert.strictEqual(instance.engine.phase, 5.1);

var framed = {
  cssWidth: 390,
  cssHeight: 380,
  engine: { target: null, zoom: 1, intro: 0, fxTime: 500, lastInteraction: 0, matrices: function () { this.updated = true; } }
};
methods.applyEmbeddedFraming.call(framed);
assert.strictEqual(Array.prototype.join.call(framed.engine.target, ','), '0,12,0');
assert.strictEqual(framed.engine.zoom, 0.52);
assert.strictEqual(framed.engine.updated, true);

var Scene = require('../components/construction-twin-3d/diorama/diorama');
var Engine = require('../components/construction-twin-3d/diorama/engine');
var zoomEngine = { zoom: 0.52, interact: function () {} };
Engine.prototype.zoomBy.call(zoomEngine, -10);
assert.strictEqual(zoomEngine.zoom, 0.28, 'users must be able to zoom substantially closer than the homepage default');
var scene = new Scene('low');
var emptyBusinessProgress = {};
for (var index = 1; index <= 13; index += 1) emptyBusinessProgress['COMP-' + String(index).padStart(2, '0')] = 0;
scene.applyProgress(emptyBusinessProgress);
scene.visibleBatches(5.1, false, 0, null, {});
var ghosted = scene.currentObjects.filter(function (entry) {
  return entry.object.componentId && entry.object.progressGhost && entry.object.alpha >= 0.99;
}).length;
assert(ghosted > 500, 'uninstalled components must remain visible as a solid colour-coded preview');
var batches = scene.visibleBatches(5.1, false, 0, null, {});
Object.keys(batches).forEach(function (key) {
  assert(batches[key].every(function (item) { return item.opacity === undefined || item.opacity === 1; }), 'mobile render batches must not use dithered transparency');
});
var orbitBlockingBackdrops = scene.objects.filter(function (object) {
  return object.size[0] >= 500 && object.size[1] >= 50;
});
assert.strictEqual(orbitBlockingBackdrops.length, 0, 'no vertical backdrop may block a 360-degree camera orbit');
var clippedScene = new Scene('low');
clippedScene.applyProgress(emptyBusinessProgress, 3);
clippedScene.visibleBatches(5.1, false, 0, null, {});
assert(clippedScene.currentObjects.some(function (entry) { return entry.object.componentId === 'COMP-03'; }), 'selected component must remain visible');
assert(clippedScene.currentObjects.some(function (entry) { return entry.object.componentId === 'COMP-01'; }), 'earlier components must remain visible');
assert(!clippedScene.currentObjects.some(function (entry) { return entry.object.componentId && Number(entry.object.componentId.slice(-2)) > 3; }), 'later components must be hidden');
var replayScene = new Scene('low');
replayScene.applyProgress(emptyBusinessProgress, 4, false);
replayScene.visibleBatches(5.1, false, 0, null, {});
assert(!replayScene.currentObjects.some(function (entry) { return entry.object.componentId; }), 'replay must start without pre-showing unbuilt components');
var rendererSource = fs.readFileSync(path.join(root, 'components/construction-twin-3d/diorama/renderer.js'), 'utf8');
assert(rendererSource.indexOf('g.clearColor(.86,.91,.93,1)') >= 0, 'model viewport must use the approved mist blue-gray background');
assert(rendererSource.indexOf('for(let i=0;i<18;i++)') >= 0, 'round model details must use the refined segment count');
scene.phase = 5.1;
var cargoKinds = ['steel-frame', 'steel-beam'];
cargoKinds.forEach(function (kind) {
  var cargo = scene.objects.find(function (object) { return object.cargoKind === kind && object.animate; });
  assert(cargo, kind + ' crane cargo must be animated');
  assert.notDeepStrictEqual(cargo.animate(0), cargo.animate(7000), kind + ' crane cargo must move even at full business phase');
});
var animatedObjects = scene.objects.filter(function (object) { return object.animate || object.dynamic; });
assert(animatedObjects.length > 35, 'cranes, truck, forklift and access platform must all have animation transforms');

console.log(JSON.stringify({ success: true, progressBinding: true, emptyProgressFallback: true, embeddedZoom: framed.engine.zoom, minimumZoom: zoomEngine.zoom, ghostedObjects: ghosted, animatedObjects: animatedObjects.length }, null, 2));
