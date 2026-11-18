// 연출: 숫자 팝업, 흔들림, 히트스톱, 파티클 (캔버스 오버레이), 진동
import { fxRandom } from '../../core/rng';

export interface FxSettings { shake: boolean; vibrate: boolean; speed: number }
let S: FxSettings = { shake: true, vibrate: true, speed: 1 };
export function setFx(s: FxSettings) { S = s; document.documentElement.style.setProperty('--speed', String(s.speed)); }

let canvas: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; text?: string }
const parts: P[] = [];
let running = false;

export function initFx(host: HTMLElement) {
  canvas = document.createElement('canvas');
  canvas.id = 'fx';
  host.appendChild(canvas);
  g = canvas.getContext('2d');
  const resize = () => {
    if (!canvas) return;
    const r = host.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  };
  resize();
  window.addEventListener('resize', resize);
}

function loop() {
  if (!g || !canvas) return;
  const dpr = devicePixelRatio;
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * S.speed;
    p.y += p.vy * S.speed;
    p.vy += 0.25 * S.speed;
    p.life -= S.speed;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, p.life / (p.max * 0.4));
    if (p.text) {
      g.font = `${p.size * dpr}px serif`;
      g.fillText(p.text, p.x * dpr, p.y * dpr);
    } else {
      g.fillStyle = p.color;
      g.fillRect(p.x * dpr, p.y * dpr, p.size * dpr, p.size * dpr);
    }
  }
  g.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else running = false;
}

function kick() {
  if (!running) { running = true; requestAnimationFrame(loop); }
}

function hostRect(): DOMRect {
  return (canvas?.parentElement ?? document.body).getBoundingClientRect();
}

export function burst(x: number, y: number, color = '#f5c542', n = 18, spread = 5) {
  for (let i = 0; i < n; i++) {
    const a = fxRandom() * Math.PI * 2;
    const v = 1 + fxRandom() * spread;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 40 + fxRandom() * 25, max: 60, color, size: 3 + fxRandom() * 3 });
  }
  kick();
}

export function coinRain(n = 70) {
  const r = hostRect();
  for (let i = 0; i < n; i++) {
    parts.push({ x: fxRandom() * r.width, y: -20 - fxRandom() * 300, vx: (fxRandom() - 0.5) * 1.5, vy: 1 + fxRandom() * 3, life: 140, max: 140, color: '', size: 22, text: '🪙' });
  }
  kick();
}

export function burstAt(el: Element | null, color?: string, n?: number) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const h = hostRect();
  burst(r.left - h.left + r.width / 2, r.top - h.top + r.height / 2, color, n);
}

export function floatAt(el: Element | null, text: string, color = '#fff', size = 22) {
  const host = canvas?.parentElement;
  if (!el || !host) return;
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'float';
  d.textContent = text;
  d.style.left = `${r.left - h.left + r.width / 2 + (fxRandom() - 0.5) * 20}px`;
  d.style.top = `${r.top - h.top + r.height * 0.3}px`;
  d.style.color = color;
  d.style.fontSize = `${size}px`;
  host.appendChild(d);
  setTimeout(() => d.remove(), 1000 / S.speed + 100);
}

export function shake(el: Element | null, px = 6) {
  if (!el || !S.shake) return;
  const h = el as HTMLElement;
  h.style.setProperty('--sx', `${px}px`);
  h.classList.remove('shake');
  void h.offsetWidth;
  h.classList.add('shake');
  setTimeout(() => h.classList.remove('shake'), 260);
}

export function vibrate(ms: number | number[]) {
  if (S.vibrate && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* */ }
  }
}

/** 히트스톱: 잠깐 모든 CSS 애니메이션을 멈춘다 */
export function hitstop(host: HTMLElement, ms: number) {
  host.style.setProperty('animation-play-state', 'paused');
  host.querySelectorAll<HTMLElement>('.float').forEach((f) => (f.style.animationPlayState = 'paused'));
  setTimeout(() => {
    host.style.removeProperty('animation-play-state');
    host.querySelectorAll<HTMLElement>('.float').forEach((f) => (f.style.animationPlayState = ''));
  }, ms / S.speed);
}

export const dmgSize = (n: number) => Math.round(16 + Math.log2(Math.max(1, n)) * 5);
