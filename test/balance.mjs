import { MAX_RUNNERS } from "../js/constants.js";
import { generateLevel, placeGateY, playerLanePower, tuneFor } from "../js/level.js";
import {
  beginRun,
  clearRunners,
  columnAim,
  createState,
  loadLevel,
  spawnRunner,
  step,
} from "../js/sim.js";

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok", msg);
  }
}

function gate(partial) {
  return {
    col: 0,
    row: 0,
    t: 0.7,
    baseX: 100,
    w: 200,
    h: 46,
    x: 100,
    y: 400,
    motion: null,
    bit: 1,
    flash: 0,
    lastFloat: -10,
    kind: "mul",
    value: 2,
    label: "x2",
    budget: 0,
    pass: 0,
    triggered: false,
    ...partial,
  };
}

function fresh() {
  const s = createState();
  beginRun(s);
  clearRunners(s);
  s.gates = [];
  s.obstacles = [];
  s.motions = [];
  s.windup = 0;
  s.tune.spawnEvery = 999;
  s.spawnT = 999;
  s.base.y = -800;
  s.layout.baseBottom = -800;
  s.layout.baseY = -860;
  return s;
}

function pump(s, frames, x) {
  for (let i = 0; i < frames; i++) step(s, 1 / 60, { aimX: x, move: 0, firing: false });
}

function countTeam(s, team) {
  let n = 0;
  for (const r of s.runners) if (r.alive && r.team === team) n += 1;
  return n;
}

function testGate(kind, value, label, expectCount) {
  const s = fresh();
  const g = gate({
    kind,
    value,
    label,
    budget: kind === "sub" ? value : 0,
  });
  s.gates = [g];
  const line = placeGateY(g.t, s.layout);
  for (let i = 0; i < 10; i++) {
    spawnRunner(s, 0, 200, line + 80, { vx: 0, vy: -300, mask: 0, hp: 1 });
  }
  pump(s, 50, 200);
  const n = countTeam(s, 0);
  assert(n === expectCount, `${label} on 10 runners -> ${n} (want ${expectCount})`);
}

testGate("mul", 2, "x2", 20);
testGate("mul", 3, "x3", 30);
testGate("add", 10, "+10", 20);
testGate("sub", 5, "-5", 5);
testGate("div", 2, "/2", 5);

{
  const s = fresh();
  s.base.hp = 5;
  s.base.max = 5;
  s.layout.baseBottom = 200;
  s.base.y = 140;
  for (let i = 0; i < 5; i++) spawnRunner(s, 0, 180 + i * 8, 230, { vx: 0, vy: -400, hp: 1 });
  pump(s, 20, 200);
  assert(s.phase === "clear", `base damage clears the level (${s.phase}, hp ${s.base.hp})`);
  assert(s.score >= 300, `clear awards score (${s.score})`);
}

{
  const s = fresh();
  s.phase = "play";
  s.layout.loseY = 400;
  s.loseY = 400;
  spawnRunner(s, 1, 200, 390, { vx: 0, vy: 200, hp: 1 });
  pump(s, 20, 200);
  assert(s.phase === "dead", `enemy reaching the cannon ends the run (${s.phase})`);
}

{
  const s = fresh();
  const giant = spawnRunner(s, 0, 200, 300, { vx: 0, vy: 0, hp: 4, giant: true, r: 16 });
  for (let i = 0; i < 4; i++) spawnRunner(s, 1, 200, 300, { vx: 0, vy: 0, hp: 1, r: 6 });
  step(s, 1 / 60, { aimX: 200, firing: false });
  assert(!giant.alive && countTeam(s, 1) === 0, "a strength-4 giant trades one-for-one with 4 enemies");
  assert(s.score === 40, `trades score ${s.score}`);
}

{
  const a = generateLevel(4, createState().layout);
  const b = generateLevel(4, createState().layout);
  const sig = (lvl) => lvl.gates.map((g) => `${g.kind}${g.value}@${g.t.toFixed(3)}`).join("|");
  assert(sig(a) === sig(b), "level generation is deterministic");
}

{
  const l1 = generateLevel(1, createState().layout);
  assert(l1.obstacles.length === 0, "level 1 has no obstacles");
  assert(l1.gates.every((g) => !g.motion), "level 1 gates do not move");
  assert(
    l1.gates.every((g) => g.kind === "mul" || g.kind === "add"),
    "level 1 has no negative gates"
  );
  assert(playerLanePower(l1.gates.filter((g) => g.col === l1.bestCol)) >= 16, "level 1 best lane pays");
}

