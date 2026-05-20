const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const fuelEl = document.querySelector("#fuel");
const bestEl = document.querySelector("#best");
const fuelGauge = document.querySelector("#fuelGauge");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const bestKey = "river-dash-best";
const riverCache = new Map();
const PLAYER_Y = H - 92;

let best = Number(localStorage.getItem(bestKey) || 0);
let lastTime = 0;
let state = "ready";
let distance = 0;
let score = 0;
let fuel = 100;
let shake = 0;
let bullets = [];
let enemyBullets = [];
let enemies = [];
let fuels = [];
let particles = [];
let spawnTimer = 0;
let fuelSpawnTimer = 0;
let fireCooldown = 0;

const FUEL_DRAIN_BASE = 4.4;
const FUEL_DRAIN_THROTTLE = 3.8;
const FUEL_SPAWN_MIN = 2.8;
const FUEL_SPAWN_RANDOM = 1.8;

const player = {
  x: W / 2,
  y: PLAYER_Y,
  r: 20,
  invincible: 0,
  throttle: 0.35
};

if (bestEl) bestEl.textContent = best;

function resetGame() {
  riverCache.clear();
  distance = 0;
  score = 0;
  fuel = 100;
  shake = 0;
  bullets = [];
  enemyBullets = [];
  enemies = [];
  fuels = [];
  particles = [];
  spawnTimer = 0.3;
  fuelSpawnTimer = 1.2;
  fireCooldown = 0;
  player.x = W / 2;
  player.y = PLAYER_Y;
  player.invincible = 1.8;
  player.throttle = 0.35;
  updateFuelGauge();
}

function startGame() {
  resetGame();
  state = "playing";
  overlay.classList.add("hidden");
}

function endGame() {
  state = "ended";
  best = Math.max(best, Math.floor(score));
  localStorage.setItem(bestKey, String(best));
  if (bestEl) bestEl.textContent = best;
  overlay.classList.remove("hidden");
  startButton.textContent = "Fly Again";
}

function riverBounds(y) {
  const worldY = screenToWorld(y);
  const chunkSize = 120;
  const chunk = Math.floor(worldY / chunkSize);
  const local = (worldY - chunk * chunkSize) / chunkSize;
  const eased = smoothstep(local);
  const a = riverNode(chunk);
  const b = riverNode(chunk + 1);
  const center = lerp(a.center, b.center, eased);
  const width = lerp(a.width, b.width, eased);
  return {
    left: center - width / 2,
    right: center + width / 2
  };
}

function screenToWorld(y) {
  return Math.max(0, H + distance - y);
}

function worldToScreen(worldY) {
  return H + distance - worldY;
}

function riverNode(chunk) {
  if (riverCache.has(chunk)) return riverCache.get(chunk);
  let center = W / 2;
  let width = 260;
  for (let i = 0; i <= chunk; i += 1) {
    if (riverCache.has(i)) {
      const cached = riverCache.get(i);
      center = cached.center;
      width = cached.width;
      continue;
    }
    const drift = (seededRand(i, 9) - 0.5) * (W * 0.18);
    center = clamp(center * 0.62 + (W / 2 + drift) * 0.38, W * 0.24, W * 0.76);
    width = W * 0.46 + seededRand(i, 23) * W * 0.14;
    riverCache.set(i, { center, width });
  }
  return riverCache.get(chunk);
}

