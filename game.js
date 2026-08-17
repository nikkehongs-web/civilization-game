import * as THREE from 'three';

const STORAGE_KEY = 'civilization_rebirth_world0_v1';
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

const ui={
  game:$('game'),worldDate:$('worldDate'),questTitle:$('questTitle'),questText:$('questText'),questStep:$('questStep'),questDistance:$('questDistance'),
  playerState:$('playerState'),autoStatus:$('autoStatus'),autoTask:$('autoTask'),targetHint:$('targetHint'),dialogue:$('dialogue'),speakerName:$('speakerName'),
  speakerRole:$('speakerRole'),speakerAvatar:$('speakerAvatar'),dialogueText:$('dialogueText'),choices:$('choices'),eventToast:$('eventToast'),menu:$('menu')
};

function freshState(){return {day:1,year:0,auto:'manual',quest:'meet_myeongja',questStage:0,player:{x:0,z:18,yaw:0},flags:{metMyeongja:false,firePlan:false},history:[]}}
let state;
try{state=JSON.parse(localStorage.getItem(STORAGE_KEY))||freshState()}catch{state=freshState()}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8cae9a);
scene.fog=new THREE.FogExp2(0x9bb5a7,.012);

const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,700);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
ui.game.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd6f0e1,0x5d4a34,1.9));
const sun=new THREE.DirectionalLight(0xffedc2,2.5);sun.position.set(-25,38,-18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;scene.add(sun);

const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,260,1,1),new THREE.MeshStandardMaterial({color:0x6f8b58,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

function addHill(x,z,sx,sz,h,color=0x5f7850){const g=new THREE.SphereGeometry(1,24,12);const m=new THREE.MeshStandardMaterial({color,roughness:1});const hill=new THREE.Mesh(g,m);hill.scale.set(sx,h,sz);hill.position.set(x,-.4,z);hill.receiveShadow=true;scene.add(hill)}
addHill(-50,-30,38,28,8);addHill(55,-42,45,25,10);addHill(-70,55,50,35,8);addHill(72,52,40,30,7);

function tree(x,z,s=.9){const group=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.32,2.2,7),new THREE.MeshStandardMaterial({color:0x5b412e,roughness:1}));trunk.position.y=1.1;trunk.castShadow=true;const crown=new THREE.Mesh(new THREE.ConeGeometry(1.35,3.3,8),new THREE.MeshStandardMaterial({color:0x365d3e,roughness:1}));crown.position.y=3.2;crown.castShadow=true;group.add(trunk,crown);group.position.set(x,0,z);group.scale.setScalar(s);scene.add(group);return group}
for(let i=0;i<90;i++){const a=Math.random()*Math.PI*2,r=38+Math.random()*75;tree(Math.cos(a)*r+Math.sin(i)*7,Math.sin(a)*r,0.65+Math.random()*.7)}

function hut(x,z,rot=0){const g=new THREE.Group();const walls=new THREE.Mesh(new THREE.BoxGeometry(5,2.7,4),new THREE.MeshStandardMaterial({color:0x92704e,roughness:1}));walls.position.y=1.35;walls.castShadow=true;walls.receiveShadow=true;const roof=new THREE.Mesh(new THREE.ConeGeometry(4.1,2.2,4),new THREE.MeshStandardMaterial({color:0x4d3b2a,roughness:1}));roof.rotation.y=Math.PI/4;roof.position.y=3.55;roof.scale.z=.78;roof.castShadow=true;g.add(walls,roof);g.position.set(x,0,z);g.rotation.y=rot;scene.add(g)}
[[-13,-8,.3],[12,-10,-.4],[-20,9,-.2],[20,8,.45],[-6,19,.1],[9,21,-.2]].forEach(a=>hut(...a));

const fireGroup=new THREE.Group();
for(let i=0;i<7;i++){const log=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,2.2,7),new THREE.MeshStandardMaterial({color:0x4d3523}));log.rotation.z=Math.PI/2;log.rotation.y=i*.85;log.position.y=.16;fireGroup.add(log)}
const flame=new THREE.Mesh(new THREE.ConeGeometry(.5,1.5,10),new THREE.MeshStandardMaterial({color:0xff9e43,emissive:0xff6f1a,emissiveIntensity:2.5}));flame.position.y=.95;fireGroup.add(flame);fireGroup.position.set(0,0,-2);scene.add(fireGroup);
const fireLight=new THREE.PointLight(0xff8b3d,18,16,2);fireLight.position.set(0,2,-2);scene.add(fireLight);

