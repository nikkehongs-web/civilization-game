import * as THREE from 'three';
import { StateMachine } from './state-machine.js';
import { CombatRules, PlayerStates, MonsterStates } from './combat-rules.js';
import { CivitasWorldMap } from './world-map.js?v=9.6';
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
const KEY='civilization_genesis_living_ai_v1';
const RESOURCE_META={food:['식량','🌾'],water:['물','💧'],wood:['나무','🪵'],stone:['돌','🪨'],labor:['노동','🧺']};
const JOB_SKILL={'생활경영자':'기록','농지운영자':'농업','씨앗선별자':'농업','수로구조사':'목공','공동부엌지기':'요리','동물돌봄이':'사육','도공':'도공','농부':'농업','목수':'목공','요리사':'요리','약초사':'약초','사육사':'사육','기록자':'기록','채집가':'채집'};
const LOC={center:new THREE.Vector3(0,0,0),field:new THREE.Vector3(-18,0,12),river:new THREE.Vector3(30,0,12),forest:new THREE.Vector3(-35,0,-24),stone:new THREE.Vector3(33,0,-23),workshop:new THREE.Vector3(10,0,-13),herbs:new THREE.Vector3(-7,0,28),pen:new THREE.Vector3(20,0,25),meeting:new THREE.Vector3(0,0,-4)};

const CHARACTER_ART={
 player:'./player.webp',
 residentMale:'./resident_male.webp',
 residentFemale:'./resident_female.webp',
 myeongja:'./myeongja.webp',
 bokshil:'./bokshil.webp',
 monster:'./monster.webp'
};
const CHARACTER_PORTRAIT={
 player:'./player_portrait.webp',
 residentMale:'./resident_male_portrait.webp',
 residentFemale:'./resident_female_portrait.webp',
 myeongja:'./myeongja_portrait.webp',
 bokshil:'./bokshil_portrait.webp',
 monster:'./monster_portrait.webp'
};
const artTextureLoader=new THREE.TextureLoader();
const artTextureCache=new Map();
function artTexture(url){
 if(!artTextureCache.has(url)){
   const t=artTextureLoader.load(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=1;artTextureCache.set(url,t)
 }
 return artTextureCache.get(url)
}
function makeArtBillboard(url,width,height,y=1.4){
 const mat=new THREE.SpriteMaterial({map:artTexture(url),transparent:true,depthWrite:false,alphaTest:.04});
 const s=new THREE.Sprite(mat);s.scale.set(width,height,1);s.position.set(0,y,.02);s.renderOrder=7;s.userData.characterArt=true;return s
}
function portraitForResident(r){
 if(r.id==='C0001')return CHARACTER_PORTRAIT.myeongja;
 return (r.gender==='여성'||r.gender==='F')?CHARACTER_PORTRAIT.residentFemale:CHARACTER_PORTRAIT.residentMale
}

const RESIDENT_SEED = await fetch('./seed_residents.json')
  .then(r=>{if(!r.ok)throw new Error(`seed_residents.json load failed: ${r.status}`);return r.json()});
const OFFICIAL_LOCAL_CATALOG = await fetch('./residents.json')
  .then(r=>{if(!r.ok)throw new Error(`residents.json load failed: ${r.status}`);return r.json()});
const MONSTER_CATALOG = await fetch('./monsters.json')
  .then(r=>{if(!r.ok)throw new Error(`monsters.json load failed: ${r.status}`);return r.json()});
const WORLD_DATA = await fetch('./world.json?v=9.6')
  .then(r=>{if(!r.ok)throw new Error(`world.json load failed: ${r.status}`);return r.json()});
const WORLD_PEOPLE_SEED = await fetch('./world-people.json?v=9.6')
  .then(r=>{if(!r.ok)throw new Error(`world-people.json load failed: ${r.status}`);return r.json()});
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
 const all=Object.keys(COUNTRY_META),state={};
 for(const n of all){
  const h=stableHash01(n),pop=WORLD_PEOPLE_SEED.filter(p=>p.c===n&&p.alive!==0).length;
  state[n]={
   population:pop,lastPopulation:pop,region:COUNTRY_META[n].region,cities:COUNTRY_META[n].cities,settlements:1,
   growth:.009+h*.013,aggression:Math.round(20+h*65),openness:Math.round(25+stableHash01(n+'o')*65),
   prosperity:Math.round(30+stableHash01(n+'p')*55),births:0,deaths:0,migration:0,
   children:0,adults:0,elders:0,households:0,workers:0,
   food:Math.round(38+stableHash01(n+'food')*32),tech:Math.round(4+stableHash01(n+'tech')*12),
   infrastructure:Math.round(5+stableHash01(n+'infra')*12),military:Math.round(3+stableHash01(n+'mil')*10),
   exploration:Math.round(3+stableHash01(n+'exp')*9),stability:Math.round(48+stableHash01(n+'stab')*34),
   knownCountries:[n],history:[],events:[],stage:'소집단',
   economy:{grain:40,wood:35,stone:25,metal:8,livestock:12,cloth:6,fish:8},
   diplomacy:{},treaties:[],tradeRoutes:[],refugeesIn:0,refugeesOut:0,
   army:{mobilized:0,supply:100,morale:70,casualties:0,veterans:0},
   ecology:{deer:18,rabbit:32,boar:10,wolf:6,forest:72,soil:68,water:70,pressure:8},
   causal:[]
  }
 }
 return state
}

const DOG_NAME_POOL=['구름','밤이','별이','솔이','누리','보리','마루','달이','초롱','바람','설이','토리','담이','하늘','복돌','겨울','여름','노을','단풍','샘이'];
function defaultDogLineage(){
 return{
   seq:1,lastLitterAbsDay:-999,lastArrivalAbsDay:-999,totalBirths:0,totalDeaths:0,
   dogs:[{
     id:'DOG-BOKSHIL',name:'복실이',sex:'M',generation:0,founder:true,outsider:false,
     bornAbsDay:-1095,lifespanDays:5475,parents:[],alive:true,role:'마을경비'
   }]
 }
}

function defaultTrajectory(){
 return{cooperation:12,exploration:10,pastoral:8,scholarship:9,trade:4,militarism:2,centralization:5,ecology:8,current:'초기 공동체',lastShiftDay:-999}
}

function initialWorldSettlements(){
 const ids=[];
 for(const n of Object.keys(COUNTRY_META)){
   const cs=WORLD_DATA.cities.filter(c=>c.country===n).sort((a,b)=>a.id.localeCompare(b.id));
   if(cs.length)ids.push(cs[0].id)
 }
 if(!ids.includes('L001'))ids.unshift('L001');
 return [...new Set(ids)]
}
function cloneWorldPeopleSeed(){return WORLD_PEOPLE_SEED.map(p=>({...p}))}

function defaultWorldState(){
 return{
  knownRegions:['아르케아 중앙대륙'],
  foundedCities:initialWorldSettlements(),
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
 state.world.countries??=initialCountryState();for(const[n,v]of Object.entries(initialCountryState())){state.world.countries[n]??=v;const c=state.world.countries[n];c.economy??=JSON.parse(JSON.stringify(v.economy));c.diplomacy??={};c.treaties??=[];c.tradeRoutes??=[];c.refugeesIn??=0;c.refugeesOut??=0;c.army??=JSON.parse(JSON.stringify(v.army));c.ecology??=JSON.parse(JSON.stringify(v.ecology));c.causal??=[]}
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

function fresh(){return{year:0,day:1,speed:1,running:true,weather:'맑음',resources:{food:22,water:28,wood:14,stone:8,labor:22},caps:{food:100,water:100,wood:100,stone:100,labor:60},buildings:{house:2,field:0,storage:0,workshop:0,herb:0,pen:0,meeting:0,well:0,kiln:0,kitchen:0,watch:0,loom:0},tech:{기록습관:{p:0,open:false},공동취사:{p:0,open:false},건조저장:{p:0,open:false},목공기초:{p:0,open:false},약초분류:{p:0,open:false},사육기초:{p:0,open:false},수로관리:{p:0,open:false},토기저장:{p:0,open:false},직조기초:{p:0,open:false},야간교대:{p:0,open:false}},residents:initialOfficialResidents(0,1),logs:[{seq:1,type:'story',time:'0년 1일',title:'황무지의 첫 아침',text:'이명자와 주민들이 라엔 분지의 흙과 물길을 살폈다. 복실이는 처음부터 사람들 곁을 맴돌며 새 터의 냄새를 맡고 있었다.',speaker:'이명자',quote:'오늘 한 뼘만 더 갈아엎으면, 내일은 누군가 그 위에 씨앗을 놓을 수 있겠지.'}],seq:1,flags:{firstField:false,firstHarvest:false,storage:false,illness:false,myeongjaDead:false,myeongjaDeathLogged:false},currentStorySeq:1,demography:{births:0,arrivals:0,children:0},civ:{level:0,levelName:'야영지',techUnlocked:0,builds:0,lastAnnual:null},eventMemory:{},worldPopulation:300,world:defaultWorldState(),worldPeople:cloneWorldPeopleSeed(),worldPersonSeq:1000000,localMap:{level:0,revealedRadius:90,lastExpansionYear:-1},animalStats:{wild:7,domestic:0,care:0},trajectory:defaultTrajectory(),conflict:{animalRaids:0,warBattles:0,lastAnimalRaidDay:-999,lastBattleDay:-999,foodLost:0,wounded:0,raidersDefeated:0,animalsRepelled:0},companion:{bokshil:{x:1.2,z:4.5,active:true}},dogLineage:defaultDogLineage(),deceased:[],player:{x:3,z:3,level:1,exp:0,nextExp:100,hp:100,maxHp:100,attack:14,kills:0,deaths:0,dead:false,respawnAt:0,awakened:false,autoHunt:false}}};
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
state.flags??={};state.storyCooldowns??={};state.schemaVersion=96;
state.speed??=1;state.running??=true;state.logs??=[];
if(!state.logs.length)state.logs=[{seq:1,type:'story',time:`${state.year||0}년 ${state.day||1}일`,title:'기록 복구',text:'이전 기록 일부가 비어 있어 현재 세계 상태를 기준으로 연대기를 다시 이어간다.',speaker:'기록',quote:'사라진 기록은 추측하지 않고, 남아 있는 세계에서 다시 시작한다.'}];
state.seq??=Math.max(1,...state.logs.map(l=>Number(l.seq)||0));state.currentStorySeq??=state.logs[0]?.seq||1;state.residents??=JSON.parse(JSON.stringify(RESIDENT_SEED));state.buildings??={house:2,field:0,storage:0,workshop:0,herb:0,pen:0,meeting:0,well:0,kiln:0,kitchen:0,watch:0,loom:0};for(const k of ['house','field','storage','workshop','herb','pen','meeting','well','kiln','kitchen','watch','loom'])state.buildings[k]??=(k==='house'?2:0);state.tech??={};for(const k of ['기록습관','공동취사','건조저장','목공기초','약초분류','사육기초','수로관리','토기저장','직조기초','야간교대'])state.tech[k]??={p:0,open:false};state.demography??={births:0,arrivals:0,children:0};state.civ??={level:0,levelName:'야영지',techUnlocked:0,builds:0,lastAnnual:null,lastBuildAbsDay:-999};state.civ.lastBuildAbsDay??=-999;state.eventMemory??={};
state.localMap??={level:0,revealedRadius:90,lastExpansionYear:-1};
state.animalStats??={wild:7,domestic:0,care:0};
state.companion??={bokshil:{x:(state.player?.x??3)-1.2,z:(state.player?.z??3)+1.5,active:true}};
state.companion.bokshil??={x:(state.player?.x??3)-1.2,z:(state.player?.z??3)+1.5,active:true};
state.dogLineage??=defaultDogLineage();
state.dogLineage.seq??=1;state.dogLineage.lastLitterAbsDay??=-999;state.dogLineage.lastArrivalAbsDay??=-999;state.dogLineage.totalBirths??=0;state.dogLineage.totalDeaths??=0;state.dogLineage.dogs??=defaultDogLineage().dogs;
if(!state.dogLineage.dogs.some(d=>d.id==='DOG-BOKSHIL'))state.dogLineage.dogs.unshift(defaultDogLineage().dogs[0]);
for(const d of state.dogLineage.dogs){d.alive??=true;d.parents??=[];d.generation??=0;d.bornAbsDay??=-1095;d.lifespanDays??=(d.id==='DOG-BOKSHIL'?5475:4745)}
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
state.worldPeople??=cloneWorldPeopleSeed();
state.worldPersonSeq??=1000000;
for(const p of state.worldPeople){p.alive??=1}
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
 if(state.world?.countries)for(const c of Object.values(state.world.countries)){if(c.history?.length>80)c.history=c.history.slice(-80);if(c.events?.length>16)c.events=c.events.slice(0,16)}
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
const frontierShared={
 trunkGeo:new THREE.CylinderGeometry(.12,.20,1.7,6),
 crownGeo:new THREE.ConeGeometry(.86,2.15,7),
 rockGeo:new THREE.DodecahedronGeometry(.55,0),
 bushGeo:new THREE.IcosahedronGeometry(.48,0),
 trunkMat:new THREE.MeshStandardMaterial({color:0x5c432e,roughness:1}),
 crownMat:new THREE.MeshStandardMaterial({color:0x3d6844,roughness:1}),
 rockMat:new THREE.MeshStandardMaterial({color:0x74746d,roughness:1}),
 bushMat:new THREE.MeshStandardMaterial({color:0x55784b,roughness:1})
};
function createFrontierTile(x,z,w,h,level,index){
 const g=new THREE.Group();
 const palette=[0x748258,0x687957,0x78845f,0x657553,0x7f895d,0x6f8059];
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:palette[index%palette.length],roughness:1}));
 plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;plane.position.y=-.015;g.add(plane);walkableSurfaces.push(plane);

 // Dense but efficient frontier vegetation using instancing.
 const area=w*h;
 const treeCount=IS_MOBILE?clamp(Math.floor(area/900),10,34):clamp(Math.floor(area/620),16,52);
 const rockCount=IS_MOBILE?clamp(Math.floor(area/3500),3,10):clamp(Math.floor(area/2500),4,14);
 const bushCount=IS_MOBILE?clamp(Math.floor(area/1800),5,18):clamp(Math.floor(area/1250),8,25);
 const trunks=new THREE.InstancedMesh(frontierShared.trunkGeo,frontierShared.trunkMat,treeCount);
 const crowns=new THREE.InstancedMesh(frontierShared.crownGeo,frontierShared.crownMat,treeCount);
 const rocks=new THREE.InstancedMesh(frontierShared.rockGeo,frontierShared.rockMat,rockCount);
 const bushes=new THREE.InstancedMesh(frontierShared.bushGeo,frontierShared.bushMat,bushCount);
 const m=new THREE.Matrix4(),pos=new THREE.Vector3(),sc=new THREE.Vector3(),q=new THREE.Quaternion(),e=new THREE.Euler();
 for(let i=0;i<treeCount;i++){
   const rx=(seededNoise(index*1000+i*7)-.5)*w*.90,rz=(seededNoise(index*1000+i*7+1)-.5)*h*.90;
   // leave occasional natural clearings and a broad path around the tile middle
   const s=.65+seededNoise(index*1000+i*7+2)*.75;
   pos.set(rx,.85*s,rz);sc.set(s,s,s);e.set(0,seededNoise(i+index*9)*Math.PI*2,0);q.setFromEuler(e);m.compose(pos,q,sc);trunks.setMatrixAt(i,m);
   pos.set(rx,2.35*s,rz);m.compose(pos,q,sc);crowns.setMatrixAt(i,m)
 }
 for(let i=0;i<rockCount;i++){
   const rx=(seededNoise(index*2000+i*5)-.5)*w*.90,rz=(seededNoise(index*2000+i*5+1)-.5)*h*.90,s=.55+seededNoise(index+i*17)*1.1;
   pos.set(rx,.28*s,rz);sc.set(s,s*.65,s);q.identity();m.compose(pos,q,sc);rocks.setMatrixAt(i,m)
 }
 for(let i=0;i<bushCount;i++){
   const rx=(seededNoise(index*3000+i*5)-.5)*w*.92,rz=(seededNoise(index*3000+i*5+1)-.5)*h*.92,s=.45+seededNoise(index+i*23)*.75;
   pos.set(rx,.35*s,rz);sc.set(s,s*.75,s);q.identity();m.compose(pos,q,sc);bushes.setMatrixAt(i,m)
 }
 trunks.instanceMatrix.needsUpdate=crowns.instanceMatrix.needsUpdate=rocks.instanceMatrix.needsUpdate=bushes.instanceMatrix.needsUpdate=true;
 [trunks,crowns,rocks,bushes].forEach(o=>{o.castShadow=!IS_MOBILE;o.receiveShadow=false;g.add(o)});

 // Biome landmarks keep the far map from becoming an empty green sheet.
 if([2,7,10].includes(index)){
   const pond=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(12,w*.16),Math.min(15,w*.19),.08,22),new THREE.MeshStandardMaterial({color:0x557f8e,roughness:.35}));
   pond.scale.z=.58;pond.position.set((seededNoise(index*90)-.5)*w*.35,.03,(seededNoise(index*91)-.5)*h*.35);g.add(pond)
 }
 if([4,6,9,12].includes(index)){
   for(let k=0;k<3;k++){
     const hill=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),new THREE.MeshStandardMaterial({color:0x697654,roughness:1}));
     hill.scale.set(8+seededNoise(index*50+k)*8,1.8+seededNoise(index*60+k)*2.5,6+seededNoise(index*70+k)*8);
     hill.position.set((seededNoise(index*80+k)-.5)*w*.65,-.55,(seededNoise(index*85+k)-.5)*h*.65);g.add(hill)
   }
 }
 g.position.set(x,0,z);g.visible=false;frontierGroup.add(g);frontierTiles.push({g,level,plane,index});
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

