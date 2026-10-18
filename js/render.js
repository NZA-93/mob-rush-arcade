import { LANE_L, LANE_R, VIEW_W } from "./constants.js";

const TAU = Math.PI * 2;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function gateStyle(kind) {
  if (kind === "mul") return { fill: "#10283a", stroke: "#3ecbff", text: "#e7f8ff" };
  if (kind === "add") return { fill: "#0f3328", stroke: "#3dffb0", text: "#e9fff4" };
  return { fill: "#3a1220", stroke: "#ff5a78", text: "#ffe8ee" };
}

/**
 * Draw the whole frame in view space. The caller sets the pixel transform.
 * Crowds are batched into a couple of fills so a few hundred runners stay cheap.
 */
export function render(ctx, state) {
  const L = state.layout;
  const h = L.viewH;
  const shake = state.reduced ? 0 : state.shake;
  ctx.save();
  if (shake > 0.05) {
    ctx.translate(Math.sin(state.time * 71) * shake, Math.cos(state.time * 57) * shake);
  }

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1c1544");
  bg.addColorStop(0.42, "#12162e");
  bg.addColorStop(1, "#070a12");
  ctx.fillStyle = bg;
  ctx.fillRect(-40, -40, VIEW_W + 80, h + 80);

  // Lane floor and rails.
  ctx.fillStyle = "#101628";
  ctx.fillRect(LANE_L, L.baseY, LANE_R - LANE_L, L.loseY - L.baseY + 8);
  ctx.fillStyle = "#1a2344";
  ctx.fillRect(0, 0, LANE_L, h);
  ctx.fillRect(LANE_R, 0, VIEW_W - LANE_R, h);
  ctx.fillStyle = "rgba(90, 220, 255, 0.35)";
  ctx.fillRect(LANE_L - 3, L.baseY, 3, L.loseY - L.baseY);
  ctx.fillStyle = "rgba(255, 90, 120, 0.28)";
  ctx.fillRect(LANE_R, L.baseY, 3, L.loseY - L.baseY);

  // Speed dots.
  const spacing = 28;
  const off = (state.time * 48) % spacing;
  ctx.fillStyle = "rgba(180, 200, 255, 0.045)";
  ctx.beginPath();
  for (let y = L.baseBottom; y < L.loseY; y += spacing) {
    for (let x = LANE_L + 10; x < LANE_R; x += spacing) {
      ctx.rect(x, y + off, 2, 2);
    }
  }
  ctx.fill();

  drawAim(ctx, state, L);
  drawObstacles(ctx, state);
  drawGates(ctx, state);
  drawBase(ctx, state, L);
  drawCrowds(ctx, state);
  drawParticles(ctx, state);
  drawCannon(ctx, state, L);
  drawLabels(ctx, state, L);
  drawFloaters(ctx, state);
  drawBanner(ctx, state, L);

  if (state.threat > 0.05 && state.phase === "play") {
    ctx.fillStyle = `rgba(255, 40, 70, ${state.threat * 0.16})`;
    ctx.fillRect(LANE_L, L.loseY - 90, LANE_R - LANE_L, 90);
  }

  if (state.flash > 0.02) {
    ctx.fillStyle = `rgba(${state.flashRGB}, ${state.flash * 0.22})`;
    ctx.fillRect(-20, -20, VIEW_W + 40, h + 40);
  }

  ctx.restore();
}

function drawAim(ctx, state, L) {
  const x = state.cannonX;
  const hot = state.phase === "play" && state.windup <= 0;
  ctx.strokeStyle = hot ? "rgba(120, 230, 255, 0.28)" : "rgba(120, 230, 255, 0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, state.cannonY - 20);
  ctx.lineTo(x, L.baseBottom);
  ctx.stroke();
}

function drawObstacles(ctx, state) {
  const list = state.obstacles;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    ctx.save();
    roundRect(ctx, o.x, o.y, o.w, o.h, 5);
    ctx.fillStyle = "#141824";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "#f0c14a";
    const stripe = 10;
    const slide = (state.time * 24) % (stripe * 2);
    for (let x = -o.h; x < o.w + o.h; x += stripe * 2) {
      ctx.beginPath();
      ctx.moveTo(o.x + x + slide, o.y + o.h);
      ctx.lineTo(o.x + x + stripe + slide, o.y + o.h);
      ctx.lineTo(o.x + x + stripe + o.h + slide, o.y);
      ctx.lineTo(o.x + x + o.h + slide, o.y);
      ctx.fill();
    }
    ctx.restore();
    roundRect(ctx, o.x, o.y, o.w, o.h, 5);
    ctx.strokeStyle = "#f0c14a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawGates(ctx, state) {
  const aim = state.cannonX;
  for (let i = 0; i < state.gates.length; i++) {
    const g = state.gates[i];
    const style = gateStyle(g.kind);
    const aimed = aim >= g.x && aim <= g.x + g.w;
    const flash = g.flash;
    ctx.fillStyle = style.fill;
    roundRect(ctx, g.x, g.y, g.w, g.h, 8);
    ctx.fill();
    ctx.lineWidth = aimed ? 4 : 2.5;
    ctx.strokeStyle = style.stroke;
    ctx.globalAlpha = aimed ? 1 : 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.28})`;
      roundRect(ctx, g.x, g.y, g.w, g.h, 8);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(g.x + 6, g.y + 4, g.w - 12, 3);
    if (g.motion) {
      ctx.fillStyle = style.stroke;
      const cy = g.y + g.h * 0.5;
      ctx.beginPath();
      ctx.moveTo(g.x + 8, cy - 5);
      ctx.lineTo(g.x + 2, cy);
      ctx.lineTo(g.x + 8, cy + 5);
      ctx.moveTo(g.x + g.w - 8, cy - 5);
      ctx.lineTo(g.x + g.w - 2, cy);
      ctx.lineTo(g.x + g.w - 8, cy + 5);
      ctx.fill();
    }
    const size = Math.max(16, Math.min(28, g.w * 0.34));
    ctx.font = `800 ${size}px Trebuchet MS, Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    const tx = g.x + g.w * 0.5;
    const ty = g.y + g.h * 0.52;
    ctx.strokeText(g.label, tx, ty);
    ctx.fillStyle = style.text;
    ctx.fillText(g.label, tx, ty);
  }
}

