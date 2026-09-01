var CHAMBERS = ['A1', 'A2', 'B1', 'B2'];
var STAGE_NAMES = [
  '支座安装', '基础梁安装', '钢支架安装', '灰斗安装', '壳体安装',
  '进出口安装', '阳极系统安装', '阴阳极系统安装', '振打系统安装',
  '高压设备安装', '平台扶梯安装', '电气仪表安装', '调试验收'
];
var MODEL_PATHS = [
  'assets/models/esp-two-chamber-assembled.glb',
  '/assets/models/esp-two-chamber-assembled.glb'
];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function multiply(a, b) {
  var out = new Array(16);
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function perspective(fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, center, up) {
  var x0, x1, x2, y0, y1, y2;
  var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  var len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len; z1 /= len; z2 /= len;
  x0 = up[1] * z2 - up[2] * z1; x1 = up[2] * z0 - up[0] * z2; x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2) || 1; x0 /= len; x1 /= len; x2 /= len;
  y0 = z1 * x2 - z2 * x1; y1 = z2 * x0 - z0 * x2; y2 = z0 * x1 - z1 * x0;
  return [x0, y0, z0, 0, x1, y1, z1, 0, x2, y2, z2, 0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]), 1];
}
function nodeMatrix(node) {
  if (node.matrix && node.matrix.length === 16) return node.matrix.slice();
  var t = node.translation || [0, 0, 0], q = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1];
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x, y2 = y + y, z2 = z + z;
  var xx = x * x2, xy = x * y2, xz = x * z2;
  var yy = y * y2, yz = y * z2, zz = z * z2;
  var wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}
