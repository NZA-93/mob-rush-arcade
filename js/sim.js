import {
  CELL,
  LANE_L,
  LANE_R,
  MAX_ENEMY,
  MAX_FLOATERS,
  MAX_PARTICLES,
  MAX_PLAYER,
  MAX_RUNNERS,
  MAX_VIEW_H,
  SCORE_CLEAR,
  SCORE_HIT,
  SCORE_KILL,
  VIEW_W,
} from "./constants.js";
import { BUFFS, buffPool } from "./buffs.js";
import { computeLayout, generateLevel, placeGateY, playerLanePower } from "./level.js";
import { mulberry32 } from "./rng.js";

const COLS = Math.ceil(VIEW_W / CELL);
const ROWS = Math.ceil(MAX_VIEW_H / CELL);

function makeRunner(i) {
  return {
    i,
    alive: false,
    team: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    r: 6.4,
    giant: false,
    mask: 0,
    phase: 0,
    bias: 0,
    wait: 0,
    born: -1,
  };
}

function makeParticle() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, color: "#fff" };
}

function makeFloater() {
  return { alive: false, x: 0, y: 0, text: "", life: 0, max: 1, color: "#fff" };
}

export function createState() {
  const runners = new Array(MAX_RUNNERS);
  for (let i = 0; i < MAX_RUNNERS; i++) runners[i] = makeRunner(i);
  const particles = new Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) particles[i] = makeParticle();
  const floaters = new Array(MAX_FLOATERS);
  for (let i = 0; i < MAX_FLOATERS; i++) floaters[i] = makeFloater();

  const state = {
    phase: "menu",
    level: 1,
    score: 0,
    best: 0,
    time: 0,
    frame: 0,
    runners,
    free: [],
    counts: [0, 0],
    particles,
    pCursor: 0,
    floaters,
    fCursor: 0,
    gates: [],
    obstacles: [],
    motions: [],
    cols: 2,
    bestCol: 0,
    tune: null,
    rng: mulberry32(1),
    layout: computeLayout(780, 72, 28),
    base: { x: LANE_L, y: 0, w: LANE_R - LANE_L, h: 54, hp: 30, max: 30 },
    cannonX: VIEW_W / 2,
    cannonY: 700,
    loseY: 680,
    charge: 0,
    chargeReady: false,
    fireCd: 0,
    spawnT: 1,
    windup: 0,
    shake: 0,
    flash: 0,
    flashRGB: "255,255,255",
    baseFlash: 0,
    muzzle: 0,
    recoil: 0,
    introT: 0,
    clearT: 0,
    party: 0,
    dmgFloat: 0,
    bursts: 0,
    playerPower: 0,
    enemyPower: 0,
    prevP0: -1,
    prevP1: -1,
    pop0: 1,
    pop1: 1,
    cen0x: VIEW_W / 2,
    cen0y: 600,
    cen1x: VIEW_W / 2,
    cen1y: 180,
    threat: 0,
    reduced: false,
    quality: "high",
    epoch: 0,
    cards: [],
    cardT: 2.8,
    cardSerial: 1,
    cardRng: mulberry32(1),
    shot: null,
    shieldT: 0,
    shieldHp: 0,
    freezeT: 0,
    splats: Array.from({ length: 40 }, () => ({
      alive: false,
      age: 0,
      life: 0.32,
      x: 0,
      y: 0,
      team: 0,
      r: 6,
    })),
    splatI: 0,
    sfx: {
      shoot: 0,
      good: 0,
      bad: 0,
      hit: 0,
      base: 0,
      giant: 0,
      win: 0,
      lose: 0,
      ready: 0,
      pick: 0,
      bomb: 0,
      freeze: 0,
    },
  };
  clearRunners(state);
  return state;
}

export function clearSfx(sfx) {
  sfx.shoot = 0;
  sfx.good = 0;
  sfx.bad = 0;
  sfx.hit = 0;
  sfx.base = 0;
  sfx.giant = 0;
  sfx.win = 0;
  sfx.lose = 0;
  sfx.ready = 0;
  sfx.pick = 0;
  sfx.bomb = 0;
  sfx.freeze = 0;
}

export function clearRunners(state) {
  state.free.length = 0;
  for (let i = 0; i < MAX_RUNNERS; i++) {
    const r = state.runners[i];
    r.alive = false;
    r.i = i;
    state.free.push(i);
  }
  state.counts[0] = 0;
  state.counts[1] = 0;
}

