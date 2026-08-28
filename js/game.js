"use strict";

const TAU = Math.PI * 2;
const COLS = 7, ROWS = 10, CELL = 50;

const GEMS = [
  { name: "Cuarzo", c: "#e8ecf5", glow: "#dfe6ff" },
  { name: "Ambar", c: "#ffb13d", glow: "#ffb13d" },
  { name: "Jade", c: "#57c785", glow: "#57c785" },
  { name: "Turquesa", c: "#35d0c5", glow: "#35d0c5" },
  { name: "Zafiro", c: "#3e7bfa", glow: "#4f86ff" },
  { name: "Amatista", c: "#a05ce6", glow: "#b06cff" },
  { name: "Esmeralda", c: "#1fbf6b", glow: "#2ee88a" },
  { name: "Rubi", c: "#ef3b5d", glow: "#ff5070" },
  { name: "Topacio", c: "#ffcf2e", glow: "#ffe066" },
  { name: "Diamante", c: "#cfeaff", glow: "#9fd8ff" },
  { name: "Cristal Lunar", c: "#7ea8ff", glow: "#aac4ff" },
  { name: "Piedra Filosofal", c: "#ffd76a", glow: "#ffdf8a" }
];
const MAX_TIER = GEMS.length;

const POP_MS = 230, DROP_CELL_MS = 58, FALL_MS = 45;
const OFF = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ROTS = [2, 3, 0, 1];

const boardCv = document.getElementById("board");
const nextCv = document.getElementById("next");
const ctx = setupCanvas(boardCv, COLS * CELL, ROWS * CELL);
const nctx = setupCanvas(nextCv, 96, 150);

function setupCanvas(cv, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  return g;
}

let board, pair, nextPair, state, score, discovered, lastChain;
let dropping = false, now = 0, lastTs = 0;
let particles = [], floats = [], pops = new Map();
let shake = 0, muted = false, actx = null;
let resPhase = null, resT0 = 0, resDur = 110, chainCount = 0;
let ghostStones = [], falls = [];
let dangerLineAlpha = 0;

const SPRITE_COLORS = ["#e74c5b", "#4a90e2", "#2ecc71", "#9b59b6", "#ff8c1a", "#35d0e5", "#ff4fa0", "#ffd24a", "#3ed8c3", "#ff7ad1", "#a45cff", "#ffd76a"];
let sprites = [], sheetReady = false;

(function loadSprites() {
  if (typeof Image === "undefined") return;
  let loaded = 0;
  for (let i = 0; i < MAX_TIER; i++) {
    const img = new Image();
    img.onload = function () {
      sprites[i] = img;
      GEMS[i].c = SPRITE_COLORS[i];
      GEMS[i].glow = mix(SPRITE_COLORS[i], "#ffffff", 0.25);
      if (typeof codexItems !== "undefined" && codexItems[i]) {
        codexItems[i].style.setProperty("--g", GEMS[i].glow);
        if (codexItems[i].firstChild) {
          codexItems[i].firstChild.style.background = 'center/contain no-repeat url("assets/images/piedras/piedra' + String(i + 1).padStart(2, "0") + '.png")';
        }
      }
      loaded++;
      if (loaded === MAX_TIER) sheetReady = true;
      if (typeof drawNext === "function" && typeof nextPair !== "undefined" && nextPair) {
        drawNext();
      }
    };
    img.src = "assets/images/piedras/piedra" + String(i + 1).padStart(2, "0") + ".png";
  }
})();

const elScore = document.getElementById("score");
const elChain = document.getElementById("chain");
const elBest = document.getElementById("best");
const elDisc = document.getElementById("disc");
const codexUl = document.getElementById("codex");
const ovPause = document.getElementById("ovPause");
const ovOver = document.getElementById("ovOver");

GEMS.forEach(function (g, i) {
  const li = document.createElement("li");
  li.title = (i + 1) + ". " + g.name;
  li.style.setProperty("--g", g.glow);
  const s = document.createElement("span");
  li.appendChild(s);
  codexUl.appendChild(li);
});
const codexItems = Array.prototype.slice.call(codexUl.children);