const LOCAL_LANDMARKS=[
 {name:'감나무뜰',icon:'⌂',p:LOC.center,color:0xf0cf80},
 {name:'서쪽 큰숲',icon:'🌲',p:new THREE.Vector3(-145,0,-15),color:0x8fc58b,level:1},
 {name:'북쪽 호수',icon:'💧',p:new THREE.Vector3(10,0,-145),color:0x7ec7d8,level:1},
 {name:'동쪽 구릉',icon:'△',p:new THREE.Vector3(150,0,-35),color:0xcab985,level:1},
 {name:'남쪽 초원',icon:'✿',p:new THREE.Vector3(-20,0,145),color:0xcad180,level:1},
 {name:'북서 깊은숲',icon:'🌲',p:new THREE.Vector3(-175,0,-135),color:0x78b67a,level:2},
 {name:'남동 습지',icon:'≋',p:new THREE.Vector3(170,0,135),color:0x7bb3a8,level:2},
 {name:'북방 경계',icon:'◆',p:new THREE.Vector3(0,0,-215),color:0xe2bd78,level:3},
 {name:'남방 경계',icon:'◆',p:new THREE.Vector3(0,0,215),color:0xe2bd78,level:3},
 {name:'서방 경계',icon:'◆',p:new THREE.Vector3(-265,0,0),color:0xe2bd78,level:3},
 {name:'동방 경계',icon:'◆',p:new THREE.Vector3(265,0,0),color:0xe2bd78,level:3}
];
const landmarkGroup=new THREE.Group();scene.add(landmarkGroup);
const landmarkVisuals=[];
function makeLandmarkVisual(l){
 const g=new THREE.Group();
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,2.5,6),new THREE.MeshStandardMaterial({color:0x705139,roughness:1}));pole.position.y=1.25;g.add(pole);
 const s=makeFloatingNameSprite(`${l.icon} ${l.name}`);s.position.set(0,3.05,0);s.scale.set(3.2,.7,1);g.add(s);
 g.position.copy(l.p);g.visible=(l.level||0)<=state.localMap.level;landmarkGroup.add(g);landmarkVisuals.push({g,l});return g
}
LOCAL_LANDMARKS.forEach(makeLandmarkVisual);

function dir8FromVector(dx,dz){
 const a=Math.atan2(dx,-dz),i=(Math.round(a/(Math.PI/4))+8)%8;
 return ['북','북동','동','남동','남','남서','서','북서'][i]
}
function dirArrow(dx,dz){
 const a=Math.atan2(dx,-dz),i=(Math.round(a/(Math.PI/4))+8)%8;
 return ['↑','↗','→','↘','↓','↙','←','↖'][i]
}
function currentMainBiome(){
 const cx=Math.floor(player.position.x/STREAM_CHUNK),cz=Math.floor(player.position.z/STREAM_CHUNK);
 return {meadow:'들판',forest:'숲',lakewood:'호숫가 숲',hills:'구릉',grassland:'초원',wetland:'습지'}[chunkBiome(cx,cz)]||'들판'
}
function nearestMainLandmark(){
 let best=LOCAL_LANDMARKS[0],bd=Infinity;
 for(const l of LOCAL_LANDMARKS){
   if((l.level||0)>state.localMap.level)continue;
   const d=Math.hypot(player.position.x-l.p.x,player.position.z-l.p.z);
   if(d<bd){bd=d;best=l}
 }
 return{landmark:best,distance:bd}
}
function mainPlaceName(){
 const x=player.position.x,z=player.position.z,d=Math.hypot(x,z);
 if(d<18)return'감나무뜰 중심';
 const near=nearestMainLandmark();
 if(near.distance<30)return near.landmark.name;
 const ring=d<120?'근교':d<300?'외곽':d<700?'탐사권':'미답지';
 return `라엔 분지 ${dir8FromVector(x,z)}쪽 ${ring}`
}
function updatePlayerLocationHud(force=false){
 if(regionViewActive&&regionObserver){
   const p=regionObserver.position,city=nearestRegionCity(p.x,p.z);
   const ctry=regionVisitCountry||city?.country||'관찰 지역',reg=regionViewName||'지역';
   $('playerLocationName').textContent=city?`${ctry} · ${city.name}`:ctry;
   $('playerLocationBiome').textContent=`${reg} · 관찰자 현지 이동`;
   $('playerLocationCoord').textContent=`현지 X ${p.x.toFixed(1)} · Z ${p.z.toFixed(1)}`;
   $('playerFacingText').textContent=`시선 ${dir8FromVector(Math.sin(regionObserver.rotation.y),Math.cos(regionObserver.rotation.y))}`;
   $('playerHomeText').textContent='🌍 관찰자 이동 · 시간 소모 없음';
   $('playerLandmarkText').textContent=city?`🏘 최근 도시 ${city.name}`:'◇ 지역 탐사 중';
   return
 }
 const x=player.position.x,z=player.position.z,d=Math.hypot(x,z),near=nearestMainLandmark(),homeDx=-x,homeDz=-z;
 $('playerLocationName').textContent=mainPlaceName();
 $('playerLocationBiome').textContent=`라엔 분지 · ${currentMainBiome()}`;
 $('playerLocationCoord').textContent=`X ${x.toFixed(1)} · Z ${z.toFixed(1)}`;
 $('playerFacingText').textContent=`시선 ${dir8FromVector(Math.sin(player.rotation.y),Math.cos(player.rotation.y))}`;
 $('playerHomeText').textContent=d<8?'⌂ 감나무뜰 안':`⌂ ${dirArrow(homeDx,homeDz)} 감나무뜰 ${Math.round(d)}m`;
 $('playerLandmarkText').textContent=`${near.landmark.icon} ${dirArrow(near.landmark.p.x-x,near.landmark.p.z-z)} ${near.landmark.name} ${Math.round(near.distance)}m`;
}

function updateLandmarkVisibility(){for(const x of landmarkVisuals)x.g.visible=(x.l.level||0)<=state.localMap.level}
let navWaypoint=null;
function setHomeWaypoint(autoWalk=false){
 navWaypoint={name:'감나무뜰',p:LOC.center.clone()};
 $('navHud')?.classList.remove('hidden');
 if(autoWalk){movePlayerTo(LOC.center.clone());showEvent('감나무뜰로 이동 시작')}
 else showEvent('감나무뜰 방향을 표시합니다.')
}
function updateNavHud(){
 const el=$('navHud'),txt=$('navHudText');if(!el||!txt)return;
 const d=player.position.distanceTo(LOC.center);
 if(d<10&&!navWaypoint){el.classList.add('hidden');return}
 el.classList.remove('hidden');txt.textContent=`중심까지 ${Math.round(d)}m · ${localPlaceName(player.position.x,player.position.z)}`
}


function desiredLocalMapLevel(){
 const p=state.world?.landProgress||0,y=state.year||0,c=state.civ?.level||0;
 if(y>=7||p>=420||c>=4)return 3;
 if(y>=3||p>=180||c>=3)return 2;
 if(y>=1||p>=55||c>=2)return 1;
 return 0
}
function localMapBounds(){
 // v9.2: no gameplay wall. This large value is only a safety range for UI math.
 return{x:1000000,z:1000000}
}
function updateLocalMapExpansion(announce=true){
 const wanted=desiredLocalMapLevel(),old=state.localMap.level||0;
 if(wanted>old){
   state.localMap.level=wanted;state.localMap.revealedRadius=[90,180,235,320][wanted];state.localMap.lastExpansionYear=state.year;
   if(announce)addLog('story',`라엔 분지 탐사 범위 ${wanted+1}단계`,`주민들의 반복 탐사로 정착지 주변에서 이동 가능한 지형이 더 넓게 기록되었다. 이제 카메라와 주민이 이전 경계 밖까지 움직일 수 있다.`,'기록','지도의 빈 부분이 실제 길과 숲으로 바뀌었다.')
 }
 for(const t of frontierTiles)t.g.visible=t.level<=state.localMap.level;updateLandmarkVisibility?.();
 const b=localMapBounds();sun.shadow.camera.left=-Math.min(280,b.x);sun.shadow.camera.right=Math.min(280,b.x);sun.shadow.camera.top=Math.min(240,b.z);sun.shadow.camera.bottom=-Math.min(240,b.z);sun.shadow.camera.updateProjectionMatrix();
 if($('mapExpansionText'))$('mapExpansionText').textContent=`정착권 ${state.localMap.level+1}/4 · 바깥은 연속 탐사`;
}

function hill(x,z,sx,sz,h,c=0x5f7952){const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.MeshStandardMaterial({color:c,roughness:1}));m.scale.set(sx,h,sz);m.position.set(x,-.8,z);m.receiveShadow=true;scene.add(m)}hill(-70,-42,38,30,8);hill(72,-46,46,32,10);hill(-82,58,55,37,8);hill(85,58,47,33,7);
function tree(x,z,s=.9){const g=new THREE.Group(),tr=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,2.5,7),new THREE.MeshStandardMaterial({color:0x57402d,roughness:1})),c1=new THREE.Mesh(new THREE.ConeGeometry(1.25,2.8,8),new THREE.MeshStandardMaterial({color:0x355b3d,roughness:1})),c2=new THREE.Mesh(new THREE.ConeGeometry(.95,2.2,8),new THREE.MeshStandardMaterial({color:0x426b47,roughness:1}));tr.position.y=1.25;c1.position.y=3;c2.position.y=4;[tr,c1,c2].forEach(m=>m.castShadow=true);g.add(tr,c1,c2);g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);return g}
for(let i=0;i<125;i++){const a=Math.random()*Math.PI*2,r=45+Math.random()*55;tree(Math.cos(a)*r+(Math.random()-.5)*10,Math.sin(a)*r*.75+(Math.random()-.5)*10,.6+Math.random()*.65)}
// river
const river=new THREE.Mesh(new THREE.PlaneGeometry(14,150),new THREE.MeshStandardMaterial({color:0x6b9aaa,roughness:.3,metalness:.05,transparent:true,opacity:.92}));river.rotation.x=-Math.PI/2;river.rotation.z=.07;river.position.set(38,.03,6);scene.add(river);
// paths
function path(a,b,w=2.8){const d=b.clone().sub(a),len=d.length(),m=new THREE.Mesh(new THREE.PlaneGeometry(w,len),new THREE.MeshStandardMaterial({color:0xa18a65,roughness:1}));m.rotation.x=-Math.PI/2;m.position.copy(a.clone().add(b).multiplyScalar(.5));m.position.y=.045;m.rotation.z=-Math.atan2(d.x,d.z);scene.add(m)};[LOC.field,LOC.river,LOC.forest,LOC.stone,LOC.workshop,LOC.herbs,LOC.pen].forEach(p=>path(LOC.center,p));

// Long trails remain visible as natural navigation corridors after map expansion.
[
 [new THREE.Vector3(-5,0,-42),new THREE.Vector3(5,0,-225)],
 [new THREE.Vector3(-15,0,42),new THREE.Vector3(-8,0,225)],
 [new THREE.Vector3(-42,0,4),new THREE.Vector3(-270,0,-4)],
 [new THREE.Vector3(42,0,-2),new THREE.Vector3(270,0,6)]
].forEach(([a,b])=>path(a,b,2.2));


// ---------- v9.2 CONTINUOUS LOCAL WORLD STREAMING ----------
const STREAM_CHUNK=150,STREAM_RADIUS=2;
const streamWorldGroup=new THREE.Group();scene.add(streamWorldGroup);
const streamChunks=new Map();
let lastStreamCX=999999,lastStreamCZ=999999,lastStreamUpdate=0;