export function spawnRunner(state, team, x, y, opts = {}) {
  const cap = team === 0 ? MAX_PLAYER : MAX_ENEMY;
  if (state.counts[team] >= cap) return null;
  const i = state.free.pop();
  if (i === undefined) return null;
  const r = state.runners[i];
  const speed = team === 0 ? state.tune.playerSpeed : state.tune.enemySpeed;
  r.alive = true;
  r.team = team;
  r.x = x;
  r.y = y;
  r.prevX = x;
  r.prevY = y;
  r.vx = opts.vx ?? (state.rng() * 2 - 1) * 22;
  r.vy = opts.vy ?? (team === 0 ? -speed : speed);
  r.hp = opts.hp ?? 1;
  r.maxHp = opts.maxHp ?? r.hp;
  r.giant = !!opts.giant;
  r.r = opts.r ?? (r.giant ? 14 : 6.5);
  r.mask = opts.mask ?? 0;
  r.phase = state.rng() * Math.PI * 2;
  r.bias = opts.bias ?? (team === 1 ? (state.rng() * 2 - 1) * 18 : 0);
  r.wait = opts.wait ?? 0;
  r.born = state.frame;
  r.bomb = !!opts.bomb;
  r.homing = !!opts.homing;
  r.squash = 0;
  state.counts[team] += 1;
  return r;
}

function addSplat(state, x, y, team, radius) {
  const s = state.splats[state.splatI];
  state.splatI = (state.splatI + 1) % state.splats.length;
  s.alive = true;
  s.age = 0;
  s.life = 0.34;
  s.x = x;
  s.y = y;
  s.team = team;
  s.r = radius;
}

function explode(state, x, y) {
  const rad = 48;
  const rad2 = rad * rad;
  state.sfx.bomb = 1;
  state.shake = Math.min(14, state.shake + 3.6);
  state.flash = Math.min(1, state.flash + 0.18);
  state.flashRGB = "255,176,90";
  burst(state, x, y, "#ffb15a", 12, 190);
  const runners = state.runners;
  for (let i = 0; i < MAX_RUNNERS; i++) {
    const e = runners[i];
    if (!e.alive || e.team !== 1) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > rad2) continue;
    const d = Math.min(2, e.hp);
    e.hp -= d;
    e.squash = 1;
    state.score += d * SCORE_KILL;
    if (e.hp <= 0) killRunner(state, e);
  }
}

function killRunner(state, r) {
  if (!r.alive) return;
  const bomb = r.bomb && r.team === 0;
  const x = r.x;
  const y = r.y;
  const team = r.team;
  const radius = r.r;
  r.alive = false;
  r.bomb = false;
  r.homing = false;
  state.counts[team] = Math.max(0, state.counts[team] - 1);
  state.free.push(r.i);
  addSplat(state, x, y, team, radius);
  if (bomb) explode(state, x, y);
}

function burst(state, x, y, color, n, speed) {
  const lite = state.quality === "lite";
  const count = lite ? Math.min(n, 3) : n;
  for (let k = 0; k < count; k++) {
    const p = state.particles[state.pCursor];
    state.pCursor = (state.pCursor + 1) % MAX_PARTICLES;
    const a = state.rng() * Math.PI * 2;
    const s = speed * (0.35 + state.rng() * 0.75);
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = 0.22 + state.rng() * 0.28;
    p.max = p.life;
    p.r = 1.6 + state.rng() * 2.4;
    p.color = color;
  }
}

function floatText(state, x, y, text, color) {
  const f = state.floaters[state.fCursor];
  state.fCursor = (state.fCursor + 1) % MAX_FLOATERS;
  f.alive = true;
  f.x = x;
  f.y = y;
  f.text = text;
  f.color = color;
  f.life = 0.72;
  f.max = 0.72;
}

function floatGate(state, g, x, y) {
  if (state.time - g.lastFloat < 0.16) return;
  g.lastFloat = state.time;
  const bad = g.kind === "sub" || g.kind === "div";
  floatText(state, x, y, g.label, bad ? "#ffd0dc" : "#d9ffe8");
}

function syncPositions(state) {
  const L = state.layout;
  state.cannonY = L.cannonY;
  state.loseY = L.loseY;
  state.base.x = L.laneL;
  state.base.y = L.baseY;
  state.base.w = L.laneR - L.laneL;
  state.base.h = L.baseH;
  for (let i = 0; i < state.gates.length; i++) {
    const g = state.gates[i];
    const shift = g.motion ? g.motion.shift : 0;
    g.x = g.baseX + shift;
    g.y = placeGateY(g.t, L) - g.h * 0.5;
  }
  for (let i = 0; i < state.obstacles.length; i++) {
    const o = state.obstacles[i];
    o.y = placeGateY(o.t, L) - o.h * 0.5;
  }
}