const Character = {
  mainImg: document.getElementById("char-main-img"),
  tag: document.getElementById("character-tag"),
  animContainer: document.getElementById("char-anim-container"),
  box: document.getElementById("character-box"),
  sparkle: document.getElementById("char-sparkle"),
  poseTimer: null,
  sayTimer: null,
  shockTimer: null,
  currentPose: "default",
  priority: 0,
  priorityUntil: 0,
  danger: false,
  defaultTag: "¡Vigilando la mina! ⛏️",

  // Mapeo exacto de los 5 personajes de Kobold Def (de izquierda a derecha):
  // 1: Combo x1 (primer personaje)
  // 2: Combo x3 o más (segundo personaje)
  // 3: Game Over / Derrota (tercer personaje)
  // 4: Default / Jugando y moviendo piezas (cuarto personaje)
  // 5: Combo x2 (quinto personaje)
  SPRITES: {
    default: "assets/images/character/Kobold Default.png",
    combo1: "assets/images/character/Kobold Combo1.png",
    combo2: "assets/images/character/Kobold Combo2.png",
    combo3: "assets/images/character/Kobold Combo3.png",
    gameover: "assets/images/character/Kobold Gameover.png"
  },

  init: function () {
    this.preload();
    this.startIdleChatter();
    this.setPose("default");
    this.say("¡A forjar piedras! ⛏️");
  },

  preload: function () {
    for (const k in this.SPRITES) {
      const im = new Image();
      im.src = this.SPRITES[k];
    }
  },

  setPose: function (poseName, durationMs, prio) {
    if (!this.mainImg) return;
    if (prio !== undefined) {
      if (now < this.priorityUntil && prio < this.priority) return;
      this.priority = prio;
      this.priorityUntil = now + (durationMs || 1200);
    }
    const sprite = this.SPRITES[poseName] || this.SPRITES.default;
    this.currentPose = poseName;
    this.mainImg.src = sprite;

    clearTimeout(this.poseTimer);
    if (poseName !== "default" && durationMs && state === "play") {
      const self = this;
      this.poseTimer = setTimeout(function () {
        if (state === "play") {
          self.setPose("default");
        }
      }, durationMs);
    }
  },

  setDanger: function (on) {
    if (this.danger === on) return;
    this.danger = on;
    if (on) {
      if (this.currentPose === "default") {
        this.say("¡El tablero se llena! ⚠️", 2600);
      }
    }
  },

  react: function (poseName, text, durationMs, animType) {
    durationMs = durationMs || 1600;
    const prios = {
      default: 0,
      combo1: 1,
      combo2: 2,
      combo3: 3,
      gameover: 99
    };
    const prio = prios[poseName] !== undefined ? prios[poseName] : 1;
    this.setPose(poseName, durationMs, prio);

    if (this.animContainer && animType) {
      this.animContainer.classList.remove("react-jump", "react-wink", "react-cheer", "react-gasp", "react-bounce");
      void this.animContainer.offsetWidth;
      this.animContainer.classList.add(animType);
    }

    if (prio >= 3) this.shock(900);
    if (this.sparkle && prio >= 1) {
      this.sparkle.classList.add("active");
      const sp = this.sparkle;
      setTimeout(function () { sp.classList.remove("active"); }, 800);
    }

    if (text) this.say(text, durationMs);
  },

  shock: function (ms) {
    if (!this.box) return;
    this.box.classList.add("shock");
    clearTimeout(this.shockTimer);
    const self = this;
    this.shockTimer = setTimeout(function () {
      self.box.classList.remove("shock");
    }, ms || 800);
  },

  say: function (text, durationMs) {
    if (!this.tag) return;
    this.tag.textContent = text;
    clearTimeout(this.sayTimer);
    if (durationMs) {
      const self = this;
      this.sayTimer = setTimeout(function () {
        self.tag.textContent = self.defaultTag;
      }, durationMs + 400);
    }
  },

  startIdleChatter: function () {
    const self = this;
    const lines = [
      "Shh... kobold vigilando 👀",
      "Ese cristal brilla... ¡mío! 🪙",
      "¡Cuidado con llenar el tablero! ⚠️",
      "Mi vela nunca se apaga 🕯️",
      "Zzz... ¡ejem! Estaba despierto 🌙",
      "¿Ves esa piedra? Brilla bonito ✨",
      "La mina susurra... 🔨"
    ];
    const tick = function () {
      if (self.currentPose === "default" && !self.danger && state === "play") {
        const l = lines[Math.floor(Math.random() * lines.length)];
        self.say(l, 3000);
      }
      setTimeout(tick, 14000 + Math.random() * 9000);
    };
    setTimeout(tick, 9000);
  }
};
Character.init();

function reset() {
  board = [];
  for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(0));
  score = 0;
  lastChain = 1;
  discovered = new Set();
  particles = [];
  floats = [];
  pops.clear();
  shake = 0;
  dropping = false;
  resPhase = null;
  resDur = 110;
  chainCount = 0;
  ghostStones = [];
  falls = [];
  dangerLineAlpha = 0;
  nextPair = makePair();
  state = "play";
  ovOver.classList.add("hidden");
  ovPause.classList.add("hidden");
  Character.setPose("default", 0, 999);
  Character.priority = 0;
  Character.priorityUntil = 0;
  Character.say("¡A forjar piedras! ✨", 2000);
  spawn();
  updateHUD();
}

