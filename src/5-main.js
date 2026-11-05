// ===== 포춘 듀오 main.js — 원형 공동방어 트랙 · 구역제 3열 대형 =====
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/SkeletonUtils.js';
import { TIER_NAMES, TIER_COLORS, UNITS, UNITS_BY_TIER, ATTACK_ANIMS, GAMBLE_TABLE,
         MONSTERS, BOSSES, waveSpec, PERSONALITIES, AI_LINES,
         SUMMON_BASE, SUMMON_STEP, GAMBLE_COST, START_GOLD, START_LIVES } from './data.js';

const Q = new URLSearchParams(location.search);
const AUTO = Q.get('auto') === '1';
const SPEED = parseFloat(Q.get('speed') || '1');
let seed = parseInt(Q.get('seed') || String(Date.now() % 100000));
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let rnd = mulberry32(seed);
const pick = arr => arr[Math.floor(rnd()*arr.length)];
const $ = id => document.getElementById(id);

// ---------- 오디오 ----------
const SFX = { summon:'summon', place:'place', merge:'merge', gamble:'gamble', gamble_win:'gamble_win', gamble_fail:'gamble_fail',
  gold:'gold', coins:'coins', attack1:'attack1', attack2:'attack2', shoot:'shoot', magic:'magic', hit1:'hit1', hit2:'hit2',
  click:'click', waveclear:'waveclear', leak:'leak', victory:'victory', defeat:'defeat', boss:'boss' };
const AudioMan = {
  ctx:null, buffers:{}, enabled: localStorage.getItem('fd_sound') !== 'off', bgm:null, bgmGain:null, lastPlay:{},
  async init(){ this.ctx = new (window.AudioContext||window.webkitAudioContext)();
    const jobs = Object.entries(SFX).map(([k,f])=> fetch(`assets/audio/${f}.ogg`).then(r=>r.arrayBuffer()).then(b=>this.ctx.decodeAudioData(b)).then(d=>this.buffers[k]=d).catch(()=>{}));
    jobs.push(fetch('assets/audio/11-bgm.mp3').then(r=>r.arrayBuffer()).then(b=>this.ctx.decodeAudioData(b)).then(d=>this.buffers.bgm=d).catch(()=>{}));
    await Promise.all(jobs);
    this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = 0.3; this.bgmGain.connect(this.ctx.destination); },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },
  play(k, vol=1, rate=1, throttle=0){ if(!this.enabled || !this.buffers[k]) return;
    const now = performance.now(); if(throttle && now-(this.lastPlay[k]||0) < throttle) return; this.lastPlay[k]=now;
    const s=this.ctx.createBufferSource(); s.buffer=this.buffers[k]; s.playbackRate.value=rate*(0.94+rnd()*0.12);
    const g=this.ctx.createGain(); g.gain.value=vol; s.connect(g); g.connect(this.ctx.destination); s.start(); },
  bgmStart(){ if(!this.buffers.bgm || this.bgm) return; this.bgm=this.ctx.createBufferSource(); this.bgm.buffer=this.buffers.bgm; this.bgm.loop=true; this.bgm.connect(this.bgmGain); this.bgm.start(); this.bgmGain.gain.value = this.enabled?0.3:0; },
  bgmStop(){ if(this.bgm){ try{this.bgm.stop();}catch(e){} this.bgm=null; } },
  toggle(){ this.enabled=!this.enabled; localStorage.setItem('fd_sound', this.enabled?'on':'off');
    $('btn-sound').textContent=this.enabled?'소리':'음소거'; if(this.bgmGain) this.bgmGain.gain.value=this.enabled?0.3:0; }
};

// ---------- 로딩 ----------
const MODEL_LIST = [
  ...UNITS.map(u=>({ key:'u_'+u.id, url:'assets/units/'+u.model, h:u.h })),
  ...Object.values(MONSTERS).flat().map(e=>({ key:'m_'+e.m, url:'assets/enemies/'+e.m+'.gltf', h:1.25 })),
  ...BOSSES.map(b=>({ key:'m_'+b.m, url:'assets/enemies/'+b.m+'.gltf', h:1.25 })),
  { key:'towerR', url:'assets/arena/towerRound_sampleA.glb' },
  { key:'towerS', url:'assets/arena/towerSquare_sampleA.glb' },
  { key:'tileSpawn', url:'assets/arena/tile_spawn.glb' },
  { key:'crystal', url:'assets/arena/detail_crystal.glb' },
  { key:'tree', url:'assets/arena/detail_tree.glb' },
  { key:'rocks', url:'assets/arena/detail_rocks.glb' },
];
const MODELS = {};
function loadModels(onProgress){
  const loader = new GLTFLoader(); let done = 0;
  const uniq = MODEL_LIST.filter((v,i,a)=>a.findIndex(x=>x.key===v.key)===i);
  return Promise.all(uniq.map(item =>
    new Promise(res => loader.load(item.url, g => {
      const box = new THREE.Box3().setFromObject(g.scene);
      const h = Math.max(0.001, box.max.y - box.min.y);
      MODELS[item.key] = { scene:g.scene, animations:g.animations, height:h };
      done++; onProgress(done/uniq.length); res();
    }, undefined, err => { console.error('LOAD FAIL', item.url, err); done++; onProgress(done/uniq.length); res(); }))
  ));
}
function instantiate(key, targetH){
  const src = MODELS[key]; if(!src) return null;
  const obj = SkeletonUtils.clone(src.scene);
  obj.scale.setScalar(targetH / src.height);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y = -box.min.y;
  const wrap = new THREE.Group(); wrap.add(obj);
  obj.traverse(o=>{ if(o.isMesh){ o.frustumCulled=false; } });
  return { group:wrap, inner:obj, animations:src.animations };
}

// ---------- 씬 ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc7e8);
scene.fog = new THREE.Fog(0x8fc7e8, 55, 110);
const R = 8.5;                 // 트랙 반경
const camera = new THREE.PerspectiveCamera(44, innerWidth/innerHeight, 0.1, 220);
function placeCamera(){
  const aspect = innerWidth/innerHeight;
  if(aspect < 1){
    const needHalf = Math.sin(75*Math.PI/180)*(R+4.6) + 1.4;
    const dist = Math.hypot(32, 33.8);
    const tanV = needHalf / (dist * aspect);
    camera.fov = Math.min(75, Math.max(50, 2*Math.atan(tanV)*180/Math.PI));
    camera.position.set(0, 32, 36);
  } else {
    const small = innerWidth < 760;
    camera.fov = 44;
    camera.position.set(0, small?32:29.5, small?36:20.5);
  }
  camera.updateProjectionMatrix();
  camera.lookAt(0,0,2.2);
}
placeCamera();
function onResize(){ renderer.setSize(innerWidth, innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); placeCamera(); }
addEventListener('resize', onResize); onResize();
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3f, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d9, 1.5); sun.position.set(10, 24, 12); scene.add(sun);

// ---------- 원형 트랙 ----------

const GATE_A = Math.PI;        // 성문 각도(상단 중앙, z<0)
function trackPoint(theta, radial=0){
  const r = R + radial;
  return { x: Math.sin(theta)*r, z: Math.cos(theta)*r };
}
// 진행: theta = π(성문) → 시계방향 한 바퀴 → 다시 π이면 침투. t∈[0,1] 진행률
function trackTheta(t){ return Math.PI - t * Math.PI * 2; }

