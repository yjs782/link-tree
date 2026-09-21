'use strict';
/* =========================================================
   우주 생존기: 100일 - 전체 게임 로직 (단일 파일)
   ========================================================= */

// ---------- Canvas setup ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize(){
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  buildStars();
}
window.addEventListener('resize', resize);

// ---------- Utility ----------
const TAU = Math.PI * 2;
function rand(a,b){ return a + Math.random()*(b-a); }
function randi(a,b){ return Math.floor(rand(a,b+1)); }
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function dist(x1,y1,x2,y2){ return Math.hypot(x2-x1, y2-y1); }
function pointSegDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1;
  const len2 = dx*dx+dy*dy;
  let t = len2>0 ? ((px-x1)*dx+(py-y1)*dy)/len2 : 0;
  t = Math.max(0,Math.min(1,t));
  return dist(px,py, x1+dx*t, y1+dy*t);
}
function angDiff(a,b){ let d=(b-a)%TAU; if(d>Math.PI) d-=TAU; if(d<-Math.PI) d+=TAU; return d; }
// distance along a unit-direction ray from (ox,oy) to the near edge of a circle (cx,cy,radius),
// or Infinity if the ray never reaches it — used to stop laser beams at a gravity field's edge
function rayCircleDist(ox,oy,dx,dy,cx,cy,radius){
  const ocx = ox-cx, ocy = oy-cy;
  const b = ocx*dx + ocy*dy;
  const c = ocx*ocx + ocy*ocy - radius*radius;
  const disc = b*b - c;
  if(disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  const t2 = -b + sq;
  if(t1 > 0.001) return t1;
  if(t2 > 0.001) return t2;
  return Infinity;
}
function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// ---------- Audio (procedural, no assets) ----------
let audioCtx = null;
let muted = false;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx=null; }
  }
}
function tone(freq, dur, type='sine', vol=0.18, sweepTo=null){
  if(muted || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if(sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1,sweepTo), t0+dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t0); osc.stop(t0+dur+0.02);
}
// synthetic impulse response for a cheap algorithmic reverb tail (no audio assets):
// exponentially-decaying noise fed through a ConvolverNode reads as a booming "울림" echo
function createEarthquakeImpulse(duration=2.4, decay=3.2){
  const rate = audioCtx.sampleRate;
  const length = Math.max(1, Math.floor(rate*duration));
  const impulse = audioCtx.createBuffer(2, length, rate);
  for(let ch=0; ch<2; ch++){
    const data = impulse.getChannelData(ch);
    for(let i=0;i<length;i++){
      data[i] = (Math.random()*2-1) * Math.pow(1 - i/length, decay);
    }
  }
  return impulse;
}
// low rumbling "earthquake" burst: filtered noise + a deep sweeping sine underneath,
// since a plain oscillator tone() can't produce the gritty rumble a death shake needs.
// Everything is routed through a limiter bus so the much louder volume + reverb tail
// reinforce each other instead of clipping into harsh digital noise.
function earthquake(dur=1.4, vol=0.3){
  if(muted || !audioCtx) return;
  const t0 = audioCtx.currentTime;

  const bus = audioCtx.createDynamicsCompressor();
  bus.threshold.setValueAtTime(-22, t0);
  bus.knee.setValueAtTime(6, t0);
  bus.ratio.setValueAtTime(20, t0);
  bus.attack.setValueAtTime(0.003, t0);
  bus.release.setValueAtTime(0.25, t0);
  // makeup gain after the limiter: pushes the now heavily-compressed signal's average
  // level back up near the ceiling, which reads as much louder without clipping
  const makeup = audioCtx.createGain();
  makeup.gain.value = 1.6;
  bus.connect(makeup); makeup.connect(audioCtx.destination);

  const convolver = audioCtx.createConvolver();
  convolver.buffer = createEarthquakeImpulse();
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.85;
  convolver.connect(wetGain); wetGain.connect(bus);

  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(140, t0);
  filter.frequency.exponentialRampToValueAtTime(35, t0+dur);
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(vol, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  noise.connect(filter); filter.connect(noiseGain);
  noiseGain.connect(bus);
  noiseGain.connect(convolver);
  noise.start(t0); noise.stop(t0+dur+0.05);

  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(58, t0);
  osc.frequency.exponentialRampToValueAtTime(24, t0+dur);
  oscGain.gain.setValueAtTime(vol*0.85, t0);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  osc.connect(oscGain);
  oscGain.connect(bus);
  oscGain.connect(convolver);
  osc.start(t0); osc.stop(t0+dur+0.05);
}
const SFX = {
  hit: ()=> tone(180,0.12,'square',0.16,90),
  punch: ()=> tone(320,0.08,'square',0.12,180),
  hurt: ()=> tone(140,0.22,'sawtooth',0.18,60),
  coin: ()=> tone(880,0.09,'sine',0.14,1320),
  die: ()=> tone(220,0.6,'sawtooth',0.2,30),
  quake: ()=> earthquake(1.8,1.6), // much louder still (was 0.9, originally 0.3), heavier limiting + makeup gain keep it from clipping
  launch: ()=> tone(200,0.3,'sine',0.15,700),
  siren: ()=> { tone(500,0.5,'sine',0.15,900); setTimeout(()=>tone(900,0.5,'sine',0.15,500),480); },
  win: ()=> { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,0.35,'triangle',0.16),i*180)); }
};
document.getElementById('muteBtn').addEventListener('click', (e)=>{
  muted = !muted;
  e.target.textContent = muted ? '🔇' : '🔊';
  if(musicGain) musicGain.gain.linearRampToValueAtTime(muted?0:0.05, audioCtx.currentTime+0.2);
});

// ---------- Background music (procedural ambient loop, no audio files needed) ----------
let musicGain = null;
let musicStarted = false;
const MUSIC_CHORDS = [
  [220.00, 261.63, 329.63], // Am
  [174.61, 220.00, 261.63], // F
  [196.00, 246.94, 293.66], // G
  [164.81, 196.00, 246.94], // Cadd? (E3,G3,B3 -> gentle resolve)
];
function playMusicChord(idx){
  if(!audioCtx || !musicGain) return;
  const chord = MUSIC_CHORDS[idx % MUSIC_CHORDS.length];
  const dur = 4.4;
  const t0 = audioCtx.currentTime;
  chord.forEach((freq)=>{
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(1, t0+1.4);
    g.gain.linearRampToValueAtTime(0.0001, t0+dur);
    osc.connect(g); g.connect(musicGain);
    osc.start(t0); osc.stop(t0+dur+0.1);
  });
  setTimeout(()=>playMusicChord(idx+1), dur*1000*0.9);
}
function ensureMusic(){
  if(!audioCtx) return;
  if(!musicGain){
    musicGain = audioCtx.createGain();
    musicGain.gain.value = muted ? 0 : 0.05;
    musicGain.connect(audioCtx.destination);
  }
  if(!musicStarted){
    musicStarted = true;
    playMusicChord(0);
  }
}

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', (e)=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  if(!e.repeat && e.code === 'ArrowUp') onJumpPress();
  if(!e.repeat && e.code === 'Space') onAttackPress();
  keys[e.code] = true;
});
window.addEventListener('keyup', (e)=>{ keys[e.code] = false; });

// ---------- DOM refs ----------
const dom = {
  hud: document.getElementById('hud'),
  dayNum: document.getElementById('dayNum'),
  dayFill: document.getElementById('dayFill'),
  hpFill: document.getElementById('hpFill'),
  goldNum: document.getElementById('goldNum'),
  carryRow: document.getElementById('carryGoldRow'),
  carryNum: document.getElementById('carryNum'),
  weaponLabel: document.getElementById('weaponLabel'),
  shieldLabel: document.getElementById('shieldLabel'),
  invasionBanner: document.getElementById('invasionBanner'),
  invasionCount: document.getElementById('invasionCount'),
  warningBanner: document.getElementById('warningBanner'),
  shopBtn: document.getElementById('shopBtn'),
  endingPreviewBtn: document.getElementById('endingPreviewBtn'),
  helpBtn: document.getElementById('helpBtn'),
  helpModal: document.getElementById('helpModal'),
  playTimeLabel: document.getElementById('playTimeLabel'),
  introDialogue: document.getElementById('introDialogue'),
  startBtn: document.getElementById('startBtn'),
  yearLabel: document.getElementById('yearLabel'),
  skipIntroBtn: document.getElementById('skipIntroBtn'),
  shopModal: document.getElementById('shopModal'),
  shopGold: document.getElementById('shopGold'),
  weaponName: document.getElementById('weaponName'),
  weaponDesc: document.getElementById('weaponDesc'),
  buyWeaponBtn: document.getElementById('buyWeaponBtn'),
  weaponPrice: document.getElementById('weaponPrice'),
  shieldName: document.getElementById('shieldName'),
  shieldDesc: document.getElementById('shieldDesc'),
  buyShieldBtn: document.getElementById('buyShieldBtn'),
  shieldPrice: document.getElementById('shieldPrice'),
  lifeDesc: document.getElementById('lifeDesc'),
  buyLifeBtn: document.getElementById('buyLifeBtn'),
  lifePrice: document.getElementById('lifePrice'),
  closeShopBtn: document.getElementById('closeShopBtn'),
  gameOverOverlay: document.getElementById('gameOverOverlay'),
  goSurvived: document.getElementById('goSurvived'),
  retryBtn: document.getElementById('retryBtn'),
  endingOverlay: document.getElementById('endingOverlay'),
  endText: document.getElementById('endText'),
  endingFinal: document.getElementById('endingFinal'),
  restartBtn: document.getElementById('restartBtn'),
};

// ---------- Starfield (parallax background) ----------
let stars = [];
function buildStars(){
  stars = [];
  const count = Math.floor((W*H)/9000);
  for(let i=0;i<count;i++){
    stars.push({ x: rand(0,4000)-2000, y: rand(0,4000)-2000, r: rand(0.5,2.2), tw: rand(0,TAU), layer: choice([0.2,0.45,0.8]) });
  }
}

// ---------- World constants ----------
const DAY_SECONDS = 30;
const WIN_DAY = 100;
const HOME = { x:0, y:0, r:110, glow:'#4fd1ff', bodyLight:'#8fa2c9', bodyDark:'#333f5c', seed:11, name:'home' };
const ALIEN_PLANETS = [
  { x: 1300, y: -260, r:125, glow:'#7fffb0', bodyLight:'#7fd39a', bodyDark:'#204a30', seed:77, name:'노바 프라임' },
  { x: -1400, y: 500, r:130, glow:'#ff9f5c', bodyLight:'#e0855a', bodyDark:'#5a2410', seed:133, name:'레드 더스트' },
  { x: 600, y: 1600, r:110, glow:'#b98cff', bodyLight:'#9c8cd9', bodyDark:'#2c1f5a', seed:211, name:'바이올렛 프로스트' },
  // 다른 외계 행성보다 1.5배(0.5배 더) 먼 거리, 2배 큰 몸집과 더 강한 중력장을 가진 행성.
  // 이 행성 외계인은 공격력/체력(방어력)/속도가 다른 행성 외계인보다 1.5배(0.5배 더) 강하고,
  // 숫자는 2배(20마리), 공격 쿨타임은 1.5배 빠르다.
  { x: -604, y: -2179, r:260, glow:'#ff5577', bodyLight:'#9c4a5a', bodyDark:'#2a0a12', seed:305, name:'옵시디언 그래비티',
    gravityMult: 3, atkMult: 1.5, defMult: 1.5, spdMult: 1.5, atkCdSpeedMult: 1.5, alienCount: 20, goldPerAlien: 0.5, forceWeapon: 'flamethrower' },
];
const GRAVITY_MULT = 2;
const MONSTER_SCALE = 4;
const MONSTER_CATCH_DIST = 55;

function gravR(p){ return p.r * (p.gravityMult || GRAVITY_MULT); }
function alienGroupFor(planet){ return game.alienGroups.get(planet); }
// how far a laser fired from (x,y) in `angle` can travel before it would enter any
// planet's gravity field — the beam gets cut off there instead of passing through it
function laserGravityClip(x,y,angle,maxRange){
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = maxRange;
  for(const p of [HOME, ...ALIEN_PLANETS]){
    const t = rayCircleDist(x,y,dx,dy,p.x,p.y,gravR(p));
    if(t < best) best = t;
  }
  return Math.max(0, best);
}

// ---------- Game state ----------
let STATE = 'intro'; // intro -> cutscene -> playing -> shop(overlay) -> gameover -> ending
let paused = false;
let lastTime = 0;

let game = null; // populated by resetGame()

function resetGame(){
  game = {
    day: 1,
    dayTimer: 0,
    playTime: 0,
    camera: {x:0,y:0},
    player: {
      x: HOME.x, y: HOME.y - HOME.r - 14,
      theta: -Math.PI/2,
      mode: 'landed', // landed | launching | space
      planetRef: HOME,
      vx:0, vy:0,
      facing: 1,
      hp: 6, maxHp: 6,
      gold: 0, carry: 0,
      weaponTier: 0,
      shieldTier: 0, shieldDur: 0, shieldMax: 0,
      lifeLevel: 0,
      atkCd: 0,
      atkAnim: 0,
      hurtFlash: 0,
      invuln: 0,
      launchGrace: 0,
      launchDir: {x:0,y:-1},
      walkPhase: 0,
      legSwing: 0,
    },
    timeLandedHomeStreak: 0,
    invasion: { active:false, phase:null, timer:0, aliens:[], waveCount:0 },
    boss: null,
    bossCount: 0,
    alienGroups: new Map(ALIEN_PLANETS.map(p=>[p, { aliens:[], clearCount:0, respawnTimer:0, drops:[] }])),
    monsters: [],
    monsterTimer: rand(5,9),
    dogs: [],
    dogTimer: rand(3,6),
    nuggets: [],
    nuggetTimer: rand(2,4),
    laserMonsters: [],
    laserMonsterTimer: rand(3,6),
    whales: [],
    floaters: [], // floating text {x,y,txt,life,color}
    shakeT:0, shakeMag:0,
    fade: 0, // 0..1 black overlay for transitions
    endingSeq: null,
    constellations: generateConstellations(),
  };
}

