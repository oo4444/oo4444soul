import * as THREE from 'three';

/* ============================================================
   L'ANNEAU BRISÉ — un hommage à Elden Ring en Three.js
   Tout est procédural : meshes, ambiance, sons. Aucun asset.
   ============================================================ */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function lerpAngle(a, b, t) {
  return a + angleDiff(b, a) * clamp(t, 0, 1);
}

/* ---------------- audio procédural ---------------- */
const Sound = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* pas d'audio */ }
  },
  noiseBuffer() {
    if (this._nb) return this._nb;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._nb = buf;
    return buf;
  },
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  },
  noise(dur, vol, freq, q) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + dur);
  },
  swing() { this.noise(0.18, 0.28, 900, 0.8); },
  hit() { this.noise(0.12, 0.5, 220, 1.2); this.tone(90, 0.15, 'square', 0.18, 50); },
  hurt() { this.tone(180, 0.3, 'sawtooth', 0.22, 70); },
  roll() { this.noise(0.25, 0.12, 400, 0.5); },
  heal() { this.tone(520, 0.5, 'sine', 0.16, 780); },
  death() { this.tone(110, 1.6, 'sine', 0.25, 45); this.noise(1.2, 0.1, 160, 0.4); },
  bonfire() { this.tone(340, 0.9, 'sine', 0.14, 510); this.tone(510, 0.9, 'sine', 0.1, 680); },
  bossRoar() { this.tone(70, 1.4, 'sawtooth', 0.3, 40); this.noise(1.0, 0.25, 130, 0.6); },
  pickup() { this.tone(880, 0.18, 'sine', 0.12, 1180); },
};

/* ---------------- rendu de base ---------------- */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1017);
scene.fog = new THREE.FogExp2(0x0d1017, 0.0125);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* lumières — clair de lune froide contre halo doré de l'Arbre-Monde */
scene.add(new THREE.HemisphereLight(0x33415e, 0x0a0a10, 0.55));
const moon = new THREE.DirectionalLight(0x8fa3c8, 0.85);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
moon.shadow.camera.top = 60; moon.shadow.camera.bottom = -60;
moon.shadow.camera.far = 300;
moon.shadow.bias = -0.0004;
scene.add(moon, moon.target);

/* ---------------- textures utilitaires ---------------- */
function glowTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, rgb.replace('0.9)', '1)'));
  grd.addColorStop(0.4, rgb);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function particleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,230,150,1)');
  grd.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/* ---------------- le monde ---------------- */
const WORLD_RADIUS = 290;
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts });

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTerrain() {
  const seg = 110;
  const geo = new THREE.PlaneGeometry(680, 680, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cA = new THREE.Color(0x2c3624);
  const cB = new THREE.Color(0x1c2318);
  const cC = new THREE.Color(0x3a3a2e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    let h = 0;
    h += Math.sin(x * 0.02) * Math.cos(z * 0.03) * 1.1;
    h += Math.sin(x * 0.11 + 2) * Math.sin(z * 0.09 + 1) * 0.35;
    h *= clamp((d - 14) / 40, 0, 1);
    pos.setY(i, h);
    const t = 0.5 + 0.5 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
    const col = cB.clone().lerp(cA, t).lerp(cC, clamp((d - 90) / 160, 0, 1) * 0.6);
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildErdtree() {
  const tree = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a1e, emissive: 0xb98f1f, emissiveIntensity: 0.35, roughness: 0.6, fog: false });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, emissive: 0xe6b422, emissiveIntensity: 1.3, roughness: 0.4, fog: false });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(7, 13, 120, 10), trunkMat);
  trunk.position.y = 60;
  tree.add(trunk);
  for (const [x, y, z, r] of [[0, 130, 0, 42], [-16, 112, 10, 24], [18, 116, -8, 26], [4, 100, 20, 20]]) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), leafMat);
    crown.position.set(x, y, z);
    tree.add(crown);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(230,180,34,0.9)'), blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, transparent: true,
  }));
  glow.scale.set(260, 260, 1);
  glow.position.y = 105;
  tree.add(glow);
  const light = new THREE.PointLight(0xe6b422, 900, 400, 1.6);
  light.position.y = 100;
  tree.add(light);
  tree.position.set(-200, 0, -260);
  scene.add(tree);
}

