/* NULLS CLIMB v2 · fan-made for @nullsxyz · original code */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const app = $('app'), cv = $('cv'), ctx = cv.getContext('2d');
const store = {
  get(k, d) { try { const v = localStorage.getItem('nc_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nc_' + k, JSON.stringify(v)); } catch (e) {} }
};
const AV = 'v2';

/* ---------- characters & perks ---------- */
const CHARS = [
  { id: 'gold', name: 'GOLD GUARD', perk: 'starts every run with a SHIELD', short: 'START SHIELD' },
  { id: 'purple', name: 'PURPLE CAP', perk: 'combos last longer & start at x2', short: 'COMBO PRO' },
  { id: 'denim', name: 'DENIM NULL', perk: 'big magnet for memory fragments', short: 'BIG MAGNET' }
];
const IMG = {};
const list = ['card', 'card_red', 'bomb'];
CHARS.forEach(c => { list.push(c.id + '_climb_' + AV, c.id + '_jump_' + AV); });
const ok = im => !!(im && im.complete && im.naturalWidth > 0);
function loadAll(onp) {
  let n = 0;
  return Promise.all(list.map(k => new Promise(res => {
    const im = new Image();
    im.onload = im.onerror = () => { n++; onp(n / list.length); res(); };
    im.src = 'assets/' + k + '.png';
    IMG[k] = im;
  })));
}
const sprite = (c, p) => IMG[c.id + '_' + p + '_' + AV];

/* ---------- audio ---------- */
let AC = null, NOISE = null, muted = store.get('muted', false);
function audio() {
  if (AC || muted) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    NOISE = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate);
    const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function tone(f, d, type = 'square', vol = 0.07, slide = 0, delay = 0) {
  if (!AC || muted) return;
  try {
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) {}
}
function noise(d, vol = 0.08, hp = 800, delay = 0) {
  if (!AC || muted || !NOISE) return;
  try {
    const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = NOISE; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t); s.stop(t + d + 0.02);
  } catch (e) {}
}
const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
const SFX = {
  jump: () => { tone(380, 0.08, 'square', 0.045, 300); noise(0.06, 0.025, 2500); },
  land: () => tone(140, 0.05, 'triangle', 0.05),
  kill: c => { const n = NOTES[Math.min(c - 1, NOTES.length - 1)]; tone(n, 0.09, 'square', 0.06, n * 0.5); tone(n * 1.5, 0.1, 'triangle', 0.05, 0, 0.05); noise(0.12, 0.06, 1200); },
  frag: c => tone(NOTES[c % NOTES.length] * 2, 0.05, 'triangle', 0.035),
  card: () => { tone(660, 0.08, 'triangle', 0.08); tone(990, 0.14, 'triangle', 0.08, 0, 0.08); },
  gold: () => { [0, 1, 2, 3, 4, 5].forEach(i => tone(NOTES[i + 2], 0.12, 'square', 0.05, 0, i * 0.06)); tone(1568, 0.4, 'triangle', 0.06, 0, 0.36); },
  shield: () => { tone(200, 0.25, 'sawtooth', 0.07, -120); noise(0.2, 0.06, 400); },
  boost: () => { [0, 1, 2, 3].forEach(i => tone(330 * (i + 2), 0.1, 'square', 0.05, 0, i * 0.07)); },
  die: () => { tone(300, 0.55, 'sawtooth', 0.09, -260); noise(0.5, 0.1, 200); },
  zone: () => tone(520, 0.3, 'triangle', 0.05, 300),
  mile: () => { tone(784, 0.1, 'square', 0.05); tone(1047, 0.18, 'square', 0.05, 0, 0.1); },
  near: () => { noise(0.18, 0.05, 3000); tone(1200, 0.08, 'sine', 0.04, 600); },
  warn: () => { tone(880, 0.07, 'square', 0.04); tone(880, 0.07, 'square', 0.04, 0, 0.14); }
};
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* ---------- world constants (meters) ---------- */
const WM = 9.75, WALL = 1.15, PWB = 0.95, PHB = 1.7, SPR_H = 2.75, JT = 0.27;
const SHAFT_L = WALL, SHAFT_R = WM - WALL, MID = WM / 2;
const xOn = side => side === 0 ? WALL + 0.55 : WM - WALL - 0.55;
const speedAt = a => 6.4 + 6.8 * (1 - Math.exp(-a / 950));
const ZONES = [
  { at: 0, name: 'VOID ALLEY', sub: 'red rooms, blue nights' },
  { at: 250, name: 'WIREFRAME', sub: 'sector 02 · ERASE lasers online' },
  { at: 600, name: 'NULL SKY', sub: 'sector 03 · corrupted blocks falling' },
  { at: 1200, name: 'THE VOID', sub: 'sector 04 · do not erase' }
];

