'use strict'
const M=require('./math')
const VS=`
precision highp float;
attribute vec3 aPosition,aNormal;
attribute vec4 aM0,aM1,aM2,aM3,aColor,aSurface;
uniform mat4 uVP,uLightVP;
uniform float uPass;
varying vec3 vWorld,vNormal,vLocal;
varying vec4 vColor,vSurface,vShadow;
void main(){
 mat4 m=mat4(aM0,aM1,aM2,aM3);
 vec4 p=m*vec4(aPosition,1.);
 vec3 n=aM0.xyz*aNormal.x/max(dot(aM0.xyz,aM0.xyz),.00001)+aM1.xyz*aNormal.y/max(dot(aM1.xyz,aM1.xyz),.00001)+aM2.xyz*aNormal.z/max(dot(aM2.xyz,aM2.xyz),.00001);
 vNormal=normalize(n);vWorld=p.xyz;vLocal=aPosition;vColor=aColor;vSurface=aSurface;vShadow=uLightVP*p;
 gl_Position=(uPass>.5?uLightVP:uVP)*p;
}`
const FS=`
precision highp float;
uniform float uPass,uTime,uNight,uRain,uShadows,uWarm;
uniform vec3 uEye,uLightDir;
uniform sampler2D uShadow;
varying vec3 vWorld,vNormal,vLocal;
varying vec4 vColor,vSurface,vShadow;
vec4 pack(float v){vec4 e=fract(v*vec4(1.,255.,65025.,16581375.));e-=e.yzww*vec4(1./255.,1./255.,1./255.,0.);return e;}
float unpack(vec4 v){return dot(v,vec4(1.,1./255.,1./65025.,1./16581375.));}
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 float opacity=vSurface.y;
 // Geometry is either visible or hidden. Screen-door transparency caused
 // severe particle-like breakup on several mobile WeChat WebGL drivers.
 if(opacity<.5)discard;
 if(uPass>.5){gl_FragColor=pack(gl_FragCoord.z);return;}
 vec3 n=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
 float material=vSurface.x;
 vec3 base=vColor.rgb;
 if(material>1.5&&material<2.5){
  float grain=sin(vWorld.z*8.+sin(vWorld.x*.028)*5.+sin(vWorld.z*.12)*2.);
  base*=.96+.035*grain+.015*sin(vWorld.z*65.+vWorld.x*.07);
 }
 if(material>.5&&material<1.5){base*=.98+.035*sin(vWorld.x*21.+vWorld.z*14.);}
 if(material>3.5&&material<4.5){base*=.95+.09*noise(floor(vWorld.xz*21.));base*=1.-uRain*.20;}
 float sh=1.;vec3 sc=vShadow.xyz/vShadow.w*.5+.5;
 if(uShadows>.5&&sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z<1.){
  float total=0.;float bias=.0014+.001*(1.-max(dot(n,uLightDir),0.));
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
   float d=unpack(texture2D(uShadow,sc.xy+vec2(float(x),float(y))/1024.));
   total+=sc.z-bias>d?0.:1.;
  }sh=total/9.;
 }
 float nd=max(dot(n,normalize(uLightDir)),0.);
 float sky=.38+.18*max(n.y,0.);
 vec3 warm=mix(vec3(1.05,1.01,.90),vec3(1.35,.83,.48),uWarm);
 vec3 light=vec3(sky)*(1.-uNight*.67)+warm*nd*sh*(.58-uNight*.32);
 light+=vec3(.11,.15,.18)*max(dot(n,normalize(vec3(.5,.3,-.7))),0.)*(1.-uNight*.3);
 vec3 eye=normalize(uEye-vWorld);float spec=pow(max(dot(n,normalize(eye+uLightDir)),0.),material>.5&&material<1.5?40.:18.);
 vec3 color=base*light;
 if(material>.5&&material<2.5)color+=warm*spec*.20*sh;
 if(material>3.5&&material<4.5)color+=vec3(.20,.26,.30)*pow(max(dot(n,normalize(eye+uLightDir)),0.),48.)*uRain;
 // Local warm pools are deliberately bounded to the worksite.
 for(int i=0;i<4;i++){
  float x=mod(float(i),2.)*64.-32.;float z=floor(float(i)/2.)*38.-19.;
  vec3 delta=vec3(x,13.,z)-vWorld;
  float local=max(dot(n,normalize(delta)),0.)/(1.+dot(delta,delta)*.055);
  color+=base*vec3(1.1,.78,.32)*local*(uNight*2.8+uRain*.7);
 }
 if(material>2.5&&material<3.5)color=base*(1.15+uNight*.85);
 if(vSurface.z>.5)color=mix(color,vec3(1.,.67,.17),.38+.12*sin(uTime*.003));
 float distanceFog=smoothstep(120.,320.,length(vWorld.xz));
 color=mix(color,vec3(.82,.88,.90),distanceFog*.75);
 color=color/(color+vec3(.45))*1.12;
 gl_FragColor=vec4(color,1.);
}`