function buildArena(){
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshLambertMaterial({ color:0x4d7c43 }));
  ground.rotation.x = -Math.PI/2; ground.position.y = -0.03; scene.add(ground);
  // 원형 흙길
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(R-1.15, R+1.15, 72), new THREE.MeshLambertMaterial({ color:0x9a7d55 }));
  ringRoad.rotation.x = -Math.PI/2; ringRoad.position.y = 0.0; scene.add(ringRoad);
  // 중앙 마법진
  const inner = new THREE.Mesh(new THREE.CircleGeometry(R-1.3, 48), new THREE.MeshLambertMaterial({ color:0x55855c }));
  inner.rotation.x = -Math.PI/2; inner.position.y = -0.01; scene.add(inner);
  const sigil = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 48), new THREE.MeshBasicMaterial({ color:0xffd766, transparent:true, opacity:0.5 }));
  sigil.rotation.x = -Math.PI/2; sigil.position.y = 0.02; scene.add(sigil);
}
function buildArena2(){ // 모델 로드 후
  const gp = trackPoint(GATE_A);
  const g = instantiate('tileSpawn', 0.6); if(g){ g.group.position.set(gp.x, 0, gp.z - 1.2); scene.add(g.group); }
  for(const dx of [-2.6, 2.6]){
    const tw = instantiate(dx<0?'towerR':'towerS', 3.8); if(tw){ tw.group.position.set(gp.x+dx, 0, gp.z-4.6); scene.add(tw.group); }
  }
  const c1 = instantiate('crystal', 1.8); if(c1){ c1.group.position.set(gp.x-5.4, 0, gp.z-2.4); scene.add(c1.group); }
  const c2 = instantiate('crystal', 1.8); if(c2){ c2.group.position.set(gp.x+5.4, 0, gp.z-2.4); scene.add(c2.group); }
  const deco = [['tree',-16,-8,2.8],['tree',16,-8,2.5],['tree',-16,9,2.9],['tree',16,9,2.3],['rocks',-17,0,1.7],['rocks',17,0,1.5],['tree',-9,17,2.6],['tree',9,17,2.8],['crystal',0,17.5,1.9],['rocks',-6,-17,1.3],['rocks',6,-17,1.4],['tree',0,-19,3.2]];
  for (const [k,x,z,h] of deco){ const d = instantiate(k,h); if(d){ d.group.position.set(x,0,z); d.group.rotation.y=rnd()*6.28; scene.add(d.group); } }
}

// ---------- 타일 (구역제: 진영별 3열 × 6구역 = 18타일) ----------
// 진행 순서: 성문 → N1~N3(우상) → S1~S6(하) → N4~N6(좌상) → 성문 침투
// side -1 = 플레이어(아래, z>0), +1 = AI(위, z<0)
// 열: 0=전열(근접 유효, 집중 +25%), 1=중열(균형), 2=후열(원거리 전용, 사거리 +50%, 공격 -15%)
const TILE_SECTORS = 6, TILE_ROWS = 3, TILES_PER_SIDE = 18;
const ROW_RADII = [R+1.8, R+2.8, R+4.4];
const ROW_NAMES = ['전열','중열','후열'];
function tileAngle(side, idx){
  const row = Math.floor(idx / TILE_SECTORS);
  const j = idx % TILE_SECTORS; // 진행 순서 섹터 0..5
  let deg;
  if(side<0) deg = 75 - 30*j;                  // S1=75° … S6=-75°
  else deg = j<3 ? 165-30*j : 345-30*j;        // N1=165,N2=135,N3=105,N4=255,N5=225,N6=195
  return { a: deg*Math.PI/180, r: ROW_RADII[row], row, sector:j };
}
function tilePos(side, idx){
  const { a, r, row, sector } = tileAngle(side, idx);
  return { x: Math.sin(a)*r, z: Math.cos(a)*r, row, sector };
}
// 트랙 구역(30° 단위, z=0~11). theta: trackTheta 값(라디안)
function zoneOfTheta(theta){
  const norm = ((theta*180/Math.PI) + 360) % 360;
  return Math.min(11, Math.floor(norm/30));
}
function zoneOfTile(side, sector){
  if(side<0) return ((2 - sector) % 12 + 12) % 12;   // S1→2 … S6→9
  return sector<3 ? 5 - sector : 11 - sector;        // N1→5,N2→4,N3→3,N4→8,N5→7,N6→6
}
function enemyZone(e){ return zoneOfTheta(trackTheta(e.t % 1)); }
// 유닛의 담당 구역(우선 공격): 후열만 3구역, 전열·중열은 자기 구역
function unitZones(u){
  if(u.row === 2) return [u.zone, (u.zone+1)%12, (u.zone+11)%12];
  return [u.zone];
}
// 구역 완성 보너스: 한 구역의 전/중/후열이 모두 차 있으면 그 구역 유닛 공격속도 +10%
function sectorFull(side, sector){
  for(let row=0; row<TILE_ROWS; row++) if(!sideUnitAt(side, row*TILE_SECTORS + sector)) return false;
  return true;
}
const tileMeshes = { [-1]:[], [1]:[] };
function buildTiles(){
  const geo = new THREE.CylinderGeometry(0.74, 0.84, 0.16, 20);
  const rowCol = { [-1]:[0x4a6fb0, 0x5578bd, 0x6182c9], [1]:[0xb06a4a, 0xbd7857, 0xc98665] };
  for (const s of [-1,1]) for (let i=0;i<TILES_PER_SIDE;i++){
    const p = tilePos(s,i);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: rowCol[s][p.row], transparent:true, opacity:0.6 }));
    m.position.set(p.x, 0.08, p.z); m.userData = { side:s, idx:i };
    scene.add(m); tileMeshes[s].push(m);
  }
}
function flashTile(side, idx, color){ const m = tileMeshes[side][idx]; if(!m) return; m.material.color.setHex(color); setTimeout(()=>m.material.color.setHex(side<0?0x4a6fb0:0xb06a4a), 450); }

// ---------- 이펙트 ----------
const fxPool = [];
function makeBurst(){ const n=14; const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*3),3));
  const mat = new THREE.PointsMaterial({ size:0.24, color:0xffe08a, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false });
  const pts = new THREE.Points(g, mat); pts.visible=false; scene.add(pts);
  return { pts, vel:new Float32Array(n*3), t:0, active:false, n }; }
for(let i=0;i<28;i++) fxPool.push(makeBurst());
function burst(x,y,z,color=0xffe08a,spread=2.4){
  const fx = fxPool.find(f=>!f.active); if(!fx) return;
  fx.active=true; fx.t=0; fx.pts.visible=true; fx.pts.material.color.setHex(color); fx.pts.material.opacity=1;
  const pos = fx.pts.geometry.attributes.position.array;
  for(let i=0;i<fx.n;i++){ pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
    fx.vel[i*3]=(rnd()-0.5)*spread; fx.vel[i*3+1]=rnd()*spread*0.9+0.5; fx.vel[i*3+2]=(rnd()-0.5)*spread; }
  fx.pts.geometry.attributes.position.needsUpdate=true;
}
const ringPool = [];
function makeRing(){ const m = new THREE.Mesh(new THREE.RingGeometry(0.6,0.85,32), new THREE.MeshBasicMaterial({ color:0xffd766, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false }));
  m.rotation.x=-Math.PI/2; m.visible=false; scene.add(m); return { m, t:0, active:false }; }