/* ---------- view ---------- */
let GW = 390, GH = 844, DPR = 1, PPM = 40, VH = 21, PY = 570;
function resize() {
  GW = app.clientWidth || 390; GH = app.clientHeight || 844;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(GW * DPR); cv.height = Math.round(GH * DPR);
  PPM = GW / WM; VH = GH / PPM; PY = GH * 0.68;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
const sx = m => m * PPM;

/* ---------- RNG / math ---------- */
const R = Math.random, rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

/* ---------- state ---------- */
let state = 'load';
let charIdx = store.get('char', 0) % 3, playedIdx = charIdx;
let best = store.get('best2', 0), bestM = store.get('bestm', store.get('best', 0));
let P, objs, parts, rings, texts, alt, time, kills, shield, boostMeter, boostT, graceT, nextAlt, lastWall, lastCard, lastGold, zoneIdx, shake, dieT, runSpeed;
let score, combo, comboT, bestCombo, frags, nears, golds, nextMile, fallT, flash, mileT, mileTxt;
const C = () => CHARS[charIdx];
function reset() {
  P = { side: 0, mode: 'wall', x: xOn(0), jt: 0, from: 0, to: 1, buf: 0, rot: 0, vy: 0, dy: 0, vx: 0 };
  objs = []; parts = []; rings = []; texts = [];
  alt = 0; time = 0; kills = 0; shield = C().id === 'gold'; boostMeter = 0; boostT = 0; graceT = 0;
  nextAlt = 15; lastWall = [{ end: -99 }, { end: -99 }]; lastCard = 40; lastGold = 60; zoneIdx = 0; shake = 0; dieT = 0; runSpeed = speedAt(0);
  score = 0; combo = 0; comboT = 0; bestCombo = 0; frags = 0; nears = 0; golds = 0; nextMile = 100; fallT = 4; flash = 0; mileT = 0; mileTxt = '';
}
reset();

/* ---------- generator (always solvable) ---------- */
const clearance = a => speedAt(a) * JT + PHB + 1.0;
function wallFree(side, lo, hi) {
  for (const o of objs) if (!o.dead && o.k === 'wall' && o.side === side && o.a < hi && o.a + o.len > lo) return false;
  return true;
}
function placeWall(side, a0, len, type) {
  const other = 1 - side;
  a0 = Math.max(a0, lastWall[other].end + clearance(a0), lastWall[side].end + 1.2);
  const o = { k: 'wall', side, a: a0, len, type, w: type === 'card' ? 1.05 : rr(0.8, 1.0), seed: R() * 1000, px: [], passed: false };
  if (type === 'pixels') for (let i = 0; i < 18; i++) o.px.push([R(), R(), pick(['#ff003c', '#00c8ff', '#d63fd6', '#fff6d8', '#f5b342'])]);
  objs.push(o);
  lastWall[side] = { end: a0 + len };
  return o;
}
function blockBoth(a0, a1) { [0, 1].forEach(s => { lastWall[s] = { end: Math.max(lastWall[s].end, a1) }; }); }
function placeFlyer(a, type) {
  const c = clearance(a);
  a = Math.max(a, lastWall[0].end + c * 0.7, lastWall[1].end + c * 0.7);
  const o = { k: 'fly', type, a, x: MID, ph: R() * 6.28, spd: type === 'bomb' ? rr(0.9, 1.4) : rr(1.4, 2.2),
    amp: (SHAFT_R - SHAFT_L) / 2 - 0.35, r: type === 'bomb' ? 0.5 : 0.42, dead: false, near: false };
  objs.push(o); blockBoth(a, a + 1.2);
  return o;
}
function placeFragLine(side, a0, n) {
  for (let i = 0; i < n; i++) objs.push({ k: 'frag', a: a0 + i * 0.85, x: xOn(side), ph: i * 0.6, dead: false });
}
function placeFragArc(a0, fromSide) {
  // arc across the shaft: grabbed while jumping
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6, x = lerp(xOn(fromSide), xOn(1 - fromSide), t);
    objs.push({ k: 'frag', a: a0 + Math.sin(t * Math.PI) * 1.2, x, ph: i, dead: false });
  }
}
function placeLaser(a) {
  const c = clearance(a) + 0.5;
  a = Math.max(a, lastWall[0].end + c, lastWall[1].end + c);
  objs.push({ k: 'laser', a, per: rr(1.4, 2.0), ph: R() * 2, dead: false, on: false });
  blockBoth(a, a + PHB + 1.5);
  return a;
}
function spawnEvent() {
  const d = clamp(nextAlt / 1500, 0, 1);
  const gap = () => lerp(4.2, 1.6, d) + R() * lerp(4.5, 2.2, d);
  const startA = nextAlt;
  // rare golden memory card
  if (nextAlt > lastGold + 280 && R() < 0.06) {
    const a = Math.max(nextAlt, lastWall[0].end + 1, lastWall[1].end + 1) + 1;
    objs.push({ k: 'gold', a, x: MID, t: 0, dead: false }); lastGold = a; nextAlt = a + 4; return;
  }
  if (!shield && nextAlt > lastCard + 110 && R() < 0.35) {
    const a = Math.max(nextAlt, lastWall[0].end + 1, lastWall[1].end + 1);
    objs.push({ k: 'card', a: a + 1, x: MID, t: 0, dead: false });
    lastCard = a; nextAlt = a + 4; return;
  }
  const roll = R();
  if (nextAlt > 600 && roll < 0.10 + (nextAlt > 1200 ? 0.06 : 0)) {
    const c = clearance(nextAlt), L = speedAt(nextAlt) * 2.2 + 4;
    const a = Math.max(nextAlt, lastWall[0].end + c, lastWall[1].end + c);
    objs.push({ k: 'ftrig', a, dead: false }); blockBoth(a, a + L);
    nextAlt = a + L + gap() * 0.5; return;
  }
  if (nextAlt > 250 && roll < 0.22 + d * 0.06) {
    const a = placeLaser(nextAlt + 1);
    nextAlt = a + PHB + 2 + gap() * 0.5;
  } else if (roll < 0.58 - d * 0.1) {
    const side = R() < 0.5 ? 0 : 1;
    const len = rr(1.3, 2.3) + d * rr(0, 1.4);
    const type = pick(['erase', 'erase', 'pixels', 'card']);
    const o = placeWall(side, nextAlt, len, type);
    // reward line on the free wall next to it (risk-free) or the arc across
    if (R() < 0.55) placeFragLine(1 - side, o.a - 0.5, 3 + ((R() * 3) | 0));
    nextAlt = o.a + o.len + gap();
  } else if (roll < 0.80) {
    const o = placeFlyer(nextAlt + 1, R() < 0.5 ? 'bomb' : 'bug');
    nextAlt = o.a + 2.5 + gap() * 0.6;
  } else if (roll < 0.9 && d > 0.15) {
    let a = nextAlt + 1, n = 2 + (R() < d ? 1 : 0) + (R() < d * 0.5 ? 1 : 0), o;
    for (let i = 0; i < n; i++) { o = placeFlyer(a, i % 2 ? 'bomb' : 'bug'); o.ph = i * 1.4; a = o.a + 2.3; }
    nextAlt = a + gap();
  } else {
    let side = R() < 0.5 ? 0 : 1, n = 2 + ((R() * (2 + d * 2)) | 0), o;
    for (let i = 0; i < n; i++) { o = placeWall(side, nextAlt, rr(1.2, 2.0), pick(['erase', 'pixels'])); nextAlt = o.a + o.len; side = 1 - side; }
    if (R() < 0.6) placeFragArc(nextAlt + 1.5, side);
    nextAlt += gap();
  }
  if (nextAlt <= startA) nextAlt = startA + 2;
}