export function loadLevel(state, level) {
  state.level = level;
  clearRunners(state);
  for (let i = 0; i < MAX_PARTICLES; i++) state.particles[i].alive = false;
  for (let i = 0; i < MAX_FLOATERS; i++) state.floaters[i].alive = false;
  const gen = generateLevel(level, state.layout);
  state.tune = gen.tune;
  state.gates = gen.gates;
  state.obstacles = gen.obstacles;
  state.motions = gen.motions;
  state.cols = gen.cols;
  state.bestCol = gen.bestCol;
  state.rng = mulberry32(Math.imul(level, 9176) + 42);
  state.base.max = gen.tune.baseHp;
  state.base.hp = gen.tune.baseHp;
  state.windup = gen.tune.windup;
  state.spawnT = gen.tune.spawnEvery * 0.65;
  state.fireCd = 0;
  state.introT = 0.9;
  state.clearT = 0;
  state.dmgFloat = 0;
  state.threat = 0;
  state.baseFlash = 0;
  state.cards.length = 0;
  state.cardT = 2.8;
  state.epoch += 1;
  state.cardRng = mulberry32(Math.imul(level, 4049) + 91);
  syncPositions(state);

  const n = gen.tune.initialEnemy;
  const bottom = state.layout.baseBottom;
  for (let i = 0; i < n; i++) {
    const x = LANE_L + 18 + state.rng() * (LANE_R - LANE_L - 36);
    const y = bottom + 8 + (i % 3) * 6;
    spawnRunner(state, 1, x, y, {
      vx: (state.rng() * 2 - 1) * 16,
      wait: (i % 7) * 0.09,
    });
  }
  census(state);
}

function resetBuffs(state) {
  state.shot = null;
  state.shieldT = 0;
  state.shieldHp = 0;
  state.freezeT = 0;
}

export function boot(state) {
  state.phase = "menu";
  state.score = 0;
  state.charge = 0;
  state.chargeReady = false;
  state.cannonX = VIEW_W / 2;
  state.level = 1;
  resetBuffs(state);
  loadLevel(state, 1);
}

export function beginRun(state) {
  state.score = 0;
  state.charge = 0;
  state.chargeReady = false;
  state.cannonX = VIEW_W / 2;
  state.shake = 0;
  state.phase = "play";
  resetBuffs(state);
  loadLevel(state, 1);
}

/** Aim helper: center of the lowest gate in a column (the first one you hit). */
export function columnAim(state, col) {
  let g = null;
  for (let i = 0; i < state.gates.length; i++) {
    const gate = state.gates[i];
    if (gate.col !== col) continue;
    if (!g || gate.t > g.t) g = gate;
  }
  return g ? g.x + g.w * 0.5 : state.cannonX;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function updateFx(state, dt) {
  state.shake *= Math.exp(-5.2 * dt);
  if (state.shake < 0.05) state.shake = 0;
  state.flash *= Math.exp(-4.2 * dt);
  if (state.flash < 0.01) state.flash = 0;
  state.baseFlash *= Math.exp(-6 * dt);
  state.muzzle *= Math.exp(-16 * dt);
  state.recoil *= Math.exp(-12 * dt);
  if (state.introT > 0) state.introT -= dt;

  const ps = state.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 28 * dt;
  }

  const fs = state.floaters;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    if (!f.alive) continue;
    f.life -= dt;
    if (f.life <= 0) {
      f.alive = false;
      continue;
    }
    f.y -= 32 * dt;
  }

  for (let i = 0; i < state.gates.length; i++) {
    const g = state.gates[i];
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 2.4);
  }

  const splats = state.splats;
  for (let i = 0; i < splats.length; i++) {
    const s = splats[i];
    if (!s.alive) continue;
    s.age += dt;
    if (s.age >= s.life) s.alive = false;
  }
}

function avoidObstacles(state, r, dt) {
  const list = state.obstacles;
  const dir = r.team === 0 ? -1 : 1;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const inX = r.x > o.x - r.r - 2 && r.x < o.x + o.w + r.r + 2;
    if (!inX) continue;
    const ahead =
      dir < 0
        ? r.y <= o.y + o.h + 26 && r.y >= o.y - 2
        : r.y >= o.y - 26 && r.y <= o.y + o.h + 2;
    if (!ahead) continue;
    const mid = o.x + o.w * 0.5;
    const target = r.x < mid ? o.x - r.r - 4 : o.x + o.w + r.r + 4;
    const dx = target - r.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), 240 * dt);
    r.x += step;
  }
}

function ejectObstacles(state, r) {
  const list = state.obstacles;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (
      r.x > o.x - r.r &&
      r.x < o.x + o.w + r.r &&
      r.y > o.y - r.r &&
      r.y < o.y + o.h + r.r
    ) {
      const mid = o.x + o.w * 0.5;
      r.x += r.x < mid ? -8 : 8;
      r.y += r.team === 0 ? 5 : -5;
    }
  }
}

