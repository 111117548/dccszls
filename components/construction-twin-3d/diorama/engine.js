'use strict'
const M=require('./math'),Renderer=require('./renderer'),Scene=require('./diorama')
const STAGES=[{name:'基础与预埋',value:1.5},{name:'钢支架安装',value:2.5},{name:'灰斗与平台',value:3.25},{name:'壳体与喇叭',value:4.0},{name:'设备基本完成',value:5.1}]
const TIMES=[{name:'正午',night:0,warm:.10},{name:'黄昏',night:.24,warm:.95},{name:'夜晚',night:1,warm:.65},{name:'黎明',night:.35,warm:.40}]
class Engine{
  constructor(canvas,w,h,quality){this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});if(!this.gl)throw Error('此设备无法创建 WebGL 场景');this.renderer=new Renderer(this.gl,quality);this.scene=new Scene(quality);this.quality=quality;
  this.yaw=-.62;this.pitch=.60;this.target=[0,2,0];this.phase=this.targetPhase=3.70;this.clock=0;this.fxTime=0;this.speed=1;this.paused=false;this.rain=false;this.dust=1;this.orbit=true;this.cycle=false;this.timeIndex=0;this.status=false;this.labels=true;this.selection=null;this.isolation=null;this.lastInteraction=0;this.intro=0;this.zoom=1;this.fit(w,h);this.stats={frames:0,fps:0,drawCalls:0};this.fpsClock=0;this.fpsFrames=0;
 }
 fit(w,h){this.width=w;this.height=h;this.aspect=w/h;this.distance=Math.max(115,58/(Math.tan(34*Math.PI/360)*this.aspect))*(this.aspect<1?1.18:1.60);this.renderer.resize(this.canvas.width,this.canvas.height);this.matrices()}
 matrices(){const d=this.distance*this.zoom,cp=Math.cos(this.pitch),s=Math.sin(this.yaw),c=Math.cos(this.yaw);this.eye=[this.target[0]+d*cp*s,this.target[1]+d*Math.sin(this.pitch),this.target[2]+d*cp*c];this.view=M.mat4LookAt(this.eye,this.target,[0,1,0]);this.projection=M.mat4Perspective(34*Math.PI/180,this.aspect,.5,1500);this.vp=M.mat4Multiply(this.projection,this.view)}
 update(dt){const elapsed=dt;dt=Math.min(dt,80);this.fxTime+=dt;this.intro+=dt;if(!this.paused)this.clock+=dt*this.speed*(this.rain?.15:1);if(this.orbit&&this.fxTime-this.lastInteraction>5500)this.yaw+=dt*.000035;
  const step=dt/1500;this.phase+=M.clamp(this.targetPhase-this.phase,-step,step);if(this.cycle)this.timeIndex=Math.floor(this.fxTime/18000)%4;
  if(this.intro<6500&&this.lastInteraction===0)this.zoom=1-.045*Math.min(this.intro/6500,1);
  this.matrices();const tm=TIMES[this.timeIndex],options={selected:this.selection,rain:this.rain,dust:this.dust,fxTime:this.fxTime};const b=this.scene.visibleBatches(this.phase,this.status,this.clock,this.isolation,options);
  this.renderer.draw(b,this.vp,{eye:this.eye,time:this.fxTime,night:tm.night,rain:this.rain,warm:tm.warm});this.stats.frames++;this.fpsClock+=elapsed;this.fpsFrames++;
  if(this.fpsClock>=1000){this.stats.fps=Math.round(this.fpsFrames*1000/this.fpsClock);this.fpsClock=0;this.fpsFrames=0}this.stats.drawCalls=this.renderer.drawCalls;this.stats.instances=Object.values(b).reduce((sum,a)=>sum+a.length,0);
 }
 interact(){this.lastInteraction=this.fxTime+1}
 rotate(dx,dy){this.interact();this.yaw-=dx*.007;this.pitch=M.clamp(this.pitch+dy*.005,.28,1.08)}
 zoomBy(delta){this.interact();this.zoom=M.clamp(this.zoom*Math.exp(delta),.28,1.6)}
 pan(dx,dy){this.interact();this.target[0]=M.clamp(this.target[0]-dx*.06,-14,14);this.target[2]=M.clamp(this.target[2]+dy*.06,-12,12)}
 reset(){this.yaw=-.62;this.pitch=.60;this.zoom=1;this.target=[0,2,0];this.isolation=null;this.interact()}
 focus(){this.zoom=.66;this.target=[0,12,0];this.interact()}
 setStage(i){this.scene.clearProgress();this.targetPhase=STAGES[i].value;this.isolation=null;this.interact()}
 applyProgress(records,displayStage,displayGhosts){this.scene.applyProgress(records,displayStage,displayGhosts);this.interact()}
 control(key){this.interact();if(key==='phase'){const index=STAGES.findIndex(s=>s.value>this.targetPhase+.05);this.setStage(index<0?0:index)}else if(key==='speed')this.speed=this.speed===1?1.5:this.speed===1.5?.5:1;else if(key==='time')this.timeIndex=(this.timeIndex+1)%4;else if(key==='dust')this.dust=(this.dust+1)%3;else if(key==='labels')this.labels=!this.labels;else if(key==='orbit')this.orbit=!this.orbit}
 project(p){const n=M.transformPoint(this.vp,p);return {x:(n[0]+1)*.5*this.width,y:(1-n[1])*.5*this.height,z:n[2]}}
 pick(x,y){this.interact();for(const c of this.scene.controls){const p=this.project(c.center);if(Math.hypot(p.x-x,p.y-y)<11){this.control(c.key);return {control:c.key}}}
  const forward=M.normalize(M.sub(this.target,this.eye)),right=M.normalize(M.cross(forward,[0,1,0])),up=M.cross(right,forward),tan=Math.tan(34*Math.PI/360),nx=(x/this.width*2-1)*this.aspect*tan,ny=(1-y/this.height*2)*tan;
  const ray=M.normalize(M.add(forward,M.add(M.scale(right,nx),M.scale(up,ny))));this.selection=this.scene.pick(this.eye,ray);return this.selection?this.scene.getComponent(this.selection,this.phase):null;
 }
 select(id){this.selection=id;this.interact();return this.scene.getComponent(id,this.phase)}
 destroy(){this.renderer.destroy()}
}
Engine.STAGES=STAGES;Engine.TIMES=TIMES;module.exports=Engine