function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function program(gl){const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,VS),f=shader(gl,gl.FRAGMENT_SHADER,FS);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
function geometry(kind){
 const p=[],n=[];function tri(a,b,c){const normal=M.normalize(M.cross(M.sub(b,a),M.sub(c,a)));[a,b,c].forEach(v=>{p.push(...v);n.push(...normal)})}
 function quad(a,b,c,d){tri(a,b,c);tri(a,c,d)}
 if(kind==='box'){
  const v=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
  [[4,5,6,7],[1,0,3,2],[0,4,7,3],[5,1,2,6],[3,7,6,2],[0,1,5,4]].forEach(f=>quad(...f.map(i=>v[i])));
 }else if(kind==='hopper'||kind==='horn'){
  const t=[[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]],b=t.map(v=>[v[0]*(kind==='horn'?.42:.14),-.5,v[2]*(kind==='horn'?.52:.14)]);
  for(let i=0;i<4;i++){let j=(i+1)%4;quad(t[i],t[j],b[j],b[i]);}
 }else{
   for(let i=0;i<18;i++){let a=i*Math.PI/9,b=(i+1)*Math.PI/9;const q=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],r=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],s=[r[0],.5,r[2]],t=[q[0],.5,q[2]];quad(q,t,s,r);tri([0,.5,0],s,t);tri([0,-.5,0],q,r)}
 }
 return {p:new Float32Array(p),n:new Float32Array(n),count:p.length/3};
}

