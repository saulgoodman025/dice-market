// 픽셀 이펙트 엔진: 화면 위 저해상도 캔버스(1 아트 픽셀 = PX CSS 픽셀)에 하드 컬러 스텝 + 디더 페이드로 그린다.
// 빛은 따로 부드러운 캔버스에 'screen'으로 겹쳐 픽셀은 또렷하고 광원만 번진다.
import { fxRandom } from '../../core/rng';

export const PX = 2; // 아트 픽셀 크기 (CSS px). 3 이상은 투박하고 1은 픽셀 느낌이 사라진다

type Col = number; // 0xAABBGGRR (ImageData 리틀엔디언)
const hex = (h: string): Col => {
  const n = parseInt(h.slice(1), 16);
  return (0xff << 24 | (n & 255) << 16 | ((n >> 8) & 255) << 8 | (n >> 16)) >>> 0;
};
const ramp = (...hs: string[]) => hs.map(hex);
/** 어두움 → 밝음 */
export const RAMP = {
  steel: ramp('#1c2340', '#2f4f8f', '#3f7fd6', '#7fc0ff', '#d8f0ff', '#ffffff'),
  gold: ramp('#4a2608', '#8a4b0c', '#d18a14', '#f5c542', '#fff09a', '#ffffff'),
  blood: ramp('#2a0610', '#6b0f1e', '#b8202e', '#ff4b4b', '#ffb0a0', '#ffffff'),
  poison: ramp('#0e2410', '#1f5a1c', '#3f9a2a', '#8fe04a', '#d8ff9a', '#ffffff'),
  heal: ramp('#0b2a24', '#16614c', '#25b07a', '#5cf0a8', '#c8ffe4', '#ffffff'),
  arcane: ramp('#1a0c33', '#43207a', '#7a3fd0', '#b98cff', '#ead8ff', '#ffffff'),
  ivory: ramp('#3a2a1a', '#7a6248', '#c8b08a', '#efe2c4', '#fff8e8', '#ffffff'),
  chip: ramp('#33060f', '#7d1028', '#d42a4a', '#ff7a92', '#ffd6de', '#ffffff'),
  fire: ramp('#2a0a04', '#7a1a06', '#d0440c', '#ff9a1a', '#ffe066', '#ffffff'),
};
export type RampName = keyof typeof RAMP;
const RAINBOW = ['#ff4b4b', '#ff9a1a', '#ffe066', '#5cf0a8', '#4aa3ff', '#b98cff'].map(hex);
const INK = hex('#120d16');
const WHITE = hex('#ffffff');
const at = (r: Col[], t: number) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const R = (a: number, b: number) => a + fxRandom() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(fxRandom() * xs.length)];
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const TAU = Math.PI * 2;

// ───────────── 그리기 면 ─────────────
class Surface {
  w = 0; h = 0;
  buf = new Uint32Array(0);
  img: ImageData | null = null;
  lg: CanvasRenderingContext2D | null = null; // 빛 레이어 (아트 픽셀 좌표 그대로)

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  put(x: number, y: number, c: Col, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    if (a < 1 && a <= BAYER[((y & 3) << 2) | (x & 3)]) return;
    this.buf[y * this.w + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: Col, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Col, a = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a);
  }
  disc(cx: number, cy: number, r: number, c: Col | ((d: number) => Col), a = 1) {
    const ri = Math.ceil(r);
    for (let y = -ri; y <= ri; y++) for (let x = -ri; x <= ri; x++) {
      const d = Math.hypot(x, y) / Math.max(0.5, r);
      if (d <= 1) this.put(cx + x, cy + y, typeof c === 'number' ? c : c(d), a);
    }
  }
  ring(cx: number, cy: number, r: number, th: number, c: Col, a = 1) {
    const ro = Math.ceil(r + 1);
    for (let y = -ro; y <= ro; y++) for (let x = -ro; x <= ro; x++) {
      const d = Math.hypot(x, y);
      if (d <= r && d > r - th) this.put(cx + x, cy + y, c, a);
    }
  }
  /** 빛: 부드러운 원형 광원 (screen 합성) */
  glow(x: number, y: number, r: number, color: string, k = 1) {
    const g = this.lg;
    if (!g || k <= 0.01) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'transparent');
    g.globalAlpha = Math.min(1, k);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
}

