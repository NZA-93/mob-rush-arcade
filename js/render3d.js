import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "./vendor/three.module.js";
import { BUFFS } from "./buffs.js";
import { MAX_PARTICLES, MAX_RUNNERS, VIEW_W } from "./constants.js";

const S = 0.021;
const BLOB_SCALE = 1.75;
const MAX_GATES = 16;
const MAX_OBS = 6;
const MAX_CARDS = 6;
const MAX_FLOATS = 24;

const BLUE = new Color("#2f8cff");
const BLUE_HOT = new Color("#8fd0ff");
const RED = new Color("#ff3352");
const RED_DIM = new Color("#c4203c");
const GOLD = new Color("#ffd15a");
const BOMB = new Color("#ff8a2a");
const PIERCE = new Color("#d7f1ff");
const ICE = new Color("#9aefff");
const tmpColor = new Color();

const dummy = new Object3D();
const look = new Vector3();

function canvasTex(draw, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function trackTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#1a2233";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#121826";
    for (let i = 0; i < 18; i++) g.fillRect(0, i * 60, w, 1);
    g.strokeStyle = "rgba(90, 220, 255, 0.55)";
    g.lineWidth = 10;
    g.strokeRect(8, 0, w - 16, h);
    g.strokeStyle = "rgba(255, 210, 120, 0.28)";
    g.lineWidth = 4;
    g.setLineDash([28, 36]);
    g.beginPath();
    g.moveTo(w * 0.5, 0);
    g.lineTo(w * 0.5, h);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(80, 200, 255, 0.16)";
    for (let y = 40; y < h; y += 90) {
      g.beginPath();
      g.moveTo(w * 0.5, y);
      g.lineTo(w * 0.32, y + 34);
      g.lineTo(w * 0.68, y + 34);
      g.closePath();
      g.fill();
    }
  }, 256, 1024);
}

function softDisc() {
  return canvasTex((g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, w * 0.08, w / 2, w / 2, w * 0.5);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  }, 64, 64);
}

function hazardTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#2a2418";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#e2b34a";
    for (let x = -h; x < w; x += 18) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 14, h);
      g.lineTo(x + 14 + h, 0);
      g.lineTo(x + h, 0);
      g.fill();
    }
  }, 128, 64);
}

const liveTextures = [];

function makeLiveTexture(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: true });
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.userData.ctx = ctx;
  tex.userData.live = true;
  liveTextures.push(tex);
  return tex;
}

