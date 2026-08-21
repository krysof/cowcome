import * as THREE from 'three';
import {t as tr,initI18n,setLanguage,currentLanguage,locales,languageOrder} from './i18n.js';

initI18n();

// 数值模拟由独立 WebAssembly 核心执行；网络或旧浏览器失败时保留等价回退。
let gameCore={
  movement_speed:(sprint,exhausted)=>sprint?15:(exhausted?3.15:9),
  update_stamina:(value,dt,moving,wants,exhausted,sprint)=>sprint?Math.max(0,value-29*dt):(!exhausted||!wants?Math.min(100,value+(moving?10:18)*dt):value),
  enemy_time_boost:(time,car)=>Math.min(car?2.4:3.8,time*(car?.032:.052)),
  rank_score:(escaped,distance,time)=>escaped?1000000000-time:distance*100000+Math.min(time,99999)
};
fetch(`${import.meta.env.BASE_URL}game-core.wasm`).then(async response=>{
  const loaded=await WebAssembly.instantiateStreaming(response.clone()).catch(()=>WebAssembly.instantiate(response.arrayBuffer()));
  gameCore={...gameCore,...loaded.instance.exports};
}).catch(()=>{});

const canvas = document.querySelector('#game');
const dangerAudio=new Audio(`${import.meta.env.BASE_URL}audio/enemy-near.mp3`);dangerAudio.preload='auto';dangerAudio.volume=.95;dangerAudio.setAttribute('playsinline','');dangerAudio.setAttribute('webkit-playsinline','');
const titleCryAudio=new Audio(`${import.meta.env.BASE_URL}audio/enemy-near.mp3`);titleCryAudio.preload='auto';titleCryAudio.volume=1;titleCryAudio.setAttribute('playsinline','');titleCryAudio.setAttribute('webkit-playsinline','');
let dangerLatched=false,audioUnlocked=false;
const ui = {
  intro: document.querySelector('#intro'), result: document.querySelector('#result'),
  distance: document.querySelector('#distance'), stamina: document.querySelector('#staminaBar'),
  hearts: document.querySelector('#hearts'),
  subtitle: document.querySelector('#subtitle'), warning: document.querySelector('#warning'),
  mission: document.querySelector('#missionText'), title: document.querySelector('#resultTitle'),
  resultText: document.querySelector('#resultText'), eyebrow: document.querySelector('#resultEyebrow')
};
const chapterBanner=document.querySelector('#chapterBanner'),chapterNumber=document.querySelector('#chapterNumber'),chapterTitle=document.querySelector('#chapterTitle'),chapterDescription=document.querySelector('#chapterDescription'),npcBubbles=document.querySelector('#npcBubbles');
const scoreboard=document.querySelector('#scoreboard'),scoreList=document.querySelector('#scoreList');
const installHint=document.querySelector('#installHint'),installText=document.querySelector('#installText'),installBtn=document.querySelector('#installBtn');let deferredInstallPrompt=null;
const languagePicker=document.querySelector('#languagePicker'),languageBtn=document.querySelector('#languageBtn'),languageMenu=document.querySelector('#languageMenu'),languageCurrent=document.querySelector('#languageCurrent');
document.querySelector('#languageOptions').innerHTML=languageOrder.map(code=>`<button role="menuitemradio" data-language="${code}"><i>✓</i><span>${locales[code].nativeName}</span></button>`).join('');
function refreshLanguageMenu(){const {choice}=currentLanguage();languageCurrent.textContent=choice==='auto'?tr('language.auto'):locales[choice].nativeName;languageMenu.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.language===choice)));}
function toggleLanguageMenu(force){const open=force??languageMenu.hidden;languageMenu.hidden=!open;languageBtn.setAttribute('aria-expanded',String(open));if(open)languageMenu.querySelector('[aria-checked="true"]')?.focus();}
languageBtn.onclick=()=>toggleLanguageMenu();languageMenu.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{setLanguage(button.dataset.language);refreshLanguageMenu();toggleLanguageMenu(false);languageBtn.focus();});
languageMenu.addEventListener('keydown',event=>{const buttons=[...languageMenu.querySelectorAll('[data-language]')],index=buttons.indexOf(document.activeElement);if(event.key==='Escape'){toggleLanguageMenu(false);languageBtn.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
document.addEventListener('pointerdown',event=>{if(!languagePicker.contains(event.target))toggleLanguageMenu(false);});refreshLanguageMenu();
addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;installBtn.classList.add('available');});
const characterKeys={orange:'character.orangeFull',yellow:'character.yellowFull',leopard:'character.leopardFull'};
const difficultyKeys={orange:'character.easy',yellow:'character.normal',leopard:'character.hard'};
function formatTime(ms){const min=Math.floor(ms/60000),sec=Math.floor((ms%60000)/1000),milli=ms%1000;return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(milli).padStart(3,'0')}`;}
function readScores(){try{return JSON.parse(localStorage.getItem('niulai-highscores')||'[]')}catch{return[]}}
function renderScores(){
  const scores=readScores();scoreList.innerHTML=scores.length?scores.map(s=>`<li><div><b>${tr(characterKeys[s.character]||'character.niulai')}</b><small>${tr(difficultyKeys[s.character]||'character.easy')} · ${tr(s.win?'scores.escaped':'scores.caught')} · ${tr('scores.meter',{distance:s.distance})}</small></div><strong>${formatTime(s.time)}</strong></li>`).join(''):`<li class="empty">${tr('scores.empty')}</li>`;
}
function recordScore(win){
  const entry={win,character:selectedCharacter,distance:Math.max(0,Math.min(runLength,Math.round(18-player.position.z))),time:Math.max(0,Math.round(elapsed*1000)),date:Date.now()};entry.score=gameCore.rank_score(win?1:0,entry.distance,entry.time);
  const scoreOf=s=>Number.isFinite(s.score)?s.score:gameCore.rank_score(s.win?1:0,s.distance,s.time);
  const scores=[...readScores(),entry].sort((a,b)=>scoreOf(b)-scoreOf(a)).slice(0,5);
  try{localStorage.setItem('niulai-highscores',JSON.stringify(scores))}catch{}renderScores();
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c98a);
scene.fog = new THREE.FogExp2(0xa7b886, 0.018);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .1, 900);
const mobileDevice=matchMedia('(max-width:700px), (pointer:coarse)').matches,lowMemory=Number(navigator.deviceMemory||8)<=4;
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
// 手机不再固定在 1.5 倍：高端机使用 2.25 倍，低内存机也保留 1.8 倍，避免微信里发糊。
renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobileDevice?(lowMemory?1.8:2.25):1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xf5f0cf, 0x343b26, 2.1));
const sun = new THREE.DirectionalLight(0xffe9a8, 3.2);
sun.position.set(-30, 55, 25); sun.castShadow = true;
sun.shadow.camera.left=-30; sun.shadow.camera.right=30; sun.shadow.camera.top=30; sun.shadow.camera.bottom=-30;
sun.shadow.mapSize.set(1024,1024); scene.add(sun);
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6,10,8),new THREE.MeshBasicMaterial({color:0xff5835}));
sunBall.position.set(-48,30,-100); scene.add(sunBall);

const flat = (color) => new THREE.MeshStandardMaterial({color,flatShading:true,roughness:1});
const WORLD_DEPTH=5000;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140,WORLD_DEPTH+160,12,260), flat(0x6e7e47));
ground.rotation.x=-Math.PI/2; ground.position.z=-(WORLD_DEPTH-40)/2; ground.receiveShadow=true;
const pos=ground.geometry.attributes.position;
for(let i=0;i<pos.count;i++){ const x=pos.getX(i),y=pos.getY(i); pos.setZ(i,Math.sin(x*.23)*.5+Math.sin(y*.08)*.7+Math.random()*.25); }
ground.geometry.computeVertexNormals(); scene.add(ground);

function mesh(geo,mat,parent,x,y,z,scale=[1,1,1],rot=[0,0,0]){
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(...scale);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function tuft(parent,mat,x,y,z,s=.18,rot=0){return mesh(new THREE.ConeGeometry(s,s*2.4,4),mat,parent,x,y,z,[1,1,1],[0,0,rot]);}

// 有实际高度的草层：单一 InstancedMesh 保持手机性能，同时让角色真正穿过草而不是贴图地板。
function makeGrassGeometry(){const vertices=[];for(let i=0;i<3;i++){const a=i*Math.PI/3,px=Math.cos(a)*.085,pz=Math.sin(a)*.085,lx=Math.cos(a+Math.PI/2)*.12,lz=Math.sin(a+Math.PI/2)*.12;vertices.push(-px,0,-pz,px,0,pz,lx,1,lz);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;}
const grassCount=innerWidth<700?32000:56000,grassGeo=makeGrassGeometry(),grassMat=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1,side:THREE.DoubleSide});
const grassField=new THREE.InstancedMesh(grassGeo,grassMat,grassCount),grassDummy=new THREE.Object3D(),grassColor=new THREE.Color();
for(let i=0;i<grassCount;i++){
  const x=(Math.random()-.5)*134,z=24-Math.random()*WORLD_DEPTH,path=Math.abs(x)<7,h=(path?.52:.7)+Math.random()*(path?.62:1.15),w=.65+Math.random()*.85;
  grassDummy.position.set(x,.015,z);grassDummy.rotation.set((Math.random()-.5)*.16,Math.random()*Math.PI,(Math.random()-.5)*.28);grassDummy.scale.set(w,h,w);grassDummy.updateMatrix();grassField.setMatrixAt(i,grassDummy.matrix);
  grassColor.setHex(Math.random()>.72?0x78804d:Math.random()>.55?0x425b38:0x566d3d);grassField.setColorAt(i,grassColor);
}
grassField.instanceMatrix.setUsage(THREE.StaticDrawUsage);grassField.receiveShadow=true;grassField.castShadow=false;grassField.computeBoundingSphere();scene.add(grassField);

// 低矮起伏、湿地水洼和土色斑块，打破一整张平面的感觉。
const hillMat=flat(0x52653e),mudMat=flat(0x4b4432),puddleMat=new THREE.MeshStandardMaterial({color:0x273f39,roughness:.28,metalness:.18,transparent:true,opacity:.72});
for(let i=0;i<110;i++){
  const side=i%2?1:-1,x=side*(25+Math.random()*35),z=18-i*44-Math.random()*22;
  mesh(new THREE.SphereGeometry(1,8,5),hillMat,scene,x,-1.1,z,[7+Math.random()*8,2+Math.random()*2.7,9+Math.random()*13]);
}
for(let i=0;i<95;i++){
  const x=(Math.random()-.5)*42,z=-18-i*51-Math.random()*18,rx=1.3+Math.random()*3.2,rz=.7+Math.random()*1.5;
  mesh(new THREE.CircleGeometry(1,10),i%3?puddleMat:mudMat,scene,x,.035,z,[rx,rz,1],[-Math.PI/2,0,Math.random()*Math.PI]);
}

const obstacles=[];
// 废弃隔离区：锈蚀铁网、路障和忽明忽暗的红色警示灯，让草原逐渐变成“里世界”。
const rustMat=flat(0x4b2d24),wireMat=new THREE.MeshBasicMaterial({color:0x31251f,transparent:true,opacity:.78}),industrialLights=[];
for(let i=0;i<22;i++){
  const side=i%2?1:-1,z=-2720-i*48,x=side*(12+Math.random()*7),fence=new THREE.Group();
  for(const px of [-3,0,3])mesh(new THREE.CylinderGeometry(.09,.12,4.5,5),rustMat,fence,px,2.2,0);
  for(let y=.45;y<4.3;y+=.55)mesh(new THREE.BoxGeometry(6.2,.025,.025),wireMat,fence,0,y,0);
  mesh(new THREE.BoxGeometry(6.2,.11,.11),rustMat,fence,0,4.2,0,[1,1,1],[0,0,.08*side]);
  fence.position.set(x,0,z);fence.rotation.y=side>0?-.2:.2;fence.userData.collisionRadius=3.2;obstacles.push(fence);scene.add(fence);
  if(i%3===0){const lamp=new THREE.PointLight(0xb90b05,0,28,2.2);lamp.position.set(x,5,z);scene.add(lamp);industrialLights.push(lamp);mesh(new THREE.SphereGeometry(.19,6,4),new THREE.MeshBasicMaterial({color:0xff1608,fog:false}),fence,0,5,0);}
}
for(let i=0;i<12;i++){const z=-2700-i*92,barrier=new THREE.Group();mesh(new THREE.BoxGeometry(6,.55,.65),rustMat,barrier,0,.7,0,[1,1,1],[0,0,i%2?.08:-.08]);for(const x of [-2.3,2.3])mesh(new THREE.BoxGeometry(.35,1.7,.5),rustMat,barrier,x,.7,0);barrier.position.set((i%2?1:-1)*(9+Math.random()*5),0,z);barrier.rotation.y=(Math.random()-.5)*.5;barrier.userData.collisionRadius=3.3;obstacles.push(barrier);scene.add(barrier);}

function makeRoundTree(scale=1){
  const g=new THREE.Group(),wood=flat(0x494331),leafA=flat(0x283f31),leafB=flat(0x3d5039),h=4+Math.random()*3;
  mesh(new THREE.CylinderGeometry(.22,.45,h,5),wood,g,0,h/2,0);
  const crowns=5+Math.floor(Math.random()*5);for(let i=0;i<crowns;i++){const a=i/crowns*Math.PI*2,r=i?1+Math.random()*1.1:0;mesh(new THREE.DodecahedronGeometry(.85+Math.random()*.55,0),i%2?leafA:leafB,g,Math.cos(a)*r,h+Math.sin(i*1.7)*.65,Math.sin(a)*r,[1,.9+Math.random()*.5,1]);}
  g.scale.setScalar(scale);return g;
}
for(let i=0;i<190;i++){const scale=.75+Math.random()*.8,t=makeRoundTree(scale),side=i%2?1:-1;t.position.set(side*(24+Math.random()*38),0,20-Math.random()*WORLD_DEPTH);t.rotation.y=Math.random()*Math.PI;t.userData.collisionRadius=1.2*scale;obstacles.push(t);scene.add(t);}
function makeNiuLai(scale=1, dark=false){
  const g=new THREE.Group();
  const fur=flat(dark?0x342019:0xe97837), muzzle=flat(dark?0x84624e:0xf2d3a0);
  const hoof=flat(dark?0x0e0b09:0x3a241b), eye=flat(0xf3ead8), pupil=flat(dark?0xff3b21:0x231711), inner=flat(0xeaa181);
  // 电影中的牛来是橙色、直立、大头宽嘴的拟人小牛。
  const body=mesh(new THREE.SphereGeometry(1.05,7,5),fur,g,0,2.45,0,[1.04,1.22,.74]);
  const head=mesh(new THREE.SphereGeometry(1.2,7,6),fur,g,0,4.25,-.08,[1.08,.92,.8]);
  mesh(new THREE.SphereGeometry(.74,7,5),muzzle,head,0,-.25,-.9,[1.12,.7,.38]);
  mesh(new THREE.BoxGeometry(.78,.07,.08),hoof,head,0,-.38,-1.25,[1,1,1]);
  for(const x of [-.48,.48]){
    mesh(new THREE.SphereGeometry(.25,7,5),eye,head,x,.18,-.78,[1,.82,.34]);
    mesh(new THREE.SphereGeometry(.105,6,5),pupil,head,x,.16,-.9,[1,1,.5]);
    mesh(new THREE.ConeGeometry(.24,.75,4),fur,head,x*1.95,.18,-.02,[1,1,1],[0,0,x>0?-1.25:1.25]);
    mesh(new THREE.ConeGeometry(.11,.42,4),inner,head,x*1.94,.18,-.08,[1,1,1],[0,0,x>0?-1.25:1.25]);
    mesh(new THREE.BoxGeometry(.38,.07,.06),hoof,head,x,.5,-.77,[1,1,1],[0,0,x>0?.12:-.12]);
  }
  tuft(g,fur,-.35,5.17,0,.17,-.12);tuft(g,fur,.05,5.25,0,.19,.06);tuft(g,fur,.4,5.14,0,.15,.18);
  const arms=[], legs=[];
  for(const x of [-1.03,1.03]){
    const a=mesh(new THREE.CapsuleGeometry(.22,1.15,2,5),fur,g,x,2.45,0,[1,1,1],[0,0,x>0?-.16:.16]);arms.push(a);
    mesh(new THREE.SphereGeometry(.28,6,5),hoof,a,0,-.78,0,[.9,.8,.9]);
  }
  for(const x of [-.48,.48]){
    const l=mesh(new THREE.CapsuleGeometry(.27,1.25,2,5),fur,g,x,.9,0,[1,1,1]);legs.push(l);
    mesh(new THREE.SphereGeometry(.36,6,5),hoof,l,0,-.85,-.13,[1,.65,1.35]);
  }
  g.scale.setScalar(scale); g.userData.legs=legs; g.userData.arms=arms;g.userData.body=body;g.userData.head=head;g.userData.canCrawl=true; return g;
}

function makeYellowBull(scale=1,dark=false){
  const g=new THREE.Group(), fur=flat(dark?0x32251a:0xd2a72c), muzzle=flat(dark?0x725958:0xaa8ba8), hoof=flat(dark?0x130e0b:0x9a829b), eye=flat(0xf2e8d5), pupil=flat(dark?0xff3b21:0x231711), horn=flat(0x403a49), brow=flat(0x6c542c);
  mesh(new THREE.CapsuleGeometry(.92,1.8,3,7),fur,g,0,2.5,0,[1.08,1,.82]);
  const head=mesh(new THREE.SphereGeometry(1.16,8,6),fur,g,0,4.55,-.05,[1.05,1,.8]);
  const lip=mesh(new THREE.SphereGeometry(.7,8,5),muzzle,head,0,-.23,-.9,[1.12,.68,.42]);
  mesh(new THREE.BoxGeometry(.85,.07,.08),hoof,lip,0,-.18,-.66);
  for(const x of [-.45,.45]){
    mesh(new THREE.SphereGeometry(.23,7,5),eye,head,x,.17,-.78,[1,.8,.32]);mesh(new THREE.SphereGeometry(.095,6,5),pupil,head,x,.16,-.9,[1,1,.5]);
    mesh(new THREE.BoxGeometry(.43,.07,.08),brow,head,x,.48,-.79,[1,1,1],[0,0,x>0?-.12:.12]);
    mesh(new THREE.ConeGeometry(.17,1.12,7),horn,head,x*1.3,1.12,-.03,[1,1,1],[0,0,x>0?-.28:.28]);
    mesh(new THREE.ConeGeometry(.22,.62,4),fur,head,x*2.05,.12,0,[1,1,1],[0,0,x>0?-1.25:1.25]);
  }
  tuft(g,fur,-.28,5.55,0,.17,-.15);tuft(g,fur,.1,5.62,0,.19,.1);
  const arms=[],legs=[];for(const x of [-1.05,1.05]){const a=mesh(new THREE.CapsuleGeometry(.25,1.2,2,5),fur,g,x,2.45,0);arms.push(a);mesh(new THREE.SphereGeometry(.3,6,5),hoof,a,0,-.82,0);}
  for(const x of [-.5,.5]){const l=mesh(new THREE.CapsuleGeometry(.3,1.35,2,5),fur,g,x,.9,0);legs.push(l);mesh(new THREE.SphereGeometry(.37,6,5),hoof,l,0,-.9,-.12,[1,.65,1.3]);}
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;return g;
}

function makeLeopard(scale=1){
  const g=new THREE.Group(), fur=flat(0xd6ac2d), white=flat(0xe9dfbf), spot=flat(0x352319), eye=flat(0xf4e9cc);
  const body=mesh(new THREE.SphereGeometry(1,8,6),fur,g,0,2.35,0,[.8,1.35,.65]);mesh(new THREE.SphereGeometry(.72,7,5),white,body,0,-.05,-.7,[.7,1,.25]);
  const head=mesh(new THREE.SphereGeometry(1,8,6),fur,g,0,4.05,-.02,[.92,.94,.72]);mesh(new THREE.SphereGeometry(.52,7,5),white,head,0,-.28,-.82,[1,.62,.38]);
  for(const x of [-.38,.38]){mesh(new THREE.SphereGeometry(.2,6,5),eye,head,x,.15,-.72,[1,.9,.3]);mesh(new THREE.SphereGeometry(.08,6,5),spot,head,x,.15,-.83);mesh(new THREE.ConeGeometry(.28,.55,4),fur,head,x*1.8,.72,-.02,[1,1,1],[0,0,x>0?-.58:.58]);}
  const arms=[],legs=[];for(const x of [-.82,.82]){const a=mesh(new THREE.CapsuleGeometry(.18,1.05,2,5),fur,g,x,2.35,0);arms.push(a);}
  for(const x of [-.36,.36]){const l=mesh(new THREE.CapsuleGeometry(.22,1.25,2,5),fur,g,x,.82,0);legs.push(l);}
  for(let i=0;i<24;i++){const a=i/12*Math.PI*2,r=i<12?.78:.68,y=i<12?2.45:4.07;mesh(new THREE.SphereGeometry(.075+(i%4)*.025,5,4),spot,g,Math.cos(a)*r,y+Math.sin(a)*.68,-.62,[1,.7,.25]);}
  tuft(g,fur,-.2,4.95,0,.13,-.1);tuft(g,fur,.12,4.99,0,.14,.12);
  const tail=mesh(new THREE.CapsuleGeometry(.12,1.7,2,5),fur,g,.62,2.1,.35,[1,1,1],[0,0,-.8]);mesh(new THREE.SphereGeometry(.16,6,5),spot,tail,0,-1,0);
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;return g;
}

function makeAlienCow(scale=1,variant=0){
  const g=new THREE.Group(), skin=flat(variant?0x9a953d:0xa3a945), dark=flat(0x211629), snout=flat(0xe8b6a2), nostril=flat(0x9d7168), eye=flat(0x151218), inner=flat(0xe5a494);
  // 矮胖筒形身体、方圆大头与突出的粉色宽嘴，按影片截图比例重建。
  mesh(new THREE.CapsuleGeometry(.82,1.55,3,7),skin,g,0,2.22,0,[1.05,1,.82]);
  const head=mesh(new THREE.SphereGeometry(1.13,8,6),skin,g,0,4.03,-.05,[1.06,.92,.78]);
  const muzzle=mesh(new THREE.SphereGeometry(.72,8,5),snout,head,0,-.2,-.9,[1.28,.67,.42]);
  for(const x of [-.28,.28])mesh(new THREE.SphereGeometry(.075,6,5),nostril,muzzle,x,.04,-.65,[.65,1,.35]);
  for(const x of [-.43,.43]){
    mesh(new THREE.SphereGeometry(.135,7,5),eye,head,x,.18,-.82,[1,.95,.38]);
    mesh(new THREE.ConeGeometry(.22,.58,4),skin,head,x*1.96,.1,-.04,[1,1,1],[0,0,x>0?-1.22:1.22]);
    mesh(new THREE.ConeGeometry(.105,.32,4),inner,head,x*1.96,.1,-.1,[1,1,1],[0,0,x>0?-1.22:1.22]);
  }
  // 影片中最醒目的外弯黑紫色牛角。
  for(const side of [-1,1]){
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(side*.5,4.75,0),new THREE.Vector3(side*.72,5.25,.02),
      new THREE.Vector3(side*1.05,5.48,.03),new THREE.Vector3(side*1.28,5.32,.04)
    ]);
    const hornMesh=new THREE.Mesh(new THREE.TubeGeometry(curve,8,.12,6,false),dark);hornMesh.castShadow=true;g.add(hornMesh);
    mesh(new THREE.ConeGeometry(.115,.48,6),dark,g,side*1.39,5.22,.04,[1,1,1],[0,0,side>0?-1.08:1.08]);
  }
  const arms=[],legs=[];
  for(const x of [-.9,.9]){const a=mesh(new THREE.CapsuleGeometry(.18,1.12,2,6),skin,g,x,2.15,0,[1,1,1],[0,0,x>0?-.08:.08]);arms.push(a);mesh(new THREE.SphereGeometry(.24,6,5),skin,a,0,-.75,0,[1,.85,.9]);}
  for(const x of [-.38,.38]){const l=mesh(new THREE.CapsuleGeometry(.24,1.18,2,6),skin,g,x,.72,0);legs.push(l);mesh(new THREE.SphereGeometry(.3,6,5),dark,l,0,-.78,-.08,[1,.58,1.2]);}
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;g.userData.enemyKey='enemy.alien';g.userData.enemyParams={number:variant+1};return g;
}

function makeDarkBeast(scale=1){
  const g=new THREE.Group(), hide=flat(0x301817), mask=flat(0xd7d5ce), eye=flat(0xff6e25), mouth=flat(0x100b0a);
  mesh(new THREE.CapsuleGeometry(.94,1.55,3,7),hide,g,0,2.25,0,[1.12,1,.78]);
  const bib=mesh(new THREE.SphereGeometry(.82,7,5),mask,g,0,2.5,-.72,[.92,1.12,.22]);
  const head=mesh(new THREE.SphereGeometry(1.05,7,6),hide,g,0,4.05,-.04,[1.04,.92,.78]);
  mesh(new THREE.SphereGeometry(.72,7,5),mask,head,0,-.22,-.86,[1.18,.68,.38]);mesh(new THREE.BoxGeometry(.48,.07,.08),mouth,head,0,-.33,-1.18);
  for(const x of [-.43,.43]){mesh(new THREE.SphereGeometry(.12,6,5),eye,head,x,.19,-.82,[1,.8,.35]);mesh(new THREE.ConeGeometry(.25,.58,4),hide,head,x*1.75,.63,0,[1,1,1],[0,0,x>0?-.55:.55]);}
  const arms=[],legs=[];for(const x of [-.86,.86]){const a=mesh(new THREE.CapsuleGeometry(.2,1.05,2,5),hide,g,x,2.16,0);arms.push(a);}
  for(const x of [-.4,.4]){const l=mesh(new THREE.CapsuleGeometry(.27,1.2,2,5),hide,g,x,.72,0);legs.push(l);}
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;g.userData.enemyKey='enemy.beast';return g;
}

function makeHerdCow(scale=1){
  const g=new THREE.Group(),fur=flat(0xb75c32),muzzle=flat(0xe8b19d),hoof=flat(0x38231e),horn=flat(0xe8dfcf),eye=flat(0x17110f);
  mesh(new THREE.CapsuleGeometry(.72,1.75,3,6),fur,g,0,1.62,0,[1,1,1],[Math.PI/2,0,0]);
  const head=mesh(new THREE.SphereGeometry(.75,7,5),fur,g,0,1.82,-1.62,[1,.92,.88]);
  mesh(new THREE.SphereGeometry(.5,7,5),muzzle,head,0,-.16,-.6,[1.08,.64,.45]);
  for(const x of [-.25,.25])mesh(new THREE.SphereGeometry(.065,5,4),eye,head,x,.16,-.67,[1,1,.5]);
  for(const x of [-.48,.48])mesh(new THREE.ConeGeometry(.12,.65,6),horn,head,x,.55,-.05,[1,1,1],[0,0,x>0?-.55:.55]);
  const legs=[];for(const x of [-.48,.48])for(const z of [-.73,.73]){const l=mesh(new THREE.CapsuleGeometry(.13,.72,2,5),fur,g,x,.65,z);legs.push(l);mesh(new THREE.SphereGeometry(.18,5,4),hoof,l,0,-.48,-.06,[1,.65,1.15]);}
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=[];return g;
}

function makeStrangeBird(scale=1){
  const g=new THREE.Group(),black=flat(0x171519),blueBlack=flat(0x292c38),beak=flat(0xe5bd32),eye=flat(0xe8e1cd);
  mesh(new THREE.SphereGeometry(.55,6,5),black,g,0,0,0,[.78,.72,1.45]);
  const head=mesh(new THREE.SphereGeometry(.38,6,5),black,g,0,.16,-.68,[1,1,.9]);mesh(new THREE.ConeGeometry(.18,.72,4),beak,head,0,-.02,-.5,[1,.7,1],[Math.PI/2,0,0]);
  for(const x of [-.14,.14])mesh(new THREE.SphereGeometry(.035,5,4),eye,head,x,.13,-.34,[1,1,.6]);
  const wings=[];for(const side of [-1,1]){const w=mesh(new THREE.ConeGeometry(.45,2.2,4),blueBlack,g,side*.7,.05,.1,[1,.9,1],[0,0,side>0?-1.12:1.12]);wings.push(w);}
  g.scale.setScalar(scale);g.userData.wings=wings;return g;
}

function makeSnake(scale=1){
  const g=new THREE.Group(), skin=flat(0xd7d0bd), stripe=flat(0x3d3a35), mouth=flat(0xe49aae);
  const segments=[];
  for(let i=0;i<14;i++){
    const s=mesh(new THREE.SphereGeometry(.52-i*.018,6,5),i%3===0?stripe:skin,g,Math.sin(i*.72)*1.4,.48,i*.68,[1,.62,1.25]);segments.push(s);
  }
  const head=mesh(new THREE.SphereGeometry(.72,7,5),skin,g,0,.58,-.6,[1.1,.75,1.25]);mesh(new THREE.BoxGeometry(.8,.08,.25),mouth,head,0,-.25,-.66);
  g.scale.setScalar(scale);g.userData.segments=segments;return g;
}

function makeTreeEnemy(scale=1){
  const g=new THREE.Group(), wood=flat(0x32312d);
  mesh(new THREE.CylinderGeometry(.45,.8,9,5),wood,g,0,4.5,0,[1,1,1],[0,0,-.1]);
  const arms=[];arms.push(mesh(new THREE.CylinderGeometry(.18,.35,8,5),wood,g,-2,7,0,[1,1,1],[0,0,-1.02]));arms.push(mesh(new THREE.CylinderGeometry(.16,.32,10,5),wood,g,2.6,6.4,0,[1,1,1],[0,0,1.05]));
  g.scale.setScalar(scale);g.userData.arms=arms;return g;
}

function makeMonsterCar(scale=1){
  const g=new THREE.Group(), metal=flat(0x4c4134), rust=flat(0x7a4328), glass=flat(0x171b18), eye=flat(0xff3a17), tooth=flat(0xd8cfb3), rubber=flat(0x11100e);
  mesh(new THREE.BoxGeometry(5.4,2.1,7.2),rust,g,0,2.1,0,[1,1,1],[.03,0,0]);
  const face=mesh(new THREE.BoxGeometry(5.8,3.6,2.3),metal,g,0,3.25,-3.35,[1,1,1],[-.08,0,0]);
  mesh(new THREE.BoxGeometry(4.4,1.15,.14),glass,face,0,.55,-1.18);for(const x of [-1.45,1.45])mesh(new THREE.SphereGeometry(.3,7,5),eye,face,x,.45,-1.34,[1,.65,.3]);
  mesh(new THREE.BoxGeometry(4.5,.72,.18),glass,face,0,-.75,-1.18);for(let i=-3;i<=3;i++)mesh(new THREE.ConeGeometry(.22,.55,4),tooth,face,i*.55,-.68,-1.36,[1,1,1],[Math.PI,0,0]);
  const wheels=[];for(const x of [-2.65,2.65])for(const z of [-2.2,2.15]){const w=mesh(new THREE.CylinderGeometry(1.25,1.25,.8,8),rubber,g,x,1.15,z,[1,1,1],[0,0,Math.PI/2]);wheels.push(w);}
  mesh(new THREE.CylinderGeometry(.16,.22,3.5,6),metal,g,-2.1,5.3,-.1,[1,1,1],[0,0,-.3]);mesh(new THREE.ConeGeometry(.32,.8,6),eye,g,-2.62,6.85,-.1);
  g.scale.setScalar(scale);g.userData.wheels=wheels;g.userData.type='car';g.userData.enemyKey='enemy.car';return g;
}

function createCharacter(kind){return kind==='yellow'?makeYellowBull(.68):kind==='leopard'?makeLeopard(.78):makeNiuLai(.72,false);}
let selectedCharacter='orange';
const difficulties={
  orange:{nameKey:'character.easy',length:3600,pack:3,stalkers:4,ambushers:2,wave2At:1450,wave2Time:170,carAt:2650,carTime:330,player:1.06,enemy:.86,drain:.78,recovery:1.25,hazard:.72,fog:.014,rain:.75,flashMin:9,flashRange:13},
  yellow:{nameKey:'character.normal',length:4200,pack:5,stalkers:7,ambushers:4,wave2At:1680,wave2Time:165,carAt:3100,carTime:320,player:1,enemy:1,drain:1,recovery:1,hazard:1,fog:.021,rain:1,flashMin:6,flashRange:10},
  leopard:{nameKey:'character.hard',length:4800,pack:6,stalkers:10,ambushers:7,wave2At:1920,wave2Time:155,carAt:3500,carTime:300,player:.97,enemy:1.14,drain:1.24,recovery:.82,hazard:1.3,fog:.03,rain:1.35,flashMin:4,flashRange:7}
};
let player=createCharacter(selectedCharacter); player.position.set(0,.05,18); player.rotation.y=0; scene.add(player);
const hunter=makeDarkBeast(.78); hunter.position.set(0,.05,51); scene.add(hunter);
const wolfPack=[hunter,...Array.from({length:5},(_,i)=>makeDarkBeast(.7+(i%3)*.05))];wolfPack.slice(1).forEach((w,i)=>{w.position.set((i-2)*4,.05,54+i*2);scene.add(w);});
const hunterGlow=new THREE.PointLight(0xff2b16,22,24); hunterGlow.position.set(0,5,46); scene.add(hunterGlow);
const enemyConfigs=[[-24,-85,'alien'],[27,-125,'beast'],[-29,-175,'beast'],[25,-225,'alien'],[-24,-275,'beast'],[22,-325,'alien'],[-28,-375,'beast'],[26,-425,'alien'],[-25,-485,'beast'],[24,-545,'alien']];
const stalkers=enemyConfigs.map(([x,z,type],i)=>{const e=type==='alien'?makeAlienCow(.9,i%2):makeDarkBeast(.72);e.position.set(x,.05,z);e.userData.home=new THREE.Vector3(x,.05,z);e.userData.speed=type==='alien'?5.2:6.1;e.userData.type=type;scene.add(e);return e;});
const snakes=Array.from({length:16},(_,i)=>[i%2?-14:16,-180-i*280]).map(([x,z])=>{const s=makeSnake(.82);s.position.set(x,0,z);s.rotation.y=Math.PI/2;scene.add(s);return s;});
const treeEnemies=Array.from({length:12},(_,i)=>[i%2?-18:17,-520-i*350]).map(([x,z])=>{const t=makeTreeEnemy(1.25);t.position.set(x,0,z);t.userData.collisionRadius=3.15;obstacles.push(t);scene.add(t);return t;});
const monsterCar=makeMonsterCar(.88);monsterCar.position.set(0,0,80);scene.add(monsterCar);
const herdSpawns=[[-7,-72],[8,-148],[-5,-224],[9,-306],[-8,-392],[6,-478],[-4,-558]];
const herdCows=herdSpawns.map(([x,z],i)=>{const c=makeHerdCow(.72+(i%2)*.08);c.position.set(x,.05,z);c.userData.start=new THREE.Vector3(x,.05,z);scene.add(c);return c;});
const superCowIndex=1,superCow=herdCows[superCowIndex];superCow.userData.super=true;superCow.userData.halo=mesh(new THREE.TorusGeometry(1.15,.1,5,18),new THREE.MeshBasicMaterial({color:0xd9ff43,fog:false}),superCow,0,3.25,0,[1,1,1],[Math.PI/2,0,0]);
const ambushers=herdSpawns.map(([x,z],i)=>{const e=makeDarkBeast(.62+(i%2)*.05);e.position.set(x+(i%2?3:-3),.05,z+14);e.userData.start=e.position.clone();e.userData.type='beast';e.userData.herdIndex=i;scene.add(e);return e;});
const strangeTravellers=[makeNiuLai(.48,false),makeYellowBull(.43),makeLeopard(.52)];[[-11,-118],[12,-272],[-10,-438]].forEach(([x,z],i)=>{const c=strangeTravellers[i];c.position.set(x,.05,z);c.userData.start=new THREE.Vector3(x,.05,z);scene.add(c);});
// 第三段对白所说的“牛群”是真实存在的一整群牛，而不是单个装饰角色。
const storyHerd=Array.from({length:11},(_,i)=>{const cow=makeHerdCow(.55+(i%3)*.07);cow.userData.offsetX=(i%4-1.5)*4.8+(Math.random()-.5)*2;cow.userData.offsetZ=-Math.floor(i/4)*6-(i%2)*2;cow.visible=false;scene.add(cow);return cow;});

function makeAbstractAnimal(variant=0){
  const g=new THREE.Group(),colors=[0x82a9a0,0xc98e65,0x9380ad,0xd2b960],fur=flat(colors[variant%colors.length]),pale=flat(0xe8d8ba),dark=flat(0x24231f);
  mesh(new THREE.SphereGeometry(.75,6,5),fur,g,0,1.3,0,[1,1.25,.8]);const head=mesh(new THREE.SphereGeometry(.62,6,5),fur,g,0,2.45,-.12,[1,1,.85]);mesh(new THREE.SphereGeometry(.35,6,4),pale,head,0,-.12,-.52,[1,.65,.45]);
  for(const x of [-.22,.22]){mesh(new THREE.SphereGeometry(.055,5,4),dark,head,x,.12,-.52);mesh(new THREE.ConeGeometry(.16,.72,4),fur,head,x*1.8,.62,0,[1,1,1],[0,0,x>0?-.24:.24]);}
  const legs=[];for(const x of [-.3,.3])legs.push(mesh(new THREE.CapsuleGeometry(.12,.62,2,4),fur,g,x,.45,0));g.userData.legs=legs;g.userData.arms=[];g.userData.isNpc=true;return g;
}
function makeSafeZone(index){
  const group=new THREE.Group(),floorMat=new THREE.MeshStandardMaterial({color:0x8d8b5c,emissive:0xffa82f,emissiveIntensity:.28,roughness:1});mesh(new THREE.CircleGeometry(24,24),floorMat,group,0,.028,0,[1,1,1],[-Math.PI/2,0,0]);
  const residents=[];for(let i=0;i<8;i++){const npc=i<4?makeHerdCow(.46+(i%2)*.06):makeAbstractAnimal(i);const a=i/8*Math.PI*2,r=7+(i%3)*3;npc.position.set(Math.cos(a)*r,.05,Math.sin(a)*r);npc.rotation.y=a+Math.PI;npc.userData.safeStart=npc.position.clone();group.add(npc);residents.push(npc);}
  const wood=flat(0x5e4028),roof=flat(0x30241d),wall=flat(0x9a7043),colliders=[];
  // 每一关的暖区都有看得见的木栅栏、入口门楣和亮灯小屋，不再只是地面颜色变化。
  for(const side of [-1,1]){mesh(new THREE.BoxGeometry(1,3.2,38),wood,group,side*20,1.6,0);colliders.push({x:side*20,z:0,r:1.7});}
  for(const z of [-19,19])for(const x of [-14,14]){mesh(new THREE.BoxGeometry(13,3.2,1),wood,group,x,1.6,z);colliders.push({x,z,r:6.6});}
  for(const z of [-19,19]){for(const x of [-20,-8,8,20])mesh(new THREE.CylinderGeometry(.28,.38,4.5,5),wood,group,x,2.25,z);mesh(new THREE.BoxGeometry(7,1,1),wood,group,0,7,z);for(const x of [-3.5,3.5])mesh(new THREE.BoxGeometry(.8,8,1),wood,group,x,4,z);}
  const house=new THREE.Group();house.position.set(-13,0,1);mesh(new THREE.BoxGeometry(10,6.5,8),wall,house,0,3.25,0);mesh(new THREE.ConeGeometry(8,4,4),roof,house,0,8,0,[1,1,.78],[0,Math.PI/4,0]);mesh(new THREE.BoxGeometry(3.2,4.7,.5),flat(0x18130f),house,0,2.3,-4.15);for(const x of [-3,3])mesh(new THREE.BoxGeometry(1.7,1.7,.35),new THREE.MeshBasicMaterial({color:0xffc65d}),house,x,4,-4.18);group.add(house);colliders.push({x:-13,z:1,r:5.5});
  const light=new THREE.PointLight(0xffbd5b,150,58,1.4);light.position.set(0,10,0);group.add(light);for(const side of [-1,1]){const post=mesh(new THREE.CylinderGeometry(.22,.3,6,6),wood,group,side*15,3,0);mesh(new THREE.SphereGeometry(.55,7,5),new THREE.MeshBasicMaterial({color:0xffc45f}),post,0,3.2,0);}
  group.visible=false;group.userData={index,residents,light,floorMat,colliders,entered:false,passed:false,broken:false,timer:0,nextTalk:0};scene.add(group);return group;
}
const safeZones=Array.from({length:4},(_,i)=>makeSafeZone(i));
const bubbleEls=Array.from({length:4},()=>{const el=document.createElement('div');el.className='npc-bubble';el.hidden=true;npcBubbles.appendChild(el);return el;});
function makeCloth(){const g=new THREE.Group(),cloth=new THREE.MeshBasicMaterial({color:0xff2015,side:THREE.DoubleSide,fog:false}),glow=new THREE.MeshBasicMaterial({color:0xff160b,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});mesh(new THREE.PlaneGeometry(2.2,3.1,2,2),cloth,g,0,1.7,0,[1,1,1],[0,.2,.08]);const beam=mesh(new THREE.CylinderGeometry(.35,2.4,18,8,1,true),glow,g,0,9,0);const ring=mesh(new THREE.TorusGeometry(2.1,.16,5,18),new THREE.MeshBasicMaterial({color:0xff3a22,fog:false}),g,0,.12,0,[1,1,1],[Math.PI/2,0,0]);const light=new THREE.PointLight(0xff2c18,58,30);light.position.y=3.2;g.add(light);g.userData={beam,ring,light};scene.add(g);return g;}
const clothPieces=Array.from({length:3},makeCloth);
function makeSwitch(){const g=new THREE.Group();mesh(new THREE.BoxGeometry(1.6,3.4,1.1),rustMat,g,0,1.7,0);const lever=mesh(new THREE.BoxGeometry(.28,1.6,.3),flat(0xc54628),g,0,2.1,-.72,[1,1,1],[.45,0,0]);const lamp=new THREE.PointLight(0xff2a14,28,16);lamp.position.set(0,3.6,0);g.add(lamp);g.userData={lever,lamp,on:false};scene.add(g);return g;}
const powerSwitches=Array.from({length:2},makeSwitch);
function makeTaskGate(color=0x503a2c){const g=new THREE.Group(),mat=flat(color);for(const x of [-17,-11,-5,1,7,13,19])mesh(new THREE.BoxGeometry(1.4,9,1.2),mat,g,x-1,4.5,0);g.userData={open:false};scene.add(g);return g;}
const forestGate=makeTaskGate(0x40352c),powerGate=makeTaskGate(0x6b3328);
function makeHut(){const g=new THREE.Group(),wood=flat(0x4c392b),roof=flat(0x241f1d);mesh(new THREE.BoxGeometry(11,5,8),wood,g,0,2.5,0);mesh(new THREE.ConeGeometry(8,4,4),roof,g,0,6,0,[1,1,.78],[0,Math.PI/4,0]);mesh(new THREE.BoxGeometry(4.2,4.4,.8),flat(0x11120f),g,0,2.1,-4.1);const warm=new THREE.PointLight(0xffb34c,52,20);warm.position.set(0,3,-2);g.add(warm);g.userData.warm=warm;scene.add(g);return g;}
const shelterHuts=[makeHut(),makeHut()];
function makeFalseGate(){const g=new THREE.Group(),mat=flat(0xb9e83b);for(const x of [-8,8])mesh(new THREE.BoxGeometry(2.4,15,2.4),mat,g,x,7.5,0);mesh(new THREE.BoxGeometry(18,2.4,2.4),mat,g,0,14,0);const sign=mesh(new THREE.BoxGeometry(9,3,.5),mat,g,0,10,-1.5);g.userData={mat,sign,triggered:false};scene.add(g);return g;}
const falseGate=makeFalseGate();
const finalHerd=Array.from({length:13},(_,i)=>{const cow=i===0?makeHerdCow(.9):makeHerdCow(.5+(i%3)*.08);if(i===0)cow.userData.halo=mesh(new THREE.TorusGeometry(1.2,.12,5,18),new THREE.MeshBasicMaterial({color:0xf5ff72,fog:false}),cow,0,3.2,0,[1,1,1],[Math.PI/2,0,0]);cow.visible=false;scene.add(cow);return cow;});
const itemTypes=['herb','flashlight','radio','smoke'];
const itemPickups=itemTypes.map((type,i)=>{const colors=[0x65d451,0xffef8a,0x61b6da,0xc7c7c7],g=new THREE.Group();mesh(new THREE.DodecahedronGeometry(.65,0),new THREE.MeshBasicMaterial({color:colors[i],fog:false}),g,0,1,0);const ring=mesh(new THREE.TorusGeometry(1,.09,5,16),new THREE.MeshBasicMaterial({color:colors[i],fog:false}),g,0,1,0,[1,1,1],[Math.PI/2,0,0]);g.userData={type,ring,collected:false};scene.add(g);return g;});
const forkWalls=Array.from({length:8},(_,i)=>{const g=new THREE.Group(),mat=flat(i%2?0x34352f:0x4d4036);for(const side of [-1,1])mesh(new THREE.BoxGeometry(22,5,2),mat,g,side*18,2.5,0);g.userData.gapSide=i%2?1:-1;scene.add(g);return g;});
const animalActors=[...herdCows,...storyHerd,...strangeTravellers,...finalHerd,...safeZones.flatMap(zone=>zone.userData.residents)];
const collisionPoint=new THREE.Vector3(),collisionLocal=new THREE.Vector3();
function resolveAnimalWorldCollision(animal,radius=1.25){
  if(!animal.visible)return false;animal.getWorldPosition(collisionPoint);let hit=false;
  for(const obstacle of obstacles){const dz=collisionPoint.z-obstacle.position.z;if(Math.abs(dz)>8)continue;const r=(obstacle.userData.collisionRadius||2.1)+radius,dx=collisionPoint.x-obstacle.position.x,d2=dx*dx+dz*dz;if(d2>=r*r)continue;if(d2<.0001){collisionPoint.x+=r;hit=true;continue;}const d=Math.sqrt(d2),push=r-d;collisionPoint.x+=dx/d*push;collisionPoint.z+=dz/d*push;hit=true;}
  collisionPoint.x=THREE.MathUtils.clamp(collisionPoint.x,-58,58);
  for(const fork of forkWalls){if(!fork.visible||Math.abs(collisionPoint.z-fork.position.z)>3.1||Math.abs(collisionPoint.x-fork.position.x)<7.1)continue;collisionPoint.z=fork.position.z+(collisionPoint.z>fork.position.z?3.15:-3.15);hit=true;}
  for(const taskGate of [forestGate,powerGate]){if(taskGate.userData.open||Math.abs(collisionPoint.z-taskGate.position.z)>3.1)continue;collisionPoint.z=taskGate.position.z+(collisionPoint.z>taskGate.position.z?3.15:-3.15);hit=true;}
  for(const zone of safeZones){if(!zone.visible)continue;const lx=collisionPoint.x-zone.position.x,lz=collisionPoint.z-zone.position.z,resident=animal.parent===zone;if(Math.abs(Math.abs(lz)-19)<2.1&&Math.abs(lx)>4.4){collisionPoint.z=zone.position.z+(lz>0?(resident?16.8:21.1):(resident?-16.8:-21.1));hit=true;}if(Math.abs(Math.abs(lx)-20)<2.1&&Math.abs(lz)<19){collisionPoint.x=zone.position.x+(lx>0?(resident?17.8:22.1):(resident?-17.8:-22.1));hit=true;}const hx=lx+13,hz=lz-1,houseRadius=6.65,hd2=hx*hx+hz*hz;if(hd2<houseRadius*houseRadius){if(hd2<.0001)collisionPoint.x+=houseRadius;else{const hd=Math.sqrt(hd2),push=houseRadius-hd;collisionPoint.x+=hx/hd*push;collisionPoint.z+=hz/hd*push;}hit=true;}}
  if(hit){if(animal.parent&&animal.parent!==scene){collisionLocal.copy(collisionPoint);animal.parent.worldToLocal(collisionLocal);animal.position.x=collisionLocal.x;animal.position.z=collisionLocal.z;}else{animal.position.x=collisionPoint.x;animal.position.z=collisionPoint.z;}}
  return hit;
}
function steerNpcAroundObstacles(animal,dt){
  if(!animal.visible||animal.userData.eaten||animal.userData.escaped)return;animal.getWorldPosition(collisionPoint);let steer=0,strongest=0;
  // 预测前方约 9 米内的实体，提前选择同一侧绕行；碰撞推开只作为最后保险。
  for(const obstacle of obstacles){const ahead=collisionPoint.z-obstacle.position.z;if(ahead<0||ahead>9)continue;const clearance=(obstacle.userData.collisionRadius||2.1)+2.2,sideDistance=collisionPoint.x-obstacle.position.x;if(Math.abs(sideDistance)>=clearance)continue;const weight=(1-ahead/9)*(1-Math.abs(sideDistance)/clearance);if(weight>strongest){strongest=weight;if(Math.abs(sideDistance)>.18)animal.userData.avoidSide=Math.sign(sideDistance);else if(!animal.userData.avoidSide)animal.userData.avoidSide=animal.id%2?1:-1;steer=animal.userData.avoidSide*weight;}}
  // 木栅栏必须从门洞穿过，逃难动物会主动对准入口和出口。
  for(const zone of safeZones){const entryZ=zone.position.z+19,exitGateZ=zone.position.z-19;if(collisionPoint.z>entryZ&&collisionPoint.z-entryZ<12&&Math.abs(collisionPoint.x-zone.position.x)>3.2)steer+=Math.sign(zone.position.x-collisionPoint.x)*.9;if(collisionPoint.z<zone.position.z+15&&collisionPoint.z>exitGateZ&&collisionPoint.z-exitGateZ<12&&Math.abs(collisionPoint.x-zone.position.x)>3.2)steer+=Math.sign(zone.position.x-collisionPoint.x)*.9;}
  // 随机岔路也使用可见缺口，而不是贴着墙持续抖动。
  for(const fork of forkWalls){const ahead=collisionPoint.z-fork.position.z;if(ahead>=0&&ahead<11&&Math.abs(collisionPoint.x-fork.position.x)>6.2)steer+=Math.sign(fork.position.x-collisionPoint.x)*1.15;}
  if(Math.abs(steer)>.02){const amount=THREE.MathUtils.clamp(steer,-1,1)*dt*8.5;collisionPoint.x+=amount;if(animal.parent&&animal.parent!==scene){collisionLocal.copy(collisionPoint);animal.parent.worldToLocal(collisionLocal);animal.position.x=collisionLocal.x;}else animal.position.x=collisionPoint.x;animal.rotation.y=THREE.MathUtils.lerp(animal.rotation.y,-amount*.12,.18);}else animal.userData.avoidSide=0;
}
function resolvePlayerAnimalCollision(){
  for(const animal of animalActors){if(!animal.visible||animal.userData.eaten||animal.userData.escaped)continue;animal.getWorldPosition(collisionPoint);const radius=(animal.userData.isNpc?1.35:1.5)+1.05,dx=player.position.x-collisionPoint.x,dz=player.position.z-collisionPoint.z,d2=dx*dx+dz*dz;if(d2>=radius*radius)continue;if(d2<.0001){player.position.z+=radius;continue;}const d=Math.sqrt(d2),push=radius-d;player.position.x+=dx/d*push;player.position.z+=dz/d*push;}
}
const strangeBirds=Array.from({length:18},(_,i)=>{const b=makeStrangeBird(.42+Math.random()*.22);b.position.set((Math.random()-.5)*55,9+Math.random()*14,10-Math.random()*100);b.userData.phase=Math.random()*Math.PI*2;b.userData.speed=4+Math.random()*5;scene.add(b);return b;});
const allEnemies=[...wolfPack,...stalkers,...snakes,...treeEnemies,...ambushers,monsterCar];allEnemies.forEach(e=>e.visible=false);hunterGlow.visible=false;

function addRock(x,z,s=1){const r=mesh(new THREE.DodecahedronGeometry(1.5,0),flat(Math.random()>.5?0x4a4b3b:0x675e49),scene,x,s*.8,z,[s,s,s]);r.userData.collisionRadius=1.35*s;obstacles.push(r);}
for(let z=4;z>-WORLD_DEPTH;z-=17+Math.random()*15){
  const side=Math.random()>.5?1:-1; addRock(side*(8+Math.random()*41),z,.7+Math.random()*2.2);
  if(Math.random()>.62)addRock(-side*(12+Math.random()*35),z-3,.6+Math.random()*1.5);
}
// crooked black monoliths make landmarks and occlusion
for(let z=-65;z>-WORLD_DEPTH;z-=115){
  const x=(Math.random()-.5)*55;
  const p=mesh(new THREE.BoxGeometry(4,16+Math.random()*14,3),flat(0x26251f),scene,x,6,z,[1,1,1],[0,0,(Math.random()-.5)*.25]);p.userData.collisionRadius=2.6;obstacles.push(p);
}

// destination arch
const gate=new THREE.Group();
const gateMat=new THREE.MeshStandardMaterial({color:0xd9ff43,emissive:0x91bb18,emissiveIntensity:2.4,roughness:.35});
mesh(new THREE.BoxGeometry(5,30,5),gateMat,gate,-12,15,0);
mesh(new THREE.BoxGeometry(5,30,5),gateMat,gate,12,15,0);
mesh(new THREE.BoxGeometry(29,5,5),gateMat,gate,0,28,0);
const gateRing=mesh(new THREE.TorusGeometry(9,1.05,6,20),new THREE.MeshBasicMaterial({color:0xeaff84,transparent:true,opacity:.88,fog:false}),gate,0,15,.1,[1,1,1],[0,0,0]);
gate.position.z=-620; scene.add(gate);
const beacon=new THREE.PointLight(0xd9ff43,260,115);beacon.position.set(0,14,-618);scene.add(beacon);
const gateBeam=mesh(new THREE.CylinderGeometry(2.8,8,100,10,1,true),new THREE.MeshBasicMaterial({color:0xd9ff43,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}),scene,0,50,-620);
const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=256;const signCtx=signCanvas.getContext('2d'),signTexture=new THREE.CanvasTexture(signCanvas);
function drawExitSign(){signCtx.clearRect(0,0,512,256);signCtx.fillStyle='#11150fe8';signCtx.fillRect(20,28,472,190);signCtx.strokeStyle='#d9ff43';signCtx.lineWidth=12;signCtx.strokeRect(20,28,472,190);signCtx.fillStyle='#d9ff43';signCtx.textAlign='center';signCtx.font='900 112px sans-serif';signCtx.fillText(tr('world.exit'),256,155);signCtx.font='900 54px sans-serif';signCtx.fillText('▼',256,208);signTexture.needsUpdate=true;}drawExitSign();
const gateSign=new THREE.Sprite(new THREE.SpriteMaterial({map:signTexture,transparent:true,depthTest:false,fog:false}));gateSign.position.set(0,36,-619);gateSign.scale.set(22,11,1);scene.add(gateSign);
const guidePosts=[];for(let z=-120;z>-WORLD_DEPTH;z-=120)for(const x of [-8,8]){const post=mesh(new THREE.BoxGeometry(.7,4,.7),gateMat,scene,x,2,z);post.castShadow=false;guidePosts.push(post);}

// 电影草原里那种光秃、发白、像手臂一样伸向雾里的树。
const deadTreeMat=flat(0x77717d),trunkGeo=new THREE.ConeGeometry(.56,8,5),branchGeo=new THREE.ConeGeometry(.23,4.5,5);
for(let i=0;i<280;i++){
  const t=new THREE.Group(),h=5+Math.random()*10,lean=(Math.random()-.5)*.22;
  mesh(trunkGeo,deadTreeMat,t,0,h*.5,0,[.7+Math.random()*.55,h/8,.7+Math.random()*.4],[0,0,lean]);
  const branches=2+Math.floor(Math.random()*3);
  for(let b=0;b<branches;b++){
    const side=b%2?1:-1,len=.58+Math.random()*.52,y=h*(.48+b*.13+Math.random()*.08);
    mesh(branchGeo,deadTreeMat,t,side*(.45+Math.random()*.3),y,0,[len,len,len],[0,0,side*(-.72-Math.random()*.42)]);
  }
  const nearRoute=i<90,side=nearRoute?(i%2?1:-1):(Math.random()>.5?1:-1);t.position.set(side*(nearRoute?18+(i%4)*5:15+Math.random()*48),0,nearRoute?18-i*52:24-Math.random()*WORLD_DEPTH);t.rotation.y=Math.random()*Math.PI;t.userData.collisionRadius=.75+Math.min(h,12)*.045;obstacles.push(t);scene.add(t);
}

// 雨幕跟随玩家移动，避免跑远后雨点变稀；用线段保持低端手机也能流畅。
const rainCount=innerWidth<700?480:850,rainPositions=new Float32Array(rainCount*6),rainSpeed=new Float32Array(rainCount),rainLength=new Float32Array(rainCount);
for(let i=0;i<rainCount;i++){
  const p=i*6,x=(Math.random()-.5)*100,y=Math.random()*48,z=(Math.random()-.5)*100,len=.7+Math.random()*1.9;
  rainPositions[p]=x;rainPositions[p+1]=y;rainPositions[p+2]=z;rainPositions[p+3]=x+.2;rainPositions[p+4]=y-len;rainPositions[p+5]=z;rainSpeed[i]=18+Math.random()*20;rainLength[i]=len;
}
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
const rainMat=new THREE.LineBasicMaterial({color:0xc9d1cd,transparent:true,opacity:.29,depthWrite:false});
const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;scene.add(rain);

// “无归”雪夜段落：暴雪会在中途吞掉草原，白衣女鬼没有脚印，也不会真正离开。
const snowCount=mobileDevice?520:900,snowPos=new Float32Array(snowCount*3);
for(let i=0;i<snowCount;i++){snowPos[i*3]=(Math.random()-.5)*90;snowPos[i*3+1]=Math.random()*40;snowPos[i*3+2]=(Math.random()-.5)*90;}
const snowGeo=new THREE.BufferGeometry();snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snow=new THREE.Points(snowGeo,new THREE.PointsMaterial({color:0xe8f3f2,size:mobileDevice?.24:.18,transparent:true,opacity:0,depthWrite:false,fog:false}));snow.frustumCulled=false;scene.add(snow);
function makeSnowGhost(){const g=new THREE.Group(),robe=new THREE.MeshBasicMaterial({color:0xcbd5d2,fog:true}),skin=new THREE.MeshBasicMaterial({color:0xdde2dc,fog:true}),hair=new THREE.MeshBasicMaterial({color:0x080b0c,fog:true}),mouth=new THREE.MeshBasicMaterial({color:0x390606,fog:false});mesh(new THREE.ConeGeometry(1.25,6.2,7),robe,g,0,3.1,0);mesh(new THREE.SphereGeometry(.72,7,6),skin,g,0,6.25,-.05,[.82,1.08,.7]);mesh(new THREE.SphereGeometry(.82,7,6),hair,g,0,6.65,.22,[1,1.18,.78]);mesh(new THREE.BoxGeometry(.8,1.7,.18),hair,g,0,6.25,.55);for(const x of [-.27,.27])mesh(new THREE.SphereGeometry(.055,5,4),mouth,g,x,6.3,-.68);mesh(new THREE.BoxGeometry(.34,.045,.04),mouth,g,0,5.95,-.72);for(const x of [-1,1])mesh(new THREE.CapsuleGeometry(.13,2.7,2,4),robe,g,x*.9,3.8,0,[1,1,1],[0,0,x*.3]);g.userData.type='snowGhost';g.visible=false;scene.add(g);return g;}
const snowGhost=makeSnowGhost(),snowBgColor=new THREE.Color(0x9ba9aa),snowFogColor=new THREE.Color(0xc5d0d0),snowGroundColor=new THREE.Color(0xb8c3b7);

// 雾中观察者：只会短暂出现在路边，玩家再看时已经不在了。
function makeWatcher(){const g=new THREE.Group(),voidMat=new THREE.MeshBasicMaterial({color:0x030403,fog:true}),eyeMat=new THREE.MeshBasicMaterial({color:0xff1808,fog:false});mesh(new THREE.CapsuleGeometry(.7,4.8,2,5),voidMat,g,0,2.6,0,[1,.95,.58]);mesh(new THREE.SphereGeometry(1.05,6,5),voidMat,g,0,5.6,0,[1,.86,.62]);for(const x of [-.34,.34])mesh(new THREE.SphereGeometry(.075,5,4),eyeMat,g,x,5.75,-.61);g.visible=false;scene.add(g);return g;}
const watchers=Array.from({length:4},makeWatcher);

const keys={}, joystick={x:0,y:0}, clock=new THREE.Clock();
let state='intro', stamina=100, hearts=3, exhausted=false, runLength=430, exitZ=-412, distance=430, hunterSpeed=7.5, elapsed=0, lastLine=-1, shake=0, audio, musicMaster, radioGain, musicNodes=[], musicTimer, storyStage=0, snowStage=0, snowBlend=0, activeChasers=[], speedLevel=0, nextTerrorFlash=9,nextHaunt=6,hauntTimer,titleCryTimer,deathElapsed=0,deathAttacker=null,deathReason=null,nextDeathBlood=0,lastCollisionSound=-99,invulnerableUntil=0,clothCount=0,switchCount=0,sheltered=false,flashlightUntil=0,smokeCharges=0,radioOwned=false,fakeExitTriggered=false,finalWaveStarted=false,rescuedCows=0,weatherActive=false,nextWeatherChange=0;
const bloodEffects=[];
const lines=[
  [.04,'story.0'],[.08,'story.1'],[.12,'story.2'],[.16,'story.3'],[.36,'story.4'],[.66,'story.5'],[.86,'story.6']
];
const chapters=[
  {number:'chapter.1.number',title:'chapter.1.title',description:'chapter.1.description'},
  {number:'chapter.2.number',title:'chapter.2.title',description:'chapter.2.description'},
  {number:'chapter.3.number',title:'chapter.3.title',description:'chapter.3.description'},
  {number:'chapter.4.number',title:'chapter.4.title',description:'chapter.4.description'},
  {number:'chapter.5.number',title:'chapter.5.title',description:'chapter.5.description'}
];
let currentChapter=-1,chapterTimer,activeSafeZone=-1;
function showChapter(index){
  currentChapter=index;clearTimeout(chapterTimer);chapterNumber.textContent=tr(chapters[index].number);chapterTitle.textContent=tr(chapters[index].title);chapterDescription.textContent=tr(chapters[index].description);chapterBanner.classList.remove('show');void chapterBanner.offsetWidth;chapterBanner.classList.add('show');chapterTimer=setTimeout(()=>chapterBanner.classList.remove('show'),3250);
  document.body.classList.remove('chapter-1','chapter-2','chapter-3','chapter-4','chapter-5');document.body.classList.add(`chapter-${index+1}`);sound(74+index*19,.8,'sawtooth',.06);if(index>0){stamina=Math.min(100,stamina+35);setMission(`chapter.${index+1}.mission`);}
}
function updateChapter(progress){const index=Math.min(4,Math.max(0,Math.floor(progress/Math.max(1,runLength)*5)));if(index!==currentChapter)showChapter(index);}
function hideNpcBubbles(){bubbleEls.forEach(el=>el.hidden=true);}
function updateSafeZone(progress,dt,t,moving){
  let protectedZone=false;activeSafeZone=-1;
  safeZones.forEach((zone,index)=>{
    const data=zone.userData,dz=player.position.z-zone.position.z;
    if(data.passed){if(data.broken)data.residents.forEach((npc,i)=>{if(npc.userData.eaten)return;npc.position.z-=dt*(5.2+i*.17);animateCow(npc,t,9+i%3);});return;}
    if(!data.entered&&Math.abs(dz)<20){data.entered=true;data.timer=0;data.nextTalk=.8;data.talkIndex=0;data.activeBubble=-1;terrorFlash();say('safe.enter',3000);}
    if(!data.entered)return;
    if(dz<-24){data.passed=true;if(activeSafeZone===index)hideNpcBubbles();return;}
    if(Math.abs(dz)<27){activeSafeZone=index;data.timer+=dt;protectedZone=!data.broken;stamina=Math.min(100,stamina+dt*(moving?5:24));
      const coldMix=THREE.MathUtils.smoothstep(data.timer,9,27),cold=data.timer>12,broken=data.timer>29;document.body.classList.toggle('safe-warm',!cold);document.body.classList.toggle('safe-cold',cold&&!broken);
      if(broken&&!data.broken){data.broken=true;document.body.classList.remove('safe-warm','safe-cold');document.body.classList.add('safe-broken');say('safe.break',3600);terrorFlash();shake=1.2;data.residents.forEach((npc,i)=>{npc.rotation.y=Math.PI+(i-3.5)*.08;});setTimeout(()=>document.body.classList.remove('safe-broken'),4200);}
      data.light.color.set(0xffc66b).lerp(new THREE.Color(0x779fac),coldMix);data.light.intensity=broken?6:190-(155*coldMix);data.floorMat.color.set(0xa79861).lerp(new THREE.Color(0x394b49),coldMix);data.floorMat.emissive.set(0xffa82f).lerp(new THREE.Color(0x193e43),coldMix);data.floorMat.emissiveIntensity=broken?.01:.36-(.3*coldMix);
      if(data.timer>=data.nextTalk){data.nextTalk=data.timer+(cold?2.7:3.8);const set=broken?'safe.broken':cold?'safe.cold':'safe.warm';let best=0,bestScore=Infinity;data.residents.slice(0,4).forEach((npc,i)=>{const v=new THREE.Vector3();npc.getWorldPosition(v);v.y+=3;v.project(camera);const score=v.z>1?99:Math.abs(v.x)+Math.abs(v.y)*.3+(i===(data.activeBubble??-1)?1.5:0);if(score<bestScore){best=i;bestScore=score;}});data.activeBubble=best;const el=bubbleEls[best];el.textContent=tr(`${set}.${(data.talkIndex+index)%4}`);data.talkIndex++;hideNpcBubbles();el.hidden=false;}
      bubbleEls.forEach((el,i)=>{if(i!==data.activeBubble){el.hidden=true;return;}const npc=data.residents[i],v=new THREE.Vector3();npc.getWorldPosition(v);v.y+=4;v.project(camera);el.style.left=((v.x*.5+.5)*innerWidth)+'px';el.style.top=((-v.y*.5+.5)*innerHeight)+'px';el.hidden=v.z>1||Math.abs(v.x)>1.2||Math.abs(v.y)>1.2;});
      for(const collider of data.colliders){const wx=zone.position.x+collider.x,wz=zone.position.z+collider.z,r=collider.r+1.05,dx=player.position.x-wx,pz=player.position.z-wz,d2=dx*dx+pz*pz;if(d2<r*r){const d=Math.max(.001,Math.sqrt(d2)),push=r-d;player.position.x+=dx/d*push;player.position.z+=pz/d*push;}}
      if(data.broken)data.residents.forEach((npc,i)=>{if(npc.userData.eaten)return;npc.position.z-=dt*(6+i*.18);animateCow(npc,t,11+i%3);});
    }
  });
  if(activeSafeZone<0){document.body.classList.remove('safe-warm','safe-cold');hideNpcBubbles();}
  return protectedZone;
}
function updateObjectives(progress,dt,t,moving,safeProtected){
  let missionKey='',missionParams={};
  const near=(object,radius=3)=>Math.hypot(player.position.x-object.position.x,player.position.z-object.position.z)<radius;
  clothPieces.forEach(item=>{
    if(!item.visible)return;item.rotation.y+=dt*.65;item.position.y=.05+Math.sin(t*3+item.position.x)*.14;item.userData.ring.rotation.z+=dt*2.1;item.userData.beam.material.opacity=.22+Math.sin(t*4+item.position.x)*.14;item.userData.light.intensity=48+Math.sin(t*5)*18;
    if(near(item,3.2)){item.visible=false;clothCount++;say('task.clothFound',2300,{count:clothCount});sound(310,.35,'triangle',.07);}
  });
  const forestOpen=clothCount>=clothPieces.length;forestGate.userData.open=forestOpen;forestGate.position.y=THREE.MathUtils.lerp(forestGate.position.y,forestOpen?-10:0,.08);
  if(!forestOpen&&progress>runLength*.245&&progress<runLength*.41){const remaining=clothPieces.filter(item=>item.visible).sort((a,b)=>Math.hypot(player.position.x-a.position.x,player.position.z-a.position.z)-Math.hypot(player.position.x-b.position.x,player.position.z-b.position.z)),nearestCloth=remaining[0],clothDistance=nearestCloth?Math.round(Math.hypot(player.position.x-nearestCloth.position.x,player.position.z-nearestCloth.position.z)):0,direction=nearestCloth?(nearestCloth.position.x-player.position.x>3?'direction.left':nearestCloth.position.x-player.position.x<-3?'direction.right':'direction.ahead'):'direction.ahead';missionKey=nearestCloth&&clothDistance<110?'task.clothHint':'task.clothMission';missionParams={count:clothCount,total:clothPieces.length,distance:clothDistance,direction:tr(direction)};if(player.position.z<forestGate.position.z+3.8)player.position.z=forestGate.position.z+3.8;}

  powerSwitches.forEach(sw=>{
    if(!sw.visible)return;sw.userData.lamp.intensity=sw.userData.on?42:18+Math.sin(t*7)*10;
    if(!sw.userData.on&&near(sw,4)){sw.userData.on=true;switchCount++;sw.userData.lever.rotation.x=-.75;sw.userData.lamp.color.set(0x76ff55);say('task.switchOn',2200,{count:switchCount});sound(92,.65,'square',.09);terrorFlash();}
  });
  const powerOpen=switchCount>=powerSwitches.length;powerGate.userData.open=powerOpen;powerGate.position.y=THREE.MathUtils.lerp(powerGate.position.y,powerOpen?-10:0,.08);
  if(!powerOpen&&progress>runLength*.645&&progress<runLength*.805){missionKey='task.switchMission';missionParams={count:switchCount,total:powerSwitches.length};if(player.position.z<powerGate.position.z+3.8)player.position.z=powerGate.position.z+3.8;}

  sheltered=false;
  shelterHuts.forEach(hut=>{if(near(hut,6.2)&&!moving){sheltered=true;stamina=Math.min(100,stamina+dt*30);}});
  document.body.classList.toggle('sheltered',sheltered);
  if(currentChapter===2&&!sheltered&&progress>runLength*.43&&progress<runLength*.58){missionKey='task.shelterMission';}
  if(sheltered){missionKey='task.sheltered';}

  itemPickups.forEach(item=>{
    if(item.userData.collected)return;item.rotation.y+=dt*1.9;item.userData.ring.rotation.z+=dt*2.2;
    if(!near(item,3.1))return;item.userData.collected=true;item.visible=false;
    if(item.userData.type==='herb'){hearts=Math.min(3,hearts+1);stamina=100;renderHearts();}
    else if(item.userData.type==='flashlight')flashlightUntil=elapsed+32;
    else if(item.userData.type==='radio')radioOwned=true;
    else smokeCharges=1;
    say(`item.${item.userData.type}`,2600);sound(420,.3,'triangle',.065);
  });
  document.body.classList.toggle('flashlight-on',elapsed<flashlightUntil);

  // 每局岔路的位置都会变化；实体墙迫使玩家观察缺口，而不是沿中线一路跑到底。
  forkWalls.forEach(fork=>{if(Math.abs(player.position.z-fork.position.z)<3.2&&Math.abs(player.position.x-fork.position.x)>7.2){player.position.z=Math.max(player.position.z,fork.position.z+3.2);shake=Math.max(shake,.12);}});

  if(!fakeExitTriggered&&progress>runLength*.875&&near(falseGate,18)){
    fakeExitTriggered=true;falseGate.userData.triggered=true;falseGate.userData.mat.color.set(0x6d0908);falseGate.rotation.z=.06;say('task.falseExit',3600);terrorFlash();shake=1.1;sound(34,1.2,'sawtooth',.14);
  }
  if(fakeExitTriggered&&progress>runLength*.87){missionKey='task.trueExit';}

  if(progress>runLength*.805){
    if(!finalWaveStarted){finalWaveStarted=true;say('task.stampede',3300);terrorFlash();
      stalkers.forEach((enemy,i)=>{if(!enemy.visible&&i<difficulties[selectedCharacter].stalkers){placeChaser(enemy,(i%2?-1:1)*(15+i*2),46+i*2,7.8+i*.08);}});
    }
    finalHerd.forEach((cow,i)=>{if(cow.userData.escaped||cow.userData.eaten)return;cow.visible=true;cow.position.z-=dt*(i===0?11.8:6.4+(i%4)*.24);cow.position.x+=Math.sin(t*1.8+i)*dt*(i===0?.75:.38);animateCow(cow,t,i===0?17:11);if(cow.userData.halo){cow.userData.halo.rotation.z+=dt*3;cow.userData.halo.scale.setScalar(1+Math.sin(t*5)*.08);}if(cow.position.z<exitZ+4){cow.userData.escaped=true;rescuedCows++;cow.visible=false;}});
  }
  return {protectedZone:safeProtected||sheltered,missionKey,missionParams};
}
const herdFleeLines=Array.from({length:7},(_,i)=>`herd.flee.${i}`),herdCaughtLines=Array.from({length:7},(_,i)=>`herd.caught.${i}`);

let activeSayKey='',activeSayParams={},activeMissionKey='hud.defaultMission',activeMissionParams={};
function say(key,time=2600,params={}){activeSayKey=key;activeSayParams=params;ui.subtitle.textContent=tr(key,params);ui.subtitle.classList.add('show');clearTimeout(say.t);say.t=setTimeout(()=>{ui.subtitle.classList.remove('show');activeSayKey='';},time);}
function setMission(key,params={}){activeMissionKey=key;activeMissionParams=params;ui.mission.textContent=tr(key,params);}
function applyPlayerHealthAppearance(){
  document.body.classList.remove('health-3','health-2','health-1','health-0');document.body.classList.add(`health-${hearts}`);
  if(!player)return;
  if(!player.userData.wounds){
    const wounds=new THREE.Group(),blood=new THREE.MeshBasicMaterial({color:0x850500,fog:false});
    [[-.42,3.05,-.8,.22,.55,.08,.55],[.45,2.25,-.79,.18,.42,-.07,.4],[-.25,4.12,-.82,.13,.34,.05,.25]].forEach(([x,y,z,sx,sy,rz,minHearts])=>{const cut=new THREE.Mesh(new THREE.SphereGeometry(1,6,4),blood);cut.position.set(x,y,z);cut.scale.set(sx,sy,.06);cut.rotation.z=rz;cut.userData.minDamage=minHearts;wounds.add(cut);});
    player.add(wounds);player.userData.wounds=wounds;
  }
  const damage=3-hearts;player.userData.wounds.children.forEach((cut,index)=>cut.visible=index<damage+Math.max(0,damage-1));
  player.traverse(part=>{if(!part.isMesh||!part.material?.color)return;if(!part.userData.healthyColor)part.userData.healthyColor=part.material.color.clone();part.material.color.copy(part.userData.healthyColor).lerp(new THREE.Color(0x3b1513),damage*(damage===1?.09:.17));});
}
function renderHearts(hit=false){[...ui.hearts.children].forEach((heart,index)=>{heart.classList.toggle('lost',index>=hearts);heart.classList.remove('hit-heart');if(hit&&index===hearts){void heart.offsetWidth;heart.classList.add('hit-heart');}});applyPlayerHealthAppearance();}
function damageHeart(hitKey,attacker,deathKey,deathParams={}){if(state!=='playing'||elapsed<invulnerableUntil)return;invulnerableUntil=elapsed+2.15;hearts=Math.max(0,hearts-1);renderHearts(true);terrorFlash();shake=.9;if(hearts)say('event.heartLost',1800,{count:hearts});if(hearts<=0)beginPlayerDeath(attacker,deathKey,deathParams);else if(attacker){const dx=player.position.x-attacker.position.x,dz=player.position.z-attacker.position.z,d=Math.max(1,Math.hypot(dx,dz));player.position.x+=dx/d*4.2;player.position.z+=dz/d*4.2;attacker.position.x-=dx/d*1.5;attacker.position.z-=dz/d*1.5;}}
renderHearts();
function sound(freq=80,dur=.16,type='sawtooth',vol=.05){
  if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
  const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(22,freq*.4),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur);
}
function horrorSound(kind=0){
  if(!audio)return;const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain(),pan=audio.createStereoPanner?audio.createStereoPanner():audio.createGain();o.type=kind===2?'square':'sawtooth';o.frequency.setValueAtTime(kind===0?38:kind===1?690:kind===3?145:54,now);o.frequency.exponentialRampToValueAtTime(kind===1?85:kind===3?39:22,now+(kind===3?2.8:.65));g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(kind===1?.12:kind===3?.22:.18,now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+(kind===3?3:.72));if(pan.pan)pan.pan.value=Math.random()*2-1;o.connect(g).connect(pan).connect(audio.destination);o.start(now);o.stop(now+(kind===3?3.05:.75));
}
function triggerHaunt(){
  if(state!=='playing')return;const kind=Math.floor(Math.random()*5);
  document.body.classList.remove('apparition','blackout','blood-flash','heartbeat');
  if(kind===0){document.body.classList.add('blackout');horrorSound(0);shake=.45;hauntTimer=setTimeout(()=>document.body.classList.remove('blackout'),110+Math.random()*190);}
  else if(kind===1){document.body.classList.add('apparition');horrorSound(1);shake=.8;hauntTimer=setTimeout(()=>document.body.classList.remove('apparition'),480);}
  else if(kind===2){document.body.classList.add('blood-flash');horrorSound(2);hauntTimer=setTimeout(()=>document.body.classList.remove('blood-flash'),520);}
  else if(kind===3){const w=watchers.find(x=>!x.visible)||watchers[0],side=Math.random()<.5?-1:1;w.position.set(player.position.x+side*(7+Math.random()*9),0,player.position.z-12-Math.random()*20);w.rotation.y=side>0?-.4:.4;w.visible=true;horrorSound(0);hauntTimer=setTimeout(()=>w.visible=false,420+Math.random()*750);}
  else{document.body.classList.add('otherworld');horrorSound(3);say('event.otherworld',3000);shake=.65;hauntTimer=setTimeout(()=>document.body.classList.remove('otherworld'),4200);}
}
function stopMusic(){
  if(!musicMaster||!audio)return;clearInterval(musicTimer);radioGain=null;musicMaster.gain.cancelScheduledValues(audio.currentTime);musicMaster.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.8);
  const nodes=[...musicNodes];setTimeout(()=>nodes.forEach(n=>{try{n.stop()}catch{}}),900);musicNodes=[];musicMaster=null;
}
async function startMusic(){
  if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();stopMusic();
  musicMaster=audio.createGain();musicMaster.gain.setValueAtTime(.0001,audio.currentTime);musicMaster.gain.exponentialRampToValueAtTime(.19,audio.currentTime+1.2);musicMaster.connect(audio.destination);
  const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=820;filter.Q.value=6;filter.connect(musicMaster);
  // 手机扬声器也能听见的中低频不协和持续音。
  [73.4,82.4,110].forEach((freq,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=i===2?'triangle':'sawtooth';o.frequency.value=freq;g.gain.value=i===2?.12:.17;o.connect(g).connect(filter);o.start();musicNodes.push(o);});
  const lfo=audio.createOscillator(),lfoGain=audio.createGain();lfo.frequency.value=.09;lfoGain.gain.value=260;lfo.connect(lfoGain).connect(filter.frequency);lfo.start();musicNodes.push(lfo);
  // 带通噪声模拟荒原风声。
  const noiseBuffer=audio.createBuffer(1,Math.floor(audio.sampleRate*2),audio.sampleRate),data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.32;
  const wind=audio.createBufferSource(),windFilter=audio.createBiquadFilter(),windGain=audio.createGain();wind.buffer=noiseBuffer;wind.loop=true;windFilter.type='bandpass';windFilter.frequency.value=480;windFilter.Q.value=.7;windGain.gain.value=.08;wind.connect(windFilter).connect(windGain).connect(musicMaster);wind.start();musicNodes.push(wind);
  const radio=audio.createBufferSource(),radioFilter=audio.createBiquadFilter();radioGain=audio.createGain();radio.buffer=noiseBuffer;radio.loop=true;radioFilter.type='bandpass';radioFilter.frequency.value=2100;radioFilter.Q.value=1.8;radioGain.gain.value=.002;radio.connect(radioFilter).connect(radioGain).connect(musicMaster);radio.start();musicNodes.push(radio);
  musicTimer=setInterval(()=>{if(state!=='playing'||!musicMaster)return;const now=audio.currentTime,base=[41.2,46.25,55,61.74][Math.floor(Math.random()*4)];for(const detune of [0,6.8]){const o=audio.createOscillator(),g=audio.createGain(),pan=audio.createStereoPanner?audio.createStereoPanner():audio.createGain();o.type='sawtooth';o.frequency.setValueAtTime(base*(detune?1.071:1),now);o.frequency.linearRampToValueAtTime(base*.62,now+3.4);if(pan.pan)pan.pan.value=detune?-.65:.65;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.075,now+.7);g.gain.exponentialRampToValueAtTime(.0001,now+3.4);o.connect(g).connect(pan).connect(musicMaster);o.start(now);o.stop(now+3.5);}},3100);
}
function unlockAudio(){
  if(audioUnlocked){document.querySelector('#audioGate').classList.add('hidden');return;}
  audioUnlocked=true;
  if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume().catch(()=>{});
  // 在用户点击的同一个事件中同时解锁 WebAudio 和 HTMLAudio，兼容 iOS 微信内置浏览器。
  const silent=audio.createOscillator(),silentGain=audio.createGain();silentGain.gain.value=.00001;silent.connect(silentGain).connect(audio.destination);silent.start();silent.stop(audio.currentTime+.04);
  dangerAudio.volume=.001;dangerAudio.currentTime=0;
  dangerAudio.play().then(()=>setTimeout(()=>{dangerAudio.pause();dangerAudio.currentTime=0;dangerAudio.volume=.95;},80)).catch(()=>{dangerAudio.volume=.95;});
  document.querySelector('#audioGate').classList.add('hidden');
  playTitleCry();
}
function playTitleCry(){clearTimeout(titleCryTimer);titleCryAudio.pause();titleCryAudio.currentTime=0;titleCryAudio.volume=1;titleCryAudio.play().catch(()=>{});document.body.classList.remove('title-cry');void document.body.offsetWidth;document.body.classList.add('title-cry');titleCryTimer=setTimeout(()=>document.body.classList.remove('title-cry'),1400);}
document.querySelector('#enterGameBtn').addEventListener('click',unlockAudio);
document.addEventListener('WeixinJSBridgeReady',()=>{dangerAudio.load();titleCryAudio.load();if(audio)audio.resume().catch(()=>{});},{once:true});
function start(){
  clearTimeout(titleCryTimer);titleCryAudio.pause();titleCryAudio.currentTime=0;document.body.classList.remove('title-cry');
  clearTimeout(say.t);clearTimeout(hauntTimer);ui.subtitle.classList.remove('show');ui.warning.classList.remove('show');activeSayKey='';activeMissionKey='hud.defaultMission';activeMissionParams={};Object.keys(keys).forEach(key=>delete keys[key]);resetJoystick();stopMusic();
  document.body.style.removeProperty('transform');document.body.style.removeProperty('filter');canvas.style.removeProperty('transform');camera.zoom=1;
  const mode=difficulties[selectedCharacter];runLength=mode.length;exitZ=18-runLength;distance=runLength;gate.position.set(22,0,exitZ);beacon.position.set(22,14,exitZ+2);gateBeam.position.set(22,50,exitZ);gateSign.position.set(22,36,exitZ+1);guidePosts.forEach(post=>post.visible=post.position.z>exitZ+18);scene.fog.density=mode.fog;scene.background.set(selectedCharacter==='orange'?0xaeba88:selectedCharacter==='yellow'?0x9daa7c:0x77806a);
  state='playing'; elapsed=0; stamina=100;hearts=3;invulnerableUntil=0;exhausted=false; hunterSpeed=7.5; lastLine=-1;speedLevel=0;deathElapsed=0;deathAttacker=null;deathReason=null;resultSnapshot=null;nextDeathBlood=0;snowStage=0;snowBlend=0;snow.visible=false;snow.material.opacity=0;snowGhost.visible=false;weatherActive=Math.random()<.58;nextWeatherChange=7+Math.random()*12;nextTerrorFlash=mode.flashMin+Math.random()*mode.flashRange;nextHaunt=5+Math.random()*6;watchers.forEach(w=>w.visible=false);document.body.classList.remove('death-maul','exhausted','enemy-near','terror-flash','flash-negative','apparition','blackout','blood-flash','heartbeat','otherworld','snow-haunting','rain-active','safe-warm','safe-cold','safe-broken','sheltered','flashlight-on','smoke-screen','chapter-1','chapter-2','chapter-3','chapter-4','chapter-5','hit','glitch','title-cry','health-3','health-2','health-1','health-0','difficulty-easy','difficulty-normal','difficulty-hard');document.body.classList.add(selectedCharacter==='orange'?'difficulty-easy':selectedCharacter==='yellow'?'difficulty-normal':'difficulty-hard');ui.distance.textContent=runLength+tr('world.m');
  const oldPlayer=player;player=createCharacter(selectedCharacter);player.position.set(0,.05,18);player.rotation.set(0,0,0);scene.remove(oldPlayer);scene.add(player);renderHearts();storyStage=0;activeChasers=[];allEnemies.forEach(e=>{e.visible=false;e.position.y=e.userData.type==='car'?0:.05;e.userData.feeding=0;e.userData.joined=false;e.userData.headBob=0;});stalkers.forEach(e=>e.position.copy(e.userData.home));monsterCar.position.set(0,0,80);[...snakes,...treeEnemies].forEach(e=>e.visible=true);
  bloodEffects.splice(0).forEach(f=>scene.remove(f.group));
  herdCows.forEach((c,i)=>{c.position.copy(c.userData.start);c.rotation.set(0,0,0);c.visible=c.position.z>exitZ;c.userData.active=false;c.userData.eaten=false;c.userData.escaped=false;c.userData.announced=false;const e=ambushers[i];e.position.copy(e.userData.start);e.rotation.set(0,0,0);e.visible=false;e.userData.disabled=i>=mode.ambushers;e.userData.feeding=0;e.userData.joined=false;});
  const herdCenter=18-runLength*.165;storyHerd.forEach((cow,i)=>{cow.position.set(cow.userData.offsetX,.05,herdCenter+cow.userData.offsetZ);cow.rotation.set(0,Math.PI,0);cow.visible=false;cow.userData.active=false;cow.userData.escaped=false;cow.userData.eaten=false;});
  currentChapter=-1;activeSafeZone=-1;hideNpcBubbles();safeZones.forEach((zone,i)=>{zone.position.set(0,0,18-runLength*((i+1)/5));zone.visible=true;Object.assign(zone.userData,{entered:false,passed:false,broken:false,timer:0,nextTalk:0,talkIndex:0,activeBubble:-1});zone.userData.light.color.set(0xffc66b);zone.userData.light.intensity=190;zone.userData.floorMat.color.set(0xa79861);zone.userData.floorMat.emissive.set(0xffa82f);zone.userData.floorMat.emissiveIntensity=.36;zone.userData.residents.forEach(npc=>{npc.position.copy(npc.userData.safeStart);npc.rotation.set(0,Math.PI,0);npc.visible=true;npc.userData.eaten=false;npc.userData.escaped=false;});});showChapter(0);
  clothCount=0;switchCount=0;sheltered=false;flashlightUntil=0;smokeCharges=0;radioOwned=false;fakeExitTriggered=false;finalWaveStarted=false;rescuedCows=0;
  [[-23,.26],[21,.31],[-18,.36]].forEach(([x,r],i)=>{const item=clothPieces[i];item.position.set(x,.05,18-runLength*r);item.visible=true;item.rotation.y=Math.random()*Math.PI;});forestGate.position.set(0,0,18-runLength*.395);forestGate.userData.open=false;
  [[-20,.66],[22,.735]].forEach(([x,r],i)=>{const sw=powerSwitches[i];sw.position.set(x,0,18-runLength*r);sw.visible=true;sw.userData.on=false;sw.userData.lever.rotation.x=.45;sw.userData.lamp.color.set(0xff2a14);});powerGate.position.set(0,0,18-runLength*.79);powerGate.userData.open=false;
  [[-15,.47],[16,.54]].forEach(([x,r],i)=>{shelterHuts[i].position.set(x,0,18-runLength*r);shelterHuts[i].visible=true;});falseGate.position.set(0,0,18-runLength*.9);falseGate.visible=true;falseGate.userData.triggered=false;falseGate.userData.mat.color.set(0xb9e83b);
  finalHerd.forEach((cow,i)=>{cow.position.set((i%5-2)*4.2,.05,18-runLength*.825-Math.floor(i/5)*6);cow.rotation.set(0,Math.PI,0);cow.visible=false;cow.userData.escaped=false;cow.userData.eaten=false;});
  [[-10,.12],[18,.34],[-16,.55],[20,.72]].forEach(([x,r],i)=>{const item=itemPickups[i];item.position.set(x,.05,18-runLength*r);item.visible=true;item.userData.collected=false;});
  forkWalls.forEach((fork,i)=>{fork.position.set((Math.random()<.5?-1:1)*(8+Math.random()*7),0,18-runLength*(.23+i*.075));fork.rotation.y=(Math.random()-.5)*.08;fork.visible=true;});
  strangeTravellers.forEach(c=>{c.position.copy(c.userData.start);c.rotation.set(0,0,0);c.visible=true;c.userData.fleeing=false;c.userData.eaten=false;c.userData.escaped=false;});
  const mobileView=mobileDevice||innerWidth<700;hunterGlow.visible=false;shake=0;camera.fov=66;camera.updateProjectionMatrix();camera.position.set(mobileView?.8:2.2,mobileView?24:19,mobileView?5:0);setMission('hud.defaultMission');document.body.classList.add('playing');ui.intro.classList.add('hidden');ui.result.classList.remove('show');canvas.focus?.();
  dangerAudio.pause();dangerAudio.currentTime=0;dangerAudio.volume=.95;dangerLatched=false;sound(55,.8,'sawtooth',.08);startMusic();setTimeout(()=>say('difficulty.start',2600,{difficulty:tr(difficulties[selectedCharacter].nameKey)}),500);
}
let resultSnapshot=null;
function localizeDeath(reason){if(!reason)return tr('result.defaultDeath');const params={...(reason.params||{})};if(params.enemyKey){params.enemy=tr(params.enemyKey,params.enemyParams);delete params.enemyKey;delete params.enemyParams;}return tr(reason.key,params);}
function chooseEnding(win){
  if(win&&hearts===3&&itemPickups.every(i=>i.userData.collected)&&rescuedCows>=10)return'ending.super';
  if(win&&rescuedCows>=7)return'ending.herd';
  if(win)return'ending.alone';
  if(deathReason?.key==='death.snow')return'ending.fakeMother';
  return'ending.loop';
}
function renderResult(){if(!resultSnapshot)return;const {win,runDistance,exactTime,reason,endingKey}=resultSnapshot;ui.result.classList.toggle('dead',!win);ui.result.classList.toggle('escaped',win);ui.eyebrow.textContent=tr(win?'result.exitFound':'result.deathConfirmed');ui.title.textContent=tr(win?'result.winTitle':'result.deadTitle');ui.resultText.innerHTML=tr(win?'result.win':'result.dead',{distance:runDistance,time:exactTime,reason:localizeDeath(reason)})+`<br><strong>${tr(endingKey)}</strong>`;}
function end(win){
  state=win?'win':'caught';recordScore(win);clearTimeout(hauntTimer);watchers.forEach(w=>w.visible=false);snowGhost.visible=false;snow.visible=false;document.body.classList.remove('playing','death-maul','exhausted','enemy-near','terror-flash','flash-negative','apparition','blackout','blood-flash','heartbeat','otherworld','snow-haunting','rain-active','safe-warm','safe-cold','safe-broken');ui.result.classList.add('show');
  const runDistance=Math.max(0,Math.min(runLength,Math.round(18-player.position.z))),exactTime=formatTime(Math.round(elapsed*1000));
  resultSnapshot={win,runDistance,exactTime,reason:deathReason,endingKey:chooseEnding(win)};renderResult();
  dangerAudio.pause();dangerAudio.currentTime=0;dangerLatched=false;stopMusic();sound(win?220:38,1.5,'sawtooth',.1);
}
document.querySelector('#startBtn').onclick=start;document.querySelector('#restartBtn').onclick=start;
document.querySelector('#scoreBtn').onclick=()=>{renderScores();scoreboard.classList.add('show');scoreboard.setAttribute('aria-hidden','false');};
document.querySelector('#closeScoreBtn').onclick=()=>{scoreboard.classList.remove('show');scoreboard.setAttribute('aria-hidden','true');};
let installHintKey='install.default';function showInstallHint(key){installHintKey=key;installText.textContent=tr(key);installHint.classList.add('show');installHint.setAttribute('aria-hidden','false');}
installBtn.onclick=async()=>{
  if(matchMedia('(display-mode: standalone)').matches||navigator.standalone){showInstallHint('install.already');return;}
  if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return;}
  const inWechat=/MicroMessenger/i.test(navigator.userAgent),ios=/iPad|iPhone|iPod/i.test(navigator.userAgent);
  showInstallHint(inWechat?'install.wechat':ios?'install.ios':'install.other');
};
document.querySelector('#closeInstallBtn').onclick=()=>{installHint.classList.remove('show');installHint.setAttribute('aria-hidden','true');};
addEventListener('appinstalled',()=>{deferredInstallPrompt=null;installBtn.classList.add('installed');installBtn.querySelector('span').textContent=tr('install.installed');});
document.querySelector('#changeBtn').onclick=()=>{
  stopMusic();state='intro';hearts=3;renderHearts();document.body.classList.remove('playing');ui.result.classList.remove('show');ui.intro.classList.remove('hidden');
  clearTimeout(hauntTimer);watchers.forEach(w=>w.visible=false);snowGhost.visible=false;snow.visible=false;document.body.classList.remove('exhausted','enemy-near','terror-flash','flash-negative','apparition','blackout','blood-flash','heartbeat','otherworld','snow-haunting','rain-active','safe-warm','safe-cold','safe-broken');
  player.position.set(0,.05,18);player.rotation.set(0,0,0);storyStage=0;activeChasers=[];allEnemies.forEach(e=>e.visible=false);hunterGlow.visible=false;
  playTitleCry();
};
document.querySelectorAll('.character').forEach(button=>button.addEventListener('click',()=>{
  if(state!=='intro')return;
  selectedCharacter=button.dataset.character;document.querySelectorAll('.character').forEach(b=>b.classList.toggle('active',b===button));
  const old=player;player=createCharacter(selectedCharacter);player.position.copy(old.position);player.rotation.y=0;scene.remove(old);scene.add(player);renderHearts();sound(120,.12,'square',.025);
}));
const movementCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight']);
addEventListener('keydown',e=>{if(movementCodes.has(e.code)){e.preventDefault();keys[e.code]=true;}if(e.code==='Escape'){scoreboard.classList.remove('show');scoreboard.setAttribute('aria-hidden','true');}if(e.code==='Enter'&&state==='intro'&&!scoreboard.classList.contains('show'))start();if(e.code==='KeyR'&&state!=='playing'&&!scoreboard.classList.contains('show'))start();});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>{Object.keys(keys).forEach(key=>delete keys[key]);resetJoystick();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){Object.keys(keys).forEach(key=>delete keys[key]);resetJoystick();}});
document.querySelectorAll('.mobile-controls button').forEach(b=>{
  const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));
  b.addEventListener('touchstart',e=>{e.preventDefault();keys[k]=true},{passive:false});['touchend','touchcancel'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false,{passive:false}));
});
const joystickEl=document.querySelector('#joystick'),joystickKnob=document.querySelector('#joystickKnob');
function moveJoystick(e){
  const r=joystickEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,limit=r.width*.31;
  let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy);if(len>limit){dx*=limit/len;dy*=limit/len;}
  joystick.x=dx/limit;joystick.y=dy/limit;joystickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}
let joystickPointer=null,joystickTouch=null,joystickHeldAt=0;
joystickEl.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;joystickHeldAt=performance.now();joystickEl.classList.add('active');try{joystickEl.setPointerCapture(e.pointerId)}catch{}moveJoystick(e);});
joystickEl.addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId){e.preventDefault();moveJoystick(e);}},{passive:false});
function resetJoystick(){joystickPointer=null;joystickTouch=null;joystickHeldAt=0;joystick.x=joystick.y=0;joystickKnob.style.transform='translate(0,0)';joystickEl.classList.remove('active');}
joystickEl.addEventListener('pointerup',resetJoystick);joystickEl.addEventListener('pointercancel',resetJoystick);addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)moveJoystick(e);},{passive:false});addEventListener('pointerup',resetJoystick);addEventListener('pointercancel',resetJoystick);
function trackedTouch(event){return [...Array.from(event.changedTouches||[]),...Array.from(event.touches||[])].find(touch=>joystickTouch===null||touch.identifier===joystickTouch);}
joystickEl.addEventListener('touchstart',e=>{e.preventDefault();const touch=e.changedTouches[0];if(!touch)return;joystickTouch=touch.identifier;joystickHeldAt=performance.now();joystickEl.classList.add('active');moveJoystick(touch);},{passive:false});
joystickEl.addEventListener('touchmove',e=>{e.preventDefault();const touch=trackedTouch(e);if(touch&&touch.identifier===joystickTouch)moveJoystick(touch);},{passive:false});
joystickEl.addEventListener('touchend',e=>{if(Array.from(e.changedTouches||[]).some(touch=>touch.identifier===joystickTouch))resetJoystick();},{passive:false});joystickEl.addEventListener('touchcancel',resetJoystick,{passive:false});
document.addEventListener('touchmove',e=>{if(joystickTouch===null)return;const touch=trackedTouch(e);if(touch&&touch.identifier===joystickTouch){e.preventDefault();moveJoystick(touch);}},{passive:false});document.addEventListener('touchend',e=>{if(Array.from(e.changedTouches||[]).some(touch=>touch.identifier===joystickTouch))resetJoystick();},{passive:false});document.addEventListener('touchcancel',resetJoystick,{passive:false});

function glitch(){document.body.classList.add('glitch');sound(48,.1,'square',.03);setTimeout(()=>document.body.classList.remove('glitch'),80+Math.random()*160);}
function terrorFlash(){
  const key=`flash.${Math.floor(Math.random()*5)}`;
  document.querySelector('.horror-overlay span').textContent=tr(key);document.body.classList.remove('terror-flash','flash-negative');void document.body.offsetWidth;document.body.classList.add('terror-flash');if(Math.random()>.48)document.body.classList.add('flash-negative');
  shake=Math.max(shake,.65);horrorSound(Math.random()>.5?1:2);
  setTimeout(()=>document.body.classList.remove('terror-flash','flash-negative'),840);
}
function spawnBloodBurst(x,z,amount=22){
  const group=new THREE.Group(),red=flat(0x9d0805),darkRed=flat(0x300000);const pool=mesh(new THREE.CircleGeometry(1.85,10),darkRed,group,0,.025,0,[1,.72,1],[-Math.PI/2,0,Math.random()*Math.PI]);pool.castShadow=false;const drops=[];
  for(let i=0;i<amount;i++){const d=mesh(new THREE.DodecahedronGeometry(.08+Math.random()*.16,0),red,group,0,.7,0);d.userData.velocity=new THREE.Vector3((Math.random()-.5)*7,2+Math.random()*6,(Math.random()-.5)*7);drops.push(d);}group.position.set(x,0,z);scene.add(group);bloodEffects.push({group,drops,age:0});
}
function beginPlayerDeath(attacker,reasonKey,reasonParams={}){
  if(state!=='playing')return;state='dying';deathElapsed=0;nextDeathBlood=.5;deathAttacker=attacker;deathReason={key:reasonKey,params:reasonParams};document.body.classList.add('death-maul','enemy-near');ui.warning.classList.remove('show');setMission('event.caughtMission');say('event.maul',2700);terrorFlash();spawnBloodBurst(player.position.x,player.position.z,28);sound(25,1.1,'sawtooth',.16);shake=1.4;
}
function bloodyAttack(cow,enemy){
  if(cow.userData.eaten)return;const actorIndex=animalActors.indexOf(cow),victim=enemy.userData.herdIndex??(actorIndex<0?0:actorIndex);cow.userData.eaten=true;cow.rotation.z=Math.PI/2;cow.position.y=.42;enemy.userData.feeding=2.8;enemy.userData.victim=cow;shake=.8;terrorFlash();say(herdCaughtLines[victim%herdCaughtLines.length],2500);
  const group=new THREE.Group(),red=flat(0x7e0906),darkRed=flat(0x330000);
  const pool=mesh(new THREE.CircleGeometry(1.65,9),darkRed,group,0,.025,0,[1,.7,1],[-Math.PI/2,0,Math.random()]);pool.castShadow=false;
  const drops=[];for(let i=0;i<16;i++){const d=mesh(new THREE.DodecahedronGeometry(.08+Math.random()*.13,0),red,group,0,.6,0);d.userData.velocity=new THREE.Vector3((Math.random()-.5)*6,2+Math.random()*5,(Math.random()-.5)*6);drops.push(d);}
  group.position.set(cow.position.x,0,cow.position.z);scene.add(group);bloodEffects.push({group,drops,age:0});sound(29,.8,'sawtooth',.12);
}
function npcCanBeAttacked(npc){
  if(!npc.visible||npc.userData.eaten||npc.userData.escaped)return false;
  const safeZone=safeZones.find(zone=>npc.parent===zone);return !safeZone||safeZone.userData.broken;
}
function animateCow(cow,t,speed){
  cow.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.55);
  cow.userData.arms.forEach((a,i)=>a.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.42);
  cow.rotation.z=Math.sin(t*speed*.5)*.025;
}
function animatePlayer(cow,t,moving,sprinting){
  if(cow.userData.canCrawl&&sprinting){
    cow.rotation.x=THREE.MathUtils.lerp(cow.rotation.x,-1.02,.18);cow.position.y=THREE.MathUtils.lerp(cow.position.y,.64,.18);cow.rotation.z=Math.sin(t*18)*.04;
    if(cow.userData.head)cow.userData.head.rotation.x=THREE.MathUtils.lerp(cow.userData.head.rotation.x,.72,.2);
    cow.userData.arms.forEach((a,i)=>{a.rotation.x=Math.sin(t*18+i*Math.PI)*.7-.52;a.rotation.z=THREE.MathUtils.lerp(a.rotation.z,i?-.48:.48,.2);});
    cow.userData.legs.forEach((l,i)=>{l.rotation.x=Math.sin(t*18+i*Math.PI)*.62+.34;l.rotation.z=THREE.MathUtils.lerp(l.rotation.z,i?-.12:.12,.2);});
  }else{
    cow.rotation.x=THREE.MathUtils.lerp(cow.rotation.x,0,.2);cow.position.y=THREE.MathUtils.lerp(cow.position.y,.05,.18);if(cow.userData.head)cow.userData.head.rotation.x=THREE.MathUtils.lerp(cow.userData.head.rotation.x,0,.2);cow.userData.arms.forEach((a,i)=>a.rotation.z=THREE.MathUtils.lerp(a.rotation.z,i?-.16:.16,.2));cow.userData.legs.forEach(l=>l.rotation.z=THREE.MathUtils.lerp(l.rotation.z,0,.2));animateCow(cow,t,moving?10:1);
  }
  const damage=3-hearts;if(damage){cow.rotation.z+=Math.sin(t*(damage===2?7:4.5))*(damage===2?.1:.045);if(!sprinting)cow.rotation.x-=damage*.075;if(cow.userData.head){cow.userData.head.rotation.z=THREE.MathUtils.lerp(cow.userData.head.rotation.z||0,damage*.1,.16);}if(cow.userData.arms?.[0])cow.userData.arms[0].rotation.x-=damage*.18;}
}
function placeChaser(enemy,xOffset,zOffset,speed){enemy.position.set(player.position.x+xOffset,.05,player.position.z+zOffset);enemy.visible=true;enemy.userData.chaseSpeed=speed;activeChasers.push(enemy);}
function updateStoryWave(progress){
  const mode=difficulties[selectedCharacter];
  if(storyStage===0&&(progress>18||elapsed>2.5)){
    storyStage=1;const pack=[[-12,36],[-7,31],[-2,39],[3,33],[8,40],[13,35]];wolfPack.slice(0,mode.pack).forEach((e,i)=>placeChaser(e,pack[i][0],pack[i][1],6.85+(i%3)*.16));say('event.pack',2200,{count:mode.pack});glitch();
  }
  if(storyStage===1&&(progress>mode.wave2At||elapsed>mode.wave2Time)){
    storyStage=2;stalkers.slice(0,mode.stalkers).forEach((e,i)=>{const side=i%2?-1:1,rank=Math.floor(i/2);placeChaser(e,side*(12+rank*5),46+rank*4,e.userData.type==='beast'?7.5:7.2);});say('event.more',2600);
  }
  if(storyStage===2&&(progress>mode.carAt||elapsed>mode.carTime)){
    storyStage=3;placeChaser(monsterCar,0,62,10.2);hunterGlow.visible=true;say('event.car',3200);sound(31,1.6,'sawtooth',.14);glitch();
  }
}
function tick(){
  requestAnimationFrame(tick);const dt=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;
  const rp=rainGeo.attributes.position.array;
  for(let i=0;i<rainCount;i++){
    const p=i*6,nx=rp[p]-dt*3,ny=rp[p+1]-rainSpeed[i]*dt;
    if(ny<-3){rp[p]=(Math.random()-.5)*100;rp[p+1]=45+Math.random()*5;rp[p+2]=(Math.random()-.5)*100;}else{rp[p]=nx;rp[p+1]=ny;}
    rp[p+3]=rp[p]+.2;rp[p+4]=rp[p+1]-rainLength[i];rp[p+5]=rp[p+2];
  }
  rainGeo.attributes.position.needsUpdate=true;rain.position.set(player.position.x,0,player.position.z);rainMat.opacity=(.22+Math.sin(t*.17)*.07)*difficulties[selectedCharacter].rain;
  if(snow.visible){const sp=snowGeo.attributes.position.array;for(let i=0;i<snowCount;i++){const p=i*3;sp[p]+=(Math.sin(t*.8+i)*1.8-3.6)*dt;sp[p+1]-=(5+Math.sin(i)*2)*dt;if(sp[p+1]<-2){sp[p]=(Math.random()-.5)*90;sp[p+1]=38+Math.random()*5;sp[p+2]=(Math.random()-.5)*90;}}snowGeo.attributes.position.needsUpdate=true;snow.position.set(player.position.x,0,player.position.z);snow.material.opacity=.92*snowBlend;}
  gateRing.rotation.z=t*.42;gateRing.scale.setScalar(1+Math.sin(t*2.1)*.055);gateBeam.material.opacity=.1+Math.sin(t*1.5)*.055;beacon.intensity=230+Math.sin(t*2.4)*70;gateSign.material.opacity=.78+Math.sin(t*2.2)*.22;
  strangeBirds.forEach((b,i)=>{
    b.position.z-=b.userData.speed*dt;b.position.x+=Math.sin(t*.7+b.userData.phase)*dt*1.7;b.position.y+=Math.sin(t*1.1+b.userData.phase)*dt*.18;
    if(b.position.z<player.position.z-68){b.position.z=player.position.z+42+Math.random()*38;b.position.x=player.position.x+(Math.random()-.5)*62;b.position.y=9+Math.random()*15;}
    const flap=.5+Math.abs(Math.sin(t*(7+i%4)+b.userData.phase))*1.05;b.userData.wings[0].rotation.z=flap;b.userData.wings[1].rotation.z=-flap;
  });
  bloodEffects.forEach(f=>{f.age+=dt;f.drops.forEach(d=>{if(d.position.y>.06||d.userData.velocity.y>0){d.position.addScaledVector(d.userData.velocity,dt);d.userData.velocity.y-=12*dt;if(d.position.y<.05){d.position.y=.05;d.userData.velocity.set(0,0,0);}}});});
  if(state==='dying'){
    deathElapsed+=dt;player.rotation.z=THREE.MathUtils.lerp(player.rotation.z,Math.PI/2,.16);player.position.y=THREE.MathUtils.lerp(player.position.y,.48,.12);shake=Math.max(shake,.35+Math.abs(Math.sin(t*15))*.45);
    if(deathAttacker){deathAttacker.position.x=THREE.MathUtils.lerp(deathAttacker.position.x,player.position.x,.08);deathAttacker.position.z=THREE.MathUtils.lerp(deathAttacker.position.z,player.position.z+1.15,.08);deathAttacker.position.y=.05+Math.abs(Math.sin(t*12))*.24;deathAttacker.rotation.y=Math.PI;deathAttacker.userData.arms?.forEach((a,i)=>a.rotation.x=Math.sin(t*14+i*Math.PI)*.7);deathAttacker.userData.legs?.forEach((l,i)=>l.rotation.x=Math.sin(t*14+i*Math.PI)*.55);}
    if(deathElapsed>=nextDeathBlood){nextDeathBlood+=.72;if(hearts>0){hearts--;renderHearts(true);}spawnBloodBurst(player.position.x+(Math.random()-.5)*.7,player.position.z+(Math.random()-.5)*.7,8);sound(28+Math.random()*18,.18,'sawtooth',.07);}
    if(hearts<=0&&deathElapsed>2.55)end(false);
  }
  if(state==='playing'){
    elapsed+=dt;
    if(elapsed>=nextWeatherChange){weatherActive=!weatherActive;nextWeatherChange=elapsed+(weatherActive?10+Math.random()*20:7+Math.random()*18);if(weatherActive){sound(currentChapter===2?118:46,.8,'sawtooth',.035);}}
    if(elapsed>=nextTerrorFlash){const mode=difficulties[selectedCharacter];terrorFlash();nextTerrorFlash=elapsed+mode.flashMin+Math.random()*mode.flashRange;}
    if(elapsed>=nextHaunt){triggerHaunt();const fear=selectedCharacter==='leopard'?4:selectedCharacter==='yellow'?6:8;nextHaunt=elapsed+fear+Math.random()*8;}
    // 镜头面向世界 +Z：世界 +X 投影到屏幕左侧，世界 +Z 投影到屏幕上方。
    // 因此键盘与摇杆都严格按屏幕方向换算，W/A/S/D 分别就是上/左/下/右。
    // 极少数 iOS 微信 WebView 会吞掉拖动事件：持续按住摇杆中心时，自动给出向前输入，避免假死。
    if(joystickHeldAt&&performance.now()-joystickHeldAt>180&&Math.hypot(joystick.x,joystick.y)<.08){joystick.y=.72;joystickKnob.style.transform='translate(0,28px)';}
    let x=(keys.KeyA||keys.ArrowLeft?1:0)-(keys.KeyD||keys.ArrowRight?1:0)-joystick.x;
    let z=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-joystick.y;
    const moving=x||z,wantsSprint=(keys.ShiftLeft||keys.ShiftRight)&&moving,sprint=wantsSprint&&!exhausted&&stamina>0;
    const difficulty=difficulties[selectedCharacter],speed=gameCore.movement_speed(sprint?1:0,exhausted?1:0)*difficulty.player;
    stamina=gameCore.update_stamina(stamina,dt*(sprint?difficulty.drain:difficulty.recovery),moving?1:0,wantsSprint?1:0,exhausted?1:0,sprint?1:0);
    if(sprint){
      if(stamina<=0){exhausted=true;document.body.classList.add('exhausted');say('event.tired',2300);sound(43,.75,'sawtooth',.11);}
    }else{
      if(exhausted&&stamina>=32){exhausted=false;document.body.classList.remove('exhausted');say('event.recovered',1200);sound(132,.24,'triangle',.045);}
    }
    if(moving){const len=Math.hypot(x,z);x/=len;z/=len;player.position.x+=x*speed*dt;player.position.z+=z*speed*dt;player.rotation.y=Math.atan2(-x,-z);}
    player.position.x=THREE.MathUtils.clamp(player.position.x,-59,59);player.position.z=Math.min(24,player.position.z);
    // 树、石头、铁网与路障都使用实体圆形碰撞体，不能再直接穿模。
    let collided=false;for(const o of obstacles){const radius=(o.userData.collisionRadius||2.1)+1.05,dx=player.position.x-o.position.x,dz=player.position.z-o.position.z,d2=dx*dx+dz*dz;if(d2<radius*radius){const d=Math.max(.001,Math.sqrt(d2)),push=radius-d;player.position.x+=dx/d*push;player.position.z+=dz/d*push;collided=true;}}
    if(collided&&elapsed-lastCollisionSound>.45){lastCollisionSound=elapsed;sound(72,.12,'square',.035);shake=Math.max(shake,.12);}
    animatePlayer(player,t,Boolean(moving),Boolean(sprint));
    const progress=-player.position.z;updateStoryWave(progress);
    updateChapter(progress);let safeProtected=updateSafeZone(progress,dt,t,Boolean(moving));
    const objective=updateObjectives(progress,dt,t,Boolean(moving),safeProtected);safeProtected=objective.protectedZone;
    if(progress>runLength*.145)storyHerd.forEach((cow,i)=>{if(cow.userData.escaped||cow.userData.eaten)return;cow.visible=true;cow.userData.active=true;cow.position.z-=dt*(4.7+(i%3)*.16);cow.position.x+=Math.sin(t*1.7+i)*dt*.34;animateCow(cow,t,9+i%3);if(cow.position.z<exitZ-20){cow.userData.escaped=true;cow.visible=false;}});
    const snowStart=runLength*.4,snowEnd=runLength*.6,snowChapter=progress>snowStart&&progress<snowEnd,snowActive=snowChapter&&weatherActive,rainActive=weatherActive&&!snowChapter;
    snowBlend=THREE.MathUtils.lerp(snowBlend,snowActive?1:0,1-Math.pow(.0005,dt));snow.visible=snowBlend>.015;document.body.classList.toggle('snow-haunting',snowBlend>.28);document.body.classList.toggle('rain-active',rainActive);
    let baseBg=selectedCharacter==='orange'?0x93a07a:selectedCharacter==='yellow'?0x84926c:0x626a59,groundBase=0x59683d;if(currentChapter===1){baseBg=0x526158;groundBase=0x334737;}else if(currentChapter===3){baseBg=0x433831;groundBase=0x382f29;}else if(currentChapter===4){baseBg=0x3c2522;groundBase=0x2c201e;}scene.background.set(baseBg).lerp(snowBgColor,snowBlend*.86);scene.fog.color.set(baseBg).lerp(snowFogColor,snowBlend*.8);scene.fog.density=difficulty.fog*(1.08+snowBlend*1.45+(currentChapter===1?.42:currentChapter>=3?.3:0));ground.material.color.set(groundBase).lerp(snowGroundColor,snowBlend*.82);rainMat.opacity=rainActive?(currentChapter===2?.12:.5)*(1-snowBlend*.78):0;
    if(snowStage===0&&snowChapter){snowStage=1;snowGhost.position.set(player.position.x+(Math.random()<.5?-1:1)*9,.1,player.position.z+35);snowGhost.visible=true;terrorFlash();say('event.snowStart',3600);}
    if(snowStage===1&&progress>snowStart+(snowEnd-snowStart)*.48){snowStage=2;snowGhost.position.set(player.position.x+(Math.random()<.5?-1:1)*5,.1,player.position.z+19);terrorFlash();say('event.snowNear',3000);}
    if(snowStage<3&&progress>=snowEnd){snowStage=3;snowGhost.visible=false;terrorFlash();say('event.snowEnd',3200);}
    herdCows.forEach((cow,i)=>{
      const enemy=ambushers[i];if(cow.userData.eaten){if(enemy.userData.feeding>0){enemy.userData.feeding-=dt;enemy.userData.headBob=(enemy.userData.headBob||0)+dt;enemy.position.y=.05+Math.abs(Math.sin(t*12))*.18;}else if(!enemy.userData.joined){enemy.userData.joined=true;enemy.position.y=.05;enemy.userData.chaseSpeed=7.15+(i%3)*.14;activeChasers.push(enemy);}return;}
      if(!cow.visible)return;if(!cow.userData.active&&Math.abs(player.position.z-cow.position.z)<58){cow.userData.active=true;enemy.visible=!enemy.userData.disabled;if(!cow.userData.announced){cow.userData.announced=true;say(herdFleeLines[i%herdFleeLines.length],2300);}}
      if(!cow.userData.active)return;
      const cowSpeed=cow.userData.super?11.2:5.35+(i%3)*.32;cow.position.z-=cowSpeed*dt;cow.position.x+=Math.sin(t*1.4+i)*dt*(cow.userData.super?.85:.45);cow.userData.legs.forEach((l,n)=>l.rotation.x=Math.sin(t*(cow.userData.super?17:12)+n*Math.PI)*.58);if(cow.userData.halo){cow.userData.halo.rotation.z+=dt*2.8;cow.userData.halo.scale.setScalar(1+Math.sin(t*5)*.09);}
      if(cow.userData.super&&cow.position.z<exitZ+5){cow.userData.escaped=true;cow.visible=false;enemy.userData.joined=true;enemy.userData.chaseSpeed=7.15;activeChasers.push(enemy);say('event.superCow',3000);sound(260,.55,'triangle',.09);return;}
      if(enemy.userData.disabled)return;
      const chase=new THREE.Vector3().subVectors(cow.position,enemy.position),d=chase.length();enemy.position.addScaledVector(chase.normalize(),(cow.userData.super?7.1:7.05+i*.08)*dt);enemy.rotation.y=Math.atan2(-chase.x,-chase.z);animateCow(enemy,t,11);
      if(d<2.05)bloodyAttack(cow,enemy);
    });
    strangeTravellers.forEach((c,i)=>{if(c.userData.eaten)return;if(!c.userData.fleeing&&Math.abs(player.position.z-c.position.z)<72)c.userData.fleeing=true;if(c.userData.fleeing){c.position.z-=(5.6+i*.4)*dt;c.position.x+=Math.sin(t*1.2+i)*dt*.35;animateCow(c,t,9+i);}});
    let nearest=999;
    if(snowGhost.visible&&!safeProtected){const ghostV=new THREE.Vector3().subVectors(player.position,snowGhost.position);ghostV.y=0;const ghostD=ghostV.length();nearest=Math.min(nearest,ghostD);snowGhost.position.addScaledVector(ghostV.normalize(),(8.4+elapsed*.018)*difficulty.enemy*dt);snowGhost.position.y=.18+Math.sin(t*2.4)*.28;snowGhost.rotation.y=Math.atan2(-ghostV.x,-ghostV.z);snowGhost.rotation.z=Math.sin(t*3.1)*.035;if(ghostD<2.75)damageHeart('event.heartLost',snowGhost,'death.snow');}
    for(const enemy of activeChasers){
      if(safeProtected)continue;
      if(enemy.userData.feeding>0){enemy.userData.feeding-=dt;enemy.position.y=.05+Math.abs(Math.sin(t*13))*.2;enemy.userData.arms?.forEach((arm,i)=>arm.rotation.x=Math.sin(t*15+i*Math.PI)*.72);continue;}enemy.position.y=enemy.userData.type==='car'?0:.05;enemy.userData.victim=null;
      let target=player,targetNpc=null,targetDistance=Math.hypot(player.position.x-enemy.position.x,player.position.z-enemy.position.z);
      // 追猎者会在路边牛群和逃难动物中挑选更近的猎物；NPC 必须先奔逃，随后才可能被扑倒撕咬。
      for(const npc of animalActors){if(!npcCanBeAttacked(npc))continue;npc.getWorldPosition(collisionPoint);const nd=Math.hypot(collisionPoint.x-enemy.position.x,collisionPoint.z-enemy.position.z);if(nd<24&&nd<targetDistance*.92){target=npc;targetNpc=npc;targetDistance=nd;}}
      const targetPosition=targetNpc?(targetNpc.getWorldPosition(new THREE.Vector3())):player.position,v=new THREE.Vector3().subVectors(targetPosition,enemy.position);v.y=0;const d=v.length();nearest=Math.min(nearest,Math.hypot(player.position.x-enemy.position.x,player.position.z-enemy.position.z));
      const timeBoost=gameCore.enemy_time_boost(elapsed,enemy.userData.type==='car'?1:0);
      enemy.position.addScaledVector(v.normalize(),(enemy.userData.chaseSpeed+timeBoost)*difficulty.enemy*dt);
      if(enemy.userData.type!=='car')enemy.position.x+=Math.sin(t*1.8+activeChasers.indexOf(enemy)*1.7)*dt*.65;
      enemy.rotation.y=Math.atan2(-v.x,-v.z);
      if(enemy.userData.type==='car')enemy.userData.wheels.forEach(w=>w.rotation.x+=dt*9);else animateCow(enemy,t,enemy.userData.type==='beast'?13:9);
      if(targetNpc&&d<(enemy.userData.type==='car'?5.4:2.65)){bloodyAttack(targetNpc,enemy);continue;}
      if(!targetNpc&&d<(enemy.userData.type==='car'?6.2:3.3)){shake=1;document.body.classList.add('hit');setTimeout(()=>document.body.classList.remove('hit'),400);damageHeart('event.heartLost',enemy,'death.enemy',{enemyKey:enemy.userData.enemyKey||'enemy.them',enemyParams:enemy.userData.enemyParams});}
    }
    if(monsterCar.visible)hunterGlow.position.set(monsterCar.position.x,4,monsterCar.position.z-3);
    industrialLights.forEach((lamp,i)=>lamp.intensity=(document.body.classList.contains('otherworld')?42:12)*(Math.sin(t*(3.5+i*.17)+i*2)>0.45?1:0));
    const nextSpeedLevel=Math.floor(elapsed/12);if(nextSpeedLevel>speedLevel){speedLevel=nextSpeedLevel;say('difficulty.speedUp',1800,{level:speedLevel+1});sound(96+speedLevel*18,.32,'square',.055);}
    if(!safeProtected)for(const snake of snakes){snake.userData.segments.forEach((s,i)=>s.position.x=Math.sin(t*2+i*.72)*1.4);const d=Math.hypot(player.position.x-snake.position.x,player.position.z-snake.position.z);nearest=Math.min(nearest,d);if(d<4.2){stamina=Math.max(0,stamina-25*difficulty.hazard*dt);player.position.x+=(player.position.x-snake.position.x)*dt*2.5;shake=.28;damageHeart('event.snakeHit',snake,'death.snake');}}
    if(!safeProtected)for(const tree of treeEnemies){tree.userData.arms.forEach((a,i)=>a.rotation.z+=(i?1:-1)*dt*.45);const d=Math.hypot(player.position.x-tree.position.x,player.position.z-tree.position.z);nearest=Math.min(nearest,d);if(d<5.2){stamina=Math.max(0,stamina-18*difficulty.hazard*dt);shake=.2;damageHeart('event.treeHit',tree,'death.tree');}}
    // 所有地面动物都有实体体积：会挡住玩家，也会被树、石块和废墟推开，避免穿模直线跑过障碍。
    animalActors.forEach(animal=>{const safeParent=safeZones.find(zone=>animal.parent===zone),movingNpc=animal.userData.active||animal.userData.fleeing||(finalWaveStarted&&finalHerd.includes(animal))||Boolean(safeParent?.userData.broken);if(movingNpc)steerNpcAroundObstacles(animal,dt);resolveAnimalWorldCollision(animal,animal.userData.isNpc?1.05:1.25);});
    activeChasers.forEach(animal=>{if(!animalActors.includes(animal))resolveAnimalWorldCollision(animal,animal.userData.type==='car'?3.5:1.35);});
    resolvePlayerAnimalCollision();
    if(smokeCharges&&nearest<12){smokeCharges=0;activeChasers.forEach(e=>{if(e.visible)e.position.z+=28;});if(snowGhost.visible)snowGhost.position.z+=24;say('item.smokeUsed',2200);document.body.classList.add('smoke-screen');setTimeout(()=>document.body.classList.remove('smoke-screen'),1500);sound(48,.8,'sawtooth',.1);nearest=36;}
    document.body.classList.toggle('heartbeat',nearest<15);if(radioGain&&audio)radioGain.gain.setTargetAtTime(nearest<(radioOwned?70:45)?THREE.MathUtils.mapLinear(Math.max(6,nearest),6,radioOwned?70:45,.25,.012):.002,audio.currentTime,.08);
    if(nearest<26&&!dangerLatched){
      dangerLatched=true;document.body.classList.add('enemy-near');dangerAudio.currentTime=0;dangerAudio.play().catch(()=>{});terrorFlash();
      if(musicMaster){musicMaster.gain.cancelScheduledValues(audio.currentTime);musicMaster.gain.setTargetAtTime(.065,audio.currentTime,.12);}
    }else if(nearest>34&&dangerLatched){
      dangerLatched=false;document.body.classList.remove('enemy-near');if(musicMaster){musicMaster.gain.cancelScheduledValues(audio.currentTime);musicMaster.gain.setTargetAtTime(.19,audio.currentTime,.3);}
    }
    if(nearest<18&&!ui.warning.classList.contains('show')){ui.warning.classList.add('show');sound(62,.7,'sawtooth',.08);setTimeout(()=>ui.warning.classList.remove('show'),1200);}
    if(player.position.z<exitZ+8&&Math.abs(player.position.x-22)>11)player.position.z=exitZ+8;
    if(state==='playing'&&player.position.z<exitZ+6&&Math.abs(player.position.x-22)<=11)end(true);
    distance=Math.max(0,(player.position.z-exitZ));ui.distance.textContent=Math.floor(distance)+tr('world.m');ui.stamina.style.width=stamina+'%';
    setMission(objective.missionKey|| (distance<180?'event.exitNear':nearest<16?'event.enemyNear':'hud.defaultMission'),objective.missionParams);
    lines.forEach((line,i)=>{if(progress>line[0]*runLength&&lastLine<i){lastLine=i;say(line[1]);if(i===2||i===5)glitch();}});
    if(Math.random()<dt*.018)glitch();
  }
  const narrow=mobileDevice||innerWidth<700;
  // 镜头位于奔跑方向前方：角色朝屏幕下方跑，且始终能看到正脸和身后的敌人。
  const desired=state==='intro'
    ? new THREE.Vector3(player.position.x+2.3,narrow?10:8.5,player.position.z-(narrow?10:11))
    : new THREE.Vector3(player.position.x*(narrow?.86:.74)+(narrow?.8:2.2),narrow?24:19,player.position.z-(narrow?13:18));
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=.88;}
  const panic=state==='playing'?(dangerLatched?Math.sin(t*7)*1.25:Math.sin(t*.7)*.22):0;if(Math.abs(camera.fov-(66+panic))>.02){camera.fov=66+panic;camera.updateProjectionMatrix();}
  if(state==='intro')camera.lookAt(player.position.x,2.5,player.position.z);
  else camera.lookAt(player.position.x,narrow?1.2:1.8,player.position.z+(narrow?5:8));
  renderer.render(scene,camera);
}
tick();
function resizeGame(){const w=Math.round(window.visualViewport?.width||innerWidth),h=Math.round(window.visualViewport?.height||innerHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);canvas.style.width=w+'px';canvas.style.height=h+'px';}
addEventListener('resize',resizeGame);window.visualViewport?.addEventListener('resize',resizeGame);addEventListener('orientationchange',()=>setTimeout(resizeGame,250));
document.addEventListener('touchmove',e=>{if(state==='playing')e.preventDefault();},{passive:false});document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
resizeGame();

// 仅开发构建使用的章节验收入口；生产包会被 Vite 完全移除。
if(import.meta.env.DEV)window.__NIULAI_TEST__={
  jump(ratio,x=0){player.position.set(x,.05,18-runLength*ratio);},
  weather(active){weatherActive=Boolean(active);nextWeatherChange=elapsed+999;},
  collisionProbe(){const animal=storyHerd[0],obstacle=obstacles.find(o=>o.position.z<0);animal.visible=true;animal.userData.escaped=false;animal.position.set(obstacle.position.x,.05,obstacle.position.z);return true;},
  collisionDistance(){const animal=storyHerd[0],obstacle=obstacles.find(o=>o.position.z<0),v=new THREE.Vector3();animal.getWorldPosition(v);return Math.hypot(v.x-obstacle.position.x,v.z-obstacle.position.z);},
  avoidanceProbe(){const animal=storyHerd[1],obstacle=obstacles.find(o=>o.position.z<-30);animal.visible=true;animal.userData.active=true;animal.userData.eaten=false;animal.userData.escaped=false;animal.position.set(obstacle.position.x,.05,obstacle.position.z+7);return true;},
  avoidanceOffset(){const animal=storyHerd[1],obstacle=obstacles.find(o=>o.position.z<-30),v=new THREE.Vector3();animal.getWorldPosition(v);return Math.abs(v.x-obstacle.position.x);},
  npcAttackProbe(){const npc=storyHerd[0];player.position.set(24,.05,18);npc.position.set(0,.05,8);npc.visible=true;npc.userData.eaten=false;npc.userData.escaped=false;hunter.position.set(0,.05,11);hunter.visible=true;hunter.userData.chaseSpeed=7.4;hunter.userData.feeding=0;activeChasers=[hunter];return true;},
  npcWasEaten(){return Boolean(storyHerd[0].userData.eaten);},
  snapshot(){return{state,progress:-player.position.z,chapter:currentChapter,safe:activeSafeZone,clothCount,switchCount,sheltered,fakeExitTriggered,finalWaveStarted,rescuedCows,rainOpacity:rainMat.opacity,snowOpacity:snow.material.opacity,mission:activeMissionKey,errors:[]};}
};

addEventListener('niulai:languagechange',()=>{refreshLanguageMenu();renderScores();drawExitSign();if(activeSayKey){if(activeSayKey==='difficulty.start')activeSayParams={difficulty:tr(difficulties[selectedCharacter].nameKey)};ui.subtitle.textContent=tr(activeSayKey,activeSayParams);}setMission(activeMissionKey,activeMissionParams);if(currentChapter>=0){chapterNumber.textContent=tr(chapters[currentChapter].number);chapterTitle.textContent=tr(chapters[currentChapter].title);chapterDescription.textContent=tr(chapters[currentChapter].description);}if(resultSnapshot)renderResult();installText.textContent=tr(installHintKey);ui.distance.textContent=Math.floor(distance)+tr('world.m');});

if('serviceWorker' in navigator){
  addEventListener('load',()=>navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL}).catch(()=>{}));
}
