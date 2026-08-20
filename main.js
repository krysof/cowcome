import * as THREE from 'three';

const canvas = document.querySelector('#game');
const ui = {
  intro: document.querySelector('#intro'), result: document.querySelector('#result'),
  distance: document.querySelector('#distance'), stamina: document.querySelector('#staminaBar'),
  subtitle: document.querySelector('#subtitle'), warning: document.querySelector('#warning'),
  mission: document.querySelector('#missionText'), title: document.querySelector('#resultTitle'),
  resultText: document.querySelector('#resultText'), eyebrow: document.querySelector('#resultEyebrow')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c98a);
scene.fog = new THREE.FogExp2(0xa7b886, 0.018);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 500);
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140,740,12,60), flat(0x6e7e47));
ground.rotation.x=-Math.PI/2; ground.position.z=-300; ground.receiveShadow=true;
const pos=ground.geometry.attributes.position;
for(let i=0;i<pos.count;i++){ const x=pos.getX(i),y=pos.getY(i); pos.setZ(i,Math.sin(x*.23)*.5+Math.sin(y*.08)*.7+Math.random()*.25); }
ground.geometry.computeVertexNormals(); scene.add(ground);

function mesh(geo,mat,parent,x,y,z,scale=[1,1,1],rot=[0,0,0]){
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(...scale);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function makeCow(scale=1, dark=false){
  const g=new THREE.Group(), white=flat(dark?0x5a5147:0xe7dfbd), black=flat(dark?0x130d0b:0x29261f), pink=flat(0xc98170), horn=flat(0xe5ce91);
  mesh(new THREE.BoxGeometry(2.6,1.6,4),white,g,0,1.7,0,[scale,scale,scale]);
  const head=mesh(new THREE.BoxGeometry(2,1.8,1.8),white,g,0,2.05,-2.55,[scale,scale,scale],[dark?.12:0,0,0]);
  mesh(new THREE.BoxGeometry(1.65,.8,.65),pink,head,0,-.25,-1,[1,1,1]);
  for(const x of [-.62,.62]){mesh(new THREE.SphereGeometry(.18,5,4),black,head,x,.35,-.92);mesh(new THREE.ConeGeometry(.17,.8,5),horn,head,x,.85,-.15,[1,1,1],[0,0,x>0?-.35:.35]);}
  const legs=[]; for(const x of [-.85,.85])for(const z of [-1.25,1.25])legs.push(mesh(new THREE.BoxGeometry(.42,1.7,.45),black,g,x,.65,z,[scale,scale,scale]));
  mesh(new THREE.BoxGeometry(.9,.12,2),black,g,.75,1.85,.1,[scale,scale,scale],[0,.3,.25]);
  g.userData.legs=legs; return g;
}

const player=makeCow(.72,false); player.position.set(0,.2,18); scene.add(player);
const hunter=makeCow(2.15,true); hunter.position.set(0,.2,47); hunter.rotation.y=Math.PI; scene.add(hunter);
const hunterGlow=new THREE.PointLight(0xff2b16,22,24); hunterGlow.position.set(0,5,46); scene.add(hunterGlow);

const obstacles=[];
function addRock(x,z,s=1){const r=mesh(new THREE.DodecahedronGeometry(1.5,0),flat(Math.random()>.5?0x4a4b3b:0x675e49),scene,x,s*.8,z,[s,s,s]);obstacles.push(r);}
for(let z=4;z>-610;z-=12+Math.random()*10){
  const side=Math.random()>.5?1:-1; addRock(side*(8+Math.random()*41),z,.7+Math.random()*2.2);
  if(Math.random()>.62)addRock(-side*(12+Math.random()*35),z-3,.6+Math.random()*1.5);
}
// crooked black monoliths make landmarks and occlusion
for(let z=-65;z>-570;z-=85){
  const x=(Math.random()-.5)*55;
  const p=mesh(new THREE.BoxGeometry(4,16+Math.random()*14,3),flat(0x26251f),scene,x,6,z,[1,1,1],[0,0,(Math.random()-.5)*.25]); obstacles.push(p);
}

// destination arch
const gate=new THREE.Group();
mesh(new THREE.BoxGeometry(4,22,4),flat(0xd9ff43),gate,-10,11,0);
mesh(new THREE.BoxGeometry(4,22,4),flat(0xd9ff43),gate,10,11,0);
mesh(new THREE.BoxGeometry(24,4,4),flat(0xd9ff43),gate,0,21,0);
gate.position.z=-620; scene.add(gate);
const beacon=new THREE.PointLight(0xd9ff43,120,65);beacon.position.set(0,8,-620);scene.add(beacon);

// dead trees
for(let i=0;i<46;i++){
  const t=new THREE.Group(), h=4+Math.random()*8;
  mesh(new THREE.CylinderGeometry(.12+.06*Math.random(),.35,h,5),flat(0x2d2a22),t,0,h/2,0,[1,1,1],[0,0,(Math.random()-.5)*.3]);
  t.position.set((Math.random()>.5?1:-1)*(32+Math.random()*30),0,20-Math.random()*650);scene.add(t);
}

const keys={}, clock=new THREE.Clock();
let state='intro', stamina=100, distance=638, hunterSpeed=7.5, elapsed=0, lastLine=-1, shake=0, audio;
const lines=[
  [25,'妈妈说：别回头。'],[80,'云雀：前面没有路。'],[145,'妈妈说：牛来，你跑反了。'],
  [230,'这里以前不是这样的。'],[330,'不要相信黄色的门。'],[440,'妈妈说：回家吧。'],[540,'出口正在看着你。']
];

function say(text,time=2600){ui.subtitle.textContent=text;ui.subtitle.classList.add('show');clearTimeout(say.t);say.t=setTimeout(()=>ui.subtitle.classList.remove('show'),time);}
function sound(freq=80,dur=.16,type='sawtooth',vol=.05){
  if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
  const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(22,freq*.4),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur);
}
function start(){
  state='playing'; elapsed=0; stamina=100; hunterSpeed=7.5; lastLine=-1;
  player.position.set(0,.2,18);hunter.position.set(0,.2,47);document.body.classList.add('playing');ui.intro.classList.add('hidden');ui.result.classList.remove('show');
  sound(55,.8,'sawtooth',.08);setTimeout(()=>say('跑，牛来。'),500);
}
function end(win){
  state=win?'win':'caught';document.body.classList.remove('playing');ui.result.classList.add('show');
  ui.eyebrow.textContent=win?'你找到了出口':'逃亡终止';ui.title.textContent=win?'门后还是草原。':'牛来，回家。';
  ui.resultText.innerHTML=win?`你跑了 ${Math.floor(elapsed)} 秒。<br>远处，又传来了妈妈的声音。`:`你离出口还剩 ${Math.max(0,Math.floor(distance))} 米。<br>这一次，妈妈追上你了。`;
  sound(win?220:38,1.5,'sawtooth',.1);
}
document.querySelector('#startBtn').onclick=start;document.querySelector('#restartBtn').onclick=start;
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Enter'&&state==='intro')start();if(e.code==='KeyR'&&state!=='playing')start();});
addEventListener('keyup',e=>keys[e.code]=false);
document.querySelectorAll('.mobile-controls button').forEach(b=>{
  const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));
});

