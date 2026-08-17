import * as THREE from 'three';
import { StateMachine } from './state-machine.js';
import { CombatRules, PlayerStates, MonsterStates } from './combat-rules.js';
import { CivitasWorldMap } from './world-map.js?v=8.3';
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
const KEY='civilization_genesis_living_ai_v1';
const RESOURCE_META={food:['식량','🌾'],water:['물','💧'],wood:['나무','🪵'],stone:['돌','🪨'],labor:['노동','🧺']};
const JOB_SKILL={'생활경영자':'기록','농지운영자':'농업','씨앗선별자':'농업','수로구조사':'목공','공동부엌지기':'요리','동물돌봄이':'사육','도공':'도공','농부':'농업','목수':'목공','요리사':'요리','약초사':'약초','사육사':'사육','기록자':'기록','채집가':'채집'};
const LOC={center:new THREE.Vector3(0,0,0),field:new THREE.Vector3(-18,0,12),river:new THREE.Vector3(30,0,12),forest:new THREE.Vector3(-35,0,-24),stone:new THREE.Vector3(33,0,-23),workshop:new THREE.Vector3(10,0,-13),herbs:new THREE.Vector3(-7,0,28),pen:new THREE.Vector3(20,0,25),meeting:new THREE.Vector3(0,0,-4)};
const RESIDENT_SEED = await fetch('./seed_residents.json')
  .then(r=>{if(!r.ok)throw new Error(`seed_residents.json load failed: ${r.status}`);return r.json()});
const OFFICIAL_LOCAL_CATALOG = await fetch('./residents.json')
  .then(r=>{if(!r.ok)throw new Error(`residents.json load failed: ${r.status}`);return r.json()});
const MONSTER_CATALOG = await fetch('./monsters.json')
  .then(r=>{if(!r.ok)throw new Error(`monsters.json load failed: ${r.status}`);return r.json()});
const WORLD_DATA = await fetch('./world.json?v=8.3')
  .then(r=>{if(!r.ok)throw new Error(`world.json load failed: ${r.status}`);return r.json()});
const WORLD_CITY_BY_ID=new Map(WORLD_DATA.cities.map(c=>[c.id,c]));
const OFFICIAL_BY_ID=new Map(OFFICIAL_LOCAL_CATALOG.map(c=>[c.id,c]));
function officialBirthDay(id){let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))>>>0;return 45+(h%275)}
function skillsFromOfficial(c){
 const s={농업:12,목공:12,요리:12,약초:12,사육:12,기록:12,채집:18,도공:12,경계:12,직조:12};
 const f=(c.field||'')+' '+(c.job||'');const boost=(k,v)=>s[k]=Math.max(s[k],v);
 if(/농업|씨앗|농지|토양/.test(f)){boost('농업',62);boost('채집',38)}
 if(/건축|목공|수로|도구|석공/.test(f)){boost('목공',64);boost('채집',34)}
 if(/식품|부엌|요리|급식/.test(f)){boost('요리',66);boost('농업',28)}
 if(/의료|약초|회복/.test(f)){boost('약초',61);boost('기록',30)}
 if(/사육|생명|동물/.test(f)){boost('사육',62);boost('채집',35)}
 if(/교육|기록|행정|법|경영/.test(f))boost('기록',65);
 if(/금속|조형|도공|가마/.test(f)){boost('도공',62);boost('목공',30)}
 if(/보호|탐사|경계|길잡이/.test(f)){boost('경계',62);boost('채집',55)}
 if(/직조|의복/.test(f))boost('직조',65);
 return s
}
function residentLifeStage(age){return age<5?'유아':age<12?'아이':age<16?'견습기':'성인'}
function scaledStartingSkills(c,age){
 const s=skillsFromOfficial(c),factor=age<5?.06:age<12?.20:age<16?.48:1;
 for(const k of Object.keys(s))s[k]=Math.max(2,Math.round(s[k]*factor));
 return s
}
function officialResident(c,year){
 const age=Math.max(0,year-c.birth),stage=residentLifeStage(age),currentJob=age<12?'아이':age<16?'견습생':c.job;
 return initResidentBrain({id:c.id,name:c.name,age,gender:c.gender,family:c.family,generation:c.generation,lifeStage:stage,
 job:currentJob,careerSeed:c.job,originJob:c.job,field:c.field,potential:c.potential,potentialGrade:c.grade,bloom:c.bloom,growthType:c.growth,
 value:c.value,fear:c.fear,flaw:c.flaw,hiddenTrait:c.hidden,surfaceTrait:c.surface,trueDesire:c.desire,habit:c.habit,speech:c.speech,
 stressResponse:c.stress,affectionStyle:c.affection,achievementSeed:c.achievement,changeArc:c.change,
 personality:JSON.parse(JSON.stringify(c.p)),relationsSeed:[],skills:scaledStartingSkills(c,age),note:c.surface,color:0x677a63})
}

const MYEONGJA_DEATH_YEAR=3,MYEONGJA_DEATH_DAY=1;
function isMyeongjaDeathTime(year=state?.year??0,day=state?.day??1){
 return year>MYEONGJA_DEATH_YEAR||(year===MYEONGJA_DEATH_YEAR&&day>=MYEONGJA_DEATH_DAY)
}

function officialEligible(c,year,day){
 if(c.id==='C0001')return !isMyeongjaDeathTime(year,day);
 if(c.birth>=0)return year>c.birth||(year===c.birth&&day>=officialBirthDay(c.id));
 return c.intro<=year
}
function initialOfficialResidents(year=0,day=1){return OFFICIAL_LOCAL_CATALOG.filter(c=>officialEligible(c,year,day)).map(c=>officialResident(c,year))}

const ACTION_META={
 eat:{icon:'🍲',label:'식사'},rest:{icon:'💤',label:'휴식'},socialize:{icon:'💬',label:'대화'},help:{icon:'🤝',label:'도움'},
 forage:{icon:'🌿',label:'채집'},water:{icon:'💧',label:'물 긷기'},wood:{icon:'🪵',label:'나무 채집'},stone:{icon:'🪨',label:'돌 채집'},
 farm:{icon:'🌱',label:'밭 돌보기'},cook:{icon:'🥣',label:'공동 취사'},animals:{icon:'🐾',label:'동물 돌봄'},waterwork:{icon:'🛠',label:'물길 점검'},
 pottery:{icon:'🏺',label:'그릇 만들기'},record:{icon:'✍️',label:'기록'},explore:{icon:'🧭',label:'탐색'},build:{icon:'🔨',label:'건축 돕기'},learn:{icon:'👀',label:'배우기'}
};
function initResidentBrain(r){
 const p=r.personality||{openness:50,conscientiousness:50,extraversion:50,agreeableness:50,stability:50};
 r.needs??={
   hunger:clamp(24+(100-p.conscientiousness)*.08+rand(-5,5),5,70),
   fatigue:clamp(20+(100-p.stability)*.10+rand(-5,5),5,70),
   social:clamp(30+(100-p.extraversion)*.12+rand(-6,6),5,80),
   safety:clamp(20+(100-p.stability)*.18+rand(-5,5),5,85),
   curiosity:clamp(28+p.openness*.18+rand(-5,5),5,85),
   achievement:clamp(24+p.conscientiousness*.18+rand(-5,5),5,85)
 };
 r.memories??=[];
 r.relationships??={};
 for(const rel of (r.relationsSeed||[])){
   r.relationships[rel.target]??={trust:58,affinity:52,respect:55,tension:0,type:rel.type,note:rel.note};
 }
 r.brain??={action:'learn',thought:'주변을 살피고 있다.',reason:'아직 하루의 우선순위를 정하는 중이다.',goal:'오늘을 무사히 보내기',alternatives:[],decisionCount:0,lastDecisionDay:-1};
 r.brain.goal??='오늘을 무사히 보내기';
 r.actionHistory??={};r.recentActions??=[];r.skillXP??={};r.roleConfidence??=35;r.lastRoleChangeDay??=-999;r.lastStoryDay??=-999;
 r.lifeStage??=residentLifeStage(r.age||0);r.careerSeed??=r.originJob||r.job;
 r.health??={hp:100,maxHp:100,woundedUntil:-1};r.health.hp??=100;r.health.maxHp??=100;r.health.woundedUntil??=-1;
 return r
}
function currentAge(r){return r.age}
function memoryAdd(r,type,text,importance=40,person=null){
 r.memories??=[];
 const last=r.memories[0];
 if(last&&last.text===text&&last.time===stamp())return;
 r.memories.unshift({type,text,importance:Math.round(importance),person,time:stamp()});
 r.memories=r.memories.sort((a,b)=>b.importance-a.importance).slice(0,16);
}
function relState(a,bid){
 a.relationships??={};
 return a.relationships[bid]??=( {trust:50,affinity:50,respect:50,tension:0,type:'이웃'} );
}
function relationChange(a,b,delta=2,kind='trust'){
 if(!a||!b)return;
 const ar=relState(a,b.id),br=relState(b,a.id);
 ar[kind]=clamp((ar[kind]??50)+delta,0,100);br[kind]=clamp((br[kind]??50)+delta*.8,0,100);
}



const COUNTRY_META=(()=>{
 const m={};
 for(const c of WORLD_DATA.cities){
  m[c.country]??={name:c.country,region:c.region,cities:0};
  m[c.country].cities++
 }
 return m
})();
function stableHash01(text){
 let h=2166136261>>>0;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}
 return(h%100000)/100000
}
function distributeInteger(total,names,weightFn,minEach=0){
 const out={};if(!names.length)return out;
 let remaining=total-minEach*names.length;for(const n of names)out[n]=minEach;
 remaining=Math.max(0,remaining);
 const weights=names.map(n=>Math.max(.001,weightFn(n))),sum=weights.reduce((a,b)=>a+b,0);
 const raw=names.map((n,i)=>({n,v:remaining*weights[i]/sum}));
 let used=0;for(const r of raw){const v=Math.floor(r.v);out[r.n]+=v;used+=v}
 raw.sort((a,b)=>(b.v-Math.floor(b.v))-(a.v-Math.floor(a.v)));
 for(let i=0;i<remaining-used;i++)out[raw[i%raw.length].n]++;
 return out
}
function initialCountryState(){
 const all=Object.keys(COUNTRY_META),arkea=all.filter(n=>COUNTRY_META[n].region==='아르케아 중앙대륙'),other=all.filter(n=>COUNTRY_META[n].region!=='아르케아 중앙대륙');
 const localN=initialOfficialResidents(0,1).length;
 const out={};
 // Arkea core 30: the starting Erdan/Laen group contains the actual visible local residents.
 const arkeaOthers=arkea.filter(n=>n!=='에르단 왕국');
 const rest=Math.max(0,30-localN);
 const arkeaDist=distributeInteger(rest,arkeaOthers,n=>COUNTRY_META[n].cities,arkeaOthers.length?1:0);
 for(const n of arkea)out[n]=n==='에르단 왕국'?localN:(arkeaDist[n]||0);
 // Keep exact 30 if rounding/minimum pushed above/below.
 let aSum=arkea.reduce((s,n)=>s+out[n],0);
 while(aSum>30){const n=arkeaOthers.sort((a,b)=>out[b]-out[a])[0];if(!n||out[n]<=0)break;out[n]--;aSum--}
 while(aSum<30){const n=arkeaOthers.sort((a,b)=>COUNTRY_META[b].cities-COUNTRY_META[a].cities)[0]||'에르단 왕국';out[n]++;aSum++}
 const otherDist=distributeInteger(270,other,n=>COUNTRY_META[n].cities*(.85+stableHash01(n)*.3),1);
 for(const n of other)out[n]=otherDist[n]||1;
 const state={};
 for(const n of all){
  const h=stableHash01(n);
  state[n]={population:out[n]||1,region:COUNTRY_META[n].region,cities:COUNTRY_META[n].cities,
    growth:.009+h*.013,aggression:Math.round(20+h*65),openness:Math.round(25+stableHash01(n+'o')*65),
    prosperity:Math.round(30+stableHash01(n+'p')*55),births:0,deaths:0,lastPopulation:out[n]||1};
 }
 return state
}
function defaultTrajectory(){
 return{cooperation:12,exploration:10,pastoral:8,scholarship:9,trade:4,militarism:2,centralization:5,ecology:8,current:'초기 공동체',lastShiftDay:-999}
}

function defaultWorldState(){
 return{
  knownRegions:['아르케아 중앙대륙'],
  foundedCities:['L001'],
  landProgress:0,seaProgress:0,
  routes:[],expeditions:[],
  seaTech:{
   sail:{label:'돛 제작',p:0,open:false},
   navigation:{label:'연안 항법',p:0,open:false},
   stores:{label:'원정 저장',p:0,open:false}
  },
  firstSeaExpedition:false,lastRegionRevealAbsDay:-999,lastCityFoundationYear:-1,
  countries:initialCountryState(),contactedCountries:['에르단 왕국'],diplomacy:{},wars:[],externalWars:[],lastLocalPopulation:initialOfficialResidents(0,1).length,
  corePopulation:30,otherPopulation:270
 }
}
function normalizeWorldState(){
 state.world??=defaultWorldState();const d=defaultWorldState();
 for(const k of ['knownRegions','foundedCities','routes','expeditions'])state.world[k]??=JSON.parse(JSON.stringify(d[k]));
 for(const k of ['landProgress','seaProgress','firstSeaExpedition','lastRegionRevealAbsDay','lastCityFoundationYear','corePopulation','otherPopulation','lastLocalPopulation'])if(state.world[k]===undefined)state.world[k]=d[k];
 state.world.countries??=initialCountryState();for(const[n,v]of Object.entries(initialCountryState()))state.world.countries[n]??=v;
 state.world.contactedCountries??=['에르단 왕국'];if(!state.world.contactedCountries.includes('에르단 왕국'))state.world.contactedCountries.unshift('에르단 왕국');
 state.world.diplomacy??={};state.world.wars??=[];state.world.externalWars??=[];
 state.world.expeditions??=[];
 for(const e of state.world.expeditions){
   // Legacy v5-v8 entries had no travel clock and already represented completed contact.
   if(e.arrivalAbsDay===undefined){e.active=false;e.completed=true;e.progress=1}
   else{e.active??=!e.completed;e.completed??=false;e.progress??=e.completed?1:0}
 }
 state.world.seaTech??=d.seaTech;
 for(const k of Object.keys(d.seaTech))state.world.seaTech[k]??=JSON.parse(JSON.stringify(d.seaTech[k]));
 if(!state.world.knownRegions.includes('아르케아 중앙대륙'))state.world.knownRegions.unshift('아르케아 중앙대륙');
 if(!state.world.foundedCities.includes('L001'))state.world.foundedCities.unshift('L001')
}
function regionCenter(name){
 const cs=WORLD_DATA.cities.filter(c=>c.region===name);
 return{x:cs.reduce((s,c)=>s+c.x,0)/cs.length,y:cs.reduce((s,c)=>s+c.y,0)/cs.length}
}
const ARKEA_CENTER=regionCenter('아르케아 중앙대륙');

const PLANET_CIRCUMFERENCE_KM=WORLD_DATA.meta.planetCircumferenceKm||40075;
const PLANET_HALF_HEIGHT_KM=WORLD_DATA.meta.mapHeightKm||20037.5;
function worldPointDistanceKm(a,b){
 // CIVITAS source map is treated as an equirectangular world map:
 // 1000 map-x = one full planetary circumference, 800 map-y = pole-to-pole.
 let dx=Math.abs((a.x||0)-(b.x||0));
 dx=Math.min(dx,1000-dx);
 const dy=Math.abs((a.y||0)-(b.y||0));
 const xKm=dx/1000*PLANET_CIRCUMFERENCE_KM;
 const yKm=dy/800*PLANET_HALF_HEIGHT_KM;
 return Math.hypot(xKm,yKm)
}
function cityDistanceKm(idA,idB){
 const a=WORLD_CITY_BY_ID.get(idA),b=WORLD_CITY_BY_ID.get(idB);return a&&b?worldPointDistanceKm(a,b):0
}
function travelSpeedKmDay(kind='land'){
 if(kind==='sea')return WORLD_DATA.meta.sailingKmPerDay||110;
 const mounted=state.buildings?.pen&&state.tech?.사육기초?.open;
 return mounted?(WORLD_DATA.meta.mountedKmPerDay||48):(WORLD_DATA.meta.walkingKmPerDay||30)
}
function expeditionTravelDays(fromId,toId,kind='land'){
 const dist=cityDistanceKm(fromId,toId);
 const terrainFactor=kind==='sea'?1.12:1.28;
 const prep=kind==='sea'?18:8;
 return Math.max(1,Math.ceil(dist*terrainFactor/travelSpeedKmDay(kind))+prep)
}

function nearestRegionToArkea(names){
 return [...names].sort((a,b)=>{const A=regionCenter(a),B=regionCenter(b);return Math.hypot(A.x-ARKEA_CENTER.x,A.y-ARKEA_CENTER.y)-Math.hypot(B.x-ARKEA_CENTER.x,B.y-ARKEA_CENTER.y)})[0]
}
function representativeCity(region){
 const cs=WORLD_DATA.cities.filter(c=>c.region===region);
 const cen=regionCenter(region);return [...cs].sort((a,b)=>Math.hypot(a.x-cen.x,a.y-cen.y)-Math.hypot(b.x-cen.x,b.y-cen.y))[0]
}

function fresh(){return{year:0,day:1,speed:1,running:true,weather:'맑음',resources:{food:22,water:28,wood:14,stone:8,labor:22},caps:{food:100,water:100,wood:100,stone:100,labor:60},buildings:{house:2,field:0,storage:0,workshop:0,herb:0,pen:0,meeting:0,well:0,kiln:0,kitchen:0,watch:0,loom:0},tech:{기록습관:{p:0,open:false},공동취사:{p:0,open:false},건조저장:{p:0,open:false},목공기초:{p:0,open:false},약초분류:{p:0,open:false},사육기초:{p:0,open:false},수로관리:{p:0,open:false},토기저장:{p:0,open:false},직조기초:{p:0,open:false},야간교대:{p:0,open:false}},residents:initialOfficialResidents(0,1),logs:[{seq:1,type:'story',time:'0년 1일',title:'황무지의 첫 아침',text:'이명자와 주민들이 라엔 분지의 흙과 물길을 살폈다. 복실이는 처음부터 사람들 곁을 맴돌며 새 터의 냄새를 맡고 있었다.',speaker:'이명자',quote:'오늘 한 뼘만 더 갈아엎으면, 내일은 누군가 그 위에 씨앗을 놓을 수 있겠지.'}],seq:1,flags:{firstField:false,firstHarvest:false,storage:false,illness:false,myeongjaDead:false,myeongjaDeathLogged:false},currentStorySeq:1,demography:{births:0,arrivals:0,children:0},civ:{level:0,levelName:'야영지',techUnlocked:0,builds:0,lastAnnual:null},eventMemory:{},worldPopulation:300,world:defaultWorldState(),localMap:{level:0,revealedRadius:90,lastExpansionYear:-1},animalStats:{wild:7,domestic:0,care:0},trajectory:defaultTrajectory(),conflict:{animalRaids:0,warBattles:0,lastAnimalRaidDay:-999,lastBattleDay:-999,foodLost:0,wounded:0,raidersDefeated:0,animalsRepelled:0},companion:{bokshil:{x:1.2,z:4.5,active:true}},deceased:[],player:{x:3,z:3,level:1,exp:0,nextExp:100,hp:100,maxHp:100,attack:14,kills:0,deaths:0,dead:false,respawnAt:0,awakened:false,autoHunt:false}}};
let state;try{state=JSON.parse(localStorage.getItem(KEY))||fresh()}catch{state=fresh()}

function mergeOfficialResidents(){
 const old=new Map((state.residents||[]).map(r=>[r.id,r]));
 const desired=OFFICIAL_LOCAL_CATALOG.filter(c=>officialEligible(c,state.year||0,state.day||1));
 state.residents=desired.map(c=>{
  const base=officialResident(c,state.year||0),prev=old.get(c.id);
  if(!prev)return base;
  const m={...base,...prev};
  for(const k of ['name','gender','family','generation','originJob','field','potential','potentialGrade','growthType','value','fear','flaw','hiddenTrait','surfaceTrait','trueDesire','habit','speech','stressResponse','affectionStyle','achievementSeed','changeArc','personality','note'])m[k]=base[k];
  m.age=Math.max(0,(state.year||0)-c.birth);m.lifeStage=residentLifeStage(m.age);m.careerSeed=base.careerSeed||c.job;
  m.skills={...base.skills,...(prev.skills||{})};
  if(m.age<12){m.job='아이';for(const k of Object.keys(m.skills))m.skills[k]=Math.min(m.skills[k],Math.max(base.skills[k]||2,18))}
  else if(m.age<16){m.job='견습생';for(const k of Object.keys(m.skills))m.skills[k]=Math.min(m.skills[k],Math.max(base.skills[k]||2,42))}
  return initResidentBrain(m)
 })
}
function migrate(){
state.resources??={food:22,water:28,wood:14,stone:8,labor:22};
state.caps??={food:100,water:100,wood:100,stone:100,labor:60};
for(const[k,v]of Object.entries({food:22,water:28,wood:14,stone:8,labor:22}))state.resources[k]??=v;
for(const[k,v]of Object.entries({food:100,water:100,wood:100,stone:100,labor:60}))state.caps[k]??=v;
state.flags??={};state.storyCooldowns??={};state.schemaVersion=81;
state.speed??=1;state.running??=true;state.logs??=[];
if(!state.logs.length)state.logs=[{seq:1,type:'story',time:`${state.year||0}년 ${state.day||1}일`,title:'기록 복구',text:'이전 기록 일부가 비어 있어 현재 세계 상태를 기준으로 연대기를 다시 이어간다.',speaker:'기록',quote:'사라진 기록은 추측하지 않고, 남아 있는 세계에서 다시 시작한다.'}];
state.seq??=Math.max(1,...state.logs.map(l=>Number(l.seq)||0));state.currentStorySeq??=state.logs[0]?.seq||1;state.residents??=JSON.parse(JSON.stringify(RESIDENT_SEED));state.buildings??={house:2,field:0,storage:0,workshop:0,herb:0,pen:0,meeting:0,well:0,kiln:0,kitchen:0,watch:0,loom:0};for(const k of ['house','field','storage','workshop','herb','pen','meeting','well','kiln','kitchen','watch','loom'])state.buildings[k]??=(k==='house'?2:0);state.tech??={};for(const k of ['기록습관','공동취사','건조저장','목공기초','약초분류','사육기초','수로관리','토기저장','직조기초','야간교대'])state.tech[k]??={p:0,open:false};state.demography??={births:0,arrivals:0,children:0};state.civ??={level:0,levelName:'야영지',techUnlocked:0,builds:0,lastAnnual:null,lastBuildAbsDay:-999};state.civ.lastBuildAbsDay??=-999;state.eventMemory??={};
state.localMap??={level:0,revealedRadius:90,lastExpansionYear:-1};
state.animalStats??={wild:7,domestic:0,care:0};
state.companion??={bokshil:{x:(state.player?.x??3)-1.2,z:(state.player?.z??3)+1.5,active:true}};
state.companion.bokshil??={x:(state.player?.x??3)-1.2,z:(state.player?.z??3)+1.5,active:true};
state.deceased??=[];
state.trajectory??=defaultTrajectory();state.conflict??={animalRaids:0,warBattles:0,lastAnimalRaidDay:-999,lastBattleDay:-999,foodLost:0,wounded:0,raidersDefeated:0,animalsRepelled:0};
const afterMyeongjaDeath=isMyeongjaDeathTime(state.year,state.day);
if(!afterMyeongjaDeath){
 // Correct saves affected by the old 0y189 bug: restore her until the third-year boundary.
 state.flags.myeongjaDead=false;state.flags.myeongjaDeathLogged=false;
 state.deceased=state.deceased.filter(d=>d.id!=='C0001');
 state.logs=state.logs.filter(l=>l.title!=='이명자의 마지막 날');
 if(!state.logs.find(l=>l.seq===state.currentStorySeq))state.currentStorySeq=state.logs[0]?.seq||1
}else{
 state.flags.myeongjaDead=true;
 let d=state.deceased.find(d=>d.id==='C0001');
 if(!d)state.deceased.push({id:'C0001',name:'이명자',year:3,day:1,cause:'말기 암'});
 else{d.year=3;d.day=1;d.cause='말기 암'}
 let l=state.logs.find(l=>l.title==='이명자의 마지막 날');
 if(l){l.time='3년 1일';l.text='말기 암을 앓던 이명자가 세계력 3년 1일 숨을 거뒀다. 그동안 쌓인 관계와 생활 방식은 주민들의 다음 선택에 서로 다른 흔적으로 남았다.'}
 state.flags.myeongjaDeathLogged=!!l
}

normalizeWorldState();
state.player??={x:3,z:3,level:1,exp:0,nextExp:100,hp:100,maxHp:100,attack:14,kills:0,deaths:0,dead:false,respawnAt:0,awakened:false,autoHunt:false};
for(const [k,v] of Object.entries({x:3,z:3,level:1,exp:0,nextExp:100,hp:100,maxHp:100,attack:14,kills:0,deaths:0,dead:false,respawnAt:0,awakened:false,autoHunt:false})) if(state.player[k]===undefined)state.player[k]=v;
mergeOfficialResidents();
state.flags.firstField=!!(state.flags.firstField||state.buildings.field>0);
state.flags.storage=!!(state.flags.storage||state.buildings.storage>0);
if(!state.flags.civEngineV2){
 const y=state.year||0,b=state.buildings;
 if(y>=1){
  b.house=Math.max(b.house,Math.ceil(state.residents.length/3));b.field=Math.max(b.field,2);b.storage=1;b.workshop=1;b.well=1;
  for(const k of ['기록습관','공동취사','목공기초','수로관리']){state.tech[k].open=true;state.tech[k].p=100}
  state.caps.food=Math.max(state.caps.food,170);state.caps.water=Math.max(state.caps.water,170);state.caps.wood=Math.max(state.caps.wood,150);state.caps.stone=Math.max(state.caps.stone,120);state.caps.labor=Math.max(state.caps.labor,120)
 }
 if(y>=2){
  b.field=Math.max(b.field,3);b.herb=1;b.pen=1;b.meeting=1;b.kitchen=1;b.kiln=1;
  for(const k of ['건조저장','약초분류','사육기초','토기저장']){state.tech[k].open=true;state.tech[k].p=100}
 }
 state.flags.firstField=state.buildings.field>0;state.flags.storage=state.buildings.storage>0;state.flags.civEngineV2=true
}
state.demography.children=state.residents.filter(r=>r.age<16).length;
state.demography.births=Math.max(state.demography.births||0,OFFICIAL_LOCAL_CATALOG.filter(c=>c.birth>=0&&officialEligible(c,state.year,state.day)).length);
state.demography.arrivals=Math.max(state.demography.arrivals||0,state.residents.filter(r=>{const c=OFFICIAL_BY_ID.get(r.id);return c&&c.birth<0&&c.intro>0&&c.intro<=state.year}).length);
recalculateCaps();
if(state.year>=55)state.player.awakened=true;
}migrate();
function pruneForSave(emergency=false){
 const memoryLimit=emergency?8:16,logLimit=emergency?420:800;
 for(const r of state.residents||[])if(r.memories?.length>memoryLimit)r.memories=r.memories.slice(0,memoryLimit);
 if(state.logs?.length>logLimit)state.logs=state.logs.slice(0,logLimit);
 const cutoff=absDay()-1095;
 if(state.eventMemory)for(const[k,v]of Object.entries(state.eventMemory))if(v<cutoff)delete state.eventMemory[k];
 if(state.storyCooldowns)for(const[k,v]of Object.entries(state.storyCooldowns))if(v<cutoff)delete state.storyCooldowns[k];
}
function save(){
 try{pruneForSave(false);localStorage.setItem(KEY,JSON.stringify(state));return true}
 catch(err){
  try{pruneForSave(true);localStorage.setItem(KEY,JSON.stringify(state));return true}
  catch(err2){console.warn('저장 공간 부족으로 자동 저장을 건너뜁니다.',err2);return false}
 }
}
function stamp(){return `${state.year}년 ${state.day}일`}function season(){return state.day<92?'봄':state.day<183?'여름':state.day<274?'가을':'겨울'}
function absDay(){return (state.year||0)*365+(state.day||1)}
function minorStoryAllowed(kind,cooldown=18){
 state.storyCooldowns??={};const now=absDay(),last=state.storyCooldowns[kind]??-99999;
 if(now-last<cooldown)return false;state.storyCooldowns[kind]=now;return true
}
function normalizedStoryKey(title){
 return title.replace(/\d+/g,'#').replace(/[‘’'"]/g,'').trim()
}

function addLog(type,title,text,speaker='이명자',quote=''){
 state.eventMemory??={};const generic=/함께한 일이 기억|분지 가장자리|작은 채집 발견|물길을 손보다|새 그릇|경작지 .*확장|돌맥이 드러난 비탈|먹을 수 있는 풀 군락|채집터의 작은 발견|낯선 풀의 군락|어제 없던 잎/.test(title);
 const key=`${generic?'*':speaker}|${normalizedStoryKey(title)}|${generic?'':text.slice(0,34)}`,now=absDay(),last=state.eventMemory[key];
 if(last!==undefined&&now-last<(generic?75:50))return null;state.eventMemory[key]=now;state.seq++;
 const l={seq:state.seq,type,time:stamp(),title,text,speaker,quote};state.logs.unshift(l);state.logs=state.logs.slice(0,1000);state.currentStorySeq=l.seq;showEvent(title);save();return l
}
function gain(obj){for(const[k,v]of Object.entries(obj))state.resources[k]=clamp(state.resources[k]+v,0,state.caps[k])}function spend(obj){for(const[k,v]of Object.entries(obj))state.resources[k]=Math.max(0,state.resources[k]-v)}function afford(obj){return Object.entries(obj).every(([k,v])=>state.resources[k]>=v)}
function residentEff(job){const rs=state.residents.filter(r=>r.job===job);if(!rs.length)return .6;return rs.reduce((s,r)=>s+.65+(r.skills[JOB_SKILL[job]]||20)/110+r.bloom/250+r.potential/500,0)/rs.length}
function improve(job,n=.4){state.residents.filter(r=>r.job===job).forEach(r=>{const k=JOB_SKILL[job];r.skills[k]=clamp((r.skills[k]||0)+n,0,100);r.bloom=clamp(r.bloom+n*(r.potential/100)*.18,0,100)})}
function currentStory(){return state.logs.find(l=>l.seq===state.currentStorySeq)||state.logs[0]||{seq:0,type:'story',time:stamp(),title:'감나무뜰의 하루',text:'아직 기록된 사건이 없다.',speaker:'기록',quote:''}}
function storyQuoteFor(log){
 if(!log)return '아직 남은 기록이 없다.';
 if(log.quote)return log.quote;
 const r=state.residents.find(x=>x.name===log.speaker);
 if(r?.brain?.thought)return r.brain.thought;
 return '오늘 달라진 일을 기억해두자. 다음 선택은 그 기억에서 시작될 테니까.'
}

// ---------- THREE WORLD ----------
const scene=new THREE.Scene();scene.background=new THREE.Color(0x94a4a1);scene.fog=new THREE.FogExp2(0xaab0a1,.0075);
const gameRoot=$('game');
function viewportMetrics(){
 const rect=gameRoot.getBoundingClientRect(),vv=window.visualViewport;
 const w=Math.max(1,Math.round(rect.width||vv?.width||document.documentElement.clientWidth||innerWidth||1));
 const h=Math.max(1,Math.round(rect.height||vv?.height||document.documentElement.clientHeight||innerHeight||1));
 return{w,h}
}
const initialViewport=viewportMetrics();
const camera=new THREE.PerspectiveCamera(38,initialViewport.w/initialViewport.h,.1,600);
const IS_MOBILE=matchMedia('(max-width:700px)').matches||/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const renderer=new THREE.WebGLRenderer({antialias:!IS_MOBILE,powerPreference:'high-performance',alpha:false,preserveDrawingBuffer:false});
renderer.setClearColor(0x94a4a1,1);
renderer.shadowMap.enabled=!IS_MOBILE;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.domElement.style.position='absolute';renderer.domElement.style.inset='0';renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
gameRoot.appendChild(renderer.domElement);
let renderW=0,renderH=0;
function resizeWorld(force=false){
 const {w,h}=viewportMetrics();
 if(!force&&Math.abs(w-renderW)<2&&Math.abs(h-renderH)<2)return;
 renderW=w;renderH=h;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,IS_MOBILE?1.0:1.35));
 renderer.setSize(w,h,false);
 camera.aspect=w/h;camera.updateProjectionMatrix();
}
resizeWorld(true);
scene.add(new THREE.HemisphereLight(0xdff2df,0x5a4938,2.1));const sun=new THREE.DirectionalLight(0xffe7b4,2.5);sun.position.set(-35,55,-30);sun.castShadow=true;sun.shadow.mapSize.set(IS_MOBILE?512:1024,IS_MOBILE?512:1024);sun.shadow.camera.left=-80;sun.shadow.camera.right=80;sun.shadow.camera.top=80;sun.shadow.camera.bottom=-80;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,180),new THREE.MeshStandardMaterial({color:0x7e895d,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

const walkableSurfaces=[ground];
const frontierGroup=new THREE.Group();scene.add(frontierGroup);
const frontierTiles=[];
const frontierDecor=[];
function seededNoise(n){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)}
function createFrontierTile(x,z,w,h,level,index){
 const g=new THREE.Group();
 const palette=[0x748258,0x687957,0x78845f,0x657553];
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:palette[index%palette.length],roughness:1}));
 plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;plane.position.y=-.015;g.add(plane);walkableSurfaces.push(plane);
 // light terrain details so expansion is visually obvious but remains mobile-friendly
 const detailCount=IS_MOBILE?Math.max(2,Math.floor(w*h/5200)):Math.max(4,Math.floor(w*h/2400));
 for(let i=0;i<detailCount;i++){
  const rx=(seededNoise(index*100+i*3)-.5)*w*.86,rz=(seededNoise(index*100+i*3+1)-.5)*h*.86;
  if(i%3===0){
   const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.35+seededNoise(i+index)*.6,0),new THREE.MeshStandardMaterial({color:0x76766e,roughness:1}));
   rock.position.set(rx,.28,rz);rock.scale.y=.65;rock.castShadow=true;g.add(rock)
  }else{
   const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.11,.18,1.5,6),new THREE.MeshStandardMaterial({color:0x5c432e,roughness:1}));
   const crown=new THREE.Mesh(new THREE.ConeGeometry(.72,1.7,7),new THREE.MeshStandardMaterial({color:i%2?0x3b6241:0x466c48,roughness:1}));
   trunk.position.set(rx,.75,rz);crown.position.set(rx,1.9,rz);g.add(trunk,crown)
  }
 }
 g.position.set(x,0,z);g.visible=false;frontierGroup.add(g);frontierTiles.push({g,level,plane});
 return g
}
// Level 1: cardinal expansion beyond original 220x180 ground
createFrontierTile(0,-130,220,80,1,1);
createFrontierTile(0,130,220,80,1,2);
createFrontierTile(-160,0,100,180,1,3);
createFrontierTile(160,0,100,180,1,4);
// Level 2: four corners
createFrontierTile(-160,-130,100,80,2,5);
createFrontierTile(160,-130,100,80,2,6);
createFrontierTile(-160,130,100,80,2,7);
createFrontierTile(160,130,100,80,2,8);
// Level 3: distant frontier strips
createFrontierTile(0,-210,320,80,3,9);
createFrontierTile(0,210,320,80,3,10);
createFrontierTile(-260,0,100,340,3,11);
createFrontierTile(260,0,100,340,3,12);