/* ---------- gameplay ---------- */
function startRun() {
  audio(); reset(); state = 'play';
  show(null); $('hud').classList.remove('hidden');
  updHud(true); zoneBanner(0);
  if (shield) floatText(MID, 3.5, 'SHIELD READY', '#f5b342');
}
function addScore(n) { score += n; }
function jump() {
  if (state !== 'play' || boostT > 0) return;
  if (P.mode === 'wall') {
    // near miss: leaving just before a wall hazard on this side
    const top = alt + PHB / 2;
    for (const o of objs) {
      if (o.dead || o.passed) continue;
      if ((o.k === 'wall' && o.side === P.side && o.a - top > -0.05 && o.a - top < 0.75) ||
          (o.k === 'fall' && o.side === P.side && o.warn <= 0 && o.a - top > -0.2 && o.a - top < 1.3)) {
        o.passed = true; nearMiss(); break;
      }
    }
    P.mode = 'jump'; P.jt = 0; P.from = P.side; P.to = 1 - P.side; P.buf = 0;
    SFX.jump();
    for (let i = 0; i < 6; i++) parts.push(mkPart(P.x, alt - 0.6, P.side === 0 ? 1 : -1, '#fff6d8'));
  } else if (P.mode === 'jump') P.buf = 0.2;
}
function nearMiss() {
  nears++; addScore(25); SFX.near();
  floatText(P.x + (P.side === 0 ? 1.6 : -1.6), alt + 1.4, 'NEAR MISS +25', '#00c8ff', 0.8);
}
function mkPart(x, a, dir, col, big) {
  return { x, a, vx: dir * rr(1, 4) + rr(-1.5, 1.5), va: rr(-2, 3), life: rr(0.35, 0.7), max: 0.7, s: big ? rr(0.14, 0.3) : rr(0.07, 0.16), col };
}
function burst(x, a, cols, n = 18, pow = 1) {
  for (let i = 0; i < n; i++) { const p = mkPart(x, a, R() < 0.5 ? -1 : 1, pick(cols), true); p.vx *= pow; p.va *= pow; parts.push(p); }
  if (parts.length > 400) parts.splice(0, parts.length - 400);
}
function ring(x, a, col, r1 = 1.6) { rings.push({ x, a, col, t: 0, r1 }); if (rings.length > 20) rings.shift(); }
function floatText(x, a, s, col, size = 0.55) { texts.push({ x: clamp(x, 2.6, WM - 2.6), a, s, col, t: 0, size }); if (texts.length > 14) texts.shift(); }
function comboWindow() { return C().id === 'purple' ? 3.3 : 2.2; }
function addKill(o, viaBoost) {
  o.dead = true; kills++;
  combo = comboT > 0 ? combo + 1 : (C().id === 'purple' ? 2 : 1);
  comboT = comboWindow(); bestCombo = Math.max(bestCombo, combo);
  const mult = Math.min(combo, 10), pts = 10 * mult;
  addScore(pts);
  burst(o.x, o.a, o.type === 'bomb' ? ['#fff6d8', '#ff003c', '#f5b342'] : ['#ff003c', '#00c8ff', '#d63fd6'], 14 + mult * 2, 1 + mult * 0.08);
  ring(o.x, o.a, o.type === 'bomb' ? '#f5b342' : '#00c8ff', 1.2 + mult * 0.15);
  floatText(o.x, o.a + 0.6, '+' + pts, '#00c8ff');
  if (combo >= 2) { texts = texts.filter(t => !t.combo); floatText(MID, alt + 3.2, 'x' + mult + ' COMBO!', mult >= 5 ? '#ff003c' : '#f5b342', 0.62 + Math.min(mult, 6) * 0.04); texts[texts.length - 1].combo = true; shake = Math.max(shake, 0.08 + mult * 0.025); }
  else shake = Math.max(shake, 0.06);
  flash = Math.max(flash, 0.06 + mult * 0.01);
  SFX.kill(combo); buzz(12 + mult * 3);
  if (!viaBoost && boostT <= 0) { boostMeter++; if (boostMeter >= 5) startBoost(); }
}
function startBoost() {
  boostMeter = 0; boostT = 3.2; P.mode = 'boost'; P.buf = 0;
  floatText(MID, alt + 2, 'REBOOT!', '#00c8ff', 0.9); ring(P.x, alt, '#00c8ff', 3); SFX.boost(); buzz(40);
}
function endBoost() {
  const v = speedAt(alt), lo = alt - 3, hi = alt + v * 1.4 + 3;
  objs.forEach(o => { if ((o.k === 'wall' || o.k === 'fall' || o.k === 'laser') && o.a < hi && o.a + (o.len || 0.5) > lo) { o.dead = true; burst(MID, o.a, ['#00c8ff', '#fff6d8'], 6); } });
  blockBoth(lo, hi);
  nextAlt = Math.max(nextAlt, hi + 2);
  P.mode = 'jump'; P.from = P.x < MID ? 1 : 0; P.to = P.x < MID ? 0 : 1; P.jt = JT * 0.5; graceT = 1.1;
  fallT = Math.max(fallT, 3);
}
function hit(o) {
  if (boostT > 0 || graceT > 0) {
    if (o.k === 'fly') addKill(o, true);
    else if (boostT > 0 && o.k !== 'laser') { o.dead = true; burst(P.x, alt, ['#00c8ff', '#fff6d8'], 10); addScore(5); }
    return;
  }
  if (shield) {
    shield = false; graceT = 1.0; SFX.shield(); buzz(30); shake = 0.25;
    if (o.k !== 'laser') o.dead = true;
    burst(P.x, alt, ['#f5b342', '#fff6d8'], 22); ring(P.x, alt, '#f5b342', 2.2);
    floatText(P.x, alt + 1.2, 'SAVED!', '#f5b342'); return;
  }
  die();
}
function die() {
  state = 'dying'; dieT = 0; shake = 0.45; SFX.die(); buzz([60, 40, 90]);
  P.vy = 7; P.vx = P.side === 0 ? 2.5 : -2.5; P.dy = 0;
  burst(P.x, alt, ['#ff003c', '#fff6d8', '#07080c'], 26); ring(P.x, alt, '#ff003c', 2.5);
}
function gameOver() {
  state = 'over';
  const m = Math.floor(alt), total = Math.floor(score + m);
  const isNew = total > best; if (isNew) { best = total; store.set('best2', best); }
  if (m > bestM) { bestM = m; store.set('bestm', bestM); }
  let daily = store.get('daily', { d: '', s: 0 }); if (daily.d !== today()) daily = { d: today(), s: 0 };
  const newDaily = total > daily.s; if (newDaily) { daily.s = total; store.set('daily', daily); }
  playedIdx = charIdx; charIdx = (charIdx + 1) % CHARS.length; store.set('char', charIdx);
  $('oMeters').textContent = m; $('oScore').textContent = total; $('oBest').textContent = best; $('oDaily').textContent = daily.s;
  $('oKills').textContent = kills; $('oCombo').textContent = 'x' + Math.min(bestCombo, 10);
  $('oFrags').textContent = frags; $('oNear').textContent = nears; $('oGold').textContent = golds;
  $('oPlayed').textContent = CHARS[playedIdx].name;
  $('oNew').classList.toggle('hidden', !isNew);
  $('oNew').textContent = 'NEW BEST!';
  if (!isNew && newDaily) { $('oNew').classList.remove('hidden'); $('oNew').textContent = 'TODAY\u2019S BEST!'; }
  setChar('o', charIdx);
  const url = location.origin + location.pathname;
  const txt = `I climbed ${m}m and scored ${total} in NULLS CLIMB as ${CHARS[playedIdx].name} 🧗‍♂️\nbest combo x${Math.min(bestCombo, 10)} · ${kills} glitch${kills === 1 ? '' : 'es'} sliced\n\nDO NOT ERASE. can you beat it? @nullsxyz`;
  $('btnShare').href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt) + '&url=' + encodeURIComponent(url);
  $('hud').classList.add('hidden');
  show('scrOver');
}