function pillar(h, r, broken) {
  const g = new THREE.Group();
  const stone = mat(0x4a463d, { roughness: 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.4, h * 0.14, 8), stone);
  base.position.y = h * 0.07;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h * 0.86, 8), stone);
  shaft.position.y = h * 0.55;
  g.add(base, shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, h * 0.1, r * 2.6), stone);
    cap.position.y = h * 1.0;
    g.add(cap);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildRuins() {
  const rng = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU;
    const d = 55 + rng() * 200;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x, z + 70) < 40 || Math.hypot(x, z - 18) < 12) continue;
    const broken = rng() > 0.55;
    const p = pillar(rand(3.5, 7), rand(0.4, 0.7), broken);
    p.position.set(x, 0.5, z);
    p.rotation.y = rng() * TAU;
    p.rotation.z = (rng() - 0.5) * (broken ? 0.22 : 0.03);
    scene.add(p);
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU, d = 20 + rng() * 240;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const grave = new THREE.Mesh(new THREE.BoxGeometry(rand(0.5, 0.9), rand(0.8, 1.6), 0.16), mat(0x3c3a33));
    grave.position.set(x, 0.4, z);
    grave.rotation.y = rng() * TAU;
    grave.rotation.z = (rng() - 0.5) * 0.3;
    grave.castShadow = true;
    scene.add(grave);
  }
  for (let i = 0; i < 30; i++) {
    const a = rng() * TAU, d = rng() * 260;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 1.6), 0), mat(0x33352f));
    rock.position.set(Math.cos(a) * d, rand(0, 0.6), Math.sin(a) * d);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = true;
    scene.add(rock);
  }
}

/* arène du boss — cercle de piliers au nord, avec quatre brèches */
const BOSS_POS = new THREE.Vector3(0, 0, -70);
function buildBossArena() {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]];
    let isGap = false;
    for (const [gx, gz] of dirs) if (Math.cos(a) * gx + Math.sin(a) * gz > 0.8) isGap = true;
    if (isGap) continue;
    const p = pillar(rand(6, 9), 0.8, i % 3 === 0);
    p.position.set(BOSS_POS.x + Math.cos(a) * 26, 0.5, BOSS_POS.z + Math.sin(a) * 26);
    scene.add(p);
  }
}

/* feu de camp (point de grâce) */
const BONFIRE_POS = new THREE.Vector3(0, 0, 18);
let bonfireFlame, bonfireLight;
function buildBonfire() {
  const g = new THREE.Group();
  const swordMat = mat(0x5a5a5f, { metalness: 0.8, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.22), swordMat);
    const a = (i / 3) * TAU;
    s.position.set(Math.cos(a) * 0.16, 0.85, Math.sin(a) * 0.16);
    s.rotation.set(Math.cos(a) * 0.35, 0, Math.sin(a) * -0.35 + Math.PI * (i === 0 ? 0 : 0));
    if (i === 0) s.rotation.z += 0.4;
    s.castShadow = true;
    g.add(s);
  }
  bonfireFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.4, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8c2a, transparent: true, opacity: 0.9 })
  );
  bonfireFlame.position.y = 1.7;
  bonfireLight = new THREE.PointLight(0xff7d1f, 30, 22, 1.8);
  bonfireLight.position.y = 2;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,140,40,0.9)'), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true,
  }));
  glow.scale.set(7, 7, 1);
  glow.position.y = 1.5;
  const embers = new THREE.Points(
    (() => {
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(20 * 3);
      for (let i = 0; i < 20; i++) {
        p[i * 3] = rand(-0.3, 0.3); p[i * 3 + 1] = rand(1.4, 3.2); p[i * 3 + 2] = rand(-0.3, 0.3);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      return geo;
    })(),
    new THREE.PointsMaterial({
      map: particleTexture(), size: 0.16, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffa040,
    })
  );
  g.add(bonfireFlame, bonfireLight, glow, embers);
  g.position.copy(BONFIRE_POS);
  scene.add(g);
}

/* lucioles dorées — la grâce qui flotte sur les terres */
let fireflies;
function buildFireflies() {
  const N = 220;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(N * 3);
  const seeds = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 220;
    positions[i * 3] = Math.cos(a) * d;
    positions[i * 3 + 1] = rand(0.5, 7);
    positions[i * 3 + 2] = Math.sin(a) * d;
    seeds.push(Math.random() * 100);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: particleTexture(), size: 0.55, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd97a,
  }));
  scene.add(pts);
  fireflies = { pts, positions, seeds, N };
}

/* ---------------- humanoïdes ---------------- */
function makeHumanoid({ scale = 1, body = 0x3a3f4a, accent = 0x23262e, weaponLen = 1.0, eyeColor = 0xff4020 }) {
  const g = new THREE.Group();
  const bodyM = mat(body);
  const accentM = mat(accent);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 4, 8), bodyM);
  torso.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), accentM);
  head.position.y = 1.62;
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.2, 8, 1, true), mat(body, { metalness: 0.3 }));
  helm.position.y = 1.65;
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
  eyeL.position.set(-0.07, 1.62, -0.14);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.07;

  const limb = (r, len, m) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len - r * 1.6, 0.1), 3, 6), m);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };
  const armL = limb(0.07, 0.62, bodyM); armL.position.set(-0.33, 1.42, 0);
  const armR = limb(0.07, 0.62, bodyM); armR.position.set(0.33, 1.42, 0);
  const legL = limb(0.09, 0.82, accentM); legL.position.set(-0.13, 0.86, 0);
  const legR = limb(0.09, 0.82, accentM); legR.position.set(0.13, 0.86, 0);

  const bladeM = mat(0x8f939c, { metalness: 0.85, roughness: 0.35 });
  const weaponGroup = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, weaponLen, 0.12), bladeM);
  blade.position.y = weaponLen / 2 + 0.08;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.16), accentM);
  weaponGroup.add(blade, guard);
  weaponGroup.position.y = -0.62;
  weaponGroup.rotation.x = 0.3;
  armR.add(weaponGroup);

  g.add(torso, head, helm, eyeL, eyeR, armL, armR, legL, legR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(scale);
  return { group: g, torso, head, armL, armR, legL, legR, weaponGroup };
}

