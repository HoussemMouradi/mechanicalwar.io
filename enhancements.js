'use strict';

/* Mechanical War quality pass. This file intentionally extends the legacy single-file
   build so existing GitHub Pages links and room-code multiplayer remain compatible. */
const ENHANCEMENT_VERSION='mw-quality-v1';
const isCoarse=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
const lowPower=isCoarse||((navigator.hardwareConcurrency||8)<=4);

Object.assign(GUN,{
  pistol:{n:'Viper Pistol',d:25,mag:12,res:48,cd:.24,spread:.012,range:62,reload:1.25,recoil:.018,c:0x151b26,accent:0x38bdf8},
  smg:{n:'Vector SMG',d:14,mag:32,res:128,cd:.072,spread:.036,range:48,reload:1.65,recoil:.009,c:0x263341,accent:0x22d3ee},
  shotgun:{n:'Bulldog Shotgun',d:11,mag:7,res:35,cd:.78,spread:.12,range:27,reload:2.15,recoil:.055,pel:8,c:0x6b321d,accent:0xf59e0b},
  rifle:{n:'Sentinel Rifle',d:32,mag:20,res:80,cd:.17,spread:.009,range:96,reload:2.05,recoil:.024,c:0x202938,accent:0xa5b4fc},
  ak47:{n:'AK-47 Ravager',d:34,mag:30,res:90,cd:.112,spread:.025,range:82,reload:2.35,recoil:.032,c:0x342216,accent:0xc08445},
  m4:{n:'M4 Guardian',d:28,mag:30,res:120,cd:.09,spread:.013,range:90,reload:1.9,recoil:.018,c:0x24313c,accent:0x94a3b8},
  rpg:{n:'RPG-7 Titan',d:92,mag:1,res:3,cd:1.3,spread:.004,range:72,reload:2.8,recoil:.085,blast:5.5,c:0x263c30,accent:0x9ca3af},
  knife:{n:'Tactical Knife',d:65,mag:1,res:0,cd:.42,spread:0,range:2.35,reload:0,recoil:.025,melee:true,c:0x475569,accent:0xe2e8f0}
});

function enhanceMenu(){
  const sub=document.querySelector('#menu .sub');
  if(sub){sub.textContent='peer-to-peer tactical browser combat';sub.insertAdjacentHTML('afterend','<div class="feature-strip"><span>NO INSTALL</span><span>ROOM-CODE MULTIPLAYER</span><span>8 DISTINCT WEAPONS</span></div>')}
  const actions=$('host')?.parentElement;
  if(actions&&!$('enter')){const b=document.createElement('button');b.id='enter';b.className='main';b.textContent='Quick Play';actions.prepend(b);b.onclick=autoConnect}
  $('auto')?.remove();
  $('right')?.insertAdjacentHTML('beforeend','<div id="reloadState" class="lbl hide">Reloading<div class="reload-bar"><i></i></div></div>');
  document.body.insertAdjacentHTML('beforeend','<div id="loading" class="hide"><div class="loader"><div class="loader-ring"></div><h2>LINKING COMBAT NETWORK</h2><p id="loadingText" class="small">Negotiating a direct peer connection…</p></div></div><div id="dead" class="hide"><div class="card"><p class="sub danger">Combat unit disabled</p><h2>ELIMINATED</h2><p id="deadTxt" class="small"></p><button id="respawn" class="main">Redeploy</button><button id="deadQuit">Back to menu</button></div></div><div id="damageVignette"></div><div id="mobileControls"><div class="stick"><i class="stick-knob"></i></div><div class="look-zone"></div><button class="mobile-action use">USE</button><button class="mobile-action fire">FIRE</button><button class="mobile-action jump">JUMP</button><button class="mobile-action reload">R</button></div>');
  $('respawn').onclick=respawn;$('deadQuit').onclick=quit;
  for(const id of['host','join','enter'])$(id)?.addEventListener('click',()=>{if($('name').value.trim()&&myTeam){$('loading').classList.remove('hide');$('loadingText').textContent=id==='join'?'Contacting room host…':'Reserving secure room…'}});
}
enhanceMenu();

const legacyStat=stat;
stat=function(message){legacyStat(message);if(/HOSTING|Auto created host|Joined room|Connected|error|failed|no host|already|enter your|choose|rejected|left room/i.test(message))$('loading')?.classList.add('hide')};

