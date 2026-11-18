// 카드 정의 + 강화 + 효과 소스(숨은 콤보 등)의 덮어쓰기를 합친 최종 카드
import type { CardInst, RunState } from '../core/state';
import { resolveCard, type ResolvedCard } from '../data/cards';
import { sources } from './ctx';

export function resolveFor(run: RunState, inst: CardInst): ResolvedCard {
  const rc = resolveCard(inst);
  let n = rc.n;
  let out: ResolvedCard = rc;
  for (const s of sources(run)) {
    const o = s.cards?.[inst.id];
    if (!o) continue;
    n = { ...n, ...(o.v ?? {}) };
    for (const [k, v] of Object.entries(o.vAdd ?? {})) n[k] = (n[k] ?? 0) + v;
    out = {
      ...out, n,
      cost: o.cost ?? out.cost,
      perCombat: o.perCombat ?? out.perCombat,
      choose: o.choose ?? out.choose,
      chooseValues: o.choose === 'value' ? () => [1, 2, 3, 4, 5, 6] : out.chooseValues,
    };
    if (o.condVuln) {
      const cb = run.combat;
      const t = cb?.enemies.find((e) => e.uid === cb.target && e.hp > 0);
      if (t && t.vuln > 0) out = { ...out, cond: o.condVuln };
    }
  }
  return out;
}