/* ---------------- état global ---------------- */
const game = { state: 'loading', time: 0, shake: 0, hitstop: 0 };

const player = {
  rig: null, pos: new THREE.Vector3(0, 0, 26), yaw: Math.PI,
  hp: 300, maxHp: 300, st: 130, maxSt: 130,
  estus: 3, maxEstus: 3, runes: 0,
  state: 'idle', t: 0, combo: 0, iframe: 0, stDelay: 0,
  runInput: false, moveDir: new THREE.Vector2(), walkPhase: 0,
};

const enemies = [];
const runeDrops = [];
const shockwaves = [];
const bursts = [];
let boss = null, bossEngaged = false, bossDefeated = false;
let lockTarget = null;

/* ---------------- ennemis ---------------- */
function spawnSoldier(x, z, yaw) {
  const rig = makeHumanoid({
    scale: 1.05, body: 0x4a3f33, accent: 0x2a241c, weaponLen: 0.95, eyeColor: 0xff5020,
  });
  scene.add(rig.group);
  const e = {
    rig, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), yaw,
    hp: 140, maxHp: 140, state: 'guard', t: rand(0, 2),
    speed: 3.6, dmg: 38, atkRange: 1.9, atkWindup: 0.55,
    aggro: 13, runeValue: 120, isBoss: false, hitDone: false, walkPhase: rand(0, 9),
  };
  rig.group.position.set(x, 0, z);
  enemies.push(e);
  return e;
}

function spawnBoss() {
  const rig = makeHumanoid({
    scale: 2.7, body: 0x3d2f3f, accent: 0x1f1722, weaponLen: 1.6, eyeColor: 0xff2020,
  });
  rig.group.position.copy(BOSS_POS);
  scene.add(rig.group);
  boss = {
    rig, pos: BOSS_POS.clone(), home: BOSS_POS.clone(), yaw: 0,
    hp: 900, maxHp: 900, state: 'guard', t: 0,
    speed: 4.4, dmg: 62, atkRange: 4.6,
    aggro: 22, runeValue: 5000, isBoss: true, hitDone: false, walkPhase: 0,
    moveName: 'slam',
  };
  enemies.push(boss);
  return boss;
}

function spawnShockwave(pos) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 1.15, 40),
    new THREE.MeshBasicMaterial({ color: 0xffa02a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(pos).setY(0.25);
  scene.add(ring);
  shockwaves.push({ ring, progress: 0, hit: false });
}
function clearShockwaves() {
  while (shockwaves.length) scene.remove(shockwaves.pop().ring);
}

/* ---------------- actions du joueur ---------------- */
function tryRoll() {
  const p = player;
  if (p.state !== 'idle' && p.state !== 'move') return;
  if (p.st < 22) return;
  p.st -= 22; p.stDelay = 0.6;
  p.state = 'roll'; p.t = 0; p.iframe = 0.28;
  p.moveDir.copy(p.moveDir.lengthSq() > 0.01
    ? p.moveDir.clone().normalize()
    : new THREE.Vector2(-Math.sin(p.yaw), -Math.cos(p.yaw)));
  Sound.roll();
}
function tryEstus() {
  const p = player;
  if ((p.state !== 'idle' && p.state !== 'move') || p.estus <= 0 || p.hp >= p.maxHp) return;
  p.estus--;
  p.hp = clamp(p.hp + p.maxHp * 0.62, 0, p.maxHp);
  p.state = 'drink'; p.t = 0;
  flash('heal-flash', 0.3);
  Sound.heal();
  updateHud();
}
function tryInteract() {
  if (player.pos.distanceTo(BONFIRE_POS) < 3.2) restAtBonfire();
}
function toggleLock() {
  if (lockTarget) { lockTarget = null; return; }
  let best = null, bestD = 24;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const d = e.pos.distanceTo(player.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  lockTarget = best;
}

/* ---------------- combat ---------------- */
function doPlayerHit() {
  const range = 2.6, arc = 1.15, dmg = 62;
  let hitAny = false;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const to = e.pos.clone().sub(player.pos); to.y = 0;
    const d = to.length();
    if (d > range + (e.isBoss ? 1.4 : 0)) continue;
    const ang = Math.abs(angleDiff(Math.atan2(to.x, to.z), player.yaw));
    if (ang > arc) continue;
    e.hp = Math.max(0, e.hp - dmg);
    hitAny = true;
    burstBlood(e.pos.clone().setY(e.isBoss ? 2.8 : 1.2));
    if (!e.isBoss) {
      e.state = 'stagger'; e.t = 0;
      e.pos.add(to.normalize().multiplyScalar(1.4));
    } else if (e.state === 'guard' || e.state === 'chase') {
      e.state = 'stagger'; e.t = 0;
    }
    if (e.hp <= 0) killEnemy(e);
  }
  if (hitAny) { Sound.hit(); game.hitstop = 0.07; game.shake = Math.max(game.shake, 0.25); }
  else Sound.swing();
}

function killEnemy(e) {
  e.state = 'dead'; e.t = 0;
  dropRunes(e.pos, e.runeValue);
  if (lockTarget === e) lockTarget = null;
  if (e.isBoss) {
    bossDefeated = true;
    bossEngaged = false;
    document.getElementById('boss-bar').classList.add('hidden');
    showScreen('victory-screen', 6000);
    subtitle("L'Anneau est restauré — les Terres Intermédiaires respirent à nouveau.", 7000);
  } else {
    const toast = document.getElementById('kill-toast');
    toast.classList.remove('hidden');
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = 'killfade 2.4s ease forwards';
    setTimeout(() => toast.classList.add('hidden'), 2400);
  }
}

function hurtPlayer(dmg, fromPos) {
  const p = player;
  if (p.iframe > 0 || p.state === 'dead') return;
  p.hp -= dmg;
  p.state = 'hurt'; p.t = 0;
  flash('damage-flash', 0.55);
  game.shake = Math.max(game.shake, 0.4);
  Sound.hurt();
  const kb = p.pos.clone().sub(fromPos).setY(0).normalize().multiplyScalar(1.2);
  p.pos.add(kb);
  if (p.hp <= 0) {
    p.hp = 0;
    p.state = 'dead'; p.t = 0;
    Sound.death();
    setTimeout(() => {
      showScreen('death-screen', 3200);
      dropRunes(p.pos, p.runes);
      p.runes = 0;
      setTimeout(respawn, 2600);
    }, 700);
  }
  updateHud();
}

function dropRunes(pos, amount) {
  if (amount <= 0) return;
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({ color: 0xe6c14a, emissive: 0xc9992a, emissiveIntensity: 1.4, roughness: 0.3 })
  );
  m.position.copy(pos).setY(0.6);
  scene.add(m);
  runeDrops.push({ mesh: m, amount, phase: Math.random() * 6 });
}