const SPAWNS={
  1:[[-42,-24,-1.57],[-42,-8,-1.57],[-42,10,-1.57],[-40,25,-1.57],[-34,30,-1.57]],
  2:[[42,24,1.57],[42,8,1.57],[42,-10,1.57],[40,-25,1.57],[34,-30,1.57]]
};
spawn=function(team){const pool=SPAWNS[team]||SPAWNS[1];let best=pool[Math.random()*pool.length|0],score=-1;for(const s of pool){let nearestEnemy=999;for(const p of players.values())if(p.team&&p.team!==team&&p.hp>0)nearestEnemy=Math.min(nearestEnemy,Math.hypot(s[0]-p.x,s[1]-p.z));if(nearestEnemy>score){score=nearestEnemy;best=s}}return{x:best[0],y:1.7,z:best[1],yaw:best[2]}};

seedGuns=function(){if(guns.length)return;const spots=[[-40,-18,'m4'],[-40,18,'ak47'],[-27,-27,'smg'],[-27,27,'shotgun'],[-16,-9,'pistol'],[-16,10,'rifle'],[-6,-28,'knife'],[-5,27,'m4'],[0,0,'rpg'],[7,-15,'ak47'],[7,15,'shotgun'],[18,-28,'rifle'],[18,27,'smg'],[29,-9,'m4'],[29,10,'pistol'],[41,-20,'ak47'],[41,20,'knife']];guns=spots.map((a,i)=>({id:'g'+(i+1),type:a[2],x:a[0],y:.28,z:a[1],heldBy:null}))};

function cover(x,z,w,d,h=1.35,color=0x475569){box(x,h/2,z,w,h,d,mat(color,.7,.18))}
function crate(x,z,scale=1){const wood=mat(0x805331,.76,.04),edge=mat(0x29231d,.6,.2);cover(x,z,1.7*scale,1.7*scale,1.55*scale,0x805331);box(x,.2*scale,z,1.8*scale,.12,1.8*scale,edge,false);box(x,1.35*scale,z,1.8*scale,.12,1.8*scale,edge,false)}
function barrier(x,z,rot=0){const g=new THREE.Group(),base=mat(0x334155,.62,.22),trim=mat(0xf59e0b,.48,.15);for(const dz of[-1.45,0,1.45]){let b=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.25,.42),base);b.position.set(0,.63,dz);g.add(b);let t=new THREE.Mesh(new THREE.BoxGeometry(3.45,.12,.45),trim);t.position.set(0,1.18,dz);g.add(t)}g.position.set(x,0,z);g.rotation.y=rot;g.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true}});scene.add(g);const swap=Math.abs(Math.sin(rot))>.5;obs.push({x,y:.63,z,w:swap?6.3:3.4,h:1.25,d:swap?3.4:6.3})}
function tower(x,z,team){const c=team===1?0x075985:0x9a3412;cover(x,z,5,5,1.1,c);for(const dx of[-2.1,2.1])for(const dz of[-2.1,2.1])box(x+dx,2.1,z+dz,.25,3.2,.25,mat(0x1e293b,.55,.3));box(x,3.65,z,5.2,.22,5.2,mat(0x1e293b,.55,.3),false)}