function chunkKey(cx,cz){return`${cx},${cz}`}
function chunkSeed(cx,cz,i=0){
 const n=(cx*73856093+cz*19349663+i*83492791)%1000003;
 return seededNoise(n)
}
function chunkBiome(cx,cz){
 const x=cx*STREAM_CHUNK,z=cz*STREAM_CHUNK,d=Math.hypot(x,z),a=Math.atan2(z,x);
 if(d<240)return'meadow';
 if(x<-220&&Math.abs(z)<520)return'forest';
 if(z<-250&&Math.abs(x)<520)return'lakewood';
 if(x>260&&Math.abs(z)<600)return'hills';
 if(z>280&&Math.abs(x)<620)return'grassland';
 const r=chunkSeed(cx,cz,91);
 return r<.28?'forest':r<.48?'grassland':r<.66?'hills':r<.82?'wetland':'meadow'
}
function streamTree(parent,x,z,s=1){
 const g=new THREE.Group();
 const tr=new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.25*s,2.3*s,6),new THREE.MeshStandardMaterial({color:0x58412d,roughness:1}));
 const c1=new THREE.Mesh(new THREE.ConeGeometry(1.05*s,2.5*s,7),new THREE.MeshStandardMaterial({color:0x31563a,roughness:1}));
 const c2=new THREE.Mesh(new THREE.ConeGeometry(.8*s,1.9*s,7),new THREE.MeshStandardMaterial({color:0x406a46,roughness:1}));
 tr.position.y=1.15*s;c1.position.y=2.8*s;c2.position.y=3.75*s;g.add(tr,c1,c2);g.position.set(x,0,z);parent.add(g)
}
function streamRock(parent,x,z,s=1){
 const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.6*s,0),new THREE.MeshStandardMaterial({color:0x77786f,roughness:1}));
 r.scale.y=.62;r.position.set(x,.38*s,z);parent.add(r)
}
function streamBush(parent,x,z,s=1){
 const b=new THREE.Mesh(new THREE.SphereGeometry(.55*s,7,5),new THREE.MeshStandardMaterial({color:0x4b754b,roughness:1}));
 b.scale.y=.68;b.position.set(x,.38*s,z);parent.add(b)
}
function buildStreamChunk(cx,cz){
 const key=chunkKey(cx,cz),g=new THREE.Group(),biome=chunkBiome(cx,cz);
 const colors={forest:0x617753,lakewood:0x667b59,hills:0x7c845f,grassland:0x87915e,wetland:0x667f68,meadow:0x899563};
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(STREAM_CHUNK+2,STREAM_CHUNK+2),new THREE.MeshStandardMaterial({color:colors[biome]||0x81905f,roughness:1}));
 plane.rotation.x=-Math.PI/2;plane.position.y=-.04;plane.receiveShadow=true;g.add(plane);walkableSurfaces.push(plane);
 const ox=cx*STREAM_CHUNK,oz=cz*STREAM_CHUNK;g.position.set(ox,0,oz);

 // Natural decoration. Central village chunks stay lighter to avoid covering houses.
 const central=Math.abs(cx)<=1&&Math.abs(cz)<=1;
 const count=central?5:(IS_MOBILE?13:22);
 for(let i=0;i<count;i++){
   const x=(chunkSeed(cx,cz,i*4)-.5)*(STREAM_CHUNK-14);
   const z=(chunkSeed(cx,cz,i*4+1)-.5)*(STREAM_CHUNK-14);
   const r=chunkSeed(cx,cz,i*4+2),s=.6+chunkSeed(cx,cz,i*4+3)*.75;
   if(biome==='forest'||biome==='lakewood'){
     if(r<.72)streamTree(g,x,z,s);else if(r<.87)streamBush(g,x,z,s);else streamRock(g,x,z,s)
   }else if(biome==='hills'){
     if(r<.38)streamTree(g,x,z,s*.8);else if(r<.82)streamRock(g,x,z,s);else streamBush(g,x,z,s)
   }else if(biome==='wetland'){
     if(r<.35)streamTree(g,x,z,s*.72);else streamBush(g,x,z,s)
   }else{
     if(r<.34)streamTree(g,x,z,s*.76);else if(r<.68)streamBush(g,x,z,s);else streamRock(g,x,z,s*.8)
   }
 }

 // Ponds/lakes on deterministic chunks.
 const waterChance=chunkSeed(cx,cz,777);
 if(!central&&((biome==='lakewood'&&waterChance<.52)||(biome==='wetland'&&waterChance<.42)||(waterChance<.055))){
   const pond=new THREE.Mesh(new THREE.CircleGeometry(11+chunkSeed(cx,cz,778)*14,24),new THREE.MeshStandardMaterial({color:0x6697a5,roughness:.35,transparent:true,opacity:.9}));
   pond.rotation.x=-Math.PI/2;pond.position.set((chunkSeed(cx,cz,779)-.5)*55,.02,(chunkSeed(cx,cz,780)-.5)*55);pond.scale.y=.68;g.add(pond)
 }

 // Low hills give distant terrain shape.
 if(!central&&(biome==='hills'||chunkSeed(cx,cz,880)<.13)){
   const h=new THREE.Mesh(new THREE.SphereGeometry(1,14,8),new THREE.MeshStandardMaterial({color:biome==='hills'?0x677557:0x6d7c59,roughness:1}));
   h.scale.set(16+chunkSeed(cx,cz,881)*18,3+chunkSeed(cx,cz,882)*4,12+chunkSeed(cx,cz,883)*14);
   h.position.set((chunkSeed(cx,cz,884)-.5)*70,-2.2,(chunkSeed(cx,cz,885)-.5)*70);g.add(h)
 }

 // Explorer cairn occasionally gives a named visual reference.
 if(!central&&chunkSeed(cx,cz,991)<.075){
   const cairn=new THREE.Group();
   for(let i=0;i<3;i++){const s=.65-i*.12,r=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),new THREE.MeshStandardMaterial({color:0x8d887a,roughness:1}));r.position.y=.4+i*.6;cairn.add(r)}
   const label=makeFloatingNameSprite(`◇ 탐사표지 ${cx}:${cz}`);label.position.set(0,2.8,0);label.scale.set(2.8,.62,1);cairn.add(label);
   cairn.position.set((chunkSeed(cx,cz,992)-.5)*52,0,(chunkSeed(cx,cz,993)-.5)*52);g.add(cairn)
 }

 streamWorldGroup.add(g);streamChunks.set(key,{g,plane,cx,cz,biome});return g
}
function removeStreamChunk(key){
 const c=streamChunks.get(key);if(!c)return;
 const wi=walkableSurfaces.indexOf(c.plane);if(wi>=0)walkableSurfaces.splice(wi,1);
 streamWorldGroup.remove(c.g);
 c.g.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)m.dispose?.()}});
 streamChunks.delete(key)
}
function streamTerrainAroundPlayer(force=false){
 const cx=Math.floor((player?.position.x||0)/STREAM_CHUNK),cz=Math.floor((player?.position.z||0)/STREAM_CHUNK);
 if(!force&&cx===lastStreamCX&&cz===lastStreamCZ)return;
 lastStreamCX=cx;lastStreamCZ=cz;
 const needed=new Set();
 for(let dz=-STREAM_RADIUS;dz<=STREAM_RADIUS;dz++)for(let dx=-STREAM_RADIUS;dx<=STREAM_RADIUS;dx++){
   const x=cx+dx,z=cz+dz,key=chunkKey(x,z);needed.add(key);if(!streamChunks.has(key))buildStreamChunk(x,z)
 }
 for(const key of [...streamChunks.keys()])if(!needed.has(key))removeStreamChunk(key);
 updatePlayerLocationHud(true);
}

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
 // Raids enter the settlement perimeter, not the edge of the infinite exploration map.
 const bx=92,bz=76,side=Math.floor(Math.random()*4);
 return side===0?new THREE.Vector3(-bx,0,rand(-bz*.8,bz*.8)):side===1?new THREE.Vector3(bx,0,rand(-bz*.8,bz*.8)):side===2?new THREE.Vector3(rand(-bx*.8,bx*.8),0,-bz):new THREE.Vector3(rand(-bx*.8,bx*.8),0,bz)
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
 const art=makeArtBillboard(CHARACTER_ART.player,2.05,3.08,1.55);g.add(art);
 g.position.set(state.player.x||3,0,state.player.z||3);
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 g.userData={limbs,parts:{torso,pelvis,head},sword,target:new THREE.Vector3(g.position.x,0,g.position.z),moving:false,attackCooldown:0,attackAnim:0,fsm:new StateMachine(PlayerStates.IDLE)};
 scene.add(g);return g
}
const player=createPlayerModel();
const playerHereLabel=makeFloatingNameSprite('▼ 나');playerHereLabel.position.set(0,3.65,0);playerHereLabel.scale.set(2.2,.58,1);player.add(playerHereLabel);
streamTerrainAroundPlayer(true);

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
 const art=makeArtBillboard(CHARACTER_ART.bokshil,.98,1.47,.75);g.add(art);
 g.position.set(state.companion.bokshil.x,0,state.companion.bokshil.z);
 g.scale.setScalar(1.08);
 g.userData={bokshil:true,legs,tailPivot,phase:rand(0,10),target:g.position.clone(),patrolId:null,nextPatrolAt:0,barkCooldown:0,status:'주민들 사이를 순찰 중'};
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 scene.add(g);return g
}
const bokshil=createBokshilModel();

const dogLineageGroup=new THREE.Group();scene.add(dogLineageGroup);
const dogLineageModels=new Map();