function makePerson({name,role,x,z,color=0xbba57f,important=false}){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,1.15,6,10),new THREE.MeshStandardMaterial({color,roughness:.9}));body.position.y=1.1;body.castShadow=true;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.34,16,10),new THREE.MeshStandardMaterial({color:0xd7b28b,roughness:1}));head.position.y=2.03;head.castShadow=true;g.add(head);if(important){const ring=new THREE.Mesh(new THREE.TorusGeometry(.54,.045,8,24),new THREE.MeshBasicMaterial({color:0xf2d98f}));ring.rotation.x=Math.PI/2;ring.position.y=.08;g.add(ring)}g.position.set(x,0,z);g.userData={name,role,important,home:new THREE.Vector3(x,0,z),phase:Math.random()*10};scene.add(g);return g}
const npcs=[
 makePerson({name:'이명자',role:'조언자',x:2,z:-5,color:0x785f45,important:true}),
 makePerson({name:'마루',role:'사냥과 경계',x:-6,z:-3,color:0x526d53}),
 makePerson({name:'하루',role:'호기심 많은 청년',x:7,z:1,color:0x716a4d}),
 makePerson({name:'온새',role:'돌봄 담당',x:-2,z:7,color:0x7e6b64}),
 makePerson({name:'나래',role:'채집 담당',x:9,z:9,color:0x6f7353}),
 makePerson({name:'해온',role:'도구 제작',x:-12,z:8,color:0x5c6870})
];
const myeongja=npcs[0];

function makePlayer(){const g=new THREE.Group();const cloak=new THREE.Mesh(new THREE.CapsuleGeometry(.48,1.35,7,12),new THREE.MeshStandardMaterial({color:0x263d38,roughness:.85,metalness:.05}));cloak.position.y=1.2;cloak.castShadow=true;g.add(cloak);const head=new THREE.Mesh(new THREE.SphereGeometry(.36,18,12),new THREE.MeshStandardMaterial({color:0xd7b089,roughness:1}));head.position.y=2.18;head.castShadow=true;g.add(head);const marker=new THREE.Mesh(new THREE.RingGeometry(.55,.62,28),new THREE.MeshBasicMaterial({color:0x8ce1ac,side:THREE.DoubleSide,transparent:true,opacity:.75}));marker.rotation.x=-Math.PI/2;marker.position.y=.03;g.add(marker);scene.add(g);return g}
const player=makePlayer();player.position.set(state.player.x||0,0,state.player.z||18);player.rotation.y=state.player.yaw||0;

const keys=new Set();let sprint=false;let cameraYaw=0,cameraPitch=.28;let drag=false,lastX=0,lastY=0;let nearNpc=null;let joy={x:0,y:0};let autoMode=state.auto||'manual';let autoTarget=null;

addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(e.key.toLowerCase()==='e')interact();if(e.key==='Shift')sprint=true});
addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key==='Shift')sprint=false});
renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){drag=true;lastX=e.clientX;lastY=e.clientY}});
addEventListener('pointermove',e=>{if(!drag)return;cameraYaw-=(e.clientX-lastX)*.005;cameraPitch=clamp(cameraPitch-(e.clientY-lastY)*.004,-.1,.8);lastX=e.clientX;lastY=e.clientY});
addEventListener('pointerup',()=>drag=false);

const joystick=$('joystick'),stick=$('stick');let joyId=null;
function updateJoy(e){const r=joystick.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.32,mag=Math.hypot(dx,dy)||1;if(mag>max){dx=dx/mag*max;dy=dy/mag*max}stick.style.transform=`translate(${dx}px,${dy}px)`;joy.x=dx/max;joy.y=dy/max}
joystick.addEventListener('pointerdown',e=>{joyId=e.pointerId;joystick.setPointerCapture(e.pointerId);updateJoy(e)});
joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyId)updateJoy(e)});
joystick.addEventListener('pointerup',e=>{if(e.pointerId!==joyId)return;joyId=null;joy.x=joy.y=0;stick.style.transform='translate(0,0)'});
$('runBtn').addEventListener('pointerdown',()=>sprint=true);$('runBtn').addEventListener('pointerup',()=>sprint=false);$('interactBtn').addEventListener('click',interact);$('focusBtn').addEventListener('click',()=>{const v=myeongja.position.clone().sub(player.position);cameraYaw=Math.atan2(v.x,v.z)});