office=function(){
  scene.background=new THREE.Color(0x7894a9);scene.fog=new THREE.Fog(0x7894a9,76,150);
  scene.add(new THREE.AmbientLight(0xffffff,.72));
  scene.add(new THREE.HemisphereLight(0xeaf7ff,0x697586,1.75));
  const sun=new THREE.DirectionalLight(0xfff1d6,2.35);sun.position.set(-18,34,24);sun.castShadow=!lowPower;sun.shadow.mapSize.set(lowPower?512:1536,lowPower?512:1536);sun.shadow.camera.left=-52;sun.shadow.camera.right=52;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;scene.add(sun);
  const ft=texture('#64717d','rgba(225,235,242,.30)',32);ft.repeat.set(18,13);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(96,70),mat(0x687581,.76,.04,{map:ft,bumpMap:ft,bumpScale:.018}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const wall=mat(0x8492a5,.65,.12),trim=mat(0x26374b,.5,.3);
  [[0,-35,96,1],[0,35,96,1],[-48,0,1,70],[48,0,1,70]].forEach(w=>{box(w[0],2.25,w[1],w[2],4.5,w[3],wall);box(w[0],.18,w[1],w[2]+.1,.2,w[3]+.1,trim,false)});
  tower(-40,0,1);tower(40,0,2);
  for(const z of[-26,-13,13,26]){cover(-24,z,6,2.1,1.4);cover(24,-z,6,2.1,1.4)}
  for(const x of[-31,-15,15,31])barrier(x,x<0?5:-5,x%2?0:Math.PI/2);
  [[-31,-30],[-31,30],[-18,0],[-9,-20],[-8,21],[8,-21],[9,20],[18,0],[31,-30],[31,30]].forEach((p,i)=>crate(p[0],p[1],i%3===0?1.15:1));
  cover(0,0,8,4,1.15,0x713f12);cover(0,-16,3,8,1.3,0x334155);cover(0,16,3,8,1.3,0x334155);
  for(const x of[-36,-12,12,36])for(const z of[-31,31]){box(x,4.3,z,5,.08,1.1,new THREE.MeshStandardMaterial({color:0xe9fbff,emissive:0xbdeeff,emissiveIntensity:1.8}),false);const l=new THREE.PointLight(x<0?0xb9e8ff:0xffddb0,1.55,28,1.7);l.position.set(x,3.8,z);scene.add(l)}
  sign('DJB BASE',-40,-31,1.55);sign('MID CORE',0,-31,1.55);sign('AUTO BASE',40,31,1.55);
};

function part(group,geo,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);group.add(m);return m}
gunMesh=function(type){
  const d=GUN[type],g=new THREE.Group(),body=mat(d.c,.3,.68),accent=mat(d.accent,.3,.48),wood=mat(0x86532e,.65,.08),steel=mat(0xd4dbe5,.22,.7);
  if(type==='knife'){part(g,new THREE.BoxGeometry(.92,.07,.15),steel,.1);const tip=part(g,new THREE.ConeGeometry(.11,.3,4),steel,.7);tip.rotation.z=-Math.PI/2;part(g,new THREE.BoxGeometry(.35,.18,.2),body,-.48)}
  else if(type==='rpg'){const tube=part(g,new THREE.CylinderGeometry(.13,.13,1.45,12),body);tube.rotation.z=Math.PI/2;const nose=part(g,new THREE.ConeGeometry(.19,.42,12),accent,.95);nose.rotation.z=-Math.PI/2;part(g,new THREE.BoxGeometry(.18,.48,.2),body,-.15,-.27)}
  else{const long=type!=='pistol',len=type==='shotgun'?1.2:long?1.02:.54;part(g,new THREE.BoxGeometry(len,.16,.22),body);const barrel=part(g,new THREE.CylinderGeometry(.035,.035,long?.9:.43,10),accent,len*.75);barrel.rotation.z=Math.PI/2;const grip=part(g,new THREE.BoxGeometry(.14,.35,.18),body,-len*.25,-.22);grip.rotation.z=-.28;if(long)part(g,new THREE.BoxGeometry(.38,.15,.2),type==='ak47'||type==='shotgun'?wood:body,-len*.62);if(type==='ak47'){const mag=part(g,new THREE.BoxGeometry(.22,.38,.16),wood,.02,-.22);mag.rotation.z=.2}if(type==='m4'||type==='rifle')part(g,new THREE.BoxGeometry(.28,.08,.16),accent,.08,.15);if(type==='shotgun')part(g,new THREE.BoxGeometry(.42,.1,.2),wood,.32,-.1)}
  g.traverse(o=>{if(o.isMesh){o.castShadow=!lowPower;o.receiveShadow=true}});return g;
};
fpGunMesh=function(type){const view=new THREE.Group(),model=gunMesh(type);model.rotation.y=Math.PI/2;model.scale.setScalar(type==='rpg'?.8:type==='knife'?.72:.9);model.userData.forwardAxis='-z';view.add(model);return view};

let handWeapon='',handRef=null,reloading=false,reloadToken=0,recoil=0,walkBob=0,lastShotAt=0,audioContext;
const legacyDrawHand=drawHand;
drawHand=function(force=false){if(!hand)return;if(!force&&handRef===hand&&handWeapon===me.gun)return;handRef=hand;handWeapon=me.gun;legacyDrawHand()};
drawGuns=function(){if(!scene)return;const ids=new Set(guns.map(g=>g.id));for(const[id,m]of gunMeshes)if(!ids.has(id)){scene.remove(m);gunMeshes.delete(id)}for(const g of guns){let m=gunMeshes.get(g.id);if(!m){m=gunMesh(g.type);scene.add(m);gunMeshes.set(g.id,m)}m.visible=!g.heldBy;m.position.set(g.x,g.y,g.z);m.rotation.y=(performance.now()*.00055+(Number(g.id.slice(1))||0))%(Math.PI*2)}drawHand()};