class Renderer {
 constructor(gl,quality){
  this.gl=gl;this.quality=quality||'high';this.ext=gl.getExtension('ANGLE_instanced_arrays');this.p=program(gl);this.geometries={};this.buffers={};this.loc={};
  ['aPosition','aNormal','aM0','aM1','aM2','aM3','aColor','aSurface'].forEach(k=>this.loc[k]=gl.getAttribLocation(this.p,k));
  ['uVP','uLightVP','uPass','uEye','uTime','uNight','uRain','uShadows','uWarm','uLightDir','uShadow'].forEach(k=>this.loc[k]=gl.getUniformLocation(this.p,k));
  ['box','hopper','horn','prism'].forEach(k=>{let g=geometry(k);const p=gl.createBuffer(),n=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,p);gl.bufferData(gl.ARRAY_BUFFER,g.p,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,n);gl.bufferData(gl.ARRAY_BUFFER,g.n,gl.STATIC_DRAW);this.geometries[k]={p,n,count:g.count};this.buffers[k]=gl.createBuffer()});
  this.lightDir=M.normalize([-50,85,40]);this.lightVP=M.mat4Multiply(M.ortho(-76,76,-65,65,1,250),M.mat4LookAt([-70,110,65],[0,0,0],[0,1,0]));
  this.initShadow();gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);this.drawCalls=0;
 }
 initShadow(){
  const g=this.gl;this.shadow=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.shadow);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1024,1024,0,g.RGBA,g.UNSIGNED_BYTE,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
  this.fb=g.createFramebuffer();this.depth=g.createRenderbuffer();g.bindRenderbuffer(g.RENDERBUFFER,this.depth);g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT16,1024,1024);g.bindFramebuffer(g.FRAMEBUFFER,this.fb);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,this.shadow,0);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,this.depth);this.shadowOK=g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE;g.bindFramebuffer(g.FRAMEBUFFER,null);
 }
 resize(w,h){this.width=w;this.height=h}
 pack(list){const d=new Float32Array(list.length*24);list.forEach((o,i)=>{d.set(o.matrix,i*24);d.set(o.color,i*24+16);d.set([o.material||0,o.opacity===undefined?1:o.opacity,o.selected?1:0,0],i*24+20)});return d}
 batch(type,list){
  if(!list.length)return;const g=this.gl,geo=this.geometries[type],l=this.loc;
  g.bindBuffer(g.ARRAY_BUFFER,geo.p);g.enableVertexAttribArray(l.aPosition);g.vertexAttribPointer(l.aPosition,3,g.FLOAT,false,0,0);
  g.bindBuffer(g.ARRAY_BUFFER,geo.n);g.enableVertexAttribArray(l.aNormal);g.vertexAttribPointer(l.aNormal,3,g.FLOAT,false,0,0);
  g.bindBuffer(g.ARRAY_BUFFER,this.buffers[type]);g.bufferData(g.ARRAY_BUFFER,this.pack(list),g.DYNAMIC_DRAW);
  const attrs=['aM0','aM1','aM2','aM3','aColor','aSurface'];
  if(this.ext){attrs.forEach((k,i)=>{g.enableVertexAttribArray(l[k]);g.vertexAttribPointer(l[k],4,g.FLOAT,false,96,i*16);this.ext.vertexAttribDivisorANGLE(l[k],1)});this.ext.drawArraysInstancedANGLE(g.TRIANGLES,0,geo.count,list.length);attrs.forEach(k=>this.ext.vertexAttribDivisorANGLE(l[k],0));this.drawCalls++}
  else{attrs.forEach(k=>g.disableVertexAttribArray(l[k]));list.forEach(o=>{attrs.slice(0,4).forEach((k,i)=>g.vertexAttrib4fv(l[k],o.matrix.subarray(i*4,i*4+4)));g.vertexAttrib4fv(l.aColor,o.color);g.vertexAttrib4f(l.aSurface,o.material||0,o.opacity===undefined?1:o.opacity,o.selected?1:0,0);g.drawArrays(g.TRIANGLES,0,geo.count);this.drawCalls++})}
 }
 draw(batches,vp,options){
  const g=this.gl,l=this.loc,o=options||{};this.drawCalls=0;g.useProgram(this.p);g.disable(g.BLEND);g.uniformMatrix4fv(l.uVP,false,vp);g.uniformMatrix4fv(l.uLightVP,false,this.lightVP);g.uniform3fv(l.uEye,o.eye||[0,60,150]);g.uniform3fv(l.uLightDir,this.lightDir);g.uniform1f(l.uTime,o.time||0);g.uniform1f(l.uNight,o.night||0);g.uniform1f(l.uRain,o.rain?1:0);g.uniform1f(l.uWarm,o.warm||0);
  const shadows=this.shadowOK&&this.quality!=='low';
  g.uniform1i(l.uShadow,0);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,null);
  if(shadows){g.bindFramebuffer(g.FRAMEBUFFER,this.fb);g.viewport(0,0,1024,1024);g.clearColor(1,1,1,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.uniform1f(l.uPass,1);g.uniform1f(l.uShadows,0);Object.keys(batches).forEach(k=>this.batch(k,batches[k].filter(i=>!i.noShadow)));}
  g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.width,this.height);g.clearColor(.86,.91,.93,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.bindTexture(g.TEXTURE_2D,this.shadow);g.uniform1f(l.uPass,0);g.uniform1f(l.uShadows,shadows?1:0);Object.keys(batches).forEach(k=>this.batch(k,batches[k]));
 }
 destroy(){const g=this.gl;Object.keys(this.geometries).forEach(k=>{g.deleteBuffer(this.geometries[k].p);g.deleteBuffer(this.geometries[k].n);g.deleteBuffer(this.buffers[k])});g.deleteTexture(this.shadow);g.deleteFramebuffer(this.fb);g.deleteRenderbuffer(this.depth);g.deleteProgram(this.p)}
}
module.exports=Renderer
