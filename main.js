import * as THREE from 'three';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import {t as tr,initI18n,setLanguage,currentLanguage,locales,languageOrder} from './i18n.js';

initI18n();
const isNativeApp=Capacitor.isNativePlatform();
document.documentElement.classList.toggle('native-app',isNativeApp);

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
const chapterBanner=document.querySelector('#chapterBanner'),chapterNumber=document.querySelector('#chapterNumber'),chapterTitle=document.querySelector('#chapterTitle'),chapterDescription=document.querySelector('#chapterDescription'),npcBubbles=document.querySelector('#npcBubbles'),objectiveArrow=document.querySelector('#objectiveArrow');
const scoreboard=document.querySelector('#scoreboard'),scoreList=document.querySelector('#scoreList');
const installHint=document.querySelector('#installHint'),installText=document.querySelector('#installText'),installBtn=document.querySelector('#installBtn');let deferredInstallPrompt=null;
const languagePicker=document.querySelector('#languagePicker'),languageBtn=document.querySelector('#languageBtn'),languageMenu=document.querySelector('#languageMenu'),languageCurrent=document.querySelector('#languageCurrent');
document.querySelector('#languageOptions').innerHTML=languageOrder.map(code=>`<button role="menuitemradio" data-language="${code}"><i>✓</i><span>${locales[code].nativeName}</span></button>`).join('');
function refreshLanguageMenu(){const {choice}=currentLanguage();languageCurrent.textContent=choice==='auto'?tr('language.auto'):locales[choice].nativeName;languageMenu.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.language===choice)));}
function toggleLanguageMenu(force){const open=force??languageMenu.hidden;languageMenu.hidden=!open;languageBtn.setAttribute('aria-expanded',String(open));if(open)languageMenu.querySelector('[aria-checked="true"]')?.focus();}
languageBtn.onclick=()=>toggleLanguageMenu();languageMenu.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{setLanguage(button.dataset.language);refreshLanguageMenu();toggleLanguageMenu(false);languageBtn.focus();});
languageMenu.addEventListener('keydown',event=>{const buttons=[...languageMenu.querySelectorAll('[data-language]')],index=buttons.indexOf(document.activeElement);if(event.key==='Escape'){toggleLanguageMenu(false);languageBtn.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
document.addEventListener('pointerdown',event=>{if(!languagePicker.contains(event.target))toggleLanguageMenu(false);});refreshLanguageMenu();
if(!isNativeApp)addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;installBtn.classList.add('available');});
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
function classifyDeviceProfile({mobile,ua,width,height,dpr,memory,cores}){
  if(!mobile)return{tier:'high',model:'desktop'};
  const small=Math.round(Math.min(width,height)),large=Math.round(Math.max(width,height)),key=`${small}x${large}`;
  if(/iPhone|iPod/i.test(ua)){
    // Safari 不公开 iPhone 硬件编号；这些 CSS 屏幕规格可稳定覆盖同代性能组，重叠型号再交给实时帧率校准。
    const low=new Set(['320x568','375x667','414x736','375x812']),high=new Set(['393x852','402x874','430x932','440x956']);
    const tier=low.has(key)||large<812?'low':high.has(key)||large>932?'high':'balanced';
    return{tier,model:`iPhone-${key}`};
  }
  if(/iPad/i.test(ua))return{tier:cores<=4?'low':cores>=8?'high':'balanced',model:`iPad-${key}`};
  const pixels=width*height*dpr*dpr,tier=memory<=4||cores<=4||pixels>7_000_000?'low':memory>=8&&cores>=8&&pixels<5_000_000?'high':'balanced';
  return{tier,model:`Android-${key}`};
}
const mobileDevice=matchMedia('(max-width:700px), (pointer:coarse)').matches,cpuCores=Number(navigator.hardwareConcurrency||4),deviceMemory=Number(navigator.deviceMemory||8),
  deviceProfile=classifyDeviceProfile({mobile:mobileDevice,ua:navigator.userAgent,width:screen.width||innerWidth,height:screen.height||innerHeight,dpr:devicePixelRatio||1,memory:deviceMemory,cores:cpuCores}),
  qualityTier=deviceProfile.tier,performanceMode=mobileDevice&&qualityTier!=='high';
document.documentElement.classList.add(`quality-${qualityTier}`);document.documentElement.classList.toggle('performance-mode',performanceMode);
const qualityPresets={
  low:{hills:52,puddles:42,roundTrees:82,deadTrees:118,grass:10000,rain:210,snow:240,birds:9,particles:14},
  balanced:{hills:76,puddles:62,roundTrees:126,deadTrees:178,grass:17000,rain:320,snow:360,birds:13,particles:22},
  high:{hills:110,puddles:95,roundTrees:190,deadTrees:280,grass:mobileDevice?28000:56000,rain:mobileDevice?520:850,snow:mobileDevice?580:900,birds:18,particles:42}
},quality=qualityPresets[qualityTier];
const dprLimits=qualityTier==='low'?{min:.92,start:1.15,max:1.28}:qualityTier==='balanced'?{min:1.02,start:1.35,max:1.65}:mobileDevice?{min:1.25,start:1.7,max:2}:{min:1.75,start:1.75,max:1.75},
  maxRenderDpr=Math.min(devicePixelRatio||1,dprLimits.max),minRenderDpr=Math.min(maxRenderDpr,dprLimits.min);
let renderDpr=Math.min(maxRenderDpr,dprLimits.start),qualitySampleStart=performance.now(),qualityFrameTime=0,qualityFrames=0;
const renderer = new THREE.WebGLRenderer({ canvas, antialias:!performanceMode, powerPreference:'high-performance',precision:performanceMode?'mediump':'highp' });
renderer.setPixelRatio(renderDpr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !performanceMode;
renderer.shadowMap.type = mobileDevice?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xf5f0cf, 0x343b26, 2.1));
const sun = new THREE.DirectionalLight(0xffe9a8, 3.2);
sun.position.set(-30, 55, 25); sun.castShadow = !performanceMode;
sun.shadow.camera.left=-30; sun.shadow.camera.right=30; sun.shadow.camera.top=30; sun.shadow.camera.bottom=-30;
sun.shadow.mapSize.set(mobileDevice?512:1024,mobileDevice?512:1024); scene.add(sun);
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
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(...scale);m.rotation.set(...rot);m.castShadow=!performanceMode;m.receiveShadow=!performanceMode;parent.add(m);return m;
}
function tuft(parent,mat,x,y,z,s=.18,rot=0){return mesh(new THREE.ConeGeometry(s,s*2.4,4),mat,parent,x,y,z,[1,1,1],[0,0,rot]);}

// 有实际高度的草层：单一 InstancedMesh 保持手机性能，同时让角色真正穿过草而不是贴图地板。
function makeGrassGeometry(){const vertices=[];for(let i=0;i<3;i++){const a=i*Math.PI/3,px=Math.cos(a)*.085,pz=Math.sin(a)*.085,lx=Math.cos(a+Math.PI/2)*.12,lz=Math.sin(a+Math.PI/2)*.12;vertices.push(-px,0,-pz,px,0,pz,lx,1,lz);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;}
const grassCount=quality.grass,grassGeo=makeGrassGeometry(),grassMat=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1,side:THREE.DoubleSide});
const grassField=new THREE.InstancedMesh(grassGeo,grassMat,grassCount),grassDummy=new THREE.Object3D(),grassColor=new THREE.Color();
for(let i=0;i<grassCount;i++){
  const x=(Math.random()-.5)*134,z=24-Math.random()*WORLD_DEPTH,path=Math.abs(x)<7,h=(path?.52:.7)+Math.random()*(path?.62:1.15),w=.65+Math.random()*.85;
  grassDummy.position.set(x,.015,z);grassDummy.rotation.set((Math.random()-.5)*.16,Math.random()*Math.PI,(Math.random()-.5)*.28);grassDummy.scale.set(w,h,w);grassDummy.updateMatrix();grassField.setMatrixAt(i,grassDummy.matrix);
  grassColor.setHex(Math.random()>.72?0x78804d:Math.random()>.55?0x425b38:0x566d3d);grassField.setColorAt(i,grassColor);
}
grassField.instanceMatrix.setUsage(THREE.StaticDrawUsage);grassField.receiveShadow=true;grassField.castShadow=false;grassField.computeBoundingSphere();scene.add(grassField);

const obstacles=[];
// 低矮起伏、湿地水洼和土色斑块，打破一整张平面的感觉。
const hillMat=flat(0x52653e),mudMat=flat(0x4b4432),puddleMat=new THREE.MeshStandardMaterial({color:0x273f39,roughness:.28,metalness:.18,transparent:true,opacity:.72});
for(let i=0;i<quality.hills;i++){
  const side=i%2?1:-1,x=side*(25+Math.random()*35),z=18-i*44-Math.random()*22,sx=7+Math.random()*8,sz=9+Math.random()*13,hill=mesh(new THREE.SphereGeometry(1,8,5),hillMat,scene,x,-1.1,z,[sx,2+Math.random()*2.7,sz]);hill.userData.collisionRadius=Math.min(sx,sz)*.72;obstacles.push(hill);
}
for(let i=0;i<quality.puddles;i++){
  const x=(Math.random()-.5)*42,z=-18-i*51-Math.random()*18,rx=1.3+Math.random()*3.2,rz=.7+Math.random()*1.5;
  mesh(new THREE.CircleGeometry(1,10),i%3?puddleMat:mudMat,scene,x,.035,z,[rx,rz,1],[-Math.PI/2,0,Math.random()*Math.PI]);
}

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

const artFruitGeo=new THREE.DodecahedronGeometry(.24,0),artFruitMat=new THREE.MeshBasicMaterial({color:0xf1a62c,fog:false}),artFruits=[];
function makeRoundTree(scale=1){
  const g=new THREE.Group(),wood=flat(0x494331),leafA=flat(0x283f31),leafB=flat(0x3d5039),h=4+Math.random()*3;
  mesh(new THREE.CylinderGeometry(.22,.45,h,5),wood,g,0,h/2,0);
  const crowns=5+Math.floor(Math.random()*5);for(let i=0;i<crowns;i++){const a=i/crowns*Math.PI*2,r=i?1+Math.random()*1.1:0;mesh(new THREE.DodecahedronGeometry(.85+Math.random()*.55,0),i%2?leafA:leafB,g,Math.cos(a)*r,h+Math.sin(i*1.7)*.65,Math.sin(a)*r,[1,.9+Math.random()*.5,1]);}
  if(Math.random()>.55)for(let i=0;i<3;i++){const a=i/3*Math.PI*2+Math.random()*.5,fruit=mesh(artFruitGeo,artFruitMat,g,Math.cos(a)*(1.1+Math.random()),h-.15+Math.random()*1.5,Math.sin(a)*(1.1+Math.random()),[.8+Math.random()*.7,.8+Math.random()*.7,.8+Math.random()*.7]);fruit.userData.phase=Math.random()*Math.PI*2;fruit.userData.baseY=fruit.position.y;artFruits.push(fruit);}
  g.scale.setScalar(scale);return g;
}
for(let i=0;i<quality.roundTrees;i++){const scale=.75+Math.random()*.8,t=makeRoundTree(scale),side=i%2?1:-1;t.position.set(side*(24+Math.random()*38),0,20-Math.random()*WORLD_DEPTH);t.rotation.y=Math.random()*Math.PI;t.userData.collisionRadius=1.2*scale;obstacles.push(t);scene.add(t);}
// 参考影片拼贴画的黑色盘根树、墨绿色云冠和金色果实，作为每段路上的视觉地标。
const paintedTreeWood=flat(0x211f1c),paintedLeafA=flat(0x172d25),paintedLeafB=flat(0x324535),paintedTrees=[];
function makePaintedTree(index){const g=new THREE.Group(),lean=(index%2?1:-1)*(1.2+index%3*.35),height=12+(index%4)*1.4,trunkCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(lean*.25,height*.3,0),new THREE.Vector3(-lean*.18,height*.65,.2),new THREE.Vector3(lean,height,0)]);mesh(new THREE.TubeGeometry(trunkCurve,9,.58,6,false),paintedTreeWood,g,0,0,0);for(let b=0;b<3;b++){const side=b%2?1:-1,y=height*(.52+b*.16),curve=new THREE.CatmullRomCurve3([new THREE.Vector3(lean*(y/height),y,0),new THREE.Vector3(side*(2.2+b*.5),y+1.3,.1),new THREE.Vector3(side*(4.2+b*.7),y+2.1,0)]);mesh(new THREE.TubeGeometry(curve,6,.23,5,false),paintedTreeWood,g,0,0,0);}for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=i?2.2+(i%2)*.8:0;mesh(new THREE.DodecahedronGeometry(1.35+(i%3)*.25,0),i%2?paintedLeafA:paintedLeafB,g,lean+Math.cos(a)*r,height+1+Math.sin(a)*1.2,Math.sin(a)*r,[1.2,.88,1]);}for(let i=0;i<5;i++){const a=i/5*Math.PI*2,fruit=mesh(artFruitGeo,artFruitMat,g,lean+Math.cos(a)*(2.1+i%2),height+.7+Math.sin(a)*1.7,Math.sin(a)*(2+i%2),[1.25,1.25,1.25]);fruit.userData.phase=index*.7+i;fruit.userData.baseY=fruit.position.y;artFruits.push(fruit);}return g;}
for(let i=0;i<30;i++){const tree=makePaintedTree(i),side=i%2?1:-1;tree.position.set(side*(16+(i%3)*4),0,-90-i*166);tree.rotation.y=(i%5-2)*.12;tree.userData.collisionRadius=1.85;obstacles.push(tree);paintedTrees.push(tree);scene.add(tree);}
const paintedMoons=[];[-620,-1580,-2520,-3460,-4380].forEach((z,i)=>{const moon=mesh(new THREE.CircleGeometry(6.5+i%2*2,28),new THREE.MeshBasicMaterial({color:i<2?0xf2ad3b:i===2?0xc7d4c8:0xb95b32,transparent:true,opacity:.76,side:THREE.DoubleSide,fog:false}),scene,(i%2?1:-1)*37,17,z,[1,1,1],[0,0,0]);moon.userData.phase=i*.8;paintedMoons.push(moon);});
function addShoveFinger(character,skin,x=.9,y=2.55){
  const hands=[-1,1].map(side=>{
    const rig=new THREE.Group();rig.position.set(side*x,y,-.55);rig.visible=false;character.add(rig);
    // 掌心、蜷起的四指、拇指和食指共同组成手。食指本体必须是一条
    // 连续的圆润网格；旧版用三截胶囊拼接，低分辨率下看成了两截棍。
    mesh(new THREE.SphereGeometry(.34,10,7),skin,rig,0,0,0,[.9,1.08,.62]);
    for(let i=0;i<4;i++)mesh(new THREE.CapsuleGeometry(.055,.28,2,6),skin,rig,(i-1.5)*.115,-.27,.03,[1,1,1],[1.08,0,(i-1.5)*.06]);
    mesh(new THREE.CapsuleGeometry(.075,.42,2,7),skin,rig,side*.29,-.02,-.03,[1,1,1],[-.42,0,side*-.72]);
    const finger=new THREE.Group();finger.position.set(0,.08,-.08);finger.rotation.x=-Math.PI/2;rig.add(finger);
    const shaft=mesh(new THREE.CapsuleGeometry(.145,1.32,5,10),skin,finger,0,.76,0,[1,1,1]),segments=[shaft];
    const tip=mesh(new THREE.SphereGeometry(.145,10,8),skin,finger,0,1.5,0,[.94,1.05,.96]);
    const nailMat=new THREE.MeshStandardMaterial({color:0xffe7da,roughness:.58,metalness:0,flatShading:false}),nail=mesh(new THREE.SphereGeometry(.09,10,7),nailMat,finger,0,1.54,-.095,[.72,1.08,.22]);
    const creaseMat=new THREE.MeshBasicMaterial({color:0x8f654f,transparent:true,opacity:.55,fog:false}),creases=[.68,1.18].map(jointY=>mesh(new THREE.TorusGeometry(.112,.012,5,10,Math.PI*.9),creaseMat,finger,0,jointY,.012,[1,1,1],[Math.PI/2,0,.15]));
    const basePosition=rig.position.clone(),setExtension=amount=>{amount=THREE.MathUtils.clamp(amount,0,1);shaft.scale.y=1+amount*.7;shaft.position.y=.76+amount*.46;tip.position.y=1.5+amount*.94;nail.position.y=1.54+amount*.94;creases[0].position.y=.68+amount*.28;creases[1].position.y=1.18+amount*.68;finger.userData.extension=amount;};
    return{rig,finger,tip,nail,segments,creases,side,basePosition,setExtension};
  });
  // 从右手开始，此后每次按“搓”严格左右交替。
  character.userData.shoveFinger={hands,active:1,next:1,rig:hands[1].rig,finger:hands[1].finger,tip:hands[1].tip,until:-1};
}
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
  g.scale.setScalar(scale); g.userData.legs=legs; g.userData.arms=arms;g.userData.body=body;g.userData.head=head;g.userData.canCrawl=true;addShoveFinger(g,muzzle,1.02,2.42); return g;
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
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;addShoveFinger(g,muzzle,1.04,2.42);return g;
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
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;addShoveFinger(g,white,.82,2.32);return g;
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

function makeTwistedCrawler(scale=1){
  const g=new THREE.Group(),flesh=flat(0x5b4038),bone=flat(0xb9ad91),voidMat=flat(0x090706),eye=flat(0xe63a18),arms=[],legs=[],twistParts=[];
  const torso=mesh(new THREE.CapsuleGeometry(.78,2.5,3,6),flesh,g,0,1.45,0,[1.75,.62,1.05],[0,0,Math.PI/2]);twistParts.push(torso);
  for(const side of [-1,1]){const head=mesh(new THREE.SphereGeometry(.72,6,5),bone,g,side*.78,2.25,-.62,[1,.78,.72],[0,side*.22,side*.16]);mesh(new THREE.SphereGeometry(.34,6,4),voidMat,head,0,-.02,-.67,[1.35,.72,.3]);for(const x of [-.16,.16])mesh(new THREE.SphereGeometry(.05,5,4),eye,head,x,.16,-.69);twistParts.push(head);}
  for(let i=0;i<6;i++){const side=i%2?-1:1,x=side*(.45+Math.floor(i/2)*.46),limb=mesh(new THREE.CapsuleGeometry(.13,1.8+(i%3)*.32,2,5),i%3===0?bone:flesh,g,x,.65,(i%3-.8)*.62,[1,1,1],[side*.38,0,side*.58]);(i<2?arms:legs).push(limb);}
  g.scale.setScalar(scale);g.userData={arms,legs,twistParts,type:'crawler',enemyKey:'enemy.crawler'};return g;
}
function makeHollowStalker(scale=1){
  const g=new THREE.Group(),skin=flat(0x777c70),cloth=flat(0x292823),voidMat=flat(0x030303),teeth=flat(0xd0c7a8),arms=[],legs=[],twistParts=[];
  mesh(new THREE.ConeGeometry(.88,5.5,6),cloth,g,0,3,0,[1,.92,1]);const head=mesh(new THREE.TorusGeometry(.72,.27,5,9),skin,g,0,6.15,-.08,[1,1,.72],[Math.PI/2,0,0]);mesh(new THREE.SphereGeometry(.56,7,5),voidMat,g,0,6.14,-.35,[1,.92,.25]);for(let i=0;i<7;i++)mesh(new THREE.ConeGeometry(.07,.32,4),teeth,g,(i-3)*.13,6.1,-.69,[1,1,1],[i%2?Math.PI:0,0,0]);twistParts.push(head);
  for(const side of [-1,1]){const arm=mesh(new THREE.CapsuleGeometry(.12,4.5,2,5),skin,g,side*1.08,3.35,0,[1,1,1],[0,0,side*.18]);arms.push(arm);const leg=mesh(new THREE.CapsuleGeometry(.16,3.2,2,5),cloth,g,side*.37,.5,0);legs.push(leg);}
  g.scale.setScalar(scale);g.userData={arms,legs,twistParts,type:'hollow',enemyKey:'enemy.hollow'};return g;
}
function makeFleshKnot(scale=1){
  const g=new THREE.Group(),hide=flat(0x49302f),raw=flat(0x8c4a42),eye=flat(0xffb22d),voidMat=flat(0x120605),arms=[],legs=[],twistParts=[];
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=i?1.05:0,orb=mesh(new THREE.DodecahedronGeometry(.75+(i%3)*.15,0),i%2?hide:raw,g,Math.cos(a)*r,1.8+Math.sin(a)*.7,Math.sin(a)*r,[1,1.15,.9]);twistParts.push(orb);}const socket=mesh(new THREE.SphereGeometry(.52,7,5),voidMat,g,0,2.1,-1.05,[1,1,.32]);mesh(new THREE.SphereGeometry(.19,6,5),eye,socket,0,0,-.45,[1,1,.35]);
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2,limb=mesh(new THREE.CapsuleGeometry(.13,1.7,2,5),hide,g,Math.cos(a)*1.05,.62,Math.sin(a)*.8,[1,1,1],[Math.sin(a)*.5,0,-Math.cos(a)*.65]);legs.push(limb);}g.scale.setScalar(scale);g.userData={arms,legs,twistParts,type:'knot',enemyKey:'enemy.knot'};return g;
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

function makeWalkingHerdCow(scale=1,variant=0){
  const g=new THREE.Group(),fur=flat(variant%2?0xc57b45:0xa95632),muzzle=flat(0xe8b19d),hoof=flat(0x38231e),horn=flat(0xe8dfcf),eye=flat(0x17110f);
  mesh(new THREE.CapsuleGeometry(.72,1.45,3,7),fur,g,0,2.25,0,[1.06,1,.78]);const belly=mesh(new THREE.SphereGeometry(.62,7,5),muzzle,g,0,2.18,-.63,[.8,1.05,.2]);belly.castShadow=false;
  const head=mesh(new THREE.SphereGeometry(.78,8,6),fur,g,0,3.85,-.08,[1.04,.94,.82]);mesh(new THREE.SphereGeometry(.52,7,5),muzzle,head,0,-.18,-.66,[1.12,.64,.42]);
  for(const x of [-.28,.28]){mesh(new THREE.SphereGeometry(.07,6,5),eye,head,x,.18,-.68,[1,1,.45]);mesh(new THREE.ConeGeometry(.13,.7,6),horn,head,x*1.75,.67,-.03,[1,1,1],[0,0,x>0?-.48:.48]);}
  const arms=[],legs=[];for(const x of [-.78,.78]){const arm=mesh(new THREE.CapsuleGeometry(.15,.88,2,6),fur,g,x,2.18,0,[1,1,1],[0,0,x>0?-.1:.1]);arms.push(arm);mesh(new THREE.SphereGeometry(.19,6,5),hoof,arm,0,-.61,0,[1,.8,1]);}for(const x of [-.31,.31]){const leg=mesh(new THREE.CapsuleGeometry(.18,1.02,2,6),fur,g,x,.7,0);legs.push(leg);mesh(new THREE.SphereGeometry(.24,6,5),hoof,leg,0,-.68,-.08,[1,.62,1.2]);}
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;g.userData.upright=true;return g;
}