function drawBase(ctx, state, L) {
  const b = state.base;
  const flash = state.baseFlash;
  ctx.fillStyle = flash > 0.15 ? "#6a2030" : "#2a1020";
  roundRect(ctx, b.x + 8, b.y, b.w - 16, b.h, 8);
  ctx.fill();
  // Battlements.
  ctx.fillStyle = "#1a0c16";
  const teeth = 8;
  const tw = (b.w - 24) / teeth;
  for (let i = 0; i < teeth; i++) {
    if (i % 2 === 0) ctx.fillRect(b.x + 12 + i * tw, b.y - 8, tw - 4, 12);
  }
  const pct = b.max > 0 ? Math.max(0, b.hp / b.max) : 0;
  const barX = b.x + 22;
  const barY = b.y + b.h - 16;
  const barW = b.w - 44;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, barX, barY, barW, 8, 4);
  ctx.fill();
  ctx.fillStyle = pct > 0.35 ? "#ff4d6a" : "#ffd166";
  if (pct > 0) {
    roundRect(ctx, barX, barY, Math.max(8, barW * pct), 8, 4);
    ctx.fill();
  }
  ctx.fillStyle = "#ffd0dc";
  ctx.font = "800 16px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.max(0, b.hp)), b.x + b.w * 0.5, b.y + 20);
}

function drawCrowds(ctx, state) {
  const total = state.counts[0] + state.counts[1];
  const simple = total > 220 || state.quality === "lite";
  drawTeam(ctx, state, 1, "#ff3d68", "#ffd5de", simple);
  drawTeam(ctx, state, 0, "#2ad8ff", "#e7ffff", simple);
  drawGiants(ctx, state);
}

function drawTeam(ctx, state, team, body, head, simple) {
  const runners = state.runners;
  const wind = state.windup > 0 || state.phase === "menu";
  ctx.fillStyle = body;
  ctx.beginPath();
  for (let i = 0; i < runners.length; i++) {
    const r = runners[i];
    if (!r.alive || r.team !== team || r.giant) continue;
    const bob = wind && team === 1 ? Math.sin(state.time * 3 + r.phase) * 2 : 0;
    const ox = Math.sin(state.time * 6 + r.phase) * 1.4;
    const rad = r.r + Math.sin(state.time * 8 + r.phase) * 0.35;
    const x = r.x + ox;
    const y = r.y + bob;
    if (simple) {
      ctx.rect(x - rad, y - rad, rad * 2, rad * 2);
    } else {
      ctx.moveTo(x + rad, y);
      ctx.arc(x, y, rad, 0, TAU);
    }
  }
  ctx.fill();
  if (simple) return;
  ctx.fillStyle = head;
  ctx.beginPath();
  for (let i = 0; i < runners.length; i++) {
    const r = runners[i];
    if (!r.alive || r.team !== team || r.giant) continue;
    const bob = wind && team === 1 ? Math.sin(state.time * 3 + r.phase) * 2 : 0;
    const ox = Math.sin(state.time * 6 + r.phase) * 1.4;
    const x = r.x + ox - 0.4;
    const y = r.y + bob - 2.5;
    ctx.moveTo(x + 2.2, y);
    ctx.arc(x, y, 2.2, 0, TAU);
  }
  ctx.fill();
}

function drawGiants(ctx, state) {
  const runners = state.runners;
  for (let i = 0; i < runners.length; i++) {
    const r = runners[i];
    if (!r.alive || !r.giant) continue;
    const rad = 11 + Math.sqrt(r.hp) * 1.35;
    ctx.fillStyle = "rgba(255, 210, 80, 0.28)";
    ctx.beginPath();
    ctx.arc(r.x, r.y, rad + 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath();
    ctx.arc(r.x, r.y, rad, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff6cf";
    ctx.stroke();
    ctx.fillStyle = "#3a2800";
    ctx.font = "800 13px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(r.hp), r.x, r.y + 0.5);
  }
}

function drawParticles(ctx, state) {
  const ps = state.particles;
  let last = "";
  let opened = false;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.alive) continue;
    if (p.color !== last) {
      if (opened) ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = p.color;
      last = p.color;
      opened = true;
    }
    const a = Math.max(0, p.life / p.max);
    const rad = Math.max(0.8, p.r * a);
    ctx.moveTo(p.x + rad, p.y);
    ctx.arc(p.x, p.y, rad, 0, TAU);
  }
  if (opened) ctx.fill();
}