/**
 * Gates rewrite the crowd. Multipliers clone bodies (giants double their
 * strength instead). +N dumps extras once, to whoever touches it first.
 * -N and /N shave strength, which is the same currency as the fight.
 */
function applyGate(state, r, g) {
  g.flash = 1;
  if (g.kind === "mul") {
    if (r.giant) {
      r.hp = Math.min(80, r.hp * g.value);
      r.maxHp = r.hp;
    } else {
      for (let k = 1; k < g.value; k++) {
        spawnRunner(state, r.team, r.x + (state.rng() * 2 - 1) * 12, r.y + (r.team === 0 ? -7 : 7), {
          vx: (state.rng() * 2 - 1) * 28,
          vy: r.vy * (0.94 + state.rng() * 0.1),
          mask: r.mask,
          hp: 1,
        });
      }
    }
    floatGate(state, g, r.x, r.y);
    state.sfx.good = 1;
    return;
  }

  if (g.kind === "add") {
    if (!g.triggered) {
      g.triggered = true;
      const line = g.y + g.h * 0.5;
      const y = line + (r.team === 0 ? -12 : 12);
      const speed = r.team === 0 ? -state.tune.playerSpeed : state.tune.enemySpeed;
      for (let k = 0; k < g.value; k++) {
        const x = g.x + 10 + state.rng() * Math.max(8, g.w - 20);
        spawnRunner(state, r.team, x, y, {
          vx: (state.rng() * 2 - 1) * 26,
          vy: speed * (0.94 + state.rng() * 0.12),
          mask: r.mask | g.bit,
        });
      }
      floatGate(state, g, g.x + g.w * 0.5, g.y);
      state.sfx.good = 1;
    }
    return;
  }

  if (g.kind === "sub") {
    if (g.budget <= 0 || r.hp <= 0) return;
    const d = Math.min(g.budget, r.hp);
    g.budget -= d;
    r.hp -= d;
    if (r.team === 1) state.score += d * SCORE_KILL;
    if (r.hp <= 0) {
      burst(state, r.x, r.y, r.team === 0 ? "#ff6d8a" : "#ffd2dc", 6, 110);
      killRunner(state, r);
    }
    floatGate(state, g, r.x, r.y);
    state.sfx.bad = 1;
    return;
  }

  if (g.kind === "div") {
    g.pass += 1;
    if (r.hp > 1) {
      const next = Math.max(1, Math.floor(r.hp / g.value));
      const lost = r.hp - next;
      r.hp = next;
      if (r.team === 1 && lost > 0) state.score += lost * SCORE_KILL;
      floatGate(state, g, r.x, r.y);
      state.sfx.bad = 1;
      return;
    }
    if (g.pass % g.value !== 1) {
      if (r.team === 1) state.score += SCORE_KILL;
      burst(state, r.x, r.y, r.team === 0 ? "#ff6d8a" : "#ffd2dc", 5, 100);
      killRunner(state, r);
      floatGate(state, g, r.x, r.y);
      state.sfx.bad = 1;
    }
  }
}

function tryGates(state, r, prevY) {
  if (!r.alive) return;
  const up = r.team === 0;
  for (let i = 0; i < state.gates.length; i++) {
    const g = state.gates[i];
    if (r.mask & g.bit) continue;
    const line = g.y + g.h * 0.5;
    const crossed = up ? prevY > line && r.y <= line : prevY < line && r.y >= line;
    if (!crossed) continue;
    if (r.x < g.x || r.x > g.x + g.w) continue;
    r.mask |= g.bit;
    applyGate(state, r, g);
    if (!r.alive) return;
  }
}

function steerHoming(r, enemies, dt) {
  let best = null;
  let bestD = 1e12;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    if (e.y > r.y + 24) continue;
    const dx = e.x - r.x;
    const dy = e.y - r.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return;
  r.vx += clamp((best.x - r.x) * 6.5, -240, 240) * dt;
}