// ───────────── 파티클 ─────────────
type Kind = 'spark' | 'ember' | 'chunk' | 'puff' | 'sprite';
type Draw = (s: Surface, x: number, y: number, life: number, p: Part) => void;
interface Part {
  k: Kind; x: number; y: number; vx: number; vy: number; g: number; drag: number;
  age: number; life: number; ramp: Col[]; c: Col; size: number; floor?: number; spin: number;
  draw?: Draw; home?: { x: number; y: number; t0: number; done?: () => void }; delay: number;
}

function part(o: Partial<Part> & { x: number; y: number }): Part {
  return { k: 'spark', vx: 0, vy: 0, g: 0, drag: 0, age: 0, life: 0.5, ramp: RAMP.gold, c: WHITE, size: 1, spin: R(0, TAU), delay: 0, ...o };
}

function stepPart(p: Part, dt: number): boolean {
  if (p.delay > 0) { p.delay -= dt; return true; }
  p.age += dt;
  if (p.home && p.age >= p.home.t0) {
    // 목표(골드·칩 카운터)로 빨려 들어간다
    const k = Math.min(1, 1 - Math.exp(-(6 + (p.age - p.home.t0) * 30) * dt));
    p.x += (p.home.x - p.x) * k;
    p.y += (p.home.y - p.y) * k;
    if (Math.hypot(p.home.x - p.x, p.home.y - p.y) < 2 || p.age > 3) { p.home.done?.(); return false; }
    return true;
  }
  p.vy += p.g * dt;
  const d = Math.pow(1 - p.drag, dt * 60);
  p.vx *= d; p.vy *= d;
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.floor !== undefined && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; }
  p.spin += dt * 9;
  return p.age < p.life || !!p.home;
}

function drawPart(s: Surface, p: Part) {
  if (p.delay > 0) return;
  const l = Math.min(1, p.age / p.life); // 0 → 1
  switch (p.k) {
    case 'spark': {
      // 속도 방향으로 꼬리가 달린 불꽃: 머리는 밝고 꼬리는 어둡게
      const len = Math.min(6, Math.hypot(p.vx, p.vy) * 0.025 + 1);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const tx = p.x - (p.vx / sp) * len, ty = p.y - (p.vy / sp) * len;
      s.line(tx, ty, p.x, p.y, at(p.ramp, 0.55 - l * 0.4), 1 - l * 0.5);
      s.put(p.x, p.y, at(p.ramp, 1 - l * 0.6));
      break;
    }
    case 'ember':
      if (fxRandom() < 0.85) s.put(p.x, p.y, at(p.ramp, 1 - l), 1 - l * l);
      break;
    case 'chunk': {
      const n = Math.max(1, Math.round(p.size));
      s.rect(p.x - n / 2, p.y - n / 2, n, n, p.c, 1 - Math.max(0, l - 0.7) / 0.3);
      if (n >= 2) s.put(p.x - n / 2, p.y - n / 2, at(p.ramp, 0.85), 1 - l);
      break;
    }
    case 'puff':
      s.disc(p.x, p.y, p.size * (0.6 + l * 0.8), (d) => at(p.ramp, 0.6 - d * 0.35 - l * 0.2), (1 - l) * 0.75);
      break;
    case 'sprite':
      p.draw?.(s, p.x, p.y, l, p);
      break;
  }
}