function tone(freq,duration=.05,volume=.035,type='square'){try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),gain=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.55),audioContext.currentTime+duration);gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);o.connect(gain).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration)}catch(e){}}
function gunSound(type){const f={pistol:190,smg:150,shotgun:95,rifle:135,ak47:115,m4:145,rpg:62,knife:420}[type]||150;tone(f,type==='rpg'?.22:type==='shotgun'?.12:.055,type==='rpg'?.1:.045,type==='knife'?'sine':'sawtooth')}
function muzzleFlash(type){if(!hand)return;const flash=new THREE.Mesh(new THREE.SphereGeometry(type==='rpg'?.14:.075,7,5),new THREE.MeshBasicMaterial({color:type==='rpg'?0xff6b18:0xffe066}));flash.position.set(.02,.02,-1.25);hand.add(flash);setTimeout(()=>hand?.remove(flash),45)}

reload=function(){if(!me.gun||GUN[me.gun].melee||reloading)return;const d=GUN[me.gun],need=d.mag-me.ammo,got=Math.min(need,me.res);if(!got)return tone(70,.08,.025);reloading=true;const token=++reloadToken,weapon=me.gun,el=$('reloadState');el?.classList.remove('hide');if(el)el.style.setProperty('--reload-time',d.reload+'s');tone(220,.05,.025,'sine');setTimeout(()=>{if(token!==reloadToken||weapon!==me.gun)return;me.ammo+=got;me.res-=got;reloading=false;el?.classList.add('hide');tone(520,.045,.025,'sine');ui()},d.reload*1000)};

function raySphere(origin,dir,center,radius){const to=center.clone().sub(origin),p=to.dot(dir),d2=to.lengthSq()-p*p;if(p<0||d2>radius*radius)return Infinity;return p-Math.sqrt(radius*radius-d2)}
function rayBox(origin,dir,b,max){let near=0,far=max;for(const axis of['x','y','z']){const half=(axis==='x'?b.w:axis==='y'?b.h:b.d)/2,min=b[axis]-half,maxA=b[axis]+half,v=dir[axis];if(Math.abs(v)<1e-6){if(origin[axis]<min||origin[axis]>maxA)return Infinity;continue}let a=(min-origin[axis])/v,c=(maxA-origin[axis])/v;if(a>c)[a,c]=[c,a];near=Math.max(near,a);far=Math.min(far,c);if(near>far)return Infinity}return near>=0?near:far}
function fireRay(origin,dir,weapon){const d=GUN[weapon];let wall=d.range;for(const b of obs)wall=Math.min(wall,rayBox(origin,dir,b,d.range));let best=null,dist=wall,mult=1;for(const[id,p]of players){if(id===myId||p.hp<=0||p.team===myTeam)continue;const body=new THREE.Vector3(p.x,1.05,p.z),head=new THREE.Vector3(p.x,1.75,p.z),hd=raySphere(origin,dir,head,.31),bd=raySphere(origin,dir,body,.72);if(hd<dist){best={id,p};dist=hd;mult=1.5}else if(bd<dist){best={id,p};dist=bd;mult=1}}return{best,dist,mult,point:origin.clone().add(dir.clone().multiplyScalar(dist))}}
shoot=function(){
  if(!me.gun||shootCd>0||me.hp<=0||reloading)return;const d=GUN[me.gun];if(!d.melee&&me.ammo<=0){reload();return}
  shootCd=d.cd;if(!d.melee)me.ammo--;lastShotAt=performance.now();recoil=Math.min(.16,recoil+d.recoil);pitch=Math.min(1.15,pitch+d.recoil*.55);gunSound(me.gun);muzzleFlash(me.gun);document.querySelector('.cross')?.classList.add('firing');setTimeout(()=>document.querySelector('.cross')?.classList.remove('firing'),70);
  const origin=camera.position.clone(),forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),hits=new Map(),pellets=d.pel||1;let blastPoint=null,networkDir=forward;
  for(let i=0;i<pellets;i++){const dir=forward.clone();dir.x+=(Math.random()-.5)*d.spread;dir.y+=(Math.random()-.5)*d.spread;dir.z+=(Math.random()-.5)*d.spread;dir.normalize();if(!i)networkDir=dir;const result=fireRay(origin,dir,me.gun);tracer(origin,dir,me.gun);if(d.blast){blastPoint=result.point;break}if(result.best)hits.set(result.best.id,(hits.get(result.best.id)||0)+Math.round(d.d*result.mult))}
  if(d.blast&&blastPoint)for(const[id,p]of players){if(id===myId||p.hp<=0||p.team===myTeam)continue;const distance=Math.hypot(p.x-blastPoint.x,1.1-blastPoint.y,p.z-blastPoint.z);if(distance<=d.blast)hits.set(id,Math.round(d.d*(1-distance/d.blast*.62)))}
  send({type:'shot',shooter:myId,weapon:me.gun,o:{x:origin.x,y:origin.y,z:origin.z},d:{x:networkDir.x,y:networkDir.y,z:networkDir.z}});for(const[id,amount]of hits){hit();tone(760,.045,.02,'sine');send({type:'hit',target:id,dmg:amount,weapon:me.gun,shooter:myId,name:myName})}ui();
};