function respawnAllEnemies() {
  for (const e of enemies) {
    if (e.isBoss && bossDefeated) continue;
    e.hp = e.maxHp;
    e.state = 'guard';
    e.t = rand(0, 2);
    e.pos.copy(e.home);
    e.rig.group.position.copy(e.home);
    e.rig.group.rotation.set(0, e.yaw, 0);
  }
  bossEngaged = false;
  document.getElementById('boss-bar').classList.add('hidden');
  clearShockwaves();
}

function respawn() {
  player.pos.copy(BONFIRE_POS).add(new THREE.Vector3(3, 0, 2));
  player.hp = player.maxHp;
  player.st = player.maxSt;
  player.estus = player.maxEstus;
  player.state = 'idle';
  player.iframe = 0;
  lockTarget = null;
  respawnAllEnemies();
  subtitle('Tu te réveilles près de la grâce perdue.', 4200);
  updateHud();
}

function restAtBonfire() {
  const p = player;
  p.hp = p.maxHp;
  p.estus = p.maxEstus;
  p.st = p.maxSt;
  Sound.bonfire();
  flash('heal-flash', 0.4);
  respawnAllEnemies();
  subtitle('La grâce est restaurée. Les ennemis se relèvent.', 4200);
  updateHud();
}

/* ---------------- animations ---------------- */
function animateHumanoid(rig, state, who, t, dt, running) {
  const { group, armL, armR, legL, legR, torso, weaponGroup } = rig;
  who.walkPhase = (who.walkPhase || 0) + dt * (running ? 11 : 7);
  const w = who.walkPhase;

  let armLx = 0, armRx = 0, legSwing = 0, bob = 0, torsoYaw = 0, rollRot = 0, weaponX = 0.3;

  if (state === 'move') {
    legSwing = Math.sin(w) * 0.55;
    armLx = Math.sin(w) * 0.4;
    armRx = -Math.sin(w) * 0.45;
    bob = Math.abs(Math.sin(w)) * 0.045;
  } else if (state === 'idle') {
    bob = Math.sin(game.time * 2) * 0.012;
    armRx = 0.12; armLx = -0.12;
  } else if (state === 'guard') {
    bob = Math.sin(game.time * 1.4 + (who.walkPhase || 0)) * 0.02;
    armRx = 0.3; armLx = -0.2;
  } else if (state === 'roll') {
    rollRot = (t / 0.55) * TAU;
    legSwing = 0.9;
    armLx = armRx = -1.2;
  } else if (state === 'attack') {
    if (t < 0.16) {
      const u = t / 0.16;
      armRx = lerp(-0.5, 2.2, u);
      torsoYaw = lerp(0, -0.5, u);
      weaponX = lerp(0.3, -0.4, u);
    } else if (t < 0.3) {
      const u = (t - 0.16) / 0.14;
      armRx = lerp(2.2, -1.25, Math.min(u * 1.3, 1));
      torsoYaw = lerp(-0.5, 0.75, Math.min(u * 1.4, 1));
      if (u < 0.4) weaponX = -0.4;
    } else {
      const u = (t - 0.3) / 0.2;
      armRx = lerp(-1.25, 0.1, u);
      torsoYaw = lerp(0.75, 0, u);
    }
  } else if (state === 'windup') {
    const u = Math.min(t / (who.atkWindup || 0.5), 1);
    armRx = lerp(0, 2.4, u);
    torsoYaw = lerp(0, -0.6, u);
    weaponX = lerp(0.3, -0.6, u);
  } else if (state === 'strike') {
    const u = Math.min(t / 0.22, 1);
    armRx = lerp(2.4, -1.3, Math.min(u * 1.4, 1));
    torsoYaw = lerp(-0.6, 0.8, Math.min(u * 1.5, 1));
  } else if (state === 'recover') {
    const u = Math.min(t / 0.5, 1);
    armRx = lerp(-1.3, 0.1, u);
    torsoYaw = lerp(0.8, 0, u);
  } else if (state === 'stagger') {
    const u = Math.min(t / 0.4, 1);
    armRx = 0.9 * (1 - u); armLx = 0.9 * (1 - u);
    torsoYaw = 0.3 * (1 - u);
  } else if (state === 'drink') {
    armLx = -1.9;
  } else if (state === 'dead') {
    const u = Math.min(t / 0.5, 1);
    rollRot = -u * Math.PI * 0.49;
    legSwing = 0.4 * u;
    armRx = 0.6 * u; armLx = 0.6 * u;
  }

  group.rotation.set(rollRot, group.rotation.y, 0);
  group.position.y = bob;
  armL.rotation.x = lerp(armL.rotation.x, armLx, clamp(18 * dt, 0, 1));
  armR.rotation.x = lerp(armR.rotation.x, armRx, clamp(22 * dt, 0, 1));
  legL.rotation.x = lerp(legL.rotation.x, legSwing, clamp(16 * dt, 0, 1));
  legR.rotation.x = lerp(legR.rotation.x, -legSwing, clamp(16 * dt, 0, 1));
  torso.rotation.y = lerp(torso.rotation.y, torsoYaw, clamp(20 * dt, 0, 1));
  weaponGroup.rotation.x = lerp(weaponGroup.rotation.x, weaponX, clamp(18 * dt, 0, 1));
}