function desiredLocalMapLevel(){
 const p=state.world?.landProgress||0,y=state.year||0,c=state.civ?.level||0;
 if(y>=7||p>=420||c>=4)return 3;
 if(y>=3||p>=180||c>=3)return 2;
 if(y>=1||p>=55||c>=2)return 1;
 return 0
}
function localMapBounds(){
 const lv=state.localMap?.level||0;
 if(lv===0)return{x:85,z:70};
 if(lv===1)return{x:190,z:155};
 if(lv===2)return{x:205,z:165};
 return{x:285,z:235}
}
function updateLocalMapExpansion(announce=true){
 const wanted=desiredLocalMapLevel(),old=state.localMap.level||0;
 if(wanted>old){
   state.localMap.level=wanted;state.localMap.revealedRadius=[90,180,235,320][wanted];state.localMap.lastExpansionYear=state.year;
   if(announce)addLog('story',`라엔 분지 탐사 범위 ${wanted+1}단계`,`주민들의 반복 탐사로 정착지 주변에서 이동 가능한 지형이 더 넓게 기록되었다. 이제 카메라와 주민이 이전 경계 밖까지 움직일 수 있다.`,'기록','지도의 빈 부분이 실제 길과 숲으로 바뀌었다.')
 }
 for(const t of frontierTiles)t.g.visible=t.level<=state.localMap.level;
 const b=localMapBounds();sun.shadow.camera.left=-Math.min(280,b.x);sun.shadow.camera.right=Math.min(280,b.x);sun.shadow.camera.top=Math.min(240,b.z);sun.shadow.camera.bottom=-Math.min(240,b.z);sun.shadow.camera.updateProjectionMatrix();
 if($('mapExpansionText'))$('mapExpansionText').textContent=`탐사 범위 ${state.localMap.level+1}/4 · ±${b.x}×${b.z}`;
}

function hill(x,z,sx,sz,h,c=0x5f7952){const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.MeshStandardMaterial({color:c,roughness:1}));m.scale.set(sx,h,sz);m.position.set(x,-.8,z);m.receiveShadow=true;scene.add(m)}hill(-70,-42,38,30,8);hill(72,-46,46,32,10);hill(-82,58,55,37,8);hill(85,58,47,33,7);
function tree(x,z,s=.9){const g=new THREE.Group(),tr=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,2.5,7),new THREE.MeshStandardMaterial({color:0x57402d,roughness:1})),c1=new THREE.Mesh(new THREE.ConeGeometry(1.25,2.8,8),new THREE.MeshStandardMaterial({color:0x355b3d,roughness:1})),c2=new THREE.Mesh(new THREE.ConeGeometry(.95,2.2,8),new THREE.MeshStandardMaterial({color:0x426b47,roughness:1}));tr.position.y=1.25;c1.position.y=3;c2.position.y=4;[tr,c1,c2].forEach(m=>m.castShadow=true);g.add(tr,c1,c2);g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);return g}
for(let i=0;i<125;i++){const a=Math.random()*Math.PI*2,r=45+Math.random()*55;tree(Math.cos(a)*r+(Math.random()-.5)*10,Math.sin(a)*r*.75+(Math.random()-.5)*10,.6+Math.random()*.65)}
// river
const river=new THREE.Mesh(new THREE.PlaneGeometry(14,150),new THREE.MeshStandardMaterial({color:0x6b9aaa,roughness:.3,metalness:.05,transparent:true,opacity:.92}));river.rotation.x=-Math.PI/2;river.rotation.z=.07;river.position.set(38,.03,6);scene.add(river);
// paths
function path(a,b,w=2.8){const d=b.clone().sub(a),len=d.length(),m=new THREE.Mesh(new THREE.PlaneGeometry(w,len),new THREE.MeshStandardMaterial({color:0xa18a65,roughness:1}));m.rotation.x=-Math.PI/2;m.position.copy(a.clone().add(b).multiplyScalar(.5));m.position.y=.045;m.rotation.z=-Math.atan2(d.x,d.z);scene.add(m)};[LOC.field,LOC.river,LOC.forest,LOC.stone,LOC.workshop,LOC.herbs,LOC.pen].forEach(p=>path(LOC.center,p));
// Dynamic settlement: civilization data is mirrored in the 3D world.
const villageGroup=new THREE.Group();scene.add(villageGroup);
const visualState={house:0,field:0,storage:0,workshop:0,herb:0,pen:0,meeting:0,well:0,kiln:0,kitchen:0,watch:0,loom:0};
const visualByKey=new Map();

const HOUSE_SPOTS=[
 [-7,-6,.25],[7,-6,-.2],[-11,4,-.25],[10,5,.3],[-15,-12,.4],[16,-10,-.35],
 [-18,7,.15],[17,10,-.2],[-5,-17,.08],[6,16,-.12],[20,-1,.2],[-21,-2,-.18]
];

function buildRise(g,animate=true){
 if(!animate){g.scale.y=1;return}
 g.scale.y=.03;
 const started=performance.now(),duration=1700;
 function tick(now){
   const t=Math.min(1,(now-started)/duration);
   const ease=1-Math.pow(1-t,3);
   g.scale.y=.03+.97*ease;
   if(t<1)requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}

function houseSpot(index){
 if(index<HOUSE_SPOTS.length)return HOUSE_SPOTS[index];
 const j=index-HOUSE_SPOTS.length,ring=25+Math.floor(j/10)*7,a=(j%10)/10*Math.PI*2;return[Math.cos(a)*ring,Math.sin(a)*ring*.72,a+Math.PI]
}
function createHouse(index,animate=true){
 const spot=houseSpot(index),g=new THREE.Group();
 const foundation=new THREE.Mesh(new THREE.BoxGeometry(5.8,.24,4.9),new THREE.MeshStandardMaterial({color:0x76634c,roughness:1}));
 foundation.position.y=.12;
 const wall=new THREE.Mesh(new THREE.BoxGeometry(5.2,2.65,4.25),new THREE.MeshStandardMaterial({color:index%2?0x987451:0xa17d57,roughness:1}));
 wall.position.y=1.5;
 const roof=new THREE.Mesh(new THREE.ConeGeometry(4.05,2.25,4),new THREE.MeshStandardMaterial({color:index%3?0x503b2a:0x5d402a,roughness:1}));
 roof.position.y=3.65;roof.rotation.y=Math.PI/4;roof.scale.z=.78;
 const door=new THREE.Mesh(new THREE.BoxGeometry(.8,1.6,.12),new THREE.MeshStandardMaterial({color:0x503723,roughness:1}));
 door.position.set(0,.9,2.19);
 const windowMat=new THREE.MeshStandardMaterial({color:0x9bb7a6,emissive:0x394a42,emissiveIntensity:.35,roughness:.25});
 [-1.45,1.45].forEach(x=>{const w=new THREE.Mesh(new THREE.BoxGeometry(.7,.65,.1),windowMat);w.position.set(x,1.65,2.2);g.add(w)});
 const chimney=new THREE.Mesh(new THREE.BoxGeometry(.42,1.15,.42),new THREE.MeshStandardMaterial({color:0x62564c,roughness:1}));
 chimney.position.set(1.25,4.15,0);
 [foundation,wall,roof,door,chimney].forEach(m=>{m.castShadow=true;m.receiveShadow=true;g.add(m)});
 g.position.set(spot[0],0,spot[1]);g.rotation.y=spot[2];
 villageGroup.add(g);visualByKey.set(`house:${index}`,g);buildRise(g,animate);
 return g;
}

function createFieldPatch(index,animate=true){
 const g=new THREE.Group(),offsets=[[0,0],[-1,15],[-1,-15],[14,0]];
 const o=offsets[index%offsets.length];g.position.set(LOC.field.x+o[0],0,LOC.field.z+o[1]);
 for(let i=0;i<8;i++){
   const row=new THREE.Mesh(new THREE.BoxGeometry(1.25,.12,12),new THREE.MeshStandardMaterial({color:i%2?0x765735:0x89663b,roughness:1}));
   row.position.set((i-3.5)*1.5,.06,0);row.receiveShadow=true;g.add(row);
   for(let j=0;j<5;j++){
     const sprout=new THREE.Mesh(new THREE.ConeGeometry(.10,.32,5),new THREE.MeshStandardMaterial({color:0x52783f,roughness:1}));
     sprout.position.set((i-3.5)*1.5,.22,-4.5+j*2.2);g.add(sprout)
   }
 }
 villageGroup.add(g);visualByKey.set(`field:${index}`,g);buildRise(g,animate);return g;
}

function createStorage(animate=true){
 const g=new THREE.Group();
 const postsMat=new THREE.MeshStandardMaterial({color:0x60482f,roughness:1});
 const wallMat=new THREE.MeshStandardMaterial({color:0x99724a,roughness:1});
 [-2.4,2.4].forEach(x=>[-1.7,1.7].forEach(z=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.25,1.2,.25),postsMat);p.position.set(x,.6,z);g.add(p)}));
 const floor=new THREE.Mesh(new THREE.BoxGeometry(5.5,.3,4.2),postsMat);floor.position.y=1.15;g.add(floor);
 const body=new THREE.Mesh(new THREE.BoxGeometry(5.1,2.5,3.8),wallMat);body.position.y=2.55;g.add(body);
 const roof=new THREE.Mesh(new THREE.ConeGeometry(4.2,2.2,4),new THREE.MeshStandardMaterial({color:0x443326,roughness:1}));roof.position.y=4.65;roof.rotation.y=Math.PI/4;roof.scale.z=.75;g.add(roof);
 for(let i=0;i<3;i++){const crate=new THREE.Mesh(new THREE.BoxGeometry(.8,.7,.8),postsMat);crate.position.set(-1.2+i*1.2,1.55,2.3);g.add(crate)}
 g.position.set(9,0,-14);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});villageGroup.add(g);visualByKey.set('storage',g);buildRise(g,animate);return g;
}

function createWorkshop(animate=true){
 const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x745336,roughness:1}),roofMat=new THREE.MeshStandardMaterial({color:0x4b3828,roughness:1});
 [-3,3].forEach(x=>[-2,2].forEach(z=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.3,3.1,.3),wood);p.position.set(x,1.55,z);g.add(p)}));
 const roof=new THREE.Mesh(new THREE.BoxGeometry(7,0.28,5.3),roofMat);roof.position.y=3.25;roof.rotation.z=-.08;g.add(roof);
 const bench=new THREE.Mesh(new THREE.BoxGeometry(3.4,.25,1.15),wood);bench.position.set(0,1.05,0);g.add(bench);
 for(const x of [-1.4,1.4]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.22,1,.22),wood);leg.position.set(x,.55,0);g.add(leg)}
 const stump=new THREE.Mesh(new THREE.CylinderGeometry(.55,.65,.7,10),wood);stump.position.set(2.2,.35,1.2);g.add(stump);
 g.position.copy(LOC.workshop);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});villageGroup.add(g);visualByKey.set('workshop',g);buildRise(g,animate);return g;
}

function createHerbRack(animate=true){
 const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x725136,roughness:1}),leaf=new THREE.MeshStandardMaterial({color:0x67824e,roughness:1});
 for(const x of [-2,2]){const p=new THREE.Mesh(new THREE.BoxGeometry(.22,2.6,.22),wood);p.position.set(x,1.3,0);g.add(p)}
 for(let y=.7;y<2.4;y+=.55){const bar=new THREE.Mesh(new THREE.BoxGeometry(4.4,.12,.12),wood);bar.position.y=y;g.add(bar);for(let x=-1.7;x<=1.7;x+=.85){const bundle=new THREE.Mesh(new THREE.SphereGeometry(.16,6,5),leaf);bundle.position.set(x,y-.18,.05);g.add(bundle)}}
 g.position.copy(LOC.herbs).add(new THREE.Vector3(4,0,-2));villageGroup.add(g);visualByKey.set('herb',g);buildRise(g,animate);return g;
}

function createPen(animate=true){
 const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x705033,roughness:1});
 const size=7;
 for(let i=-3;i<=3;i++){
   for(const [x,z] of [[i*2,-size],[i*2,size],[-size,i*2],[size,i*2]]){
     const p=new THREE.Mesh(new THREE.BoxGeometry(.18,1.1,.18),wood);p.position.set(x,.55,z);g.add(p)
   }
 }
 for(const [rot,x,z] of [[0,0,-size],[0,0,size],[Math.PI/2,-size,0],[Math.PI/2,size,0]]){
   for(const y of [.45,.9]){const rail=new THREE.Mesh(new THREE.BoxGeometry(13,.13,.13),wood);rail.rotation.y=rot;rail.position.set(x,y,z);g.add(rail)}
 }
 g.position.copy(LOC.pen);villageGroup.add(g);visualByKey.set('pen',g);buildRise(g,animate);return g;
}

function createMeeting(animate=true){
 const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x89643e,roughness:1});
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(5.3,5.3,.28,12),wood);floor.position.y=.14;g.add(floor);
 for(let i=0;i<8;i++){
   const a=i/8*Math.PI*2;
   const seat=new THREE.Mesh(new THREE.BoxGeometry(1.6,.35,.65),wood);seat.position.set(Math.cos(a)*3.6,.4,Math.sin(a)*3.6);seat.rotation.y=-a+Math.PI/2;g.add(seat)
 }
 g.position.copy(LOC.meeting);villageGroup.add(g);visualByKey.set('meeting',g);buildRise(g,animate);return g;
}


function createWell(animate=true){const g=new THREE.Group(),sm=new THREE.MeshStandardMaterial({color:0x82796b,roughness:1}),w=new THREE.MeshStandardMaterial({color:0x6a4d31,roughness:1});
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,m=new THREE.Mesh(new THREE.BoxGeometry(.55,.42,.34),sm);m.position.set(Math.cos(a)*1.15,.25,Math.sin(a)*1.15);m.rotation.y=-a;g.add(m)}
 const water=new THREE.Mesh(new THREE.CircleGeometry(.93,20),new THREE.MeshStandardMaterial({color:0x557f8c,roughness:.3}));water.rotation.x=-Math.PI/2;water.position.y=.28;g.add(water);
 [-1.6,1.6].forEach(x=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.18,2.8,.18),w);p.position.set(x,1.4,0);g.add(p)});const beam=new THREE.Mesh(new THREE.BoxGeometry(3.5,.18,.18),w);beam.position.y=2.7;g.add(beam);
 g.position.set(20,0,6);villageGroup.add(g);visualByKey.set('well',g);buildRise(g,animate)}
function createKiln(animate=true){const g=new THREE.Group(),clay=new THREE.MeshStandardMaterial({color:0x8b654f,roughness:1}),dark=new THREE.MeshStandardMaterial({color:0x2f2924,roughness:1});
 const body=new THREE.Mesh(new THREE.SphereGeometry(1.7,16,10,0,Math.PI*2,0,Math.PI*.68),clay);body.scale.y=1.2;body.position.y=.9;g.add(body);const mouth=new THREE.Mesh(new THREE.CircleGeometry(.55,16),dark);mouth.position.set(0,.62,1.48);g.add(mouth);
 const ch=new THREE.Mesh(new THREE.CylinderGeometry(.35,.45,1.5,10),clay);ch.position.y=2.55;g.add(ch);g.position.set(14,0,-23);villageGroup.add(g);visualByKey.set('kiln',g);buildRise(g,animate)}
function createKitchen(animate=true){const g=new THREE.Group(),w=new THREE.MeshStandardMaterial({color:0x785838,roughness:1}),rm=new THREE.MeshStandardMaterial({color:0x55402c,roughness:1});
 [-2.5,2.5].forEach(x=>[-1.7,1.7].forEach(z=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.22,2.8,.22),w);p.position.set(x,1.4,z);g.add(p)}));const roof=new THREE.Mesh(new THREE.BoxGeometry(5.8,.24,4.3),rm);roof.position.y=2.85;g.add(roof);
 const table=new THREE.Mesh(new THREE.BoxGeometry(3.4,.25,1.2),w);table.position.set(0,1,0);g.add(table);const pot=new THREE.Mesh(new THREE.CylinderGeometry(.55,.48,.55,12),new THREE.MeshStandardMaterial({color:0x55504a,metalness:.2,roughness:.6}));pot.position.set(0,1.45,0);g.add(pot);
 g.position.set(-8,0,-14);villageGroup.add(g);visualByKey.set('kitchen',g);buildRise(g,animate)}
function createWatch(animate=true){const g=new THREE.Group(),w=new THREE.MeshStandardMaterial({color:0x60462f,roughness:1});
 [-1.2,1.2].forEach(x=>[-1.2,1.2].forEach(z=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.24,5,.24),w);p.position.set(x,2.5,z);g.add(p)}));const d=new THREE.Mesh(new THREE.BoxGeometry(3.5,.3,3.5),w);d.position.y=4.6;g.add(d);const roof=new THREE.Mesh(new THREE.ConeGeometry(2.8,1.7,4),w);roof.position.y=5.8;roof.rotation.y=Math.PI/4;g.add(roof);
 g.position.set(-28,0,-3);villageGroup.add(g);visualByKey.set('watch',g);buildRise(g,animate)}
function createLoom(animate=true){const g=new THREE.Group(),w=new THREE.MeshStandardMaterial({color:0x725137,roughness:1}),c=new THREE.MeshStandardMaterial({color:0x9c8c6c,roughness:1,side:THREE.DoubleSide});
 for(const x of[-1.4,1.4]){const p=new THREE.Mesh(new THREE.BoxGeometry(.2,2.5,.2),w);p.position.set(x,1.25,0);g.add(p)}for(const y of[.4,2.2]){const b=new THREE.Mesh(new THREE.BoxGeometry(3,.18,.18),w);b.position.y=y;g.add(b)}
 const cl=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.4),c);cl.position.set(0,1.35,.06);g.add(cl);g.position.set(-18,0,-20);villageGroup.add(g);visualByKey.set('loom',g);buildRise(g,animate)}

function syncVillageVisuals(animate=false){
 const b=state.buildings;
 while(visualState.house<(b.house||0)){createHouse(visualState.house,animate);visualState.house++}
 while(visualState.field<(b.field||0)){createFieldPatch(visualState.field,animate);visualState.field++}
 if(b.storage>0&&!visualState.storage){createStorage(animate);visualState.storage=1}
 if(b.workshop>0&&!visualState.workshop){createWorkshop(animate);visualState.workshop=1}
 if(b.herb>0&&!visualState.herb){createHerbRack(animate);visualState.herb=1}
 if(b.pen>0&&!visualState.pen){createPen(animate);visualState.pen=1}
 if(b.meeting>0&&!visualState.meeting){createMeeting(animate);visualState.meeting=1}
 if(b.well>0&&!visualState.well){createWell(animate);visualState.well=1}
 if(b.kiln>0&&!visualState.kiln){createKiln(animate);visualState.kiln=1}
 if(b.kitchen>0&&!visualState.kitchen){createKitchen(animate);visualState.kitchen=1}
 if(b.watch>0&&!visualState.watch){createWatch(animate);visualState.watch=1}
 if(b.loom>0&&!visualState.loom){createLoom(animate);visualState.loom=1}
}
syncVillageVisuals(false);
// stones
for(let i=0;i<17;i++){const s=new THREE.Mesh(new THREE.DodecahedronGeometry(rand(.3,.8),0),new THREE.MeshStandardMaterial({color:0x77756d,roughness:1}));s.position.set(LOC.stone.x+rand(-6,6),rand(.2,.5),LOC.stone.z+rand(-5,5));s.scale.y=.65;s.castShadow=true;scene.add(s)}
// herbs
for(let i=0;i<25;i++){const h=new THREE.Mesh(new THREE.SphereGeometry(.18,6,5),new THREE.MeshStandardMaterial({color:i%3?0x6e9256:0x9a7ba1,roughness:1}));h.position.set(LOC.herbs.x+rand(-6,6),.18,LOC.herbs.z+rand(-5,5));scene.add(h)}