for(let i=0;i<10;i++) ringPool.push(makeRing());
function ring(x,z,color=0xffd766){ const r=ringPool.find(r=>!r.active); if(!r) return; r.active=true; r.t=0; r.m.visible=true; r.m.material.color.setHex(color); r.m.position.set(x,0.14,z); }
const beamPool = [];
function makeBeam(){ const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.7,6,12,1,true), new THREE.MeshBasicMaterial({ color:0xfff2b0, transparent:true, opacity:0.7, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
  m.visible=false; scene.add(m); return { m, t:0, active:false }; }
for(let i=0;i<8;i++) beamPool.push(makeBeam());
function beam(x,z,color=0xfff2b0){ const b=beamPool.find(b=>!b.active); if(!b) return; b.active=true; b.t=0; b.m.visible=true; b.m.material.color.setHex(color); b.m.position.set(x,3,z); }
const dmgPool = [];
function makeDmg(){ const cv=document.createElement('canvas'); cv.width=160; cv.height=80;
  const tex=new THREE.CanvasTexture(cv); const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false });
  const sp=new THREE.Sprite(mat); sp.scale.set(1.9,0.95,1); sp.visible=false; scene.add(sp);
  return { sp, cv, tex, t:0, active:false }; }
for(let i=0;i<40;i++) dmgPool.push(makeDmg());
function dmgNum(x,y,z,text,color='#ffe08a',big=false){
  const d=dmgPool.find(d=>!d.active); if(!d) return;
  const ctx=d.cv.getContext('2d'); ctx.clearRect(0,0,160,80);
  ctx.font=`900 ${big?46:34}px 'Noto Sans CJK KR',sans-serif`; ctx.textAlign='center';
  ctx.lineWidth=6; ctx.strokeStyle='rgba(0,0,0,.75)'; ctx.strokeText(text,80,52);
  ctx.fillStyle=color; ctx.fillText(text,80,52);
  d.tex.needsUpdate=true; d.active=true; d.t=0; d.sp.visible=true; d.sp.position.set(x,y,z); d.sp.scale.set(big?2.6:1.9, big?1.3:0.95, 1);
}

// ---------- 게임 상태 ----------
const G = { phase:'boot', wave:0, lives:START_LIVES, paused:false, speed:1, sides:{}, enemies:[], projectiles:[], kills:0, goldEarned:0, persKey:'balanced' };
function newSide(side){ return { side, gold:START_GOLD, summons:0, units:[] }; }
G.sides[-1]=newSide(-1); G.sides[1]=newSide(1);
const summonCost = s => SUMMON_BASE + G.sides[s].summons * SUMMON_STEP;

function makeAnimator(inst, idleNames){
  const mixer = new THREE.AnimationMixer(inst.inner);
  const clips = inst.animations || [];
  const find = names => { for(const n of names){ const c = clips.find(c=>c.name===n); if(c) return c; } return null; };
  const idleClip = find(idleNames) || clips[0];
  let idleAction = null, cur = null;
  if(idleClip){ idleAction = mixer.clipAction(idleClip); idleAction.play(); cur = idleAction; }
  return { mixer,
    playOnce(names, timeScale=1.4){ const c = find(Array.isArray(names)?names:[names]); if(!c) return 0.3;
      const a = mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=false; a.timeScale=timeScale;
      if(cur && cur!==a){ cur.crossFadeTo(a, 0.08, false); } a.play();
      const dur = c.duration/timeScale;
      setTimeout(()=>{ if(idleAction){ idleAction.reset(); idleAction.play(); if(cur) cur.crossFadeTo(idleAction,0.15,false); cur=idleAction; } }, dur*1000*0.92);
      cur = a; return dur; },
    stopAll(){ clips.forEach(c=>mixer.clipAction(c).stop()); } };
}

// ---------- 유닛 ----------
let unitSeq = 0;
function spawnUnit(side, unitDef, tileIdx){
  if(tileIdx==null || tileIdx<0) return null;
  const S = G.sides[side];
  const inst = instantiate('u_'+unitDef.id, unitDef.h);
  if(!inst) return null;
  const p = tilePos(side, tileIdx);
  inst.group.position.set(p.x, 0.16, p.z);
  // 중앙(트랙)을 바라보게
  inst.group.lookAt(0, 0.16, 0);
  scene.add(inst.group);
  const idle = unitDef.pack==='kay' ? ['Idle'] : ['Idle_Weapon','Idle'];
  const anim = makeAnimator(inst, idle);
  const u = { uid:++unitSeq, side, def:unitDef, tile:tileIdx, group:inst.group, inner:inst.inner, anim, cool: 0.3+rnd()*0.5, row:p.row, sector:p.sector, zone:zoneOfTile(side, p.sector) };
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.55,0.78,24), new THREE.MeshBasicMaterial({ color:TIER_COLORS[unitDef.tier-1], transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false }));
  aura.rotation.x=-Math.PI/2; aura.position.y=0.02; inst.group.add(aura); u.aura=aura;
  S.units.push(u);
  beam(p.x, p.z, TIER_COLORS[unitDef.tier-1]); ring(p.x, p.z, TIER_COLORS[unitDef.tier-1]);
  return u;
}
function removeUnit(u){ const S=G.sides[u.side]; S.units = S.units.filter(x=>x!==u); scene.remove(u.group); }
function sideUnitAt(side, tileIdx){ return G.sides[side].units.find(u=>u.tile===tileIdx); }
function freeTiles(side){ const out=[]; for(let i=0;i<TILES_PER_SIDE;i++) if(!sideUnitAt(side,i)) out.push(i); return out; }

// 소환 배치 선택: 유닛 종류에 맞는 열, 빈 구역 우선
// 근접은 전열(0열)만 트랙에 닿으므로(사거리 2.2~2.6 < 중열 최소거리 2.8) 전열이 가득 차면 -1 반환
function chooseTile(side, def, prefRow){
  const free = freeTiles(side); if(!free.length) return -1;
  const emptySector = i => { const j = i % TILE_SECTORS; return ![0,1,2].some(r => sideUnitAt(side, r*TILE_SECTORS + j)); };
  if(def.kind==='melee'){
    const front = free.filter(i => i < TILE_SECTORS);
    if(!front.length) return -1;
    const empt = front.filter(emptySector);
    return pick(empt.length ? empt : front);
  }
  const row = prefRow != null ? prefRow : (def.kind==='ranged' ? 2 : 1);
  let pool = free.filter(i => Math.floor(i/TILE_SECTORS) === row);
  if(!pool.length) pool = free;
  const empt = pool.filter(emptySector);
  return pick(empt.length ? empt : pool);
}

// 배치 불가(전열 만석): 골드 차감 없이 실패 회계만
function placeFail(side, what){
  const S = G.sides[side]; S.spawnFails = (S.spawnFails||0)+1;
  if(side<0) log(`${what} 불가: 전열(가장 안쪽 줄)이 가득 차 근접 유닛을 배치할 수 없습니다. 합성으로 자리를 비우거나 전열 유닛을 옮겨 주세요.`, 'sys');
  updateHUD();
}

