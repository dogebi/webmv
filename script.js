'use strict';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const DURATION = 10;
const VW = 1600, VH = 900, CX = VW / 2, CY = VH / 2;
const KR = '"Noto Sans KR", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const C = {
  bg: '#020605', panel: '#07110d', ink: '#d9ebe1', muted: '#769187', line: '#294237',
  green: '#20ff91', amber: '#f0b941', blue: '#7eaeff', cyan: '#60d9ff',
};
const SCENES = [0, 2.0, 4.1, 6.2, 8.2];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Source: dogebi.github.io/macsilcon — illustrative index (M1 = 100), not lab benchmarks.
const CHIPS = [
  ['M1', 2020, [100, 100, 100, 100, 100]],
  ['M1 Pro', 2021, [125, 135, 140, 130, 120]],
  ['M1 Max', 2021, [130, 180, 190, 150, 150]],
  ['M1 Ultra', 2022, [135, 260, 300, 220, 240]],
  ['M2', 2022, [115, 115, 120, 110, 115]],
  ['M2 Pro', 2023, [145, 160, 165, 145, 140]],
  ['M2 Max', 2023, [150, 210, 225, 170, 180]],
  ['M2 Ultra', 2023, [155, 300, 345, 250, 280]],
  ['M3', 2023, [135, 135, 145, 130, 145]],
  ['M3 Pro', 2023, [160, 180, 195, 160, 170]],
  ['M3 Max', 2023, [170, 240, 270, 195, 220]],
  ['M3 Ultra', 2025, [180, 340, 400, 290, 340]],
  ['M4', 2024, [155, 155, 170, 150, 180]],
  ['M4 Pro', 2024, [185, 215, 235, 190, 220]],
  ['M4 Max', 2024, [195, 285, 325, 235, 285]],
  ['M5', 2025, [175, 175, 195, 170, 210]],
  ['M5 Pro', 2025, [210, 245, 275, 215, 255]],
  ['M5 Max', 2025, [225, 320, 365, 265, 330]],
  ['M6', 2026, [210, 210, 250, 187, 420]],
].map(([name, year, m]) => ({ name, year, m, avg: Math.round(m.reduce((a, b) => a + b, 0) / 5) }));

const MODULES = [
  { key: 'CPU', ko: 'CPU 클러스터', en: 'CPU CLUSTER', color: C.green, m6: '12 CORE' },
  { key: 'GPU', ko: 'GPU 어레이', en: 'GPU ARRAY', color: C.amber, m6: '12 CORE' },
  { key: 'NPU', ko: '뉴럴 엔진', en: 'NEURAL ENGINE', color: C.green, m6: 'DUAL 16 CORE' },
  { key: 'MEM', ko: '통합 메모리', en: 'UNIFIED MEMORY', color: C.blue, m6: '153 / 170 GB/s' },
  { key: 'MED', ko: '미디어 엔진', en: 'MEDIA ENGINE', color: C.blue, m6: 'AV1 / PRORES' },
];
const METRICS = ['CPU SINGLE', 'CPU MULTI', 'GPU GRAPHICS', 'MEMORY BW', 'AI COMPUTE'];

let W = 0, H = 0, DPR = 1, K = 1, OX = 0, OY = 0;
let start = 0;
let scanlines = null;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInCubic = t => t * t * t;
const easeOutBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

// Deterministic per-frame noise so glitches look the same on every replay.
const hash = n => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function text(str, x, y, { font = `500 20px ${MONO}`, color = C.ink, alpha = 1, align = 'center', base = 'middle', blur = 0, glow = 0, sx = 1, sy = 1, rot = 0 } = {}) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.globalAlpha = clamp(alpha);
  if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// Reveals a string character by character with a block cursor, like a terminal.