function seededRand(a, b = 0) {
  let n = (a * 374761393 + b * 668265263) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function inRiver(x, y, pad = 0) {
  const b = riverBounds(y);
  return x > b.left + pad && x < b.right - pad && !inIsland(x, y, Math.max(0, pad * 0.35));
}

function inOpenWater(x, y, bankPad = 0, islandPad = 0) {
  const b = riverBounds(y);
  return x > b.left + bankPad && x < b.right - bankPad && !inIsland(x, y, islandPad);
}

function islandAtWorld(worldY) {
  const spec = islandSpecForWorld(worldY);
  if (!spec) return null;

  const local = worldY - spec.segment * spec.segmentLength;
  if (local < spec.start || local > spec.start + spec.length) return null;

  const t = (local - spec.start) / spec.length;
  const b = riverBoundsFromWorld(worldY);
  const maxWidth = Math.min(spec.maxWidth, (b.right - b.left) * 0.42);
  const width = Math.sin(t * Math.PI) * maxWidth;
  const offset = (spec.offset - 0.5) * (b.right - b.left) * 0.18;
  const center = clamp((b.left + b.right) / 2 + offset, b.left + 90, b.right - 90);
  return {
    left: center - width / 2,
    right: center + width / 2,
    width,
    segment: spec.segment
  };
}

function islandSpecForWorld(worldY) {
  const segmentLength = 900;
  const segment = Math.floor(worldY / segmentLength);
  if (segment < 1 || seededRand(segment, 101) < 0.48) return null;

  return {
    segment,
    segmentLength,
    start: 150 + seededRand(segment, 102) * 140,
    length: 310 + seededRand(segment, 103) * 190,
    maxWidth: W * (0.11 + seededRand(segment, 105) * 0.08),
    offset: seededRand(segment, 104)
  };
}

function riverBoundsFromWorld(worldY) {
  const screenY = worldToScreen(worldY);
  const chunkSize = 120;
  const chunk = Math.floor(worldY / chunkSize);
  const local = (worldY - chunk * chunkSize) / chunkSize;
  const eased = smoothstep(local);
  const a = riverNode(chunk);
  const b = riverNode(chunk + 1);
  const center = lerp(a.center, b.center, eased);
  const width = lerp(a.width, b.width, eased);
  return {
    left: center - width / 2,
    right: center + width / 2,
    screenY
  };
}

function inIsland(x, y, pad = 0) {
  const island = islandAtWorld(screenToWorld(y));
  return island && island.width > 8 && x > island.left - pad && x < island.right + pad;
}

function spawnEnemy() {
  const y = -50;
  const b = riverBounds(y);
  const x = pickRiverX(y, 42);
  const battleChance = clamp((score - 600) / 2200, 0, 0.62);
  const type = Math.random() < battleChance ? "battleship" : "submarine";
  enemies.push({
    x,
    y,
    vx: (Math.random() - 0.5) * (type === "battleship" ? 22 : 38),
    r: type === "battleship" ? 27 : 20,
    type,
    hp: type === "battleship" ? 2 : 1,
    shootTimer: 0.75 + Math.random() * 1.4
  });
}

function spawnFuel() {
  const y = -55;
  fuels.push({
    x: pickRiverX(y, 42),
    y,
    r: 18
  });
}

function pickRiverX(y, pad) {
  const b = riverBounds(y);
  for (let i = 0; i < 10; i += 1) {
    const x = b.left + pad + Math.random() * (b.right - b.left - pad * 2);
    if (inRiver(x, y, pad)) return x;
  }
  return (b.left + b.right) / 2;
}

function addBurst(x, y, color) {
  for (let i = 0; i < 16; i += 1) {
    particles.push({
      x,
      y,
      vx: Math.cos((i / 16) * Math.PI * 2) * (80 + Math.random() * 120),
      vy: Math.sin((i / 16) * Math.PI * 2) * (80 + Math.random() * 120),
      life: 0.45 + Math.random() * 0.25,
      color
    });
  }
}

function update(dt) {
  const up = keys.has("ArrowUp") || keys.has("w") || keys.has("W");
  const down = keys.has("ArrowDown") || keys.has("s") || keys.has("S");
  if (up) player.throttle += dt * 1.8;
  else if (down) player.throttle -= dt * 1.65;
  else player.throttle += (0.36 - player.throttle) * dt * 0.75;
  player.throttle = clamp(player.throttle, 0, 1);

  const speed = 145 + player.throttle * 145 + Math.min(score * 0.012, 72);
  distance += speed * dt;
  score += dt * 18;
  fuel -= dt * (FUEL_DRAIN_BASE + player.throttle * FUEL_DRAIN_THROTTLE);
  fireCooldown = Math.max(0, fireCooldown - dt);
  shake = Math.max(0, shake - dt * 18);
  player.invincible = Math.max(0, player.invincible - dt);

  const move = 260 * dt;
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
  if (left) player.x -= move;
  if (right) player.x += move;
  player.x = Math.max(28, Math.min(W - 28, player.x));
  player.y = PLAYER_Y;

  if (keys.has(" ") || keys.has("Spacebar")) fire();

  spawnTimer -= dt;
  fuelSpawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = 0.65 + Math.random() * 0.75;
  }
  if (fuelSpawnTimer <= 0) {
    spawnFuel();
    fuelSpawnTimer = FUEL_SPAWN_MIN + Math.random() * FUEL_SPAWN_RANDOM;
  }

  bullets.forEach((bullet) => {
    bullet.y -= 560 * dt;
  });
  bullets = bullets.filter((bullet) => bullet.y > -20);

  enemyBullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += (bullet.vy + speed * 0.18) * dt;
  });
  enemyBullets = enemyBullets.filter((bullet) => (
    bullet.y < H + 30 &&
    bullet.y > -40 &&
    inOpenWater(bullet.x, bullet.y, bullet.r, bullet.r)
  ));

  enemies.forEach((enemy) => {
    enemy.y += speed * dt * 0.92;
    enemy.x += enemy.vx * dt;
    if (!inOpenWater(enemy.x, enemy.y, enemy.r + 4, enemy.r + 2)) enemy.vx *= -1;
    if (enemy.type === "battleship" && enemy.y > 70 && enemy.y < player.y - 34) {
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0) {
        shootAtPlayer(enemy);
        enemy.shootTimer = 1.25 + Math.random() * 1.25 - clamp(score / 5000, 0, 0.45);
      }
    }
  });
  enemies = enemies.filter((enemy) => enemy.y < H + 70 && enemy.hp > 0);

  fuels.forEach((can) => {
    can.y += speed * dt * 0.9;
  });
  fuels = fuels.filter((can) => can.y < H + 60);

  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 240 * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);

  handleCollisions();

  if (fuel <= 0 || !inOpenWater(player.x, player.y, player.r * 0.45, player.r * 0.2)) {
    addBurst(player.x, player.y, "#ffcf5a");
    shake = 10;
    endGame();
  }

  scoreEl.textContent = Math.floor(score);
  if (fuelEl) fuelEl.textContent = `${Math.max(0, Math.ceil(fuel))}%`;
  updateFuelGauge();
}