function step(dt) {
  time += dt;
  if (state === 'dying') {
    dieT += dt; P.vy -= 22 * dt; P.dy += P.vy * dt; P.x += P.vx * dt; P.rot += dt * 9;
    stepFx(dt);
    if (dieT > 0.95) gameOver();
    return;
  }
  if (state !== 'play') return;
  const v = speedAt(alt) * (boostT > 0 ? 2.1 : 1);
  runSpeed = v; alt += v * dt;
  if (graceT > 0) graceT -= dt;
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboT = 0; combo = 0; } }
  // player
  if (P.mode === 'jump') {
    P.jt += dt;
    const t = clamp(P.jt / JT, 0, 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    P.x = lerp(xOn(P.from), xOn(P.to), e);
    P.rot = Math.sin(t * Math.PI) * (P.to === 1 ? 0.25 : -0.25);
    if (t >= 1) {
      P.mode = 'wall'; P.side = P.to; P.x = xOn(P.side); P.rot = 0; SFX.land();
      for (let i = 0; i < 5; i++) parts.push(mkPart(P.x + (P.side === 0 ? -0.4 : 0.4), alt - 0.5, P.side === 0 ? 1 : -1, '#fff6d8'));
      if (P.buf > 0) { P.buf = 0; jump(); }
    }
    if (P.buf > 0) P.buf -= dt;
  } else if (P.mode === 'boost') {
    P.x = lerp(P.x, MID, Math.min(1, dt * 8)); P.rot = 0;
    boostT -= dt;
    if (R() < 0.8) parts.push({ x: P.x + rr(-0.3, 0.3), a: alt - 1, vx: rr(-0.5, 0.5), va: -rr(4, 9), life: 0.4, max: 0.4, s: rr(0.1, 0.22), col: pick(['#00c8ff', '#fff6d8', '#d63fd6']) });
    if (boostT <= 0) { boostT = 0; endBoost(); }
  }
  while (nextAlt < alt + VH + 12) spawnEvent();
  // milestones
  if (alt >= nextMile) {
    mileTxt = nextMile + 'm'; mileT = 1.4; addScore(50); SFX.mile();
    floatText(MID, alt + 2.6, 'MILESTONE +50', '#fff6d8', 0.45); nextMile += 100;
  }
  if (mileT > 0) mileT -= dt;
  // collisions
  const pl = P.x - PWB / 2, pr = P.x + PWB / 2, pb = alt - PHB / 2, pt = alt + PHB / 2;
  const mag = C().id === 'denim' ? 2.3 : 0.9;
  for (const o of objs) {
    if (o.dead) continue;
    if (o.k === 'fly') {
      o.ph += dt * o.spd; o.x = MID + Math.sin(o.ph) * o.amp;
      const cx = clamp(o.x, pl, pr), cy = clamp(o.a, pb, pt), d2 = (o.x - cx) ** 2 + (o.a - cy) ** 2;
      if (d2 < o.r * o.r) {
        if (P.mode === 'jump' || P.mode === 'boost') addKill(o, P.mode === 'boost'); else hit(o);
        if (state !== 'play') return;
      } else if (P.mode === 'wall' && !o.near && d2 < (o.r + 0.45) ** 2 && o.a < alt) { o.near = true; nearMiss(); }
    } else if (o.k === 'wall') {
      const l = o.side === 0 ? WALL : WM - WALL - o.w, r = l + o.w;
      if (pr > l + 0.08 && pl < r - 0.08 && pt > o.a + 0.1 && pb < o.a + o.len - 0.1) { hit(o); if (state !== 'play') return; }
    } else if (o.k === 'ftrig') {
      if (alt >= o.a) { o.dead = true; if (boostT <= 0) { const side = P.mode === 'jump' ? P.to : P.side; objs.push({ k: 'fall', side, warn: 1.0, a: alt + PY / PPM + 1, len: 1.4, vf: 9, dead: false, near: false }); SFX.warn(); } }
    } else if (o.k === 'fall') {
      if (o.warn > 0) { o.warn -= dt; o.a = alt + PY / PPM + 1; }
      else {
        o.a -= o.vf * dt;
        const l = o.side === 0 ? WALL : WM - WALL - 1.0, r = l + 1.0;
        if (pr > l + 0.1 && pl < r - 0.1 && pt > o.a + 0.1 && pb < o.a + o.len - 0.1) { hit(o); if (state !== 'play') return; }
        if (!o.passed && o.a + o.len < pb && P.mode === 'wall' && P.side !== o.side) { o.passed = true; }
      }
    } else if (o.k === 'laser') {
      const ph = ((time + o.ph) % o.per) / o.per; o.on = ph > 0.45; o.warnOn = ph > 0.3 && ph <= 0.45;
      if (o.on && pt > o.a - 0.12 && pb < o.a + 0.12 && pr > SHAFT_L + 1.3 && pl < SHAFT_R - 1.3) { hit(o); if (state !== 'play') return; }
    } else if (o.k === 'frag') {
      o.ph += dt * 4;
      const dx = P.x - o.x, da = alt - o.a, dd = Math.hypot(dx, da);
      if (dd < mag && dd > 0.01) { const pull = Math.min(1, dt * 14); o.x += dx * pull; o.a += da * pull; }
      if (dd < 0.75) {
        o.dead = true; frags++; addScore(5); SFX.frag(frags);
        burst(o.x, o.a, ['#00c8ff', '#fff6d8'], 4, 0.6);
      }
    } else if (o.k === 'card' || o.k === 'gold') {
      o.t += dt;
      if (Math.abs(o.x - P.x) < 0.95 && Math.abs(o.a - alt) < 1.25) {
        o.dead = true;
        if (o.k === 'card') {
          shield = true; SFX.card(); buzz(20);
          burst(o.x, o.a, ['#f5b342', '#fff6d8'], 16); ring(o.x, o.a, '#f5b342'); floatText(o.x, o.a + 1, 'DO NOT ERASE', '#f5b342');
        } else {
          golds++; addScore(250); SFX.gold(); buzz([20, 30, 20]); shake = 0.2; flash = 0.25;
          burst(o.x, o.a, ['#f5b342', '#fff6d8', '#ffe27a'], 40, 1.4); ring(o.x, o.a, '#f5b342', 3.2);
          floatText(MID, alt + 2.8, 'GOLDEN MEMORY +250', '#f5b342', 0.62);
        }
      }
    }
  }
  objs = objs.filter(o => !o.dead && (o.k === 'wall' || o.k === 'fall' ? o.a + o.len : o.a) > alt - VH);
  for (let i = ZONES.length - 1; i > zoneIdx; i--) if (alt >= ZONES[i].at) { zoneIdx = i; zoneBanner(i); SFX.zone(); break; }
  stepFx(dt);
  updHud();
}
function stepFx(dt) {
  for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.a += p.va * dt; p.va -= 6 * dt; }
  parts = parts.filter(p => p.life > 0);
  for (const r of rings) r.t += dt; rings = rings.filter(r => r.t < 0.4);
  for (const t of texts) t.t += dt; texts = texts.filter(t => t.t < 0.95);
  if (shake > 0) shake = Math.max(0, shake - dt);
  if (flash > 0) flash = Math.max(0, flash - dt);
}