function turnIntoSuperCow(cow){
  const suit=flat(0x2457a6),capeMat=new THREE.MeshStandardMaterial({color:0xb81716,emissive:0x520606,emissiveIntensity:.28,roughness:.82,side:THREE.DoubleSide,flatShading:true}),gold=new THREE.MeshStandardMaterial({color:0xffd33f,emissive:0x8b5700,emissiveIntensity:.55,roughness:.58,flatShading:true}),red=flat(0xa81416);
  // 宽胸、粗肩和鼓起的前肢让轮廓在远处也明显比普通牛强壮。
  const chest=mesh(new THREE.SphereGeometry(1,8,6),suit,cow,0,1.82,-.02,[1.42,1.02,1.12]);
  for(const side of [-1,1]){
    mesh(new THREE.SphereGeometry(.56,7,5),suit,cow,side*1.18,1.95,-.05,[1.15,1,.95]);
    const arm=mesh(new THREE.CapsuleGeometry(.3,.95,3,6),suit,cow,side*1.28,1.28,-.12,[1,1,1],[0,0,side*.2]);
    mesh(new THREE.SphereGeometry(.35,6,5),red,arm,0,-.7,-.03,[1,.85,1]);
  }
  // 金色菱形胸章配红色闪电，不依赖圆圈也能一眼认出“超级”身份。
  mesh(new THREE.CircleGeometry(.5,4),gold,cow,0,1.93,-1.14,[1.05,1.24,1],[0,0,Math.PI/4]);
  const bolt=new THREE.Shape();bolt.moveTo(-.1,.38);bolt.lineTo(.2,.38);bolt.lineTo(.02,.06);bolt.lineTo(.28,.06);bolt.lineTo(-.2,-.43);bolt.lineTo(-.04,-.1);bolt.lineTo(-.27,-.1);bolt.closePath();mesh(new THREE.ShapeGeometry(bolt),red,cow,0,1.93,-1.165,[.72,.72,.72]);
  const capeShape=new THREE.Shape();capeShape.moveTo(-.78,.65);capeShape.lineTo(.78,.65);capeShape.lineTo(1.18,-1.35);capeShape.lineTo(.25,-1.72);capeShape.lineTo(0,-1.45);capeShape.lineTo(-.25,-1.72);capeShape.lineTo(-1.18,-1.35);capeShape.closePath();
  const cape=mesh(new THREE.ShapeGeometry(capeShape),capeMat,cow,0,1.72,.82,[1,1,1],[0,0,0]);cape.userData.baseY=cape.position.y;
  for(const x of [-.48,.48])mesh(new THREE.SphereGeometry(.25,6,5),red,cow,x,.32,-.02,[1.15,.68,1.35]);
  const aura=new THREE.PointLight(0xffc933,34,15,2);aura.position.set(0,2,0);cow.add(aura);
  cow.userData.superCape=cape;cow.userData.superChest=chest;cow.userData.collisionRadius=2.05;return cow;
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
  orange:{nameKey:'character.easy',length:3200,pack:2,stalkers:6,ambushers:1,chapterWaves:[2,1,2],player:1.12,enemy:.72,drain:.6,recovery:1.5,hazard:.5,invuln:3.2,fog:.011,rain:.62,flashMin:12,flashRange:17},
  yellow:{nameKey:'character.normal',length:4200,pack:5,stalkers:14,ambushers:4,chapterWaves:[4,2,4],player:1,enemy:1,drain:1,recovery:1,hazard:1,fog:.021,rain:1,flashMin:6,flashRange:10},
  leopard:{nameKey:'character.hard',length:4800,pack:6,stalkers:18,ambushers:7,chapterWaves:[5,2,5],player:.97,enemy:1.14,drain:1.24,recovery:.82,hazard:1.3,fog:.03,rain:1.35,flashMin:4,flashRange:7}
};
let player=createCharacter(selectedCharacter); player.position.set(0,.05,18); player.rotation.y=0; scene.add(player);
const hunter=makeDarkBeast(.78); hunter.position.set(0,.05,51); scene.add(hunter);
const wolfPack=[hunter,makeTwistedCrawler(.78),makeHollowStalker(.62),makeFleshKnot(.72),makeDarkBeast(.74),makeAlienCow(.72,1)];['beast','crawler','hollow','knot','beast','alien'].forEach((type,i)=>wolfPack[i].userData.type=type);wolfPack.slice(1).forEach((w,i)=>{w.position.set((i-2)*4,.05,54+i*2);scene.add(w);});
const hunterGlow=new THREE.PointLight(0xff2b16,22,24); hunterGlow.position.set(0,5,46); scene.add(hunterGlow);
const enemyConfigs=[[-24,-85,'alien'],[27,-125,'crawler'],[-29,-175,'hollow'],[25,-225,'beast'],[-24,-275,'knot'],[22,-325,'alien'],[-28,-375,'crawler'],[26,-425,'hollow'],[-25,-485,'beast'],[24,-545,'knot'],[-22,-605,'crawler'],[28,-665,'alien'],[-26,-725,'hollow'],[24,-785,'knot'],[-28,-845,'beast'],[25,-905,'crawler'],[-23,-965,'alien'],[27,-1025,'hollow']];
const enemyMakers={alien:i=>makeAlienCow(.9,i%2),beast:()=>makeDarkBeast(.72),crawler:()=>makeTwistedCrawler(.75),hollow:()=>makeHollowStalker(.6),knot:()=>makeFleshKnot(.7)};
const stalkers=enemyConfigs.map(([x,z,type],i)=>{const e=enemyMakers[type](i);e.position.set(x,.05,z);e.userData.home=new THREE.Vector3(x,.05,z);e.userData.speed=type==='alien'?5.2:type==='hollow'?6.5:type==='knot'?7.1:type==='crawler'?6.8:6.1;e.userData.type=type;scene.add(e);return e;});
const snakes=Array.from({length:16},(_,i)=>[i%2?-14:16,-180-i*280]).map(([x,z],i)=>{const s=makeSnake(.82);s.position.set(x,0,z);s.rotation.y=Math.PI/2;s.userData.home=new THREE.Vector3(x,0,z);s.userData.phase=i*.91+Math.random()*Math.PI;s.userData.patrolRadius=8+Math.random()*7;s.userData.speed=2.1+Math.random()*.8;scene.add(s);return s;});
const treeEnemies=Array.from({length:12},(_,i)=>[i%2?-18:17,-520-i*350]).map(([x,z])=>{const t=makeTreeEnemy(1.25);t.position.set(x,0,z);t.userData.type='tree';t.userData.collisionRadius=3.15;obstacles.push(t);scene.add(t);return t;});
const monsterCar=makeMonsterCar(.88);monsterCar.position.set(0,0,80);scene.add(monsterCar);
const herdSpawns=[[-7,-72],[8,-148],[-5,-224],[9,-306],[-8,-392],[6,-478],[-4,-558]];
const herdCows=herdSpawns.map(([x,z],i)=>{const c=i%3===2?makeWalkingHerdCow(.68+(i%2)*.06,i):makeHerdCow(.72+(i%2)*.08);c.position.set(x,.05,z);c.userData.start=new THREE.Vector3(x,.05,z);scene.add(c);return c;});
const superCowIndex=1,superCow=herdCows[superCowIndex];superCow.userData.super=true;turnIntoSuperCow(superCow);
const ambushers=herdSpawns.map(([x,z],i)=>{const e=makeDarkBeast(.62+(i%2)*.05);e.position.set(x+(i%2?3:-3),.05,z+14);e.userData.start=e.position.clone();e.userData.type='beast';e.userData.herdIndex=i;scene.add(e);return e;});
const strangeTravellers=[makeNiuLai(.48,false),makeYellowBull(.43),makeLeopard(.52)];[[-11,-118],[12,-272],[-10,-438]].forEach(([x,z],i)=>{const c=strangeTravellers[i];c.position.set(x,.05,z);c.userData.start=new THREE.Vector3(x,.05,z);c.userData.isNpc=true;c.userData.roadNpc=true;c.userData.collisionRadius=1.75;c.userData.talked=false;scene.add(c);});
// 第三段对白所说的“牛群”是真实存在的一整群牛，而不是单个装饰角色。
const storyHerd=Array.from({length:11},(_,i)=>{const cow=i%4===1?makeWalkingHerdCow(.5+(i%3)*.055,i):makeHerdCow(.55+(i%3)*.07);cow.userData.offsetX=(i%4-1.5)*4.8+(Math.random()-.5)*2;cow.userData.offsetZ=-Math.floor(i/4)*6-(i%2)*2;cow.visible=false;scene.add(cow);return cow;});

function makeAbstractAnimal(variant=0){
  const g=new THREE.Group(),colors=[0x82a9a0,0xc98e65,0x9380ad,0xd2b960],fur=flat(colors[variant%colors.length]),pale=flat(0xe8d8ba),dark=flat(0x24231f);
  mesh(new THREE.SphereGeometry(.75,6,5),fur,g,0,1.3,0,[1,1.25,.8]);const head=mesh(new THREE.SphereGeometry(.62,6,5),fur,g,0,2.45,-.12,[1,1,.85]);mesh(new THREE.SphereGeometry(.35,6,4),pale,head,0,-.12,-.52,[1,.65,.45]);
  for(const x of [-.22,.22]){mesh(new THREE.SphereGeometry(.055,5,4),dark,head,x,.12,-.52);mesh(new THREE.ConeGeometry(.16,.72,4),fur,head,x*1.8,.62,0,[1,1,1],[0,0,x>0?-.24:.24]);}
  const legs=[];for(const x of [-.3,.3])legs.push(mesh(new THREE.CapsuleGeometry(.12,.62,2,4),fur,g,x,.45,0));g.userData.legs=legs;g.userData.arms=[];g.userData.isNpc=true;return g;
}
function makeSafeZone(index){
  const group=new THREE.Group(),floorMat=new THREE.MeshStandardMaterial({color:0x8d8b5c,emissive:0xffa82f,emissiveIntensity:.28,roughness:1});mesh(new THREE.CircleGeometry(24,24),floorMat,group,0,.028,0,[1,1,1],[-Math.PI/2,0,0]);
  const residents=[];for(let i=0;i<8;i++){const npc=i<4?(i%2?makeWalkingHerdCow(.43+(i%2)*.05,i):makeHerdCow(.46+(i%2)*.06)):makeAbstractAnimal(i);const a=i/8*Math.PI*2,r=7+(i%3)*3;npc.position.set(Math.cos(a)*r,.05,Math.sin(a)*r);npc.rotation.y=a+Math.PI;npc.userData.safeStart=npc.position.clone();group.add(npc);residents.push(npc);}
  const wood=flat(0x5e4028),wall=flat(0x9a7043),colliders=[];
  // 每一关的暖区都有看得见的木栅栏、入口门楣和亮灯小屋，不再只是地面颜色变化。
  for(const side of [-1,1]){mesh(new THREE.BoxGeometry(1,3.2,38),wood,group,side*20,1.6,0);colliders.push({x:side*20,z:0,r:1.7});}
  for(const z of [-19,19])for(const x of [-14,14]){mesh(new THREE.BoxGeometry(13,3.2,1),wood,group,x,1.6,z);colliders.push({x,z,r:6.6});}
  for(const z of [-19,19]){for(const x of [-20,-8,8,20])mesh(new THREE.CylinderGeometry(.28,.38,4.5,5),wood,group,x,2.25,z);mesh(new THREE.BoxGeometry(7,1,1),wood,group,0,7,z);for(const x of [-3.5,3.5])mesh(new THREE.BoxGeometry(.8,8,1),wood,group,x,4,z);}
  // 放大的可进入木屋：正面留出门洞，内部有地板、床、柜子与补血心。玩家进屋时屋顶会淡出。
  const house=new THREE.Group();house.position.set(-11,0,1);const insideFloor=flat(0x6f4b2e);mesh(new THREE.BoxGeometry(13.6,.28,12.6),insideFloor,house,0,.14,0);mesh(new THREE.BoxGeometry(13.8,6.8,.7),wall,house,0,3.4,6.15);for(const side of [-1,1])mesh(new THREE.BoxGeometry(.7,6.8,12.6),wall,house,side*6.55,3.4,0);for(const side of [-1,1])mesh(new THREE.BoxGeometry(4.45,6.8,.7),wall,house,side*4.42,3.4,-6.15);
  const doorwayGlow=new THREE.PointLight(0xffb555,78,18,1.5);doorwayGlow.position.set(0,3,-4.6);house.add(doorwayGlow);for(const x of [-4.1,4.1])mesh(new THREE.BoxGeometry(1.8,1.8,.18),new THREE.MeshBasicMaterial({color:0xffce70,fog:false}),house,x,4.2,-6.53);
  const bed=flat(0x583622),blanket=flat(0x87392f);mesh(new THREE.BoxGeometry(4.2,.8,2.4),bed,house,-3.6,.55,3.6);mesh(new THREE.BoxGeometry(3.7,.36,2.1),blanket,house,-3.6,1.02,3.45);mesh(new THREE.BoxGeometry(2.2,2.8,1.5),wood,house,4.6,1.4,4.4);
  const roofMats=[-1,1].map(()=>new THREE.MeshStandardMaterial({color:0x30241d,roughness:1,transparent:true,opacity:.94})),roofParts=[];for(const side of [-1,1])roofParts.push(mesh(new THREE.BoxGeometry(7.5,.48,14.2),roofMats[side<0?0:1],house,side*3.35,7.35,0,[1,1,1],[0,0,side*.15]));
  const healthPickup=new THREE.Group(),heartMat=new THREE.MeshStandardMaterial({color:0xe92032,emissive:0xb00616,emissiveIntensity:1.35,roughness:.42});healthPickup.position.set(1.5,1.25,3.5);for(const side of [-1,1])mesh(new THREE.SphereGeometry(.5,10,8),heartMat,healthPickup,side*.38,.2,0,[1,1,.65]);mesh(new THREE.ConeGeometry(.82,1.45,10),heartMat,healthPickup,0,-.55,0,[1,1,.72],[0,0,Math.PI]);const healthLight=new THREE.PointLight(0xff1838,48,12,1.8);healthLight.position.y=.5;healthPickup.add(healthLight);healthPickup.userData={collected:false,baseY:1.25,light:healthLight};house.add(healthPickup);group.add(house);
  const houseData={group:house,x:-11,z:1,halfW:6.9,halfD:6.45,doorHalf:2.2,roofMats,roofParts,healthPickup};
  // 安全区中心的篝火是安全感的视觉核心；燃料会在玩家停留期间逐渐耗尽。
  const campfire=new THREE.Group();campfire.position.set(5,0,1);const logMat=flat(0x3d2417),coalMat=flat(0x170d09);for(const angle of [-.72,.72])mesh(new THREE.CylinderGeometry(.34,.42,4.1,6),logMat,campfire,0,.42,0,[1,1,1],[Math.PI/2,0,angle]);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;mesh(new THREE.DodecahedronGeometry(.42,0),coalMat,campfire,Math.cos(a)*1.12,.2,Math.sin(a)*1.12);}
  const flames=[],flameColors=[0xffec72,0xffa21f,0xff4a12,0xffc43a,0xff6b18];for(let i=0;i<7;i++){const mat=new THREE.MeshBasicMaterial({color:flameColors[i%flameColors.length],transparent:true,opacity:.9,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}),a=i/7*Math.PI*2,flame=mesh(new THREE.ConeGeometry(.58+(i%3)*.16,2.7+(i%2)*.95,6),mat,campfire,Math.cos(a)*.48,1.25,Math.sin(a)*.48,[1,1,1],[0,0,(i%2?-.12:.12)]);flames.push(flame);}
  const embers=[];for(let i=0;i<12;i++){const ember=mesh(new THREE.SphereGeometry(.055+(i%3)*.025,5,4),new THREE.MeshBasicMaterial({color:i%2?0xffb52d:0xff5a16,transparent:true,opacity:.9,fog:false,blending:THREE.AdditiveBlending}),campfire,(Math.random()-.5)*1.4,.7+Math.random()*2.4,(Math.random()-.5)*1.4);ember.userData.phase=Math.random()*Math.PI*2;embers.push(ember);}
  const fireGlow=mesh(new THREE.CircleGeometry(3.8,20),new THREE.MeshBasicMaterial({color:0xff8a24,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}),campfire,0,.055,0,[1,1,1],[-Math.PI/2,0,0]),fireLight=new THREE.PointLight(0xff9a38,175,43,1.35);fireLight.position.set(0,3.2,0);campfire.add(fireLight);campfire.scale.setScalar(1.32);group.add(campfire);colliders.push({x:5,z:1,r:2.15});
  const light=new THREE.PointLight(0xffbd5b,150,58,1.4);light.position.set(0,10,0);group.add(light);for(const side of [-1,1]){const post=mesh(new THREE.CylinderGeometry(.22,.3,6,6),wood,group,side*15,3,0);mesh(new THREE.SphereGeometry(.55,7,5),new THREE.MeshBasicMaterial({color:0xffc45f}),post,0,3.2,0);}
  group.visible=false;group.userData={index,residents,light,floorMat,colliders,house:houseData,campfire:{group:campfire,flames,embers,glow:fireGlow,light:fireLight,life:1},entered:false,passed:false,broken:false,timer:0,nextTalk:0};scene.add(group);return group;
}
const safeZones=Array.from({length:4},(_,i)=>makeSafeZone(i));
const bubbleEls=Array.from({length:4},()=>{const el=document.createElement('div');el.className='npc-bubble';el.hidden=true;npcBubbles.appendChild(el);return el;});
const witnessBubble=document.createElement('div'),superCowBubble=document.createElement('div');
witnessBubble.className='npc-bubble witness-bubble';superCowBubble.className='npc-bubble super-cow-bubble';witnessBubble.hidden=true;superCowBubble.hidden=true;npcBubbles.append(witnessBubble,superCowBubble);
let witnessSpeaker=null,witnessSpeechUntil=0,superCowSpeaker=null,superCowSpeechUntil=0;
function showWorldSpeech(speaker,key,duration=3000,superSpeech=false){
  if(!speaker)return;
  const bubble=superSpeech?superCowBubble:witnessBubble;bubble.textContent=tr(key);bubble.hidden=false;
  if(superSpeech){superCowSpeaker=speaker;superCowSpeechUntil=elapsed+duration/1000;}else{witnessSpeaker=speaker;witnessSpeechUntil=elapsed+duration/1000;}
}
function updateWorldSpeech(){
  for(const speech of [{speaker:witnessSpeaker,until:witnessSpeechUntil,bubble:witnessBubble,height:4},{speaker:superCowSpeaker,until:superCowSpeechUntil,bubble:superCowBubble,height:5.8}]){
    const {speaker,until,bubble,height}=speech;if(!speaker||!speaker.visible||state!=='playing'||elapsed>=until){bubble.hidden=true;continue;}
    const v=new THREE.Vector3();speaker.getWorldPosition(v);v.y+=height;v.project(camera);const width=window.visualViewport?.width||innerWidth,heightPx=window.visualViewport?.height||innerHeight;
    bubble.style.left=(THREE.MathUtils.clamp(v.x*.5+.5,.12,.88)*width)+'px';bubble.style.top=(THREE.MathUtils.clamp(-v.y*.5+.5,.12,.82)*heightPx)+'px';bubble.hidden=v.z>1||Math.abs(v.x)>1.35||Math.abs(v.y)>1.35;
  }
}
function makeCloth(){const g=new THREE.Group(),cloth=new THREE.MeshBasicMaterial({color:0xff2015,side:THREE.DoubleSide,fog:false}),glow=new THREE.MeshBasicMaterial({color:0xff160b,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});mesh(new THREE.PlaneGeometry(2.2,3.1,2,2),cloth,g,0,1.7,0,[1,1,1],[0,.2,.08]);const beam=mesh(new THREE.CylinderGeometry(.35,2.4,18,8,1,true),glow,g,0,9,0);const ring=mesh(new THREE.TorusGeometry(2.1,.16,5,18),new THREE.MeshBasicMaterial({color:0xff3a22,fog:false}),g,0,.12,0,[1,1,1],[Math.PI/2,0,0]);const light=new THREE.PointLight(0xff2c18,58,30);light.position.y=3.2;g.add(light);g.userData={beam,ring,light};scene.add(g);return g;}
const clothPieces=Array.from({length:3},makeCloth);
function makeSwitch(){const g=new THREE.Group();mesh(new THREE.BoxGeometry(1.6,3.4,1.1),rustMat,g,0,1.7,0);const lever=mesh(new THREE.BoxGeometry(.28,1.6,.3),flat(0xc54628),g,0,2.1,-.72,[1,1,1],[.45,0,0]);const lamp=new THREE.PointLight(0xff2a14,28,16);lamp.position.set(0,3.6,0);g.add(lamp);g.userData={lever,lamp,on:false};scene.add(g);return g;}
const powerSwitches=Array.from({length:2},makeSwitch);powerSwitches.forEach(sw=>{sw.userData.collisionRadius=1.3;obstacles.push(sw);});
function makeTaskGate(color=0x503a2c){const g=new THREE.Group(),mat=flat(color),warning=new THREE.MeshBasicMaterial({color:0xb73a22,fog:false});for(let x=-58;x<=58;x+=6)mesh(new THREE.BoxGeometry(1.35,8.5,1.2),mat,g,x,4.25,0);for(const y of [1.7,4.4,7.1])mesh(new THREE.BoxGeometry(118,.72,1.05),mat,g,0,y,0);for(const x of [-6,6])mesh(new THREE.BoxGeometry(.5,5.8,.32),warning,g,x,4.3,-.7,[1,1,1],[0,0,x<0?.36:-.36]);g.userData={open:false};scene.add(g);return g;}
const forestGate=makeTaskGate(0x40352c),powerGate=makeTaskGate(0x6b3328);
// 地面导航采用沿路线流动的多枚箭头，不再把一个 HUD 箭头钉在屏幕上。
const objectiveTrail=new THREE.Group(),objectiveTrailArrows=[];scene.add(objectiveTrail);objectiveTrail.visible=false;
const navShape=new THREE.Shape();navShape.moveTo(-.48,-1.25);navShape.lineTo(.48,-1.25);navShape.lineTo(.48,.05);navShape.lineTo(1.02,.05);navShape.lineTo(0,1.5);navShape.lineTo(-1.02,.05);navShape.lineTo(-.48,.05);navShape.closePath();
for(let i=0;i<5;i++){const mat=new THREE.MeshBasicMaterial({color:0xd9ff43,transparent:true,opacity:.65,side:THREE.DoubleSide,fog:false,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}),arrow=mesh(new THREE.ShapeGeometry(navShape),mat,objectiveTrail,0,.09,0,[1.05,1.05,1.05],[-Math.PI/2,0,0]);arrow.renderOrder=4;objectiveTrailArrows.push(arrow);}
function makeHut(){const g=new THREE.Group(),wood=flat(0x4c392b),roof=flat(0x241f1d);mesh(new THREE.BoxGeometry(11,5,8),wood,g,0,2.5,0);mesh(new THREE.ConeGeometry(8,4,4),roof,g,0,6,0,[1,1,.78],[0,Math.PI/4,0]);mesh(new THREE.BoxGeometry(4.2,4.4,.8),flat(0x11120f),g,0,2.1,-4.1);const warm=new THREE.PointLight(0xffb34c,52,20);warm.position.set(0,3,-2);g.add(warm);g.userData.warm=warm;scene.add(g);return g;}
const shelterHuts=[makeHut(),makeHut()];shelterHuts.forEach(hut=>{hut.userData.collisionRadius=4.8;obstacles.push(hut);});
function makeFalseGate(){const g=new THREE.Group(),mat=flat(0xb9e83b);for(const x of [-8,8])mesh(new THREE.BoxGeometry(2.4,15,2.4),mat,g,x,7.5,0);mesh(new THREE.BoxGeometry(18,2.4,2.4),mat,g,0,14,0);const sign=mesh(new THREE.BoxGeometry(9,3,.5),mat,g,0,10,-1.5);g.userData={mat,sign,triggered:false};scene.add(g);return g;}
const falseGate=makeFalseGate();
const finalHerd=Array.from({length:13},(_,i)=>{const cow=i===0?makeHerdCow(.9):i%4===2?makeWalkingHerdCow(.48+(i%3)*.065,i):makeHerdCow(.5+(i%3)*.08);if(i===0){cow.userData.super=true;turnIntoSuperCow(cow);}cow.visible=false;scene.add(cow);return cow;});
// 逃亡牛群不再像复制出来的一样只露出同一个背面。固定安排正面、
// 背面、左右侧面和四个斜面；其中部分直立牛会倒立着狂奔。
const herdViewYaws=[0,Math.PI,Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI*.75,-Math.PI*.75];
function stageHerdViews(cows,handstandIndexes=[]){const inverted=new Set(handstandIndexes);cows.forEach((cow,i)=>{cow.userData.viewYaw=herdViewYaws[i%herdViewYaws.length];cow.userData.lockRunView=true;cow.userData.handstand=inverted.has(i)&&cow.userData.upright;});}
stageHerdViews(herdCows,[2,5]);stageHerdViews(storyHerd,[1,5,9]);stageHerdViews(finalHerd,[2,6,10]);safeZones.forEach(zone=>stageHerdViews(zone.userData.residents.slice(0,4),[1,3]));
const itemTypes=['herb','flashlight','radio','smoke','speed','speed','speed','speed'],itemColors={herb:0x65ff51,flashlight:0xfff27c,radio:0x58cfff,smoke:0xe5e5e5,speed:0x67fff0,health:0xff2446};
const itemPickups=itemTypes.map(type=>{const color=itemColors[type],g=new THREE.Group();mesh(type==='speed'?new THREE.OctahedronGeometry(.72,0):new THREE.DodecahedronGeometry(.65,0),new THREE.MeshBasicMaterial({color,fog:false}),g,0,1,0);const ring=mesh(new THREE.TorusGeometry(1,.09,5,16),new THREE.MeshBasicMaterial({color,fog:false}),g,0,1,0,[1,1,1],[Math.PI/2,0,0]);if(type==='speed')for(const side of [-1,1])mesh(new THREE.ConeGeometry(.18,.75,5),new THREE.MeshBasicMaterial({color:0xe8ffff,fog:false}),g,side*.43,1,.02,[1,1,1],[Math.PI/2,0,0]);g.userData={type,ring,collected:false};scene.add(g);return g;});
const pickupEffects=[];
function spawnPickupParticles(item){const group=new THREE.Group(),particles=[],color=itemColors[item.userData.type]||0xffffff,mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,fog:false,blending:THREE.AdditiveBlending});for(let i=0;i<quality.particles;i++){const particle=mesh(new THREE.DodecahedronGeometry(.11+Math.random()*.22,0),mat.clone(),group,0,1.2,0);const angle=Math.random()*Math.PI*2,speed=5+Math.random()*11;particle.userData.velocity=new THREE.Vector3(Math.cos(angle)*speed,3+Math.random()*10,Math.sin(angle)*speed);particle.userData.spin=(Math.random()-.5)*14;particles.push(particle);}const ring=mesh(new THREE.RingGeometry(.8,1.18,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,side:THREE.DoubleSide,fog:false,blending:THREE.AdditiveBlending}),group,0,.18,0,[1,1,1],[-Math.PI/2,0,0]),light=new THREE.PointLight(color,95,34);light.position.y=2;group.add(light);group.position.copy(item.position);scene.add(group);pickupEffects.push({group,particles,ring,light,age:0});}
function playPickupSound(type){const notes=type==='health'?[392,523,659,784]:type==='radio'?[330,495,742]:type==='flashlight'?[520,780,1040]:type==='herb'?[392,523,659]:[185,277,415];notes.forEach((note,i)=>setTimeout(()=>sound(note,.24,'triangle',.085),i*75));}
const forkWalls=Array.from({length:8},(_,i)=>{const g=new THREE.Group(),mat=flat(i%2?0x34352f:0x4d4036),mark=new THREE.MeshBasicMaterial({color:i%2?0x6f2430:0x6c7131,fog:true});for(const side of [-1,1])for(let piece=0;piece<8;piece++){const x=side*18+(piece-3.5)*2.75,height=3.8+(piece%3)*.7,stone=mesh(new THREE.DodecahedronGeometry(1.2,0),mat,g,x,height*.45,(piece%2-.5)*.7,[1.55,height*.48,1.1+(piece%3)*.16],[piece*.13,i*.17,(piece%2?1:-1)*.12]);if(piece%2===0)mesh(new THREE.TorusGeometry(.62,.08,4,7),mark,stone,0,.12,-1.03,[1,1,1],[Math.PI/2,0,piece*.7]);}g.userData.gapSide=i%2?1:-1;scene.add(g);return g;});
const animalActors=[...herdCows,...storyHerd,...strangeTravellers,...finalHerd,...safeZones.flatMap(zone=>zone.userData.residents)];
const collisionPoint=new THREE.Vector3(),collisionLocal=new THREE.Vector3();
function shoulderAsideNpcs(superCow){superCow.getWorldPosition(collisionPoint);for(const npc of animalActors){if(npc===superCow||npc.userData.super||!npc.visible||npc.userData.eaten||npc.userData.escaped)continue;const pos=npc.getWorldPosition(new THREE.Vector3()),dx=pos.x-collisionPoint.x,dz=pos.z-collisionPoint.z,d2=dx*dx+dz*dz;if(d2>=11.6||d2<.001)continue;const d=Math.sqrt(d2),force=Math.max(.12,(3.4-d)*.24);moveFriendlyNpcBy(npc,dx/d*force,dz/d*force);npc.userData.avoidTimer=.38;}}
const knockedObstacles=[];
function pushPlayerFromPoint(x,z,radius){const dx=player.position.x-x,dz=player.position.z-z,d2=dx*dx+dz*dz;if(d2>=radius*radius)return false;if(d2<.0001){player.position.z+=radius;return true;}const d=Math.sqrt(d2),push=radius-d;player.position.x+=dx/d*push;player.position.z+=dz/d*push;return true;}
function pushPlayerFromBox(x,z,halfW,halfD){const radius=1.05,dx=player.position.x-x,dz=player.position.z-z,overlapX=halfW+radius-Math.abs(dx),overlapZ=halfD+radius-Math.abs(dz);if(overlapX<=0||overlapZ<=0)return false;if(overlapX<overlapZ)player.position.x=x+(dx>=0?halfW+radius:-halfW-radius);else player.position.z=z+(dz>=0?halfD+radius:-halfD-radius);return true;}
function resolvePlayerDynamicSolids(){
  // 所有看得见的敌人都必须有实体碰撞，包括尚在追咬路边 NPC、还没加入主追逐队列的黑面兽。
  allEnemies.forEach(enemy=>{if(!enemy.visible)return;const scale=enemy.userData.sizeMultiplier||1,radius=enemy.userData.type==='car'?4.8:enemy.userData.segments?2.05:enemy.userData.collisionRadius?enemy.userData.collisionRadius+1.05:2.55*scale;pushPlayerFromPoint(enemy.position.x,enemy.position.z,radius);});if(snowGhost.visible)pushPlayerFromPoint(snowGhost.position.x,snowGhost.position.z,2.3);
  for(const taskGate of [forestGate,powerGate]){if(taskGate.userData.open)continue;const dz=player.position.z-taskGate.position.z;if(Math.abs(dz)<3.15)player.position.z=taskGate.position.z+(dz>=0?3.15:-3.15);}
  for(const zone of safeZones){if(!zone.visible)continue;const lx=player.position.x-zone.position.x,lz=player.position.z-zone.position.z;if(Math.abs(Math.abs(lz)-19)<2.05&&Math.abs(lx)>4.4)player.position.z=zone.position.z+(lz>0?21.05:-21.05);if(Math.abs(Math.abs(lx)-20)<2.05&&Math.abs(lz)<19)player.position.x=zone.position.x+(lx>0?22.05:-22.05);const house=zone.userData.house,hx=zone.position.x+house.x,hz=zone.position.z+house.z;pushPlayerFromBox(hx-house.halfW+.35,hz,.35,house.halfD);pushPlayerFromBox(hx+house.halfW-.35,hz,.35,house.halfD);pushPlayerFromBox(hx,hz+house.halfD-.35,house.halfW,.35);pushPlayerFromBox(hx-(house.halfW+house.doorHalf)/2,hz-house.halfD+.35,(house.halfW-house.doorHalf)/2,.35);pushPlayerFromBox(hx+(house.halfW+house.doorHalf)/2,hz-house.halfD+.35,(house.halfW-house.doorHalf)/2,.35);pushPlayerFromPoint(zone.position.x+5,zone.position.z+1,3.2);}
  if(falseGate.visible){pushPlayerFromPoint(falseGate.position.x-8,falseGate.position.z,2.35);pushPlayerFromPoint(falseGate.position.x+8,falseGate.position.z,2.35);const dz=player.position.z-falseGate.position.z;if(falseGate.userData.triggered&&Math.abs(player.position.x-falseGate.position.x)<7&&Math.abs(dz)<2.4)player.position.z=falseGate.position.z+(dz>=0?2.4:-2.4);}pushPlayerFromPoint(gate.position.x-12,gate.position.z,3.55);pushPlayerFromPoint(gate.position.x+12,gate.position.z,3.55);
}
function releaseSafeRefugees(zoneIndex){animalActors.forEach(animal=>{if(animal.userData.refugeZone!==zoneIndex)return;animal.userData.refugeZone=-1;animal.userData.refugeParked=false;animal.userData.refugeOffset=null;animal.userData.escapeX=(animal.id%2?1:-1)*(2.8+animal.id%4);animal.userData.fleeing=true;animal.userData.active=true;});}
function holdNpcInSafeZone(animal,t,dt=.016){
  if(!animal.visible||animal.userData.eaten||animal.userData.escaped||safeZones.some(zone=>animal.parent===zone))return false;
  const current=animal.userData.refugeZone;if(Number.isInteger(current)&&current>=0){const zone=safeZones[current];if(!zone.userData.broken&&!zone.userData.passed){
    // 进入后继续走到围栏两侧的候场位，绝不在中央门洞原地停下堵住玩家和后续牛群。
    const offset=animal.userData.refugeOffset||{x:(animal.id%2?1:-1)*(9+(animal.id%3)*2.4),z:-10+(animal.id%5)*5},tx=zone.position.x+offset.x,tz=zone.position.z+offset.z,dx=tx-animal.position.x,dz=tz-animal.position.z,d=Math.hypot(dx,dz);
    if(d>.7){const speed=6.2;animal.position.x+=dx/d*speed*dt;animal.position.z+=dz/d*speed*dt;animal.rotation.y=Math.atan2(-dx,-dz);animateCow(animal,t,7);animal.userData.refugeParked=false;}else{animal.userData.refugeParked=true;animateCow(animal,t,1.2);}return true;
  }animal.userData.refugeZone=-1;animal.userData.refugeParked=false;animal.userData.refugeOffset=null;animal.userData.escapeX=(animal.id%2?1:-1)*(2.8+animal.id%4);animal.userData.fleeing=true;animal.userData.active=true;}
  animal.getWorldPosition(collisionPoint);for(let i=0;i<safeZones.length;i++){const zone=safeZones[i],dx=collisionPoint.x-zone.position.x,dz=collisionPoint.z-zone.position.z;if(zone.visible&&!zone.userData.broken&&!zone.userData.passed&&Math.abs(dx)<16.5&&Math.abs(dz)<16.5){animal.userData.refugeZone=i;animal.userData.refugeParked=false;animal.userData.refugeOffset={x:(animal.id%2?1:-1)*(9+(animal.id%3)*2.4),z:-10+(animal.id%5)*5};animal.userData.escapeX=0;animateCow(animal,t,7);return true;}}
  return false;
}
function knockObstacle(obstacle,animal){
  if(obstacle.userData.collisionDisabled)return;if(!obstacle.userData.originalTransform)obstacle.userData.originalTransform={position:obstacle.position.clone(),rotation:obstacle.rotation.clone(),visible:obstacle.visible};obstacle.userData.collisionDisabled=true;const side=Math.sign(obstacle.position.x-animal.position.x)||(animal.id%2?1:-1);obstacle.userData.knockVelocity=new THREE.Vector3(side*(9+Math.random()*5),8+Math.random()*4,-5-Math.random()*5);knockedObstacles.push(obstacle);shake=Math.max(shake,.65);sound(46,.55,'square',.09);
}
function resolveAnimalWorldCollision(animal,radius=1.25){
  if(!animal.visible)return false;animal.getWorldPosition(collisionPoint);let hit=false;
  for(const obstacle of obstacles){if(obstacle.userData.collisionDisabled)continue;const dz=collisionPoint.z-obstacle.position.z;if(Math.abs(dz)>8)continue;const obstacleRadius=obstacle.userData.collisionRadius||2.1,r=obstacleRadius+radius,dx=collisionPoint.x-obstacle.position.x,d2=dx*dx+dz*dz;if(d2>=r*r)continue;if(animal.userData.super&&obstacleRadius<=3.4){knockObstacle(obstacle,animal);continue;}animal.userData.avoidSide=Math.abs(dx)>.16?Math.sign(dx):(animal.id%2?1:-1);if(d2<.0001){collisionPoint.x+=r*animal.userData.avoidSide;hit=true;continue;}const d=Math.sqrt(d2),push=r-d;collisionPoint.x+=dx/d*push;collisionPoint.z+=dz/d*push;hit=true;}
  collisionPoint.x=THREE.MathUtils.clamp(collisionPoint.x,-58,58);
  // The NPC collision must match the two visible stone banks exactly.  The old
  // broad z-strip also blocked the empty outer lanes, which looked like an air
  // wall once cattle tried to route around it.
  for(const fork of forkWalls){
    if(!fork.visible)continue;
    for(const side of [-1,1]){
      const cx=fork.position.x+side*18,cz=fork.position.z,halfW=10.8+radius,halfD=1.45+radius,dx=collisionPoint.x-cx,dz=collisionPoint.z-cz,overlapX=halfW-Math.abs(dx),overlapZ=halfD-Math.abs(dz);
      if(overlapX<=0||overlapZ<=0)continue;
      if(overlapX<overlapZ){collisionPoint.x=cx+(dx>=0?halfW:-halfW);animal.userData.avoidSide=dx>=0?1:-1;}
      else collisionPoint.z=cz+(dz>=0?halfD:-halfD);
      hit=true;
    }
  }
  for(const taskGate of [forestGate,powerGate]){if(taskGate.userData.open||Math.abs(collisionPoint.z-taskGate.position.z)>3.1)continue;collisionPoint.z=taskGate.position.z+(collisionPoint.z>taskGate.position.z?3.15:-3.15);hit=true;}
  for(const zone of safeZones){if(!zone.visible)continue;const lx=collisionPoint.x-zone.position.x,lz=collisionPoint.z-zone.position.z,resident=animal.parent===zone;if(Math.abs(Math.abs(lz)-19)<2.1&&Math.abs(lx)>4.4){animal.userData.avoidSide=Math.sign(zone.position.x-collisionPoint.x)||1;collisionPoint.z=zone.position.z+(lz>0?(resident?16.8:21.1):(resident?-16.8:-21.1));hit=true;}if(Math.abs(Math.abs(lx)-20)<2.1&&Math.abs(lz)<19){animal.userData.avoidSide=-Math.sign(lx)||1;collisionPoint.x=zone.position.x+(lx>0?(resident?17.8:22.1):(resident?-17.8:-22.1));hit=true;}const hx=lx+11,hz=lz-1,houseRadius=8.15,hd2=hx*hx+hz*hz;if(hd2<houseRadius*houseRadius){animal.userData.avoidSide=Math.sign(hx)||(animal.id%2?1:-1);if(hd2<.0001)collisionPoint.x+=houseRadius;else{const hd=Math.sqrt(hd2),push=houseRadius-hd;collisionPoint.x+=hx/hd*push;collisionPoint.z+=hz/hd*push;}hit=true;}}
  if(hit){animal.userData.avoidTimer=1.15+Math.random()*.55;if(!animal.userData.avoidSide)animal.userData.avoidSide=animal.id%2?1:-1;if(animal.parent&&animal.parent!==scene){collisionLocal.copy(collisionPoint);animal.parent.worldToLocal(collisionLocal);animal.position.x=collisionLocal.x;animal.position.z=collisionLocal.z;}else{animal.position.x=collisionPoint.x;animal.position.z=collisionPoint.z;}}
  return hit;
}
function steerNpcAroundObstacles(animal,dt){
  if(!animal.visible||animal.userData.eaten||animal.userData.escaped||!animal.userData.avoidTimer)return;animal.userData.avoidTimer=Math.max(0,animal.userData.avoidTimer-dt);animal.getWorldPosition(collisionPoint);const amount=(animal.userData.avoidSide||1)*dt*9.5;collisionPoint.x+=amount;if(animal.parent&&animal.parent!==scene){collisionLocal.copy(collisionPoint);animal.parent.worldToLocal(collisionLocal);animal.position.x=collisionLocal.x;}else animal.position.x=collisionPoint.x;animal.rotation.y=THREE.MathUtils.lerp(animal.rotation.y,-amount*.14,.22);if(!animal.userData.avoidTimer)animal.userData.avoidSide=0;
}
function resolvePlayerAnimalCollision(){
  for(const animal of animalActors){if(!animal.visible||animal.userData.eaten||animal.userData.escaped||Number.isInteger(animal.userData.refugeZone)&&animal.userData.refugeZone>=0&&!animal.userData.refugeParked)continue;animal.getWorldPosition(collisionPoint);const radius=(animal.userData.collisionRadius??(animal.userData.isNpc?1.35:1.5))+1.05,dx=player.position.x-collisionPoint.x,dz=player.position.z-collisionPoint.z,d2=dx*dx+dz*dz;if(d2>=radius*radius)continue;if(d2<.0001){player.position.z+=radius;continue;}const d=Math.sqrt(d2),push=radius-d;player.position.x+=dx/d*push;player.position.z+=dz/d*push;}
}
function resolveWatcherCollision(){for(const watcher of watchers){if(!watcher.visible)continue;const radius=2.3,dx=player.position.x-watcher.position.x,dz=player.position.z-watcher.position.z,d2=dx*dx+dz*dz;if(d2>=radius*radius)continue;const d=Math.max(.001,Math.sqrt(d2)),push=radius-d;if(d2<.0001)player.position.z+=radius;else{player.position.x+=dx/d*push;player.position.z+=dz/d*push;}if(!watcher.userData.spoken){watcher.userData.spoken=true;say('roadNpc.watcher',2600);shake=Math.max(shake,.35);horrorSound(0);}}}
const strangeBirds=Array.from({length:quality.birds},(_,i)=>{const b=makeStrangeBird(.42+Math.random()*.22);b.position.set((Math.random()-.5)*55,9+Math.random()*14,10-Math.random()*100);b.userData.phase=Math.random()*Math.PI*2;b.userData.speed=4+Math.random()*5;b.userData.nextDrop=4+Math.random()*14;scene.add(b);return b;});
const birdDroppings=[];
function spawnBirdDropping(bird){
  const candidates=animalActors.filter(npc=>{if(npc.userData.super||!npcCanBeAttacked(npc))return false;npc.getWorldPosition(collisionPoint);return Math.hypot(collisionPoint.x-bird.position.x,collisionPoint.z-bird.position.z)<52;}),enemies=[...activeChasers,...snakes,snowGhost].filter(enemy=>enemy.visible&&Math.hypot(enemy.position.x-bird.position.x,enemy.position.z-bird.position.z)<52);let target=player,targetType='player';const roll=Math.random();if(roll>.82&&enemies.length){target=enemies[Math.floor(Math.random()*enemies.length)];targetType='enemy';}else if(roll>.48&&candidates.length){target=candidates[Math.floor(Math.random()*candidates.length)];targetType='npc';}
  const targetPos=target.getWorldPosition?target.getWorldPosition(new THREE.Vector3()):target.position.clone(),start=bird.getWorldPosition(new THREE.Vector3()),flight=Math.max(.48,Math.sqrt(Math.max(1,start.y)*2/18)),mat=new THREE.MeshStandardMaterial({color:0x4a3b1d,emissive:0x161005,emissiveIntensity:.35,roughness:1,transparent:true}),drop=mesh(new THREE.DodecahedronGeometry(.32,0),mat,scene,start.x,start.y,start.z,[.8,1.45,.8]);drop.userData.target=target;drop.userData.targetType=targetType;birdDroppings.push({mesh:drop,velocity:new THREE.Vector3((targetPos.x-start.x)/flight+(Math.random()-.5)*.8,0,(targetPos.z-start.z)/flight+(Math.random()-.5)*.8),age:0,landed:false});
}
const allEnemies=[...wolfPack,...stalkers,...snakes,...treeEnemies,...ambushers,monsterCar];allEnemies.forEach(e=>e.visible=false);hunterGlow.visible=false;
const scalableEnemies=[...wolfPack,...stalkers,...ambushers],hostileMarks=[];scalableEnemies.forEach((enemy,i)=>{enemy.scale.multiplyScalar(1.28);enemy.userData.baseScale=enemy.scale.clone();enemy.userData.giantRank=i%3===0?2+(Math.floor(i/3)%3):99;enemy.userData.sizeMultiplier=1;});
const hostileMarkStyles={beast:{color:'#e32b19',accent:'#ff9873',scale:[2.35,1.35]},alien:{color:'#9cca55',accent:'#eaffad',scale:[1.85,2.05]},crawler:{color:'#d96d22',accent:'#ffd06d',scale:[2.1,1.8]},hollow:{color:'#c6d6d1',accent:'#ffffff',scale:[2.15,1.55]},knot:{color:'#b22650',accent:'#ff82a0',scale:[2,1.95]},snake:{color:'#b4db42',accent:'#efff8e',scale:[1.55,1.7]},tree:{color:'#8f3350',accent:'#e5849d',scale:[2.4,2.8]},car:{color:'#e0871c',accent:'#ffe39a',scale:[2.9,1.35]},snowGhost:{color:'#87d5ec',accent:'#e7fbff',scale:[2.25,2.25]},sadako:{color:'#d8dfe1',accent:'#ffffff',scale:[1.7,2.2]},kayako:{color:'#d2c9c7',accent:'#fff7f0',scale:[2.15,1.25]},toshio:{color:'#7da7b5',accent:'#dff9ff',scale:[1.45,1.55]},jiangchen:{color:'#d20b18',accent:'#ff8791',scale:[2.5,2.4]},freddy:{color:'#a84427',accent:'#f3c65e',scale:[2.15,1.8]},edward:{color:'#8f2634',accent:'#f0c3ba',scale:[2.1,1.65]}};
const hostileMarkTextures=new Map();
function hostileMarkType(enemy){return enemy.userData.segments?'snake':enemy.userData.type||'beast';}
function makeHostileMarkTexture(type){if(hostileMarkTextures.has(type))return hostileMarkTextures.get(type);const style=hostileMarkStyles[type]||hostileMarkStyles.beast,canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;const ctx=canvas.getContext('2d'),stroke=(points,width=8,accent=false)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=accent?style.accent:style.color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();};ctx.clearRect(0,0,128,96);ctx.shadowColor=style.color;ctx.shadowBlur=11;
  if(type==='beast'){stroke([[18,45],[48,34],[56,42]],11);stroke([[72,42],[80,34],[110,45]],11);stroke([[26,48],[51,43]],3,true);stroke([[77,43],[102,48]],3,true);}
  else if(type==='alien'){stroke([[64,82],[64,43]],7);for(const [x,y,s] of [[64,25,12],[40,46,8],[88,46,8]]){ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.strokeStyle=style.color;ctx.lineWidth=6;ctx.strokeRect(-s/2,-s/2,s,s);ctx.restore();}stroke([[64,15],[64,31]],3,true);}
  else if(type==='crawler'){stroke([[20,72],[43,42],[54,58],[78,22],[71,51],[105,39]],10);stroke([[25,68],[44,47],[53,63]],3,true);}
  else if(type==='hollow'){stroke([[18,49],[37,35],[61,29]],7);stroke([[67,29],[91,35],[110,49],[91,61],[68,67]],7);stroke([[57,67],[37,61],[18,49]],7);stroke([[57,40],[68,58]],4,true);}
  else if(type==='knot'){stroke([[28,69],[49,47],[38,27]],9);stroke([[38,27],[66,44],[91,24]],9);stroke([[91,24],[79,55],[103,72]],9);stroke([[103,72],[65,62],[28,69]],9);stroke([[50,47],[79,55]],3,true);}
  else if(type==='snake'){stroke([[64,18],[64,67]],9);stroke([[64,67],[43,84]],8);stroke([[64,67],[85,84]],8);stroke([[64,27],[64,58]],3,true);}
  else if(type==='tree'){stroke([[64,84],[61,53],[43,37],[30,21]],10);stroke([[61,55],[78,37],[96,27]],9);stroke([[58,49],[52,20]],8);stroke([[64,75],[63,51]],3,true);}
  else if(type==='car'){stroke([[16,62],[36,39],[56,62]],10);stroke([[72,62],[92,39],[112,62]],10);stroke([[27,61],[45,61]],3,true);stroke([[83,61],[101,61]],3,true);}
  else if(type==='snowGhost'){stroke([[35,18],[43,66],[51,83]],8);stroke([[64,10],[64,71],[61,88]],9);stroke([[93,18],[82,65],[75,82]],8);stroke([[64,19],[64,58]],3,true);}
  else if(type==='sadako'){stroke([[39,15],[31,76]],8);stroke([[58,10],[54,84]],10);stroke([[78,13],[88,78]],8);stroke([[52,69],[73,69]],3,true);}
  else if(type==='kayako'){stroke([[18,63],[45,42],[67,57],[104,26]],9);stroke([[28,66],[58,48],[91,35]],3,true);}
  else if(type==='toshio'){stroke([[42,42],[52,34],[61,43]],9);stroke([[67,43],[76,34],[86,42]],9);stroke([[50,44],[60,40]],3,true);stroke([[68,40],[78,44]],3,true);}
  else if(type==='jiangchen'){stroke([[24,68],[43,27],[64,58],[86,21],[106,67]],10);stroke([[43,34],[64,64],[86,29]],3,true);}
  else if(type==='freddy'){for(let i=0;i<4;i++)stroke([[30+i*18,22],[23+i*18,78]],5,i===2);}
  else if(type==='edward'){stroke([[22,72],[47,29]],8);stroke([[48,72],[64,20]],8,true);stroke([[75,72],[101,29]],8);}
  else stroke([[28,25],[49,72]],10);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;hostileMarkTextures.set(type,texture);return texture;}