function randTier() {
    // base: rojas y azules dominan; las desbloqueadas entran con peso acotado
    const weights = [[1, 0.52], [2, 0.26]];
    if (discovered.has(3)) weights.push([3, 0.08]);
    const unlocked = [];
    for (let t = 4; t <= MAX_TIER; t++) if (discovered.has(t)) unlocked.push(t);
    const rest = 1 - weights.reduce(function (s, w) { return s + w[1]; }, 0);
    if (unlocked.length) {
        let units = unlocked.length;
        if (discovered.has(MAX_TIER)) units -= 0.5; // la definitiva pesa la mitad
        const each = Math.min(0.04, rest / units);
        let used = 0;
        for (const t of unlocked) {
            const u = t === MAX_TIER ? each * 0.5 : each;
            weights.push([t, u]);
            used += u;
        }
        const leftover = rest - used;
        weights[0][1] += leftover * 0.65;
        weights[1][1] += leftover * 0.35;
    } else {
        weights[0][1] += rest * 0.65;
        weights[1][1] += rest * 0.35;
    }
    let r = Math.random();
    for (const w of weights) {
        if (r < w[1]) return w[0];
        r -= w[1];
    }
    return 1;
}

function discover(tier) {
  if (discovered.has(tier)) return;
  discovered.add(tier);
  if (tier >= 4 && state === "play") {
    Character.say("¡Piedra nueva: " + GEMS[tier - 1].name + "! ✨", 2200);
  }
}

function makePair() {
  const col = Math.floor(COLS / 2);
  const a0 = Math.PI / 2;
  return { col: col, row: 1, rot: 0, a: randTier(), b: randTier(), fx: cx(col), fy: cy(1), t0: -1e9, dur: 1, ease: "linear", contAng: a0, af: a0, at: a0 };
}

function getPairVisualPos(p) {
  if (!p) return { x: 0, y: 0 };
  let ix = cx(p.col), iy = cy(p.row);
  if (!p.t0 || p.dur <= 0) return { x: ix, y: iy };
  const k = Math.min(1, Math.max(0, (now - p.t0) / p.dur));
  if (k < 1) {
    let s;
    if (p.ease === "linear") s = k;
    else if (p.ease === "back") s = backOut(k);
    else if (p.ease === "smooth") s = k * k * (3 - 2 * k);
    else s = 1 - Math.pow(1 - k, 3);
    ix = p.fx + (ix - p.fx) * s;
    iy = p.fy + (iy - p.fy) * s;
  }
  return { x: ix, y: iy };
}

function slideAnim(p, fx, fy, dur, ease) {
  p.fx = fx;
  p.fy = fy;
  p.t0 = now;
  p.dur = dur;
  p.ease = ease;
  p.af = p.at;
}

function spinAnim(p, fx, fy, dur, af, at) {
  p.fx = fx;
  p.fy = fy;
  p.t0 = now;
  p.dur = dur;
  p.ease = "back";
  p.af = af;
  p.at = at;
  p.contAng = at;
}

function pairCells(p) {
  const d = OFF[ROTS[p.rot]];
  return [
    { c: p.col, r: p.row, t: p.a },
    { c: p.col + d[0], r: p.row + d[1], t: p.b }
  ];
}

function canPlace(cells) {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.c < 0 || cell.c >= COLS || cell.r < 0 || cell.r >= ROWS) return false;
    if (board[cell.r][cell.c]) return false;
  }
  return true;
}

function shifted(p, dc, dr, rot) {
  const q = { col: p.col + dc, row: p.row + dr, rot: rot === undefined ? p.rot : rot, a: p.a, b: p.b };
  return pairCells(q);
}

function move(dx) {
  if (state !== "play" || dropping || resPhase || !pair) return;
  if (canPlace(shifted(pair, dx, 0))) {
    const pos = getPairVisualPos(pair);
    pair.col += dx;
    slideAnim(pair, pos.x, pos.y, 125, "out");
    sfx(190, 0.03, "square", 0.02);
  }
}

function angleTo(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return from + d;
}