// ───────────── 작은 픽셀 스프라이트 ─────────────
/** 회전하는 동전 (가로 폭이 cos으로 줄었다 늘었다) */
const coinDraw: Draw = (s, x, y, l, p) => {
  const w = Math.max(0.6, Math.abs(Math.cos(p.spin)) * 3.2);
  const a = 1 - Math.max(0, l - 0.85) / 0.15;
  for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) {
    const d = Math.hypot(i / w, j / 3.2);
    if (d > 1) continue;
    const c = d > 0.78 ? RAMP.gold[1] : i < -w * 0.25 && j < 0 ? RAMP.gold[4] : RAMP.gold[3];
    s.put(x + i, y + j, c, a);
  }
};
const chipDraw: Draw = (s, x, y, l, p) => {
  const w = Math.max(0.6, Math.abs(Math.cos(p.spin)) * 3.4);
  const a = 1 - Math.max(0, l - 0.85) / 0.15;
  for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) {
    const d = Math.hypot(i / w, j / 3.4);
    if (d > 1) continue;
    const ang = Math.atan2(j, i / Math.max(0.6, w / 3.4));
    const notch = d > 0.62 && Math.floor((ang + TAU) / (TAU / 8)) % 2 === 0;
    s.put(x + i, y + j, d > 0.88 ? RAMP.chip[1] : notch ? RAMP.ivory[4] : d < 0.35 ? RAMP.chip[3] : RAMP.chip[2], a);
  }
};
const plusDraw: Draw = (s, x, y, l) => {
  const a = l < 0.7 ? 1 : 1 - (l - 0.7) / 0.3;
  for (let i = -2; i <= 2; i++) { s.put(x + i, y, RAMP.heal[i === 0 ? 5 : 3], a); s.put(x, y + i, RAMP.heal[i === 0 ? 5 : 3], a); }
  s.put(x - 1, y - 1, RAMP.heal[1], a * 0.6); s.put(x + 1, y + 1, RAMP.heal[1], a * 0.6);
};
const bubbleDraw: Draw = (s, x, y, l, p) => {
  const r = p.size;
  if (l > 0.82) { // 터짐: 네 방향 점
    const k = (l - 0.82) / 0.18 * 3 + r;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.put(x + dx * k, y + dy * k, RAMP.poison[4], 1 - (l - 0.82) / 0.18);
    return;
  }
  s.ring(x, y, r, 1, RAMP.poison[3]);
  s.put(x - r / 2, y - r / 2, RAMP.poison[5]);
};
const chevronDraw = (rp: Col[], up: boolean): Draw => (s, x, y, l) => {
  const a = 1 - l * l;
  for (let i = -3; i <= 3; i++) {
    const dy = (up ? 1 : -1) * Math.abs(i) * 0.7;
    s.put(x + i, y + dy, rp[4], a); s.put(x + i, y + dy + (up ? 1 : -1), rp[2], a);
  }
};
const starDraw = (rp: Col[]): Draw => (s, x, y, l) => {
  const n = Math.round((1 - Math.abs(l * 2 - 1)) * 3);
  s.put(x, y, rp[5]);
  for (let i = 1; i <= n; i++) { const c = rp[5 - i]; s.put(x + i, y, c); s.put(x - i, y, c); s.put(x, y + i, c); s.put(x, y - i, c); }
};

/** 방패 문장 마스크 (가로 hw, 세로 h): 위는 각지고 아래로 뾰족 */
function shieldMask(w: number, h: number): (x: number, y: number) => 0 | 1 | 2 {
  const half = w / 2;
  const hwAt = (y: number) => (y < h * 0.45 ? half : half * Math.sqrt(Math.max(0, 1 - Math.pow((y - h * 0.45) / (h * 0.55), 2))));
  return (x, y) => {
    if (y < 0 || y >= h) return 0;
    const hw = hwAt(y + 0.5);
    const dx = Math.abs(x + 0.5 - half);
    if (dx > hw) return 0;
    if (dx > hw - 1.2 || y === 0 || hwAt(y + 1.5) < dx) return 2; // 테두리
    return 1;
  };
}

// ───────────── 엔진 ─────────────
interface Fx { update(dt: number): boolean; draw(s: Surface): void }
const surf = new Surface();
const effects: Fx[] = [];
let cv: HTMLCanvasElement | null = null;
let lv: HTMLCanvasElement | null = null;
let cg: CanvasRenderingContext2D | null = null;
let host: HTMLElement | null = null;
let last = 0;
let running = false;
let speed = () => 1;

export function initPixelFx(root: HTMLElement, getSpeed: () => number) {
  host = root;
  speed = getSpeed;
  cv = document.createElement('canvas');
  cv.className = 'pxfx';
  lv = document.createElement('canvas');
  lv.className = 'pxfx light';
  root.append(lv, cv);
  cg = cv.getContext('2d');
  surf.lg = lv.getContext('2d');
  const resize = () => {
    if (!cv || !lv || !host) return;
    const r = host.getBoundingClientRect();
    const w = Math.ceil(r.width / PX), h = Math.ceil(r.height / PX);
    for (const c of [cv, lv]) { c.width = w; c.height = h; c.style.width = `${w * PX}px`; c.style.height = `${h * PX}px`; }
    surf.resize(w, h);
  };
  resize();
  window.addEventListener('resize', resize);
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed();
  last = now;
  surf.buf.fill(0);
  surf.lg?.clearRect(0, 0, surf.w, surf.h);
  for (let i = effects.length - 1; i >= 0; i--) {
    if (!effects[i].update(dt)) { effects.splice(i, 1); continue; }
    effects[i].draw(surf);
  }
  if (surf.img) cg?.putImageData(surf.img, 0, 0);
  if (effects.length) requestAnimationFrame(frame);
  else { running = false; cg?.clearRect(0, 0, surf.w, surf.h); }
}

