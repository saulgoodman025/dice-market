import type { App } from '../app';
import { BALANCE } from '../../data/balance';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { RELIC_BY_ID } from '../../data/relics';
import { CHAR_BY_ID } from '../../data/characters';
import { esc } from '../components/parts';
import { interestFor } from '../../rules/economy';

export function topbar(app: App): string {
  const run = app.run!;
  const fz = app.ui.freeze;
  const r = fz ? { ...run, gold: fz.gold, chips: fz.chips, hp: fz.hp } : run;
  const cb = r.combat;
  const hpPct = Math.max(0, (r.hp / r.maxHp) * 100);
  const heat = Array.from({ length: BALANCE.heatMax }, (_, i) => `<i class="${i < r.heat ? 'on' : ''}"></i>`).join('');
  const jp = Math.min(100, r.jackpot);
  const hpRow = cb ? '' : `<div class="topbar"><span class="stat">${CHAR_BY_ID[r.charId].emoji}</span><div class="hpbar" data-tip="체력"><i style="width:${hpPct}%"></i><b>❤ ${r.hp}/${r.maxHp}</b></div></div>`;
  return `${hpRow}<div class="topbar">
    <span class="stat st-gold gold" data-tip="골드: 상점에서 쓴다. 이동할 때마다 이자 +${interestFor(run)}G">🪙${r.gold}</span>
    <span class="stat st-chips" data-tip="칩: 카지노 전용 (판이 끝나면 사라짐)">🎰${r.chips}</span>
    <span class="stat" data-tip="🔥 열기 ${r.heat}/10: 족보를 낼수록 오르고 피해가 세진다 (단계당 +5%). 족보를 못 내면 0">🔥<span class="heat">${heat}</span></span>
    <span class="stat" data-tip="💰 잭팟 ${Math.round(jp)}%: 100%가 되면 다음 턴 모든 주사위 효과 2배 + 무료 슬롯">💰<span class="jp ${jp >= 100 ? 'full' : ''}"><i style="width:${jp}%"></i></span></span>
    <span class="grow"></span>
    <span class="stat muted" style="white-space:nowrap">${r.act}막 ${r.floor >= 4 ? '보스' : `${r.floor + 1}층`}${r.stake ? ` S${r.stake}` : ''}</span>
    ${cb ? '<button class="iconbtn" data-act="tutOpen" data-always="1" aria-label="도움말">?</button>' : ''}
    <button class="iconbtn" data-act="modal" data-arg="bag" data-always="1" aria-label="가방">☰</button>
  </div>`;
}

export function consumablesRow(app: App): string {
  const r = app.run!;
  const slots = Array.from({ length: BALANCE.maxConsumables }, (_, i) => {
    const id = r.consumables[i];
    if (!id) return `<button disabled style="opacity:.3">·</button>`;
    const d = CONSUMABLE_BY_ID[id];
    return `<button data-act="useCons" data-arg="${i}" data-tip="${esc(d.name + ': ' + d.desc)}">${d.emoji}</button>`;
  }).join('');
  return `<div class="cons">${slots}</div>`;
}

export function relicStrip(app: App): string {
  const r = app.run!;
  if (!r.relics.length) return '';
  const RN = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' } as const;
  return `<div class="relicstrip">${r.relics.map((id) => {
    const d = RELIC_BY_ID[id];
    return `<button class="relic r-${d.rarity}" data-act="relicInfo" data-arg="${id}" data-tip="${esc(`${d.emoji} ${d.name} (${RN[d.rarity]})\n${d.desc}`)}">${d.emoji}</button>`;
  }).join('')}</div>`;
}