function rotate(dir) {
  if (state !== "play" || dropping || resPhase || !pair) return;
  const nr = (pair.rot + dir + ROTS.length) % ROTS.length;
  const kicks = [[0, 0], [-1, 0], [1, 0]];
  for (let i = 0; i < kicks.length; i++) {
    if (canPlace(shifted(pair, kicks[i][0], kicks[i][1], nr))) {
      const pos = getPairVisualPos(pair);
      const af = pair.contAng;
      const off = OFF[ROTS[nr]];
      const at = angleTo(af, Math.atan2(off[1], off[0]));
      pair.col += kicks[i][0];
      pair.row += kicks[i][1];
      pair.rot = nr;
      spinAnim(pair, pos.x, pos.y, 150, af, at);
      sfx(260, 0.04, "square", 0.02);
      return;
    }
  }
}

function ghostRow() {
  let dr = 0;
  while (canPlace(shifted(pair, 0, dr + 1))) dr++;
  return dr;
}

function startDrop() {
  if (state !== "play" || dropping || resPhase || !pair) return;
  const dr = ghostRow();
  if (dr <= 0) { lockResolve(); return; }
  const pos = getPairVisualPos(pair);
  for (let i = 1; i <= dr; i++) {
    const cells = shifted(pair, 0, i);
    for (let j = 0; j < cells.length; j++) {
      if (cells[j].r >= 0 && Math.random() < 0.4) {
        particles.push(dot(cx(cells[j].c), cy(cells[j].r), GEMS[cells[j].t - 1].glow, 60, 0.25));
      }
    }
  }
  pair.row += dr;
  slideAnim(pair, pos.x, pos.y, Math.max(100, dr * DROP_CELL_MS), "linear");
  dropping = true;
}

function lockResolve() {
    const cells = pairCells(pair);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        board[cell.r][cell.c] = cell.t;
        discover(cell.t);
        for (let k = 0; k < 4; k++) {
            particles.push(dot(cx(cell.c), cy(cell.r), "#ffffff", 70, 0.3));
        }
    }
    pair = null;
    sfx(140, 0.06, "triangle", 0.04);
  chainCount = 0;
  ghostStones = [];
  falls = [];
  resPhase = "settle";
  resT0 = now;
  updateHUD();
}

function beginSettle() {
  const mv = applyGravity();
  let md = 1;
  for (let i = 0; i < mv.length; i++) {
    md = Math.max(md, mv[i].to - mv[i].from);
    falls.push({ c: mv[i].c, from: mv[i].from, to: mv[i].to, t0: now });
  }
  resPhase = "fall";
  resT0 = now;
  resDur = Math.max(110, md * FALL_MS);
  if (!mv.length) resDur = 50;
}

function nextWave() {
  falls = [];
  ghostStones = [];
  const groups = findGroups();
  if (!groups.length) { finishResolve(); return; }
  chainCount++;
  const mult = Math.min(chainCount, 8);
  let wavePts = 0, anchor = null;
  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const tier = grp.tier, len = grp.cells.length;
    let pts = (tier * 100 + Math.max(0, len - 4) * 150) * mult;
    let tgt = grp.cells[0];
    for (let i = 0; i < grp.cells.length; i++) {
      const cell = grp.cells[i];
      if (cell.r > tgt.r || (cell.r === tgt.r && cell.c < tgt.c)) tgt = cell;
    }
    for (let i = 0; i < grp.cells.length; i++) {
      const cell = grp.cells[i];
      board[cell.r][cell.c] = 0;
      ghostStones.push({ c: cell.c, r: cell.r, tier: tier, t0: now });
      burst(cx(cell.c), cy(cell.r), GEMS[tier - 1].glow, 10 + tier * 2, GEMS[tier - 1].c);
    }
    discovered.add(tier);
    if (tier < MAX_TIER) {
      board[tgt.r][tgt.c] = tier + 1;
      discover(tier + 1);
      pops.set(tgt.c + "," + tgt.r, now);
    } else {
      pts += len * 250 * mult;
    }
    wavePts += pts;
    if (!anchor) anchor = tgt;
  }
  score += wavePts;
  lastChain = chainCount;
  floats.push(mkFloat(anchor.c, anchor.r, "+" + wavePts, "#ffd76a"));
  if (chainCount >= 2) {
    floats.push({ x: COLS * CELL / 2, y: ROWS * CELL / 2, text: "COMBO x" + chainCount, color: "#ff8fd0", t0: now, dur: 1100, big: true });
    let lines;
    if (chainCount >= 3) {
      lines = ["¡COMBO x" + chainCount + "! 🤯", "¡LEYENDA! 👑", "¡Los espíritus bailan! 💃", "¡INCREÍBLE! 🌟"];
      Character.react("combo3", lines[Math.floor(Math.random() * lines.length)], 2200, "react-cheer");
    } else {
      lines = ["¡Combo x2! 🔥", "¡Doble fusión! ✨", "¡Ahí viene! 👀", "¡Otra vez! ⚡"];
      Character.react("combo2", lines[Math.floor(Math.random() * lines.length)], 1800, "react-jump");
    }
  } else {
    const praises = ["¡Gran fusión! ✨", "¡Poder alquímico! 🧪", "¡Esa piedra brilla! 💎", "¡Excelente forja! ⚡", "¡Bien hecho! 👏", "¡Sigue así! 🌟", "¡Jajaja! ¡Qué chispa! ⚡"];
    Character.react("combo1", praises[Math.floor(Math.random() * praises.length)], 1500, "react-bounce");
  }
  shake = Math.min(14, shake + 3 + chainCount * 2);
  sfx(280 + chainCount * 90, 0.16, "triangle", 0.06, 260);
  updateHUD();
  resPhase = "pop";
  resT0 = now;
}

