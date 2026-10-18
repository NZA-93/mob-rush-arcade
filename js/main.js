import { BUFFS } from "./buffs.js";
import { BEST_KEY, MUTE_KEY, VIEW_W } from "./constants.js";
import { createAudio } from "./audio.js";
import { computeLayout } from "./level.js";
import { createView } from "./render3d.js";
import { beginRun, boot, clearSfx, createState, spawnRunner, step } from "./sim.js";

const canvas = document.getElementById("game");
const stage = document.getElementById("stage");
const hud = document.getElementById("hud");
const view = createView(canvas);
const audio = createAudio();
const state = createState();

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const blurbEl = document.getElementById("blurb");
const helpEl = document.getElementById("help");
const resultEl = document.getElementById("result");
const hintEl = document.getElementById("hint");
const startBtn = document.getElementById("start");
const restartBtn = document.getElementById("restart");
const muteBtn = document.getElementById("mute");
const buffsEl = document.getElementById("buffs");
const flashEl = document.getElementById("flash");

const keys = new Set();
let aimX = null;
let firing = false;
let pointerId = null;
let shownScore = -1;
let shownLevel = -1;
let shownBest = -1;
let shownBuff = "";
let wasDead = false;

const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
state.reduced = reduceQuery.matches;
reduceQuery.addEventListener?.("change", () => {
  state.reduced = reduceQuery.matches;
});

function loadStore() {
  try {
    const best = Number(localStorage.getItem(BEST_KEY) || 0);
    state.best = Number.isFinite(best) ? best : 0;
    const mute = localStorage.getItem(MUTE_KEY) === "1";
    audio.setMuted(mute);
    muteBtn.setAttribute("aria-pressed", mute ? "true" : "false");
    muteBtn.textContent = mute ? "OFF" : "SFX";
  } catch {
    state.best = 0;
  }
}

function saveBest() {
  if (state.score > state.best) {
    state.best = state.score;
    try {
      localStorage.setItem(BEST_KEY, String(state.best));
    } catch {
      /* private mode */
    }
  }
}

function fmt(n) {
  return Math.max(0, n | 0).toLocaleString("en-US");
}

function readInsets() {
  const probe = document.getElementById("safe-probe");
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  };
}

function layoutStage() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vw / vh < 0.82;
  if (portrait) {
    stage.classList.add("fill");
    stage.style.width = "";
    stage.style.height = "";
  } else {
    stage.classList.remove("fill");
    const h = Math.min(vh - 24, 900);
    const w = Math.round(h * (VIEW_W / 780));
    stage.style.height = h + "px";
    stage.style.width = w + "px";
  }
  const rect = stage.getBoundingClientRect();
  const viewH = clamp(VIEW_W * (rect.height / Math.max(1, rect.width)), 660, 1040);
  view.resize(rect.width, rect.height);
  const safe = readInsets();
  const scale = viewH / Math.max(1, rect.height);
  const topInset = hud.offsetHeight * scale;
  const bottomInset = safe.bottom * scale + 16;
  state.layout = computeLayout(viewH, topInset, bottomInset);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function viewX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return ((clientX - rect.left) / Math.max(1, rect.width)) * VIEW_W;
}

function showMenu() {
  titleEl.textContent = "MOB RUSH";
  blurbEl.textContent = "Drag to aim. Hold to fire a crowd of jelly.";
  helpEl.hidden = false;
  resultEl.hidden = true;
  hintEl.hidden = false;
  startBtn.textContent = "TAP TO START";
  overlay.hidden = false;
}

function showDead() {
  titleEl.textContent = "OVERRUN";
  blurbEl.textContent = "The red crowd reached your cannon.";
  helpEl.hidden = true;
  hintEl.hidden = true;
  resultEl.hidden = false;
  resultEl.textContent = `Score ${fmt(state.score)}  ·  Best ${fmt(state.best)}`;
  startBtn.textContent = "PLAY AGAIN";
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
}