function add(fx: Fx) {
  if (!cv) return;
  effects.push(fx);
  if (effects.length > 40) effects.shift(); // 연타 보호
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
}

/** 요소 중심 → 아트 픽셀 좌표 */
export function pt(el: Element | null, fy = 0.5): { x: number; y: number } | null {
  if (!el || !host) return null;
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  return { x: (r.left - h.left + r.width / 2) / PX, y: (r.top - h.top + r.height * fy) / PX };
}
export const screenSize = () => ({ w: surf.w, h: surf.h });

/** 파티클 묶음 + 선택적 맞춤 그리기를 효과 하나로 */
function group(parts: Part[], extra?: { dur: number; draw: (s: Surface, t: number) => void }): Fx {
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (let i = parts.length - 1; i >= 0; i--) if (!stepPart(parts[i], dt)) parts.splice(i, 1);
      return parts.length > 0 || (!!extra && t < extra.dur);
    },
    draw(s) {
      if (extra && t < extra.dur) extra.draw(s, t);
      for (const p of parts) drawPart(s, p);
    },
  };
}

function sparks(x: number, y: number, n: number, rp: Col[], sp: [number, number], dir?: number, cone = TAU): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = dir === undefined ? R(0, TAU) : dir + R(-cone / 2, cone / 2);
    const v = R(sp[0], sp[1]);
    out.push(part({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, drag: 0.06, life: R(0.18, 0.45), ramp: rp }));
  }
  return out;
}

// ───────────── 게임 행동별 이펙트 ─────────────

/** 카드 공격: 대각선 초승달 베기. crit이면 X자 두 번 + 금빛 */
export function cut(el: Element | null, crit = false) {
  const p = pt(el, 0.45);
  if (!p) return;
  const rp = crit ? RAMP.gold : RAMP.ivory;
  const arcs = crit ? [{ a: -0.9, d: 0 }, { a: Math.PI + 0.9, d: 0.07 }] : [{ a: R(-1.1, -0.7), d: 0 }];
  const ps: Part[] = [];
  for (const { a, d } of arcs) {
    const dir = a + Math.PI / 2;
    ps.push(...sparks(p.x, p.y, crit ? 14 : 8, rp, [90, 220], dir, 1.2).map((q) => ({ ...q, delay: d + 0.05 })));
  }
  const RAD = crit ? 28 : 24;
  add(group(ps, {
    dur: 0.36,
    draw(s, t) {
      for (const { a, d } of arcs) {
        const tt = t - d;
        if (tt < 0) continue;
        const head = easeOut(tt / 0.07), tail = easeOut((tt - 0.06) / 0.22);
        if (tail >= 1) continue;
        // 원의 중심을 맞은 점 반대편에 두고 호를 그린다
        const cx = p.x - Math.cos(a) * RAD * 0.55, cy = p.y - Math.sin(a) * RAD * 0.55;
        const a0 = a - 1.25, span = 2.5;
        const steps = 60;
        for (let i = Math.floor(tail * steps); i <= head * steps; i++) {
          const u = i / steps;
          const th = Math.sin(Math.PI * u) * (crit ? 6 : 4.5) * (1 - tail * 0.6);
          const ang = a0 + span * u;
          for (let r = RAD - th; r <= RAD; r += 0.5) {
            const k = (r - (RAD - th)) / Math.max(0.5, th);
            s.put(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, tt < 0.035 ? WHITE : at(rp, 0.35 + k * 0.65));
          }
        }
        s.glow(p.x, p.y, 26, crit ? '#ffcc55' : '#fff2d0', 0.55 * (1 - tail));
      }
    },
  }));
}