function addHostileMark(enemy,index=0){const type=hostileMarkType(enemy),style=hostileMarkStyles[type]||hostileMarkStyles.beast,marker=new THREE.Group(),height=type==='tree'?14:type==='car'?7:type==='snake'?2.8:type==='toshio'?4.8:type==='kayako'?3.1:type==='jiangchen'?8.2:6.2,material=new THREE.SpriteMaterial({map:makeHostileMarkTexture(type),transparent:true,opacity:.58,depthWrite:false,depthTest:false,fog:false}),sprite=new THREE.Sprite(material);sprite.position.y=height;sprite.scale.set(style.scale[0],style.scale[1],1);sprite.renderOrder=999;marker.add(sprite);marker.userData={phase:index*.61,materials:[material],sprite,baseScale:style.scale,type};enemy.add(marker);hostileMarks.push(marker);return marker;}
allEnemies.forEach(addHostileMark);
function updateEnemyScale(dt){const chapterGrowth=[1,1.16,1.34,1.56,1.76][Math.max(0,currentChapter)],difficultyGrowth=selectedCharacter==='leopard'?1.1:selectedCharacter==='yellow'?1.04:1;scalableEnemies.forEach(enemy=>{const giant=currentChapter>=enemy.userData.giantRank?1.36:1,target=chapterGrowth*difficultyGrowth*giant,blend=1-Math.pow(.025,dt);enemy.userData.sizeMultiplier=THREE.MathUtils.lerp(enemy.userData.sizeMultiplier||1,target,blend);collisionLocal.copy(enemy.userData.baseScale).multiplyScalar(enemy.userData.sizeMultiplier);enemy.scale.lerp(collisionLocal,blend);});}

