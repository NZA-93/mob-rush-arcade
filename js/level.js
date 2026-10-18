import { LANE_L, LANE_R, VIEW_W } from "./constants.js";
import { mulberry32 } from "./rng.js";

/**
 * Difficulty curve. Every stat that should hurt more at higher levels lives here.
 * No purchases, no upgrades — the level number is the only dial.
 */
export function tuneFor(level) {
  const L = Math.max(1, level);
  return {
    level: L,
    baseHp: Math.round(460 + L * 52 + L * L * 3.4),
    enemySpeed: Math.min(168, 58 + L * 4.1),
    playerSpeed: 236,
    spawnEvery: Math.max(0.3, 0.8 - L * 0.024),
    spawnCount: 1 + Math.floor((L - 1) / 5),
    initialEnemy: Math.round(8 + L * 1.55),
    gateRows: Math.min(5, 2 + Math.floor((L - 1) / 3)),
    moveChance: L < 3 ? 0 : Math.min(0.82, (L - 2) * 0.11),
    obstacleCount: L < 4 ? 0 : Math.min(3, Math.floor((L - 2) / 3)),
    obstacleSpeed: 28 + L * 4.5,
    fireEvery: Math.max(0.05, 0.08 - L * 0.0006),
    chargePerShot: 5.25,
    giantHp: Math.min(24, 8 + Math.floor(L * 0.7)),
    windup: Math.max(0.32, 0.62 - L * 0.012),
  };
}

export function computeLayout(viewH, topInset, bottomInset) {
  const h = Math.max(640, Math.min(MAX_SAFE_H, viewH));
  const baseY = Math.max(8, topInset + 4);
  const baseH = 54;
  const baseBottom = baseY + baseH;
  const cannonY = h - Math.max(18, bottomInset) - 30;
  const loseY = cannonY - 32;
  // Room above the first gate so the opening enemy line actually walks through it.
  const gateZoneTop = baseBottom + 52;
  const gateZoneBot = Math.max(gateZoneTop + 110, loseY - 124);
  return {
    viewW: VIEW_W,
    viewH: h,
    laneL: LANE_L,
    laneR: LANE_R,
    baseY,
    baseH,
    baseBottom,
    cannonY,
    loseY,
    gateZoneTop,
    gateZoneBot,
  };
}

const MAX_SAFE_H = 1100;

function labelFor(kind, value) {
  if (kind === "mul") return "x" + value;
  if (kind === "add") return "+" + value;
  if (kind === "sub") return "-" + value;
  return "/" + value;
}

function setSpec(g, kind, value) {
  g.kind = kind;
  g.value = value;
  g.label = labelFor(kind, value);
  g.budget = kind === "sub" ? value : 0;
  g.pass = 0;
  g.triggered = false;
}

function strongPositive(rng, level) {
  const roll = rng();
  if (level >= 2 && roll < 0.3) return ["mul", 3];
  if (roll < 0.72) return ["mul", 2];
  if (level >= 5 && roll < 0.86) return ["add", 20];
  return ["add", 10];
}

function weakPositive(rng) {
  const roll = rng();
  if (roll < 0.35) return ["mul", 2];
  if (roll < 0.7) return ["add", 10];
  return ["add", 5];
}

function negativeSpec(rng, level) {
  const roll = rng();
  if (level >= 12 && roll < 0.18) return ["div", 3];
  if (level >= 6 && roll < 0.48) return ["div", 2];
  if (level >= 8 && roll < 0.78) return ["sub", 10];
  return ["sub", 5];
}

/**
 * t = 0 is the top of the gate zone (enemy side). t = 1 is the bottom (player side).
 * Upper gates hit the red crowd first. Lower gates hit your stream first.
 */
function chooseSpec(rng, level, t, isBest) {
  const playerSide = t >= 0.5;
  const enemySide = t <= 0.34;

  if (level < 3) {
    if (playerSide && isBest) return strongPositive(rng, level);
    if (playerSide) return weakPositive(rng);
    return weakPositive(rng);
  }

  let negChance = 0;
  if (playerSide && isBest) negChance = Math.min(0.18, Math.max(0, (level - 10) * 0.025));
  else if (playerSide) negChance = Math.min(0.7, 0.22 + (level - 3) * 0.045);
  else if (enemySide) negChance = level < 7 ? 0.08 : Math.max(0.04, 0.28 - level * 0.008);
  else negChance = isBest ? 0.12 : Math.min(0.55, 0.16 + level * 0.02);

  if (rng() < negChance) return negativeSpec(rng, level);

  if (enemySide && level >= 6 && rng() < Math.min(0.75, (level - 5) * 0.06)) {
    return strongPositive(rng, level >= 11 ? level : 1);
  }
  if (playerSide && isBest) return strongPositive(rng, level);
  if (rng() < 0.55) return strongPositive(rng, Math.max(1, level - 1));
  return weakPositive(rng);
}

