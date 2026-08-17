
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
const PLANET_CIRCUMFERENCE_KM=40075,PLANET_HEIGHT_KM=20037.5;
function worldDistanceKm(a,b){
 let dx=Math.abs(a.x-b.x);dx=Math.min(dx,1000-dx);
 const dy=Math.abs(a.y-b.y);
 return Math.hypot(dx/1000*PLANET_CIRCUMFERENCE_KM,dy/800*PLANET_HEIGHT_KM)
}

const GEO_STYLE={
 '아르케아 중앙대륙':{land:'#8b8054',edge:'#b9aa6d',kind:'continent'},
 '실바리온 수림권':{land:'#416c4d',edge:'#6f9a6d',kind:'forest'},
 '카르딘 산맥권':{land:'#6f756e',edge:'#a6aaa1',kind:'mountain'},
 '세라칸 대초원':{land:'#9d9353',edge:'#c3b772',kind:'steppe'},
 '네레이아 해권':{land:'#638d88',edge:'#9ec3bb',kind:'islands'},
 '솔라크 사막권':{land:'#b99555',edge:'#d2b776',kind:'desert'},
 '드라바스 화산군도':{land:'#75463d',edge:'#b26b52',kind:'volcanic'},
 '루메라 부유제도':{land:'#766987',edge:'#a99bc0',kind:'islands'}
};
function hash01(text){
 let h=2166136261>>>0;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}
 return(h%100000)/100000
}
function countryColor(name,a=1){const h=Math.floor(hash01(name)*330);return `hsla(${h},48%,62%,${a})`}
function convexHull(points){
 if(points.length<=3)return points.slice();
 const pts=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
 const lo=[];for(const p of pts){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
 const hi=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(hi.length>=2&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p)}
 lo.pop();hi.pop();return lo.concat(hi)
}
function irregularRegionPolygon(region,cities){
 const hull=convexHull(cities.map(c=>({x:c.x,y:c.y})));
 const stat=this?.regionStats?.get?.(region);
 const cx=stat?.centerX??cities.reduce((s,c)=>s+c.x,0)/cities.length;
 const cy=stat?.centerY??cities.reduce((s,c)=>s+c.y,0)/cities.length;
 const style=GEO_STYLE[region]||{kind:'continent'};
 const expand=style.kind==='mountain'?34:style.kind==='forest'?40:style.kind==='desert'?42:style.kind==='steppe'?44:38;
 const out=[];
 for(let i=0;i<hull.length;i++){
   const p=hull[i],dx=p.x-cx,dy=p.y-cy,len=Math.hypot(dx,dy)||1;
   const jitter=(hash01(region+'-'+i)-.5)*18;
   out.push({x:p.x+dx/len*(expand+jitter),y:p.y+dy/len*(expand+jitter)});
   const n=hull[(i+1)%hull.length],mx=(p.x+n.x)/2,my=(p.y+n.y)/2,mdx=mx-cx,mdy=my-cy,ml=Math.hypot(mdx,mdy)||1;
   const midJ=(hash01(region+'-mid-'+i)-.5)*26;
   out.push({x:mx+mdx/ml*(expand+midJ),y:my+mdy/ml*(expand+midJ)});
 }
 return out
}
function drawSmoothPolygon(ctx,points,screenFn){
 if(!points.length)return;
 const ps=points.map(p=>screenFn(p.x,p.y));
 ctx.beginPath();
 const first=ps[0],last=ps[ps.length-1];
 ctx.moveTo((last.x+first.x)/2,(last.y+first.y)/2);
 for(let i=0;i<ps.length;i++){
   const p=ps[i],n=ps[(i+1)%ps.length];
   ctx.quadraticCurveTo(p.x,p.y,(p.x+n.x)/2,(p.y+n.y)/2)
 }
 ctx.closePath()
}
function drawWaveField(ctx,w,h,scale){
 ctx.save();ctx.globalAlpha=.14;ctx.strokeStyle='#7bb2c4';ctx.lineWidth=1;
 const gap=Math.max(34,58*scale);
 for(let y=24;y<h;y+=gap){
   ctx.beginPath();
   for(let x=0;x<w;x+=26){
     const yy=y+Math.sin(x*.018+y*.011)*3.2;
     if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy)
   }
   ctx.stroke()
 }
 ctx.restore()
}
function drawMountain(ctx,x,y,s,hot=false){
 ctx.save();
 ctx.fillStyle=hot?'#5e332d':'#5a605e';ctx.strokeStyle=hot?'#c66f4d':'#a8aaa3';ctx.lineWidth=Math.max(1,s*.12);
 ctx.beginPath();ctx.moveTo(x-s,y+s*.65);ctx.lineTo(x,y-s);ctx.lineTo(x+s,y+s*.65);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle=hot?'#d67d54':'#d6d9d3';ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x-s*.28,y-s*.28);ctx.lineTo(x+s*.18,y-s*.1);ctx.lineTo(x+s*.34,y-s*.28);ctx.closePath();ctx.fill();
 if(hot){ctx.strokeStyle='rgba(231,103,57,.8)';ctx.beginPath();ctx.moveTo(x,y-s*.15);ctx.lineTo(x+s*.22,y+s*.42);ctx.stroke()}
 ctx.restore()
}
function drawTree(ctx,x,y,s){
 ctx.save();ctx.fillStyle='#263f30';ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x-s*.72,y+s*.45);ctx.lineTo(x+s*.72,y+s*.45);ctx.closePath();ctx.fill();
 ctx.fillStyle='#385b40';ctx.beginPath();ctx.moveTo(x,y-s*.55);ctx.lineTo(x-s*.58,y+s*.6);ctx.lineTo(x+s*.58,y+s*.6);ctx.closePath();ctx.fill();ctx.restore()
}
function drawDune(ctx,x,y,s){
 ctx.save();ctx.strokeStyle='rgba(238,207,138,.65)';ctx.lineWidth=Math.max(1,s*.14);ctx.beginPath();ctx.arc(x,y,s,Math.PI,Math.PI*2);ctx.stroke();ctx.restore()
}
function drawLake(ctx,screenFn,x,y,rx,ry){
 const p=screenFn(x,y),p2=screenFn(x+rx,y+ry),sx=Math.abs(p2.x-p.x),sy=Math.abs(p2.y-p.y);
 ctx.save();ctx.fillStyle='#3f7f93';ctx.strokeStyle='#8fc0c9';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(p.x,p.y,Math.max(4,sx),Math.max(3,sy),-.2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore()
}


export class CivitasWorldMap{
 constructor({overlay,canvas,detail,legend,status,countryList,getState,data,onClose,onOpenRegion,onTravelCountry,onTravelCity,onTravelRegion}){
  this.overlay=overlay;this.canvas=canvas;this.ctx=canvas.getContext('2d');
  this.detail=detail;this.legend=legend;this.status=status;this.countryList=countryList;this.getState=getState;this.data=data;this.onClose=onClose;this.onOpenRegion=onOpenRegion;this.onTravelCountry=onTravelCountry;this.onTravelCity=onTravelCity;this.onTravelRegion=onTravelRegion;
  this.mode='current';this.scale=1;this.ox=0;this.oy=0;this.countryPage=0;this.selectedCountry=null;this.pointerMap=new Map();this.lastPair=null;this.lastSingle=null;this.moved=false;
  this.cityById=new Map(data.cities.map(c=>[c.id,c]));
  this.regionStats=this.buildRegionStats();
  this.regionPolygons=new Map();
  for(const r of this.data.regions){
   const cities=this.data.cities.filter(c=>c.region===r.name);
   this.regionPolygons.set(r.name,irregularRegionPolygon.call(this,r.name,cities))
  }
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
 focusExpedition(expId){
  const st=this.getState(),exp=(st.world.expeditions||[]).find(e=>e.id===expId);if(!exp)return;
  const a=this.cityById.get(exp.from),b=this.cityById.get(exp.to);if(!a||!b)return;
  const p=clamp(exp.progress||0,0,1),mx=a.x+(b.x-a.x)*p,my=a.y+(b.y-a.y)*p;
  this.scale=2.0;const t=this.baseTransform(),dpr=this.canvas.width/Math.max(1,this.canvas.clientWidth),s=t.base*this.scale,mapCx=(t.minX+t.maxX)/2,mapCy=(t.minY+t.maxY)/2;
  this.ox=-(mx-mapCx)*s/dpr;this.oy=-(my-mapCy)*s/dpr;this.draw()
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
  this.legend.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{const n=b.dataset.region;this.close();this.onTravelRegion?.(n)})
 }
 bindRegionOpen(name){
  const b=this.detail.querySelector('[data-open-region]');
  if(b)b.onclick=()=>{this.close();this.onOpenRegion?.(name)}
 }
 bindObserverTravel(){
  const rc=this.detail.querySelector('[data-travel-country]');
  if(rc)rc.onclick=()=>{const n=rc.dataset.travelCountry;this.close();this.onTravelCountry?.(n)}
  const city=this.detail.querySelector('[data-travel-city]');
  if(city)city.onclick=()=>{const id=city.dataset.travelCity,c=this.cityById.get(id);this.close();if(c)this.onTravelCity?.(c)}
  const reg=this.detail.querySelector('[data-travel-region]');
  if(reg)reg.onclick=()=>{const n=reg.dataset.travelRegion;this.close();this.onTravelRegion?.(n)}
 }

 controllerOf(city){const st=this.getState();return st.world.cityControl?.[city.id]||city.country}
 controlledCities(name){return this.data.cities.filter(c=>this.controllerOf(c)===name)}
 activeCountries(){const st=this.getState();return Object.entries(st.world.countries||{}).filter(([n,c])=>c&&c.active!==false)}
 personById(id){return (this.getState().worldPeople||[]).find(p=>p.id===id)||null}
 renderPersonGenealogy(id,returnCountry){
  const st=this.getState(),p=(st.worldPeople||[]).find(x=>x.id===id);if(!p)return;const byId=x=>(st.worldPeople||[]).find(q=>q.id===x),parents=(p.parents||[]).map(byId).filter(Boolean),partner=byId(p.partnerId),children=(st.worldPeople||[]).filter(x=>(x.parents||[]).includes(p.id)),grand=(st.worldPeople||[]).filter(x=>children.some(c=>(x.parents||[]).includes(c.id)));
  this.detail.innerHTML=`<b>🌳 ${p.n}의 가계</b><span>${p.a}세 · ${p.j} · ${p.c}</span><p>가문 ${p.lineage||p.f||'-'} · 출생국 ${p.birthCountry||p.c}</p><div><em>부모 ${parents.map(x=>x.n).join(' · ')||'기록 없음'}</em><em>짝 ${partner?.n||'없음/기록 없음'}</em><em>자녀 ${children.length}명</em><em>손자녀 ${grand.length}명</em></div><div class="genealogy-list">${parents.map(x=>`<span>↑ ${x.n} (${x.a}세)</span>`).join('')}${partner?`<span>♥ ${partner.n} (${partner.a}세)</span>`:''}${children.map(x=>`<span>↓ ${x.n} (${x.a}세 · ${x.j})</span>`).join('')}${grand.slice(0,12).map(x=>`<span>↳ ${x.n} (${x.a}세)</span>`).join('')}</div><button class="genealogy-back" data-back-country="${returnCountry}">← ${returnCountry} 주민 명부</button>`;this.detail.querySelector('[data-back-country]')?.addEventListener('click',()=>this.renderCountryDetail(returnCountry,0))
 }
 showRegion(name){
  const r=this.regionStats.get(name),st=this.getState(),known=st.world.knownRegions.includes(name);
  const founded=this.data.cities.filter(c=>c.region===name&&st.world.foundedCities.includes(c.id)).length;
  const pop=this.activeCountries().filter(([n,c])=>c.region===name).reduce((s,[n,c])=>s+c.population,0);
  const start=this.cityById.get(this.data.meta.startCityId),center={x:r.centerX,y:r.centerY},km=Math.round(worldDistanceKm(start,center));
  this.detail.innerHTML=`<b>${name}</b><span>${r.desc}</span><p>${r.issue}</p><div><em>라엔 기준 약 ${km.toLocaleString()}km</em><em>도보 ${Math.ceil(km/30)}일+</em><em>관찰자 인구 ${pop}</em><em>${known?'주민 접촉 완료':'주민 미접촉'}</em><em>200년 도시 ${r.cities}</em><em>현재 거점 ${founded}</em></div><span class="observer-travel-note">👁 관찰자 이동은 주민 원정과 별개입니다. 즉시 이동해도 이 지역 주민들이 감나무뜰을 알게 되지는 않습니다.</span><button class="observer-travel-btn" data-travel-region="${name}">👁 ${name}으로 관찰 이동</button><button class="region-map-open" data-open-region>🏔 지역 전체 지도 열기</button>`;this.bindRegionOpen(name);this.bindObserverTravel()
 }
 showCity(city){
  const st=this.getState(),founded=st.world.foundedCities.includes(city.id),start=this.cityById.get(this.data.meta.startCityId);
  const km=Math.round(worldDistanceKm(start,city)),walk=Math.ceil(km/30),sail=Math.ceil(km/110);
  const owner=this.controllerOf(city),changed=owner!==city.country;
  this.detail.innerHTML=`<b>${city.name}</b><span>현재 ${owner}${changed?` · 원래 ${city.country}`:''}</span><p>${city.region}</p><div><em>${city.id}</em><em>라엔 기준 약 ${km.toLocaleString()}km</em><em>도보 단순환산 ${walk}일</em><em>항해 단순환산 ${sail}일</em><em>${founded?'현재 세계에 형성됨':'세계력 200년 기준 좌표'}</em>${changed?'<em>⚑ 영토 변경</em>':''}</div><span class="observer-travel-note">라엔 주민들의 여행시간과 무관하게 관찰자만 즉시 현지로 이동합니다.</span><button class="observer-travel-btn" data-travel-city="${city.id}">👁 ${city.name}에 직접 서보기</button><button class="region-map-open" data-open-region>🗺 ${city.region} 전체 지도</button>`;this.bindRegionOpen(city.region);this.bindObserverTravel()
 }

 pointInPolygon(p,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   const hit=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-9)+a.x);
   if(hit)inside=!inside
  }
  return inside
 }
 regionAtPoint(p){
  // Continents/land regions use the same irregular polygons drawn on the map.
  for(const r of this.data.regions){
   const style=GEO_STYLE[r.name]||{};
   if(style.kind==='islands'||style.kind==='volcanic')continue;
   const poly=this.regionPolygons.get(r.name)||[];
   if(poly.length>=3&&this.pointInPolygon(p,poly))return r.name
  }
  // Island/volcanic regions: use distance to their canonical city-island anchors.
  let best=null,bd=Infinity;
  for(const r of this.data.regions){
   const cities=this.data.cities.filter(c=>c.region===r.name);
   for(const c of cities){
    const d=Math.hypot(c.x-p.x,c.y-p.y);
    if(d<bd){bd=d;best=r.name}
   }
  }
  return bd<55/Math.max(.75,this.scale)?best:null
 }

 pickAt(x,y){
  const p=this.mapPoint(x,y);

  // Observer can use all 126 canonical city anchors regardless of resident contact.
  let best=null,bd=Infinity;
  for(const c of this.data.cities){const d=Math.hypot(c.x-p.x,c.y-p.y);if(d<bd){bd=d;best=c}}
  if(best&&bd<16/Math.max(.8,this.scale)){
   this.close();this.onTravelCity?.(best);return
  }

  const region=this.regionAtPoint(p);
  if(region){
   this.close();this.onTravelRegion?.(region);return
  }

  // Ocean tap: show nearest region info instead of teleporting accidentally.
  let br=null,brd=Infinity;
  for(const r of this.regionStats.values()){const d=Math.hypot(r.centerX-p.x,r.centerY-p.y);if(d<brd){brd=d;br=r}}
  if(br)this.showRegion(br.name)
 }
 draw(){
  if(this.overlay.classList.contains('hidden'))return;
  const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,st=this.getState();
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#08131a';ctx.fillRect(0,0,w,h);
  const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'rgba(78,112,125,.18)');grad.addColorStop(1,'rgba(8,19,26,.02)');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);

  // Ocean first: this is a geographic map, not a region bubble chart.
  drawWaveField(ctx,w,h,Math.max(.7,this.scale));

  // Irregular landmasses / archipelagos derived from canonical city clusters.
  for(const r of this.regionStats.values()){
   const known=st.world.knownRegions.includes(r.name),style=GEO_STYLE[r.name]||GEO_STYLE['아르케아 중앙대륙'];
   const cities=this.data.cities.filter(c=>c.region===r.name);
   ctx.save();
   if(style.kind==='islands'||style.kind==='volcanic'){
     // Island regions are rendered as multiple real islands, not one circular mass.
     const clusters=[];
     const ordered=[...cities].sort((a,b)=>a.x-b.x||a.y-b.y);
     const count=style.kind==='volcanic'?Math.min(8,ordered.length):Math.min(7,ordered.length);
     for(let i=0;i<count;i++){
       const c=ordered[Math.floor(i*ordered.length/count)];
       const p=this.screen(c.x,c.y),rad=(style.kind==='volcanic'?18:16)*(0.72+hash01(r.name+i)*.55)*this.scale;
       ctx.fillStyle=style.land;ctx.strokeStyle=style.edge;ctx.lineWidth=1.6;ctx.globalAlpha=.94;
       ctx.beginPath();
       const steps=9;
       for(let j=0;j<steps;j++){
         const a=j/steps*Math.PI*2,rr=rad*(.72+hash01(r.name+i+'-'+j)*.42);
         const xx=p.x+Math.cos(a)*rr,yy=p.y+Math.sin(a)*rr*.68;
         if(j===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)
       }
       ctx.closePath();ctx.fill();ctx.stroke()
     }
   }else{
     const poly=this.regionPolygons.get(r.name)||[];
     drawSmoothPolygon(ctx,poly,(x,y)=>this.screen(x,y));
     ctx.fillStyle=style.land;ctx.strokeStyle=style.edge;ctx.lineWidth=2;ctx.globalAlpha=.96;ctx.fill();ctx.stroke()
   }
   ctx.restore();

   // Biome-specific terrain.
   const c=this.screen(r.centerX,r.centerY),spanX=Math.max(40,(r.maxX-r.minX)*c.s),spanY=Math.max(32,(r.maxY-r.minY)*c.s);
   if(style.kind==='forest'){
     for(let i=0;i<22;i++){const x=c.x+(hash01(r.name+'fx'+i)-.5)*spanX*.85,y=c.y+(hash01(r.name+'fy'+i)-.5)*spanY*.78;drawTree(ctx,x,y,4.5+hash01(i+'f')*3.5)}
   }else if(style.kind==='mountain'){
     for(let i=0;i<15;i++){const t=(i+1)/16,x=c.x-spanX*.4+t*spanX*.8,y=c.y+Math.sin(i*.8)*spanY*.17+(hash01('my'+i)-.5)*spanY*.12;drawMountain(ctx,x,y,6+hash01('ms'+i)*5,false)}
   }else if(style.kind==='desert'){
     for(let i=0;i<14;i++){const x=c.x+(hash01('dx'+i)-.5)*spanX*.8,y=c.y+(hash01('dy'+i)-.5)*spanY*.72;drawDune(ctx,x,y,7+hash01('ds'+i)*5)}
   }else if(style.kind==='volcanic'){
     for(let i=0;i<5;i++){const city=cities[Math.floor(i*cities.length/5)]||cities[0],p=this.screen(city.x,city.y);drawMountain(ctx,p.x,p.y,7+hash01('vs'+i)*4,true)}
   }else if(style.kind==='steppe'){
     // A large inland lake and open-grass dots.
     drawLake(ctx,(x,y)=>this.screen(x,y),r.centerX+28,r.centerY-18,18,10);
     ctx.save();ctx.fillStyle='rgba(215,202,115,.42)';for(let i=0;i<24;i++){const x=c.x+(hash01('sx'+i)-.5)*spanX*.88,y=c.y+(hash01('sy'+i)-.5)*spanY*.78;ctx.fillRect(x,y,1.5,4)}ctx.restore()
   }else if(r.name==='아르케아 중앙대륙'){
     // Arkea river system + small lake.
     ctx.save();ctx.strokeStyle='#4f91a7';ctx.lineWidth=Math.max(2,3*this.scale);ctx.lineCap='round';
     const a=this.screen(r.centerX-76,r.centerY-68),b=this.screen(r.centerX-18,r.centerY-18),d=this.screen(r.centerX+82,r.centerY+62);
     ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(a.x+35,a.y+20,b.x-22,b.y-15,b.x,b.y);ctx.bezierCurveTo(b.x+35,b.y+18,d.x-38,d.y-20,d.x,d.y);ctx.stroke();
     const e=this.screen(r.centerX+4,r.centerY-70),f=this.screen(r.centerX+16,r.centerY-14);ctx.lineWidth=Math.max(1.4,2*this.scale);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.quadraticCurveTo(e.x+18,e.y+24,f.x,f.y);ctx.stroke();ctx.restore();
     drawLake(ctx,(x,y)=>this.screen(x,y),r.centerX-42,r.centerY+40,12,8)
   }
   if(r.name==='네레이아 해권'){
     // Reinforce sea identity with light shoals around islands.
     ctx.save();ctx.strokeStyle='rgba(125,196,211,.28)';ctx.lineWidth=1;
     for(let i=0;i<7;i++){const ct=cities[Math.floor(i*cities.length/7)]||cities[0],p=this.screen(ct.x,ct.y);ctx.beginPath();ctx.arc(p.x,p.y,12+hash01('reef'+i)*12,0,Math.PI*2);ctx.stroke()}ctx.restore()
   }

   if(this.scale>.82){
    ctx.fillStyle=known?'rgba(255,246,220,.92)':'rgba(220,232,231,.76)';
    ctx.font=`${Math.max(9,11*this.scale)}px -apple-system,sans-serif`;ctx.textAlign='center';
    ctx.fillText(r.name,c.x,c.y-spanY*.55-9)
   }
  }

  // Major ocean labels make the water read as water.
  ctx.save();ctx.fillStyle='rgba(126,177,194,.34)';ctx.font=`italic ${Math.max(10,13*this.scale)}px -apple-system,sans-serif`;ctx.textAlign='center';
  const oceanLabels=[
    [500,520,'네레이아 대양'],
    [150,510,'서방해'],
    [860,500,'동방해'],
    [780,90,'북부 고해']
  ];
  for(const [x,y,label] of oceanLabels){const p=this.screen(x,y);ctx.fillText(label,p.x,p.y)}
  ctx.restore();

  // routes made by current civilization
  for(const route of st.world.routes||[]){
   const a=this.cityById.get(route.from),b=this.cityById.get(route.to);if(!a||!b)continue;
   const A=this.screen(a.x,a.y),B=this.screen(b.x,b.y);ctx.save();ctx.strokeStyle=route.kind==='sea'?'#77c7de':'#e8c788';ctx.lineWidth=2.5;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.restore()
  }

  // Observer-visible war fronts
  for(const war of (st.world.wars||[]).filter(w=>w.active)){
   const cs=this.controlledCities(war.country),start=this.cityById.get(this.data.meta.startCityId);if(!cs.length||!start)continue;
   const target=cs[Math.floor(cs.length/2)],A=this.screen(start.x,start.y),B=this.screen(target.x,target.y);
   ctx.save();ctx.strokeStyle='rgba(229,77,63,.9)';ctx.lineWidth=4;ctx.setLineDash([10,6]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.restore()
  }
  for(const war of (st.world.externalWars||[]).filter(w=>w.active)){
   const ac=this.controlledCities(war.a),bc=this.controlledCities(war.b);if(!ac.length||!bc.length)continue;
   const A=this.screen(ac[0].x,ac[0].y),B=this.screen(bc[0].x,bc[0].y);ctx.save();ctx.strokeStyle='rgba(213,98,80,.62)';ctx.lineWidth=2.5;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.restore()
  }

  // Active expeditions move across the observer world map by real travel time.
  for(const exp of (st.world.expeditions||[]).filter(e=>e.active)){
   const a=this.cityById.get(exp.from),b=this.cityById.get(exp.to);if(!a||!b)continue;
   const A=this.screen(a.x,a.y),B=this.screen(b.x,b.y),p=clamp(exp.progress||0,0,1);
   const x=A.x+(B.x-A.x)*p,y=A.y+(B.y-A.y)*p;
   const tracked=st.world.trackedExpeditionId===exp.id,personId=tracked?st.world.trackedExpeditionPersonId:null,person=(st.residents||[]).find(r=>r.id===personId),names=(exp.memberIds||[]).map(id=>(st.residents||[]).find(r=>r.id===id)?.name).filter(Boolean);
   ctx.save();ctx.fillStyle=exp.kind==='sea'?'#78d2e5':'#f0ce7b';ctx.strokeStyle=tracked?'#fff0a8':'rgba(0,0,0,.45)';ctx.lineWidth=tracked?4:2;
   ctx.beginPath();ctx.arc(x,y,tracked?9:6,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.fillStyle='#f3e7c8';ctx.font=tracked?'bold 10px -apple-system,sans-serif':'9px -apple-system,sans-serif';ctx.textAlign='left';
   ctx.fillText(tracked?`👁 ${person?.name||names.join('·')||'원정대'} · ${exp.phase==='return'?'귀환':'이동'} ${Math.round((exp.phase==='return'?1-p:p)*100)}%`:`${Math.round(p*100)}%`,x+12,y+3);ctx.restore()
  }

  // Current political territory: connect each active polity's controlled city anchors.
  for(const [name,c] of this.activeCountries()){
   const cs=this.controlledCities(name);if(cs.length<2)continue;const cap=this.cityById.get(c.capitalId)||cs[0],A=this.screen(cap.x,cap.y);ctx.save();ctx.strokeStyle=countryColor(name,.22);ctx.lineWidth=Math.max(1,1.3*this.scale);
   for(const city of cs){if(city.id===cap.id)continue;const B=this.screen(city.x,city.y);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()}ctx.restore()
  }
  // city points
  const cityList=this.mode==='future'?this.data.cities:this.data.cities.filter(c=>st.world.foundedCities.includes(c.id));
  for(const cty of cityList){
   const p=this.screen(cty.x,cty.y),start=cty.id===this.data.meta.startCityId,founded=st.world.foundedCities.includes(cty.id);
   const owner=this.controllerOf(cty),changed=owner!==cty.country;
   ctx.beginPath();ctx.fillStyle=start?'#ffe17b':founded?'#f4e5c3':'rgba(236,239,235,.62)';ctx.arc(p.x,p.y,start?6:Math.max(2,2.3*this.scale),0,Math.PI*2);ctx.fill();
   ctx.strokeStyle=countryColor(owner,.92);ctx.lineWidth=changed?3:1.4;ctx.beginPath();ctx.arc(p.x,p.y,start?9:Math.max(4,4.2*this.scale),0,Math.PI*2);ctx.stroke();
   if(start){ctx.strokeStyle='#ffbe4b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.stroke()}
   if((start||this.scale>2.0)&&this.mode==='future'){ctx.fillStyle='#f5ebd5';ctx.font=`${Math.max(8,9*this.scale)}px -apple-system,sans-serif`;ctx.textAlign='left';ctx.fillText(start?'라엔 분지':cty.name,p.x+8,p.y-5)}
  }

  // Observer mode: no information fog. Contact status remains separate from visibility.

  if(st.year>=55){
   ctx.save();ctx.strokeStyle='rgba(213,78,70,.32)';ctx.lineWidth=4;
   for(const r of this.regionStats.values()){if(!st.world.knownRegions.includes(r.name))continue;const p=this.screen(r.centerX,r.centerY);ctx.beginPath();ctx.arc(p.x,p.y,18+Math.sin(performance.now()*.003)*3,0,Math.PI*2);ctx.stroke()}
   ctx.restore()
  }
  this.renderStatus()
 }
 renderCountryDetail(name,page=0){
  const st=this.getState(),c=st.world.countries[name];if(!c)return;
  const people=(st.worldPeople||[]).filter(p=>p.alive!==0&&p.c===name).sort((a,b)=>b.a-a.a||a.n.localeCompare(b.n));
  const per=20,pages=Math.max(1,Math.ceil(people.length/per));page=clamp(page,0,pages-1);this.countryPage=page;this.selectedCountry=name;
  const rows=people.slice(page*per,page*per+per);
  const hist=(c.history||[]).slice(-12),maxP=Math.max(1,...hist.map(h=>h[1]));
  const bars=hist.length?`<div class="country-growth-bars">${hist.map(h=>`<i title="${h[0]}년 ${h[1]}명" style="height:${Math.max(8,h[1]/maxP*100)}%"></i>`).join('')}</div>`:'<small>아직 연간 성장 기록 없음</small>';
  const delta=(c.population||0)-(c.lastPopulation||c.population||0),known=(c.knownCountries||[name]).length,leader=this.personById(c.politics?.leaderId),territory=this.controlledCities(name),families=new Set(people.map(p=>p.lineage||p.f)).size;
  const events=(c.events||[]).slice(0,5).map(e=>`<li>${e.y}년 · ${e.t}</li>`).join('');
  this.detail.innerHTML=`<b>${name}</b><span>${c.region} · ${c.stage||'소집단'} · ${c.active===false?'역사국가':'현존'}</span>
   <p>👁 관찰자 현재 인구 <strong>${c.population.toLocaleString()}명</strong> · 전년 대비 ${delta>=0?'+':''}${delta} · 영토 ${territory.length}도시 · 정착 ${c.settlements||0}</p>
   <div><em>정체 ${c.politics?.form||'-'}</em><em>지도자 ${leader?leader.n+' '+leader.a+'세':'공석'}</em><em>정통성 ${Math.round(c.politics?.legitimacy||0)}</em><em>정치불안 ${Math.round(c.politics?.unrest||0)}</em><em>가문 ${families}</em></div>
   <div><em>출생 ${c.births||0}</em><em>사망 ${c.deaths||0}</em><em>아이 ${c.children||0}</em><em>성인 ${c.adults||0}</em><em>노인 ${c.elders||0}</em><em>가구 ${c.households||0}</em></div>
   <div><em>식량 ${Math.round(c.food||0)}</em><em>기술 ${Math.round(c.tech||0)}</em><em>기반 ${Math.round(c.infrastructure||0)}</em><em>군사 ${Math.round(c.military||0)}</em><em>안정 ${Math.round(c.stability||0)}</em><em>탐사 ${Math.round(c.exploration||0)}</em></div><div><em>군 동원 ${c.army?.mobilized||0}</em><em>보급 ${Math.round(c.army?.supply||0)}</em><em>난민 유입 ${c.refugeesIn||0}</em><em>난민 유출 ${c.refugeesOut||0}</em><em>교역로 ${(c.tradeRoutes||[]).filter(t=>t.active).length}</em><em>조약 ${(c.treaties||[]).filter(t=>t.active).length}</em></div><div><em>사슴 ${c.ecology?.deer||0}</em><em>토끼 ${c.ecology?.rabbit||0}</em><em>멧돼지 ${c.ecology?.boar||0}</em><em>늑대 ${c.ecology?.wolf||0}</em><em>숲 ${Math.round(c.ecology?.forest||0)}</em><em>생태압 ${Math.round(c.ecology?.pressure||0)}</em></div>
   <p>이 나라가 알고 있는 다른 세력: ${known}/30 · 관찰자는 접촉 여부와 무관하게 전부 볼 수 있음.</p>
   ${bars}
   ${events?`<ul class="country-event-list">${events}</ul>`:''}
   ${(c.causal||[]).length?`<div class="country-causal">${(c.causal||[]).slice(0,5).map(x=>`<div><b>${x.y}년 ${x.d||''}일</b> ${x.cause} → ${x.effect}</div>`).join('')}</div>`:''}
   <div class="census-head"><b>상세 추적 주민 표본 ${people.length}명</b><span>${page+1}/${pages}쪽</span></div>
   <div class="country-census">${rows.map(p=>{const mate=this.personById(p.partnerId),parents=(p.parents||[]).map(id=>this.personById(id)?.n).filter(Boolean);return`<div><b>${p.id===c.politics?.leaderId?'★ ':''}${p.n}</b><span>${p.g==='F'?'여':'남'} · ${p.a}세 · ${p.j}</span><small>${p.ct} · ${p.f}${mate?' · ♥ '+mate.n:''}${parents.length?' · 부모 '+parents.join('/') :''}</small><button class="genealogy-btn" data-genealogy="${p.id}">가계</button></div>`}).join('')}</div>
   <div class="census-page"><button data-census-prev ${page<=0?'disabled':''}>‹ 이전</button><button data-census-next ${page>=pages-1?'disabled':''}>다음 ›</button></div>
   <span class="observer-travel-note">👁 너는 관찰자라서 이 나라가 감나무뜰과 미접촉이어도 직접 갈 수 있습니다. 이 이동은 외교/첫 접촉 판정에 영향을 주지 않습니다.</span>
   <button class="observer-travel-btn" data-travel-country="${name}">👁 ${name}으로 관찰 이동</button>
   <button class="region-map-open" data-open-region>🗺 ${c.region} 전체 지도</button>`;
  this.detail.querySelector('[data-census-prev]')?.addEventListener('click',()=>this.renderCountryDetail(name,page-1));
  this.detail.querySelector('[data-census-next]')?.addEventListener('click',()=>this.renderCountryDetail(name,page+1));
  this.detail.querySelectorAll('[data-genealogy]').forEach(b=>b.addEventListener('click',()=>this.renderPersonGenealogy(b.dataset.genealogy,name)));
  this.bindRegionOpen(c.region);this.bindObserverTravel()
 }
 renderCountries(){
  if(!this.countryList)return;const st=this.getState(),wars=st.world.wars||[],external=st.world.externalWars||[];
  this.countryList.innerHTML=this.activeCountries().sort((a,b)=>b[1].population-a[1].population).map(([n,c])=>{
   const contact=(st.world.contactedCountries||[]).includes(n),war=wars.some(w=>w.active&&w.country===n)||external.some(w=>w.active&&(w.a===n||w.b===n)),lead=this.personById(c.politics?.leaderId);
   const delta=(c.population||0)-(c.lastPopulation||c.population||0),arrow=delta>0?'▲':delta<0?'▼':'─';
   return `<button data-country="${n}"><b>${war?'⚔ ':''}${n}</b><span>${c.population.toLocaleString()}명 ${arrow}${Math.abs(delta).toLocaleString()}</span><small>${c.politics?.form||'-'} · ${lead?.n||'공석'} · 영토 ${this.controlledCities(n).length} · 불안 ${Math.round(c.politics?.unrest||0)} · ${contact?'라엔 접촉':'라엔 미접촉'}</small></button>`
  }).join('');
  this.countryList.querySelectorAll('[data-country]').forEach(b=>b.onclick=()=>this.renderCountryDetail(b.dataset.country,0))
 }
 renderStatus(){
  const st=this.getState(),w=st.world,known=w.knownRegions.length,founded=w.foundedCities.length;
  const tech=Object.entries(w.seaTech).map(([k,v])=>`${v.label} ${v.open?'✓':Math.floor(v.p)+'%'}`).join(' · ');
  const active=(w.expeditions||[]).filter(e=>e.active);
  const ex=active.length?active.map(e=>{const ns=(e.memberIds||[]).map(id=>(st.residents||[]).find(r=>r.id===id)?.name).filter(Boolean);const end=e.phase==='return'?e.returnArrivalAbsDay:e.arrivalAbsDay;return `<span class="expedition-pill">${e.kind==='sea'?'⛵':'🐎'} ${e.region} · ${e.phase==='return'?'귀환':'이동'} · ${Math.max(0,(end||0)-(st.year*365+st.day))}일 · ${ns.join('·')||'원정대'}</span>`}).join(''):'<span class="expedition-pill">진행 중 장거리 원정 없음</span>';
  const activeN=this.activeCountries().length,deadN=Object.values(w.countries||{}).filter(c=>c.active===false).length,seasonNow=st.climate?.season||'';
  this.status.innerHTML=`<b>세계력 ${st.year}년 ${st.day}일 · ${seasonNow} ${st.weather||''} · ${this.mode==='future'?'200년 기준 데이터':'관찰자 현재 세계'}</b><span>🌐 둘레 40,075km · 👁 실제 사람 ${(st.worldPeople||[]).filter(p=>p.alive!==0).length}명 · 현존국 ${activeN} · 소멸/통합국 ${deadN} · 세계 인구 ${st.worldPopulation} · 주민 실제 접촉국 ${(w.contactedCountries||[]).length} · 접촉 권역 ${known}/8 · 형성 거점 ${founded}/126</span><small>초기 총인구 300: 아르케아 핵심 30 · 타 권역 270. 도보는 30km/일, 기승 48km/일, 항해 110km/일 기준이며 지형·준비 시간이 추가됩니다.<br>육상 탐사 ${Math.floor(w.landProgress)} · 해상 원정 ${Math.floor(w.seaProgress)} · ${tech}</small>${ex}`;
  this.renderCountries()
 }
}
