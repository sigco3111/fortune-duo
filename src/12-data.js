// ===== 포춘 듀오 게임 데이터 =====
export const TIER_NAMES = ['일반','고급','희귀','영웅','전설'];
export const TIER_COLORS = [0xbfd4c0, 0x6fc3ff, 0xc59bff, 0xffd766, 0xff8a5c];

// 공격 애니메이션 후보(모델별 실제 클립명 기반)
const KAY_ATK = {
  Knight:        ['1H_Melee_Attack_Slice_Diagonal','1H_Melee_Attack_Chop','1H_Melee_Attack_Stab'],
  Barbarian:     ['2H_Melee_Attack_Slice','2H_Melee_Attack_Chop','2H_Melee_Attack_Spin'],
  Mage:          ['Spellcast_Shoot','Spellcast_Long','Spellcast_Raise'],
  Rogue:         ['Dualwield_Melee_Attack_Slice','Dualwield_Melee_Attack_Stab','Dualwield_Melee_Attack_Chop'],
  Rogue_Hooded:  ['Dualwield_Melee_Attack_Stab','Dualwield_Melee_Attack_Slice','1H_Melee_Attack_Stab'],
};
const RPG_ATK = {
  Warrior: ['Sword_Attack','Sword_Attack2'],
  Wizard:  ['Spell1','Spell2','Staff_Attack'],
  Ranger:  ['Bow_Shoot','Bow_Draw'],
  Cleric:  ['Spell1','Staff_Attack'],
  Monk:    ['Attack','Attack2','Punch'],
};

// 유닛 풀: 티어별 2종. dmg/range/interval은 해당 티어 기준.
export const UNITS = [
  { id:'knight',   name:'나이트',   tier:1, model:'3-Knight.glb',      pack:'kay', kind:'melee',  dmg:12, range:2.3, interval:0.9,  h:1.7 },
  { id:'warrior',  name:'전사',     tier:1, model:'9-Warrior.gltf',    pack:'rpg', kind:'melee',  dmg:16, range:2.3, interval:1.15, h:1.7 },
  { id:'rogue',    name:'로그',     tier:2, model:'7-Rogue.glb',       pack:'kay', kind:'melee',  dmg:11, range:2.2, interval:0.42, h:1.7 },
  { id:'ranger',   name:'레인저',   tier:2, model:'6-Ranger.gltf',     pack:'rpg', kind:'ranged', dmg:13, range:6.2, interval:0.75, h:1.7, proj:'arrow' },
  { id:'barbarian',name:'바바리안', tier:3, model:'1-Barbarian.glb',   pack:'kay', kind:'melee',  dmg:30, range:2.5, interval:1.35, h:1.85, splash:1.1 },
  { id:'monk',     name:'몽크',     tier:3, model:'5-Monk.gltf',       pack:'rpg', kind:'melee',  dmg:13, range:2.6, interval:0.62, h:1.7, aoe:true },
  { id:'mage',     name:'메이지',   tier:4, model:'4-Mage.glb',        pack:'kay', kind:'magic',  dmg:26, range:5.6, interval:1.25, h:1.7, splash:1.3, proj:'orb' },
  { id:'cleric',   name:'클레릭',   tier:4, model:'2-Cleric.gltf',     pack:'rpg', kind:'magic',  dmg:16, range:5.2, interval:0.9,  h:1.7, slow:0.4, slowDur:1.6, proj:'holy' },
  { id:'assassin', name:'암살자',   tier:5, model:'8-Rogue_Hooded.glb',pack:'kay', kind:'melee',  dmg:26, range:2.3, interval:0.5,  h:1.7, crit:0.25, critMul:3 },
  { id:'wizard',   name:'위저드',   tier:5, model:'10-Wizard.gltf',     pack:'rpg', kind:'magic',  dmg:46, range:6.2, interval:1.85, h:1.8, splash:1.9, proj:'orbBig' },
];
export const UNITS_BY_TIER = [null,
  UNITS.filter(u=>u.tier===1), UNITS.filter(u=>u.tier===2), UNITS.filter(u=>u.tier===3),
  UNITS.filter(u=>u.tier===4), UNITS.filter(u=>u.tier===5)];
export const ATTACK_ANIMS = {...KAY_ATK, ...RPG_ATK};

// 행운 소환 확률 (T2~T5, 실패)
export const GAMBLE_TABLE = [
  { tier:0, p:0.10, label:'꽝' },
  { tier:2, p:0.47 },
  { tier:3, p:0.27 },
  { tier:4, p:0.12 },
  { tier:5, p:0.04 },
];