// Isometric survival-settlement dressing: small props make the world read like a lived-in camp.
const propGroup=new THREE.Group();scene.add(propGroup);
const propWood=new THREE.MeshStandardMaterial({color:0x705239,roughness:1});
const propGrass=new THREE.MeshStandardMaterial({color:0x5f754a,roughness:1});
for(let i=0;i<24;i++){
 const g=new THREE.Group();const n=3+Math.floor(Math.random()*3);
 for(let j=0;j<n;j++){const blade=new THREE.Mesh(new THREE.ConeGeometry(.08,.45,5),propGrass);blade.position.set(rand(-.22,.22),.22,rand(-.22,.22));blade.rotation.z=rand(-.22,.22);g.add(blade)}
 g.position.set(rand(-52,52),0,rand(-42,42));propGroup.add(g)
}
for(let i=0;i<8;i++){
 const log=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,2.3,7),propWood);log.rotation.z=Math.PI/2;log.rotation.y=rand(0,Math.PI);log.position.set(rand(-22,22),.22,rand(-20,20));log.castShadow=true;propGroup.add(log)
}


// ---------- NORMAL FAUNA / LIVESTOCK (not monsters) ----------
const animalGroup=new THREE.Group();scene.add(animalGroup);
const animals=[];
function createAnimalModel(species,{x=0,z=0,domestic=false,homeX=x,homeZ=z}={}){
 const g=new THREE.Group(),brown=new THREE.MeshStandardMaterial({color:species==='deer'?0x8d6643:species==='rabbit'?0xa99c84:species==='goat'?0xc8bca3:species==='boar'?0x57473b:species==='wolf'?0x69706b:0xb67d45,roughness:1}),dark=new THREE.MeshStandardMaterial({color:0x40372f,roughness:1}),light=new THREE.MeshStandardMaterial({color:0xe0d1b5,roughness:1});
 const scale=species==='deer'?1.22:species==='boar'?1.16:species==='wolf'?1.02:species==='goat'?.92:species==='chicken'?.54:.48;
 const body=new THREE.Mesh(new THREE.SphereGeometry(.38,10,7),brown);body.scale.set(1.35,.78,1.55);body.position.y=.62;g.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.25,9,7),brown);head.position.set(0,.88,.5);g.add(head);
 const legs=[];
 if(species==='chicken'){
   body.scale.set(1.1,.95,1.1);head.position.set(0,.95,.28);
   for(const x0 of[-.11,.11]){const l=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.34,5),dark);l.position.set(x0,.22,.05);g.add(l);legs.push(l)}
   const beak=new THREE.Mesh(new THREE.ConeGeometry(.06,.18,5),new THREE.MeshStandardMaterial({color:0xd0a64e,roughness:1}));beak.rotation.x=Math.PI/2;beak.position.set(0,.91,.52);g.add(beak)
 }else{
   for(const[x0,z0]of[[-.22,.28],[.22,.28],[-.22,-.3],[.22,-.3]]){const l=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.52,5),brown);l.position.set(x0,.3,z0);g.add(l);legs.push(l)}
 }
 if(species==='rabbit'){
   for(const x0 of[-.09,.09]){const ear=new THREE.Mesh(new THREE.CapsuleGeometry(.055,.34,3,6),brown);ear.position.set(x0,1.2,.4);ear.rotation.z=x0<0?.08:-.08;g.add(ear)}
 }else if(species==='deer'){
   for(const x0 of[-.16,.16]){const antler=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.45,5),dark);antler.position.set(x0,1.23,.43);antler.rotation.z=x0<0?-.18:.18;g.add(antler)}
 }else if(species==='boar'){
   head.scale.set(1.15,.82,1.22);head.position.set(0,.78,.67);
   for(const x0 of[-.14,.14]){const tusk=new THREE.Mesh(new THREE.ConeGeometry(.035,.24,5),light);tusk.position.set(x0,.72,.91);tusk.rotation.x=-1.12;tusk.rotation.z=x0<0?-.28:.28;g.add(tusk)}
 }else if(species==='wolf'){
   body.scale.set(1.55,.72,1.75);head.position.set(0,.9,.62);
   for(const x0 of[-.13,.13]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.09,.28,5),dark);ear.position.set(x0,1.18,.5);ear.rotation.z=x0<0?.18:-.18;g.add(ear)}
 }else if(species==='goat'){
   for(const x0 of[-.13,.13]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.045,.35,5),light);horn.position.set(x0,1.18,.42);horn.rotation.x=-.25;g.add(horn)}
 }
 g.position.set(x,0,z);g.scale.setScalar(scale);
 g.userData={animal:true,species,domestic,home:new THREE.Vector3(homeX,0,homeZ),target:new THREE.Vector3(x,0,z),speed:species==='deer'?1.95:species==='wolf'?1.85:species==='boar'?1.45:species==='rabbit'?1.55:species==='goat'?1.0:species==='chicken'?.82:.95,nextWander:0,phase:rand(0,10),legs,raid:false,dead:false,hp:species==='boar'?76:species==='wolf'?58:35,maxHp:species==='boar'?76:species==='wolf'?58:35};
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 animalGroup.add(g);animals.push(g);return g
}
function populateWildAnimals(){
 if(animals.some(a=>!a.userData.domestic))return;
 const wild=[
  ['rabbit',-42,30],['rabbit',-53,-18],['rabbit',44,37],['rabbit',65,-31],
  ['deer',-70,8],['deer',72,15],['deer',-34,-55]
 ];
 for(const[s,x,z]of wild)createAnimalModel(s,{x,z,domestic:false,homeX:x,homeZ:z});
 state.animalStats.wild=wild.length
}
function ensureDomesticAnimals(){
 if(!state.buildings.pen)return;
 const existing=animals.filter(a=>a.userData.domestic).length;
 const desired=6;
 if(existing>=desired)return;
 const defs=[['chicken',-2,-1],['chicken',1,-2],['chicken',2,1],['chicken',-1,2],['goat',-3,2],['goat',3,-1]];
 for(let i=existing;i<desired;i++){const[s,dx,dz]=defs[i];createAnimalModel(s,{x:LOC.pen.x+dx,z:LOC.pen.z+dz,domestic:true,homeX:LOC.pen.x,homeZ:LOC.pen.z})}
 state.animalStats.domestic=desired
}
function updateAnimals(dt,now){
 ensureDomesticAnimals();
 const b=localMapBounds();
 for(const a of animals){
  if(!a||!a.userData||!a.position)continue;
  const ud=a.userData;if(ud.raid||ud.dead)continue;
  const toPlayer=a.position.distanceTo(player.position);
  if(!ud.domestic&&toPlayer<5){
   const flee=a.position.clone().sub(player.position);flee.y=0;if(flee.lengthSq()<.01)flee.set(1,0,0);flee.normalize();
   ud.target=a.position.clone().addScaledVector(flee,10);
   ud.nextWander=now+rand(700,1500)
  }else if(now>ud.nextWander||a.position.distanceTo(ud.target)<.35){
   // Animals keep changing grazing/foraging points so the landscape feels alive.
   ud.nextWander=now+rand(850,2600);
   const radius=ud.domestic?7:(ud.species==='deer'?28:ud.species==='rabbit'?18:14);
   let cx=ud.home.x,cz=ud.home.z;
   // Wild animals occasionally cross near fields/forest/river without making every visit a raid.
   if(!ud.domestic&&Math.random()<.22){
     const spot=pick([LOC.field,LOC.forest,LOC.river,LOC.herbs]);
     cx=spot.x+rand(-12,12);cz=spot.z+rand(-12,12)
   }
   ud.target.set(clamp(cx+rand(-radius,radius),-b.x,b.x),0,clamp(cz+rand(-radius,radius),-b.z,b.z))
  }
  const d=ud.target.clone().sub(a.position);d.y=0;const dist=d.length();
  if(dist>.16){
   d.normalize();const sp=ud.speed*(toPlayer<5&&!ud.domestic?2.25:1);a.position.addScaledVector(d,sp*dt);a.rotation.y=Math.atan2(d.x,d.z);
   a.position.y=Math.sin(now*.006*sp+ud.phase)*.018;
   const swing=Math.sin(now*.012*sp+ud.phase)*.46;ud.legs.forEach((l,i)=>l.rotation.x=(i%2?swing:-swing))
  }else{
   a.position.y=0;
   ud.legs.forEach(l=>l.rotation.x=0)
  }
 }
}
populateWildAnimals();

const conflictHostiles=[];let activeConflict=null,hostileSeq=0;
function edgeSpawn(){
 const b=localMapBounds(),side=Math.floor(Math.random()*4);
 return side===0?new THREE.Vector3(-b.x+4,0,rand(-b.z*.75,b.z*.75)):side===1?new THREE.Vector3(b.x-4,0,rand(-b.z*.75,b.z*.75)):side===2?new THREE.Vector3(rand(-b.x*.75,b.x*.75),0,-b.z+4):new THREE.Vector3(rand(-b.x*.75,b.x*.75),0,b.z-4)
}
function addConflictHostile(g,type,target,attack){
 Object.assign(g.userData,{conflict:true,conflictId:`H${++hostileSeq}`,conflictType:type,targetPoint:target.clone(),attackPower:attack,attackCooldown:rand(.2,.9),loot:0,dead:false});
 conflictHostiles.push(g);return g
}
function raidAnimal(species,target){
 const s=edgeSpawn(),a=createAnimalModel(species,{x:s.x,z:s.z,homeX:s.x,homeZ:s.z});
 a.userData.raid=true;a.userData.speed=species==='wolf'?2.25:species==='boar'?1.8:1.5;a.userData.hp=a.userData.maxHp=species==='boar'?86:species==='wolf'?64:42;
 return addConflictHostile(a,'animal',target,species==='boar'?11:species==='wolf'?9:4)
}
function raiderHuman(country){
 const g=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0xc59070,roughness:.9}),cloth=new THREE.MeshStandardMaterial({color:0x75352f,roughness:.9}),dark=new THREE.MeshStandardMaterial({color:0x302b29,roughness:1});
 const torso=new THREE.Mesh(new THREE.CylinderGeometry(.34,.42,.95,8),cloth);torso.position.y=1.55;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.27,10,8),skin);head.position.y=2.32;g.add(head);
 const limbs={};for(const[name,x,y,h]of[['la',-.43,1.82,.72],['ra',.43,1.82,.72],['ll',-.18,1.0,.9],['rl',.18,1.0,.9]]){const p=new THREE.Group();p.position.set(x,y,0);const m=new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,h,6),name==='ll'||name==='rl'?dark:skin);m.position.y=-h/2;p.add(m);g.add(p);limbs[name]=p}
 const spear=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.8,5),new THREE.MeshStandardMaterial({color:0x8d9495,metalness:.35,roughness:.55}));spear.position.set(0,-.8,0);limbs.ra.add(spear);
 const s=edgeSpawn();g.position.copy(s);g.userData={raidHuman:true,country,name:`${country} 약탈대`,hp:100,maxHp:100,speed:2,limbs,phase:rand(0,10)};
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(g);return addConflictHostile(g,'human',state.buildings.storage?new THREE.Vector3(9,0,-14):LOC.center.clone(),13)
}
function aliveHostile(id){return conflictHostiles.find(h=>h.userData.conflictId===id&&!h.userData.dead)}
function defendersAvailable(){return state.residents.filter(r=>r.age>=16&&(r.health?.woundedUntil??-1)<=absDay()).sort((a,b)=>(b.skills?.경계||0)-(a.skills?.경계||0))}
function assignDefenders(n){
 let used=0;for(const r of defendersAvailable().slice(0,n)){const p=personMap.get(r.id);if(!p)continue;p.userData.combatOverride={targetId:null,cooldown:rand(0,.6)};used++}return used
}
function startAnimalRaid(kind='crop'){
 if(activeConflict)return false;
 const path=trajectorySummary();
 // Pastoral/ecology societies get fewer predator/foraging raids.
 const calm=clamp((state.trajectory.pastoral+state.trajectory.ecology)/180,0,.75);
 const species=kind==='livestock'?'wolf':Math.random()<.6?'boar':pick(['deer','rabbit']);
 let count=species==='boar'?3+Math.floor(Math.random()*4):species==='wolf'?3+Math.floor(Math.random()*3):5+Math.floor(Math.random()*4);
 count=Math.max(2,Math.round(count*(1-calm*.45)));
 const target=kind==='livestock'?LOC.pen.clone():LOC.field.clone(),hs=[];
 for(let i=0;i<count;i++)hs.push(raidAnimal(species,target));
 activeConflict={type:'animal',kind,species,title:`${species==='wolf'?'늑대 무리':species==='boar'?'멧돼지 떼':'야생동물'}의 ${kind==='livestock'?'사육장':'밭'} 습격`,ids:hs.map(h=>h.userData.conflictId),loot:0,started:performance.now(),defenders:assignDefenders(Math.min(6,2+Math.floor(state.residents.length/9)))};
 state.conflict.animalRaids++;state.conflict.lastAnimalRaidDay=absDay();addTrajectory('militarism',.7);addTrajectory('ecology',.3);
 addLog('warn',activeConflict.title,`${count}마리의 야생동물이 생활권 안으로 들어왔다. 주민들은 생산을 멈추고 농지와 사육장을 지키러 움직였다.`,'기록','동물도 배고픔과 서식지 변화에 따라 마을의 역사를 바꾼다.');
 return true
}
function startWarRaid(country){
 if(activeConflict)return false;const hs=[],count=Math.min(11,4+Math.floor(state.residents.length/8)+Math.floor(Math.random()*3));
 for(let i=0;i<count;i++)hs.push(raiderHuman(country));
 activeConflict={type:'war',country,title:`${country} 약탈대의 침공`,ids:hs.map(h=>h.userData.conflictId),loot:0,started:performance.now(),defenders:assignDefenders(Math.min(10,4+Math.floor(state.residents.length/7)))};
 state.conflict.warBattles++;state.conflict.lastBattleDay=absDay();addTrajectory('militarism',2);
 addLog('warn',activeConflict.title,`${country}의 무장대가 라엔 생활권 외곽을 넘어왔다. 외교 관계가 실제 3D 전투로 이어졌다.`,'기록','전쟁은 연표 이벤트가 아니라 누적된 관계와 선택의 결과다.');return true
}
function killHostile(h){if(!h||h.userData.dead)return;h.userData.dead=true;h.visible=false;if(h.userData.raidHuman)state.conflict.raidersDefeated++;else state.conflict.animalsRepelled++}
function woundResident(r,p){
 r.health.hp=0;r.health.woundedUntil=absDay()+Math.round(rand(10,32));state.conflict.wounded++;p.userData.combatOverride=null;p.userData.mode='resting';p.userData.workTimer=5;p.userData.task='부상 치료 중';
 memoryAdd(r,'injury',`${activeConflict?.title||'충돌'}에서 다쳤다.`,80);addTrajectory('cooperation',.3)
}
function updateDefenderCombat(p,dt,now){
 const ov=p.userData.combatOverride;if(!ov)return false;const r=state.residents.find(x=>x.id===p.userData.id);if(!r)return false;
 if((r.health?.woundedUntil??-1)>absDay()){p.userData.combatOverride=null;return false}
 let h=aliveHostile(ov.targetId);if(!h){h=conflictHostiles.find(x=>!x.userData.dead);ov.targetId=h?.userData.conflictId||null}if(!h){p.userData.combatOverride=null;return false}
 ov.cooldown=Math.max(0,(ov.cooldown||0)-dt);const d=h.position.clone().sub(p.position);d.y=0;const dist=d.length();p.userData.tool.visible=true;p.userData.task='마을 방어 중';
 if(dist>2){d.normalize();p.position.addScaledVector(d,(2.2+(r.skills?.경계||0)*.012)*dt);p.rotation.y=Math.atan2(d.x,d.z)}
 else{p.rotation.y=Math.atan2(d.x,d.z);p.userData.limbs.ra.rotation.x=-1.15+Math.sin(now*.026)*.65;if(ov.cooldown<=0){ov.cooldown=.8+Math.random()*.35;h.userData.hp-=7+(r.skills?.경계||0)*.09+(r.skills?.목공||0)*.03;if(h.userData.hp<=0)killHostile(h)}}
 return true
}
function hostileAct(h,dt,now){
 const u=h.userData;u.attackCooldown=Math.max(0,(u.attackCooldown||0)-dt);const defenders=people.filter(p=>p.userData.combatOverride);
 let nearest=null,nd=999;for(const p of defenders){const d=p.position.distanceTo(h.position);if(d<nd){nd=d;nearest=p}}
 if(nearest&&nd<2.05){if(u.attackCooldown<=0){u.attackCooldown=1+Math.random()*.65;const r=state.residents.find(x=>x.id===nearest.userData.id);if(r){r.health.hp=Math.max(0,r.health.hp-u.attackPower);if(r.health.hp<=0)woundResident(r,nearest)}}return}
 const d=u.targetPoint.clone().sub(h.position);d.y=0;
 if(d.length()>1.7){d.normalize();h.position.addScaledVector(d,(u.speed||1.5)*dt);h.rotation.y=Math.atan2(d.x,d.z);if(u.limbs){const s=Math.sin(now*.012+u.phase)*.5;u.limbs.la.rotation.x=s;u.limbs.ra.rotation.x=-s}}
 else if(u.attackCooldown<=0){u.attackCooldown=1.2+Math.random()*.8;const loss=u.conflictType==='animal'?(u.species==='boar'?1.1:u.species==='wolf'?.65:.35):1.0;state.resources.food=Math.max(0,state.resources.food-loss);state.conflict.foodLost+=loss;u.loot+=loss}
}
function finishConflict(victory){
 if(!activeConflict)return;const loss=activeConflict.loot.toFixed(1),title=victory?(activeConflict.type==='war'?'침공 격퇴':'야생동물 습격 격퇴'):'피해를 남기고 물러나다';
 addLog(victory?'good':'warn',title,`${activeConflict.title}이 끝났다. 식량·물자 손실 ${loss}. 부상과 방어 경험은 이후 주민들의 관계·경계·동물 대응 방식에 다시 영향을 준다.`,'기록',victory?'이번 결과도 다음 행동의 기억이 된다.':'피해를 기록해야 다음 선택이 달라진다.');
 for(const p of people)if(p.userData.combatOverride){p.userData.combatOverride=null;p.userData.mode='thinking'}
 for(const id of activeConflict.ids){const h=aliveHostile(id);if(h){h.userData.dead=true;h.visible=false}}
 activeConflict=null
}
function updateConflictSystem(dt,now){
 if(!activeConflict)return;let alive=0,loot=0;
 for(const id of activeConflict.ids){const h=aliveHostile(id);if(!h)continue;alive++;hostileAct(h,dt,now);loot+=h.userData.loot||0}
 activeConflict.loot=loot;if(alive===0)finishConflict(true);else if(loot>18||now-activeConflict.started>90000)finishConflict(false)
}
function maybeConflictsDaily(){
 if(activeConflict)return;
 const animalGap=absDay()-(state.conflict.lastAnimalRaidDay??-999);
 const calm=(state.trajectory.ecology+state.trajectory.pastoral)/200;
 if(state.flags.firstField&&animalGap>28&&Math.random()<.010*(1-calm*.55))startAnimalRaid('crop');
 else if(state.buildings.pen&&animalGap>32&&Math.random()<.005*(1-calm*.5))startAnimalRaid('livestock');
 const war=(state.world.wars||[]).find(w=>w.active&&w.country),battleGap=absDay()-(state.conflict.lastBattleDay??-999);
 if(war&&battleGap>38&&Math.random()<.014)startWarRaid(war.country)
}
function renderConflictHud(){
 const el=$('conflictHud');if(!el)return;if(!activeConflict){el.classList.add('hidden');return}el.classList.remove('hidden');
 const alive=activeConflict.ids.filter(id=>aliveHostile(id)).length,total=activeConflict.ids.length;
 $('conflictType').textContent=activeConflict.type==='war'?'전쟁':'생태 위협';$('conflictTitle').textContent=activeConflict.title;
 $('conflictStatus').textContent=`적대 ${alive}/${total} · 방어 ${people.filter(p=>p.userData.combatOverride).length} · 손실 ${activeConflict.loot.toFixed(1)}`;
 $('conflictBar').style.width=`${clamp(alive/Math.max(1,total)*100,0,100)}%`
}


// central fire
const fire=new THREE.Group();for(let i=0;i<6;i++){const l=new THREE.Mesh(new THREE.CylinderGeometry(.1,.13,1.8,6),new THREE.MeshStandardMaterial({color:0x493220}));l.rotation.z=Math.PI/2;l.rotation.y=i;fire.add(l)}const flame=new THREE.Mesh(new THREE.ConeGeometry(.42,1.25,9),new THREE.MeshStandardMaterial({color:0xff9a42,emissive:0xff6818,emissiveIntensity:2.2}));flame.position.y=.8;fire.add(flame);fire.position.set(0,0,-1);scene.add(fire);const fireLight=new THREE.PointLight(0xff8b3d,16,14,2);fireLight.position.set(0,2,-1);scene.add(fireLight);

// Player character: always exists. Level/EXP awaken when monsters appear in world year 55.
function createPlayerModel(){
 const g=new THREE.Group();
 const skin=new THREE.MeshStandardMaterial({color:0xd8a782,roughness:.9});
 const cloth=new THREE.MeshStandardMaterial({color:0x263246,roughness:.72,metalness:.08});
 const armor=new THREE.MeshStandardMaterial({color:0x58677f,roughness:.58,metalness:.25});
 const dark=new THREE.MeshStandardMaterial({color:0x1c222b,roughness:.95});
 const metal=new THREE.MeshStandardMaterial({color:0xc4ccd4,roughness:.38,metalness:.7});
 const gold=new THREE.MeshStandardMaterial({color:0xd7b96a,roughness:.45,metalness:.35});
 const torso=new THREE.Mesh(new THREE.CylinderGeometry(.36,.44,.96,8),cloth);torso.position.y=1.65;g.add(torso);
 const chest=new THREE.Mesh(new THREE.BoxGeometry(.68,.56,.4),armor);chest.position.set(0,1.72,.02);g.add(chest);
 const pelvis=new THREE.Mesh(new THREE.BoxGeometry(.58,.34,.35),dark);pelvis.position.y=1.08;g.add(pelvis);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.29,16,12),skin);head.position.y=2.49;g.add(head);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.305,12,8,0,Math.PI*2,0,Math.PI*.55),dark);hair.position.y=2.58;g.add(hair);
 const limbs={};
 function limb(name,x,y,mat,geo){
   const p=new THREE.Group();p.position.set(x,y,0);
   const m=new THREE.Mesh(geo,mat);m.position.y=-geo.parameters.height/2;p.add(m);g.add(p);limbs[name]=p;return p
 }
 const armGeo=new THREE.CylinderGeometry(.09,.08,.76,7),legGeo=new THREE.CylinderGeometry(.12,.10,.92,7);
 limb('la',-.44,1.98,skin,armGeo);limb('ra',.44,1.98,skin,armGeo);limb('ll',-.2,1.02,dark,legGeo);limb('rl',.2,1.02,dark,legGeo);
 const sword=new THREE.Group();
 const blade=new THREE.Mesh(new THREE.BoxGeometry(.07,.82,.04),metal);blade.position.y=-.48;
 const guard=new THREE.Mesh(new THREE.BoxGeometry(.34,.06,.08),gold);guard.position.y=-.05;
 const grip=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.28,6),dark);grip.position.y=.11;
 sword.add(blade,guard,grip);sword.position.set(0,-.58,.04);sword.rotation.z=-.08;limbs.ra.add(sword);
 const cape=new THREE.Mesh(new THREE.PlaneGeometry(.75,1.15),new THREE.MeshStandardMaterial({color:0x202735,roughness:1,side:THREE.DoubleSide}));
 cape.position.set(0,1.55,-.27);cape.rotation.x=.08;g.add(cape);
 const ring=new THREE.Mesh(new THREE.RingGeometry(.58,.72,32),new THREE.MeshBasicMaterial({color:0xe8d07f,transparent:true,opacity:.75,side:THREE.DoubleSide}));
 ring.rotation.x=-Math.PI/2;ring.position.y=.03;g.add(ring);
 g.position.set(state.player.x||3,0,state.player.z||3);
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 g.userData={limbs,parts:{torso,pelvis,head},sword,target:new THREE.Vector3(g.position.x,0,g.position.z),moving:false,attackCooldown:0,attackAnim:0,fsm:new StateMachine(PlayerStates.IDLE)};
 scene.add(g);return g
}
const player=createPlayerModel();