tracer=function(o,d,w){o=new THREE.Vector3(o.x,o.y,o.z);d=new THREE.Vector3(d.x,d.y,d.z).normalize();const rocket=w==='rpg',knife=w==='knife',life=rocket?.48:knife?.1:.18,geo=rocket?new THREE.SphereGeometry(.17,10,7):new THREE.CylinderGeometry(.012,.012,knife?.8:2.5,5),material=new THREE.MeshBasicMaterial({color:rocket?0xff7a18:knife?0xe2e8f0:0xffdf65,transparent:true,opacity:.92}),m=new THREE.Mesh(geo,material);m.position.copy(o).addScaledVector(d,knife?.8:2);if(!rocket)m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d);scene.add(m);shots.push({m,d,life,max:life,boom:rocket})};

const legacyDamage=damage;
damage=function(amount,killer){legacyDamage(Math.max(0,Math.min(200,Number(amount)||0)),killer);const v=$('damageVignette');v?.classList.add('on');setTimeout(()=>v?.classList.remove('on'),90);tone(85,.09,.035,'sawtooth');if(me.hp<=0){state='dead';$('deadTxt').textContent='Eliminated by '+killer;$('dead').classList.remove('hide');$('loading')?.classList.add('hide');document.exitPointerLock?.()}};
function respawn(){if(!me.dead&&me.hp>0)return;reloadToken++;reloading=false;$('reloadState')?.classList.add('hide');const s=spawn(myTeam);if(me.gun)send({type:'drop',pid:myId,x:me.x,z:me.z});Object.assign(me,s,{hp:MAX,dead:false,gun:null,ammo:0,res:0,vy:0,onGround:true});yaw=s.yaw;pitch=-.08;state='play';$('dead').classList.add('hide');$('hud').classList.remove('hide');players.set(myId,pack());if(!isHost)send({type:'respawn',id:myId});else broadcast();ui();feed('Respawned at a protected team point')}
window.respawn=respawn;