function addRock(x,z,s=1){const r=mesh(new THREE.DodecahedronGeometry(1.5,0),flat(Math.random()>.5?0x4a4b3b:0x675e49),scene,x,s*.8,z,[s,s,s]);r.userData.collisionRadius=1.35*s;obstacles.push(r);}
for(let z=4;z>-WORLD_DEPTH;z-=17+Math.random()*15){
  const side=Math.random()>.5?1:-1; addRock(side*(8+Math.random()*41),z,.7+Math.random()*2.2);
  if(Math.random()>.62)addRock(-side*(12+Math.random()*35),z-3,.6+Math.random()*1.5);
}
// 路上的旧方柱改为扭曲的刻纹石：七边形锥体、错位骨节与发暗红光的环形咒纹。
const monolithStone=flat(0x24231f),monolithStoneAlt=flat(0x353027),runeMats=[0x7d2119,0x79632d,0x273f39].map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.38,roughness:.92,flatShading:true}));
function makePatternedMonolith(index){
  const g=new THREE.Group(),height=13+Math.random()*15,lower=mesh(new THREE.CylinderGeometry(1.2+Math.random()*.55,2.1+Math.random()*.65,height*.62,7,3),monolithStone,g,0,height*.31,0,[1,1,1],[.05*(index%3-1),Math.random()*.5,(Math.random()-.5)*.2]);
  lower.geometry.attributes.position.needsUpdate=true;
  mesh(new THREE.DodecahedronGeometry(2.05,0),monolithStoneAlt,g,(index%2?1:-1)*.35,height*.61,.12,[1,.75+Math.random()*.35,.82],[Math.random()*.5,index*.31,.18]);
  mesh(new THREE.ConeGeometry(1.55+Math.random()*.45,height*.4,5,2),monolithStone,g,(index%3-1)*.28,height*.82,0,[1,1,1],[(Math.random()-.5)*.2,index*.17,(Math.random()-.5)*.28]);
  const runeMat=runeMats[index%runeMats.length];
  for(let band=0;band<3;band++)mesh(new THREE.TorusGeometry(1.48-band*.12,.09+band*.025,4,7),runeMat,g,0,height*(.2+band*.18),0,[1+band*.08,1,1],[Math.PI/2+(band-1)*.13,0,index*.8+band*.55]);
  for(let shard=0;shard<3;shard++){const angle=index*.9+shard*Math.PI*2/3;mesh(new THREE.ConeGeometry(.28,.95+shard*.22,4),runeMat,g,Math.cos(angle)*1.7,height*(.34+shard*.14),Math.sin(angle)*1.25,[1,1,1],[Math.sin(angle)*.55,0,-Math.cos(angle)*.55]);}
  g.rotation.y=Math.random()*Math.PI;g.userData.collisionRadius=2.75;return g;
}
for(let z=-65,index=0;z>-WORLD_DEPTH;z-=115,index++){
  const p=makePatternedMonolith(index);p.position.set((Math.random()-.5)*55,0,z);p.rotation.z=(Math.random()-.5)*.14;obstacles.push(p);scene.add(p);
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
// 通往出口的路标：旧版只是悬空的荧光柱，容易被误认为无碰撞占位物；现在改成木制实体路标。
const guidePosts=[];for(let z=-120;z>-WORLD_DEPTH;z-=120)for(const x of [-8,8]){const post=new THREE.Group(),postWood=flat(0x493721),markerMat=new THREE.MeshBasicMaterial({color:0xcbe63d,fog:false});mesh(new THREE.CylinderGeometry(.38,.52,5.2,6),postWood,post,0,2.6,0);mesh(new THREE.BoxGeometry(3.4,1.15,.62),postWood,post,x<0?1.05:-1.05,4.15,0,[1,1,1],[0,0,x<0?-.08:.08]);mesh(new THREE.ConeGeometry(.48,1.25,3),markerMat,post,x<0?2.8:-2.8,4.15,-.02,[1,1,1],[0,0,x<0?-Math.PI/2:Math.PI/2]);post.position.set(x,0,z);post.userData.collisionRadius=.9;scene.add(post);obstacles.push(post);guidePosts.push(post);}

// 电影草原里那种光秃、发白、像手臂一样伸向雾里的树。
const deadTreeMat=flat(0x77717d),trunkGeo=new THREE.ConeGeometry(.56,8,5),branchGeo=new THREE.ConeGeometry(.23,4.5,5);
for(let i=0;i<quality.deadTrees;i++){
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
const rainCount=quality.rain,rainPositions=new Float32Array(rainCount*6),rainSpeed=new Float32Array(rainCount),rainLength=new Float32Array(rainCount);
for(let i=0;i<rainCount;i++){
  const p=i*6,x=(Math.random()-.5)*100,y=Math.random()*48,z=(Math.random()-.5)*100,len=.7+Math.random()*1.9;
  rainPositions[p]=x;rainPositions[p+1]=y;rainPositions[p+2]=z;rainPositions[p+3]=x+.2;rainPositions[p+4]=y-len;rainPositions[p+5]=z;rainSpeed[i]=18+Math.random()*20;rainLength[i]=len;
}
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
const rainMat=new THREE.LineBasicMaterial({color:0xc9d1cd,transparent:true,opacity:.29,depthWrite:false});
const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;scene.add(rain);

// “无归”雪夜段落：暴雪会在中途吞掉草原，白衣女鬼没有脚印，也不会真正离开。
const snowCount=quality.snow,snowPos=new Float32Array(snowCount*3);
for(let i=0;i<snowCount;i++){snowPos[i*3]=(Math.random()-.5)*90;snowPos[i*3+1]=Math.random()*40;snowPos[i*3+2]=(Math.random()-.5)*90;}
const snowGeo=new THREE.BufferGeometry();snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snow=new THREE.Points(snowGeo,new THREE.PointsMaterial({color:0xe8f3f2,size:mobileDevice?.24:.18,transparent:true,opacity:0,depthWrite:false,fog:false}));snow.frustumCulled=false;scene.add(snow);
function makeSnowGhost(){const g=new THREE.Group(),robe=new THREE.MeshBasicMaterial({color:0xcbd5d2,fog:true}),skin=new THREE.MeshBasicMaterial({color:0xdde2dc,fog:true}),hair=new THREE.MeshBasicMaterial({color:0x080b0c,fog:true}),mouth=new THREE.MeshBasicMaterial({color:0x390606,fog:false});mesh(new THREE.ConeGeometry(1.25,6.2,7),robe,g,0,3.1,0);mesh(new THREE.SphereGeometry(.72,7,6),skin,g,0,6.25,-.05,[.82,1.08,.7]);mesh(new THREE.SphereGeometry(.82,7,6),hair,g,0,6.65,.22,[1,1.18,.78]);mesh(new THREE.BoxGeometry(.8,1.7,.18),hair,g,0,6.25,.55);for(const x of [-.27,.27])mesh(new THREE.SphereGeometry(.055,5,4),mouth,g,x,6.3,-.68);mesh(new THREE.BoxGeometry(.34,.045,.04),mouth,g,0,5.95,-.72);for(const x of [-1,1])mesh(new THREE.CapsuleGeometry(.13,2.7,2,4),robe,g,x*.9,3.8,0,[1,1,1],[0,0,x*.3]);g.userData.type='snowGhost';g.visible=false;scene.add(g);return g;}
const snowGhost=makeSnowGhost(),snowBgColor=new THREE.Color(0x9ba9aa),snowFogColor=new THREE.Color(0xc5d0d0),snowGroundColor=new THREE.Color(0xb8c3b7);addHostileMark(snowGhost,allEnemies.length);

// 经典日式怨灵桥段：不是把三只鬼当普通追兵随机刷出，而是各自保留标志性的出场语言。
function makeSadako(){const g=new THREE.Group(),dress=new THREE.MeshStandardMaterial({color:0xd7d7cf,roughness:1,flatShading:true}),skin=flat(0xc8c5b9),hair=new THREE.MeshBasicMaterial({color:0x050606,fog:true}),dark=new THREE.MeshBasicMaterial({color:0x120202,fog:false});mesh(new THREE.ConeGeometry(1.12,5.4,8),dress,g,0,2.7,0);const head=mesh(new THREE.SphereGeometry(.7,8,6),skin,g,0,5.75,-.05,[.86,1.04,.74]);for(const x of [-.42,-.2,0,.2,.42])mesh(new THREE.CapsuleGeometry(.13,2.45,2,5),hair,head,x,.15,-.18,[1,1+(Math.abs(x)<.1?.28:0),.72],[0,0,x*.28]);mesh(new THREE.SphereGeometry(.055,5,4),dark,head,.25,-.05,-.64);const arms=[];for(const x of [-1,1])arms.push(mesh(new THREE.CapsuleGeometry(.12,2.35,2,5),dress,g,x*.88,3.15,-.15,[1,1,1],[0,0,x*.2]));g.userData={type:'sadako',enemyKey:'enemy.sadako',arms,hair:head.children.filter(child=>child.geometry?.type==='CapsuleGeometry'),chaseSpeed:7.15,specialGhost:true,nextTeleport:0};g.visible=false;scene.add(g);return g;}
function makeKayako(){const g=new THREE.Group(),dress=new THREE.MeshStandardMaterial({color:0xc9c4bd,roughness:1,flatShading:true}),skin=flat(0xc5c3bc),hair=new THREE.MeshBasicMaterial({color:0x070707,fog:true}),eye=new THREE.MeshBasicMaterial({color:0x020202,fog:false});const torso=mesh(new THREE.CapsuleGeometry(.58,1.85,3,6),dress,g,0,1.15,0,[1.12,1,.72],[Math.PI/2,0,0]),head=mesh(new THREE.SphereGeometry(.67,8,6),skin,g,0,1.18,-1.45,[.9,1,.8]);mesh(new THREE.SphereGeometry(.76,7,5),hair,head,0,.28,.18,[1,1.12,.85]);for(const x of [-.24,.24])mesh(new THREE.SphereGeometry(.07,5,4),eye,head,x,.05,-.62,[1.2,.65,.4]);const limbs=[];for(const x of [-1,1]){limbs.push(mesh(new THREE.CapsuleGeometry(.12,1.65,2,5),skin,g,x*.66,.62,-.7,[1,1,1],[Math.PI/2,0,x*.28]));limbs.push(mesh(new THREE.CapsuleGeometry(.14,1.55,2,5),dress,g,x*.48,.58,.85,[1,1,1],[Math.PI/2,0,x*-.22]));}g.userData={type:'kayako',enemyKey:'enemy.kayako',arms:limbs,limbs,chaseSpeed:6.85,specialGhost:true};g.visible=false;scene.add(g);return g;}
function makeToshio(){const g=new THREE.Group(),skin=flat(0xaebdc0),shorts=flat(0x31383b),hair=new THREE.MeshBasicMaterial({color:0x080a0b,fog:true}),eye=new THREE.MeshBasicMaterial({color:0x000000,fog:false});mesh(new THREE.CapsuleGeometry(.47,1.25,3,6),skin,g,0,1.7,0);mesh(new THREE.BoxGeometry(1.02,.82,.65),shorts,g,0,.92,0);const head=mesh(new THREE.SphereGeometry(.62,8,6),skin,g,0,3.25,-.04,[.92,1.05,.84]);mesh(new THREE.SphereGeometry(.65,7,5),hair,head,0,.35,.12,[1,1,.83]);for(const x of [-.22,.22])mesh(new THREE.SphereGeometry(.105,6,5),eye,head,x,.02,-.54,[1,1,.38]);const legs=[];for(const x of [-.25,.25])legs.push(mesh(new THREE.CapsuleGeometry(.11,.72,2,5),skin,g,x,.35,0));g.userData={type:'toshio',enemyKey:'enemy.toshio',legs,specialGhost:true};g.visible=false;scene.add(g);return g;}
function makeGhostStairs(){const g=new THREE.Group(),wood=flat(0x332b29);for(let i=0;i<7;i++)mesh(new THREE.BoxGeometry(7,.42,1.25),wood,g,0,.22+i*.38,-i*.92);for(const x of [-3.2,3.2])mesh(new THREE.CylinderGeometry(.08,.11,4.2,5),wood,g,x,2,-2.7,[1,1,1],[.72,0,0]);g.visible=false;g.userData.collisionRadius=3.5;obstacles.push(g);scene.add(g);return g;}
function makeCursedTelevision(){const g=new THREE.Group(),caseMat=flat(0x242422),screenMat=new THREE.MeshBasicMaterial({color:0x9da8a1,transparent:true,opacity:.82,fog:false}),wellMat=flat(0x292b28);mesh(new THREE.BoxGeometry(5.4,4.2,2.5),caseMat,g,0,2.1,0);const screen=mesh(new THREE.PlaneGeometry(4.35,3.1),screenMat,g,0,2.25,-1.27);for(const x of [-1.8,1.8])mesh(new THREE.CylinderGeometry(.22,.3,1,6),caseMat,g,x,.4,.2,[1,1,1],[0,0,x*.08]);const well=new THREE.Group();for(let i=0;i<12;i++){const a=i/12*Math.PI*2;mesh(new THREE.DodecahedronGeometry(.52,0),wellMat,well,Math.cos(a)*2.1,.4,Math.sin(a)*2.1,[1.35,.72,.8],[0,a,0]);}well.position.set(0,0,-5.5);g.add(well);g.visible=false;g.userData={screen,screenMat,well,collisionRadius:3.1};obstacles.push(g);scene.add(g);return g;}
const sadako=makeSadako(),kayako=makeKayako(),toshio=makeToshio(),kayakoStairs=makeGhostStairs(),cursedTelevision=makeCursedTelevision();[sadako,kayako,toshio].forEach((ghost,i)=>addHostileMark(ghost,allEnemies.length+1+i));
let toshioStage=0,kayakoStage=0,sadakoStage=0,toshioStageAt=0,kayakoStageAt=0,sadakoStageAt=0,toshioRatios=[],kayakoRatios=[],sadakoRatios=[],toshioIndex=0,kayakoIndex=0,sadakoIndex=0;

function makeJiangchen(){const g=new THREE.Group(),coat=flat(0x171719),armor=flat(0x39262b),skin=flat(0x9a8580),eye=new THREE.MeshBasicMaterial({color:0xff0618,fog:false}),fang=flat(0xe8e0d2);mesh(new THREE.CapsuleGeometry(.83,2.55,3,7),coat,g,0,3.2,0,[1.18,1,.8]);mesh(new THREE.BoxGeometry(2.25,.62,.72),armor,g,0,4.05,-.12);const head=mesh(new THREE.SphereGeometry(.72,8,6),skin,g,0,5.9,-.08,[.92,1.08,.8]);for(const x of [-.25,.25]){mesh(new THREE.SphereGeometry(.09,6,5),eye,head,x,.1,-.62,[1,1,.35]);mesh(new THREE.ConeGeometry(.07,.35,5),fang,head,x*.55,-.31,-.64,[1,1,1],[Math.PI,0,0]);}const arms=[],legs=[];for(const x of [-1,1])arms.push(mesh(new THREE.CapsuleGeometry(.2,1.85,2,6),coat,g,x*1.02,3.15,0,[1,1,1],[0,0,x*.16]));for(const x of [-.38,.38])legs.push(mesh(new THREE.CapsuleGeometry(.24,1.65,2,6),coat,g,x,1.05,0));g.userData={type:'jiangchen',enemyKey:'enemy.jiangchen',arms,legs,chaseSpeed:7.25};g.visible=false;scene.add(g);return g;}
function makeFreddy(){const g=new THREE.Group(),skin=flat(0x7a3b2d),red=flat(0x6e1c1b),green=flat(0x263b2c),trouser=flat(0x26201d),metal=new THREE.MeshStandardMaterial({color:0xc8c2a8,metalness:.72,roughness:.32}),hat=flat(0x30231e);for(let i=0;i<5;i++)mesh(new THREE.CylinderGeometry(.72,.78,.54,7),i%2?green:red,g,0,2.25+i*.48,0);const head=mesh(new THREE.SphereGeometry(.67,8,6),skin,g,0,5.1,-.08,[.9,1.08,.82]);mesh(new THREE.CylinderGeometry(.82,.82,.16,10),hat,head,0,.62,0);mesh(new THREE.CylinderGeometry(.52,.6,.48,8),hat,head,0,.85,0);const arms=[],legs=[];arms.push(mesh(new THREE.CapsuleGeometry(.16,1.55,2,5),red,g,-.88,3.2,0,[1,1,1],[0,0,.15]));const glove=mesh(new THREE.CapsuleGeometry(.16,1.55,2,5),green,g,.88,3.2,0,[1,1,1],[0,0,-.15]);arms.push(glove);for(let i=0;i<4;i++)mesh(new THREE.CapsuleGeometry(.025,.92,2,4),metal,glove,(i-1.5)*.08,-1.05,-.08,[1,1,1],[.18,0,(i-1.5)*.04]);for(const x of [-.32,.32])legs.push(mesh(new THREE.CapsuleGeometry(.2,1.35,2,5),trouser,g,x,.85,0));g.userData={type:'freddy',enemyKey:'enemy.freddy',arms,legs,chaseSpeed:6.75};g.visible=false;scene.add(g);return g;}
function makeEdwardRipper(){const g=new THREE.Group(),coat=flat(0x211c22),vest=flat(0x4a1f29),skin=flat(0xb09b91),steel=new THREE.MeshStandardMaterial({color:0xd8d1c7,metalness:.8,roughness:.22}),hat=flat(0x171419);mesh(new THREE.CapsuleGeometry(.62,2.2,3,6),coat,g,0,2.85,0);mesh(new THREE.BoxGeometry(1.3,1.6,.42),vest,g,0,3.1,-.55);const head=mesh(new THREE.SphereGeometry(.58,7,5),skin,g,0,5.05,-.05,[.88,1.1,.78]);mesh(new THREE.CylinderGeometry(.82,.82,.14,9),hat,head,0,.62,0);mesh(new THREE.CylinderGeometry(.5,.56,.62,8),hat,head,0,.92,0);const arms=[],legs=[];for(const x of [-1,1]){const arm=mesh(new THREE.CapsuleGeometry(.14,1.65,2,5),coat,g,x*.78,3.1,0,[1,1,1],[0,0,x*.14]);arms.push(arm);mesh(new THREE.ConeGeometry(.09,1.25,4),steel,arm,0,-1.18,-.05,[1,1,1],[0,0,Math.PI]);}for(const x of [-.28,.28])legs.push(mesh(new THREE.CapsuleGeometry(.18,1.45,2,5),coat,g,x,.82,0));g.userData={type:'edward',enemyKey:'enemy.edward',arms,legs};g.visible=false;scene.add(g);return g;}
function makeDreamClock(){const g=new THREE.Group(),brass=new THREE.MeshBasicMaterial({color:0xf4c84d,fog:false}),dark=new THREE.MeshBasicMaterial({color:0x151515,fog:false});mesh(new THREE.CylinderGeometry(.78,.78,.28,12),brass,g,0,1,0,[1,1,1],[Math.PI/2,0,0]);mesh(new THREE.CircleGeometry(.62,12),dark,g,0,1,-.16);for(const x of [-.35,.35])mesh(new THREE.SphereGeometry(.24,7,5),brass,g,x,1.75,0);for(const a of [0,Math.PI/2])mesh(new THREE.BoxGeometry(.07,.62,.05),brass,g,0,1,-.2,[1,1,1],[0,0,a]);const light=new THREE.PointLight(0xffd653,70,22);light.position.y=2;g.add(light);g.userData.light=light;g.visible=false;scene.add(g);return g;}
const jiangchen=makeJiangchen(),freddy=makeFreddy(),edwardRipper=makeEdwardRipper(),dreamClock=makeDreamClock();[jiangchen,freddy,edwardRipper].forEach((enemy,i)=>addHostileMark(enemy,allEnemies.length+4+i));
let freddyRatios=[],edwardRatios=[],jiangchenRatios=[],freddyIndex=0,edwardIndex=0,jiangchenIndex=0,freddyUntil=0,edwardStage=0,edwardStageAt=0,edwardDirection=1,jiangchenUntil=0;

// 雾中观察者：只会短暂出现在路边，玩家再看时已经不在了。
function makeWatcher(){const g=new THREE.Group(),voidMat=new THREE.MeshBasicMaterial({color:0x030403,fog:true}),eyeMat=new THREE.MeshBasicMaterial({color:0xff1808,fog:false});mesh(new THREE.CapsuleGeometry(.7,4.8,2,5),voidMat,g,0,2.6,0,[1,.95,.58]);mesh(new THREE.SphereGeometry(1.05,6,5),voidMat,g,0,5.6,0,[1,.86,.62]);for(const x of [-.34,.34])mesh(new THREE.SphereGeometry(.075,5,4),eyeMat,g,x,5.75,-.61);g.visible=false;scene.add(g);return g;}
const watchers=Array.from({length:4},makeWatcher);

const keys={}, joystick={x:0,y:0}, clock=new THREE.Clock();
let state='intro', stamina=100, hearts=3, exhausted=false, runLength=430, exitZ=-412, distance=430, hunterSpeed=7.5, elapsed=0, lastLine=-1, shake=0, audio, musicMaster, radioGain, musicNodes=[], musicTimer, storyStage=0, waveWarningStage=0, snowStage=0, snowBlend=0, activeChasers=[], speedLevel=0, nextTerrorFlash=9,nextHaunt=6,hauntTimer,titleCryTimer,deathElapsed=0,deathAttacker=null,deathReason=null,nextDeathBlood=0,lastCollisionSound=-99,invulnerableUntil=0,clothCount=0,switchCount=0,sheltered=false,flashlightUntil=0,speedBoostUntil=0,smokeCharges=0,radioOwned=false,fakeExitTriggered=false,finalWaveStarted=false,rescuedCows=0,weatherActive=false,nextWeatherChange=0;
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
    const fire=data.campfire,house=data.house,nearZone=!performanceMode||Math.abs(dz)<90;data.light.visible=nearZone;fire.light.visible=nearZone;
    const houseX=zone.position.x+house.x,houseZ=zone.position.z+house.z,insideHouse=Math.abs(player.position.x-houseX)<house.halfW-.65&&Math.abs(player.position.z-houseZ)<house.halfD-.65,roofOpacity=insideHouse?.08:.94;house.roofMats.forEach(mat=>mat.opacity=THREE.MathUtils.lerp(mat.opacity,roofOpacity,1-Math.pow(.00001,dt)));const heart=house.healthPickup;if(!heart.userData.collected){heart.visible=true;heart.position.y=heart.userData.baseY+Math.sin(t*3.8+index)*.18;heart.rotation.y+=dt*1.8;heart.userData.light.intensity=38+Math.sin(t*5+index)*15;const heartWorld=heart.getWorldPosition(new THREE.Vector3());if(hearts<3&&Math.hypot(player.position.x-heartWorld.x,player.position.z-heartWorld.z)<2.15){heart.userData.collected=true;heart.visible=false;hearts=Math.min(3,hearts+1);renderHearts();say('item.healthPickup',2200);playPickupSound('health');spawnPickupParticles({position:heartWorld,userData:{type:'health'}});}}else heart.visible=false;
    const fireLife=data.passed||data.broken?0:data.entered?THREE.MathUtils.clamp(1-data.timer/30,0,1):1,flicker=.84+Math.sin(t*17+index)*.1+Math.sin(t*29+index*2)*.06;fire.life=THREE.MathUtils.lerp(fire.life,fireLife,1-Math.pow(.001,dt));fire.light.intensity=175*Math.pow(fire.life,.72)*flicker;fire.light.distance=18+25*fire.life;fire.light.color.setRGB(.47+.53*fire.life,.075+.529*fire.life,.043+.177*fire.life);fire.glow.material.opacity=.26*fire.life*flicker;fire.glow.scale.setScalar(.55+fire.life*.55);fire.flames.forEach((flame,i)=>{const pulse=.78+Math.sin(t*(8+i*.7)+i)*.2;flame.material.opacity=fire.life*(.58+(i%3)*.12);flame.scale.set(.55+fire.life*.45,.08+fire.life*pulse,.55+fire.life*.45);flame.position.y=.38+fire.life*(.72+(i%2)*.25);});fire.embers.forEach((ember,i)=>{const rise=(t*(.45+(i%4)*.07)+ember.userData.phase)%1;ember.position.y=.55+rise*(1.2+fire.life*3.4);ember.position.x=Math.sin(t*2.2+i)*(.25+rise*.75);ember.position.z=Math.cos(t*1.8+i*1.7)*(.22+rise*.66);ember.material.opacity=fire.life*(1-rise)*.9;});
    if(data.passed){if(data.broken)data.residents.forEach((npc,i)=>{if(npc.userData.eaten)return;npc.position.z-=dt*(5.2+i*.17);npc.position.x+=(npc.userData.escapeX||0)*dt;animateCow(npc,t,9+i%3);});return;}
    if(!data.entered&&Math.abs(dz)<20){data.entered=true;data.timer=0;data.nextTalk=.8;data.talkIndex=0;data.activeBubble=-1;terrorFlash();say('safe.enter',3000);}
    if(!data.entered)return;
    if(dz<-24){data.passed=true;if(activeSafeZone===index)hideNpcBubbles();return;}
    if(Math.abs(dz)<27){activeSafeZone=index;data.timer+=dt;protectedZone=!data.broken;stamina=Math.min(100,stamina+dt*(moving?5:24));
      const coldMix=THREE.MathUtils.smoothstep(data.timer,9,27),cold=data.timer>12,broken=data.timer>29;document.body.classList.toggle('safe-warm',!cold);document.body.classList.toggle('safe-cold',cold&&!broken);
      if(broken&&!data.broken){data.broken=true;document.body.classList.remove('safe-warm','safe-cold');document.body.classList.add('safe-broken');say('safe.break',3600);terrorFlash();shake=1.2;data.residents.forEach((npc,i)=>{npc.rotation.y=Math.PI+(i-3.5)*.18;npc.userData.escapeX=(i-3.5)*1.35;});releaseSafeRefugees(index);setTimeout(()=>document.body.classList.remove('safe-broken'),4200);}
      data.light.color.set(0xffc66b).lerp(new THREE.Color(0x779fac),coldMix);data.light.intensity=broken?6:190-(155*coldMix);data.floorMat.color.set(0xa79861).lerp(new THREE.Color(0x394b49),coldMix);data.floorMat.emissive.set(0xffa82f).lerp(new THREE.Color(0x193e43),coldMix);data.floorMat.emissiveIntensity=broken?.01:.36-(.3*coldMix);
      if(data.timer>=data.nextTalk){data.nextTalk=data.timer+(cold?2.7:3.8);const set=broken?'safe.broken':cold?'safe.cold':'safe.warm';let best=0,bestScore=Infinity;data.residents.slice(0,4).forEach((npc,i)=>{const v=new THREE.Vector3();npc.getWorldPosition(v);v.y+=3;v.project(camera);const score=v.z>1?99:Math.abs(v.x)+Math.abs(v.y)*.3+(i===(data.activeBubble??-1)?1.5:0);if(score<bestScore){best=i;bestScore=score;}});data.activeBubble=best;const el=bubbleEls[best];el.textContent=tr(`${set}.${(data.talkIndex+index)%4}`);data.talkIndex++;hideNpcBubbles();el.hidden=false;}
      bubbleEls.forEach((el,i)=>{if(i!==data.activeBubble){el.hidden=true;return;}const npc=data.residents[i],v=new THREE.Vector3();npc.getWorldPosition(v);v.y+=4;v.project(camera);el.style.left=((v.x*.5+.5)*innerWidth)+'px';el.style.top=((-v.y*.5+.5)*innerHeight)+'px';el.hidden=v.z>1||Math.abs(v.x)>1.2||Math.abs(v.y)>1.2;});
      for(const collider of data.colliders){const wx=zone.position.x+collider.x,wz=zone.position.z+collider.z,r=collider.r+1.05,dx=player.position.x-wx,pz=player.position.z-wz,d2=dx*dx+pz*pz;if(d2<r*r){const d=Math.max(.001,Math.sqrt(d2)),push=r-d;player.position.x+=dx/d*push;player.position.z+=pz/d*push;}}
      if(data.broken)data.residents.forEach((npc,i)=>{if(npc.userData.eaten)return;npc.position.z-=dt*(6+i*.18);npc.position.x+=(npc.userData.escapeX||0)*dt;animateCow(npc,t,11+i%3);});
    }
  });
  if(activeSafeZone<0){document.body.classList.remove('safe-warm','safe-cold');hideNpcBubbles();}
  return protectedZone;
}
function updateObjectives(progress,dt,t,moving,safeProtected){
  let missionKey='',missionParams={};
  const near=(object,radius=3)=>Math.hypot(player.position.x-object.position.x,player.position.z-object.position.z)<radius;
  clothPieces.forEach(item=>{
    if(!item.visible)return;item.userData.light.visible=!performanceMode||Math.abs(player.position.z-item.position.z)<90;item.rotation.y+=dt*.65;item.position.y=.05+Math.sin(t*3+item.position.x)*.14;item.userData.ring.rotation.z+=dt*2.1;item.userData.beam.material.opacity=.22+Math.sin(t*4+item.position.x)*.14;item.userData.light.intensity=48+Math.sin(t*5)*18;
    if(near(item,3.2)){item.visible=false;clothCount++;say('task.clothFound',2300,{count:clothCount});sound(310,.35,'triangle',.07);}
  });
  const forestOpen=clothCount>=clothPieces.length;forestGate.userData.open=forestOpen;forestGate.position.y=THREE.MathUtils.lerp(forestGate.position.y,forestOpen?-10:0,.08);
  if(!forestOpen&&progress>runLength*.245&&progress<runLength*.41){const remaining=clothPieces.filter(item=>item.visible).sort((a,b)=>Math.hypot(player.position.x-a.position.x,player.position.z-a.position.z)-Math.hypot(player.position.x-b.position.x,player.position.z-b.position.z)),nearestCloth=remaining[0],clothDistance=nearestCloth?Math.round(Math.hypot(player.position.x-nearestCloth.position.x,player.position.z-nearestCloth.position.z)):0,direction=nearestCloth?(nearestCloth.position.x-player.position.x>3?'direction.left':nearestCloth.position.x-player.position.x<-3?'direction.right':'direction.ahead'):'direction.ahead';missionKey=nearestCloth&&clothDistance<110?'task.clothHint':'task.clothMission';missionParams={count:clothCount,total:clothPieces.length,distance:clothDistance,direction:tr(direction)};if(player.position.z<forestGate.position.z+3.8)player.position.z=forestGate.position.z+3.8;}

  powerSwitches.forEach(sw=>{
    if(!sw.visible)return;sw.userData.lamp.visible=!performanceMode||Math.abs(player.position.z-sw.position.z)<90;sw.userData.lamp.intensity=sw.userData.on?42:18+Math.sin(t*7)*10;
    if(!sw.userData.on&&near(sw,4)){sw.userData.on=true;switchCount++;sw.userData.lever.rotation.x=-.75;sw.userData.lamp.color.set(0x76ff55);say('task.switchOn',2200,{count:switchCount});sound(92,.65,'square',.09);terrorFlash();}
  });
  const powerOpen=switchCount>=powerSwitches.length;powerGate.userData.open=powerOpen;powerGate.position.y=THREE.MathUtils.lerp(powerGate.position.y,powerOpen?-10:0,.08);
  if(!powerOpen&&progress>runLength*.645&&progress<runLength*.805){missionKey='task.switchMission';missionParams={count:switchCount,total:powerSwitches.length};if(player.position.z<powerGate.position.z+3.8)player.position.z=powerGate.position.z+3.8;}

  sheltered=false;
  shelterHuts.forEach(hut=>{hut.userData.warm.visible=!performanceMode||Math.abs(player.position.z-hut.position.z)<90;if(near(hut,6.2)&&!moving){sheltered=true;stamina=Math.min(100,stamina+dt*30);}});
  document.body.classList.toggle('sheltered',sheltered);
  if(currentChapter===2&&!sheltered&&progress>runLength*.43&&progress<runLength*.58){missionKey='task.shelterMission';}
  if(sheltered){missionKey='task.sheltered';}

  itemPickups.forEach(item=>{
    if(item.userData.collected)return;item.rotation.y+=dt*1.9;item.userData.ring.rotation.z+=dt*2.2;
    if(!near(item,3.1))return;item.userData.collected=true;spawnPickupParticles(item);playPickupSound(item.userData.type);item.visible=false;
    if(item.userData.type==='herb'){hearts=Math.min(3,hearts+1);stamina=100;renderHearts();}
    else if(item.userData.type==='flashlight')flashlightUntil=elapsed+32;
    else if(item.userData.type==='radio')radioOwned=true;
    else if(item.userData.type==='speed'){speedBoostUntil=Math.max(speedBoostUntil,elapsed)+11;stamina=Math.min(100,stamina+28);}
    else smokeCharges=1;
    say(`item.${item.userData.type}`,2600);shake=Math.max(shake,.16);
  });
  document.body.classList.toggle('flashlight-on',elapsed<flashlightUntil);document.body.classList.toggle('speed-boost',elapsed<speedBoostUntil);

  // 只按画出来的两段石墙碰撞；旧版把整条地图边缘也当成墙，形成了看不见的空气墙。
  forkWalls.forEach(fork=>{if(!fork.visible)return;for(const side of [-1,1])if(pushPlayerFromBox(fork.position.x+side*18,fork.position.z,10.8,1.45))shake=Math.max(shake,.12);});

  if(!fakeExitTriggered&&progress>runLength*.875&&near(falseGate,18)){
    fakeExitTriggered=true;falseGate.userData.triggered=true;falseGate.userData.mat.color.set(0x6d0908);falseGate.rotation.z=.06;say('task.falseExit',3600);terrorFlash();shake=1.1;sound(34,1.2,'sawtooth',.14);
  }
  if(fakeExitTriggered&&progress>runLength*.87){missionKey='task.trueExit';}

  if(progress>runLength*.805){
    if(!finalWaveStarted){finalWaveStarted=true;say('task.stampede',3300);terrorFlash();
      const mode=difficulties[selectedCharacter],remaining=Math.max(0,mode.stalkers-stalkers.filter(enemy=>enemy.userData.spawned).length);spawnStalkerWave(4,remaining);
    }
    finalHerd.forEach((cow,i)=>{if(cow.userData.escaped||cow.userData.eaten)return;cow.visible=true;talkToPassingNpc(cow,i+12);if(holdNpcInSafeZone(cow,t,dt))return;cow.position.z-=dt*(i===0?11.8:6.4+(i%4)*.24);cow.position.x+=(cow.userData.escapeX||0)*dt+Math.sin(t*1.8+i)*dt*(i===0?.75:.38);animateCow(cow,t,i===0?17:11);if(cow.userData.superCape){cow.userData.superCape.rotation.x=Math.sin(t*12)*.12;cow.userData.superCape.position.y=cow.userData.superCape.userData.baseY+Math.sin(t*9)*.09;}if(cow.position.z<exitZ+4){cow.userData.escaped=true;rescuedCows++;cow.visible=false;}});
  }
  return {protectedZone:safeProtected||sheltered,missionKey,missionParams};
}
function updateObjectiveArrow(progress,t){
  let candidates=[];
  const clothTask=clothCount<clothPieces.length&&progress>runLength*.245&&progress<runLength*.41;
  const switchTask=switchCount<powerSwitches.length&&progress>runLength*.645&&progress<runLength*.805;
  if(clothTask)candidates=clothPieces.filter(item=>item.visible);
  else if(switchTask)candidates=powerSwitches.filter(item=>item.visible&&!item.userData.on);
  else if(dreamClock.visible)candidates=[dreamClock];
  let target=null,best=Infinity;for(const item of candidates){const d=Math.hypot(item.position.x-player.position.x,item.position.z-player.position.z);if(d<best){best=d;target=item;}}
  objectiveArrow.classList.remove('show');
  if(!target||best>105||best<3.4||state!=='playing'){objectiveTrail.visible=false;return;}
  const dx=target.position.x-player.position.x,dz=target.position.z-player.position.z,yaw=Math.atan2(-dx,-dz),flow=t*7;
  objectiveTrail.visible=true;objectiveTrailArrows.forEach((arrow,i)=>{const travel=4+(flow+i*5.2)%26;arrow.visible=travel<best-1.3;if(!arrow.visible)return;const ratio=travel/best;arrow.position.set(player.position.x+dx*ratio,.09,player.position.z+dz*ratio);arrow.rotation.set(-Math.PI/2,yaw,0);arrow.material.opacity=.38+.42*(.5+.5*Math.sin(t*7-i*.8));const scale=.82+Math.sin(t*7-i*.7)*.1;arrow.scale.setScalar(scale);});
}
const herdFleeLines=Array.from({length:7},(_,i)=>`herd.flee.${i}`),herdCaughtLines=Array.from({length:7},(_,i)=>`herd.caught.${i}`);
const passingNpcLines=Array.from({length:6},(_,i)=>`passingNpc.${i}`);let lastPassingNpcTalk=-99;
function talkToPassingNpc(npc,index){
  if(npc.userData.passingTalked||npc.userData.eaten||npc.userData.escaped||elapsed-lastPassingNpcTalk<2.4)return;
  npc.getWorldPosition(collisionPoint);if(Math.hypot(player.position.x-collisionPoint.x,player.position.z-collisionPoint.z)>19)return;
  const key=passingNpcLines[index%passingNpcLines.length];npc.userData.passingTalked=true;lastPassingNpcTalk=elapsed;say(key,3200);showWorldSpeech(npc,key,3300);sound(176+(index%4)*18,.1,'triangle',.025);
}
function talkToRoadNpc(npc,index){
  if(npc.userData.talked||npc.userData.eaten)return false;
  const distance=Math.hypot(player.position.x-npc.position.x,player.position.z-npc.position.z);if(distance>=21)return false;
  const key=`roadNpc.${index}`;npc.userData.talked=true;lastPassingNpcTalk=elapsed;say(key,3400);showWorldSpeech(npc,key,3600);sound(164+index*22,.12,'triangle',.028);return true;
}

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
function damageHeart(hitKey,attacker,deathKey,deathParams={}){if(state!=='playing'||elapsed<invulnerableUntil)return;invulnerableUntil=elapsed+(difficulties[selectedCharacter].invuln||2.15);hearts=Math.max(0,hearts-1);renderHearts(true);terrorFlash();shake=.9;if(hearts)say('event.heartLost',1800,{count:hearts});if(hearts<=0)beginPlayerDeath(attacker,deathKey,deathParams);else if(attacker){const dx=player.position.x-attacker.position.x,dz=player.position.z-attacker.position.z,d=Math.max(1,Math.hypot(dx,dz));player.position.x+=dx/d*4.2;player.position.z+=dz/d*4.2;attacker.position.x-=dx/d*1.5;attacker.position.z-=dz/d*1.5;}}
renderHearts();
function sound(freq=80,dur=.16,type='sawtooth',vol=.05){
  if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
  const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(22,freq*.4),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur);
}
function horrorSound(kind=0){
  if(!audio)return;const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain(),pan=audio.createStereoPanner?audio.createStereoPanner():audio.createGain();o.type=kind===2?'square':'sawtooth';o.frequency.setValueAtTime(kind===0?38:kind===1?690:kind===3?145:54,now);o.frequency.exponentialRampToValueAtTime(kind===1?85:kind===3?39:22,now+(kind===3?2.8:.65));g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(kind===1?.12:kind===3?.22:.18,now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+(kind===3?3:.72));if(pan.pan)pan.pan.value=Math.random()*2-1;o.connect(g).connect(pan).connect(audio.destination);o.start(now);o.stop(now+(kind===3?3.05:.75));
}
function playGhostSignature(type){
  if(type==='toshio'){[420,520,455].forEach((freq,i)=>setTimeout(()=>sound(freq,.24,'sine',.07),i*185));return;}
  if(type==='kayako'){[54,47,41,36].forEach((freq,i)=>setTimeout(()=>sound(freq,.34,'sawtooth',.075),i*115));return;}
  // 电视雪花声：几次短促的方波爆裂，随后落入井底般的低频。
  [920,510,760,330,88].forEach((freq,i)=>setTimeout(()=>sound(freq,i===4?.75:.08,i===4?'sawtooth':'square',i===4?.09:.035),i*90));
}
function triggerHaunt(){
  if(state!=='playing')return;const kind=Math.floor(Math.random()*5);
  document.body.classList.remove('apparition','blackout','blood-flash','heartbeat');
  if(kind===0){document.body.classList.add('blackout');horrorSound(0);shake=.45;hauntTimer=setTimeout(()=>document.body.classList.remove('blackout'),70+Math.random()*90);}
  else if(kind===1){document.body.classList.add('apparition');horrorSound(1);shake=.8;hauntTimer=setTimeout(()=>document.body.classList.remove('apparition'),480);}
  else if(kind===2){document.body.classList.add('blood-flash');horrorSound(2);hauntTimer=setTimeout(()=>document.body.classList.remove('blood-flash'),520);}
  else if(kind===3){const w=watchers.find(x=>!x.visible)||watchers[0],side=Math.random()<.5?-1:1;if(activeSafeZone>=0){const zone=safeZones[activeSafeZone],angle=Math.random()*Math.PI*2;w.position.set(zone.position.x+Math.cos(angle)*25,0,zone.position.z+Math.sin(angle)*23);w.rotation.y=-angle;}else{w.position.set(player.position.x+side*(7+Math.random()*9),0,player.position.z-12-Math.random()*20);w.rotation.y=side>0?-.4:.4;}w.userData.spoken=false;w.visible=true;horrorSound(0);hauntTimer=setTimeout(()=>w.visible=false,3200+Math.random()*1800);}
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
  clearTimeout(specialEntranceTimer);document.body.classList.remove(...specialEntranceClasses,'well-haunting');objectiveArrow.classList.remove('show');objectiveTrail.visible=false;
  clearTimeout(say.t);clearTimeout(hauntTimer);ui.subtitle.classList.remove('show');ui.warning.classList.remove('show');activeSayKey='';activeMissionKey='hud.defaultMission';activeMissionParams={};Object.keys(keys).forEach(key=>delete keys[key]);resetJoystick();stopMusic();
  document.body.style.removeProperty('transform');document.body.style.removeProperty('filter');canvas.style.removeProperty('transform');camera.zoom=1;document.body.classList.remove('dreaming');
  const mode=difficulties[selectedCharacter];runLength=mode.length;exitZ=18-runLength;distance=runLength;gate.position.set(22,0,exitZ);beacon.position.set(22,14,exitZ+2);gateBeam.position.set(22,50,exitZ);gateSign.position.set(22,36,exitZ+1);guidePosts.forEach(post=>post.visible=post.position.z>exitZ+18);scene.fog.density=mode.fog;scene.background.set(selectedCharacter==='orange'?0xaeba88:selectedCharacter==='yellow'?0x9daa7c:0x77806a);
  state='playing'; elapsed=0; stamina=100;hearts=3;invulnerableUntil=0;exhausted=false; hunterSpeed=7.5; lastLine=-1;speedLevel=0;deathElapsed=0;deathAttacker=null;deathReason=null;resultSnapshot=null;nextDeathBlood=0;snowStage=0;snowBlend=0;snow.visible=false;snow.material.opacity=0;snowGhost.visible=false;weatherActive=Math.random()<.58;nextWeatherChange=7+Math.random()*12;nextTerrorFlash=mode.flashMin+Math.random()*mode.flashRange;nextHaunt=5+Math.random()*6;watchers.forEach(w=>w.visible=false);document.body.classList.remove('death-maul','exhausted','enemy-near','terror-flash','flash-negative','apparition','blackout','blood-flash','heartbeat','otherworld','snow-haunting','rain-active','safe-warm','safe-cold','safe-broken','sheltered','flashlight-on','speed-boost','smoke-screen','chapter-1','chapter-2','chapter-3','chapter-4','chapter-5','hit','glitch','title-cry','health-3','health-2','health-1','health-0','difficulty-easy','difficulty-normal','difficulty-hard');document.body.classList.add(selectedCharacter==='orange'?'difficulty-easy':selectedCharacter==='yellow'?'difficulty-normal':'difficulty-hard');ui.distance.textContent=runLength+tr('world.m');
  const oldPlayer=player;player=createCharacter(selectedCharacter);player.position.set(0,.05,18);player.rotation.set(0,0,0);scene.remove(oldPlayer);scene.add(player);renderHearts();storyStage=0;waveWarningStage=0;activeChasers=[];allEnemies.forEach(e=>{e.visible=false;e.position.y=e.userData.type==='car'?0:.05;e.userData.feeding=0;e.userData.joined=false;e.userData.headBob=0;e.userData.spawned=false;e.userData.pounce=null;e.userData.nextPounce=0;e.userData.stunnedUntil=0;});scalableEnemies.forEach(enemy=>{enemy.userData.sizeMultiplier=1;enemy.scale.copy(enemy.userData.baseScale);});stalkers.forEach(e=>e.position.copy(e.userData.home));monsterCar.position.set(0,0,80);snakes.forEach(snake=>{snake.position.copy(snake.userData.home);snake.rotation.set(0,Math.PI/2,0);snake.userData.avoidTimer=0;snake.visible=true;});treeEnemies.forEach(e=>e.visible=true);snowGhost.userData.stunnedUntil=0;
  bloodEffects.splice(0).forEach(f=>scene.remove(f.group));
  birdDroppings.splice(0).forEach(drop=>{scene.remove(drop.mesh);drop.mesh.material.dispose();});strangeBirds.forEach((bird,i)=>{bird.userData.nextDrop=8+i*1.8+Math.random()*15;bird.userData.panicUntil=0;bird.userData.shoveVelocity=null;});
  pickupEffects.splice(0).forEach(effect=>scene.remove(effect.group));
  knockedObstacles.splice(0);obstacles.forEach(obstacle=>{const original=obstacle.userData.originalTransform;if(original){obstacle.position.copy(original.position);obstacle.rotation.copy(original.rotation);obstacle.visible=original.visible;}obstacle.userData.collisionDisabled=false;obstacle.userData.knockVelocity=null;});
  herdCows.forEach((c,i)=>{c.position.copy(c.userData.start);c.rotation.set(0,0,0);c.visible=c.position.z>exitZ;c.userData.active=false;c.userData.eaten=false;c.userData.escaped=false;c.userData.announced=false;c.userData.superBoastAt=0;c.userData.superBoasted=false;const e=ambushers[i];e.position.copy(e.userData.start);e.rotation.set(0,0,0);e.visible=false;e.userData.disabled=i>=mode.ambushers;e.userData.feeding=0;e.userData.joined=false;});
  const herdCenter=18-runLength*.165;storyHerd.forEach((cow,i)=>{cow.position.set(cow.userData.offsetX,.05,herdCenter+cow.userData.offsetZ);cow.rotation.set(0,Math.PI,0);cow.visible=false;cow.userData.active=false;cow.userData.escaped=false;cow.userData.eaten=false;});
  currentChapter=-1;activeSafeZone=-1;hideNpcBubbles();witnessSpeaker=null;superCowSpeaker=null;witnessBubble.hidden=true;superCowBubble.hidden=true;safeZones.forEach((zone,i)=>{zone.position.set(0,0,18-runLength*((i+1)/5));zone.visible=true;Object.assign(zone.userData,{entered:false,passed:false,broken:false,timer:0,nextTalk:0,talkIndex:0,activeBubble:-1});zone.userData.light.color.set(0xffc66b);zone.userData.light.intensity=190;zone.userData.floorMat.color.set(0xa79861);zone.userData.floorMat.emissive.set(0xffa82f);zone.userData.floorMat.emissiveIntensity=.36;zone.userData.campfire.life=1;zone.userData.campfire.light.intensity=175;zone.userData.house.healthPickup.userData.collected=false;zone.userData.house.healthPickup.visible=true;zone.userData.house.roofMats.forEach(mat=>mat.opacity=.94);zone.userData.residents.forEach(npc=>{npc.position.copy(npc.userData.safeStart);npc.rotation.set(0,Math.PI,0);npc.visible=true;npc.userData.eaten=false;npc.userData.escaped=false;});});showChapter(0);
  toshioStage=0;kayakoStage=0;sadakoStage=0;toshioStageAt=0;kayakoStageAt=0;sadakoStageAt=0;toshioIndex=0;kayakoIndex=0;sadakoIndex=0;[toshio,kayako,sadako].forEach(ghost=>{ghost.visible=false;ghost.position.y=.05;ghost.rotation.set(0,0,0);ghost.scale.setScalar(1);ghost.userData.pounce=null;ghost.userData.stunnedUntil=0;ghost.userData.feeding=0;});kayakoStairs.visible=false;cursedTelevision.visible=false;cursedTelevision.userData.screenMat.opacity=.82;sadako.userData.nextTeleport=0;
  const encounterSets=selectedCharacter==='orange'?{toshio:[.14,.78],kayako:[.34],sadako:[.53],freddy:[.69],edward:[.39,.88],jiangchen:[.86]}:selectedCharacter==='yellow'?{toshio:[.11,.28,.47,.66,.86],kayako:[.27,.49,.69,.88],sadako:[.48,.68,.87],freddy:[.64,.76,.9],edward:[.34,.58,.78,.94],jiangchen:[.82,.9,.97]}:{toshio:[.1,.25,.42,.62,.82,.94],kayako:[.24,.43,.63,.83,.95],sadako:[.42,.61,.81,.94],freddy:[.62,.71,.82,.91,.97],edward:[.32,.47,.64,.78,.9,.97],jiangchen:[.81,.88,.94,.98]};toshioRatios=encounterSets.toshio;kayakoRatios=encounterSets.kayako;sadakoRatios=encounterSets.sadako;freddyRatios=encounterSets.freddy;edwardRatios=encounterSets.edward;jiangchenRatios=encounterSets.jiangchen;freddyIndex=0;edwardIndex=0;jiangchenIndex=0;freddyUntil=0;edwardStage=0;edwardStageAt=0;jiangchenUntil=0;[freddy,jiangchen,edwardRipper,dreamClock].forEach(actor=>{actor.visible=false;actor.position.y=.05;actor.rotation.set(0,0,0);actor.scale.setScalar(1);});freddy.userData.pounce=null;jiangchen.userData.pounce=null;
  clothCount=0;switchCount=0;sheltered=false;flashlightUntil=0;speedBoostUntil=0;smokeCharges=0;radioOwned=false;fakeExitTriggered=false;finalWaveStarted=false;rescuedCows=0;npcShoveHintShown=false;lastNpcShove=-9;
  // 任务物全部排在门前，玩家沿前进方向依次取得，不会越过出口后再被迫回头。
  [[-22,.365],[20,.378],[0,.389]].forEach(([x,r],i)=>{const item=clothPieces[i];item.position.set(x,.05,18-runLength*r);item.visible=true;item.rotation.y=Math.random()*Math.PI;});forestGate.position.set(0,0,18-runLength*.395);forestGate.userData.open=false;
  [[-20,.755],[20,.778]].forEach(([x,r],i)=>{const sw=powerSwitches[i];sw.position.set(x,0,18-runLength*r);sw.visible=true;sw.userData.on=false;sw.userData.lever.rotation.x=.45;sw.userData.lamp.color.set(0xff2a14);});powerGate.position.set(0,0,18-runLength*.79);powerGate.userData.open=false;
  [[-15,.47],[16,.54]].forEach(([x,r],i)=>{shelterHuts[i].position.set(x,0,18-runLength*r);shelterHuts[i].visible=true;});falseGate.position.set(0,0,18-runLength*.9);falseGate.visible=true;falseGate.userData.triggered=false;falseGate.userData.mat.color.set(0xb9e83b);
  finalHerd.forEach((cow,i)=>{cow.position.set((i%5-2)*4.2,.05,18-runLength*.825-Math.floor(i/5)*6);cow.rotation.set(0,Math.PI,0);cow.visible=false;cow.userData.escaped=false;cow.userData.eaten=false;cow.userData.superBoastAt=0;cow.userData.superBoasted=false;});
  [[-10,.18],[18,.39],[-16,.59],[20,.74],[14,.1],[-17,.29],[16,.51],[-14,.69]].forEach(([x,r],i)=>{const item=itemPickups[i];item.position.set(x,.05,18-runLength*r);item.visible=true;item.userData.collected=false;});
  forkWalls.forEach((fork,i)=>{fork.position.set((Math.random()<.5?-1:1)*(8+Math.random()*7),0,18-runLength*(.23+i*.075));fork.rotation.y=(Math.random()-.5)*.08;fork.visible=true;});
  strangeTravellers.forEach(c=>{c.position.copy(c.userData.start);c.rotation.set(0,0,0);c.visible=true;c.userData.fleeing=false;c.userData.eaten=false;c.userData.escaped=false;c.userData.talked=false;});animalActors.forEach(animal=>{animal.userData.refugeZone=-1;animal.userData.refugeParked=false;animal.userData.refugeOffset=null;animal.userData.escapeX=0;animal.userData.passingTalked=false;});lastPassingNpcTalk=-99;
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
  state=win?'win':'caught';recordScore(win);clearTimeout(hauntTimer);clearTimeout(specialEntranceTimer);objectiveArrow.classList.remove('show');objectiveTrail.visible=false;witnessBubble.hidden=true;superCowBubble.hidden=true;watchers.forEach(w=>w.visible=false);[snowGhost,toshio,kayako,sadako,kayakoStairs,cursedTelevision,freddy,jiangchen,edwardRipper,dreamClock].forEach(actor=>actor.visible=false);snow.visible=false;document.body.classList.remove('playing','death-maul','exhausted','enemy-near','terror-flash','flash-negative','apparition','blackout','blood-flash','heartbeat','otherworld','snow-haunting','rain-active','safe-warm','safe-cold','safe-broken','dreaming','speed-boost','well-haunting',...specialEntranceClasses);ui.result.classList.add('show');
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
  stopMusic();state='intro';hearts=3;renderHearts();objectiveArrow.classList.remove('show');objectiveTrail.visible=false;document.body.classList.remove('playing','well-haunting',...specialEntranceClasses);ui.result.classList.remove('show');ui.intro.classList.remove('hidden');
  clearTimeout(hauntTimer);watchers.forEach(w=>w.visible=false);snowGhost.visible=false;snow.visible=false;document.body.classList.remove('exhausted','enemy-near','terror-flash','flash-negative','apparition','blackout','blood-flash','heartbeat','otherworld','snow-haunting','rain-active','safe-warm','safe-cold','safe-broken','speed-boost');
  player.position.set(0,.05,18);player.rotation.set(0,0,0);storyStage=0;activeChasers=[];allEnemies.forEach(e=>e.visible=false);hunterGlow.visible=false;
  playTitleCry();
};
document.querySelectorAll('.character').forEach(button=>button.addEventListener('click',()=>{
  if(state!=='intro')return;
  selectedCharacter=button.dataset.character;document.querySelectorAll('.character').forEach(b=>b.classList.toggle('active',b===button));
  const old=player;player=createCharacter(selectedCharacter);player.position.copy(old.position);player.rotation.y=0;scene.remove(old);scene.add(player);renderHearts();sound(120,.12,'square',.025);
}));
const movementCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight']);
addEventListener('keydown',e=>{if(movementCodes.has(e.code)){e.preventDefault();keys[e.code]=true;}if(e.code==='KeyE'&&!e.repeat){e.preventDefault();performNpcShove();}if(e.code==='Escape'){scoreboard.classList.remove('show');scoreboard.setAttribute('aria-hidden','true');}if(e.code==='Enter'&&state==='intro'&&!scoreboard.classList.contains('show'))start();if(e.code==='KeyR'&&state!=='playing'&&!scoreboard.classList.contains('show'))start();});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>{Object.keys(keys).forEach(key=>delete keys[key]);resetJoystick();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){Object.keys(keys).forEach(key=>delete keys[key]);resetJoystick();}});
const touchControls=isNativeApp||('ontouchstart' in window)||(navigator.maxTouchPoints||0)>0;
document.querySelectorAll('.mobile-controls button[data-key]').forEach(button=>{
  const key=button.dataset.key,visual=document.querySelector(button.dataset.visual)||button;
  button.addEventListener('pointerdown',event=>{if(touchControls&&event.pointerType!=='mouse')return;event.preventDefault();keys[key]=true;visual.classList.add('pressed')});
  const release=()=>{keys[key]=false;visual.classList.remove('pressed')};
  ['pointerup','pointercancel','pointerleave'].forEach(type=>button.addEventListener(type,event=>{if(touchControls&&event.pointerType!=='mouse')return;release()}));
});
const joystickEl=document.querySelector('#joystick'),joystickKnob=document.querySelector('#joystickKnob');
function moveJoystick(e){
  const r=joystickEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,limit=r.width*.31;
  let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy);if(len>limit){dx*=limit/len;dy*=limit/len;}
  joystick.x=dx/limit;joystick.y=dy/limit;joystickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}