function spawnFail(side, what){
  const S = G.sides[side]; S.spawnFails = (S.spawnFails||0)+1;
  if(S.spawnFails===1) log(`${what} 실패: 유닛 모델을 불러오지 못했습니다. 골드는 차감되지 않습니다.`, 'sys');
  updateHUD();
}
function doSummon(side){
  const S = G.sides[side]; const cost = summonCost(side);
  if(S.gold < cost) return false;
  const free = freeTiles(side); if(!free.length) return false;
  const def = pick(UNITS_BY_TIER[1]);
  if(!MODELS['u_'+def.id]){ spawnFail(side, '소환'); return false; }
  const tile = chooseTile(side, def, side>0 ? aiRowPref() : null);
  if(tile<0){ placeFail(side, '소환'); return false; }
  S.gold -= cost; S.summons++;
  const u = spawnUnit(side, def, tile);
  if(!u){ spawnFail(side, '소환'); return false; }
  S.spawnFails = 0;
  AudioMan.play(side<0?'summon':'place', side<0?0.9:0.5);
  updateHUD(); return def;
}
function rollGamble(){ let r=rnd(), acc=0; for(const g of GAMBLE_TABLE){ acc+=g.p; if(r<acc) return g; } return GAMBLE_TABLE[0]; }
function doGamble(side){
  const S = G.sides[side];
  if(S.gold < GAMBLE_COST) return null;
  const free = freeTiles(side); if(!free.length) return null;
  const res = rollGamble();
  AudioMan.play('gamble', side<0?0.9:0.4);
  if(res.tier===0){ S.gold -= GAMBLE_COST; if(side<0) AudioMan.play('gamble_fail', 0.8); updateHUD(); return { tier:0 }; }
  const def = pick(UNITS_BY_TIER[res.tier]);
  if(!MODELS['u_'+def.id]){ spawnFail(side, '행운 소환'); return { tier:0, spawnFail:true }; }
  const tile = chooseTile(side, def, side>0 ? aiRowPref() : null);
  if(tile<0){ placeFail(side, '행운 소환'); return { tier:0, spawnFail:true }; }
  S.gold -= GAMBLE_COST;
  const u = spawnUnit(side, def, tile);
  if(!u){ spawnFail(side, '행운 소환'); return { tier:0, spawnFail:true }; }
  S.spawnFails = 0;
  if(res.tier>=4) AudioMan.play('gamble_win', 0.9);
  updateHUD(); return { tier:res.tier, def };
}
function findTriple(side){
  const byId = {};
  for(const u of G.sides[side].units){ if(u.def.tier>=5) continue; (byId[u.def.id]=byId[u.def.id]||[]).push(u); }
  for(const id in byId) if(byId[id].length>=3) return byId[id].slice(0,3);
  return null;
}
function doMerge(side){
  const triple = findTriple(side); if(!triple) return null;
  const tier = triple[0].def.tier;
  const freed = triple.map(u=>u.tile);
  triple.forEach(u=>{ burst(u.group.position.x, 1, u.group.position.z, 0xffd766); removeUnit(u); });
  const def = pick(UNITS_BY_TIER[tier+1]);
  if(!MODELS['u_'+def.id]){ log('합성 실패: 결과 유닛 모델을 불러오지 못했습니다. 유닛은 그대로 유지됩니다.', 'sys'); return null; }
  // 결과 유닛 종류에 맞는 열을 해방된 타일에서 우선 선택 (근접이 후열에 놓이는 것 방지)
  const wantRow = def.kind==='melee' ? 0 : def.kind==='ranged' ? 2 : 1;
  let tile = freed.find(t => Math.floor(t/TILE_SECTORS) === wantRow);
  if(tile==null) tile = chooseTile(side, def, side>0 ? aiRowPref() : null);
  if(tile==null || tile<0) tile = freed[1];
  const p = tilePos(side, tile);
  spawnUnit(side, def, tile);
  AudioMan.play('merge', side<0?0.9:0.5);
  burst(p.x, 1.2, p.z, 0xffd766, 3.2);
  updateHUD(); return def;
}
function setUnitTile(u, side, tile){
  u.tile = tile; const p = tilePos(side, tile);
  u.group.position.set(p.x,0.16,p.z); u.group.lookAt(0,0.16,0);
  u.row = p.row; u.sector = p.sector; u.zone = zoneOfTile(side, p.sector);
}
function moveUnit(side, fromTile, toTile){
  const a = sideUnitAt(side, fromTile), b = sideUnitAt(side, toTile);
  if(!a) return;
  const toRow = Math.floor(toTile / TILE_SECTORS), fromRow = Math.floor(fromTile / TILE_SECTORS);
  if((toRow!==0 && a.def.kind==='melee') || (b && fromRow!==0 && b.def.kind==='melee')){
    if(side<0){ log('근접 유닛은 전열(가장 안쪽 줄)에만 배치할 수 있습니다. 중열·후열에서는 트랙까지 사거리가 닿지 않습니다.', 'sys'); AudioMan.play('gamble_fail', 0.35); }
    return;
  }
  if(b) setUnitTile(b, side, fromTile);
  setUnitTile(a, side, toTile);
  ring(a.group.position.x, a.group.position.z, 0x8fd3ff); if(side<0) AudioMan.play('click', 0.5);
}