/** 강타: 별 모양 충격 + 퍼지는 링 + 주사위 파편 */
export function impact(el: Element | null, big = false, rampName: RampName = 'gold') {
  const p = pt(el, 0.45);
  if (!p) return;
  const rp = RAMP[rampName];
  const floor = p.y + 22;
  const ps: Part[] = [...sparks(p.x, p.y, big ? 26 : 14, rp, [120, big ? 320 : 220])];
  for (let i = 0; i < (big ? 12 : 6); i++) {
    const a = R(-Math.PI, 0);
    const v = R(60, 150);
    ps.push(part({ k: 'chunk', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 420, drag: 0.01, life: R(0.6, 1.0), c: pick([RAMP.ivory[3], RAMP.ivory[2], RAMP.ivory[4]]), ramp: RAMP.ivory, size: R(2, big ? 4 : 3), floor }));
  }
  const rays = big ? 10 : 8;
  add(group(ps, {
    dur: big ? 0.5 : 0.35,
    draw(s, t) {
      const k = t / (big ? 0.5 : 0.35);
      if (t < 0.05) s.disc(p.x, p.y, big ? 9 : 6, WHITE);
      // 길고 짧은 빛살이 번갈아
      if (k < 0.55) for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU + 0.2;
        const len = (i % 2 ? 0.55 : 1) * (big ? 28 : 18) * easeOut(k / 0.3);
        const inner = len * Math.min(1, k / 0.45);
        for (let r = inner; r < len; r++) s.put(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, at(rp, 1 - r / len * 0.6), 1 - k / 0.55);
      }
      s.ring(p.x, p.y, 4 + easeOut(k) * (big ? 34 : 22), 2, rp[4], 1 - k);
      s.glow(p.x, p.y, big ? 50 : 32, big ? '#ffd27a' : '#ffe8b0', (1 - k) * 0.8);
    },
  }));
}

/** 방어도 획득: 방패 문장이 네 조각에서 모이고 빛이 훑고 지나간다 */
export function shieldUp(el: Element | null) {
  const p = pt(el);
  if (!p) return;
  const W = 17, H = 19, m = shieldMask(W, H);
  const ps: Part[] = [];
  for (let i = 0; i < 6; i++) ps.push(part({ k: 'sprite', x: p.x + R(-10, 10), y: p.y + R(-8, 6), vy: -R(8, 18), life: R(0.4, 0.7), delay: 0.2 + R(0, 0.25), draw: starDraw(RAMP.steel) }));
  add(group(ps, {
    dur: 0.75,
    draw(s, t) {
      const asm = easeOut(t / 0.18);
      const fade = t > 0.5 ? (t - 0.5) / 0.25 : 0;
      const sweep = (t - 0.18) / 0.25; // 빛 띠 위치 0..1
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = m(x, y);
        if (!v) continue;
        // 네 사분면이 바깥에서 모여든다
        const ox = (x < W / 2 ? -1 : 1) * (1 - asm) * 8, oy = (y < H / 2 ? -1 : 1) * (1 - asm) * 6;
        const band = sweep > 0 && sweep < 1 && Math.abs((x + y) / (W + H) - sweep) < 0.08;
        const c = band ? WHITE : v === 2 ? RAMP.steel[1] : x + y < 8 ? RAMP.steel[4] : y > H * 0.6 ? RAMP.steel[2] : RAMP.steel[3];
        s.put(p.x - W / 2 + x + ox, p.y - H / 2 + y + oy, c, 1 - fade);
      }
      s.glow(p.x, p.y, 22, '#7fc0ff', (1 - fade) * 0.6);
    },
  }));
}

/** 방어도로 막음: 육각 물결. 뚫리면 방패가 쪼개져 떨어진다 */
export function shieldHit(el: Element | null, broke: boolean) {
  const p = pt(el);
  if (!p) return;
  const ps: Part[] = sparks(p.x, p.y, 10, RAMP.steel, [80, 180]);
  if (broke) for (let i = 0; i < 7; i++) {
    const a = R(-Math.PI * 0.9, -Math.PI * 0.1);
    ps.push(part({ k: 'chunk', x: p.x + R(-5, 5), y: p.y + R(-6, 4), vx: Math.cos(a) * R(40, 110), vy: Math.sin(a) * R(40, 110), g: 380, life: R(0.5, 0.9), c: pick(RAMP.steel.slice(1, 4)), ramp: RAMP.steel, size: R(2, 3.5) }));
  }
  add(group(ps, {
    dur: 0.4,
    draw(s, t) {
      const k = t / 0.4;
      const r = 6 + easeOut(k) * 16;
      for (let i = 0; i < 6; i++) { // 육각형
        const a0 = (i / 6) * TAU + Math.PI / 6, a1 = ((i + 1) / 6) * TAU + Math.PI / 6;
        s.line(p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r, p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r, RAMP.steel[broke ? 2 : 4], 1 - k);
      }
      s.glow(p.x, p.y, 24, '#8cc6ff', (1 - k) * 0.7);
    },
  }));
}

