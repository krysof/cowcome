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
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .1, 500);
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
function tuft(parent,mat,x,y,z,s=.18,rot=0){return mesh(new THREE.ConeGeometry(s,s*2.4,4),mat,parent,x,y,z,[1,1,1],[0,0,rot]);}
function makeNiuLai(scale=1, dark=false){
  const g=new THREE.Group();
  const fur=flat(dark?0x342019:0xe97837), muzzle=flat(dark?0x84624e:0xf2d3a0);
  const hoof=flat(dark?0x0e0b09:0x3a241b), eye=flat(0xf3ead8), pupil=flat(dark?0xff3b21:0x231711), inner=flat(0xeaa181);
  // 电影中的牛来是橙色、直立、大头宽嘴的拟人小牛。
  mesh(new THREE.SphereGeometry(1.05,7,5),fur,g,0,2.45,0,[1.04,1.22,.74]);
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
  g.scale.setScalar(scale); g.userData.legs=legs; g.userData.arms=arms; return g;
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
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;g.userData.enemyName=`外星牛${variant+1}号`;return g;
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
  g.scale.setScalar(scale);g.userData.legs=legs;g.userData.arms=arms;g.userData.enemyName='黑面兽';return g;
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

function createCharacter(kind){return kind==='yellow'?makeYellowBull(.68):kind==='leopard'?makeLeopard(.78):makeNiuLai(.72,false);}
let selectedCharacter='orange';
let player=createCharacter(selectedCharacter); player.position.set(0,.05,18); player.rotation.y=0; scene.add(player);
const hunter=makeAlienCow(1.38,0); hunter.position.set(0,.05,51); hunter.rotation.y=Math.PI; scene.add(hunter);
const hunterGlow=new THREE.PointLight(0xff2b16,22,24); hunterGlow.position.set(0,5,46); scene.add(hunterGlow);
const enemyConfigs=[[-24,-85,'alien'],[27,-165,'beast'],[-29,-255,'beast'],[25,-340,'alien'],[-24,-450,'beast'],[22,-545,'alien']];
const stalkers=enemyConfigs.map(([x,z,type],i)=>{const e=type==='alien'?makeAlienCow(.9,i%2):makeDarkBeast(.72);e.position.set(x,.05,z);e.userData.home=new THREE.Vector3(x,.05,z);e.userData.speed=type==='alien'?5.2:6.1;e.userData.type=type;scene.add(e);return e;});
const snakes=[[-11,-120],[17,-305],[-14,-505]].map(([x,z])=>{const s=makeSnake(.82);s.position.set(x,0,z);s.rotation.y=Math.PI/2;scene.add(s);return s;});
const treeEnemies=[[-18,-210],[16,-405]].map(([x,z])=>{const t=makeTreeEnemy(1.25);t.position.set(x,0,z);scene.add(t);return t;});
const allEnemies=[hunter,...stalkers,...snakes,...treeEnemies];allEnemies.forEach(e=>e.visible=false);hunterGlow.visible=false;

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

const keys={}, joystick={x:0,y:0}, clock=new THREE.Clock();
let state='intro', stamina=100, distance=638, hunterSpeed=7.5, elapsed=0, lastLine=-1, shake=0, audio, musicMaster, musicNodes=[], musicTimer;
const lines=[
  [25,'妈妈说：别回头。'],[80,'云雀：前面没有路。'],[145,'妈妈说：牛来，你跑反了。'],
  [230,'这里以前不是这样的。'],[330,'不要相信黄色的门。'],[440,'妈妈说：回家吧。'],[540,'出口正在看着你。']
];

function say(text,time=2600){ui.subtitle.textContent=text;ui.subtitle.classList.add('show');clearTimeout(say.t);say.t=setTimeout(()=>ui.subtitle.classList.remove('show'),time);}
function sound(freq=80,dur=.16,type='sawtooth',vol=.05){
  if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
  const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(22,freq*.4),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur);
}
function stopMusic(){
  if(!musicMaster||!audio)return;clearInterval(musicTimer);musicMaster.gain.cancelScheduledValues(audio.currentTime);musicMaster.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.8);
  const nodes=[...musicNodes];setTimeout(()=>nodes.forEach(n=>{try{n.stop()}catch{}}),900);musicNodes=[];musicMaster=null;
}
function startMusic(){
  if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume();stopMusic();
  musicMaster=audio.createGain();musicMaster.gain.setValueAtTime(.0001,audio.currentTime);musicMaster.gain.exponentialRampToValueAtTime(.055,audio.currentTime+1.8);musicMaster.connect(audio.destination);
  const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=360;filter.Q.value=7;filter.connect(musicMaster);
  [41.2,43.7,61.8].forEach((freq,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=i===2?'triangle':'sawtooth';o.frequency.value=freq;g.gain.value=i===2?.08:.13;o.connect(g).connect(filter);o.start();musicNodes.push(o);});
  const lfo=audio.createOscillator(),lfoGain=audio.createGain();lfo.frequency.value=.11;lfoGain.gain.value=140;lfo.connect(lfoGain).connect(filter.frequency);lfo.start();musicNodes.push(lfo);
  musicTimer=setInterval(()=>{if(state!=='playing'||!musicMaster)return;const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=[164,185,207,233][Math.floor(Math.random()*4)];g.gain.setValueAtTime(.0001,audio.currentTime);g.gain.exponentialRampToValueAtTime(.035,audio.currentTime+.08);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+1.8);o.connect(g).connect(musicMaster);o.start();o.stop(audio.currentTime+2);},2400);
}
function start(){
  state='playing'; elapsed=0; stamina=100; hunterSpeed=7.5; lastLine=-1;
  player.position.set(0,.05,18);player.rotation.set(0,0,0);hunter.position.set(0,.05,51);stalkers.forEach(e=>e.position.copy(e.userData.home));allEnemies.forEach(e=>e.visible=true);hunterGlow.visible=true;document.body.classList.add('playing');ui.intro.classList.add('hidden');ui.result.classList.remove('show');
  sound(55,.8,'sawtooth',.08);startMusic();setTimeout(()=>say('跑，牛来。'),500);
}
function end(win){
  state=win?'win':'caught';document.body.classList.remove('playing');ui.result.classList.add('show');
  ui.eyebrow.textContent=win?'你找到了出口':'逃亡终止';ui.title.textContent=win?'门后还是草原。':'牛来，回家。';
  ui.resultText.innerHTML=win?`你跑了 ${Math.floor(elapsed)} 秒。<br>远处，又传来了妈妈的声音。`:`你离出口还剩 ${Math.max(0,Math.floor(distance))} 米。<br>这一次，妈妈追上你了。`;
  stopMusic();sound(win?220:38,1.5,'sawtooth',.1);
}
document.querySelector('#startBtn').onclick=start;document.querySelector('#restartBtn').onclick=start;
document.querySelector('#changeBtn').onclick=()=>{
  stopMusic();state='intro';document.body.classList.remove('playing');ui.result.classList.remove('show');ui.intro.classList.remove('hidden');
  player.position.set(0,.05,18);player.rotation.y=0;hunter.position.set(0,.05,51);stalkers.forEach(e=>e.position.copy(e.userData.home));allEnemies.forEach(e=>e.visible=false);hunterGlow.visible=false;
};
document.querySelectorAll('.character').forEach(button=>button.addEventListener('click',()=>{
  if(state!=='intro')return;
  selectedCharacter=button.dataset.character;document.querySelectorAll('.character').forEach(b=>b.classList.toggle('active',b===button));
  const old=player;player=createCharacter(selectedCharacter);player.position.copy(old.position);player.rotation.y=0;scene.remove(old);scene.add(player);sound(120,.12,'square',.025);
}));
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Enter'&&state==='intro')start();if(e.code==='KeyR'&&state!=='playing')start();});
addEventListener('keyup',e=>keys[e.code]=false);
document.querySelectorAll('.mobile-controls button').forEach(b=>{
  const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));
});
const joystickEl=document.querySelector('#joystick'),joystickKnob=document.querySelector('#joystickKnob');
function moveJoystick(e){
  const r=joystickEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,limit=r.width*.31;
  let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy);if(len>limit){dx*=limit/len;dy*=limit/len;}
  joystick.x=dx/limit;joystick.y=dy/limit;joystickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}