/* ---------- HUD / screens ---------- */
let hc = {};
function updHud(force) {
  const m = Math.floor(alt), tot = Math.floor(score + m);
  const v = { m, tot, best: Math.max(best, tot), shield, bm: boostMeter, bt: boostT > 0, cb: comboT > 0 ? Math.min(combo, 10) : 0 };
  if (force) hc = {};
  if (hc.m !== m) $('hMeters').textContent = m;
  if (hc.tot !== tot) $('hScore').textContent = tot;
  if (hc.best !== v.best) $('hBest').textContent = v.best;
  if (hc.shield !== shield) $('hShield').classList.toggle('off', !shield);
  if (hc.bm !== boostMeter || hc.bt !== v.bt) {
    const is = $('hBoost').querySelectorAll('i');
    for (let i = 0; i < is.length; i++) is[i].classList.toggle('on', v.bt || i < boostMeter);
    $('hBoost').classList.toggle('live', v.bt);
  }
  if (hc.cb !== v.cb) {
    const el = $('hCombo'); el.classList.toggle('hidden', v.cb < 2); el.textContent = 'x' + v.cb;
    if (v.cb >= 2) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  if (v.cb >= 2) { const tt = (comboT / comboWindow()).toFixed(2); if (tt !== hc.tt) $('hCombo').style.setProperty('--t', tt); v.tt = tt; }
  hc = v;
}
function zoneBanner(i) {
  const z = $('zone'); z.innerHTML = ZONES[i].name + '<small>' + ZONES[i].sub + '</small>';
  z.classList.remove('show'); void z.offsetWidth; z.classList.add('show');
}
const SCREENS = ['scrLoad', 'scrStart', 'scrPause', 'scrOver'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  if (id) { const el = $(id); el.style.pointerEvents = 'none'; setTimeout(() => { el.style.pointerEvents = ''; }, id === 'scrOver' ? 550 : 120); }
}
function setChar(pre, i) {
  $(pre + 'Char').src = 'assets/' + CHARS[i].id + '_climb_' + AV + '.png';
  $(pre + 'CharName').textContent = CHARS[i].name;
  $(pre + 'Perk').textContent = CHARS[i].perk;
}
function toMenu() {
  state = 'menu'; reset();
  setChar('s', charIdx);
  $('sDots').innerHTML = CHARS.map((c, i) => '<i class="' + (i === charIdx ? 'on' : '') + '"></i>').join('');
  $('sBest').textContent = best;
  const daily = store.get('daily', { d: '', s: 0 }); $('sDaily').textContent = daily.d === today() ? daily.s : 0;
  $('hud').classList.add('hidden');
  show('scrStart');
}
function pause() { if (state !== 'play') return; state = 'pause'; show('scrPause'); }
function resume() { if (state !== 'pause') return; state = 'play'; show(null); last = performance.now(); }

/* ---------- render ---------- */
function zoneMix() {
  for (let i = ZONES.length - 1; i >= 0; i--) if (alt >= ZONES[i].at) {
    const t = i > 0 ? clamp((alt - ZONES[i].at) / 40, 0, 1) : 1;
    return t < 1 ? [i - 1, i, t] : [i, i, 1];
  }
  return [0, 0, 1];
}
const BG = [
  { top: '#2a0410', bot: '#07080c', wall: '#140a10', edge: '#ff003c', led: '#ff003c' },
  { top: '#03132a', bot: '#030510', wall: '#0a1020', edge: '#00c8ff', led: '#00c8ff' },
  { top: '#0d1a4a', bot: '#1a0b2e', wall: '#0e1030', edge: '#8fa8ff', led: '#f5b342' },
  { top: '#000000', bot: '#0b0b12', wall: '#0b0b0f', edge: '#fff6d8', led: '#d63fd6' }
];
const gradCache = {};
function bgGrad(i) {
  const k = i + ':' + GH;
  if (!gradCache[k]) { const g = ctx.createLinearGradient(0, 0, 0, GH); g.addColorStop(0, BG[i].top); g.addColorStop(1, BG[i].bot); gradCache[k] = g; }
  return gradCache[k];
}
function drawBgZone(i, a) {
  ctx.globalAlpha = a; ctx.fillStyle = bgGrad(i); ctx.fillRect(0, 0, GW, GH);
  const par = alt * 0.25;
  if (i === 0) {
    const st = 3.2;
    for (let k = Math.floor((par - 4) / st); k < (par + VH + 4) / st; k++) {
      const y = PY - (k * st - par) * PPM;
      for (let c = 0; c < 4; c++) {
        const lit = ((k * 7 + c * 13) % 5) !== 0;
        ctx.fillStyle = lit ? 'rgba(255,0,60,' + (0.10 + (((k + c) % 3 + 3) % 3) * 0.05) + ')' : 'rgba(255,0,60,0.03)';
        ctx.fillRect(sx(1.9 + c * 1.55), y, sx(0.95), sx(1.6));
      }
    }
  } else if (i === 1) {
    ctx.strokeStyle = 'rgba(0,200,255,0.16)'; ctx.lineWidth = 1;
    const st = 1.5, off = (par % st) * PPM;
    ctx.beginPath();
    for (let y = -st * PPM + off; y < GH + st * PPM; y += st * PPM) { ctx.moveTo(0, y); ctx.lineTo(GW, y); }
    for (let c = 0; c <= 8; c++) { const x = sx(WALL + c * (WM - 2 * WALL) / 8); ctx.moveTo(x, 0); ctx.lineTo(x, GH); }
    ctx.stroke();
  } else if (i === 2) {
    for (let k = 0; k < 40; k++) {
      const x = ((k * 97) % 100) / 100 * GW, yy = ((k * 61 + par * 3) % (GH + 40)) - 20;
      ctx.fillStyle = 'rgba(255,246,216,' + (0.3 + (k % 3) * 0.2) + ')'; ctx.fillRect(x, GH - yy, 2, 2);
    }
    ctx.fillStyle = 'rgba(255,246,216,0.85)'; ctx.beginPath(); ctx.arc(GW * 0.7, GH * 0.22, sx(0.9), 0, 7); ctx.fill();
    ctx.fillStyle = BG[2].top; ctx.beginPath(); ctx.arc(GW * 0.7 + sx(0.35), GH * 0.22 - sx(0.2), sx(0.8), 0, 7); ctx.fill();
  } else {
    for (let k = 0; k < 60; k++) {
      const x = ((k * 53) % 100) / 100 * GW, yy = ((k * 37 + par * (2 + k % 3)) % (GH + 20)) - 10;
      ctx.fillStyle = k % 9 === 0 ? '#ff003c' : 'rgba(255,246,216,0.5)'; ctx.fillRect(x, GH - yy, 3, 3);
    }
  }
  ctx.globalAlpha = 1;
}
const scrY = a => PY - (a - alt) * PPM;
function drawWalls(z) {
  const zc = BG[z], st = 2.0;
  for (let side = 0; side < 2; side++) {
    const x0 = side === 0 ? 0 : GW - sx(WALL), w = sx(WALL);
    ctx.fillStyle = zc.wall; ctx.fillRect(x0, 0, w, GH);
    for (let k = Math.floor((alt - VH) / st) - 1; k < (alt + VH) / st + 1; k++) {
      const y = scrY((k + 1) * st), h = st * PPM;
      if (y > GH || y + h < 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(x0 + 4, y + 3, w - 8, h - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x0, y, w, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let v = 0; v < 3; v++) ctx.fillRect(x0 + w * 0.2, y + h * 0.55 + v * 6, w * 0.6, 2);
      const on = ((((k * 31 + side * 17 + Math.floor(time * 2)) % 4) + 4) % 4) !== 0;
      ctx.fillStyle = on ? zc.led : 'rgba(255,255,255,0.1)';
      ctx.fillRect(x0 + w * (side === 0 ? 0.25 : 0.6), y + h * 0.2, 5, 5);
      ctx.fillRect(x0 + w * (side === 0 ? 0.45 : 0.4), y + h * 0.2, 5, 5);
    }
    const ex = side === 0 ? w : GW - w;
    ctx.fillStyle = zc.edge; ctx.globalAlpha = 0.85; ctx.fillRect(ex - (side === 0 ? 3 : 0), 0, 3, GH);
    ctx.globalAlpha = 0.18; ctx.fillRect(ex - (side === 0 ? 10 : -7), 0, 3, GH); ctx.globalAlpha = 1;
  }
}
function drawErase(x, yTop, w, h, side, jit) {
  ctx.fillStyle = 'rgba(255,0,60,0.25)'; ctx.fillRect(x - 3 + jit, yTop - 2, w + 6, h + 4);
  ctx.fillStyle = '#2a0008'; ctx.fillRect(x + jit, yTop, w, h);
  ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 2; ctx.strokeRect(x + 1 + jit, yTop + 1, w - 2, h - 2);
  ctx.save(); ctx.beginPath(); ctx.rect(x + jit, yTop, w, h); ctx.clip();
  ctx.fillStyle = 'rgba(255,0,60,0.35)';
  for (let s = -w; s < h + w; s += 14) { ctx.beginPath(); ctx.moveTo(x + jit, yTop + s); ctx.lineTo(x + jit + w, yTop + s - w); ctx.lineTo(x + jit + w, yTop + s - w + 6); ctx.lineTo(x + jit, yTop + s + 6); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.translate(x + w / 2 + jit, yTop + h / 2); ctx.rotate(-Math.PI / 2);
  ctx.font = '700 ' + Math.round(Math.min(w * 0.42, 15)) + 'px Silk, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00c8ff'; ctx.fillText('ERASE', 1.5, 1); ctx.fillStyle = '#fff6d8'; ctx.fillText('ERASE', 0, 0);
  ctx.restore();
  ctx.fillStyle = '#ff003c';
  const sxp = side === 0 ? x + w : x, dir = side === 0 ? 1 : -1, n = Math.max(2, Math.round(h / 14));
  for (let i = 0; i < n; i++) { const y0 = yTop + (i + 0.15) * h / n, y1 = yTop + (i + 0.85) * h / n; ctx.beginPath(); ctx.moveTo(sxp, y0); ctx.lineTo(sxp + dir * 7, (y0 + y1) / 2); ctx.lineTo(sxp, y1); ctx.fill(); }
}
function drawWallObj(o) {
  const yTop = scrY(o.a + o.len), h = o.len * PPM, w = sx(o.w);
  if (yTop > GH + 10 || yTop + h < -10) return;
  const x = o.side === 0 ? sx(WALL) : GW - sx(WALL) - w;
  const fl = Math.floor(time * 12 + o.seed) % 7 === 0;
  if (o.type === 'erase') drawErase(x, yTop, w, h, o.side, fl ? (o.side === 0 ? 3 : -3) : 0);
  else if (o.type === 'pixels') {
    ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fillRect(x, yTop, w, h);
    const cs = w / 4;
    for (const p of o.px) { const jx = fl ? (R() - 0.5) * 6 : 0; ctx.fillStyle = p[2]; ctx.fillRect(x + Math.floor(p[0] * 4) * cs + jx, yTop + p[1] * (h - cs), cs, cs); }
    ctx.strokeStyle = '#d63fd6'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yTop + 1, w - 2, h - 2);
  } else {
    ctx.fillStyle = '#1a0006'; ctx.fillRect(x, yTop, w, h);
    const im = IMG.card_red;
    if (ok(im)) {
      const ww = Math.min(w - 6, (h - 8) / 1.35), hh = ww * 1.35;
      const nC = Math.max(1, Math.floor((h - 4) / (hh + 4)));
      for (let i = 0; i < nC; i++) {
        const cx = x + (w - ww) / 2, cy = yTop + 4 + i * ((h - 4) / nC) + ((h - 4) / nC - hh) / 2;
        ctx.globalAlpha = 0.9; ctx.drawImage(im, cx + (fl ? 3 : 0), cy, ww, hh);
        ctx.globalAlpha = 0.5; ctx.drawImage(im, 0, im.naturalHeight * 0.4, im.naturalWidth, im.naturalHeight * 0.15, cx - 4, cy + hh * 0.4, ww, hh * 0.15);
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = 'rgba(0,200,255,0.35)'; ctx.fillRect(x, yTop + ((time * 60 + o.seed) % h), w, 3);
    ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yTop + 1, w - 2, h - 2);
  }
}
function drawFall(o) {
  const w = sx(1.0), x = o.side === 0 ? sx(WALL) : GW - sx(WALL) - w;
  if (o.warn > 0) {
    // warning indicator at top of the lane
    const blink = Math.floor(time * 10) % 2 === 0, y = Math.max(GH * 0.22, 170);
    ctx.globalAlpha = blink ? 1 : 0.35;
    ctx.fillStyle = 'rgba(255,0,60,0.18)'; ctx.fillRect(x, 0, w, GH);
    ctx.fillStyle = '#ff003c'; ctx.beginPath(); ctx.moveTo(x + w / 2, y - 18); ctx.lineTo(x + w / 2 + 17, y + 12); ctx.lineTo(x + w / 2 - 17, y + 12); ctx.fill();
    ctx.fillStyle = '#fff6d8'; ctx.font = '700 18px Silk, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x + w / 2, y + 3);
    ctx.globalAlpha = 1; return;
  }
  const yTop = scrY(o.a + o.len), h = o.len * PPM;
  if (yTop > GH + 10 || yTop + h < -10) return;
  ctx.fillStyle = 'rgba(214,63,214,0.25)'; ctx.fillRect(x, yTop - h * 1.2, w, h * 1.2);
  ctx.fillStyle = '#12001a'; ctx.fillRect(x, yTop, w, h);
  const cs = w / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) if (((i * 7 + j * 3 + Math.floor(time * 15)) % 4) !== 0) {
    ctx.fillStyle = ['#d63fd6', '#ff003c', '#00c8ff', '#fff6d8'][(i + j) % 4]; ctx.fillRect(x + i * cs + 1, yTop + j * (h / 5) + 1, cs - 2, h / 5 - 2);
  }
  ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yTop + 1, w - 2, h - 2);
}
function drawLaser(o) {
  const y = scrY(o.a); if (y < -20 || y > GH + 20) return;
  const x0 = sx(SHAFT_L + 1.3), x1 = sx(SHAFT_R - 1.3);
  // floating emitter nodes (wall lanes stay safe)
  for (const xx of [x0, x1]) {
    ctx.fillStyle = '#2a0008'; ctx.fillRect(xx - 7, y - 9, 14, 18);
    ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 2; ctx.strokeRect(xx - 7, y - 9, 14, 18);
    ctx.fillStyle = o.on || o.warnOn ? '#ff003c' : '#5a0016'; ctx.fillRect(xx - 3, y - 3, 6, 6);
  }
  if (o.on) {
    const th = 6 + Math.sin(time * 60) * 2;
    ctx.fillStyle = 'rgba(255,0,60,0.35)'; ctx.fillRect(x0 + 7, y - th * 1.6, x1 - x0 - 14, th * 3.2);
    ctx.fillStyle = '#ff003c'; ctx.fillRect(x0 + 7, y - th / 2, x1 - x0 - 14, th);
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(x0 + 7, y - 1, x1 - x0 - 14, 2);
    ctx.font = '700 9px Silk, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#fff6d8';
    ctx.fillText('E R A S E', GW / 2, y - th * 1.7);
  } else {
    ctx.strokeStyle = o.warnOn ? 'rgba(255,0,60,0.9)' : 'rgba(255,0,60,0.35)'; ctx.lineWidth = o.warnOn ? 2 : 1;
    ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x0 + 7, y); ctx.lineTo(x1 - 7, y); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawFly(o) {
  const y = scrY(o.a), x = sx(o.x), r = sx(o.r);
  if (y < -40 || y > GH + 40) return;
  if (o.type === 'bomb') {
    const im = IMG.bomb, s = r * 2.4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 4 + o.ph) * 0.2);
    ctx.fillStyle = 'rgba(255,0,60,0.25)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, 7); ctx.fill();
    if (ok(im)) ctx.drawImage(im, -s / 2, -s / 2, s, s * (im.naturalHeight / im.naturalWidth));
    else { ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    ctx.restore();
    const fx = x - s * 0.18, fy = y - s * 0.42;
    for (let i = 0; i < 3; i++) { ctx.fillStyle = pick(['#f5b342', '#ff003c', '#fff6d8']); ctx.fillRect(fx + rr(-5, 5), fy + rr(-5, 5), 3, 3); }
  } else {
    const f = Math.floor(time * 10 + o.ph * 3) % 2, u = r / 3.2;
    ctx.save(); ctx.translate(x, y);
    ctx.scale(Math.cos(o.ph) > 0 ? 1 : -1, 1);
    ctx.fillStyle = 'rgba(0,200,255,0.5)'; ctx.fillRect(-3 * u + 2, -2.4 * u, 6 * u, 4.6 * u);
    ctx.fillStyle = '#ff003c'; ctx.fillRect(-3 * u - 2, -2.4 * u, 6 * u, 4.6 * u);
    ctx.fillStyle = '#07080c'; ctx.fillRect(-3 * u, -2.4 * u, 6 * u, 4.6 * u);
    ctx.beginPath(); ctx.moveTo(-3 * u, -2.4 * u); ctx.lineTo(-2.2 * u, -4 * u); ctx.lineTo(-1.2 * u, -2.4 * u); ctx.moveTo(3 * u, -2.4 * u); ctx.lineTo(2.2 * u, -4 * u); ctx.lineTo(1.2 * u, -2.4 * u); ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath(); ctx.arc(-1 * u, -0.6 * u, 0.75 * u, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(1.4 * u, -0.6 * u, 0.75 * u, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#d63fd6';
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 1.8 * u - 0.3 * u, 2.2 * u, 0.6 * u, (f ? 1.4 : 0.8) * u);
    ctx.fillStyle = 'rgba(255,246,216,0.6)';
    ctx.fillRect(-4.6 * u, (f ? -3.4 : -2.2) * u, 1.4 * u, 0.6 * u); ctx.fillRect(3.2 * u, (f ? -2.2 : -3.4) * u, 1.4 * u, 0.6 * u);
    ctx.restore();
  }
}
function drawFrag(o) {
  const y = scrY(o.a), x = sx(o.x), s = sx(0.2) * (1 + Math.sin(o.ph) * 0.12);
  if (y < -20 || y > GH + 20) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(0,200,255,0.3)'; ctx.fillRect(-s * 1.6, -s * 1.6, s * 3.2, s * 3.2);
  ctx.fillStyle = '#00c8ff'; ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.fillStyle = '#fff6d8'; ctx.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
  ctx.restore();
}
function drawCard(o, golden) {
  const y = scrY(o.a) + Math.sin(o.t * 4) * 5, im = IMG.card, h = sx(golden ? 1.7 : 1.5), w = h * 0.74;
  if (y < -60 || y > GH + 60) return;
  ctx.save(); ctx.translate(sx(o.x), y);
  if (golden) {
    ctx.save(); ctx.rotate(o.t * 1.5); ctx.fillStyle = 'rgba(255,226,122,0.22)';
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 0.18, h * 1.1); ctx.lineTo(w * 0.18, h * 1.1); ctx.fill(); }
    ctx.restore();
    ctx.scale(Math.cos(o.t * 3), 1);
  } else ctx.rotate(Math.sin(o.t * 2) * 0.12);
  ctx.fillStyle = golden ? 'rgba(255,226,122,0.45)' : 'rgba(245,179,66,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.85, h * 0.7, 0, 0, 7); ctx.fill();
  if (ok(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h); else { ctx.fillStyle = '#f5b342'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  if (golden) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(o.t * 8) * 0.15; ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  ctx.restore();
  if (golden) for (let i = 0; i < 2; i++) { ctx.fillStyle = '#fff6d8'; ctx.fillRect(sx(o.x) + rr(-w, w), y + rr(-h * 0.7, h * 0.7), 3, 3); }
}
function drawPlayer() {
  const c = C();
  let im, flip = false, rot = P.rot, bob = 0, sqy = 1;
  if (P.mode === 'wall') { im = sprite(c, 'climb'); flip = P.side === 1; bob = Math.sin(time * 16) * 2; sqy = 1 + Math.sin(time * 16) * 0.025; }
  else if (P.mode === 'jump') { im = sprite(c, 'jump'); flip = P.to === 0; }
  else { im = sprite(c, 'jump'); rot = -Math.PI / 2 * 0.55 + Math.sin(time * 18) * 0.06; }
  if (state === 'dying' || state === 'over') { im = sprite(c, 'jump'); rot = P.rot; flip = P.side === 1; }
  const h = sx(SPR_H), w = ok(im) ? h * im.naturalWidth / im.naturalHeight : h * 0.5;
  let x = sx(P.x), y = PY + bob - sx(P.dy || 0);
  if (P.mode === 'wall' && state === 'play') x = P.side === 0 ? sx(WALL) + w / 2 - 2 : GW - sx(WALL) - w / 2 + 2;
  ctx.save(); ctx.translate(x, y);
  if (graceT > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  if (shield || boostT > 0) {
    ctx.save(); ctx.globalAlpha *= 0.5; ctx.fillStyle = boostT > 0 ? '#00c8ff' : '#f5b342';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62 + 6, h * 0.55 + 6, 0, 0, 7); ctx.fill(); ctx.restore();
    if (shield) { ctx.strokeStyle = '#f5b342'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62 + 8, h * 0.55 + 8, 0, 0, 7); ctx.stroke(); }
  }
  ctx.rotate(rot); ctx.scale(flip ? -1 : 1, sqy);
  if (ok(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h); else { ctx.fillStyle = '#000'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
let vgCache = null, vgKey = '';
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rr(-1, 1) * shake * 18, rr(-1, 1) * shake * 18);
  const [za, zb, t] = zoneMix();
  drawBgZone(za, 1); if (zb !== za) drawBgZone(zb, t);
  if (state === 'play' || state === 'dying') {
    ctx.fillStyle = boostT > 0 ? 'rgba(0,200,255,0.18)' : 'rgba(255,246,216,0.06)';
    for (let k = 0; k < 8; k++) { const xx = sx(WALL + 0.5 + (k * 1.07) % (WM - 2 * WALL - 1)), yy = ((k * 211 + alt * PPM * 1.3) % (GH + 80)) - 40; ctx.fillRect(xx, yy, 2, 26 + runSpeed * 3); }
  }
  drawWalls(t >= 0.5 ? zb : za);
  for (const o of objs) if (o.k === 'laser') drawLaser(o);
  for (const o of objs) if (o.k === 'wall') drawWallObj(o);
  for (const o of objs) if (o.k === 'frag') drawFrag(o);
  for (const o of objs) { if (o.k === 'fly') drawFly(o); else if (o.k === 'card') drawCard(o, false); else if (o.k === 'gold') drawCard(o, true); }
  if (state !== 'menu' && state !== 'load') drawPlayer();
  for (const o of objs) if (o.k === 'fall') drawFall(o);
  for (const r of rings) {
    const k = r.t / 0.4; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.col; ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(sx(r.x), scrY(r.a), sx(r.r1) * (0.3 + k), 0, 7); ctx.stroke();
  }
  for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; const s = sx(p.s); ctx.fillRect(sx(p.x) - s / 2, scrY(p.a) - s / 2, s, s); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tx of texts) {
    const pop = tx.t < 0.12 ? 1 + (0.12 - tx.t) * 4 : 1;
    ctx.globalAlpha = clamp(1 - (tx.t - 0.5) / 0.45, 0, 1);
    let fs = Math.round(sx(tx.size) * pop); ctx.font = '700 ' + fs + 'px Silk, monospace';
    const tw = ctx.measureText(tx.s).width; if (tw > GW * 0.86) { fs = Math.floor(fs * GW * 0.86 / tw); ctx.font = '700 ' + fs + 'px Silk, monospace'; }
    const yy = scrY(tx.a + tx.t * 1.5);
    ctx.fillStyle = '#07080c'; ctx.fillText(tx.s, sx(tx.x) + 2, yy + 2);
    ctx.fillStyle = tx.col; ctx.fillText(tx.s, sx(tx.x), yy);
  }
  ctx.globalAlpha = 1;
  if (mileT > 0) {
    const k = 1 - mileT / 1.4, a = k < 0.15 ? k / 0.15 : (k > 0.75 ? (1 - k) / 0.25 : 1);
    ctx.globalAlpha = a; ctx.font = '700 ' + Math.round(sx(1.25) * (k < 0.15 ? 1.4 - k * 2.6 : 1)) + 'px Silk, monospace';
    ctx.fillStyle = '#ff003c'; ctx.fillText(mileTxt, GW / 2 + 3, GH * 0.28);
    ctx.fillStyle = '#00c8ff'; ctx.fillText(mileTxt, GW / 2 - 3, GH * 0.28);
    ctx.fillStyle = '#fff6d8'; ctx.fillText(mileTxt, GW / 2, GH * 0.28);
    ctx.globalAlpha = 1;
  }
  if (state === 'play' && time < 3.2 && alt < 22) {
    ctx.globalAlpha = Math.min(1, (3.2 - time) * 2) * (0.6 + 0.4 * Math.sin(time * 8));
    ctx.font = '700 ' + Math.round(sx(0.62)) + 'px Silk, monospace'; ctx.fillStyle = '#fff6d8';
    ctx.fillText('TAP TO JUMP', GW / 2, GH * 0.5); ctx.font = '400 ' + Math.round(sx(0.36)) + 'px Silk, monospace';
    ctx.fillText('switch walls · slice glitches mid-air', GW / 2, GH * 0.5 + sx(0.7)); ctx.globalAlpha = 1;
  }
  const key = GW + 'x' + GH;
  if (vgKey !== key) { vgCache = ctx.createRadialGradient(GW / 2, GH / 2, GH * 0.3, GW / 2, GH / 2, GH * 0.75); vgCache.addColorStop(0, 'rgba(0,0,0,0)'); vgCache.addColorStop(1, 'rgba(0,0,0,0.45)'); vgKey = key; }
  ctx.fillStyle = vgCache; ctx.fillRect(0, 0, GW, GH);
  if (flash > 0) { ctx.fillStyle = 'rgba(255,246,216,' + Math.min(0.35, flash) + ')'; ctx.fillRect(0, 0, GW, GH); }
  if (state === 'dying') { ctx.fillStyle = 'rgba(255,0,60,' + Math.max(0, 0.35 - dieT * 0.4) + ')'; ctx.fillRect(0, 0, GW, GH); }
  ctx.restore();
}

/* ---------- loop ---------- */
let last = performance.now(), acc = 0;
const H = 1 / 120;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (!(dt >= 0)) dt = 0; if (dt > 0.1) dt = 0.1;
  if (state === 'menu') { time += dt; alt += dt * 2.2; }
  else { acc += dt; let n = 0; while (acc >= H && n < 16) { step(H); acc -= H; n++; } if (n >= 16) acc = 0; }
  try { render(); } catch (e) { /* keep loop alive */ }
  requestAnimationFrame(frame);
}