function updateFuelGauge() {
  if (!fuelGauge) return;
  const filled = Math.ceil(clamp(fuel, 0, 100) / 10);
  [...fuelGauge.children].forEach((segment, index) => {
    segment.className = "";
    if (index >= filled) segment.classList.add("empty");
    else if (fuel <= 30) segment.classList.add("low");
  });
}

function fire() {
  if (state !== "playing" || fireCooldown > 0) return;
  bullets.push({ x: player.x, y: player.y - 24, r: 5 });
  fireCooldown = 0.18;
}

function shootAtPlayer(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const length = Math.hypot(dx, dy) || 1;
  const shotSpeed = 185 + clamp(score / 35, 0, 105);
  enemyBullets.push({
    x: enemy.x,
    y: enemy.y + 20,
    vx: (dx / length) * shotSpeed,
    vy: (dy / length) * shotSpeed,
    r: 7
  });
}

function handleCollisions() {
  enemies.forEach((enemy) => {
    bullets.forEach((bullet) => {
      if (circleHit(enemy, bullet)) {
        enemy.hp -= 1;
        bullet.y = -99;
        if (enemy.hp <= 0) {
          score += enemy.type === "battleship" ? 180 : 110;
          addBurst(enemy.x, enemy.y, enemy.type === "battleship" ? "#ff8c42" : "#6fe3bd");
        }
      }
    });

    if (player.invincible <= 0 && circleHit(enemy, player)) {
      enemy.hp = 0;
      addBurst(enemy.x, enemy.y, "#ff6f91");
      shake = 14;
      score = Math.max(0, score - 90);
      player.invincible = 1.4;
    }
  });

  fuels.forEach((can) => {
    if (circleHit(can, player)) {
      fuel = 100;
      score += 65;
      can.y = H + 99;
      addBurst(can.x, can.y, "#6fe3bd");
    }
  });

  enemyBullets.forEach((bullet) => {
    if (player.invincible <= 0 && circleHit(bullet, player)) {
      bullet.y = H + 99;
      shake = 12;
      score = Math.max(0, score - 60);
      player.invincible = 1.25;
      addBurst(player.x, player.y, "#ffcf5a");
    }
  });
}

