import type { App } from '../app';
import { BALANCE } from '../../data/balance';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { RELIC_BY_ID } from '../../data/relics';
import { CHAR_BY_ID } from '../../data/characters';
import { esc } from '../components/parts';
import { interestFor } from '../../rules/economy';

export function topbar(app: App): string {
  const r = app.run!;
  const cb = r.combat;
  const hpPct = Math.max(0, (r.hp / r.maxHp) * 100);
  const heat = Array.from({ length: BALANCE.heatMax }, (_, i) => `<i class="${i < r.heat ? 'on' : ''}"></i>`).join('');
  const jp = Math.min(100, r.jackpot);
  const blk = cb ? cb.block + cb.keepBlock : 0;
  return `<div class="topbar">
    <span class="stat" data-tip="${esc(CHAR_BY_ID[r.charId].name + ': ' + CHAR_BY_ID[r.charId].desc)}">${CHAR_BY_ID[r.charId].emoji}</span>
    <div class="hpbar" data-tip="체력"><i style="width:${hpPct}%"></i><b>❤ ${r.hp}/${r.maxHp}</b></div>
    ${cb ? `<span class="stat pblock" style="color:var(--blue)" data-tip="방어도: 이번 적 턴의 피해를 먼저 막는다">🛡${blk}</span>` : ''}
    <span class="stat st-gold gold" data-tip="골드. 노드 이동 시 이자 +${interestFor(r)}G (5G당 1G)">🪙${r.gold}</span>
    <span class="stat st-chips" data-tip="칩: 카지노 전용 화폐 (판이 끝나면 소멸)">🎰${r.chips}</span>
  </div>
  <div class="topbar" style="padding-top:0;font-size:11px">
    <span class="stat" data-tip="열기: 족보를 띄울 때마다 상승, 노 핸드면 0. 단계당 피해 +5%, 저금통 +10%. 5+ 피버, 10 온 파이어">🔥<span class="heat">${heat}</span></span>
    <span class="stat" data-tip="잭팟 게이지: 100%가 되면 다음 턴 잭팟 턴 (눈 ×2 + 무료 스핀)">💰<span class="jp ${jp >= 100 ? 'full' : ''}"><i style="width:${jp}%"></i></span>${Math.round(jp)}%</span>
    <span class="grow"></span>
    <span class="stat muted">${r.act}막 · ${r.floor + 1}층${r.stake ? ` · ⚜${r.stake}` : ''}</span>
    <button class="btn ghost" style="min-height:32px;min-width:44px;padding:2px 8px;font-size:12px" data-act="modal" data-arg="bag" data-always="1">🎒</button>
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
  return `<div class="row" style="flex-wrap:wrap;gap:4px">${r.relics.map((id) => {
    const d = RELIC_BY_ID[id];
    return `<span data-tip="${esc(d.name + ': ' + d.desc)}" style="font-size:20px">${d.emoji}</span>`;
  }).join('')}</div>`;
}
