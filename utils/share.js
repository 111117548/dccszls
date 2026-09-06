// 普通转发只分享首页和品牌图，不携带账号、项目上下文或页面截图。
var HOME_PATH = '/pages/index/index';
var COVER = '/images/brand/zijin-longking-horizontal.png';

function home() {
  return { title: '工程施工数字孪生｜到货、安装、质量协同', path: HOME_PATH, imageUrl: COVER };
}

function recipientPath(order) {
  if (!order || !order.id || !order.projectId || !order.shareToken) return '';
  return '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(order.id) +
    '&projectId=' + encodeURIComponent(order.projectId) +
    '&token=' + encodeURIComponent(order.shareToken) + '&from=share';
}

function task(order) {
  var path = recipientPath(order);
  if (!path) return home();
  return {
    title: '整改任务｜请上传整改照片并提交复验',
    path: path,
    // A bundled cover also works when a source photo is local, cloud:// or expired.
    imageUrl: COVER
  };
}

function setMenu(enabled) {
  var method = enabled ? 'showShareMenu' : 'hideShareMenu';
  if (typeof wx === 'undefined' || typeof wx[method] !== 'function') return;
  wx[method]({ menus: ['shareAppMessage'], fail: function () {} });
}

module.exports = { home: home, task: task, recipientPath: recipientPath, setMenu: setMenu };