function specScore(g) {
  if (g.kind === "sub") return -g.value;
  if (g.kind === "div") return -24;
  if (g.kind === "add") return g.value * 0.4;
  return g.value * 10;
}

/** Power of the gates the player actually reaches before the clash (lower half). */
export function playerLanePower(gates) {
  const mine = gates.filter((g) => g.t >= 0.5);
  const use = (mine.length ? mine : gates).slice().sort((a, b) => b.t - a.t);
  let v = 10;
  for (const g of use) {
    if (g.kind === "mul") v *= g.value;
    else if (g.kind === "add") v += g.value;
    else if (g.kind === "sub") v = Math.max(0, v - g.value);
    else v = Math.max(0, v / g.value);
  }
  return v;
}

function upgrade(g) {
  if (g.kind === "sub" || g.kind === "div") setSpec(g, "add", 10);
  else if (g.kind === "add") setSpec(g, "mul", 2);
  else if (g.kind === "mul" && g.value < 3) setSpec(g, "mul", 3);
  else setSpec(g, "add", g.value + 10);
}

function sidePower(gates, pred) {
  let v = 8;
  const use = gates.filter(pred).sort((a, b) => a.t - b.t);
  for (const g of use) {
    if (g.kind === "mul") v *= g.value;
    else if (g.kind === "add") v += g.value;
    else if (g.kind === "sub") v = Math.max(0, v - g.value);
    else v = Math.max(0, v / g.value);
  }
  return v;
}

function soften(g) {
  if (g.kind === "mul" && g.value >= 3) setSpec(g, "mul", 2);
  else if (g.kind === "add" && g.value > 10) setSpec(g, "add", 10);
  else if (g.kind === "mul" && g.value === 2) setSpec(g, "add", 10);
  else if (g.kind === "add" && g.value > 5) setSpec(g, "add", 5);
  else return false;
  return true;
}

function ensureFair(gates, cols, level) {
  if (level < 3) {
    for (const g of gates) {
      if (g.kind === "sub" || g.kind === "div") setSpec(g, "add", g.value >= 10 ? 10 : 5);
    }
  }

  const byCol = [];
  for (let c = 0; c < cols; c++) byCol.push(gates.filter((g) => g.col === c));

  let bestCol = 0;
  let best = -Infinity;
  for (let c = 0; c < cols; c++) {
    const p = playerLanePower(byCol[c]);
    if (p > best) {
      best = p;
      bestCol = c;
    }
  }

  const lane = byCol[bestCol];
  const bottom = lane.slice().sort((a, b) => b.t - a.t)[0];
  if (bottom && (bottom.kind === "sub" || bottom.kind === "div")) setSpec(bottom, "mul", 2);
  if (bottom && !lane.some((g) => g.kind === "mul" && g.t >= 0.5)) setSpec(bottom, "mul", 2);

  // Keep the best lane in a tight band so level time tracks HP, not a lucky god-gate.
  const floor = 32;
  const cap = 42 + level * 0.4;
  for (let guard = 0; guard < 8 && playerLanePower(lane) < floor; guard++) {
    let victim = null;
    let score = Infinity;
    for (const g of lane) {
      if (g.t < 0.5 && lane.some((o) => o.t >= 0.5)) continue;
      if (g.kind === "mul" && g.value >= 3) continue;
      const s = specScore(g);
      if (s < score) {
        score = s;
        victim = g;
      }
    }
    if (!victim) break;
    upgrade(victim);
  }

  for (const colGates of byCol) {
    for (let guard = 0; guard < 8 && playerLanePower(colGates) > cap; guard++) {
      let victim = null;
      let score = -Infinity;
      for (const g of colGates) {
        if (g.t < 0.5 && colGates.some((o) => o.t >= 0.5)) continue;
        const s = specScore(g);
        if (s > score) {
          score = s;
          victim = g;
        }
      }
      if (!victim || !soften(victim)) break;
    }
  }

  const enemyCap = 12 + level * 1.15;
  for (const colGates of byCol) {
    for (let guard = 0; guard < 6 && sidePower(colGates, (g) => g.t < 0.5) > enemyCap; guard++) {
      let victim = null;
      let score = -Infinity;
      for (const g of colGates) {
        if (g.t >= 0.5) continue;
        const s = specScore(g);
        if (s > score) {
          score = s;
          victim = g;
        }
      }
      if (!victim || !soften(victim)) break;
    }
  }

  best = -Infinity;
  bestCol = 0;
  for (let c = 0; c < cols; c++) {
    const p = playerLanePower(byCol[c]);
    if (p > best) {
      best = p;
      bestCol = c;
    }
  }
  return bestCol;
}