function makeFloatingNameSprite(text){
 const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');
 x.fillStyle='rgba(20,25,21,.78)';x.beginPath();if(x.roundRect)x.roundRect(44,8,168,46,18);else x.rect(44,8,168,46);x.fill();
 x.font='bold 26px -apple-system,system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#f3e2b9';x.fillText(text,128,31);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(2.4,.6,1);return s
}
function createBokshilModel(){
 const g=new THREE.Group();
 const fur=new THREE.MeshStandardMaterial({color:0xb8895d,roughness:1});
 const dark=new THREE.MeshStandardMaterial({color:0x4b3628,roughness:1});
 const cream=new THREE.MeshStandardMaterial({color:0xe0c39d,roughness:1});
 const collar=new THREE.MeshStandardMaterial({color:0x70524a,roughness:.8});
 const body=new THREE.Mesh(new THREE.SphereGeometry(.42,12,9),fur);body.scale.set(1.45,.72,1.8);body.position.y=.62;g.add(body);
 const chest=new THREE.Mesh(new THREE.SphereGeometry(.28,10,8),cream);chest.scale.set(.85,1.1,.55);chest.position.set(0,.66,.52);g.add(chest);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.34,12,9),fur);head.position.set(0,.91,.62);g.add(head);
 const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),cream);muzzle.scale.set(1,.68,.8);muzzle.position.set(0,.82,.91);g.add(muzzle);
 const nose=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),dark);nose.position.set(0,.86,1.08);g.add(nose);
 for(const x of[-.12,.12]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,7,5),dark);eye.position.set(x,1.01,.91);g.add(eye)}
 for(const x of[-.24,.24]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.11,.32,6),dark);ear.position.set(x,1.17,.55);ear.rotation.z=x<0?.35:-.35;g.add(ear)}
 const legs=[];
 for(const [x,z] of [[-.25,.37],[.25,.37],[-.25,-.38],[.25,-.38]]){
  const p=new THREE.Group();p.position.set(x,.48,z);
  const leg=new THREE.Mesh(new THREE.CylinderGeometry(.065,.075,.48,6),fur);leg.position.y=-.24;p.add(leg);g.add(p);legs.push(p)
 }
 const tailPivot=new THREE.Group();tailPivot.position.set(0,.75,-.72);g.add(tailPivot);
 const tail=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,.68,7),fur);tail.position.set(0,.25,-.08);tail.rotation.x=.78;tailPivot.add(tail);
 const neck=new THREE.Mesh(new THREE.TorusGeometry(.29,.035,6,18),collar);neck.rotation.x=Math.PI/2;neck.position.set(0,.83,.42);g.add(neck);
 const name=makeFloatingNameSprite('복실이');name.position.set(0,1.65,0);g.add(name);
 g.position.set(state.companion.bokshil.x,0,state.companion.bokshil.z);
 g.scale.setScalar(1.08);
 g.userData={bokshil:true,legs,tailPivot,phase:rand(0,10),target:g.position.clone(),patrolId:null,nextPatrolAt:0,barkCooldown:0,status:'주민들 사이를 순찰 중'};
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 scene.add(g);return g
}
const bokshil=createBokshilModel();
function bokshilResidentTarget(now){
 const ud=bokshil.userData;
 let p=ud.patrolId?personMap.get(ud.patrolId):null;
 if(!p||now>ud.nextPatrolAt){
   const candidates=people.filter(x=>x.visible!==false&&personMap.has(x.userData.id));
   if(candidates.length){
     // Prefer residents away from the center so Bokshil actually ranges through the village.
     candidates.sort((a,b)=>b.position.lengthSq()-a.position.lengthSq());
     const pool=candidates.slice(0,Math.max(3,Math.ceil(candidates.length*.55)));
     p=pick(pool);
     ud.patrolId=p.userData.id;
     ud.nextPatrolAt=now+rand(4200,9000)
   }else p=null
 }
 return p
}
function bokshilAnimalThreat(){
 if(!activeConflict||activeConflict.type!=='animal')return null;
 let best=null,bd=Infinity;
 for(const h of conflictHostiles){
   if(!h||!h.userData||h.userData.dead||!h.visible||h.userData.conflictType!=='animal')continue;
   const d=bokshil.position.distanceTo(h.position);
   if(d<bd){bd=d;best=h}
 }
 return best
}
function moveBokshilToward(desired,dt,now,speedBase=3.4){
 const ud=bokshil.userData,d=desired.clone().sub(bokshil.position);d.y=0;const dist=d.length();
 if(dist>18){bokshil.position.copy(desired);bokshil.position.y=0}
 else if(dist>.28){
   d.normalize();const speed=dist>7?Math.max(5.6,speedBase):dist>2.5?Math.max(4.0,speedBase):speedBase;
   bokshil.position.addScaledVector(d,speed*dt);bokshil.rotation.y=Math.atan2(d.x,d.z);
   const swing=Math.sin(now*.017*speed+ud.phase)*.58;
   ud.legs[0].rotation.x=swing;ud.legs[1].rotation.x=-swing;ud.legs[2].rotation.x=-swing;ud.legs[3].rotation.x=swing
 }else ud.legs.forEach(l=>l.rotation.x=0);
 return dist
}
function updateBokshil(dt,now){
 if(!state.companion?.bokshil?.active){bokshil.visible=false;return}
 bokshil.visible=true;
 const ud=bokshil.userData;
 ud.barkCooldown=Math.max(0,(ud.barkCooldown||0)-dt);

 // During an animal raid Bokshil leaves the residents and intercepts the closest animal first.
 const threat=bokshilAnimalThreat();
 if(threat){
   ud.status=`${threat.userData.species==='wolf'?'늑대':threat.userData.species==='boar'?'멧돼지':'야생동물'}을 막는 중`;
   const dist=moveBokshilToward(threat.position,dt,now,5.0);
   if(dist<1.65&&ud.barkCooldown<=0){
     ud.barkCooldown=.72;
     threat.userData.bokshilFear=(threat.userData.bokshilFear||0)+11;
     threat.userData.hp-=2.5;
     // Barking and rushing physically drives the animal back from the settlement.
     const push=threat.position.clone().sub(bokshil.position);push.y=0;
     if(push.lengthSq()<.01)push.set(1,0,0);push.normalize();
     threat.position.addScaledVector(push,1.6);
     threat.userData.targetPoint?.addScaledVector?.(push,.35);
     if(threat.userData.bokshilFear>=38||threat.userData.hp<=0){
       killHostile(threat);
       state.conflict.animalsRepelled=Math.max(state.conflict.animalsRepelled||0,0);
     }
   }
 }else{
   // Normal role: patrol between residents, never follow the observer/player.
   const resident=bokshilResidentTarget(now);
   if(resident){
     const r=state.residents.find(x=>x.id===resident.userData.id);
     ud.status=`${r?.name||'주민'} 곁을 순찰 중`;
     const side=new THREE.Vector3(Math.cos(resident.rotation.y)*1.25,0,-Math.sin(resident.rotation.y)*1.25);
     const behind=new THREE.Vector3(Math.sin(resident.rotation.y)*-.85,0,Math.cos(resident.rotation.y)*-.85);
     const desired=resident.position.clone().add(side).add(behind);
     desired.x+=Math.sin(now*.0008+ud.phase)*.35;desired.z+=Math.cos(now*.0007+ud.phase)*.35;
     moveBokshilToward(desired,dt,now,3.15)
   }else{
     ud.status='마을 중심을 순찰 중';
     const desired=LOC.center.clone();desired.x+=Math.sin(now*.0007)*4;desired.z+=Math.cos(now*.0006)*4;
     moveBokshilToward(desired,dt,now,2.8)
   }
 }
 ud.tailPivot.rotation.y=Math.sin(now*.014+ud.phase)*.7;
 ud.tailPivot.rotation.x=.12+Math.sin(now*.009)*.1;
 state.companion.bokshil.x=bokshil.position.x;state.companion.bokshil.z=bokshil.position.z
}


const monsterGroup=new THREE.Group();scene.add(monsterGroup);
const monsters=[];
let selectedMonster=null,monsterSpawnSeq=0;


function pickMonsterConfig(){
 const cfg=pick(MONSTER_CATALOG);
 return {...cfg};
}
function randomMonsterSpawn(){
 const a=Math.random()*Math.PI*2,r=rand(48,72);
 return new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r*.72)
}
function createMonster(){
 const cfg=pickMonsterConfig(),g=new THREE.Group(),lvl=Math.max(1,state.player.level+Math.floor(rand(-1,2)));
 const bodyMat=new THREE.MeshStandardMaterial({color:cfg.bodyColor||0x455846,roughness:.9});
 const dark=new THREE.MeshStandardMaterial({color:0x292c2b,roughness:1});
 const eye=new THREE.MeshBasicMaterial({color:0xff5e55});
 const body=new THREE.Mesh(new THREE.SphereGeometry(.82,12,9),bodyMat);body.scale.set(1.35,.85,1.65);body.position.y=1.05;g.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.48,10,8),bodyMat);head.position.set(0,1.35,1.05);g.add(head);
 [-.19,.19].forEach(x=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.055,6,5),eye);e.position.set(x,1.47,1.48);g.add(e)});
 for(const [x,z] of [[-.55,.5],[.55,.5],[-.55,-.55],[.55,-.55]]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,.8,6),dark);leg.position.set(x,.48,z);g.add(leg)}
 const hornMat=new THREE.MeshStandardMaterial({color:0xb9aa89,roughness:.8});
 [-.22,.22].forEach(x=>{const h=new THREE.Mesh(new THREE.ConeGeometry(.09,.45,6),hornMat);h.position.set(x,1.72,1.12);h.rotation.x=-.45;g.add(h)});
 const spawn=randomMonsterSpawn();g.position.copy(spawn);
 const maxHp=(cfg.baseHp||50)+lvl*(cfg.hpPerLevel||18);
 g.userData={
   monster:true,id:`M${++monsterSpawnSeq}`,type:cfg.id,name:cfg.name,level:lvl,maxHp,hp:maxHp,
   speed:(cfg.speed||1.4)+lvl*.02,scanRange:cfg.scanRange||10,attackRange:cfg.attackRange||2.2,
   leashRange:cfg.leashRange||20,attackPower:(cfg.attack||7)+lvl*(cfg.attackPerLevel||1),
   attackInterval:cfg.attackInterval||1.5,attackCooldown:rand(.2,.8),
   expBase:cfg.expBase||20,expPerLevel:cfg.expPerLevel||8,respawnMs:cfg.respawnMs||6500,
   spawnPos:spawn.clone(),dead:false,respawnAt:0,phase:rand(0,10),fsm:new StateMachine(MonsterStates.IDLE)
 };
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 monsterGroup.add(g);monsters.push(g);return g
}
function ensureMonsterEra(){
 if(state.year<55)return;
 if(!state.player.awakened){
   state.player.awakened=true;state.player.hp=state.player.maxHp;
   addLog('warn','관찰자의 각성','오랜 세월 분지 바깥에서 이어지던 이상 징후 끝에 처음으로 적대 생물이 확인되었다. 그 순간, 오직 관찰자에게만 전투 능력이 깨어났다.','SYSTEM','LV.1 — 전투 권한이 활성화되었습니다.');
 }
 while(monsters.length<5)createMonster();
}
function gainPlayerExp(n){
 state.player.exp+=n;
 while(state.player.exp>=state.player.nextExp){
   state.player.exp-=state.player.nextExp;state.player.level++;state.player.nextExp=CombatRules.nextExp(state.player.nextExp);
   state.player.maxHp+=12;state.player.hp=state.player.maxHp;state.player.attack+=3;
   showEvent(`LEVEL UP · LV.${state.player.level}`);
 }
}
function resetMonster(m){
 const ud=m.userData;
 ud.dead=false;ud.hp=ud.maxHp;ud.attackCooldown=rand(.2,.8);ud.respawnAt=0;
 ud.fsm.set(MonsterStates.IDLE);m.position.copy(ud.spawnPos);m.visible=true;
}
function killMonster(m){
 if(!m||m.userData.dead)return;
 const ud=m.userData;ud.dead=true;ud.fsm.set(MonsterStates.DEAD);m.visible=false;state.player.kills++;
 gainPlayerExp(CombatRules.expForMonster(ud.level,ud));
 ud.respawnAt=performance.now()+ud.respawnMs;
 if(selectedMonster===m)selectedMonster=null;
 addLog('good',`${ud.name} 사냥`,`관찰자가 분지 외곽에서 ${ud.name}을 쓰러뜨렸다. 주민들은 남겨진 가죽과 뿔을 새로운 재료로 살피기 시작했다.`,'SYSTEM',`사냥 기록 ${state.player.kills}회`);
}
function killPlayer(now=performance.now()){
 if(state.player.dead)return;
 state.player.dead=true;state.player.deaths=(state.player.deaths||0)+1;state.player.hp=0;
 state.player.autoHunt=false;state.player.respawnAt=now+CombatRules.playerRespawnMs;selectedMonster=null;
 player.userData.moving=false;player.userData.fsm.set(PlayerStates.DEAD);
 showEvent('쓰러졌습니다 · 잠시 후 마을에서 부활');
}
function respawnPlayer(){
 state.player.dead=false;state.player.hp=state.player.maxHp;state.player.respawnAt=0;
 player.position.set(0,0,3);player.userData.target.copy(player.position);player.userData.moving=false;
 player.userData.fsm.set(PlayerStates.IDLE);state.player.x=player.position.x;state.player.z=player.position.z;
 showEvent('마을에서 부활했습니다');
}
function nearestMonster(){
 let best=null,bd=Infinity;
 for(const m of monsters){if(m.userData.dead)continue;const d=m.position.distanceTo(player.position);if(d<bd){bd=d;best=m}}
 return best
}
function movePlayerTo(v){
 if(state.player.dead)return;
 const bounds=localMapBounds();v=v.clone();v.x=clamp(v.x,-bounds.x,bounds.x);v.z=clamp(v.z,-bounds.z,bounds.z);
 player.userData.target.copy(v);player.userData.target.y=0;player.userData.moving=true;selectedMonster=null;
 followId='PLAYER';if($('followSelect'))$('followSelect').value='PLAYER';if(camMode!=='follow')setCameraMode('follow');
 player.userData.fsm.set(PlayerStates.MOVING)
}
function setMonsterTarget(m){
 if(!state.player.awakened||state.player.dead||!m||m.userData.dead)return;
 selectedMonster=m;player.userData.moving=false;player.userData.fsm.set(PlayerStates.MOVING)
}
function updatePlayer(dt,now){
 ensureMonsterEra();
 const ud=player.userData,scale=state.speed===20?2.2:state.speed===5?1.5:1;
 if(state.player.dead){
   ud.fsm.set(PlayerStates.DEAD);ud.limbs.ra.rotation.x=ud.limbs.la.rotation.x=0;
   if(now>=state.player.respawnAt)respawnPlayer();
   return
 }
 ud.attackCooldown=Math.max(0,ud.attackCooldown-dt*scale);
 ud.attackAnim=Math.max(0,ud.attackAnim-dt*scale);

 // Direct joystick control always wins over tap movement and AUTO hunting.
 if(manualMove.active){
   state.player.autoHunt=false;selectedMonster=null;ud.moving=false;
   const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;
   if(forward.lengthSq()<.001)forward.set(0,0,-1);forward.normalize();
   const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
   const d=forward.multiplyScalar(manualMove.y).add(right.multiplyScalar(manualMove.x));
   const mag=clamp(d.length(),0,1);
   if(mag>.04){
     d.normalize();ud.fsm.set(PlayerStates.MOVING);
     player.position.addScaledVector(d,CombatRules.playerMoveSpeed*(.55+.45*mag)*scale*dt);
     const bounds=localMapBounds();player.position.x=clamp(player.position.x,-bounds.x,bounds.x);player.position.z=clamp(player.position.z,-bounds.z,bounds.z);
     player.rotation.y=Math.atan2(d.x,d.z);
     const swing=Math.sin(now*.014*4*scale)*.62*mag;
     ud.limbs.la.rotation.x=swing;ud.limbs.ra.rotation.x=-swing*.65;
     ud.limbs.ll.rotation.x=-swing*.78;ud.limbs.rl.rotation.x=swing*.78;
     state.player.x=player.position.x;state.player.z=player.position.z;
     followId='PLAYER';if($('followSelect'))$('followSelect').value='PLAYER';if(camMode!=='follow')setCameraMode('follow');
     return
   }
 }

 if(state.player.autoHunt&&state.player.awakened&&(!selectedMonster||selectedMonster.userData.dead))selectedMonster=nearestMonster();

 let target=selectedMonster&&!selectedMonster.userData.dead?selectedMonster.position:ud.target;
 const dist=player.position.distanceTo(target);
 const wantsCombat=!!(selectedMonster&&!selectedMonster.userData.dead);
 const stop=wantsCombat?CombatRules.playerAttackRange:.28;

 if((wantsCombat||ud.moving)&&dist>stop){
   ud.fsm.set(PlayerStates.MOVING);
   const d=target.clone().sub(player.position);d.y=0;d.normalize();
   player.position.addScaledVector(d,CombatRules.playerMoveSpeed*scale*dt);player.rotation.y=Math.atan2(d.x,d.z);
   const swing=Math.sin(now*.011*4*scale)*.58;ud.limbs.la.rotation.x=swing;ud.limbs.ra.rotation.x=-swing*.6;ud.limbs.ll.rotation.x=-swing*.78;ud.limbs.rl.rotation.x=swing*.78;
 }else{
   ud.limbs.ll.rotation.x=ud.limbs.rl.rotation.x=0;ud.limbs.la.rotation.x=0;
   if(!wantsCombat){ud.moving=false;ud.fsm.set(PlayerStates.IDLE)}
   if(wantsCombat){
     ud.fsm.set(PlayerStates.ATTACK);
     const d=selectedMonster.position.clone().sub(player.position);player.rotation.y=Math.atan2(d.x,d.z);
     if(ud.attackCooldown<=0){
       ud.attackCooldown=CombatRules.playerAttackInterval;ud.attackAnim=.32;
       selectedMonster.userData.hp-=CombatRules.playerDamage(state.player.attack);
       if(selectedMonster.userData.hp<=0)killMonster(selectedMonster)
     }
     const p=ud.attackAnim>0?Math.sin((.32-ud.attackAnim)/.32*Math.PI):0;
     ud.limbs.ra.rotation.x=-.35-p*1.75;ud.limbs.ra.rotation.z=-.12-p*.28;
   }else ud.limbs.ra.rotation.x=0
 }

 state.player.x=player.position.x;state.player.z=player.position.z;
 if(state.player.hp<state.player.maxHp&&!selectedMonster)state.player.hp=Math.min(state.player.maxHp,state.player.hp+dt*1.2)
}
function updateMonsters(dt,now){
 if(state.year<55||!state.player.awakened)return;
 const speedScale=state.speed===20?1.8:state.speed===5?1.35:1;
 for(const m of monsters){
   const ud=m.userData;
   if(ud.dead){
     if(now>=ud.respawnAt)resetMonster(m);
     continue
   }
   ud.attackCooldown=Math.max(0,ud.attackCooldown-dt*speedScale);
   const dToPlayer=m.position.distanceTo(player.position);
   const dToSpawn=m.position.distanceTo(ud.spawnPos);

   if(state.player.dead){
     if(!ud.fsm.is(MonsterStates.RETURN))ud.fsm.set(MonsterStates.RETURN)
   }else if(ud.fsm.is(MonsterStates.IDLE)){
     if(dToPlayer<=ud.scanRange)ud.fsm.set(MonsterStates.CHASE)
   }else if(ud.fsm.is(MonsterStates.CHASE)){
     if(dToSpawn>ud.leashRange||dToPlayer>ud.scanRange*1.55)ud.fsm.set(MonsterStates.RETURN);
     else if(dToPlayer<=ud.attackRange)ud.fsm.set(MonsterStates.ATTACK)
   }else if(ud.fsm.is(MonsterStates.ATTACK)){
     if(dToSpawn>ud.leashRange)ud.fsm.set(MonsterStates.RETURN);
     else if(dToPlayer>ud.attackRange*1.18)ud.fsm.set(MonsterStates.CHASE)
   }

   if(ud.fsm.is(MonsterStates.CHASE)){
     const d=player.position.clone().sub(m.position);d.y=0;if(d.lengthSq()>.001){d.normalize();m.position.addScaledVector(d,ud.speed*speedScale*dt);m.rotation.y=Math.atan2(d.x,d.z)}
   }else if(ud.fsm.is(MonsterStates.ATTACK)){
     const d=player.position.clone().sub(m.position);d.y=0;if(d.lengthSq()>.001)m.rotation.y=Math.atan2(d.x,d.z);
     if(ud.attackCooldown<=0&&dToPlayer<=ud.attackRange*1.12){
       ud.attackCooldown=ud.attackInterval;
       state.player.hp=Math.max(0,state.player.hp-CombatRules.monsterDamage(ud.attackPower,ud.level));
       if(state.player.hp<=0)killPlayer(now)
     }
   }else if(ud.fsm.is(MonsterStates.RETURN)){
     const d=ud.spawnPos.clone().sub(m.position);d.y=0;
     if(d.length()<=.55){m.position.copy(ud.spawnPos);ud.fsm.set(MonsterStates.IDLE)}
     else{d.normalize();m.position.addScaledVector(d,ud.speed*1.15*speedScale*dt);m.rotation.y=Math.atan2(d.x,d.z)}
   }else if(ud.fsm.is(MonsterStates.IDLE)){
     m.rotation.y+=Math.sin(now*.0008+ud.phase)*dt*.08
   }
   m.position.y=Math.sin(now*.004+ud.phase)*.025
 }
}

// Detailed stylized humanoids
function makeWorkTool(job){
 const tool=new THREE.Group(); tool.visible=false;
 const wood=new THREE.MeshStandardMaterial({color:0x684a30,roughness:1});
 const metal=new THREE.MeshStandardMaterial({color:0x777c78,roughness:.65,metalness:.15});
 const basketMat=new THREE.MeshStandardMaterial({color:0xa47a49,roughness:1});
 const paper=new THREE.MeshStandardMaterial({color:0xd8c79c,roughness:1,side:THREE.DoubleSide});
 if(job.includes('수로')||job==='목수'){
   const handle=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.72,6),wood);handle.position.y=-.36;
   const blade=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.07),metal);blade.position.set(.13,-.68,0);blade.rotation.z=.2;
   tool.add(handle,blade);
 }else if(job.includes('농지')||job.includes('씨앗')||job==='농부'){
   const handle=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.82,6),wood);handle.position.y=-.42;
   const blade=new THREE.Mesh(new THREE.BoxGeometry(.32,.08,.18),metal);blade.position.set(0,-.81,.09);blade.rotation.x=.45;
   tool.add(handle,blade);
 }else if(job.includes('부엌')||job==='요리사'){
   const handle=new THREE.Mesh(new THREE.CylinderGeometry(.018,.022,.62,6),wood);handle.position.y=-.32;
   const bowl=new THREE.Mesh(new THREE.SphereGeometry(.10,8,5,0,Math.PI*2,0,Math.PI/2),metal);bowl.position.y=-.63;bowl.rotation.x=Math.PI;
   tool.add(handle,bowl);
 }else if(job.includes('경영')||job==='기록자'){
   const sheet=new THREE.Mesh(new THREE.PlaneGeometry(.38,.46),paper);sheet.position.set(0,-.58,.05);sheet.rotation.x=-.25;
   const stick=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.36,5),wood);stick.position.set(.22,-.52,.02);stick.rotation.z=.25;
   tool.add(sheet,stick);
 }else if(job.includes('동물')||job==='사육사'){
   const bucket=new THREE.Mesh(new THREE.CylinderGeometry(.18,.14,.28,10,1,true),metal);bucket.position.y=-.64;
   const handle=new THREE.Mesh(new THREE.TorusGeometry(.17,.015,5,12,Math.PI),metal);handle.position.y=-.5;handle.rotation.x=Math.PI/2;
   tool.add(bucket,handle);
 }else{
   const basket=new THREE.Mesh(new THREE.CylinderGeometry(.22,.17,.25,10,1,true),basketMat);basket.position.y=-.66;
   const rim=new THREE.Mesh(new THREE.TorusGeometry(.21,.025,6,12),basketMat);rim.position.y=-.52;rim.rotation.x=Math.PI/2;
   tool.add(basket,rim);
 }
 tool.traverse(o=>{if(o.isMesh)o.castShadow=true});
 return tool;
}


function thoughtTexture(icon='…'){
 const c=document.createElement('canvas');c.width=128;c.height=128;const x=c.getContext('2d');
 x.clearRect(0,0,128,128);x.fillStyle='rgba(31,35,31,.88)';x.beginPath();if(x.roundRect)x.roundRect(13,12,102,82,22);else x.rect(13,12,102,82);x.fill();
 x.fillStyle='rgba(31,35,31,.88)';x.beginPath();x.moveTo(54,92);x.lineTo(66,116);x.lineTo(78,92);x.fill();
 x.font='54px system-ui,Apple Color Emoji,Segoe UI Emoji';x.textAlign='center';x.textBaseline='middle';x.fillText(icon,64,53);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex
}
function makeThoughtSprite(){
 const mat=new THREE.SpriteMaterial({map:thoughtTexture('…'),transparent:true,depthTest:false});
 const s=new THREE.Sprite(mat);s.scale.set(1.45,1.45,1);s.position.set(0,3.45,0);s.renderOrder=12;return s
}
function setThoughtIcon(ud,icon){
 if(!ud.thoughtSprite)return;
 if(ud.lastIcon===icon)return;ud.lastIcon=icon;
 const old=ud.thoughtSprite.material.map;ud.thoughtSprite.material.map=thoughtTexture(icon);ud.thoughtSprite.material.needsUpdate=true;if(old)old.dispose();
}

function humanModel(r){
 const g=new THREE.Group();
 const skin=new THREE.MeshStandardMaterial({color:0xd4a47f,roughness:.92}),
       cloth=new THREE.MeshStandardMaterial({color:r.color,roughness:.95}),
       dark=new THREE.MeshStandardMaterial({color:0x44372f,roughness:1}),
       hairMat=new THREE.MeshStandardMaterial({color:r.id==='C0001'?0x6b655e:0x3c3029,roughness:1});

 const pelvis=new THREE.Mesh(new THREE.BoxGeometry(.58,.35,.34),cloth);pelvis.position.y=1.05;g.add(pelvis);
 const torso=new THREE.Mesh(new THREE.CylinderGeometry(.34,.43,.92,8),cloth);torso.position.y=1.63;g.add(torso);
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(.1,.11,.16,8),skin);neck.position.y=2.16;g.add(neck);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.29,16,12),skin);head.position.y=2.48;head.scale.y=1.1;g.add(head);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.305,12,8,0,Math.PI*2,0,Math.PI*.52),hairMat);hair.position.set(0,2.57,-.01);g.add(hair);
 const nose=new THREE.Mesh(new THREE.ConeGeometry(.045,.13,6),skin);nose.rotation.x=Math.PI/2;nose.position.set(0,2.47,.285);g.add(nose);
 const eyeMat=new THREE.MeshBasicMaterial({color:0x211b18});
 [-.09,.09].forEach(x=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.018,6,5),eyeMat);e.position.set(x,2.53,.275);g.add(e)});

 const limbs={};
 function limb(name,x,y,mat,geo){
   const pivot=new THREE.Group();pivot.position.set(x,y,0);
   const mesh=new THREE.Mesh(geo,mat);mesh.position.y=-geo.parameters.height/2;
   pivot.add(mesh);g.add(pivot);limbs[name]=pivot;return pivot
 }
 const armGeo=new THREE.CylinderGeometry(.09,.08,.75,7),legGeo=new THREE.CylinderGeometry(.12,.10,.9,7);
 limb('la',-.43,1.95,skin,armGeo);limb('ra',.43,1.95,skin,armGeo);
 limb('ll',-.2,1.0,dark,legGeo);limb('rl',.2,1.0,dark,legGeo);
 const footG=new THREE.BoxGeometry(.21,.13,.38);
 ['lf','rf'].forEach((n,i)=>{const f=new THREE.Mesh(footG,dark);f.position.set(i?.2:-.2,.08,.09);g.add(f)});

 const tool=makeWorkTool(r.job);
 limbs.ra.add(tool);
 tool.position.set(0,-.02,.02);
 const thoughtSprite=makeThoughtSprite();g.add(thoughtSprite);

 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 g.userData={
   ...r,limbs,parts:{pelvis,torso,head,neck},tool,
   home:new THREE.Vector3(rand(-8,8),0,rand(-2,9)),
   task:'대기',target:new THREE.Vector3(),speed:rand(1.5,2.1),
   phase:rand(0,10),mode:'thinking',nextMode:'working',workTimer:0,workPulse:0,thoughtSprite,lastIcon:'…',action:'learn',partnerId:null,decision:null
 };
 g.position.copy(g.userData.home);const age=Number(r.age||0),bodyScale=bodyScaleForAge(age);g.scale.setScalar(bodyScale);scene.add(g);return g
}
const people=state.residents.map(humanModel);const personMap=new Map(people.map(p=>[p.userData.id,p]));

let myeongjaGrave=null;
function ensureMyeongjaGraveVisual(){
 if(!state.flags.myeongjaDead||myeongjaGrave)return;
 const g=new THREE.Group(),stoneM=new THREE.MeshStandardMaterial({color:0x777268,roughness:1}),earthM=new THREE.MeshStandardMaterial({color:0x574634,roughness:1});
 const earth=new THREE.Mesh(new THREE.BoxGeometry(2.1,.14,1.1),earthM);earth.position.y=.07;g.add(earth);
 const stone=new THREE.Mesh(new THREE.BoxGeometry(.64,1.05,.22),stoneM);stone.position.set(0,.58,-.15);stone.rotation.z=-.025;g.add(stone);
 const name=makeFloatingNameSprite('이명자 · 3년 1일');name.position.set(0,1.5,0);name.scale.set(3.2,.62,1);g.add(name);
 g.position.set(-9,0,10);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(g);myeongjaGrave=g
}
function removeResidentVisual(id){
 const p=personMap.get(id);if(!p)return;
 scene.remove(p);personMap.delete(id);const i=people.indexOf(p);if(i>=0)people.splice(i,1)
}
function processMyeongjaLifecycle(){
 if(!isMyeongjaDeathTime(state.year,state.day)||state.flags.myeongjaDead)return false;
 state.flags.myeongjaDead=true;state.flags.myeongjaDeathLogged=true;
 if(!state.deceased.some(d=>d.id==='C0001'))state.deceased.push({id:'C0001',name:'이명자',year:3,day:1,cause:'말기 암'});
 state.residents=state.residents.filter(r=>r.id!=='C0001');removeResidentVisual('C0001');
 if(followId==='C0001'){followId='PLAYER';setCameraMode('follow')}
 refreshFollowSelect();ensureMyeongjaGraveVisual();
 const path=trajectorySummary();
 addLog('story','이명자의 마지막 날',`말기 암을 앓던 이명자가 세계력 3년 1일 숨을 거뒀다. 그러나 그가 남긴 마을은 하나의 정답으로 굳지 않았다. 지금까지 주민들의 선택은 ‘${path.name}’ 성향을 가장 강하게 만들었고, 이후 역사는 그들이 무엇을 반복하고 무엇을 버리느냐에 따라 달라진다.`,'기록','이제부터의 문명은 남은 사람들이 선택한다.');
 uiDirty=true;save();return true
}
ensureMyeongjaGraveVisual();