// 몬스터 풀 (웨이브 등장 티어별)
export const MONSTERS = {
  1:[ {m:'Chicken',hp:1.0,sp:1.55},{m:'Mushroom',hp:1.25,sp:1.05},{m:'Pig',hp:1.1,sp:1.3} ],
  2:[ {m:'Bat',hp:0.95,sp:1.95,fly:1},{m:'Bee',hp:0.85,sp:2.15,fly:1},{m:'Cactus',hp:1.7,sp:0.9},{m:'Deer',hp:1.25,sp:1.6} ],
  3:[ {m:'Crab',hp:1.9,sp:1.0},{m:'Skull',hp:1.7,sp:1.3},{m:'Ghost',hp:1.55,sp:1.45,fly:1},{m:'Penguin',hp:1.8,sp:1.2} ],
  4:[ {m:'Alien',hp:2.3,sp:1.2},{m:'Cyclops',hp:2.8,sp:0.95},{m:'Demon',hp:2.5,sp:1.1},{m:'GreenDemon',hp:2.5,sp:1.15},{m:'Yeti',hp:3.0,sp:0.9},{m:'Panda',hp:2.1,sp:1.05} ],
};
export const BOSSES = [
  { m:'YellowDragon', hp:30, sp:0.85, fly:1, name:'황금 드래곤', scale:2.1 },
  { m:'Cthulhu',      hp:26, sp:0.8,  fly:1, name:'심연의 크툴루', scale:2.0 },
  { m:'Tree',         hp:36, sp:0.62, fly:0, name:'고대 나무정령', scale:2.3 },
];

export function waveSpec(n){
  const boss = (n % 5 === 0);
  const hpBase = Math.round(20 * Math.pow(1.14, n-1));
  const count = Math.min(7 + n * 2, 32);
  const tierAvail = n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4;
  return { n, boss, hpBase, count, tierAvail,
    killGold: 1 + Math.floor(n/4), clearBonus: 14 + n*3 };
}

// AI 성격 6종
export const PERSONALITIES = {
  random:  { icon:'?', name:'랜덤', desc:'어떤 동료가 올까요?' },
  balanced:{ icon:'균', name:'듬직한 균형파', desc:'소환·합성·도박을 고르게' },
  attacker:{ icon:'공', name:'성급한 공격파', desc:'골드를 모으지 않고 바로바로 투자' },
  saver:   { icon:'저', name:'짠돌이 저축파', desc:'모았다가 고티어 도박에 올인' },
  merger:  { icon:'합', name:'합성 장인', desc:'합성 최우선, 판을 꽉 채움' },
  support: { icon:'지', name:'든든한 지원파', desc:'배치 최적화와 방어 중시' },
  adaptive:{ icon:'적', name:'눈치 빠른 적응파', desc:'상황 보고 전략을 바꿈' },
};

export const AI_LINES = {
  balanced:{ start:['균형이 생명이지. 가보자!','무난하게, 하지만 확실하게.'], summon:['전열을 보강한다.','한 기 더.'], merge:['합성 완료. 효율적이야.','이게 정석이지.'], gambleWin:['계산된 도박이었어.','운? 아니, 확률이지.'], gambleLose:['…기껏 모은 걸.','분산 투자를 했어야 했나.'], boss:['보스다. 침착하게 대응해.'], leak:['내 쪽이 뚫렸다… 미안!'], rare:['오, 좋은 게 나왔어!'] },
  attacker:{ start:['밀어붙여! 전부 건다!','공격이 최선의 방어다!!'], summon:['나와라!! 또!!','더! 더 소환!'], merge:['귀찮지만 합성.','뭉치면 세지!'], gambleWin:['하하하! 대박!!!','이 맛에 도박하지!'], gambleLose:['크윽… 한 번 더!','괜찮아, 다음엔 나온다.'], boss:['보스?! 덤벼라!!'], leak:['앗싸… 아니 앗차!', '한 마리쯤이야!'], rare:['잭팟이다!!'] },
  saver:{ start:['돈은 모으는 거야.','후반을 봐라.'], summon:['최소한으로만…','꼭 필요한 한 기.'], merge:['아까우니 합성이라도.'], gambleWin:['이자 붙었군. 후후.','투자 성공이다.'], gambleLose:['내 골드…!!','…다시 모으면 돼. 흑.'], boss:['비상금 풀 때가 왔나.'], leak:['생명은 환불이 안 된다고…!'], rare:['이건 못 참지. 대박!'] },
  merger:{ start:['판을 채우고 합성한다.','3개 모으면 1개. 단순해.'], summon:['재료 수집 중.','합성 재료다.'], merge:['장인의 손맛.','하나가 둘, 셋이 하나.','이 맛에 합성하지.'], gambleWin:['합성 없이 고티어라니.'], gambleLose:['재료나 더 모을까.'], boss:['합성의 힘을 보여주마.'], leak:['판 짜기에 집중하다 들켰네…'], rare:['오? 좋은 재료… 아니 유닛!'] },
  support:{ start:['네 옆은 내가 지킨다.','무리하지 마, 내가 있잖아.'], summon:['방어선 강화.','빈틈을 메운다.'], merge:['더 든든해졌어.'], gambleWin:['운 좋네! 덕분에 든든해.'], gambleLose:['괜찮아, 수비는 이미 완벽해.'], boss:['보스 조심해! 내 쪽은 걱정 마.'], leak:['미안, 하나 놓쳤어…!'], rare:['좋은 유닛이 왔어. 안심해.'] },
  adaptive:{ start:['상황 보고 움직인다.','일단 지켜보자.'], summon:['지금은 소환 타이밍.'], merge:['이제 합성할 때야.'], gambleWin:['읽었다. 이 판.'], gambleLose:['후퇴도 전략이다.'], boss:['패턴 바꾼다. 집중!'], leak:['전략 수정 중…!'], rare:['상황 종료. 이건 크다.'] },
};

export const SUMMON_BASE = 20, SUMMON_STEP = 2, GAMBLE_COST = 100, START_GOLD = 80, START_LIVES = 30;
