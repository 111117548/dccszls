'use strict'

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function vec3(x, y, z) {
  return [x || 0, y || 0, z || 0]
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function length(a) {
  return Math.sqrt(dot(a, a))
}

function normalize(a) {
  const len = length(a) || 1
  return [a[0] / len, a[1] / len, a[2] / len]
}

function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ])
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3]
    }
  }
  return out
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  const out = new Float32Array(16)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  return out
}

function mat4LookAt(eye, center, up) {
  const z = normalize(sub(eye, center))
  const x = normalize(cross(up, z))
  const y = cross(z, x)
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ])
}

function mat4TRS(position, rotation, size) {
  const rx = rotation[0] || 0
  const ry = rotation[1] || 0
  const rz = rotation[2] || 0
  const sx = Math.sin(rx), cx = Math.cos(rx)
  const sy = Math.sin(ry), cy = Math.cos(ry)
  const sz = Math.sin(rz), cz = Math.cos(rz)

  // Rz * Ry * Rx, column-major.
  const r00 = cz * cy
  const r01 = cz * sy * sx - sz * cx
  const r02 = cz * sy * cx + sz * sx
  const r10 = sz * cy
  const r11 = sz * sy * sx + cz * cx
  const r12 = sz * sy * cx - cz * sx
  const r20 = -sy
  const r21 = cy * sx
  const r22 = cy * cx

  return new Float32Array([
    r00 * size[0], r10 * size[0], r20 * size[0], 0,
    r01 * size[1], r11 * size[1], r21 * size[1], 0,
    r02 * size[2], r12 * size[2], r22 * size[2], 0,
    position[0], position[1], position[2], 1
  ])
}

function mat4FromBasis(xAxis, yAxis, zAxis, position) {
  return new Float32Array([
    xAxis[0], xAxis[1], xAxis[2], 0,
    yAxis[0], yAxis[1], yAxis[2], 0,
    zAxis[0], zAxis[1], zAxis[2], 0,
    position[0], position[1], position[2], 1
  ])
}

function mat4BeamBetween(a, b, thickness, depth) {
  const delta = sub(b, a)
  const len = length(delta)
  const yAxis = scale(normalize(delta), len)
  let helper = Math.abs(delta[1] / (len || 1)) > 0.92 ? [1, 0, 0] : [0, 1, 0]
  let xAxis = normalize(cross(helper, yAxis))
  let zAxis = normalize(cross(yAxis, xAxis))
  xAxis = scale(xAxis, thickness)
  zAxis = scale(zAxis, depth || thickness)
  return mat4FromBasis(xAxis, yAxis, zAxis, scale(add(a, b), 0.5))
}

function transformPoint(m, p) {
  const x = p[0], y = p[1], z = p[2]
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ]
}

function ortho(left,right,bottom,top,near,far) {
  return new Float32Array([2/(right-left),0,0,0,0,2/(top-bottom),0,0,0,0,-2/(far-near),0,-(right+left)/(right-left),-(top+bottom)/(top-bottom),-(far+near)/(far-near),1])
}

module.exports = {
  ortho,
  clamp,
  vec3,
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  normalize,
  mat4Identity,
  mat4Multiply,
  mat4Perspective,
  mat4LookAt,
  mat4TRS,
  mat4FromBasis,
  mat4BeamBetween,
  transformPoint
}