let joystickPointer=null,joystickTouch=null,joystickHeldAt=0;
joystickEl.addEventListener('pointerdown',e=>{if(touchControls&&e.pointerType!=='mouse')return;e.preventDefault();joystickPointer=e.pointerId;joystickHeldAt=performance.now();joystickEl.classList.add('active');try{joystickEl.setPointerCapture(e.pointerId)}catch{}moveJoystick(e);});
joystickEl.addEventListener('pointermove',e=>{if(touchControls&&e.pointerType!=='mouse')return;if(joystickPointer===e.pointerId){e.preventDefault();moveJoystick(e);}},{passive:false});
function resetJoystick(){joystickPointer=null;joystickTouch=null;joystickHeldAt=0;joystick.x=joystick.y=0;joystickKnob.style.transform='translate(0,0)';joystickEl.classList.remove('active');}
joystickEl.addEventListener('pointerup',e=>{if(!touchControls||e.pointerType==='mouse')resetJoystick();});joystickEl.addEventListener('pointercancel',e=>{if(!touchControls||e.pointerType==='mouse')resetJoystick();});addEventListener('pointermove',e=>{if((!touchControls||e.pointerType==='mouse')&&joystickPointer===e.pointerId)moveJoystick(e);},{passive:false});addEventListener('pointerup',e=>{if((!touchControls||e.pointerType==='mouse')&&joystickPointer===e.pointerId)resetJoystick();});addEventListener('pointercancel',e=>{if((!touchControls||e.pointerType==='mouse')&&joystickPointer===e.pointerId)resetJoystick();});
function trackedTouch(event){return [...Array.from(event.changedTouches||[]),...Array.from(event.touches||[])].find(touch=>joystickTouch===null||touch.identifier===joystickTouch);}
joystickEl.addEventListener('touchstart',e=>{e.preventDefault();const touch=e.changedTouches[0];if(!touch)return;joystickTouch=touch.identifier;joystickHeldAt=performance.now();joystickEl.classList.add('active');moveJoystick(touch);},{passive:false});
joystickEl.addEventListener('touchmove',e=>{e.preventDefault();const touch=trackedTouch(e);if(touch&&touch.identifier===joystickTouch)moveJoystick(touch);},{passive:false});
joystickEl.addEventListener('touchend',e=>{if(Array.from(e.changedTouches||[]).some(touch=>touch.identifier===joystickTouch))resetJoystick();},{passive:false});joystickEl.addEventListener('touchcancel',resetJoystick,{passive:false});
document.addEventListener('touchmove',e=>{if(joystickTouch===null)return;const touch=trackedTouch(e);if(touch&&touch.identifier===joystickTouch){e.preventDefault();moveJoystick(touch);}},{passive:false});document.addEventListener('touchend',e=>{if(Array.from(e.changedTouches||[]).some(touch=>touch.identifier===joystickTouch))resetJoystick();},{passive:false});document.addEventListener('touchcancel',resetJoystick,{passive:false});