/* ---------- input ---------- */
function isUI(t) { return !!(t && t.closest && t.closest('button, a, .scr:not(.hidden)')); }
window.addEventListener('pointerdown', e => { if (state === 'play' && !isUI(e.target)) { e.preventDefault(); jump(); } }, { passive: false });
['touchstart', 'touchmove', 'touchend'].forEach(ev => app.addEventListener(ev, e => { if ((!isUI(e.target) || ev === 'touchmove') && e.cancelable) e.preventDefault(); }, { passive: false }));
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  const k = e.code;
  if (k === 'Space' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'KeyW' || k === 'Enter') {
    e.preventDefault(); if (e.repeat) return;
    if (state === 'play') jump();
    else if (state === 'menu') startRun();
    else if (state === 'over' && $('scrOver').style.pointerEvents !== 'none') startRun();
    else if (state === 'pause') resume();
  } else if (k === 'KeyP' || k === 'Escape') { if (state === 'play') pause(); else resume(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else last = performance.now(); });
window.addEventListener('blur', () => pause());
const tapBtn = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); });
tapBtn('btnPlay', startRun); tapBtn('btnRetry', startRun); tapBtn('btnHome', toMenu);
tapBtn('btnPause', pause); tapBtn('btnResume', resume);
$('btnShare').addEventListener('click', e => e.stopPropagation());
const mb = $('btnMute'); mb.classList.toggle('off', muted);
tapBtn('btnMute', () => { muted = !muted; store.set('muted', muted); mb.classList.toggle('off', muted); if (!muted) { audio(); SFX.card(); } });