// ---------- 적/웨이브 (공유 원형 트랙) ----------
let waveSeed = 1, spawnQueue = [], spawnT = 0, waveActive = false;
let prepPending = false, prepT = 0; // 웨이브 사이 자동 정비(초)
function spawnEnemy(spec, waveN, isBoss=false){
  const key = 'm_'+spec.m;
  const h = isBoss ? 1.6*(spec.scale||2) : (1.15 + 0.13*Math.min(4,Math.ceil(waveN/3)));
  const inst = instantiate(key, h);
  if(!inst) return;
  scene.add(inst.group);
  const moveAnim = spec.fly ? ['Flying','Walk'] : ['Walk','Flying','Idle'];
  const anim = makeAnimator(inst, moveAnim);
  const maxHp = Math.round(waveSpec(waveN).hpBase * (spec.hp||1)) * (isBoss? 1 : 1);
  const radial = (rnd()-0.5)*0.9;
  const e = { group:inst.group, inner:inst.inner, anim, spec, hp:maxHp, maxHp,
    t:0, speed:(spec.sp||1)*(0.92+rnd()*0.16), slowT:0, slowF:1, dead:false, boss:isBoss,
    fly:!!spec.fly, radial, wiggle:rnd()*6.28, h };
  const start = trackPoint(trackTheta(0), radial);
  e.group.position.set(start.x, e.fly?0.8:0, start.z);
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0x222831, depthTest:false }));
  bg.scale.set(1.15,0.13,1); bg.position.y = h+0.55; inst.group.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color:isBoss?0xff5c5c:0x7dff8a, depthTest:false }));
  fg.scale.set(1.1,0.09,1); fg.position.y = h+0.551; inst.group.add(fg);
  e.hpBar = fg;
  G.enemies.push(e);
}
function startWave(){
  if(waveActive || G.phase!=='play') return;
  prepPending = false; prepT = 0;
  G.wave++;
  const spec = waveSpec(G.wave);
  waveSeed = G.wave * 1000 + seed;
  const wrnd = mulberry32(waveSeed);
  spawnQueue = [];
  if(spec.boss){
    const boss = BOSSES[Math.floor(wrnd()*BOSSES.length)];
    spawnQueue.push({ boss:true, spec:boss });
    const escorts = 4 + Math.floor(G.wave/5);
    for(let i=0;i<escorts;i++){ const t2 = Math.min(4,spec.tierAvail); spawnQueue.push({ boss:false, spec:MONSTERS[t2][Math.floor(wrnd()*MONSTERS[t2].length)] }); }
    $('boss-banner').style.display='block'; setTimeout(()=>$('boss-banner').style.display='none', 3500);
    AudioMan.play('boss', 0.9);
    log(`웨이브 ${G.wave} — 보스 「${boss.name}」 출현!`, 'sys'); aiSay('boss');
  } else {
    for(let i=0;i<spec.count;i++){
      const t = 1 + Math.floor(wrnd()*spec.tierAvail);
      spawnQueue.push({ boss:false, spec:MONSTERS[t][Math.floor(wrnd()*MONSTERS[t].length)] });
    }
    log(`웨이브 ${G.wave} 시작!`, 'sys');
  }
  spawnT = 0; waveActive = true;
  updateHUD();
}
const LOOP_TIME_BASE = 40; // 속도 1 기준 한 바퀴 초
function damageEnemy(e, dmg, creditSide, crit=false, slow=null){
  if(e.dead) return;
  e.hp -= dmg;
  dmgNum(e.group.position.x, e.group.position.y + (e.boss?3.6:1.9), e.group.position.z, String(Math.round(dmg)), crit?'#ffd23e':'#ffffff', crit);
  if(slow){ e.slowT = Math.max(e.slowT, slow.dur); e.slowF = slow.f; }
  if(e.hp<=0){
    e.dead = true; e.anim.stopAll();
    const anims = MODELS['m_'+e.spec.m]?.animations || [];
    const deathClip = anims.find(a=>a.name==='Death');
    if(deathClip){ const a=e.anim.mixer.clipAction(deathClip); a.reset(); a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play(); }
    burst(e.group.position.x, 0.8, e.group.position.z, e.boss?0xff8a5c:0xa0e8ff, e.boss?5:2.6);
    if(e.hpBar) e.hpBar.visible=false;
    const S = G.sides[creditSide] || G.sides[-1];
    const gold = e.boss ? 50 : waveSpec(G.wave).killGold;
    S.gold += gold; G.goldEarned += gold; G.kills++;
    dmgNum(e.group.position.x, 1.3, e.group.position.z, `+${gold}G`, '#ffd766');
    AudioMan.play(e.boss?'gamble_win':'gold', e.boss?0.9:0.32, 1, e.boss?0:120);
    const ref = e; setTimeout(()=>{ scene.remove(ref.group); }, 900);
    G.enemies = G.enemies.filter(x=>x!==e);
    checkWaveEnd(); updateHUD();
  }
}
function leak(e){
  G.lives -= e.boss?5:1;
  scene.remove(e.group);
  G.enemies = G.enemies.filter(x=>x!==e);
  AudioMan.play('leak', 0.8);
  $('vign').classList.add('hit'); setTimeout(()=>$('vign').classList.remove('hit'), 350);
  log(`성문 침투! ${e.boss?'보스 -5':'-1'} (남은 공유 생명 ${Math.max(0,G.lives)})`, 'sys');
  if(AI.alive) aiSay('leak');
  updateHUD(); checkWaveEnd();
  if(G.lives<=0) gameOver();
}
function checkWaveEnd(){
  if(waveActive && spawnQueue.length===0 && G.enemies.length===0 && G.phase==='play'){
    waveActive = false;
    const bonus = waveSpec(G.wave).clearBonus;
    G.sides[-1].gold += bonus; G.sides[1].gold += bonus;
    AudioMan.play('waveclear', 0.8);
    log(`웨이브 ${G.wave} 클리어! 양쪽 모두 +${bonus}G`, 'sys');
    const nextBoss = waveSpec(G.wave+1).boss;
    prepPending = true; prepT = nextBoss ? 8 : 6;
    saveRecords(); updateHUD();
  }
}
function updateEnemies(dt){
  for(const e of [...G.enemies]){
    if(e.dead) { e.anim.mixer.update(dt); continue; }
    e.anim.mixer.update(dt);
    if(e.slowT>0) e.slowT -= dt;
    const sf = (e.slowT>0) ? e.slowF : 1;
    e.t += (e.speed * sf * dt) / LOOP_TIME_BASE;
    e.wiggle += dt*2;
    const theta = trackTheta(e.t % 1);
    const p = trackPoint(theta, e.radial + Math.sin(e.wiggle)*0.25);
    const prev = e.group.position;
    const nx = p.x, nz = p.z;
    e.group.position.set(nx, e.fly ? 0.8 + Math.sin(e.wiggle*1.7)*0.15 : 0, nz);
    e.group.lookAt(nx*2 - prev.x, e.group.position.y, nz*2 - prev.z); // 진행방향 바라보기
    if(e.hpBar){ const r = Math.max(0, e.hp/e.maxHp); e.hpBar.scale.x = 1.1*r; }
    if(e.t >= 1) leak(e);
  }
}