function refreshFollowSelect(){const current=followId||'PLAYER';$('followSelect').innerHTML=`<option value="PLAYER">⚔ 나 · 관찰자</option><option value="BOKSHIL">🐕 복실이 · 마을 순찰</option>`+state.residents.map(r=>`<option value="${r.id}">${r.name} · ${r.job}</option>`).join('');if(current==='PLAYER'||current==='BOKSHIL'||personMap.has(current))$('followSelect').value=current}
function spawnResidentVisual(r){if(personMap.has(r.id))return personMap.get(r.id);const p=humanModel(r);people.push(p);personMap.set(r.id,p);return p}

function bodyScaleForAge(age){return age<3?.42:age<7?.54:age<12?.68:age<16?.84:1}
function updateLifeStages(){
 for(const r of state.residents){
  const c=OFFICIAL_BY_ID.get(r.id);if(c&&c.birth>=0)r.age=Math.max(0,state.year-c.birth);
  const oldStage=r.lifeStage||residentLifeStage(r.age||0),stage=residentLifeStage(r.age||0);r.lifeStage=stage;
  if(stage!==oldStage){
   if(stage==='견습기'){r.job='견습생';memoryAdd(r,'growth','어른들의 일을 가까이에서 배우기 시작했다.',62);if(minorStoryAllowed('coming-age-apprentice',35))addLog('good',`${r.name}, 견습기에 들다`,`${r.name}이 아이들의 일에서 한 걸음 나와 어른들의 작업을 가까이에서 배우기 시작했다.`,r.name,'먼저 보고, 모르면 묻자.')}
   if(stage==='성인'&&(r.job==='아이'||r.job==='견습생')){r.job=r.careerSeed||r.originJob||'주민';memoryAdd(r,'growth',`${r.job} 일을 본격적으로 맡기 시작했다.`,72);addLog('story',`${r.name}, 자기 일을 맡다`,`${r.name}이 성장해 ${r.job} 일을 본격적으로 맡기 시작했다. 어린 시절의 관찰과 실패가 이제 실제 선택으로 이어진다.`,r.name,'내가 잘하는 것보다 계속 해낼 수 있는 일을 찾고 싶어.')}
  }
  const p=personMap.get(r.id);if(p){const sc=bodyScaleForAge((r.age||0)+(state.day-1)/365);p.scale.setScalar(sc);p.userData.job=r.job}
 }
}

function syncOfficialPopulationRuntime(announce=true){
 const existing=new Set(state.residents.map(r=>r.id));let added=0;
 for(const c of OFFICIAL_LOCAL_CATALOG){if(existing.has(c.id)||!officialEligible(c,state.year,state.day))continue;const r=officialResident(c,state.year);state.residents.push(r);spawnResidentVisual(r);existing.add(c.id);added++;
  if(c.birth>=0&&state.year===c.birth){state.demography.births++;state.worldPopulation++;if(announce)addLog('story',`${r.name}의 첫 울음`,`감나무뜰의 한 가구에 아이가 태어났다. 아직 맡은 일도 업적도 없는 ${r.name}에게 필요한 것은 먹을 것과 잠자리, 그리고 함께 자랄 사람들이었다.`,r.name,'')}
  else{state.demography.arrivals++;if(announce)addLog('good',`${r.name}, 감나무뜰에 합류`,`${r.name}이 생활권 안으로 들어왔다. 주민 수가 늘면서 잠자리와 식량, 물길을 다시 나눠야 했다.`,r.name,r.surfaceTrait||'')}
 }
 state.demography.children=state.residents.filter(r=>r.age<16).length;if(added)refreshFollowSelect();return added
}
let selectedBrainId=null;

function actionTarget(action,r,partner=null){
 if(action==='eat'||action==='cook'||action==='socialize')return LOC.center.clone().add(new THREE.Vector3(rand(-3,3),0,rand(-3,3)));
 if(action==='rest')return personMap.get(r.id)?.userData.home.clone()||LOC.center.clone();
 if(action==='forage')return LOC.herbs.clone().add(new THREE.Vector3(rand(-5,5),0,rand(-4,4)));
 if(action==='water'||action==='waterwork')return LOC.river.clone().add(new THREE.Vector3(rand(-5,2),0,rand(-5,5)));
 if(action==='wood')return LOC.forest.clone().add(new THREE.Vector3(rand(-5,5),0,rand(-5,5)));
 if(action==='stone')return LOC.stone.clone().add(new THREE.Vector3(rand(-5,5),0,rand(-5,5)));
 if(action==='farm')return LOC.field.clone().add(new THREE.Vector3(rand(-5,5),0,rand(-5,5)));
 if(action==='animals')return LOC.pen.clone().add(new THREE.Vector3(rand(-4,4),0,rand(-4,4)));
 if(action==='pottery'||action==='record')return (state.buildings.workshop?LOC.workshop:LOC.meeting).clone().add(new THREE.Vector3(rand(-2,2),0,rand(-2,2)));
 if(action==='build'){
   const need=Math.max(2,Math.ceil(state.residents.length/3));
   if((state.buildings.house||0)<need){const s=HOUSE_SPOTS[(state.buildings.house||0)%HOUSE_SPOTS.length];return new THREE.Vector3(s[0],0,s[1])}
   if(!state.buildings.storage)return new THREE.Vector3(9,0,-14);
   return LOC.workshop.clone()
 }
 if(action==='help'&&partner)return partner.position.clone();
 if(action==='learn')return LOC.meeting.clone().add(new THREE.Vector3(rand(-4,4),0,rand(-4,4)));
 if(action==='explore'){const a=rand(0,Math.PI*2),rr=rand(28,48);return new THREE.Vector3(Math.cos(a)*rr,0,Math.sin(a)*rr*.72)}
 return LOC.center.clone()
}
function scarcity(v,target){return clamp((target-v)/target,0,1)*100}
function roleFit(r,action){
 const s=r.skills||{};
 const map={forage:['채집','농업'],water:['채집','농업'],wood:['목공','채집'],stone:['채집','목공'],farm:['농업','채집'],cook:['요리','농업'],animals:['사육','채집'],waterwork:['목공','농업'],pottery:['도공','목공'],record:['기록','농업'],build:['목공','도공'],explore:['채집','기록'],help:['요리','사육'],learn:['기록','채집']};
 const ks=map[action]||[];if(!ks.length)return 0;return ks.reduce((a,k)=>a+(s[k]||0),0)/ks.length
}
function desiredActionByJob(r){
 const j=r.job||'';
 if(j.includes('농지')||j.includes('씨앗'))return 'farm';
 if(j.includes('수로'))return 'waterwork';
 if(j.includes('부엌'))return 'cook';
 if(j.includes('동물'))return 'animals';
 if(j.includes('도공'))return 'pottery';
 if(j.includes('경영'))return 'record';
 return 'forage'
}
function choosePartner(r,preferNeed=false){
 let best=null,bestScore=-1;
 for(const o of state.residents){if(o.id===r.id)continue;
   const rel=relState(r,o.id),need=preferNeed?((o.needs?.fatigue||0)+(o.needs?.hunger||0))*.35:0;
   const score=(rel.affinity||50)*.45+(rel.trust||50)*.3+need+Math.random()*10;
   if(score>bestScore){best=o;bestScore=score}
 }return best
}
function thoughtFor(r,a,ctx){
 const n=r.needs,p=r.personality;
 const lines={
  eat:`배가 고프다. 조금 먹고 나서 다시 움직이자.`,
  rest:`지금 무리하면 다음 일이 더 늦어진다. 잠깐 쉬자.`,
  socialize:`혼자 생각하는 것보다 ${ctx.partner?.name||'누군가'}와 얘기해보는 게 낫겠다.`,
  help:`${ctx.partner?.name||'저 사람'}이 혼자 하기엔 버거워 보인다.`,
  forage:`먹을 것과 쓸 만한 풀을 더 찾아두자.`,
  water:`물통이 가벼워지고 있다. 먼저 채워두는 편이 안전하다.`,
  wood:`지을 것도 고칠 것도 많다. 목재를 더 모으자.`,
  stone:`기초에 쓸 돌이 부족하다. 가까운 돌밭부터 보자.`,
  farm:`흙 상태를 한번 더 보고 손볼 곳을 찾자.`,
  cook:`먹는 게 엉키면 하루 전체가 엉킨다. 먼저 끓여두자.`,
  animals:`생물의 상태부터 살펴야 한다. 억지로 몰면 더 나빠진다.`,
  waterwork:`물은 한번 막히면 모두가 곤란해진다. 흐름부터 확인하자.`,
  pottery:`보관할 그릇이 더 필요하다. 깨지지 않게 다시 만들어보자.`,
  record:`오늘 달라진 걸 적어두자. 다음 사람이 같은 실수를 덜 하게.`,
  build:`사람이 늘면 머물 곳도 늘어야 한다. 손을 보태자.`,
  explore:`저쪽은 아직 제대로 본 적이 없다. 위험하지 않은 선까지 확인해보자.`,
  learn:`지금은 직접 하기보다 보고 배우는 편이 낫겠다.`
 };
 return lines[a]||'지금 가장 필요한 일을 하자.'
}
function reasonFor(r,a,score,ctx){
 const n=r.needs,p=r.personality,parts=[];
 if(a==='eat')parts.push(`배고픔 ${Math.round(n.hunger)}`);
 if(a==='rest')parts.push(`피로 ${Math.round(n.fatigue)}`);
 if(a==='socialize'||a==='help')parts.push(`사회욕구 ${Math.round(n.social)}`,`친화성 ${p.agreeableness}`);
 if(a==='explore')parts.push(`호기심 ${Math.round(n.curiosity)}`,`개방성 ${p.openness}`);
 if(['forage','farm','cook'].includes(a)&&state.resources.food<35)parts.push(`식량 부족 ${Math.floor(state.resources.food)}`);
 if(['water','waterwork'].includes(a)&&state.resources.water<35)parts.push(`물 부족 ${Math.floor(state.resources.water)}`);
 if(['wood','build'].includes(a))parts.push(`목공 적합 ${Math.round(roleFit(r,a))}`);
 if(a==='stone')parts.push(`돌 보유 ${Math.floor(state.resources.stone)}`);
 if(a==='record')parts.push(`기록 적합 ${Math.round(roleFit(r,a))}`);
 if(a==='pottery')parts.push(`도공 적합 ${Math.round(roleFit(r,a))}`);
 if(a==='animals')parts.push(`사육 적합 ${Math.round(roleFit(r,a))}`);
 parts.push(`판단점수 ${Math.round(score)}`);
 return parts.join(' + ')
}

function careerGoalAction(r){
 const seed=(r.careerSeed||r.originJob||'')+' '+(r.field||'')+' '+(r.trueDesire||'');
 if(/농지|씨앗|농업|굶/.test(seed))return'farm';
 if(/수로|물|건축|구조/.test(seed))return'waterwork';
 if(/부엌|요리|먹/.test(seed))return'cook';
 if(/동물|사육|생명/.test(seed))return'animals';
 if(/도공|가마|그릇/.test(seed))return'pottery';
 if(/기록|교육|법|행정/.test(seed))return'record';
 if(/탐사|길|경계/.test(seed))return'explore';
 return'learn'
}
function goalLabel(r){
 const a=careerGoalAction(r),m=ACTION_META[a]?.label||'배움';
 if((r.age||0)<12)return'안전하게 자라고 주변을 배우기';
 if((r.age||0)<16)return`어른들의 일을 보며 ${m} 익히기`;
 return r.trueDesire?`${r.trueDesire}`:`${m}을 잘 해내기`
}
function repetitionPenalty(r,a){
 const recent=r.recentActions||[];let p=0;
 if(recent[0]===a)p+=24;
 p+=recent.slice(0,5).filter(x=>x===a).length*7;
 return p
}
function memoryActionBias(r,a){
 let b=0;
 for(const m of (r.memories||[]).slice(0,8)){
  const t=(m.text||'')+' '+(m.type||'');
  if(/물|홍수|수로/.test(t)&&['water','waterwork'].includes(a))b+=5;
  if(/식량|씨앗|밭|수확/.test(t)&&['farm','forage','cook'].includes(a))b+=5;
  if(/도움|함께/.test(t)&&['help','socialize'].includes(a))b+=4;
  if(/발견|탐색|군락/.test(t)&&a==='explore')b+=4;
  if(/실패|망가|샜/.test(t)&&['build','record','waterwork'].includes(a))b+=4;
 }
 return Math.min(18,b)
}
function thoughtVariant(r,a,ctx){
 const who=ctx.partner?.name||'누군가',V={
  eat:['배가 고프다. 조금 먹고 다시 움직이자.','빈속으로 버티면 판단부터 흐려진다. 먼저 먹자.','오늘 할 일이 남았다. 몸부터 채워야 한다.'],
  rest:['지금 무리하면 다음 일이 더 늦어진다. 잠깐 쉬자.','손에 힘이 빠진다. 쉬고 다시 하자.','피곤한 채 계속하면 결국 누군가 두 번 일하게 된다.'],
  socialize:[`${who}와 얘기해보는 게 낫겠다.`,`혼자 생각한 답이 맞는지 ${who}에게 물어보자.`,`일 얘기가 아니어도 좋다. ${who} 곁에 잠깐 가보자.`],
  help:[`${who}이 혼자 하기엔 버거워 보인다.`,`${who} 손이 바쁘다. 한쪽을 맡아주자.`,`내 일이 조금 늦어져도 ${who}를 먼저 돕는 편이 낫겠다.`],
  forage:['먹을 것과 쓸 만한 풀을 더 찾아두자.','오늘 본 풀 중 어제 없던 게 있는지 다시 보자.','채집터를 한 번 더 훑으면 쓸 만한 걸 찾을 수 있겠다.'],
  water:['물통이 가벼워지고 있다. 먼저 채워두자.','물은 떨어진 다음 찾으면 늦다. 지금 다녀오자.','마을 물이 줄었다. 내 몫부터 길어두자.'],
  wood:['지을 것도 고칠 것도 많다. 목재를 더 모으자.','남은 나무를 보니 다음 공사까지는 부족하다.','마른 나무부터 골라 오면 덜 힘들겠다.'],
  stone:['기초에 쓸 돌이 부족하다. 가까운 돌밭부터 보자.','작은 돌보다 쓸 만한 큰 돌을 골라보자.','다음 구조물 바닥에 쓸 돌을 미리 모아두자.'],
  farm:['흙 상태를 한번 더 보고 손볼 곳을 찾자.','어제보다 마른 고랑부터 확인하자.','씨앗보다 먼저 흙이 준비됐는지 봐야 한다.'],
  cook:['먹는 게 엉키면 하루 전체가 엉킨다. 먼저 준비하자.','남은 식량으로 몇 끼를 만들 수 있는지부터 보자.','불을 먼저 살리고 먹을 순서를 맞추자.'],
  animals:['동물의 상태부터 살펴야 한다.','먹이보다 먼저 겁먹은 게 없는지 보자.','가까이 가지 말고 움직임부터 확인하자.'],
  waterwork:['물은 한번 막히면 모두가 곤란해진다. 흐름부터 확인하자.','어제보다 물소리가 약하다. 막힌 곳이 있는지 보자.','둑보다 물이 어디로 가려는지 먼저 봐야 한다.'],
  pottery:['보관할 그릇이 더 필요하다. 다시 만들어보자.','이번에는 벽 두께를 조금 다르게 해보자.','깨진 그릇을 보고 같은 실수를 줄여보자.'],
  record:['오늘 달라진 걸 적어두자.','기억만 믿으면 같은 실수를 또 한다. 적자.','작은 변화라도 다음 사람이 읽을 수 있게 남겨두자.'],
  build:['사람이 늘면 머물 곳도 늘어야 한다. 손을 보태자.','완성보다 무너지지 않는 순서를 먼저 지키자.','오늘 세운 부분을 내일 다시 고치지 않게 만들자.'],
  explore:['저쪽은 아직 제대로 본 적이 없다. 안전한 선까지 확인해보자.','익숙한 길만 보면 새 자원을 못 찾는다. 조금 더 가보자.','돌아올 길을 기억하면서 바깥을 살펴보자.'],
  learn:['지금은 직접 하기보다 보고 배우는 편이 낫겠다.','잘하는 사람 손을 보고 따라 해보자.','모르는 걸 숨기는 것보다 묻는 게 빠르다.']
 };
 const arr=V[a]||['지금 가장 필요한 일을 하자.'],n=(r.brain?.decisionCount||0)+r.name.length+absDay();
 return arr[Math.abs(n)%arr.length]
}

function decideResident(p){
 const r=state.residents.find(x=>x.id===p.userData.id)||p.userData;
 initResidentBrain(r);const n=r.needs,pr=r.personality,age=currentAge(r);
 if((r.health?.woundedUntil??-1)>absDay()){r.brain={action:'rest',thought:'상처가 아물 때까지 무리하지 말자.',reason:'부상 회복 중',goal:'회복',alternatives:[],decisionCount:(r.brain?.decisionCount||0)+1,lastDecisionDay:absDay()};p.userData.action='rest';p.userData.target=p.userData.home.clone();p.userData.mode='walking';p.userData.nextMode='resting';p.userData.task='부상 회복 중';return}
 const foodScar=scarcity(state.resources.food,38),waterScar=scarcity(state.resources.water,35);
 const needHouse=(state.buildings.house||0)<Math.max(2,Math.ceil(state.residents.length/3));
 const buildPressure=(needHouse?72:0)+(!state.buildings.storage&&state.flags.firstField?38:0)+(!state.buildings.workshop&&state.buildings.storage?28:0);
 const partner=choosePartner(r,true);
 const score=(action,base=0)=>{
   let s=base+Math.random()*8;
   const fit=roleFit(r,action);
   s+=fit*.28+memoryActionBias(r,action)-repetitionPenalty(r,action);
   if(action===desiredActionByJob(r))s+=13+r.roleConfidence*.10;
   if(action===careerGoalAction(r))s+=10;
   if(age<12&&['wood','stone','build','waterwork','pottery'].includes(action))s*=.22;
   if(age<8&&['farm','forage','water'].includes(action))s*=.55;
   return s
 };
 const C=[
  {a:'eat',s:score('eat',n.hunger*1.58+(state.resources.food>2?8:-30))},
  {a:'rest',s:score('rest',n.fatigue*1.62)},
  {a:'socialize',s:score('socialize',n.social*1.08+pr.extraversion*.26),partner},
  {a:'help',s:score('help',pr.agreeableness*.55+n.social*.35+((partner?.needs?.fatigue||0)*.35)),partner},
  {a:'forage',s:score('forage',foodScar*.75+n.achievement*.25+pr.openness*.15)},
  {a:'water',s:score('water',waterScar*.9+n.safety*.32)},
  {a:'wood',s:score('wood',scarcity(state.resources.wood,28)*.78+buildPressure*.38+n.achievement*.2)},
  {a:'stone',s:score('stone',scarcity(state.resources.stone,18)*.7+buildPressure*.25)},
  {a:'farm',s:score('farm',foodScar*.86+n.achievement*.28+(state.buildings.field?15:30))},
  {a:'cook',s:score('cook',foodScar*.35+n.social*.2+n.achievement*.25)},
  {a:'animals',s:score('animals',(state.buildings.pen?22:5)+n.curiosity*.18+n.achievement*.22)},
  {a:'waterwork',s:score('waterwork',waterScar*.62+n.safety*.48+buildPressure*.14)},
  {a:'pottery',s:score('pottery',(state.buildings.storage?28:8)+n.achievement*.32)},
  {a:'record',s:score('record',n.curiosity*.34+n.achievement*.28+(state.day%10===0?20:0))},
  {a:'build',s:score('build',buildPressure+n.achievement*.35+pr.conscientiousness*.22)},
  {a:'explore',s:score('explore',n.curiosity*.9+pr.openness*.5-n.safety*.24)},
  {a:'learn',s:score('learn',(age<12?72:18)+n.curiosity*.4)}
 ];
 let candidates=[...C];if(age<5)candidates=candidates.filter(x=>['eat','rest','socialize','learn'].includes(x.a));else if(age<12)candidates=candidates.filter(x=>!['wood','stone','build','waterwork','pottery','animals'].includes(x.a));candidates.sort((x,y)=>y.s-x.s);C.length=0;C.push(...candidates);C.sort((x,y)=>y.s-x.s);
 // small bounded irrationality: sometimes pick #2, more likely for high openness/low stability
 let chosen=C[0];const wander=(pr.openness+(100-pr.stability))/200;
 if(Math.random()<.08*wander&&C[1])chosen=C[1];
 const ctx={partner:chosen.partner};
 r.brain={action:chosen.a,thought:thoughtVariant(r,chosen.a,ctx),reason:reasonFor(r,chosen.a,chosen.s,ctx),goal:goalLabel(r),alternatives:C.slice(1,4).map(x=>({action:x.a,score:Math.round(x.s)})),decisionCount:(r.brain?.decisionCount||0)+1,lastDecisionDay:state.year*365+state.day};
 p.userData.action=chosen.a;p.userData.decision=r.brain;p.userData.partnerId=chosen.partner?.id||null;
 p.userData.target=actionTarget(chosen.a,r,chosen.partner?personMap.get(chosen.partner.id):null);
 p.userData.mode='walking';p.userData.nextMode=chosen.a==='rest'?'resting':'working';p.userData.workTimer=0;p.userData.workPulse=0;
 p.userData.task=`${ACTION_META[chosen.a]?.label||chosen.a}하러 이동`;
 setThoughtIcon(p.userData,ACTION_META[chosen.a]?.icon||'…');
 if(selectedBrainId===r.id)renderBrainPanel(r);
}
function skillForAction(a){return({forage:'채집',water:'채집',wood:'목공',stone:'채집',farm:'농업',cook:'요리',animals:'사육',waterwork:'목공',pottery:'도공',record:'기록',build:'목공',explore:'채집',help:'기록',learn:'기록'})[a]||null}
function applyActionEffect(p){
 const r=state.residents.find(x=>x.id===p.userData.id),a=p.userData.action,n=r.needs,fit=roleFit(r,a),eff=.75+fit/100*.85;
 r.actionHistory[a]=(r.actionHistory[a]||0)+1;trajectoryFromAction(r,a,eff);r.recentActions??=[];r.recentActions.unshift(a);r.recentActions=r.recentActions.slice(0,8);
 const sk=skillForAction(a);
 if(sk){r.skills[sk]=clamp((r.skills[sk]||0)+.12*(r.potential/70),0,100);r.bloom=clamp(r.bloom+.018*(r.potential/70),0,100)}
 if(a==='eat'){if(state.resources.food>0)state.resources.food=Math.max(0,state.resources.food-1);n.hunger=clamp(n.hunger-48,0,100);n.safety-=3}
 else if(a==='rest'){n.fatigue=clamp(n.fatigue-55,0,100);n.safety=clamp(n.safety-8,0,100)}
 else if(a==='forage'){gain({food:1.3*eff});n.curiosity-=18;n.achievement-=16;if(Math.random()<.13){memoryAdd(r,'discovery','채집터에서 평소와 다른 식물 군락을 발견했다.',62);meaningfulEvent(r,pick(['낯선 풀의 군락','채집터의 작은 발견','어제 없던 잎']),`${r.name}이 채집 중 평소와 다른 식물 군락을 발견해 위치를 기억해두었다.`)}}
 else if(a==='water'){gain({water:2.3*eff});n.safety-=15;n.achievement-=10}
 else if(a==='wood'){gain({wood:1.7*eff});n.fatigue+=8;n.achievement-=14}
 else if(a==='stone'){gain({stone:1.05*eff});n.fatigue+=10;n.achievement-=12}
 else if(a==='farm'){gain({food:1.0*eff,labor:.22*eff});n.achievement-=18;n.curiosity-=6}
 else if(a==='cook'){if(state.resources.food>1&&state.resources.water>.5){state.resources.food-=.28;state.resources.water-=.12;gain({labor:.7*eff});}n.social-=13;n.achievement-=15}
 else if(a==='animals'){ensureDomesticAnimals();state.animalStats.care=clamp((state.animalStats.care||0)+.8*eff,0,100);gain({labor:.18*eff,food:state.buildings.pen?.08*eff:0});n.curiosity-=18;n.safety-=8;if(state.buildings.pen&&Math.random()<.04)meaningfulEvent(r,'동물과 생활 리듬을 맞추다',`${r.name}이 사육장 동물들의 먹이와 휴식 시간을 기록해 돌봄 순서를 조정했다.`)}
 else if(a==='waterwork'){gain({labor:.32*eff});n.safety-=22;n.achievement-=16;if(Math.random()<.08)meaningfulEvent(r,'물길을 손보다',`${r.name}이 물 흐름이 느려진 자리를 찾아 흙과 돌을 다시 다졌다.`)}
 else if(a==='pottery'){gain({labor:.25*eff});n.achievement-=22;if(Math.random()<.1)meaningfulEvent(r,'새 그릇이 나오다',`${r.name}이 물을 오래 담을 수 있는 그릇 하나를 완성했다.`)}
 else if(a==='record'){state.tech.기록습관.p=clamp(state.tech.기록습관.p+.55*eff,0,100);n.curiosity-=16;n.achievement-=10}
 else if(a==='build'){gain({labor:.55*eff});n.achievement-=22;n.fatigue+=8}
 else if(a==='explore'){state.world.landProgress=clamp((state.world.landProgress||0)+1.25*eff,0,9999);n.curiosity=clamp(n.curiosity-45,0,100);n.safety+=8;if(Math.random()<.18){const found=Math.random()<.5?'돌이 많은 비탈':'먹을 수 있는 풀 군락';memoryAdd(r,'exploration',`${found}의 위치를 기억했다.`,70);meaningfulEvent(r,found==='돌이 많은 비탈'?'돌맥이 드러난 비탈':'먹을 수 있는 풀 군락',`${r.name}이 마을 밖을 살피다가 ${found}을 찾아냈다.`)}}
 else if(a==='socialize'||a==='help'){
   const other=state.residents.find(x=>x.id===p.userData.partnerId);
   if(other){const delta=a==='help'?4:2.2;relationChange(r,other,delta,'trust');relationChange(r,other,delta*.7,'affinity');n.social-=a==='help'?24:38;
     memoryAdd(r,a==='help'?'help':'talk',`${other.name}와 ${a==='help'?'함께 일을 했다':'한동안 이야기를 나눴다'}.`,a==='help'?58:35,other.id);
     memoryAdd(other,a==='help'?'help_received':'talk',`${r.name}와 ${a==='help'?'함께 일을 했다':'한동안 이야기를 나눴다'}.`,a==='help'?62:35,r.id);
     if(a==='help'&&Math.random()<.22)meaningfulRelationshipEvent(r,other);
   }
 }else if(a==='learn'){n.curiosity-=28;n.achievement-=8;const best=Object.entries(r.skills).sort((x,y)=>y[1]-x[1])[0]?.[0]||'기록';r.skills[best]=clamp((r.skills[best]||0)+.08,0,100)}
 n.hunger=clamp(n.hunger,0,100);n.fatigue=clamp(n.fatigue,0,100);n.social=clamp(n.social,0,100);n.safety=clamp(n.safety,0,100);n.curiosity=clamp(n.curiosity,0,100);n.achievement=clamp(n.achievement,0,100);
 maybeEmergeRole(r);
}
function meaningfulEvent(r,title,text){
 const now=absDay();if(now-(r.lastStoryDay||-999)<9)return;
 const kind='minor:'+normalizedStoryKey(title);if(!minorStoryAllowed(kind,28))return;
 r.lastStoryDay=now;addLog('good',title,text,r.name,r.brain?.thought||'');
 eventFocus=personMap.get(r.id)?.position.clone()||LOC.center.clone();eventFocusUntil=performance.now()+6500;
}
function meaningfulRelationshipEvent(a,b){
 if(!minorStoryAllowed('relationship',36))return;
 const rel=relState(a,b.id),trust=Math.round(rel.trust||50),idx=(a.name.length+b.name.length+absDay())%4;
 const titles=[`${a.name}과 ${b.name}, 손을 맞추다`,'말없이 나눈 일','도움이 다음 약속이 되다','둘이 끝낸 작업'];
 const texts=[
  `${a.name}과 ${b.name}이 말없이 일을 나눠 맡았다. 끝난 뒤에는 서로의 손이 어디까지 닿는지 조금 더 알게 됐다.`,
  `${b.name}이 막힌 일을 ${a.name}이 거들었다. 짧은 협업이었지만 두 사람의 다음 선택에는 그 기억이 남았다.`,
  `${a.name}과 ${b.name}이 같은 일을 끝까지 함께했다. 신뢰 ${trust}. 숫자보다 중요한 건 다음에도 서로를 찾게 됐다는 점이었다.`,
  `${a.name}이 먼저 한쪽을 맡자 ${b.name}도 남은 일을 이어받았다. 누가 시키지 않았지만 둘의 작업 순서는 자연스럽게 맞아갔다.`
 ];
 addLog('story',titles[idx],texts[idx],a.name,`${b.name}, 다음에도 같이 하자.`);
 eventFocus=personMap.get(a.id)?.position.clone()||LOC.center.clone();eventFocusUntil=performance.now()+6500;
}
function maybeEmergeRole(r){
 if((r.age||0)<16)return;
 const total=Object.values(r.actionHistory).reduce((a,b)=>a+b,0);if(total<14)return;
 const options=[
  ['농지운영자','farm','농업'],['씨앗선별자','forage','농업'],['수로구조사','waterwork','목공'],['공동부엌지기','cook','요리'],
  ['동물돌봄이','animals','사육'],['도공','pottery','도공'],['기록자','record','기록'],['목수','build','목공'],['길잡이','explore','채집']
 ];
 let best=null,bs=0;
 for(const [job,a,sk] of options){const score=(r.actionHistory[a]||0)*6+(r.skills[sk]||0)*.45;if(score>bs){bs=score;best=[job,a]}}
 const abs=state.year*365+state.day;
 if(best&&best[0]!==r.job&&bs>58&&abs-r.lastRoleChangeDay>25){
   const old=r.job;r.job=best[0];r.lastRoleChangeDay=abs;r.roleConfidence=35;memoryAdd(r,'role',`${old} 역할보다 ${r.job} 일을 더 자주 맡기 시작했다.`,75);
   addLog('story',`${r.name}의 일이 달라지다`,`${r.name}은 최근 반복해서 선택한 행동과 숙련을 바탕으로 ${old}보다 ${r.job} 역할을 자연스럽게 더 많이 맡기 시작했다.`,r.name,r.brain?.thought||'');
 }
}
function advanceBrainNeeds(){
 for(const r of state.residents){initResidentBrain(r);const n=r.needs,p=r.personality;
   if((r.health?.woundedUntil??-1)<=absDay()&&r.health.hp<r.health.maxHp)r.health.hp=Math.min(r.health.maxHp,r.health.hp+12);
   n.hunger=clamp(n.hunger+1.7,0,100);n.fatigue=clamp(n.fatigue+1.15,0,100);
   n.social=clamp(n.social+.35+(100-p.extraversion)*.002,0,100);
   n.safety=clamp(n.safety+(state.resources.food<12?1.2:0)+(state.resources.water<10?1.4:0),0,100);
   n.curiosity=clamp(n.curiosity+.22+p.openness*.0025,0,100);n.achievement=clamp(n.achievement+.28+p.conscientiousness*.002,0,100);
 }
}
people.forEach(p=>decideResident(p));