{
  let neg = 0;
  let moving = 0;
  let obstacles = 0;
  const layout = createState().layout;
  for (let level = 10; level <= 22; level++) {
    const lvl = generateLevel(level, layout);
    if (lvl.gates.some((g) => g.kind === "sub" || g.kind === "div")) neg += 1;
    if (lvl.motions.length > 0) moving += 1;
    if (lvl.obstacles.length > 0) obstacles += 1;
    assert(playerLanePower(lvl.gates.filter((g) => g.col === lvl.bestCol)) >= 16, `level ${level} best lane stays useful`);
  }
  assert(neg >= 8, `later levels roll negative gates (${neg}/13)`);
  assert(moving >= 8, `later levels move gates (${moving}/13)`);
  assert(obstacles >= 8, `later levels spawn obstacles (${obstacles}/13)`);
}

{
  const t1 = tuneFor(1);
  const t5 = tuneFor(5);
  const t12 = tuneFor(12);
  const t20 = tuneFor(20);
  assert(t1.baseHp < t5.baseHp && t5.baseHp < t12.baseHp && t12.baseHp < t20.baseHp, "bases get tougher");
  assert(t1.enemySpeed < t5.enemySpeed && t5.enemySpeed < t20.enemySpeed, "enemies get faster");
  assert(t1.initialEnemy < t12.initialEnemy && t12.initialEnemy < t20.initialEnemy, "waves get larger");
  assert(t1.spawnEvery > t20.spawnEvery, "spawn interval shrinks");
  assert(t1.gateRows < t12.gateRows, "gate rows increase");
  assert(t1.obstacleCount === 0 && t20.obstacleCount > t1.obstacleCount, "obstacles arrive later");
}

function runBot(level, seconds) {
  const s = createState();
  beginRun(s);
  if (level !== 1) {
    loadLevel(s, level);
    s.phase = "play";
    s.score = 0;
    s.charge = 0;
    s.chargeReady = false;
  }
  const frames = Math.round(seconds * 60);
  let maxAlive = 0;
  for (let i = 0; i < frames; i++) {
    const x = columnAim(s, s.bestCol);
    step(s, 1 / 60, { aimX: x, move: 0, firing: true });
    maxAlive = Math.max(maxAlive, s.counts[0] + s.counts[1]);
    if (s.phase === "clear" || s.phase === "dead") break;
  }
  return { phase: s.phase, score: s.score, level: s.level, frame: s.frame, maxAlive, hp: s.base.hp, max: s.base.max };
}

console.log("\nBot runs:");
const bots = {};
for (const level of [1, 2, 3, 5, 8, 12, 16]) {
  const result = runBot(level, 50);
  bots[level] = result;
  console.log(
    `  L${level}: ${result.phase} score=${result.score} t=${(result.frame / 60).toFixed(1)}s alive<=${result.maxAlive} base=${result.hp}/${result.max}`
  );
  assert(result.maxAlive <= MAX_RUNNERS, `level ${level} stays within the runner cap`);
}

const l1 = bots[1];
assert(l1.phase === "clear", `level 1 is winnable (${l1.phase} hp ${l1.hp}/${l1.max})`);
assert(l1.frame / 60 >= 10 && l1.frame / 60 <= 20, `level 1 gives you time to play (${(l1.frame / 60).toFixed(1)}s)`);
assert(bots[3].phase === "clear", `level 3 is winnable (${bots[3].phase})`);
assert(bots[5].phase === "clear", "level 5 is winnable");
assert(bots[8].phase === "clear" && bots[8].frame > l1.frame, "level 8 takes longer than level 1");
assert(bots[12].phase === "clear" && bots[12].frame > bots[8].frame, "level 12 takes longer than level 8");
assert(bots[16].phase !== "dead" && bots[16].hp < bots[16].max, "level 16 is a long fight rather than an instant loss");

{
  const s = createState();
  const t0 = performance.now();
  beginRun(s);
  clearRunners(s);
  s.windup = 0;
  s.tune.spawnEvery = 999;
  for (let i = 0; i < 200; i++) spawnRunner(s, 0, 80 + (i % 50) * 5, 280 + (i % 7) * 8, { vy: -40, hp: 1 });
  for (let i = 0; i < 200; i++) spawnRunner(s, 1, 80 + (i % 50) * 5, 300 + (i % 7) * 8, { vy: 40, hp: 1 });
  for (let i = 0; i < 120; i++) step(s, 1 / 60, { aimX: 200, firing: false });
  const ms = performance.now() - t0;
  console.log(`stress 400 runners x 120 frames: ${ms.toFixed(0)}ms`);
  assert(ms < 1500, `crowd sim stays fast (${ms.toFixed(0)}ms)`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
