
const REGION_COLORS={
 '아르케아 중앙대륙':'#a66f45',
 '실바리온 수림권':'#4f8966',
 '카르딘 산맥권':'#6e7686',
 '세라칸 대초원':'#b49349',
 '네레이아 해권':'#377f91',
 '솔라크 사막권':'#b98a49',
 '드라바스 화산군도':'#9e4b39',
 '루메라 부유제도':'#725d91'
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class CivitasWorldMap{
 constructor({overlay,canvas,detail,legend,status,getState,data,onClose}){
  this.overlay=overlay;this.canvas=canvas;this.ctx=canvas.getContext('2d');
  this.detail=detail;this.legend=legend;this.status=status;this.getState=getState;this.data=data;this.onClose=onClose;
  this.mode='current';this.scale=1;this.ox=0;this.oy=0;this.pointerMap=new Map();this.lastPair=null;this.lastSingle=null;this.moved=false;
  this.cityById=new Map(data.cities.map(c=>[c.id,c]));
  this.regionStats=this.buildRegionStats();
  this.bind();
  this.renderLegend();
 }
 buildRegionStats(){
  const m=new Map();
  for(const r of this.data.regions){
   const cs=this.data.cities.filter(c=>c.region===r.name);
   const xs=cs.map(c=>c.x),ys=cs.map(c=>c.y);
   m.set(r.name,{
    ...r,
    centerX:xs.reduce((a,b)=>a+b,0)/xs.length,
    centerY:ys.reduce((a,b)=>a+b,0)/ys.length,
    minX:Math.min(...xs),maxX:Math.max(...xs),
    minY:Math.min(...ys),maxY:Math.max(...ys),
   })
  }
  return m
 }
 bind(){
  this.overlay.querySelector('#closeWorldMap').onclick=()=>this.close();
  this.overlay.querySelector('#mapModeCurrent').onclick=()=>{this.mode='current';this.updateModeButtons();this.draw()};
  this.overlay.querySelector('#mapMode200').onclick=()=>{this.mode='future';this.updateModeButtons();this.draw()};
  this.overlay.querySelector('#mapZoomIn').onclick=()=>{this.scale=clamp(this.scale*1.18,.72,4);this.draw()};
  this.overlay.querySelector('#mapZoomOut').onclick=()=>{this.scale=clamp(this.scale/1.18,.72,4);this.draw()};
  this.overlay.querySelector('#mapReset').onclick=()=>{this.scale=1;this.ox=0;this.oy=0;this.draw()};
  this.canvas.addEventListener('pointerdown',e=>this.pDown(e),{passive:false});
  this.canvas.addEventListener('pointermove',e=>this.pMove(e),{passive:false});
  this.canvas.addEventListener('pointerup',e=>this.pUp(e),{passive:false});
  this.canvas.addEventListener('pointercancel',e=>this.pCancel(e),{passive:false});
  this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.scale=clamp(this.scale*Math.exp(-e.deltaY*.001),.72,4);this.draw()},{passive:false});
  window.addEventListener('resize',()=>this.resize(),{passive:true});
 }
 updateModeButtons(){
  this.overlay.querySelector('#mapModeCurrent').classList.toggle('active',this.mode==='current');
  this.overlay.querySelector('#mapMode200').classList.toggle('active',this.mode==='future');
 }
 open(){
  this.overlay.classList.remove('hidden');this.resize();this.updateModeButtons();this.draw();
 }
 close(){this.overlay.classList.add('hidden');this.onClose?.()}
 resize(){
  const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);
  const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}
  this.draw()
 }
 pDown(e){
  e.preventDefault();e.stopPropagation();try{this.canvas.setPointerCapture(e.pointerId)}catch{}
  this.pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});this.moved=false;
  if(this.pointerMap.size===1)this.lastSingle={x:e.clientX,y:e.clientY};
  if(this.pointerMap.size===2){const p=[...this.pointerMap.values()];this.lastPair={cx:(p[0].x+p[1].x)/2,cy:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}}
 }
 pMove(e){
  if(!this.pointerMap.has(e.pointerId))return;e.preventDefault();e.stopPropagation();
  this.pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(this.pointerMap.size===1){
   const p=[...this.pointerMap.values()][0];
   if(this.lastSingle){const dx=p.x-this.lastSingle.x,dy=p.y-this.lastSingle.y;this.ox+=dx;this.oy+=dy;if(Math.abs(dx)+Math.abs(dy)>2)this.moved=true}
   this.lastSingle=p;this.draw()
  }else if(this.pointerMap.size>=2){
   const p=[...this.pointerMap.values()].slice(0,2),cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2,d=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));
   if(this.lastPair){
    this.ox+=cx-this.lastPair.cx;this.oy+=cy-this.lastPair.cy;
    this.scale=clamp(this.scale*(d/Math.max(1,this.lastPair.d)),.72,4);this.moved=true
   }
   this.lastPair={cx,cy,d};this.draw()
  }
 }
 pUp(e){
  e.preventDefault();e.stopPropagation();
  if(!this.moved)this.pickAt(e.clientX,e.clientY);
  this.pointerMap.delete(e.pointerId);this.lastSingle=this.pointerMap.size===1?[...this.pointerMap.values()][0]:null;this.lastPair=null
 }
 pCancel(e){this.pointerMap.delete(e.pointerId);this.lastSingle=null;this.lastPair=null}
 baseTransform(){
  const w=this.canvas.width,h=this.canvas.height,pad=30*(Math.min(devicePixelRatio||1,1.5));
  const minX=80,maxX=970,minY=20,maxY=760,base=Math.min((w-pad*2)/(maxX-minX),(h-pad*2)/(maxY-minY));
  return{w,h,pad,minX,maxX,minY,maxY,base}
 }
 screen(x,y){
  const t=this.baseTransform(),s=t.base*this.scale;
  const cx=t.w/2+this.ox*(this.canvas.width/Math.max(1,this.canvas.clientWidth));
  const cy=t.h/2+this.oy*(this.canvas.height/Math.max(1,this.canvas.clientHeight));
  const mapCx=(t.minX+t.maxX)/2,mapCy=(t.minY+t.maxY)/2;
  return{x:cx+(x-mapCx)*s,y:cy+(y-mapCy)*s,s}
 }
 mapPoint(screenX,screenY){
  const rect=this.canvas.getBoundingClientRect(),dpr=this.canvas.width/Math.max(1,rect.width);
  const sx=(screenX-rect.left)*dpr,sy=(screenY-rect.top)*dpr,t=this.baseTransform(),s=t.base*this.scale;
  const cx=t.w/2+this.ox*dpr,cy=t.h/2+this.oy*dpr,mapCx=(t.minX+t.maxX)/2,mapCy=(t.minY+t.maxY)/2;
  return{x:(sx-cx)/s+mapCx,y:(sy-cy)/s+mapCy}
 }
 renderLegend(){
  this.legend.innerHTML=this.data.regions.map(r=>`<button data-region="${r.name}"><i style="background:${REGION_COLORS[r.name]}"></i><span>${r.name}</span><b>${r.cities}</b></button>`).join('');
  this.legend.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>this.showRegion(b.dataset.region))
 }
 showRegion(name){
  const r=this.regionStats.get(name),st=this.getState(),known=st.world.knownRegions.includes(name);
  const founded=this.data.cities.filter(c=>c.region===name&&st.world.foundedCities.includes(c.id)).length;
  this.detail.innerHTML=`<b>${name}</b><span>${r.desc}</span><p>${r.issue}</p><div><em>${known?'관측됨':'미탐사'}</em><em>200년 도시 ${r.cities}</em><em>현재 확인 거점 ${founded}</em></div>`
 }
 showCity(city){
  const st=this.getState(),founded=st.world.foundedCities.includes(city.id);
  this.detail.innerHTML=`<b>${city.name}</b><span>${city.country}</span><p>${city.region}</p><div><em>${city.id}</em><em>${founded?'현재 세계에 형성됨':'세계력 200년 기준 좌표'}</em></div>`
 }
 pickAt(x,y){
  const p=this.mapPoint(x,y),st=this.getState(),allowed=this.mode==='future'?this.data.cities:this.data.cities.filter(c=>st.world.foundedCities.includes(c.id));
  let best=null,bd=Infinity;
  for(const c of allowed){const d=Math.hypot(c.x-p.x,c.y-p.y);if(d<bd){bd=d;best=c}}
  if(best&&bd<18/this.scale){this.showCity(best);return}
  let br=null,brd=Infinity;
  for(const r of this.regionStats.values()){const d=Math.hypot(r.centerX-p.x,r.centerY-p.y);if(d<brd){brd=d;br=r}}
  if(br)this.showRegion(br.name)
 }
 draw(){
  if(this.overlay.classList.contains('hidden'))return;
  const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,st=this.getState();
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#08131a';ctx.fillRect(0,0,w,h);
  const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'rgba(78,112,125,.18)');grad.addColorStop(1,'rgba(8,19,26,.02)');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);

  // region silhouettes from canonical city coordinate clusters
  for(const r of this.regionStats.values()){
   const known=st.world.knownRegions.includes(r.name),future=this.mode==='future';
   const c=this.screen(r.centerX,r.centerY),rx=Math.max(36,(r.maxX-r.minX)*c.s*.68),ry=Math.max(28,(r.maxY-r.minY)*c.s*.72);
   ctx.save();ctx.globalAlpha=future?(known?.88:.72):(known?.88:.14);ctx.fillStyle=REGION_COLORS[r.name]||'#667';
   ctx.beginPath();ctx.ellipse(c.x,c.y,rx,ry,0,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle=known?'rgba(255,235,180,.42)':'rgba(255,255,255,.08)';ctx.lineWidth=known?2:1;ctx.stroke();ctx.restore();
   if((future||known)&&this.scale>.82){
    ctx.fillStyle=known?'rgba(255,246,220,.86)':'rgba(225,230,230,.48)';ctx.font=`${Math.max(9,11*this.scale)}px -apple-system,sans-serif`;ctx.textAlign='center';ctx.fillText(r.name,c.x,c.y-ry-7)
   }
  }

  // routes made by current civilization
  for(const route of st.world.routes||[]){
   const a=this.cityById.get(route.from),b=this.cityById.get(route.to);if(!a||!b)continue;
   const A=this.screen(a.x,a.y),B=this.screen(b.x,b.y);ctx.save();ctx.strokeStyle=route.kind==='sea'?'#77c7de':'#e8c788';ctx.lineWidth=2.5;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.restore()
  }

  // city points
  const cityList=this.mode==='future'?this.data.cities:this.data.cities.filter(c=>st.world.foundedCities.includes(c.id));
  for(const cty of cityList){
   const p=this.screen(cty.x,cty.y),start=cty.id===this.data.meta.startCityId,founded=st.world.foundedCities.includes(cty.id);
   ctx.beginPath();ctx.fillStyle=start?'#ffe17b':founded?'#f4e5c3':'rgba(236,239,235,.62)';ctx.arc(p.x,p.y,start?6:Math.max(2,2.3*this.scale),0,Math.PI*2);ctx.fill();
   if(start){ctx.strokeStyle='#ffbe4b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.stroke()}
   if((start||this.scale>2.0)&&this.mode==='future'){ctx.fillStyle='#f5ebd5';ctx.font=`${Math.max(8,9*this.scale)}px -apple-system,sans-serif`;ctx.textAlign='left';ctx.fillText(start?'라엔 분지':cty.name,p.x+8,p.y-5)}
  }

  // locked/unknown regions in current mode
  if(this.mode==='current'){
   for(const r of this.regionStats.values()){
    if(st.world.knownRegions.includes(r.name))continue;const p=this.screen(r.centerX,r.centerY);
    ctx.fillStyle='rgba(255,255,255,.22)';ctx.font=`bold ${Math.max(14,18*this.scale)}px -apple-system,sans-serif`;ctx.textAlign='center';ctx.fillText('?',p.x,p.y+6)
   }
  }

  if(st.year>=55){
   ctx.save();ctx.strokeStyle='rgba(213,78,70,.32)';ctx.lineWidth=4;
   for(const r of this.regionStats.values()){if(!st.world.knownRegions.includes(r.name))continue;const p=this.screen(r.centerX,r.centerY);ctx.beginPath();ctx.arc(p.x,p.y,18+Math.sin(performance.now()*.003)*3,0,Math.PI*2);ctx.stroke()}
   ctx.restore()
  }
  this.renderStatus()
 }
 renderStatus(){
  const st=this.getState(),w=st.world,known=w.knownRegions.length,founded=w.foundedCities.length;
  const tech=Object.entries(w.seaTech).map(([k,v])=>`${v.label} ${v.open?'✓':Math.floor(v.p)+'%'}`).join(' · ');
  this.status.innerHTML=`<b>세계력 ${st.year}년 ${st.day}일 · ${this.mode==='future'?'200년 기준 데이터':'현재 관측 지도'}</b><span>세계 인구 ${st.worldPopulation} · 관측 권역 ${known}/8 · 형성 거점 ${founded}/126</span><small>초기 분포: 아르케아 핵심 30 · 타 권역 270(세부 분포 미확인)<br>육상 탐사 ${Math.floor(w.landProgress)} · 해상 원정 ${Math.floor(w.seaProgress)} · ${tech}</small>`
 }
}