/** 독: 거품이 올라와 터지고 방울이 떨어진다 */
export function poison(el: Element | null) {
  const p = pt(el);
  if (!p) return;
  const ps: Part[] = [];
  for (let i = 0; i < 9; i++) ps.push(part({ k: 'sprite', x: p.x + R(-12, 12), y: p.y + R(-2, 10), vx: R(-6, 6), vy: -R(14, 34), life: R(0.5, 0.9), delay: R(0, 0.25), size: pick([1, 2, 2, 3]), draw: bubbleDraw }));
  for (let i = 0; i < 5; i++) ps.push(part({ k: 'chunk', x: p.x + R(-10, 10), y: p.y - R(0, 6), vy: R(10, 30), g: 200, life: R(0.4, 0.6), delay: R(0.05, 0.3), c: RAMP.poison[2], ramp: RAMP.poison, size: 2 }));
  add(group(ps, { dur: 0.6, draw(s, t) { s.glow(p.x, p.y, 26, '#8fe04a', 0.5 * (1 - t / 0.6)); } }));
}

/** 회복: 십자가 흔들리며 올라간다 */
export function heal(el: Element | null) {
  const p = pt(el);
  if (!p) return;
  const ps: Part[] = [];
  for (let i = 0; i < 8; i++) {
    const ph = R(0, TAU);
    ps.push(part({ k: 'sprite', x: p.x + R(-18, 18), y: p.y + R(-2, 6), vy: -R(18, 30), life: R(0.6, 0.9), delay: R(0, 0.3), spin: ph, draw: (s, x, y, l, q) => plusDraw(s, x + Math.sin(q.spin) * 1.5, y, l, q) }));
  }
  add(group(ps, { dur: 0.7, draw(s, t) { s.glow(p.x, p.y, 30, '#5cf0a8', 0.45 * (1 - t / 0.7)); } }));
}

/** 동전/칩이 튀어 올랐다가 카운터로 빨려 들어간다 */
export function payout(from: Element | null, to: Element | null, n: number, kind: 'coin' | 'chip' = 'coin') {
  const a = pt(from), b = pt(to);
  if (!a) return;
  const ps: Part[] = [];
  for (let i = 0; i < Math.min(14, Math.max(2, n)); i++) {
    const ang = R(-Math.PI * 0.85, -Math.PI * 0.15);
    const v = R(70, 140);
    ps.push(part({
      k: 'sprite', x: a.x, y: a.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, g: 300, drag: 0.03, life: 1.6, delay: i * 0.03,
      draw: kind === 'coin' ? coinDraw : chipDraw, home: b ? { ...b, t0: R(0.32, 0.5) } : undefined,
    }));
  }
  add(group(ps, b ? { dur: 1.1, draw(s, t) { if (t > 0.5) s.glow(b.x, b.y, 14, kind === 'coin' ? '#ffd27a' : '#ff8aa4', 0.6); } } : undefined));
}

/** 강화/약화: 화살표가 오르내린다 */
export function buff(el: Element | null, up = true, rampName: RampName = up ? 'gold' : 'arcane') {
  const p = pt(el);
  if (!p) return;
  const ps: Part[] = [];
  for (let i = 0; i < 4; i++) ps.push(part({ k: 'sprite', x: p.x + (i - 1.5) * 7, y: p.y + (up ? 8 : -8), vy: up ? -26 : 26, life: 0.55, delay: i * 0.06, draw: chevronDraw(RAMP[rampName], up) }));
  add(group(ps));
}

