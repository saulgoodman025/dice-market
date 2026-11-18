// 공용 HTML 조각
import type { HandDie, Rarity, RewardOption } from '../../core/state';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { RELIC_BY_ID } from '../../data/relics';
import { condText, SKILL_BY_ID } from '../../data/skills';
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
    case 'skill': {
      const d = SKILL_BY_ID[o.id];
      return { emoji: '⚔️', name: d.name, desc: `[${condText(d.cond)}] ${fmt(d.desc, d.v)}`, rarity, kindLabel: '스킬' };
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