function resetPose(ud){
 const {limbs,parts}=ud;
 limbs.la.rotation.set(0,0,0);limbs.ra.rotation.set(0,0,0);
 limbs.ll.rotation.set(0,0,0);limbs.rl.rotation.set(0,0,0);
 parts.torso.rotation.set(0,0,0);parts.pelvis.rotation.set(0,0,0);parts.head.rotation.set(0,0,0);
 parts.torso.position.y=1.63;parts.pelvis.position.y=1.05;parts.head.position.y=2.48;
}
function animateWorking(p,now){
 const ud=p.userData,{limbs,parts}=ud,t=now*.006+ud.phase,a=ud.action;
 ud.tool.visible=!['socialize','help','rest','learn','explore'].includes(a);
 if(['farm','wood','waterwork','build'].includes(a)){
   const hit=Math.sin(t*2.5);limbs.la.rotation.x=-.85+hit*.75;limbs.ra.rotation.x=-1.15+hit*.95;parts.torso.rotation.x=.12+.12*Math.max(0,hit)
 }else if(['forage','stone','water','animals'].includes(a)){
   const reach=.18*Math.sin(t*2);parts.torso.rotation.x=.46;parts.torso.position.y=1.48;parts.pelvis.position.y=.92;limbs.ll.rotation.x=limbs.rl.rotation.x=-.5;limbs.la.rotation.x=-.95+reach;limbs.ra.rotation.x=-.82-reach
 }else if(a==='cook'){
   limbs.la.rotation.x=-.75;limbs.ra.rotation.x=-.9+.18*Math.sin(t*2.4);limbs.ra.rotation.z=.32*Math.sin(t*2.4);parts.torso.rotation.x=.07
 }else if(a==='pottery'){
   parts.torso.rotation.x=.22;limbs.la.rotation.x=-1.02;limbs.ra.rotation.x=-.9+.15*Math.sin(t*3);limbs.la.rotation.z=-.18;limbs.ra.rotation.z=.18
 }else if(a==='record'){
   limbs.la.rotation.x=-1.15;limbs.ra.rotation.x=-1.0;limbs.ra.rotation.z=.18+.09*Math.sin(t*3.1);parts.head.rotation.x=.18
 }else if(a==='socialize'||a==='help'){
   ud.tool.visible=false;limbs.la.rotation.z=.14*Math.sin(t);limbs.ra.rotation.z=-.18*Math.sin(t*.8);parts.head.rotation.y=.18*Math.sin(t*.7)
 }else if(a==='learn'){
   ud.tool.visible=false;parts.head.rotation.y=.24*Math.sin(t*.7);limbs.la.rotation.x=-.15;limbs.ra.rotation.x=.12
 }else{
   ud.tool.visible=false;parts.head.rotation.y=.16*Math.sin(t*.8)
 }
}
function animateResting(ud,now){
 ud.tool.visible=false;
 const breathe=Math.sin(now*.003+ud.phase)*.025;
 ud.parts.torso.position.y=1.63+breathe;
 ud.parts.head.rotation.y=Math.sin(now*.0015+ud.phase)*.18;
}

// Camera / interaction
const CAMERA_MIN_DISTANCE=22,CAMERA_MAX_DISTANCE=78,CAMERA_DEFAULT_DISTANCE=38;
let camMode='follow',followId='PLAYER',yaw=.72,pitch=.72,distance=CAMERA_DEFAULT_DISTANCE,autoFocus=new THREE.Vector3(0,0,0),eventFocus=null,eventFocusUntil=0,hovered=null;
function shortestAngle(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a))}
function lerpAngle(a,b,t){return a+shortestAngle(a,b)*t}
function playerFacingVector(){
 return new THREE.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y))
}

const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
const pointers=new Map();
let gestureMoved=false,lastSingle=null,lastPair=null,pressStart=null,lastTapAt=0,dragMode='pan';
const manualMove={x:0,y:0,active:false,pointerId:null};

function pointerXY(e){return{x:e.clientX,y:e.clientY}}
function clampCameraDistance(v){return clamp(v,CAMERA_MIN_DISTANCE,CAMERA_MAX_DISTANCE)}
function zoomCamera(factor){
 distance=clampCameraDistance(distance*factor);
 if(camMode==='auto')setCameraMode('follow');
}
function resetPlayerCamera(){
 followId='PLAYER';if($('followSelect'))$('followSelect').value='PLAYER';
 yaw=.72;pitch=.72;distance=CAMERA_DEFAULT_DISTANCE;
 setCameraMode('follow');
}
function panCamera(dx,dy){
 const factor=distance*.0027;
 const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
 autoFocus.addScaledVector(right,-dx*factor);
 autoFocus.addScaledVector(forward,-dy*factor);
 const bounds=localMapBounds();
 autoFocus.x=clamp(autoFocus.x,-bounds.x,bounds.x);autoFocus.z=clamp(autoFocus.z,-bounds.z,bounds.z);
}
renderer.domElement.addEventListener('pointerdown',e=>{
 e.preventDefault();
 try{renderer.domElement.setPointerCapture(e.pointerId)}catch{}
 pointers.set(e.pointerId,pointerXY(e));
 gestureMoved=false;pressStart={x:e.clientX,y:e.clientY,t:performance.now()};
 if(camMode==='auto')setCameraMode('follow');
 if(pointers.size===1)lastSingle=pointerXY(e);
 if(pointers.size===2){
   const p=[...pointers.values()],cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2;
   lastPair={cx,cy,d:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y))};
 }
},{passive:false});
renderer.domElement.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;e.preventDefault();
 pointers.set(e.pointerId,pointerXY(e));
 if(pointers.size===1){
   const p=[...pointers.values()][0];
   if(lastSingle){
     const dx=p.x-lastSingle.x,dy=p.y-lastSingle.y;
     if(Math.abs(dx)+Math.abs(dy)>2){
       gestureMoved=true;
       if(dragMode==='pan'){if(camMode!=='free'){autoFocus.copy(focusForCamera(performance.now()));setCameraMode('free')}panCamera(dx,dy)}
       else{yaw-=dx*.0056;pitch=clamp(pitch-dy*.0042,.43,1.05)}
     }
   }
   lastSingle=p;
 }else if(pointers.size>=2){
   const p=[...pointers.values()].slice(0,2),cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2,d=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));
   if(lastPair){
     const dx=cx-lastPair.cx,dy=cy-lastPair.cy;
     const ratio=clamp(lastPair.d/d,.72,1.38);
     distance=clampCameraDistance(distance*Math.pow(ratio,1.15));
     yaw-=dx*.0022;pitch=clamp(pitch-dy*.0016,.43,1.05);
     if(Math.abs(dx)+Math.abs(dy)+Math.abs(d-lastPair.d)>2)gestureMoved=true;
   }
   lastPair={cx,cy,d};
 }
},{passive:false});
function handleTap(e){
 const rect=renderer.domElement.getBoundingClientRect();
 mouse.x=((e.clientX-rect.left)/Math.max(1,rect.width))*2-1;
 mouse.y=-((e.clientY-rect.top)/Math.max(1,rect.height))*2+1;
 ray.setFromCamera(mouse,camera);
 const mhit=ray.intersectObjects(monsters.filter(m=>!m.userData.dead),true)[0];
 if(mhit){
   let o=mhit.object;while(o.parent&&o.parent!==monsterGroup)o=o.parent;
   setMonsterTarget(o);followId='PLAYER';setCameraMode('follow');return;
 }
 const bhit=ray.intersectObject(bokshil,true)[0];
 if(bhit){followId='BOKSHIL';if($('followSelect'))$('followSelect').value='BOKSHIL';setCameraMode('follow');showEvent('복실이 · 주민들을 순찰하고 야생동물을 막는 마을 개');return}

 const phit=ray.intersectObjects(people,true)[0];
 if(phit){
   let o=phit.object;while(o.parent&&!o.userData.id)o=o.parent;
   if(o.userData.id){
     followId=o.userData.id;if($('followSelect'))$('followSelect').value=followId;
     setCameraMode('follow');renderBrainPanel(state.residents.find(r=>r.id===followId));return
   }
 }
 const ghit=ray.intersectObjects(walkableSurfaces.filter(s=>s.visible),false)[0];
 if(ghit){
   state.player.autoHunt=false;movePlayerTo(ghit.point);followId='PLAYER';setCameraMode('follow')
 }
}
renderer.domElement.addEventListener('pointerup',e=>{
 e.preventDefault();
 const elapsed=pressStart?performance.now()-pressStart.t:999;
 const moved=pressStart?Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y):999;
 pointers.delete(e.pointerId);
 if(!gestureMoved&&moved<9&&elapsed<420){
   const now=performance.now();
   if(now-lastTapAt<285){resetPlayerCamera();lastTapAt=0}
   else{handleTap(e);lastTapAt=now}
 }
 lastSingle=pointers.size===1?[...pointers.values()][0]:null;lastPair=null;pressStart=null;
},{passive:false});
renderer.domElement.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);lastSingle=null;lastPair=null;pressStart=null},{passive:false});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoomCamera(Math.exp(e.deltaY*.0013))},{passive:false});

function setCameraMode(m){
 camMode=m;
 document.querySelectorAll('.cam-btn').forEach(b=>b.classList.toggle('active',b.dataset.camera===m));
 if($('autoDirectorBtn'))$('autoDirectorBtn').classList.toggle('active',m==='auto')
}
document.querySelectorAll('.cam-btn').forEach(b=>b.onclick=()=>setCameraMode(b.dataset.camera));
$('autoDirectorBtn').onclick=()=>setCameraMode(camMode==='auto'?'follow':'auto');
refreshFollowSelect();$('followSelect').value=followId;$('followSelect').onchange=e=>{followId=e.target.value;setCameraMode('follow')};
$('playerFocusBtn').onclick=resetPlayerCamera;
$('zoomInBtn')?.addEventListener('click',()=>zoomCamera(.82));
$('zoomOutBtn')?.addEventListener('click',()=>zoomCamera(1.22));
$('cameraResetBtn')?.addEventListener('click',resetPlayerCamera);
$('dragModeBtn')?.addEventListener('click',()=>{
 dragMode=dragMode==='pan'?'rotate':'pan';
 $('dragModeBtn').classList.toggle('active',dragMode==='rotate');
 $('dragModeBtn').textContent=dragMode==='pan'?'✥':'↻';
 showEvent(dragMode==='pan'?'드래그: 화면 이동':'드래그: 카메라 회전')
});
$('autoHuntBtn').onclick=()=>{
 if(!state.player.awakened){showEvent(`사냥은 세계력 55년부터 활성화됩니다`);resetPlayerCamera();return}
 if(state.player.dead){showEvent('부활 후 사냥할 수 있습니다');return}
 state.player.autoHunt=!state.player.autoHunt;
 if(!state.player.autoHunt)selectedMonster=null;
 updatePlayerHud();
};

// Virtual joystick: movement relative to current camera facing.
const joystick=$('moveJoystick'),joyKnob=$('joyKnob');
function resetJoystick(){
 manualMove.x=0;manualMove.y=0;manualMove.active=false;manualMove.pointerId=null;
 if(joyKnob)joyKnob.style.transform='translate3d(0,0,0)'
}
function updateJoystick(e){
 if(!joystick)return;
 const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 let dx=e.clientX-cx,dy=e.clientY-cy;
 const max=Math.max(24,r.width*.31),len=Math.hypot(dx,dy);
 if(len>max){dx=dx/len*max;dy=dy/len*max}
 manualMove.x=clamp(dx/max,-1,1);manualMove.y=clamp(-dy/max,-1,1);
 manualMove.active=Math.hypot(manualMove.x,manualMove.y)>.08;
 joyKnob.style.transform=`translate3d(${dx}px,${dy}px,0)`;
}
joystick?.addEventListener('pointerdown',e=>{
 e.preventDefault();e.stopPropagation();manualMove.pointerId=e.pointerId;
 try{joystick.setPointerCapture(e.pointerId)}catch{};updateJoystick(e)
},{passive:false});
joystick?.addEventListener('pointermove',e=>{
 if(e.pointerId!==manualMove.pointerId)return;e.preventDefault();e.stopPropagation();updateJoystick(e)
},{passive:false});
joystick?.addEventListener('pointerup',e=>{if(e.pointerId===manualMove.pointerId)resetJoystick()},{passive:false});
joystick?.addEventListener('pointercancel',resetJoystick,{passive:false});

function focusForCamera(now){
 if(camMode==='follow'){
   if(followId==='PLAYER')return player.position.clone();
   if(followId==='BOKSHIL')return bokshil.position.clone();
   const p=personMap.get(followId);return p?p.position.clone():player.position.clone()
 }
 if(camMode==='auto'){
   if(eventFocus&&now<eventFocusUntil)return eventFocus.clone();
   const important=personMap.get('C0001'),t=(now/1000)%36;
   if(state.player.awakened&&t<9)return player.position.clone();
   if(t<18)return LOC.field.clone();if(t<27&&important)return important.position.clone();return LOC.center.clone()
 }
 return autoFocus.clone()
}
function updateCamera(now){
 let target=focusForCamera(now);
 const playerMoving=followId==='PLAYER'&&camMode==='follow'&&!state.player.dead&&(manualMove.active||player.userData.moving||selectedMonster);
 if(playerMoving){
   // Put the camera behind the direction of travel and look slightly ahead.
   const facing=playerFacingVector();
   target=player.position.clone().addScaledVector(facing,3.8);
   const behindYaw=player.rotation.y+Math.PI;
   yaw=lerpAngle(yaw,behindYaw,.075);
   pitch=THREE.MathUtils.lerp(pitch,.66,.035)
 }
 if(camMode!=='free')autoFocus.lerp(target,playerMoving?.16:.075);
 if(camMode==='auto'){
   yaw+=.000055*Math.min(5,state.speed||1);
   pitch=THREE.MathUtils.lerp(pitch,.72,.012);
   distance=THREE.MathUtils.lerp(distance,CAMERA_DEFAULT_DISTANCE,.012)
 }
 distance=clampCameraDistance(distance);
 const cp=Math.cos(pitch),sp=Math.sin(pitch);
 const off=new THREE.Vector3(Math.sin(yaw)*cp*distance,Math.max(12,5+sp*distance*.76),Math.cos(yaw)*cp*distance);
 const desired=autoFocus.clone().add(off);
 camera.position.lerp(desired,playerMoving?.19:.13);
 camera.position.y=Math.max(camera.position.y,9.5);
 camera.lookAt(autoFocus.clone().add(new THREE.Vector3(0,1.05,0)))
}

// ---------- SIMULATION ----------

const TECH_RULES={
 기록습관:{skill:'기록',base:.20,req:()=>true,desc:'실패와 수확, 날씨를 남기는 생활 기록이 공동 습관이 되었다.'},
 공동취사:{skill:'요리',base:.18,req:()=>state.buildings.field>0,desc:'개별 식사보다 공동 취사와 분배 규칙이 안정되었다.'},
 목공기초:{skill:'목공',base:.19,req:()=>state.buildings.house>=3,desc:'집과 도구를 고치는 방식이 개인 요령에서 공유 기술로 바뀌었다.'},
 수로관리:{skill:'목공',base:.16,req:()=>state.buildings.field>0,desc:'물길 점검과 물 순번을 생활 규칙으로 정리하기 시작했다.'},
 건조저장:{skill:'농업',base:.14,req:()=>state.buildings.storage>0,desc:'말리고 띄우고 나누어 저장하는 방식이 자리 잡았다.'},
 약초분류:{skill:'약초',base:.15,req:()=>state.buildings.workshop>0,desc:'약초를 생김새와 쓰임, 위험성에 따라 구분하는 기준이 생겼다.'},
 사육기초:{skill:'사육',base:.13,req:()=>state.buildings.field>0,desc:'먹이와 휴식, 안전거리를 기록하며 비강제 돌봄 원칙을 쌓기 시작했다.'},
 토기저장:{skill:'도공',base:.15,req:()=>state.buildings.storage>0,desc:'물과 곡식을 오래 보관하는 토기 형태가 반복 제작될 만큼 안정되었다.'},
 직조기초:{skill:'직조',base:.11,req:()=>state.year>=1,desc:'풀섬유와 실을 엮어 생활용 천을 만드는 방식이 정리되었다.'},
 야간교대:{skill:'경계',base:.11,req:()=>state.year>=1,desc:'밤을 한 사람이 버티지 않고 순번으로 나누는 경계 방식이 생겼다.'}
};
const CIV_LEVELS=[{score:0,name:'야영지'},{score:70,name:'농가군'},{score:170,name:'작은 촌락'},{score:310,name:'마을'},{score:520,name:'큰마을'},{score:820,name:'지역 거점'}];
function avgSkill(k){const rs=state.residents.filter(r=>r.age>=10);return rs.length?rs.reduce((s,r)=>s+(r.skills?.[k]||0),0)/rs.length:0}
function countOpenTech(){return Object.values(state.tech).filter(t=>t.open).length}

function recalculateCaps(){
 const b=state.buildings,n=state.residents.length;
 state.caps.food=Math.max(state.caps.food||0,100+(b.storage||0)*120+(b.house||0)*5);
 state.caps.water=Math.max(state.caps.water||0,100+(b.well||0)*130+(b.house||0)*3);
 state.caps.wood=Math.max(state.caps.wood||0,100+(b.storage||0)*70+(b.workshop||0)*45);
 state.caps.stone=Math.max(state.caps.stone||0,100+(b.workshop||0)*35+(b.kiln||0)*20);
 state.caps.labor=Math.max(state.caps.labor||0,60+n*3+(b.meeting||0)*25+(b.workshop||0)*20)
}

function dailySettlementEconomy(){
 recalculateCaps();
 const workers=state.residents.filter(r=>r.age>=12),adults=state.residents.filter(r=>r.age>=16),fields=state.buildings.field||0;
 const ag=avgSkill('농업'),carp=avgSkill('목공'),cook=avgSkill('요리'),pot=avgSkill('도공');
 gain({food:.035*workers.length+fields*(.42+ag*.0045)+(state.buildings.kitchen?.12:0)+(state.tech.공동취사.open?.08:0),
 water:.052*workers.length+(state.buildings.well?.65:.18)+(state.tech.수로관리.open?.18:0),
 wood:.026*adults.length+carp*.0036,stone:.011*adults.length+(carp+pot)*.0017,labor:.035*adults.length+(carp+cook+ag)*.0021});
 if(state.buildings.pen&&state.animalStats.domestic>0)gain({food:.025*state.animalStats.domestic*(.6+(state.animalStats.care||0)/180)});
 const eq=state.residents.reduce((s,r)=>s+(r.age<5?.38:r.age<12?.62:r.age<16?.78:1),0);
 state.resources.food=Math.max(0,state.resources.food-eq*.042);state.resources.water=Math.max(0,state.resources.water-eq*.052)
}
function dailyTechEngine(){for(const[name,rule]of Object.entries(TECH_RULES)){const t=state.tech[name];if(!t||t.open||!rule.req())continue;const skill=avgSkill(rule.skill),matching=state.residents.filter(r=>skillForAction(r.brain?.action)===rule.skill).length,coop=Math.min(1.25,.72+state.residents.length/55);t.p=clamp(t.p+rule.base*(1+skill/70)*coop+matching*.009,0,100);if(t.p>=100){t.open=true;t.p=100;state.civ.techUnlocked++;addLog('story',`${name}이 생활 기술이 되다`,rule.desc,'기록','누군가 한 번 해낸 일이 아니라, 여러 사람이 반복해서 할 수 있게 된 순간부터 기술이 되었다.')}}}
function civilizationScore(){const b=state.buildings,special=['storage','workshop','herb','pen','meeting','well','kiln','kitchen','watch','loom'].reduce((s,k)=>s+(b[k]?1:0),0);return(b.house||0)*8+(b.field||0)*14+special*22+countOpenTech()*16+state.residents.length*2.2}
function updateCivilizationLevel(){const score=civilizationScore();let f=CIV_LEVELS[0];for(const lv of CIV_LEVELS)if(score>=lv.score)f=lv;if(f.name!==state.civ.levelName){const old=state.civ.levelName;state.civ.levelName=f.name;state.civ.level=CIV_LEVELS.indexOf(f);addLog('story',`정착지가 ‘${f.name}’ 단계에 들어서다`,`집 ${state.buildings.house}채, 경작지 ${state.buildings.field}구역, 주민 ${state.residents.length}명. 감나무뜰은 더 이상 ${old||'야영지'}의 모습에 머물지 않았다.`,'기록','건물이 늘어난 것보다, 서로 없으면 불편해진 일이 늘어난 게 더 큰 변화였다.')}}