let crashed = false;
let wantResume = false;
let seenEpoch = 0;

function showRecover() {
  crashed = true;
  wantResume = false;
  titleEl.textContent = "TAP TO RESTART";
  blurbEl.textContent = "The picture froze. Tap to restart.";
  helpEl.hidden = true;
  hintEl.hidden = true;
  resultEl.hidden = true;
  startBtn.textContent = "TAP TO RESTART";
  overlay.hidden = false;
}

function startGame() {
  if (view.isLost()) {
    wantResume = true;
    try {
      view.recover();
    } catch {
      /* the browser restores the context on its own */
    }
    return;
  }
  crashed = false;
  wantResume = false;
  try {
    audio.unlock();
  } catch {
    /* sound is optional */
  }
  beginRun(state);
  hideOverlay();
  wasDead = false;
  syncHud(true);
}

function toggleMute() {
  audio.unlock();
  const next = muteBtn.getAttribute("aria-pressed") !== "true";
  audio.setMuted(next);
  muteBtn.setAttribute("aria-pressed", next ? "true" : "false");
  muteBtn.textContent = next ? "OFF" : "SFX";
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function inputState() {
  let move = 0;
  if (keys.has("arrowleft") || keys.has("a")) move -= 1;
  if (keys.has("arrowright") || keys.has("d")) move += 1;
  const keyFire = keys.has(" ") || keys.has("spacebar");
  return {
    aimX,
    move,
    firing: state.phase === "play" && (firing || keyFire),
  };
}

function syncHud(force) {
  if (force || state.score !== shownScore) {
    shownScore = state.score;
    scoreEl.textContent = fmt(state.score);
  }
  if (force || state.level !== shownLevel) {
    shownLevel = state.level;
    levelEl.textContent = String(state.level);
  }
  if (force || state.best !== shownBest) {
    shownBest = state.best;
    bestEl.textContent = fmt(state.best);
  }
  document.body.dataset.phase = state.phase;
  if (state.phase === "dead" && !wasDead) {
    wasDead = true;
    showDead();
  }
  if (state.phase !== "dead") wasDead = false;
  document.title = state.phase === "play" ? `L${state.level} · ${fmt(state.score)} · Mob Rush` : "Mob Rush";
  const bits = [];
  if (state.shot) bits.push(`${BUFFS[state.shot.id].name} ${Math.ceil(state.shot.t)}s`);
  if (state.shieldT > 0) bits.push(`SHIELD ${Math.ceil(state.shieldT)}s`);
  if (state.freezeT > 0) bits.push(`FREEZE ${Math.ceil(state.freezeT)}s`);
  if (state.chargeReady) bits.push("GIANT");
  const line = bits.join("   ");
  if (line !== shownBuff) {
    shownBuff = line;
    buffsEl.textContent = line;
    buffsEl.hidden = line.length === 0;
  }
  const flash = state.flash || 0;
  flashEl.style.opacity = flash > 0.02 ? String(Math.min(0.45, flash * 0.5)) : "0";
  flashEl.style.background = `rgb(${state.flashRGB || "255,255,255"})`;
}

let last = performance.now();
let acc = 0;
let fpsFrames = 0;
let fpsTime = 0;
const STEP = 1000 / 60;

function buzz(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS throws when vibration is outside a gesture */
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (crashed) return;
  let dt = now - last;
  last = now;
  if (document.hidden) {
    acc = 0;
    return;
  }
  try {
    frameStep(dt);
  } catch (err) {
    console.error(err);
    showRecover();
  }
}

function frameStep(dt) {
  if (dt > 250) dt = 250;
  fpsFrames += 1;
  fpsTime += dt;
  if (fpsTime > 1000) {
    const fps = (fpsFrames * 1000) / fpsTime;
    if (state.phase === "play" && fps < 40) state.lowFps = (state.lowFps || 0) + 1;
    else state.lowFps = 0;
    if (state.quality === "high" && state.lowFps >= 2) state.quality = "lite";
    state.fps = fps;
    fpsFrames = 0;
    fpsTime = 0;
  }

  acc += dt;
  let steps = 0;
  clearSfx(state.sfx);
  while (acc >= STEP && steps < 3) {
    step(state, STEP / 1000, inputState());
    acc -= STEP;
    steps += 1;
  }
  audio.flush(state.sfx);
  if (state.sfx.win) buzz(16);
  else if (state.sfx.lose) buzz(36);
  else if (state.sfx.giant) buzz(10);
  saveBest();

  if (state.epoch !== seenEpoch) {
    const previous = seenEpoch;
    seenEpoch = state.epoch;
    if (previous > 0) view.releaseLevel();
  }
  view.draw(state);
  syncHud(false);
}

function onDown(e) {
  if (pointerId !== null && pointerId !== e.pointerId) return;
  pointerId = e.pointerId;
  aimX = viewX(e.clientX);
  firing = true;
  audio.unlock();
  try {
    canvas.setPointerCapture?.(e.pointerId);
  } catch {
    /* capture is optional */
  }
}

function onMove(e) {
  if (e.pointerType === "mouse" || e.pointerId === pointerId) aimX = viewX(e.clientX);
  // A drag that missed pointerdown (some embedded browsers) still counts as holding.
  if (e.buttons === 1) {
    firing = true;
    pointerId = e.pointerId;
    audio.unlock();
  }
}

function onUp(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  firing = false;
}

startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});
restartBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMute();
});
overlay.addEventListener("pointerdown", (e) => {
  if (e.target === overlay) startGame();
});