/**
 * Build a level layout in normalized gate-zone space so it survives resize.
 * Columns line up into lanes. Some rows slide. Later levels add red gates
 * and moving blocks.
 */
export function generateLevel(level, layout) {
  const rng = mulberry32(Math.imul(level, 10007) + 13);
  const tune = tuneFor(level);
  const zone = Math.max(120, layout.gateZoneBot - layout.gateZoneTop);
  const maxRows = Math.max(2, Math.min(5, Math.floor(zone / 76)));
  const rows = Math.min(tune.gateRows, maxRows);
  const cols = level >= 8 && rng() < 0.42 ? 3 : 2;
  const draftBest = Math.floor(rng() * cols);

  const gates = [];
  const motions = [];
  let bit = 0;

  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.62 : r / (rows - 1);
    const bottomRow = r === rows - 1;
    const moveRoll = bottomRow ? tune.moveChance * 0.4 : tune.moveChance;
    const moving = moveRoll > 0 && rng() < moveRoll;
    const ampCap = cols === 3 ? 26 : 56;
    const amp = moving ? Math.min(ampCap, 12 + level * 2.05) : 0;
    const gap = cols === 3 ? 8 : 10;
    const laneW = LANE_R - LANE_L;
    const inset = Math.max(0, amp);
    const usable = laneW - inset * 2 - gap * (cols - 1);
    const colW = usable / cols;
    const origin = LANE_L + (laneW - (colW * cols + gap * (cols - 1))) / 2;

    let motion = null;
    if (moving) {
      const dir = rng() < 0.5 ? -1 : 1;
      motion = {
        shift: (rng() * 2 - 1) * amp * 0.35,
        vx: dir * (34 + level * 3.1),
        min: -amp,
        max: amp,
      };
      motions.push(motion);
    }

    for (let c = 0; c < cols; c++) {
      const [kind, value] = chooseSpec(rng, level, t, c === draftBest);
      const g = {
        col: c,
        row: r,
        t,
        baseX: origin + c * (colW + gap),
        w: colW,
        h: 46,
        x: 0,
        y: 0,
        motion,
        bit: 1 << bit,
        flash: 0,
        lastFloat: -10,
        kind: "add",
        value: 5,
        label: "+5",
        budget: 0,
        pass: 0,
        triggered: false,
      };
      bit += 1;
      setSpec(g, kind, value);
      gates.push(g);
    }
  }

  const bestCol = ensureFair(gates, cols, level);

  const obstacles = [];
  const gapCount = Math.max(0, rows - 1);
  const want = Math.min(tune.obstacleCount, gapCount);
  for (let i = 0; i < want; i++) {
    const r0 = Math.min(gapCount - 1, Math.floor(rng() * gapCount));
    const t0 = rows === 1 ? 0.4 : r0 / (rows - 1);
    const t1 = rows === 1 ? 0.7 : (r0 + 1) / (rows - 1);
    const t = (t0 + t1) * 0.5;
    const w = 52 + rng() * 34;
    const h = 18;
    const minX = LANE_L + 6;
    const maxX = LANE_R - 6 - w;
    const moving = level >= 5 && rng() < 0.75;
    obstacles.push({
      t,
      x: minX + rng() * Math.max(1, maxX - minX),
      y: 0,
      w,
      h,
      vx: moving ? (rng() < 0.5 ? -1 : 1) * tune.obstacleSpeed : 0,
      minX,
      maxX: Math.max(minX, maxX),
    });
  }

  return { tune, gates, obstacles, motions, cols, rows, bestCol };
}

export function placeGateY(t, layout) {
  return layout.gateZoneTop + t * (layout.gateZoneBot - layout.gateZoneTop);
}