/* ---------------- mise à jour du joueur ---------------- */
let camYawV = Math.PI, camPitchV = 0.32;
const camDist = 7.2;
let attackQueued = false;

function updatePlayer(dt) {
  const p = player;
  p.t += dt;
  if (p.iframe > 0) p.iframe -= dt;

  const fwd = new THREE.Vector2(Math.sin(camYawV), Math.cos(camYawV));
  const right = new THREE.Vector2(fwd.y, -fwd.x);
  const ix = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const iz = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const want = new THREE.Vector2(0, 0);
  if (p.state !== 'dead') {
    want.addScaledVector(fwd, iz).addScaledVector(right, ix);
    if (want.lengthSq() > 0.01) want.normalize();
  }
  p.runInput = !!keys['ShiftLeft'] && want.lengthSq() > 0.01;

  /* enchaînement : deuxième coup de la combo */
  if (p.state === 'attack' && attackQueued && p.combo === 0 && p.t > 0.24 && p.st >= 18) {
    p.combo = 1; p.hitDone = false; p.t = 0.1; p.st -= 18; attackQueued = false;
  }

  if (p.state === 'idle' || p.state === 'move') {
    if (attackQueued) { attackQueued = false; startAttack(); }
  }

  if (p.state === 'idle' || p.state === 'move') {
    const running = p.runInput && p.st > 0;
    const speed = running ? 9.5 : 5.2;
    if (want.lengthSq() > 0.01) {
      p.moveDir.copy(want);
      p.yaw = lerpAngle(p.yaw, Math.atan2(want.x, want.y), clamp(12 * dt, 0, 1));
      p.pos.x += want.x * speed * dt;
      p.pos.z += want.y * speed * dt;
    }
    if (running && want.lengthSq() > 0.01) {
      p.st = Math.max(0, p.st - 13 * dt); p.stDelay = 0.5;
    }
    p.state = want.lengthSq() > 0.01 ? 'move' : 'idle';
  } else if (p.state === 'roll') {
    const spd = 13 * (1 - p.t / 0.55);
    p.pos.x += p.moveDir.x * spd * dt;
    p.pos.z += p.moveDir.y * spd * dt;
    p.yaw = lerpAngle(p.yaw, Math.atan2(p.moveDir.x, p.moveDir.y), clamp(20 * dt, 0, 1));
    if (p.t > 0.55) { p.state = 'idle'; p.t = 0; }
  } else if (p.state === 'attack') {
    if (!p.hitDone && p.t > 0.16) { p.hitDone = true; doPlayerHit(); }
    if (p.t > 0.5) {
      p.state = 'idle'; p.t = 0;
      if (p.combo === 1) p.combo = 0;
    }
  } else if (p.state === 'hurt') {
    if (p.t > 0.35) { p.state = 'idle'; p.t = 0; }
  } else if (p.state === 'drink') {
    if (p.t > 0.7) { p.state = 'idle'; p.t = 0; }
  }

  p.stDelay -= dt;
  if (p.stDelay <= 0 && p.state !== 'roll') p.st = clamp(p.st + 34 * dt, 0, p.maxSt);

  /* limites du monde + collisions douces */
  const r = Math.hypot(p.pos.x, p.pos.z);
  if (r > WORLD_RADIUS) { p.pos.x *= WORLD_RADIUS / r; p.pos.z *= WORLD_RADIUS / r; }
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const d = p.pos.distanceTo(e.pos);
    const min = e.isBoss ? 3.2 : 1.0;
    if (d < min && d > 0.001) {
      const push = p.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar((min - d) * 0.7);
      p.pos.add(push);
    }
  }

  p.rig.group.position.copy(p.pos);
  p.rig.group.rotation.y = p.yaw;
  animateHumanoid(p.rig, p.state, p, p.t, dt, p.runInput);
  attackQueued = false;
}