joystickEl.addEventListener('pointerdown',e=>{e.preventDefault();joystickEl.setPointerCapture(e.pointerId);moveJoystick(e);});
joystickEl.addEventListener('pointermove',e=>{if(joystickEl.hasPointerCapture(e.pointerId))moveJoystick(e);});
function resetJoystick(){joystick.x=joystick.y=0;joystickKnob.style.transform='translate(0,0)';}
joystickEl.addEventListener('pointerup',resetJoystick);joystickEl.addEventListener('pointercancel',resetJoystick);

function glitch(){document.body.classList.add('glitch');sound(48,.1,'square',.03);setTimeout(()=>document.body.classList.remove('glitch'),80+Math.random()*160);}
function animateCow(cow,t,speed){
  cow.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.55);
  cow.userData.arms.forEach((a,i)=>a.rotation.x=Math.sin(t*speed+(i%2)*Math.PI)*.42);
  cow.rotation.z=Math.sin(t*speed*.5)*.025;
}
function tick(){
  requestAnimationFrame(tick);const dt=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;
  if(state==='playing'){
    elapsed+=dt;
    // 键盘按直觉映射：A/← 向左，D/→ 向右；触屏摇杆保持屏幕坐标映射。
    let x=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)-joystick.x;
    let z=(keys.KeyS||keys.ArrowUp?1:0)-(keys.KeyW||keys.ArrowDown?1:0)-joystick.y;
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
    let nearest=gap;
    for(const enemy of stalkers){
      const v=new THREE.Vector3().subVectors(player.position,enemy.position);v.y=0;const d=v.length();nearest=Math.min(nearest,d);
      if(d<62){enemy.position.addScaledVector(v.normalize(),enemy.userData.speed*dt);enemy.rotation.y=Math.atan2(-v.x,-v.z);animateCow(enemy,t,enemy.userData.type==='beast'?13:8);}
      if(d<3.3){shake=1;document.body.classList.add('hit');setTimeout(()=>document.body.classList.remove('hit'),400);end(false);}
    }
    for(const snake of snakes){snake.userData.segments.forEach((s,i)=>s.position.x=Math.sin(t*2+i*.72)*1.4);const d=Math.hypot(player.position.x-snake.position.x,player.position.z-snake.position.z);nearest=Math.min(nearest,d);if(d<4.2){stamina=Math.max(0,stamina-55*dt);player.position.x+=(player.position.x-snake.position.x)*dt*2.5;shake=.28;if(stamina<=0)end(false);}}
    for(const tree of treeEnemies){tree.userData.arms.forEach((a,i)=>a.rotation.z+=(i?1:-1)*dt*.45);const d=Math.hypot(player.position.x-tree.position.x,player.position.z-tree.position.z);nearest=Math.min(nearest,d);if(d<5.2){stamina=Math.max(0,stamina-38*dt);shake=.2;if(stamina<=0)end(false);}}
    if(nearest<18&&!ui.warning.classList.contains('show')){ui.warning.classList.add('show');sound(62,.7,'sawtooth',.08);setTimeout(()=>ui.warning.classList.remove('show'),1200);}
    if(gap<4.2){shake=1;document.body.classList.add('hit');setTimeout(()=>document.body.classList.remove('hit'),400);end(false);}
    if(player.position.z<-614)end(true);
    distance=Math.max(0,(player.position.z+620));ui.distance.textContent=Math.floor(distance)+'m';ui.stamina.style.width=stamina+'%';
    ui.mission.textContent=distance<90?'穿过黄色的门。':nearest<16?'敌人靠近。换个方向！':'穿过雾，别回头。';
    const progress=-player.position.z;lines.forEach((line,i)=>{if(progress>line[0]&&lastLine<i){lastLine=i;say(line[1]);if(i===2||i===5)glitch();}});
    if(Math.random()<dt*.018)glitch();
  } else animateCow(hunter,t,2.5);
  const narrow=innerWidth<700;
  // 镜头位于奔跑方向前方：角色朝屏幕下方跑，且始终能看到正脸和身后的敌人。
  const desired=state==='intro'
    ? new THREE.Vector3(player.position.x+2.3,narrow?10:8.5,player.position.z-(narrow?10:11))
    : new THREE.Vector3(player.position.x*(narrow?.86:.74)+(narrow?.8:2.2),narrow?24:19,player.position.z-(narrow?13:18));
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=.88;}
  if(state==='intro')camera.lookAt(player.position.x,2.5,player.position.z);
  else camera.lookAt(player.position.x,narrow?1.2:1.8,player.position.z+(narrow?5:8));
  renderer.render(scene,camera);
}
tick();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