function circleHit(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy < rr * rr;
}

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  drawWorld();
  fuels.forEach(drawFuel);
  enemies.forEach(drawEnemy);
  bullets.forEach(drawBullet);
  enemyBullets.forEach(drawEnemyBullet);
  drawPlane(player.x, player.y, player.invincible);
  particles.forEach(drawParticle);

  if (state !== "playing") {
    drawWorldTitle();
  }

  ctx.restore();
}

function drawWorld() {
  ctx.fillStyle = "#73d47c";
  ctx.fillRect(0, 0, W, H);

  drawLandDetails();

  ctx.beginPath();
  for (let y = -8; y <= H + 8; y += 8) {
    const b = riverBounds(y);
    if (y === -8) ctx.moveTo(b.left, y);
    else ctx.lineTo(b.left, y);
  }
  for (let y = H + 8; y >= -8; y -= 8) {
    const b = riverBounds(y);
    ctx.lineTo(b.right, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#2fa8e8";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#f8e9a1";
  ctx.stroke();

  ctx.save();
  ctx.clip();
  const firstStripe = Math.floor(distance / 80) * 80;
  for (let worldY = firstStripe; worldY < distance + H + 90; worldY += 80) {
    const y = worldToScreen(worldY);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    const b = riverBounds(y);
    roundRect(lerp(b.left + 24, b.right - 124, seededRand(worldY, 44)), y, 110, 7, 4);
    roundRect(lerp(b.left + 34, b.right - 94, seededRand(worldY, 45)), y + 34, 80, 6, 4);
  }
  ctx.restore();

  drawIslands();
}

function drawLandDetails() {
  const chunkSize = 78;
  const firstChunk = Math.floor(distance / chunkSize) - 1;
  for (let chunk = firstChunk; chunk < firstChunk + Math.ceil(H / chunkSize) + 3; chunk += 1) {
    const worldY = chunk * chunkSize + seededRand(chunk, 5) * 34;
    const y = worldToScreen(worldY);
    const b = riverBounds(y);
    const side = seededRand(chunk, 6) > 0.5 ? 1 : -1;
    const margin = 30 + seededRand(chunk, 7) * 42;
    const x = side < 0 ? b.left - margin : b.right + margin;
    drawTree(clamp(x, 20, W - 20), y, 0.72 + seededRand(chunk, 8) * 0.42);

    if (seededRand(chunk, 11) > 0.62) {
      const rockX = side < 0 ? b.left - margin - 35 : b.right + margin + 35;
      drawRock(clamp(rockX, 20, W - 20), y + 24, 0.7 + seededRand(chunk, 12) * 0.5);
    }
  }
}

function drawIslands() {
  const segmentLength = 900;
  const firstSegment = Math.floor(distance / segmentLength) - 1;
  const lastSegment = Math.floor((distance + H) / segmentLength) + 1;

  for (let segment = firstSegment; segment <= lastSegment; segment += 1) {
    const spec = islandSpecForWorld(segment * segmentLength);
    if (!spec) continue;
    drawIslandSegment(spec);
  }
}

function drawIslandSegment(spec) {
  const step = 14;
  const leftEdge = [];
  const rightEdge = [];

  for (let local = spec.start; local <= spec.start + spec.length; local += step) {
    const worldY = spec.segment * spec.segmentLength + local;
    const y = worldToScreen(worldY);
    if (y < -80 || y > H + 80) continue;
    const island = islandAtWorld(worldY);
    if (!island || island.width < 3) continue;
    leftEdge.push({ x: island.left, y, worldY, width: island.width });
    rightEdge.push({ x: island.right, y });
  }

  if (leftEdge.length < 3) return;

  ctx.beginPath();
  ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
  leftEdge.forEach((point) => ctx.lineTo(point.x, point.y));
  rightEdge.reverse().forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = "#73d47c";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f8e9a1";
  ctx.stroke();

  drawIslandTrees(spec);
}

function drawIslandTrees(spec) {
  const firstTree = spec.start + 86 + seededRand(spec.segment, 68) * 48;
  const spacing = 118;

  for (let local = firstTree; local < spec.start + spec.length - 64; local += spacing) {
    const worldY = spec.segment * spec.segmentLength + local;
    const y = worldToScreen(worldY);
    if (y < -36 || y > H + 36) continue;

    const island = islandAtWorld(worldY);
    if (!island || island.width < 68) continue;

    const x = (island.left + island.right) / 2 + (seededRand(spec.segment, Math.floor(local)) - 0.5) * island.width * 0.38;
    drawTree(x, y, 0.62 + seededRand(spec.segment, Math.floor(local) + 1) * 0.32);
  }
}

function drawTree(x, y, s) {
  ctx.fillStyle = "#7f5a3b";
  roundRect(x - 4 * s, y + 8 * s, 8 * s, 18 * s, 4 * s);
  ctx.fillStyle = "#247a55";
  blob(x, y, 20 * s, 22 * s);
  ctx.fillStyle = "#35a86b";
  blob(x + 8 * s, y + 2 * s, 14 * s, 15 * s);
}

function drawRock(x, y, s) {
  ctx.fillStyle = "#86a29b";
  blob(x, y, 15 * s, 10 * s);
  ctx.fillStyle = "#bed1bf";
  blob(x + 4 * s, y - 3 * s, 6 * s, 3 * s);
}

function drawPlane(x, y, invincible) {
  ctx.save();
  ctx.translate(x, y);
  if (invincible > 0 && Math.floor(invincible * 12) % 2 === 0) ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#ffcf5a";
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(15, 19);
  ctx.lineTo(0, 10);
  ctx.lineTo(-15, 19);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#123047";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ff6f91";
  ctx.beginPath();
  ctx.moveTo(-31, 2);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-8, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(31, 2);
  ctx.lineTo(8, -6);
  ctx.lineTo(8, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8de7ff";
  blob(0, -8, 8, 11);
  ctx.restore();
}

function drawEnemy(enemy) {
  if (enemy.type === "battleship") {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = "#7d8fa3";
    ctx.beginPath();
    ctx.moveTo(-31, -13);
    ctx.lineTo(31, -13);
    ctx.lineTo(23, 20);
    ctx.lineTo(-23, 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#123047";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#dce6ea";
    roundRect(-15, -22, 30, 16, 5);
    ctx.fillStyle = "#ffcf5a";
    roundRect(-4, -35, 8, 18, 4);
    ctx.strokeStyle = "#123047";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.strokeStyle = "#123047";
  ctx.lineWidth = 4;
  ctx.fillStyle = "#4cc1d4";
  blob(0, 0, 27, 13);
  ctx.stroke();
  ctx.fillStyle = "#fff7d7";
  roundRect(-2, -22, 9, 18, 4);
  ctx.stroke();
  ctx.fillStyle = "#123047";
  blob(15, 0, 4, 4);
  ctx.restore();
}

function drawFuel(can) {
  ctx.save();
  ctx.translate(can.x, can.y);
  ctx.fillStyle = "#6fe3bd";
  roundRect(-15, -18, 30, 36, 6);
  ctx.strokeStyle = "#123047";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff7d7";
  ctx.font = "700 18px Nunito";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F", 0, 2);
  ctx.restore();
}

function drawBullet(bullet) {
  ctx.fillStyle = "#fff7d7";
  blob(bullet.x, bullet.y, 5, 10);
}

function drawEnemyBullet(bullet) {
  ctx.fillStyle = "#ff6f91";
  blob(bullet.x, bullet.y, 7, 7);
  ctx.strokeStyle = "#123047";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawParticle(p) {
  ctx.globalAlpha = Math.max(0, p.life * 2);
  ctx.fillStyle = p.color;
  blob(p.x, p.y, 5, 5);
  ctx.globalAlpha = 1;
}

function drawWorldTitle() {
  ctx.fillStyle = "rgba(18, 48, 71, 0.2)";
  ctx.fillRect(0, 0, W, H);
}

function blob(x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (state === "playing") update(dt);
  else distance += 35 * dt;
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "Enter" && state !== "playing") startGame();
  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

let touchId = null;
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  if (touchId === null) touchId = event.pointerId;
  if (event.pointerId !== touchId) fire();
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== touchId || state !== "playing") return;
  const rect = canvas.getBoundingClientRect();
  player.x = ((event.clientX - rect.left) / rect.width) * W;
  player.throttle = clamp(1 - ((event.clientY - rect.top) / rect.height), 0, 1);
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerId === touchId) touchId = null;
});

startButton.addEventListener("click", startGame);

resetGame();
requestAnimationFrame(loop);