function transformPosition(m, x, y, z, out, offset) {
  out[offset] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[offset + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[offset + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}
function transformNormal(m, x, y, z, out, offset) {
  var c00 = m[5] * m[10] - m[9] * m[6];
  var c01 = m[9] * m[2] - m[1] * m[10];
  var c02 = m[1] * m[6] - m[5] * m[2];
  var c10 = m[8] * m[6] - m[4] * m[10];
  var c11 = m[0] * m[10] - m[8] * m[2];
  var c12 = m[4] * m[2] - m[0] * m[6];
  var c20 = m[4] * m[9] - m[8] * m[5];
  var c21 = m[8] * m[1] - m[0] * m[9];
  var c22 = m[0] * m[5] - m[4] * m[1];
  var nx = c00 * x + c01 * y + c02 * z;
  var ny = c10 * x + c11 * y + c12 * z;
  var nz = c20 * x + c21 * y + c22 * z;
  var len = Math.hypot(nx, ny, nz) || 1;
  out[offset] = nx / len; out[offset + 1] = ny / len; out[offset + 2] = nz / len;
}
function decodeUtf8(bytes) {
  var out = '', i = 0, code;
  while (i < bytes.length) {
    code = bytes[i++];
    if (code < 128) out += String.fromCharCode(code);
    else if (code < 224) out += String.fromCharCode(((code & 31) << 6) | (bytes[i++] & 63));
    else if (code < 240) out += String.fromCharCode(((code & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    else {
      code = ((code & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      code -= 65536; out += String.fromCharCode(55296 + (code >> 10), 56320 + (code & 1023));
    }
  }
  return out.replace(/\u0000+$/g, '').trim();
}
function parseGlb(arrayBuffer) {
  var view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('文件不是有效的 GLB 模型');
  if (view.getUint32(4, true) !== 2) throw new Error('仅支持 glTF 2.0 模型');
  var offset = 12, json = null, bin = null;
  while (offset + 8 <= arrayBuffer.byteLength) {
    var length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
    if (type === 0x4e4f534a) json = JSON.parse(decodeUtf8(new Uint8Array(arrayBuffer, offset, length)));
    if (type === 0x004e4942) bin = arrayBuffer.slice(offset, offset + length);
    offset += length;
  }
  if (!json || !bin) throw new Error('GLB 模型缺少场景或几何数据');
  return { doc: json, bin: bin };
}
function stageForNode(name, inherited) {
  name = String(name || '');
  if (name.indexOf('STAGE_01_') === 0) return 1;
  if (name.indexOf('STAGE_02_') === 0) return 2;
  if (name.indexOf('STAGE_03_') === 0) return 3;
  if (name.indexOf('STAGE_04_') === 0) return 4;
  if (name.indexOf('STAGE_05_') === 0) return 5;
  if (name.indexOf('STAGE_06_') === 0) return 6;
  if (name.indexOf('STAGE_10_') === 0) return 10;
  if (name.indexOf('STAGE_11_') === 0) return 11;
  if (name.indexOf('STAGE_12_') === 0) return 12;
  if (name.indexOf('::01-钢支架') >= 0) return 3;
  if (name.indexOf('06-柱脚锚栓接口') >= 0) return 1;
  if (name.indexOf('02-纵向梁') >= 0 || name.indexOf('03-横向梁') >= 0) return 2;
  if (name.indexOf('::02-灰斗') >= 0) return 4;
  if (name.indexOf('::04-壳体') >= 0) return 5;
  if (name.indexOf('::08-进出口喇叭') >= 0) return 6;
  if (name.indexOf('::11-高压进线') >= 0) return 10;
  if (name.indexOf('::12-顶部起吊') >= 0) return 11;
  if (name.indexOf('::13-保温箱') >= 0) return 12;
  if (name.indexOf('Hopper_Underside_Steel_Platform') >= 0 || name.indexOf('Central_And_End_Service_Access') >= 0) return 11;
  return inherited;
}
function materialColor(doc, materialIndex) {
  var material = (doc.materials || [])[materialIndex] || {};
  var pbr = material.pbrMetallicRoughness || {};
  var c = pbr.baseColorFactor || [0.62, 0.68, 0.72, 1];
  return [clamp(c[0] * 1.15, 0, 1), clamp(c[1] * 1.15, 0, 1), clamp(c[2] * 1.15, 0, 1), c[3] == null ? 1 : c[3]];
}

Component({
  properties: {
    projectName: { type: String, value: '' },
    deviceName: { type: String, value: '' },
    stageIndex: { type: Number, value: 1, observer: 'onStageChanged' },
    stageName: { type: String, value: '' },
    markers: { type: Array, value: [] },
    compact: { type: Boolean, value: false },
    minimal: { type: Boolean, value: false },
    light: { type: Boolean, value: false, observer: 'onLightChanged' }
  },
  data: {
    ready: false,
    loading: true,
    fallback: false,
    modelError: '',
    selectedPart: '',
    stageLabel: '支座安装',
    modelCaption: '双室电除尘器 · 工程轻量模型'
  },
  lifetimes: {
    ready: function () { this.initCanvas(); },
    detached: function () { this.dispose(); }
  },
  methods: {
    onStageChanged: function (value) {
      var stage = clamp(Number(value) || 1, 1, 13);
      this.setData({ stageLabel: STAGE_NAMES[stage - 1] });
      if (this.modelDoc && this.gl) this.rebuildStage(stage);
    },
    onLightChanged: function () {
      if (this.gl) this.render();
    },
    initCanvas: function () {
      var self = this;
      this.createSelectorQuery().select('#constructionTwinCanvas').fields({ node: true, size: true }).exec(function (res) {
        if (!res[0] || !res[0].node) { self.failModel('当前基础库无法初始化 WebGL'); return; }
        var canvas = res[0].node;
        var gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: false });
        if (!gl) { self.failModel('当前设备不支持 WebGL'); return; }
        var dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 1) || 1;
        canvas.width = Math.max(1, Math.round(res[0].width * dpr));
        canvas.height = Math.max(1, Math.round(res[0].height * dpr));
        self.canvas = canvas; self.gl = gl; self.cssWidth = res[0].width; self.cssHeight = res[0].height;
        self.yaw = -0.68; self.pitch = 0.32; self.zoomFactor = 1;
        try { self.initProgram(); self.loadModel(0); }
        catch (err) { self.failModel(err.message || '模型渲染初始化失败'); }
      });
    },
    shader: function (type, source) {
      var gl = this.gl, shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    },
    initProgram: function () {
      var gl = this.gl;
      var vs = 'attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aColor;uniform mat4 uMvp;varying vec4 vColor;void main(){vec3 n=normalize(aNormal);vec3 l=normalize(vec3(.45,.82,.62));float diffuse=max(dot(n,l),0.0);float light=.42+diffuse*.72;vec3 color=min(aColor.rgb*light+vec3(.015,.035,.055),vec3(1.0));vColor=vec4(color,aColor.a);gl_Position=uMvp*vec4(aPosition,1.0);}';
      var fs = 'precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}';
      var program = gl.createProgram();
      gl.attachShader(program, this.shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(program, this.shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      this.program = program;
      this.loc = {
        p: gl.getAttribLocation(program, 'aPosition'),
        n: gl.getAttribLocation(program, 'aNormal'),
        c: gl.getAttribLocation(program, 'aColor'),
        m: gl.getUniformLocation(program, 'uMvp')
      };
    },
    loadModel: function (pathIndex) {
      var self = this, fs = wx.getFileSystemManager();
      if (pathIndex >= MODEL_PATHS.length) { self.failModel('未能读取首页 GLB 模型文件'); return; }
      fs.readFile({
        filePath: MODEL_PATHS[pathIndex],
        success: function (res) {
          try {
            var parsed = parseGlb(res.data);
            self.modelDoc = parsed.doc; self.modelBin = parsed.bin;
            self.rebuildStage(clamp(Number(self.data.stageIndex) || 1, 1, 13));
          } catch (err) { self.failModel(err.message || 'GLB 模型解析失败'); }
        },
        fail: function () { self.loadModel(pathIndex + 1); }
      });
    },
    collectInstances: function (stage) {
      var doc = this.modelDoc, list = [], self = this;
      var scene = (doc.scenes || [])[doc.scene || 0] || { nodes: [] };
      function walk(index, parent, inheritedStage) {
        var node = doc.nodes[index] || {};
        var requiredStage = stageForNode(node.name, inheritedStage);
        var world = multiply(parent, nodeMatrix(node));
        if (node.mesh != null && stage >= requiredStage) list.push({ mesh: node.mesh, matrix: world });
        (node.children || []).forEach(function (child) { walk(child, world, requiredStage); });
      }
      (scene.nodes || []).forEach(function (index) { walk(index, identity(), 1); });
      return list;
    },
    accessorReader: function (accessorIndex) {
      var doc = this.modelDoc, accessor = doc.accessors[accessorIndex], view = doc.bufferViews[accessor.bufferView];
      if (!accessor || !view || accessor.type !== 'VEC3' || accessor.componentType !== 5126) throw new Error('模型包含暂不支持的顶点格式');
      var start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
      var stride = view.byteStride || 12;
      return { accessor: accessor, view: new DataView(this.modelBin), start: start, stride: stride };
    },
    rebuildStage: function (stage) {
      if (!this.modelDoc || !this.gl) return;
      if (this.rebuilding) { this.pendingStage = stage; return; }
      this.rebuilding = true;
      this.pendingStage = null;
      this.setData({ loading: true, modelError: '' });
      try {
        var doc = this.modelDoc, instances = this.collectInstances(stage), total = 0, i, j;
        for (i = 0; i < instances.length; i++) {
          var mesh = doc.meshes[instances[i].mesh];
          for (j = 0; j < mesh.primitives.length; j++) total += doc.accessors[mesh.primitives[j].attributes.POSITION].count;
        }
        if (!total) throw new Error('当前阶段没有可显示的模型构件');
        var positions = new Float32Array(total * 3), normals = new Float32Array(total * 3), colors = new Float32Array(total * 4);
        var vertexOffset = 0, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (i = 0; i < instances.length; i++) {
          mesh = doc.meshes[instances[i].mesh];
          for (j = 0; j < mesh.primitives.length; j++) {
            var primitive = mesh.primitives[j], pr = this.accessorReader(primitive.attributes.POSITION);
            var nr = primitive.attributes.NORMAL == null ? null : this.accessorReader(primitive.attributes.NORMAL);
            var color = materialColor(doc, primitive.material), count = pr.accessor.count;
            for (var v = 0; v < count; v++) {
              var po = pr.start + v * pr.stride;
              var px = pr.view.getFloat32(po, true), py = pr.view.getFloat32(po + 4, true), pz = pr.view.getFloat32(po + 8, true);
              var pIndex = (vertexOffset + v) * 3;
              transformPosition(instances[i].matrix, px, py, pz, positions, pIndex);
              min[0] = Math.min(min[0], positions[pIndex]); min[1] = Math.min(min[1], positions[pIndex + 1]); min[2] = Math.min(min[2], positions[pIndex + 2]);
              max[0] = Math.max(max[0], positions[pIndex]); max[1] = Math.max(max[1], positions[pIndex + 1]); max[2] = Math.max(max[2], positions[pIndex + 2]);
              if (nr) {
                var no = nr.start + v * nr.stride;
                transformNormal(instances[i].matrix, nr.view.getFloat32(no, true), nr.view.getFloat32(no + 4, true), nr.view.getFloat32(no + 8, true), normals, pIndex);
              } else { normals[pIndex + 1] = 1; }
              var cIndex = (vertexOffset + v) * 4;
              colors[cIndex] = color[0]; colors[cIndex + 1] = color[1]; colors[cIndex + 2] = color[2]; colors[cIndex + 3] = color[3];
            }
            vertexOffset += count;
          }
        }
        this.sceneCenter = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
        var dx = max[0] - min[0], dy = max[1] - min[1], dz = max[2] - min[2];
        this.sceneRadius = Math.max(8, Math.hypot(dx, dy, dz) / 2);
        this.uploadMesh(positions, normals, colors, total);
        this.currentBuiltStage = stage;
        this.setData({ ready: true, loading: false, fallback: false, stageLabel: STAGE_NAMES[stage - 1] });
        this.render();
      } catch (err) { this.failModel(err.message || '模型阶段构建失败'); }
      this.rebuilding = false;
      if (this.pendingStage && this.pendingStage !== this.currentBuiltStage) {
        var nextStage = this.pendingStage; this.pendingStage = null; this.rebuildStage(nextStage);
      }
    },
    uploadMesh: function (positions, normals, colors, count) {
      var gl = this.gl;
      if (this.buffers) {
        gl.deleteBuffer(this.buffers.p); gl.deleteBuffer(this.buffers.n); gl.deleteBuffer(this.buffers.c);
      }
      function buffer(data) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
      this.buffers = { p: buffer(positions), n: buffer(normals), c: buffer(colors) };
      this.vertexCount = count;
    },
    render: function () {
      var gl = this.gl;
      if (!gl || !this.vertexCount || !this.sceneCenter) return;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this.data.light) gl.clearColor(0.968, 0.978, 0.989, 1);
      else gl.clearColor(0.004, 0.027, 0.047, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(this.program);
      var center = this.sceneCenter, aspect = this.canvas.width / this.canvas.height;
      var baseRadius = this.sceneRadius * (aspect < 0.9 ? 2.85 : 2.45), radius = baseRadius * this.zoomFactor;
      var cp = Math.cos(this.pitch);
      var eye = [center[0] + radius * Math.sin(this.yaw) * cp, center[1] + radius * Math.sin(this.pitch), center[2] + radius * Math.cos(this.yaw) * cp];
      var mvp = multiply(perspective(Math.PI / 5.2, aspect, 0.1, Math.max(1000, radius * 8)), lookAt(eye, center, [0, 1, 0]));
      gl.uniformMatrix4fv(this.loc.m, false, new Float32Array(mvp));
      var self = this;
      [['p', this.loc.p, 3], ['n', this.loc.n, 3], ['c', this.loc.c, 4]].forEach(function (item) {
        gl.bindBuffer(gl.ARRAY_BUFFER, self.buffers[item[0]]); gl.enableVertexAttribArray(item[1]); gl.vertexAttribPointer(item[1], item[2], gl.FLOAT, false, 0, 0);
      });
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    },
    touchPoint: function (touch) { return { x: touch.x == null ? touch.clientX : touch.x, y: touch.y == null ? touch.clientY : touch.y }; },
    touchStart: function (e) {
      var touches = e.touches || []; if (!touches.length) return;
      var p = this.touchPoint(touches[0]); this.touch = { x: p.x, y: p.y, moved: false, startX: p.x };
      if (touches.length > 1) { var p2 = this.touchPoint(touches[1]); this.touch.distance = Math.hypot(p2.x - p.x, p2.y - p.y); }
    },
    touchMove: function (e) {
      var touches = e.touches || []; if (!this.touch || !touches.length) return;
      var p = this.touchPoint(touches[0]);
      if (touches.length > 1) {
        var p2 = this.touchPoint(touches[1]), distance = Math.hypot(p2.x - p.x, p2.y - p.y);
        if (this.touch.distance) this.zoomFactor = clamp(this.zoomFactor - (distance - this.touch.distance) * 0.004, 0.62, 1.75);
        this.touch.distance = distance; this.touch.moved = true;
      } else {
        var dx = p.x - this.touch.x, dy = p.y - this.touch.y;
        this.yaw -= dx * 0.012; this.pitch = clamp(this.pitch + dy * 0.008, -0.08, 1.05);
        this.touch.x = p.x; this.touch.y = p.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.touch.moved = true;
      }
      this.render();
    },
    touchEnd: function () {
      if (this.touch && !this.touch.moved) {
        var ratio = clamp(this.touch.startX / (this.cssWidth || 1), 0, 0.999);
        var chamber = CHAMBERS[Math.floor(ratio * 4)];
        this.setData({ selectedPart: chamber + '室' });
        this.triggerEvent('parttap', { id: chamber.toLowerCase(), name: chamber + '室' });
      }
      this.touch = null;
    },
    markerTap: function (e) {
      var marker = (this.data.markers || [])[Number(e.currentTarget.dataset.index)];
      if (marker) this.triggerEvent('markertap', { id: marker.id, defect: marker });
    },
    resetView: function () { this.yaw = -0.68; this.pitch = 0.32; this.zoomFactor = 1; this.setData({ selectedPart: '' }); this.render(); },
    failModel: function (message) {
      console.error('[construction-twin-3d]', message);
      this.setData({ loading: false, fallback: true, ready: false, modelError: message });
    },
    retryModel: function () {
      this.setData({ fallback: false, loading: true, modelError: '' });
      if (this.modelDoc) this.rebuildStage(clamp(Number(this.data.stageIndex) || 1, 1, 13));
      else this.loadModel(0);
    },
    dispose: function () {
      if (this.gl && this.buffers) {
        this.gl.deleteBuffer(this.buffers.p); this.gl.deleteBuffer(this.buffers.n); this.gl.deleteBuffer(this.buffers.c);
      }
      this.buffers = null; this.modelDoc = null; this.modelBin = null; this.gl = null; this.canvas = null;
    }
  }
});