function dogAgeDays(d){return Math.max(0,absDay()-(d.bornAbsDay||0))}
function dogIsAdult(d){return dogAgeDays(d)>=365}
function dogCanBreed(d){const a=dogAgeDays(d);return d.alive&&a>=365&&a<=8*365}
function dogRelated(a,b){
 if(!a||!b||a.id===b.id)return true;
 if((a.parents||[]).includes(b.id)||(b.parents||[]).includes(a.id))return true;
 const ap=new Set(a.parents||[]);
 return (b.parents||[]).some(p=>ap.has(p))
}
function nextDogName(){
 const used=new Set(state.dogLineage.dogs.map(d=>d.name));
 for(const n of DOG_NAME_POOL)if(!used.has(n))return n;
 return `복실이네 ${state.dogLineage.seq+1}`
}
function makeLineageDogModel(dog){
 const g=new THREE.Group();
 const pup=!dogIsAdult(dog),gen=dog.generation||0;
 const furColors=[0xb8895d,0xc09b70,0xa98264,0xd0ad79,0x99745b];
 const fur=new THREE.MeshStandardMaterial({color:furColors[(dog.id.length+gen)%furColors.length],roughness:1});
 const cream=new THREE.MeshStandardMaterial({color:0xe3c9a4,roughness:1});
 const dark=new THREE.MeshStandardMaterial({color:0x45362d,roughness:1});
 const body=new THREE.Mesh(new THREE.SphereGeometry(.34,10,7),fur);body.scale.set(1.38,.74,1.62);body.position.y=.55;g.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.28,10,7),fur);head.position.set(0,.82,.5);g.add(head);
 const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),cream);muzzle.scale.set(1,.68,.8);muzzle.position.set(0,.75,.75);g.add(muzzle);
 const nose=new THREE.Mesh(new THREE.SphereGeometry(.055,7,5),dark);nose.position.set(0,.78,.87);g.add(nose);
 const legs=[];
 for(const[x,z]of[[-.2,.27],[.2,.27],[-.2,-.3],[.2,-.3]]){const p=new THREE.Group();p.position.set(x,.4,z);const l=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.4,5),fur);l.position.y=-.2;p.add(l);g.add(p);legs.push(p)}
 const tailPivot=new THREE.Group();tailPivot.position.set(0,.64,-.57);const tail=new THREE.Mesh(new THREE.CylinderGeometry(.04,.055,.48,6),fur);tail.position.set(0,.19,-.04);tail.rotation.x=.85;tailPivot.add(tail);g.add(tailPivot);
 for(const x of[-.19,.19]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.08,.24,5),dark);ear.position.set(x,.99,.42);ear.rotation.z=x<0?.22:-.22;g.add(ear)}
 const label=makeFloatingNameSprite(`${dog.name} · ${dog.generation||0}세대`);label.position.set(0,1.45,0);label.scale.set(2.5,.58,1);g.add(label);
 const art=makeArtBillboard(CHARACTER_ART.bokshil,.78,1.17,.60);g.add(art);
 const scale=pup?clamp(.48+dogAgeDays(dog)/365*.48,.48,.96):(.92+Math.min(.08,gen*.015));
 g.scale.setScalar(scale);
 const angle=stableHash01(dog.id)*Math.PI*2,r=5+stableHash01(dog.id+'r')*8;
 g.position.set(Math.cos(angle)*r,0,Math.sin(angle)*r);
 g.userData={dogId:dog.id,legs,tailPivot,phase:stableHash01(dog.id+'p')*10,target:g.position.clone(),nextTargetAt:0,barkCooldown:0};
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 dogLineageGroup.add(g);dogLineageModels.set(dog.id,g);return g
}
function syncDogLineageVisuals(){
 const living=state.dogLineage.dogs.filter(d=>d.alive&&d.id!=='DOG-BOKSHIL');
 for(const d of living)if(!dogLineageModels.has(d.id))makeLineageDogModel(d);
 for(const[id,g]of [...dogLineageModels]){
   const d=state.dogLineage.dogs.find(x=>x.id===id);
   if(!d||!d.alive){dogLineageGroup.remove(g);dogLineageModels.delete(id);continue}
   const pup=!dogIsAdult(d);g.scale.setScalar(pup?clamp(.48+dogAgeDays(d)/365*.48,.48,.96):(.92+Math.min(.08,(d.generation||0)*.015)))
 }
}
function addVillageDog({name=null,sex=null,generation=0,parents=[],outsider=false,bornAbsDay=null}={}){
 const id=`DOG-${++state.dogLineage.seq}`,now=absDay();
 const d={id,name:name||nextDogName(),sex:sex||((state.dogLineage.seq%2)?'F':'M'),generation,parents:[...parents],outsider,
   bornAbsDay:bornAbsDay??now,lifespanDays:(12+Math.floor(stableHash01(id+'life')*4))*365,alive:true,role:'마을경비'};
 state.dogLineage.dogs.push(d);syncDogLineageVisuals();return d
}
function maybeDogOutsiderArrival(){
 const now=absDay(),alive=state.dogLineage.dogs.filter(d=>d.alive);
 // First compatible village dog arrives after the settlement has survived one year.
 if(state.year>=1&&!alive.some(d=>d.outsider)){
   const d=addVillageDog({name:'단비',sex:'F',generation:0,outsider:true,bornAbsDay:now-730});
   state.dogLineage.lastArrivalAbsDay=now;state.dogLineage.lastLitterAbsDay=now-420;
   addLog('story','단비가 마을에 머물다','떠돌던 진돗개 계열의 마을개 단비가 주민들과 복실이의 생활권에 적응해 머물기 시작했다. 복실이의 계보가 이어질 가능성이 생겼다.','기록','마을을 지키는 존재도 세대를 이어간다.');
   return d
 }
 // If descendants become too closely related, a rare unrelated village dog can join.
 const adults=alive.filter(dogCanBreed);
 let hasPair=false;
 for(const a of adults)for(const b of adults)if(a.sex!==b.sex&&!dogRelated(a,b)){hasPair=true;break}
 if(!hasPair&&alive.length<16&&now-(state.dogLineage.lastArrivalAbsDay||-999)>4*365&&state.year>=5){
   const d=addVillageDog({name:nextDogName(),sex:(adults.filter(x=>x.sex==='F').length>adults.filter(x=>x.sex==='M').length?'M':'F'),generation:0,outsider:true,bornAbsDay:now-730});
   state.dogLineage.lastArrivalAbsDay=now;
   addLog('story','새 마을개가 합류하다',`${d.name}이 외부 생활권에서 감나무뜰로 들어와 기존 복실이 계보와 함께 지내기 시작했다. 가까운 혈연끼리만 이어지지 않도록 새로운 계통이 더해졌다.`,'기록','한 계보도 외부와 만나야 오래 이어질 수 있다.')
 }
}
function maybeDogLitter(){
 const now=absDay(),alive=state.dogLineage.dogs.filter(d=>d.alive);
 if(alive.length>=16||now-(state.dogLineage.lastLitterAbsDay||-999)<540)return;
 const females=alive.filter(d=>d.sex==='F'&&dogCanBreed(d)),males=alive.filter(d=>d.sex==='M'&&dogCanBreed(d));
 let pair=null;
 // Prefer Bokshil while he is alive and breeding-age so his direct line definitely continues.
 const bok=alive.find(d=>d.id==='DOG-BOKSHIL'&&dogCanBreed(d));
 if(bok){
   const mate=females.find(f=>!dogRelated(bok,f));if(mate)pair=[bok,mate]
 }
 if(!pair){
   for(const f of females){const m=males.find(x=>!dogRelated(f,x));if(m){pair=[m,f];break}}
 }
 if(!pair)return;
 const [father,mother]=pair,count=Math.min(4,2+Math.floor(stableHash01(`${father.id}-${mother.id}-${now}`)*3));
 const gen=Math.max(father.generation||0,mother.generation||0)+1,names=[];
 for(let i=0;i<count&&state.dogLineage.dogs.filter(d=>d.alive).length<16;i++){
   const pup=addVillageDog({sex:(i%2?'F':'M'),generation:gen,parents:[father.id,mother.id],bornAbsDay:now});names.push(pup.name);state.dogLineage.totalBirths++
 }
 state.dogLineage.lastLitterAbsDay=now;
 if(names.length)addLog('good',`복실이 계보 ${gen}세대가 태어나다`,`${father.name}과 ${mother.name} 사이에서 ${names.join('·')} ${names.length}마리가 태어났다. 새끼들은 성장하면 주민 순찰과 야생동물 경계를 배운다.`,'기록','마을의 기억은 사람에게만 이어지는 것이 아니었다.')
}
function processDogLineageDaily(){
 const now=absDay();maybeDogOutsiderArrival();
 for(const d of state.dogLineage.dogs){
   if(!d.alive)continue;
   if(dogAgeDays(d)>=d.lifespanDays){
     d.alive=false;d.diedAbsDay=now;state.dogLineage.totalDeaths++;
     if(d.id==='DOG-BOKSHIL'){
       state.companion.bokshil.active=false;
       addLog('story','복실이가 남긴 계보',`오랫동안 감나무뜰을 지키던 복실이가 생을 마쳤다. 그러나 ${state.dogLineage.dogs.filter(x=>x.alive&&x.generation>0).length}마리의 후손이 마을에 남아 순찰과 경계를 이어간다.`,'기록','한 존재의 역할은 다음 세대의 습관으로 남았다.')
     }else addLog('story',`${d.name}의 마지막 순찰`,`${d.name}이 생을 마쳤다. 복실이 계보 ${d.generation||0}세대의 기록으로 남는다.`,'기록','계보는 태어남과 죽음을 함께 기록한다.')
   }
 }
 maybeDogLitter();syncDogLineageVisuals()
}
function lineageThreat(){
 if(!activeConflict||activeConflict.type!=='animal')return null;
 return conflictHostiles.find(h=>h&&h.visible&&!h.userData.dead&&h.userData.conflictType==='animal')||null
}
function updateDogLineage(dt,now){
 if(regionViewActive)return;syncDogLineageVisuals();
 const threat=lineageThreat();
 for(const d of state.dogLineage.dogs){
   if(!d.alive||d.id==='DOG-BOKSHIL')continue;
   const g=dogLineageModels.get(d.id);if(!g)continue;const ud=g.userData,pup=!dogIsAdult(d);
   ud.barkCooldown=Math.max(0,(ud.barkCooldown||0)-dt);
   let desired=null,speed=pup?1.6:2.8;
   if(threat&&!pup){
     desired=threat.position;speed=4.2
   }else if(pup){
     const mother=state.dogLineage.dogs.find(x=>x.id===(d.parents||[])[1]&&x.alive),mg=mother?.id==='DOG-BOKSHIL'?bokshil:dogLineageModels.get(mother?.id);
     desired=mg?mg.position:LOC.center
   }else{
     if(now>ud.nextTargetAt||g.position.distanceTo(ud.target)<.5){
       ud.nextTargetAt=now+rand(2500,6500);
       const rp=people.length?pick(people):null;
       ud.target.copy(rp?rp.position:LOC.center);ud.target.x+=rand(-2.5,2.5);ud.target.z+=rand(-2.5,2.5)
     }
     desired=ud.target
   }
   const v=desired.clone().sub(g.position);v.y=0;const dist=v.length();
   if(dist>.35){
     if(dist>20){g.position.copy(desired);g.position.y=0}
     else{v.normalize();g.position.addScaledVector(v,speed*dt);g.rotation.y=Math.atan2(v.x,v.z);
       const swing=Math.sin(now*.015*speed+ud.phase)*.48;ud.legs.forEach((l,i)=>l.rotation.x=(i%2?swing:-swing))}
   }else ud.legs.forEach(l=>l.rotation.x=0);
   ud.tailPivot.rotation.y=Math.sin(now*.013+ud.phase)*.65;
   if(threat&&!pup&&dist<1.7&&ud.barkCooldown<=0){
     ud.barkCooldown=.9;threat.userData.bokshilFear=(threat.userData.bokshilFear||0)+5;threat.userData.hp-=1;
     const push=threat.position.clone().sub(g.position);push.y=0;if(push.lengthSq()<.01)push.set(1,0,0);push.normalize();threat.position.addScaledVector(push,.75);
     if(threat.userData.bokshilFear>=45||threat.userData.hp<=0)killHostile(threat)
   }
 }
}

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
 if(regionViewActive)return;
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
 const art=makeArtBillboard(CHARACTER_ART.monster,2.2,3.3,1.65);g.add(art);
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
 v=v.clone();
 player.userData.target.copy(v);player.userData.target.y=0;player.userData.moving=true;selectedMonster=null;
 followId='PLAYER';if($('followSelect'))$('followSelect').value='PLAYER';if(camMode!=='follow')setCameraMode('follow');
 player.userData.fsm.set(PlayerStates.MOVING)
}
function setMonsterTarget(m){
 if(!state.player.awakened||state.player.dead||!m||m.userData.dead)return;
 selectedMonster=m;player.userData.moving=false;player.userData.fsm.set(PlayerStates.MOVING)
}
function updatePlayer(dt,now){
 if(regionViewActive)return;
 ensureMonsterEra();
 const ud=player.userData,scale=state.speed>=20?2.2:state.speed>=5?1.5:1;
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
 if(navWaypoint&&player.position.distanceTo(navWaypoint.p)<3){navWaypoint=null;$('navHud')?.classList.add('hidden');showEvent('감나무뜰에 도착했습니다.')}
 if(state.player.hp<state.player.maxHp&&!selectedMonster)state.player.hp=Math.min(state.player.maxHp,state.player.hp+dt*1.2)
}
function updateMonsters(dt,now){
 if(state.year<55||!state.player.awakened)return;
 const speedScale=state.speed>=20?1.8:state.speed>=5?1.35:1;
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
 const artUrl=r.id==='C0001'?CHARACTER_ART.myeongja:((r.gender==='여성'||r.gender==='F')?CHARACTER_ART.residentFemale:CHARACTER_ART.residentMale);
 const art=makeArtBillboard(artUrl,1.72,2.58,1.33);g.add(art);

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
 if(regionViewActive&&regionObserver){
   yaw=.72;pitch=.70;distance=30;autoFocus.copy(regionObserver.position);setCameraMode('follow');return
 }
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
 if(regionViewActive&&regionWalkPlane){
   const hit=ray.intersectObject(regionWalkPlane,false)[0];
   if(hit){moveRegionObserverTo(hit.point);return}
 }
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
 if(manualMove.active&&navWaypoint){navWaypoint=null;player.userData.moving=false;$('navHud')?.classList.add('hidden')}
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
 if(regionViewActive&&regionObserver){
   if(camMode==='free')return autoFocus.clone();
   return regionObserver.position.clone()
 }
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
 if(regionViewActive&&regionObserver){
   const moving=manualMove.active||regionObserver.userData.moving;
   if(moving){
     const facing=new THREE.Vector3(Math.sin(regionObserver.rotation.y),0,Math.cos(regionObserver.rotation.y));
     target=regionObserver.position.clone().addScaledVector(facing,2.8);
     yaw=lerpAngle(yaw,regionObserver.rotation.y+Math.PI,.075);pitch=THREE.MathUtils.lerp(pitch,.66,.04)
   }
   if(camMode!=='free')autoFocus.lerp(target,moving?.18:.10);
   distance=clampCameraDistance(distance);
   const cp=Math.cos(pitch),sp=Math.sin(pitch);
   const off=new THREE.Vector3(Math.sin(yaw)*cp*distance,Math.max(10,4+sp*distance*.72),Math.cos(yaw)*cp*distance);
   camera.position.lerp(autoFocus.clone().add(off),.18);camera.lookAt(autoFocus.clone().add(new THREE.Vector3(0,1,0)));return
 }
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
   yaw+=.000055*Math.min(5,visualTimeScale());
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
const WORLD_REGION_JOBS={
 '아르케아 중앙대륙':['농부','목수','요리사','기록자','수로일꾼','채집가','사육사','경비'],
 '실바리온 수림권':['수림채집가','약초사','목공인','기록자','사냥감시자','농부'],
 '카르딘 산맥권':['광부','석공','제련공','목수','경비','운반인'],
 '세라칸 대초원':['목축인','기마견습','사육사','천막장인','채집가','경비'],
 '네레이아 해권':['어부','선박목수','염전일꾼','항해견습','상인','기록자'],
 '솔라크 사막권':['대상상인','우물관리자','직조인','채집가','경비','기록자'],
 '드라바스 화산군도':['제련공','광부','화산감시자','선박목수','경비','농부'],
 '루메라 부유제도':['바람관측자','직조인','목수','농부','기록자','운반인']
};
const WORLD_NAME_PARTS={
 '아르케아 중앙대륙':[['라','레','마','벨','세','아','에','카','루','하'],['온','르','안','엘','린','도','나','빈','리','온']],
 '실바리온 수림권':[['나','엘','실','베','아르','리','세','이'],['엘','리안','나','실','론','리아','렌','벨']],
 '카르딘 산맥권':[['카','브라','우르','돌','하르','그란','바르'],['딘','칸','간','록','란','드','르']],
 '세라칸 대초원':[['세','라','칸','타','바','푸','긴'],['란','카','르','온','하','갈','룬']],
 '네레이아 해권':[['네','미','살','아비','라','메','오','니'],['아','레나','마','소','엘','리','온','루']],
 '솔라크 사막권':[['솔','사','오','라','자','카','누'],['라크','하르','닉','사','엘','르','안']],
 '드라바스 화산군도':[['드라','바르','이그','카','루','사'],['바스','카','니스','론','마','크']],
 '루메라 부유제도':[['루','페','아','바','리','세'],['메라','리온','엘','람','아','론']]
};
function aliveWorldPeople(country=null){
 return state.worldPeople.filter(p=>p.alive!==0&&(!country||p.c===country))
}
function worldPersonName(region,seq){
 const parts=WORLD_NAME_PARTS[region]||WORLD_NAME_PARTS['아르케아 중앙대륙'];
 return `${pick(parts[0])}${pick(parts[1])}${Math.random()<.22?' '+pick(parts[0])+pick(parts[1]):''}`
}
function countryStage(pop,settlements=1){
 if(pop<8)return'소집단';if(pop<20)return'야영 취락';if(pop<45)return'정착촌';if(pop<90)return'촌락권';
 if(pop<180)return'도시국 단계';if(pop<400)return'소국 단계';return settlements>=4?'국가권':'성장 국가'
}
function syncLocalWorldPeople(){
 const liveIds=new Set(state.residents.map(r=>r.id));
 for(const p of state.worldPeople){
   if(!p.local)continue;
   if(!liveIds.has(p.id)){p.alive=0;p.dy??=state.year}
 }
 for(const r of state.residents){
   let p=state.worldPeople.find(x=>x.id===r.id);
   if(!p){
     p={id:r.id,n:r.name,c:'에르단 왕국',r:'아르케아 중앙대륙',ct:'L001',a:r.age,g:r.gender==='여성'?'F':'M',j:r.job,f:r.family||r.id,by:state.year-r.age,local:1,alive:1};
     state.worldPeople.push(p)
   }else{
     p.n=r.name;p.a=r.age;p.j=r.job;p.f=r.family||p.f;p.alive=1;p.c='에르단 왕국';p.r='아르케아 중앙대륙';p.ct='L001'
   }
 }
}
function rebuildCountryStats(name,annual=false){
 const c=state.world.countries[name];if(!c)return;
 const ps=aliveWorldPeople(name),prev=c.population||0;
 c.population=ps.length;
 c.children=ps.filter(p=>p.a<16).length;
 c.adults=ps.filter(p=>p.a>=16&&p.a<65).length;
 c.elders=ps.filter(p=>p.a>=65).length;
 c.workers=ps.filter(p=>p.a>=16&&p.a<65&&p.j!=='견습').length;
 c.households=new Set(ps.map(p=>p.f)).size;
 c.stage=countryStage(c.population,c.settlements||1);
 if(!annual)c.lastPopulation??=prev
}
function rebuildAllCountryStats(annual=false){
 for(const n of Object.keys(state.world.countries))rebuildCountryStats(n,annual);
 state.worldPopulation=aliveWorldPeople().length
}
function worldDeathChance(age,war){
 let p=age<5?.010:age<16?.0025:age<50?.0035:age<65?.009:age<80?.035:.11;
 if(war&&age>=16&&age<60)p+=.015;
 return p
}
function createWorldBaby(country,mother){
 const c=state.world.countries[country],region=c.region,seq=++state.worldPersonSeq;
 return{id:`WB${seq}`,n:worldPersonName(region,seq),c:country,r:region,ct:mother?.ct||countryNearestCity(country)?.id||'L001',
   a:0,g:Math.random()<.5?'F':'M',j:'유아',f:mother?.f||`WF${seq}`,by:state.year,alive:1}
}
function assignWorldAdultJob(p){
 if(p.a<5){p.j='유아';return}
 if(p.a<12){p.j='아이';return}
 if(p.a<16){p.j='견습';return}
 if(!p.j||['유아','아이','견습'].includes(p.j))p.j=pick(WORLD_REGION_JOBS[p.r]||WORLD_REGION_JOBS['아르케아 중앙대륙'])
}

function countryAtWar(name){
 if(!name)return false;
 if((state.world.wars||[]).some(w=>w.active&&w.country===name))return true;
 return (state.world.externalWars||[]).some(w=>w.active&&(w.a===name||w.b===name))
}

function updateCountryEconomy(name,c){
 const pop=Math.max(1,c.population),workers=Math.max(1,c.workers||1),e=c.economy,region=c.region;
 const forestFactor=(c.ecology?.forest||50)/100,water=(c.ecology?.water||50)/100,soil=(c.ecology?.soil||50)/100;
 e.grain=clamp(e.grain+(workers*.15*soil)-pop*.055-(countryAtWar(name)?3:0),0,180);
 e.wood=clamp(e.wood+workers*.08*forestFactor-pop*.018,0,160);
 e.stone=clamp(e.stone+workers*.045-pop*.008,0,140);
 e.metal=clamp(e.metal+(/산맥|화산/.test(region)?workers*.05:workers*.012)-pop*.006,0,120);
 e.livestock=clamp(e.livestock+(/대초원|아르케아/.test(region)?workers*.035:workers*.012)-pop*.009,0,130);
 e.cloth=clamp(e.cloth+workers*.02+e.livestock*.002-pop*.007,0,110);
 e.fish=clamp(e.fish+(/해권|군도/.test(region)?workers*.05:workers*.006)-pop*.006,0,130);
 c.food=clamp((e.grain+e.livestock+e.fish)*.52,0,100)
}
function tradeScore(a,b){
 const A=state.world.countries[a],B=state.world.countries[b];if(!A||!B)return 0;
 return relationBetween(a,b)+(A.openness+B.openness)*.2-countryDistanceKm(a,b)/350+(A.tech+B.tech)*.08
}
function maybeTradeAndTreaties(){
 const names=Object.keys(state.world.countries);
 for(const a of names){
   const A=state.world.countries[a],known=(A.knownCountries||[]).filter(b=>b!==a);
   for(const b of known){
     if(a>b)continue;const B=state.world.countries[b],rel=relationBetween(a,b),score=tradeScore(a,b);
     if(score>28&&!A.tradeRoutes.some(t=>t.with===b)){
       A.tradeRoutes.push({with:b,start:state.year,active:true});B.tradeRoutes.push({with:a,start:state.year,active:true});
       adjustRelation(a,b,6,'교역 시작');addTreaty(a,b,'통상협정',10)
     }
     if(rel>55&&!hasTreaty(a,b,'상호방위')&&stableHash01(a+b+state.year+'ally')>.72)addTreaty(a,b,'상호방위',12);
     if(rel<-40&&hasTreaty(a,b,'통상협정')){for(const t of A.treaties)if(t.with===b&&t.type==='통상협정')t.active=false;for(const t of B.treaties)if(t.with===a&&t.type==='통상협정')t.active=false}
   }
 }
 // trade exchanges surplus for deficit
 for(const a of names){
   const A=state.world.countries[a];
   for(const tr of A.tradeRoutes||[]){if(!tr.active||a>tr.with)continue;const B=state.world.countries[tr.with];if(!B)continue;
     for(const k of ['grain','wood','stone','metal','livestock','cloth','fish']){
       const d=(A.economy[k]||0)-(B.economy[k]||0);
       if(Math.abs(d)>18){const q=Math.min(4,Math.abs(d)*.04);if(d>0){A.economy[k]-=q;B.economy[k]+=q}else{B.economy[k]-=q;A.economy[k]+=q}}
     }
     A.prosperity=clamp(A.prosperity+.18,0,100);B.prosperity=clamp(B.prosperity+.18,0,100)
   }
 }
}

function updateCountryDevelopment(name,c){
 updateCountryEconomy(name,c);
 const war=countryAtWar(name),pop=Math.max(1,c.population),workers=c.workers||0,h=stableHash01(name+state.year);
 const region=c.region;
 const foodBonus=/대초원|수림|아르케아/.test(region)?1.15:/사막|화산/.test(region)?.72:1;
 const techBonus=/산맥|화산|루메라/.test(region)?1.18:1;
 const tradeBonus=/해권|사막|루메라/.test(region)?1.16:1;
 c.food=clamp((c.food||50)+(workers/pop*4.4*foodBonus)-2.4+(h-.5)*3-(war?4:0),0,100);
 c.tech=clamp((c.tech||5)+(.45+workers*.016)*techBonus+(c.openness-50)*.005,0,100);
 c.infrastructure=clamp((c.infrastructure||5)+.28+workers*.011+(c.prosperity-50)*.003-(war?.25:0),0,100);
 c.military=clamp((c.military||3)+.16+(c.aggression/100)*.28+(war?.8:0),0,100);
 c.exploration=clamp((c.exploration||4)+.24*tradeBonus+c.tech*.0025,0,100);
 c.stability=clamp((c.stability||60)+(c.food-50)*.015+(c.prosperity-50)*.008-(war?.9:0),0,100);
 c.prosperity=clamp(c.prosperity+(c.food-45)*.012+c.infrastructure*.006+c.tech*.004-(war?.6:0),0,100)
}

function pushCountryCause(name,cause,effect,weight=1){
 const c=state.world.countries[name];if(!c)return;
 c.causal??=[];c.causal.unshift({y:state.year,d:state.day,cause,effect,weight});c.causal=c.causal.slice(0,24);
 recordCountryEvent(name,`${cause} → ${effect}`)
}
function hasTreaty(a,b,type){
 return (state.world.countries[a]?.treaties||[]).some(t=>t.with===b&&t.type===type&&t.active!==false)
}
function relationBetween(a,b){
 const ca=state.world.countries[a];if(!ca)return 0;ca.diplomacy??={};ca.diplomacy[b]??={relation:0,last:state.year};return ca.diplomacy[b].relation
}
function adjustRelation(a,b,delta,reason=''){
 const ca=state.world.countries[a],cb=state.world.countries[b];if(!ca||!cb)return;
 ca.diplomacy??={};cb.diplomacy??={};ca.diplomacy[b]??={relation:0,last:state.year};cb.diplomacy[a]??={relation:0,last:state.year};
 ca.diplomacy[b].relation=clamp(ca.diplomacy[b].relation+delta,-100,100);cb.diplomacy[a].relation=clamp(cb.diplomacy[a].relation+delta,-100,100);
 ca.diplomacy[b].last=cb.diplomacy[a].last=state.year;
 if(reason){pushCountryCause(a,reason,`${b} 관계 ${delta>=0?'+':''}${delta}`,Math.abs(delta));pushCountryCause(b,reason,`${a} 관계 ${delta>=0?'+':''}${delta}`,Math.abs(delta))}
}
function addTreaty(a,b,type,duration=8){
 if(hasTreaty(a,b,type))return;
 const ta={with:b,type,start:state.year,end:state.year+duration,active:true},tb={with:a,type,start:state.year,end:state.year+duration,active:true};
 state.world.countries[a].treaties.push(ta);state.world.countries[b].treaties.push(tb);
 recordCountryEvent(a,`${b}과 ${type} 체결`);recordCountryEvent(b,`${a}과 ${type} 체결`)
}
function expireTreaties(){
 for(const c of Object.values(state.world.countries))for(const t of c.treaties||[])if(t.active&&state.year>=t.end)t.active=false
}

function recordCountryEvent(name,text){
 const c=state.world.countries[name];if(!c)return;c.events??=[];c.events.unshift({y:state.year,t:text});c.events=c.events.slice(0,16)
}

function simulateCountryEcology(name,c){
 const e=c.ecology;if(!e)return;
 const climate=/사막/.test(c.region)?.65:/수림/.test(c.region)?1.18:/화산/.test(c.region)?.72:1;
 const humanPressure=(c.population/180)+(c.infrastructure||0)/150;
 // prey reproduction
 e.rabbit=clamp(Math.round(e.rabbit*(1.18-.015*e.wolf-humanPressure*.015)*climate),0,500);
 e.deer=clamp(Math.round(e.deer*(1.10-.009*e.wolf-humanPressure*.012)*climate),0,260);
 e.boar=clamp(Math.round(e.boar*(1.08-.006*e.wolf-humanPressure*.01)*climate),0,180);
 const prey=e.rabbit+e.deer*1.8+e.boar*2;
 e.wolf=clamp(Math.round(e.wolf*(prey>80?1.06:.87)-humanPressure*.4),0,90);
 e.forest=clamp(e.forest+(climate-1)*1.4-humanPressure*.8+(e.wolf>8?.18:0),5,100);
 e.soil=clamp(e.soil+(e.forest-50)*.012-(c.population/220)*.7,8,100);
 e.water=clamp(e.water+(/해권|수림/.test(c.region)?.4:/사막/.test(c.region)?-.55:0)-humanPressure*.22,5,100);
 e.pressure=clamp(humanPressure*18+(100-e.forest)*.16+(e.boar+e.deer)*.06,0,100);
 if(e.pressure>60&&stableHash01(name+state.year+'raid')>.78)pushCountryCause(name,'서식지 압박','야생동물 농경지 침입',2)
}

function annualCountryPopulationSimulation(){
 normalizeWorldState();syncLocalWorldPeople();
 for(const[name,c]of Object.entries(state.world.countries)){
   c.lastPopulation=c.population;c.births=0;c.deaths=0;c.migration=0;
   if(name==='에르단 왕국'){rebuildCountryStats(name,true);updateCountryDevelopment(name,c);simulateCountryEcology(name,c);continue}
   const war=countryAtWar(name),people=aliveWorldPeople(name);
   for(const p of people){
     p.a++;
     assignWorldAdultJob(p);
     if(Math.random()<worldDeathChance(p.a,war)){p.alive=0;p.dy=state.year;c.deaths++}
   }
   let survivors=aliveWorldPeople(name);
   if(!survivors.length&&people.length){const keep=people[0];keep.alive=1;keep.dy=undefined;c.deaths=Math.max(0,c.deaths-1);survivors=[keep]}
   const mothers=survivors.filter(p=>p.g==='F'&&p.a>=18&&p.a<=41);
   let rate=.018+(c.prosperity-50)*.00010+(c.stability-50)*.00005-(war?.010:0);
   rate=clamp(rate,.004,.038);
   let births=Math.min(mothers.length,Math.max(0,Math.round(survivors.length*rate)));
   // Tiny groups need occasional births or they can never become countries.
   if(survivors.length<8&&mothers.length&&births===0&&stableHash01(name+state.year+'birth')>.60)births=1;
   for(let i=0;i<births;i++){
     const mother=mothers[i%mothers.length];
     state.worldPeople.push(createWorldBaby(name,mother));c.births++
   }
   rebuildCountryStats(name,true);updateCountryDevelopment(name,c);simulateCountryEcology(name,c)
 }
 simulateCountryKnowledgeAnnual();
 syncCountrySettlementGrowth();
 rebuildAllCountryStats(true);
 for(const[name,c]of Object.entries(state.world.countries)){
   c.history??=[];c.history.push([state.year,c.population,c.births,c.deaths,c.migration,Math.round(c.food),Math.round(c.tech),Math.round(c.military),c.settlements||1]);
   if(c.history.length>80)c.history=c.history.slice(-80)
 }
}
function syncLocalCountryPopulation(){
 syncLocalWorldPeople();rebuildCountryStats('에르단 왕국');state.worldPopulation=aliveWorldPeople().length
}
function countryCapital(country){
 const cs=WORLD_DATA.cities.filter(c=>c.country===country).sort((a,b)=>a.id.localeCompare(b.id));return cs[0]||null
}
function countryDistanceKm(a,b){
 const A=countryCapital(a),B=countryCapital(b);return A&&B?worldPointDistanceKm(A,B):999999
}
function simulateCountryKnowledgeAnnual(){
 const names=Object.keys(state.world.countries);
 for(const name of names){
   const c=state.world.countries[name];c.knownCountries??=[name];if(!c.knownCountries.includes(name))c.knownCountries.unshift(name);
   const unknown=names.filter(n=>!c.knownCountries.includes(n)).sort((a,b)=>countryDistanceKm(name,a)-countryDistanceKm(name,b));
   if(!unknown.length)continue;
   const reach=120+state.year*(18+c.tech*.18)+c.exploration*22+(c.infrastructure||0)*4;
   const target=unknown[0],km=countryDistanceKm(name,target);
   if(km<=reach){
     c.knownCountries.push(target);
     const t=state.world.countries[target];t.knownCountries??=[target];if(!t.knownCountries.includes(name))t.knownCountries.push(name);
     recordCountryEvent(name,`${target} 세력과 첫 접촉 (${Math.round(km).toLocaleString()}km)`);
     recordCountryEvent(target,`${name} 세력과 첫 접촉`);
     if(Math.random()<.35)addLog('story',`관찰 기록 · ${name}–${target} 첫 접촉`,`${name}과 ${target}의 탐사 범위가 맞닿았다. 두 세력은 그전까지 서로의 정확한 존재를 알지 못했지만, 이제부터 교역·갈등·교류가 가능해졌다.`,'관찰 AI','관찰자는 만남 이전부터 두 사회의 성장을 모두 보고 있었다.')
   }
 }
}
function syncCountrySettlementGrowth(){
 for(const[name,c]of Object.entries(state.world.countries)){
   const slots=WORLD_DATA.cities.filter(x=>x.country===name).sort((a,b)=>a.id.localeCompare(b.id));
   if(!slots.length)continue;
   const pop=c.population||0;
   const target=clamp(1+Math.floor(pop/45)+Math.floor((c.infrastructure||0)/45)+Math.floor((c.tech||0)/70),1,slots.length);
   if(target>(c.settlements||1)){
     for(let i=c.settlements||1;i<target;i++){
       const city=slots[i];if(city&&!state.world.foundedCities.includes(city.id)){state.world.foundedCities.push(city.id);recordCountryEvent(name,`${city.name} 정착지 형성`)}
     }
     c.settlements=target
   }
 }
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

function mobilizeCountry(name,enemy){
 const c=state.world.countries[name];if(!c)return;
 const ratio=clamp(.10+c.aggression*.0015, .08,.22);
 c.army.mobilized=Math.min(c.adults||0,Math.max(1,Math.round((c.adults||0)*ratio)));
 c.army.supply=100;c.army.morale=clamp(55+c.stability*.25,35,95);
 pushCountryCause(name,`${enemy}과 전쟁` ,`${c.army.mobilized}명 동원`,3)
}
function warPower(name){
 const c=state.world.countries[name];if(!c)return 1;
 return Math.max(1,c.army.mobilized*(.55+c.military/100)*(c.army.supply/100)*(c.army.morale/100)+c.tech*.18+c.infrastructure*.08)
}
function simulateWarYear(w){
 if(!w.active)return;
 const A=state.world.countries[w.a],B=state.world.countries[w.b];if(!A||!B)return;
 if(!A.army.mobilized)mobilizeCountry(w.a,w.b);if(!B.army.mobilized)mobilizeCountry(w.b,w.a);
 A.army.supply=clamp(A.army.supply-18-(100-A.food)*.05,0,100);B.army.supply=clamp(B.army.supply-18-(100-B.food)*.05,0,100);
 const pa=warPower(w.a)*(0.88+stableHash01(w.a+state.year)*.24),pb=warPower(w.b)*(0.88+stableHash01(w.b+state.year)*.24);
 const lossA=Math.min(A.army.mobilized,Math.max(0,Math.round((pb/(pa+pb))*A.army.mobilized*.18)));
 const lossB=Math.min(B.army.mobilized,Math.max(0,Math.round((pa/(pa+pb))*B.army.mobilized*.18)));
 function applyLoss(country,c,loss){
   const candidates=aliveWorldPeople(country).filter(p=>p.a>=16&&p.a<58);
   for(let i=0;i<Math.min(loss,candidates.length);i++){const p=candidates[i];p.alive=0;p.dy=state.year;p.death='전쟁';c.deaths++;c.army.casualties++}
   c.army.mobilized=Math.max(0,c.army.mobilized-loss);c.army.morale=clamp(c.army.morale-loss*2,10,100);
 }
 applyLoss(w.a,A,lossA);applyLoss(w.b,B,lossB);
 const loser=pa>=pb?B:A,loserName=pa>=pb?w.b:w.a;
 loser.infrastructure=clamp(loser.infrastructure-2.2,0,100);loser.stability=clamp(loser.stability-4,0,100);
 const refugees=Math.max(0,Math.round(loser.population*.03));
 loser.refugeesOut+=refugees;
 // refugees move to best known non-war country
 const destinations=(loser.knownCountries||[]).filter(n=>n!==loserName&&!countryAtWar(n)).sort((a,b)=>relationBetween(loserName,b)-relationBetween(loserName,a));
 const dest=destinations[0];
 if(dest&&refugees){
   const movers=aliveWorldPeople(loserName).filter(p=>p.a<16||p.a>=58).slice(0,refugees);
   for(const p of movers){p.c=dest;p.r=state.world.countries[dest].region;p.ct=countryCapital(dest)?.id||p.ct}
   state.world.countries[dest].refugeesIn+=movers.length;
   if(movers.length)pushCountryCause(dest,`${loserName} 전쟁난민`,`${movers.length}명 유입`,2)
 }
 pushCountryCause(w.a,'전쟁 결과',`${lossA}명 전사·실종`,lossA);pushCountryCause(w.b,'전쟁 결과',`${lossB}명 전사·실종`,lossB);
 rebuildCountryStats(w.a,true);rebuildCountryStats(w.b,true);if(dest)rebuildCountryStats(dest,true)
}

function simulateExternalWarsAnnual(){
 // Other countries also have independent history, but war requires actual mutual awareness.
 for(const w of state.world.externalWars||[]){
  if(!w.active)continue;
  simulateWarYear(w);
  if(state.year-w.startYear>=1+Math.floor(stableHash01(w.a+w.b)*4)||state.world.countries[w.a].army.supply<=5||state.world.countries[w.b].army.supply<=5){
    w.active=false;w.endYear=state.year;recordCountryEvent(w.a,`${w.b}과의 전쟁 종료`);recordCountryEvent(w.b,`${w.a}과의 전쟁 종료`);
    state.world.countries[w.a].army.mobilized=0;state.world.countries[w.b].army.mobilized=0;adjustRelation(w.a,w.b,-8,'전쟁 후유증')
  }
 }
 if((state.world.externalWars||[]).filter(w=>w.active).length>=3)return;
 const candidates=Object.keys(state.world.countries).sort((a,b)=>state.world.countries[b].aggression-state.world.countries[a].aggression);
 for(const a of candidates){
  const ca=state.world.countries[a];if(Math.random()>.035+ca.aggression*.00035)continue;
  const targets=(ca.knownCountries||[]).filter(b=>b!==a&&!countryAtWar(b));
  if(!targets.length)continue;
  const b=targets.sort((x,y)=>countryDistanceKm(a,x)-countryDistanceKm(a,y))[0];
  if(countryAtWar(a)||countryAtWar(b))continue;
  state.world.externalWars.push({a,b,active:true,startYear:state.year});
  mobilizeCountry(a,b);mobilizeCountry(b,a);
  recordCountryEvent(a,`${b}과 전쟁 발발`);recordCountryEvent(b,`${a}과 전쟁 발발`);
  addLog('warn',`관찰 기록 · ${a}–${b} 전쟁`,`${a}과 ${b}은 탐사와 접촉으로 서로의 존재를 알게 된 뒤 자원·통행·경계 갈등을 겪었다. 결국 무력 충돌이 시작되었다.`,'관찰 AI','서로 모르는 나라는 곧바로 전쟁하지 않는다.');
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
function syncWorldCityTimeline(){syncCountrySettlementGrowth()}
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
 annualCountryPopulationSimulation();expireTreaties();maybeTradeAndTreaties();simulateExternalWarsAnnual()
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
 guarded('복실이계보',()=>processDogLineageDaily());
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
 const ultra=state.speed>=50;
 if(!ultra||state.day===1||state.day%10===0)guarded('마을시각화',()=>syncVillageVisuals(false));
 state.demography.children=state.residents.filter(r=>r.age<16).length;
 if(!state.civ.lastAnnual)state.civ.lastAnnual={population:state.residents.length,world:state.worldPopulation,house:state.buildings.house,field:state.buildings.field,tech:countOpenTech(),level:state.civ.levelName,builds:state.civ.builds||0};
 if(!ultra||state.day===1||state.day%20===0)save();
 uiDirty=true
}
let dayTimer=0;
function daysPerSecond(){
 if(state.speed>=300)return 60;
 if(state.speed>=100)return 18;
 if(state.speed>=50)return 7.5;
 if(state.speed>=20)return 2.5;
 if(state.speed>=5)return .75;
 if(state.speed>=1)return .22;
 return 0
}
function visualTimeScale(){
 if(state.speed>=50)return 4.0;
 if(state.speed>=20)return 3.0;
 if(state.speed>=5)return 1.75;
 if(state.speed>=1)return 1;
 return .25
}
function updateSim(dt){
 if(!state.running||state.speed===0)return;
 dayTimer+=dt*daysPerSecond();
 const batch=Math.min(120,Math.floor(dayTimer));
 if(batch<=0)return;
 dayTimer-=batch;
 for(let i=0;i<batch;i++)advanceDay()
}
function updatePeople(dt,now){
 const timeScale=visualTimeScale();
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
const mini=$('minimap'),mctx=mini.getContext('2d');
const MINI_RANGE_BY_LEVEL=[72,105,145,185];
let miniPin=null,miniPinUntil=0;
function miniRange(){return MINI_RANGE_BY_LEVEL[clamp(state.localMap?.level||0,0,3)]||60}
function miniCenter(){return{x:player.position.x,z:player.position.z}}
function worldToMini(x,z){
 const c=miniCenter(),r=miniRange();
 return{x:mini.width/2+(x-c.x)/r*(mini.width*.48),y:mini.height/2+(z-c.z)/r*(mini.height*.48)}
}
function miniToWorld(px,py){
 const c=miniCenter(),r=miniRange();
 return{x:c.x+(px-mini.width/2)/(mini.width*.48)*r,z:c.z+(py-mini.height/2)/(mini.height*.48)*r}
}
function miniVisible(q,pad=14){return q.x>=-pad&&q.x<=mini.width+pad&&q.y>=-pad&&q.y<=mini.height+pad}

function drawMiniLandmarkPointer(l){
 const q=worldToMini(l.p.x,l.p.z),w=mini.width,h=mini.height;
 if(miniVisible(q,4)){
   mctx.save();mctx.fillStyle=`#${(l.color||0xf0cf80).toString(16).padStart(6,'0')}`;mctx.font='bold 16px system-ui';mctx.textAlign='center';mctx.textBaseline='middle';mctx.fillText(l.icon,q.x,q.y);mctx.restore();return
 }
 const dx=q.x-w/2,dy=q.y-h/2,len=Math.hypot(dx,dy)||1;
 const edge=Math.min((w*.46)/Math.abs(dx||.001),(h*.46)/Math.abs(dy||.001));
 const x=w/2+dx*edge,y=h/2+dy*edge;
 mctx.save();mctx.translate(x,y);mctx.rotate(Math.atan2(dy,dx)+Math.PI/2);
 mctx.fillStyle=l.name==='감나무뜰'?'#ffe08a':'#c7d7a1';mctx.beginPath();mctx.moveTo(0,-9);mctx.lineTo(6,6);mctx.lineTo(-6,6);mctx.closePath();mctx.fill();mctx.restore();
 mctx.save();mctx.fillStyle='rgba(20,26,22,.82)';mctx.font='bold 10px -apple-system,sans-serif';mctx.textAlign='center';
 const dist=Math.round(Math.hypot(l.p.x-player.position.x,l.p.z-player.position.z));mctx.fillText(`${l.icon}${dist}m`,clamp(x,26,w-26),clamp(y+14,12,h-6));mctx.restore()
}

const MINI_PLACES=[
 ['감나무뜰 중심',LOC.center],['밭',LOC.field],['강가',LOC.river],['숲',LOC.forest],['채석지',LOC.stone],
 ['작업장',LOC.workshop],['약초지',LOC.herbs],['사육장',LOC.pen],['회의터',LOC.meeting]
];
function localPlaceName(x,z){
 let best='분지 외곽',bd=Infinity;
 for(const[n,p]of MINI_PLACES){const d=Math.hypot(x-p.x,z-p.z);if(d<bd){bd=d;best=n}}
 for(const l of LOCAL_LANDMARKS)if((l.level||0)<=state.localMap.level){const d=Math.hypot(x-l.p.x,z-l.p.z);if(d<bd){bd=d;best=l.name}}
 const dir=Math.abs(x)>Math.abs(z)?(x>=0?'동쪽':'서쪽'):(z>=0?'남쪽':'북쪽');
 return bd<12?best:`${best} ${dir} ${Math.round(bd)}m`
}
function setMiniInfo(x,z,prefix='📍'){
 const el=$('miniLocationInfo');if(!el)return;
 const d=Math.hypot(x-player.position.x,z-player.position.z);
 el.textContent=`${prefix} ${localPlaceName(x,z)} · X ${x.toFixed(1)} / Z ${z.toFixed(1)} · ${Math.round(d)}m`
}

const MINI_BIOME_COLORS={
 meadow:'#899563',forest:'#617753',lakewood:'#667b59',
 hills:'#7c845f',grassland:'#87915e',wetland:'#667f68'
};
function miniChunkRect(cx,cz){
 const half=STREAM_CHUNK/2;
 const a=worldToMini(cx*STREAM_CHUNK-half,cz*STREAM_CHUNK-half);
 const b=worldToMini(cx*STREAM_CHUNK+half,cz*STREAM_CHUNK+half);
 return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}
}
function drawMiniStreamingTerrain(){
 const c=miniCenter(),range=miniRange(),w=mini.width,h=mini.height;
 const minCX=Math.floor((c.x-range)/STREAM_CHUNK)-1,maxCX=Math.floor((c.x+range)/STREAM_CHUNK)+1;
 const minCZ=Math.floor((c.z-range)/STREAM_CHUNK)-1,maxCZ=Math.floor((c.z+range)/STREAM_CHUNK)+1;

 // Exactly the same biome function as 3D chunk streaming.
 for(let cz=minCZ;cz<=maxCZ;cz++)for(let cx=minCX;cx<=maxCX;cx++){
   const biome=chunkBiome(cx,cz),r=miniChunkRect(cx,cz);
   mctx.fillStyle=MINI_BIOME_COLORS[biome]||'#81905f';
   mctx.fillRect(r.x-1,r.y-1,r.w+2,r.h+2);

   // Same deterministic pond rule/position used by buildStreamChunk().
   const central=Math.abs(cx)<=1&&Math.abs(cz)<=1;
   const waterChance=chunkSeed(cx,cz,777);
   const hasPond=!central&&((biome==='lakewood'&&waterChance<.52)||(biome==='wetland'&&waterChance<.42)||(waterChance<.055));
   if(hasPond){
     const wx=cx*STREAM_CHUNK+(chunkSeed(cx,cz,779)-.5)*55;
     const wz=cz*STREAM_CHUNK+(chunkSeed(cx,cz,780)-.5)*55;
     const q=worldToMini(wx,wz);
     const radiusWorld=11+chunkSeed(cx,cz,778)*14;
     const edge=worldToMini(wx+radiusWorld,wz);
     const rr=Math.max(2,Math.abs(edge.x-q.x));
     mctx.save();mctx.fillStyle='#6697a5';mctx.globalAlpha=.92;
     mctx.beginPath();mctx.ellipse(q.x,q.y,rr,rr*.68,0,0,Math.PI*2);mctx.fill();mctx.restore()
   }

   // Same deterministic terrain objects as 3D streaming.
   const count=central?5:(IS_MOBILE?13:22);
   for(let i=0;i<count;i++){
     const lx=(chunkSeed(cx,cz,i*4)-.5)*(STREAM_CHUNK-14);
     const lz=(chunkSeed(cx,cz,i*4+1)-.5)*(STREAM_CHUNK-14);
     const wx=cx*STREAM_CHUNK+lx,wz=cz*STREAM_CHUNK+lz,q=worldToMini(wx,wz);
     if(!miniVisible(q,4))continue;
     const typeSeed=chunkSeed(cx,cz,i*4+2);
     let type='rock';
     if(biome==='forest'||biome==='lakewood')type=typeSeed<.72?'tree':typeSeed<.87?'bush':'rock';
     else if(biome==='hills')type=typeSeed<.38?'tree':typeSeed<.82?'rock':'bush';
     else if(biome==='wetland')type=typeSeed<.35?'tree':'bush';
     else type=typeSeed<.34?'tree':typeSeed<.68?'bush':'rock';

     if(type==='tree'){
       mctx.fillStyle='#31563a';mctx.beginPath();mctx.arc(q.x,q.y,2.2,0,Math.PI*2);mctx.fill()
     }else if(type==='bush'){
       mctx.fillStyle='#4b754b';mctx.beginPath();mctx.arc(q.x,q.y,1.5,0,Math.PI*2);mctx.fill()
     }else{
       mctx.fillStyle='#77786f';mctx.fillRect(q.x-1.4,q.y-1.1,2.8,2.2)
     }
   }

   // Same occasional explorer cairn marker.
   if(!central&&chunkSeed(cx,cz,991)<.075){
     const wx=cx*STREAM_CHUNK+(chunkSeed(cx,cz,992)-.5)*52;
     const wz=cz*STREAM_CHUNK+(chunkSeed(cx,cz,993)-.5)*52;
     const q=worldToMini(wx,wz);
     if(miniVisible(q,8)){mctx.fillStyle='#e0cf9a';mctx.font='bold 8px system-ui';mctx.textAlign='center';mctx.fillText('◇',q.x,q.y+2)}
   }
 }
}
function drawMiniVillageOverlay(){
 const c=miniCenter(),range=miniRange(),nearVillage=Math.abs(c.x)<range+115&&Math.abs(c.z)<range+95;
 if(!nearVillage)return;

 // Original village features only exist around the real settlement.
 const riverX=30,ra=worldToMini(riverX,c.z-range*1.2),rb=worldToMini(riverX,c.z+range*1.2);
 if(ra.x>-20&&ra.x<mini.width+20){mctx.strokeStyle='#68a1b2';mctx.lineWidth=12;mctx.beginPath();mctx.moveTo(ra.x,ra.y);mctx.lineTo(rb.x,rb.y);mctx.stroke()}

 mctx.strokeStyle='#ae9369';mctx.lineWidth=5;
 for(const[a,b]of[[LOC.center,LOC.field],[LOC.center,LOC.river],[LOC.center,LOC.forest],[LOC.center,LOC.stone]]){
   const p=worldToMini(a.x,a.z),q=worldToMini(b.x,b.z);
   if(miniVisible(p,40)||miniVisible(q,40)){mctx.beginPath();mctx.moveTo(p.x,p.y);mctx.lineTo(q.x,q.y);mctx.stroke()}
 }

 const f=worldToMini(LOC.field.x,LOC.field.z);
 if(miniVisible(f,25)){mctx.fillStyle='#84633e';mctx.fillRect(f.x-15,f.y-11,30,22)}
}

function drawMini(){
 const w=mini.width,h=mini.height,c=miniCenter(),range=miniRange();
 mctx.clearRect(0,0,w,h);
 drawMiniStreamingTerrain();
 drawMiniVillageOverlay();

 // subtle world-coordinate grid, using the same coordinates as the 3D scene.
 mctx.save();mctx.strokeStyle='rgba(255,255,255,.05)';mctx.lineWidth=1;
 const grid=20,firstX=Math.floor((c.x-range)/grid)*grid,firstZ=Math.floor((c.z-range)/grid)*grid;
 for(let x=firstX;x<=c.x+range;x+=grid){const a=worldToMini(x,c.z-range),b=worldToMini(x,c.z+range);mctx.beginPath();mctx.moveTo(a.x,a.y);mctx.lineTo(b.x,b.y);mctx.stroke()}
 for(let z=firstZ;z<=c.z+range;z+=grid){const a=worldToMini(c.x-range,z),b=worldToMini(c.x+range,z);mctx.beginPath();mctx.moveTo(a.x,a.y);mctx.lineTo(b.x,b.y);mctx.stroke()}
 mctx.restore();

 // buildings move across the minimap as player walks
 for(let i=0;i<(state.buildings.house||0);i++){
   const s=HOUSE_SPOTS[i%HOUSE_SPOTS.length],q=worldToMini(s[0],s[1]);if(!miniVisible(q))continue;
   mctx.fillStyle='#d8b37b';mctx.fillRect(q.x-3,q.y-3,6,6)
 }
 const special=[
   [state.buildings.storage,9,-14,'#8a5d35','square'],
   [state.buildings.workshop,LOC.workshop.x,LOC.workshop.z,'#6b4c32','square'],
   [state.buildings.herb,LOC.herbs.x+4,LOC.herbs.z-2,'#7ca465','square'],
   [state.buildings.pen,LOC.pen.x,LOC.pen.z,'#c3a574','outline'],
   [state.buildings.well,20,6,'#6f9eb1','circle'],
   [state.buildings.kitchen,-8,-14,'#b58d58','square'],
   [state.buildings.kiln,14,-23,'#9a684d','circle'],
   [state.buildings.watch,-28,-3,'#d0b27f','tower']
 ];
 for(const[on,x,z,color,kind]of special){
   if(!on)continue;const q=worldToMini(x,z);if(!miniVisible(q))continue;mctx.fillStyle=color;mctx.strokeStyle=color;
   if(kind==='circle'){mctx.beginPath();mctx.arc(q.x,q.y,4,0,Math.PI*2);mctx.fill()}
   else if(kind==='outline'){mctx.strokeRect(q.x-5,q.y-5,10,10)}
   else if(kind==='tower')mctx.fillRect(q.x-3,q.y-6,6,12);
   else mctx.fillRect(q.x-4,q.y-4,8,8)
 }

 // NPCs, dog, fauna, hostiles
 people.forEach(p=>{const q=worldToMini(p.position.x,p.position.z);if(!miniVisible(q))return;mctx.fillStyle=p.userData.id==='C0001'?'#f2b665':'#f5e3b5';mctx.beginPath();mctx.arc(q.x,q.y,p.userData.id==='C0001'?4.5:3,0,Math.PI*2);mctx.fill()});
 const bq=worldToMini(bokshil.position.x,bokshil.position.z);if(miniVisible(bq)){mctx.fillStyle='#8c5f3e';mctx.beginPath();mctx.arc(bq.x,bq.y,3.5,0,Math.PI*2);mctx.fill()}
 for(const d of state.dogLineage.dogs){if(!d.alive||d.id==='DOG-BOKSHIL')continue;const g=dogLineageModels.get(d.id);if(!g)continue;const q=worldToMini(g.position.x,g.position.z);if(!miniVisible(q))continue;mctx.fillStyle=d.generation>0?'#d5aa6d':'#b8895d';mctx.beginPath();mctx.arc(q.x,q.y,dogIsAdult(d)?2.8:1.8,0,Math.PI*2);mctx.fill()}
 for(const a of animals){if(!a.visible)continue;const q=worldToMini(a.position.x,a.position.z);if(!miniVisible(q))continue;mctx.fillStyle=a.userData.domestic?'#e0bd74':'#759c67';mctx.beginPath();mctx.arc(q.x,q.y,a.userData.domestic?2.7:2,0,Math.PI*2);mctx.fill()}
 for(const hst of conflictHostiles){if(!hst||!hst.visible||hst.userData.dead)continue;const q=worldToMini(hst.position.x,hst.position.z);if(!miniVisible(q))continue;mctx.fillStyle=hst.userData.raidHuman?'#d44f43':'#c46a4d';mctx.beginPath();mctx.arc(q.x,q.y,3.5,0,Math.PI*2);mctx.fill()}
 for(const mo of monsters){if(mo.userData.dead)continue;const q=worldToMini(mo.position.x,mo.position.z);if(!miniVisible(q))continue;mctx.fillStyle='#bf5f63';mctx.beginPath();mctx.arc(q.x,q.y,3.3,0,Math.PI*2);mctx.fill()}

 if(state.flags.myeongjaDead){const q=worldToMini(-9,10);if(miniVisible(q)){mctx.fillStyle='#73746f';mctx.fillRect(q.x-2,q.y-4,4,8)}}
 if(eventFocus){const q=worldToMini(eventFocus.x,eventFocus.z);if(miniVisible(q)){mctx.strokeStyle='#e66f65';mctx.lineWidth=3;mctx.beginPath();mctx.arc(q.x,q.y,9,0,Math.PI*2);mctx.stroke()}}

 // landmarks: visible icons or edge arrows when far away
 for(const l of LOCAL_LANDMARKS)if((l.level||0)<=state.localMap.level)drawMiniLandmarkPointer(l);
 if(navWaypoint){
   const nq=worldToMini(navWaypoint.p.x,navWaypoint.p.z);
   mctx.save();mctx.strokeStyle='#ffe07f';mctx.setLineDash([5,4]);mctx.lineWidth=2;
   mctx.beginPath();mctx.moveTo(w/2,h/2);mctx.lineTo(clamp(nq.x,0,w),clamp(nq.y,0,h));mctx.stroke();mctx.restore()
 }

 // user is always centered; arrow shows actual facing direction
 const cx=w/2,cy=h/2,a=player.rotation.y;
 mctx.save();mctx.translate(cx,cy);mctx.rotate(-a);
 mctx.fillStyle='#7293ff';mctx.strokeStyle='#e9efff';mctx.lineWidth=2;
 mctx.beginPath();mctx.moveTo(0,-9);mctx.lineTo(6,7);mctx.lineTo(0,4);mctx.lineTo(-6,7);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
 mctx.save();mctx.font='bold 9px -apple-system,sans-serif';mctx.textAlign='center';mctx.fillStyle='#eef2ff';mctx.fillText('나',cx,cy+20);
 const hd=Math.hypot(player.position.x,player.position.z);
 if(hd>18){const a=Math.atan2(-player.position.x,player.position.z),rr=Math.min(w,h)*.39,hx=cx+Math.sin(a)*rr,hy=cy-Math.cos(a)*rr;mctx.fillStyle='#f0cf80';mctx.font='bold 10px -apple-system,sans-serif';mctx.fillText('⌂',hx,hy);mctx.font='7px -apple-system,sans-serif';mctx.fillText(`${Math.round(hd)}m`,hx,hy+11)}
 mctx.restore();

 // tapped position marker
 if(miniPin&&performance.now()<miniPinUntil){
   const q=worldToMini(miniPin.x,miniPin.z);
   if(miniVisible(q)){mctx.strokeStyle='#ffd36c';mctx.lineWidth=3;mctx.beginPath();mctx.arc(q.x,q.y,10,0,Math.PI*2);mctx.stroke();mctx.beginPath();mctx.moveTo(q.x-12,q.y);mctx.lineTo(q.x+12,q.y);mctx.moveTo(q.x,q.y-12);mctx.lineTo(q.x,q.y+12);mctx.stroke()}
 }else miniPin=null;

 $('miniRangeLabel').textContent=`3D 지형 동기화 · ±${range}m`;
 if(!miniPin)setMiniInfo(player.position.x,player.position.z,'●')
}
mini.addEventListener('pointerdown',e=>{
 e.preventDefault();e.stopPropagation();
 const r=mini.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*mini.width,py=(e.clientY-r.top)/r.height*mini.height;
 const w=miniToWorld(px,py);
 miniPin={x:w.x,z:w.z};miniPinUntil=performance.now()+6000;setMiniInfo(w.x,w.z,'📍');
 autoFocus.set(w.x,0,w.z);setCameraMode('free')
},{passive:false});
function renderResources(){$('resources').innerHTML=Object.entries(RESOURCE_META).map(([k,[n,i]])=>`<div class="res glass"><span>${i}</span><b>${Math.floor(state.resources[k])}</b><small>${n}</small></div>`).join('')}
function renderStory(){const l=currentStory();$('storyTitle').textContent=l.title||'감나무뜰의 하루';$('storyText').textContent=l.text||'아직 기록된 사건이 없다.';$('storyQuote').textContent=`“${storyQuoteFor(l)}”`;$('storySpeaker').textContent=`— ${l.speaker||'기록'}`;$('storyTime').textContent=`세계력 ${l.time||stamp()}`;$('tickerTitle').textContent=l.title||'감나무뜰의 하루';$('tickerText').textContent=l.text||''}

function renderBrainPanel(r){
 if(!r){$('brainPanel').classList.add('hidden');return}
 initResidentBrain(r);selectedBrainId=r.id;$('brainPanel').classList.remove('hidden');
 $('brainFace').textContent='';$('brainFace').style.backgroundImage=`url('${portraitForResident(r)}')`;$('brainName').textContent=`${r.name} · ${r.lifeStage||residentLifeStage(r.age)} · ${r.job} · ${r.age}세`;
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
   return`<div class="card resident-row"><div class="face" style="background-image:url('${portraitForResident(r)}')"></div><div><b>${r.name} · ${r.job}</b><br><small>${r.id} · ${r.age}세 · ${task}</small><div class="bar"><i style="width:${r.bloom}%"></i></div><small>“${r.brain?.thought||'주변을 살피는 중'}”</small><br><small>${best[0]} ${Math.round(best[1])} · 개화 ${r.bloom.toFixed(1)}%</small></div><button class="focus-person" data-focus="${r.id}">보기</button></div>`
 }).join('')+(state.deceased||[]).map(d=>`<div class="card resident-row deceased-row"><div class="face">†</div><div><b>${d.name} · 사망</b><br><small>세계력 ${d.year}년 ${d.day}일 · ${d.cause}</small><br><small>활동 주민 목록에서는 제외되며 기록과 묘역에 남습니다.</small></div></div>`).join('');
 document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{followId=b.dataset.focus;$('followSelect').value=followId;setCameraMode('follow');renderBrainPanel(state.residents.find(r=>r.id===followId));$('sheet').classList.add('hidden')})
}
function renderWorld(){
 const b=state.buildings,t=state.tech,children=state.residents.filter(r=>r.age<16).length,adults=state.residents.length-children;
 $('worldCards').innerHTML=`<div class="card"><h3>${state.civ.levelName} · 마을 현황</h3><p>라엔 분지 주민 ${state.residents.length}명 (성인/청소년 ${adults} · 아이 ${children}) · 세계 인구 ${state.worldPopulation}명</p><span class="tag">주택 ${b.house}</span><span class="tag">밭 ${b.field}</span><span class="tag">저장고 ${b.storage}</span><span class="tag">작업장 ${b.workshop}</span><span class="tag">우물 ${b.well}</span><span class="tag">공동부엌 ${b.kitchen}</span><span class="tag">가마 ${b.kiln}</span><span class="tag">약초대 ${b.herb}</span><span class="tag">사육장 ${b.pen}</span><span class="tag">공동마루 ${b.meeting}</span><span class="tag">베틀 ${b.loom}</span><span class="tag">망루 ${b.watch}</span></div><div class="card"><h3>기술 발전 · ${countOpenTech()}개 정착</h3>${Object.entries(t).map(([k,v])=>`<p>${k} ${v.open?'✓':'· '+Math.floor(v.p)+'%'}</p><div class="bar"><i style="width:${v.open?100:Math.min(100,v.p)}%"></i></div>`).join('')}</div><div class="card"><h3>인구·세대</h3><p>공식 주민 원장을 출생년과 등장 시점에 맞춰 세계 안에 불러옵니다. 아이는 작게 보이고 성장하면서 할 수 있는 일이 늘어납니다.</p><span class="tag">출생 ${state.demography.births}</span><span class="tag">합류 ${state.demography.arrivals}</span><span class="tag">아이 ${children}</span></div><div class="card"><h3>핵심 인물·복실이 계보</h3><p>🐕 복실이는 주민을 순찰하고 야생동물 습격을 막습니다. 시간이 흐르면 다른 마을개와 짝을 이루고 새끼가 태어나며, 성장한 후손도 순찰과 동물 방어를 이어받습니다.</p><span class="tag">살아있는 계보 ${state.dogLineage.dogs.filter(d=>d.alive).length}마리</span><span class="tag">후손 출생 ${state.dogLineage.totalBirths||0}</span><span class="tag">최고 ${Math.max(0,...state.dogLineage.dogs.filter(d=>d.alive).map(d=>d.generation||0))}세대</span><span class="tag">이명자 ${state.flags.myeongjaDead?'3년 1일 사망':'생존'}</span></div><div class="card"><h3>동물·탐사 지도</h3><p>일반 야생동물은 몬스터와 별개로 처음부터 살아 움직입니다. 사육장이 생기면 닭과 염소가 실제 3D 개체로 들어옵니다.</p><span class="tag">야생동물 ${animals.filter(a=>!a.userData.domestic).length}</span><span class="tag">사육동물 ${animals.filter(a=>a.userData.domestic).length}</span><span class="tag">지역 확장 ${state.localMap.level+1}/4</span><span class="tag">드래그 ${dragMode==='pan'?'화면 이동':'회전'}</span></div><div class="card"><h3>주민 자율 AI</h3><p>하루가 지나면 하루치 생산·연구·건축이 반드시 계산됩니다. 배속을 올려도 문명 시간이 빈 채로 지나가지 않습니다.</p></div><div class="card"><h3>세계 확장 · 지구급 행성</h3><p>행성 둘레 40,075km · 주민 접촉 권역 ${state.world.knownRegions.length}/8 · 현재 형성 거점 ${state.world.foundedCities.length}/126 · 육상 탐사 ${Math.floor(state.world.landProgress)} · 해상 원정 ${Math.floor(state.world.seaProgress)}</p>${(state.world.expeditions||[]).filter(e=>e.active).map(e=>`<span class="tag">${e.region} ${Math.round(e.progress*100)}% · ${Math.max(0,e.arrivalAbsDay-absDay())}일 남음 · ${e.distanceKm.toLocaleString()}km</span>`).join('')}<span class="tag">${state.world.seaTech.sail.label} ${state.world.seaTech.sail.open?'✓':Math.floor(state.world.seaTech.sail.p)+'%'}</span><span class="tag">${state.world.seaTech.navigation.label} ${state.world.seaTech.navigation.open?'✓':Math.floor(state.world.seaTech.navigation.p)+'%'}</span><span class="tag">${state.world.seaTech.stores.label} ${state.world.seaTech.stores.open?'✓':Math.floor(state.world.seaTech.stores.p)+'%'}</span></div><div class="card"><h3>관찰자 세계 인구 · 실제 개체 ${aliveWorldPeople().length}명</h3><p>세계력 0년의 300명을 실제 사람 명부로 시작합니다. 나라별 출생·사망이 실제 사람 개체를 추가/제거하며, 국가는 서로를 자동으로 아는 것이 아닙니다.</p>${Object.entries(state.world.countries).sort((a,b)=>b[1].population-a[1].population).slice(0,10).map(([n,c])=>`<span class="tag">${n} ${c.population}명 · ${c.stage}</span>`).join('')}<p>🌍 세계지도에서 모든 나라의 성장 기록과 실제 주민 명부를 확인할 수 있습니다.</p></div><div class="card"><h3>현재 역사 노선 · ${trajectorySummary().name}</h3><p>고정 시나리오가 아니라 주민이 반복한 행동으로 변합니다.</p>${trajectorySummary().pairs.slice(0,5).map(([k,v])=>`<span class="trajectory-tag">${TRAJECTORY_NAMES[k]||k} ${v.toFixed(1)}</span>`).join('')}</div><div class="card"><h3>생태·전쟁 기록</h3><p>동물 습격 ${state.conflict.animalRaids}회 · 전투 ${state.conflict.warBattles}회 · 부상 ${state.conflict.wounded}명 · 식량 손실 ${state.conflict.foodLost.toFixed(1)}</p><span class="tag">현재 전쟁 ${(state.world.wars||[]).filter(w=>w.active).length}</span><span class="tag">외부 국가간 전쟁 ${(state.world.externalWars||[]).filter(w=>w.active).length}</span></div>`
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
 if($('bokshilStatus')){
   const livingDogs=state.dogLineage.dogs.filter(d=>d.alive),desc=livingDogs.filter(d=>d.generation>0),maxGen=Math.max(0,...livingDogs.map(d=>d.generation||0));
   $('bokshilStatus').textContent=state.companion.bokshil.active?`${bokshil?.userData?.status||'주민들 사이를 순찰 중'} · 계보 ${livingDogs.length}마리 / ${maxGen}세대`:`복실이의 후손 ${desc.length}마리가 순찰을 이어가는 중 · ${maxGen}세대`
 }
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


// ---------- OBSERVER REGIONAL 3D MAPS ----------
const regionViewGroup=new THREE.Group();regionViewGroup.visible=false;scene.add(regionViewGroup);
let regionViewActive=false,regionViewName=null,regionHiddenState=[];
let regionVisitCountry=null,regionVisitCityId=null,regionWalkPlane=null,regionMapTransform=null;
let regionObserver=null,regionObserverTarget=null;
function disposeRegionView(){
 regionWalkPlane=null;regionMapTransform=null;regionObserver=null;regionObserverTarget=null;
 while(regionViewGroup.children.length){
   const o=regionViewGroup.children.pop();
   o.traverse?.(c=>{if(c.geometry)c.geometry.dispose?.();if(c.material){const ms=Array.isArray(c.material)?c.material:[c.material];ms.forEach(m=>{m.map?.dispose?.();m.dispose?.()})}})
 }
}
function regionStyle(name){
 return{
  '아르케아 중앙대륙':{ground:0x77875a,water:0x4d91a5,kind:'plain'},
  '실바리온 수림권':{ground:0x446d4b,water:0x477f8f,kind:'forest'},
  '카르딘 산맥권':{ground:0x72766f,water:0x527f91,kind:'mountain'},
  '세라칸 대초원':{ground:0x929054,water:0x4d8593,kind:'steppe'},
  '네레이아 해권':{ground:0x4d8793,water:0x356f88,kind:'islands'},
  '솔라크 사막권':{ground:0xb59053,water:0x4b8799,kind:'desert'},
  '드라바스 화산군도':{ground:0x4c3b36,water:0x32677e,kind:'volcanic'},
  '루메라 부유제도':{ground:0x6d6681,water:0x416f89,kind:'islands'}
 }[name]||{ground:0x77875a,water:0x4d91a5,kind:'plain'}
}

function createRegionObserver(){
 const g=new THREE.Group();
 const art=makeArtBillboard(CHARACTER_ART.player,1.85,2.8,1.5);g.add(art);
 const marker=makeFloatingNameSprite('▼ 나 · 관찰자');marker.position.set(0,3.25,0);marker.scale.set(2.8,.62,1);g.add(marker);
 g.userData={observer:true,target:new THREE.Vector3(),moving:false};
 return g
}

function regionLabel(text,x,z,scale=4){
 const s=makeFloatingNameSprite(text);s.position.set(x,3.2,z);s.scale.set(scale,scale*.25,1);regionViewGroup.add(s);return s
}
function regionTree(x,z,s=1){
 const g=new THREE.Group(),tr=new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.22*s,1.6*s,6),new THREE.MeshStandardMaterial({color:0x513b2c,roughness:1})),cr=new THREE.Mesh(new THREE.ConeGeometry(.8*s,2*s,7),new THREE.MeshStandardMaterial({color:0x294d35,roughness:1}));
 tr.position.y=.8*s;cr.position.y=2*s;g.add(tr,cr);g.position.set(x,0,z);regionViewGroup.add(g)
}
function regionMountain(x,z,s=1,volcanic=false){
 const base=new THREE.Mesh(new THREE.ConeGeometry(2.7*s,5*s,7),new THREE.MeshStandardMaterial({color:volcanic?0x5b4038:0x737874,roughness:1}));
 base.position.set(x,2.5*s,z);regionViewGroup.add(base);
 if(volcanic){const cap=new THREE.Mesh(new THREE.ConeGeometry(.85*s,1.6*s,7),new THREE.MeshStandardMaterial({color:0x9d4b36,emissive:0x52150b,emissiveIntensity:.25,roughness:1}));cap.position.set(x,5.05*s,z);cap.rotation.x=Math.PI;regionViewGroup.add(cap)}
}
function regionCityMarker(city,x,z,capital=false){
 const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:capital?0xd8ba70:0xb8aa8a,roughness:.9});
 const base=new THREE.Mesh(new THREE.CylinderGeometry(capital?1.1:.72,capital?1.25:.82,1.1,8),mat);base.position.y=.55;g.add(base);
 const roof=new THREE.Mesh(new THREE.ConeGeometry(capital?1.35:.95,.9,8),new THREE.MeshStandardMaterial({color:capital?0x6d4934:0x5c5548,roughness:1}));roof.position.y=1.55;g.add(roof);
 g.position.set(x,0,z);regionViewGroup.add(g);regionLabel(city.name,x,z,capital?3.2:2.6)
}