function moveRunners(state, dt) {
  const runners = state.runners;
  const freezeEnemy = state.windup > 0 || state.freezeT > 0;
  let enemies = null;
  for (let i = 0; i < MAX_RUNNERS; i++) {
    const r = runners[i];
    if (!r.alive || r.born === state.frame) continue;
    if (r.squash > 0) r.squash = Math.max(0, r.squash - dt * 3.4);
    if (freezeEnemy && r.team === 1) continue;
    if (r.wait > 0) {
      r.wait -= dt;
      continue;
    }
    const prevY = r.y;
    r.prevX = r.x;
    r.prevY = prevY;
    avoidObstacles(state, r, dt);
    r.vx *= Math.exp(-1.8 * dt);
    if (r.homing && r.team === 0) {
      if (!enemies) {
        enemies = [];
        for (let j = 0; j < MAX_RUNNERS; j++) {
          const e = runners[j];
          if (e.alive && e.team === 1) enemies.push(e);
        }
      }
      steerHoming(r, enemies, dt);
    }
    // Red runners walk toward the cannon, so the fight is head-on instead of a flank.
    if (r.team === 1) {
      const target = state.cannonX + r.bias;
      const span = Math.max(1, state.loseY - state.layout.baseBottom);
      const progress = clamp((r.y - state.layout.baseBottom) / span, 0, 1);
      const rate = 1.4 + progress * 5;
      r.x += (target - r.x) * Math.min(0.5, rate * dt);
    }
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (r.x < LANE_L + r.r) {
      r.x = LANE_L + r.r;
      r.vx = Math.abs(r.vx);
    } else if (r.x > LANE_R - r.r) {
      r.x = LANE_R - r.r;
      r.vx = -Math.abs(r.vx);
    }
    ejectObstacles(state, r);
    tryGates(state, r, prevY);
  }
}

const head = new Int16Array(COLS * ROWS);
const nextIx = new Int16Array(MAX_RUNNERS);

function collide(state) {
  head.fill(-1);
  const runners = state.runners;
  for (let i = 0; i < MAX_RUNNERS; i++) {
    const r = runners[i];
    if (!r.alive) continue;
    const cx = (r.x / CELL) | 0;
    const cy = (r.y / CELL) | 0;
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
    const k = cy * COLS + cx;
    nextIx[i] = head[k];
    head[k] = i;
  }

  for (let i = 0; i < MAX_RUNNERS; i++) {
    const a = runners[i];
    if (!a.alive || a.team !== 0) continue;
    const cx = (a.x / CELL) | 0;
    const cy = (a.y / CELL) | 0;
    let stop = false;
    for (let oy = -1; oy <= 1 && !stop; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= ROWS) continue;
      for (let ox = -1; ox <= 1 && !stop; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= COLS) continue;
        let idx = head[yy * COLS + xx];
        while (idx !== -1 && !stop) {
          const b = runners[idx];
          const nxt = nextIx[idx];
          if (b.alive && b.team === 1) {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const rad = a.r + b.r;
            if (dx * dx + dy * dy <= rad * rad) fight(state, a, b);
            if (!a.alive) stop = true;
          }
          idx = nxt;
        }
      }
    }
  }
}

function fight(state, a, b) {
  const d = Math.min(a.hp, b.hp);
  if (d <= 0) return;
  a.hp -= d;
  b.hp -= d;
  a.squash = 1;
  b.squash = 1;
  state.score += d * SCORE_KILL;
  state.sfx.hit = 1;
  state.shake = Math.min(12, state.shake + 0.42);
  if (state.bursts < 22) {
    state.bursts += 1;
    burst(state, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, "#ffe7a8", state.bursts < 8 ? 6 : 3, 100);
  }
  if (a.hp <= 0) killRunner(state, a);
  if (b.hp <= 0) killRunner(state, b);
}

function boundaries(state) {
  const runners = state.runners;
  const baseLine = state.layout.baseBottom;
  let leaked = false;
  for (let i = 0; i < MAX_RUNNERS; i++) {
    const r = runners[i];
    if (!r.alive || r.born === state.frame) continue;
    if (r.team === 0 && r.y <= baseLine) {
      if (state.phase === "play") {
        const d = r.hp;
        state.base.hp -= d;
        state.score += d * SCORE_HIT;
        state.dmgFloat += d;
        state.baseFlash = 1;
        state.shake = Math.min(16, state.shake + Math.min(7, 1.2 + d * 0.28));
        state.sfx.base = 1;
        state.flash = Math.min(1, state.flash + 0.1);
        state.flashRGB = "255,236,210";
        if (state.bursts < 16) {
          state.bursts += 1;
          burst(state, r.x, baseLine, "#ffd2a4", 8, 140);
        }
      }
      killRunner(state, r);
    } else if (r.team === 1 && state.shieldT > 0 && state.shieldHp > 0 && r.y >= state.loseY - 28) {
      const absorbed = Math.min(r.hp, state.shieldHp);
      r.hp -= absorbed;
      state.shieldHp -= absorbed;
      r.squash = 1;
      state.score += absorbed * SCORE_KILL;
      state.sfx.hit = 1;
      if (state.bursts < 10) {
        state.bursts += 1;
        burst(state, r.x, r.y, "#9aefff", 5, 90);
      }
      if (r.hp <= 0) killRunner(state, r);
      else r.y = state.loseY - 32;
      if (state.shieldHp <= 0) state.shieldT = 0;
    } else if (r.team === 1 && r.y >= state.loseY) {
      if (state.phase === "play") leaked = true;
      killRunner(state, r);
    }
  }

  if (state.dmgFloat > 0) {
    floatText(
      state,
      VIEW_W * 0.5,
      state.layout.baseY + 16,
      "-" + state.dmgFloat,
      "#ffe1c4"
    );
    state.dmgFloat = 0;
  }

  if (state.phase === "play" && state.base.hp <= 0) {
    state.base.hp = 0;
    state.phase = "clear";
    state.clearT = 1.35;
    state.party = 0;
    const bonus = SCORE_CLEAR * state.level;
    state.score += bonus;
    state.sfx.win = 1;
    state.flash = 0.85;
    state.flashRGB = "210,255,230";
    state.shake = Math.min(16, state.shake + 6);
    floatText(state, VIEW_W * 0.5, state.layout.viewH * 0.42, "+" + bonus, "#d9ffe8");
    return;
  }
  if (state.phase === "play" && leaked) {
    state.phase = "dead";
    state.sfx.lose = 1;
    state.flash = 0.9;
    state.flashRGB = "255,70,90";
    state.shake = 14;
  }
}