let controlsBound=false,touchMove={x:0,z:0},touchAim=null;
listen=function(){
  if(controlsBound)return;controlsBound=true;onresize=()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,lowPower?1.25:1.75));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()};
  addEventListener('keydown',e=>{keys[K(e)]=1;keys[e.code]=1;const k=K(e);if(e.code==='Escape')state==='play'?pause():resume();if(e.code==='Space'||k===' ')jump();if(k==='e'){e.preventDefault();me.gun?send({type:'drop',pid:myId,x:me.x,z:me.z}):pickup()}if(k==='r')reload()});addEventListener('keyup',e=>{keys[K(e)]=0;keys[e.code]=0});addEventListener('mousemove',e=>{if(state==='play'&&document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.00235;pitch=Math.max(-1.15,Math.min(1.15,pitch-e.movementY*.0022))}});addEventListener('mousedown',e=>{if(e.button===0)mouse=true});addEventListener('mouseup',e=>{if(e.button===0)mouse=false});renderer.domElement.addEventListener('click',()=>state==='play'&&renderer.domElement.requestPointerLock?.());
  const mobile=$('mobileControls');if(!isCoarse||!mobile)return;mobile.classList.add('active');const stick=mobile.querySelector('.stick'),knob=mobile.querySelector('.stick-knob');let stickId=null,origin={x:0,y:0};stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;origin={x:e.clientX,y:e.clientY};knob.style.display='block';knob.style.left=origin.x+'px';knob.style.top=(origin.y-(innerHeight*.42))+'px';stick.setPointerCapture(e.pointerId)});stick.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;touchMove.x=Math.max(-1,Math.min(1,(e.clientX-origin.x)/52));touchMove.z=Math.max(-1,Math.min(1,(e.clientY-origin.y)/52));knob.style.transform=`translate(calc(-50% + ${touchMove.x*35}px),calc(-50% + ${touchMove.z*35}px))`});const stopStick=()=>{stickId=null;touchMove.x=touchMove.z=0;knob.style.display='none'};stick.addEventListener('pointerup',stopStick);stick.addEventListener('pointercancel',stopStick);
  const look=mobile.querySelector('.look-zone');look.addEventListener('pointerdown',e=>{touchAim={id:e.pointerId,x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId)});look.addEventListener('pointermove',e=>{if(!touchAim||e.pointerId!==touchAim.id)return;yaw-=(e.clientX-touchAim.x)*.005;pitch=Math.max(-1.15,Math.min(1.15,pitch-(e.clientY-touchAim.y)*.004));touchAim.x=e.clientX;touchAim.y=e.clientY});look.addEventListener('pointerup',()=>touchAim=null);
  const hold=(selector,on,off)=>{const el=mobile.querySelector(selector);el.addEventListener('pointerdown',e=>{e.preventDefault();on()});el.addEventListener('pointerup',e=>{e.preventDefault();off?.()});el.addEventListener('pointercancel',()=>off?.())};hold('.fire',()=>mouse=true,()=>mouse=false);hold('.jump',jump);hold('.reload',reload);hold('.use',()=>me.gun?send({type:'drop',pid:myId,x:me.x,z:me.z}):pickup());
};

move=function(dt){
  if(me.hp<=0)return;const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));let mx=touchMove.x*r.x-touchMove.z*f.x,mz=touchMove.x*r.z-touchMove.z*f.z;if(kd('z','KeyW','KeyZ')||kd('w')){mx+=f.x;mz+=f.z}if(kd('s','KeyS')){mx-=f.x;mz-=f.z}if(kd('q','KeyA','KeyQ')||kd('a')){mx-=r.x;mz-=r.z}if(kd('d','KeyD')){mx+=r.x;mz+=r.z}const moving=Math.hypot(mx,mz),speed=(keys.ShiftLeft?7.1:4.9)*dt;if(moving){mx=mx/moving*speed;mz=mz/moving*speed;walkBob+=dt*(keys.ShiftLeft?13:9)}let nx=me.x+mx,nz=me.z+mz;for(const o of obs){const hw=o.w/2+.42,hd=o.d/2+.42,hh=o.h/2;if(me.y-1.7<o.y+hh&&me.y>o.y-hh&&Math.abs(nx-o.x)<hw&&Math.abs(nz-o.z)<hd){const ox=hw-Math.abs(nx-o.x),oz=hd-Math.abs(nz-o.z);if(ox<oz)nx=o.x+(nx>o.x?hw:-hw);else nz=o.z+(nz>o.z?hd:-hd)}}me.x=Math.max(-46.8,Math.min(46.8,nx));me.z=Math.max(-33.8,Math.min(33.8,nz));if(!me.onGround){me.vy-=16*dt;me.y+=me.vy*dt;if(me.y<=1.7){me.y=1.7;me.vy=0;me.onGround=true}}camera.position.set(me.x,me.y,me.z);camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;shootCd=Math.max(0,shootCd-dt);recoil=Math.max(0,recoil-dt*.42);if(hand){const bob=moving?Math.sin(walkBob)*.012:0;hand.position.set(bob,-Math.abs(bob)*.6,recoil);hand.rotation.x=reloading?Math.sin(performance.now()*.008)*.22:recoil*1.8}if(mouse)shoot()};

const legacyInit=init;
function disposeScene(){if(!scene)return;scene.traverse(object=>{object.geometry?.dispose?.();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)if(material){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose?.()}})}
init=function(){if(renderer)disposeScene();legacyInit();renderer.setPixelRatio(Math.min(devicePixelRatio,lowPower?1.2:1.75));renderer.shadowMap.enabled=!lowPower;renderer.toneMappingExposure=1.62;renderer.domElement.setAttribute('aria-label','Mechanical War first-person combat view')};