const TRAJECTORY_NAMES={
 cooperation:'공동체 연합',exploration:'개척 연맹',pastoral:'목축 공생권',scholarship:'기록 지식사회',
 trade:'교역 연맹',militarism:'방벽 국가',centralization:'중앙 운영체계',ecology:'생태 공존권'
};
function trajectorySummary(){
 state.trajectory??=defaultTrajectory();
 const pairs=Object.entries(state.trajectory).filter(([k,v])=>typeof v==='number'&&!['lastShiftDay'].includes(k)).sort((a,b)=>b[1]-a[1]);
 const [key,value]=pairs[0]||['cooperation',0];return{key,value,name:TRAJECTORY_NAMES[key]||'초기 공동체',pairs}
}
function addTrajectory(key,amount){
 state.trajectory??=defaultTrajectory();if(typeof state.trajectory[key]!=='number')state.trajectory[key]=0;
 state.trajectory[key]=clamp(state.trajectory[key]+amount,0,100)
}
function trajectoryFromAction(r,a,eff=1){
 const inc=.025*Math.max(.5,eff);
 if(a==='help'||a==='socialize'||a==='cook')addTrajectory('cooperation',inc*1.5);
 if(a==='explore')addTrajectory('exploration',inc*2.1);
 if(a==='animals')addTrajectory('pastoral',inc*2.0);
 if(a==='record'||a==='learn'||a==='pottery')addTrajectory('scholarship',inc*1.5);
 if(a==='farm'||a==='forage'||a==='animals')addTrajectory('ecology',inc*.7);
 if(a==='build'||a==='record'||a==='waterwork')addTrajectory('centralization',inc*.65);
}
function maybeShiftTrajectory(){
 const top=trajectorySummary(),now=absDay();
 if(top.value<16||top.name===state.trajectory.current||now-(state.trajectory.lastShiftDay??-999)<90)return;
 const old=state.trajectory.current;state.trajectory.current=top.name;state.trajectory.lastShiftDay=now;
 const texts={
  '공동체 연합':'도움과 공동 작업이 반복되며 개인의 작업보다 함께 해결하는 방식이 마을의 기본 습관이 되기 시작했다.',
  '개척 연맹':'탐사가 반복되며 정착지의 관심이 안쪽 생산보다 새로운 길과 외부 생활권으로 향하기 시작했다.',
  '목축 공생권':'동물을 자원으로만 보지 않는 돌봄이 쌓이며 사육·이동·먹이 규칙이 마을 운영의 중심으로 들어왔다.',
  '기록 지식사회':'기록과 배움이 반복되며 경험을 개인 기억이 아니라 공유 지식으로 남기는 사회가 되기 시작했다.',
  '교역 연맹':'외부 연결과 교환이 쌓이며 생산량보다 무엇을 누구와 바꿀지가 중요한 사회가 되기 시작했다.',
  '방벽 국가':'반복된 위협과 방어 경험이 사람들의 우선순위를 생산보다 경계와 방어 준비 쪽으로 바꾸기 시작했다.',
  '중앙 운영체계':'물·저장·건축·기록을 한데 조정하는 일이 늘면서 공동체의 운영 권한이 한곳에 모이기 시작했다.',
  '생태 공존권':'채집과 사육에서 무리한 포획을 피하는 선택이 반복되며 주변 생태를 생활권 일부로 보는 문화가 강해졌다.'
 };
 addLog('story',`${old}에서 ${top.name} 쪽으로`,texts[top.name]||'주민들의 반복 행동이 문명의 방향을 바꾸기 시작했다.','기록','역사는 계획표보다 사람들이 반복한 행동을 더 오래 기억했다.')
}
function syncLocalCountryPopulation(){
 const c=state.world.countries?.['에르단 왕국'];if(!c)return;
 const prev=state.world.lastLocalPopulation??state.residents.length,now=state.residents.length,delta=now-prev;
 if(delta!==0)c.population=Math.max(now,c.population+delta);
 else c.population=Math.max(now,c.population);
 state.world.lastLocalPopulation=now;
 state.worldPopulation=Object.values(state.world.countries).reduce((s,c)=>s+(c.population||0),0)
}
function countryAtWar(name){
 return (state.world.wars||[]).some(w=>w.active&&(w.a===name||w.b===name||w.country===name))||(state.world.externalWars||[]).some(w=>w.active&&(w.a===name||w.b===name))
}
function annualCountryPopulationSimulation(){
 normalizeWorldState();
 for(const[name,c]of Object.entries(state.world.countries)){
  c.lastPopulation=c.population;
  const war=countryAtWar(name),h=stableHash01(name+state.year);
  let rate=c.growth+(c.prosperity-50)*.00008+(h-.5)*.004;
  if(war)rate-=.018+stableHash01(name+'war'+state.year)*.018;
  const births=Math.max(0,Math.round(c.population*Math.max(0,rate+.012)));
  const deaths=Math.max(0,Math.round(c.population*Math.max(.004,.012-rate)));
  c.births=births;c.deaths=deaths;c.population=Math.max(1,c.population+births-deaths)
 }
 syncLocalCountryPopulation()
}
function countriesInRegion(region){return Object.keys(COUNTRY_META).filter(n=>COUNTRY_META[n].region===region)}
function contactCountries(){
 return (state.world.contactedCountries||[]).filter(n=>n!=='에르단 왕국')
}
function diplomacyFor(country){
 state.world.diplomacy??={};
 if(!state.world.diplomacy[country]){
  const meta=state.world.countries[country],bias=(meta?.openness??50)-(meta?.aggression??50);
  state.world.diplomacy[country]={relation:clamp(Math.round(bias*.35),-35,35),status:'neutral',lastIncidentDay:-999}
 }
 return state.world.diplomacy[country]
}
function activeWarAgainst(country){
 return (state.world.wars||[]).find(w=>w.active&&w.country===country)
}
function startLocalWar(country){
 const d=diplomacyFor(country);if(d.status==='war')return false;
 d.status='war';d.relation=Math.min(-72,d.relation);d.warStartDay=absDay();
 state.world.wars.push({country,active:true,startYear:state.year,startDay:state.day});
 addTrajectory('militarism',6);addTrajectory('centralization',2);
 addLog('warn',`${country}과 전쟁 발발`,`${country}과 이어진 길에서 통행·자원·보복 사건이 누적되었다. 주민들의 방어 선택과 상대 세력의 압박이 겹치며 결국 전쟁 상태로 넘어갔다.`,'기록','같은 접촉도 어떤 선택을 반복했느냐에 따라 교역로가 되기도, 전선이 되기도 했다.');
 return true
}
function endLocalWar(country){
 const d=diplomacyFor(country);d.status='truce';d.relation=-20;
 const w=activeWarAgainst(country);if(w){w.active=false;w.endYear=state.year;w.endDay=state.day}
 addLog('story',`${country}과 휴전`,`${country}과의 충돌이 멈췄다. 손실·포로·통행 문제를 두고 협상이 시작되었고, 전쟁 이전과 같은 관계로 돌아갈지는 이후 행동에 달렸다.`,'기록','휴전은 결말이 아니라 다음 관계의 시작이었다.')
}
function simulateDiplomacyDaily(){
 const path=trajectorySummary();
 for(const country of contactCountries()){
  const d=diplomacyFor(country),meta=state.world.countries[country];
  if(d.status==='war'){
   d.relation=clamp(d.relation+.006,-100,100);
   if(absDay()-(d.warStartDay??absDay())>160&&Math.random()<.004*(1+state.trajectory.cooperation/60))endLocalWar(country);
   continue
  }
  const tradeBias=(state.trajectory.trade+state.trajectory.cooperation)*.00005;
  const militaryBias=state.trajectory.militarism*.000055;
  d.relation=clamp(d.relation+tradeBias-militaryBias+(meta.openness-50)*.00003,-100,100);
  const incidentChance=.00045*(1+meta.aggression/50)*(1+state.trajectory.centralization/120);
  if(absDay()-(d.lastIncidentDay??-999)>70&&Math.random()<incidentChance){
   d.lastIncidentDay=absDay();const hit=6+meta.aggression*.12;d.relation=clamp(d.relation-hit,-100,100);
   addLog('warn',`${country}과 경계 충돌`,`${country}과 연결된 생활권에서 통행과 자원을 둘러싼 충돌이 발생했다. 주민들이 다음에 교섭·양보·방어 중 무엇을 반복하느냐에 따라 관계가 달라진다.`,'기록','접촉은 자동으로 우호도 적대도 아니었다.')
  }
  const readiness=state.civ.level+(state.buildings.watch?1:0)+(state.residents.length>=25?1:0);
  if(readiness>=3&&d.relation<-66&&Math.random()<.006*(1+meta.aggression/70))startLocalWar(country)
 }
}
function simulateExternalWarsAnnual(){
 // Other nations also live without waiting for Laen.
 const names=Object.keys(state.world.countries);
 for(const w of state.world.externalWars||[]){
  if(!w.active)continue;
  if(state.year-w.startYear>=1+Math.floor(stableHash01(w.a+w.b)*4)){w.active=false;w.endYear=state.year}
 }
 if((state.world.externalWars||[]).filter(w=>w.active).length>=3)return;
 const candidates=[...names].sort((a,b)=>state.world.countries[b].aggression-state.world.countries[a].aggression);
 for(const a of candidates.slice(0,10)){
  if(Math.random()>.055)continue;
  const ma=COUNTRY_META[a],targets=names.filter(b=>b!==a&&COUNTRY_META[b].region===ma.region&&!countryAtWar(b));
  if(!targets.length)continue;const b=targets[Math.floor(Math.random()*targets.length)];
  if(countryAtWar(a)||countryAtWar(b))continue;
  state.world.externalWars.push({a,b,active:true,startYear:state.year});
  addLog('warn',`관찰 기록 · ${a}–${b} 충돌`,`관찰자 지도에서 ${a}과 ${b} 사이의 무력 충돌이 확인되었다. 감나무뜰 주민들이 아직 두 세력을 직접 알지 못하더라도 세계의 역사는 계속 진행된다.`,'관찰 AI','관찰자는 접촉 이전의 역사도 볼 수 있다.');
  break
 }
}

function addWorldRoute(from,to,kind='land'){
 if(state.world.routes.some(r=>r.from===from&&r.to===to))return;
 const distanceKm=Math.round(cityDistanceKm(from,to));
 state.world.routes.push({from,to,kind,distanceKm,year:state.year,day:state.day});
 addTrajectory('trade',2.5);addTrajectory('exploration',1.5)
}

function countryNearestCity(country){
 const start=WORLD_CITY_BY_ID.get('L001');
 return WORLD_DATA.cities.filter(c=>c.country===country).sort((a,b)=>worldPointDistanceKm(start,a)-worldPointDistanceKm(start,b))[0]||null
}
function activeExpeditionToCountry(country){
 return (state.world.expeditions||[]).find(e=>e.country===country&&e.active)
}
function scheduleCountryExpedition(country,kind='land'){
 if((state.world.contactedCountries||[]).includes(country)||activeExpeditionToCountry(country))return false;
 const c=countryNearestCity(country);if(!c)return false;
 const from='L001',distanceKm=Math.round(cityDistanceKm(from,c.id));
 const speedKmDay=travelSpeedKmDay(kind),travelDays=expeditionTravelDays(from,c.id,kind),startAbs=absDay();
 const exp={
  id:`EXP-C-${state.year}-${state.day}-${country}`,targetType:'country',country,region:c.region,kind,from,to:c.id,city:c.id,
  startYear:state.year,startDay:state.day,startAbsDay:startAbs,arrivalAbsDay:startAbs+travelDays,
  distanceKm,speedKmDay,travelDays,active:true,completed:false,progress:0
 };
 state.world.expeditions.push(exp);
 addLog('story',`${country} 접촉 원정 출발`,`${state.year}년 ${state.day}일, 주민들이 ${country} 쪽으로 원정대를 보냈다. 라엔 기준 약 ${distanceKm.toLocaleString()}km, 예상 이동 ${travelDays}일. 관찰자는 이미 그 나라를 볼 수 있지만 주민들은 실제 도착 전까지 외교 관계를 맺지 않는다.`,'관찰 AI','보이는 것과 갈 수 있는 것은 다른 문제였다.');
 return true
}

function activeExpeditionTo(region){
 return (state.world.expeditions||[]).find(e=>e.region===region&&e.active)
}
function scheduleWorldExpedition(region,kind='land'){
 if(state.world.knownRegions.includes(region)||activeExpeditionTo(region))return false;
 const c=representativeCity(region);if(!c)return false;
 const from='L001',distanceKm=Math.round(cityDistanceKm(from,c.id));
 const speedKmDay=travelSpeedKmDay(kind),travelDays=expeditionTravelDays(from,c.id,kind);
 const startAbs=absDay();
 const exp={
  id:`EXP-${state.year}-${state.day}-${region}`,targetType:'region',region,kind,from,to:c.id,city:c.id,
  startYear:state.year,startDay:state.day,startAbsDay:startAbs,
  arrivalAbsDay:startAbs+travelDays,distanceKm,speedKmDay,travelDays,
  active:true,completed:false,progress:0
 };
 state.world.expeditions.push(exp);
 addLog('story',`${region} 원정대 출발`,`${state.year}년 ${state.day}일, ${kind==='sea'?'배':'도보 원정대'}가 라엔 분지를 떠났다. 목적지까지 직선 환산 약 ${distanceKm.toLocaleString()}km. 준비와 지형을 포함한 예상 소요는 약 ${travelDays}일이다.`,'기록',`며칠 걸으면 닿는 거리가 아니다. 돌아올 수 있는 거리부터 계산했다.`);
 return true
}
function completeWorldExpedition(exp){
 if(!exp||exp.completed)return false;
 exp.active=false;exp.completed=true;exp.progress=1;exp.arriveYear=state.year;exp.arriveDay=state.day;
 const c=WORLD_CITY_BY_ID.get(exp.to);
 if(exp.region&&!state.world.knownRegions.includes(exp.region))state.world.knownRegions.push(exp.region);
 if(c?.country&&!state.world.contactedCountries.includes(c.country))state.world.contactedCountries.push(c.country);
 if(exp.country&&!state.world.contactedCountries.includes(exp.country))state.world.contactedCountries.push(exp.country);
 state.world.lastRegionRevealAbsDay=absDay();
 if(c&&!state.world.foundedCities.includes(c.id))state.world.foundedCities.push(c.id);
 addWorldRoute(exp.from,exp.to,exp.kind);
 const dest=exp.country||exp.region||c?.name||'목적지';
 addLog('story',`${dest} 도착`,`${state.year}년 ${state.day}일, 원정대가 약 ${exp.distanceKm.toLocaleString()}km의 이동을 끝내고 ${dest}에 도착했다. 실제 이동에는 ${exp.travelDays}일이 걸렸다. 이제부터 주민에게도 외교·교역·충돌 가능성이 열린다.`,'기록',`${dest}은 지도 위 이름에서 실제 관계가 가능한 생활권이 되었다.`);
 return true
}
function processWorldExpeditionsDaily(){
 const now=absDay();
 for(const exp of state.world.expeditions||[]){
   if(!exp.active)continue;
   exp.progress=clamp((now-exp.startAbsDay)/Math.max(1,exp.arrivalAbsDay-exp.startAbsDay),0,1);
   if(now>=exp.arrivalAbsDay)completeWorldExpedition(exp)
 }
}

function updateSeaTech(){
 const t=state.world.seaTech,b=state.buildings;
 if(state.year>=3&&b.workshop){t.sail.p=clamp(t.sail.p+.08+avgSkill('목공')*.0012,0,100)}
 if(state.year>=5&&state.tech.기록습관.open){t.navigation.p=clamp(t.navigation.p+.07+avgSkill('기록')*.0012,0,100)}
 if(state.year>=5&&b.storage){t.stores.p=clamp(t.stores.p+.075+avgSkill('농업')*.0009,0,100)}
 for(const v of Object.values(t))if(!v.open&&v.p>=100){v.p=100;v.open=true;addLog('good',`${v.label} 준비 완료`,`${v.label}이 한 사람의 요령이 아니라 원정대가 반복해서 사용할 수 있는 생활 기술로 정리되었다.`,'기록','바다로 나가기 전에 돌아올 방법부터 준비했다.')}
}
function syncWorldCityTimeline(){
 const target=Math.min(126,Math.max(1,1+Math.floor(125*Math.pow(Math.min(1,state.year/200),1.22))));
 if(state.world.foundedCities.length>=target)return;
 const candidates=WORLD_DATA.cities.filter(c=>state.world.knownRegions.includes(c.region)&&!state.world.foundedCities.includes(c.id));
 candidates.sort((a,b)=>a.id.localeCompare(b.id));
 while(state.world.foundedCities.length<target&&candidates.length){
  const c=candidates.shift();state.world.foundedCities.push(c.id)
 }
}
function updateWorldEngine(){
 normalizeWorldState();updateSeaTech();processWorldExpeditionsDaily();simulateDiplomacyDaily();syncLocalCountryPopulation();maybeShiftTrajectory();
 const explorerCount=state.residents.filter(r=>r.brain?.action==='explore').length;
 state.world.landProgress=clamp(state.world.landProgress+.015+explorerCount*.018+avgSkill('채집')*.00025,0,9999);
 if(state.world.seaTech.sail.open&&state.world.seaTech.navigation.open&&state.world.seaTech.stores.open){
  state.world.seaProgress=clamp(state.world.seaProgress+.025+explorerCount*.012,0,9999)
 }

 // Even countries on the same continent require a real expedition before residents can contact them.
 const arkeaCountries=Object.keys(COUNTRY_META).filter(n=>COUNTRY_META[n].region==='아르케아 중앙대륙'&&n!=='에르단 왕국');
 const uncontactedArkea=arkeaCountries.filter(n=>!state.world.contactedCountries.includes(n)&&!activeExpeditionToCountry(n))
   .sort((a,b)=>cityDistanceKm('L001',countryNearestCity(a)?.id)-cityDistanceKm('L001',countryNearestCity(b)?.id));
 const countryThreshold=50+state.world.contactedCountries.length*42;
 if(uncontactedArkea.length&&state.world.landProgress>=countryThreshold&&!state.world.expeditions.some(e=>e.active&&e.kind==='land')){
   scheduleCountryExpedition(uncontactedArkea[0],'land')
 }

 const landRegions=WORLD_DATA.regions.map(r=>r.name).filter(n=>!['아르케아 중앙대륙','네레이아 해권','드라바스 화산군도','루메라 부유제도'].includes(n));
 const unknownLand=landRegions.filter(n=>!state.world.knownRegions.includes(n)&&!activeExpeditionTo(n));
 const threshold=260+state.world.knownRegions.length*160;
 if(!uncontactedArkea.length&&unknownLand.length&&state.world.landProgress>=threshold&&absDay()-state.world.lastRegionRevealAbsDay>120&&!state.world.expeditions.some(e=>e.active&&e.kind==='land')){
   scheduleWorldExpedition(nearestRegionToArkea(unknownLand),'land')
 }

 if(state.year>=10&&!state.world.firstSeaExpedition&&state.world.seaTech.sail.open&&state.world.seaTech.navigation.open&&state.world.seaTech.stores.open&&state.world.seaProgress>=100){
   if(scheduleWorldExpedition('네레이아 해권','sea')){
     state.world.firstSeaExpedition=true;
     addLog('story','첫 장거리 해상 원정 시작',`돛·연안항법·원정저장을 갖춘 배가 출항했다. 네레이아까지는 실제 거리와 항해 속도로 계산되어 수개월이 걸릴 수 있다.`,'기록','바다는 지도 한 칸이 아니라 수천 킬로미터의 생활 공간이었다.')
   }
 }
 if(state.world.knownRegions.includes('네레이아 해권')&&state.year>=18&&state.world.seaProgress>=260&&!activeExpeditionTo('드라바스 화산군도'))scheduleWorldExpedition('드라바스 화산군도','sea');
 if(state.year>=24&&state.world.landProgress>=850&&!activeExpeditionTo('루메라 부유제도'))scheduleWorldExpedition('루메라 부유제도','land');
 syncWorldCityTimeline()
}

function annualWorldPopulation(){
 annualCountryPopulationSimulation();simulateExternalWarsAnnual()
}
function annualSummary(prev){
 const now={population:state.residents.length,world:state.worldPopulation,house:state.buildings.house,field:state.buildings.field,tech:countOpenTech(),level:state.civ.levelName,builds:state.civ.builds||0};
 if(prev){
  const c=[];
  if(now.population!==prev.population)c.push(`주민 ${prev.population}→${now.population}명`);
  if(now.house!==prev.house)c.push(`주택 ${prev.house}→${now.house}채`);
  if(now.field!==prev.field)c.push(`경작지 ${prev.field}→${now.field}구역`);
  if(now.tech!==prev.tech)c.push(`생활기술 ${prev.tech}→${now.tech}개`);
  if(now.builds!==(prev.builds??now.builds))c.push(`완성 시설 ${prev.builds??0}→${now.builds}건`);
  if(now.level!==prev.level)c.push(`정착지 ${prev.level}→${now.level}`);
  if(c.length)addLog('story',`세계력 ${state.year-1}년의 결산`,c.join(', ')+'. 한 해의 성장은 마을 풍경에서 먼저 드러났다.','기록','같은 해를 두 번 사는 사람은 없었다. 남은 것은 달라진 집과 사람, 그리고 다음 해에 고칠 문제였다.');
  else{
   const shortages=[['식량',state.resources.food],['물',state.resources.water],['목재',state.resources.wood],['돌',state.resources.stone],['노동',state.resources.labor]].sort((a,b)=>a[1]-b[1]);
   addLog('warn',`세계력 ${state.year-1}년의 정체 기록`,`눈에 보이는 확장이 없었던 한 해였다. 가장 부족한 자원은 ${shortages[0][0]} ${Math.floor(shortages[0][1])}. 주민들은 다음 해에 무엇을 바꿔야 하는지 이 정체 자체를 기록으로 남겼다.`,'기록','발전하지 못한 해도 원인을 남기면 다음 선택의 자료가 된다.')
  }
 }
 state.civ.lastAnnual=now
}

function tryMilestones(){
 const b=state.buildings;let majorBuilt=false;const buildReady=()=>!majorBuilt&&(absDay()-(state.civ.lastBuildAbsDay??-999)>=5);const markBuilt=()=>{majorBuilt=true;state.civ.lastBuildAbsDay=absDay()};
 if(buildReady()&&!state.flags.firstField&&state.resources.wood>=8&&state.resources.stone>=4&&state.resources.labor>=12){spend({wood:8,stone:4,labor:12});b.field=Math.max(1,b.field||0);state.flags.firstField=true;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('story','첫 밭이 생기다','돌을 골라내고 흙을 뒤집어 감나무뜰의 첫 경작지를 만들었다. 다음 날부터 주민의 식량 계산이 달라졌다.','아람','씨앗을 먹지 않고 남겨두는 순간부터 밭은 내일의 일이 돼.')}
 if(state.flags.firstField&&!state.flags.firstHarvest&&state.day>=18&&state.resources.food>=28){
  state.flags.firstHarvest=true;gain({food:8});
  addLog('story','첫 수확을 나누다','감나무뜰의 첫 경작지에서 먹을 몫과 다시 심을 씨앗을 나누는 수확이 이루어졌다. 이제 밭은 단순한 흙이 아니라 다음 계절을 준비하는 생산 기반이 되었다.','아람','다 먹으면 오늘은 편하지만 내일이 없어. 씨앗 몫부터 남기자.')
 }
 const needH=Math.max(2,Math.ceil(state.residents.length/3));
 if(buildReady()&&state.flags.firstField&&b.house<needH&&state.resources.wood>=10&&state.resources.stone>=3&&state.resources.labor>=8){spend({wood:10,stone:3,labor:8});b.house++;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('good',`주택 ${b.house}호 완성`,`주민 ${state.residents.length}명에게 필요한 잠자리를 맞추기 위해 새 지붕 하나가 더 생겼다.`,'가람','사람이 늘면 지붕도 늘어야 해.')}
 if(buildReady()&&state.flags.firstField&&!b.storage&&state.resources.wood>=15&&state.resources.stone>=8&&state.resources.labor>=13){spend({wood:15,stone:8,labor:13});b.storage=Math.max(1,b.storage||0);state.flags.storage=true;state.civ.builds++;state.caps.food+=90;state.caps.wood+=60;syncVillageVisuals(true);addLog('story','공동 저장고 완성','수확물을 바닥에서 띄워 보관하는 공동 저장고가 생겼다.','가람','저장은 쌓는 게 아니라 상하지 않게 남기는 일이야.')}
 if(buildReady()&&state.tech.목공기초.open&&!b.workshop&&state.resources.wood>=18&&state.resources.stone>=8&&state.resources.labor>=15){spend({wood:18,stone:8,labor:15});b.workshop=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('story','작업장이 세워지다','도구 수리와 제작을 위한 지붕 있는 작업장이 따로 생겼다.','가람','실패한 도구도 왜 망가졌는지부터 보자.')}
 if(buildReady()&&state.tech.수로관리.open&&!b.well&&state.resources.wood>=8&&state.resources.stone>=12&&state.resources.labor>=10){spend({wood:8,stone:12,labor:10});b.well=1;state.civ.builds++;state.caps.water+=90;syncVillageVisuals(true);addLog('story','공동 우물 완성','하천까지 매번 내려가지 않아도 물을 길을 수 있는 공동 우물이 완성됐다.','가람','물은 가까워졌다고 끝이 아니야.')}
 if(buildReady()&&state.tech.공동취사.open&&!b.kitchen&&state.resources.wood>=14&&state.resources.stone>=5&&state.resources.labor>=12){spend({wood:14,stone:5,labor:12});b.kitchen=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('story','공동 부엌이 독립하다','불과 식재료, 배급을 한곳에서 관리하는 공동 부엌이 생겼다.','다온','먹는 순서부터 정하자.')}
 if(buildReady()&&state.tech.토기저장.open&&!b.kiln&&state.resources.wood>=10&&state.resources.stone>=15&&state.resources.labor>=10){spend({wood:10,stone:15,labor:10});b.kiln=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('story','첫 공동 가마','그릇을 반복해서 구울 수 있는 공동 가마가 생겼다.','여울','같은 모양보다 같은 쓰임을 다시 만들 수 있어야 해.')}
 if(buildReady()&&state.tech.약초분류.open&&!b.herb&&state.resources.wood>=10&&state.resources.labor>=7){spend({wood:10,labor:7});b.herb=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('good','약초 건조대 완성','채집한 풀을 말리고 구분할 건조대가 생겼다.','새봄','모르는 풀은 먼저 따로 두자.')}
 if(buildReady()&&state.tech.사육기초.open&&!b.pen&&state.resources.wood>=15&&state.resources.stone>=3&&state.resources.labor>=10){spend({wood:15,stone:3,labor:10});b.pen=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('good','첫 사육 울타리','동물이 머물 수 있지만 완전히 갇히지는 않는 생활 울타리가 생겼다.','솔','서로 놀라지 않게 하는 거리여야 해.')}
 if(buildReady()&&state.tech.기록습관.open&&!b.meeting&&b.house>=5&&state.resources.wood>=18&&state.resources.stone>=6&&state.resources.labor>=14){spend({wood:18,stone:6,labor:14});b.meeting=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('story','공동 마루가 생기다','물과 식량, 일을 의논할 공동 마루가 생겼다.','보리','아이에게 설명할 수 없는 규칙이면 다시 설명해야 해.')}
 if(buildReady()&&state.tech.직조기초.open&&!b.loom&&state.resources.wood>=12&&state.resources.labor>=10){spend({wood:12,labor:10});b.loom=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('good','공동 베틀이 놓이다','생활용 천을 반복해서 만들 수 있는 베틀이 놓였다.','다솜','실은 겹치면 바람을 막아.')}
 if(buildReady()&&state.tech.야간교대.open&&!b.watch&&state.resources.wood>=18&&state.resources.stone>=4&&state.resources.labor>=13){spend({wood:18,stone:4,labor:13});b.watch=1;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('good','야간 망루 완성','교대 경계를 위한 작은 망루가 세워졌다.','한결','겁난 채로도 돌아올 길을 만들면 돼.')}
 const target=Math.max(1,Math.ceil(state.residents.length/8));
 if(buildReady()&&b.field<Math.min(6,target)&&state.resources.wood>=5&&state.resources.stone>=2&&state.resources.labor>=8){spend({wood:5,stone:2,labor:8});b.field++;state.civ.builds++;markBuilt();syncVillageVisuals(true);addLog('good',`경작지 ${b.field}구역으로 확장`,`주민 수와 식량 소비가 늘어 새 고랑을 만들었다.`,'아람','먹을 사람 수만큼 다음 계절을 준비하는 거야.')}
 updateCivilizationLevel()
}
function advanceDay(){
 state.day++;
 if(state.day>365){
   const prev=state.civ.lastAnnual||{population:state.residents.length,world:state.worldPopulation,house:state.buildings.house,field:state.buildings.field,tech:countOpenTech(),level:state.civ.levelName,builds:state.civ.builds||0};
   state.day=1;state.year++;state.residents.forEach(r=>r.age++);
   guarded('연간인구',()=>annualWorldPopulation());
   guarded('연간기록',()=>annualSummary(prev))
 }
 guarded('이명자생애',()=>processMyeongjaLifecycle());
 guarded('인구동기화',()=>syncOfficialPopulationRuntime(true));
 guarded('성장단계',()=>updateLifeStages());
 guarded('지역확장',()=>updateLocalMapExpansion(true));
 guarded('경제',()=>dailySettlementEconomy());
 guarded('욕구',()=>advanceBrainNeeds());
 guarded('기술',()=>dailyTechEngine());
 guarded('세계시뮬',()=>updateWorldEngine());
 guarded('분쟁발생',()=>maybeConflictsDaily());
 guarded('날씨',()=>{
   if(Math.random()<.075){state.weather=pick(['맑음','흐림','약한 비','바람']);if(state.weather==='약한 비')gain({water:2.5})}
 });
 guarded('마일스톤',()=>tryMilestones());
 guarded('마을시각화',()=>syncVillageVisuals(false));
 state.demography.children=state.residents.filter(r=>r.age<16).length;
 if(!state.civ.lastAnnual)state.civ.lastAnnual={population:state.residents.length,world:state.worldPopulation,house:state.buildings.house,field:state.buildings.field,tech:countOpenTech(),level:state.civ.levelName,builds:state.civ.builds||0};
 save();uiDirty=true
}
let dayTimer=0;function daysPerSecond(){return state.speed===20?2.5:state.speed===5?.75:state.speed===1?.22:0}
function updateSim(dt){if(!state.running||state.speed===0)return;dayTimer+=dt*daysPerSecond();while(dayTimer>=1){dayTimer-=1;advanceDay()}}
function updatePeople(dt,now){
 const timeScale=state.speed===20?3.0:state.speed===5?1.75:state.speed===1?1:.25;
 people.forEach(p=>{
   const ud=p.userData;resetPose(ud);
   if(ud.combatOverride&&updateDefenderCombat(p,dt,now))return;
   if(ud.mode==='thinking'){decideResident(p);return}
   if(ud.mode==='walking'){
     ud.tool.visible=false;
     // helping/socializing targets can move; gently refresh target
     if(ud.partnerId&&['help','socialize'].includes(ud.action)){const pp=personMap.get(ud.partnerId);if(pp)ud.target.lerp(pp.position,.08)}
     const d=ud.target.clone().sub(p.position);d.y=0;const dist=d.length();
     if(dist>.42){
       d.normalize();p.position.addScaledVector(d,ud.speed*timeScale*dt);p.rotation.y=Math.atan2(d.x,d.z);
       const swing=Math.sin(now*.009*ud.speed*timeScale)*.52;ud.limbs.la.rotation.x=swing;ud.limbs.ra.rotation.x=-swing;ud.limbs.ll.rotation.x=-swing*.78;ud.limbs.rl.rotation.x=swing*.78;
     }else{
       ud.mode=ud.nextMode;ud.workTimer=ud.mode==='working'?rand(3.8,7.2):rand(3.5,6.5);
       ud.task=ud.mode==='working'?`${ACTION_META[ud.action]?.label||ud.action} 중`:'쉬는 중';ud.workPulse=0
     }
     return
   }
   ud.workTimer-=dt*timeScale;
   if(ud.mode==='working')animateWorking(p,now);else animateResting(ud,now);
   if(ud.workTimer<=0){applyActionEffect(p);ud.mode='thinking';ud.task='다음 일을 생각하는 중';setThoughtIcon(ud,'💭');if(selectedBrainId===ud.id)renderBrainPanel(state.residents.find(r=>r.id===ud.id))}
 })
}
// ---------- MINIMAP / UI ----------
const mini=$('minimap'),mctx=mini.getContext('2d');function worldToMini(x,z){const b=localMapBounds();return{x:mini.width/2+(x/b.x)*(mini.width*.46),y:mini.height/2+(z/b.z)*(mini.height*.46)}}function drawMini(){const w=mini.width,h=mini.height;mctx.clearRect(0,0,w,h);mctx.fillStyle='#70885d';mctx.fillRect(0,0,w,h);mctx.fillStyle='#6d9baa';mctx.fillRect(w*.75,0,w*.08,h);mctx.fillStyle='#8d724f';for(const [a,b]of [[LOC.center,LOC.field],[LOC.center,LOC.river],[LOC.center,LOC.forest],[LOC.center,LOC.stone]]){const p=worldToMini(a.x,a.z),q=worldToMini(b.x,b.z);mctx.strokeStyle='#ad936b';mctx.lineWidth=5;mctx.beginPath();mctx.moveTo(p.x,p.y);mctx.lineTo(q.x,q.y);mctx.stroke()}const f=worldToMini(LOC.field.x,LOC.field.z);mctx.fillStyle='#82643e';mctx.fillRect(f.x-18,f.y-14,36,28);// buildings
for(let i=0;i<(state.buildings.house||0);i++){const s=HOUSE_SPOTS[i%HOUSE_SPOTS.length],q=worldToMini(s[0],s[1]);mctx.fillStyle='#d6b17b';mctx.fillRect(q.x-3,q.y-3,6,6)}
if(state.buildings.storage){const q=worldToMini(9,-14);mctx.fillStyle='#8a5d35';mctx.fillRect(q.x-5,q.y-5,10,10)}
if(state.buildings.workshop){const q=worldToMini(LOC.workshop.x,LOC.workshop.z);mctx.fillStyle='#6b4c32';mctx.fillRect(q.x-4,q.y-4,8,8)}
if(state.buildings.herb){const q=worldToMini(LOC.herbs.x+4,LOC.herbs.z-2);mctx.fillStyle='#7ca465';mctx.fillRect(q.x-3,q.y-3,6,6)}
if(state.buildings.pen){const q=worldToMini(LOC.pen.x,LOC.pen.z);mctx.strokeStyle='#c3a574';mctx.strokeRect(q.x-5,q.y-5,10,10)}if(state.buildings.well){const q=worldToMini(20,6);mctx.fillStyle='#6f9eb1';mctx.beginPath();mctx.arc(q.x,q.y,4,0,Math.PI*2);mctx.fill()}if(state.buildings.kitchen){const q=worldToMini(-8,-14);mctx.fillStyle='#b58d58';mctx.fillRect(q.x-4,q.y-4,8,8)}if(state.buildings.kiln){const q=worldToMini(14,-23);mctx.fillStyle='#9a684d';mctx.beginPath();mctx.arc(q.x,q.y,4,0,Math.PI*2);mctx.fill()}if(state.buildings.watch){const q=worldToMini(-28,-3);mctx.fillStyle='#d0b27f';mctx.fillRect(q.x-3,q.y-6,6,12)}
const pq=worldToMini(player.position.x,player.position.z);mctx.fillStyle='#6f8dff';mctx.beginPath();mctx.arc(pq.x,pq.y,7,0,Math.PI*2);mctx.fill();
const bq=worldToMini(bokshil.position.x,bokshil.position.z);mctx.fillStyle='#8c5f3e';mctx.beginPath();mctx.arc(bq.x,bq.y,5,0,Math.PI*2);mctx.fill();
for(const a of animals){const q=worldToMini(a.position.x,a.position.z);mctx.fillStyle=a.userData.domestic?'#e0bd74':'#759c67';mctx.beginPath();mctx.arc(q.x,q.y,a.userData.domestic?3.2:2.4,0,Math.PI*2);mctx.fill()}for(const h of conflictHostiles){if(!h||!h.userData||!h.position||h.userData.dead||!h.visible)continue;const q=worldToMini(h.position.x,h.position.z);mctx.fillStyle=h.userData.raidHuman?'#d44f43':'#c46a4d';mctx.beginPath();mctx.arc(q.x,q.y,h.userData.raidHuman?4:3.2,0,Math.PI*2);mctx.fill()}
if(state.flags.myeongjaDead){const gq=worldToMini(-9,10);mctx.fillStyle='#73746f';mctx.fillRect(gq.x-3,gq.y-5,6,10)}
for(const mo of monsters){if(mo.userData.dead)continue;const q=worldToMini(mo.position.x,mo.position.z);mctx.fillStyle='#bf5f63';mctx.beginPath();mctx.arc(q.x,q.y,4,0,Math.PI*2);mctx.fill()}
people.forEach(p=>{const q=worldToMini(p.position.x,p.position.z);mctx.fillStyle=p.userData.id==='C0001'?'#f2b665':'#f5e3b5';mctx.beginPath();mctx.arc(q.x,q.y,p.userData.id==='C0001'?7:5,0,Math.PI*2);mctx.fill()});if(eventFocus){const e=worldToMini(eventFocus.x,eventFocus.z);mctx.strokeStyle='#e66f65';mctx.lineWidth=4;mctx.beginPath();mctx.arc(e.x,e.y,12,0,Math.PI*2);mctx.stroke()}}
mini.addEventListener('pointerdown',e=>{const r=mini.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*140-70,z=(e.clientY-r.top)/r.height*110-55;autoFocus.set(x,0,z);setCameraMode('free')});
function renderResources(){$('resources').innerHTML=Object.entries(RESOURCE_META).map(([k,[n,i]])=>`<div class="res glass"><span>${i}</span><b>${Math.floor(state.resources[k])}</b><small>${n}</small></div>`).join('')}
function renderStory(){const l=currentStory();$('storyTitle').textContent=l.title||'감나무뜰의 하루';$('storyText').textContent=l.text||'아직 기록된 사건이 없다.';$('storyQuote').textContent=`“${storyQuoteFor(l)}”`;$('storySpeaker').textContent=`— ${l.speaker||'기록'}`;$('storyTime').textContent=`세계력 ${l.time||stamp()}`;$('tickerTitle').textContent=l.title||'감나무뜰의 하루';$('tickerText').textContent=l.text||''}