function finishResolve() {
  resPhase = null;
  falls = [];
  ghostStones = [];
  if (state === "play") spawn();
  updateHUD();
}

function spawn() {
  pair = nextPair;
  nextPair = makePair();
  drawNext();
  if (!canPlace(pairCells(pair))) gameOver();
}

function findGroups() {
  const seen = [];
  for (let r = 0; r < ROWS; r++) seen.push(new Array(COLS).fill(false));
  const groups = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = board[r][c];
      if (!t || seen[r][c]) continue;
      const stack = [{ c: c, r: r }];
      const cells = [];
      seen[r][c] = true;
      while (stack.length) {
        const cur = stack.pop();
        cells.push(cur);
        for (let d = 0; d < 4; d++) {
          const nc = cur.c + OFF[d][0], nr = cur.r + OFF[d][1];
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          if (!seen[nr][nc] && board[nr][nc] === t) {
            seen[nr][nc] = true;
            stack.push({ c: nc, r: nr });
          }
        }
      }
      if (cells.length >= 3) groups.push({ tier: t, cells: cells });
    }
  }
  return groups;
}

function applyGravity() {
  const moves = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const t = board[r][c];
        if (write !== r) moves.push({ c: c, from: r, to: write });
        board[r][c] = 0;
        board[write][c] = t;
        write--;
      }
    }
  }
  return moves;
}

function gameOver() {
  state = "over";
  let bestT = 0;
  discovered.forEach(function (t) { if (t > bestT) bestT = t; });
  document.getElementById("finalScore").textContent = score;
  document.getElementById("finalGem").textContent = bestT ? GEMS[bestT - 1].name : "-";
  ovOver.classList.remove("hidden");
  Character.react("gameover", "¡Nooo! ¡Buen intento! 🪄", 4000, "react-gasp");
  sfx(320, 0.4, "sawtooth", 0.05, -240);
  updateHUD();
}

function cx(c) { return c * CELL + CELL / 2; }
function cy(r) { return r * CELL + CELL / 2; }

function dot(x, y, color, speed, life) {
  const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
  return { x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: life, max: life, size: 1.5 + Math.random() * 2.5, color: color, type: "dot", rot: 0, vr: 0 };
}

function burst(x, y, glow, n, base) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = 60 + Math.random() * 260;
    const star = Math.random() < 0.28;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 110,
      life: 0.45 + Math.random() * 0.45, max: 0.9,
      size: star ? 3 + Math.random() * 4 : 2 + Math.random() * 3,
      color: Math.random() < 0.5 ? glow : (base || glow),
      type: star ? "star" : "dot",
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10
    });
  }
  for (let i = 0; i < 5; i++) {
    particles.push({ x: x, y: y, vx: 0, vy: -20 - Math.random() * 40, life: 0.5, max: 0.5, size: 8 + Math.random() * 10, color: glow, type: "ring", rot: 0, vr: 0 });
  }
}

function mkFloat(c, r, text, color) {
  return { x: cx(c), y: cy(r), text: text, color: color, t0: now, dur: 1000, big: false };
}

function updateFx(dtSec) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.vy += 900 * dtSec;
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.rot += p.vr * dtSec;
    p.life -= dtSec;
  }
  const alive = [];
  for (let i = 0; i < particles.length; i++) if (particles[i].life > 0) alive.push(particles[i]);
  particles = alive;
  const fl = [];
  for (let i = 0; i < floats.length; i++) if (now - floats[i].t0 < floats[i].dur) fl.push(floats[i]);
  floats = fl;
  const gh = [];
  for (let i = 0; i < ghostStones.length; i++) if (now - ghostStones[i].t0 < POP_MS + 60) gh.push(ghostStones[i]);
  ghostStones = gh;
  const ffall = [];
  for (let i = 0; i < falls.length; i++) if (now - falls[i].t0 < (resDur || 110) + 60) ffall.push(falls[i]);
  falls = ffall;
  const keys = [];
  pops.forEach(function (t0, k) { if (now - t0 > POP_MS + 400) keys.push(k); });
  for (let i = 0; i < keys.length; i++) pops.delete(keys[i]);
  shake = Math.max(0, shake - dtSec * 26);
}