function setAuto(mode){autoMode=mode;state.auto=mode;save();document.querySelectorAll('.auto-btn').forEach(b=>b.classList.toggle('active',b.dataset.auto===mode));
 const labels={manual:['수동','네가 직접 움직입니다.','직접 조작 중'],semi:['반자동','이동·일상은 자동, 중요한 선택은 직접 합니다.','반자동 행동 중'],full:['완전 AUTO','현재 이야기 목표를 스스로 수행합니다.','AUTO 행동 중']};
 ui.autoStatus.textContent=labels[mode][0];ui.autoTask.textContent=labels[mode][1];ui.playerState.textContent=labels[mode][2];
 if(mode!=='manual')pickAutoTarget();else autoTarget=null;
}
document.querySelectorAll('.auto-btn').forEach(b=>b.addEventListener('click',()=>setAuto(b.dataset.auto)));

function pickAutoTarget(){
 if(state.questStage===0)autoTarget=myeongja;
 else if(state.questStage===1)autoTarget={position:new THREE.Vector3(-28,0,-15),userData:{name:'북쪽 숲 가장자리'}};
 else autoTarget=npcs[1+Math.floor(Math.random()*(npcs.length-1))];
}

function interact(){if(ui.dialogue.classList.contains('hidden')===false)return;if(!nearNpc)return toast('조금 더 가까이 가야 합니다.');openNpcDialogue(nearNpc)}
function openNpcDialogue(npc){
 ui.dialogue.classList.remove('hidden');ui.speakerName.textContent=npc.userData.name;ui.speakerRole.textContent=npc.userData.role;ui.speakerAvatar.textContent=npc.userData.name[0];ui.choices.innerHTML='';
 if(npc===myeongja&&state.questStage===0){
  ui.dialogueText.textContent='불씨가 약해지고 있어. 밤까지 버티려면 마른 장작을 더 찾아야 해. 북쪽 숲 가장자리를 확인해보는 게 좋겠어. 네 생각은 어때?';
  choice('내가 직접 다녀오겠습니다.',()=>acceptFireQuest('manual'));
  choice('AUTO로 주변을 확인하겠습니다.',()=>acceptFireQuest('auto'));
  choice('사람들의 의견부터 듣겠습니다.',()=>{closeDialogue();toast('마루와 하루가 북쪽 숲 이야기를 나누기 시작했습니다.')});
 }else{
  const lines={마루:'숲 안쪽은 아직 아무도 제대로 본 적이 없어. 발자국도 이상하고.',하루:'검게 그을린 나무가 비를 덜 먹는 것 같아. 더 확인해보고 싶어.',온새:'아이들이 추워해. 불만 살아 있으면 오늘 밤은 버틸 수 있어.',나래:'먹을 수 있는 열매가 어디에 나는지 조금씩 지도를 만들고 있어.',해온:'좋은 돌이 더 있으면 날이 훨씬 단단한 도구를 만들 수 있을 텐데.'};
  ui.dialogueText.textContent=lines[npc.userData.name]||'지금은 각자 할 일을 하고 있습니다.';choice('대화를 마친다',closeDialogue)
 }
}
function choice(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;ui.choices.appendChild(b)}
function closeDialogue(){ui.dialogue.classList.add('hidden')}
function acceptFireQuest(mode){state.flags.metMyeongja=true;state.questStage=1;state.history.push({day:1,text:'이명자와 첫 대화를 나누고 마른 장작을 찾기로 했다.'});closeDialogue();setAuto(mode==='auto'?'semi':'manual');updateQuest();toast('새 목표: 북쪽 숲 가장자리를 조사하십시오.');save()}

function completeForestDiscovery(){if(state.questStage!==1)return;state.questStage=2;state.flags.firePlan=true;state.history.push({day:1,text:'북쪽 숲 가장자리에서 비를 덜 맞은 마른 목재를 발견했다.'});toast('발견: 쓰러진 나무 아래에서 마른 목재를 찾았습니다.');updateQuest();if(autoMode==='full'||autoMode==='semi')autoTarget=myeongja;save()}

function updateQuest(){
 if(state.questStage===0){ui.questTitle.textContent='불씨를 지켜라';ui.questText.textContent='이명자가 마을 중앙의 꺼져가는 불 앞에서 사람들을 모으고 있다.';ui.questStep.textContent='이명자에게 가기'}
 else if(state.questStage===1){ui.questTitle.textContent='북쪽 숲의 마른 장작';ui.questText.textContent='비를 덜 맞은 쓰러진 나무가 있다는 하루의 말을 확인해야 한다.';ui.questStep.textContent='북쪽 숲 가장자리 조사'}
 else{ui.questTitle.textContent='첫 발견';ui.questText.textContent='마른 목재를 확보했다. 이 발견이 마을의 첫 저장·건조 지식으로 이어질 수 있다.';ui.questStep.textContent='이명자에게 돌아가기'}
}

