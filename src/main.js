// ===== 포춘 듀오 main.js — 원형 공동방어 트랙 · 구역제 3열 대형 =====
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/SkeletonUtils.js';
import { TIER_NAMES, TIER_COLORS, UNITS, UNITS_BY_TIER, ATTACK_ANIMS, GAMBLE_TABLE,
         MONSTERS, BOSSES, waveSpec, PERSONALITIES, AI_LINES,
         SUMMON_BASE, SUMMON_STEP, GAMBLE_COST, START_GOLD, START_LIVES, CHALLENGES } from './data.js?v=r33';

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
    const dist = Math.hypot(30, 37.3);
    const tanV = needHalf / (dist * aspect);
    camera.fov = Math.min(75, Math.max(50, 2*Math.atan(tanV)*180/Math.PI));
    camera.position.set(0, 30, 39.5);
  } else {
    const small = innerWidth < 760;
    camera.fov = 44;
    camera.position.set(0, small?32:29.5, small?36:20.5);
  }
  camera.updateProjectionMatrix();
  camera.lookAt(0,0,2.2);
  camBase = camera.position.clone();
}
let camBase = null, shakeT = 0; const SHAKE_DUR = 0.5;
function shake(d=SHAKE_DUR){ shakeT = Math.max(shakeT, d); }
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
const ROW_RADII = [R+1.8, R+3.0, R+4.6];
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
function zoneCenter(z){ const a = (z*30+15)*Math.PI/180; return { x: Math.sin(a)*R, z: Math.cos(a)*R }; }
function effRangeOf(u){ return u.def.range * (u.row===2 ? 1.5 : 1); }
// 구역 커버: 해당 구역을 담당하고 실제 사거리가 닿는 유닛이 양 진영 중 하나라도 있으면 true
function zoneCovered(zone){
  const c = zoneCenter(zone);
  for(const s of [-1,1]) for(const u of G.sides[s].units){
    if(!unitZones(u).includes(zone)) continue;
    if(Math.hypot(u.group.position.x-c.x, u.group.position.z-c.z) <= effRangeOf(u)+2.4) return true;
  }
  return false;
}
// 위험 구역: 적이 지나는 중인데 커버 유닛이 없음
function dangerZoneSet(){
  const dz = new Set();
  for(const e of G.enemies){ if(e.dead) continue; const z = enemyZone(e); if(!zoneCovered(z)) dz.add(z); }
  return dz;
}
// AI 우선 보강 구역 = 위험 구역 ∪ 플레이어 핑
function aiPriorityZones(){
  const dz = dangerZoneSet();
  for(const z of G.pings) dz.add(z);
  return dz;
}
// 플레이어 구역 핑 토글: 지원파·적응파 AI가 우선 대응
function togglePing(z){
  if(G.phase!=='play') return;
  AudioMan.resume();
  if(G.pings.has(z)){ G.pings.delete(z); G.pingSrc.delete(z); log('구역 핑을 해제했습니다.', 'sys'); AudioMan.play('click', 0.4); }
  else {
    const name = (ZONE_TRAVEL.find(([zz])=>zz===z)||[])[1] || ('구역'+(z+1));
    // 이미 커버됐고 적도 없는 구역은 핑이 즉시 자동 해제되므로, 조용한 무반응 대신 사유를 알림
    const enemyHere = G.enemies.some(e=>!e.dead && enemyZone(e)===z);
    if(!enemyHere && zoneCovered(z)){ log(`${name} 구역은 이미 안전하게 커버되고 있어 핑이 필요 없습니다.`, 'sys'); AudioMan.play('gamble_fail', 0.3); updateZoneStrip(); return; }
    G.pings.add(z); G.pingSrc.set(z, 'user'); AudioMan.play('click', 0.6, 1.3);
    log(`${name} 구역에 핑! AI 파트너가 그 구역 보강을 우선합니다.`, 'sys');
    if(AI.alive) aiSay('ping');
  }
  updateZoneStrip();
}
// 배치 우선순위 구역: 플레이어·지원파·적응파는 핑 포함, 그 외 AI는 위험 구역만
function pickPriorityZones(side){
  if(side<0 || G.persKey==='support' || G.persKey==='adaptive') return aiPriorityZones();
  return dangerZoneSet();
}
// 진행 순서(성문 다음부터): N1..N3, S1..S6, N4..N6
const ZONE_TRAVEL = [[5,'N1'],[4,'N2'],[3,'N3'],[2,'S1'],[1,'S2'],[0,'S3'],[11,'S4'],[10,'S5'],[9,'S6'],[8,'N4'],[7,'N5'],[6,'N6']];
function updateZoneStrip(){
  const el = $('zone-strip'); if(!el) return;
  if(!el.children.length){
    for(const [z,name] of ZONE_TRAVEL){
      const i = document.createElement('i'); i.title = name+' 구역 — 눌러서 보강 핑';
      i.addEventListener('pointerdown', ev=>{ ev.preventDefault(); togglePing(z); });
      el.appendChild(i);
    }
  }
  const enemyZones = new Set(); for(const e of G.enemies){ if(!e.dead) enemyZones.add(enemyZone(e)); }
  // 핑 자동 해제: 커버가 확보되고 적도 없으면 조용히 해제
  for(const z of [...G.pings]){ if(!enemyZones.has(z) && zoneCovered(z)){ G.pings.delete(z); G.pingSrc.delete(z); } }
  // 구역 완성(전·중·후열 충족) 타일 강조
  for(const side of [-1,1]) for(let sec=0; sec<TILE_SECTORS; sec++){
    const full = sectorFull(side, sec);
    for(let row=0; row<TILE_ROWS; row++){
      const m = tileMeshes[side][row*TILE_SECTORS+sec]; if(!m) continue;
      const want = full ? 0.92 : 0.6;
      if(m.material.opacity !== want) m.material.opacity = want;
    }
  }
  ZONE_TRAVEL.forEach(([z], k)=>{
    const dot = el.children[k];
    let cls = enemyZones.has(z) ? (zoneCovered(z) ? 'cov' : 'danger') : '';
    if(G.pings.has(z)) cls = (cls ? cls+' ' : '') + (G.pingSrc.get(z)==='ai' ? 'asked' : 'pinged');
    dot.className = cls;
  });
}
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
  const rowCol = { [-1]:[0x3f7fff, 0x2fbf8f, 0xb07fe8], [1]:[0xff8f5f, 0xe8c05f, 0xe86a8a] }; // 전열/중열/후열 색 구분
  for (const s of [-1,1]) for (let i=0;i<TILES_PER_SIDE;i++){
    const p = tilePos(s,i);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: rowCol[s][p.row], transparent:true, opacity:0.6 }));
    m.position.set(p.x, 0.08, p.z); m.userData = { side:s, idx:i, baseColor: rowCol[s][p.row] };
    scene.add(m); tileMeshes[s].push(m);
  }
}
function flashTile(side, idx, color){ const m = tileMeshes[side][idx]; if(!m) return; m.material.color.setHex(color); setTimeout(()=>m.material.color.setHex(m.userData.baseColor), 450); }

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

// ---------- 데미지 숫자/이펙트 묶기 (고밀도·2x 가독성) ----------
// 적 1기당 0.45초(실시간) 창으로 피해를 합산해 숫자 1개로 표시. 처치·골드 숫자는 그대로.
const dmgAgg = new Map(); // enemy -> {sum, crit, t}
const DMG_WINDOW = 0.45, BURST_WINDOW = 0.30, BURST_FX_CAP = 22;
let rawClock = 0;
const burstLast = new Map();
function dmgNumBatched(e, dmg, crit){
  let a = dmgAgg.get(e);
  if(!a){ a = {sum:0, crit:false, t:0}; dmgAgg.set(e, a); }
  a.sum += dmg; a.crit = a.crit || crit;
}
function flushDmgAgg(e){
  const a = dmgAgg.get(e); if(!a) return;
  dmgAgg.delete(e);
  if(a.sum <= 0) return;
  G.dbg.dmgShown++;
  dmgNum(e.group.position.x, e.group.position.y + (e.boss?3.6:1.9), e.group.position.z, String(Math.round(a.sum)), a.crit?'#ffd23e':'#ffffff', a.crit);
}
function burstCombat(x, y, z, color, spread, tgt){
  const last = burstLast.get(tgt) || -9;
  if(rawClock - last < BURST_WINDOW){ G.dbg.burstSkipped++; return; }
  if(fxPool.reduce((n,f)=>n+(f.active?1:0), 0) >= BURST_FX_CAP){ G.dbg.burstSkipped++; return; }
  burstLast.set(tgt, rawClock); G.dbg.burstShown++;
  burst(x, y, z, color, spread);
}