/* ---------- boot ---------- */
resize();
requestAnimationFrame(frame);
const fontReady = (document.fonts && document.fonts.load) ? Promise.race([document.fonts.load('700 20px Silk'), new Promise(r => setTimeout(r, 1500))]).catch(() => {}) : Promise.resolve();
Promise.all([loadAll(p => { $('ldPct').textContent = ' ' + Math.round(p * 100) + '%'; }), fontReady]).then(() => { resize(); toMenu(); });

if (/[?&]qa\b/.test(location.search)) window.__qa = {
  boost: () => { if (state === 'play') startBoost(); }, shield: () => { shield = true; },
  jumpTo: a => { if (state === 'play') { alt = a; nextAlt = a + 15; objs.length = 0; lastWall = [{ end: a }, { end: a }]; nextMile = Math.ceil((a + 1) / 100) * 100; } },
  gold: () => objs.push({ k: 'gold', a: alt + 6, x: MID, t: 0, dead: false }),
  bugs: () => { for (let i = 0; i < 3; i++) objs.push({ k: 'fly', type: i % 2 ? 'bomb' : 'bug', a: alt + 3 + i * 2.2, x: MID, ph: 0, spd: 0, amp: 0, r: 0.5, dead: false, near: false }); }
};
window.__nc = {
  get s() { return { state, alt, kills, score, combo, bestCombo, frags, nears, golds, shield, boostT, boostMeter, charIdx, playedIdx, mode: P.mode, side: P.side, x: P.x, graceT,
    objs: objs.map(o => ({ k: o.k, side: o.side, a: o.a, len: o.len, w: o.w, x: o.x, r: o.r, type: o.type, on: o.on, warn: o.warn })) }; }
};
})();