// 独立按钮让角色模型本身伸出手指，把正前方最近的友方 NPC 搓开；敌人和障碍物不在候选集合内。
let npcShoveHintShown=false,lastNpcShove=-9;
function moveFriendlyNpcBy(npc,worldX,worldZ){
  const world=npc.getWorldPosition(new THREE.Vector3());world.x=THREE.MathUtils.clamp(world.x+worldX,-57,57);world.z+=worldZ;if(npc.parent&&npc.parent!==scene){npc.parent.worldToLocal(world);npc.position.x=world.x;npc.position.z=world.z;}else{npc.position.x=world.x;npc.position.z=world.z;}if(npc.userData.refugeOffset){npc.userData.refugeOffset.x+=worldX;npc.userData.refugeOffset.z+=worldZ;}
}
function shoveFriendlyNpc(npc,worldX,worldZ){
  if(!npc||!npc.visible)return;npc.userData.shoveMotion={x:worldX,z:worldZ,age:0,duration:.52,applied:0};npc.userData.avoidTimer=.62;shake=Math.max(shake,.08);
  if(!npcShoveHintShown){npcShoveHintShown=true;say('event.npcShoved',1800);sound(105,.1,'triangle',.025);}
}
function playFingerWhoosh(){
  if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume?.().catch(()=>{});const now=audio.currentTime,buffer=audio.createBuffer(1,Math.max(1,Math.floor(audio.sampleRate*.16)),audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.setValueAtTime(1450,now);filter.frequency.exponentialRampToValueAtTime(310,now+.16);filter.Q.value=.7;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.115,now+.018);gain.gain.exponentialRampToValueAtTime(.0001,now+.16);source.connect(filter).connect(gain).connect(audio.destination);source.start(now);
}
function playFingerImpact(){
  if(!audio)return;const now=audio.currentTime;for(const [freq,type,volume,end] of [[185,'sine',.14,.13],[76,'square',.065,.19],[920,'triangle',.045,.055]]){const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(freq,now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.46),now+end);gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+end);oscillator.connect(gain).connect(audio.destination);oscillator.start(now);oscillator.stop(now+end);}
}
function updateFriendlyNpcShove(npc,dt){const motion=npc.userData.shoveMotion;if(!motion)return false;motion.age=Math.min(motion.duration,motion.age+dt);const progress=motion.age/motion.duration,eased=1-Math.pow(1-progress,3),step=eased-motion.applied;motion.applied=eased;moveFriendlyNpcBy(npc,motion.x*step,motion.z*step);npc.rotation.z=THREE.MathUtils.clamp(-motion.x*.12*(1-progress),-.42,.42);if(progress>=1){npc.userData.shoveMotion=null;npc.rotation.z=0;}return true;}
function findNpcToShove(){
  const fx=-Math.sin(player.rotation.y),fz=-Math.cos(player.rotation.y);let best=null,bestDistance=8.2;
  for(const npc of animalActors){if(!npc.visible||npc.userData.eaten||npc.userData.escaped)continue;npc.getWorldPosition(collisionPoint);const dx=collisionPoint.x-player.position.x,dz=collisionPoint.z-player.position.z,d=Math.hypot(dx,dz);if(d<.15||d>=bestDistance||(dx*fx+dz*fz)/d<.12)continue;best=npc;bestDistance=d;}
  return best;
}
function findBirdToShove(){
  const fx=-Math.sin(player.rotation.y),fz=-Math.cos(player.rotation.y);let best=null,bestDistance=12;
  for(const bird of strangeBirds){const dx=bird.position.x-player.position.x,dz=bird.position.z-player.position.z,d=Math.hypot(dx,dz);if(bird.position.y>18||d>=bestDistance||(dx*fx+dz*fz)/Math.max(.1,d)<-.22)continue;best=bird;bestDistance=d;}
  return best;
}
function shoveFlyingBird(bird,worldX,worldZ){if(!bird)return;bird.userData.panicUntil=elapsed+3.2;bird.userData.nextDrop=Math.max(bird.userData.nextDrop,elapsed+10);bird.userData.shoveVelocity=new THREE.Vector3(worldX*2.4,7.5,worldZ*2.4);say('event.birdShoved',1700);sound(118,.22,'square',.07);}
function performNpcShove(){
  if(state!=='playing'||elapsed-lastNpcShove<.7)return false;lastNpcShove=elapsed;const birdTarget=findBirdToShove(),target=birdTarget||findNpcToShove(),shoveFinger=player.userData.shoveFinger;if(shoveFinger){const handIndex=shoveFinger.next??1,hand=shoveFinger.hands?.[handIndex]||shoveFinger;shoveFinger.hands?.forEach(item=>{item.rig.visible=false;item.rig.position.copy(item.basePosition);item.setExtension?.(0);});shoveFinger.active=handIndex;shoveFinger.next=handIndex?0:1;shoveFinger.rig=hand.rig;shoveFinger.finger=hand.finger;shoveFinger.tip=hand.tip;shoveFinger.airTarget=Boolean(birdTarget);shoveFinger.until=elapsed+.68;hand.setExtension?.(0);hand.rig.visible=true;}playFingerWhoosh();navigator.vibrate?.(18);if(!target)return false;
  const world=target.getWorldPosition(new THREE.Vector3()),dx=world.x-player.position.x,dz=world.z-player.position.z,d=Math.max(.1,Math.hypot(dx,dz)),rightX=Math.cos(player.rotation.y),rightZ=-Math.sin(player.rotation.y),side=(dx*rightX+dz*rightZ)>=0?1:-1,pushX=rightX*side*3.45+dx/d*.35,pushZ=rightZ*side*3.45+dz/d*.35;setTimeout(()=>{if(state==='playing'&&target.visible){playFingerImpact();navigator.vibrate?.([12,22,18]);if(birdTarget)shoveFlyingBird(target,pushX,pushZ);else shoveFriendlyNpc(target,pushX,pushZ);}},245);return true;
}
const shoveBtn=document.querySelector('#shoveBtn');
const shoveVisual=shoveBtn;
shoveBtn.addEventListener('pointerdown',event=>{if(touchControls&&event.pointerType!=='mouse')return;event.preventDefault();shoveVisual.classList.add('pressed');performNpcShove();});
const releaseShove=()=>shoveVisual.classList.remove('pressed');
['pointerup','pointercancel','pointerleave'].forEach(type=>shoveBtn.addEventListener(type,event=>{if(touchControls&&event.pointerType!=='mouse')return;releaseShove()}));
const runBtn=document.querySelector('#runBtn'),runVisual=runBtn,shoveTouchIds=new Set();
function touchInside(touch,element,padding=16){const rect=element.getBoundingClientRect();return touch.clientX>=rect.left-padding&&touch.clientX<=rect.right+padding&&touch.clientY>=rect.top-padding&&touch.clientY<=rect.bottom+padding;}
const activeActionTouches=new Map();
function syncActionTouches(event){
  if(!touchControls)return;const changed=Array.from(event.changedTouches||[]),ending=event.type==='touchend'||event.type==='touchcancel';for(const touch of changed){if(ending)activeActionTouches.delete(touch.identifier);else activeActionTouches.set(touch.identifier,{identifier:touch.identifier,clientX:touch.clientX,clientY:touch.clientY});}
  if(event.type==='touchmove')for(const touch of Array.from(event.touches||[]))activeActionTouches.set(touch.identifier,{identifier:touch.identifier,clientX:touch.clientX,clientY:touch.clientY});
  // A small invisible margin makes the complete painted circle (including its
  // antialiased edge) a reliable target on high-DPI mobile screens.
  const touches=Array.from(activeActionTouches.values()),runHeld=state==='playing'&&touches.some(touch=>touchInside(touch,runBtn,12));keys.ShiftLeft=runHeld;runVisual.classList.toggle('pressed',runHeld);
  const currentShoveIds=new Set();if(state==='playing')for(const touch of touches)if(touchInside(touch,shoveBtn,12)){currentShoveIds.add(touch.identifier);if(!shoveTouchIds.has(touch.identifier))performNpcShove();}
  shoveTouchIds.clear();currentShoveIds.forEach(id=>shoveTouchIds.add(id));shoveVisual.classList.toggle('pressed',shoveTouchIds.size>0);
  if(runHeld||shoveTouchIds.size)event.preventDefault();
}
['touchstart','touchmove','touchend','touchcancel'].forEach(type=>document.addEventListener(type,syncActionTouches,{passive:false,capture:true}));