function mix(h, h2, f) {
  const A = parseInt(h.slice(1), 16), B = parseInt(h2.slice(1), 16);
  const r = Math.round(((A >> 16) & 255) * (1 - f) + ((B >> 16) & 255) * f);
  const g = Math.round(((A >> 8) & 255) * (1 - f) + ((B >> 8) & 255) * f);
  const b = Math.round((A & 255) * (1 - f) + (B & 255) * f);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function starPath(g, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = i * Math.PI / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.38;
    g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  g.closePath();
}

function drawGem(g, x, y, r, tier, scale, alpha) {
  scale = scale || 1;
  alpha = alpha === undefined ? 1 : alpha;
  const G = GEMS[tier - 1];
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.globalAlpha *= alpha;
  const sprite = sprites[tier - 1];
  if (sprite && (sheetReady || sprite.complete)) {
    g.shadowColor = G.glow;
    g.shadowBlur = r * 0.75;
    g.drawImage(sprite, -r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
    g.restore();
    return;
  }
  g.shadowColor = G.glow;
  g.shadowBlur = r * 0.55;
  let grad;
  if (tier === MAX_TIER) {
    grad = g.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, "#ff8fb2");
    grad.addColorStop(0.35, "#ffd76a");
    grad.addColorStop(0.68, "#8fd3ff");
    grad.addColorStop(1, "#c7a4ff");
  } else {
    grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.12, 0, 0, r);
    grad.addColorStop(0, mix(G.c, "#ffffff", 0.78));
    grad.addColorStop(0.55, G.c);
    grad.addColorStop(1, mix(G.c, "#000018", 0.45));
  }
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = Math.max(1, r * 0.06);
  g.strokeStyle = mix(G.c, "#000010", 0.5);
  g.beginPath();
  g.arc(0, 0, r - g.lineWidth * 0.5, 0, TAU);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.22)";
  poly(g, [[0, -r * 0.62], [r * 0.52, 0], [0, r * 0.62], [-r * 0.52, 0]]);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.ellipse(-r * 0.32, -r * 0.4, r * 0.24, r * 0.13, -0.7, 0, TAU);
  g.fill();
  const sp = 0.5 + 0.5 * Math.sin(now / 300 + tier * 1.7);
  g.save();
  g.translate(r * 0.4, -r * 0.38);
  g.rotate(now / 700 + tier);
  g.globalAlpha *= 0.5 + 0.5 * sp;
  g.fillStyle = "#ffffff";
  starPath(g, r * (0.13 + 0.08 * sp));
  g.fill();
  g.restore();
  if (tier >= 10) {
    g.save();
    g.rotate(now / (tier === MAX_TIER ? 500 : 900));
    g.strokeStyle = tier === MAX_TIER ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)";
    g.lineWidth = 1.6;
    g.setLineDash([r * 0.35, r * 0.3]);
    g.beginPath();
    g.arc(0, 0, r * 0.8, 0, TAU);
    g.stroke();
    g.restore();
  }
  g.restore();
}

function drawGhost(g, cells) {
  g.save();
  g.setLineDash([6, 6]);
  g.lineWidth = 2;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.r < 0) continue;
    g.strokeStyle = GEMS[cell.t - 1].glow + "55";
    g.beginPath();
    g.arc(cx(cell.c), cy(cell.r), CELL / 2 - 6, 0, TAU);
    g.stroke();
  }
  g.restore();
}

function backOut(k) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

