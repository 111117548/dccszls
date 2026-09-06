var app = getApp();
var v3Data = require('../../utils/v3-data.js');
function decorateDefect(defect) {
  if (!defect) return defect;
  var stage = (v3Data.CONSTRUCTION_STAGES || []).filter(function (item) { return item.id === defect.constructionStageId; })[0];
  var orders = app.getV3State().rectificationOrders || []; var order = null;
  for (var i = 0; i < orders.length; i++) if ((orders[i].defectIds || []).indexOf(defect.id) !== -1) { order = orders[i]; break; }
  return Object.assign({}, defect, {
    constructionStageName: stage ? stage.name : '待关联施工阶段',
    openRectificationOrderId: order ? order.id : '', openRectificationStatusName: order ? order.statusName : ''
  });
}
Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: { filters: [{key:'all',name:'全部'},{key:'pending',name:'待整改'},{key:'rectifying',name:'整改中'},{key:'review',name:'待复验'},{key:'closed',name:'已闭环'}], activeFilter: 'all', defects: [], counts: {}, showDetail: false, activeDefect: null, targetId: '', currentUser: {}, syncStatus: {} },
  onLoad: function (options) { this.setData({ targetId: options.id || '' }); },
  onShow: function () { this.setData({currentUser:app.globalData.currentUser||{},syncStatus:app.globalData.cloudSyncStatus||{}});this.loadDefects(); },
  loadDefects: function () {
    var context=app.getFoundationContext();
    var all=(app.getV3State().defects||[]).filter(function(d){return d.projectId===context.project.id&&d.deviceId===context.device.id}); var filter=this.data.activeFilter;
    var list=filter==='all'?all:all.filter(function(d){return d.status===filter});
    var counts={all:all.length,pending:0,rectifying:0,review:0,closed:0}; all.forEach(function(d){counts[d.status]=(counts[d.status]||0)+1});
    this.setData({defects:list.map(decorateDefect),counts:counts});
    if(this.data.targetId){for(var i=0;i<all.length;i++){if(all[i].id===this.data.targetId){this.setData({showDetail:true,activeDefect:decorateDefect(all[i]),targetId:''});break}}}
  },
  switchFilter: function(e){this.setData({activeFilter:e.currentTarget.dataset.key});this.loadDefects()},
  openDetail: function(e){var id=e.currentTarget.dataset.id;var all=app.getV3State().defects;for(var i=0;i<all.length;i++)if(all[i].id===id)this.setData({showDetail:true,activeDefect:decorateDefect(all[i])})},
  closeDetail: function(){this.setData({showDetail:false,activeDefect:null})},
  advanceStatus: function(){
    var d=this.data.activeDefect;if(!d)return;
    if(d.openRectificationOrderId){this.closeDetail();wx.navigateTo({url:'/pages/rectification-detail/rectification-detail?id='+encodeURIComponent(d.openRectificationOrderId)+'&from=creator'});return}
    if(d.status==='closed')return;var next={pending:'rectifying',rectifying:'review',review:'closed'}[d.status];
    var user=app.globalData.currentUser||{};
    if(next==='closed'&&['project_manager','supervisor'].indexOf(user.role)===-1){wx.showModal({title:'没有复验权限',content:'仅项目经理或监理工程师可以执行复验通过。当前角色：'+(user.roleName||'质量检查员'),showCancel:false});return}
    var extra={note:next==='rectifying'?'接收整改任务':next==='review'?'整改完成并提交复验':'复验通过并闭环'};
    if(next==='rectifying')extra.rectification={owner:user.name||'现场安装单位',ownerId:user.id||'',updatedAt:new Date().toLocaleString('zh-CN'),note:'已接收整改任务'};
    if(next==='review'){extra.rectification=Object.assign({},d.rectification||{},{submittedBy:user.name||'现场安装单位',submittedAt:new Date().toLocaleString('zh-CN')})}
    if(next==='closed')extra.review={reviewer:user.name||'监理工程师',reviewerId:user.id||'',reviewerRole:user.role||'',result:'复验通过',updatedAt:new Date().toLocaleString('zh-CN')};
    var updated=app.updateDefectStatus(d.id,next,extra);this.setData({activeDefect:decorateDefect(updated)});this.loadDefects();wx.showToast({title:updated.statusName,icon:'success'});
  },
  openDevice: function(){var id=this.data.activeDefect.deviceNodeId;this.closeDetail();wx.navigateTo({url:'/pages/device-detail/device-detail?id='+id})}
});