/** 적 처치: 몸이 네모 가루가 되어 흩어지고 칩 영혼이 떠오른다 */
export function dissolve(el: Element | null) {
  if (!el || !host) return;
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const x0 = (r.left - h.left) / PX, y0 = (r.top - h.top) / PX, w = r.width / PX, hh = r.height / PX;
  const ps: Part[] = [];
  const n = Math.min(70, Math.round((w * hh) / 18));
  for (let i = 0; i < n; i++) {
    const x = x0 + R(0.15, 0.85) * w, y = y0 + R(0.1, 0.8) * hh;
    ps.push(part({ k: 'chunk', x, y, vx: R(-20, 20), vy: -R(10, 50), g: -30, drag: 0.02, life: R(0.5, 1.1), delay: ((y0 + hh - y) / hh) * 0.25, c: pick([RAMP.ivory[2], RAMP.ivory[3], RAMP.arcane[2], RAMP.arcane[3]]), ramp: RAMP.arcane, size: pick([1, 2, 2, 3]) }));
  }
  const cx = x0 + w / 2, cy = y0 + hh / 2;
  ps.push(part({ k: 'sprite', x: cx, y: cy, vy: -24, life: 1.1, delay: 0.25, draw: (s, x, y, l, q) => chipDraw(s, x + Math.sin(l * 9) * 2, y, l, q) }));
  add(group(ps, { dur: 0.3, draw(s, t) { s.glow(cx, cy, 34, '#b98cff', 0.6 * (1 - t / 0.3)); } }));
}

/** 내가 맞음: 붉은 할퀸 자국 세 줄 */
export function claw(el: Element | null) {
  const p = pt(el, 0.4);
  if (!p) return;
  add(group(sparks(p.x, p.y, 10, RAMP.blood, [80, 200]), {
    dur: 0.45,
    draw(s, t) {
      for (let i = 0; i < 3; i++) {
        const tt = t - i * 0.04;
        if (tt < 0) continue;
        const head = easeOut(tt / 0.08), tail = easeOut((tt - 0.12) / 0.25);
        const x0 = p.x - 18 + i * 11, y0 = p.y - 15, x1 = x0 + 12, y1 = y0 + 30;
        for (let u = tail; u <= head; u += 0.03) {
          const th = Math.sin(Math.PI * u) * 2.2;
          const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
          for (let o = -th; o <= th; o += 0.5) s.put(x + o, y, Math.abs(o) < 0.6 ? RAMP.blood[4] : RAMP.blood[2]);
        }
      }
      s.glow(p.x, p.y, 30, '#ff4b4b', 0.5 * (1 - t / 0.45));
    },
  }));
}

/** 주사위가 테이블에 떨어질 때 작은 먼지 */
export function dust(el: Element | null) {
  const p = pt(el, 0.95);
  if (!p) return;
  const ps: Part[] = [];
  for (let i = 0; i < 5; i++) ps.push(part({ k: 'puff', x: p.x + R(-6, 6), y: p.y, vx: R(-30, 30), vy: -R(2, 10), drag: 0.1, life: R(0.25, 0.4), size: R(1.5, 2.6), ramp: RAMP.ivory }));
  add(group(ps));
}

/** 반짝임 몇 개 (카드 드로우·획득 등) */
export function twinkle(el: Element | null, rampName: RampName = 'gold', n = 5) {
  const p = pt(el);
  if (!p) return;
  const ps: Part[] = [];
  for (let i = 0; i < n; i++) ps.push(part({ k: 'sprite', x: p.x + R(-14, 14), y: p.y + R(-10, 10), life: R(0.3, 0.5), delay: R(0, 0.2), draw: starDraw(RAMP[rampName]) }));
  add(group(ps));
}

/** 숨은 콤보: 두 고리가 부딪혀 맞물리고 불꽃 링 */
export function chainLink(el: Element | null) {
  const p = pt(el);
  if (!p) return;
  const link = (s: Surface, cx: number, cy: number, c: Col) => {
    for (let a = 0; a < TAU; a += 0.08) s.put(cx + Math.cos(a) * 7, cy + Math.sin(a) * 4, c);
  };
  add(group(sparks(p.x, p.y, 22, RAMP.arcane, [100, 260]).map((q) => ({ ...q, delay: 0.3 })), {
    dur: 1.0,
    draw(s, t) {
      const k = easeOut(t / 0.3);
      link(s, p.x - 22 + k * 16, p.y, RAMP.arcane[4]);
      link(s, p.x + 22 - k * 16, p.y, RAMP.gold[4]);
      if (t > 0.3) {
        const kk = (t - 0.3) / 0.7;
        s.ring(p.x, p.y, 6 + easeOut(kk) * 40, 2, RAMP.arcane[3], 1 - kk);
        s.glow(p.x, p.y, 40, '#b98cff', 1 - kk);
      }
    },
  }));
}

