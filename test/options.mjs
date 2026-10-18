import assert from "node:assert/strict";
import { BUFFS } from "../js/buffs.js";
import { columnAim, createState, beginRun, spawnRunner, step } from "../js/sim.js";

function fresh() {
  const state = createState();
  beginRun(state);
  state.windup = 0;
  state.phase = "play";
  return state;
}

function countTeam(state, team) {
  let n = 0;
  for (let i = 0; i < state.runners.length; i++) {
    const r = state.runners[i];
    if (r.alive && r.team === team) n += 1;
  }
  return n;
}

const choice = fresh();
const group = 7;
choice.cards.push(
  { x: choice.cannonX, y: choice.cannonY - 8, kind: "spread", group, vy: 40, alive: true },
  { x: choice.cannonX + 120, y: choice.cannonY - 8, kind: "rapid", group, vy: 40, alive: true }
);
step(choice, 1 / 60, { firing: false });
assert.equal(choice.shot.id, "spread");
assert.equal(choice.cards.length, 0, "taking one card clears the whole row");
assert.ok(choice.shot.t <= BUFFS.spread.dur && choice.shot.t > BUFFS.spread.dur - 0.05);

const missed = fresh();
missed.cards.push({ x: missed.cannonX + 140, y: missed.cannonY - 8, kind: "bomb", group: 3, vy: 40, alive: true });
step(missed, 1 / 60, { firing: false });
assert.equal(missed.shot, null);
assert.equal(missed.cards.length, 1);

const spread = fresh();
spread.shot = { id: "spread", t: 12, max: 12 };
spread.fireCd = 0;
const before = countTeam(spread, 0);
step(spread, 1 / 60, { firing: true });
assert.equal(countTeam(spread, 0) - before, 3);

const pierce = fresh();
pierce.shot = { id: "pierce", t: 12, max: 12 };
pierce.fireCd = 0;
step(pierce, 1 / 60, { firing: true });
const blob = pierce.runners.find((r) => r.alive && r.team === 0);
assert.ok(blob);
assert.equal(blob.hp, 6);
assert.ok(blob.r >= 12);

const bomb = fresh();
bomb.shot = null;
bomb.windup = 99;
const mine = spawnRunner(bomb, 0, 200, 320, { hp: 1, bomb: true, vy: 0, vx: 0 });
const nearA = spawnRunner(bomb, 1, 220, 330, { hp: 1, vy: 0, vx: 0 });
const nearB = spawnRunner(bomb, 1, 180, 340, { hp: 1, vy: 0, vx: 0 });
mine.hp = 0.2;
const nearC = spawnRunner(bomb, 1, 200, 320, { hp: 1, vy: 0, vx: 0 });
step(bomb, 1 / 60, { firing: false });
assert.equal(mine.alive, false);
assert.equal(nearA.alive, false);
assert.equal(nearB.alive, false);
assert.equal(nearC.alive, false);

const shield = fresh();
shield.windup = 99;
shield.shieldT = 5;
shield.shieldHp = 5;
const blocked = spawnRunner(shield, 1, shield.cannonX, shield.loseY, { hp: 3, vy: 0, vx: 0 });
step(shield, 1 / 60, { firing: false });
assert.equal(shield.phase, "play");
assert.equal(shield.shieldHp, 2);
assert.equal(blocked.alive, false);

const freeze = fresh();
freeze.windup = 0;
freeze.freezeT = 2;
const red = spawnRunner(freeze, 1, 200, 400, { hp: 1, vy: 120, vx: 0 });
const y0 = red.y;
step(freeze, 1 / 60, { firing: false });
assert.equal(red.y, y0);

const swap = fresh();
swap.shot = { id: "rapid", t: 4, max: 12 };
swap.cards.push({ x: swap.cannonX, y: swap.cannonY, kind: "homing", group: 9, vy: 10, alive: true });
step(swap, 1 / 60, { firing: false });
assert.equal(swap.shot.id, "homing");
swap.cards.push({ x: swap.cannonX, y: swap.cannonY, kind: "shield", group: 10, vy: 10, alive: true });
step(swap, 1 / 60, { firing: false });
assert.equal(swap.shot.id, "homing", "a shield does not replace the shot");
assert.ok(swap.shieldT > 0);

const aimed = fresh();
const bestX = columnAim(aimed, aimed.bestCol);
aimed.cannonX = bestX;
for (let i = 0; i < 60 * 8; i++) {
  step(aimed, 1 / 60, { firing: true, aimX: columnAim(aimed, aimed.bestCol) });
}
assert.equal(aimed.shot, null, "staying on the multiplier does not collect a card");
assert.equal(aimed.shieldT, 0);
assert.equal(aimed.freezeT, 0);

console.log("options ok");