// ---------- 게임 상태 ----------
// ---------- 메타 진행(영구 성장) ----------
const META_KEY = 'fd_meta_v1';
const UPG_DEFS = {
  gold: { name:'시작 골드', desc:'양쪽 진영 시작 골드 +10', max:5 },
  lives:{ name:'공유 생명', desc:'시작 공유 생명 +2', max:5 },
  dmg:  { name:'유닛 공격력', desc:'양쪽 진영 피해 +3%', max:5 },
  econ: { name:'킬 골드', desc:'처치 골드 +5%', max:5 },
};
const UPG_COST = l => [5,8,12,17,23][l] ?? 0;
// ---------- 특화: 판마다 1개 장착하는 영구 개방 선택지 ----------
const SPEC_DEFS = {
  breakthrough: { name:'돌파 특화', desc:'합성으로 만든 유닛 피해 +10%', cost:40 },
  guardian:     { name:'수호 특화', desc:'매 판 첫 침투 3회 생명 무손실 (보스 제외)', cost:40 },
  fortune:      { name:'행운 특화', desc:'양쪽 첫 행운 소환 무료 + 상위 등급 확률 상승', cost:40 },
};
// ---------- 축복: 다음 판 1회성 소모품 (영구 강화 아님, 명시적 구매) ----------
const BLESS_DEFS = {
  vitality:   { name:'수호 축복', desc:'다음 판 시작 공유 생명 +5 (1회성)', cost:20 },
  prosperity: { name:'여유 축복', desc:'다음 판 양쪽 진영 시작 골드 +40 (1회성)', cost:15 },
};
function applyPendingBlessings(){
  const bl = Array.isArray(META.pendingBless)?META.pendingBless:[];
  G.bless = null;
  if(!bl.length) return;
  for(const k of bl){
    if(k==='vitality') G.lives += 5;
    if(k==='prosperity'){ G.sides[-1].gold += 40; G.sides[1].gold += 40; }
  }
  G.bless = bl;
  log(`축복 발동: ${bl.map(k=>BLESS_DEFS[k]?BLESS_DEFS[k].name:k).join('·')} — 이번 판만 적용`, 'sys');
}
function zeroUpg(){ return { gold:0, lives:0, dmg:0, econ:0 }; }
function defaultMeta(){ return { v:1, gems:0, upg:zeroUpg(), lastAward:null, specs:{ unlock:{breakthrough:false,guardian:false,fortune:false}, equipped:null }, mastery:{}, pendingBless:[] }; }
function normalizeMeta(mm){
  if(!mm || mm.v!==1 || typeof mm.gems!=='number' || !(mm.gems>=0) || !mm.upg) return null;
  for(const k of Object.keys(UPG_DEFS)){ const v = mm.upg[k]; mm.upg[k] = Number.isInteger(v) ? Math.min(Math.max(v,0), UPG_DEFS[k].max) : 0; }
  mm.lastAward = typeof mm.lastAward==='string' ? mm.lastAward : null;
  const sp = (mm.specs && typeof mm.specs==='object') ? mm.specs : {};
  mm.specs = { unlock:{}, equipped:null };
  for(const k of Object.keys(SPEC_DEFS)) mm.specs.unlock[k] = !!(sp.unlock && sp.unlock[k]===true);
  if(typeof sp.equipped==='string' && SPEC_DEFS[sp.equipped] && mm.specs.unlock[sp.equipped]) mm.specs.equipped = sp.equipped;
  mm.mastery = (mm.mastery && typeof mm.mastery==='object' && !Array.isArray(mm.mastery)) ? mm.mastery : {};
  mm.pendingBless = Array.isArray(mm.pendingBless) ? mm.pendingBless.filter(k=>k==='vitality'||k==='prosperity') : [];
  return mm;
}
function loadMeta(){
  try{ return normalizeMeta(JSON.parse(localStorage.getItem(META_KEY))) || defaultMeta(); }
  catch(e){ return defaultMeta(); }
}
const META = loadMeta();
function saveMeta(){ try{ localStorage.setItem(META_KEY, JSON.stringify(META)); }catch(e){} }
// ---------- 보상 내구성: 지급 대기 저널 (크래시·새로고침 후에도 정확히 한 번 지급) ----------
const AWARD_KEY = 'fd_award_v1';
function newRunId(){ return 'r'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }
function mergeBadges(list){
  if(!Array.isArray(list)) return;
  META.mastery = META.mastery || {};
  for(const b of list){
    if(!Array.isArray(b)) continue;
    const k=b[0], m=b[1];
    if(k==='trio'){ META.mastery.trio = true; continue; }
    if(!CHALLENGES[k]) continue;
    META.mastery[k] = Array.isArray(META.mastery[k]) ? META.mastery[k] : [];
    if(!META.mastery[k].includes(m)) META.mastery[k].push(m);
  }
}
function recoverAward(){
  try{
    const j = JSON.parse(localStorage.getItem(AWARD_KEY));
    if(!j || typeof j.runId!=='string' || !Number.isInteger(j.gems) || j.gems<0){ localStorage.removeItem(AWARD_KEY); return null; }
    // 같은 런의 클리어-지점 스냅샷이 남아 있다면 함께 제거 (지급 완료된 런의 재이어하기·중복 지급 방지)
    try{ const s0 = JSON.parse(localStorage.getItem(RUN_KEY)); if(s0 && s0.runId === j.runId) localStorage.removeItem(RUN_KEY); }catch(e0){}
    if(META.lastAward === j.runId){ localStorage.removeItem(AWARD_KEY); return null; }
    mergeBadges(Array.isArray(j.badges)?j.badges:[]); META.gems += j.gems; META.lastAward = j.runId; saveMeta();
    localStorage.removeItem(AWARD_KEY);
    return j.gems;
  }catch(e){ try{ localStorage.removeItem(AWARD_KEY); }catch(e2){} return null; }
}
let RECOVERED_GEMS = null;
function renderMetaShop(){
  const el = $('meta-shop'); if(!el) return;
  let html = `<div class="meta-head">💎 보유 젬 <b>${META.gems}</b><span style="opacity:.7;font-size:12px"> — 웨이브 클리어·보스 처치로 획득, 다음 판부터 영구 적용</span></div>`;
  if(RECOVERED_GEMS){ html += `<div class="meta-head" style="color:var(--gold);font-size:13px;margin-top:4px">지난 판 보상 +${RECOVERED_GEMS}💎이 안전하게 복구됐습니다</div>`; RECOVERED_GEMS = 0; }
  for(const [k,d] of Object.entries(UPG_DEFS)){
    const lv = META.upg[k], maxed = lv>=d.max, cost = maxed?0:UPG_COST(lv);
    html += `<div class="upg-row"><div class="upg-info"><b>${d.name}</b> <span class="pips">${'●'.repeat(lv)}${'○'.repeat(d.max-lv)}</span><br><span class="upg-desc">${d.desc}</span></div><button class="upg-buy" data-k="${k}" ${maxed||META.gems<cost?'disabled':''}>${maxed?'MAX':`강화 ${cost}💎`}</button></div>`;
  }
  html += `<div class="meta-head" style="margin-top:10px">🙏 축복 <span style="opacity:.7;font-size:12px"> — 다음 판에만 1회 적용, 구매 즉시 예약</span></div>`;
  for(const [k,d] of Object.entries(BLESS_DEFS)){
    const pend = (META.pendingBless||[]).includes(k);
    const btn = pend ? `<button class="upg-buy" disabled>예약됨</button>`
                     : `<button class="upg-buy bless-buy" data-k="${k}" ${META.gems<d.cost?'disabled':''}>구매 ${d.cost}💎</button>`;
    html += `<div class="upg-row"><div class="upg-info"><b>${d.name}</b>${pend?' <span style="color:var(--gold)">다음 판 적용</span>':''}<br><span class="upg-desc">${d.desc}</span></div>${btn}</div>`;
  }
  html += `<div class="meta-head" style="margin-top:10px">⭐ 특화 <span style="opacity:.7;font-size:12px"> — 영구 개방 후 판마다 1개 장착</span></div>`;
  for(const [k,d] of Object.entries(SPEC_DEFS)){
    const owned = META.specs.unlock[k], eq = META.specs.equipped===k;
    const btn = owned ? `<button class="upg-buy spec-eq" data-k="${k}">${eq?'장착 해제':'장착'}</button>`
                      : `<button class="upg-buy spec-buy" data-k="${k}" ${META.gems<d.cost?'disabled':''}>개방 ${d.cost}💎</button>`;
    html += `<div class="upg-row${eq?' spec-on':''}"><div class="upg-info"><b>${d.name}</b>${eq?' <span style="color:var(--gold)">장착 중</span>':''}<br><span class="upg-desc">${d.desc}</span></div>${btn}</div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.bless-buy').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k, d=BLESS_DEFS[k];
    META.pendingBless = Array.isArray(META.pendingBless)?META.pendingBless:[];
    if(META.pendingBless.includes(k) || META.gems<d.cost) return;
    META.gems-=d.cost; META.pendingBless.push(k); saveMeta();
    AudioMan.resume(); AudioMan.play('gamble_win',0.6);
    log(`${d.name} 예약 — 다음 판 시작 시 1회 적용`, 'sys');
    renderMetaShop();
  });
  el.querySelectorAll('.spec-buy').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k, d=SPEC_DEFS[k];
    if(META.specs.unlock[k] || META.gems<d.cost) return;
    META.gems-=d.cost; META.specs.unlock[k]=true; META.specs.equipped=k; saveMeta();
    AudioMan.resume(); AudioMan.play('gamble_win',0.6);
    renderMetaShop();
  });
  el.querySelectorAll('.spec-eq').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k;
    if(!META.specs.unlock[k]) return;
    META.specs.equipped = META.specs.equipped===k ? null : k; saveMeta();
    AudioMan.resume(); AudioMan.play('click',0.5);
    renderMetaShop();
  });
  el.querySelectorAll('.upg-buy:not(.spec-buy):not(.spec-eq):not(.bless-buy)').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k, lv=META.upg[k], cost=UPG_COST(lv);
    if(lv>=UPG_DEFS[k].max || META.gems<cost) return;
    META.gems-=cost; META.upg[k]++; saveMeta();
    AudioMan.resume(); AudioMan.play('gamble_win',0.5);
    renderMetaShop();
  });
}
// 런 시작 시점의 강화 단계를 그 런에 고정 (도중 구매·이어하기와 무관하게 일관 적용)
function applyMetaToRun(upg){
  G.metaUpg = { ...zeroUpg(), ...(upg||{}) };
  G.lives = START_LIVES + 2*G.metaUpg.lives;
  for(const s of [-1,1]) G.sides[s].gold = START_GOLD + 10*G.metaUpg.gold;
  G.metaSpec = META.specs.equipped;
  G.leakShield = G.metaSpec==='guardian' ? 3 : 0;
  G.freeGamble = G.metaSpec==='fortune' ? { '-1':true, '1':true } : null;
}

const G = { phase:'boot', wave:0, ch:[], lives:START_LIVES, metaUpg:zeroUpg(), metaSpec:null, leakShield:0, freeGamble:null, bossKills:0, runId:null, leakLog:[], paused:false, speed:1, sides:{}, enemies:[], projectiles:[], kills:0, goldEarned:0, persKey:'balanced', pings:new Set(), pingSrc:new Map() };
function newSide(side){ return { side, gold:START_GOLD, carry:0, summons:0, units:[] }; }
G.sides[-1]=newSide(-1); G.sides[1]=newSide(1);
const summonCost = s => Math.round((SUMMON_BASE + G.sides[s].summons * SUMMON_STEP) * (G.ch.includes('drought')?1.5:1));

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
  const u = { uid:++unitSeq, side, def:unitDef, tile:tileIdx, group:inst.group, inner:inst.inner, anim, cool: 0.3+rnd()*0.5, row:p.row, sector:p.sector, zone:zoneOfTile(side, p.sector), lv:1, kills:0 };
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
    let front = free.filter(i => i < TILE_SECTORS);
    if(!front.length) return -1;
    const dz = pickPriorityZones(side);
    if(dz.size){ const cover = front.filter(i => dz.has(zoneOfTile(side, i % TILE_SECTORS))); if(cover.length) front = cover; }
    // 합성 장인 AI: 같은 유닛 재료가 있는 구역 우선 (재료 모으기가 분산 배치보다 우선)
    let sameApplied = false;
    if(side>0 && G.persKey==='merger'){
      const sameSecs = new Set(G.sides[1].units.filter(u=>u.def.id===def.id).map(u=>u.sector));
      if(sameSecs.size){ const same = front.filter(i => sameSecs.has(i % TILE_SECTORS)); if(same.length){ front = same; sameApplied = true; } }
    }
    const empt = sameApplied ? [] : front.filter(emptySector);
    return pick(empt.length ? empt : front);
  }
  const row = prefRow != null ? prefRow : (def.kind==='ranged' ? 2 : 1);
  let pool = free.filter(i => Math.floor(i/TILE_SECTORS) === row);
  if(!pool.length) pool = free;
  // 적이 지나는데 커버가 없는 위험 구역 담당 타일 우선 (AI의 약한 구역 보강, 핑 반영)
  const dz = pickPriorityZones(side);
  if(dz.size){ const cover = pool.filter(i => dz.has(zoneOfTile(side, i % TILE_SECTORS))); if(cover.length) pool = cover; }
  // 합성 장인 AI: 같은 유닛 재료가 있는 구역 우선 (재료 모으기가 분산 배치보다 우선)
  let sameApplied = false;
  if(side>0 && G.persKey==='merger'){
    const sameSecs = new Set(G.sides[1].units.filter(u=>u.def.id===def.id).map(u=>u.sector));
    if(sameSecs.size){ const same = pool.filter(i => sameSecs.has(i % TILE_SECTORS)); if(same.length){ pool = same; sameApplied = true; } }
  }
  const empt = sameApplied ? [] : pool.filter(emptySector);
  return pick(empt.length ? empt : pool);
}

// 배치 불가(전열 만석): 골드 차감 없이 실패 회계만
function placeFail(side, what){
  const S = G.sides[side];
  G.dbg.placeFailN = G.dbg.placeFailN||{}; G.dbg.placeFailN[side] = (G.dbg.placeFailN[side]||0)+1;
  // 배치 실패(전열 만석 등)는 일시적 상황이고 골드도 차감되지 않으므로 소환 잠금 카운터에 넣지 않는다
  // (잠금은 모델 누락 spawnFail 전용) - 전열이 차면 AI가 영구적으로 소환·도박을 멈추는 교착 방지
  if(side<0) log(`${what} 불가: 전열(가장 안쪽 줄)이 가득 차 근접 유닛을 배치할 수 없습니다. 합성으로 자리를 비우거나 전열 유닛을 옮겨 주세요.`, 'sys');
  updateHUD();
}

function spawnFail(side, what){
  const S = G.sides[side]; S.spawnFails = (S.spawnFails||0)+1;
  G.dbg.spawnFailN = G.dbg.spawnFailN||{}; G.dbg.spawnFailN[side] = (G.dbg.spawnFailN[side]||0)+1;
  if(S.spawnFails===1) log(`${what} 실패: 유닛 모델을 불러오지 못했습니다. 골드는 차감되지 않습니다.`, 'sys');
  updateHUD();
}
function doSummon(side){
  G.dbg.summonTry = G.dbg.summonTry||{}; G.dbg.summonTry[side] = (G.dbg.summonTry[side]||0)+1;
  const S = G.sides[side]; const cost = summonCost(side);
  if(S.gold < cost) return false;
  const free = freeTiles(side); if(!free.length) return false;
  let def = pick(UNITS_BY_TIER[1]);
  // 전열 만석 시 근접은 배치 불가: 비근접으로 전환해 빈 시도 반복(스핀) 방지
  if(def.kind==='melee' && !free.some(i=>i<TILE_SECTORS)){
    const nm = UNITS_BY_TIER[1].filter(d=>d.kind!=='melee');
    if(nm.length) def = pick(nm);
  }
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
const GAMBLE_TABLE_FORTUNE = [ { tier:0, p:0.07, label:'꽝' }, { tier:2, p:0.44 }, { tier:3, p:0.27 }, { tier:4, p:0.16 }, { tier:5, p:0.06 } ];
function rollGamble(table){ table = table || (G.metaSpec==='fortune' ? GAMBLE_TABLE_FORTUNE : GAMBLE_TABLE); let r=rnd(), acc=0; for(const g of table){ acc+=g.p; if(r<acc) return g; } return table[0]; }
function doGamble(side){
  const S = G.sides[side];
  const freeFirst = !!(G.freeGamble && G.freeGamble[side]);
  const cost = freeFirst ? 0 : GAMBLE_COST;
  if(S.gold < cost) return null;
  const free = freeTiles(side); if(!free.length) return null;
  if(freeFirst) G.freeGamble[side] = false;
  // 전열 만석 시 근접뿐인 등급(현재 t3)은 배치 불가 — 롤 대상에서 제외해 헛도는 도박(무료 꽝 스핀) 방지
  const frontFull = !free.some(i=>i<TILE_SECTORS);
  let gtable = G.metaSpec==='fortune' ? GAMBLE_TABLE_FORTUNE : GAMBLE_TABLE;
  if(frontFull) gtable = gtable.filter(g=>g.tier===0 || (UNITS_BY_TIER[g.tier]||[]).some(d=>d.kind!=='melee'));
  const res = rollGamble(gtable);
  AudioMan.play('gamble', side<0?0.9:0.4);
  if(res.tier===0){ S.gold -= cost; if(side<0) AudioMan.play('gamble_fail', 0.8); updateHUD(); return { tier:0 }; }
  let def = pick(UNITS_BY_TIER[res.tier]);
  if(def.kind==='melee' && !free.some(i=>i<TILE_SECTORS)){
    const nm = UNITS_BY_TIER[res.tier].filter(d=>d.kind!=='melee');
    if(nm.length) def = pick(nm);
  }
  if(!MODELS['u_'+def.id]){ spawnFail(side, '행운 소환'); return { tier:0, spawnFail:true }; }
  const tile = chooseTile(side, def, side>0 ? aiRowPref() : null);
  if(tile<0){ placeFail(side, '행운 소환'); return { tier:0, spawnFail:true }; }
  S.gold -= cost;
  const u = spawnUnit(side, def, tile);
  if(!u){ spawnFail(side, '행운 소환'); return { tier:0, spawnFail:true }; }
  S.spawnFails = 0;
  if(res.tier>=4) AudioMan.play('gamble_win', 0.9);
  updateHUD(); return { tier:res.tier, def };
}
function findTriple(side){
  const byId = {};
  for(const u of G.sides[side].units){ if(u.def.tier>=6) continue; (byId[u.def.id]=byId[u.def.id]||[]).push(u); }
  for(const id in byId) if(byId[id].length>=3) return byId[id].slice(0,3);
  return null;
}
function doMerge(side){
  const triple = findTriple(side); if(!triple) return null;
  const tier = triple[0].def.tier;
  const freed = triple.map(u=>u.tile);
  const inheritKills = Math.floor(triple.reduce((a,u)=>a+(u.kills||0),0)/3);
  triple.forEach(u=>{ burst(u.group.position.x, 1, u.group.position.z, 0xffd766); removeUnit(u); });
  const def = pick(UNITS_BY_TIER[tier+1]);
  if(!MODELS['u_'+def.id]){ log('합성 실패: 결과 유닛 모델을 불러오지 못했습니다. 유닛은 그대로 유지됩니다.', 'sys'); return null; }
  // 결과 유닛 종류에 맞는 열을 해방된 타일에서 우선 선택 (근접이 후열에 놓이는 것 방지)
  const wantRow = def.kind==='melee' ? 0 : def.kind==='ranged' ? 2 : 1;
  let tile = freed.find(t => Math.floor(t/TILE_SECTORS) === wantRow);
  if(tile==null) tile = chooseTile(side, def, side>0 ? aiRowPref() : null);
  if(tile==null || tile<0) tile = freed[1];
  const p = tilePos(side, tile);
  const mu = spawnUnit(side, def, tile);
  if(mu){ mu.merged = true; mu.kills = inheritKills; mu.lv = unitLevel(inheritKills); if(mu.lv>1){ mu.aura && mu.aura.scale.setScalar(1+0.04*mu.lv); } }
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
let prepBoss = false, bossWarned = false; // 보스 웨이브 예고
function spawnEnemy(spec, waveN, isBoss=false, tier=0){
  const key = 'm_'+spec.m;
  const h = isBoss ? 1.6*(spec.scale||2) : (1.15 + 0.13*Math.min(4,Math.ceil(waveN/3)));
  const inst = instantiate(key, h);
  if(!inst) return;
  scene.add(inst.group);
  const moveAnim = spec.fly ? ['Flying','Walk'] : ['Walk','Flying','Idle'];
  const anim = makeAnimator(inst, moveAnim);
  const maxHp = Math.round(Math.round(waveSpec(waveN).hpBase * (spec.hp||1)) * (G.ch.includes('iron')?1.3:1));
  G.dbg.hpSpawned = (G.dbg.hpSpawned||0) + maxHp;
  G.dbg.hpByWave = G.dbg.hpByWave || {}; G.dbg.hpByWave[waveN] = (G.dbg.hpByWave[waveN]||0) + maxHp;
  const radial = (rnd()-0.5)*0.9;
  const e = { group:inst.group, inner:inst.inner, anim, spec, hp:maxHp, maxHp, tier,
    t:0, speed:(spec.sp||1)*(0.92+rnd()*0.16)*(G.ch.includes('blitz')?1.25:1), slowT:0, slowF:1, dead:false, boss:isBoss,
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
  prepPending = false; prepT = 0; prepBoss = false; bossWarned = false;
  G.wave++;
  const spec = waveSpec(G.wave);
  waveSeed = G.wave * 1000 + seed;
  const wrnd = mulberry32(waveSeed);
  spawnQueue = [];
  if(spec.boss){
    const boss = BOSSES[Math.floor(wrnd()*BOSSES.length)];
    spawnQueue.push({ boss:true, spec:boss, t:0 });
    const escorts = 4 + Math.floor(G.wave/5);
    for(let i=0;i<escorts;i++){ const t2 = Math.min(4,spec.tierAvail); spawnQueue.push({ boss:false, spec:MONSTERS[t2][Math.floor(wrnd()*MONSTERS[t2].length)], t:t2 }); }
    $('boss-banner').textContent = '⚠ 보스 출현 ⚠';
    $('boss-banner').style.display='block'; setTimeout(()=>$('boss-banner').style.display='none', 3500);
    AudioMan.play('boss', 0.9);
    log(`웨이브 ${G.wave} — 보스 「${boss.name}」 출현!`, 'sys'); aiSay('boss'); shake(0.6);
  } else {
    for(let i=0;i<spec.count;i++){
      const t = 1 + Math.floor(wrnd()*spec.tierAvail);
      spawnQueue.push({ boss:false, spec:MONSTERS[t][Math.floor(wrnd()*MONSTERS[t].length)], t });
    }
    log(`웨이브 ${G.wave} 시작!`, 'sys');
  }
  if(G.wave>=10 && G.wave%10===0 && AI.alive) aiSay('milestone');
  spawnT = 0; waveActive = true;
  updateHUD();
}
const LOOP_TIME_BASE = 40; // 속도 1 기준 한 바퀴 초
// ---------- 유닛 성장 (정예 XP) ----------
const LV_XP = [0,0,5,12,22,35]; // 레벨 i 도달에 필요한 처치 수 (최대 Lv5, +8%/레벨)
const T6_OF = { assassin:'slayer', wizard:'archmage' };
function unitLevel(kills){ let lv=1; for(let i=2;i<LV_XP.length;i++){ if(kills>=LV_XP[i]) lv=i; } return lv; }
function checkLevelUp(u){
  const nl = unitLevel(u.kills||0);
  if(nl <= (u.lv||1)) return;
  u.lv = nl;
  if(u.aura) u.aura.scale.setScalar(1+0.04*nl);
  const p = u.group.position;
  burst(p.x, 1.0, p.z, 0x9fd4ff, 2.2);
  dmgNum(p.x, 2.6, p.z, 'Lv.'+nl+'!', '#9fd4ff', true);
  AudioMan.play('merge', u.side<0?0.5:0.25);
  if(u.side<0) log(`${u.def.name} Lv.${nl}로 성장 (공격 +${(nl-1)*8}%)`, 'sys');
  if(u.def.tier===5 && nl>=5) transcend(u);
  updateZoneStrip();
}
function transcend(u){
  const nid = T6_OF[u.def.id]; if(!nid) return;
  const nd = UNITS.find(d=>d.id===nid); if(!nd || !MODELS['u_'+nd.id]) return;
  u.def = nd; u.lv = 1; u.kills = 0;
  if(u.aura){ u.aura.material.color.set(TIER_COLORS[5]); u.aura.scale.setScalar(1.18); }
  const p = u.group.position;
  burst(p.x, 1.4, p.z, 0xf8f4ff, 4.0); ring(p.x, p.z, 0xf8f4ff);
  dmgNum(p.x, 3.0, p.z, '초월 각성!', '#f8f4ff', true);
  AudioMan.play('gamble_win', 0.9);
  log(`✨ 초월 각성! [${TIER_NAMES[5]}] ${nd.name} (최고 레벨 전설 유닛)`, 'sys');
  updateHUD(); updateZoneStrip();
}
function damageEnemy(e, dmg, creditSide, crit=false, slow=null, killer=null){
  if(e.dead) return;
  e.hp -= dmg;
  G.dbg.hits++;
  G.dmgDealt = (G.dmgDealt||0) + dmg;
  G.dbg.dmgSide = G.dbg.dmgSide || { '-1':0, '1':0 };
  G.dbg.dmgSide[String(creditSide)] = (G.dbg.dmgSide[String(creditSide)]||0) + dmg;
  dmgNumBatched(e, dmg, crit);
  if(slow){ e.slowT = Math.max(e.slowT, slow.dur); e.slowF = slow.f; }
  if(e.hp<=0){
    flushDmgAgg(e);
    e.dead = true; e.anim.stopAll();
    const anims = MODELS['m_'+e.spec.m]?.animations || [];
    const deathClip = anims.find(a=>a.name==='Death');
    if(deathClip){ const a=e.anim.mixer.clipAction(deathClip); a.reset(); a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play(); }
    burst(e.group.position.x, 0.8, e.group.position.z, e.boss?0xff8a5c:0xa0e8ff, e.boss?5:2.6);
    if(e.hpBar) e.hpBar.visible=false;
    if(e.boss){ dmgNum(e.group.position.x, 3.4, e.group.position.z, '보스 처치!', '#ff8a5c', true); ring(e.group.position.x, e.group.position.z, 0xff8a5c); if(AI.alive) aiSay('bossKill'); }
    const S = G.sides[creditSide] || G.sides[-1];
    // 소수점 이월: 낮은 기본 골드 구간에서도 강화 단계의 누적 이득이 실제 지급되도록
    S.carry = (S.carry||0) + (e.boss ? 50 : waveSpec(G.wave).killGold) * (1 + 0.05*(G.metaUpg?.econ||0));
    const gold = Math.floor(S.carry); S.carry -= gold;
    if(e.boss) G.bossKills = (G.bossKills||0)+1;
    S.gold += gold; G.goldEarned += gold; G.kills++;
    if(killer && !killer.dead){ killer.kills = (killer.kills||0)+1; checkLevelUp(killer); }
    G.dbg.dmgShown++;
    dmgNum(e.group.position.x, 1.3, e.group.position.z, `+${gold}G`, '#ffd766');
    AudioMan.play(e.boss?'gamble_win':'gold', e.boss?0.9:0.32, 1, e.boss?0:120);
    const ref = e; setTimeout(()=>{ scene.remove(ref.group); }, 900);
    G.enemies = G.enemies.filter(x=>x!==e);
    checkWaveEnd(); updateHUD();
  }
}
function leak(e){
  G.leakLog.push({ w:G.wave, z:enemyZone(e), boss:!!e.boss, t:e.tier||0, blocked: !e.boss && G.leakShield>0 });
  if(!e.boss && G.leakShield>0){
    G.leakShield--;
    scene.remove(e.group);
    G.enemies = G.enemies.filter(x=>x!==e);
    AudioMan.play('click', 0.5);
    log(`⭐ 수호 특화가 침투를 막았습니다! (남은 보호 ${G.leakShield}회)`, 'sys');
    updateHUD(); checkWaveEnd();
    return;
  }
  G.lives -= e.boss?5:1;
  scene.remove(e.group);
  G.enemies = G.enemies.filter(x=>x!==e);
  AudioMan.play('leak', 0.8); shake(e.boss?0.7:0.4);
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
    prepPending = true; prepT = nextBoss ? 6 : 4; prepBoss = nextBoss; bossWarned = false;
    saveRecords(); saveRun(); updateHUD();
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
  G.projectiles.push({ mesh, target, from, t:0, dur: Math.max(0.12, from.distanceTo(target.group.position)/15), def:u.def, side:u.side, mult:dmgMul(u, target), unit:u });
  AudioMan.play(kind==='arrow'?'shoot':'magic', 0.28, 1, 90);
}
// 열 보정: 후열 -15%, 전열은 담당 구역 안 적에게 +25%
function dmgMul(u, e){
  let m = 1 + 0.03*(G.metaUpg?.dmg||0);
  m *= 1 + 0.08*((u.lv||1)-1);
  if(u.merged && G.metaSpec==='breakthrough') m *= 1.10;
  if(u.row === 2) m *= 0.85;
  else if(u.row === 0 && enemyZone(e) === u.zone) m *= 1.25;
  return m;
}
function hitWithDef(target, def, side, mult=1, srcUnit=null){
  let dmg = def.dmg * mult; let crit = false;
  if(def.crit && rnd() < def.crit){ dmg *= def.critMul; crit = true; }
  damageEnemy(target, Math.round(dmg), side, crit, def.slow?{ f:1-def.slow, dur:def.slowDur }:null, srcUnit);
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
      hitWithDef(p.target, p.def, p.side, p.mult, p.unit);
      burstCombat(to.x, to.y, to.z, p.def.kind==='magic'?0x9fd4ff:0xffe08a, 1.8, p.target);
      if(p.def.splash) for(const e of [...G.enemies]){ if(e!==p.target && !e.dead && e.group.position.distanceTo(to) < p.def.splash) damageEnemy(e, Math.round(p.def.dmg*0.6*p.mult), p.side, false, null, p.unit); }
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
          if(u.def.aoe){ for(const e of [...G.enemies]){ if(!e.dead && e.group.position.distanceTo(u.group.position) <= u.def.range) hitWithDef(e, u.def, s, dmgMul(u, e), u); } ring(u.group.position.x, u.group.position.z, 0xc59bff); }
          else hitWithDef(tgt, u.def, s, dmgMul(u, tgt), u);
          burstCombat(tgt.group.position.x, 1.0, tgt.group.position.z, 0xffe08a, 1.6, tgt);
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
  if(rangedFront.length && midFree.length){ moveUnit(1, rangedFront[0].tile, midFree[0]); return; }
  // 위험·핑 구역 대응 이동: 안전하고 커버된 구역의 유닛 하나를 우선 구역의 빈 타일로
  const dz = (G.persKey==='support'||G.persKey==='adaptive') ? aiPriorityZones() : dangerZoneSet();
  if(!dz.size) return;
  const dzP = new Set([...dz].filter(z => (AI.dangerT[z]||0) >= 2));
  if(!dzP.size) return;
  const freePri = [];
  for(let i=0;i<TILES_PER_SIDE;i++){
    if(sideUnitAt(1,i)) continue;
    if(dzP.has(zoneOfTile(1, i % TILE_SECTORS))) freePri.push({ i, row: Math.floor(i/TILE_SECTORS) });
  }
  if(!freePri.length) return;
  const cand = S.units.filter(u=> !dzP.has(u.zone) && zoneCovered(u.zone) && !(u.reposCdT>0));
  for(const u of cand){
    const wantRows = u.def.kind==='melee' ? [0] : u.def.kind==='ranged' ? [2,1] : [1,2];
    for(const wr of wantRows){
      const t = freePri.find(t=>t.row===wr);
      if(t){ u.reposCdT = 15; moveUnit(1, u.tile, t.i); return; }
    }
  }
}
function aiTick(){
  if(!AI.alive || G.phase!=='play' || G.paused) return;
  G.dbg.aiTicks = (G.dbg.aiTicks||0)+1;
  // 위험 구역이 6초 이상 지속되면 플레이어에게 도움 요청 핑 (30초 쿨다운)
  AI.askT = Math.max(0, (AI.askT||0) - 1);
  const dzNow = dangerZoneSet();
  AI.dangerT = AI.dangerT || {};
  for(const s of [-1,1]) for(const u of G.sides[s].units) if(u.reposCdT>0) u.reposCdT--;
  for(const z of dzNow) AI.dangerT[z] = (AI.dangerT[z]||0) + 1;
  for(const k of Object.keys(AI.dangerT)) if(!dzNow.has(+k)) delete AI.dangerT[k];
  if(AI.askT<=0 && waveActive){
    const z = Object.keys(AI.dangerT).map(Number).find(z2=>AI.dangerT[z2]>=6 && !G.pings.has(z2));
    if(z!=null){ G.pings.add(z); G.pingSrc.set(z, 'ai'); updateZoneStrip(); aiSay('askHelp'); AI.askT=30; }
  }
  const S = G.sides[1]; const P = aiParams();
  // 골드가 도박 기준의 2배 이상 쌓이면(보드 포화로 소비 경로가 막힌 상태) 합성을 앞당겨 자리를 확보
  const goldOverflow = S.gold >= 2*Math.max(GAMBLE_COST, P.gambleGold||0);
  if(findTriple(1) && (S.units.length >= (P.mergeAt||0) || goldOverflow)){
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
  // t1이 근접뿐이면 전열 여유가 있어야 소환 가능 — 불가능한 소환 시도로 틱을 소모하지 않음
  const freeNow = freeTiles(1);
  const canSummon = freeNow.some(i=>i<TILE_SECTORS) || UNITS_BY_TIER[1].some(d=>d.kind!=='melee');
  if(spawnOk && canSummon && S.units.length < P.minUnits && S.gold >= summonCost(1) && !saverBlocked){
    const d = doSummon(1); if(d) aiSay('summon'); return;
  }
  if(spawnOk && canSummon && S.gold > summonCost(1)*4 && !P.saver){ doSummon(1); return; }
  if(P.repos || G.lives<=12){ AI.reposT++; if(AI.reposT>=(P.repos?8:4)){ AI.reposT=0; aiRepos(); } }
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
  else $('wave-banner').textContent = `웨이브 ${G.wave}${waveSpec(G.wave).boss?' — 보스!':''} · 남은 적 ${G.enemies.length + spawnQueue.length}${G.ch.length?' · 도전 '+G.ch.length:''}`;
  $('ai-state').textContent = `골드 ${Math.floor(G.sides[1].gold)} · 유닛 ${G.sides[1].units.length}`;
  const chip = $('spec-chip');
  if(chip){
    if(G.phase==='play' && G.metaSpec && SPEC_DEFS[G.metaSpec]){
      let t = '⭐ '+SPEC_DEFS[G.metaSpec].name;
      if(G.metaSpec==='guardian') t += ` · 보호 ${G.leakShield}`;
      if(G.metaSpec==='fortune' && G.freeGamble){ const n=(G.freeGamble['-1']?1:0)+(G.freeGamble['1']?1:0); if(n>0) t += ` · 무료 소환 ${n}`; }
      chip.textContent = t; chip.style.display='';
    } else chip.style.display='none';
  }
  $('btn-summon').disabled = G.sides[-1].gold < summonCost(-1) || !freeTiles(-1).length || G.phase!=='play' || !(freeTiles(-1).some(i=>i<TILE_SECTORS) || UNITS_BY_TIER[1].some(d=>d.kind!=='melee'));
  if($('fp') && $('fp').style.display==='block') fpRender();
  $('btn-gamble').disabled = G.sides[-1].gold < GAMBLE_COST || !freeTiles(-1).length || G.phase!=='play';
  const triple = findTriple(-1);
  $('btn-merge').disabled = !triple || G.phase!=='play';
  $('merge-hint').textContent = triple ? `${triple[0].def.name} ×3 가능!` : '같은 유닛 3기';
  if(waveActive){ $('btn-wave').textContent = `웨이브 ${G.wave} 진행 중 · 적 ${G.enemies.length + spawnQueue.length}`; }
  else if(prepPending){ $('btn-wave').textContent = `즉시 시작 ${Math.ceil(prepT)}s`; }
  else { $('btn-wave').textContent = `웨이브 ${G.wave+1} 시작`; }
  $('btn-wave').disabled = waveActive || G.phase!=='play';
  updateZoneStrip();
  const boss = G.enemies.find(e=>e.boss && !e.dead);
  if(boss){
    $('bossbar').style.display='flex';
    $('bossbar-name').textContent = boss.spec.name || '보스';
    $('bossbar-fill').style.width = Math.max(0, boss.hp/boss.maxHp*100) + '%';
  } else $('bossbar').style.display='none';
  // 침투 임박(한 바퀴의 86% 이상 진행) 경고
  $('vign').classList.toggle('warn', G.enemies.some(e=>!e.dead && e.t>0.86));
}

// ---------- 기록 ----------
G.dbg = { hits:0, dmgShown:0, burstShown:0, burstSkipped:0 };
G.dbg.spawnFails = s => (G.sides[s].spawnFails||0);
G.dbg.setGold = (s,v) => { G.sides[s].gold = v; };
G.dbg.spawnAt = (s, defId, tile) => { const d = UNITS.find(u=>u.id===defId); return d ? !!spawnUnit(s, d, tile) : false; };
G.dbg.summon = s => !!doSummon(s);
G.dbg.setRender = f => { G.dbg._renderOff = !f; };
G.dbg.gamble = s => doGamble(s);
function loadRecords(){ try{ return JSON.parse(localStorage.getItem('fd_records_v1')) || { best:0, games:0, per:{} }; }catch(e){ return { best:0, games:0, per:{} }; } }
function saveRecords(){
  const r = loadRecords();
  if(G.wave>0){
    if(G.ch && G.ch.length){ r.ch = r.ch||{}; for(const k of G.ch){ r.ch[k] = Math.max(r.ch[k]||0, G.wave); } }
    else { r.best = Math.max(r.best, G.wave); r.per[G.persKey] = Math.max(r.per[G.persKey]||0, G.wave); }
  }
  localStorage.setItem('fd_records_v1', JSON.stringify(r));
}
function showRecords(){
  const r = loadRecords();
  $('records').innerHTML = r.games>0
    ? `최고 기록: <b>웨이브 ${r.best}</b> · 총 ${r.games}게임` + Object.entries(r.per).map(([k,v])=>`<br>${PERSONALITIES[k]?.name||k}: 웨이브 ${v}`).join('')
      + (r.ch && Object.keys(r.ch).length ? '<br><span style="color:#ff8a5c">도전 의식:</span>' + Object.entries(r.ch).map(([k,v])=>`<br>&nbsp;${CHALLENGES[k]?.icon||''} ${CHALLENGES[k]?.name||k}: 웨이브 ${v}`).join('') : '')
      + (META.mastery && Object.keys(META.mastery).length ? '<br><span style="color:#7dd3fc">의식 마스터리:</span> ' + Object.entries(META.mastery).map(([k,v])=> k==='trio' ? (v===true?'삼중 의식 🏅':'') : `${CHALLENGES[k]?.name||k} ${(Array.isArray(v)?v:[]).map(m=>m===8?'Ⅰ':m===12?'Ⅱ':'Ⅲ').join('')}`).filter(s=>s.length).join(' · ') : '')
    : '아직 기록이 없습니다. 첫 게임을 시작해 보세요!';
}

// ---------- 저장 안전장치: 자동 백업 · 내보내기/가져오기 · 초기화 ----------
const BACKUP_KEY = 'fd_backup_v1';
function validRecords(r){
  if(!r || typeof r!=='object' || Array.isArray(r)) return false;
  if(!Number.isInteger(r.best) || r.best<0 || r.best>100000) return false;
  if(!Number.isInteger(r.games) || r.games<0 || r.games>1000000) return false;
  if(r.per!=null){
    if(typeof r.per!=='object' || Array.isArray(r.per)) return false;
    for(const k of Object.keys(r.per)){ if(!PERSONALITIES[k] || !Number.isInteger(r.per[k]) || r.per[k]<0 || r.per[k]>100000) return false; }
  }
  if(r.ch!=null){
    if(typeof r.ch!=='object' || Array.isArray(r.ch)) return false;
    for(const k of Object.keys(r.ch)){ if(!CHALLENGES[k] || !Number.isInteger(r.ch[k]) || r.ch[k]<0 || r.ch[k]>100000) return false; }
  }
  return true;
}
// 마지막 정상 상태 스냅샷 (웨이브 클리어 저장·게임 오버 정산 직후 갱신)
function backupSave(){
  try{ localStorage.setItem(BACKUP_KEY, JSON.stringify({ v:1, at:new Date().toISOString(), records:loadRecords(), meta:META, run:loadRun() })); }catch(e){}
}
function loadBackup(){
  try{
    const b = JSON.parse(localStorage.getItem(BACKUP_KEY));
    if(!b || b.v!==1 || !validRecords(b.records) || !normalizeMeta(JSON.parse(JSON.stringify(b.meta||null)))) return null;
    if(b.run!=null && !validateRunData(b.run)) return null;
    return b;
  }catch(e){ return null; }
}
function applySaveData(records, meta, run){
  localStorage.setItem('fd_records_v1', JSON.stringify(records));
  Object.assign(META, normalizeMeta(JSON.parse(JSON.stringify(meta))) || defaultMeta());
  saveMeta();
  if(run) localStorage.setItem(RUN_KEY, JSON.stringify(run)); else clearRun();
  try{ localStorage.removeItem(AWARD_KEY); }catch(e){}
}
function exportSave(){
  return btoa(unescape(encodeURIComponent(JSON.stringify({ app:'fortune-duo', v:1, at:new Date().toISOString(), records:loadRecords(), meta:META, run:loadRun() }))));
}
function importSave(code){
  let d;
  try{ d = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); }catch(e){ return { ok:false, msg:'코드를 읽을 수 없습니다. 복사가 잘못되지 않았는지 확인해 주세요.' }; }
  if(!d || d.app!=='fortune-duo' || d.v!==1) return { ok:false, msg:'포춘 듀오 저장 코드가 아닙니다.' };
  if(!validRecords(d.records)) return { ok:false, msg:'기록 데이터가 올바르지 않습니다.' };
  const nm = normalizeMeta(JSON.parse(JSON.stringify(d.meta||null)));
  if(!nm) return { ok:false, msg:'메타 데이터가 올바르지 않습니다.' };
  if(d.run!=null && !validateRunData(d.run)) return { ok:false, msg:'이어하기 데이터가 올바르지 않습니다.' };
  backupSave(); // 덮어쓰기 전 현재 상태를 백업 슬롯에 보존
  applySaveData(d.records, d.meta, d.run || null);
  return { ok:true, msg:'저장 데이터를 가져왔습니다. 새로고침합니다.' };
}
function restoreBackup(){
  const b = loadBackup();
  if(!b) return { ok:false, msg:'복구할 백업이 없습니다.' };
  applySaveData(b.records, b.meta, b.run || null);
  return { ok:true, msg:'백업 시점(' + (b.at||'알 수 없음') + ')으로 복구했습니다. 새로고침합니다.' };
}
function resetSave(){
  backupSave(); // 초기화 전 자동 백업 — 백업 복구로 되돌릴 수 있음
  try{ localStorage.removeItem('fd_records_v1'); localStorage.removeItem(META_KEY); clearRun(); localStorage.removeItem(AWARD_KEY); }catch(e){}
}

function setupDataPanel(){
  const panel=$('data-panel'), code=$('data-code'), msg=$('data-msg'), info=$('data-info');
  if(!panel) return;
  const say=(t,bad)=>{ msg.textContent=t; msg.style.color=bad?'#ff8a5c':'#7dd3fc'; };
  const refreshInfo=()=>{
    const b=loadBackup();
    info.textContent = b ? `자동 백업: ${b.at||'시간 미상'} (웨이브 ${b.records?.best??0} 최고 · 젬 ${b.meta?.gems??0})` : '자동 백업 없음 — 웨이브를 클리어하면 마지막 정상 상태가 자동 보관됩니다.';
    $('btn-restore-backup').style.display = b ? 'block' : 'none';
    // 손상 감지 안내: 원본 키는 있는데 파싱이 안 되는 경우
    let corrupt=false;
    try{ const raw=localStorage.getItem('fd_records_v1'); if(raw && !validRecords(JSON.parse(raw))) corrupt=true; }catch(e){ corrupt=true; }
    try{ const raw=localStorage.getItem(META_KEY); if(raw && !normalizeMeta(JSON.parse(raw))) corrupt=true; }catch(e){ corrupt=true; }
    if(corrupt) info.innerHTML += '<br><span style="color:#ff8a5c">⚠ 저장 데이터가 손상된 것으로 보입니다. 백업이 있다면 백업 복구를 눌러 주세요.</span>';
  };
  $('btn-data').onclick=()=>{ AudioMan.play('click',0.4); const open=panel.style.display!=='none'; panel.style.display=open?'none':'block'; if(!open){ code.style.display='none'; code.value=''; say(''); refreshInfo(); } };
  $('btn-export').onclick=async()=>{
    AudioMan.play('click',0.4);
    code.style.display='block'; code.value=exportSave(); code.focus(); code.select();
    let copied=false; try{ await navigator.clipboard.writeText(code.value); copied=true; }catch(e){ try{ document.execCommand('copy'); copied=true; }catch(e2){} }
    say(copied?'저장 코드를 만들어 복사했습니다. 안전한 곳에 붙여넣어 보관하세요.':'저장 코드를 만들었습니다. 직접 복사해 보관하세요.');
  };
  $('btn-import').onclick=()=>{
    AudioMan.play('click',0.4);
    if(code.style.display==='none' || !code.value.trim()){ code.style.display='block'; code.value=''; code.focus(); say('붙여넣은 뒤 가져오기를 한 번 더 누르세요. 현재 데이터는 자동 백업됩니다.'); return; }
    if($('btn-import').dataset.arm!=='1'){ $('btn-import').dataset.arm='1'; say('현재 저장을 덮어씁니다(직전 상태는 자동 백업). 확실하면 한 번 더 누르세요.'); return; }
    $('btn-import').dataset.arm='';
    const r=importSave(code.value);
    say(r.msg, !r.ok);
    if(r.ok) setTimeout(()=>location.reload(), 900);
  };
  $('btn-restore-backup').onclick=()=>{
    AudioMan.play('click',0.4);
    if($('btn-restore-backup').dataset.arm!=='1'){ $('btn-restore-backup').dataset.arm='1'; say('자동 백업 시점으로 되돌립니다. 확실하면 한 번 더 누르세요.'); return; }
    $('btn-restore-backup').dataset.arm='';
    const r=restoreBackup();
    say(r.msg, !r.ok);
    if(r.ok) setTimeout(()=>location.reload(), 900);
  };
  $('btn-reset').onclick=()=>{
    AudioMan.play('click',0.4);
    if($('btn-reset').dataset.arm!=='1'){ $('btn-reset').dataset.arm='1'; say('기록·젬·이어하기를 모두 지웁니다(직전 상태는 자동 백업되어 복구 가능). 확실하면 한 번 더 누르세요.', true); return; }
    $('btn-reset').dataset.arm='';
    resetSave();
    say('모든 저장 데이터를 지웠습니다. 새로고침합니다.');
    setTimeout(()=>location.reload(), 900);
  };
}

// ---------- 진행 저장(이어하기): 웨이브 클리어 지점 스냅샷 ----------
const RUN_KEY = 'fd_run_v1';
function saveRun(){
  // 축복은 첫 클리어-지점 저장 시점에 소비 확정 (그 전 크래시·새로고침이면 예약 유지 → 재화 손실 없음)
  if(G.bless && G.bless.length){ G.blessConsumed = true; META.pendingBless = []; saveMeta(); }
  if(G.phase!=='play' || G.wave<=0) return;
  try{
    const s = { v:1, runId:G.runId||null, bless:Array.isArray(G.bless)?G.bless:null, ch:Array.isArray(G.ch)?G.ch:[], spec:G.metaSpec||null, leakShield:G.leakShield||0, freeGamble:G.freeGamble||null, wave:G.wave, lives:G.lives, kills:G.kills, dmg:Math.round(G.dmgDealt||0), goldEarned:G.goldEarned, persKey:G.persKey, speed:G.speed, meta:{ ...G.metaUpg },
      sides:{ '-1':{ gold:G.sides[-1].gold, carry:G.sides[-1].carry||0, summons:G.sides[-1].summons, units:G.sides[-1].units.map(u=>({id:u.def.id, tile:u.tile, lv:u.lv||1, kills:u.kills||0})) },
              '1':{ gold:G.sides[1].gold, carry:G.sides[1].carry||0, summons:G.sides[1].summons, units:G.sides[1].units.map(u=>({id:u.def.id, tile:u.tile, lv:u.lv||1, kills:u.kills||0})) } } };
    localStorage.setItem(RUN_KEY, JSON.stringify(s));
    backupSave();
  }catch(e){}
}
function validateRunData(s){
  if(!s || s.v!==1 || !Number.isInteger(s.wave) || s.wave<=0 || !PERSONALITIES[s.persKey]) return null;
  if(!Number.isInteger(s.lives) || s.lives<=0) return null;
  if(s.spec!=null && !SPEC_DEFS[s.spec]) return null;
  if(s.leakShield!=null && (!Number.isInteger(s.leakShield) || s.leakShield<0 || s.leakShield>3)) return null;
  if(s.ch!=null && (!Array.isArray(s.ch) || s.ch.length>3 || !s.ch.every(k=>CHALLENGES[k]))) return null;
  if(s.freeGamble!=null && typeof s.freeGamble!=='object') return null;
  for(const k of ['-1','1']){
    const ss = s.sides && s.sides[k];
    if(!ss || typeof ss.gold!=='number' || !Array.isArray(ss.units)) return null;
    if(ss.carry!=null && (typeof ss.carry!=='number' || !(ss.carry>=0) || ss.carry>1000)) return null;
    for(const su of ss.units){
      if(!su || !UNITS.some(d=>d.id===su.id) || !Number.isInteger(su.tile) || su.tile<0 || su.tile>=TILES_PER_SIDE) return null;
      if(su.lv!=null && (!Number.isInteger(su.lv) || su.lv<1 || su.lv>5)) return null;
      if(su.kills!=null && (!Number.isInteger(su.kills) || su.kills<0 || su.kills>100000)) return null;
    }
  }
  return s;
}
function loadRun(){
  try{ return validateRunData(JSON.parse(localStorage.getItem(RUN_KEY))); }
  catch(e){ return null; }
}
function clearRun(){ try{ localStorage.removeItem(RUN_KEY); }catch(e){} }
function restoreRun(s){
  try{ restoreRunInner(s); }
  catch(e){ clearRun(); try{ [...G.sides[-1].units].forEach(removeUnit); [...G.sides[1].units].forEach(removeUnit); }catch(e2){} location.reload(); }
}
function restoreRunInner(s){
  clearRun();
  G.bestAtStart = loadRecords().best || 0;
  G.persKey = s.persKey; $('ai-name').textContent = PERSONALITIES[s.persKey].name;
  G.wave=s.wave; G.lives=s.lives; G.kills=s.kills||0; G.dmgDealt=s.dmg||0; G.goldEarned=s.goldEarned||0;
  G.speed = [1,2,3].includes(s.speed)?s.speed:1; if($('btn-speed')) $('btn-speed').textContent = G.speed+'x';
  G.metaUpg = { ...zeroUpg(), ...(s.meta||{}) };
  G.runId = typeof s.runId==='string' ? s.runId : newRunId();
  G.metaSpec = (s.spec && SPEC_DEFS[s.spec]) ? s.spec : null;
  G.ch = (Array.isArray(s.ch)?s.ch:[]).filter(k=>CHALLENGES[k]);
  G.bless = Array.isArray(s.bless)?s.bless:null;
  G.leakShield = Number.isInteger(s.leakShield) ? s.leakShield : 0;
  G.freeGamble = (s.freeGamble && typeof s.freeGamble==='object') ? s.freeGamble : null;
  for(const side of [-1,1]){
    const old = G.sides[side]; [...old.units].forEach(removeUnit);
    const ss = s.sides[String(side)] || { gold:START_GOLD, summons:0, units:[] };
    old.gold=ss.gold; old.carry = typeof ss.carry==='number' ? ss.carry : 0; old.summons=ss.summons;
    for(const su of ss.units){ const def = UNITS.find(d=>d.id===su.id); if(def && su.tile>=0 && su.tile<TILES_PER_SIDE && !sideUnitAt(side, su.tile)){ const ru = spawnUnit(side, def, su.tile); if(ru){ ru.lv = Number.isInteger(su.lv)?su.lv:1; ru.kills = Number.isInteger(su.kills)?su.kills:0; if(ru.def.tier===6 && ru.aura){ ru.aura.material.color.set(TIER_COLORS[5]); ru.aura.scale.setScalar(1.18); } } } }
  }
  $('start').style.display='none'; G.phase='play'; AI.alive=true;
  const nextBoss = waveSpec(G.wave+1).boss; prepPending=true; prepT=3; prepBoss=nextBoss; bossWarned=false;
  AudioMan.bgmStart();
  log(`저장된 게임을 이어갑니다 — 웨이브 ${s.wave} 클리어 지점 (공유 생명 ${s.lives})`, 'sys');
  aiSay('start');
  updateHUD(); updateZoneStrip();
}

// ---------- 게임 오버 ----------
let overFired = false;
function gameOver(){
  if(overFired) return; overFired = true;
  G.phase='over';
  const gemsEarned = Math.round((Math.max(0, G.wave-1) + 2*(G.bossKills||0)) * (1 + 0.25*(G.ch?G.ch.length:0)));
  // 의식 마스터리: 최초 달성 배지를 순수 계산만 하고 저널에 함께 기록 (복구 시에도 젬+배지가 정확히 한 세트로 반영)
  const newBadges = [];
  if(G.ch && G.ch.length){
    const mm = META.mastery || {};
    for(const k of G.ch){
      if(!CHALLENGES[k]) continue;
      const have = Array.isArray(mm[k]) ? mm[k] : [];
      for(const m of [8,12,16]) if(G.wave>=m && !have.includes(m)) newBadges.push([k,m]);
    }
    if(G.ch.length>=3 && G.wave>=12 && mm.trio!==true) newBadges.push(['trio',12]);
  }
  const badgeBonus = newBadges.reduce((s,b)=> s + (b[0]==='trio'?30:(b[1]===8?5:b[1]===12?10:15)), 0);
  const gemsTotal = gemsEarned + badgeBonus;
  const runId = G.runId || newRunId();
  // 1) 저널 먼저: 이후 어디서 중단돼도 부팅 시 정확히 한 번 지급
  try{ localStorage.setItem(AWARD_KEY, JSON.stringify({ runId, gems: gemsTotal, badges: newBadges })); }catch(e){}
  clearRun();
  const prevBest = (G.bestAtStart != null) ? G.bestAtStart : 0;
  const r = loadRecords(); r.games++; localStorage.setItem('fd_records_v1', JSON.stringify(r));
  saveRecords();
  // 2) 실제 지급 + 지급 완료 표시 (같은 runId 재지급 불가)
  if(META.lastAward !== runId){ mergeBadges(newBadges); META.gems += gemsTotal; META.lastAward = runId; saveMeta(); }
  try{ localStorage.removeItem(AWARD_KEY); }catch(e){}
  backupSave();
  AudioMan.play('defeat', 0.9); AudioMan.bgmStop();
  $('over-title').textContent = '성문이 함락됐습니다';
  $('over-sub').textContent = `${PERSONALITIES[G.persKey].name}와 함께 웨이브 ${G.wave}까지 방어`;
  const aiS = G.sides[1];
  if(AI.alive) aiSay('end');
  $('over-stats').innerHTML = `<div>도달 웨이브<b>${G.wave}</b></div><div>처치 수<b>${G.kills}</b></div><div>총 피해량<b>${Math.round(G.dmgDealt||0).toLocaleString()}</b></div><div>획득 골드<b>${G.goldEarned}</b></div><div>AI 최종 유닛<b>${aiS.units.length}기</b></div><div>최고 기록<b>${loadRecords().best}</b></div>${G.ch&&G.ch.length?`<div>도전 의식<b>${G.ch.map(k=>CHALLENGES[k].name).join('·')}</b></div>`:''}<div>획득 젬<b>+${gemsTotal} 💎</b></div>${newBadges.length?`<div>새 배지<b>${newBadges.map(([k,m])=>k==='trio'?'삼중 의식 🏅':CHALLENGES[k].name+' '+(m===8?'Ⅰ':m===12?'Ⅱ':'Ⅲ')).join(' · ')}</b></div>`:''}<div>보유 젬<b>${META.gems}</b></div>`;
  if(G.leakLog.length){
    // 구역 표시는 무의미(누수 지점의 각도가 항상 트랙 시작점으로 기록됨) → 티어·보스 분석으로 대체
    const byT = {}; let bossN = 0;
    for(const l of G.leakLog){ if(l.boss){ bossN++; continue; } byT[l.t] = (byT[l.t]||0)+1; }
    const top = Object.entries(byT).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,c])=>`${+t+1}티어 ×${c}`).join(', ') + (bossN?`${Object.keys(byT).length?', ':''}보스 ×${bossN}`:'');
    const blockedN = G.leakLog.filter(l=>l.blocked).length;
    $('over-record').innerHTML = ((G.wave > prevBest && G.wave > 0) ? '🏆 신기록 달성!<br>' : '') + `침투 분석: ${top}${blockedN?` (수호 차단 ${blockedN}회)`:''}`;
  }
  else $('over-record').textContent = (G.wave > prevBest && G.wave > 0) ? '🏆 신기록 달성!' : '';
  $('over').style.display='flex'; updateHUD();
}

// ---------- 입력 ----------
const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
let selTile = -1;
const _pickV = new THREE.Vector3();
function onTap(ev){
  if(G.phase!=='play' || G.paused) return;
  // 18타일 중 화면상 가장 가까운 타일 중심 선택 (타일이 겹쳐 보여도 정확하게 선택)
  let idx = -1, bestPx = 34;
  for(let i=0;i<TILES_PER_SIDE;i++){
    const p = tilePos(-1,i);
    _pickV.set(p.x, 0.16, p.z).project(camera);
    const sx = (_pickV.x*0.5+0.5)*innerWidth, sy = (-_pickV.y*0.5+0.5)*innerHeight;
    const d = Math.hypot(sx-ev.clientX, sy-ev.clientY);
    if(d < bestPx){ bestPx = d; idx = i; }
  }
  if(idx<0){ selTile=-1; $('sel-info').style.display='none'; return; }
  const u = sideUnitAt(-1, idx);
  if(selTile>=0 && selTile!==idx){ moveUnit(-1, selTile, idx); flashTile(-1, idx, 0x8fd3ff); selTile=-1; $('sel-info').style.display='none'; return; }
  if(u){
    selTile = idx; flashTile(-1, idx, 0xffd766);
    const d = u.def;
    const row = Math.floor(u.tile / TILE_SECTORS);
    const rowTxt = row===0 ? '전열 · 담당 구역 집중 +25%' : row===1 ? '중열 · 균형' : '후열 · 3구역 커버 · 사거리 +50% · 공격 -15%';
    $('sel-info').innerHTML = `<b style="color:#${TIER_COLORS[d.tier-1].toString(16)}">[${TIER_NAMES[d.tier-1]}] ${d.name}</b> <span style="opacity:.8">(${ROW_NAMES[row]})</span><br>공격력 ${d.dmg} · 사거리 ${d.range} · 속도 ${d.interval}s${d.splash?` · 범위 ${d.splash}`:''}${d.slow?' · 둔화':''}${d.crit?' · 치명타':''}${d.aoe?' · 전체공격':''}<br><span style="opacity:.7">${rowTxt}<br>정예 Lv.${u.lv||1} · 처치 ${u.kills||0}${(u.lv||1)<5?' / 다음 Lv까지 '+(LV_XP[(u.lv||1)+1]-(u.kills||0)):''}${d.tier===5&&T6_OF[d.id]?` · ✨ 초월까지 <b>${Math.max(0,LV_XP[5]-(u.kills||0))}</b>킬 (→ ${UNITS.find(x=>x.id===T6_OF[d.id]).name})`:''}<br>다른 타일을 누르면 이동/교환${d.kind==='melee'?' · 근접은 전열 전용':''}</span>`;
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

// ---------- 배치 패널 (3열 x 6구역, 모바일 대형 조작) ----------
let fpSel = -1;
function fpMsg(t){ const el=$('fp-msg'); if(el) el.textContent = t; }
function fpUnitInfo(u){
  const d = u.def, row = Math.floor(u.tile / TILE_SECTORS);
  const rowTxt = row===0 ? '전열 · 담당 구역 집중 +25%' : row===1 ? '중열 · 균형' : '후열 · 3구역 커버 · 사거리 +50% · 공격 -15%';
  return `[${TIER_NAMES[d.tier-1]}] ${d.name} (${ROW_NAMES[row]}) 공${d.dmg} · 사거리 ${d.range} — ${rowTxt} · 다른 칸을 누르면 이동/교환`;
}
function fpRender(){
  const grid = $('fp-grid'); if(!grid) return;
  if(!grid.children.length){
    for(let r=0;r<3;r++){
      const lab = document.createElement('div'); lab.className='rlabel'; lab.textContent = ROW_NAMES[r]; grid.appendChild(lab);
      for(let s=0;s<TILE_SECTORS;s++){
        const c = document.createElement('div'); c.className='fcell'; c.dataset.tile = r*TILE_SECTORS+s;
        c.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); fpTap(r*TILE_SECTORS+s); });
        grid.appendChild(c);
      }
    }
  }
  for(const c of grid.children){
    if(!c.dataset || c.dataset.tile==null) continue;
    const t = +c.dataset.tile, u = sideUnitAt(-1, t);
    const z = zoneOfTile(-1, t % TILE_SECTORS);
    c.classList.toggle('occ', !!u);
    c.classList.toggle('sel', t===fpSel);
    c.innerHTML = `<span class="fz">구역${z+1}</span>` + (u ? `<b style="color:#${TIER_COLORS[u.def.tier-1].toString(16)}">${u.def.name}${(u.lv||1)>1?' Lv'+u.lv:''}</b>` : '<span style="opacity:.35">빈 칸</span>');
  }
}
function fpTap(t){
  if(G.phase!=='play' || G.paused) return;
  AudioMan.resume();
  const u = sideUnitAt(-1, t);
  if(fpSel < 0){
    if(u){ fpSel = t; fpMsg(fpUnitInfo(u)); flashTile(-1, t, 0xffd766); }
    else fpMsg('유닛이 있는 칸을 먼저 선택하세요');
  } else if(fpSel === t){
    fpSel = -1; fpMsg('선택 해제됨');
  } else {
    const a = sideUnitAt(-1, fpSel);
    if(!a){ fpSel = -1; fpRender(); return; }
    const toRow = Math.floor(t / TILE_SECTORS), fromRow = Math.floor(fpSel / TILE_SECTORS);
    if(toRow!==0 && a.def.kind==='melee'){ fpMsg('이동 불가: 근접 유닛은 전열 전용 (중열·후열은 트랙까지 사거리 미달)'); AudioMan.play('gamble_fail', 0.35); }
    else if(u && fromRow!==0 && u.def.kind==='melee'){ fpMsg('교환 불가: 상대 근접 유닛이 중열·후열로 가면 사거리 미달'); AudioMan.play('gamble_fail', 0.35); }
    else { moveUnit(-1, fpSel, t); fpMsg(u ? '교환 완료' : '이동 완료'); fpSel = -1; }
  }
  fpRender();
}
$('btn-formation').onclick = ()=>{ AudioMan.resume(); const fp=$('fp'); const open = fp.style.display!=='block'; fp.style.display = open?'block':'none'; if(open){ fpSel=-1; fpMsg('유닛 칸을 눌러 선택'); $('sel-info').style.display='none'; fpRender(); } AudioMan.play('click',0.5); };
$('fp-close').onclick = ()=>{ $('fp').style.display='none'; };

$('btn-wave').onclick = ()=>{ AudioMan.resume(); AudioMan.play('click',0.5); startWave(); };
$('btn-sound').onclick = ()=>{ AudioMan.resume(); AudioMan.toggle(); };
if($('btn-speed')) $('btn-speed').onclick = ()=>{ AudioMan.resume(); G.speed = G.speed>=3?1:G.speed+1; $('btn-speed').textContent = G.speed+'x'; AudioMan.play('click',0.5); };
$('btn-pause').onclick = ()=>{
  if(G.phase!=='play') return;
  G.paused = !G.paused; $('btn-pause').textContent = G.paused?'재생':'정지';
  if(G.paused){ AudioMan.bgmStop(); log('일시정지', 'sys'); } else { AudioMan.bgmStart(); log('재개', 'sys'); }
};
$('btn-retry').onclick = ()=>location.reload();
$('btn-over-shop').onclick = ()=>{ try{ sessionStorage.setItem('fd_scroll_shop','1'); }catch(e){} location.reload(); };
$('btn-sound').textContent = AudioMan.enabled?'소리':'음소거';

// ---------- 시작 화면 ----------
let selPers = 'random';
let selCh = new Set();
(function buildPersGrid(){
  const chg = $('ch-grid');
  if(chg){ for(const k of Object.keys(CHALLENGES)){
    const c = CHALLENGES[k];
    const b = document.createElement('button');
    b.innerHTML = `<b>${c.icon} ${c.name}</b><span>${c.desc}</span>`;
    b.onclick = ()=>{ if(selCh.has(k)) selCh.delete(k); else selCh.add(k); b.classList.toggle('sel', selCh.has(k)); AudioMan.resume(); AudioMan.play('click',0.5); };
    chg.appendChild(b);
  } }
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
  clearRun();
  G.runId = newRunId();
  applyMetaToRun(META.upg);
  applyPendingBlessings();
  G.bestAtStart = loadRecords().best || 0;
  G.persKey = selPers==='random' ? pick(['balanced','attacker','saver','merger','support','adaptive']) : selPers;
  G.ch = [...selCh].filter(k=>CHALLENGES[k]);
  $('ai-name').textContent = PERSONALITIES[G.persKey].name;
  $('start').style.display='none';
  G.phase='play'; AI.alive=true;
  if(G.ch.length) log(`도전 의식 발동: ${G.ch.map(k=>CHALLENGES[k].name).join('·')} — 기록 별도 저장, 젬 +${25*G.ch.length}%`, 'sys');
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
  // R32: t1이 근접뿐이면 전열 여유가 있어야 소환 배치 가능 — 불가능한 소환을 매 틱 재시도하지 않음
  const freeNow = freeTiles(-1);
  const canSummon = freeNow.some(i=>i<TILE_SECTORS) || UNITS_BY_TIER[1].some(d=>d.kind!=='melee');
  if(canSummon && S.gold >= summonCost(-1) && freeNow.length){ doSummon(-1); return; }
  // 전열 포화로 소환 불가하면 도박이 유일한 성장 경로 — 지급 가능하면 시도(빈 소환 스핀·골드 방치 방지)
  if(!canSummon && S.gold >= GAMBLE_COST && freeNow.length){ doGamble(-1); return; }
  if(S.gold > GAMBLE_COST*2 && rnd()<0.3){ doGamble(-1); return; }
  // 위험 구역 대응: 안전한 구역의 유닛을 위험 구역 빈 타일로 (사람 플레이어 대역)
  const dz = dangerZoneSet();
  const dzP = new Set([...dz].filter(z => (AI.dangerT[z]||0) >= 2));
  if(dzP.size){
    const freePri = [];
    for(let i=0;i<TILES_PER_SIDE;i++){
      if(sideUnitAt(-1,i)) continue;
      if(dzP.has(zoneOfTile(-1, i % TILE_SECTORS))) freePri.push(i);
    }
    const cand = S.units.filter(u=> !dzP.has(u.zone) && zoneCovered(u.zone) && !(u.reposCdT>0));
    for(const u of cand){
      const wantRows = u.def.kind==='melee' ? [0] : [1,2];
      const t = freePri.find(i=> wantRows.includes(Math.floor(i/TILE_SECTORS)));
      if(t!=null){ u.reposCdT = 15; moveUnit(-1, u.tile, t); return; }
    }
  }
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
    if(prepPending){
      prepT -= dt;
      if(prepBoss && !bossWarned && prepT<=3){
        bossWarned = true;
        $('boss-banner').textContent = '보스 웨이브 임박!';
        $('boss-banner').style.display='block'; setTimeout(()=>$('boss-banner').style.display='none', 3000);
        AudioMan.play('boss', 0.5);
      }
      if(prepT<=0){ prepPending=false; prepT=0; startWave(); }
    }
    if(spawnQueue.length){ spawnT -= dt; if(spawnT<=0){ const s=spawnQueue.shift(); spawnEnemy(s.spec, G.wave, s.boss, s.t||0); spawnT = s.boss?1.2:0.30; } }
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
  rawClock += raw;
  for(const [e, a] of [...dmgAgg]){ a.t += raw; if(a.t >= DMG_WINDOW || e.dead) flushDmgAgg(e); }
  for(const d of dmgPool){ if(!d.active) continue; d.t+=raw; d.sp.position.y += raw*1.6; d.sp.material.opacity = 1-d.t/0.85; if(d.t>0.85){ d.active=false; d.sp.visible=false; } }
  if(camBase && shakeT>0){
    shakeT -= raw;
    const m = 0.5 * Math.max(0, shakeT) / SHAKE_DUR;
    camera.position.set(camBase.x + (Math.random()*2-1)*m, camBase.y + (Math.random()*2-1)*m, camBase.z + (Math.random()*2-1)*m*0.6);
    if(shakeT<=0) camera.position.copy(camBase);
  }
  if(!G.dbg._renderOff) renderer.render(scene, camera);
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
    const saved = loadRun();
    if(saved){ restoreRun(saved); }
    else{
      G.bestAtStart = loadRecords().best || 0;
      G.persKey = Q.get('pers') || 'balanced';
      G.ch = (Q.get('ch')||'').split(',').filter(k=>CHALLENGES[k]);
      applyMetaToRun(META.upg);
      applyPendingBlessings();
      $('ai-name').textContent = PERSONALITIES[G.persKey].name;
      $('start').style.display='none'; G.phase='play'; AI.alive=true;
    }
  } else {
    RECOVERED_GEMS = recoverAward();
    showRecords(); renderMetaShop(); setupDataPanel(); $('start').style.display='flex';
    try{ if(sessionStorage.getItem('fd_scroll_shop')==='1'){ sessionStorage.removeItem('fd_scroll_shop'); const ms=$('meta-shop'); if(ms){ ms.scrollIntoView({behavior:'smooth',block:'center'}); ms.classList.add('shop-flash'); setTimeout(()=>ms.classList.remove('shop-flash'), 1800); } } }catch(e){}
    const saved = loadRun();
    if(saved){
      const rb = $('btn-resume');
      rb.style.display='block';
      rb.textContent = `▶ 이어하기 — 웨이브 ${saved.wave} 클리어 지점 (공유 생명 ${saved.lives})`;
      rb.onclick = ()=>{ AudioMan.resume(); AudioMan.play('click',0.5); restoreRun(saved); };
    }
  }
  window.__game = { G, AI, startWave, aiTick, saveRun, loadRun, clearRun, restoreRun, META, exportSave, importSave, restoreBackup, resetSave, loadBackup, backupSave, validRecords, validateRunData, loadMeta, saveMeta, recoverAward, newRunId, applyMetaToRun, SPEC_DEFS, renderMetaShop, doSummon, doGamble, doMerge, spawnUnit, moveUnit, UNITS, tilePos, trackTheta, trackPoint, camera, THREE, tick, enemyZone, unitZones, sectorFull, dmgMul, zoneCovered, dangerZoneSet, aiPriorityZones, togglePing, updateZoneStrip, get prep(){ return { pending: prepPending, t: prepT, boss: prepBoss }; } };
  function loop(){ requestAnimationFrame(loop); tick(); }
  setInterval(()=>{ if(performance.now()-lastTickAt > 200) tick(); }, 200);
  loop();
})();