function shotId(state) {
  return state.shot ? state.shot.id : null;
}

function shotInterval(state) {
  const every = state.tune.fireEvery;
  const id = shotId(state);
  if (id === "rapid") return every * 0.42;
  if (id === "bomb") return every * 1.85;
  if (id === "pierce") return every * 1.45;
  if (id === "spread") return every * 1.2;
  return every;
}

function noteShot(state, recoil) {
  state.sfx.shoot = 1;
  state.muzzle = 1;
  state.recoil = recoil;
  const chargeScale = shotId(state) === "rapid" ? 0.55 : 1;
  state.charge += state.tune.chargePerShot * chargeScale;
  if (state.charge >= 100) {
    state.charge = 100;
    if (!state.chargeReady) {
      state.chargeReady = true;
      state.sfx.ready = 1;
    }
  }
}

function fire(state) {
  const id = shotId(state);
  const y = state.cannonY - 40;
  if (state.chargeReady) {
    const hp = state.tune.giantHp;
    spawnRunner(state, 0, state.cannonX, y, {
      vx: (state.rng() * 2 - 1) * 10,
      vy: -state.tune.playerSpeed * 1.04,
      hp,
      maxHp: hp,
      giant: true,
      r: 14,
      homing: id === "homing",
    });
    state.charge = 0;
    state.chargeReady = false;
    state.sfx.giant = 1;
    state.muzzle = 1;
    state.recoil = 10;
    state.shake = Math.min(14, state.shake + 3.5);
    burst(state, state.cannonX, y, "#ffe08a", 14, 160);
    return;
  }

  if (id === "spread") {
    const speed = state.tune.playerSpeed;
    let any = false;
    const angles = [-0.2, 0, 0.2];
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const spawned = spawnRunner(state, 0, state.cannonX, y, {
        vx: Math.sin(a) * speed * 0.62,
        vy: -Math.cos(a) * speed * (0.96 + state.rng() * 0.06),
      });
      if (spawned) any = true;
    }
    if (any) noteShot(state, 6);
    return;
  }

  if (id === "bomb") {
    const spawned = spawnRunner(state, 0, state.cannonX, y, {
      vx: (state.rng() * 2 - 1) * 8,
      vy: -state.tune.playerSpeed * 0.9,
      hp: 4,
      maxHp: 4,
      r: 11,
      bomb: true,
    });
    if (spawned) {
      noteShot(state, 8);
      burst(state, state.cannonX, y, "#ffb15a", 6, 80);
    }
    return;
  }

  if (id === "pierce") {
    const hp = 6;
    const spawned = spawnRunner(state, 0, state.cannonX, y, {
      vx: (state.rng() * 2 - 1) * 8,
      vy: -state.tune.playerSpeed * 0.98,
      hp,
      maxHp: hp,
      r: 12,
    });
    if (spawned) noteShot(state, 7);
    return;
  }

  const spread = (state.rng() * 2 - 1) * (id === "rapid" ? 22 : 16);
  const x = clamp(state.cannonX + spread, LANE_L + 10, LANE_R - 10);
  const spawned = spawnRunner(state, 0, x, y, {
    vx: (state.rng() * 2 - 1) * 18,
    vy: -state.tune.playerSpeed * (0.96 + state.rng() * 0.08),
    homing: id === "homing",
  });
  if (spawned) noteShot(state, 5);
}

function spawnEnemies(state) {
  const n = state.tune.spawnCount;
  const y = state.layout.baseBottom + 8;
  for (let i = 0; i < n; i++) {
    const x = LANE_L + 16 + state.rng() * (LANE_R - LANE_L - 32);
    spawnRunner(state, 1, x, y, {
      vx: (state.rng() * 2 - 1) * 20,
      vy: state.tune.enemySpeed * (0.94 + state.rng() * 0.12),
    });
  }
}