function typed(str, x, y, p, opts = {}) {
  const n = Math.floor(str.length * clamp(p));
  if (n <= 0 && p <= 0) return;
  text(str.slice(0, n), x, y, { align: 'left', ...opts });
  if (p < 1 && p > 0) {
    ctx.save();
    ctx.font = opts.font || `500 20px ${MONO}`;
    const w = ctx.measureText(str.slice(0, n)).width;
    ctx.restore();
    const size = parseInt((opts.font || '20px').match(/(\d+)px/)[1], 10);
    ctx.globalAlpha = clamp(opts.alpha ?? 1);
    ctx.fillStyle = opts.color || C.green;
    ctx.fillRect(x + w + 3, y - size * 0.5, size * 0.55, size);
    ctx.globalAlpha = 1;
  }
}

// Each glyph drops in from above with blur, staggered: kinetic headline type.
function kinetic(str, x, y, t0, t, { size = 96, weight = 900, color = C.ink, stagger = 0.035, dur = 0.55, alpha = 1, accent = -1, accentColor = C.green } = {}) {
  const font = `${weight} ${size}px ${KR}`;
  ctx.save();
  ctx.font = font;
  const chars = [...str];
  const widths = chars.map(ch => ctx.measureText(ch).width);
  ctx.restore();
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = x - total / 2;
  chars.forEach((ch, i) => {
    const k = easeOutExpo(seg(t, t0 + i * stagger, t0 + i * stagger + dur));
    const w = widths[i];
    text(ch, cx + w / 2, y - (1 - k) * 70, {
      font,
      color: i >= accent && accent >= 0 ? accentColor : color,
      alpha: k * alpha,
      blur: (1 - k) * 16,
      sy: lerp(1.6, 1, k),
    });
    cx += w;
  });
  return total;
}

function panel(x, y, w, h, alpha, color = C.line) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const c = 10;
  ctx.strokeStyle = color === C.line ? C.green : color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(px, py + dy * c);
    ctx.lineTo(px, py);
    ctx.lineTo(px + dx * c, py);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---------- background ---------- */

function drawBackground(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, `rgba(32,255,145,${0.07 + 0.03 * Math.sin(t * 2)})`);
  g.addColorStop(1, 'rgba(2,6,5,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function useStage(zoom, dx = 0, dy = 0) {
  const k = K * zoom;
  ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * (OX + K * CX * (1 - zoom) + dx * K), DPR * (OY + K * CY * (1 - zoom) + dy * K));
}