function renderBrainPanel(r){
 if(!r){$('brainPanel').classList.add('hidden');return}
 initResidentBrain(r);selectedBrainId=r.id;$('brainPanel').classList.remove('hidden');
 $('brainFace').textContent=r.name[0];$('brainName').textContent=`${r.name} · ${r.lifeStage||residentLifeStage(r.age)} · ${r.job} · ${r.age}세`;
 $('brainAction').textContent=`현재 행동: ${ACTION_META[r.brain.action]?.label||r.brain.action}`;
 $('brainThought').textContent=`“${r.brain.thought}”`;$('brainGoal').textContent=r.brain.goal||goalLabel(r);$('brainReason').textContent=r.brain.reason;
 const N=[['🍚','hunger','배고픔'],['😴','fatigue','피로'],['💬','social','외로움'],['🛡','safety','불안'],['❓','curiosity','호기심'],['★','achievement','성취']];
 $('brainNeeds').innerHTML=N.map(([ic,k,l])=>`<div class="need ${(r.needs[k]||0)>72?'high':''}"><span>${ic}</span><b>${Math.round(r.needs[k]||0)}</b></div>`).join('');
 $('brainAlt').innerHTML=(r.brain.alternatives||[]).map(x=>`<i>${ACTION_META[x.action]?.icon||''} ${ACTION_META[x.action]?.label||x.action} ${x.score}</i>`).join('');
 $('brainMemory').innerHTML=(r.memories||[]).slice(0,2).map(m=>`• ${m.text} <em>${m.time}</em>`).join('<br>')||'아직 특별한 기억이 없다.';
}
$('brainClose').onclick=()=>{selectedBrainId=null;$('brainPanel').classList.add('hidden')};

function renderPeopleList(){
 $('peopleList').innerHTML=state.residents.map(r=>{
   const p=personMap.get(r.id),task=p?.userData.task||ACTION_META[r.brain?.action]?.label||'생활 중',best=Object.entries(r.skills).sort((a,b)=>b[1]-a[1])[0];
   return`<div class="card resident-row"><div class="face">${r.name[0]}</div><div><b>${r.name} · ${r.job}</b><br><small>${r.id} · ${r.age}세 · ${task}</small><div class="bar"><i style="width:${r.bloom}%"></i></div><small>“${r.brain?.thought||'주변을 살피는 중'}”</small><br><small>${best[0]} ${Math.round(best[1])} · 개화 ${r.bloom.toFixed(1)}%</small></div><button class="focus-person" data-focus="${r.id}">보기</button></div>`
 }).join('')+(state.deceased||[]).map(d=>`<div class="card resident-row deceased-row"><div class="face">†</div><div><b>${d.name} · 사망</b><br><small>세계력 ${d.year}년 ${d.day}일 · ${d.cause}</small><br><small>활동 주민 목록에서는 제외되며 기록과 묘역에 남습니다.</small></div></div>`).join('');
 document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{followId=b.dataset.focus;$('followSelect').value=followId;setCameraMode('follow');renderBrainPanel(state.residents.find(r=>r.id===followId));$('sheet').classList.add('hidden')})
}
function renderWorld(){
 const b=state.buildings,t=state.tech,children=state.residents.filter(r=>r.age<16).length,adults=state.residents.length-children;
 $('worldCards').innerHTML=`<div class="card"><h3>${state.civ.levelName} · 마을 현황</h3><p>라엔 분지 주민 ${state.residents.length}명 (성인/청소년 ${adults} · 아이 ${children}) · 세계 인구 ${state.worldPopulation}명</p><span class="tag">주택 ${b.house}</span><span class="tag">밭 ${b.field}</span><span class="tag">저장고 ${b.storage}</span><span class="tag">작업장 ${b.workshop}</span><span class="tag">우물 ${b.well}</span><span class="tag">공동부엌 ${b.kitchen}</span><span class="tag">가마 ${b.kiln}</span><span class="tag">약초대 ${b.herb}</span><span class="tag">사육장 ${b.pen}</span><span class="tag">공동마루 ${b.meeting}</span><span class="tag">베틀 ${b.loom}</span><span class="tag">망루 ${b.watch}</span></div><div class="card"><h3>기술 발전 · ${countOpenTech()}개 정착</h3>${Object.entries(t).map(([k,v])=>`<p>${k} ${v.open?'✓':'· '+Math.floor(v.p)+'%'}</p><div class="bar"><i style="width:${v.open?100:Math.min(100,v.p)}%"></i></div>`).join('')}</div><div class="card"><h3>인구·세대</h3><p>공식 주민 원장을 출생년과 등장 시점에 맞춰 세계 안에 불러옵니다. 아이는 작게 보이고 성장하면서 할 수 있는 일이 늘어납니다.</p><span class="tag">출생 ${state.demography.births}</span><span class="tag">합류 ${state.demography.arrivals}</span><span class="tag">아이 ${children}</span></div><div class="card"><h3>핵심 인물·동료</h3><p>🐕 복실이: 세계력 0년 1일부터 마을 사람들 사이를 돌아다니는 동료입니다. 관찰자를 따라오지 않으며, 야생동물 습격 때 먼저 달려가 막습니다.</p><span class="tag">복실이 마을 순찰</span><span class="tag">이명자 ${state.flags.myeongjaDead?'3년 1일 사망':'생존'}</span></div><div class="card"><h3>동물·탐사 지도</h3><p>일반 야생동물은 몬스터와 별개로 처음부터 살아 움직입니다. 사육장이 생기면 닭과 염소가 실제 3D 개체로 들어옵니다.</p><span class="tag">야생동물 ${animals.filter(a=>!a.userData.domestic).length}</span><span class="tag">사육동물 ${animals.filter(a=>a.userData.domestic).length}</span><span class="tag">지역 확장 ${state.localMap.level+1}/4</span><span class="tag">드래그 ${dragMode==='pan'?'화면 이동':'회전'}</span></div><div class="card"><h3>주민 자율 AI</h3><p>하루가 지나면 하루치 생산·연구·건축이 반드시 계산됩니다. 배속을 올려도 문명 시간이 빈 채로 지나가지 않습니다.</p></div><div class="card"><h3>세계 확장 · 지구급 행성</h3><p>행성 둘레 40,075km · 주민 접촉 권역 ${state.world.knownRegions.length}/8 · 현재 형성 거점 ${state.world.foundedCities.length}/126 · 육상 탐사 ${Math.floor(state.world.landProgress)} · 해상 원정 ${Math.floor(state.world.seaProgress)}</p>${(state.world.expeditions||[]).filter(e=>e.active).map(e=>`<span class="tag">${e.region} ${Math.round(e.progress*100)}% · ${Math.max(0,e.arrivalAbsDay-absDay())}일 남음 · ${e.distanceKm.toLocaleString()}km</span>`).join('')}<span class="tag">${state.world.seaTech.sail.label} ${state.world.seaTech.sail.open?'✓':Math.floor(state.world.seaTech.sail.p)+'%'}</span><span class="tag">${state.world.seaTech.navigation.label} ${state.world.seaTech.navigation.open?'✓':Math.floor(state.world.seaTech.navigation.p)+'%'}</span><span class="tag">${state.world.seaTech.stores.label} ${state.world.seaTech.stores.open?'✓':Math.floor(state.world.seaTech.stores.p)+'%'}</span></div><div class="card"><h3>관찰자 세계 인구</h3><p>관찰자는 주민의 탐사 여부와 관계없이 30개 국가·세력권의 실제 시뮬레이션 인구를 모두 볼 수 있습니다.</p>${Object.entries(state.world.countries).sort((a,b)=>b[1].population-a[1].population).slice(0,10).map(([n,c])=>`<span class="tag">${n} ${c.population}명</span>`).join('')}<p>전체 국가는 🌍 세계지도에서 확인.</p></div><div class="card"><h3>현재 역사 노선 · ${trajectorySummary().name}</h3><p>고정 시나리오가 아니라 주민이 반복한 행동으로 변합니다.</p>${trajectorySummary().pairs.slice(0,5).map(([k,v])=>`<span class="trajectory-tag">${TRAJECTORY_NAMES[k]||k} ${v.toFixed(1)}</span>`).join('')}</div><div class="card"><h3>생태·전쟁 기록</h3><p>동물 습격 ${state.conflict.animalRaids}회 · 전투 ${state.conflict.warBattles}회 · 부상 ${state.conflict.wounded}명 · 식량 손실 ${state.conflict.foodLost.toFixed(1)}</p><span class="tag">현재 전쟁 ${(state.world.wars||[]).filter(w=>w.active).length}</span><span class="tag">외부 국가간 전쟁 ${(state.world.externalWars||[]).filter(w=>w.active).length}</span></div>`
}
function renderHistory(){$('historyList').innerHTML=state.logs.slice(0,220).map(l=>`<div class="log-item ${l.type}"><b>${l.title}</b><p>${l.text}</p><time>세계력 ${l.time} · ${l.speaker||''}</time></div>`).join('')}
function chronological(){return[...state.logs].sort((a,b)=>a.seq-b.seq)}function novelText(style='healing'){const L=chronological(),out=['문명: 감나무뜰의 창세기','CIVILIZATION: Genesis','',`원고 생성 시점: 세계력 ${stamp()}`,`현재 주민 ${state.residents.length}명 · 기록 사건 ${state.logs.length}개`,'','※ 아래 원고는 게임 안에서 실제 발생해 저장된 사건을 시간순으로 재구성한 것입니다.',''];if(style==='chronicle'){for(const l of L){out.push(`[세계력 ${l.time}] ${l.title}`,l.text,l.quote?`“${l.quote}” — ${l.speaker}`:'','')}return out.join('\n')}out.push('프롤로그 — 라엔 분지','',`아르케아 중앙대륙의 라엔 분지에는 아직 마을이라 부를 만한 것도 없었다. 흙과 물길, 낮은 둔덕, 그리고 오늘을 살아내야 하는 사람들이 있었을 뿐이었다.`,'',`말기 암을 앓는 이명자는 남은 시간을 모든 일을 혼자 해내는 데 쓰지 않았다. 대신 누가 흙을 읽고, 누가 도구를 만들고, 누가 기억을 기록으로 남기는지 바라보았다.`,'');let ch=0,lastYear=null;for(const l of L){const y=l.time.split('년')[0];if(y!==lastYear){lastYear=y;ch++;out.push(`제${ch}장 — 세계력 ${y}년`,'')}if(style==='webnovel'){out.push(l.type==='warn'?'그날, 평소와 다른 기척이 감나무뜰에 내려앉았다.':'작은 변화였다. 하지만 아무것도 없던 이곳에서는 작은 변화가 곧 역사였다.','',l.text,'',`“${storyQuoteFor(l)}”`,`${l.speaker||'이명자'}의 말이 오래 남았다.`,'')}else{out.push(l.text,'',`“${storyQuoteFor(l)}”`,`— ${l.speaker||'이명자'}`,`세계력 ${l.time}, 사람들은 그날을 ‘${l.title}’이라는 이름으로 기억했다.`,'')}}out.push('에필로그 — 계속되는 하루','',`현재 감나무뜰에는 ${state.residents.length}명의 주민이 살아간다. 식량 ${Math.floor(state.resources.food)}, 물 ${Math.floor(state.resources.water)}, 나무 ${Math.floor(state.resources.wood)}, 돌 ${Math.floor(state.resources.stone)}. 숫자는 작지만 그 안에는 사람들의 하루가 들어 있다.`,'','=== 등장인물 현재 기록 ===',...state.residents.map(r=>`${r.name}(${r.id}) · ${r.age}세 · ${r.job} · 잠재력 ${r.potential} · 개화율 ${r.bloom.toFixed(1)}% · ${r.note}`));return out.join('\n')}
function chronicleText(){return ['문명: 감나무뜰의 창세기 — 원본 연대기','',...chronological().flatMap(l=>[`[세계력 ${l.time}] ${l.title}`,l.text,l.quote?`“${l.quote}” — ${l.speaker}`:'',''])].join('\n')}function download(name,text){const blob=new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function renderNovel(){$('novelPreview').textContent=novelText($('novelStyle').value)}function updatePlayerHud(){
 const p=state.player,aw=p.awakened;
 $('playerName').textContent=aw?`나 · LV.${p.level}`:'나 · 관찰자';
 let status;
 if(!aw)status=`마을을 걷는 중 · 각성까지 ${Math.max(0,55-state.year)}년`;
 else if(p.dead)status=`쓰러짐 · 부활 대기 · 사망 ${p.deaths||0}회`;
 else if(selectedMonster&&!selectedMonster.userData.dead)status=`${selectedMonster.userData.name} 추적 · HP ${Math.max(0,Math.ceil(selectedMonster.userData.hp))}/${selectedMonster.userData.maxHp}`;
 else status=`EXP ${p.exp}/${p.nextExp} · 사냥 ${p.kills}회 · 사망 ${p.deaths||0}회${p.autoHunt?' · AUTO':''}`;
 $('playerStatus').textContent=status;
 if($('bokshilStatus'))$('bokshilStatus').textContent=bokshil?.userData?.status||'주민들 사이를 순찰 중';
 $('playerHpBar').style.width=`${clamp(p.hp/p.maxHp*100,0,100)}%`;
 const b=$('autoHuntBtn');b.classList.toggle('locked',!aw);b.classList.toggle('active',!!p.autoHunt&&aw);b.textContent=aw?(p.autoHunt?'AUTO ON':'사냥 AUTO'):'55년 잠김';
}
function renderUI(){
 updatePlayerHud();$('worldDate').textContent=`세계력 ${stamp()}`;$('worldSub').textContent=`${season()} · ${state.weather} · ${state.civ.levelName} · 주민 ${state.residents.length}명`;
 renderResources();renderStory();
 if(!$('sheet').classList.contains('hidden')){
  renderPeopleList();renderWorld();renderHistory();
  const active=document.querySelector('.tab.active')?.dataset.tab;if(active==='novel')renderNovel()
 }
 document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===state.speed));
 uiDirty=false
}
function showEvent(t){const e=$('eventPop');e.textContent='● '+t;e.classList.add('show');clearTimeout(showEvent.t);showEvent.t=setTimeout(()=>e.classList.remove('show'),2600)}


// Mobile HUD visibility
let hudHidden = localStorage.getItem('civilization_hud_hidden') === '1';
function applyHud(){
  document.body.classList.toggle('hud-off',hudHidden);
  const b=$('hudToggleBtn');
  if(b){
    b.textContent=hudHidden?'▣':'◱';
    b.title=hudHidden?'HUD 보이기':'HUD 숨기기';
    b.classList.toggle('active',hudHidden);
  }
}
$('hudToggleBtn').onclick=()=>{
  hudHidden=!hudHidden;
  localStorage.setItem('civilization_hud_hidden',hudHidden?'1':'0');
  applyHud();
};
applyHud();

// menu/events

const worldMapUI=new CivitasWorldMap({
 overlay:$('worldMapOverlay'),canvas:$('worldMapCanvas'),detail:$('worldMapDetail'),
 legend:$('worldMapLegend'),status:$('worldMapStatus'),countryList:$('worldCountryList'),
 getState:()=>state,data:WORLD_DATA,onClose:()=>{}
});
$('worldMapBtn').onclick=()=>worldMapUI.open();
$('mobileWorldMapBtn')?.addEventListener('click',()=>worldMapUI.open());

$('menuBtn').onclick=()=>{$('sheet').classList.remove('hidden');renderUI()};$('closeSheet').onclick=()=>$('sheet').classList.add('hidden');$('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))$('sheet').classList.add('hidden')});document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tabpage').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('tab-'+b.dataset.tab).classList.add('active');if(b.dataset.tab==='novel')renderNovel()});document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=Number(b.dataset.speed);state.running=state.speed>0;uiDirty=true;renderUI();save()});$('novelBtn').onclick=()=>download(`문명_감나무뜰_세계력_${state.year}년_${state.day}일.txt`,novelText('healing'));$('refreshNovel').onclick=renderNovel;$('novelStyle').onchange=renderNovel;$('downloadNovel').onclick=()=>download(`문명_감나무뜰_소설_${state.year}년_${state.day}일.txt`,novelText($('novelStyle').value));$('downloadChronicle').onclick=()=>download(`감나무뜰_원본연대기_${state.year}년_${state.day}일.txt`,chronicleText());$('resetBtn').onclick=()=>{if(confirm('모든 진행 기록을 지우고 세계력 0년 1일부터 다시 시작할까요?')){localStorage.removeItem(KEY);location.reload()}};

let uiDirty=true,lastUiRender=0;let last=performance.now();let viewportWatch=0;
const runtimeFaults=new Map();
function runtimeFault(name,err){
 const prev=runtimeFaults.get(name);
 runtimeFaults.set(name,{count:(prev?.count||0)+1,error:String(err?.message||err),time:performance.now()});
 console.error(`[${name}]`,err);
 const el=$('runtimeDiag'),txt=$('runtimeDiagText');
 if(el&&txt){
   el.classList.remove('hidden');
   txt.textContent=`v8.2 · ${name}: ${String(err?.message||err).slice(0,100)}`;
   clearTimeout(runtimeFault.hideTimer);
   runtimeFault.hideTimer=setTimeout(()=>el.classList.add('hidden'),5000)
 }
}
function guarded(name,fn){
 try{return fn()}catch(err){runtimeFault(name,err);return undefined}
}
function renderFrameAlways(){
 try{renderer.render(scene,camera)}
 catch(err){runtimeFault('3D 렌더러',err)}
}
function loop(now){
 const dt=Math.min(.04,Math.max(.001,(now-last)/1000));last=now;

 // A simulation error must never stop the 3D viewport.
 guarded('카메라',()=>updateCamera(now));
 renderFrameAlways();

 guarded('시간',()=>updateSim(dt));
 guarded('주민AI',()=>updatePeople(dt,now));
 guarded('플레이어',()=>updatePlayer(dt,now));
 guarded('복실이',()=>updateBokshil(dt,now));
 guarded('일반동물',()=>updateAnimals(dt,now));
 guarded('습격·전쟁',()=>updateConflictSystem(dt,now));
 guarded('몬스터',()=>updateMonsters(dt,now));
 guarded('불빛',()=>{flame.scale.y=.88+Math.sin(now*.012)*.14;fireLight.intensity=14+Math.sin(now*.02)*3});
 guarded('미니맵',()=>drawMini());

 if(now-viewportWatch>900){guarded('화면크기',()=>resizeWorld());viewportWatch=now}
 if(uiDirty&&now-lastUiRender>360){guarded('UI',()=>renderUI());lastUiRender=now}
 if((now|0)%300<18){
   guarded('플레이어HUD',()=>updatePlayerHud());
   if(selectedBrainId)guarded('주민패널',()=>renderBrainPanel(state.residents.find(r=>r.id===selectedBrainId)));
   guarded('분쟁HUD',()=>renderConflictHud())
 }
 if(!$('worldMapOverlay').classList.contains('hidden')&&((now|0)%700<18))guarded('세계지도',()=>worldMapUI.draw());

 // Render once more after object updates.
 renderFrameAlways();
 requestAnimationFrame(loop)
}
window.addEventListener('error',e=>runtimeFault('브라우저',e.error||e.message));
window.addEventListener('unhandledrejection',e=>runtimeFault('비동기',e.reason||'Promise 오류'));
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();runtimeFault('WebGL','그래픽 컨텍스트가 중단되었습니다.')},false);
renderer.domElement.addEventListener('webglcontextrestored',()=>{resizeWorld(true);showEvent('3D 화면을 복구했습니다.')},false);

// Valid camera + visible scene before simulation starts.
updateCamera(performance.now());
renderFrameAlways();
requestAnimationFrame(loop);
let resizeTimer=0;
function scheduleResize(){
 clearTimeout(resizeTimer);resizeWorld(true);
 resizeTimer=setTimeout(()=>resizeWorld(true),180)
}
addEventListener('resize',scheduleResize,{passive:true});
addEventListener('orientationchange',()=>{scheduleResize();setTimeout(()=>resizeWorld(true),420)},{passive:true});
window.visualViewport?.addEventListener('resize',scheduleResize,{passive:true});
window.visualViewport?.addEventListener('scroll',scheduleResize,{passive:true});
if(window.ResizeObserver)new ResizeObserver(()=>resizeWorld()).observe(gameRoot);
updateLifeStages();state.demography.children=state.residents.filter(r=>r.age<16).length;
{const score=civilizationScore();let f=CIV_LEVELS[0];for(const lv of CIV_LEVELS)if(score>=lv.score)f=lv;state.civ.levelName=f.name;state.civ.level=CIV_LEVELS.indexOf(f)}
updateLocalMapExpansion(false);syncVillageVisuals(false);renderUI();setTimeout(()=>$('loading').classList.add('hidden'),450);setInterval(save,5000);