// ---------- 전투 ----------
function fireProjectile(u, target){
  const from = u.group.position.clone(); from.y = 1.3;
  const kind = u.def.proj || 'orb';
  let mesh;
  if(kind==='arrow'){ mesh = new THREE.Mesh(new THREE.ConeGeometry(0.08,0.55,6), new THREE.MeshBasicMaterial({ color:0xd9c9a8 })); mesh.rotation.x = Math.PI/2; }
  else { const col = kind==='holy'?0xffe9a0 : kind==='orbBig'?0xc59bff : 0x7fd4ff;
    mesh = new THREE.Mesh(new THREE.SphereGeometry(kind==='orbBig'?0.24:0.15, 8, 8), new THREE.MeshBasicMaterial({ color:col, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false })); }
  mesh.position.copy(from); scene.add(mesh);
  G.projectiles.push({ mesh, target, from, t:0, dur: Math.max(0.12, from.distanceTo(target.group.position)/15), def:u.def, side:u.side, mult:dmgMul(u, target) });
  AudioMan.play(kind==='arrow'?'shoot':'magic', 0.28, 1, 90);
}
// 열 보정: 후열 -15%, 전열은 담당 구역 안 적에게 +25%
function dmgMul(u, e){
  let m = 1;
  if(u.row === 2) m *= 0.85;
  else if(u.row === 0 && enemyZone(e) === u.zone) m *= 1.25;
  return m;
}
function hitWithDef(target, def, side, mult=1){
  let dmg = def.dmg * mult; let crit = false;
  if(def.crit && rnd() < def.crit){ dmg *= def.critMul; crit = true; }
  damageEnemy(target, Math.round(dmg), side, crit, def.slow?{ f:1-def.slow, dur:def.slowDur }:null);
}
function updateProjectiles(dt){
  for(let i=G.projectiles.length-1;i>=0;i--){
    const p = G.projectiles[i]; p.t += dt;
    if(!p.target || p.target.dead){ scene.remove(p.mesh); G.projectiles.splice(i,1); continue; }
    const to = p.target.group.position.clone(); to.y = 1.0;
    const k = Math.min(1, p.t/p.dur);
    p.mesh.position.lerpVectors(p.from, to, k);
    if(k>=1){
      scene.remove(p.mesh); G.projectiles.splice(i,1);
      hitWithDef(p.target, p.def, p.side, p.mult);
      burst(to.x, to.y, to.z, p.def.kind==='magic'?0x9fd4ff:0xffe08a, 1.8);
      if(p.def.splash) for(const e of [...G.enemies]){ if(e!==p.target && !e.dead && e.group.position.distanceTo(to) < p.def.splash) damageEnemy(e, Math.round(p.def.dmg*0.6*p.mult), p.side); }
    }
  }
}
function updateUnits(dt){
  for(const s of [-1,1]) for(const u of G.sides[s].units){
    u.cool -= dt;
    u.anim.mixer.update(dt);
    if(u.pending){
      u.pending.t -= dt;
      if(u.pending.t<=0){
        const tgt = u.pending.target; u.pending = null;
        if(!tgt.dead){
          if(u.def.aoe){ for(const e of [...G.enemies]){ if(!e.dead && e.group.position.distanceTo(u.group.position) <= u.def.range) hitWithDef(e, u.def, s, dmgMul(u, e)); } ring(u.group.position.x, u.group.position.z, 0xc59bff); }
          else hitWithDef(tgt, u.def, s, dmgMul(u, tgt));
          burst(tgt.group.position.x, 1.0, tgt.group.position.z, 0xffe08a, 1.6);
          AudioMan.play(rnd()<0.5?'attack1':'attack2', 0.22, 1, 80);
        }
      }
    }
    if(u.cool>0) continue;
    const zones = unitZones(u);
    const effRange = u.def.range * (u.row===2 ? 1.5 : 1);
    let best=null, bestT=-1, bestZone=false;
    for(const e of G.enemies){ if(e.dead) continue;
      const d = Math.hypot(e.group.position.x-u.group.position.x, e.group.position.z-u.group.position.z);
      if(d > effRange) continue;
      const inZone = zones.includes(enemyZone(e));
      // 담당 구역 안의 적을 우선, 그 안에서는 가장 멀리 진행한 적
      if(inZone && (!bestZone || e.t > bestT)){ best=e; bestT=e.t; bestZone=true; }
      else if(!inZone && !bestZone && e.t > bestT){ best=e; bestT=e.t; }
    }
    if(best){
      u.cool = u.def.interval * (sectorFull(s, u.sector) ? 0.9 : 1);
      u.group.lookAt(best.group.position.x, u.group.position.y, best.group.position.z);
      const names = ATTACK_ANIMS[u.def.model.replace(/\..*$/,'')] || ['Idle'];
      u.anim.playOnce(names, 1.5);
      if(u.def.kind==='melee'){ u.pending = { target: best, t: 0.24 }; } // 게임시간 기반 지연 타격(배속·일시정지와 비례)
      else fireProjectile(u, best);
    }
  }
}

// ---------- 로그/AI 대사 ----------
function log(text, cls='sys'){
  const el = document.createElement('div'); el.className='msg '+cls;
  el.innerHTML = cls==='ai' ? `<span class="who">${PERSONALITIES[G.persKey].name}</span>${text}` : text;
  const box = $('log'); box.appendChild(el);
  while(box.children.length>30) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}
function aiSay(kind){
  const lines = (AI_LINES[G.persKey]||AI_LINES.balanced)[kind]; if(!lines) return;
  log(pick(lines), 'ai');
}

// ---------- AI 컨트롤러 ----------
const AI = { alive:false, reposT:0 };
function aiRowPref(){
  switch(G.persKey){
    case 'attacker': return 0;
    case 'support':  return 2;
    case 'adaptive': return G.lives<=12 ? 0 : 1;
    default:         return 1;
  }
}
function aiParams(){
  const w = G.wave, lives = G.lives;
  switch(G.persKey){
    case 'attacker': return { minUnits:9, gambleGold:110, mergeAt:13, repos:false };
    case 'saver':    return { minUnits:5, gambleGold:400, gambleFloor:150, mergeAt:5, repos:false, saver:true };
    case 'merger':   return { minUnits:12, gambleGold:500, mergeAt:0, repos:false };
    case 'support':  return { minUnits:8, gambleGold:300, mergeAt:14, repos:true, cover:true };
    case 'adaptive':
      if(lives<=12) return { minUnits:6, gambleGold:99999, mergeAt:6, repos:true, saver:true };
      if(w<4) return { minUnits:9, gambleGold:130, mergeAt:13, repos:false };
      return { minUnits:8, gambleGold:220, mergeAt:14, repos:true };
    default:         return { minUnits:7, gambleGold:220, mergeAt:14, repos:false };
  }
}
function aiRepos(){
  const S = G.sides[1];
  // 근접은 전열(0~5), 원거리·마법은 중열(6~11)로
  const meleeNotFront = S.units.filter(u=>u.def.kind==='melee' && u.row!==0);
  const rangedFront = S.units.filter(u=>u.def.kind!=='melee' && u.row===0);
  if(meleeNotFront.length && rangedFront.length){ moveUnit(1, meleeNotFront[0].tile, rangedFront[0].tile); return; }
  const frontFree = []; for(let i=0;i<TILE_SECTORS;i++) if(!sideUnitAt(1,i)) frontFree.push(i);
  if(meleeNotFront.length && frontFree.length){ moveUnit(1, meleeNotFront[0].tile, frontFree[0]); return; }
  const midFree = []; for(let i=TILE_SECTORS;i<TILE_SECTORS*2;i++) if(!sideUnitAt(1,i)) midFree.push(i);
  if(rangedFront.length && midFree.length){ moveUnit(1, rangedFront[0].tile, midFree[0]); }
}
function aiTick(){
  if(!AI.alive || G.phase!=='play' || G.paused) return;
  const S = G.sides[1]; const P = aiParams();
  if(findTriple(1) && S.units.length >= (P.mergeAt||0)){
    const d = doMerge(1);
    if(d){ if(d.tier>=4) aiSay('rare'); else aiSay('merge'); }
    return;
  }
  const spawnOk = (S.spawnFails||0) < 3;
  const gambleOk = spawnOk && S.gold >= Math.max(GAMBLE_COST, P.gambleGold) && (!P.gambleFloor || S.gold >= P.gambleFloor + GAMBLE_COST);
  if(gambleOk && freeTiles(1).length){
    const res = doGamble(1);
    if(res && !res.spawnFail){ if(res.tier===0) aiSay('gambleLose'); else if(res.tier>=4) aiSay('rare'); else aiSay('gambleWin'); }
    return;
  }
  const saverBlocked = P.saver && S.gold < (P.gambleGold||0) && S.units.length >= P.minUnits;
  if(spawnOk && S.units.length < P.minUnits && S.gold >= summonCost(1) && freeTiles(1).length && !saverBlocked){
    const d = doSummon(1); if(d) aiSay('summon'); return;
  }
  if(spawnOk && S.gold > summonCost(1)*4 && freeTiles(1).length && !P.saver){ doSummon(1); return; }
  if(P.repos){ AI.reposT++; if(AI.reposT>=8){ AI.reposT=0; aiRepos(); } }
}