const regionCitizenMeshes=[];
function clearRegionCitizens(){for(const p of regionCitizenMeshes)regionViewGroup.remove(p);regionCitizenMeshes.length=0}
function makeTinyCitizen(person,x,z){
 const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.52,6),new THREE.MeshStandardMaterial({color:person.g==='F'?0x8c6f70:0x667684,roughness:1})),head=new THREE.Mesh(new THREE.SphereGeometry(.11,7,5),new THREE.MeshStandardMaterial({color:0xc79b7f,roughness:1}));
 body.position.y=.38;head.position.y=.77;g.add(body,head);g.position.set(x,0,z);g.userData={personId:person.id,phase:stableHash01(person.id)*10};regionViewGroup.add(g);regionCitizenMeshes.push(g);return g
}
function decorateGrowingSettlement(country,city,x,z){
 const c=state.world.countries[country];if(!c)return;
 const houses=clamp(Math.round(c.population/12),1,22),radius=5+Math.min(13,c.population/18);
 for(let i=0;i<houses;i++){
   const a=i/houses*Math.PI*2+(stableHash01(city.id+i)*.4),r=3+(i%4)*2.1;
   const h=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(.75,.65,.75),new THREE.MeshStandardMaterial({color:0xa88a65,roughness:1})),roof=new THREE.Mesh(new THREE.ConeGeometry(.62,.45,4),new THREE.MeshStandardMaterial({color:0x5f4c3b,roughness:1}));
   base.position.y=.33;roof.position.y=.88;roof.rotation.y=Math.PI/4;h.add(base,roof);h.position.set(x+Math.cos(a)*r,0,z+Math.sin(a)*r);regionViewGroup.add(h)
 }
 if(c.population>=40){const market=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,.2,8),new THREE.MeshStandardMaterial({color:0xc1a868,roughness:1}));market.position.set(x,.12,z+3.5);regionViewGroup.add(market)}
 if(c.infrastructure>=45||c.population>=120){
   const wallMat=new THREE.MeshStandardMaterial({color:0x77705d,roughness:1});
   for(const [dx,dz,sx,sz] of [[0,-radius,radius*2,.35],[0,radius,radius*2,.35],[-radius,0,.35,radius*2],[radius,0,.35,radius*2]]){
     const w=new THREE.Mesh(new THREE.BoxGeometry(sx,.85,sz),wallMat);w.position.set(x+dx,.43,z+dz);regionViewGroup.add(w)
   }
 }
 if(/해권|군도/.test(c.region)&&c.population>=35){const pier=new THREE.Mesh(new THREE.BoxGeometry(1,.18,7),new THREE.MeshStandardMaterial({color:0x6f5337,roughness:1}));pier.position.set(x+5,.14,z);regionViewGroup.add(pier)}
 if(/산맥|화산/.test(c.region)&&c.population>=28){const mine=new THREE.Mesh(new THREE.TorusGeometry(.9,.18,6,12,Math.PI),new THREE.MeshStandardMaterial({color:0x4b4946,roughness:1}));mine.position.set(x-5,.9,z);mine.rotation.z=Math.PI;regionViewGroup.add(mine)}
}
function populateRegionObservers(name,sx,sz){
 clearRegionCitizens();
 const countries=[...new Set(WORLD_DATA.cities.filter(c=>c.region===name).map(c=>c.country))];
 const people=aliveWorldPeople().filter(p=>countries.includes(p.c));
 const maxVisible=IS_MOBILE?36:72;
 const selected=people.slice(0,maxVisible);
 for(let i=0;i<selected.length;i++){
   const p=selected[i],city=WORLD_CITY_BY_ID.get(p.ct)||countryCapital(p.c);if(!city)continue;
   const x=sx(city.x)+(stableHash01(p.id+'x')-.5)*8,z=sz(city.y)+(stableHash01(p.id+'z')-.5)*8;
   makeTinyCitizen(p,x,z)
 }
}
function updateRegionCitizens(dt,now){
 if(!regionViewActive)return;
 for(const g of regionCitizenMeshes){
   const ph=g.userData.phase||0;
   g.position.x+=Math.sin(now*.0005+ph)*dt*.45;g.position.z+=Math.cos(now*.00045+ph)*dt*.45;g.rotation.y+=Math.sin(now*.0007+ph)*dt*.08
 }
}
function refreshRegionObserverPanel(){
 if(!regionViewActive)return;
 const countries=[...new Set(WORLD_DATA.cities.filter(c=>c.region===regionViewName).map(c=>c.country))];
 const box=$('observerRegionPanel');box.classList.remove('hidden');$('orpTitle').textContent=`${regionViewName} · 관찰자`;
 $('orpStats').innerHTML=countries.map(n=>{const c=state.world.countries[n];return `<span><b>${n}</b><br>${c.population}명 · ${c.stage}<br>식량 ${Math.round(c.food)} / 기술 ${Math.round(c.tech)}<br>군사 ${Math.round(c.military)} / 도시 ${c.settlements||1}</span>`}).join('');
 const ev=countries.flatMap(n=>(state.world.countries[n].events||[]).slice(0,3).map(e=>({n,...e}))).sort((a,b)=>b.y-a.y).slice(0,10);
 $('orpEvents').innerHTML=ev.map(e=>`<div><b>${e.y}년 · ${e.n}</b><br>${e.t}</div>`).join('')
}