function paintLabel(tex, text, color) {
  const ctx = tex && tex.userData.ctx;
  if (!ctx) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `800 ${Math.floor(h * 0.46)}px Trebuchet MS, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(4, h * 0.08);
  ctx.strokeStyle = "rgba(0,0,0,0.72)";
  ctx.strokeText(text, w / 2, h / 2 + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 1);
  tex.needsUpdate = true;
}

function paintCard(tex, kind) {
  const ctx = tex && tex.userData.ctx;
  if (!ctx) return;
  const info = BUFFS[kind];
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = "800 54px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = info ? info.color : "#ffffff";
  ctx.fillText(info ? info.name : "", w / 2, h * 0.4);
  ctx.font = "700 28px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillStyle = "#f4f7ff";
  ctx.fillText(info ? info.line : "", w / 2, h * 0.74);
  tex.needsUpdate = true;
}

function dropTexture(tex) {
  if (!tex) return;
  const index = liveTextures.indexOf(tex);
  if (index >= 0) liveTextures.splice(index, 1);
  tex.dispose();
  tex.userData.ctx = null;
  tex.image = null;
}

function liveMap(material, w, h) {
  const current = material.map;
  if (current && current.userData.live && current.image && current.image.width === w && current.image.height === h) {
    return current;
  }
  if (current && current.userData.live) dropTexture(current);
  const tex = makeLiveTexture(w, h);
  material.map = tex;
  material.needsUpdate = true;
  return tex;
}

function world(x, y, layout) {
  return {
    x: (x - VIEW_W * 0.5) * S,
    z: (y - layout.cannonY) * S,
  };
}

function isMobile() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && window.matchMedia("(pointer: coarse)").matches;
}

export function createView(canvas) {
  const mobile = isMobile();
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: mobile ? "default" : "high-performance",
    stencil: false,
    failIfMajorPerformanceCaveat: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x10182a, 1);

  const scene = new Scene();
  scene.background = new Color(0x10182a);
  scene.fog = new Fog(0x10182a, 9, 24);

  const camera = new PerspectiveCamera(50, 1, 0.08, 50);
  const camBase = { y: 5.15, z: 3.15, lookZ: -6.4 };

  const hemi = new HemisphereLight(0xc5d7ff, 0x2a2118, 0.72);
  scene.add(hemi);
  const ambient = new AmbientLight(0x6e7ea8, 0.28);
  scene.add(ambient);
  const sun = new DirectionalLight(0xfff1dc, 1.55);
  sun.position.set(4.5, 11, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 256 : 512, mobile ? 256 : 512);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, -7);

  const ground = new Mesh(
    new PlaneGeometry(28, 36),
    new MeshStandardMaterial({ color: 0x0d121c, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -8);
  ground.receiveShadow = true;
  scene.add(ground);

  const trackMap = trackTexture();
  trackMap.wrapS = RepeatWrapping;
  trackMap.wrapT = RepeatWrapping;
  trackMap.repeat.set(1, 3.2);
  const laneW = 348 * S;
  const track = new Mesh(
    new PlaneGeometry(laneW, 18),
    new MeshStandardMaterial({ map: trackMap, color: 0xffffff, roughness: 0.86, metalness: 0.02 })
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0.012, -7.2);
  track.receiveShadow = true;
  scene.add(track);

  const railMat = new MeshStandardMaterial({ color: 0x9eb4cc, roughness: 0.35, metalness: 0.62 });
  const railGeo = new BoxGeometry(0.16, 0.28, 18);
  const railL = new Mesh(railGeo, railMat);
  const railR = new Mesh(railGeo, railMat);
  railL.position.set(-laneW * 0.5 - 0.08, 0.14, -7.2);
  railR.position.set(laneW * 0.5 + 0.08, 0.14, -7.2);
  railL.castShadow = railR.castShadow = true;
  railL.receiveShadow = railR.receiveShadow = true;
  scene.add(railL, railR);

  const cannon = new Group();
  const sled = new Mesh(
    new BoxGeometry(0.92, 0.16, 0.55),
    new MeshStandardMaterial({ color: 0x243044, roughness: 0.6, metalness: 0.2 })
  );
  sled.position.y = 0.1;
  sled.castShadow = true;
  const body = new Mesh(
    new BoxGeometry(0.62, 0.38, 0.48),
    new MeshStandardMaterial({ color: 0x1d6dff, roughness: 0.32, metalness: 0.12, emissive: 0x0a2a66, emissiveIntensity: 0.6 })
  );
  body.position.y = 0.36;
  body.castShadow = true;
  const barrel = new Mesh(
    new CylinderGeometry(0.12, 0.16, 0.72, 8),
    new MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.28, metalness: 0.2, emissive: 0x123a88, emissiveIntensity: 0.5 })
  );
  barrel.rotation.x = -Math.PI / 2;
  barrel.position.set(0, 0.46, -0.42);
  barrel.castShadow = true;
  const muzzle = new Mesh(
    new IcosahedronGeometry(0.18, 1),
    new MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0 })
  );
  muzzle.position.set(0, 0.46, -0.82);
  const pips = [];
  for (let i = 0; i < 5; i++) {
    const pip = new Mesh(
      new IcosahedronGeometry(0.055, 0),
      new MeshStandardMaterial({ color: 0x243044, emissive: 0x000000, roughness: 0.4 })
    );
    pip.position.set(-0.28 + i * 0.14, 0.68, 0);
    pips.push(pip);
    cannon.add(pip);
  }
  cannon.add(sled, body, barrel, muzzle);
  scene.add(cannon);

  const base = new Group();
  const fort = new Mesh(
    new BoxGeometry(laneW * 0.92, 0.85, 0.7),
    new MeshStandardMaterial({ color: 0x8a2436, roughness: 0.48, metalness: 0.08, emissive: 0x3a0c14, emissiveIntensity: 0.4 })
  );
  fort.position.y = 0.42;
  fort.castShadow = true;
  fort.receiveShadow = true;
  const battlement = new Mesh(
    new BoxGeometry(laneW * 0.96, 0.16, 0.82),
    new MeshStandardMaterial({ color: 0xc43a52, roughness: 0.4, metalness: 0.1 })
  );
  battlement.position.y = 0.9;
  battlement.castShadow = true;
  const hpBack = new Mesh(
    new BoxGeometry(laneW * 0.7, 0.08, 0.06),
    new MeshStandardMaterial({ color: 0x14080c, roughness: 0.8 })
  );
  hpBack.position.set(0, 1.12, 0.4);
  const hpFill = new Mesh(
    new BoxGeometry(laneW * 0.7, 0.08, 0.08),
    new MeshStandardMaterial({ color: 0x3dffb0, emissive: 0x146644, roughness: 0.4 })
  );
  hpFill.position.set(0, 1.12, 0.42);
  base.add(fort, battlement, hpBack, hpFill);
  scene.add(base);
  const baseLabel = makeSprite();
  scene.add(baseLabel);

  const shield = new Mesh(
    new BoxGeometry(laneW * 0.96, 0.7, 0.08),
    new MeshStandardMaterial({
      color: 0x8af0ff,
      emissive: 0x1a6a88,
      transparent: true,
      opacity: 0.28,
      roughness: 0.15,
      metalness: 0,
      depthWrite: false,
    })
  );
  shield.visible = false;
  shield.renderOrder = 2;
  scene.add(shield);

  const jellyUniforms = { uTime: { value: 0 }, uWobble: { value: 1 } };
  const jellyMat = new MeshPhongMaterial({
    color: 0xffffff,
    shininess: 64,
    specular: 0xb9dcff,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    emissive: 0x102033,
    emissiveIntensity: 0.28,
  });
  jellyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = jellyUniforms.uTime;
    shader.uniforms.uWobble = jellyUniforms.uWobble;
    shader.vertexShader =
      "attribute float aPhase;\nattribute float aSquash;\nattribute float aStretch;\nuniform float uTime;\nuniform float uWobble;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float wob = sin(uTime * 5.0 + aPhase + transformed.y * 3.2) * 0.12 * uWobble;
        float wob2 = sin(uTime * 2.7 + aPhase * 1.4) * 0.07 * uWobble;
        float sx = 1.0 + aStretch + wob;
        float sy = 1.0 - aSquash * 0.45 - aStretch * 0.34 + wob2;
        float sz = 1.0 + sin(uTime * 4.1 + aPhase * 0.8) * 0.1 * uWobble - wob * 0.4;
        transformed.x *= sx;
        transformed.y *= max(0.35, sy);
        transformed.z *= sz;`
      );
  };
  jellyMat.customProgramCacheKey = () => "jelly-v1";

  const phaseArray = new Float32Array(MAX_RUNNERS);
  const squashArray = new Float32Array(MAX_RUNNERS);
  const stretchArray = new Float32Array(MAX_RUNNERS);
  let blobDetail = -1;
  let blobs = null;

  function mountBlobs(detail, disposeOld = true) {
    if (blobs) {
      scene.remove(blobs);
      if (disposeOld) blobs.geometry.dispose();
      blobs = null;
    }
    const geo = new IcosahedronGeometry(1, detail);
    geo.setAttribute("aPhase", new InstancedBufferAttribute(phaseArray, 1));
    geo.setAttribute("aSquash", new InstancedBufferAttribute(squashArray, 1));
    geo.setAttribute("aStretch", new InstancedBufferAttribute(stretchArray, 1));
    blobs = new InstancedMesh(geo, jellyMat, MAX_RUNNERS);
    blobs.instanceMatrix.setUsage(35048);
    blobs.count = 0;
    blobs.frustumCulled = false;
    blobs.castShadow = false;
    blobs.receiveShadow = false;
    blobs.renderOrder = 3;
    scene.add(blobs);
    blobDetail = detail;
  }
  mountBlobs(1);

  const disc = softDisc();
  const shadowMat = new MeshBasicMaterial({
    map: disc,
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const shadowGeo = new CircleGeometry(1, 8);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadows = new InstancedMesh(shadowGeo, shadowMat, MAX_RUNNERS);
  shadows.count = 0;
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;
  scene.add(shadows);

  const splatMat = new MeshBasicMaterial({
    map: disc,
    color: 0xffffff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const splats = new InstancedMesh(shadowGeo, splatMat, 40);
  splats.count = 0;
  splats.frustumCulled = false;
  splats.renderOrder = 2;
  scene.add(splats);

  const speckMat = new MeshBasicMaterial({ color: 0xffffff });
  const specks = new InstancedMesh(new IcosahedronGeometry(1, 0), speckMat, MAX_PARTICLES);
  specks.count = 0;
  specks.frustumCulled = false;
  specks.renderOrder = 4;
  scene.add(specks);

  const gatePool = [];
  const gateMatGood = new MeshStandardMaterial({
    color: 0x18324a,
    emissive: 0x14586a,
    roughness: 0.35,
    metalness: 0.25,
  });
  const gateMatBad = new MeshStandardMaterial({
    color: 0x3a1822,
    emissive: 0x6a1830,
    roughness: 0.4,
    metalness: 0.15,
  });
  function makeGate() {
    const group = new Group();
    const good = gateMatGood.clone();
    const bad = gateMatBad.clone();
    const postGeo = new BoxGeometry(0.1, 0.78, 0.1);
    const left = new Mesh(postGeo, good);
    const right = new Mesh(postGeo, good);
    const bar = new Mesh(new BoxGeometry(1, 0.12, 0.1), good);
    left.castShadow = right.castShadow = bar.castShadow = true;
    left.position.y = right.position.y = 0.39;
    bar.position.y = 0.78;
    const label = makeSprite();
    label.position.y = 0.95;
    group.add(left, right, bar, label);
    group.visible = false;
    scene.add(group);
    return { group, left, right, bar, label, good, bad, key: "" };
  }
  for (let i = 0; i < MAX_GATES; i++) gatePool.push(makeGate());

  const obsMat = new MeshStandardMaterial({ map: hazardTexture(), roughness: 0.55, metalness: 0.05 });
  const obsPool = [];
  for (let i = 0; i < MAX_OBS; i++) {
    const mesh = new Mesh(new BoxGeometry(1, 0.42, 0.28), obsMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    obsPool.push(mesh);
  }

  const cardPool = [];
  function makeCard() {
    const group = new Group();
    const slab = new Mesh(
      new BoxGeometry(1.15, 0.72, 0.07),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.08, emissive: 0x111111 })
    );
    slab.castShadow = true;
    const face = new Mesh(
      new PlaneGeometry(1.05, 0.62),
      new MeshBasicMaterial({ transparent: true, depthWrite: false })
    );
    face.position.z = 0.05;
    group.add(slab, face);
    group.visible = false;
    scene.add(group);
    return { group, slab, face, kind: "" };
  }
  for (let i = 0; i < MAX_CARDS; i++) cardPool.push(makeCard());

  const floaters = [];
  function makeSprite() {
    const mat = new SpriteMaterial({ transparent: true, depthWrite: false });
    const sprite = new Sprite(mat);
    sprite.visible = false;
    sprite.renderOrder = 6;
    return sprite;
  }
  for (let i = 0; i < MAX_FLOATS; i++) {
    const s = makeSprite();
    scene.add(s);
    floaters.push(s);
  }
  const powerL = makeSprite();
  const powerR = makeSprite();
  const banner = makeSprite();
  scene.add(powerL, powerR, banner);

  let cssW = 1;
  let cssH = 1;
  let applied = "high";
  let pixelRatio = 1;

  function targetRatio(lite) {
    if (mobile || lite) return 1;
    return Math.min(1.5, window.devicePixelRatio || 1);
  }

  let bufferW = 0;
  let bufferH = 0;

  function applyQuality(mode) {
    applied = mode;
    const lite = mode === "lite";
    const detail = lite || mobile ? 0 : 1;
    if (detail !== blobDetail) mountBlobs(detail);
    renderer.shadowMap.enabled = !lite;
    sun.castShadow = !lite;
    ground.receiveShadow = !lite;
    track.receiveShadow = !lite;
    const nextRatio = targetRatio(lite);
    if (nextRatio !== pixelRatio) {
      pixelRatio = nextRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(cssW, cssH, false);
      bufferW = cssW;
      bufferH = cssH;
    }
  }

  function resize(w, h) {
    const nextW = Math.max(1, Math.round(w));
    const nextH = Math.max(1, Math.round(h));
    const ratio = targetRatio(applied === "lite");
    const same =
      bufferW > 0 &&
      Math.abs(nextW - cssW) < 8 &&
      Math.abs(nextH - cssH) < 8 &&
      ratio === pixelRatio;
    cssW = nextW;
    cssH = nextH;
    const aspect = cssW / cssH;
    camera.aspect = aspect;
    const portrait = aspect < 0.85;
    camera.fov = portrait ? 52 : 40;
    camBase.y = portrait ? 5.35 : 4.15;
    camBase.z = portrait ? 3.35 : 2.55;
    camBase.lookZ = portrait ? -6.2 : -6.8;
    camera.updateProjectionMatrix();
    if (same) return;
    applyQuality(applied);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssW, cssH, false);
    bufferW = cssW;
    bufferH = cssH;
  }

  function placeCamera(state) {
    const s = (state.shake || 0) * 0.014;
    const ox = Math.sin(state.time * 33) * s;
    const oy = Math.cos(state.time * 27) * s * 0.6;
    camera.position.set(ox, camBase.y + oy, camBase.z);
    look.set(ox * 0.25, 0.18, camBase.lookZ);
    camera.lookAt(look);
    camera.up.set(0, 1, 0);
  }

  function drawBlobs(state) {
    const layout = state.layout;
    const runners = state.runners;
    const freeze = state.freezeT > 0;
    let n = 0;
    for (let i = 0; i < MAX_RUNNERS; i++) {
      const r = runners[i];
      if (!r.alive) continue;
      const p = world(r.x, r.y, layout);
      const radius = Math.max(0.08, r.r * S * BLOB_SCALE);
      const stretch = Math.min(0.62, Math.abs(r.vy) / 380);
      dummy.position.set(p.x, radius, p.z);
      dummy.scale.setScalar(radius);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      blobs.setMatrixAt(n, dummy.matrix);
      shadows.setMatrixAt(n, shadowMatrix(p.x, p.z, radius * 1.45));
      phaseArray[n] = r.phase || 0;
      squashArray[n] = r.squash || 0;
      stretchArray[n] = stretch;
      if (r.team === 1) {
        tmpColor.copy(freeze ? ICE : RED);
        if (!freeze && r.hp > 1) tmpColor.lerp(RED_DIM, 0.25);
      } else if (r.giant) {
        tmpColor.copy(GOLD);
      } else if (r.bomb) {
        tmpColor.copy(BOMB);
      } else if (r.maxHp >= 6) {
        tmpColor.copy(PIERCE);
      } else {
        tmpColor.copy(BLUE).lerp(BLUE_HOT, 0.5 + 0.5 * Math.sin(r.phase || 0));
      }
      blobs.setColorAt(n, tmpColor);
      n += 1;
    }
    blobs.count = n;
    shadows.count = n;
    blobs.instanceMatrix.needsUpdate = true;
    if (blobs.instanceColor) blobs.instanceColor.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    const geo = blobs.geometry;
    geo.getAttribute("aPhase").needsUpdate = true;
    geo.getAttribute("aSquash").needsUpdate = true;
    geo.getAttribute("aStretch").needsUpdate = true;
  }

  function shadowMatrix(x, z, radius) {
    dummy.position.set(x, 0.03, z);
    dummy.scale.set(radius, 1, radius * 0.72);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    return dummy.matrix;
  }

  function drawSplats(state) {
    const layout = state.layout;
    let n = 0;
    const list = state.splats;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.alive) continue;
      const p = world(s.x, s.y, layout);
      const k = s.age / s.life;
      const radius = s.r * S * BLOB_SCALE * (1.1 + k * 2.4);
      splats.setMatrixAt(n, shadowMatrix(p.x, p.z, radius));
      tmpColor.set(s.team === 0 ? "#7ec8ff" : "#ff6d88");
      splats.setColorAt(n, tmpColor);
      n += 1;
    }
    splats.count = n;
    splats.instanceMatrix.needsUpdate = true;
    if (splats.instanceColor) splats.instanceColor.needsUpdate = true;
    splatMat.opacity = 0.55;
  }

  function drawSpecks(state) {
    const layout = state.layout;
    const lite = state.quality === "lite";
    let n = 0;
    const list = state.particles;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      if (lite && (i & 1)) continue;
      const w = world(p.x, p.y, layout);
      const lift = 0.15 + (1 - p.life / p.max) * 0.35;
      dummy.position.set(w.x, lift, w.z);
      const sc = Math.max(0.03, p.r * S * 1.4) * (p.life / p.max);
      dummy.scale.setScalar(sc);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      specks.setMatrixAt(n, dummy.matrix);
      specks.setColorAt(n, tmpColor.set(p.color));
      n += 1;
    }
    specks.count = n;
    specks.instanceMatrix.needsUpdate = true;
    if (specks.instanceColor) specks.instanceColor.needsUpdate = true;
  }

  function drawGates(state) {
    const layout = state.layout;
    const gates = state.gates;
    for (let i = 0; i < gatePool.length; i++) {
      const slot = gatePool[i];
      const g = gates[i];
      if (!g) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      const p = world(g.x + g.w * 0.5, g.y + g.h * 0.5, layout);
      const width = Math.max(0.7, g.w * S);
      slot.group.position.set(p.x, 0, p.z);
      slot.left.position.x = -width * 0.5;
      slot.right.position.x = width * 0.5;
      slot.bar.scale.x = width;
      slot.bar.position.x = 0;
      const bad = g.kind === "sub" || g.kind === "div";
      const mat = bad ? slot.bad : slot.good;
      slot.left.material = slot.right.material = slot.bar.material = mat;
      const flash = g.flash || 0;
      mat.emissiveIntensity = 0.55 + flash * 0.8;
      const key = `${g.label}|${bad ? "b" : "g"}`;
      if (slot.key !== key) {
        paintLabel(liveMap(slot.label.material, 256, 96), g.label, bad ? "#ffd0dc" : "#e9fff4");
        slot.key = key;
      }
      slot.label.position.set(0, 1.02, 0);
      slot.label.scale.set(width * 0.95, 0.36, 1);
    }
  }

  function drawObstacles(state) {
    const layout = state.layout;
    for (let i = 0; i < obsPool.length; i++) {
      const mesh = obsPool[i];
      const o = state.obstacles[i];
      if (!o) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      const p = world(o.x + o.w * 0.5, o.y + o.h * 0.5, layout);
      mesh.position.set(p.x, 0.22, p.z);
      mesh.scale.set(Math.max(0.3, o.w * S), 1, 1);
    }
  }

  function drawCards(state) {
    const layout = state.layout;
    for (let i = 0; i < cardPool.length; i++) {
      const slot = cardPool[i];
      const c = state.cards[i];
      if (!c) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      const p = world(c.x, c.y, layout);
      const near = Math.abs(state.cannonX - c.x) < 42;
      slot.group.position.set(p.x, 0.62 + (near ? 0.1 : 0), p.z);
      slot.group.rotation.x = -0.62;
      slot.group.scale.setScalar(1.18);
      if (slot.kind !== c.kind) {
        const info = BUFFS[c.kind];
        slot.slab.material.color.set(info.color);
        slot.slab.material.emissive.set(info.color);
        paintCard(liveMap(slot.face.material, 256, 160), c.kind);
        slot.kind = c.kind;
      }
      slot.slab.material.emissiveIntensity = near ? 0.55 : 0.18;
    }
  }

  function drawActors(state) {
    const layout = state.layout;
    const c = world(state.cannonX, state.cannonY, layout);
    const recoil = (state.recoil || 0) * 0.012;
    cannon.position.set(c.x, 0, c.z + recoil);
    const ready = state.chargeReady;
    barrel.material.emissive.set(ready ? 0xffc14a : 0x123a88);
    barrel.material.emissiveIntensity = ready ? 1.1 : 0.45;
    body.material.color.set(ready ? 0xffd36a : 0x1d6dff);
    const charge = state.charge / 100;
    for (let i = 0; i < pips.length; i++) {
      const on = charge >= (i + 0.15) / pips.length || ready;
      pips[i].material.emissive.set(on ? 0xffd36a : 0x000000);
      pips[i].material.color.set(on ? 0xffe7a0 : 0x243044);
      pips[i].material.emissiveIntensity = on ? 0.9 : 0;
    }
    muzzle.material.opacity = state.muzzle || 0;
    muzzle.scale.setScalar(0.6 + (state.muzzle || 0) * 1.4);

    const b = world(VIEW_W * 0.5, layout.baseY + layout.baseH * 0.5, layout);
    base.position.set(0, 0, b.z);
    const hp = state.base.max > 0 ? Math.max(0, state.base.hp / state.base.max) : 0;
    hpFill.scale.x = Math.max(0.02, hp);
    hpFill.position.x = -((laneW * 0.7) * 0.5) * (1 - hp);
    tmpColor.setRGB(1 - hp * 0.7, 0.35 + hp * 0.65, 0.35);
    hpFill.material.color.copy(tmpColor);
    fort.material.emissiveIntensity = 0.35 + (state.baseFlash || 0) * 0.9;
    const hpText = `${Math.ceil(state.base.hp)}`;
    if (baseLabel.userData.key !== hpText) {
      paintLabel(liveMap(baseLabel.material, 256, 80), hpText, "#ffe1c4");
      baseLabel.userData.key = hpText;
    }
    baseLabel.visible = state.phase !== "menu";
    baseLabel.position.set(0, 1.45, b.z);
    baseLabel.scale.set(1.3, 0.42, 1);

    const showShield = state.shieldT > 0 && state.shieldHp > 0;
    shield.visible = showShield;
    if (showShield) {
      const s = world(state.cannonX, state.loseY - 18, layout);
      shield.position.set(0, 0.4, s.z);
      shield.material.opacity = 0.18 + 0.2 * Math.min(1, state.shieldHp / 30);
    }
  }

  function showSprite(sprite, text, color, x, y, z, sx, sy, opacity) {
    const key = `${text}|${color}`;
    if (sprite.userData.key !== key) {
      paintLabel(liveMap(sprite.material, 256, 96), text, color);
      sprite.userData.key = key;
    }
    sprite.visible = true;
    sprite.position.set(x, y, z);
    sprite.scale.set(sx, sy, 1);
    sprite.material.opacity = opacity;
  }

  function drawLabels(state) {
    const layout = state.layout;
    let used = 0;
    const list = state.floaters;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (!f.alive) continue;
      if (used >= floaters.length) break;
      const p = world(f.x, f.y, layout);
      const sprite = floaters[used++];
      showSprite(sprite, f.text, f.color, p.x, 1.05, p.z, 2.3, 0.78, Math.max(0, f.life / f.max));
    }
    for (let i = used; i < floaters.length; i++) floaters[i].visible = false;

    if (state.playerPower > 0) {
      const p = world(state.cen0x, state.cen0y, layout);
      showSprite(powerL, String(state.playerPower), "#d8f1ff", p.x, 0.72, p.z, 0.7, 0.32, 0.95);
    } else powerL.visible = false;
    if (state.enemyPower > 0) {
      const p = world(state.cen1x, state.cen1y, layout);
      showSprite(powerR, String(state.enemyPower), "#ffd5de", p.x, 0.72, p.z, 0.7, 0.32, 0.95);
    } else powerR.visible = false;

    let bannerText = "";
    if (state.phase === "clear") bannerText = "CLEARED";
    else if (state.introT > 0.05 && state.phase === "play") bannerText = `LEVEL ${state.level}`;
    if (bannerText) {
      const p = world(VIEW_W * 0.5, layout.viewH * 0.42, layout);
      showSprite(banner, bannerText, "#f4f7ff", p.x, 1.3, p.z, 2.4, 0.7, state.phase === "clear" ? 1 : state.introT);
    } else banner.visible = false;
  }

  function forgetSprite(sprite) {
    sprite.userData.key = "";
    sprite.visible = false;
    if (sprite.material.map && sprite.material.map.userData.live) {
      sprite.material.map = null;
      sprite.material.needsUpdate = true;
    }
  }

  function releaseLevel(options) {
    const disposeGpu = !options || options.disposeGpu !== false;
    forgetSprite(baseLabel);
    forgetSprite(powerL);
    forgetSprite(powerR);
    forgetSprite(banner);
    for (let i = 0; i < floaters.length; i++) forgetSprite(floaters[i]);
    for (let i = 0; i < gatePool.length; i++) {
      forgetSprite(gatePool[i].label);
      gatePool[i].key = "";
    }
    for (let i = 0; i < cardPool.length; i++) {
      const face = cardPool[i].face.material;
      cardPool[i].kind = "";
      if (face.map && face.map.userData.live) {
        face.map = null;
        face.needsUpdate = true;
      }
    }
    if (disposeGpu) {
      while (liveTextures.length) dropTexture(liveTextures[0]);
      sun.shadow.dispose();
    } else {
      liveTextures.length = 0;
    }
    sun.shadow.map = null;
    sun.shadow.mapPass = null;
    sun.shadow.needsUpdate = true;
    shadows.count = 0;
    splats.count = 0;
    specks.count = 0;
    mountBlobs(mobile || applied === "lite" ? 0 : 1, disposeGpu);
    if (disposeGpu) renderer.renderLists.dispose();
  }

  function draw(state) {
    const gl = renderer.getContext();
    if (!gl || gl.isContextLost()) return;
    if (state.quality !== applied) applyQuality(state.quality);
    jellyUniforms.uTime.value = state.time || 0;
    jellyUniforms.uWobble.value = state.reduced ? 0.25 : 1;
    placeCamera(state);
    drawBlobs(state);
    drawSplats(state);
    drawSpecks(state);
    drawGates(state);
    drawObstacles(state);
    drawCards(state);
    drawActors(state);
    drawLabels(state);
    renderer.render(scene, camera);
  }

  applyQuality("high");
  resize(canvas.clientWidth || 400, canvas.clientHeight || 780);

  const loseExt = renderer.getContext().getExtension("WEBGL_lose_context");

  function isLost() {
    const gl = renderer.getContext();
    return !gl || gl.isContextLost();
  }

  function recover() {
    if (!isLost()) return;
    try {
      loseExt?.restoreContext();
    } catch {
      /* the browser restores the context on its own */
    }
  }

  return {
    resize,
    draw,
    releaseLevel,
    recover,
    isLost,
    liveTextureCount: () => liveTextures.length,
    renderer,
  };
}