canvas.addEventListener("pointerdown", onDown);
canvas.addEventListener("pointermove", onMove);
canvas.addEventListener("pointerup", onUp);
canvas.addEventListener("pointercancel", onUp);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
  if (!e.repeat) {
    if (key === "r") startGame();
    if (key === "m") toggleMute();
    if ((e.key === "Enter" || e.key === " ") && (state.phase === "menu" || state.phase === "dead")) {
      startGame();
    }
  }
  keys.add(key);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  firing = false;
  pointerId = null;
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  showRecover();
});
canvas.addEventListener("webglcontextrestored", () => {
  try {
    view.releaseLevel({ disposeGpu: false });
    layoutStage();
    if (wantResume) startGame();
  } catch (err) {
    console.error(err);
    showRecover();
  }
});
window.addEventListener("error", (event) => {
  if (crashed) return;
  console.error(event.error || event.message);
  showRecover();
});
window.addEventListener("unhandledrejection", (event) => {
  if (crashed) return;
  console.error(event.reason);
  showRecover();
});

document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
window.addEventListener("resize", layoutStage);
window.visualViewport?.addEventListener("resize", layoutStage);

function maybeStress() {
  if (!new URLSearchParams(location.search).has("stress")) return;
  hideOverlay();
  state.phase = "play";
  state.windup = 999;
  state.tune.spawnEvery = 9999;
  state.spawnT = 9999;
  state.base.hp = 999999;
  state.base.max = 999999;
  const h = state.layout.viewH;
  for (let i = 0; i < 320; i++) {
    spawnRunner(state, 0, 36 + (i % 36) * 9, h * 0.42 + (i % 14) * 16, { vy: -40, hp: 1 });
  }
  for (let i = 0; i < 200; i++) {
    spawnRunner(state, 1, 36 + (i % 36) * 9, h * 0.22 + (i % 10) * 14, { vy: 28, hp: 1 });
  }
}

loadStore();
boot(state);
layoutStage();
maybeStress();
requestAnimationFrame(() => {
  layoutStage();
  syncHud(true);
});
requestAnimationFrame(frame);

window.__MOBRUSH = { state, audio, layoutStage, startGame, view };