function census(state) {
  let c0 = 0;
  let c1 = 0;
  let p0 = 0;
  let p1 = 0;
  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  let threat = 0;
  const runners = state.runners;
  const loseY = state.loseY;
  for (let i = 0; i < MAX_RUNNERS; i++) {
    const r = runners[i];
    if (!r.alive) continue;
    if (r.team === 0) {
      c0 += 1;
      p0 += r.hp;
      x0 += r.x;
      y0 += r.y;
    } else {
      c1 += 1;
      p1 += r.hp;
      x1 += r.x;
      y1 += r.y;
      const d = loseY - r.y;
      if (d < 170) threat = Math.max(threat, 1 - d / 170);
    }
  }
  state.counts[0] = c0;
  state.counts[1] = c1;
  state.playerPower = p0;
  state.enemyPower = p1;
  if (c0) {
    state.cen0x = x0 / c0;
    state.cen0y = y0 / c0;
  }
  if (c1) {
    state.cen1x = x1 / c1;
    state.cen1y = y1 / c1;
  }
  state.threat = threat;
  if (p0 !== state.prevP0) {
    if (state.prevP0 >= 0) state.pop0 = 1.36;
    state.prevP0 = p0;
  }
  if (p1 !== state.prevP1) {
    if (state.prevP1 >= 0) state.pop1 = 1.36;
    state.prevP1 = p1;
  }
}

function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Cards sit off the best gate column, so grabbing one means leaving the multiplier. */
function offerXs(state, n) {
  const best = columnAim(state, state.bestCol);
  const lane = LANE_R - LANE_L;
  const candidates = [];
  for (let i = 0; i < state.cols; i++) {
    if (i === state.bestCol) continue;
    candidates.push(columnAim(state, i));
  }
  candidates.push(LANE_L + lane * 0.2, LANE_L + lane * 0.5, LANE_L + lane * 0.8);
  const xs = [];
  for (let i = 0; i < candidates.length && xs.length < n; i++) {
    const x = clamp(candidates[i], LANE_L + 42, LANE_R - 42);
    if (Math.abs(x - best) < 48) continue;
    if (xs.some((v) => Math.abs(v - x) < 62)) continue;
    xs.push(x);
  }
  if (xs.length < n) {
    xs.length = 0;
    for (let i = 0; i < n; i++) xs.push(LANE_L + lane * ((i + 1) / (n + 1)));
  }
  return xs;
}

function spawnCardRow(state) {
  const n = state.level < 3 ? 2 : 3;
  const pool = shuffle(state.cardRng, buffPool(state.level).slice());
  const kinds = pool.slice(0, n);
  const xs = offerXs(state, kinds.length);
  const group = state.cardSerial++;
  const speed = 86 + state.level * 3.4;
  const y = state.layout.baseBottom + 18;
  for (let i = 0; i < kinds.length; i++) {
    state.cards.push({
      x: xs[i],
      y,
      w: 74,
      h: 40,
      kind: kinds[i],
      group,
      vy: speed,
      alive: true,
    });
  }
  floatText(state, VIEW_W * 0.5, (state.layout.baseBottom + state.cannonY) * 0.42, "PICK ONE", "#f4fbff");
  const floater = state.floaters[(state.fCursor + MAX_FLOATERS - 1) % MAX_FLOATERS];
  floater.life = 1.5;
  floater.max = 1.5;
}

function takeCard(state, card) {
  const info = BUFFS[card.kind];
  state.sfx.pick = 1;
  state.flash = Math.min(1, state.flash + 0.28);
  state.flashRGB = "210,245,255";
  state.shake = Math.min(8, state.shake + 2);
  floatText(state, card.x, card.y, info.name, info.color);
  if (card.kind === "shield") {
    state.shieldT = info.dur;
    state.shieldHp = 26 + state.level * 2;
    return;
  }
  if (card.kind === "freeze") {
    state.freezeT = info.dur;
    state.sfx.freeze = 1;
    return;
  }
  state.shot = { id: card.kind, t: info.dur, max: info.dur };
}

function moveCards(state, dt) {
  let taken = null;
  let bestDist = 1e9;
  const catchTop = state.cannonY - 20;
  for (let i = 0; i < state.cards.length; i++) {
    const c = state.cards[i];
    c.y += c.vy * dt;
    if (c.y < catchTop || c.y > state.cannonY + 26) continue;
    const dist = Math.abs(state.cannonX - c.x);
    if (dist < 38 && dist < bestDist) {
      bestDist = dist;
      taken = c;
    }
  }
  if (taken) {
    const group = taken.group;
    takeCard(state, taken);
    for (let i = state.cards.length - 1; i >= 0; i--) {
      if (state.cards[i].group === group) state.cards.splice(i, 1);
    }
    return;
  }
  for (let i = state.cards.length - 1; i >= 0; i--) {
    if (state.cards[i].y > state.layout.viewH + 36) state.cards.splice(i, 1);
  }
}