function toast(msg){ui.eventToast.textContent=msg;ui.eventToast.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>ui.eventToast.classList.add('hidden'),3000)}

function updateMovement(dt){let x=0,z=0;if(autoMode==='manual'){if(keys.has('w'))z-=1;if(keys.has('s'))z+=1;if(keys.has('a'))x-=1;if(keys.has('d'))x+=1;x+=joy.x;z+=joy.y}else if(autoTarget){const delta=autoTarget.position.clone().sub(player.position);delta.y=0;const d=delta.length();if(d>2.2){delta.normalize();x=delta.x;z=delta.z}else{if(state.questStage===0&&autoTarget===myeongja){nearNpc=myeongja;openNpcDialogue(myeongja);setAuto('manual')}else if(state.questStage===1){completeForestDiscovery();if(autoMode==='semi')setAuto('manual');else pickAutoTarget()}else{pickAutoTarget()}}}
 const len=Math.hypot(x,z);if(len>.05){x/=Math.max(1,len);z/=Math.max(1,len);const speed=sprint?7.8:4.4;const cos=Math.cos(cameraYaw),sin=Math.sin(cameraYaw);const wx=x*cos-z*sin,wz=x*sin+z*cos;player.position.x+=wx*speed*dt;player.position.z+=wz*speed*dt;player.position.x=clamp(player.position.x,-108,108);player.position.z=clamp(player.position.z,-108,108);const yaw=Math.atan2(wx,wz);player.rotation.y=lerpAngle(player.rotation.y,yaw,Math.min(1,dt*10));}
 if(state.questStage===1&&player.position.distanceTo(new THREE.Vector3(-28,0,-15))<4.5)completeForestDiscovery();
}
function lerpAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;return a+d*t}

function updateNPCs(t){npcs.forEach((n,i)=>{if(n===myeongja)return;const p=n.userData.home;n.position.x=p.x+Math.sin(t*.00035+n.userData.phase)*1.2;n.position.z=p.z+Math.cos(t*.00029+n.userData.phase)*1.1;n.rotation.y+=Math.sin(t*.0008+i)*.002})}
function updateInteraction(){let best=null,dist=Infinity;npcs.forEach(n=>{const d=n.position.distanceTo(player.position);if(d<dist){dist=d;best=n}});nearNpc=dist<3.4?best:null;ui.targetHint.classList.toggle('show',!!nearNpc);if(nearNpc)ui.targetHint.textContent=`${nearNpc.userData.name} · E 또는 대화`;const target=state.questStage===0?myeongja.position:state.questStage===1?new THREE.Vector3(-28,0,-15):myeongja.position;ui.questDistance.textContent=`${Math.round(player.position.distanceTo(target))}m`}
function updateCamera(){const dist=8.5;const target=player.position.clone().add(new THREE.Vector3(0,1.5,0));const cp=Math.cos(cameraPitch),sp=Math.sin(cameraPitch);const offset=new THREE.Vector3(Math.sin(cameraYaw)*cp*dist,2.8+sp*dist,Math.cos(cameraYaw)*cp*dist);camera.position.lerp(target.clone().add(offset),.12);camera.lookAt(target)}

let last=performance.now();
function loop(now){const dt=Math.min(.035,(now-last)/1000);last=now;updateMovement(dt);updateNPCs(now);updateInteraction();updateCamera();flame.scale.y=.85+Math.sin(now*.012)*.12;fireLight.intensity=15+Math.sin(now*.02)*3;renderer.render(scene,camera);requestAnimationFrame(loop)}
requestAnimationFrame(loop);

setInterval(()=>{state.player={x:+player.position.x.toFixed(2),z:+player.position.z.toFixed(2),yaw:+player.rotation.y.toFixed(3)};save()},3000);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

$('menuBtn').onclick=()=>ui.menu.classList.remove('hidden');$('closeMenu').onclick=()=>ui.menu.classList.add('hidden');$('cameraBtn').onclick=()=>{cameraYaw+=Math.PI;toast('카메라 방향을 전환했습니다.')};$('resetBtn').onclick=()=>{if(confirm('세계력 0년 1일로 완전히 초기화할까요?')){localStorage.removeItem(STORAGE_KEY);location.reload()}};
ui.dialogue.addEventListener('click',e=>{if(e.target===ui.dialogue)closeDialogue()});

updateQuest();setAuto(autoMode);
toast('세계력 0년 1일 · 당신이 감나무뜰에 도착했습니다.');