/** 야찌: 무지개 링이 다섯 번 퍼지고 별이 쏟아진다 */
export function yahtzee() {
  const { w, h } = surf;
  const cx = w / 2, cy = h * 0.42;
  const ps: Part[] = [];
  for (let i = 0; i < 46; i++) {
    const a = R(0, TAU), v = R(60, 220);
    ps.push(part({ k: 'sprite', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.04, g: 60, life: R(0.6, 1.3), delay: R(0, 0.6), draw: starDraw(RAMP[pick(['gold', 'heal', 'arcane', 'steel', 'chip'] as RampName[])]) }));
  }
  add(group(ps, {
    dur: 1.4,
    draw(s, t) {
      for (let i = 0; i < 5; i++) {
        const tt = t - i * 0.12;
        if (tt < 0 || tt > 0.8) continue;
        const k = tt / 0.8;
        s.ring(cx, cy, 4 + easeOut(k) * w * 0.6, 3, RAINBOW[i % RAINBOW.length], 1 - k);
      }
      s.glow(cx, cy, w * 0.5, '#fff0b0', Math.max(0, 1 - t / 0.9));
    },
  }));
}

/** 잭팟: 아래에서 동전 분수 + 빛기둥 */
export function fountain(n = 60) {
  const { w, h } = surf;
  const ps: Part[] = [];
  for (let i = 0; i < n; i++) {
    const x = w / 2 + R(-20, 20);
    ps.push(part({ k: 'sprite', x, y: h + 6, vx: R(-70, 70), vy: -R(160, 300), g: 260, life: R(1.4, 2.0), delay: R(0, 0.8), draw: coinDraw, floor: h + 20 }));
  }
  add(group(ps, {
    dur: 1.2,
    draw(s, t) {
      const k = t / 1.2;
      for (let x = -6; x <= 6; x++) for (let y = 0; y < h; y += 1) if (fxRandom() < 0.5) s.put(w / 2 + x, y, x * x < 4 ? RAMP.gold[5] : RAMP.gold[4], (1 - k) * (1 - Math.abs(x) / 7) * 0.8);
      s.glow(w / 2, h * 0.6, w * 0.5, '#ffd27a', (1 - k) * 0.7);
    },
  }));
}

/** 위에서 동전이 쏟아진다 */
export function coinRainFx(n = 60) {
  const { w, h } = surf;
  const ps: Part[] = [];
  for (let i = 0; i < n; i++) ps.push(part({ k: 'sprite', x: R(0, w), y: -R(4, 160), vx: R(-8, 8), vy: R(60, 140), g: 120, life: 2.6, spin: R(0, TAU), draw: coinDraw, floor: h - 4 }));
  add(group(ps));
}

/** 요소 없이 화면 좌표(아트 픽셀)에 불꽃 */
export function sparkAt(x: number, y: number, rampName: RampName = 'gold', n = 16) {
  add(group(sparks(x, y, n, RAMP[rampName], [80, 240]), { dur: 0.2, draw(s, t) { s.glow(x, y, 22, '#ffffff', 0.5 * (1 - t / 0.2)); } }));
}

/** 화면 전체 색종이 (승리) */
export function confettiFx(n = 80) {
  const { w } = surf;
  const ps: Part[] = [];
  for (let i = 0; i < n; i++) {
    const c = pick(RAINBOW);
    ps.push(part({ k: 'sprite', x: R(0, w), y: -R(4, 120), vx: R(-10, 10), vy: R(30, 70), life: 3.2, draw: (s, x, y, l, q) => { const wd = Math.abs(Math.cos(q.spin)) > 0.5 ? 2 : 1; s.rect(x, y, wd, 3 - wd, c, 1 - Math.max(0, l - 0.85) / 0.15); } }));
  }
  add(group(ps));
}

/** 기존 burst 대체: 색에 맞는 픽셀 불꽃 */
export function sparkBurst(el: Element | null, rampName: RampName = 'gold', n = 16) {
  const p = pt(el);
  if (!p) return;
  add(group(sparks(p.x, p.y, n, RAMP[rampName], [80, 220]), { dur: 0.2, draw(s, t) { s.glow(p.x, p.y, 20, '#ffffff', 0.5 * (1 - t / 0.2)); } }));
}

export { INK };