function tickBuffs(state, dt) {
  if (state.shot) {
    state.shot.t -= dt;
    if (state.shot.t <= 0) state.shot = null;
  }
  if (state.shieldT > 0) {
    state.shieldT -= dt;
    if (state.shieldT <= 0) {
      state.shieldT = 0;
      state.shieldHp = 0;
    }
  }
  if (state.freezeT > 0) state.freezeT = Math.max(0, state.freezeT - dt);
}

function celebrate(state, dt) {
  state.party -= dt;
  if (state.party > 0) return;
  state.party = 0.1;
  const x = LANE_L + state.rng() * (LANE_R - LANE_L);
  const y = state.layout.baseBottom + 20 + state.rng() * 80;
  const colors = ["#3cf0ff", "#ffe08a", "#ff5d7c", "#b8ffcf"];
  burst(state, x, y, colors[(state.rng() * colors.length) | 0], 10, 180);
}

/**
 * One fixed step. `input.aimX` is in view space, `input.firing` is held,
 * `input.move` is -1 | 0 | 1 for the keyboard.
 */
export function step(state, dt, input = {}) {
  if (dt > 0.05) dt = 0.05;
  state.time += dt;
  state.frame += 1;
  state.bursts = 0;

  if (state.phase === "menu" || state.phase === "dead") {
    syncPositions(state);
    updateFx(state, dt);
    return;
  }

  for (let i = 0; i < state.motions.length; i++) {
    const m = state.motions[i];
    m.shift += m.vx * dt;
    if (m.shift > m.max) {
      m.shift = m.max;
      m.vx *= -1;
    } else if (m.shift < m.min) {
      m.shift = m.min;
      m.vx *= -1;
    }
  }
  for (let i = 0; i < state.obstacles.length; i++) {
    const o = state.obstacles[i];
    if (!o.vx) continue;
    o.x += o.vx * dt;
    if (o.x > o.maxX) {
      o.x = o.maxX;
      o.vx *= -1;
    } else if (o.x < o.minX) {
      o.x = o.minX;
      o.vx *= -1;
    }
  }
  syncPositions(state);

  const pad = 30;
  if (input.aimX != null) {
    const target = clamp(input.aimX, LANE_L + pad, LANE_R - pad);
    const follow = 1 - Math.exp(-16 * dt);
    state.cannonX += (target - state.cannonX) * follow;
  }
  if (input.move) state.cannonX += input.move * 320 * dt;
  state.cannonX = clamp(state.cannonX, LANE_L + pad, LANE_R - pad);

  if (state.phase === "play") {
    state.windup = Math.max(0, state.windup - dt);
    tickBuffs(state, dt);
    if (input.firing) {
      state.fireCd -= dt;
      let shots = 0;
      const every = shotInterval(state);
      while (state.fireCd <= 0 && shots < 3) {
        fire(state);
        state.fireCd += every;
        shots += 1;
      }
    } else {
      state.fireCd = Math.min(state.fireCd, shotInterval(state));
    }
    if (state.windup <= 0) {
      state.spawnT -= dt;
      if (state.spawnT <= 0) {
        state.spawnT += state.tune.spawnEvery;
        spawnEnemies(state);
      }
      state.cardT -= dt;
      if (state.cardT <= 0 && state.cards.length === 0) {
        spawnCardRow(state);
        state.cardT = Math.max(7.2, 12.4 - state.level * 0.22);
      }
    }
    moveCards(state, dt);
  }

  moveRunners(state, dt);
  collide(state);
  boundaries(state);

  if (state.phase === "clear") {
    state.clearT -= dt;
    celebrate(state, dt);
    if (state.clearT <= 0) {
      const charge = state.charge;
      const ready = state.chargeReady;
      const score = state.score;
      const cannonX = state.cannonX;
      loadLevel(state, state.level + 1);
      state.charge = charge;
      state.chargeReady = ready;
      state.score = score;
      state.cannonX = cannonX;
      state.phase = "play";
    }
  }

  updateFx(state, dt);
  // Pop smoothing uses the real dt (census above assumed 1/60).
  census(state);
  const k = 1 - Math.exp(-9 * dt);
  state.pop0 += (1 - state.pop0) * k;
  state.pop1 += (1 - state.pop1) * k;
}

export { playerLanePower, SCORE_CLEAR, SCORE_HIT, SCORE_KILL };
