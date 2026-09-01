var CHAMBERS = ['A1', 'A2', 'B1', 'B2'];
var STAGE_NAMES = ['支座安装','基础梁安装','钢支架安装','灰斗安装','壳体安装','进出口安装','阳极系统安装','阴极系统安装','振打系统安装','高压设备安装','平台扶梯安装','电气仪表安装','调试验收'];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function perspective(fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function lookAt(eye, center, up) {
  var x0,x1,x2,y0,y1,y2,z0=eye[0]-center[0],z1=eye[1]-center[1],z2=eye[2]-center[2];
  var len=Math.hypot(z0,z1,z2)||1; z0/=len;z1/=len;z2/=len;
  x0=up[1]*z2-up[2]*z1;x1=up[2]*z0-up[0]*z2;x2=up[0]*z1-up[1]*z0;len=Math.hypot(x0,x1,x2)||1;x0/=len;x1/=len;x2/=len;
  y0=z1*x2-z2*x1;y1=z2*x0-z0*x2;y2=z0*x1-z1*x0;
  return [x0,y0,z0,0,x1,y1,z1,0,x2,y2,z2,0,-(x0*eye[0]+x1*eye[1]+x2*eye[2]),-(y0*eye[0]+y1*eye[1]+y2*eye[2]),-(z0*eye[0]+z1*eye[1]+z2*eye[2]),1];
}
function multiply(a,b) {
  var out=new Array(16);
  for(var c=0;c<4;c++) for(var r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}
function hexColor(hex, alpha) {
  var value=parseInt(String(hex).replace('#',''),16);
  return [((value>>16)&255)/255,((value>>8)&255)/255,(value&255)/255,alpha==null?1:alpha];
}
function MeshBuilder() { this.p=[];this.n=[];this.c=[];this.i=[]; }
MeshBuilder.prototype.face=function(a,b,c,d,n,color){
  var base=this.p.length/3, pts=[a,b,c,d];
  for(var k=0;k<4;k++){this.p.push(pts[k][0],pts[k][1],pts[k][2]);this.n.push(n[0],n[1],n[2]);this.c.push(color[0],color[1],color[2],color[3]);}
  this.i.push(base,base+1,base+2,base,base+2,base+3);
};
MeshBuilder.prototype.box=function(cx,cy,cz,sx,sy,sz,color){
  var x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
  this.face([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],color);
  this.face([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],color);
  this.face([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],color);
  this.face([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],color);
  this.face([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],color);
  this.face([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],color);
};
MeshBuilder.prototype.hopper=function(cx,topY,cz,topX,topZ,bottomX,bottomZ,height,color){
  var y0=topY-height,y1=topY,tx=topX/2,tz=topZ/2,bx=bottomX/2,bz=bottomZ/2;
  var t1=[cx-tx,y1,cz-tz],t2=[cx+tx,y1,cz-tz],t3=[cx+tx,y1,cz+tz],t4=[cx-tx,y1,cz+tz];
  var b1=[cx-bx,y0,cz-bz],b2=[cx+bx,y0,cz-bz],b3=[cx+bx,y0,cz+bz],b4=[cx-bx,y0,cz+bz];
  this.face(t4,t3,b3,b4,[0,0,1],color);this.face(t2,t1,b1,b2,[0,0,-1],color);
  this.face(t1,t4,b4,b1,[-1,0,0],color);this.face(t3,t2,b2,b3,[1,0,0],color);
  this.face(b1,b4,b3,b2,[0,-1,0],color);
};
MeshBuilder.prototype.frustumZ=function(cx,cy,zBody,zOuter,bodyW,bodyH,outerW,outerH,color){
  var bw=bodyW/2,bh=bodyH/2,ow=outerW/2,oh=outerH/2;
  var a=[cx-bw,cy-bh,zBody],b=[cx+bw,cy-bh,zBody],c=[cx+bw,cy+bh,zBody],d=[cx-bw,cy+bh,zBody];
  var e=[cx-ow,cy-oh,zOuter],f=[cx+ow,cy-oh,zOuter],g=[cx+ow,cy+oh,zOuter],h=[cx-ow,cy+oh,zOuter];
  this.face(a,b,f,e,[0,-.3,-1],color);this.face(d,h,g,c,[0,.3,-1],color);
  this.face(a,e,h,d,[-1,0,-.2],color);this.face(b,c,g,f,[1,0,-.2],color);
  this.face(e,f,g,h,[0,0,zOuter<zBody?-1:1],color);
};

Component({
  properties: {
    projectName: { type: String, value: '' },
    deviceName: { type: String, value: '' },
    stageIndex: { type: Number, value: 1, observer: 'onStageChanged' },
    stageName: { type: String, value: '' },
    markers: { type: Array, value: [] },
    compact: { type: Boolean, value: false }
  },
  data: { ready: false, fallback: false, selectedPart: '', stageLabel: '支座安装', chamberCount: 4, inletCount: 4, outletCount: 4 },
  lifetimes: {
    ready: function () { this.initCanvas(); },
    detached: function () { this.gl=null;this.canvas=null; }
  },
  methods: {
    onStageChanged: function (value) {
      this.setData({ stageLabel: STAGE_NAMES[clamp(Number(value)||1,1,13)-1] });
      if (this.gl) { this.buildScene(); this.render(); }
    },
    initCanvas: function () {
      var self=this;
      this.createSelectorQuery().select('#constructionTwinCanvas').fields({node:true,size:true}).exec(function(res){
        if(!res[0]||!res[0].node){self.setData({fallback:true});return;}
        var canvas=res[0].node, gl=canvas.getContext('webgl',{alpha:true,antialias:true});
        if(!gl){self.setData({fallback:true});return;}
        var dpr=(wx.getWindowInfo?wx.getWindowInfo().pixelRatio:wx.getSystemInfoSync().pixelRatio)||1;
        canvas.width=Math.max(1,Math.round(res[0].width*dpr));canvas.height=Math.max(1,Math.round(res[0].height*dpr));
        self.canvas=canvas;self.gl=gl;self.cssWidth=res[0].width;self.cssHeight=res[0].height;
        self.yaw=-0.62;self.pitch=0.38;self.radius=22;self.selectedChamber='';
        try{self.initProgram();self.buildScene();self.render();self.setData({ready:true,stageLabel:STAGE_NAMES[clamp(Number(self.data.stageIndex)||1,1,13)-1]});}
        catch(err){console.error('[construction-twin-3d]',err);self.setData({fallback:true});}
      });
    },
    shader: function (type,source) {
      var gl=this.gl,s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;
    },
    initProgram: function () {
      var gl=this.gl;
      var vs='attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aColor;uniform mat4 uMvp;varying vec4 vColor;void main(){vec3 l=normalize(vec3(.45,.85,.6));float d=max(dot(normalize(aNormal),l),.22);vColor=vec4(aColor.rgb*d,aColor.a);gl_Position=uMvp*vec4(aPosition,1.0);}';
      var fs='precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}';
      var p=gl.createProgram();gl.attachShader(p,this.shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,this.shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
      this.program=p;this.loc={p:gl.getAttribLocation(p,'aPosition'),n:gl.getAttribLocation(p,'aNormal'),c:gl.getAttribLocation(p,'aColor'),m:gl.getUniformLocation(p,'uMvp')};
    },
    buildScene: function () {
      var b=new MeshBuilder(),stage=clamp(Number(this.data.stageIndex)||1,1,13);
      var green=hexColor('#1e6b45'),steel=hexColor('#60727a'),hopper=hexColor('#7b858a'),shell=hexColor('#4d7c8b',.78),cyan=hexColor('#20c7c5'),yellow=hexColor('#ffc229'),dark=hexColor('#26353b'),silver=hexColor('#aab5ba');
      var centers=[-2.7,-.9,.9,2.7],fields=[-3.2,-1.6,0,1.6,3.2],selected=this.selectedChamber;
      // 1 bearings and foot plates
      for(var lane=0;lane<4;lane++)for(var f=0;f<6;f++){var x=centers[lane],z=-4+f*1.6;b.box(x,0.12,z,1.25,.24,1.05,silver);b.box(x,0.38,z,.36,.52,.36,green);}
      if(stage>=2){for(lane=0;lane<4;lane++){b.box(centers[lane],.72,0,.28,.28,8.4,green);for(f=0;f<6;f++)b.box(centers[lane],.72,-4+f*1.6,1.35,.28,.28,green);}}
      if(stage>=3){for(lane=0;lane<4;lane++)for(f=0;f<6;f++){x=centers[lane];z=-4+f*1.6;b.box(x-.56,1.8,z,.18,2.6,.18,green);b.box(x+.56,1.8,z,.18,2.6,.18,green);b.box(x,3.02,z,1.35,.18,.18,green);}}
      if(stage>=4){for(lane=0;lane<4;lane++)for(f=0;f<5;f++)b.hopper(centers[lane],3.05,fields[f],1.25,1.38,.28,.28,1.38,hopper);}
      if(stage>=5){for(lane=0;lane<4;lane++){var chamber=CHAMBERS[lane],color=selected===chamber?yellow:shell;b.box(centers[lane],5.05,0,1.52,3.85,8.05,color);for(f=0;f<6;f++)b.box(centers[lane],5.05,-4+f*1.6,1.6,.12,.12,dark);}}
      if(stage>=6){for(lane=0;lane<4;lane++){var ccol=selected===CHAMBERS[lane]?yellow:steel;b.frustumZ(centers[lane],4.75,-4.02,-5.55,1.48,3.1,1.02,1.65,ccol);b.frustumZ(centers[lane],4.75,4.02,5.55,1.48,3.1,1.02,1.65,ccol);}}
      if(stage>=7){for(lane=0;lane<4;lane++)for(f=0;f<5;f++)b.box(centers[lane]-.22,5.2,fields[f],.08,2.85,1.2,yellow);}
      if(stage>=8){for(lane=0;lane<4;lane++)for(f=0;f<5;f++)b.box(centers[lane]+.22,5.2,fields[f],.08,2.85,1.2,cyan);}
      if(stage>=9){for(lane=0;lane<4;lane++){b.box(centers[lane],7.2,0,.18,.18,7.6,steel);for(f=0;f<5;f++)b.box(centers[lane],7.42,fields[f],.5,.5,.5,dark);}}
      if(stage>=10){for(lane=0;lane<4;lane++)for(f=0;f<3;f++)b.box(centers[lane],7.75,-2.5+f*2.5,.7,.85,.7,silver);}
      if(stage>=11){b.box(0,7.35,0,7.7,.16,8.5,steel);for(f=0;f<7;f++)b.box(0,7.8,-4.1+f*1.36,7.9,.12,.12,steel);b.box(-4.15,3.5,1.8,.15,5.5,.7,steel);}
      if(stage>=12){for(lane=0;lane<4;lane++){b.box(centers[lane]+.62,6.2,-3.35,.25,.45,.25,cyan);b.box(centers[lane]+.62,6.2,3.35,.25,.45,.25,cyan);}}
      if(stage>=13){b.box(0,8.35,0,8.15,.08,8.7,hexColor('#68e378',.65));}
      this.uploadMesh(b);
    },
    uploadMesh: function (b) {
      var gl=this.gl;
      function buffer(type,data){var x=gl.createBuffer();gl.bindBuffer(type,x);gl.bufferData(type,data,gl.STATIC_DRAW);return x;}
      this.buffers={p:buffer(gl.ARRAY_BUFFER,new Float32Array(b.p)),n:buffer(gl.ARRAY_BUFFER,new Float32Array(b.n)),c:buffer(gl.ARRAY_BUFFER,new Float32Array(b.c)),i:buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(b.i))};
      this.indexCount=b.i.length;
    },
    render: function () {
      var gl=this.gl;if(!gl||!this.indexCount)return;
      gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.015,.047,.078,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.program);
      var cp=Math.cos(this.pitch),eye=[this.radius*Math.sin(this.yaw)*cp,4+this.radius*Math.sin(this.pitch),this.radius*Math.cos(this.yaw)*cp];
      var mvp=multiply(perspective(Math.PI/4,this.canvas.width/this.canvas.height,.1,100),lookAt(eye,[0,3.7,0],[0,1,0]));
      gl.uniformMatrix4fv(this.loc.m,false,new Float32Array(mvp));
      var self=this;[['p',this.loc.p,3],['n',this.loc.n,3],['c',this.loc.c,4]].forEach(function(item){gl.bindBuffer(gl.ARRAY_BUFFER,self.buffers[item[0]]);gl.enableVertexAttribArray(item[1]);gl.vertexAttribPointer(item[1],item[2],gl.FLOAT,false,0,0);});
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.buffers.i);gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
    },
    touchStart: function (e) {
      var t=e.touches||[];if(!t.length)return;this.touch={x:t[0].x,y:t[0].y,moved:false,startX:t[0].x};
      if(t.length>1)this.touch.distance=Math.hypot(t[1].x-t[0].x,t[1].y-t[0].y);
    },
    touchMove: function (e) {
      var t=e.touches||[];if(!this.touch||!t.length)return;
      if(t.length>1){var d=Math.hypot(t[1].x-t[0].x,t[1].y-t[0].y);if(this.touch.distance)this.radius=clamp(this.radius-(d-this.touch.distance)*.04,13,34);this.touch.distance=d;}
      else{var dx=t[0].x-this.touch.x,dy=t[0].y-this.touch.y;this.yaw-=dx*.012;this.pitch=clamp(this.pitch+dy*.009,-.05,1.05);this.touch.x=t[0].x;this.touch.y=t[0].y;if(Math.abs(dx)+Math.abs(dy)>2)this.touch.moved=true;}
      this.render();
    },
    touchEnd: function () {
      if(this.touch&&!this.touch.moved){var ratio=clamp(this.touch.startX/(this.cssWidth||1),0,.999);this.selectedChamber=CHAMBERS[Math.floor(ratio*4)];this.setData({selectedPart:this.selectedChamber+'室'});this.buildScene();this.render();this.triggerEvent('parttap',{id:this.selectedChamber.toLowerCase(),name:this.selectedChamber+'室'});}
      this.touch=null;
    },
    markerTap: function (e) {
      var marker = (this.data.markers || [])[Number(e.currentTarget.dataset.index)];
      if (marker) this.triggerEvent('markertap', { id: marker.id, defect: marker });
    },
    resetView: function () { this.yaw=-.62;this.pitch=.38;this.radius=22;this.selectedChamber='';this.setData({selectedPart:''});this.buildScene();this.render(); }
  }
});