// ---------- HUD ----------
function updateHUD(){
  $('gold').textContent = Math.floor(G.sides[-1].gold);
  $('lives').textContent = Math.max(0, G.lives);
  $('summon-cost').textContent = summonCost(-1);
  $('gamble-cost').textContent = GAMBLE_COST;
  if(!waveActive){
    if(prepPending) $('wave-banner').textContent = `정비 중… ${Math.ceil(prepT)}초 후 웨이브 ${G.wave+1}`;
    else $('wave-banner').textContent = G.wave===0 ? '준비 중 — 첫 웨이브는 직접 시작' : `웨이브 ${G.wave} 클리어`;
  }
  else $('wave-banner').textContent = `웨이브 ${G.wave}${waveSpec(G.wave).boss?' — 보스!':''} · 남은 적 ${G.enemies.length + spawnQueue.length}`;
  $('ai-state').textContent = `골드 ${Math.floor(G.sides[1].gold)} · 유닛 ${G.sides[1].units.length}`;
  $('btn-summon').disabled = G.sides[-1].gold < summonCost(-1) || !freeTiles(-1).length || G.phase!=='play';
  $('btn-gamble').disabled = G.sides[-1].gold < GAMBLE_COST || !freeTiles(-1).length || G.phase!=='play';
  const triple = findTriple(-1);
  $('btn-merge').disabled = !triple || G.phase!=='play';
  $('merge-hint').textContent = triple ? `${triple[0].def.name} ×3 가능!` : '같은 유닛 3기';
  if(waveActive){ $('btn-wave').textContent = `웨이브 ${G.wave} 진행 중… (남은 적 ${G.enemies.length + spawnQueue.length})`; }
  else if(prepPending){ $('btn-wave').textContent = `즉시 시작 (${Math.ceil(prepT)}s)`; }
  else { $('btn-wave').textContent = `웨이브 ${G.wave+1} 시작`; }
  $('btn-wave').disabled = waveActive || G.phase!=='play';
}

// ---------- 기록 ----------
function loadRecords(){ try{ return JSON.parse(localStorage.getItem('fd_records_v1')) || { best:0, games:0, per:{} }; }catch(e){ return { best:0, games:0, per:{} }; } }
function saveRecords(){
  const r = loadRecords();
  if(G.wave>0){ r.best = Math.max(r.best, G.wave); r.per[G.persKey] = Math.max(r.per[G.persKey]||0, G.wave); }
  localStorage.setItem('fd_records_v1', JSON.stringify(r));
}
function showRecords(){
  const r = loadRecords();
  $('records').innerHTML = r.games>0
    ? `최고 기록: <b>웨이브 ${r.best}</b> · 총 ${r.games}게임` + Object.entries(r.per).map(([k,v])=>`<br>${PERSONALITIES[k]?.name||k}: 웨이브 ${v}`).join('')
    : '아직 기록이 없습니다. 첫 게임을 시작해 보세요!';
}

// ---------- 게임 오버 ----------
function gameOver(){
  G.phase='over';
  const r = loadRecords(); r.games++; localStorage.setItem('fd_records_v1', JSON.stringify(r));
  saveRecords();
  AudioMan.play('defeat', 0.9); AudioMan.bgmStop();
  $('over-title').textContent = '성문이 함락됐습니다';
  $('over-sub').textContent = `${PERSONALITIES[G.persKey].name}와 함께 웨이브 ${G.wave}까지 방어`;
  $('over-stats').innerHTML = `<div>도달 웨이브<b>${G.wave}</b></div><div>처치 수<b>${G.kills}</b></div><div>획득 골드<b>${G.goldEarned}</b></div><div>최고 기록<b>${loadRecords().best}</b></div>`;
  $('over').style.display='flex'; updateHUD();
}

// ---------- 입력 ----------
const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
let selTile = -1;
function onTap(ev){
  if(G.phase!=='play' || G.paused) return;
  ptr.x = (ev.clientX/innerWidth)*2-1; ptr.y = -(ev.clientY/innerHeight)*2+1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(tileMeshes[-1]);
  if(!hits.length){ selTile=-1; $('sel-info').style.display='none'; return; }
  const idx = hits[0].object.userData.idx;
  const u = sideUnitAt(-1, idx);
  if(selTile>=0 && selTile!==idx){ moveUnit(-1, selTile, idx); flashTile(-1, idx, 0x8fd3ff); selTile=-1; $('sel-info').style.display='none'; return; }
  if(u){
    selTile = idx; flashTile(-1, idx, 0xffd766);
    const d = u.def;
    const row = Math.floor(u.tile / TILE_SECTORS);
    const rowTxt = row===0 ? '전열 · 담당 구역 집중 +25%' : row===1 ? '중열 · 균형' : '후열 · 3구역 커버 · 사거리 +50% · 공격 -15%';
    $('sel-info').innerHTML = `<b style="color:#${TIER_COLORS[d.tier-1].toString(16)}">[${TIER_NAMES[d.tier-1]}] ${d.name}</b> <span style="opacity:.8">(${ROW_NAMES[row]})</span><br>공격력 ${d.dmg} · 사거리 ${d.range} · 속도 ${d.interval}s${d.splash?` · 범위 ${d.splash}`:''}${d.slow?' · 둔화':''}${d.crit?' · 치명타':''}${d.aoe?' · 전체공격':''}<br><span style="opacity:.7">${rowTxt}<br>다른 타일을 누르면 이동/교환${d.kind==='melee'?' · 근접은 전열 전용':''}</span>`;
    $('sel-info').style.display='block';
  } else selTile=-1;
}
canvas.addEventListener('pointerdown', onTap);

