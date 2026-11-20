// 연출: 숫자 팝업, 흔들림, 히트스톱, 진동 (파티클은 pixel.ts)
import { fxRandom } from '../../core/rng';
import { PX, coinRainFx, sparkAt, type RampName } from './pixel';

export interface FxSettings { shake: boolean; vibrate: boolean; speed: number }
let S: FxSettings = { shake: true, vibrate: true, speed: 1 };
export function setFx(s: FxSettings) { S = s; document.documentElement.style.setProperty('--speed', String(s.speed)); }

let host: HTMLElement | null = null;

export function initFx(root: HTMLElement) {
  host = root;
}

function hostRect(): DOMRect {
  return (host ?? document.body).getBoundingClientRect();
}

/** 예전 색 지정 → 픽셀 이펙트 팔레트 */
function rampOf(color: string): RampName {
  const c = color.toLowerCase();
  if (['#9be15d', '#3ddc84', '#6fdc9b'].includes(c)) return 'poison';
  if (['#8cc6ff', '#cfe6ff', '#6cb8ff', '#4aa3ff'].includes(c)) return 'steel';
  if (['#ff9a3c', '#ff6a3d', '#ff5a3c'].includes(c)) return 'fire';
  if (['#ff5a5f', '#e5484d', '#ff6b6b'].includes(c)) return 'blood';
  if (['#b57cff', '#c9a6ff'].includes(c)) return 'arcane';
  return 'gold';
}

export function burst(x: number, y: number, color = '#f5c542', n = 18, _spread = 5) {
  sparkAt(x / PX, y / PX, rampOf(color), Math.min(30, n));
}

export function coinRain(n = 70) {
  coinRainFx(Math.min(80, n));
}

export function burstAt(el: Element | null, color?: string, n?: number) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const h = hostRect();
  burst(r.left - h.left + r.width / 2, r.top - h.top + r.height / 2, color, n);
}

export function floatAt(el: Element | null, text: string, color = '#fff', size = 22) {
  if (!el || !host) return;
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'float';
  d.textContent = text;
  // 한 줄로 화면 폭 안에 들어가도록 글자 크기 자동 축소
  const wide = [...text].reduce((w, ch) => w + (/[0-9!★+\-]/.test(ch) ? 0.62 : 1.0), 0);
  if (wide * size > h.width * 0.9) size = Math.floor((h.width * 0.9) / wide);
  const est = Math.min(h.width * 0.45, (wide * size) / 2); // 화면 밖으로 잘리지 않게
  const cx = r.left - h.left + r.width / 2 + (fxRandom() - 0.5) * 20;
  d.style.left = `${Math.max(est + 6, Math.min(h.width - est - 6, cx))}px`;
  d.style.top = `${r.top - h.top + r.height * 0.3}px`;
  d.style.color = color;
  d.style.fontSize = `${size}px`;
  host.appendChild(d);
  setTimeout(() => d.remove(), 1000 / S.speed + 100);
}

/** 화면 흔들림: 점점 잦아드는 무작위 흔들림 (다른 CSS 연출과 겹쳐도 덮이지 않게 Web Animations 사용) */
export function shake(el: Element | null, px = 6, ms = 260) {
  if (!el || !S.shake) return;
  const h = el as HTMLElement;
  const n = Math.max(6, Math.round(ms / 35));
  const frames: Keyframe[] = [];
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    frames.push({ transform: `translate(${((fxRandom() - 0.5) * 2 * px * k).toFixed(1)}px, ${((fxRandom() - 0.5) * 1.4 * px * k).toFixed(1)}px)` });
  }
  frames.push({ transform: 'translate(0, 0)' });
  h.animate(frames, { duration: ms / S.speed, easing: 'linear', composite: 'add' });
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