// ---------- Constellations (big drifting decorative star patterns) ----------
const CONSTELLATION_PATTERNS = [
  { points: [[-80,40],[-40,10],[0,20],[40,-10],[80,-30],[100,10],[60,50]], edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[3,6]] },
  { points: [[-60,0],[-20,-40],[20,0],[60,-40],[100,0]], edges: [[0,1],[1,2],[2,3],[3,4]] },
  { points: [[0,-60],[52,20],[-52,20]], edges: [[0,1],[1,2],[2,0]] },
  { points: [[-50,-50],[50,-50],[50,50],[-50,50],[0,0]], edges: [[0,1],[1,2],[2,3],[3,0],[0,4],[2,4]] },
];
function generateConstellations(){
  const list = [];
  for(let i=0;i<80;i++){
    list.push({
      patternIdx: i % CONSTELLATION_PATTERNS.length,
      x: rand(-6400,7600),
      y: rand(-4400,6400),
      scale: rand(2.4,4.2),
      rot: rand(0,TAU),
      vx: rand(-4,4),
      vy: rand(-4,4),
      twinklePhase: rand(0,TAU),
    });
  }
  return list;
}
function updateConstellations(dt){
  for(const c of game.constellations){
    c.x += c.vx*dt;
    c.y += c.vy*dt;
  }
}
function drawConstellations(){
  for(const c of game.constellations){
    const pat = CONSTELLATION_PATTERNS[c.patternIdx];
    const s = worldToScreen(c.x, c.y);
    if(s.x < -600 || s.x > W+600 || s.y < -600 || s.y > H+600) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(c.rot);
    ctx.scale(c.scale, c.scale);
    ctx.strokeStyle = 'rgba(180,210,255,0.35)';
    ctx.lineWidth = 1.4/c.scale;
    ctx.beginPath();
    for(const [a,b] of pat.edges){
      ctx.moveTo(pat.points[a][0], pat.points[a][1]);
      ctx.lineTo(pat.points[b][0], pat.points[b][1]);
    }
    ctx.stroke();
    const tw = 0.6+0.4*Math.sin(c.twinklePhase + performance.now()*0.0008);
    ctx.fillStyle = `rgba(255,255,255,${0.55*tw})`;
    for(const p of pat.points){
      ctx.beginPath(); ctx.arc(p[0],p[1], 4/c.scale, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- Player geometry helpers ----------
function landedPos(p, planet, theta){
  return {
    x: planet.x + Math.cos(theta)*(planet.r+14),
    y: planet.y + Math.sin(theta)*(planet.r+14)
  };
}

// planets with an unusually large gravity well (custom gravityMult) need proportionally
// more launch thrust, or a single jump can never outrun their pull and the player gets
// stuck bouncing off the surface forever. Never reduces thrust below the normal 210/150
// baseline, so every planet at or below HOME's gravity feels exactly as before.
function launchThrustScale(planet){
  return Math.max(1, Math.sqrt(gravR(planet) / gravR(HOME)));
}

function onJumpPress(){
  if(STATE !== 'playing' || paused) return;
  const pl = game.player;
  if(pl.mode === 'landed'){
    if(pl.planetRef === HOME && (game.invasion.active || game.boss)) return; // locked during invasion/boss fight
    pl.mode = 'launching';
    pl.launchGrace = 0.35;
    // launch straight outward from wherever the player is standing (radial from the
    // planet center through pl.theta). A fixed screen-up direction sends players on the
    // far/bottom side straight through the planet's body before gravity drags them back.
    pl.launchDir = { x: Math.cos(pl.theta), y: Math.sin(pl.theta) };
    const thrust = 210 * launchThrustScale(pl.planetRef);
    pl.vx = pl.launchDir.x * thrust;
    pl.vy = pl.launchDir.y * thrust;
    SFX.launch();
  } else if(pl.mode === 'launching' || pl.mode === 'space'){
    const dir = pl.launchDir || {x:0,y:-1};
    const boost = 150 * launchThrustScale(pl.planetRef);
    pl.vx += dir.x * boost;
    pl.vy += dir.y * boost;
    SFX.launch();
  }
}

function nearestPlanet(x,y){
  const planets = [HOME, ...ALIEN_PLANETS];
  let best=null, bd=Infinity;
  for(const p of planets){
    const d = dist(x,y,p.x,p.y);
    if(d<bd){ bd=d; best=p; }
  }
  return best;
}

function onAttackPress(){
  if(STATE !== 'playing' || paused) return;
  const pl = game.player;
  if(pl.atkCd > 0) return;
  const wpn = WEAPONS[pl.weaponTier];
  pl.atkCd = wpn.cooldown;
  pl.atkAnim = 0.18;
  SFX.punch();
  // find targets: aliens near player (invasion or alien-planet)
  const targets = currentAliens();
  for(const al of targets){
    if(al.dead) continue;
    const d = dist(pl.x,pl.y,al.x,al.y);
    if(d <= wpn.range){
      al.hp -= wpn.dmg;
      spawnFloater(al.x, al.y-20, '-'+wpn.dmg, '#ff8a8a');
      if(al.hp <= 0){
        al.dead = true;
        onAlienKilled(al);
      } else {
        SFX.hit();
      }
    }
  }
  // space dogs: attacking one provokes it into chasing and biting back
  for(const d of game.dogs){
    if(d.dead) continue;
    const dd = dist(pl.x,pl.y,d.x,d.y);
    if(dd <= wpn.range){
      d.hp -= wpn.dmg;
      d.hurtFlash = 0.3;
      d.aggro = true;
      spawnFloater(d.x, d.y-16, '-'+wpn.dmg, '#ffb3b3');
      if(d.hp <= 0){
        d.dead = true;
        spawnFloater(d.x, d.y-16, '처치!', '#ffd166');
      } else {
        SFX.hit();
      }
    }
  }
  game.dogs = game.dogs.filter(d=>!d.dead);

  // laser turret monsters
  for(const m of game.laserMonsters){
    if(m.dead) continue;
    const dd = dist(pl.x,pl.y,m.x,m.y);
    if(dd <= wpn.range){
      m.hp -= wpn.dmg;
      m.hurtFlash = 0.3;
      spawnFloater(m.x, m.y-20, '-'+wpn.dmg, '#ffb3b3');
      if(m.hp <= 0){
        m.dead = true;
        spawnFloater(m.x, m.y-20, '파괴!', '#ffd166');
      } else {
        SFX.hit();
      }
    }
  }
  game.laserMonsters = game.laserMonsters.filter(m=>!m.dead);

  // boss
  if(game.boss){
    const b = game.boss;
    const dd = dist(pl.x,pl.y,b.x,b.y);
    if(dd <= wpn.range){
      b.hp -= wpn.dmg;
      b.hurtFlash = 0.3;
      spawnFloater(b.x, b.y-40, '-'+wpn.dmg, '#ff8a8a');
      if(b.hp <= 0){
        spawnFloater(b.x, b.y-50, '보스 처치!', '#ffd166');
        dom.invasionBanner.classList.add('hidden');
        game.boss = null;
        game.timeLandedHomeStreak = 0;
      } else {
        SFX.hit();
      }
    }
  }
}

function currentAliens(){
  if(game.invasion.active) return game.invasion.aliens;
  if(ALIEN_PLANETS.includes(game.player.planetRef)) return alienGroupFor(game.player.planetRef).aliens;
  return [];
}

function onAlienKilled(al){
  if(al.source === 'invasion'){
    // no direct drop during invasion defense
  } else if(al.source === 'alienplanet'){
    const value = al.planet.goldPerAlien || 1;
    alienGroupFor(al.planet).drops.push({ x: al.x, y: al.y, value, taken:false });
  }
}

function spawnFloater(x,y,txt,color){
  game.floaters.push({x,y,txt,color,life:1.0});
}

// ---------- Weapons / Shield / Life economy ----------
const WEAPONS = [
  { name:'맨주먹', icon:'🥊', dmg:1, range:40, cooldown:0.45 },
  { name:'돌', icon:'🪨', dmg:2, range:110, cooldown:0.5 },
  { name:'새총', icon:'🎯', dmg:3, range:150, cooldown:0.4 },
  { name:'활', icon:'🏹', dmg:4, range:210, cooldown:0.55 },
  { name:'화염방사기', icon:'🔥', dmg:5, range:110, cooldown:0.18 },
  { name:'기관총', icon:'🔫', dmg:7, range:230, cooldown:0.13 },
  { name:'폭탄', icon:'💣', dmg:10, range:200, cooldown:0.9 },
  { name:'미사일', icon:'🚀', dmg:14, range:280, cooldown:0.75 },
];
function weaponPrice(tier){ return Math.max(1, Math.round(6 * Math.pow(1.7, tier)) - 1); }
function shieldCapacity(tier){ return tier<=0?0: (1 + tier); }
function shieldPrice(tier){ return Math.max(1, Math.round(9 * Math.pow(1.65, tier)) - 1); }
function lifePrice(level){ return Math.max(1, Math.round(7 * Math.pow(1.55, level)) - 1); }

// ---------- Physics / update ----------
function updatePlayerLandedAngularSpeed(planet){
  return 1.6 * (110/planet.r);
}

function updatePlaying(dt){
  const pl = game.player;

  game.playTime += dt;

  // day timer
  game.dayTimer += dt;
  if(game.dayTimer >= DAY_SECONDS){
    game.dayTimer -= DAY_SECONDS;
    game.day += 1;
    if(game.day > WIN_DAY){ startEnding(); return; }
    // laser whales only ever last the day they appeared on; a new day always clears the
    // whole pod (whether still hunting the player or already fleeing), even if the next
    // day is about to spawn a fresh pod
    if(game.whales.length) game.whales = [];
    if(game.day % 3 === 0 && pl.hp < pl.maxHp){
      const heal = Math.ceil(pl.maxHp/3);
      pl.hp = Math.min(pl.maxHp, pl.hp + heal);
      spawnFloater(pl.x, pl.y-40, `+${heal} 에너지 충전`, '#8ad4ff');
      SFX.coin();
    }
    if(game.day % 10 === 0 && !game.boss){
      startBoss();
    }
    if(game.day % 2 === 0 && game.whales.length===0){
      spawnWhalePod();
    }
  }

  if(pl.atkCd>0) pl.atkCd = Math.max(0, pl.atkCd-dt);
  if(pl.atkAnim>0) pl.atkAnim = Math.max(0, pl.atkAnim-dt);
  if(pl.hurtFlash>0) pl.hurtFlash = Math.max(0, pl.hurtFlash-dt);
  if(pl.invuln>0) pl.invuln = Math.max(0, pl.invuln-dt);

  const speedMult = pl.carry>0 ? 0.9 : 1.0;

  // ----- movement -----
  if(pl.mode === 'landed'){
    const angSpeed = updatePlayerLandedAngularSpeed(pl.planetRef) * speedMult;
    const moving = keys['ArrowLeft'] || keys['ArrowRight'];
    if(keys['ArrowLeft']){ pl.theta -= angSpeed*dt; pl.facing=-1; }
    if(keys['ArrowRight']){ pl.theta += angSpeed*dt; pl.facing=1; }
    const pos = landedPos(pl, pl.planetRef, pl.theta);
    pl.x = pos.x; pl.y = pos.y;
    if(moving) pl.walkPhase += dt*14;
    const legTarget = moving ? Math.sin(pl.walkPhase)*7 : 0;
    pl.legSwing = lerp(pl.legSwing, legTarget, clamp(dt*12,0,1));

    if(pl.planetRef === HOME){
      game.timeLandedHomeStreak += dt;
      if(pl.carry > 0){
        spawnFloater(pl.x, pl.y-30, '+'+pl.carry.toFixed(1)+'🪙', '#ffd166');
        pl.gold += pl.carry;
        pl.carry = 0;
        SFX.coin();
      }
      if(!game.invasion.active && game.timeLandedHomeStreak >= DAY_SECONDS*2){
        startInvasion();
      }
    } else if(ALIEN_PLANETS.includes(pl.planetRef)){
      // collect drops on contact
      for(const d of alienGroupFor(pl.planetRef).drops){
        if(!d.taken && dist(pl.x,pl.y,d.x,d.y) < 26){
          d.taken = true;
          pl.carry += d.value;
          spawnFloater(pl.x, pl.y-24, '+'+d.value+'🪙', '#ffd166');
          SFX.coin();
        }
      }
    }
  } else if(pl.mode === 'launching' || pl.mode === 'space'){
    pl.legSwing = lerp(pl.legSwing, 0, clamp(dt*8,0,1));
    const accel = 420 * speedMult;
    const anyDirKey = keys['ArrowLeft']||keys['ArrowRight']||keys['ArrowUp']||keys['ArrowDown'];
    if(pl.mode === 'launching'){
      // still inside a planet's gravity well: any directional key keeps thrusting away
      // from the planet (opposite the direction it's pulling you back), not screen-locked,
      // so you can't accidentally steer yourself back into the surface
      if(anyDirKey){
        const dir = pl.launchDir || {x:0,y:-1};
        pl.vx += dir.x*accel*dt;
        pl.vy += dir.y*accel*dt;
        pl.facing = dir.x < 0 ? -1 : 1;
      }
    } else {
      // free space: each key maps straight to its screen direction
      if(keys['ArrowLeft']){ pl.vx -= accel*dt; pl.facing=-1; }
      if(keys['ArrowRight']){ pl.vx += accel*dt; pl.facing=1; }
      if(keys['ArrowDown']){ pl.vy += accel*dt; }
      if(keys['ArrowUp']){ pl.vy -= accel*dt; }
    }
    // drag (equal on both axes so left/right doesn't feel weaker than up/down)
    pl.vx *= (1 - Math.min(1,0.7*dt));
    pl.vy *= (1 - Math.min(1,0.7*dt));

    if(pl.launchGrace > 0) pl.launchGrace = Math.max(0, pl.launchGrace - dt);

    // gravity pull only fights the player while still escaping (launching); once
    // truly in open space, key input moves you freely and gravity only auto-lands you
    const planets = [HOME, ...ALIEN_PLANETS];
    let landedNow = null;
    for(const p of planets){
      const d = dist(pl.x,pl.y,p.x,p.y);
      if(d < gravR(p)){
        if(pl.mode === 'launching'){
          const pull = 340 * (1 - d/gravR(p));
          const nx = (p.x-pl.x)/Math.max(1,d), ny=(p.y-pl.y)/Math.max(1,d);
          pl.vx += nx*pull*dt;
          pl.vy += ny*pull*dt;
        }
        if(d <= p.r+6 && pl.launchGrace <= 0){
          landedNow = p;
        }
      }
    }
    const maxSpd = 420*speedMult;
    const sp = Math.hypot(pl.vx,pl.vy);
    if(sp>maxSpd){ pl.vx = pl.vx/sp*maxSpd; pl.vy=pl.vy/sp*maxSpd; }

    pl.x += pl.vx*dt;
    pl.y += pl.vy*dt;

    const nearest = nearestPlanet(pl.x,pl.y);
    const dNearest = nearest? dist(pl.x,pl.y,nearest.x,nearest.y) : Infinity;

    if(landedNow){
      pl.mode = 'landed';
      pl.planetRef = landedNow;
      pl.theta = Math.atan2(pl.y-landedNow.y, pl.x-landedNow.x);
      pl.vx = 0; pl.vy = 0;
      if(landedNow === HOME) game.timeLandedHomeStreak = 0;
      if(ALIEN_PLANETS.includes(landedNow)) ensureAlienPlanetGroup(landedNow);
    } else if(dNearest > gravR(nearest||HOME)*1.05 && pl.mode==='launching'){
      pl.mode = 'space';
    }

    // only counts as "leaving home" once you actually reach open space,
    // so a failed jump attempt near the surface doesn't reset the invasion timer
    if(pl.mode === 'space' && pl.planetRef === HOME) game.timeLandedHomeStreak = 0;
  }

  // ----- invasion logic -----
  updateInvasion(dt);
  // ----- boss -----
  updateBoss(dt);
  // ----- alien planet group -----
  updateAlienPlanetGroup(dt);
  // ----- monsters -----
  updateMonsters(dt);
  // ----- space dogs -----
  updateDogs(dt);
  // ----- laser monsters -----
  updateLaserMonsters(dt);
  // ----- big whale pod -----
  updateWhales(dt);
  // ----- constellations -----
  updateConstellations(dt);
  // ----- nuggets -----
  updateNuggets(dt);
  // ----- floaters -----
  for(const f of game.floaters){ f.life -= dt*0.9; f.y -= dt*22; }
  game.floaters = game.floaters.filter(f=>f.life>0);

  if(game.shakeT>0) game.shakeT -= dt;
  if(game.fade>0) game.fade = Math.max(0, game.fade - dt*1.4);

  // camera follows player
  game.camera.x = pl.x;
  game.camera.y = pl.y;

  syncHUD();
}

function difficultyFrac(){ return clamp(game.day / WIN_DAY, 0, 1); }

const ALIEN_WEAPONS = ['claw','laser','whip','spike','blaster'];
const ALIEN_MELEE_RANGE = 0.16; // default angular attack range
const ALIEN_RANGED_RANGE = 0.55; // wide angular attack range for a ranged unit
const FLAMETHROWER_RANGE = 0.42; // flamethrower reaches farther than melee weapons
const FLAMETHROWER_DMG_MULT = 1.4; // flamethrower hits harder too
function makeAlien(planet, theta, source, waveBonus=0, role='normal'){
  const df = difficultyFrac();
  const wb = Math.min(waveBonus, 12); // cap so repeated re-invasions don't spiral forever
  const atkMult = planet.atkMult || 1;
  const defMult = planet.defMult || 1;
  const spdMult = planet.spdMult || 1;
  const cdMult = 1 / (planet.atkCdSpeedMult || 1); // faster cooldown speed = smaller cooldown time
  const atkMin = Math.max(0.35, 0.9 - wb*0.05) * cdMult;
  const atkMax = Math.max(0.6, 1.6 - wb*0.08) * cdMult;
  const isBoss = role === 'boss';
  const isRanged = role === 'ranged';
  // the planet's dedicated ranged unit fights with a bow, unless the planet forces its own weapon
  const weapon = planet.forceWeapon || (isRanged ? 'bow' : choice(ALIEN_WEAPONS));
  let hp = Math.round((Math.round(lerp(2,5,df)) + wb) * defMult);
  let dmg = Math.round((Math.round(lerp(1,2,df)) + Math.floor(wb/2)) * atkMult);
  if(weapon === 'flamethrower') dmg = Math.round(dmg * FLAMETHROWER_DMG_MULT);
  if(isBoss){ hp = Math.round(hp * 3); dmg = Math.round(dmg * 1.6); }
  let atkRange = weapon === 'flamethrower' ? FLAMETHROWER_RANGE : ALIEN_MELEE_RANGE;
  if(isRanged) atkRange = Math.max(atkRange, ALIEN_RANGED_RANGE);
  return {
    x:0, y:0, theta,
    planet,
    hp, maxHp: hp,
    dmg,
    speed: (lerp(0.55,0.95,df) + wb*0.02) * spdMult,
    atkCd: rand(0.5,1.2) * cdMult,
    atkMin, atkMax,
    atkRange,
    weapon,
    isBoss, isRanged,
    attackFlash: 0,
    dead:false,
    source,
    hurtFlash:0,
  };
}

function startInvasion(){
  game.invasion.active = true;
  game.invasion.phase = 'warning';
  game.invasion.timer = 2.2;
  dom.warningBanner.classList.remove('hidden');
  SFX.siren();
  ensureAudio();
  const wave = game.invasion.waveCount;
  game.invasion.waveCount += 1;
  const count = Math.min(5 + Math.floor(wave/2), 12); // more aliens with each re-invasion, capped
  const aliens = [];
  for(let i=0;i<count;i++){
    const theta = game.player.theta + rand(0.8,2.2) * choice([1,-1]);
    const al = makeAlien(HOME, theta, 'invasion', wave);
    const pos = landedPos({}, HOME, theta);
    al.x = pos.x; al.y = pos.y;
    aliens.push(al);
  }
  game.invasion.aliens = aliens;
  dom.invasionBanner.classList.remove('hidden');
  dom.invasionCount.textContent = `외계인 ${count}마리 접근 중...`;
}

function updateInvasion(dt){
  const inv = game.invasion;
  if(!inv.active) return;
  if(inv.phase === 'warning'){
    inv.timer -= dt;
    if(inv.timer<=0){
      inv.phase = 'fighting';
      dom.warningBanner.classList.add('hidden');
    }
    return;
  }
  if(inv.phase === 'fighting'){
    const alive = inv.aliens.filter(a=>!a.dead);
    dom.invasionCount.textContent = `남은 외계인: ${alive.length}마리`;
    for(const al of alive){
      const diff = angDiff(al.theta, game.player.theta);
      const dirSign = diff>0?1:-1;
      const closeEnough = Math.abs(diff) < 0.16;
      if(!closeEnough){
        al.theta += dirSign * al.speed * 0.9 * dt;
      } else {
        al.atkCd -= dt;
        if(al.atkCd<=0){
          al.atkCd = rand(al.atkMin, al.atkMax);
          al.attackFlash = 0.25;
          damagePlayer(al.dmg);
        }
      }
      const pos = landedPos({}, HOME, al.theta);
      al.x = pos.x; al.y = pos.y;
      if(al.hurtFlash>0) al.hurtFlash -= dt;
      if(al.attackFlash>0) al.attackFlash -= dt;
    }
    if(alive.length===0){
      inv.active = false;
      inv.phase = null;
      dom.invasionBanner.classList.add('hidden');
      game.timeLandedHomeStreak = 0;
      spawnFloater(game.player.x, game.player.y-40, '침공 격퇴!', '#7cf7ff');
    }
  }
}

// ---------- Boss (every 10th day, forces the player home) ----------
function startBoss(){
  const pl = game.player;
  // forcibly warp the player back to base
  pl.mode = 'landed';
  pl.planetRef = HOME;
  pl.vx = 0; pl.vy = 0;
  const pos = landedPos(pl, HOME, pl.theta);
  pl.x = pos.x; pl.y = pos.y;
  game.timeLandedHomeStreak = 0;

  const wave = game.bossCount;
  game.bossCount += 1;
  const hp = 40 + wave*20; // drastically higher than the old 5+wave*3 so the boss feels like a real fight
  const dmg = 14 + wave*3;
  const speed = Math.min(1.3, 0.55 + wave*0.08);
  const atkMin = Math.max(0.6, 1.1 - wave*0.08);
  const atkMax = Math.max(0.9, 1.8 - wave*0.1);

  const bossTheta = pl.theta + Math.PI;
  const bpos = landedPos({}, HOME, bossTheta);
  game.boss = {
    theta: bossTheta, x: bpos.x, y: bpos.y,
    hp, maxHp: hp, dmg,
    speed,
    atkCd: 1.4,
    atkMin, atkMax,
    hurtFlash: 0, attackFlash: 0,
    weapon: 'blaster',
  };
  SFX.siren();
  ensureAudio();
  spawnFloater(pl.x, pl.y-50, '보스 출현!', '#ff3b3b');
  dom.invasionBanner.classList.remove('hidden');
  dom.invasionCount.textContent = `BOSS 체력: ${game.boss.hp}/${game.boss.maxHp}`;
}

function updateBoss(dt){
  const b = game.boss;
  if(!b) return;
  const pl = game.player;
  if(b.hurtFlash>0) b.hurtFlash -= dt;
  if(b.attackFlash>0) b.attackFlash -= dt;
  const diff = angDiff(b.theta, pl.theta);
  const dirSign = diff>0?1:-1;
  const closeEnough = Math.abs(diff) < 0.18;
  if(!closeEnough){
    b.theta += dirSign * b.speed * dt;
  } else {
    b.atkCd -= dt;
    if(b.atkCd<=0){
      b.atkCd = rand(b.atkMin, b.atkMax);
      b.attackFlash = 0.3;
      damagePlayer(b.dmg);
    }
  }
  const pos = landedPos({}, HOME, b.theta);
  b.x = pos.x; b.y = pos.y;
  dom.invasionCount.textContent = `BOSS 체력: ${b.hp}/${b.maxHp}`;
}

function ensureAlienPlanetGroup(planet){
  const g = alienGroupFor(planet);
  if(g.aliens.length===0 && g.respawnTimer<=0){
    const count = planet.alienCount || 5;
    g.aliens = [];
    for(let i=0;i<count;i++){
      const theta = rand(0,TAU);
      // every alien planet gets exactly 1 boss and 1 ranged alien among its group
      const role = i===0 ? 'boss' : (i===1 ? 'ranged' : 'normal');
      g.aliens.push(makeAlien(planet, theta, 'alienplanet', g.clearCount, role));
    }
  }
}

function updateAlienPlanetGroup(dt){
  for(const planet of ALIEN_PLANETS){
    const g = alienGroupFor(planet);
    const onPlanet = game.player.mode==='landed' && game.player.planetRef===planet;
    const alive = g.aliens.filter(a=>!a.dead);
    if(onPlanet){
      for(const al of alive){
        const diff = angDiff(al.theta, game.player.theta);
        const dirSign = diff>0?1:-1;
        const closeEnough = Math.abs(diff) < (al.atkRange || ALIEN_MELEE_RANGE);
        if(!closeEnough){
          al.theta += dirSign * al.speed * 0.85 * dt;
        } else {
          al.atkCd -= dt;
          if(al.atkCd<=0){
            al.atkCd = rand(al.atkMin, al.atkMax);
            al.attackFlash = 0.25;
            damagePlayer(al.dmg);
          }
        }
        const pos = landedPos({}, planet, al.theta);
        al.x=pos.x; al.y=pos.y;
        if(al.hurtFlash>0) al.hurtFlash -= dt;
        if(al.attackFlash>0) al.attackFlash -= dt;
      }
    } else {
      for(const al of g.aliens){
        const pos = landedPos({}, planet, al.theta);
        al.x=pos.x; al.y=pos.y;
      }
    }
    if(alive.length===0 && g.aliens.length>0){
      g.aliens = [];
      g.respawnTimer = 30;
      g.clearCount += 1;
      spawnFloater(planet.x, planet.y - planet.r - 20, '외계 행성 제압!', '#7fffb0');
    }
    if(g.respawnTimer>0){
      g.respawnTimer -= dt;
      if(g.respawnTimer<=0) ensureAlienPlanetGroup(planet);
    }
  }
  // drop lifetime cleanup not necessary; keep drops until taken
}

function damagePlayer(dmg){
  const pl = game.player;
  if(pl.invuln>0) return;
  if(pl.shieldDur>0){
    pl.shieldDur -= 1;
    spawnFloater(pl.x,pl.y-30,'보호막!','#8ad4ff');
  } else {
    pl.hp -= dmg;
    pl.hurtFlash = 0.35;
    SFX.hurt();
    game.shakeT = 0.25; game.shakeMag = 8;
  }
  pl.invuln = 0.4;
  if(pl.hp<=0){
    pl.hp = 0;
    triggerGameOver();
  }
}

function updateMonsters(dt){
  const pl = game.player;
  game.monsterTimer -= dt;
  if(pl.mode==='space' && game.monsterTimer<=0){
    const df = difficultyFrac();
    game.monsterTimer = Math.max(4, rand(9,15) - df*9);
    spawnMonster();
  }
  for(const m of game.monsters){
    m.phase += dt*4;
    if(m.hurtT > 0) m.hurtT -= dt;
    if(m.fleeing){
      // scared off for good: keeps bolting away and eventually vanishes
      m.fleeTimer -= dt;
      m.x += m.fleeDir.x * m.speed * 2.2 * dt;
      m.y += m.fleeDir.y * m.speed * 2.2 * dt;
    } else {
      const dx = pl.x-m.x, dy = pl.y-m.y;
      const d = Math.max(1,Math.hypot(dx,dy));
      const sp = m.speed;
      m.x += dx/d*sp*dt;
      m.y += dy/d*sp*dt;
      if(d < MONSTER_CATCH_DIST){
        triggerGameOver(true);
      }
      // touching a gravity field burns it and scares it off permanently
      for(const p of [HOME, ...ALIEN_PLANETS]){
        const gd = dist(m.x,m.y,p.x,p.y);
        const gr = gravR(p);
        if(gd < gr){
          const nx = (m.x-p.x)/Math.max(1,gd), ny=(m.y-p.y)/Math.max(1,gd);
          m.x = p.x + nx*gr;
          m.y = p.y + ny*gr;
          m.fleeing = true;
          m.fleeTimer = 5;
          m.hurtT = 1.2;
          m.fleeDir = {x:nx, y:ny};
          SFX.hurt();
          break;
        }
      }
    }
  }
  // fled monsters vanish once they've bolted far enough; others culled if extremely far
  game.monsters = game.monsters.filter(m=>{
    if(m.fleeing && (m.fleeTimer<=0 || dist(m.x,m.y,pl.x,pl.y) > 2000)) return false;
    return dist(m.x,m.y,pl.x,pl.y) < 3000;
  });
}

function spawnMonster(){
  const pl = game.player;
  const ang = rand(0,TAU);
  const r = Math.max(W,H)*0.75;
  const df = difficultyFrac();
  game.monsters.push({
    x: pl.x + Math.cos(ang)*r,
    y: pl.y + Math.sin(ang)*r,
    speed: lerp(160,260,df),
    phase: rand(0,TAU),
    hurtT: 0,
    fleeing: false,
    fleeTimer: 0,
    fleeDir: {x:0,y:-1},
  });
}

function spawnSpaceDog(){
  const pl = game.player;
  const ang = rand(0,TAU);
  const r = Math.max(W,H)*0.6;
  game.dogs.push({
    x: pl.x + Math.cos(ang)*r,
    y: pl.y + Math.sin(ang)*r,
    vx: rand(-30,30), vy: rand(-30,30),
    hp: 3, maxHp: 3, dmg: 1,
    aggro: false,
    atkCd: 0,
    phase: rand(0,TAU),
    hurtFlash: 0,
  });
}

function updateDogs(dt){
  const pl = game.player;
  game.dogTimer -= dt;
  if(pl.mode==='space' && game.dogTimer<=0){
    game.dogTimer = rand(6,10);
    const count = randi(2,3);
    for(let i=0;i<count;i++) spawnSpaceDog();
  }
  for(const d of game.dogs){
    d.phase += dt*3;
    if(d.hurtFlash>0) d.hurtFlash -= dt;
    if(d.aggro){
      // provoked: chases the player and bites on contact
      const dx = pl.x-d.x, dy = pl.y-d.y;
      const dd = Math.max(1, Math.hypot(dx,dy));
      const sp = 140;
      d.x += dx/dd*sp*dt;
      d.y += dy/dd*sp*dt;
      if(dd < 26){
        d.atkCd -= dt;
        if(d.atkCd<=0){
          d.atkCd = 1.0;
          damagePlayer(d.dmg);
        }
      }
    } else {
      // passive: just drifts
      d.x += d.vx*dt;
      d.y += d.vy*dt;
    }
  }
  // dogs vanish the instant they drift into any planet's gravity field
  game.dogs = game.dogs.filter(d=>{
    for(const p of [HOME, ...ALIEN_PLANETS]){
      if(dist(d.x,d.y,p.x,p.y) < gravR(p)) return false;
    }
    return dist(d.x,d.y,pl.x,pl.y) < 3000;
  });
}

// ---------- Laser monsters (stationary turret hazards scattered across the map) ----------
const MAX_LASER_MONSTERS = 14; // halved from 28 per request to thin out the laser turret population
const LASER_RANGE = 560;
function randomLaserSpot(){
  const planets = [HOME, ...ALIEN_PLANETS];
  let x=0,y=0,ok=false,tries=0;
  while(!ok && tries<20){
    x = rand(-3600,3600);
    y = rand(-3600,3600);
    ok = true;
    for(const p of planets){
      if(dist(x,y,p.x,p.y) < gravR(p)+300){ ok=false; break; }
    }
    tries++;
  }
  return {x,y};
}
function spawnLaserMonster(){
  const spot = randomLaserSpot();
  game.laserMonsters.push({
    x: spot.x, y: spot.y,
    hp: 6, maxHp: 6,
    range: LASER_RANGE,
    beamLen: LASER_RANGE,
    state: 'idle', stateT: 0,
    aimAngle: 0,
    fired: false,
    hurtFlash: 0,
    dead: false,
    phase: rand(0,TAU),
  });
}
function updateLaserMonsters(dt){
  const pl = game.player;
  const df = difficultyFrac();
  game.laserMonsterTimer -= dt;
  if(game.laserMonsterTimer<=0 && game.laserMonsters.filter(m=>!m.dead).length < MAX_LASER_MONSTERS){
    game.laserMonsterTimer = Math.max(3, rand(6,11) - df*4);
    spawnLaserMonster();
  }
  for(const m of game.laserMonsters){
    if(m.dead) continue;
    if(m.hurtFlash>0) m.hurtFlash -= dt;
    m.phase += dt*1.6;
    const d = dist(pl.x,pl.y,m.x,m.y);
    if(m.state==='idle'){
      if(d < m.range){
        m.state = 'charging';
        m.stateT = Math.max(0.4, 0.85 - df*0.3);
        m.aimAngle = Math.atan2(pl.y-m.y, pl.x-m.x);
        // the beam can't reach past a gravity field, so it's cut short there
        m.beamLen = laserGravityClip(m.x, m.y, m.aimAngle, m.range);
      }
    } else if(m.state==='charging'){
      m.stateT -= dt;
      if(m.stateT<=0){
        m.state = 'firing';
        m.stateT = 0.18;
        m.fired = false;
      }
    } else if(m.state==='firing'){
      if(!m.fired){
        m.fired = true;
        const endX = m.x + Math.cos(m.aimAngle)*m.beamLen;
        const endY = m.y + Math.sin(m.aimAngle)*m.beamLen;
        const hitDist = pointSegDist(pl.x,pl.y, m.x,m.y, endX,endY);
        if(hitDist < 26){
          const dmg = Math.round(lerp(2,4,df));
          damagePlayer(dmg);
          spawnFloater(pl.x, pl.y-30, '레이저 피격!', '#ff5c5c');
        }
        SFX.hit();
      }
      m.stateT -= dt;
      if(m.stateT<=0){ m.state='cooldown'; m.stateT = rand(1.6,2.4); }
    } else if(m.state==='cooldown'){
      m.stateT -= dt;
      if(m.stateT<=0) m.state = 'idle';
    }
  }
  game.laserMonsters = game.laserMonsters.filter(m=>!m.dead);
}

// ---------- Big whale pod (shows up every 2nd day, chases the player and snipes with a laser; each whale bolts the moment it grazes a planet's gravity field) ----------
const WHALE_RANGE = 620;
const WHALE_SCALE = 3; // visual body size multiplier
const WHALE_POD_MIN = 3, WHALE_POD_MAX = 5; // spawn a whole pod instead of a single whale
const WHALE_LASER_SPEED = 600; // world units/sec the beam tip travels at (was 420), instead of an instant hitscan
function spawnWhale(){
  const pl = game.player;
  const ang = rand(0,TAU);
  const r = Math.max(W,H)*0.9 + rand(-120,220);
  const w = {
    x: pl.x + Math.cos(ang)*r,
    y: pl.y + Math.sin(ang)*r,
    speed: 95,
    range: WHALE_RANGE,
    state: 'idle', stateT: 0,
    aimAngle: 0,
    fired: false,
    beamDist: 0,
    beamMax: WHALE_RANGE,
    hurtFlash: 0,
    fleeing: false, fleeTimer: 0, fleeDir: {x:0,y:-1},
    phase: rand(0,TAU),
  };
  game.whales.push(w);
  return w;
}
function spawnWhalePod(){
  const pl = game.player;
  const count = randi(WHALE_POD_MIN, WHALE_POD_MAX);
  for(let i=0;i<count;i++) spawnWhale();
  spawnFloater(pl.x, pl.y-60, `큰고래 무리 출현! (${count}마리)`, '#7cf7ff');
}
function updateWhale(w, dt){
  const pl = game.player;
  w.phase += dt*1.1;
  if(w.hurtFlash>0) w.hurtFlash -= dt;

  if(w.fleeing){
    w.fleeTimer -= dt;
    w.x += w.fleeDir.x * w.speed*2.4*dt;
    w.y += w.fleeDir.y * w.speed*2.4*dt;
    if(w.fleeTimer<=0 || dist(w.x,w.y,pl.x,pl.y) > 3400){
      w.gone = true;
    }
    return;
  }

  const df = difficultyFrac();
  const d = dist(pl.x,pl.y,w.x,w.y);
  if(d > w.range*0.7){
    const dx=pl.x-w.x, dy=pl.y-w.y, dd=Math.max(1,Math.hypot(dx,dy));
    w.x += dx/dd*w.speed*dt;
    w.y += dy/dd*w.speed*dt;
  }

  // touching any planet's gravity field (the dashed line) scares it off immediately: checked
  // right after movement and before the attack state machine, so contact always pre-empts
  // that frame's charge/fire instead of letting one more shot slip out first
  for(const p of [HOME, ...ALIEN_PLANETS]){
    const gd = dist(w.x,w.y,p.x,p.y);
    const gr = gravR(p);
    if(gd <= gr){
      const nx = (w.x-p.x)/Math.max(1,gd), ny = (w.y-p.y)/Math.max(1,gd);
      w.x = p.x + nx*gr;
      w.y = p.y + ny*gr;
      w.fleeing = true;
      w.fleeTimer = 5;
      w.fleeDir = {x:nx, y:ny};
      SFX.hurt();
      return;
    }
  }

  if(w.state==='idle'){
    if(d < w.range){
      w.state = 'charging';
      w.stateT = Math.max(0.5, 0.9 - df*0.3);
      w.aimAngle = Math.atan2(pl.y-w.y, pl.x-w.x);
    }
  } else if(w.state==='charging'){
    w.aimAngle = Math.atan2(pl.y-w.y, pl.x-w.x);
    w.stateT -= dt;
    if(w.stateT<=0){
      w.state='firing';
      // the beam can't reach past a gravity field, so it's cut short there
      w.beamMax = laserGravityClip(w.x, w.y, w.aimAngle, w.range);
      // firing lasts as long as the (possibly shortened) beam takes to cross it, plus a short linger
      w.stateT = w.beamMax/WHALE_LASER_SPEED + 0.2;
      w.fired=false;
      w.beamDist = 0;
    }
  } else if(w.state==='firing'){
    if(!w.fired){
      // the beam tip travels outward instead of hitting instantly, so the player has time to dodge it
      w.beamDist = Math.min(w.beamMax, w.beamDist + WHALE_LASER_SPEED*dt);
      const tipX = w.x + Math.cos(w.aimAngle)*w.beamDist;
      const tipY = w.y + Math.sin(w.aimAngle)*w.beamDist;
      const hitDist = pointSegDist(pl.x,pl.y, w.x,w.y, tipX,tipY);
      if(hitDist < 28){
        w.fired = true;
        damagePlayer(Math.round(lerp(5,11,df))); // stronger laser than before: was lerp(2,5,df)
        spawnFloater(pl.x, pl.y-30, '고래 레이저 피격!', '#7cf7ff');
        SFX.hit();
      } else if(w.beamDist >= w.beamMax){
        w.fired = true; // missed: beam reached max range (or a gravity field) without touching the player
      }
    }
    w.stateT -= dt;
    if(w.stateT<=0){ w.state='cooldown'; w.stateT = rand(3.5,5.0); w.beamDist = 0; } // cooldown slowed back down (was rand(1.1,1.6), originally rand(2.2,3.2))
  } else if(w.state==='cooldown'){
    w.stateT -= dt;
    if(w.stateT<=0) w.state = 'idle';
  }
}
function updateWhales(dt){
  for(const w of game.whales) updateWhale(w, dt);
  game.whales = game.whales.filter(w=>!w.gone);
}

function updateNuggets(dt){
  const pl = game.player;
  game.nuggetTimer -= dt;
  if(pl.mode==='space' && game.nuggetTimer<=0){
    game.nuggetTimer = rand(1.5,3.5);
    const ang = rand(0,TAU);
    const r = rand(200,600);
    game.nuggets.push({
      x: pl.x+Math.cos(ang)*r, y: pl.y+Math.sin(ang)*r,
      vx: rand(-20,20), vy: rand(20,50),
      life: 20, spin: rand(0,TAU)
    });
  }
  for(const n of game.nuggets){
    n.x += n.vx*dt; n.y += n.vy*dt; n.life -= dt; n.spin += dt*3;
    if(dist(n.x,n.y,pl.x,pl.y) < 22 && n.life>0){
      n.life = -1;
      pl.carry = Math.round((pl.carry+0.1)*10)/10;
      spawnFloater(pl.x,pl.y-24,'+0.1🪙','#ffd166');
      SFX.coin();
    }
  }
  game.nuggets = game.nuggets.filter(n=>n.life>0);
}

function triggerGameOver(eaten){
  SFX.quake();
  STATE = 'gameover';
  dom.hud.classList.add('hidden');
  dom.shopBtn.classList.add('hidden');
  dom.endingPreviewBtn.classList.add('hidden');
  dom.helpBtn.classList.add('hidden');
  dom.helpModal.classList.add('hidden');
  dom.playTimeLabel.classList.add('hidden');
  dom.goSurvived.textContent = eaten ? `우주 괴물에게 잡아먹혔습니다... (${game.day}일째 생존)` : `생명력을 모두 잃었습니다... (${game.day}일째 생존)`;
  dom.gameOverOverlay.classList.remove('hidden');
}

// ---------- Ending ----------
function startEnding(){
  STATE = 'ending';
  paused = false;
  dom.hud.classList.add('hidden');
  dom.shopBtn.classList.add('hidden');
  dom.endingPreviewBtn.classList.add('hidden');
  dom.helpBtn.classList.add('hidden');
  dom.helpModal.classList.add('hidden');
  dom.playTimeLabel.classList.add('hidden');
  dom.shopModal.classList.add('hidden');
  SFX.win();
  const pl = game.player;
  const alreadyHome = pl.mode==='landed' && pl.planetRef===HOME;
  game.endingSeq = {
    t: 0,
    phase: alreadyHome ? 'fadeout' : 'autoReturn',
    returnFrom: { x: pl.x, y: pl.y },
  };
}

function updateEnding(dt){
  const e = game.endingSeq;
  e.t += dt;
  const pl = game.player;
  if(e.phase==='autoReturn'){
    const dur = 2.4;
    const t = clamp(e.t/dur, 0, 1);
    const et = easeOutCubic(t);
    const targetTheta = -Math.PI/2;
    const target = landedPos({}, HOME, targetTheta);
    pl.x = lerp(e.returnFrom.x, target.x, et);
    pl.y = lerp(e.returnFrom.y, target.y, et);
    game.camera.x = pl.x; game.camera.y = pl.y;
    if(t >= 1){
      pl.mode = 'landed'; pl.planetRef = HOME; pl.theta = targetTheta; pl.vx=0; pl.vy=0;
      e.phase = 'fadeout'; e.t = 0;
    }
  } else if(e.phase==='fadeout'){
    game.fade = clamp(e.t/2.0, 0, 1);
    if(e.t >= 2.0){ e.phase='black'; e.t=0; dom.endingOverlay.classList.remove('hidden'); }
  } else if(e.phase==='black'){
    if(e.t>0.4 && dom.endText.classList.contains('hidden')) dom.endText.classList.remove('hidden');
    if(e.t >= 1.8){
      e.phase='fadein'; e.t=0;
      dom.endText.classList.add('hidden');
      dom.endingOverlay.classList.add('hidden');
    }
  } else if(e.phase==='fadein'){
    game.fade = clamp(1 - e.t/1.4, 0, 1);
    if(e.t >= 1.4){ e.phase='liftoff'; e.t=0; game.fade=0; }
  } else if(e.phase==='liftoff'){
    if(e.t >= 3.0){ e.phase='travel'; e.t=0; }
  } else if(e.phase==='travel'){
    if(e.t >= 3.0){ e.phase='arrival'; e.t=0; }
  } else if(e.phase==='arrival'){
    if(e.t >= 2.4){
      e.phase='scene'; e.t=0;
      dom.endingOverlay.classList.remove('hidden');
      dom.endingFinal.classList.remove('hidden');
    }
  } else if(e.phase==='scene'){
    // static peaceful scene drawn each frame; wait for user to click restart
  }
}

// ---------- HUD sync ----------
function syncHUD(){
  const pl = game.player;
  dom.dayNum.textContent = game.day;
  dom.dayFill.style.width = Math.min(100, (game.dayTimer/DAY_SECONDS)*100) + '%';
  dom.hpFill.style.width = Math.max(0,(pl.hp/pl.maxHp)*100) + '%';
  dom.goldNum.textContent = pl.gold.toFixed(1).replace(/\.0$/,'');
  if(pl.carry>0){
    dom.carryRow.classList.remove('hidden');
    dom.carryNum.textContent = pl.carry.toFixed(1);
  } else dom.carryRow.classList.add('hidden');
  dom.weaponLabel.textContent = WEAPONS[pl.weaponTier].icon + ' ' + WEAPONS[pl.weaponTier].name;
  dom.shieldLabel.textContent = pl.shieldTier>0 ? `🛡 내구도 ${pl.shieldDur}/${pl.shieldMax}` : '🛡 없음';
  dom.playTimeLabel.textContent = '⏱ ' + formatPlayTime(game.playTime);
}
function formatPlayTime(sec){
  const s = Math.floor(sec);
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss = s%60;
  const pad = (n)=> String(n).padStart(2,'0');
  return h>0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

// ---------- Shop ----------
function openShop(){
  if(STATE!=='playing') return;
  paused = true;
  refreshShopUI();
  dom.shopModal.classList.remove('hidden');
}
function closeShop(){
  paused = false;
  dom.shopModal.classList.add('hidden');
}
function refreshShopUI(){
  const pl = game.player;
  dom.shopGold.textContent = pl.gold.toFixed(1);
  const wCur = WEAPONS[pl.weaponTier];
  const wNext = WEAPONS[Math.min(WEAPONS.length-1, pl.weaponTier+1)];
  const atMax = pl.weaponTier >= WEAPONS.length-1;
  dom.weaponName.textContent = `무기: ${wCur.icon} ${wCur.name}`;
  dom.weaponDesc.textContent = atMax ? `최대 강화 (공격력 ${wCur.dmg})` : `다음: ${wNext.icon} ${wNext.name} (공격력 ${wCur.dmg}→${wNext.dmg})`;
  dom.weaponPrice.textContent = atMax ? '-' : weaponPrice(pl.weaponTier);
  dom.buyWeaponBtn.disabled = atMax || pl.gold < weaponPrice(pl.weaponTier);
  dom.buyWeaponBtn.textContent = atMax ? '최대 레벨' : `강화 (${weaponPrice(pl.weaponTier)}🪙)`;

  const sNextCap = shieldCapacity(pl.shieldTier+1);
  dom.shieldName.textContent = pl.shieldTier>0 ? `보호막: Lv.${pl.shieldTier} (${pl.shieldDur}/${pl.shieldMax})` : '보호막: 없음';
  dom.shieldDesc.textContent = `구매 시 내구도 ${sNextCap}로 충전/업그레이드`;
  const sPrice = shieldPrice(pl.shieldTier);
  dom.shieldPrice.textContent = sPrice;
  dom.buyShieldBtn.disabled = pl.gold < sPrice;

  dom.lifeDesc.textContent = `최대 HP +2 및 전체 회복 (현재 ${pl.maxHp})`;
  const lPrice = lifePrice(pl.lifeLevel);
  dom.lifePrice.textContent = lPrice;
  dom.buyLifeBtn.disabled = pl.gold < lPrice;
}
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('endingPreviewBtn').addEventListener('click', ()=>{
  if(STATE !== 'playing') return;
  paused = false;
  dom.shopModal.classList.add('hidden');
  startEnding();
});
document.getElementById('closeShopBtn').addEventListener('click', closeShop);

// ---------- Help ----------
function openHelp(){
  if(STATE!=='playing') return;
  paused = true;
  dom.helpModal.classList.remove('hidden');
}
function closeHelp(){
  paused = false;
  dom.helpModal.classList.add('hidden');
}
document.getElementById('helpBtn').addEventListener('click', openHelp);
document.getElementById('closeHelpBtn').addEventListener('click', closeHelp);
document.getElementById('buyWeaponBtn').addEventListener('click', ()=>{
  const pl = game.player;
  if(pl.weaponTier >= WEAPONS.length-1) return;
  const price = weaponPrice(pl.weaponTier);
  if(pl.gold >= price){ pl.gold -= price; pl.weaponTier++; refreshShopUI(); }
});
document.getElementById('buyShieldBtn').addEventListener('click', ()=>{
  const pl = game.player;
  const price = shieldPrice(pl.shieldTier);
  if(pl.gold >= price){
    pl.gold -= price;
    pl.shieldTier++;
    pl.shieldMax = shieldCapacity(pl.shieldTier);
    pl.shieldDur = pl.shieldMax;
    refreshShopUI();
  }
});
document.getElementById('buyLifeBtn').addEventListener('click', ()=>{
  const pl = game.player;
  const price = lifePrice(pl.lifeLevel);
  if(pl.gold >= price){
    pl.gold -= price;
    pl.lifeLevel++;
    pl.maxHp += 2;
    pl.hp = pl.maxHp;
    refreshShopUI();
  }
});

// ---------- Rendering ----------
function drawStars(camx,camy,parallax=1){
  ctx.save();
  for(const s of stars){
    const px = (s.x*s.layer*parallax) - camx*s.layer + W/2;
    const py = (s.y*s.layer*parallax) - camy*s.layer + H/2;
    const wx = ((px % W)+W)%W;
    const wy = ((py % H)+H)%H;
    const tw = 0.5+0.5*Math.sin(s.tw + performance.now()*0.001*2);
    ctx.globalAlpha = 0.4 + 0.6*tw*s.layer;
    ctx.fillStyle = '#dff2ff';
    ctx.beginPath();
    ctx.arc(wx,wy,s.r,0,TAU);
    ctx.fill();
  }
  ctx.restore();
}

function worldToScreen(x,y){
  return { x: x - game.camera.x + W/2, y: y - game.camera.y + H/2 };
}

function drawPlanet(p){
  const glowColor = p.glow;
  const s = worldToScreen(p.x,p.y);
  // gravity field
  const grad = ctx.createRadialGradient(s.x,s.y,p.r, s.x,s.y, gravR(p));
  grad.addColorStop(0, glowColor+'55');
  grad.addColorStop(1, glowColor+'00');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(s.x,s.y,gravR(p),0,TAU); ctx.fill();
  ctx.strokeStyle = glowColor+'66';
  ctx.setLineDash([6,8]);
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(s.x,s.y,gravR(p),0,TAU); ctx.stroke();
  ctx.setLineDash([]);
  // body
  const bg = ctx.createRadialGradient(s.x-p.r*0.35,s.y-p.r*0.35,p.r*0.15, s.x,s.y,p.r);
  bg.addColorStop(0, p.bodyLight);
  bg.addColorStop(1, p.bodyDark);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(s.x,s.y,p.r,0,TAU); ctx.fill();
  // craters/spots
  const seed = p.seed;
  for(let i=0;i<10;i++){
    const a = (i*2.4+seed);
    const rr = p.r*(0.25+0.55*((i*37)%10)/10);
    const cx = s.x+Math.cos(a)*rr, cy = s.y+Math.sin(a)*rr;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(cx,cy, p.r*0.05+2,0,TAU); ctx.fill();
  }
  if(p===HOME){
    // small dome base structure
    ctx.fillStyle = '#dff2ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y - p.r, 10, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle='#9fc7e8';
    ctx.fillRect(s.x-12, s.y-p.r, 24, 6);
  }
}

function drawCharacter(x,y,facing,suitColor,visorColor,scale=1, punchT=0, hurt=false, legSwing=0, surfaceAngle=0, weaponTier=0){
  const s = worldToScreen(x,y);
  ctx.save();
  ctx.translate(s.x,s.y);
  ctx.rotate(surfaceAngle);
  ctx.scale(facing*scale, scale);
  if(hurt){ ctx.globalAlpha = 0.55; }
  // legs (walk cycle: swing alternates the two legs fore/aft)
  ctx.strokeStyle = suitColor; ctx.lineWidth=6; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-5,10); ctx.lineTo(-8+legSwing,26);
  ctx.moveTo(5,10); ctx.lineTo(8-legSwing,26);
  ctx.stroke();
  // body
  ctx.fillStyle = suitColor;
  ctx.beginPath(); ctx.ellipse(0,0,12,16,0,0,TAU); ctx.fill();
  // backpack
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-16,-8,6,16);
  // arm + weapon
  ctx.strokeStyle = suitColor; ctx.lineWidth=6;
  const armX = 12 + punchT*16;
  ctx.beginPath(); ctx.moveTo(6,2); ctx.lineTo(armX, 0); ctx.stroke();
  drawWeaponEffect(weaponTier, armX, 0, punchT);
  // helmet
  ctx.fillStyle = '#e8f1ff';
  ctx.beginPath(); ctx.arc(0,-18,11,0,TAU); ctx.fill();
  ctx.fillStyle = visorColor;
  ctx.beginPath(); ctx.ellipse(2,-18,6,6,0,0,TAU); ctx.fill();
  ctx.restore();
}

// draws the item held in the player's hand, plus its attack effect (punchT: 1=swing start -> 0=faded out)
function drawWeaponEffect(weaponTier, handX, handY, punchT){
  if(weaponTier <= 0){
    // fists
    if(punchT>0){
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(handX+4,handY,4+punchT*4,0,TAU); ctx.fill();
    }
  } else if(weaponTier === 1){
    // stone: tossed forward on attack
    const rockX = handX + (1-punchT)*20;
    ctx.fillStyle = '#8a8a8a';
    ctx.beginPath(); ctx.arc(rockX+4, handY, 3.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5c5c5c'; ctx.lineWidth=1; ctx.stroke();
  } else if(weaponTier === 2){
    // slingshot: Y-frame with a stone shot forward
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(handX-2,handY+6); ctx.lineTo(handX+5,handY-5);
    ctx.moveTo(handX-2,handY-6); ctx.lineTo(handX+5,handY+5);
    ctx.stroke();
    if(punchT>0){
      ctx.fillStyle = '#8a8a8a';
      ctx.beginPath(); ctx.arc(handX+6+(1-punchT)*30, handY, 3, 0, TAU); ctx.fill();
    }
  } else if(weaponTier === 3){
    // bow: curved limb, arrow released forward
    ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(handX-4, handY, 10, -0.9, 0.9); ctx.stroke();
    if(punchT>0){
      const ax = handX + (1-punchT)*38;
      ctx.strokeStyle = '#ddd'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(handX,handY); ctx.lineTo(ax,handY); ctx.stroke();
      ctx.fillStyle = '#ddd';
      ctx.beginPath(); ctx.moveTo(ax+5,handY); ctx.lineTo(ax-3,handY-3); ctx.lineTo(ax-3,handY+3); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(handX-4,handY-10); ctx.lineTo(handX+6,handY); ctx.lineTo(handX-4,handY+10); ctx.stroke();
    }
  } else if(weaponTier === 4){
    // flamethrower: nozzle with a flame cone while attacking
    ctx.fillStyle = '#555';
    ctx.fillRect(handX-2, handY-3, 12, 6);
    if(punchT>0){
      for(let i=0;i<5;i++){
        const fx = handX+12+i*4+rand(-2,2);
        const fy = handY+rand(-5,5)*punchT;
        ctx.fillStyle = i%2===0 ? 'rgba(255,150,40,0.85)' : 'rgba(255,90,30,0.7)';
        ctx.beginPath(); ctx.arc(fx,fy,3+punchT*3,0,TAU); ctx.fill();
      }
    }
  } else if(weaponTier === 5){
    // machine gun: barrel with muzzle flash + tracer while attacking
    ctx.fillStyle = '#333';
    ctx.fillRect(handX-2, handY-2, 16, 4);
    if(punchT>0){
      const fx = handX+16;
      ctx.fillStyle = '#fff8b0';
      ctx.beginPath();
      for(let i=0;i<6;i++){
        const a = i/6*TAU;
        const r = i%2===0 ? 3+punchT*6 : 1.5;
        const px = fx+Math.cos(a)*r, py = Math.sin(a)*r;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,180,0.6)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(fx,0); ctx.lineTo(fx+40,rand(-3,3)); ctx.stroke();
    }
  } else if(weaponTier === 6){
    // bomb: lobbed forward with a lit fuse, spark trail
    const bx = handX + (1-punchT)*26;
    const by = handY - Math.sin(punchT*Math.PI)*14;
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e0a020'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(bx+2,by-4); ctx.lineTo(bx+5,by-8); ctx.stroke();
    if(punchT>0){
      ctx.fillStyle = '#ffcf5c';
      ctx.beginPath(); ctx.arc(bx+5,by-8, 2+punchT*2, 0, TAU); ctx.fill();
    }
  } else {
    // missile: rocket body with flame exhaust while attacking
    const mx = handX + (1-punchT)*10;
    ctx.save();
    ctx.translate(mx, handY);
    ctx.fillStyle = '#cfd6dd';
    ctx.beginPath();
    ctx.moveTo(18,0); ctx.lineTo(6,-4); ctx.lineTo(-8,-4); ctx.lineTo(-8,4); ctx.lineTo(6,4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d6444a';
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(11,-3); ctx.lineTo(11,3); ctx.closePath(); ctx.fill();
    if(punchT>0){
      for(let i=0;i<4;i++){
        const fx = -8-i*5+rand(-2,2);
        const fy = rand(-4,4)*punchT;
        ctx.fillStyle = i%2===0 ? 'rgba(255,150,40,0.85)' : 'rgba(255,220,120,0.7)';
        ctx.beginPath(); ctx.arc(fx,fy,3+punchT*3,0,TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawAlien(al){
  const s = worldToScreen(al.x,al.y);
  const hpFrac = al.hp/al.maxHp;
  const scale = al.isBoss ? 1.6 : 1;
  ctx.save();
  ctx.translate(s.x,s.y);
  ctx.scale(scale,scale);
  if(al.hurtFlash>0){ ctx.globalAlpha=0.6; }
  ctx.fillStyle = al.isBoss ? '#ff8a5c' : '#7CFC9A';
  ctx.beginPath(); ctx.ellipse(0,4,10,14,0,0,TAU); ctx.fill();
  ctx.fillStyle = al.isBoss ? '#d4502a' : '#59d47f';
  ctx.beginPath(); ctx.arc(0,-14,9,0,TAU); ctx.fill();
  ctx.fillStyle='#0b2';
  ctx.beginPath(); ctx.arc(-3,-15,2.2,0,TAU); ctx.arc(3,-15,2.2,0,TAU); ctx.fill();
  drawAlienWeaponIcon(al.weapon);
  ctx.restore();
  // hp bar
  const barW = 28*scale;
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.fillRect(s.x-barW/2,s.y-32*scale,barW,4);
  ctx.fillStyle='#ff6b6b';
  ctx.fillRect(s.x-barW/2,s.y-32*scale,barW*hpFrac,4);
  ctx.font='bold 10px Orbitron, sans-serif';
  ctx.textAlign='center';
  if(al.isBoss){
    ctx.fillStyle='#ffd166';
    ctx.fillText('BOSS', s.x, s.y-38*scale);
  } else if(al.isRanged){
    ctx.fillStyle='#7cf7ff';
    ctx.fillText('원거리', s.x, s.y-38);
  }
  if(al.attackFlash>0) drawAlienAttackEffect(al);
}

// small hand-held marker so each alien visibly carries a different weapon
function drawAlienWeaponIcon(weapon){
  if(weapon==='laser'){
    ctx.fillStyle='#c33'; ctx.fillRect(8,2,8,3);
  } else if(weapon==='whip'){
    ctx.strokeStyle='#e8c34a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(8,4); ctx.quadraticCurveTo(14,0,12,-6); ctx.stroke();
  } else if(weapon==='spike'){
    ctx.fillStyle='#caa'; ctx.beginPath(); ctx.moveTo(8,2); ctx.lineTo(16,0); ctx.lineTo(8,-2); ctx.closePath(); ctx.fill();
  } else if(weapon==='blaster'){
    ctx.fillStyle='#5fae7f'; ctx.fillRect(7,1,9,4);
    ctx.fillStyle='#bff7d0'; ctx.beginPath(); ctx.arc(16,3,2,0,TAU); ctx.fill();
  } else if(weapon==='flamethrower'){
    ctx.fillStyle='#8a5c3c'; ctx.fillRect(6,1,10,4);
    ctx.fillStyle='#ff7a30';
    ctx.beginPath(); ctx.moveTo(16,-1); ctx.lineTo(23,3); ctx.lineTo(16,7); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ffcf5c';
    ctx.beginPath(); ctx.moveTo(16,1); ctx.lineTo(20,3); ctx.lineTo(16,5); ctx.closePath(); ctx.fill();
  } else if(weapon==='bow'){
    ctx.strokeStyle='#c8a15c'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.arc(10,3,9,-1.15,1.15); ctx.stroke();
    ctx.strokeStyle='rgba(230,230,230,0.85)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(10,-6); ctx.lineTo(10,12); ctx.stroke();
    ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(4,3); ctx.lineTo(19,3); ctx.stroke();
    ctx.fillStyle='#e8e8e8';
    ctx.beginPath(); ctx.moveTo(19,3); ctx.lineTo(15,1); ctx.lineTo(15,5); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle='#0b2'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(8,3); ctx.lineTo(13,0); ctx.moveTo(8,5); ctx.lineTo(13,4); ctx.moveTo(8,7); ctx.lineTo(12,8); ctx.stroke();
  }
}

// weapon-specific effect fired toward the player while the alien is mid-attack
function drawAlienAttackEffect(al){
  const s = worldToScreen(al.x, al.y);
  const pl = game.player;
  const ps = worldToScreen(pl.x, pl.y);
  const t = clamp(al.attackFlash / 0.25, 0, 1);
  ctx.save();
  if(al.weapon==='laser'){
    ctx.strokeStyle = `rgba(255,70,70,${0.4+0.5*t})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s.x,s.y-10); ctx.lineTo(ps.x,ps.y-10); ctx.stroke();
  } else if(al.weapon==='whip'){
    ctx.strokeStyle = `rgba(232,195,74,${0.4+0.5*t})`;
    ctx.lineWidth = 3;
    const midx=(s.x+ps.x)/2, midy=(s.y+ps.y)/2 - 26*t;
    ctx.beginPath(); ctx.moveTo(s.x,s.y-6); ctx.quadraticCurveTo(midx,midy,ps.x,ps.y-10); ctx.stroke();
  } else if(al.weapon==='spike'){
    const px = lerp(s.x, ps.x, 1-t), py = lerp(s.y-6, ps.y-10, 1-t);
    ctx.fillStyle = '#caa';
    ctx.beginPath(); ctx.arc(px,py,4,0,TAU); ctx.fill();
  } else if(al.weapon==='blaster'){
    const px = lerp(s.x, ps.x, 1-t), py = lerp(s.y-6, ps.y-10, 1-t);
    ctx.fillStyle = 'rgba(150,255,150,0.9)';
    ctx.shadowColor='#7fffb0'; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(px,py,5,0,TAU); ctx.fill();
    ctx.shadowBlur=0;
  } else if(al.weapon==='flamethrower'){
    const steps = 6;
    for(let i=0;i<steps;i++){
      const t2 = i/(steps-1);
      const px = lerp(s.x, ps.x, t2);
      const py = lerp(s.y-8, ps.y-10, t2) + Math.sin(t2*7 + performance.now()*0.02)*4;
      const r = (5+3*t2) * (0.6+0.4*t);
      ctx.fillStyle = `rgba(255,${120+Math.floor(90*t2)},40,${0.75*t})`;
      ctx.beginPath(); ctx.arc(px,py,r,0,TAU); ctx.fill();
    }
  } else if(al.weapon==='bow'){
    const px = lerp(s.x, ps.x, 1-t), py = lerp(s.y-8, ps.y-10, 1-t);
    const ang = Math.atan2(ps.y-s.y, ps.x-s.x);
    ctx.translate(px,py); ctx.rotate(ang);
    ctx.strokeStyle = `rgba(230,210,170,${0.5+0.4*t})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(6,0); ctx.stroke();
    ctx.fillStyle = `rgba(230,210,170,${0.5+0.4*t})`;
    ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(1,-3); ctx.lineTo(1,3); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = `rgba(255,255,255,${0.6*t})`;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(s.x-8,s.y-2); ctx.lineTo(s.x+12,s.y-16); ctx.stroke();
  }
  ctx.restore();
}

function drawBoss(b){
  const s = worldToScreen(b.x,b.y);
  const hpFrac = b.hp/b.maxHp;
  ctx.save();
  ctx.translate(s.x,s.y);
  if(b.hurtFlash>0){ ctx.globalAlpha=0.6; }
  ctx.scale(1.8,1.8);
  ctx.fillStyle = '#3a0f14';
  ctx.beginPath(); ctx.ellipse(0,4,13,17,0,0,TAU); ctx.fill();
  ctx.fillStyle = '#7a1620';
  ctx.beginPath(); ctx.arc(0,-15,11,0,TAU); ctx.fill();
  ctx.fillStyle = '#5c1018';
  ctx.beginPath(); ctx.moveTo(-10,-2); ctx.lineTo(-20,-12); ctx.lineTo(-8,-6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10,-2); ctx.lineTo(20,-12); ctx.lineTo(8,-6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff3b3b';
  ctx.beginPath(); ctx.arc(-4,-16,2.6,0,TAU); ctx.arc(4,-16,2.6,0,TAU); ctx.fill();
  ctx.restore();
  // hp bar
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.fillRect(s.x-32,s.y-58,64,7);
  ctx.fillStyle='#ff3b3b';
  ctx.fillRect(s.x-32,s.y-58,64*hpFrac,7);
  ctx.font='bold 12px Orbitron, sans-serif';
  ctx.textAlign='center';
  ctx.fillStyle='#fff';
  ctx.fillText('BOSS', s.x, s.y-62);
  if(b.attackFlash>0) drawAlienAttackEffect(b);
}

function drawMonster(m){
  const scared = m.fleeing;
  const jitter = m.hurtT > 0;
  const s = worldToScreen(m.x,m.y);
  ctx.save();
  const jx = jitter ? rand(-3,3) : 0, jy = jitter ? rand(-3,3) : 0;
  ctx.translate(s.x+jx,s.y+jy);
  const baseAng = scared ? Math.atan2(m.fleeDir.y, m.fleeDir.x) : Math.atan2(m.y-game.player.y, m.x-game.player.x);
  const wobble = jitter ? Math.sin(performance.now()*0.04)*0.35 : 0;
  ctx.rotate(baseAng+Math.PI+wobble);
  ctx.scale(MONSTER_SCALE, MONSTER_SCALE);
  // body: sine wave segments
  ctx.strokeStyle = scared ? '#ff5c5c' : '#7a2b8f';
  ctx.lineWidth = 14;
  ctx.lineCap='round';
  ctx.beginPath();
  for(let i=0;i<10;i++){
    const t = i*6;
    const wig = scared ? 3 : 1;
    const yy = Math.sin(m.phase*wig+i*0.6)*6;
    if(i===0) ctx.moveTo(-t,yy); else ctx.lineTo(-t,yy);
  }
  ctx.stroke();
  // wings
  ctx.fillStyle = scared ? 'rgba(255,90,90,0.7)' : 'rgba(150,60,200,0.65)';
  const flap = Math.sin(m.phase*(scared?4:2))*10;
  ctx.beginPath(); ctx.moveTo(-4,0); ctx.quadraticCurveTo(-20,-20-flap,-34,-6); ctx.quadraticCurveTo(-16,-4,-4,4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4,0); ctx.quadraticCurveTo(-20,20+flap,-34,6); ctx.quadraticCurveTo(-16,4,-4,-4); ctx.fill();
  // head
  ctx.fillStyle = scared ? '#ff7a7a' : '#9b3fc4';
  ctx.beginPath(); ctx.arc(6,0,10,0,TAU); ctx.fill();
  ctx.fillStyle = scared ? '#fff' : '#ffe27a';
  for(const oy of [-4,0,4]){ ctx.beginPath(); ctx.arc(9,oy,2,0,TAU); ctx.fill(); }
  ctx.restore();
}

function drawSpaceDog(d){
  const s = worldToScreen(d.x,d.y);
  const bob = Math.sin(d.phase)*3;
  ctx.save();
  ctx.translate(s.x, s.y+bob);
  if(d.hurtFlash>0) ctx.globalAlpha = 0.6;
  const bodyColor = d.aggro ? '#e0855a' : '#d9b98a';
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(0,4,12,9,0,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(10,-2,7,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6,-8); ctx.lineTo(2,-16); ctx.lineTo(10,-10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14,-8); ctx.lineTo(18,-15); ctx.lineTo(16,-6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath(); ctx.arc(15,0,2,0,TAU); ctx.fill();
  ctx.fillStyle = d.aggro ? '#ff5050' : '#222';
  ctx.beginPath(); ctx.arc(9,-4,1.6,0,TAU); ctx.fill();
  ctx.strokeStyle = bodyColor; ctx.lineWidth=4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-11,2); ctx.quadraticCurveTo(-18,-2+Math.sin(d.phase*2)*4,-14,-8); ctx.stroke();
  ctx.strokeStyle = bodyColor; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-4,10); ctx.lineTo(-6,15); ctx.moveTo(4,10); ctx.lineTo(6,15); ctx.stroke();
  // little space helmet bubble
  ctx.strokeStyle='rgba(200,230,255,0.6)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(9,-3,9,0,TAU); ctx.stroke();
  ctx.restore();
}

function drawLaserMonster(m){
  const s = worldToScreen(m.x,m.y);
  const bob = Math.sin(m.phase)*3;
  ctx.save();
  ctx.translate(s.x, s.y+bob);
  if(m.hurtFlash>0) ctx.globalAlpha = 0.55;

  // telegraph / beam line — clipped to m.beamLen so it visibly stops at a gravity field's edge
  if(m.state==='charging'){
    const t = 1 - clamp(m.stateT/0.85,0,1);
    const len = m.beamLen;
    ctx.save();
    ctx.rotate(0);
    ctx.setLineDash([6,7]);
    ctx.strokeStyle = `rgba(255,70,70,${0.25+0.55*t})`;
    ctx.lineWidth = 1.5+t*1.5;
    ctx.beginPath();
    ctx.moveTo(0,-bob);
    ctx.lineTo(Math.cos(m.aimAngle)*len, Math.sin(m.aimAngle)*len - bob);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if(m.state==='firing'){
    const len = m.beamLen;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,90,90,0.35)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0,-bob);
    ctx.lineTo(Math.cos(m.aimAngle)*len, Math.sin(m.aimAngle)*len - bob);
    ctx.stroke();
    ctx.strokeStyle = '#ffe6e6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0,-bob);
    ctx.lineTo(Math.cos(m.aimAngle)*len, Math.sin(m.aimAngle)*len - bob);
    ctx.stroke();
    ctx.restore();
  }

  // spiky turret body
  const spin = m.phase*0.6;
  ctx.rotate(spin);
  ctx.fillStyle = '#5c1f2e';
  ctx.beginPath();
  for(let i=0;i<8;i++){
    const a = (TAU/8)*i;
    const rr = i%2===0 ? 15 : 9;
    const px = Math.cos(a)*rr, py = Math.sin(a)*rr;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath(); ctx.fill();
  ctx.rotate(-spin);

  // eye (aims at player when active)
  const eyeAng = (m.state==='charging'||m.state==='firing') ? m.aimAngle : Math.atan2(-1,0);
  ctx.fillStyle = '#2a0b12';
  ctx.beginPath(); ctx.arc(0,0,9,0,TAU); ctx.fill();
  ctx.fillStyle = m.state==='idle' ? '#ff8f6b' : '#ff2b2b';
  ctx.beginPath(); ctx.arc(Math.cos(eyeAng)*3, Math.sin(eyeAng)*3, 5, 0, TAU); ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(Math.cos(eyeAng)*3-1.5, Math.sin(eyeAng)*3-1.5, 1.4, 0, TAU); ctx.fill();

  // hp pips
  ctx.restore();
  ctx.save();
  ctx.translate(s.x, s.y+bob-24);
  const barW = 24;
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.fillRect(-barW/2,-3,barW,5);
  ctx.fillStyle='#ff5c5c';
  ctx.fillRect(-barW/2,-3, barW*clamp(m.hp/m.maxHp,0,1),5);
  ctx.restore();
}

function drawWhale(w){
  const s = worldToScreen(w.x,w.y);
  const bob = Math.sin(w.phase)*6;
  ctx.save();
  ctx.translate(s.x, s.y+bob);
  if(w.hurtFlash>0) ctx.globalAlpha = 0.6;

  // telegraph / beam, same language as the laser turret's but bigger.
  // Clipped to a gravity field's edge (live during charging, since the whale keeps
  // re-aiming at the player right up until it fires) so the warning line never lies
  // about a shot that physically can't reach through a planet's gravity well.
  if(w.state==='charging'){
    const t = 1 - clamp(w.stateT/0.9,0,1);
    const len = laserGravityClip(w.x, w.y, w.aimAngle, w.range);
    ctx.save();
    ctx.setLineDash([8,9]);
    ctx.strokeStyle = `rgba(124,247,255,${0.25+0.55*t})`;
    ctx.lineWidth = 2+t*2;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(w.aimAngle)*len, Math.sin(w.aimAngle)*len);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if(w.state==='firing'){
    const len = w.beamDist; // grows out over time instead of snapping to full range
    ctx.save();
    ctx.strokeStyle = 'rgba(124,247,255,0.4)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(w.aimAngle)*len, Math.sin(w.aimAngle)*len);
    ctx.stroke();
    ctx.strokeStyle = '#eafffe';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(w.aimAngle)*len, Math.sin(w.aimAngle)*len);
    ctx.stroke();
    ctx.restore();
  }

  const facing = (w.state==='charging'||w.state==='firing') ? w.aimAngle
    : (w.fleeing ? Math.atan2(w.fleeDir.y, w.fleeDir.x) : Math.atan2(game.player.y-w.y, game.player.x-w.x));
  ctx.rotate(facing);
  ctx.scale(WHALE_SCALE, WHALE_SCALE);

  const bodyColor = w.fleeing ? '#3a6b78' : '#2f5e78';
  const bellyColor = w.fleeing ? '#7fd8e0' : '#9fe8ef';
  // tail flukes
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-46,0); ctx.lineTo(-66,-17); ctx.lineTo(-58,0); ctx.lineTo(-66,17);
  ctx.closePath(); ctx.fill();
  // body
  ctx.beginPath(); ctx.ellipse(0,0,42,20,0,0,TAU); ctx.fill();
  // belly
  ctx.fillStyle = bellyColor;
  ctx.beginPath(); ctx.ellipse(3,8,32,10,0,0,TAU); ctx.fill();
  // dorsal + pectoral fins
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.moveTo(-4,-14); ctx.lineTo(4,-32); ctx.lineTo(10,-12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6,10); ctx.lineTo(0,28); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
  // eye
  ctx.fillStyle = '#0a1c22';
  ctx.beginPath(); ctx.arc(32,-4,3.4,0,TAU); ctx.fill();
  ctx.fillStyle = w.state==='idle' ? '#7cf7ff' : '#ff2b2b';
  ctx.beginPath(); ctx.arc(33,-4,1.6,0,TAU); ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.font = 'bold 12px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = w.fleeing ? '#ff8f6b' : '#7cf7ff';
  ctx.fillText(w.fleeing ? '고래 도주 중' : '레이저 고래', s.x, s.y+bob-32*WHALE_SCALE-10);
  ctx.restore();
}

function drawNugget(n){
  const s = worldToScreen(n.x,n.y);
  ctx.save();
  ctx.translate(s.x,s.y);
  ctx.rotate(n.spin);
  ctx.fillStyle='#ffd166';
  ctx.beginPath(); ctx.arc(0,0,5,0,TAU); ctx.fill();
  ctx.strokeStyle='#a67c00'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
}

function drawDrop(d){
  if(d.taken) return;
  const s = worldToScreen(d.x,d.y);
  ctx.fillStyle='#ffd166';
  ctx.beginPath(); ctx.arc(s.x,s.y-6,7,0,TAU); ctx.fill();
  ctx.strokeStyle='#a67c00'; ctx.lineWidth=2; ctx.stroke();
}

function drawFloaters(){
  ctx.textAlign='center';
  ctx.font='bold 14px Orbitron, sans-serif';
  for(const f of game.floaters){
    const s = worldToScreen(f.x,f.y);
    ctx.globalAlpha = clamp(f.life,0,1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, s.x, s.y);
  }
  ctx.globalAlpha = 1;
}

function drawShipWarning(){
  // simple alien ship hovering above home when invasion warning/fighting
  const s = worldToScreen(HOME.x, HOME.y - gravR(HOME) - 40);
  ctx.save();
  ctx.translate(s.x, s.y + Math.sin(performance.now()*0.003)*6);
  ctx.fillStyle = '#446';
  ctx.beginPath(); ctx.ellipse(0,0,50,16,0,0,TAU); ctx.fill();
  ctx.fillStyle = '#8ad4ff';
  ctx.beginPath(); ctx.ellipse(0,-4,18,8,0,0,TAU); ctx.fill();
  ctx.restore();
}

function drawOffscreenIndicator(target, color, label){
  const s = worldToScreen(target.x, target.y);
  const margin = 46;
  const cx = W/2, cy = H/2;
  if(s.x>margin && s.x<W-margin && s.y>margin && s.y<H-margin) return; // already on screen
  const angle = Math.atan2(s.y-cy, s.x-cx);
  const halfW = W/2-margin, halfH = H/2-margin;
  const t = Math.min(halfW/Math.max(1e-6,Math.abs(Math.cos(angle))), halfH/Math.max(1e-6,Math.abs(Math.sin(angle))));
  const ix = cx+Math.cos(angle)*t, iy = cy+Math.sin(angle)*t;
  ctx.save();
  ctx.translate(ix,iy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(-8,-9); ctx.lineTo(-8,9); ctx.closePath(); ctx.fill();
  ctx.restore();
  const dKm = Math.round(dist(game.player.x,game.player.y,target.x,target.y));
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${label} ${dKm}m`, ix, iy + (Math.sin(angle)>0? 24:-14));
  ctx.restore();
}

// ---------- Minimap ----------
function drawMinimap(){
  const pl = game.player;
  const R = 72;
  const cx = W - 16 - R;
  const cy = 16 + R;
  const worldRange = 3600;
  const scale = (R-10) / worldRange;
  const mapPt = (wx,wy)=>({ x: cx + wx*scale, y: cy + wy*scale });
  const mapPtClamped = (wx,wy)=>{
    const raw = mapPt(wx,wy);
    const dx = raw.x-cx, dy = raw.y-cy;
    const d = Math.hypot(dx,dy);
    const maxD = R-8;
    if(d>maxD){ const k=maxD/d; return { x: cx+dx*k, y: cy+dy*k }; }
    return raw;
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,R,0,TAU);
  ctx.fillStyle = 'rgba(6,10,20,0.65)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(140,180,255,0.55)';
  ctx.stroke();
  ctx.clip();

  const planets = [HOME, ...ALIEN_PLANETS];
  for(const p of planets){
    const mp = mapPt(p.x,p.y);
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, p===HOME?5:4, 0, TAU);
    ctx.fillStyle = p.glow;
    ctx.fill();
  }

  if(game.boss || game.invasion.active){
    const mp = mapPt(HOME.x,HOME.y);
    const pulse = 0.5+0.5*Math.sin(performance.now()*0.006);
    ctx.beginPath();
    ctx.arc(mp.x,mp.y, 9+pulse*3, 0, TAU);
    ctx.strokeStyle = `rgba(255,70,70,${0.6+0.3*pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for(const m of game.laserMonsters){
    if(m.dead) continue;
    const mp = mapPt(m.x,m.y);
    ctx.beginPath();
    ctx.arc(mp.x,mp.y,2.2,0,TAU);
    ctx.fillStyle = m.state==='idle' ? 'rgba(255,120,110,0.8)' : '#ff2b2b';
    ctx.fill();
  }

  const mp = mapPtClamped(pl.x,pl.y);
  ctx.beginPath();
  ctx.arc(mp.x,mp.y,3.5,0,TAU);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.font = '10px "Noto Sans KR", sans-serif';
  ctx.fillStyle = 'rgba(200,220,255,0.85)';
  ctx.textAlign = 'center';
  ctx.fillText('지도', cx, cy - R - 6);
  ctx.restore();
}

function renderPlaying(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#04060d';
  ctx.fillRect(0,0,W,H);

  let sx=0, sy=0;
  if(game.shakeT>0){ sx = rand(-1,1)*game.shakeMag; sy = rand(-1,1)*game.shakeMag; }
  ctx.save();
  ctx.translate(sx,sy);

  drawStars(game.camera.x, game.camera.y);
  drawConstellations();

  drawPlanet(HOME);
  for(const p of ALIEN_PLANETS) drawPlanet(p);

  for(const n of game.nuggets) drawNugget(n);
  for(const p of ALIEN_PLANETS) for(const d of alienGroupFor(p).drops) drawDrop(d);
  for(const al of currentAliens()) if(!al.dead) drawAlien(al);
  for(const m of game.monsters) drawMonster(m);
  for(const d of game.dogs) drawSpaceDog(d);
  for(const m of game.laserMonsters) if(!m.dead) drawLaserMonster(m);
  for(const w of game.whales) drawWhale(w);

  if(game.invasion.active) drawShipWarning();
  if(game.boss) drawBoss(game.boss);

  const pl = game.player;
  const punchT = pl.atkAnim>0 ? (pl.atkAnim/0.18) : 0;
  const surfaceAngle = pl.mode==='landed' ? (pl.theta + Math.PI/2) : 0;
  drawCharacter(pl.x,pl.y,pl.facing,'#dff2ff','#2a6fb0',1,punchT, pl.hurtFlash>0, pl.legSwing, surfaceAngle, pl.weaponTier);

  drawFloaters();
  ctx.restore();

  if(pl.mode !== 'landed'){
    for(const p of ALIEN_PLANETS) drawOffscreenIndicator(p, p.glow, p.name);
    for(const w of game.whales) drawOffscreenIndicator(w, w.fleeing ? '#ff8f6b' : '#7cf7ff', '레이저 고래');
  }

  drawMinimap();

  if(game.fade>0){
    ctx.fillStyle = `rgba(0,0,0,${game.fade})`;
    ctx.fillRect(0,0,W,H);
  }
}

// ---------- Intro timelapse ----------
const introState = {
  phase: 'years', // years -> hold -> dialogue -> darken -> ready -> done
  year: 1960,
  t: 0,
  perYear: 0.15,
  darkAlpha: 0,
  flash: 0,
};
function updateIntro(dt){
  introState.t += dt;
  if(introState.flash>0) introState.flash = Math.max(0, introState.flash - dt*5);
  if(introState.phase==='years'){
    if(introState.t >= introState.perYear){
      introState.t = 0;
      introState.year += 1;
      introState.flash = 1;
      dom.yearLabel.classList.remove('tick');
      void dom.yearLabel.offsetWidth; // restart the pulse animation
      dom.yearLabel.classList.add('tick');
      if(introState.year > 2060){
        introState.year = 2060;
        introState.phase = 'hold';
        introState.t = 0;
      }
    }
  } else if(introState.phase==='hold'){
    if(introState.t > 1.0){
      introState.phase='dialogue';
      introState.t=0;
      dom.introDialogue.textContent = '"이제 시대가 변했다. 미지의 우주로 나가자."';
      dom.introDialogue.classList.remove('hidden');
      requestAnimationFrame(()=>dom.introDialogue.classList.add('show'));
    }
  } else if(introState.phase==='dialogue'){
    if(introState.t > 2.6){
      introState.phase='darken';
      introState.t=0;
      dom.startBtn.classList.remove('hidden');
      requestAnimationFrame(()=>dom.startBtn.classList.add('show'));
    }
  } else if(introState.phase==='darken'){
    introState.darkAlpha = clamp(introState.t/1.6, 0, 0.82);
    if(introState.t>1.6) introState.phase='ready';
  }
}

// ---- per-era background scenes (procedural, no image assets) ----
function bgSky(top,bottom){
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
}
function bgGround(color){
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(W*0.5, H+150, W*0.9, 220, 0,0,TAU); ctx.fill();
}
function bgStars(alpha, count, seedMul){
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle='#fff';
  for(let i=0;i<count;i++){
    const sx = (i*97*seedMul) % W;
    const sy = (i*53*seedMul) % (H*0.7);
    ctx.fillRect(sx,sy,1.4,1.4);
  }
  ctx.restore();
}

function sceneRetro(){ // 1960s: desert launch pad
  bgSky('#f2b46a','#7a4a2a');
  ctx.fillStyle='rgba(255,235,190,0.85)';
  ctx.beginPath(); ctx.arc(W*0.78,H*0.2,55,0,TAU); ctx.fill();
  bgGround('#4a3320');
  const gx=W*0.74, gy=H*0.68;
  ctx.strokeStyle='#241a10'; ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(gx-26,gy+130); ctx.lineTo(gx-8,gy-150);
  ctx.moveTo(gx+26,gy+130); ctx.lineTo(gx+8,gy-150);
  for(let i=0;i<6;i++){ const yy=gy+120-i*44; ctx.moveTo(gx-26+i*3,yy); ctx.lineTo(gx+26-i*3,yy); }
  ctx.stroke();
  const rx=W*0.48, ry=H*0.66;
  ctx.fillStyle='#d9d3c6';
  ctx.beginPath();
  ctx.moveTo(rx,ry-150); ctx.quadraticCurveTo(rx+24,ry-70,rx+20,ry+80); ctx.lineTo(rx-20,ry+80); ctx.quadraticCurveTo(rx-24,ry-70,rx,ry-150);
  ctx.fill();
  ctx.fillStyle='#b33';
  ctx.beginPath(); ctx.moveTo(rx-20,ry+40); ctx.lineTo(rx-44,ry+82); ctx.lineTo(rx-14,ry+80); ctx.fill();
  ctx.beginPath(); ctx.moveTo(rx+20,ry+40); ctx.lineTo(rx+44,ry+82); ctx.lineTo(rx+14,ry+80); ctx.fill();
  ctx.strokeStyle='#8a8478'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(rx-20,ry-10); ctx.lineTo(rx+20,ry-10); ctx.moveTo(rx-20,ry+30); ctx.lineTo(rx+20,ry+30); ctx.stroke();
}

function sceneShuttle(){ // 1980s: orbiter on the runway
  bgSky('#8fb3d9','#e3985f');
  bgStars(0.25,40,1);
  bgGround('#374357');
  ctx.fillStyle='#232a38';
  ctx.fillRect(0,H*0.82,W,H*0.2);
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=4; ctx.setLineDash([26,20]);
  ctx.beginPath(); ctx.moveTo(0,H*0.9); ctx.lineTo(W,H*0.9); ctx.stroke(); ctx.setLineDash([]);
  const sx=W*0.5, sy=H*0.72;
  ctx.fillStyle='#e8e8e8';
  ctx.beginPath(); ctx.moveTo(sx-90,sy); ctx.quadraticCurveTo(sx,sy-26,sx+100,sy-4); ctx.quadraticCurveTo(sx+60,sy+14,sx-90,sy); ctx.fill();
  ctx.fillStyle='#2a2a2a';
  ctx.beginPath(); ctx.moveTo(sx+10,sy+2); ctx.lineTo(sx+46,sy+34); ctx.lineTo(sx-6,sy+14); ctx.fill();
  ctx.fillStyle='#c33';
  ctx.beginPath(); ctx.ellipse(sx-30,sy-8,8,4,0.3,0,TAU); ctx.fill();
}

function sceneStation(){ // 2000s: orbiting station over Earth
  bgSky('#040814','#0b1c3a');
  bgStars(0.8,90,2);
  ctx.fillStyle='#1c5fa8';
  ctx.beginPath(); ctx.arc(W*0.5,H+260,420,0,TAU); ctx.fill();
  ctx.fillStyle='rgba(255,220,140,0.6)';
  for(let i=0;i<10;i++){ ctx.beginPath(); ctx.arc(W*0.2+i*(W*0.07),H+40,2,0,TAU); ctx.fill(); }
  const cx=W*0.55, cy=H*0.36;
  ctx.strokeStyle='#cfd8e6'; ctx.lineWidth=10; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-110,cy); ctx.lineTo(cx+110,cy); ctx.stroke();
  ctx.fillStyle='#3a6fd8';
  ctx.fillRect(cx-100,cy-30,60,60); ctx.fillRect(cx+40,cy-30,60,60);
  ctx.fillStyle='#dfe6ee';
  ctx.fillRect(cx-24,cy-16,48,32);
}

function sceneReusable(){ // 2025: reusable rocket landing at sea, night
  bgSky('#020409','#071226');
  bgStars(0.6,70,3);
  ctx.fillStyle='#031425';
  ctx.fillRect(0,H*0.78,W,H*0.25);
  const px=W*0.52, py=H*0.8;
  ctx.fillStyle='#1a2433';
  ctx.beginPath(); ctx.ellipse(px,py,150,20,0,0,TAU); ctx.fill();
  for(let i=-2;i<=2;i++){ ctx.fillStyle='#ffb84d'; ctx.beginPath(); ctx.arc(px+i*48,py-4,3,0,TAU); ctx.fill(); }
  const rx=px, ry=py-90;
  ctx.fillStyle='#e7e9ee';
  ctx.fillRect(rx-14,ry-140,28,140);
  ctx.strokeStyle='#e7e9ee'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(rx-14,ry); ctx.lineTo(rx-34,ry+26); ctx.moveTo(rx+14,ry); ctx.lineTo(rx+34,ry+26); ctx.stroke();
  const flick = 16+Math.sin(performance.now()*0.02)*6;
  ctx.fillStyle='rgba(255,150,60,0.85)';
  ctx.beginPath(); ctx.moveTo(rx-10,ry+2); ctx.lineTo(rx,ry+2+flick); ctx.lineTo(rx+10,ry+2); ctx.fill();
}

function sceneColony(){ // 2045: orbital ring colony
  bgSky('#050615','#0c1230');
  bgStars(0.9,110,4);
  ctx.fillStyle='#2c5f8a';
  ctx.beginPath(); ctx.arc(W*0.18,H*0.24,50,0,TAU); ctx.fill();
  const cx=W*0.55, cy=H*0.48;
  ctx.strokeStyle='#9fb8d8'; ctx.lineWidth=22;
  ctx.beginPath(); ctx.ellipse(cx,cy,160,54,0.1,0,TAU); ctx.stroke();
  ctx.strokeStyle='#5c7aa8'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.ellipse(cx,cy,160,54,0.1,0,TAU); ctx.stroke();
  ctx.fillStyle='#cfe4ff';
  for(let i=0;i<8;i++){ const a=i/8*TAU; ctx.beginPath(); ctx.arc(cx+Math.cos(a)*160,cy+Math.sin(a)*54*0.98,3,0,TAU); ctx.fill(); }
  ctx.fillStyle='#e7f2ff';
  ctx.beginPath(); ctx.ellipse(cx,cy,26,26,0,0,TAU); ctx.fill();
}

function sceneDeepSpace(){ // 2060: deep space exploration
  bgSky('#0a0418','#1c0a2e');
  bgStars(1,140,5);
  const neb = ctx.createRadialGradient(W*0.7,H*0.35,20,W*0.7,H*0.35,260);
  neb.addColorStop(0,'rgba(180,90,255,0.35)'); neb.addColorStop(1,'rgba(180,90,255,0)');
  ctx.fillStyle=neb; ctx.beginPath(); ctx.arc(W*0.7,H*0.35,260,0,TAU); ctx.fill();
  const sx=W*0.42, sy=H*0.55;
  ctx.save(); ctx.translate(sx,sy); ctx.rotate(-0.15);
  ctx.fillStyle='#d7e8ff';
  ctx.beginPath(); ctx.moveTo(90,0); ctx.lineTo(-60,-22); ctx.lineTo(-40,0); ctx.lineTo(-60,22); ctx.closePath(); ctx.fill();
  ctx.shadowColor='#7cf7ff'; ctx.shadowBlur=24;
  ctx.fillStyle='#7cf7ff';
  ctx.beginPath(); ctx.arc(-55,0,6,0,TAU); ctx.fill();
  ctx.shadowBlur=0;
  ctx.restore();
  ctx.fillStyle='#3fae7f';
  ctx.beginPath(); ctx.arc(W*0.18,H*0.7,44,0,TAU); ctx.fill();
}

const ERA_SCENES = [
  {y:1960, scene: sceneRetro},
  {y:1980, scene: sceneShuttle},
  {y:2000, scene: sceneStation},
  {y:2025, scene: sceneReusable},
  {y:2045, scene: sceneColony},
  {y:2060, scene: sceneDeepSpace},
];

function drawIntroBackground(year){
  const yf = clamp((year-1960)/(2060-1960),0,1);

  // crossfade between the two era scenes bracketing the current year
  let prev = ERA_SCENES[0], next = ERA_SCENES[ERA_SCENES.length-1];
  for(let i=0;i<ERA_SCENES.length-1;i++){
    if(year >= ERA_SCENES[i].y && year <= ERA_SCENES[i+1].y){
      prev = ERA_SCENES[i]; next = ERA_SCENES[i+1]; break;
    }
  }
  const span = Math.max(1, next.y - prev.y);
  const localT = clamp((year-prev.y)/span, 0, 1);

  prev.scene();
  if(next !== prev && localT > 0){
    ctx.save();
    ctx.globalAlpha = localT;
    next.scene();
    ctx.restore();
  }

  // low quality -> high quality effect via blur + grain
  const blur = lerp(4,0,yf);
  if(blur>0.05){
    ctx.save();
    ctx.globalAlpha = blur/4*0.5;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(canvas,0,0);
    ctx.filter = 'none';
    ctx.restore();
  }
  // scanline grain, fading out
  const grain = (1-yf)*0.18;
  if(grain>0.01){
    ctx.save();
    ctx.globalAlpha = grain;
    for(let y=0;y<H;y+=3){
      ctx.fillStyle = Math.random()>0.5?'#000':'#fff';
      ctx.fillRect(0,y,W,1);
    }
    ctx.restore();
  }
}
function lerpColor(a,b,t){ return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)]; }
function rgbStr(c){ return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
function lerp3col(hex1,hex2,t){
  const c1=hexToRgb(hex1), c2=hexToRgb(hex2);
  return rgbStr(lerpColor(c1,c2,t));
}
function hexToRgb(hex){
  const n = parseInt(hex.slice(1),16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}

function drawIntroCharacter(yf){
  const x = W*0.28, y = H*0.72;
  const suitBulk = lerp(1.4,0.85,yf);
  const suitColor = lerp3col('#c9c2a8','#e8f4ff',yf);
  const visorColor = lerp3col('#333333','#4fd1ff',yf);
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(suitBulk,1);
  // legs
  ctx.strokeStyle=suitColor; ctx.lineWidth=10; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-8,20); ctx.lineTo(-12,52); ctx.moveTo(8,20); ctx.lineTo(12,52); ctx.stroke();
  // body
  ctx.fillStyle=suitColor;
  ctx.beginPath(); ctx.ellipse(0,0,22,30,0,0,TAU); ctx.fill();
  // arms
  ctx.strokeStyle=suitColor; ctx.lineWidth=10;
  ctx.beginPath(); ctx.moveTo(-18,-4); ctx.lineTo(-30,20); ctx.moveTo(18,-4); ctx.lineTo(30,20); ctx.stroke();
  // helmet
  ctx.fillStyle='#eef4fb';
  ctx.beginPath(); ctx.arc(0,-40,20,0,TAU); ctx.fill();
  ctx.fillStyle=visorColor;
  ctx.beginPath(); ctx.ellipse(3,-40,11,12,0,0,TAU); ctx.fill();
  if(yf>0.75){
    ctx.shadowColor=visorColor; ctx.shadowBlur=16; ctx.fill(); ctx.shadowBlur=0;
  }
  ctx.restore();
}

function renderIntro(){
  ctx.clearRect(0,0,W,H);
  const yf = clamp((introState.year-1960)/(2060-1960),0,1);
  drawIntroBackground(introState.year);
  drawIntroCharacter(yf);

  dom.yearLabel.classList.remove('hidden');
  dom.yearLabel.textContent = introState.year;

  if(introState.flash>0){
    ctx.fillStyle = `rgba(255,255,255,${introState.flash*0.22})`;
    ctx.fillRect(0,0,W,H);
  }

  if(introState.phase==='darken' || introState.phase==='ready'){
    ctx.fillStyle = `rgba(0,0,0,${introState.darkAlpha})`;
    ctx.fillRect(0,0,W,H);
  }
}

// ---------- Cutscene: landing ----------
const cutscene = { t:0, phase:'descend' };
function updateCutscene(dt){
  cutscene.t += dt;
  if(cutscene.phase==='descend' && cutscene.t>2.4){ cutscene.phase='land'; cutscene.t=0; }
  else if(cutscene.phase==='land' && cutscene.t>1.0){ cutscene.phase='exit'; cutscene.t=0; }
  else if(cutscene.phase==='exit' && cutscene.t>1.8){ cutscene.phase='fade'; cutscene.t=0; }
  else if(cutscene.phase==='fade' && cutscene.t>0.9){ beginPlaying(); }
}
function renderCutscene(){
  ctx.clearRect(0,0,W,H);
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#050915'); g.addColorStop(1,'#0d1730');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  drawStars(0,0,0.3);

  const groundY = H*0.72;
  ctx.fillStyle='#3a4a63';
  ctx.beginPath(); ctx.ellipse(W/2, groundY+160, W*0.7,180,0,0,TAU); ctx.fill();

  let shipY;
  if(cutscene.phase==='descend'){
    const t = clamp(cutscene.t/2.4,0,1);
    shipY = lerp(-100, groundY-70, easeOutCubic(t));
  } else {
    shipY = groundY-70;
  }
  ctx.save();
  ctx.translate(W/2, shipY);
  ctx.fillStyle='#cfd8e6';
  ctx.beginPath(); ctx.moveTo(0,-60); ctx.quadraticCurveTo(34,10,20,60); ctx.lineTo(-20,60); ctx.quadraticCurveTo(-34,10,0,-60); ctx.fill();
  ctx.fillStyle='#4fd1ff';
  ctx.beginPath(); ctx.arc(0,-10,10,0,TAU); ctx.fill();
  if(cutscene.phase==='descend'){
    ctx.fillStyle='rgba(255,170,60,0.8)';
    ctx.beginPath(); ctx.moveTo(-14,58); ctx.lineTo(0,58+40); ctx.lineTo(14,58); ctx.fill();
  }
  if(cutscene.phase==='exit' || cutscene.phase==='fade'){
    ctx.fillStyle='#1a2233';
    ctx.fillRect(-6,55,12,30); // ramp
  }
  ctx.restore();

  if(cutscene.phase==='exit' || cutscene.phase==='fade'){
    const t = clamp(cutscene.t/1.8,0,1);
    const cx = W/2 + lerp(0,70,t);
    const cy = groundY + lerp(-10,20,t);
    ctx.save();
    ctx.translate(cx,cy);
    ctx.fillStyle='#dff2ff';
    ctx.beginPath(); ctx.ellipse(0,0,10,14,0,0,TAU); ctx.fill();
    ctx.fillStyle='#eef4fb';
    ctx.beginPath(); ctx.arc(0,-18,9,0,TAU); ctx.fill();
    ctx.restore();
  }

  if(cutscene.phase==='fade'){
    const a = clamp(cutscene.t/0.9,0,1);
    ctx.fillStyle=`rgba(0,0,0,${a})`;
    ctx.fillRect(0,0,W,H);
  }
}
function easeOutCubic(t){ return 1-Math.pow(1-t,3); }

// ---------- Ending render ----------
function renderEnding(){
  ctx.clearRect(0,0,W,H);
  const e = game.endingSeq;
  if(e.phase==='autoReturn'){
    ctx.fillStyle='#04060d'; ctx.fillRect(0,0,W,H);
    drawStars(game.camera.x,game.camera.y);
    drawConstellations();
    drawPlanet(HOME);
    const pl = game.player;
    drawCharacter(pl.x,pl.y,pl.facing,'#dff2ff','#2a6fb0');
  } else if(e.phase==='fadeout' || e.phase==='black'){
    ctx.fillStyle='#04060d'; ctx.fillRect(0,0,W,H);
    drawStars(game.camera.x,game.camera.y);
    drawPlanet(HOME);
    const pl = game.player;
    drawCharacter(pl.x,pl.y,pl.facing,'#dff2ff','#2a6fb0');
    if(e.phase==='fadeout'){
      ctx.fillStyle=`rgba(0,0,0,${game.fade})`;
      ctx.fillRect(0,0,W,H);
    } else {
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    }
  } else if(e.phase==='fadein'){
    drawEndingLiftoff(0);
    ctx.fillStyle=`rgba(0,0,0,${game.fade})`;
    ctx.fillRect(0,0,W,H);
  } else if(e.phase==='liftoff'){
    drawEndingLiftoff(clamp(e.t/3.0,0,1));
  } else if(e.phase==='travel'){
    drawEndingTravel(clamp(e.t/3.0,0,1));
  } else if(e.phase==='arrival'){
    drawEndingArrival(clamp(e.t/2.4,0,1));
  } else if(e.phase==='scene'){
    drawEndingScene();
  }
}

// rocket lifts off from the home planet, heading for Earth
function drawEndingLiftoff(t){
  ctx.fillStyle='#050915'; ctx.fillRect(0,0,W,H);
  drawStars(0,0,0.3);
  const groundY = H*0.8;
  ctx.fillStyle='#333f5c';
  ctx.beginPath(); ctx.ellipse(W/2, groundY+160, W*0.7, 180, 0,0,TAU); ctx.fill();
  const shipY = lerp(groundY-70, -120, easeOutCubic(t));
  ctx.save();
  ctx.translate(W/2, shipY);
  ctx.fillStyle='#cfd8e6';
  ctx.beginPath(); ctx.moveTo(0,-60); ctx.quadraticCurveTo(34,10,20,60); ctx.lineTo(-20,60); ctx.quadraticCurveTo(-34,10,0,-60); ctx.fill();
  ctx.fillStyle='#4fd1ff';
  ctx.beginPath(); ctx.arc(0,-10,10,0,TAU); ctx.fill();
  ctx.fillStyle='#dff2ff'; ctx.beginPath(); ctx.arc(-4,-10,2.4,0,TAU); ctx.fill();
  ctx.fillStyle='#8fffb0'; ctx.beginPath(); ctx.arc(4,-10,2.4,0,TAU); ctx.fill();
  if(t>0.02){
    const flameLen = 30+Math.sin(performance.now()*0.03)*8;
    ctx.fillStyle='rgba(255,170,60,0.85)';
    ctx.beginPath(); ctx.moveTo(-14,58); ctx.lineTo(0,58+flameLen); ctx.lineTo(14,58); ctx.fill();
  }
  ctx.restore();
}

// space travel montage: streaking stars, Earth growing closer, rocket in silhouette
function drawEndingTravel(t){
  ctx.fillStyle='#03040a'; ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,0.5)';
  ctx.lineWidth=1.5;
  for(let i=0;i<60;i++){
    const sx=(i*137)%W, sy=(i*89)%H;
    const len=20+((i*53)%40);
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx-len,sy); ctx.stroke();
  }
  ctx.restore();
  const er = lerp(20,130,t);
  const ex = W*0.5, ey = H*0.42;
  const eg = ctx.createRadialGradient(ex-er*0.3,ey-er*0.3,er*0.1, ex,ey,er);
  eg.addColorStop(0,'#6ec6ff'); eg.addColorStop(0.6,'#2f7bd1'); eg.addColorStop(1,'#123a66');
  ctx.fillStyle=eg;
  ctx.beginPath(); ctx.arc(ex,ey,er,0,TAU); ctx.fill();
  ctx.save();
  ctx.translate(W*0.5, H*0.84);
  ctx.fillStyle='#cfd8e6';
  ctx.beginPath(); ctx.moveTo(0,-40); ctx.quadraticCurveTo(22,10,14,40); ctx.lineTo(-14,40); ctx.quadraticCurveTo(-22,10,0,-40); ctx.fill();
  ctx.fillStyle='#4fd1ff'; ctx.beginPath(); ctx.arc(0,-6,7,0,TAU); ctx.fill();
  ctx.fillStyle='#dff2ff'; ctx.beginPath(); ctx.arc(-3,-6,2,0,TAU); ctx.fill();
  ctx.fillStyle='#8fffb0'; ctx.beginPath(); ctx.arc(3,-6,2,0,TAU); ctx.fill();
  ctx.restore();
}

// rocket descends onto Earth's surface
function drawEndingArrival(t){
  ctx.fillStyle='#0a1830'; ctx.fillRect(0,0,W,H);
  drawStars(0,0,0.2);
  const groundY = H*0.78;
  ctx.fillStyle='#2f7bd1';
  ctx.beginPath(); ctx.ellipse(W/2, groundY+200, W*0.9, 240,0,0,TAU); ctx.fill();
  ctx.fillStyle='rgba(80,200,110,0.85)';
  ctx.beginPath(); ctx.ellipse(W*0.3, groundY+40, 90,40,0.2,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W*0.7, groundY+70, 70,32,-0.15,0,TAU); ctx.fill();
  const descendT = clamp(t/0.85,0,1);
  const shipY = lerp(-100, groundY-70, easeOutCubic(descendT));
  ctx.save();
  ctx.translate(W/2, shipY);
  ctx.fillStyle='#cfd8e6';
  ctx.beginPath(); ctx.moveTo(0,-60); ctx.quadraticCurveTo(34,10,20,60); ctx.lineTo(-20,60); ctx.quadraticCurveTo(-34,10,0,-60); ctx.fill();
  ctx.fillStyle='#4fd1ff'; ctx.beginPath(); ctx.arc(0,-10,10,0,TAU); ctx.fill();
  if(descendT<0.95){
    ctx.fillStyle='rgba(255,170,60,0.8)';
    ctx.beginPath(); ctx.moveTo(-14,58); ctx.lineTo(0,98); ctx.lineTo(14,58); ctx.fill();
  }
  ctx.restore();
}

// final peaceful tableau: humans and aliens together on Earth
function drawEndingScene(){
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#8fd3ff'); g.addColorStop(1,'#eaf7ff');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(255,240,190,0.9)';
  ctx.beginPath(); ctx.arc(W*0.82,H*0.18,50,0,TAU); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.85)';
  for(const cx of [W*0.18,W*0.42,W*0.62]){
    ctx.beginPath(); ctx.ellipse(cx,H*0.2,34,14,0,0,TAU); ctx.fill();
  }
  ctx.fillStyle='#5ec26a';
  ctx.beginPath(); ctx.ellipse(W*0.5,H+140,W*0.9,220,0,0,TAU); ctx.fill();
  drawEndingTree(W*0.12, H*0.72);
  drawEndingTree(W*0.9, H*0.68);
  const groundY = H*0.74;
  drawSmallPerson(W*0.36, groundY, '#dff2ff','#2a6fb0');
  drawSmallPerson(W*0.45, groundY+6, '#ffd9a0','#6b4423');
  drawSmallPerson(W*0.56, groundY+4, '#8fffb0','#0b4');
  drawSmallPerson(W*0.65, groundY-4, '#c9a0ff','#4a1f7a');
  if(game.fade>0){
    ctx.fillStyle=`rgba(0,0,0,${game.fade})`;
    ctx.fillRect(0,0,W,H);
  }
}
function drawEndingTree(x,y){
  ctx.fillStyle='#7a4a2a'; ctx.fillRect(x-4,y-10,8,30);
  ctx.fillStyle='#3fae5f';
  ctx.beginPath(); ctx.arc(x,y-24,20,0,TAU); ctx.fill();
}
function drawSmallPerson(x,y,suit,helmet){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=suit;
  ctx.beginPath(); ctx.ellipse(0,10,8,12,0,0,TAU); ctx.fill();
  ctx.fillStyle=helmet;
  ctx.beginPath(); ctx.arc(0,-4,7,0,TAU); ctx.fill();
  ctx.restore();
}

// ---------- Flow control ----------
function beginPlaying(){
  STATE = 'playing';
  dom.hud.classList.remove('hidden');
  dom.shopBtn.classList.remove('hidden');
  dom.endingPreviewBtn.classList.remove('hidden');
  dom.helpBtn.classList.remove('hidden');
  dom.playTimeLabel.classList.remove('hidden');
  dom.yearLabel.classList.add('hidden');
  dom.introDialogue.classList.add('hidden');
  dom.startBtn.classList.add('hidden');
  game.fade = 1;
}

document.getElementById('startBtn').addEventListener('click', ()=>{
  ensureAudio();
  ensureMusic();
  STATE = 'cutscene';
  dom.introDialogue.classList.add('hidden');
  dom.startBtn.classList.add('hidden');
  dom.yearLabel.classList.add('hidden');
  dom.skipIntroBtn.classList.add('hidden');
});

document.getElementById('skipIntroBtn').addEventListener('click', ()=>{
  if(STATE !== 'intro') return;
  introState.year = 2060;
  introState.phase = 'ready';
  introState.darkAlpha = 0.82;
  dom.introDialogue.textContent = '"이제 시대가 변했다. 미지의 우주로 나가자."';
  dom.introDialogue.classList.remove('hidden');
  dom.introDialogue.classList.add('show');
  dom.startBtn.classList.remove('hidden');
  dom.startBtn.classList.add('show');
});

document.getElementById('retryBtn').addEventListener('click', ()=>{
  window.location.reload();
});
document.getElementById('restartBtn').addEventListener('click', ()=>{
  window.location.reload();
});

// ---------- Main loop ----------
function loop(ts){
  if(!lastTime) lastTime = ts;
  let dt = (ts-lastTime)/1000;
  lastTime = ts;
  dt = Math.min(dt, 0.05);

  if(STATE==='intro'){
    updateIntro(dt);
    renderIntro();
  } else if(STATE==='cutscene'){
    updateCutscene(dt);
    renderCutscene();
  } else if(STATE==='playing'){
    if(!paused) updatePlaying(dt);
    renderPlaying();
  } else if(STATE==='ending'){
    updateEnding(dt);
    renderEnding();
  } else if(STATE==='gameover'){
    renderPlaying();
  }
  requestAnimationFrame(loop);
}

// ---------- Init ----------
resize();
resetGame();
requestAnimationFrame(loop);