function render() {
  const W = COLS * CELL, H = ROWS * CELL;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0e111c");
  bg.addColorStop(1, "#090a13");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke(); }
  for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke(); }

  if (state === "play" && pair && !dropping) {
    drawGhost(ctx, shifted(pair, 0, ghostRow()));
  }

  const fallMap = {};
  for (let i = 0; i < falls.length; i++) fallMap[falls[i].c + "," + falls[i].to] = falls[i];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = board[r][c];
      if (!t) continue;
      let yy = cy(r);
      const fl = fallMap[c + "," + r];
      if (fl) {
        const p = Math.min(1, Math.max(0, (now - fl.t0) / resDur));
        yy = cy(fl.from) + (yy - cy(fl.from)) * p;
      }
      let sc = 1;
      const t0 = pops.get(c + "," + r);
      if (t0 !== undefined) {
        const p = Math.min(1, (now - t0) / POP_MS);
        sc = 0.6 + 0.4 * p + 0.35 * Math.sin(p * Math.PI) * (1 - p * 0.6);
      }
      drawGem(ctx, cx(c), yy, CELL / 2 - 4, t, sc);
    }
  }

  for (let i = 0; i < ghostStones.length; i++) {
    const gs = ghostStones[i];
    const p = Math.min(1, (now - gs.t0) / POP_MS);
    drawGem(ctx, cx(gs.c), cy(gs.r), CELL / 2 - 4, gs.tier, 1 + p * 0.5, 1 - p);
  }

  if (state === "play" && pair) {
    const pos = getPairVisualPos(pair);
    let ix = pos.x, iy = pos.y;
    let ang = pair.at;
    const k = Math.min(1, Math.max(0, (now - pair.t0) / pair.dur));
    if (k < 1) {
      const s = pair.ease === "linear" ? k : pair.ease === "back" ? backOut(k) : 1 - Math.pow(1 - k, 3);
      ang = pair.af + (pair.at - pair.af) * s;
    }
    const pulse = 1.07 + 0.04 * Math.sin(now / 200);
    drawGem(ctx, ix, iy, CELL / 2 - 3, pair.a, pulse);
    drawGem(ctx, ix + Math.cos(ang) * CELL, iy + Math.sin(ang) * CELL, CELL / 2 - 3, pair.b, pulse);
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a * (p.type === "ring" ? 0.35 : 0.95);
    if (p.type === "dot") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    } else if (p.type === "star") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      starPath(ctx, p.size * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2.2 - a * 1.2) * 1.6, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    const p = (now - f.t0) / f.dur;
    ctx.save();
    ctx.globalAlpha = 1 - p * p;
    ctx.font = f.big ? "800 26px 'Segoe UI', sans-serif" : "700 15px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10,10,25,0.8)";
    ctx.strokeText(f.text, f.x, f.y - p * 40);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - p * 40);
    ctx.restore();
  }

  if (dangerLineAlpha > 0.005) {
    drawDangerLine(ctx, W, H, dangerLineAlpha);
  }
  ctx.restore();

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(4,4,18,0.3)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawNext();
}

function getHighestStoneRow() {
  if (!board) return ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) return r;
    }
  }
  return ROWS;
}

function drawDangerLine(g, W, H, alpha) {
  const lineY = 2 * CELL; // 100px - Límite de aviso
  const pulse = 0.5 + 0.5 * Math.sin(now / 180); // Respiración suave
  const combAlpha = alpha * (0.12 + 0.38 * pulse); // Opacidad tenue (0.12 a 0.50)

  g.save();

  // Resplandor muy sutil y línea fina y tenue
  g.shadowColor = "rgba(230, 50, 70, 0.35)";
  g.shadowBlur = 3 * pulse + 1;
  g.strokeStyle = `rgba(235, 65, 80, ${combAlpha})`;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, lineY);
  g.lineTo(W, lineY);
  g.stroke();

  g.restore();
}

function drawNext() {
  nctx.clearRect(0, 0, 96, 150);
  nctx.fillStyle = "#0c0e18";
  nctx.fillRect(0, 0, 96, 150);
  if (!nextPair) return;
  drawGem(nctx, 48, 42, 28, nextPair.a);
  drawGem(nctx, 48, 108, 28, nextPair.b);
}

function updateHUD() {
  elScore.textContent = score;
  elChain.textContent = "x" + lastChain;
  let bestT = 0;
  discovered.forEach(function (t) { if (t > bestT) bestT = t; });
  elBest.textContent = bestT ? GEMS[bestT - 1].name : "-";
  elDisc.textContent = discovered.size + "/" + MAX_TIER;
  for (let i = 0; i < codexItems.length; i++) {
    codexItems[i].classList.toggle("on", discovered.has(i + 1));
  }
}

function sfx(freq, dur, type, gain, slide) {
  if (typeof AudioSettings !== "undefined" && AudioSettings.sfxMuted) return;
  if (muted) return;
  const sfxVol = (typeof AudioSettings !== "undefined" && typeof AudioSettings.sfxVolume === "number") ? AudioSettings.sfxVolume : 1;
  if (sfxVol <= 0) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), ga = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
    ga.gain.setValueAtTime(gain * sfxVol, actx.currentTime);
    ga.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(ga);
    ga.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur);
  } catch (e) { }
}

function togglePause() {
  const mainMenu = document.getElementById("main-menu");
  if (mainMenu && !mainMenu.classList.contains("hidden")) return;
  if (state === "play") {
    state = "pause";
    ovPause.classList.remove("hidden");
  } else if (state === "pause") {
    state = "play";
    ovPause.classList.add("hidden");
  }
}

