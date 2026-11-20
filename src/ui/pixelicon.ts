// 이모지를 픽셀 스프라이트로: 크게 그린 뒤 블록 평균으로 줄이고, 알파를 딱 끊고, 색을 단계화하고, 어두운 외곽선을 두른다.
// 화면에 들어오는 모든 텍스트를 지켜보며 이모지만 <img>로 바꾼다 (게임 코드는 그대로 이모지 문자열을 쓴다).

const EMOJI = /\p{Emoji_Presentation}|\uFE0F|\u20E3/u;
const OUTLINE = [20, 14, 24];
const cache = new Map<string, string>();
const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

/** 아트 해상도: 글자 크기에 맞춰 1·2·3배 픽셀 */
export function artSize(fontPx: number): { art: number; scale: number } {
  const scale = fontPx < 22 ? 1 : fontPx < 44 ? 2 : 3;
  return { art: Math.max(10, Math.round((fontPx * 1.2) / scale)), scale };
}

export function pixelEmoji(ch: string, art: number): string {
  const key = `${ch}|${art}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const SS = 6; // 크게 그린 배율
  const inner = art - 2; // 외곽선 자리
  const big = document.createElement('canvas');
  big.width = big.height = art * SS;
  const g = big.getContext('2d', { willReadFrequently: true })!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${inner * SS * 0.86}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(ch, (art * SS) / 2, (art * SS) / 2 + inner * SS * 0.06);
  const src = g.getImageData(0, 0, art * SS, art * SS).data;
  const out = new ImageData(art, art);
  const d = out.data;
  const solid = new Uint8Array(art * art);
  const q = (v: number) => Math.min(255, Math.round(v / 36) * 36 + (v > 200 ? 20 : 0)); // 색 단계화
  for (let y = 0; y < art; y++) for (let x = 0; x < art; x++) {
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const o = ((y * SS + j) * art * SS + x * SS + i) * 4;
      const al = src[o + 3];
      r += src[o] * al; gg += src[o + 1] * al; b += src[o + 2] * al; a += al;
    }
    if (a / (SS * SS) < 110) continue; // 반투명 가장자리는 버린다
    const o = (y * art + x) * 4;
    d[o] = q(r / a); d[o + 1] = q(gg / a); d[o + 2] = q(b / a); d[o + 3] = 255;
    solid[y * art + x] = 1;
  }
  // 1px 외곽선 (상하좌우)
  for (let y = 0; y < art; y++) for (let x = 0; x < art; x++) {
    if (solid[y * art + x]) continue;
    const n = (dx: number, dy: number) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < art && yy < art && solid[yy * art + xx] === 1; };
    if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) {
      const o = (y * art + x) * 4;
      d[o] = OUTLINE[0]; d[o + 1] = OUTLINE[1]; d[o + 2] = OUTLINE[2]; d[o + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = art;
  c.getContext('2d')!.putImageData(out, 0, 0);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'TITLE']);

function convertText(t: Text) {
  const s = t.data;
  if (!EMOJI.test(s)) return;
  const parent = t.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-nopx]')) return;
  const fs = parseFloat(getComputedStyle(parent).fontSize) || 16;
  const { art, scale } = artSize(fs);
  const frag = document.createDocumentFragment();
  let buf = '';
  const parts = seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
  for (const gph of parts) {
    if (EMOJI.test(gph) && !/^[0-9#*]$/.test(gph)) {
      if (buf) { frag.append(buf); buf = ''; }
      const img = document.createElement('img');
      img.className = 'pxi';
      img.alt = gph;
      img.draggable = false;
      img.src = pixelEmoji(gph, art);
      img.style.width = img.style.height = `${art * scale}px`;
      frag.append(img);
    } else buf += gph;
  }
  if (buf) frag.append(buf);
  t.replaceWith(frag);
}

function walk(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) { convertText(node as Text); return; }
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has((node as Element).tagName)) return;
  const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const list: Text[] = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (EMOJI.test((n as Text).data)) list.push(n as Text);
  list.forEach(convertText);
}

/** root 아래에 새로 들어오는 이모지를 계속 픽셀로 바꾼다 */
export function watchPixelIcons(root: HTMLElement) {
  walk(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') convertText(m.target as Text);
      else m.addedNodes.forEach(walk);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