function glitch(){document.body.classList.add('glitch');sound(48,.1,'square',.03);setTimeout(()=>document.body.classList.remove('glitch'),80+Math.random()*160);}
let specialEntranceTimer=0;const specialEntranceClasses=['entrance-cat','entrance-crawler','entrance-well','entrance-dream','entrance-mistblade','entrance-corpse'];
function specialEntrance(type,duration=1800){clearTimeout(specialEntranceTimer);document.body.classList.remove(...specialEntranceClasses);void document.body.offsetWidth;document.body.classList.add(`entrance-${type}`);specialEntranceTimer=setTimeout(()=>document.body.classList.remove(...specialEntranceClasses),duration);}
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
function beginEnemyPounce(enemy,target,targetNpc=false){
  if(enemy.userData.pounce||elapsed<(enemy.userData.nextPounce||0)||elapsed<(enemy.userData.stunnedUntil||0)||elapsed<(enemy.userData.attackReadyAt||0))return false;const end=target.getWorldPosition?target.getWorldPosition(new THREE.Vector3()):target.position.clone(),size=enemy.userData.sizeMultiplier||1;enemy.userData.pounce={age:0,duration:.38+Math.random()*.12,start:enemy.position.clone(),end:new THREE.Vector3(end.x,.05,end.z),target,targetNpc,size};enemy.userData.nextPounce=elapsed+1.45+Math.random()*.65;enemy.userData.arms?.forEach(arm=>arm.rotation.x=-1.05);sound(58+Math.random()*24,.22,'sawtooth',.055);return true;
}
function updateEnemyPounce(enemy,dt){
  const leap=enemy.userData.pounce;if(!leap)return false;leap.age+=dt;const raw=Math.min(1,leap.age/leap.duration),k=raw*raw*(3-2*raw);enemy.position.x=THREE.MathUtils.lerp(leap.start.x,leap.end.x,k);enemy.position.z=THREE.MathUtils.lerp(leap.start.z,leap.end.z,k);enemy.position.y=.05+Math.sin(raw*Math.PI)*(2.1+leap.size*.75);enemy.rotation.x=-Math.sin(raw*Math.PI)*.62;enemy.userData.legs?.forEach((leg,i)=>leg.rotation.x=-.7+(i%2)*.24);if(raw<1)return true;
  enemy.position.y=enemy.userData.type==='car'?0:.05;enemy.rotation.x=0;enemy.userData.pounce=null;const target=leap.target,targetPos=target?.getWorldPosition?target.getWorldPosition(new THREE.Vector3()):target?.position,d=targetPos?Math.hypot(targetPos.x-enemy.position.x,targetPos.z-enemy.position.z):999;if(leap.targetNpc){if(target&&npcCanBeAttacked(target)&&d<3.5*leap.size)bloodyAttack(target,enemy);}else if(target===player&&state==='playing'&&d<4.1*leap.size){shake=1.15;document.body.classList.add('hit');setTimeout(()=>document.body.classList.remove('hit'),400);damageHeart('event.heartLost',enemy,'death.enemy',{enemyKey:enemy.userData.enemyKey||'enemy.them',enemyParams:enemy.userData.enemyParams});}return true;
}
function killNpcWithDropping(npc){
  if(!npcCanBeAttacked(npc)||isInsideSafeZone(npc))return;const world=npc.getWorldPosition(new THREE.Vector3());npc.userData.eaten=true;npc.rotation.z=Math.PI/2;npc.position.y=.36;spawnBloodBurst(world.x,world.z,12);say('event.birdNpcKilled',2200);terrorFlash();
}
function impactBirdDropping(drop,targetType,target){
  if(drop.landed)return;if((targetType==='player'||targetType==='npc')&&isInsideSafeZone(target))targetType='ground';drop.landed=true;drop.velocity.set(0,0,0);drop.mesh.position.y=.055;drop.mesh.scale.set(2.4,.12,2);drop.mesh.material.color.set(0x352814);sound(42,.18,'square',.075);shake=Math.max(shake,targetType==='player'?.55:.18);if(targetType==='player')damageHeart('event.birdHit',drop.mesh,'death.bird');else if(targetType==='npc')killNpcWithDropping(target);else if(targetType==='enemy'&&target){target.userData.stunnedUntil=elapsed+2.8;target.userData.pounce=null;target.rotation.x=0;target.position.y=target.userData.type==='car'?0:.05;}
}
function npcCanBeAttacked(npc){
  if(!npc.visible||npc.userData.eaten||npc.userData.escaped)return false;
  if(Number.isInteger(npc.userData.refugeZone)&&npc.userData.refugeZone>=0&&!safeZones[npc.userData.refugeZone].userData.broken)return false;
  const safeZone=safeZones.find(zone=>npc.parent===zone);return !safeZone||safeZone.userData.broken;
}
function isInsideSafeZone(actor){
  if(!actor)return false;const world=actor.getWorldPosition?actor.getWorldPosition(new THREE.Vector3()):actor.position;return safeZones.some(zone=>zone.visible&&!zone.userData.broken&&!zone.userData.passed&&Math.abs(world.x-zone.position.x)<19&&Math.abs(world.z-zone.position.z)<18);
}
function chooseClosestPrey(enemy,fallback=player,maxNpcRange=48){
  let target=fallback,targetNpc=fallback!==player,targetPosition=targetNpc?fallback.getWorldPosition(new THREE.Vector3()):player.position,distance=Math.hypot(targetPosition.x-enemy.position.x,targetPosition.z-enemy.position.z);
  if(fallback!==player){const playerDistance=Math.hypot(player.position.x-enemy.position.x,player.position.z-enemy.position.z);if(playerDistance+.1<distance){target=player;targetNpc=false;targetPosition=player.position;distance=playerDistance;}}
  for(const npc of animalActors){if(npc===fallback||!npcCanBeAttacked(npc))continue;npc.getWorldPosition(collisionPoint);const nd=Math.hypot(collisionPoint.x-enemy.position.x,collisionPoint.z-enemy.position.z);if(nd<maxNpcRange&&nd+.1<distance){target=npc;targetNpc=true;targetPosition=new THREE.Vector3(collisionPoint.x,collisionPoint.y,collisionPoint.z);distance=nd;}}
  enemy.userData.prey=target;enemy.userData.preyType=targetNpc?'npc':'player';return{target,targetNpc,targetPosition,distance};
}
function animateCow(cow,t,speed){
  cow.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.55);
  cow.userData.arms.forEach((a,i)=>a.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.42);
  if(cow.userData.lockRunView)cow.rotation.y=cow.userData.viewYaw||0;
  if(cow.userData.handstand){
    // 以模型脚底为旋转点翻转后抬高，让头和双手贴近地面、双腿在上方
    // 交替摆动；不是把贴图简单倒过来。
    cow.position.y=.05+4.55*cow.scale.y+Math.abs(Math.sin(t*speed))*cow.scale.y*.14;
    cow.rotation.z=Math.PI+Math.sin(t*speed*.62)*.065;
    cow.userData.arms.forEach((arm,i)=>{arm.rotation.x=Math.sin(t*speed+i*Math.PI)*.78;arm.rotation.z=(i?-.38:.38)+Math.sin(t*speed*.5+i)*.12;});
  }else{cow.position.y=.05;cow.rotation.z=Math.sin(t*speed*.5)*.025;}
}
function animateDistortion(enemy,t){if(!enemy.userData.twistParts)return;enemy.userData.twistParts.forEach((part,i)=>{part.rotation.y+=.018+(i%3)*.006;part.rotation.z=Math.sin(t*(2.8+i*.17)+i)*(.1+(i%2)*.08);part.scale.y=1+Math.sin(t*4+i)*.07;});if(enemy.userData.type==='crawler')enemy.position.y=.12+Math.abs(Math.sin(t*7))*.2;if(enemy.userData.type==='hollow')enemy.rotation.z=Math.sin(t*2.2)*.09;if(enemy.userData.type==='knot')enemy.rotation.y+=.025;}
function animateClassicGhost(enemy,t){
  if(enemy.userData.type==='sadako'){enemy.position.y=.08+Math.abs(Math.sin(t*2.7))*.16;enemy.userData.hair?.forEach((strand,i)=>{strand.rotation.z=Math.sin(t*(3.2+i*.13)+i)*.08;});enemy.userData.arms?.forEach((arm,i)=>arm.rotation.x=-.25+Math.sin(t*2.5+i*Math.PI)*.16);}
  else if(enemy.userData.type==='kayako'){enemy.position.y=.08+Math.abs(Math.sin(t*8.2))*.12;enemy.userData.limbs?.forEach((limb,i)=>{limb.rotation.x=Math.PI/2+Math.sin(t*9+i*Math.PI*.7)*.48;limb.rotation.z=Math.sin(t*7.5+i)*.24;});enemy.rotation.z=Math.sin(t*2.6)*.055;}
}
function addClassicGhostChaser(ghost,speed){if(!activeChasers.includes(ghost)){ghost.visible=true;ghost.userData.chaseSpeed=speed;ghost.userData.pounce=null;ghost.userData.nextPounce=elapsed+1.4;ghost.userData.attackReadyAt=elapsed+1.4;activeChasers.push(ghost);}}
function removeClassicGhostChaser(ghost){const index=activeChasers.indexOf(ghost);if(index>=0)activeChasers.splice(index,1);ghost.visible=false;ghost.userData.pounce=null;}
function classicEncounterScale(index){const difficultyScale=selectedCharacter==='orange'?.9:selectedCharacter==='yellow'?1.1:1.34;return difficultyScale*(1+index*.05);}
function updateClassicGhostSetpieces(progress,dt,t,safeProtected){
  if(toshioStage===4&&toshioIndex<toshioRatios.length)toshioStage=0;
  if(kayakoStage===4&&kayakoIndex<kayakoRatios.length)kayakoStage=0;
  if(sadakoStage===4&&sadakoIndex<sadakoRatios.length)sadakoStage=0;
  if(toshioStage===0&&toshioIndex<toshioRatios.length&&progress>runLength*toshioRatios[toshioIndex]){const appearance=toshioIndex++;toshioStage=1;toshioStageAt=elapsed;toshio.scale.setScalar(classicEncounterScale(appearance));toshio.position.set(THREE.MathUtils.clamp(player.position.x+(Math.random()<.5?-1:1)*(8+Math.random()*5),-42,42),.05,player.position.z-22);toshio.visible=true;specialEntrance('cat',1500);terrorFlash();playGhostSignature('toshio');say('ghost.toshioAppears',2900);}
  if(toshioStage===1){toshio.rotation.y=Math.atan2(toshio.position.x-player.position.x,toshio.position.z-player.position.z);const d=Math.hypot(toshio.position.x-player.position.x,toshio.position.z-player.position.z);if(d<9.5){toshioStage=2;toshioStageAt=elapsed;toshio.visible=false;stamina=Math.max(0,stamina-14);terrorFlash();playGhostSignature('toshio');say('ghost.toshioVanishes',2600);}}
  if(toshioStage===1&&player.position.z<toshio.position.z-14){toshioStage=4;toshio.visible=false;}
  else if(toshioStage===2&&elapsed-toshioStageAt>2.7){toshioStage=3;toshioStageAt=elapsed;toshio.position.set(player.position.x+(Math.random()<.5?-1:1)*3.4,.05,player.position.z+9);toshio.visible=true;playGhostSignature('toshio');say('ghost.toshioBehind',2200);}
  else if(toshioStage===3&&elapsed-toshioStageAt>1.65){toshioStage=4;toshio.visible=false;terrorFlash();}

  if(kayakoStage===0&&kayakoIndex<kayakoRatios.length&&progress>runLength*kayakoRatios[kayakoIndex]){const appearance=kayakoIndex++;kayakoStage=1;kayakoStageAt=elapsed;kayako.scale.setScalar(classicEncounterScale(appearance));kayakoStairs.position.set(THREE.MathUtils.clamp(player.position.x+(Math.random()<.5?-1:1)*(11+Math.random()*6),-39,39),0,player.position.z-28);kayakoStairs.visible=true;kayako.visible=true;specialEntrance('crawler',2100);terrorFlash();playGhostSignature('kayako');say('ghost.kayakoStairs',3400);}
  if(kayakoStage===1){const p=THREE.MathUtils.clamp((elapsed-kayakoStageAt)/3.5,0,1),introY=THREE.MathUtils.lerp(2.65,.08,p);kayako.position.set(kayakoStairs.position.x,introY,THREE.MathUtils.lerp(kayakoStairs.position.z-5.4,kayakoStairs.position.z+1.2,p));kayako.rotation.y=0;animateClassicGhost(kayako,t*1.25);kayako.position.y=introY;if(p>=1){kayakoStage=2;kayakoStageAt=elapsed;kayakoStairs.visible=false;addClassicGhostChaser(kayako,6.85);say('ghost.kayakoChases',2400);}}
  if(kayakoStage===2&&elapsed-kayakoStageAt>8){const d=Math.hypot(kayako.position.x-player.position.x,kayako.position.z-player.position.z);if(player.position.z<kayako.position.z&&d>58){kayakoStage=4;removeClassicGhostChaser(kayako);say('ghost.kayakoEscaped',2200);}}

  if(sadakoStage===0&&sadakoIndex<sadakoRatios.length&&progress>runLength*sadakoRatios[sadakoIndex]){const appearance=sadakoIndex++;sadakoStage=1;sadakoStageAt=elapsed;sadako.userData.encounterScale=classicEncounterScale(appearance);cursedTelevision.position.set(THREE.MathUtils.clamp(player.position.x+(Math.random()<.5?-1:1)*(10+Math.random()*7),-39,39),0,player.position.z-30);cursedTelevision.visible=true;document.body.classList.add('well-haunting');specialEntrance('well',2800);terrorFlash();playGhostSignature('sadako');say('ghost.television',3000);}
  if(sadakoStage===1){cursedTelevision.userData.screenMat.opacity=.35+Math.random()*.65;cursedTelevision.userData.screenMat.color.set(Math.random()>.5?0xdce5df:0x5d6865);if(elapsed-sadakoStageAt>1.25){sadakoStage=2;sadakoStageAt=elapsed;sadako.visible=true;playGhostSignature('sadako');say('ghost.sadakoEmerges',3300);}}
  if(sadakoStage===2){const p=THREE.MathUtils.clamp((elapsed-sadakoStageAt)/3.2,0,1),scale=sadako.userData.encounterScale||1;sadako.position.set(cursedTelevision.position.x,THREE.MathUtils.lerp(.05,.14,p),THREE.MathUtils.lerp(cursedTelevision.position.z-5.6,cursedTelevision.position.z+3.4,p));sadako.rotation.x=THREE.MathUtils.lerp(-1.25,0,p);sadako.scale.setScalar((.76+p*.24)*scale);animateClassicGhost(sadako,t);cursedTelevision.userData.screenMat.opacity=.45+Math.random()*.55;if(p>=1){sadakoStage=3;sadakoStageAt=elapsed;sadako.userData.nextTeleport=elapsed+5.5;sadako.userData.teleportCount=0;addClassicGhostChaser(sadako,7.15);terrorFlash();}}
  if(sadakoStage===3&&sadako.visible&&!safeProtected&&elapsed>=sadako.userData.nextTeleport){const d=Math.hypot(sadako.position.x-player.position.x,sadako.position.z-player.position.z),limit=selectedCharacter==='orange'?1:selectedCharacter==='yellow'?2:3;if((sadako.userData.teleportCount||0)>=limit&&player.position.z<sadako.position.z&&d>46){sadakoStage=4;removeClassicGhostChaser(sadako);cursedTelevision.visible=false;document.body.classList.remove('well-haunting');say('ghost.sadakoEscaped',2200);}else{sadako.userData.nextTeleport=elapsed+8+Math.random()*5;if(d>15&&(sadako.userData.teleportCount||0)<limit){sadako.userData.teleportCount=(sadako.userData.teleportCount||0)+1;sadako.position.set(player.position.x+(Math.random()<.5?-1:1)*(8+Math.random()*5),.08,player.position.z+18+Math.random()*8);sadako.userData.stunnedUntil=elapsed+1.15;sadako.userData.attackReadyAt=elapsed+1.45;terrorFlash();playGhostSignature('sadako');say('ghost.sadakoTeleports',2200);}}}
  if(cursedTelevision.visible){cursedTelevision.userData.screenMat.opacity=.42+Math.random()*.42;cursedTelevision.userData.screen.scale.x=.98+Math.random()*.04;}
}
function encounterScale(kind,index){const base=selectedCharacter==='orange'?.9:selectedCharacter==='yellow'?1.12:1.38;return base*(kind==='jiangchen'?1.38:kind==='edward'?1.08:1)*(1+index*.08);}
function finishFreddy(key){removeClassicGhostChaser(freddy);dreamClock.visible=false;freddyUntil=0;document.body.classList.remove('dreaming');if(key)say(key,2200);}
function startFreddyEncounter(){const index=freddyIndex++;freddy.scale.setScalar(encounterScale('freddy',index));freddy.position.set(player.position.x+(Math.random()<.5?-1:1)*11,.05,player.position.z+27);freddy.userData.stunnedUntil=0;addClassicGhostChaser(freddy,6.55+index*.22);freddyUntil=elapsed+13+(selectedCharacter==='leopard'?3:0);dreamClock.position.set(THREE.MathUtils.clamp(player.position.x+(Math.random()<.5?-1:1)*15,-45,45),.05,player.position.z-24);dreamClock.visible=true;document.body.classList.add('dreaming');specialEntrance('dream',1900);terrorFlash();playGhostSignature('sadako');say('ghost.freddyDream',3200);}
function startEdwardEncounter(){const index=edwardIndex++,scale=encounterScale('edward',index);edwardRipper.scale.setScalar(scale);edwardDirection=Math.random()<.5?-1:1;edwardRipper.position.set(edwardDirection*54,.05,player.position.z-17-Math.random()*9);edwardRipper.rotation.y=edwardDirection>0?Math.PI/2:-Math.PI/2;edwardRipper.visible=true;edwardRipper.userData.hitEncounter=false;edwardStage=1;edwardStageAt=elapsed;specialEntrance('mistblade',1700);sound(126,.55,'sawtooth',.07);say('ghost.edwardFog',2500);}
function finishEdward(){edwardRipper.visible=false;edwardStage=0;edwardRipper.userData.hitEncounter=false;}
function startJiangchenEncounter(){const index=jiangchenIndex++,scale=encounterScale('jiangchen',index);jiangchen.scale.setScalar(scale);jiangchen.position.set(player.position.x+(Math.random()<.5?-1:1)*16,.05,player.position.z+34);jiangchen.userData.stunnedUntil=0;addClassicGhostChaser(jiangchen,7.05+index*.25);jiangchenUntil=elapsed+16+(selectedCharacter==='leopard'?4:0);specialEntrance('corpse',2100);terrorFlash();horrorSound(3);say('ghost.jiangchenLands',3200);}
function updateDistributedEncounters(progress,dt,t,safeProtected){
  if(!safeProtected&&freddyIndex<freddyRatios.length&&progress>runLength*freddyRatios[freddyIndex]&&!freddy.visible)startFreddyEncounter();
  if(freddy.visible){dreamClock.userData.light.intensity=55+Math.sin(t*7)*25;dreamClock.rotation.y=t*.8;const clockDistance=Math.hypot(player.position.x-dreamClock.position.x,player.position.z-dreamClock.position.z);if(clockDistance<3.1){sound(880,.42,'triangle',.09);finishFreddy('ghost.freddyAwake');}else if(elapsed>=freddyUntil)finishFreddy('ghost.freddyFades');}
  if(!safeProtected&&edwardIndex<edwardRatios.length&&progress>runLength*edwardRatios[edwardIndex]&&edwardStage===0)startEdwardEncounter();
  let nearest=999;if(edwardStage===1){nearest=Math.hypot(player.position.x-edwardRipper.position.x,player.position.z-edwardRipper.position.z);edwardRipper.userData.arms.forEach((arm,i)=>arm.rotation.x=-.7+Math.sin(t*12+i)*.18);if(elapsed-edwardStageAt>1.3){edwardStage=2;edwardStageAt=elapsed;sound(310,.28,'sawtooth',.1);say('ghost.edwardCharges',1700);}}
  else if(edwardStage===2){edwardRipper.position.x-=edwardDirection*(24+edwardIndex*1.5)*dt;animateCow(edwardRipper,t,15);nearest=Math.hypot(player.position.x-edwardRipper.position.x,player.position.z-edwardRipper.position.z);if(!edwardRipper.userData.hitEncounter&&nearest<3.15*edwardRipper.scale.x){edwardRipper.userData.hitEncounter=true;damageHeart('event.heartLost',edwardRipper,'death.enemy',{enemyKey:'enemy.edward'});}if(!edwardRipper.userData.hitEncounter)for(const npc of animalActors){if(!npcCanBeAttacked(npc))continue;npc.getWorldPosition(collisionPoint);if(Math.hypot(collisionPoint.x-edwardRipper.position.x,collisionPoint.z-edwardRipper.position.z)<2.6*edwardRipper.scale.x){edwardRipper.userData.hitEncounter=true;bloodyAttack(npc,edwardRipper);break;}}if(Math.abs(edwardRipper.position.x)>58&&Math.sign(edwardRipper.position.x)===-edwardDirection)finishEdward();}
  if(!safeProtected&&jiangchenIndex<jiangchenRatios.length&&progress>runLength*jiangchenRatios[jiangchenIndex]&&!jiangchen.visible)startJiangchenEncounter();
  if(jiangchen.visible&&elapsed>=jiangchenUntil){removeClassicGhostChaser(jiangchen);jiangchenUntil=0;say('ghost.jiangchenLeaves',2200);}
  return nearest;
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
  const shove=cow.userData.shoveFinger;if(shove){const hand=shove.hands?.[shove.active]||shove,armIndex=shove.hands?shove.active:1,remaining=shove.until-elapsed;if(remaining>0){const age=.68-remaining,raiseRaw=age<.13?age/.13:age<.54?1:Math.max(0,1-(age-.54)/.14),raise=1-Math.pow(1-THREE.MathUtils.clamp(raiseRaw,0,1),3),extendRaw=age<.14?0:age<.3?(age-.14)/.16:age<.46?1:Math.max(0,1-(age-.46)/.2),extension=1-Math.pow(1-THREE.MathUtils.clamp(extendRaw,0,1),3);hand.rig.visible=true;hand.rig.position.copy(hand.basePosition);hand.rig.position.y+=raise*(shove.airTarget?.7:.36);hand.rig.position.z-=raise*(shove.airTarget?.08:.32);hand.setExtension?.(extension);hand.rig.rotation.x=shove.airTarget?.18+raise*.44:-.08-raise*.28;hand.rig.rotation.z=(armIndex?-.08:.08)+raise*(armIndex?-.18:.18);if(cow.userData.arms?.[armIndex])cow.userData.arms[armIndex].rotation.x=THREE.MathUtils.lerp(cow.userData.arms[armIndex].rotation.x,shove.airTarget?-.82:-1.45,raise*.78);}else{shove.hands?.forEach(item=>{item.rig.visible=false;item.rig.position.copy(item.basePosition);item.setExtension?.(0);});hand.rig.visible=false;shove.airTarget=false;}}
}
function placeChaser(enemy,xOffset,zOffset,speed){if(activeChasers.includes(enemy))return;enemy.position.set(player.position.x+xOffset,.05,player.position.z+zOffset);enemy.visible=true;enemy.userData.spawned=true;enemy.userData.chaseSpeed=speed;activeChasers.push(enemy);}
const chapterRoleOrders=[
  ['alien','hollow','crawler','beast','knot'],
  ['beast','hollow','alien','crawler','knot'],
  ['knot','crawler','alien','hollow','beast'],
  ['crawler','alien','knot','beast','hollow']
];
function spawnStalkerWave(chapter,count){
  const order=chapterRoleOrders[Math.min(chapterRoleOrders.length-1,Math.max(0,chapter-1))],available=stalkers.filter(enemy=>!enemy.userData.spawned),chosen=[];
  for(let i=0;i<count&&available.length;i++){const wanted=order[i%order.length],index=available.findIndex(enemy=>enemy.userData.type===wanted),enemy=available.splice(index<0?0:index,1)[0];chosen.push(enemy);}
  chosen.forEach((enemy,i)=>{const side=i%2?-1:1,rank=Math.floor(i/2),base=enemy.userData.speed||6.3;placeChaser(enemy,side*(13+rank*5),44+rank*5,base+chapter*.32);});
  if(chosen.length){sound(48+chapter*12,.7,'sawtooth',.06);glitch();}
}
function warnNextWave(stage){if(waveWarningStage>=stage)return;waveWarningStage=stage;strangeBirds.forEach(bird=>bird.userData.panicUntil=elapsed+2.8);sound(118-stage*9,.42,'sawtooth',.035);say('event.enemyNear',1400);}
function updateStoryWave(progress){
  const mode=difficulties[selectedCharacter];
  if(progress>runLength*.18)warnNextWave(1);if(progress>runLength*.38)warnNextWave(2);if(progress>runLength*.58)warnNextWave(3);if(progress>runLength*.78)warnNextWave(4);
  if(storyStage===0&&(progress>18||elapsed>2.5)){
    storyStage=1;const pack=[[-12,36],[-7,31],[-2,39],[3,33],[8,40],[13,35]];wolfPack.slice(0,mode.pack).forEach((e,i)=>placeChaser(e,pack[i][0],pack[i][1],6.85+(i%3)*.16));say('event.pack',2200,{count:mode.pack});glitch();
  }
  if(storyStage===1&&progress>runLength*.205){
    storyStage=2;spawnStalkerWave(1,mode.chapterWaves[0]);say('event.more',2600);
  }
  if(storyStage===2&&progress>runLength*.405){
    storyStage=3;spawnStalkerWave(2,mode.chapterWaves[1]);
  }
  if(storyStage===3&&progress>runLength*.605){
    storyStage=4;spawnStalkerWave(3,mode.chapterWaves[2]);placeChaser(monsterCar,0,64,10.2);hunterGlow.visible=true;say('event.car',3200);sound(31,1.6,'sawtooth',.14);glitch();
  }
  if(storyStage===4&&progress>runLength*.805){
    storyStage=5;const remaining=Math.max(0,mode.stalkers-stalkers.filter(enemy=>enemy.userData.spawned).length);spawnStalkerWave(4,remaining);say('event.more',2600);
  }
}
function patrolSanctuary(actor,sanctuary,dt,t,radius=25){
  if(!sanctuary)return;const key=sanctuary.id;if(actor.userData.patrolSanctuary!==key){actor.userData.patrolSanctuary=key;actor.userData.patrolAngle=Math.atan2(actor.position.z-sanctuary.position.z,actor.position.x-sanctuary.position.x);actor.userData.patrolDirection=actor.id%2?1:-1;}actor.userData.patrolAngle+=(actor.userData.patrolDirection||1)*dt*(actor.userData.type==='car'?.42:.24);const angle=actor.userData.patrolAngle;let targetX=sanctuary.position.x+Math.cos(angle)*radius,targetZ=sanctuary.position.z+Math.sin(angle)*(radius*.9);if(Math.abs(targetX-sanctuary.position.x)<11&&Math.abs(targetZ-sanctuary.position.z)>13)targetX=sanctuary.position.x+(actor.id%2?1:-1)*(11+(actor.id%3)*1.4);const dx=targetX-actor.position.x,dz=targetZ-actor.position.z,d=Math.hypot(dx,dz),speed=actor.userData.type==='car'?7.8:actor.userData.type==='snowGhost'?4.2:3.4+(actor.id%3)*.35;if(d>.05){actor.position.x+=dx/d*speed*dt;actor.position.z+=dz/d*speed*dt;actor.rotation.y=Math.atan2(-dx,-dz);}const gateX=actor.position.x-sanctuary.position.x,gateZ=actor.position.z-sanctuary.position.z;if(Math.abs(gateX)<10&&Math.abs(gateZ)>12){actor.position.x=sanctuary.position.x+(actor.id%2?1:-1)*(10.5+(actor.id%3));}if(actor.userData.type==='car')actor.userData.wheels?.forEach(w=>w.rotation.x+=dt*7);else if(actor.userData.segments)actor.userData.segments.forEach((segment,i)=>{segment.position.x=Math.sin(t*7+i*.72+actor.userData.phase)*1.4;});else if(actor.userData.specialGhost)animateClassicGhost(actor,t);else if(actor.userData.type!=='snowGhost'){animateCow(actor,t,7);animateDistortion(actor,t);}}
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
  beacon.visible=!performanceMode||Math.abs(player.position.z-exitZ)<150;
  artFruits.forEach((fruit,i)=>{if(performanceMode&&Math.abs((fruit.parent?.position.z||0)-player.position.z)>150)return;fruit.position.y=fruit.userData.baseY+Math.sin(t*1.35+fruit.userData.phase)*.08;fruit.rotation.y=t*.25+i;});paintedMoons.forEach(moon=>{moon.lookAt(camera.position);moon.material.opacity=.68+Math.sin(t*.45+moon.userData.phase)*.1;});
  hostileMarks.forEach(marker=>{const pulse=Math.max(0,Math.sin(t*(marker.userData.type==='hollow'?2.1:3.4)+marker.userData.phase)),breath=1+pulse*.08,[sx,sy]=marker.userData.baseScale,distance=Math.hypot(marker.parent.position.x-player.position.x,marker.parent.position.z-player.position.z),near=THREE.MathUtils.clamp(1-distance/62,0,1);marker.position.y=Math.sin(t*2.3+marker.userData.phase)*.11;marker.userData.sprite.scale.set(sx*breath,sy*breath,1);marker.userData.materials.forEach(material=>material.opacity=.34+near*.28+pulse*.13);});
  strangeBirds.forEach((b,i)=>{
    const panic=elapsed<(b.userData.panicUntil||0),flight=panic?4.2:1;b.position.z-=b.userData.speed*flight*dt;b.position.x+=Math.sin(t*(panic?2.8:.7)+b.userData.phase)*dt*(panic?6:1.7);b.position.y+=(panic?5:Math.sin(t*1.1+b.userData.phase)*.18)*dt;if(b.userData.shoveVelocity){b.position.addScaledVector(b.userData.shoveVelocity,dt);b.userData.shoveVelocity.multiplyScalar(Math.pow(.045,dt));if(b.userData.shoveVelocity.lengthSq()<.08)b.userData.shoveVelocity=null;}
    if(b.position.z<player.position.z-68){b.position.z=player.position.z+42+Math.random()*38;b.position.x=player.position.x+(Math.random()-.5)*62;b.position.y=9+Math.random()*15;}
    const flap=.5+Math.abs(Math.sin(t*(7+i%4)+b.userData.phase))*1.05;b.userData.wings[0].rotation.z=flap;b.userData.wings[1].rotation.z=-flap;
    if(state==='playing'&&elapsed>=b.userData.nextDrop&&Math.abs(b.position.z-player.position.z)<62){spawnBirdDropping(b);b.userData.nextDrop=elapsed+14+Math.random()*30;}
  });
  for(let i=birdDroppings.length-1;i>=0;i--){const drop=birdDroppings[i];drop.age+=dt;if(!drop.landed){drop.velocity.y-=18*dt;drop.mesh.position.addScaledVector(drop.velocity,dt);drop.mesh.rotation.x+=dt*7;drop.mesh.rotation.z+=dt*5;if(drop.mesh.position.y<3.4){const pd=Math.hypot(player.position.x-drop.mesh.position.x,player.position.z-drop.mesh.position.z);if(state==='playing'&&pd<2.15)impactBirdDropping(drop,'player',player);if(!drop.landed)for(const npc of animalActors){if(npc.userData.super||!npcCanBeAttacked(npc))continue;npc.getWorldPosition(collisionPoint);if(Math.hypot(collisionPoint.x-drop.mesh.position.x,collisionPoint.z-drop.mesh.position.z)<1.9){impactBirdDropping(drop,'npc',npc);break;}}if(!drop.landed)for(const enemy of [...activeChasers,...snakes,snowGhost]){if(!enemy.visible||elapsed<(enemy.userData.stunnedUntil||0))continue;if(Math.hypot(enemy.position.x-drop.mesh.position.x,enemy.position.z-drop.mesh.position.z)<2.6*(enemy.userData.sizeMultiplier||1)){impactBirdDropping(drop,'enemy',enemy);break;}}}if(!drop.landed&&drop.mesh.position.y<=.08)impactBirdDropping(drop,'ground',null);}else{drop.mesh.material.opacity=Math.max(0,1-(drop.age-2.5)/2.5);}if(drop.age>5){scene.remove(drop.mesh);drop.mesh.material.dispose();birdDroppings.splice(i,1);}}
  bloodEffects.forEach(f=>{f.age+=dt;f.drops.forEach(d=>{if(d.position.y>.06||d.userData.velocity.y>0){d.position.addScaledVector(d.userData.velocity,dt);d.userData.velocity.y-=12*dt;if(d.position.y<.05){d.position.y=.05;d.userData.velocity.set(0,0,0);}}});});
  for(let i=pickupEffects.length-1;i>=0;i--){const effect=pickupEffects[i];effect.age+=dt;const fade=Math.max(0,1-effect.age/1.8);effect.particles.forEach(particle=>{particle.position.addScaledVector(particle.userData.velocity,dt);particle.userData.velocity.y-=10*dt;particle.rotation.x+=particle.userData.spin*dt;particle.rotation.z+=particle.userData.spin*dt*.7;particle.material.opacity=fade;});effect.ring.scale.setScalar(1+effect.age*5.6);effect.ring.material.opacity=fade*.9;effect.light.intensity=95*fade;if(effect.age>1.85){scene.remove(effect.group);pickupEffects.splice(i,1);}}
  knockedObstacles.forEach(obstacle=>{const velocity=obstacle.userData.knockVelocity;if(!velocity)return;obstacle.position.addScaledVector(velocity,dt);velocity.y-=18*dt;obstacle.rotation.x+=dt*4.2;obstacle.rotation.z+=dt*3.1;if(obstacle.position.y<-8){obstacle.visible=false;obstacle.userData.knockVelocity=null;}});
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
    const difficulty=difficulties[selectedCharacter],speed=gameCore.movement_speed(sprint?1:0,exhausted?1:0)*difficulty.player*(elapsed<speedBoostUntil?1.38:1);
    stamina=gameCore.update_stamina(stamina,dt*(sprint?difficulty.drain:difficulty.recovery),moving?1:0,wantsSprint?1:0,exhausted?1:0,sprint?1:0);
    if(sprint){
      if(stamina<=0){exhausted=true;document.body.classList.add('exhausted');say('event.tired',2300);sound(43,.75,'sawtooth',.11);}
    }else{
      if(exhausted&&stamina>=32){exhausted=false;document.body.classList.remove('exhausted');say('event.recovered',1200);sound(132,.24,'triangle',.045);}
    }
    if(moving){const len=Math.hypot(x,z);x/=len;z/=len;player.position.x+=x*speed*dt;player.position.z+=z*speed*dt;player.rotation.y=Math.atan2(-x,-z);}
    player.position.x=THREE.MathUtils.clamp(player.position.x,-59,59);player.position.z=Math.min(24,player.position.z);
    // 树、石头、铁网与路障都使用实体圆形碰撞体，不能再直接穿模。
    let collided=false;for(const o of obstacles){if(!o.visible||o.userData.collisionDisabled)continue;const radius=(o.userData.collisionRadius||2.1)+1.05;if(Math.abs(player.position.z-o.position.z)>radius+1.2)continue;if(pushPlayerFromPoint(o.position.x,o.position.z,radius))collided=true;}
    if(collided&&elapsed-lastCollisionSound>.45){lastCollisionSound=elapsed;sound(72,.12,'square',.035);shake=Math.max(shake,.12);}
    animatePlayer(player,t,Boolean(moving),Boolean(sprint));
    const progress=-player.position.z;updateStoryWave(progress);
    updateChapter(progress);updateEnemyScale(dt);let safeProtected=updateSafeZone(progress,dt,t,Boolean(moving));
    const objective=updateObjectives(progress,dt,t,Boolean(moving),safeProtected);safeProtected=objective.protectedZone;updateObjectiveArrow(progress,t);
    if(progress>runLength*.145)storyHerd.forEach((cow,i)=>{if(cow.userData.escaped||cow.userData.eaten)return;cow.visible=true;cow.userData.active=true;talkToPassingNpc(cow,i);if(holdNpcInSafeZone(cow,t,dt))return;cow.position.z-=dt*(4.7+(i%3)*.16);cow.position.x+=(cow.userData.escapeX||0)*dt+Math.sin(t*1.7+i)*dt*.34;animateCow(cow,t,9+i%3);if(cow.position.z<exitZ-20){cow.userData.escaped=true;cow.visible=false;}});
    const snowStart=runLength*.4,snowEnd=runLength*.6,snowChapter=progress>snowStart&&progress<snowEnd,snowActive=snowChapter&&weatherActive,rainActive=weatherActive&&!snowChapter;
    snowBlend=THREE.MathUtils.lerp(snowBlend,snowActive?1:0,1-Math.pow(.0005,dt));snow.visible=snowBlend>.015;document.body.classList.toggle('snow-haunting',snowBlend>.28);document.body.classList.toggle('rain-active',rainActive);
    let baseBg=selectedCharacter==='orange'?0xa49368:selectedCharacter==='yellow'?0x837e61:0x5f6255,groundBase=0x59683d;if(currentChapter===1){baseBg=0x42666a;groundBase=0x304a3d;}else if(currentChapter===2){baseBg=0x7b7180;groundBase=0x4a5548;}else if(currentChapter===3){baseBg=0x583b31;groundBase=0x3b302a;}else if(currentChapter===4){baseBg=0x39211f;groundBase=0x281b1a;}scene.background.set(baseBg).lerp(snowBgColor,snowBlend*.86);scene.fog.color.set(baseBg).lerp(snowFogColor,snowBlend*.8);scene.fog.density=difficulty.fog*(1.08+snowBlend*1.45+(currentChapter===1?.42:currentChapter>=3?.3:0));ground.material.color.set(groundBase).lerp(snowGroundColor,snowBlend*.82);rainMat.opacity=rainActive?(currentChapter===2?.12:.5)*(1-snowBlend*.78):0;
    if(snowStage===0&&snowChapter){snowStage=1;snowGhost.position.set(player.position.x+(Math.random()<.5?-1:1)*9,.1,player.position.z+35);snowGhost.visible=true;terrorFlash();say('event.snowStart',3600);}
    if(snowStage===1&&progress>snowStart+(snowEnd-snowStart)*.48){snowStage=2;snowGhost.position.set(player.position.x+(Math.random()<.5?-1:1)*5,.1,player.position.z+19);terrorFlash();say('event.snowNear',3000);}
    if(snowStage<3&&progress>=snowEnd){snowStage=3;snowGhost.visible=false;terrorFlash();say('event.snowEnd',3200);}
    updateClassicGhostSetpieces(progress,dt,t,safeProtected);
    herdCows.forEach((cow,i)=>{
      const enemy=ambushers[i];if(cow.userData.eaten){if(enemy.userData.feeding>0){enemy.userData.feeding-=dt;enemy.userData.headBob=(enemy.userData.headBob||0)+dt;enemy.position.y=.05+Math.abs(Math.sin(t*12))*.18;}else if(!enemy.userData.joined){enemy.userData.joined=true;enemy.position.y=.05;enemy.userData.chaseSpeed=7.15+(i%3)*.14;activeChasers.push(enemy);}return;}
      if(!cow.visible)return;talkToPassingNpc(cow,i+6);if(!cow.userData.active&&Math.abs(player.position.z-cow.position.z)<58){cow.userData.active=true;enemy.visible=!enemy.userData.disabled;if(!cow.userData.announced){cow.userData.announced=true;if(cow.userData.super){const witness=herdCows.find(other=>other!==cow&&other.visible&&!other.userData.eaten)||storyHerd.find(other=>other.visible&&!other.userData.eaten);say('event.superCowAhead',2200);showWorldSpeech(witness,'event.superCowAhead',2500);cow.userData.superBoastAt=elapsed+.85;}else say(herdFleeLines[i%herdFleeLines.length],2300);}}
      if(!cow.userData.active)return;
      if(cow.userData.super&&!cow.userData.superBoasted&&cow.userData.superBoastAt&&elapsed>=cow.userData.superBoastAt){cow.userData.superBoasted=true;showWorldSpeech(cow,'event.superCowBoast',3400,true);sound(164,.42,'square',.075);}
      if(holdNpcInSafeZone(cow,t,dt)){enemy.visible=false;return;}if(!enemy.userData.disabled&&!enemy.visible)enemy.visible=true;
      const cowSpeed=cow.userData.super?11.2:5.35+(i%3)*.32;cow.position.z-=cowSpeed*dt;cow.position.x+=Math.sin(t*1.4+i)*dt*(cow.userData.super?.85:.45);cow.userData.legs.forEach((l,n)=>l.rotation.x=Math.sin(t*(cow.userData.super?17:12)+n*Math.PI)*.58);if(cow.userData.superCape){cow.userData.superCape.rotation.x=Math.sin(t*13)*.14;cow.userData.superCape.position.y=cow.userData.superCape.userData.baseY+Math.sin(t*10)*.08;}
      if(cow.userData.super&&cow.position.z<exitZ+5){cow.userData.escaped=true;cow.visible=false;enemy.userData.joined=true;enemy.userData.chaseSpeed=7.15;activeChasers.push(enemy);say('event.superCow',3000);sound(260,.55,'triangle',.09);return;}
      if(enemy.userData.disabled)return;
      if(enemy.userData.feeding>0){enemy.userData.feeding-=dt;enemy.position.y=.05+Math.abs(Math.sin(t*13))*.2;enemy.userData.arms?.forEach((arm,n)=>arm.rotation.x=Math.sin(t*15+n*Math.PI)*.72);return;}
      if(elapsed<(enemy.userData.stunnedUntil||0)){enemy.position.y=.05;enemy.rotation.z=Math.sin(t*18)*.16;return;}enemy.rotation.z=0;
      const prey=chooseClosestPrey(enemy,cow),chase=new THREE.Vector3().subVectors(prey.targetPosition,enemy.position),d=prey.distance;if(updateEnemyPounce(enemy,dt))return;if(prey.target.userData?.super&&d<4.8){const away=new THREE.Vector3().subVectors(enemy.position,prey.targetPosition).setY(0).normalize();enemy.position.addScaledVector(away,4.8);enemy.userData.stunnedUntil=elapsed+1.35;enemy.userData.pounce=null;shake=Math.max(shake,.42);sound(58,.32,'square',.07);return;}if(d<7.2&&!prey.target.userData?.super&&beginEnemyPounce(enemy,prey.target,prey.targetNpc))return;enemy.position.addScaledVector(chase.normalize(),(prey.target.userData?.super?7.1:7.05+i*.08)*dt);enemy.rotation.y=Math.atan2(-chase.x,-chase.z);animateCow(enemy,t,11);
      if(prey.targetNpc&&d<2.05)bloodyAttack(prey.target,enemy);else if(!prey.targetNpc&&d<3.15)damageHeart('event.heartLost',enemy,'death.enemy',{enemyKey:enemy.userData.enemyKey||'enemy.them'});
    });
    strangeTravellers.forEach((c,i)=>{if(c.userData.eaten)return;talkToRoadNpc(c,i);if(!c.userData.fleeing&&Math.abs(player.position.z-c.position.z)<72)c.userData.fleeing=true;if(c.userData.fleeing){if(holdNpcInSafeZone(c,t,dt))return;c.position.z-=(5.6+i*.4)*dt;c.position.x+=(c.userData.escapeX||0)*dt+Math.sin(t*1.2+i)*dt*.35;animateCow(c,t,9+i);}});
    let nearest=updateDistributedEncounters(progress,dt,t,safeProtected);
    if(snowGhost.visible){const sanctuary=activeSafeZone>=0?safeZones[activeSafeZone]:(sheltered?shelterHuts.find(hut=>Math.hypot(player.position.x-hut.position.x,player.position.z-hut.position.z)<8):null);if(elapsed<(snowGhost.userData.stunnedUntil||0)){snowGhost.rotation.z=Math.sin(t*18)*.24;nearest=Math.min(nearest,Math.hypot(player.position.x-snowGhost.position.x,player.position.z-snowGhost.position.z));}else if(safeProtected&&sanctuary)patrolSanctuary(snowGhost,sanctuary,dt,t,activeSafeZone>=0?26:9);else{snowGhost.userData.patrolSanctuary=-1;const ghostV=new THREE.Vector3().subVectors(player.position,snowGhost.position);ghostV.y=0;const ghostD=ghostV.length();nearest=Math.min(nearest,ghostD);snowGhost.position.addScaledVector(ghostV.normalize(),(8.4+elapsed*.018)*difficulty.enemy*dt);snowGhost.rotation.y=Math.atan2(-ghostV.x,-ghostV.z);if(ghostD<2.75)damageHeart('event.heartLost',snowGhost,'death.snow');}snowGhost.position.y=.18+Math.sin(t*2.4)*.28;if(elapsed>=(snowGhost.userData.stunnedUntil||0))snowGhost.rotation.z=Math.sin(t*3.1)*.035;}
    for(const enemy of activeChasers){
      if(!enemy.visible)continue;
      if(safeProtected){const sanctuary=activeSafeZone>=0?safeZones[activeSafeZone]:(sheltered?shelterHuts.find(hut=>Math.hypot(player.position.x-hut.position.x,player.position.z-hut.position.z)<8):null);if(sanctuary){patrolSanctuary(enemy,sanctuary,dt,t,activeSafeZone>=0?25:8.5);nearest=Math.min(nearest,Math.hypot(player.position.x-enemy.position.x,player.position.z-enemy.position.z));}continue;}enemy.userData.patrolSanctuary=-1;
      if(elapsed<(enemy.userData.stunnedUntil||0)){enemy.userData.pounce=null;enemy.position.y=enemy.userData.type==='car'?0:.05;enemy.rotation.x=0;enemy.rotation.z=Math.sin(t*19+enemy.id)*.15;continue;}enemy.rotation.z=0;
      if(enemy.userData.feeding>0){enemy.userData.feeding-=dt;enemy.position.y=.05+Math.abs(Math.sin(t*13))*.2;enemy.userData.arms?.forEach((arm,i)=>arm.rotation.x=Math.sin(t*15+i*Math.PI)*.72);continue;}enemy.position.y=enemy.userData.type==='car'?0:.05;enemy.userData.victim=null;
      // 每一帧重新比较猎物：任何更近的路人或牛群经过，敌人都会立即转身换目标。
      const prey=chooseClosestPrey(enemy,player),target=prey.target,targetNpc=prey.targetNpc,targetPosition=prey.targetPosition,v=new THREE.Vector3().subVectors(targetPosition,enemy.position);v.y=0;const d=prey.distance;nearest=Math.min(nearest,Math.hypot(player.position.x-enemy.position.x,player.position.z-enemy.position.z));
      // 不同怪物承担不同职责：外星牛预判路线，空面者被注视时近乎静止，爬行物横向扑袭，肉结眼兽脉冲加速。
      if(!targetNpc&&enemy.userData.type==='alien'&&moving){v.x+=x*7;v.z+=z*7;}
      let roleSpeed=1;if(!targetNpc&&enemy.userData.type==='hollow'&&moving&&d>0){const watched=(x*(enemy.position.x-player.position.x)+z*(enemy.position.z-player.position.z))/d>.7;roleSpeed=watched?.09:1.16;}else if(enemy.userData.type==='knot')roleSpeed=1+Math.max(0,Math.sin(t*5+enemy.id))*.34;
      if(enemy.userData.type!=='car'&&updateEnemyPounce(enemy,dt))continue;
      if(target.userData?.super&&d<5.2){const away=new THREE.Vector3().subVectors(enemy.position,targetPosition).setY(0).normalize();enemy.position.addScaledVector(away,5.2);enemy.userData.stunnedUntil=elapsed+1.45;enemy.userData.pounce=null;shake=Math.max(shake,.45);sound(54,.3,'square',.07);continue;}
      if(enemy.userData.type!=='car'&&d<7.8*(enemy.userData.sizeMultiplier||1)&&beginEnemyPounce(enemy,target,Boolean(targetNpc)))continue;
      const timeBoost=gameCore.enemy_time_boost(elapsed,enemy.userData.type==='car'?1:0);
      enemy.position.addScaledVector(v.normalize(),(enemy.userData.chaseSpeed+timeBoost)*difficulty.enemy*roleSpeed*dt);
      if(enemy.userData.type!=='car')enemy.position.x+=Math.sin(t*(enemy.userData.type==='crawler'?3.8:1.8)+activeChasers.indexOf(enemy)*1.7)*dt*(enemy.userData.type==='crawler'?1.45:.65);
      enemy.rotation.y=Math.atan2(-v.x,-v.z);
      if(enemy.userData.type==='car')enemy.userData.wheels.forEach(w=>w.rotation.x+=dt*9);else if(enemy.userData.specialGhost)animateClassicGhost(enemy,t);else{animateCow(enemy,t,enemy.userData.type==='beast'?13:9);animateDistortion(enemy,t);}
      const enemySize=enemy.userData.sizeMultiplier||1;
      if(elapsed>=(enemy.userData.attackReadyAt||0)&&targetNpc&&d<(enemy.userData.type==='car'?5.4:2.65*enemySize)){bloodyAttack(target,enemy);continue;}
      if(elapsed>=(enemy.userData.attackReadyAt||0)&&!targetNpc&&d<(enemy.userData.type==='car'?6.2:3.3*enemySize)){shake=1;document.body.classList.add('hit');setTimeout(()=>document.body.classList.remove('hit'),400);damageHeart('event.heartLost',enemy,'death.enemy',{enemyKey:enemy.userData.enemyKey||'enemy.them',enemyParams:enemy.userData.enemyParams});}
    }
    if(monsterCar.visible)hunterGlow.position.set(monsterCar.position.x,4,monsterCar.position.z-3);
    industrialLights.forEach((lamp,i)=>{lamp.visible=!performanceMode||Math.abs(lamp.position.z-player.position.z)<110;lamp.intensity=(document.body.classList.contains('otherworld')?42:12)*(Math.sin(t*(3.5+i*.17)+i*2)>0.45?1:0);});
    const nextSpeedLevel=Math.floor(elapsed/12);if(nextSpeedLevel>speedLevel){speedLevel=nextSpeedLevel;say('difficulty.speedUp',1800,{level:speedLevel+1});sound(96+speedLevel*18,.32,'square',.055);}
    for(const snake of snakes){
      if(elapsed<(snake.userData.stunnedUntil||0)){snake.rotation.z=Math.sin(t*20+snake.id)*.2;nearest=Math.min(nearest,Math.hypot(player.position.x-snake.position.x,player.position.z-snake.position.z));continue;}snake.rotation.z=0;
      const sanctuary=activeSafeZone>=0?safeZones[activeSafeZone]:null,sanctuaryDistance=sanctuary?Math.hypot(snake.position.x-sanctuary.position.x,snake.position.z-sanctuary.position.z):999;if(safeProtected&&sanctuary&&sanctuaryDistance<90){patrolSanctuary(snake,sanctuary,dt,t,24);resolveAnimalWorldCollision(snake,.72);continue;}snake.userData.patrolSanctuary=-1;
      const playerDistance=Math.hypot(player.position.x-snake.position.x,player.position.z-snake.position.z),chasing=!safeProtected&&playerDistance<44,target=chasing?player.position:new THREE.Vector3(snake.userData.home.x+Math.sin(t*.42+snake.userData.phase)*snake.userData.patrolRadius,0,snake.userData.home.z+Math.cos(t*.35+snake.userData.phase)*7),v=new THREE.Vector3().subVectors(target,snake.position);v.y=0;
      if(v.lengthSq()>.05){v.normalize();steerNpcAroundObstacles(snake,dt);snake.position.addScaledVector(v,snake.userData.speed*(chasing?1.8:1)*difficulty.enemy*dt);snake.rotation.y=Math.atan2(-v.x,-v.z);}
      const slitherSpeed=chasing?10:6.5;snake.userData.segments.forEach((segment,i)=>{segment.position.x=Math.sin(t*slitherSpeed+i*.72+snake.userData.phase)*1.4;segment.rotation.y=Math.sin(t*slitherSpeed+i*.72)*.18;});resolveAnimalWorldCollision(snake,.72);
      const d=Math.hypot(player.position.x-snake.position.x,player.position.z-snake.position.z);nearest=Math.min(nearest,d);if(!safeProtected&&d<4.2){stamina=Math.max(0,stamina-25*difficulty.hazard*dt);player.position.x+=(player.position.x-snake.position.x)*dt*2.5;shake=.28;damageHeart('event.snakeHit',snake,'death.snake');}
    }
    if(!safeProtected)for(const tree of treeEnemies){if(tree.userData.collisionDisabled)continue;tree.userData.arms.forEach((a,i)=>a.rotation.z+=(i?1:-1)*dt*.45);const d=Math.hypot(player.position.x-tree.position.x,player.position.z-tree.position.z);nearest=Math.min(nearest,d);if(d<5.2){stamina=Math.max(0,stamina-18*difficulty.hazard*dt);shake=.2;damageHeart('event.treeHit',tree,'death.tree');}}
    // 所有地面动物都有实体体积：会挡住玩家，也会被树、石块和废墟推开，避免穿模直线跑过障碍。
    animalActors.forEach(animal=>{const beingShoved=updateFriendlyNpcShove(animal,dt),safeParent=safeZones.find(zone=>animal.parent===zone),movingNpc=animal.userData.active||animal.userData.fleeing||(finalWaveStarted&&finalHerd.includes(animal))||Boolean(safeParent?.userData.broken);if(movingNpc&&!beingShoved)steerNpcAroundObstacles(animal,dt);resolveAnimalWorldCollision(animal,animal.userData.isNpc?1.05:1.25);if(animal.userData.super&&movingNpc)shoulderAsideNpcs(animal);});
    activeChasers.forEach(animal=>{if(!animalActors.includes(animal))resolveAnimalWorldCollision(animal,animal.userData.type==='car'?3.5:1.35*(animal.userData.sizeMultiplier||1));});
    resolvePlayerAnimalCollision();resolveWatcherCollision();resolvePlayerDynamicSolids();
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
  updateWorldSpeech();
  renderer.render(scene,camera);
  if(mobileDevice&&state==='playing'){
    qualityFrameTime+=dt*1000;qualityFrames++;
    const now=performance.now();if(now-qualitySampleStart>1800&&qualityFrames>20){const averageFrame=qualityFrameTime/qualityFrames,next=averageFrame>22.5?Math.max(minRenderDpr,renderDpr-.14):averageFrame<16.5?Math.min(maxRenderDpr,renderDpr+.07):renderDpr;if(Math.abs(next-renderDpr)>.01){renderDpr=next;renderer.setPixelRatio(renderDpr);renderer.setSize(Math.round(window.visualViewport?.width||innerWidth),Math.round(window.visualViewport?.height||innerHeight),false);}qualitySampleStart=now;qualityFrameTime=0;qualityFrames=0;}
  }
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
  collisionProbe(){const animal=storyHerd[0],obstacle=obstacles.find(o=>o.position.z<0);animal.visible=true;animal.userData.active=true;animal.userData.eaten=false;animal.userData.escaped=false;animal.position.set(obstacle.position.x,.05,obstacle.position.z);return true;},
  collisionDistance(){const animal=storyHerd[0],obstacle=obstacles.find(o=>o.position.z<0),v=new THREE.Vector3();animal.getWorldPosition(v);return Math.hypot(v.x-obstacle.position.x,v.z-obstacle.position.z);},
  avoidanceProbe(){const animal=storyHerd[1],obstacle=obstacles.find(o=>o.position.z<-30);animal.visible=true;animal.userData.active=true;animal.userData.eaten=false;animal.userData.escaped=false;animal.position.set(obstacle.position.x,.05,obstacle.position.z+7);return true;},
  avoidanceOffset(){const animal=storyHerd[1],obstacle=obstacles.find(o=>o.position.z<-30),v=new THREE.Vector3();animal.getWorldPosition(v);return Math.abs(v.x-obstacle.position.x);},
  superCrashProbe(){const obstacle=obstacles.find(o=>o.position.z<-60&&!o.userData.collisionDisabled);superCow.position.set(obstacle.position.x,.05,obstacle.position.z);superCow.visible=true;superCow.userData.active=true;superCow.userData.eaten=false;superCow.userData.escaped=false;superCow.userData.testObstacle=obstacle;return true;},
  superObstacleWasHit(){return Boolean(superCow.userData.testObstacle?.userData.collisionDisabled);},
  snakeProbe(){const snake=snakes[0];snake.position.set(player.position.x+10,0,player.position.z-18);snake.visible=true;return true;},
  snakePosition(){const snake=snakes[0];return{x:snake.position.x,z:snake.position.z};},
  ageSafeZone(index,seconds){const zone=safeZones[index];zone.userData.entered=true;zone.userData.timer=seconds;return true;},
  safeFire(index){const fire=safeZones[index].userData.campfire;return{life:fire.life,intensity:fire.light.intensity,flameOpacity:fire.flames[0].material.opacity};},
  refugeProbe(index=0){const animal=storyHerd[0],zone=safeZones[index];animal.visible=true;animal.userData.active=true;animal.userData.eaten=false;animal.userData.escaped=false;animal.position.set(zone.position.x+2,.05,zone.position.z+2);holdNpcInSafeZone(animal,clock.elapsedTime,.016);return true;},
  advanceRefuge(steps=120){for(let i=0;i<steps;i++)holdNpcInSafeZone(storyHerd[0],clock.elapsedTime+i*.016,.016);return true;},
  refugeState(){const animal=storyHerd[0];return{zone:animal.userData.refugeZone,x:animal.position.x,z:animal.position.z,parked:Boolean(animal.userData.refugeParked),offset:animal.userData.refugeOffset};},
  passingNpcProbe(index=0){const npc=storyHerd[index%storyHerd.length];npc.visible=true;npc.userData.active=true;npc.userData.eaten=false;npc.userData.escaped=false;npc.userData.passingTalked=false;lastPassingNpcTalk=-99;npc.position.set(player.position.x+2,.05,player.position.z);talkToPassingNpc(npc,index);return true;},
  passingNpcState(index=0){const npc=storyHerd[index%storyHerd.length];return{talked:Boolean(npc.userData.passingTalked),sayKey:activeSayKey};},
  playerState(){return{x:player.position.x,z:player.position.z,state};},
  performanceState(){return{tier:qualityTier,model:deviceProfile.model,mode:performanceMode,dpr:renderDpr,dprMin:minRenderDpr,dprMax:maxRenderDpr,grass:grassCount,rain:rainCount,snow:snowCount,birds:strangeBirds.length,shadows:renderer.shadowMap.enabled};},
  classifyDevice(metrics){return classifyDeviceProfile(metrics);},
  shoveNpcProbe(index=0){const npc=storyHerd[index%storyHerd.length];npc.visible=true;npc.userData.eaten=false;npc.userData.escaped=false;npc.position.set(player.position.x+2,.05,player.position.z);npc.userData.shoveStart=npc.position.clone();shoveFriendlyNpc(npc,5,1);return true;},
  shoveNpcState(index=0){const npc=storyHerd[index%storyHerd.length];return{distance:npc.userData.shoveStart?npc.position.distanceTo(npc.userData.shoveStart):0,sayKey:activeSayKey};},
  shoveButtonProbe(){animalActors.forEach(npc=>npc.visible=false);player.position.set(0,.05,0);player.rotation.y=0;const npc=storyHerd[0];npc.visible=true;npc.userData.eaten=false;npc.userData.escaped=false;npc.position.set(0,.05,-4);npc.userData.shoveStart=npc.position.clone();hunter.visible=true;hunter.position.set(0,.05,-2);hunter.userData.chaseSpeed=0;hunter.userData.nextPounce=elapsed+99;hunter.userData.shoveStart=hunter.position.clone();activeChasers=[];const obstacle=obstacles[0];obstacle.userData.shoveStart=obstacle.position.clone();lastNpcShove=-9;return true;},
  shoveButtonState(){const npc=storyHerd[0],obstacle=obstacles[0],finger=player.userData.shoveFinger;return{friendDistance:npc.userData.shoveStart?npc.position.distanceTo(npc.userData.shoveStart):0,enemyDistance:hunter.userData.shoveStart?hunter.position.distanceTo(hunter.userData.shoveStart):0,obstacleDistance:obstacle.userData.shoveStart?obstacle.position.distanceTo(obstacle.userData.shoveStart):0,fingerAnimated:Boolean(finger?.rig.visible),fingerLength:1+(finger?.finger.userData.extension||0)};},
  advanceShove(steps=1,dt=.08){for(let i=0;i<steps;i++)updateFriendlyNpcShove(storyHerd[0],dt);return true;},
  controlsState(){return{running:Boolean(keys.ShiftLeft),runPressed:runVisual.classList.contains('pressed'),shovePressed:shoveVisual.classList.contains('pressed'),joystickHeld:joystickPointer!==null||joystickTouch!==null};},
  safeResidentSpread(index=0){const xs=safeZones[index].userData.residents.map(npc=>npc.position.x);return Math.max(...xs)-Math.min(...xs);},
  roadNpcProbe(index=0){const npc=strangeTravellers[index];npc.position.set(player.position.x+.1,.05,player.position.z);npc.userData.talked=false;return talkToRoadNpc(npc,index);},
  roadNpcState(index=0){const npc=strangeTravellers[index];return{distance:Math.hypot(player.position.x-npc.position.x,player.position.z-npc.position.z),talked:npc.userData.talked,sayKey:activeSayKey};},
  objectiveArrowProbe(){clothCount=0;player.position.set(0,.05,18-runLength*.3);clothPieces.forEach((item,i)=>{item.visible=i===0;});clothPieces[0].position.set(player.position.x+18,.05,player.position.z-32);const now=clock.elapsedTime;updateObjectiveArrow(runLength*.3,now);const before=objectiveTrailArrows[0].position.clone();updateObjectiveArrow(runLength*.3,now+.45);return{shown:objectiveTrail.visible,grounded:objectiveTrailArrows.filter(arrow=>arrow.visible).every(arrow=>Math.abs(arrow.position.y-.09)<.001),moving:before.distanceTo(objectiveTrailArrows[0].position)>1,screenArrow:objectiveArrow.classList.contains('show')};},
  specialEntranceProbe(type='well'){specialEntrance(type,5000);return document.body.classList.contains(`entrance-${type}`);},
  wellHauntingProbe(active=true){document.body.classList.remove(...specialEntranceClasses);document.body.classList.toggle('well-haunting',active);return document.body.classList.contains('well-haunting');},
  herdPresentationProbe(){storyHerd.forEach((cow,i)=>animateCow(cow,1+i*.07,10));return{handstands:storyHerd.filter(cow=>cow.userData.handstand&&Math.abs(cow.rotation.z)>3).length,yaws:[...new Set(storyHerd.map(cow=>Number(cow.rotation.y.toFixed(2))))]};},
  shoveFingerTopology(){return player.userData.shoveFinger.hands.map(hand=>hand.segments.length);},
  routePickupState(){return{clothBeforeGate:clothPieces.every(item=>item.position.z>forestGate.position.z),switchesBeforeGate:powerSwitches.every(item=>item.position.z>powerGate.position.z),speedPickups:itemPickups.filter(item=>item.userData.type==='speed').length,easy:{...difficulties.orange}};},
  watcherProbe(){const watcher=watchers[0];watcher.position.set(player.position.x+.1,0,player.position.z);watcher.visible=true;watcher.userData.spoken=false;return true;},
  watcherState(){const watcher=watchers[0];return{distance:Math.hypot(player.position.x-watcher.position.x,player.position.z-watcher.position.z),spoken:watcher.userData.spoken,sayKey:activeSayKey};},
  solidProbe(kind){if(kind==='fence'){const zone=safeZones[0];player.position.set(zone.position.x+20,.05,zone.position.z+5);return true;}if(kind==='taskGate'){forestGate.userData.open=false;forestGate.position.y=0;player.position.set(forestGate.position.x,.05,forestGate.position.z+.1);return true;}if(kind==='falseGate'){falseGate.visible=true;player.position.set(falseGate.position.x+8.1,.05,falseGate.position.z);return true;}if(kind==='exitGate'){player.position.set(gate.position.x+12.1,.05,gate.position.z);return true;}let object;if(kind==='enemy'){object=hunter;hunter.visible=true;hunter.userData.chaseSpeed=0;activeChasers=[hunter];}else if(kind==='ambusher'){object=ambushers[0];object.visible=true;object.userData.disabled=false;object.userData.chaseSpeed=0;}else if(kind==='snake'){object=snakes[0];object.visible=true;}else if(kind==='hut')object=shelterHuts[0];else if(kind==='switch')object=powerSwitches[0];if(!object)return false;player.position.set(object.position.x+.1,.05,object.position.z);object.userData.testStart=object.position.clone();return true;},
  solidDistance(kind){if(kind==='fence')return Math.abs(player.position.x-safeZones[0].position.x);if(kind==='taskGate')return Math.abs(player.position.z-forestGate.position.z);if(kind==='falseGate')return Math.hypot(player.position.x-(falseGate.position.x+8),player.position.z-falseGate.position.z);if(kind==='exitGate')return Math.hypot(player.position.x-(gate.position.x+12),player.position.z-gate.position.z);const object=kind==='enemy'?hunter:kind==='ambusher'?ambushers[0]:kind==='snake'?snakes[0]:kind==='hut'?shelterHuts[0]:powerSwitches[0];return Math.hypot(player.position.x-object.position.x,player.position.z-object.position.z);},
  safePatrolProbe(index=0){const zone=safeZones[index];player.position.set(zone.position.x,.05,zone.position.z);zone.userData.entered=true;zone.userData.timer=2;zone.userData.broken=false;hunter.position.set(zone.position.x+28,.05,zone.position.z);hunter.visible=true;hunter.userData.chaseSpeed=7;hunter.userData.testStart=hunter.position.clone();activeChasers=[hunter];return true;},
  safePatrolDistance(){return hunter.userData.testStart?hunter.position.distanceTo(hunter.userData.testStart):0;},
  npcAttackProbe(){const npc=storyHerd[0];player.position.set(24,.05,18);npc.position.set(0,.05,8);npc.visible=true;npc.userData.eaten=false;npc.userData.escaped=false;hunter.position.set(0,.05,11);hunter.visible=true;hunter.userData.chaseSpeed=7.4;hunter.userData.feeding=0;activeChasers=[hunter];return true;},
  npcWasEaten(){return Boolean(storyHerd[0].userData.eaten);},
  pounceProbe(){player.position.set(0,.05,0);hunter.position.set(0,.05,6.5);hunter.visible=true;hunter.userData.chaseSpeed=7.4;hunter.userData.nextPounce=0;hunter.userData.stunnedUntil=0;activeChasers=[hunter];return true;},
  pounceState(){return{active:Boolean(hunter.userData.pounce),height:hunter.position.y,distance:Math.hypot(player.position.x-hunter.position.x,player.position.z-hunter.position.z)};},
  targetSwitchProbe(){player.position.set(0,.05,18);hunter.position.set(0,.05,4);hunter.visible=true;hunter.userData.chaseSpeed=0;hunter.userData.nextPounce=elapsed+99;activeChasers=[hunter];const npc=storyHerd[0];npc.position.set(0,.05,7);npc.visible=true;npc.userData.active=false;npc.userData.eaten=false;npc.userData.escaped=false;return true;},
  targetSwitchState(){return{type:hunter.userData.preyType,isPassingNpc:hunter.userData.prey===storyHerd[0],enemyScale:hunter.scale.x,hasMarker:Boolean(hostileMarks[0]?.visible)};},
  birdDropProbe(kind='player'){let target=player;if(kind==='npc'){target=storyHerd[0];target.visible=true;target.userData.eaten=false;target.userData.escaped=false;target.position.set(player.position.x+8,.05,player.position.z);}else if(kind==='enemy'){target=hunter;target.visible=true;target.position.set(player.position.x+8,.05,player.position.z);hunter.userData.stunnedUntil=0;hunter.userData.nextPounce=elapsed+99;hunter.userData.chaseSpeed=0;activeChasers=[hunter];}const v=target.getWorldPosition(new THREE.Vector3()),mat=new THREE.MeshStandardMaterial({color:0x4a3b1d,transparent:true}),drop=mesh(new THREE.DodecahedronGeometry(.32,0),mat,scene,v.x,2.4,v.z,[.8,1.45,.8]);drop.userData.target=target;drop.userData.targetType=kind;birdDroppings.push({mesh:drop,velocity:new THREE.Vector3(0,-1,0),age:0,landed:false});return true;},
  birdDropState(){return{hearts,npcDead:Boolean(storyHerd[0].userData.eaten),enemyStunned:(hunter.userData.stunnedUntil||0)>elapsed,drops:birdDroppings.length,sayKey:activeSayKey};},
  snapshot(){return{state,progress:-player.position.z,chapter:currentChapter,safe:activeSafeZone,clothCount,switchCount,sheltered,fakeExitTriggered,finalWaveStarted,rescuedCows,rainOpacity:rainMat.opacity,snowOpacity:snow.material.opacity,mission:activeMissionKey,joystick:{x:joystick.x,y:joystick.y},pickupEffects:pickupEffects.length,enemyScale:scalableEnemies[0].userData.sizeMultiplier,enemyGiantRank:scalableEnemies[0].userData.giantRank,storyStage,activeTypes:activeChasers.map(enemy=>enemy.userData.type||'unknown'),spawnedStalkers:stalkers.filter(enemy=>enemy.userData.spawned).length,errors:[]};}
};

addEventListener('niulai:languagechange',()=>{refreshLanguageMenu();renderScores();drawExitSign();if(activeSayKey){if(activeSayKey==='difficulty.start')activeSayParams={difficulty:tr(difficulties[selectedCharacter].nameKey)};ui.subtitle.textContent=tr(activeSayKey,activeSayParams);}setMission(activeMissionKey,activeMissionParams);if(currentChapter>=0){chapterNumber.textContent=tr(chapters[currentChapter].number);chapterTitle.textContent=tr(chapters[currentChapter].title);chapterDescription.textContent=tr(chapters[currentChapter].description);}if(resultSnapshot)renderResult();installText.textContent=tr(installHintKey);ui.distance.textContent=Math.floor(distance)+tr('world.m');});

SplashScreen.hide({fadeOutDuration:500}).catch(()=>{});
