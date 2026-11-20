/* NULLS CLIMB · fan-made for @nullsxyz · original code */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const app = $('app'), cv = $('cv'), ctx = cv.getContext('2d');
const store = {
  get(k, d) { try { const v = localStorage.getItem('nc_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nc_' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- assets ---------- */
const CHARS = [
  { id: 'c1', name: 'GOLD GUARD', glow: '#f5b342' },
  { id: 'c2', name: 'GREEN HOOD', glow: '#4fb39a' },
  { id: 'c3', name: 'DENIM NULL', glow: '#00c8ff' }
];
const IMG = {};
const list = ['card', 'card_red', 'bomb', 'wordmark'];
CHARS.forEach(c => { list.push(c.id + '_climb', c.id + '_jump'); });
const ok = im => im && im.complete && im.naturalWidth > 0;
function loadAll(onp) {
  let n = 0;
  return Promise.all(list.map(k => new Promise(res => {
    const im = new Image();
    im.onload = im.onerror = () => { n++; onp(n / list.length); res(); };
    im.src = 'assets/' + k + '.png?v=1';
    IMG[k] = im;
  })));
}

/* ---------- audio ---------- */
let AC = null, muted = store.get('muted', false);
function audio() {
  if (AC || muted) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
}
function tone(f, d, type = 'square', vol = 0.08, slide = 0) {
  if (!AC || muted) return;
  try {
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) {}
}
const SFX = {
  jump: () => tone(420, 0.09, 'square', 0.05, 260),
  kill: () => { tone(880, 0.07, 'square', 0.06, 400); setTimeout(() => tone(1320, 0.08, 'triangle', 0.05), 50); },
  card: () => { tone(660, 0.08, 'triangle', 0.08); setTimeout(() => tone(990, 0.12, 'triangle', 0.08), 80); },
  shield: () => tone(200, 0.25, 'sawtooth', 0.07, -120),
  boost: () => { [0, 70, 140, 210].forEach((d, i) => setTimeout(() => tone(330 * (i + 2), 0.1, 'square', 0.05), d)); },
  die: () => { tone(300, 0.5, 'sawtooth', 0.09, -260); },
  zone: () => tone(520, 0.3, 'triangle', 0.05, 300)
};
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* ---------- world constants (meters) ---------- */
const WM = 9.75, WALL = 1.15, PWB = 0.95, PHB = 1.7, SPR_H = 2.75, JT = 0.27;
const SHAFT_L = WALL, SHAFT_R = WM - WALL, MID = WM / 2;
const xOn = side => side === 0 ? WALL + 0.55 : WM - WALL - 0.55;
const speedAt = a => 6.4 + 6.8 * (1 - Math.exp(-a / 950));
const ZONES = [
  { at: 0, name: 'VOID ALLEY', sub: 'red rooms, blue nights' },
  { at: 250, name: 'WIREFRAME', sub: 'sector 02' },
  { at: 600, name: 'NULL SKY', sub: 'sector 03' },
  { at: 1200, name: 'THE VOID', sub: 'do not erase' }
];

/* ---------- view ---------- */
let GW = 390, GH = 844, DPR = 1, PPM = 40, VH = 21, PY = 570;
function resize() {
  GW = app.clientWidth || 390; GH = app.clientHeight || 844;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(GW * DPR); cv.height = Math.round(GH * DPR);
  PPM = GW / WM; VH = GH / PPM; PY = GH * 0.68;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
const sx = m => m * PPM;

/* ---------- state ---------- */
let state = 'load';           // load | menu | play | pause | dying | over
let charIdx = store.get('char', 0) % 3, playedIdx = charIdx;
let best = store.get('best', 0);
let P, objs, parts, texts, alt, time, kills, shield, boostMeter, boostT, graceT, nextAlt, lastWall, lastCard, zoneIdx, shake, dieT, runSpeed;
function reset() {
  P = { side: 0, mode: 'wall', x: xOn(0), jt: 0, from: 0, to: 1, buf: 0, rot: 0, vy: 0, dy: 0, vx: 0 };
  objs = []; parts = []; texts = [];
  alt = 0; time = 0; kills = 0; shield = false; boostMeter = 0; boostT = 0; graceT = 0;
  nextAlt = 15; lastWall = [{ end: -99 }, { end: -99 }]; lastCard = 40; zoneIdx = 0; shake = 0; dieT = 0; runSpeed = speedAt(0);
}
reset();

/* ---------- RNG ---------- */
const R = Math.random, rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- generator (always solvable) ---------- */
function clearance(a) { return speedAt(a) * JT + PHB + 1.0; }
function placeWall(side, a0, len, type) {
  const other = 1 - side;
  // opposite wall must be free long enough to switch over and back
  a0 = Math.max(a0, lastWall[other].end + clearance(a0), lastWall[side].end + 1.2);
  const o = { k: 'wall', side, a: a0, len, type, w: type === 'card' ? 1.05 : rr(0.8, 1.0), seed: R() * 1000, px: [] };
  if (type === 'pixels') for (let i = 0; i < 18; i++) o.px.push([R(), R(), pick(['#ff003c', '#00c8ff', '#d63fd6', '#fff6d8', '#f5b342'])]);
  objs.push(o);
  lastWall[side] = { end: a0 + len };
  return o;
}
function placeFlyer(a, type) {
  const c = clearance(a);
  a = Math.max(a, lastWall[0].end + c * 0.7, lastWall[1].end + c * 0.7);
  const o = { k: 'fly', type, a, x: rr(SHAFT_L + 1.2, SHAFT_R - 1.2), ph: R() * 6.28,
    spd: type === 'bomb' ? rr(0.9, 1.4) : rr(1.4, 2.2), amp: (SHAFT_R - SHAFT_L) / 2 - 0.35, r: type === 'bomb' ? 0.5 : 0.42, dead: false };
  o.x0 = MID; objs.push(o);
  lastWall[0] = { end: Math.max(lastWall[0].end, a + 1.2) };
  lastWall[1] = { end: Math.max(lastWall[1].end, a + 1.2) };
  return o;
}
function spawnEvent() {
  const d = clamp(nextAlt / 1500, 0, 1);
  const gap = () => lerp(4.2, 1.6, d) + R() * lerp(4.5, 2.2, d);
  const roll = R();
  if (!shield && nextAlt > lastCard + 110 && R() < 0.35) {
    const a = Math.max(nextAlt, lastWall[0].end + 1, lastWall[1].end + 1);
    objs.push({ k: 'card', a: a + 1, x: MID, t: 0, dead: false });
    lastCard = a; nextAlt = a + 4; return;
  }
  if (roll < 0.58 - d * 0.1) {
    const side = R() < 0.5 ? 0 : 1;
    const len = rr(1.3, 2.3) + d * rr(0, 1.4);
    const type = pick(['erase', 'erase', 'pixels', 'card']);
    const o = placeWall(side, nextAlt, len, type);
    nextAlt = o.a + o.len + gap();
  } else if (roll < 0.80) {
    const o = placeFlyer(nextAlt + 1, R() < 0.5 ? 'bomb' : 'bug');
    nextAlt = o.a + 2.5 + gap() * 0.6;
  } else if (roll < 0.9 && d > 0.15) {
    let a = nextAlt + 1, n = 2 + (R() < d ? 1 : 0), o;
    for (let i = 0; i < n; i++) { o = placeFlyer(a, 'bug'); o.ph = i * 1.4; a = o.a + 2.3; }
    nextAlt = a + gap();
  } else {
    // zig-zag: alternating walls
    let side = R() < 0.5 ? 0 : 1, n = 2 + ((R() * (2 + d * 2)) | 0), o;
    for (let i = 0; i < n; i++) { o = placeWall(side, nextAlt, rr(1.2, 2.0), pick(['erase', 'pixels'])); nextAlt = o.a + o.len; side = 1 - side; }
    nextAlt += gap();
  }
}

/* ---------- gameplay ---------- */
function startRun() {
  audio(); reset(); state = 'play';
  show(null); $('hud').classList.remove('hidden');
  updHud(true); zoneBanner(0);
}
function jump() {
  if (state !== 'play') return;
  if (boostT > 0) return;
  if (P.mode === 'wall') {
    P.mode = 'jump'; P.jt = 0; P.from = P.side; P.to = 1 - P.side; P.buf = 0;
    SFX.jump();
    for (let i = 0; i < 6; i++) parts.push(mkPart(P.x, alt - 0.6, P.side === 0 ? 1 : -1, '#fff6d8'));
  } else if (P.mode === 'jump') P.buf = 0.2;
}
function mkPart(x, a, dir, col, big) {
  return { x, a, vx: dir * rr(1, 4) + rr(-1.5, 1.5), va: rr(-2, 3), life: rr(0.35, 0.7), max: 0.7, s: big ? rr(0.14, 0.3) : rr(0.07, 0.16), col };
}
function burst(x, a, cols, n = 18) { for (let i = 0; i < n; i++) parts.push(mkPart(x, a, R() < 0.5 ? -1 : 1, pick(cols), true)); if (parts.length > 350) parts.splice(0, parts.length - 350); }
function floatText(x, a, s, col) { texts.push({ x, a, s, col, t: 0 }); }
function addKill(o, viaBoost) {
  o.dead = true; kills++;
  burst(o.x, o.a, o.type === 'bomb' ? ['#fff6d8', '#ff003c', '#f5b342'] : ['#ff003c', '#00c8ff', '#d63fd6']);
  floatText(o.x, o.a + 0.6, '+1', '#00c8ff'); SFX.kill(); buzz(15);
  if (!viaBoost && boostT <= 0) { boostMeter++; if (boostMeter >= 5) startBoost(); }
  updHud();
}
function startBoost() {
  boostMeter = 0; boostT = 3.2; P.mode = 'boost'; P.buf = 0;
  floatText(MID, alt + 2, 'REBOOT!', '#00c8ff'); SFX.boost(); buzz(40); updHud();
}
function endBoost() {
  // clear a landing window on both walls, then drop onto nearest wall
  const v = speedAt(alt), lo = alt - 3, hi = alt + v * 1.4 + 3;
  objs.forEach(o => { if (o.k === 'wall' && o.a < hi && o.a + o.len > lo) { o.dead = true; burst(o.side === 0 ? WALL + 0.4 : WM - WALL - 0.4, o.a + o.len / 2, ['#00c8ff', '#fff6d8'], 8); } });
  [0, 1].forEach(s => { lastWall[s] = { end: Math.max(lastWall[s].end, hi) }; });
  nextAlt = Math.max(nextAlt, hi + 2);
  P.mode = 'jump'; P.from = P.x < MID ? 1 : 0; P.to = P.x < MID ? 0 : 1; P.jt = JT * 0.5; graceT = 1.1;
}
function hit(o) {
  if (boostT > 0 || graceT > 0) {
    if (o.k === 'fly') addKill(o, true); else if (boostT > 0) { o.dead = true; burst(P.x, alt, ['#00c8ff', '#fff6d8'], 10); }
    return;
  }
  if (shield) {
    shield = false; graceT = 1.0; SFX.shield(); buzz(30); shake = 0.25;
    o.dead = true; burst(P.x, alt, ['#f5b342', '#fff6d8'], 22);
    floatText(P.x, alt + 1.2, 'SAVED!', '#f5b342'); updHud(); return;
  }
  die();
}
function die() {
  state = 'dying'; dieT = 0; shake = 0.45; SFX.die(); buzz([60, 40, 90]);
  P.vy = 7; P.vx = P.side === 0 ? 2.5 : -2.5; P.dy = 0;
  burst(P.x, alt, ['#ff003c', '#fff6d8', '#07080c'], 26);
}
function gameOver() {
  state = 'over';
  const m = Math.floor(alt);
  const isNew = m > best; if (isNew) { best = m; store.set('best', best); }
  playedIdx = charIdx; charIdx = (charIdx + 1) % CHARS.length; store.set('char', charIdx);
  $('oMeters').textContent = m; $('oKills').textContent = kills; $('oBest').textContent = best;
  $('oPlayed').textContent = CHARS[playedIdx].name;
  $('oNew').classList.toggle('hidden', !isNew);
  setChar($('oChar'), $('oCharName'), charIdx);
  const url = location.origin + location.pathname;
  const txt = `I climbed ${m}m and sliced ${kills} glitch${kills === 1 ? '' : 'es'} as ${CHARS[playedIdx].name} in NULLS CLIMB 🧗‍♂️\nDO NOT ERASE. can you beat it?\n\n@nullsxyz`;
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
  runSpeed = v;
  alt += v * dt;
  if (graceT > 0) graceT -= dt;
  // player
  if (P.mode === 'jump') {
    P.jt += dt;
    const t = clamp(P.jt / JT, 0, 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    P.x = lerp(xOn(P.from), xOn(P.to), e);
    P.rot = Math.sin(t * Math.PI) * (P.to === 1 ? 0.25 : -0.25);
    if (t >= 1) {
      P.mode = 'wall'; P.side = P.to; P.x = xOn(P.side); P.rot = 0;
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
  // spawn ahead
  while (nextAlt < alt + VH + 12) spawnEvent();
  // collisions
  const pl = P.x - PWB / 2, pr = P.x + PWB / 2, pb = alt - PHB / 2, pt = alt + PHB / 2;
  for (const o of objs) {
    if (o.dead) continue;
    if (o.k === 'fly') {
      o.ph += dt * o.spd;
      o.x = MID + Math.sin(o.ph) * o.amp;
      const cx = clamp(o.x, pl, pr), cy = clamp(o.a, pb, pt);
      if ((o.x - cx) ** 2 + (o.a - cy) ** 2 < o.r * o.r) {
        if (P.mode === 'jump' || P.mode === 'boost') addKill(o, P.mode === 'boost');
        else hit(o);
        if (state !== 'play') return;
      }
    } else if (o.k === 'wall') {
      const l = o.side === 0 ? WALL : WM - WALL - o.w, r = l + o.w;
      if (pr > l + 0.08 && pl < r - 0.08 && pt > o.a + 0.1 && pb < o.a + o.len - 0.1) { hit(o); if (state !== 'play') return; }
    } else if (o.k === 'card') {
      o.t += dt;
      if (Math.abs(o.x - P.x) < 0.95 && Math.abs(o.a - alt) < 1.25) {
        o.dead = true; shield = true; SFX.card(); buzz(20);
        burst(o.x, o.a, ['#f5b342', '#fff6d8'], 16); floatText(o.x, o.a + 1, 'DO NOT ERASE', '#f5b342'); updHud();
      }
    }
  }
  objs = objs.filter(o => !o.dead && (o.k === 'wall' ? o.a + o.len : o.a) > alt - VH);
  // zones
  for (let i = ZONES.length - 1; i > zoneIdx; i--) if (alt >= ZONES[i].at) { zoneIdx = i; zoneBanner(i); SFX.zone(); break; }
  stepFx(dt);
  updHud();
}
function stepFx(dt) {
  for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.a += p.va * dt; p.va -= 6 * dt; }
  parts = parts.filter(p => p.life > 0);
  for (const t of texts) t.t += dt;
  texts = texts.filter(t => t.t < 0.9);
  if (shake > 0) shake = Math.max(0, shake - dt);
}

/* ---------- HUD / screens ---------- */
let hudCache = {};
function updHud(force) {
  const m = Math.floor(alt), vals = { m, kills, best: Math.max(best, m), shield, bm: boostMeter, bt: boostT > 0 };
  if (force) hudCache = {};
  if (hudCache.m !== m) $('hMeters').textContent = m;
  if (hudCache.kills !== kills) $('hKills').textContent = kills;
  if (hudCache.best !== vals.best) $('hBest').textContent = vals.best;
  if (hudCache.shield !== shield) $('hShield').classList.toggle('off', !shield);
  if (hudCache.bm !== boostMeter || hudCache.bt !== vals.bt) {
    [...$('hBoost').querySelectorAll('i')].forEach((el, i) => el.classList.toggle('on', vals.bt || i < boostMeter));
    $('hBoost').classList.toggle('live', vals.bt);
  }
  hudCache = vals;
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
function setChar(img, nameEl, i) {
  img.src = 'assets/' + CHARS[i].id + '_climb.png?v=1'; nameEl.textContent = CHARS[i].name;
}
function toMenu() {
  state = 'menu'; reset();
  setChar($('sChar'), $('sCharName'), charIdx);
  $('sDots').innerHTML = CHARS.map((c, i) => '<i class="' + (i === charIdx ? 'on' : '') + '"></i>').join('');
  $('sBest').textContent = best; $('hud').classList.add('hidden');
  show('scrStart');
}
function pause() { if (state !== 'play') return; state = 'pause'; show('scrPause'); }
function resume() { if (state !== 'pause') return; state = 'play'; show(null); last = performance.now(); }

/* ---------- render ---------- */
function zoneMix() {
  // returns [idxA, idxB, t]
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (alt >= ZONES[i].at) {
      const t = i > 0 ? clamp((alt - ZONES[i].at) / 40, 0, 1) : 1;
      return t < 1 ? [i - 1, i, t] : [i, i, 1];
    }
  }
  return [0, 0, 1];
}
const BG = [
  { top: '#2a0410', bot: '#07080c', wall: '#140a10', edge: '#ff003c', led: '#ff003c' },
  { top: '#03132a', bot: '#030510', wall: '#0a1020', edge: '#00c8ff', led: '#00c8ff' },
  { top: '#0d1a4a', bot: '#1a0b2e', wall: '#0e1030', edge: '#8fa8ff', led: '#f5b342' },
  { top: '#000000', bot: '#0b0b12', wall: '#0b0b0f', edge: '#fff6d8', led: '#d63fd6' }
];
function drawBgZone(i, a) {
  const z = BG[i], g = ctx.createLinearGradient(0, 0, 0, GH);
  g.addColorStop(0, z.top); g.addColorStop(1, z.bot);
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, 0, GW, GH);
  const par = alt * 0.25;
  if (i === 0) {
    // red rooms: far windows
    const step = 3.2;
    for (let k = Math.floor((par - 4) / step); k < (par + VH + 4) / step; k++) {
      const y = PY - (k * step - par) * PPM;
      for (let c = 0; c < 4; c++) {
        const lit = ((k * 7 + c * 13) % 5) !== 0;
        ctx.fillStyle = lit ? 'rgba(255,0,60,' + (0.10 + ((k + c) % 3) * 0.05) + ')' : 'rgba(255,0,60,0.03)';
        ctx.fillRect(sx(1.9 + c * 1.55), y, sx(0.95), sx(1.6));
      }
    }
  } else if (i === 1) {
    ctx.strokeStyle = 'rgba(0,200,255,0.16)'; ctx.lineWidth = 1;
    const st = 1.5, off = (par % st) * PPM;
    for (let y = -st * PPM + off; y < GH + st * PPM; y += st * PPM) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GW, y); ctx.stroke(); }
    for (let c = 0; c <= 8; c++) { const x = sx(WALL + c * (WM - 2 * WALL) / 8); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GH); ctx.stroke(); }
  } else if (i === 2) {
    for (let k = 0; k < 40; k++) {
      const x = ((k * 97) % 100) / 100 * GW, yy = ((k * 61 + par * 3) % (GH + 40)) - 20;
      ctx.fillStyle = 'rgba(255,246,216,' + (0.3 + (k % 3) * 0.2) + ')';
      ctx.fillRect(x, GH - yy, 2, 2);
    }
    ctx.fillStyle = 'rgba(255,246,216,0.85)'; ctx.beginPath(); ctx.arc(GW * 0.7, GH * 0.22, sx(0.9), 0, 7); ctx.fill();
    ctx.fillStyle = BG[2].top; ctx.beginPath(); ctx.arc(GW * 0.7 + sx(0.35), GH * 0.22 - sx(0.2), sx(0.8), 0, 7); ctx.fill();
  } else {
    for (let k = 0; k < 60; k++) {
      const x = ((k * 53) % 100) / 100 * GW, yy = ((k * 37 + par * (2 + k % 3)) % (GH + 20)) - 10;
      ctx.fillStyle = k % 9 === 0 ? '#ff003c' : 'rgba(255,246,216,0.5)';
      ctx.fillRect(x, GH - yy, 3, 3);
    }
  }
  ctx.globalAlpha = 1;
}
const scrY = a => PY - (a - alt) * PPM;
function drawWalls(z) {
  const zc = BG[z];
  const st = 2.0;
  for (let side = 0; side < 2; side++) {
    const x0 = side === 0 ? 0 : GW - sx(WALL), w = sx(WALL);
    ctx.fillStyle = zc.wall; ctx.fillRect(x0, 0, w, GH);
    for (let k = Math.floor((alt - VH) / st) - 1; k < (alt + VH) / st + 1; k++) {
      const y = scrY((k + 1) * st), h = st * PPM;
      if (y > GH || y + h < 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(x0 + 4, y + 3, w - 8, h - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x0, y, w, 2);
      // vents
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let v = 0; v < 3; v++) ctx.fillRect(x0 + w * 0.2, y + h * 0.55 + v * 6, w * 0.6, 2);
      // led
      const on = ((k * 31 + side * 17 + Math.floor(time * 2)) % 4) !== 0;
      ctx.fillStyle = on ? zc.led : 'rgba(255,255,255,0.1)';
      ctx.fillRect(x0 + w * (side === 0 ? 0.25 : 0.6), y + h * 0.2, 5, 5);
      ctx.fillRect(x0 + w * (side === 0 ? 0.45 : 0.4), y + h * 0.2, 5, 5);
    }
    // inner edge glow
    const ex = side === 0 ? w : GW - w;
    ctx.fillStyle = zc.edge; ctx.globalAlpha = 0.85; ctx.fillRect(ex - (side === 0 ? 3 : 0), 0, 3, GH);
    ctx.globalAlpha = 0.18; ctx.fillRect(ex - (side === 0 ? 10 : -7) - 0, 0, 3, GH); ctx.globalAlpha = 1;
  }
}
function drawWallObj(o) {
  const yTop = scrY(o.a + o.len), h = o.len * PPM, w = sx(o.w);
  if (yTop > GH + 10 || yTop + h < -10) return;
  const x = o.side === 0 ? sx(WALL) : GW - sx(WALL) - w;
  const fl = Math.floor(time * 12 + o.seed) % 7 === 0;
  if (o.type === 'erase') {
    const jit = fl ? (o.side === 0 ? 3 : -3) : 0;
    ctx.fillStyle = '#ff003c'; ctx.globalAlpha = 0.25; ctx.fillRect(x - 3 + jit, yTop - 2, w + 6, h + 4); ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a0008'; ctx.fillRect(x + jit, yTop, w, h);
    ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 2; ctx.strokeRect(x + 1 + jit, yTop + 1, w - 2, h - 2);
    // hazard stripes
    ctx.save(); ctx.beginPath(); ctx.rect(x + jit, yTop, w, h); ctx.clip();
    ctx.fillStyle = 'rgba(255,0,60,0.35)';
    for (let s = -w; s < h + w; s += 14) { ctx.beginPath(); ctx.moveTo(x + jit, yTop + s); ctx.lineTo(x + jit + w, yTop + s - w); ctx.lineTo(x + jit + w, yTop + s - w + 6); ctx.lineTo(x + jit, yTop + s + 6); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.translate(x + w / 2 + jit, yTop + h / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '700 ' + Math.round(Math.min(w * 0.42, 15)) + 'px Silk, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00c8ff'; ctx.fillText('ERASE', 1.5, 1); ctx.fillStyle = '#fff6d8'; ctx.fillText('ERASE', 0, 0);
    ctx.restore();
    // spikes facing shaft
    ctx.fillStyle = '#ff003c';
    const sxp = o.side === 0 ? x + w : x, dir = o.side === 0 ? 1 : -1, n = Math.max(2, Math.round(h / 14));
    for (let i = 0; i < n; i++) { const y0 = yTop + (i + 0.15) * h / n, y1 = yTop + (i + 0.85) * h / n; ctx.beginPath(); ctx.moveTo(sxp, y0); ctx.lineTo(sxp + dir * 7, (y0 + y1) / 2); ctx.lineTo(sxp, y1); ctx.fill(); }
  } else if (o.type === 'pixels') {
    ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fillRect(x, yTop, w, h);
    const cs = w / 4;
    for (const p of o.px) {
      const jx = fl ? (R() - 0.5) * 6 : 0;
      ctx.fillStyle = p[2]; ctx.fillRect(x + Math.floor(p[0] * 4) * cs + jx, yTop + p[1] * (h - cs), cs, cs);
    }
    ctx.strokeStyle = '#d63fd6'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yTop + 1, w - 2, h - 2);
  } else {
    // corrupted memory card
    ctx.fillStyle = '#1a0006'; ctx.fillRect(x, yTop, w, h);
    const im = IMG.card_red;
    if (ok(im)) {
      const ch = Math.min(h - 4, w * 1.35 * 1.6), cw = ch / 1.35;
      const nC = Math.max(1, Math.floor((h - 4) / (cw * 1.35 + 4)));
      for (let i = 0; i < nC; i++) {
        const hh = (h - 4) / nC - 4, ww = Math.min(w - 6, hh / 1.35);
        const cx = x + (w - ww) / 2, cy = yTop + 4 + i * (hh + 4) + (hh - ww * 1.35) / 2;
        ctx.globalAlpha = 0.9; ctx.drawImage(im, cx + (fl ? 3 : 0), cy, ww, ww * 1.35);
        ctx.globalAlpha = 0.5; ctx.drawImage(im, 0, im.naturalHeight * 0.4, im.naturalWidth, im.naturalHeight * 0.15, cx - 4, cy + ww * 1.35 * 0.4, ww, ww * 1.35 * 0.15);
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = 'rgba(0,200,255,0.35)'; ctx.fillRect(x, yTop + ((time * 60 + o.seed) % h), w, 3);
    ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yTop + 1, w - 2, h - 2);
  }
}
function drawFly(o) {
  const y = scrY(o.a), x = sx(o.x), r = sx(o.r);
  if (y < -40 || y > GH + 40) return;
  if (o.type === 'bomb') {
    const im = IMG.bomb, s = r * 2.4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 4 + o.ph) * 0.2);
    ctx.shadowColor = '#ff003c'; ctx.shadowBlur = 14;
    if (ok(im)) ctx.drawImage(im, -s / 2, -s / 2, s, s * (im.naturalHeight / im.naturalWidth));
    else { ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    ctx.restore();
    // fuse spark
    const fx = x - s * 0.18, fy = y - s * 0.42;
    for (let i = 0; i < 3; i++) { ctx.fillStyle = pick(['#f5b342', '#ff003c', '#fff6d8']); ctx.fillRect(fx + rr(-5, 5), fy + rr(-5, 5), 3, 3); }
  } else {
    // glitch bug: pixel critter with null crescent eyes
    const f = Math.floor(time * 10 + o.ph * 3) % 2, u = r / 3.2;
    ctx.save(); ctx.translate(x, y);
    const dir = Math.cos(o.ph) > 0 ? 1 : -1; ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(0,200,255,0.5)'; ctx.fillRect(-3 * u + 2, -2.4 * u, 6 * u, 4.6 * u);
    ctx.fillStyle = '#ff003c'; ctx.fillRect(-3 * u - 2, -2.4 * u, 6 * u, 4.6 * u);
    ctx.fillStyle = '#07080c'; ctx.fillRect(-3 * u, -2.4 * u, 6 * u, 4.6 * u);
    ctx.fillStyle = '#07080c'; ctx.beginPath(); ctx.moveTo(-3 * u, -2.4 * u); ctx.lineTo(-2.2 * u, -4 * u); ctx.lineTo(-1.2 * u, -2.4 * u); ctx.moveTo(3 * u, -2.4 * u); ctx.lineTo(2.2 * u, -4 * u); ctx.lineTo(1.2 * u, -2.4 * u); ctx.fill();
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
function drawCard(o) {
  const y = scrY(o.a) + Math.sin(o.t * 4) * 5, im = IMG.card, h = sx(1.5), w = h * 0.74;
  if (y < -60 || y > GH + 60) return;
  ctx.save(); ctx.translate(sx(o.x), y); ctx.rotate(Math.sin(o.t * 2) * 0.12);
  ctx.shadowColor = '#f5b342'; ctx.shadowBlur = 22 + Math.sin(o.t * 6) * 8;
  if (ok(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h); else { ctx.fillStyle = '#f5b342'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
function drawPlayer() {
  const c = CHARS[charIdx];
  let im, flip = false, rot = P.rot, bob = 0, sqx = 1, sqy = 1;
  if (P.mode === 'wall') { im = IMG[c.id + '_climb']; flip = P.side === 1; bob = Math.sin(time * 16) * 2; sqy = 1 + Math.sin(time * 16) * 0.025; }
  else if (P.mode === 'jump') { im = IMG[c.id + '_jump']; flip = P.to === 0; }
  else { im = IMG[c.id + '_jump']; rot = -Math.PI / 2 * 0.55 + Math.sin(time * 18) * 0.06; }
  if (state === 'dying' || state === 'over') { im = IMG[c.id + '_jump']; rot = P.rot; flip = P.side === 1; }
  const h = sx(SPR_H), w = ok(im) ? h * im.naturalWidth / im.naturalHeight : h * 0.5;
  let x = sx(P.x), y = PY + bob - sx(P.dy || 0);
  if (P.mode === 'wall' && state === 'play') {
    // anchor hands on wall edge
    x = P.side === 0 ? sx(WALL) + w / 2 - 2 : GW - sx(WALL) - w / 2 + 2;
  }
  ctx.save(); ctx.translate(x, y);
  if (graceT > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  // glow
  if (shield || boostT > 0) {
    ctx.save(); ctx.globalAlpha *= 0.55; ctx.fillStyle = boostT > 0 ? '#00c8ff' : '#f5b342';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62 + 6, h * 0.55 + 6, 0, 0, 7); ctx.fill(); ctx.restore();
    if (shield) { ctx.strokeStyle = '#f5b342'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62 + 8, h * 0.55 + 8, 0, 0, 7); ctx.stroke(); }
  }
  ctx.rotate(rot); ctx.scale(flip ? -sqx : sqx, sqy);
  if (ok(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h);
  else { ctx.fillStyle = '#000'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rr(-1, 1) * shake * 18, rr(-1, 1) * shake * 18);
  const [za, zb, t] = zoneMix();
  drawBgZone(za, 1); if (zb !== za) drawBgZone(zb, t);
  // speed lines
  if (state === 'play' || state === 'dying') {
    ctx.fillStyle = 'rgba(255,246,216,0.06)';
    for (let k = 0; k < 8; k++) { const xx = sx(WALL + 0.5 + (k * 1.07) % (WM - 2 * WALL - 1)), yy = ((k * 211 + alt * PPM * 1.3) % (GH + 80)) - 40; ctx.fillRect(xx, yy, 2, 26 + runSpeed * 3); }
  }
  drawWalls(t >= 0.5 ? zb : za);
  for (const o of objs) { if (o.k === 'wall') drawWallObj(o); }
  for (const o of objs) { if (o.k === 'fly') drawFly(o); else if (o.k === 'card') drawCard(o); }
  if (state !== 'menu' && state !== 'load') drawPlayer();
  for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; const s = sx(p.s); ctx.fillRect(sx(p.x) - s / 2, scrY(p.a) - s / 2, s, s); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tx of texts) {
    ctx.globalAlpha = 1 - tx.t / 0.9; ctx.font = '700 ' + Math.round(sx(0.55)) + 'px Silk, monospace';
    ctx.fillStyle = '#07080c'; ctx.fillText(tx.s, sx(tx.x) + 2, scrY(tx.a + tx.t * 1.5) + 2);
    ctx.fillStyle = tx.col; ctx.fillText(tx.s, sx(tx.x), scrY(tx.a + tx.t * 1.5));
  }
  ctx.globalAlpha = 1;
  // vignette
  const vg = ctx.createRadialGradient(GW / 2, GH / 2, GH * 0.3, GW / 2, GH / 2, GH * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, GW, GH);
  if (state === 'play' && time < 3.2 && alt < 22) {
    ctx.globalAlpha = Math.min(1, (3.2 - time) * 2) * (0.6 + 0.4 * Math.sin(time * 8));
    ctx.font = '700 ' + Math.round(sx(0.62)) + 'px Silk, monospace'; ctx.fillStyle = '#fff6d8';
    ctx.fillText('TAP TO JUMP', GW / 2, GH * 0.5); ctx.font = '400 ' + Math.round(sx(0.36)) + 'px Silk, monospace';
    ctx.fillText('switch walls · dodge ERASE', GW / 2, GH * 0.5 + sx(0.7)); ctx.globalAlpha = 1;
  }
  if (state === 'dying') { ctx.fillStyle = 'rgba(255,0,60,' + Math.max(0, 0.35 - dieT * 0.4) + ')'; ctx.fillRect(0, 0, GW, GH); }
  ctx.restore();
}

/* ---------- loop ---------- */
let last = performance.now(), acc = 0;
const H = 1 / 120;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (!(dt >= 0)) dt = 0; if (dt > 0.1) dt = 0.1;
  if (state === 'menu') { time += dt; alt += dt * 2.2; objs.length = 0; }
  else { acc += dt; let n = 0; while (acc >= H && n < 16) { step(H); acc -= H; n++; } if (n >= 16) acc = 0; }
  try { render(); } catch (e) { console.warn(e); }
  requestAnimationFrame(frame);
}

/* ---------- input ---------- */
function isUI(t) { return t && t.closest && t.closest('button, a, .scr:not(.hidden)'); }
window.addEventListener('pointerdown', e => {
  if (state === 'play' && !isUI(e.target)) { e.preventDefault(); jump(); }
}, { passive: false });
['touchstart', 'touchmove', 'touchend'].forEach(ev => app.addEventListener(ev, e => { if (!isUI(e.target) || ev === 'touchmove') { if (e.cancelable) e.preventDefault(); } }, { passive: false }));
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
  } else if (k === 'KeyP' || k === 'Escape') { state === 'play' ? pause() : resume(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else last = performance.now(); });
window.addEventListener('blur', () => pause());
const tapBtn = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); });
tapBtn('btnPlay', startRun); tapBtn('btnRetry', startRun); tapBtn('btnHome', toMenu);
tapBtn('btnPause', pause); tapBtn('btnResume', resume);
$('btnShare').addEventListener('click', e => e.stopPropagation());
const mb = $('btnMute');
mb.classList.toggle('off', muted);
tapBtn('btnMute', () => { muted = !muted; store.set('muted', muted); mb.classList.toggle('off', muted); if (!muted) { audio(); SFX.card(); } });

/* ---------- boot ---------- */
resize();
requestAnimationFrame(frame);
const fontReady = (document.fonts && document.fonts.load) ? Promise.race([document.fonts.load('700 20px Silk'), new Promise(r => setTimeout(r, 1500))]).catch(() => {}) : Promise.resolve();
Promise.all([loadAll(p => { $('ldPct').textContent = ' ' + Math.round(p * 100) + '%'; }), fontReady]).then(() => { resize(); toMenu(); });

if (/[?&]qa\b/.test(location.search)) window.__qa = { boost: () => { if (state === 'play') startBoost(); }, shield: () => { shield = true; updHud(); } };
/* test hook (read-only) */
window.__nc = {
  get s() { return { state, alt, kills, shield, boostT, boostMeter, charIdx, playedIdx, mode: P.mode, side: P.side, x: P.x, graceT,
    objs: objs.map(o => ({ k: o.k, side: o.side, a: o.a, len: o.len, w: o.w, x: o.x, r: o.r, type: o.type })) }; }
};
})();
