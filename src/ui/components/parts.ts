// 공용 HTML 조각
import type { HandDie, Rarity, RewardOption } from '../../core/state';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { RELIC_BY_ID } from '../../data/relics';
import { condText } from '../../data/cond';
import { CARD_BY_ID, cardDesc, resolveCard, type ResolvedCard } from '../../data/cards';
import { TAG_INFO } from '../../data/tags';
import type { CardInst } from '../../core/state';
import { itemRarity } from '../../rules/economy';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** desc 템플릿 {key} 에 수치 삽입 */
export function fmt(desc: string, v?: Record<string, number>): string {
  return desc.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] !== undefined ? String(v[k]) : `{${k}}`));
}

const PIP_MAP: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function pipsHtml(n: number): string {
  if (!PIP_MAP[n]) return `<span class="num">${n}</span>`;
  const on = new Set(PIP_MAP[n]);
  return `<span class="pips">${Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function dieFace(pip: number, sticker?: string, material = 'wood', extra = '', attrs = ''): string {
  const f = sticker ? FACE_BY_ID[sticker] : undefined;
  const showNum = f?.kind === 'replace' && (f.pip === 7 || f.pip === 0 || f.wild || f.mirror);
  const inner = f?.wild ? '<span class="num">🃏</span>' : showNum ? `<span class="num">${pip}</span>` : pipsHtml(pip);
  const stk = f ? `<span class="stk">${f.emoji}</span>` : '';
  const mat = material !== 'wood' ? `<span class="matb">${MATERIAL_BY_ID[material]?.icon ?? ''}</span>` : '';
  return `<div class="die mat-${material} ${extra}" ${attrs}>${inner}${stk}${mat}</div>`;
}

export function handDieHtml(h: HandDie, cls: string, attrs: string) {
  return dieFace(h.pip, h.sticker, h.material, `${cls} ${h.golden ? 'golden' : ''}`, attrs);
}

export function rarityTag(r: Rarity) {
  return `<span class="tag ${r}">${{ common: 'C', rare: 'R', epic: 'E', legendary: 'L' }[r]}</span>`;
}

export function optInfo(o: RewardOption): { emoji: string; name: string; desc: string; rarity: Rarity; kindLabel: string } {
  const rarity = itemRarity(o);
  switch (o.kind) {
    case 'card': {
      const d = resolveCard({ id: o.id, up: null });
      return { emoji: d.icon, name: d.name, desc: `[${condText(d.cond)}] ${cardDesc(d)}`, rarity, kindLabel: '카드' };
    }
    case 'relic': {
      const d = RELIC_BY_ID[o.id];
      return { emoji: d.emoji, name: d.name, desc: d.desc, rarity, kindLabel: '유물' };
    }
    case 'face': {
      const d = FACE_BY_ID[o.id];
      return { emoji: d.emoji, name: d.name + ' 면', desc: `${d.kind === 'attr' ? '◎ 속성' : '● 대체'} · ${fmt(d.desc, d.v)}`, rarity, kindLabel: '면 스티커' };
    }
    case 'consumable': {
      const d = CONSUMABLE_BY_ID[o.id];
      return { emoji: d.emoji, name: d.name, desc: d.desc, rarity, kindLabel: '소모품' };
    }
    case 'material': {
      const d = MATERIAL_BY_ID[o.id];
      return { emoji: '🎲', name: d.name + ' 재질', desc: fmt(d.desc, d.v), rarity, kindLabel: '재질' };
    }
  }
}

export function itemHtml(o: RewardOption, extra = '', right = '', attrs = ''): string {
  const i = optInfo(o);
  return `<div class="item r-${i.rarity} ${extra}" ${attrs}>
    <div class="ic">${i.emoji}</div>
    <div class="grow"><div class="tt">${esc(i.name)} ${rarityTag(i.rarity)} <span class="muted small">${i.kindLabel}</span></div><div class="ds">${esc(i.desc)}</div></div>
    ${right}
  </div>`;
}

export const RAR_NAME: Record<string, string> = { basic: '기본', common: '일반', rare: '희귀', epic: '영웅', legendary: '전설', curse: '저주' };

/** 덱·보상·강화 화면에 쓰는 카드 그림 */
export function cardFace(rc: ResolvedCard, opts: { up?: null | 'A' | 'B'; cls?: string; attrs?: string; cost?: number; oddsBonus?: number; extra?: string; highlight?: string[] } = {}): string {
  const tag = rc.tag ? `<span class="dtag" title="${TAG_INFO[rc.tag].name}">${TAG_INFO[rc.tag].icon}</span>` : '';
  const cost = opts.cost ?? rc.cost;
  let desc = esc(cardDesc(rc, opts.oddsBonus ?? 0));
  for (const h of opts.highlight ?? []) if (h) desc = desc.split(esc(h)).join(`<mark>${esc(h)}</mark>`);
  const flags = [rc.exhaust ? '소멸' : '', rc.cond.k === 'instant' ? '즉발' : condText(rc.cond)].filter(Boolean);
  return `<div class="dcard r-${rc.rarity} ${opts.cls ?? ''}" ${opts.attrs ?? ''}>
    <span class="dcost ${cost !== rc.cost ? 'mod' : ''}">${rc.unplayable ? '✕' : cost}</span>${tag}
    ${opts.up ? `<span class="dup up${opts.up}">${opts.up}</span>` : ''}
    <div class="dart">${rc.icon}</div>
    <div class="dname">${esc(rc.name)}${opts.up ? `<b class="green">+${opts.up}</b>` : ''}</div>
    <div class="dcond">${flags.map(esc).join(' · ')}</div>
    <div class="ddesc">${desc}</div>
    <span class="drar">${RAR_NAME[rc.rarity]}</span>${opts.extra ?? ''}
  </div>`;
}

export function cardInstFace(inst: CardInst, opts: Parameters<typeof cardFace>[1] = {}): string {
  return cardFace(resolveCard(inst), { up: inst.up, ...opts });
}

export { CARD_BY_ID };