function buildRegional3DMap(name){
 disposeRegionView();const style=regionStyle(name),cities=WORLD_DATA.cities.filter(c=>c.region===name);
 const xs=cities.map(c=>c.x),ys=cities.map(c=>c.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const sx=x=>(x-(minX+maxX)/2)/Math.max(1,maxX-minX)*170;
 const sz=y=>(y-(minY+maxY)/2)/Math.max(1,maxY-minY)*120;
 regionMapTransform={sx,sz,cities,minX,maxX,minY,maxY};

 // Main terrain or sea.
 const planeMat=new THREE.MeshStandardMaterial({color:style.kind==='islands'||style.kind==='volcanic'?style.water:style.ground,roughness:1});
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(210,155),planeMat);plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;regionViewGroup.add(plane);regionWalkPlane=plane;

 // Geography per region.
 if(style.kind==='plain'){
   const riverMat=new THREE.MeshStandardMaterial({color:style.water,roughness:.55});
   const river=new THREE.Mesh(new THREE.BoxGeometry(7,.08,150),riverMat);river.position.set(18,.05,0);river.rotation.y=.16;regionViewGroup.add(river);
   for(let i=0;i<22;i++)if(i%3)regionTree(-82+(i*17)%150,-55+(i*31)%105,.7)
 }else if(style.kind==='forest'){
   for(let i=0;i<58;i++)regionTree(-90+(seededNoise(700+i)*180),-65+(seededNoise(900+i)*130),.55+seededNoise(1100+i)*.7)
   const stream=new THREE.Mesh(new THREE.BoxGeometry(4,.08,155),new THREE.MeshStandardMaterial({color:style.water,roughness:.5}));stream.rotation.x=0;stream.rotation.z=0;stream.rotation.y=-.25;stream.position.set(-12,.05,0);regionViewGroup.add(stream)
 }else if(style.kind==='mountain'){
   for(let i=0;i<27;i++)regionMountain(-88+i*7,-48+Math.sin(i*.7)*28,.7+seededNoise(1300+i)*.65,false)
   const lake=new THREE.Mesh(new THREE.CylinderGeometry(12,15,.08,24),new THREE.MeshStandardMaterial({color:style.water,roughness:.35}));lake.position.set(53,.05,34);regionViewGroup.add(lake)
 }else if(style.kind==='steppe'){
   const lake=new THREE.Mesh(new THREE.CylinderGeometry(19,24,.08,28),new THREE.MeshStandardMaterial({color:style.water,roughness:.3}));lake.scale.z=.65;lake.position.set(35,.05,-16);regionViewGroup.add(lake);
   for(let i=0;i<45;i++){const grass=new THREE.Mesh(new THREE.ConeGeometry(.12,.65,4),new THREE.MeshStandardMaterial({color:0xb0a65c,roughness:1}));grass.position.set(-95+seededNoise(1500+i)*190,.33,-67+seededNoise(1700+i)*134);regionViewGroup.add(grass)}
 }else if(style.kind==='desert'){
   for(let i=0;i<28;i++){const dune=new THREE.Mesh(new THREE.SphereGeometry(2.8+seededNoise(1900+i)*3,8,5),new THREE.MeshStandardMaterial({color:i%2?0xc4a365:0xaa874e,roughness:1}));dune.scale.set(2.1,.24,1);dune.position.set(-92+seededNoise(2000+i)*184,.25,-64+seededNoise(2100+i)*128);regionViewGroup.add(dune)}
   const oasis=new THREE.Mesh(new THREE.CylinderGeometry(7,9,.08,22),new THREE.MeshStandardMaterial({color:style.water,roughness:.25}));oasis.position.set(-28,.05,22);regionViewGroup.add(oasis)
 }else if(style.kind==='islands'||style.kind==='volcanic'){
   for(let i=0;i<cities.length;i++){
     const c=cities[i],x=sx(c.x),z=sz(c.y),r=4.2+seededNoise(2400+i)*5.8;
     const isl=new THREE.Mesh(new THREE.CylinderGeometry(r*.82,r,1.2,10),new THREE.MeshStandardMaterial({color:style.kind==='volcanic'?0x655346:0x6d895c,roughness:1}));isl.position.set(x,.55,z);regionViewGroup.add(isl);
     if(style.kind==='volcanic'&&i%3===0)regionMountain(x,z,0.7+seededNoise(2600+i)*.55,true);
     else if(i%2===0)regionTree(x+1.3,z-.8,.55)
   }
 }

 // Cities preserve canonical relative positions.
 cities.forEach((c,i)=>{regionCityMarker(c,sx(c.x),sz(c.y),i===0);const cc=state.world.countries[c.country];if(cc&&state.world.foundedCities.includes(c.id))decorateGrowingSettlement(c.country,c,sx(c.x),sz(c.y))});
 populateRegionObservers(name,sx,sz);
 regionLabel(name,0,-70,5.3);
}