// ---------- 버튼 ----------
$('btn-summon').onclick = ()=>{ AudioMan.resume(); const d = doSummon(-1); if(!d) AudioMan.play('gamble_fail',0.4); };
$('btn-gamble').onclick = ()=>{
  AudioMan.resume();
  const S = G.sides[-1];
  if(S.gold < GAMBLE_COST || !freeTiles(-1).length){ AudioMan.play('gamble_fail',0.4); return; }
  S.gold -= GAMBLE_COST; updateHUD();
  $('gamble').style.display='flex'; $('gamble-result').textContent='두근두근...'; $('gamble-result').style.color='#fff';
  AudioMan.play('gamble', 0.9);
  const faces=UNITS.map(u=>u.name); let ticks=0;
  const roll = setInterval(()=>{ $('slot').textContent = pick(faces); AudioMan.play('click',0.25,1.4); if(++ticks>=9){
    clearInterval(roll);
    const res = rollGamble();
    if(res.tier===0){ $('slot').textContent='꽝'; $('gamble-result').textContent='꽝! 골드만 날아갔습니다...'; $('gamble-result').style.color='#ff8a8a'; AudioMan.play('gamble_fail',0.8); }
    else { const def = pick(UNITS_BY_TIER[res.tier]); const tile = chooseTile(-1, def); const u = (MODELS['u_'+def.id] && tile>=0) ? spawnUnit(-1, def, tile) : null;
      if(!u){ G.sides[-1].gold += GAMBLE_COST; $('slot').textContent='실패'; $('gamble-result').textContent = tile<0 ? '전열이 가득 차 배치할 수 없어 골드를 환불했습니다.' : '모델 로드 실패로 골드를 환불했습니다.'; $('gamble-result').style.color='#ff8a8a'; }
      else { $('slot').textContent='성공!'; $('gamble-result').textContent=`[${TIER_NAMES[res.tier-1]}] ${def.name} 획득!`; $('gamble-result').style.color='#ffd766';
      AudioMan.play(res.tier>=4?'gamble_win':'waveclear', 0.9); } }
    setTimeout(()=>{ $('gamble').style.display='none'; updateHUD(); }, 1400);
  }}, 110);
};
$('btn-merge').onclick = ()=>{ AudioMan.resume(); const d = doMerge(-1); if(d) log(`합성 성공! [${TIER_NAMES[d.tier-1]}] ${d.name}`, 'sys'); };
$('btn-wave').onclick = ()=>{ AudioMan.resume(); AudioMan.play('click',0.5); startWave(); };
$('btn-sound').onclick = ()=>{ AudioMan.resume(); AudioMan.toggle(); };
if($('btn-speed')) $('btn-speed').onclick = ()=>{ AudioMan.resume(); G.speed = G.speed===1?2:1; $('btn-speed').textContent = G.speed+'x'; AudioMan.play('click',0.5); };
$('btn-pause').onclick = ()=>{
  if(G.phase!=='play') return;
  G.paused = !G.paused; $('btn-pause').textContent = G.paused?'재생':'정지';
  if(G.paused){ AudioMan.bgmStop(); log('일시정지', 'sys'); } else { AudioMan.bgmStart(); log('재개', 'sys'); }
};
$('btn-retry').onclick = ()=>location.reload();
$('btn-sound').textContent = AudioMan.enabled?'소리':'음소거';

// ---------- 시작 화면 ----------
let selPers = 'random';
(function buildPersGrid(){
  const grid = $('pers-grid');
  for(const [k,p] of Object.entries(PERSONALITIES)){
    const b = document.createElement('button');
    b.innerHTML = `${p.icon} ${p.name}<span>${p.desc}</span>`;
    if(k===selPers) b.classList.add('sel');
    b.onclick = ()=>{ selPers=k; grid.querySelectorAll('button').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); AudioMan.resume(); AudioMan.play('click',0.5); };
    grid.appendChild(b);
  }
})();
$('btn-start').onclick = ()=>{
  AudioMan.resume();
  G.persKey = selPers==='random' ? pick(['balanced','attacker','saver','merger','support','adaptive']) : selPers;
  $('ai-name').textContent = PERSONALITIES[G.persKey].name;
  $('start').style.display='none';
  G.phase='play'; AI.alive=true;
  AudioMan.bgmStart();
  log(`${PERSONALITIES[G.persKey].name} 파트너가 합류했습니다!`, 'sys');
  aiSay('start');
  updateHUD();
};

// ---------- 오토 테스트 모드 ----------
let autoT = 0;
function autoTick(dt){
  autoT += dt; if(autoT < 1.0) return; autoT = 0;
  const S = G.sides[-1];
  if(!waveActive && G.phase==='play'){ startWave(); return; }
  if(findTriple(-1)){ doMerge(-1); return; }
  if((S.spawnFails||0) >= 3) return;
  if(S.gold >= summonCost(-1) && freeTiles(-1).length){ doSummon(-1); return; }
  if(S.gold > GAMBLE_COST*2 && rnd()<0.3){ doGamble(-1); }
}

// ---------- 메인 루프 ----------
const clock = new THREE.Clock();
let aiAccum = 0;
let lastTickAt = 0;
function tick(forceDt){
  lastTickAt = performance.now();
  const raw = forceDt!=null ? forceDt : Math.min(0.06, clock.getDelta());
  const dt = raw * SPEED * G.speed;
  if(G.phase==='play' && !G.paused){
    if(prepPending){ prepT -= dt; if(prepT<=0){ prepPending=false; prepT=0; startWave(); } }
    if(spawnQueue.length){ spawnT -= dt; if(spawnT<=0){ const s=spawnQueue.shift(); spawnEnemy(s.spec, G.wave, s.boss); spawnT = s.boss?1.2:0.30; } }
    updateEnemies(dt); updateUnits(dt); updateProjectiles(dt);
    aiAccum += dt; if(aiAccum>=1.0){ aiAccum=0; aiTick(); }
    if(AUTO) autoTick(dt);
    if(waveActive || prepPending) updateHUD();
  }
  for(const fx of fxPool){ if(!fx.active) continue; fx.t += raw;
    const pos = fx.pts.geometry.attributes.position.array;
    for(let i=0;i<fx.n;i++){ pos[i*3]+=fx.vel[i*3]*raw; pos[i*3+1]+=fx.vel[i*3+1]*raw; pos[i*3+2]+=fx.vel[i*3+2]*raw; fx.vel[i*3+1]-=4*raw; }
    fx.pts.geometry.attributes.position.needsUpdate=true;
    fx.pts.material.opacity = 1 - fx.t/0.5;
    if(fx.t>0.5){ fx.active=false; fx.pts.visible=false; } }
  for(const r of ringPool){ if(!r.active) continue; r.t+=raw; const k=r.t/0.55; r.m.scale.setScalar(1+k*2.6); r.m.material.opacity=0.9*(1-k); if(k>=1){ r.active=false; r.m.visible=false; } }
  for(const b of beamPool){ if(!b.active) continue; b.t+=raw; b.m.material.opacity=0.7*(1-b.t/0.6); b.m.rotation.y+=raw*6; if(b.t>0.6){ b.active=false; b.m.visible=false; } }
  for(const d of dmgPool){ if(!d.active) continue; d.t+=raw; d.sp.position.y += raw*1.6; d.sp.material.opacity = 1-d.t/0.85; if(d.t>0.85){ d.active=false; d.sp.visible=false; } }
  renderer.render(scene, camera);
}

// ---------- 부팅 ----------
(async function boot(){
  const bar = document.querySelector('#loadbar i');
  buildArena(); buildTiles();
  await AudioMan.init().catch(()=>{});
  await loadModels(p=>{ bar.style.width = Math.round(p*100)+'%'; $('loadtext').textContent = `에셋 불러오는 중... ${Math.round(p*100)}%`; });
  buildArena2();
  $('loading').style.display='none';
  if(AUTO){
    G.persKey = Q.get('pers') || 'balanced';
    $('ai-name').textContent = PERSONALITIES[G.persKey].name;
    $('start').style.display='none'; G.phase='play'; AI.alive=true;
  } else { showRecords(); $('start').style.display='flex'; }
  window.__game = { G, startWave, doSummon, doGamble, doMerge, spawnUnit, moveUnit, UNITS, tilePos, trackTheta, trackPoint, camera, THREE, tick, enemyZone, unitZones, sectorFull, dmgMul, get prep(){ return { pending: prepPending, t: prepT }; } };
  function loop(){ requestAnimationFrame(loop); tick(); }
  setInterval(()=>{ if(performance.now()-lastTickAt > 200) tick(); }, 200);
  loop();
})();