function startAttack() {
  const p = player;
  if (p.st < 18) return;
  p.st -= 18; p.stDelay = 0.6;
  p.state = 'attack'; p.t = 0; p.hitDone = false;
}

/* ---------------- mise à jour des ennemis ---------------- */
function updateEnemy(e, dt) {
  const wasDead = e.state === 'dead';
  e.t += dt;
  if (e.state === 'dead') {
    animateHumanoid(e.rig, 'dead', e, e.t, dt, false);
    e.rig.group.position.copy(e.pos);
    e.rig.group.rotation.y = e.yaw;
    return;
  }
  const toPlayer = player.pos.clone().sub(e.pos); toPlayer.y = 0;
  const dist = toPlayer.length();
  const toPlayerAng = Math.atan2(toPlayer.x, toPlayer.z);
  const isBoss = e.isBoss;

  if (isBoss && !bossEngaged && !playerDead() && dist < e.aggro) {
    bossEngaged = true;
    document.getElementById('boss-bar').classList.remove('hidden');
    Sound.bossRoar();
    game.shake = Math.max(game.shake, 0.5);
    subtitle('La Sentinelle Déchue s\'éveille de son trône de pierre.', 4000);
  }

  switch (e.state) {
    case 'guard': {
      if (dist < e.aggro && (!isBoss || bossEngaged)) {
        e.state = 'chase';
        if (!isBoss && Math.random() < 0.4) Sound.roll();
      }
      e.rig.group.rotation.y = e.yaw + Math.sin(game.time * 0.5 + (e.walkPhase || 0)) * 0.3;
      animateHumanoid(e.rig, 'guard', e, e.t, dt, false);
      break;
    }
    case 'chase': {
      if (!isBoss && dist > e.aggro * 2.4 && player.pos.distanceTo(e.home) > e.aggro * 2.6) {
        e.state = 'guard';
        break;
      }
      e.yaw = lerpAngle(e.yaw, toPlayerAng, clamp(6 * dt, 0, 1));
      if (dist > e.atkRange) {
        const sp = e.speed;
        e.pos.x += Math.sin(e.yaw) * sp * dt;
        e.pos.z += Math.cos(e.yaw) * sp * dt;
        animateHumanoid(e.rig, 'move', e, e.t, dt, true);
      } else {
        e.state = 'windup'; e.t = 0; e.hitDone = false;
        if (isBoss) {
          e.moveName = dist > 3.4 ? 'slam' : (Math.random() < 0.5 ? 'sweep' : 'slam');
          if (e.moveName === 'slam' && Math.random() < 0.35) e.moveName = 'sweep';
        }
      }
      break;
    }
    case 'windup': {
      e.yaw = lerpAngle(e.yaw, toPlayerAng, clamp((isBoss ? 2.2 : 2.8) * dt, 0, 1));
      animateHumanoid(e.rig, 'windup', e, e.t, dt, false);
      const windup = isBoss ? (e.moveName === 'slam' ? 0.85 : 0.7) : e.atkWindup;
      if (e.t >= windup) { e.state = 'strike'; e.t = 0; }
      break;
    }
    case 'strike': {
      animateHumanoid(e.rig, 'strike', e, e.t, dt, false);
      if (!e.hitDone && e.t > 0.1) {
        e.hitDone = true;
        const angOK = Math.abs(angleDiff(toPlayerAng, e.yaw)) < (isBoss ? 2.2 : 1.2);
        if (isBoss && e.moveName === 'slam') {
          spawnShockwave(e.pos.clone().add(new THREE.Vector3(Math.sin(e.yaw) * 2.4, 0, Math.cos(e.yaw) * 2.4)));
          game.shake = Math.max(game.shake, 0.5);
          Sound.bossRoar();
        } else {
          if (dist < e.atkRange + 0.9 && angOK) hurtPlayer(e.dmg, e.pos);
        }
        Sound.swing();
      }
      if (e.t > 0.22) { e.state = 'recover'; e.t = 0; }
      break;
    }
    case 'recover': {
      animateHumanoid(e.rig, 'recover', e, e.t, dt, false);
      if (e.t > (isBoss ? 0.85 : 0.55)) { e.state = 'chase'; e.t = 0; }
      break;
    }
    case 'stagger': {
      animateHumanoid(e.rig, 'stagger', e, e.t, dt, false);
      if (e.t > (isBoss ? 0.55 : 0.4)) { e.state = 'chase'; e.t = 0; }
      break;
    }
  }

  /* collisions entre ennemis */
  for (const o of enemies) {
    if (o === e || o.state === 'dead') continue;
    const d = e.pos.distanceTo(o.pos);
    const min = (e.isBoss || o.isBoss) ? 3.4 : 1.1;
    if (d < min && d > 0.001) {
      const push = e.pos.clone().sub(o.pos).setY(0).normalize().multiplyScalar((min - d) * 0.5);
      e.pos.add(push);
    }
  }

  const r = Math.hypot(e.pos.x, e.pos.z);
  if (r > WORLD_RADIUS) { e.pos.x *= WORLD_RADIUS / r; e.pos.z *= WORLD_RADIUS / r; }

  e.rig.group.position.copy(e.pos);
  e.rig.group.rotation.y = e.yaw;

  if (isBoss && bossEngaged && !wasDead) {
    document.getElementById('boss-hp-fill').style.transform =
      `scaleX(${clamp(e.hp / e.maxHp, 0, 1)})`;
  }
}