document.addEventListener("keydown", function (e) {
  const mainMenu = document.getElementById("main-menu");
  const optModal = document.getElementById("options-modal");
  const quitModal = document.getElementById("quit-modal");
  if ((mainMenu && !mainMenu.classList.contains("hidden")) ||
      (optModal && !optModal.classList.contains("hidden")) ||
      (quitModal && !quitModal.classList.contains("hidden"))) {
    if (e.code === "Escape" && typeof MainMenu !== "undefined") {
      if (optModal && !optModal.classList.contains("hidden")) MainMenu.closeOptions();
      if (quitModal && !quitModal.classList.contains("hidden")) MainMenu.closeQuit();
    }
    return;
  }
  const code = e.code;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].indexOf(code) >= 0) e.preventDefault();
  if (state === "over" && code === "Enter") { reset(); return; }
  switch (code) {
    case "ArrowLeft": move(-1); break;
    case "ArrowRight": move(1); break;
    case "ArrowUp": case "KeyX": rotate(1); break;
    case "KeyZ": rotate(-1); break;
    case "ArrowDown": case "Space": startDrop(); break;
    case "KeyP": togglePause(); break;
  }
});

document.getElementById("btnPause").addEventListener("click", togglePause);
document.getElementById("btnReset").addEventListener("click", reset);
document.getElementById("btnAgain").addEventListener("click", reset);
document.getElementById("btnSound").addEventListener("click", function () {
  if (typeof AudioSettings !== "undefined") {
    AudioSettings.toggleSfxMute();
  } else {
    muted = !muted;
    this.textContent = "Sonido: " + (muted ? "NO" : "SI");
  }
});

const musicEl = document.getElementById("music");
if (typeof AudioSettings !== "undefined") {
  musicEl.volume = AudioSettings.musicVolume;
} else {
  musicEl.volume = 0.35;
}
let musicOn = true;

function tryPlayMusic() {
  const mainMenu = document.getElementById("main-menu");
  if (mainMenu && !mainMenu.classList.contains("hidden")) return;
  const isMuted = (typeof AudioSettings !== "undefined") ? (AudioSettings.musicMuted || AudioSettings.musicVolume <= 0) : !musicOn;
  if (!isMuted && musicEl.paused) {
    musicEl.play().catch(function () { });
  }
}

document.addEventListener("keydown", tryPlayMusic);
document.addEventListener("pointerdown", tryPlayMusic);

document.getElementById("btnMusic").addEventListener("click", function () {
  if (typeof AudioSettings !== "undefined") {
    AudioSettings.toggleMusicMute();
    if (!AudioSettings.musicMuted && AudioSettings.musicVolume > 0 && musicEl.paused) {
      musicEl.play().catch(function () {});
    }
  } else {
    musicOn = !musicOn;
    if (musicOn) {
      tryPlayMusic();
    } else {
      musicEl.pause();
    }
    this.textContent = "Musica: " + (musicOn ? "SI" : "NO");
  }
});

const mcButtons = document.querySelectorAll("#mcontrols button");
for (let i = 0; i < mcButtons.length; i++) {
  mcButtons[i].addEventListener("pointerdown", function (e) {
    e.preventDefault();
    const act = this.getAttribute("data-act");
    if (act === "left") move(-1);
    else if (act === "right") move(1);
    else if (act === "rot") rotate(1);
    else if (act === "down" || act === "drop") startDrop();
  });
  mcButtons[i].addEventListener("pointerup", function () { });
  mcButtons[i].addEventListener("pointerleave", function () { });
}

window.addEventListener("blur", function () {
  if (state === "play") togglePause();
});

function loop(ts) {
    now = ts;
    const dt = Math.max(0, Math.min(50, ts - lastTs));
    lastTs = ts;
  if (state === "play" && dropping && pair) {
    if (now - pair.t0 >= pair.dur) {
      dropping = false;
      lockResolve();
    }
  }
  if (state === "play" && resPhase && !dropping) {
    const el = now - resT0;
    if (resPhase === "settle" && el >= 60) beginSettle();
    else if (resPhase === "pop" && el >= POP_MS) beginSettle();
    else if (resPhase === "fall" && el >= resDur) nextWave();
  }
  const highestRow = getHighestStoneRow();
  const danger = (state === "play" || state === "pause") && highestRow <= 4;
  Character.setDanger(danger);

  const targetAlpha = danger ? 1 : 0;
  dangerLineAlpha += (targetAlpha - dangerLineAlpha) * Math.min(1, (dt / 1000) * 8);

  updateFx(dt / 1000);
  render();
  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