function nearestRegionCity(x,z){
 if(!regionMapTransform)return null;
 let best=null,bd=Infinity;
 for(const c of regionMapTransform.cities){
   const cx=regionMapTransform.sx(c.x),cz=regionMapTransform.sz(c.y),d=Math.hypot(x-cx,z-cz);
   if(d<bd){bd=d;best=c}
 }
 return best
}
function observerSpawnFor(country,cityId){
 if(!regionMapTransform)return new THREE.Vector3(0,0,0);
 let city=cityId?WORLD_CITY_BY_ID.get(cityId):null;
 if(!city||city.region!==regionViewName){
   const cs=regionMapTransform.cities.filter(c=>!country||c.country===country);
   city=cs[0]||regionMapTransform.cities[0]
 }
 if(!city)return new THREE.Vector3(0,0,0);
 return new THREE.Vector3(regionMapTransform.sx(city.x)+2.5,0,regionMapTransform.sz(city.y)+2.5)
}
function spawnRegionObserver(country=null,cityId=null){
 regionVisitCountry=country;regionVisitCityId=cityId;
 regionObserver=createRegionObserver();regionViewGroup.add(regionObserver);
 const p=observerSpawnFor(country,cityId);regionObserver.position.copy(p);regionObserverTarget=p.clone();
 regionObserver.userData.target.copy(p);regionObserver.userData.moving=false;
 const city=nearestRegionCity(p.x,p.z);
 if(!regionVisitCountry)regionVisitCountry=city?.country||null;
 updatePlayerLocationHud(true)
}
function moveRegionObserverTo(v){
 if(!regionObserver)return;
 const p=v.clone();p.x=clamp(p.x,-101,101);p.z=clamp(p.z,-74,74);p.y=0;
 regionObserverTarget=p;regionObserver.userData.target.copy(p);regionObserver.userData.moving=true;
 camMode='follow';autoFocus.copy(regionObserver.position)
}
function updateRegionObserver(dt,now){
 if(!regionViewActive||!regionObserver)return;
 let d=null;
 if(manualMove.active){
   const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;
   if(forward.lengthSq()<.001)forward.set(0,0,-1);forward.normalize();
   const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
   d=forward.multiplyScalar(manualMove.y).add(right.multiplyScalar(manualMove.x));
   if(d.length()>.04){d.normalize();regionObserver.userData.moving=false}
 }else if(regionObserver.userData.moving){
   d=regionObserver.userData.target.clone().sub(regionObserver.position);d.y=0;
   if(d.length()<.35){regionObserver.userData.moving=false;d=null}else d.normalize()
 }
 if(d){
   const sp=6.3;regionObserver.position.addScaledVector(d,sp*dt);
   regionObserver.position.x=clamp(regionObserver.position.x,-101,101);regionObserver.position.z=clamp(regionObserver.position.z,-74,74);
   regionObserver.rotation.y=Math.atan2(d.x,d.z);
   camMode='follow'
 }
 updatePlayerLocationHud()
}
function enterCountryView(country,cityId=null){
 const city=cityId?WORLD_CITY_BY_ID.get(cityId):countryCapital(country);
 if(!city)return;
 enterRegionView(city.region,{country,cityId:city.id,travel:true})
}