function playerDead() { return player.state === 'dead'; }

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.progress += dt * 8;
    const radius = s.progress * 6;
    s.ring.scale.setScalar(Math.max(radius, 0.01));
    s.ring.material.opacity = clamp(1 - s.progress / 2.2, 0, 1) * 0.9;
    const dP = Math.hypot(player.pos.x - s.ring.position.x, player.pos.z - s.ring.position.z);
    if (!s.hit && s.progress < 2 && Math.abs(dP - radius) < 0.9 && player.iframe <= 0) {
      s.hit = true;
      hurtPlayer(50, s.ring.position);
    }
    if (s.progress > 2.2) { scene.remove(s.ring); shockwaves.splice(i, 1); }
  }
}

/* ---------------- caméra ---------------- */
function updateCamera(dt) {
  camYawV -= mouse.dx * 0.0026;
  camPitchV = clamp(camPitchV + mouse.dy * 0.0022, 0.05, 1.15);
  mouse.dx = mouse.dy = 0;

  if (lockTarget && lockTarget.state !== 'dead') {
    const to = lockTarget.pos.clone().sub(player.pos);
    camYawV = lerpAngle(camYawV, Math.atan2(to.x, to.z), clamp(6 * dt, 0, 1));
    camPitchV = lerp(camPitchV, 0.3, clamp(3 * dt, 0, 1));
  } else if (lockTarget) {
    lockTarget = null;
  }

  const focus = player.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
  const dist = lockTarget ? 6.4 : camDist;
  const off = new THREE.Vector3(
    Math.sin(camYawV) * Math.cos(camPitchV),
    Math.sin(camPitchV),
    Math.cos(camYawV) * Math.cos(camPitchV)
  );
  const desired = focus.clone().addScaledVector(off, dist).add(new THREE.Vector3(0, 1.1, 0));
  camera.position.lerp(desired, clamp(14 * dt, 0, 1));
  const look = focus.clone();
  if (lockTarget) look.lerp(lockTarget.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), 0.28);
  camera.lookAt(look);

  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt * 1.6);
    const s = game.shake * 0.35;
    camera.position.x += rand(-s, s);
    camera.position.y += rand(-s, s);
  }

  moon.target.position.copy(player.pos);
  moon.position.copy(player.pos).add(new THREE.Vector3(50, 80, 35));
}

/* ---------------- HUD ---------------- */
function updateHud() {
  const p = player;
  document.getElementById('hp-fill').style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
  document.getElementById('st-fill').style.transform = `scaleX(${clamp(p.st / p.maxSt, 0, 1)})`;
  document.getElementById('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  document.getElementById('estus-count').textContent = p.estus;
  document.getElementById('rune-count').textContent = p.runes.toLocaleString('fr-FR');
}

const _v = new THREE.Vector3();
function updateLockReticle() {
  const el = document.getElementById('lockon');
  if (!lockTarget || lockTarget.state === 'dead') { el.classList.add('hidden'); return; }
  _v.copy(lockTarget.pos).setY(lockTarget.isBoss ? 3.6 : 1.4);
  _v.project(camera);
  if (_v.z > 1) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
}

function flash(id, opacity) {
  const el = document.getElementById(id);
  el.style.opacity = opacity;
  setTimeout(() => { el.style.opacity = 0; }, 90);
}

function showScreen(id, ms) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('shown'));
  setTimeout(() => {
    el.classList.remove('shown');
    setTimeout(() => el.classList.add('hidden'), 1700);
  }, ms);
}