const legacyQuit=quit;
quit=function(){mouse=false;reloadToken++;reloading=false;$('dead')?.classList.add('hide');$('loading')?.classList.add('hide');$('reloadState')?.classList.add('hide');legacyQuit()};

const renderListImmediate=renderList;let renderScheduled=false;
renderList=function(){if(renderScheduled)return;renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;renderListImmediate()})};

// The legacy bulk merge used `incomingGun || currentGun`, so an authoritative null
// could never clear a dropped weapon. Apply nullable inventory fields explicitly.
const legacyHandle=handle;
handle=function(message){const inventory=(message?.type==='bulk'||message?.type==='welcome')?message.players?.find(player=>player.id===myId):null;legacyHandle(message);if(inventory){me.gun=inventory.gun??null;me.ammo=Number.isFinite(inventory.ammo)?inventory.ammo:0;me.res=Number.isFinite(inventory.res)?inventory.res:0;ui()}};

const recentShots=new Map();
function validHit(m,shooter){const weapon=GUN[m.weapon],target=players.get(m.target),shot=recentShots.get(shooter.id);if(!weapon||!target||target.team===shooter.team||target.hp<=0||shooter.gun!==m.weapon||!shot||performance.now()-shot.time>350)return false;const max=weapon.d*(weapon.pel||1)*1.5;return Number.isFinite(m.dmg)&&m.dmg>0&&m.dmg<=max&&Math.hypot(target.x-shooter.x,target.z-shooter.z)<=weapon.range+(weapon.blast||0)+2}
hostSetup=function(c){let joinedId=null;c.on('data',m=>{if(!m||!m.type)return;if(m.type==='join'){const s=spawn(m.player.team),p={...m.player,...s,hp:MAX,gun:null,ammo:0,res:0,last:Date.now()};if(!p.team||count(p.team)>=LIMIT){c.send({type:'reject',reason:'Team full or invalid.'});setTimeout(()=>c.close(),200);return}joinedId=p.id;players.set(p.id,p);conns.set(p.id,c);c.send({type:'welcome',players:[...players.values()],guns});broadcast();feed(p.name+' joined '+TEAM[p.team]);renderList()}else if(m.type==='state'||m.type==='heartbeat'){if(!joinedId||m.player?.id!==joinedId)return;const old=players.get(joinedId);m.player.x=Math.max(-46.8,Math.min(46.8,Number(m.player.x)||old.x));m.player.z=Math.max(-33.8,Math.min(33.8,Number(m.player.z)||old.z));m.player.hp=Math.min(old.hp,Math.max(0,Number(m.player.hp)||0));mergePlayer(m.player);sendAll(m,m.player.id)}else if(m.type==='pickup')hostPickup(m,c);else if(m.type==='drop')hostDrop(m);else if(m.type==='shot'){const p=players.get(joinedId);if(!p||m.shooter!==joinedId||m.weapon!==p.gun)return;const previous=recentShots.get(joinedId),weapon=GUN[m.weapon];if(previous&&performance.now()-previous.time<weapon.cd*800)return;recentShots.set(joinedId,{time:performance.now(),weapon:m.weapon});handle(m);sendAll(m,joinedId)}else if(m.type==='hit'){const p=players.get(joinedId);if(validHit(m,p)){handle(m);sendAll(m,joinedId)}}else if(m.type==='death'){if(m.id===joinedId){const p=players.get(joinedId);if(p)p.hp=0;handle(m);sendAll(m,joinedId)}}else if(m.type==='respawn'){const p=players.get(joinedId);if(p&&p.hp<=0){Object.assign(p,spawn(p.team),{hp:MAX,gun:null,ammo:0,res:0,last:Date.now()});broadcast()}}else if(m.type==='leave'&&m.id===joinedId)remove(joinedId,true)});c.on('close',()=>{if(joinedId)remove(joinedId,true)});c.on('error',()=>{if(joinedId)remove(joinedId,true)})};

addEventListener('visibilitychange',()=>{if(document.hidden&&state==='play'&&!isCoarse)pause()});
for(const id of['host','join','enter']){const button=$(id),action=button?.onclick;if(button&&action)button.onclick=()=>{if(!window.THREE||!window.Peer){stat('Game runtime failed to load. Check your connection and refresh.');return}action()}}
console.log('Mechanical War quality enhancements loaded',ENHANCEMENT_VERSION);