function enterRegionView(name,opts={}){
 if(!name)return;regionViewActive=true;regionViewName=name;regionVisitCountry=opts.country||null;regionVisitCityId=opts.cityId||null;
 regionHiddenState=[];
 for(const child of scene.children){
   if(child===regionViewGroup||child.isLight)continue;
   regionHiddenState.push([child,child.visible]);child.visible=false
 }
 buildRegional3DMap(name);regionViewGroup.visible=true;spawnRegionObserver(regionVisitCountry,regionVisitCityId);
 $('worldMapOverlay').classList.add('hidden');$('regionViewHud').classList.remove('hidden');document.body.classList.add('region-view');
 const city=nearestRegionCity(regionObserver.position.x,regionObserver.position.z);
 $('regionViewTitle').textContent=regionVisitCountry?`${regionVisitCountry} · ${name}`:name;refreshRegionObserverPanel();
 const meta=WORLD_DATA.regions.find(r=>r.name===name),count=WORLD_DATA.cities.filter(c=>c.region===name).length;
 $('regionViewSub').textContent=`${city?city.name+' · ':''}${meta?.desc||'지역'} · 관찰자 직접 이동 · 주민 접촉에는 영향 없음`;
 camMode='follow';autoFocus.copy(regionObserver.position);yaw=.72;pitch=.70;distance=30;resizeWorld(true);updatePlayerLocationHud(true)
}
function exitRegionView(){
 if(!regionViewActive)return;regionViewActive=false;regionViewGroup.visible=false;
 for(const[child,visible]of regionHiddenState)child.visible=visible;regionHiddenState=[];
 document.body.classList.remove('region-view');$('regionViewHud').classList.add('hidden');$('observerRegionPanel').classList.add('hidden');
 regionVisitCountry=null;regionVisitCityId=null;resetPlayerCamera();resizeWorld(true);updatePlayerLocationHud(true)
}
$('orpClose').onclick=()=>$('observerRegionPanel').classList.add('hidden');
$('regionLaenBtn').onclick=()=>exitRegionView();
$('regionWorldMapBtn').onclick=()=>{exitRegionView();worldMapUI.open()};

const worldMapUI=new CivitasWorldMap({
 overlay:$('worldMapOverlay'),canvas:$('worldMapCanvas'),detail:$('worldMapDetail'),
 legend:$('worldMapLegend'),status:$('worldMapStatus'),countryList:$('worldCountryList'),
 getState:()=>state,data:WORLD_DATA,onClose:()=>{},
 onOpenRegion:(name)=>enterRegionView(name),
 onTravelCountry:(name)=>enterCountryView(name),
 onTravelCity:(city)=>enterCountryView(city.country,city.id),
 onTravelRegion:(name)=>enterRegionView(name,{travel:true})
});
$('worldMapBtn').onclick=()=>worldMapUI.open();
$('mobileWorldMapBtn')?.addEventListener('click',()=>worldMapUI.open());
$('homeGuideBtn')?.addEventListener('click',()=>setHomeWaypoint(true));

$('locateMeBtn')?.addEventListener('click',()=>{
 if(regionViewActive&&regionObserver){
   camMode='follow';autoFocus.copy(regionObserver.position);updatePlayerLocationHud(true);
   const c=nearestRegionCity(regionObserver.position.x,regionObserver.position.z);
   showEvent(`📍 ${regionVisitCountry||regionViewName}${c?' · '+c.name:''}`);return
 }
 followId='PLAYER';if($('followSelect'))$('followSelect').value='PLAYER';setCameraMode('follow');updatePlayerLocationHud(true);
 const d=Math.hypot(player.position.x,player.position.z);showEvent(`📍 ${mainPlaceName()} · 감나무뜰 ${Math.round(d)}m`)
});
$('navCancelBtn')?.addEventListener('click',()=>{navWaypoint=null;$('navHud')?.classList.add('hidden')});

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
   txt.textContent=`v9.6 · ${name}: ${String(err?.message||err).slice(0,100)}`;
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
 guarded('복실이후손',()=>updateDogLineage(dt,now));
 guarded('지형스트리밍',()=>{if(now-lastStreamUpdate>450){streamTerrainAroundPlayer();lastStreamUpdate=now}});
 guarded('현재위치',()=>updatePlayerLocationHud());
 guarded('일반동물',()=>updateAnimals(dt,now));
 guarded('지역관찰AI',()=>updateRegionCitizens(dt,now));
 guarded('관찰자현지이동',()=>updateRegionObserver(dt,now));
 guarded('습격·전쟁',()=>updateConflictSystem(dt,now));
 guarded('몬스터',()=>updateMonsters(dt,now));
 guarded('불빛',()=>{flame.scale.y=.88+Math.sin(now*.012)*.14;fireLight.intensity=14+Math.sin(now*.02)*3});
 guarded('미니맵',()=>drawMini());
 guarded('길찾기',()=>updateNavHud());

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