function drawGrid(t, alpha) {
  if (alpha <= 0) return;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  const off = (t * 24) % 50;
  ctx.globalAlpha = alpha * 0.45;
  ctx.beginPath();
  for (let x = -50 + off; x < VW + 50; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VH);
  }
  for (let y = 0; y < VH; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(VW, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---------- HUD: the site's status bar ---------- */

function drawHud(t, alpha) {
  if (alpha <= 0) return;
  const y = 46;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, y + 22);
  ctx.lineTo(VW - 60, y + 22);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const items = [['프로세스', 'chip_runtime'], ['세대', '6'], ['모듈', '5'], ['상태', '온라인']];
  let x = 60;
  items.forEach(([k, v], i) => {
    const p = seg(t, 0.15 + i * 0.12, 0.55 + i * 0.12);
    text(k, x, y, { font: `500 14px ${KR}`, color: C.muted, align: 'left', alpha: alpha * p });
    ctx.font = `500 14px ${KR}`;
    const kw = ctx.measureText(k).width;
    typed(v, x + kw + 10, y, p, { font: `700 14px ${MONO}`, color: i === 3 ? C.green : C.ink, alpha });
    x += 260;
  });
  const blink = Math.sin(t * 9) > 0 ? 1 : 0.25;
  ctx.globalAlpha = alpha * blink;
  ctx.fillStyle = C.green;
  ctx.beginPath();
  ctx.arc(VW - 72, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  text('SILICON ATLAS', VW - 88, y, { font: `700 14px ${MONO}`, color: C.ink, align: 'right', alpha: alpha * seg(t, 0.3, 0.7) });
}

/* ---------- scene 1: boot + title ---------- */

const BOOT = [
  '> init chip_runtime --generations 6',
  '> load modules [CPU, GPU, NEURAL, MEMORY, MEDIA]',
  '> registry: 19 apple silicon models ... OK',
];

function drawBoot(t) {
  if (t > 2.3) return;
  const out = easeInCubic(seg(t, 1.75, 2.2));
  const a = 1 - out;
  BOOT.forEach((line, i) => {
    const p = seg(t, 0.1 + i * 0.28, 0.45 + i * 0.28);
    typed(line, 160, 190 + i * 34, p, { font: `400 19px ${MONO}`, color: i === 2 && p >= 1 ? C.green : C.muted, alpha: a });
  });
  kinetic('Mac 칩', CX, CY + 30 - out * 60, 0.75, t, { size: 150, alpha: a });
  kinetic('런타임 맵.', CX, CY + 190 - out * 60, 0.95, t, { size: 150, alpha: a, accent: 0, accentColor: C.green });
  const sub = seg(t, 1.25, 1.55);
  text('Apple Silicon 세대별 CPU, GPU, Neural, Memory, Media 경로를 추적합니다.', CX, CY + 300, {
    font: `500 22px ${KR}`, color: C.muted, alpha: sub * a,
  });
}

/* ---------- scene 2: die assembly ---------- */

// Die layout in die-local coordinates; each module flies in from off-die.
const DIE = { x: CX - 290, y: CY - 230, w: 580, h: 460 };
const SLOTS = [
  { x: 24, y: 24, w: 250, h: 190, from: [-900, -300] },
  { x: 290, y: 24, w: 266, h: 300, from: [900, -350] },
  { x: 24, y: 230, w: 250, h: 94, from: [-900, 200] },
  { x: 24, y: 340, w: 360, h: 96, from: [-300, 700] },
  { x: 400, y: 340, w: 156, h: 96, from: [800, 600] },
];

function moduleCells(m, s, x, y, k, t) {
  const cols = m.key === 'GPU' ? 6 : m.key === 'CPU' ? 4 : m.key === 'NPU' ? 8 : 0;
  if (!cols) {
    ctx.globalAlpha = k * 0.5;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const lanes = m.key === 'MEM' ? 9 : 4;
    for (let i = 1; i <= lanes; i++) {
      const lx = x + (s.w * i) / (lanes + 1);
      ctx.moveTo(lx, y + 12);
      ctx.lineTo(lx, y + s.h - 12);
    }
    ctx.stroke();
    const pulse = ((t * 1.6) % 1) * (s.h - 24);
    ctx.globalAlpha = k * 0.9;
    ctx.fillStyle = m.color;
    for (let i = 1; i <= lanes; i++) ctx.fillRect(x + (s.w * i) / (lanes + 1) - 2, y + 12 + ((pulse + i * 17) % (s.h - 24)), 4, 8);
    ctx.globalAlpha = 1;
    return;
  }
  const rows = m.key === 'NPU' ? 2 : m.key === 'CPU' ? 3 : 5;
  const pad = 14, gap = 6;
  const cw = (s.w - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (s.h - pad * 2 - 26 - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const lit = hash(i + Math.floor(t * 8) * 31 + m.key.length) > 0.55;
      ctx.globalAlpha = k * (lit ? 0.85 : 0.28);
      ctx.fillStyle = m.color;
      ctx.fillRect(x + pad + c * (cw + gap), y + pad + 26 + r * (ch + gap), cw, ch);
    }
  }
  ctx.globalAlpha = 1;
}

function drawDie(t) {
  if (t < 1.9 || t > 4.35) return;
  const out = easeInOutCubic(seg(t, 3.85, 4.3));
  const a = 1 - seg(t, 4.0, 4.3);
  const shell = easeOutExpo(seg(t, 1.95, 2.45));

  ctx.save();
  ctx.translate(CX, CY);
  ctx.scale(lerp(1, 0.18, out), lerp(1, 0.18, out));
  ctx.rotate(out * 0.5);
  ctx.translate(-CX, -CY);

  // Package pins around the die.
  ctx.globalAlpha = shell * a * 0.7;
  ctx.fillStyle = C.line;
  for (let i = 0; i < 18; i++) {
    const px = DIE.x + 20 + i * 30;
    ctx.fillRect(px, DIE.y - 22, 10, 14);
    ctx.fillRect(px, DIE.y + DIE.h + 8, 10, 14);
  }
  for (let i = 0; i < 14; i++) {
    const py = DIE.y + 20 + i * 30;
    ctx.fillRect(DIE.x - 22, py, 14, 10);
    ctx.fillRect(DIE.x + DIE.w + 8, py, 14, 10);
  }
  ctx.globalAlpha = 1;

  const dw = DIE.w * shell, dh = DIE.h * shell;
  panel(CX - dw / 2, CY - dh / 2, dw, dh, a * shell, C.green);

  MODULES.forEach((m, i) => {
    const s = SLOTS[i];
    const k = easeOutBack(seg(t, 2.2 + i * 0.13, 2.75 + i * 0.13));
    const kk = clamp(k);
    const x = DIE.x + s.x + s.from[0] * (1 - k);
    const y = DIE.y + s.y + s.from[1] * (1 - k);
    ctx.globalAlpha = kk * a;
    ctx.fillStyle = 'rgba(2,6,5,0.85)';
    ctx.fillRect(x, y, s.w, s.h);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, s.w, s.h);
    ctx.globalAlpha = 1;
    moduleCells(m, s, x, y, kk * a, t);
    text(m.en, x + 12, y + 18, { font: `700 13px ${MONO}`, color: m.color, align: 'left', alpha: kk * a });
  });

  // Lock flash once every module has docked.
  const lock = seg(t, 3.15, 3.5);
  if (lock > 0 && lock < 1) {
    ctx.globalAlpha = (1 - lock) * 0.5 * a;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 3 + 10 * (1 - lock);
    const g = 30 * lock;
    ctx.strokeRect(DIE.x - g, DIE.y - g, DIE.w + g * 2, DIE.h + g * 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Side captions with Korean module names.
  MODULES.forEach((m, i) => {
    const p = seg(t, 2.5 + i * 0.12, 2.85 + i * 0.12) * (1 - seg(t, 3.75, 3.95));
    const right = i === 1 || i === 4;
    const x = right ? DIE.x + DIE.w + 70 : DIE.x - 70;
    const y = DIE.y + 60 + i * 80;
    ctx.globalAlpha = p;
    ctx.fillStyle = m.color;
    ctx.fillRect(right ? x - 40 : x + 10, y - 1, 30 * p, 2);
    ctx.globalAlpha = 1;
    text(m.ko, x + (right ? 0 : 0), y, { font: `700 26px ${KR}`, color: C.ink, align: right ? 'left' : 'right', alpha: p });
    text(`0${i + 1}`, x, y + 28, { font: `500 13px ${MONO}`, color: m.color, align: right ? 'left' : 'right', alpha: p });
  });

  const head = seg(t, 2.0, 2.3) * (1 - seg(t, 3.75, 3.95));
  text('UNIFIED ARCHITECTURE · 5 MODULES', CX, 120, { font: `700 18px ${MONO}`, color: C.green, alpha: head, glow: 12 });
  text('하나의 칩, 다섯 개의 모듈', CX, VH - 80, { font: `700 30px ${KR}`, color: C.ink, alpha: head });
}

/* ---------- scene 3: lineup graph ---------- */

function drawLineup(t) {
  if (t < 4.05 || t > 6.45) return;
  const a = 1 - seg(t, 6.0, 6.4);
  const left = 150, right = VW - 110, base = 700, top = 260;
  const bw = (right - left) / CHIPS.length;
  const maxAvg = 300;

  kinetic('전체 실리콘 라인업.', CX, 140, 4.1, t, { size: 64, alpha: a, accent: 3 });
  text('19 MODELS · M1 → M6 · 2020 → 2026', CX, 200, { font: `500 16px ${MONO}`, color: C.muted, alpha: seg(t, 4.35, 4.6) * a });

  const axis = easeOutExpo(seg(t, 4.15, 4.6));
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left - 20, base);
  ctx.lineTo(left - 20 + (right - left + 40) * axis, base);
  for (const v of [100, 200, 300]) {
    const y = base - ((base - top) * v) / maxAvg;
    ctx.moveTo(left - 20, y);
    ctx.lineTo(left - 20 + (right - left + 40) * axis, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const v of [100, 200, 300]) {
    text(String(v), left - 30, base - ((base - top) * v) / maxAvg, { font: `500 12px ${MONO}`, color: C.muted, align: 'right', alpha: axis * a });
  }

  let peak = 0;
  CHIPS.forEach((c, i) => {
    if (c.avg > CHIPS[peak].avg) peak = i;
  });

  let prevX = 0, prevY = 0;
  CHIPS.forEach((c, i) => {
    const k = easeOutExpo(seg(t, 4.35 + i * 0.045, 5.0 + i * 0.045));
    const h = ((base - top) * c.avg) / maxAvg * k;
    const x = left + i * bw + bw * 0.18;
    const w = bw * 0.64;
    const tier = c.name.split(' ')[1] || '';
    const color = tier === 'Ultra' ? C.amber : tier === 'Max' ? C.cyan : tier === 'Pro' ? C.blue : C.green;
    ctx.globalAlpha = a * (0.35 + 0.65 * k);
    ctx.fillStyle = color;
    ctx.fillRect(x, base - h, w, h);
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, base - h, w, 2);
    ctx.globalAlpha = 1;
    text(c.name, x + w / 2, base + 16, { font: `500 12px ${MONO}`, color: i === peak ? C.amber : C.ink, align: 'right', alpha: k * a, rot: -Math.PI / 4 });
    if (k > 0.85) text(String(Math.round(c.avg * k)), x + w / 2, base - h - 14, { font: `700 12px ${MONO}`, color, alpha: a * seg(k, 0.85, 1) });
    // Trend line connecting bar tops.
    const tx = x + w / 2, ty = base - h;
    if (i > 0 && k > 0) {
      ctx.globalAlpha = a * k * 0.5;
      ctx.strokeStyle = C.ink;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    prevX = tx;
    prevY = ty;
  });

  const legend = seg(t, 5.2, 5.5) * a;
  [['BASE', C.green], ['PRO', C.blue], ['MAX', C.cyan], ['ULTRA', C.amber]].forEach(([l, col], i) => {
    const x = CX - 230 + i * 120;
    ctx.globalAlpha = legend;
    ctx.fillStyle = col;
    ctx.fillRect(x, VH - 72, 14, 14);
    ctx.globalAlpha = 1;
    text(l, x + 22, VH - 65, { font: `500 14px ${MONO}`, color: C.ink, align: 'left', alpha: legend });
  });
  text('평균 지수 · ILLUSTRATIVE INDEX / NOT LAB BENCHMARK', CX, VH - 32, { font: `500 13px ${KR}`, color: C.muted, alpha: legend });
}

/* ---------- scene 4: knowledge map ---------- */

function drawMap(t) {
  if (t < 6.15 || t > 8.45) return;
  const a = 1 - seg(t, 8.0, 8.4);
  const orb = easeOutBack(seg(t, 6.2, 6.7));
  const spin = t * 0.25;

  // Outer ring: all 19 models orbiting the central silicon node.
  CHIPS.forEach((c, i) => {
    const k = easeOutExpo(seg(t, 6.35 + i * 0.03, 6.9 + i * 0.03));
    const ang = (i / CHIPS.length) * Math.PI * 2 + spin;
    const r = 395 * k;
    const x = CX + Math.cos(ang) * r * 1.25, y = CY + 20 + Math.sin(ang) * r * 0.72;
    const isM6 = c.name === 'M6';
    ctx.globalAlpha = a * k * 0.25;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CX, CY + 20);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = a * k;
    ctx.fillStyle = isM6 ? C.green : C.muted;
    ctx.beginPath();
    ctx.arc(x, y, isM6 ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    text(c.name, x, y - 14, { font: `${isM6 ? 700 : 500} ${isM6 ? 15 : 12}px ${MONO}`, color: isM6 ? C.green : C.muted, alpha: a * k });
  });

  // Inner paths: central orb to the five module cards for M6.
  const cardPos = [[-470, -150], [470, -150], [0, -260], [-470, 190], [470, 190]];
  MODULES.forEach((m, i) => {
    const k = easeOutExpo(seg(t, 6.7 + i * 0.12, 7.2 + i * 0.12));
    const [dx, dy] = cardPos[i];
    const ex = CX + dx * k, ey = CY + 20 + dy * k;
    ctx.globalAlpha = a * k;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CX, CY + 20);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Data pulse travelling along the path.
    const u = ((t * 1.3 + i * 0.2) % 1);
    ctx.fillStyle = m.color;
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(lerp(CX, ex, u), lerp(CY + 20, ey, u), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    const cw = 230, ch = 78;
    panel(ex - cw / 2, ey - ch / 2, cw, ch, a * k, m.color);
    text(m.ko, ex - cw / 2 + 14, ey - 14, { font: `700 18px ${KR}`, color: C.ink, align: 'left', alpha: a * k });
    text(m.m6, ex - cw / 2 + 14, ey + 16, { font: `700 16px ${MONO}`, color: m.color, align: 'left', alpha: a * k });
    text(String(CHIPS[18].m[i]), ex + cw / 2 - 14, ey + 16, { font: `700 22px ${MONO}`, color: m.color, align: 'right', alpha: a * k });
  });

  // Central orb.
  const r = 70 * orb;
  if (r > 0) {
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(CX, CY + 20, 0, CX, CY + 20, r * 2.2);
    g.addColorStop(0, 'rgba(32,255,145,0.55)');
    g.addColorStop(1, 'rgba(32,255,145,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY + 20, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY + 20, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = a * 0.6;
    ctx.beginPath();
    ctx.arc(CX, CY + 20, r + 12 + Math.sin(t * 6) * 4, spin * 3, spin * 3 + Math.PI * 1.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    text('M6', CX, CY + 8, { font: `700 40px ${MONO}`, color: C.green, alpha: a * orb, glow: 16 });
    text(`평균 지수 ${CHIPS[18].avg}`, CX, CY + 46, { font: `500 13px ${KR}`, color: C.ink, alpha: a * orb });
  }

  const title = seg(t, 6.25, 6.55);
  text('하나의 칩, 열아홉 개의 경로.', CX, 90, { font: `900 46px ${KR}`, color: C.ink, alpha: title * a });
  text('KNOWLEDGE MAP', CX, 135, { font: `500 15px ${MONO}`, color: C.green, alpha: title * a });
}

/* ---------- scene 5: compare + outro ---------- */

function drawCompare(t) {
  if (t < 8.15) return;
  const fade = 1 - seg(t, 9.65, 9.98);
  const shift = easeInOutCubic(seg(t, 9.15, 9.5));
  const A = CHIPS[0], B = CHIPS[18];

  const head = easeOutExpo(seg(t, 8.2, 8.6));
  text('비교 콘솔', CX, 110 - shift * 30, { font: `500 16px ${KR}`, color: C.green, alpha: head * fade * (1 - shift) });
  text('M1', CX - 90, 175 - (1 - head) * 40, { font: `700 64px ${MONO}`, color: C.muted, alpha: head * fade * (1 - shift), align: 'right' });
  text('VS', CX, 175, { font: `700 26px ${MONO}`, color: C.ink, alpha: head * fade * (1 - shift) });
  text('M6', CX + 90, 175 + (1 - head) * 40, { font: `700 64px ${MONO}`, color: C.green, alpha: head * fade * (1 - shift), align: 'left', glow: 18 });

  const left = 420, maxW = 860, maxV = 420;
  METRICS.forEach((name, i) => {
    const k = easeOutExpo(seg(t, 8.4 + i * 0.08, 9.0 + i * 0.08));
    const y = 270 + i * 92;
    const alpha = k * fade * (1 - shift);
    text(name, left - 30, y + 14, { font: `700 15px ${MONO}`, color: C.ink, align: 'right', alpha });
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = C.line;
    ctx.fillRect(left, y, maxW, 12);
    ctx.fillStyle = C.muted;
    ctx.fillRect(left, y, (maxW * A.m[i] * k) / maxV, 12);
    ctx.fillStyle = MODULES[Math.min(i, 4)].color;
    ctx.fillRect(left, y + 18, (maxW * B.m[i] * k) / maxV, 12);
    ctx.globalAlpha = 1;
    text(String(Math.round(A.m[i] * k)), left + (maxW * A.m[i] * k) / maxV + 10, y + 6, { font: `500 13px ${MONO}`, color: C.muted, align: 'left', alpha });
    text(String(Math.round(B.m[i] * k)), left + (maxW * B.m[i] * k) / maxV + 10, y + 24, { font: `700 15px ${MONO}`, color: MODULES[Math.min(i, 4)].color, align: 'left', alpha });
    if (i === 4 && k > 0.95) {
      text(`×${(B.m[i] / A.m[i]).toFixed(1)}`, left + maxW + 30, y + 16, { font: `700 30px ${MONO}`, color: C.green, align: 'left', alpha: alpha * seg(t, 9.0, 9.1), glow: 14 });
    }
  });
  text('* 참조값은 세대 차이를 시각적으로 비교하기 위한 값이며 실험실 벤치마크가 아닙니다.', CX, VH - 60, {
    font: `500 14px ${KR}`, color: C.muted, alpha: seg(t, 8.8, 9.0) * fade * (1 - shift),
  });

  // Outro lockup.
  if (shift > 0) {
    kinetic('SILICON ATLAS', CX, CY - 40, 9.2, t, { size: 110, weight: 900, alpha: fade, stagger: 0.02, dur: 0.4 });
    const s = seg(t, 9.4, 9.6);
    const bw = 520 * easeOutExpo(s);
    ctx.globalAlpha = fade;
    ctx.fillStyle = C.green;
    ctx.fillRect(CX - bw / 2, CY + 30, bw, 4);
    ctx.globalAlpha = 1;
    text('Mac 칩 런타임 맵 · M1 → M6 · 19 MODELS · 5 MODULES', CX, CY + 80, { font: `500 18px ${KR}`, color: C.ink, alpha: s * fade });
    text('dogebi.github.io/macsilcon', CX, CY + 118, { font: `500 15px ${MONO}`, color: C.green, alpha: s * fade });
  }
}

/* ---------- transitions + CRT finish ---------- */

function glitchAmount(t) {
  let g = 0;
  for (const s of SCENES.slice(1)) g = Math.max(g, 1 - Math.abs(t - s) / 0.12);
  return clamp(g);
}

function drawGlitch(t, g) {
  if (g <= 0) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const frame = Math.floor(t * 40);
  for (let i = 0; i < 7; i++) {
    const y = hash(frame * 7 + i) * H;
    const h = 4 + hash(frame * 13 + i) * 34;
    const dx = (hash(frame * 3 + i) - 0.5) * 120 * g;
    ctx.drawImage(canvas, 0, y * DPR, W * DPR, h * DPR, dx, y, W, h);
    ctx.globalAlpha = 0.25 * g;
    ctx.fillStyle = i % 2 ? C.green : C.cyan;
    ctx.fillRect(0, y, W, 2);
    ctx.globalAlpha = 1;
  }
}

function buildScanlines() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const o = c.getContext('2d');
  o.fillStyle = 'rgba(0,0,0,0.28)';
  o.fillRect(0, 2, 4, 2);
  scanlines = ctx.createPattern(c, 'repeat');
}

function drawFinish(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (scanlines) {
    ctx.fillStyle = scanlines;
    ctx.fillRect(0, 0, W, H);
  }
  const roll = ((t * 0.35) % 1) * (H + 200) - 100;
  const band = ctx.createLinearGradient(0, roll - 100, 0, roll + 100);
  band.addColorStop(0, 'rgba(32,255,145,0)');
  band.addColorStop(0.5, 'rgba(32,255,145,0.04)');
  band.addColorStop(1, 'rgba(32,255,145,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, roll - 100, W, 200);
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  // CRT power-on and power-off.
  const on = seg(t, 0, 0.25), off = seg(t, 9.8, 10);
  if (on < 1 || off > 0) {
    const open = on < 1 ? easeOutExpo(on) : 1 - easeInCubic(off);
    const gap = (H / 2) * open;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H / 2 - gap);
    ctx.fillRect(0, H / 2 + gap, W, H / 2 - gap);
    ctx.globalAlpha = 1 - open;
    ctx.fillStyle = C.green;
    ctx.fillRect(0, H / 2 - 1, W, 2);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(217,235,225,0.1)';
  ctx.fillRect(0, H - 3, W, 3);
  ctx.fillStyle = C.green;
  ctx.fillRect(0, H - 3, W * (t / DURATION), 3);
  const idx = SCENES.filter(s => t >= s).length;
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = 'rgba(118,145,135,0.9)';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(`0${idx} / 05`, 20, H - 14);
  ctx.textAlign = 'right';
  ctx.fillText('WEBMCP 지원 · 모션 감소 지원', W - 20, H - 14);
}

function render(t) {
  drawBackground(t);
  const g = glitchAmount(t);
  const dx = g ? (hash(Math.floor(t * 60)) - 0.5) * 18 * g : 0;
  useStage(1 + 0.04 * Math.sin((Math.PI * t) / DURATION), dx, 0);
  drawGrid(t, 0.6 + 0.4 * seg(t, 0.3, 1));
  drawHud(t, seg(t, 0.1, 0.4) * (1 - seg(t, 9.2, 9.5)));
  drawBoot(t);
  drawDie(t);
  drawLineup(t);
  drawMap(t);
  drawCompare(t);
  drawGlitch(t, g);
  drawFinish(t);
}

function frame(now) {
  render(((now - start) / 1000) % DURATION);
  requestAnimationFrame(frame);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  K = Math.min(W / VW, H / VH);
  OX = (W - VW * K) / 2;
  OY = (H - VH * K) / 2;
  buildScanlines();
  if (reduceMotion) render(9.1);
}

async function boot() {
  resize();
  window.addEventListener('resize', resize);
  const sample = 'Mac칩런타임맵전체실리콘라인업하나의칩열아홉개경로비교콘솔클러스터어레이뉴럴엔진통합메모리미디어 SILICONATLAS0123456789';
  try {
    await Promise.race([
      Promise.all([`900 100px ${KR}`, `700 100px ${KR}`, `500 100px ${KR}`, `700 100px ${MONO}`, `500 100px ${MONO}`, `400 100px ${MONO}`]
        .map(f => document.fonts.load(f, sample))),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch {
    // Fall back to system fonts if the webfonts can't load.
  }
  if (reduceMotion) {
    render(9.1);
    return;
  }
  canvas.addEventListener('click', () => { start = performance.now(); });
  start = performance.now();
  requestAnimationFrame(frame);
}

boot();