function glitch(){document.body.classList.add('glitch');sound(48,.1,'square',.03);setTimeout(()=>document.body.classList.remove('glitch'),80+Math.random()*160);}
function animateCow(cow,t,speed){const legs=cow.userData.legs;legs.forEach((l,i)=>l.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.48);cow.rotation.z=Math.sin(t*speed*.5)*.025;}
function tick(){
  requestAnimationFrame(tick);const dt=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;
  if(state==='playing'){
    elapsed+=dt;let x=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0), z=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);
    const moving=x||z, sprint=(keys.ShiftLeft||keys.ShiftRight)&&stamina>2&&moving;
    let speed=sprint?15:9;if(sprint)stamina-=24*dt;else stamina=Math.min(100,stamina+13*dt);
    if(moving){const len=Math.hypot(x,z);x/=len;z/=len;player.position.x+=x*speed*dt;player.position.z+=z*speed*dt;player.rotation.y=Math.atan2(-x,-z);}
    player.position.x=THREE.MathUtils.clamp(player.position.x,-59,59);player.position.z=Math.min(24,player.position.z);
    // collision response
    for(const o of obstacles){const dx=player.position.x-o.position.x,dz=player.position.z-o.position.z;if(dx*dx+dz*dz<8){player.position.x+=dx*dt*5;player.position.z+=dz*dt*5;}}
    animateCow(player,t,moving?(sprint?15:10):1);
    // hunter gains speed as the exit nears
    const toP=new THREE.Vector3().subVectors(player.position,hunter.position);toP.y=0;const gap=toP.length();
    hunterSpeed=7.3+elapsed*.018+(player.position.z<-350?1.4:0);hunter.position.addScaledVector(toP.normalize(),hunterSpeed*dt);hunter.rotation.y=Math.atan2(-toP.x,-toP.z);animateCow(hunter,t,10);
    hunterGlow.position.set(hunter.position.x,5,hunter.position.z);
    if(gap<18&&!ui.warning.classList.contains('show')){ui.warning.classList.add('show');sound(62,.7,'sawtooth',.08);setTimeout(()=>ui.warning.classList.remove('show'),1200);}
    if(gap<4.2){shake=1;document.body.classList.add('hit');setTimeout(()=>document.body.classList.remove('hit'),400);end(false);}
    if(player.position.z<-614)end(true);
    distance=Math.max(0,(player.position.z+620));ui.distance.textContent=Math.floor(distance)+'m';ui.stamina.style.width=stamina+'%';
    ui.mission.textContent=distance<90?'穿过黄色的门。':gap<16?'不要回头。它就在后面。':'穿过雾，别回头。';
    const progress=-player.position.z;lines.forEach((line,i)=>{if(progress>line[0]&&lastLine<i){lastLine=i;say(line[1]);if(i===2||i===5)glitch();}});
    if(Math.random()<dt*.018)glitch();
  } else animateCow(hunter,t,2.5);
  const desired=new THREE.Vector3(player.position.x*.82,7.5,player.position.z+14);
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=.88;}
  camera.lookAt(player.position.x,1.5,player.position.z-9);
  renderer.render(scene,camera);
}
tick();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
