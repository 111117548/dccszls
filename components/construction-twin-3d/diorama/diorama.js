'use strict'
const M=require('./math')
const C={green:[.075,.24,.18,1],dark:[.04,.085,.078,1],silver:[.61,.66,.64,1],rim:[.37,.46,.43,1],hopper:[.30,.35,.35,1],gold:[.98,.64,.13,1],orange:[.93,.29,.09,1],black:[.035,.045,.04,1],cream:[.77,.72,.59,1],white:[.84,.87,.79,1],blue:[.10,.38,.49,1],red:[.76,.09,.055,1],glass:[.13,.27,.29,1],copper:[.60,.29,.105,1]}
// Keep the model component IDs aligned with the app's canonical 13-stage catalog.
// The source diorama used an older classification, so geometry is folded into
// the current business categories here instead of leaking the old names to UI.
const NAMES=['钢支架','支座','灰斗','壳体','楼梯平台','阴阳极系统','进出口喇叭','保温箱','灰斗纳米涂层','振打系统','电气安装','顶部起吊系统','调试']
const PHASES=[2,1,3,3.4,3,4.2,4,4.6,4.55,4.45,4.8,4.75,5]
const LEGACY_TO_CANONICAL={1:2,2:1,3:1,4:3,5:4,6:7,7:6,8:6,9:10,10:8,11:5,12:11,13:13}
const rgb=c=>Array.isArray(c)?c:C[c]||C.silver
const smooth=v=>{v=M.clamp(v,0,1);return v*v*(3-2*v)}
function move(matrix,p){const m=new Float32Array(matrix);m[12]+=p[0];m[13]+=p[1];m[14]+=p[2];return m}
class Scene{
 constructor(quality){this.quality=quality||'high';this.objects=[];this.components={};this.phase=3.7;this.displayStage=13;this.displayGhosts=true;this.controls=[];this.paths=[];
  NAMES.forEach((name,i)=>{const id='COMP-'+String(i+1).padStart(2,'0');this.components[id]={id,name,type:'部件安装管理',requiredStage:PHASES[i],planDate:'演示计划',team:'示例安装班组',boundsMin:[Infinity,Infinity,Infinity],boundsMax:[-Infinity,-Infinity,-Infinity]}});
  this.room();this.desktop();this.site();this.context();this.esp();this.machinery();this.details();
 }
 object(mesh,p,size,c,phase,id,rotation,opts){
  const mappedId=typeof id==='number'?(LEGACY_TO_CANONICAL[id]||id):id;
  const componentId=typeof mappedId==='number'?'COMP-'+String(mappedId).padStart(2,'0'):mappedId||null;
  const o=Object.assign({mesh,center:p.slice(),size:size.slice(),matrix:M.mat4TRS(p,rotation||[0,0,0],size),color:rgb(c).slice(),phase:phase||0,componentId,material:0},opts||{});this.objects.push(o);
  const comp=this.components[componentId];if(comp)for(let j=0;j<3;j++){comp.boundsMin[j]=Math.min(comp.boundsMin[j],p[j]-size[j]/2);comp.boundsMax[j]=Math.max(comp.boundsMax[j],p[j]+size[j]/2)}
  return o;
 }
 box(p,s,c,phase,id,rot,opts){return this.object('box',p,s,c,phase,id,rot,opts)}
 cyl(p,s,c,phase,id,rot,opts){return this.object('prism',p,s,c,phase,id,rot,opts)}
 beam(a,b,t,c,phase,id,opts){const center=M.scale(M.add(a,b),.5),size=M.sub(b,a).map(v=>Math.abs(v)+t);const o=this.object('box',center,size,c,phase,id,null,opts);o.matrix=M.mat4BeamBetween(a,b,t,t);o.endpoints=[a.slice(),b.slice()];o.thickness=t;return o}
 rail(a,b,y,c,phase,id){this.beam([a[0],y,a[1]],[b[0],y,b[1]],.11,c,phase,id);this.beam([a[0],y-.6,a[1]],[b[0],y-.6,b[1]],.075,c,phase,id);const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2.2);for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;this.box([x,y-.65,z],[.11,1.3,.11],c,phase,id)}}
 room(){
  // Keep only the floor as real geometry. A fixed vertical studio backdrop sits
  // between the camera and the diorama for half of a 360-degree orbit on device.
  // The renderer clear colour supplies the dark indoor background from every angle.
  this.box([0,-12,0],[600,1,600],[.70,.78,.81,1],0,null,null,{noShadow:true});
  // Sparse, low-contrast lines combine scheme A's light studio with scheme C's grid.
  for(let p=-120;p<=120;p+=15){this.box([p,-11.48,0],[.055,.025,240],[.48,.61,.66,1],0,null,null,{noShadow:true});this.box([0,-11.47,p],[240,.025,.055],[.48,.61,.66,1],0,null,null,{noShadow:true})}
 }
 desktop(){
  this.box([0,-1.25,-7],[112,2.5,92],[.30,.155,.075,1],0,null,null,{material:2});
  for(let z=-50;z<=36;z+=9)this.box([0,.027,z],[111,.02,.05],[.115,.065,.034,1],0,null,null,{noShadow:true});
  [[-45,-28],[45,-28],[-45,28],[45,28]].forEach(p=>this.box([p[0],-7,p[1]],[4.3,11.5,4.3],[.16,.08,.038,1],0,null,null,{material:2}));
  this.box([0,.36,-8],[95,.72,74],'dark',0);this.box([0,.82,-8],[93,.22,72],[.48,.34,.17,1],0);this.box([0,1.15,-8],[91,.45,70],'cream',0);this.box([0,1.40,-8],[90,.08,69],[.63,.57,.44,1],0,null,null,{material:4});
  this.box([-29,.10,32],[24,.13,9.7],[.07,.28,.37,1],0,null,null,{noShadow:true});
  for(let x=-40;x<=-18;x+=2)this.box([x,.20,32],[.025,.02,8.8],[.38,.62,.64,1],0,null,null,{noShadow:true});for(let z=28;z<=36;z+=2)this.box([-29,.21,z],[23,.02,.025],[.38,.62,.64,1],0,null,null,{noShadow:true});
  for(let x=-37;x<=-21;x+=4){this.box([x,.23,32],[2.8,.03,.045],'white',0);this.box([x-1.4,.23,32],[.045,.03,4.6],'white',0);this.box([x+1.4,.23,32],[.045,.03,4.6],'white',0)}
  this.box([-45,.65,32],[2.3,1.15,6.4],'gold',0);this.box([-45,1.24,32],[1.1,.05,3.6],'dark',0);this.box([-43.1,.35,32],[.7,.35,7.6],'silver',0);
  this.beam([-41,.35,26],[-28,.35,26],.22,'gold',0);this.beam([-28,.35,26],[-27,.35,26],.20,'black',0);
  this.box([5,.45,33],[26,.8,5],'dark',0);['phase','speed','time','dust','labels','orbit'].forEach((key,i)=>{const x=-5+i*4;this.cyl([x,1.15,33],[1.25,.9,1.25],'rim',0);this.box([x,1.65,33.27],[.12,.08,.46],'white',0);this.controls.push({key,center:[x,1.5,33]})});
  this.cyl([35,.25,33],[5.1,.30,4.3],'gold',0);this.cyl([35,1.1,33],[3.5,1.5,3.2],'gold',0);this.box([35,1.9,33],[.25,.4,3.1],'gold',0);
  this.box([45,.6,32],[5,1.1,4],'orange',0);this.box([45,1.19,32],[4.2,.15,3.2],'black',0);for(let i=0;i<6;i++)this.cyl([43.5+i*.55,1.35,32],[.35,.25,.35],'silver',0);
 }
 site(){
  this.box([0,1.47,21],[82,.12,5],[.22,.26,.25,1],0,null,null,{material:4});this.box([0,1.47,-38],[82,.12,4],[.22,.26,.25,1],0,null,null,{material:4});for(let x of [-39,39])this.box([x,1.47,-8.5],[5,.12,59],[.22,.26,.25,1],0,null,null,{material:4});
  for(let x=-36;x<=36;x+=4){this.box([x,1.55,21],[1.9,.018,.10],'white',0);this.box([x,1.55,-38],[1.9,.018,.10],'white',0)}for(let z=-35;z<=17;z+=4)for(let x of [-39,39])this.box([x,1.55,z],[.10,.018,1.9],'white',0);
  for(let x=-44;x<=44;x+=3)for(let z of [-42,26]){if(z===26&&x>29&&x<41)continue;this.box([x,2.5,z],[2.8,2.1,.15],Math.round(x/3)%3===0?'white':'green',0);this.box([x-1.43,2.6,z],[.12,2.4,.20],'silver',0)}
  for(let z=-40;z<=23;z+=3)for(let x of [-45,45]){this.box([x,2.5,z],[.15,2.1,2.8],'green',0);this.box([x,2.6,z-1.43],[.2,2.4,.12],'white',0)}
  this.box([35,5.2,26],[10,.8,.65],'blue',0);for(let x of [30,40])this.box([x,3.2,26],[.65,3.8,.65],'blue',0);
  for(let x of [-35,35])for(let z of [-35,19]){this.box([x,7.2,z],[.20,11.5,.20],'rim',0);this.beam([x-1.5,12.8,z],[x+1.5,12.8,z],.18,'rim',0);for(let dx of [-1.3,1.3])this.box([x+dx,12.65,z],[.85,.4,.5],'cream',0,null,[.25,0,0],{material:3})}
 }
 context(){
  // Named low-detail landmarks follow the supplied photograph's relative layout.
  const bg=(name,build)=>{const start=this.objects.length;build();this.objects.slice(start).forEach(o=>o.background=name)};
  const sheet=[.48,.53,.53,1],edge=[.37,.43,.42,1];
  const hall=(name,x,z,w,d,h,boiler)=>bg(name,()=>{
   this.box([x,1.5+h/2,z],[w,h,d],sheet,0,null,null,{material:1});this.box([x,1.53+h,z],[w+.65,.22,d+.65],'silver',0,null,null,{material:1});
   for(let dz of [-d/2,d/2]){this.box([x,h+1.8,z+dz],[w+.6,.45,.14],edge,0);for(let y of boiler?[h-4,h-4.6]:[h-.2])this.box([x,y,z+dz+Math.sign(dz)*.07],[w,.11,.1],y===h-4?'red':'gold',0);for(let dx=-w/2+1;dx<w/2;dx+=2)this.box([x+dx,3,z+dz+Math.sign(dz)*.08],[.75,.55,.1],'glass',0)}
   for(let dx of [-w/2,w/2])this.box([x+dx,h+1.8,z],[.14,.45,d],edge,0);
   for(let zz=z-d/2+.5;zz<z+d/2;zz+=.9)this.box([x,h+1.68,zz],[w,.035,.05],edge,0);
   if(boiler){for(let dx of [-w*.24,w*.24]){this.box([x+dx,h+2,z],[2.1,.5,d*.8],edge,0);for(let dz=-d*.36;dz<d*.4;dz+=.85)this.box([x+dx,h+2.34,z+dz],[2.6,.13,.35],'silver',0)}for(let y=6;y<h-5;y+=3.2)this.box([x,y,z+d/2+.03],[w,.025,.055],edge,0)}
  });
  bg('Background_Landscape',()=>{this.box([0,1.46,-28],[71,.07,17],[.22,.30,.18,1],0);for(let x=-34;x<=34;x+=4){this.box([x,2.1,-35],[.17,1.2,.17],'rim',0);for(let i=0;i<3;i++)this.box([x,2.7+i*.55,-35],[1.3-i*.2,.85,1.35-i*.2],[.15,.27,.17,1],0)}});
  hall('Boiler_House_2',23,-30.5,14,9.5,33,true);
  hall('Boiler_House_1',27,-19,14,10.5,29,true);
  hall('Coal_Bunker_Hall',11.5,-26.5,8.5,12,19,false);
  hall('Boiler_Annex',18.1,-19,3.4,10.5,15,false);
  hall('Induced_Draft_Fan_House',-27,-7.5,11,7,5.2,false);
  hall('Slurry_Circulation_Pump_House',-22,-20,7,4.2,4,false);
  hall('Air_Compressor_House',-5,-29,13,5,4,false);
  hall('Control_Service_House',7,-32.5,7,4.5,6,false);
  bg('Chimney',()=>{this.cyl([-33,22,-30],[3.8,41,3.8],sheet,0,null,null,{material:1});for(let y of [38,39.2])this.cyl([-33,y,-30],[3.9,.44,3.9],y===38?'gold':'red',0);this.cyl([-33,42.55,-30],[3.25,.12,3.25],'black',0)});
  bg('Absorber_Towers',()=>{for(const [x,z,h] of [[-29,-18,12.5],[-23,-29,10]]){this.cyl([x,1.5+h/2,z],[5.8,h,5.8],sheet,0,null,null,{material:1});this.cyl([x,h+1.6,z],[5.4,.2,5.4],'silver',0);for(let y=4;y<h+1;y+=3)this.cyl([x,y,z],[5.88,.09,5.88],edge,0);this.cyl([x,h+2.3,z],[3.9,1.25,3.9],'silver',0)}});
  // Orthogonal sheet-metal smoke ducts with supported elbows and end flanges.
  const duct=(points,width,height)=>{for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],p=M.scale(M.add(a,b),.5),d=M.sub(b,a),axis=d.findIndex(v=>Math.abs(v)>.01),size=[width,height,width];size[axis]=Math.abs(d[axis])+.12;this.box(p,size,'silver',0,null,null,{material:1});const count=Math.max(1,Math.floor(Math.abs(d[axis])/3));for(let k=0;k<=count;k++){const q=M.add(a,M.scale(d,k/count)),rib=size.map((v,j)=>j===axis?.1:(j===1?height:width)+.16);this.box(q,rib,'rim',0)}}};
  bg('Boiler_to_ESP_Ducts',()=>{for(let z of [-6.25,6.25])duct([[25.7,17.4,z],[35.5,17.4,z]],2,2.2);duct([[35.5,17.4,6.25],[35.5,17.4,-19],[34,17.4,-19]],2,2.2);for(let z of [-10,4]){for(let dx of [-1.25,1.25])this.box([35.5+dx,8.7,z],[.18,14.4,.18],'green',0);this.box([35.5,16.2,z],[2.9,.22,.2],'green',0)}});
  bg('ESP_to_Fan_Ducts',()=>{for(let z of [-6.25,6.25])duct([[-25.7,17.4,z],[-29,17.4,z]],1.65,1.9);duct([[-29,17.4,6.25],[-29,17.4,-6.25],[-29,6.8,-6.25]],1.65,1.9);for(let z of [3.75,-3.75]){for(let dx of [-1.1,1.1])this.box([-29+dx,8.65,z],[.15,14.3,.15],'green',0);this.box([-29,16.25,z],[2.7,.2,.18],'green',0)}});
  bg('ESP_Connection_Assembly_Frames',()=>{for(let side of [-1,1])for(let cz of [-6.25,6.25]){for(let dz of [-1,1])for(let dy of [-1,1])this.beam([side*18.25,17.4+dy*4.75,cz+dz*5.65],[side*25.7,17.4+dy*1.1,cz+dz],.12,'rim',2.4);for(let dz of [-1,1])this.beam([side*25.7,16.3,cz+dz],[side*25.7,18.5,cz+dz],.13,'rim',2.4);for(let dy of [-1,1])this.beam([side*25.7,17.4+dy*1.1,cz-1],[side*25.7,17.4+dy*1.1,cz+1],.13,'rim',2.4)}});
  bg('Fan_Absorber_Chimney_Ducts',()=>{duct([[-28,5,-11],[-28,5,-15.2]],1.7,1.7);duct([[-29,11,-20.8],[-29,11,-30],[-31.1,11,-30]],1.8,1.8);duct([[-23,9,-26.2],[-23,9,-24],[-29,9,-24]],1.4,1.4)});
  bg('Utility_Pipe_Rack',()=>{for(let z of [-23.2,-22.6])this.beam([-17,7.1,z],[14.5,7.1,z],.2,'silver',0);for(let x of [-15,-5,5,14]){this.box([x,4.1,-22.9],[.15,5.2,.15],'green',0);this.box([x,6.9,-22.9],[.15,.15,1.2],'green',0)}});
 }
 esp(){
  const xs=[-18,-10.8,-3.6,3.6,10.8,18],centers=[-14.4,-7.2,0,7.2,14.4];
  for(let ch=0;ch<2;ch++){
   const cz=ch===0?-6.25:6.25;
   xs.forEach((x,ix)=>{for(let z of [cz-5.65,cz+5.65]){
    this.box([x,1.85,z],[1.45,.85,1.35],'cream',1,1);this.box([x,2.34,z],[.85,.12,.75],'rim',1,1);for(let dx of [-.3,.3])for(let dz of [-.25,.25])this.cyl([x+dx,2.45,z+dz],[.09,.19,.09],'silver',1,1);
    this.box([x,7.45,z],[.38,10,.32],'green',1.8+ix*.035,3);this.box([x,17.5,z],[.26,10,.26],'green',2.15+ix*.035,3);for(let y of [5,12.4,16.7,22.5])this.box([x,y,z],[.65,.62,.075],'rim',2.2,3);
   }});
   for(let x of [-18,18])this.beam([x,2.8,cz-5.65],[x,2.8,cz+5.65],.35,'rim',1.35,2);
   for(let y of [5.4,12.3,17.4,22.4]){for(let z of [cz-5.65,cz+5.65])this.beam([-18,y,z],[18,y,z],y===12.3?.35:.24,'green',2,3);for(let x of xs)this.beam([x,y,cz-5.65],[x,y,cz+5.65],.23,'green',2.1,3)}
   for(let ix=0;ix<5;ix++)for(let z of [cz-5.65,cz+5.65]){this.beam([xs[ix],2.5,z],[xs[ix+1],5.4,z],.13,'green',2,3);this.beam([xs[ix],5.4,z],[xs[ix+1],2.5,z],.13,'green',2,3);if(ix%2===0)this.beam([xs[ix],12.4,z],[xs[ix+1],17.4,z],.12,'rim',2.1,3)}
   for(let x of [-18,18])for(let half of [-1,1])this.beam([x,2.4,cz],[x,5.35,cz+half*5.65],.14,'green',2,3);
   for(let x=-16.2;x<18;x+=3.6)for(let y of [12.3,22.4])this.beam([x,y,cz-5.65],[x,y,cz+5.65],.14,'rim',2.3,3);for(let z=cz-4.2;z<cz+5;z+=2.8){if(ch===1&&z>10){this.beam([-18,22.4,z],[-10.8,22.4,z],.13,'rim',4.2,3);this.beam([-10.8,22.4,z],[18,22.4,z],.13,'rim',2.3,3)}else this.beam([-18,22.4,z],[18,22.4,z],.13,'rim',2.3,3)}
   centers.forEach((x,ix)=>{
    for(let row=0;row<4;row++){const z=cz-4.2+row*2.8,phase=ch===0?2.7+ix*.075:(ix<2?2.9+ix*.1:3.85+ix*.025);this.hopper([x,9.3,z],[6.85,6,2.55],phase,4,{unit:true})}
    const phase=ch===0?3.35+ix*.16:3.60+ix*.22;
    for(let side of [-1,1]){const z=cz+side*5.7;this.box([x,17.5,z],[6.95,9.75,.16],'silver',phase,5,null,{material:1});for(let rib=-3.1;rib<=3.1;rib+=.7)this.box([x+rib,17.5,z+side*.12],[.06,9.75,.07],'rim',phase,5);for(let y of [13,16.4,19.8,22.4])this.box([x,y,z+side*.24],[6.95,.15,.12],'rim',phase,5)}
    const roofPhase=ch===1&&ix===0?4.2:phase+.08;this.box([x,22.53,cz],[6.95,.18,11.45],'silver',roofPhase,5,null,{material:1});for(let rib=-3;rib<=3;rib+=.75)this.box([x+rib,22.66,cz],[.08,.05,11.45],'rim',roofPhase,5);
    if(ix<2){this.box([x,15.2,cz+5.87],[1.3,1.9,.16],'rim',phase,5);this.box([x+.42,15.25,cz+6],[.09,.45,.1],'gold',phase,5)}
    for(let z=cz-4;z<=cz+4;z+=2)this.box([x,17.6,z],[6.15,8.4,.05],'silver',4.1,7,null,{material:1});for(let z=cz-3;z<=cz+3;z+=2)this.beam([x,13.5,z],[x,21.7,z],.065,'dark',4.2,8);this.box([x,23.2,cz],[.9,.7,.9],'orange',4.45,9);
   });
   for(let x=-18;x<=18;x+=.45)this.box([x,5.95,cz],[.15,.12,1.35],'rim',3,11);this.beam([-18,5.8,cz-.75],[18,5.8,cz-.75],.16,'green',3,11);this.beam([-18,5.8,cz+.75],[18,5.8,cz+.75],.16,'green',3,11);this.rail([-18,cz-.8],[18,cz-.8],7,'green',3,11);
   const stairX=20.4;for(let i=0;i<14;i++)this.box([stairX,1.65+i*.31,cz-4.5+i*.43],[1.6,.14,.42],'rim',3,11);for(let dx of [-.8,.8]){this.beam([stairX+dx,1.65,cz-4.5],[stairX+dx,5.9,cz+1.1],.14,'green',3,11);this.beam([stairX+dx,2.75,cz-4.5],[stairX+dx,7,cz+1.1],.09,'green',3,11)}
   for(let side of [-1,1]){const x=side*22,phase=side<0?4.2:4.35;this.object('horn',[x,17.4,cz],[9.5,7.5,11.3],'silver',phase,6,[0,0,side*Math.PI/2],{material:1});for(let y of [12.65,22.15])this.beam([side*18.25,y,cz-5.65],[side*18.25,y,cz+5.65],.18,'rim',phase,6);for(let z of [cz-5.65,cz+5.65])this.beam([side*18.25,12.65,z],[side*18.25,22.15,z],.18,'rim',phase,6)}
   for(let x of [-12,0,12]){this.box([x,23.5,cz+2.4],[2,1.5,1.55],'dark',4.6,10);this.box([x,24.4,cz+2.4],[2.2,.2,1.8],'silver',4.6,10);for(let i=-1;i<=1;i++)for(let y=22.8;y<23.2;y+=.16)this.cyl([x+i*.48,y,cz+2.4],[.28,.12,.28],'white',4.6,10)}
   for(let x of [-15,-7.5,0,7.5,15])for(let dz of [-1.2,1.2])this.box([x,24.05,cz+dz],[.13,3,.13],'green',4.75,'COMP-12');this.box([0,25.7,cz],[32,.15,3.4],'silver',4.75,'COMP-12',null,{material:1});this.beam([-15,24.8,cz],[15,24.8,cz],.18,'rim',4.75,'COMP-12');this.box([4,24.4,cz],[1,.55,.7],'gold',4.75,'COMP-12');
   this.beam([-18,12.7,cz+5.95],[18,12.7,cz+5.95],.12,'copper',4.8,12);this.cyl([18,24,cz],[.3,.6,.3],[.2,.95,.55,1],4.95,13,null,{material:3});
  }
 }
 hopper(p,s,phase,id,opts){this.object('hopper',p,s,'hopper',phase,id,null,Object.assign({material:1},opts));for(let u of [0,1,2]){const ratio=1-u*.25,y=p[1]+s[1]/2-u*s[1]*.29,w=s[0]*ratio,d=s[2]*ratio;for(let dz of [-d/2,d/2])this.box([p[0],y,p[2]+dz],[w,.12,.10],'rim',phase,id);for(let dx of [-w/2,w/2])this.box([p[0]+dx,y,p[2]],[.10,.12,d],'rim',phase,id)}this.box([p[0],p[1]-s[1]/2-.25,p[2]],[.55,.5,.48],'rim',phase,id);if(id===4){const coating=[.08,.46,.62,.58],y=p[1]-.15;for(let side of [-1,1])this.box([p[0],y,p[2]+side*(s[2]*.39)],[s[0]*.62,s[1]*.48,.025],coating,4.55,'COMP-09',null,{material:3,noShadow:true})}}
 group(build,animate){const start=this.objects.length;build();for(let i=start;i<this.objects.length;i++)this.objects[i].animate=animate}
 worker(x,z,y,role){y=y||1.55;this.box([x,y+.83,z],[.45,.72,.36],role==='welder'?'blue':'orange',0);this.box([x,y+1.41,z],[.35,.36,.35],[.76,.54,.37,1],0);this.cyl([x,y+1.66,z],[.54,.2,.48],'gold',0);for(let dx of [-.14,.14]){this.box([x+dx,y+.32,z],[.18,.55,.22],'dark',0);this.box([x+dx,y+.08,z+.05],[.2,.15,.35],'black',0)}this.beam([x-.25,y+1.12,z],[x-.5,y+.58,z+.2],.15,'orange',0);this.beam([x+.25,y+1.12,z],[x+.5,y+(role==='signal'?1.7:.60),z+.2],.15,'orange',0);this.box([x,y+.98,z+.19],[.47,.12,.035],'gold',0)}
 crane(x,z,side,cargo){
  for(let dz of [-1.7,1.7]){this.box([x,2.05,z+dz],[6.3,1.05,1.15],'black',0);for(let i=0;i<6;i++)this.cyl([x-2.5+i,2.05,z+dz+(dz>0?.60:-.60)],[.85,.18,.85],'rim',0,null,[Math.PI/2,0,0]);for(let i=0;i<13;i++)this.box([x-3+i*.5,2.65,z+dz],[.20,.12,1.18],'rim',0)}
  this.cyl([x,2.9,z],[3.2,.55,3.2],'rim',0);this.box([x,3.85,z],[4.8,1.7,2.7],'gold',0);this.box([x-side*2,4.8,z],[1.6,2.2,2.7],'gold',0);this.box([x+side*.7,4.4,z+1.55],[1.7,2.1,1.6],'gold',0);this.box([x+side*.7,4.85,z+2.4],[1.3,1,.08],'glass',0);
  const a=[x,4.5,z],tip=[x+side*7.4,41,z],offset=.65,boomStart=this.objects.length;
  for(let dz of [-offset,offset])for(let dx of [-offset,offset])this.beam([a[0]+dx,a[1],z+dz],[tip[0]+dx,tip[1],z+dz],.13,'gold',0);
  for(let i=0;i<17;i++){const t=i/17,t2=(i+1)/17,ax=a[0]+(tip[0]-a[0])*t,ay=a[1]+(tip[1]-a[1])*t,bx=a[0]+(tip[0]-a[0])*t2,by=a[1]+(tip[1]-a[1])*t2;for(let dz of [-offset,offset]){this.beam([ax-offset,ay,z+dz],[bx+offset,by,z+dz],.085,'gold',0);this.beam([ax+offset,ay,z+dz],[bx-offset,by,z+dz],.085,'gold',0)}}
  this.beam([x-side*2,4.8,z],[tip[0],40.5,z],.055,'dark',0);
   const pose=t=>{const offset=cargo==='steel-frame'?0:.46,u=(t/(cargo==='steel-frame'?26000:23000)+offset)%1;const transfer=u<.18?0:u<.38?smooth((u-.18)/.20):u<.64?1:u<.82?1-smooth((u-.64)/.18):0;const lift=u<.18?23*smooth(u/.18):u<.38?23:u<.49?23-8.2*smooth((u-.38)/.11):u<.62?14.8:u<.72?14.8+8.2*smooth((u-.62)/.10):u<.82?23:23*(1-smooth((u-.82)/.18));const px=tip[0]+side*11.2*transfer,pz=z+(cargo==='steel-frame'?1.45:-1.2)*transfer;const reach=Math.max(4,38*38-(px-x)*(px-x)-(pz-z)*(pz-z));return {point:[px,8.5+lift,pz],top:[px,4.5+Math.sqrt(reach),pz]}};
  const boomParts=this.objects.slice(boomStart);boomParts.forEach(o=>{if(!o.endpoints)return;o.dynamic=t=>{const p=pose(t),d=M.sub(p.top,tip);return M.mat4BeamBetween(...o.endpoints.map(v=>M.add(v,M.scale(d,M.clamp((v[1]-4.5)/36.5,0,1)))),o.thickness,o.thickness)}});
  const cable=this.beam(tip,[tip[0],8.5,z],.06,'dark',0);cable.dynamic=t=>{const p=pose(t);return M.mat4BeamBetween(p.top,p.point,.06,.06)};
  this.group(()=>{this.box([tip[0],8.2,z],[.5,.7,.4],'black',0);for(let dx of [-1.1,1.1])this.beam([tip[0],7.9,z],[tip[0]+dx,6.5,z],.055,'dark',0);const start=this.objects.length;
   if(cargo==='steel-frame'){for(let dz of [-.38,.38]){for(let y of [5,6.5])this.beam([tip[0]-1.6,y,z+dz],[tip[0]+1.6,y,z+dz],.15,'green',0);for(let i=0;i<4;i++){const a=tip[0]-1.6+i*.8;this.beam([a,5,z+dz],[a,6.5,z+dz],.12,'green',0);this.beam([a,5,z+dz],[a+.8,6.5,z+dz],.095,'green',0)}this.beam([tip[0]+1.6,5,z+dz],[tip[0]+1.6,6.5,z+dz],.12,'green',0)}for(let dx of [-1.6,0,1.6])this.beam([tip[0]+dx,6.5,z-.38],[tip[0]+dx,6.5,z+.38],.12,'green',0);
   }else{this.box([tip[0],6.12,z],[4.1,.56,.12],'green',0);for(let y of [5.84,6.4])this.box([tip[0],y,z],[4.1,.10,.65],'green',0);for(let dx of [-2.05,2.05])this.box([tip[0]+dx,6.12,z],[.09,.7,.75],'rim',0)}
   this.objects.slice(start).forEach(o=>o.cargoKind=cargo);
  },t=>M.sub(pose(t).point,[tip[0],8.5,z]));
  this.paths.push({name:cargo+' crane landing lane',min:[tip[0]-3.5,3,z-1.4],max:[tip[0]+(cargo==='steel-frame'?13.3:3.5),43,z+2.6]});
 }
 machinery(){
  this.crane(-33,9,1,'steel-frame');this.crane(33,-3,-1,'steel-beam');
   this.group(()=>{this.box([0,2.65,21],[8,1,2.8],'blue',0);this.box([3,3.65,21],[2,2.2,2.6],'orange',0);this.box([3.95,4,21],[.12,.9,2.2],'glass',0);for(let x of [-2.8,0,3])for(let z of [19.7,22.3])this.cyl([x,2.20,z],[1.15,.4,1.15],'black',0,null,[Math.PI/2,0,0]);for(let z of [20.4,21.3])this.beam([-3,3.4,z],[1.8,3.4,z],.24,'green',0)},t=>{const u=(t/22000)%1,x=u<.46?-28+56*smooth(u/.46):u<.58?28:28-56*smooth((u-.58)/.42);return[x,0,0]});
  this.paths.push({name:'flatbed front lane',min:[-32,1.5,19.5],max:[32,5,22.5]});
   this.group(()=>{this.box([-32,2.6,-.5],[3.2,1.5,1.8],'gold',0);this.box([-32.5,3.7,-.5],[1.7,1.4,1.4],'black',0);for(let z of [-1.3,.3])for(let x of [-33,-31])this.cyl([x,2,z],[.7,.22,.7],'black',0,null,[Math.PI/2,0,0]);for(let z of [-1.1,.1]){this.box([-30.3,3.1,z],[.16,3,.12],'rim',0);this.box([-29.5,1.9,z],[1.8,.13,.17],'rim',0)}},t=>[0,0,3*Math.sin(t/4200)]);
  this.paths.push({name:'forklift material lane',min:[-34,1.5,-3.8],max:[-28.5,5,2.8]});
  const x=22.5,z=11.6,rise=t=>3+4*(.5+.5*Math.sin(t/8000));this.box([x,2.1,z],[2.4,1,2.2],'orange',0);
  for(let dz of [-.8,.8])for(let k=0;k<3;k++)for(let sign of [-1,1]){const o=this.beam([x-sign,2.6+k,z+dz],[x+sign,3.6+k,z+dz],.10,'rim',0);o.dynamic=t=>M.mat4BeamBetween([x-sign,2.6+k*rise(t)/3,z+dz],[x+sign,2.6+(k+1)*rise(t)/3,z+dz],.10,.1)}
  this.group(()=>{this.box([x,5.6,z],[2.7,.2,2.4],'blue',0);this.rail([x-1.2,z-1],[x+1.2,z-1],6.8,'gold',0);this.rail([x-1.2,z+1],[x+1.2,z+1],6.8,'gold',0);this.worker(x,z,5.7,'welder')},t=>[0,rise(t)-3,0]);
 }
 details(){
  for(let x of [-13,-3]){this.box([x,3.2,-18],[8.8,3.5,5.7],'cream',0);this.box([x,5.12,-18],[9.3,.25,6.2],'blue',0);for(let dx of [-2.8,0,2.8])this.box([x+dx,3.65,-15.10],[1.5,1.25,.08],'glass',0);this.box([x-3,2.7,-15.04],[1.1,2.5,.12],'blue',0)}
  for(let x of [-10,-2])for(let z of [15.5,18.1])this.box([x,3.6,z],[.15,4.3,.15],'rim',0);for(let x=-10.5;x<=-1.5;x+=.6)this.box([x,5.8,16.8],[.59,.14,4],Math.round(x/.6)%2?'blue':'white',0,null,[0,0,.035]);
  for(let i=0;i<7;i++)this.beam([-10,1.8+i*.25,16],[-3,1.8+i*.25,16],.18,'green',0);for(let x=3;x<14;x+=2)this.box([x,1.95,16.4],[1.8,.7,2.7],'silver',0);this.hopper([-24,3.4,16],[4.2,3,2.5],0,null,{stored:true});
  for(let x of [17,19,21]){this.cyl([x,2.3,17],[1.4,.8,1.4],'dark',0,null,[Math.PI/2,0,0]);this.cyl([x,2.3,17.5],[1.7,.12,1.7],'cream',0,null,[Math.PI/2,0,0])}for(let x of [-20,24]){this.box([x,2.4,3],[1.1,1.7,.7],'blue',0);this.box([x,3.34,3],[1.3,.18,.85],'silver',0)}
  for(let x=-17;x<=17;x+=4)this.worker(x,14.9,1.5,x===-17?'signal':'worker');this.worker(-28,12.8,1.5,'signal');this.worker(27,6,1.5,'signal');this.worker(-14,-14,1.5,'worker');this.worker(-5,14.7,1.5,'welder');
  for(let dx of [-.55,.55])this.beam([-19,3.2,15],[-19+dx,1.5,15.4],.085,'gold',0);this.box([-19,3.4,15],[.8,.5,.5],'gold',0);for(let x of [-13,-12.2])this.cyl([x,2.5,14.5],[.42,1.9,.42],x===-13?'blue':'red',0);
  for(let x=-30;x<=-21;x+=3){this.box([x,2.25,12.5],[.10,1.5,.1],'rim',0);this.box([x+1.4,2.8,12.5],[2.8,.16,.1],Math.round(x/3)%2?'red':'white',0)}
  for(let x of [-42,42])for(let z of [-20,-12,-4,4,12,24]){this.box([x,2.15,z],[.2,1.5,.2],[.24,.15,.06,1],0);for(let i=0;i<3;i++)this.box([x+(i%2)*.3,3+i*.45,z],[1.4-i*.25,.9,1.5-i*.25],[.13+i*.015,.29+i*.025,.13,1],0)}
 }
 setDisplayStage(index){this.displayStage=M.clamp(Math.round(Number(index)||1),1,13)}
 applyProgress(records,displayStage,displayGhosts){if(Number.isFinite(Number(displayStage)))this.setDisplayStage(displayStage);if(typeof displayGhosts==='boolean')this.displayGhosts=displayGhosts;for(const id of Object.keys(records||{})){if(!this.components[id]||!Number.isFinite(records[id])||records[id]<0||records[id]>100)throw Error('无效的部件进度：'+id)}for(const id of Object.keys(records||{})){const parts=this.objects.filter(o=>o.componentId===id).sort((a,b)=>a.phase-b.phase);parts.forEach((o,i)=>{o.overrideVisible=i<Math.round(parts.length*records[id]/100);o.progressGhost=!o.overrideVisible})}}
 clearProgress(){this.displayGhosts=false;this.objects.forEach(o=>{delete o.overrideVisible;delete o.progressGhost})}
 componentStatus(c,phase){const parts=this.objects.filter(o=>o.componentId===c.id),count=parts.filter(o=>o.overrideVisible===undefined?o.phase<=phase:o.overrideVisible).length,progress=parts.length?Math.round(count/parts.length*100):0;return {key:progress===100?'done':progress?'working':'waiting',label:progress===100?'已安装':progress?'安装中':'未安装',progress}}
 getComponent(id,phase){const c=this.components[id];if(!c)return null;const s=this.componentStatus(c,phase);return Object.assign({},c,{status:s.label,statusKey:s.key,progress:s.progress})}
 visibleBatches(phase,statusMode,time,isolateId,options){
  const opt=options||{},b={box:[],prism:[],hopper:[],horn:[]};this.phase=phase;this.currentObjects=[];
  for(const o of this.objects){if(isolateId&&o.componentId!==isolateId)continue;const componentIndex=o.componentId?Number(o.componentId.slice(-2)):0;if(componentIndex>this.displayStage)continue;const installed=o.overrideVisible===undefined?phase>=o.phase:o.overrideVisible,ghost=!!(this.displayGhosts&&o.progressGhost&&!installed);const target=installed||ghost?1:0;if(o.alpha===undefined)o.alpha=target;else o.alpha+=(target-o.alpha)*.18;if(o.alpha<.5)continue;
   const matrix=o.dynamic?o.dynamic(time):o.animate?move(o.matrix,o.animate(time)):o.matrix;
   let color=ghost?[.34,.47,.54,1]:o.color;if(statusMode&&o.componentId)color=installed?[.13,.58,.37,1]:[.46,.55,.60,1];
   // Mobile WebGL drivers render large dithered transparency batches as a field
   // of dots. Progress previews therefore stay fully opaque and use colour only.
   b[o.mesh].push({matrix,color,material:o.material,opacity:1,selected:opt.selected===o.componentId&&!!o.componentId,noShadow:o.noShadow});this.currentObjects.push({object:o,matrix});
  }if(!isolateId)this.particles(b,time,opt);return b;
 }
 particles(b,time,opt){const t=(opt.fxTime===undefined?time:opt.fxTime)/1000,limit=this.quality==='low'?25:100,push=(p,size,c,mat)=>b.box.push({matrix:M.mat4TRS(p,[0,0,0],size),color:c,material:mat,noShadow:true});
  if(opt.rain)for(let i=0;i<limit*2;i++){const x=((i*17.731)%88)-44,z=((i*7.171)%52)-27,y=2+((i*1.79-t*13)%34+34)%34;push([x,y,z],[.035,.75,.035],[.4,.55,.6,1],3)}
  if(opt.dust&&!opt.rain)for(let i=0;i<Math.floor(limit*opt.dust*.4);i++){const u=(t*.15+i*.073)%1;push([-12+i%7*.55+u*2,2+u*4,15.2+Math.sin(i+u)*.7],[.12,.12,.12],[.62,.61,.56,1],0)}
  if(!opt.rain&&Math.sin(t*3.1)>.4)for(let i=0;i<16;i++){const u=(t*2+i*.071)%1;push([-5+Math.cos(i)*u*.55,2.35+Math.sin(i)*u*.6,14.3+u*.35],[.06,.06,.06],i%2?[.55,.83,1,1]:[1,.75,.31,1],3)}
 }
 pick(origin,direction){let best=null,nearest=Infinity;for(const entry of this.currentObjects||[]){const o=entry.object;if(!o.componentId)continue;let lo=0,hi=Infinity;const c=[entry.matrix[12],entry.matrix[13],entry.matrix[14]];for(let j=0;j<3;j++){const extent=(Math.abs(entry.matrix[j])+Math.abs(entry.matrix[j+4])+Math.abs(entry.matrix[j+8]))*.5,a=c[j]-extent,b=c[j]+extent;if(Math.abs(direction[j])<1e-8){if(origin[j]<a||origin[j]>b){hi=-1;break}}else{const t1=(a-origin[j])/direction[j],t2=(b-origin[j])/direction[j];lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2))}}if(hi>=lo&&lo<nearest){nearest=lo;best=o.componentId}}return best}
}
Scene.NAMES=NAMES;module.exports=Scene