function drawCannon(ctx, state, L) {
  const x = state.cannonX;
  const y = state.cannonY + state.recoil * 0.45;
  const ready = state.chargeReady;
  const pulse = ready ? 1 + Math.sin(state.time * 14) * 0.04 : 1;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 28, 7, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);

  const threat = state.threat;
  ctx.fillStyle = threat > 0.55 ? "#5a2430" : "#24304c";
  roundRect(ctx, -30, -6, 60, 28, 8);
  ctx.fill();
  ctx.fillStyle = "#8ea2c8";
  roundRect(ctx, -22, -2, 44, 8, 3);
  ctx.fill();

  // Barrel.
  ctx.fillStyle = ready ? "#ffd56a" : "#314268";
  roundRect(ctx, -10, -28, 20, 28, 5);
  ctx.fill();
  ctx.fillStyle = ready ? "#fff1b8" : "#3cf0ff";
  ctx.beginPath();
  ctx.arc(0, -28, ready ? 8 : 6, 0, TAU);
  ctx.fill();

  if (state.muzzle > 0.05) {
    ctx.globalAlpha = state.muzzle;
    ctx.fillStyle = "#e9fbff";
    ctx.beginPath();
    ctx.arc(0, -34, 10 + state.muzzle * 8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Charge track.
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, -24, 10, 48, 6, 3);
  ctx.fill();
  const pct = ready ? 1 : state.charge / 100;
  ctx.fillStyle = ready ? "#ffd56a" : "#3cf0ff";
  if (pct > 0) {
    roundRect(ctx, -24, 10, Math.max(4, 48 * pct), 6, 3);
    ctx.fill();
  }
  ctx.restore();

  // Danger line.
  const alpha = 0.15 + state.threat * 0.55;
  ctx.strokeStyle = `rgba(255, 70, 100, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LANE_L, state.loseY);
  ctx.lineTo(LANE_R, state.loseY);
  ctx.stroke();
  void L;
}

function drawLabels(ctx, state, L) {
  if (state.enemyPower > 0) {
    const x = clamp(state.cen1x, LANE_L + 36, LANE_R - 36);
    const y = avoidGates(state, x, clamp(state.cen1y - 28, L.baseBottom + 10, L.loseY - 30), -1);
    label(ctx, x, y, String(state.enemyPower), state.pop1, "#ffd5de");
  }
  if (state.playerPower > 0) {
    const x = clamp(state.cen0x, LANE_L + 36, LANE_R - 36);
    const y = avoidGates(state, x, clamp(state.cen0y + 32, L.baseBottom + 24, state.cannonY - 48), 1);
    label(ctx, x, y, String(state.playerPower), state.pop0, "#d8f8ff");
  }
}

/** Push a crowd total off a gate so the +10 / x2 text stays readable. */
function avoidGates(state, x, y, dir) {
  for (let n = 0; n < 5; n++) {
    let hit = null;
    for (let i = 0; i < state.gates.length; i++) {
      const g = state.gates[i];
      if (x >= g.x - 18 && x <= g.x + g.w + 18 && y >= g.y - 16 && y <= g.y + g.h + 16) {
        hit = g;
        break;
      }
    }
    if (!hit) break;
    y = dir < 0 ? hit.y - 20 : hit.y + hit.h + 20;
  }
  return y;
}

function label(ctx, x, y, text, pop, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.font = "800 26px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawFloaters(ctx, state) {
  const fs = state.floaters;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 20px Trebuchet MS, Segoe UI, sans-serif";
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    if (!f.alive) continue;
    const a = Math.max(0, f.life / f.max);
    ctx.globalAlpha = a;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawBanner(ctx, state, L) {
  if (state.phase === "play" && state.windup > 0.08) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.windup * 2);
    ctx.font = "800 16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d5f6ff";
    ctx.fillText("AIM", state.cannonX, state.cannonY - 70);
    ctx.restore();
  }
  if (state.phase !== "clear") return;
  const text = "CLEARED";
  const sub = "LEVEL " + state.level;
  const alpha = Math.min(1, state.clearT * 1.4);
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(VIEW_W / 2, L.viewH * 0.4);
  const scale = state.phase === "clear" ? 1 : 0.92 + (1 - Math.min(1, state.introT)) * 0.14;
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 42px Trebuchet MS, Segoe UI, sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = state.phase === "clear" ? "#d9ffe8" : "#f4f7ff";
  ctx.fillText(text, 0, 0);
  if (sub) {
    ctx.font = "700 16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillStyle = "#9fb4d8";
    ctx.fillText(sub, 0, 32);
  }
  ctx.restore();
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