let subtitleTimer = null;
function subtitle(text, ms) {
  const el = document.getElementById('subtitle');
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => { el.style.opacity = 0; }, ms || 3200);
}

/* ---------------- pickups & prompts ---------------- */
function updatePickups(dt) {
  for (let i = runeDrops.length - 1; i >= 0; i--) {
    const r = runeDrops[i];
    r.phase += dt * 3;
    r.mesh.position.y = 0.6 + Math.sin(r.phase) * 0.12;
    r.mesh.rotation.y += dt * 2;
    if (player.pos.distanceTo(r.mesh.position) < 2.2 && !playerDead()) {
      player.runes += r.amount;
      Sound.pickup();
      updateHud();
      scene.remove(r.mesh);
      runeDrops.splice(i, 1);
    }
  }
}

function updatePrompt() {
  const el = document.getElementById('prompt');
  if (player.pos.distanceTo(BONFIRE_POS) < 3.2 && !playerDead()) {
    el.textContent = 'E — Se reposer au feu de camp';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/* ---------------- boucle principale ---------------- */
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (game.state === 'playing') {
    game.time += dt;
    if (game.hitstop > 0) { game.hitstop -= dt; dt *= 0.15; }
    updatePlayer(dt);
    for (const e of enemies) updateEnemy(e, dt);
    updateShockwaves(dt);
    updatePickups(dt);
    updateCamera(dt);
    updateLockReticle();
    updatePrompt();

    bonfireFlame.scale.y = 1 + Math.sin(game.time * 11) * 0.14 + Math.sin(game.time * 23) * 0.06;
    bonfireFlame.rotation.y += dt * 2;
    bonfireLight.intensity = 26 + Math.sin(game.time * 9) * 4;

    if (fireflies) {
      const { pts, positions, seeds, N } = fireflies;
      const t = game.time;
      for (let i = 0; i < N; i++) {
        positions[i * 3] += Math.sin(t * 0.6 + seeds[i]) * 0.0035;
        positions[i * 3 + 1] += Math.cos(t * 0.4 + seeds[i] * 2) * 0.0022;
        positions[i * 3 + 2] += Math.cos(t * 0.5 + seeds[i] * 3) * 0.0035;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    const pos = b.mesh.geometry.attributes.position;
    b.parts.forEach((pt, j) => {
      pt.v.y -= 7 * dt;
      pt.p.addScaledVector(pt.v, dt);
      pos.setXYZ(j, pt.p.x, pt.p.y, pt.p.z);
    });
    pos.needsUpdate = true;
    b.mesh.material.opacity = Math.max(0, 1 - b.t / 0.5);
    if (b.t > 0.5) { scene.remove(b.mesh); bursts.splice(i, 1); }
  }
  renderer.render(scene, camera);
}

function burstBlood(pos) {
  const n = 10;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8b1a1a, transparent: true }));
  m.frustumCulled = false;
  scene.add(m);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      p: pos.clone(),
      v: new THREE.Vector3(rand(-1.4, 1.4), rand(0.5, 2.6), rand(-1.4, 1.4)),
    });
  }
  bursts.push({ mesh: m, parts, t: 0 });
}

/* ---------------- entrées ---------------- */
const keys = {};
const mouse = { dx: 0, dy: 0 };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.state !== 'playing') return;
  if (e.code === 'Space') { e.preventDefault(); tryRoll(); }
  if (e.code === 'KeyF') tryEstus();
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyQ') toggleLock();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  mouse.dx += e.movementX;
  mouse.dy += e.movementY;
});
addEventListener('mousedown', (e) => {
  if (game.state !== 'playing') return;
  if (e.button === 0) attackQueued = true;
  if (e.button === 1) { e.preventDefault(); toggleLock(); }
});
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});
addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- démarrage ---------------- */
buildTerrain();
buildErdtree();
buildBossArena();
buildRuins();
buildBonfire();
buildFireflies();

player.rig = makeHumanoid({
  scale: 1.02, body: 0x59616e, accent: 0x2c2f36, weaponLen: 1.05, eyeColor: 0x9ad1ff,
});
scene.add(player.rig.group);

spawnSoldier(14, -8, 0.6);
spawnSoldier(-20, -30, 2.2);
spawnSoldier(26, -44, -1.1);
spawnSoldier(-8, -60, 0.3);
spawnSoldier(16, -62, -0.4);
boss = spawnBoss();
updateHud();

document.getElementById('start-btn').addEventListener('click', () => {
  Sound.init();
  document.getElementById('title-screen').style.display = 'none';
  game.state = 'playing';
  canvas.requestPointerLock();
  subtitle("Les Terres Intermédiaires — l'aube grise de la Sans-Tache.", 5000);
});

document.getElementById('loading').classList.add('hidden');
loop();
