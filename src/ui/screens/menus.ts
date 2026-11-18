import type { App } from '../app';
import { CHARACTERS } from '../../data/characters';
import { STAKES } from '../../data/stakes';
import { RELICS } from '../../data/relics';
import { FACES } from '../../data/faces';
import { ENEMIES } from '../../data/enemies';
import { HANDS } from '../../data/hands';
import { META_LOCKED_START } from '../../data/meta';
import { nextUnlockIn, runPoints } from '../../rules/meta';
import { esc, fmt, rarityTag } from '../components/parts';
import { MATERIAL_BY_ID } from '../../data/materials';
import { CARD_BY_ID, CARDS, isPoolCard, resolveCard } from '../../data/cards';
import { COMBOS } from '../../data/sets';
import { cardFace } from '../components/parts';
import { RELIC_BY_ID } from '../../data/relics';
import { FACE_BY_ID } from '../../data/faces';
import { CHAR_BY_ID } from '../../data/characters';
import { TABLES, TABLE_BY_ID } from '../../data/tables';
import { ACHIEVEMENTS, ACH_BY_ID } from '../../data/achievements';
import { FELTS, MASTERY_LEVELS, MASTERY_REWARDS, SKINS, masteryLevel } from '../../data/mastery';
import { dailySetup, todayKey } from '../../rules/daily';

export function titleScreen(app: App): string {
  const has = !!app.run && app.run.screen !== 'gameover' && app.run.screen !== 'victory';
  const m = app.meta;
  const d = dailySetup(todayKey());
  const best = m.daily?.[d.key];
  return `<div class="screen center" style="justify-content:center;gap:12px">
    <div class="title-dice">🎲🎰🎲</div>
    <div class="title-logo">DICE<br>MARKET</div>
    <div class="muted center">하우스는 항상 이긴다. 정말 그럴까?</div>
    <div class="col" style="width:100%;max-width:310px;margin:0 auto;gap:9px">
      ${has ? `<button class="btn primary big" data-act="continue">▶ 이어하기 <span class="small">(${app.run!.act}막 ${app.run!.floor + 1}층)</span></button>` : ''}
      <button class="btn ${has ? '' : 'primary'} big" data-act="new">${has ? '새 게임 (현재 판 포기)' : '▶ 새 게임'}</button>
      <button class="item dailycard" data-act="daily">
        <div class="ic">📅</div>
        <div class="grow" style="text-align:left"><div class="tt">오늘의 도전 <span class="muted small">${d.key}</span></div>
        <div class="ds">${CHAR_BY_ID[d.charId].emoji} ${CHAR_BY_ID[d.charId].name} · ${TABLE_BY_ID[d.tableId].icon} ${TABLE_BY_ID[d.tableId].name} · ${d.rule.name}</div>
        <div class="ds gold">${best ? `오늘 최고 ${best}점` : '아직 도전하지 않았습니다'}</div></div>
      </button>
      <div class="row"><button class="btn grow" data-act="achievements">🏆 업적 ${m.achievements?.length ?? 0}/${ACHIEVEMENTS.length}</button><button class="btn grow" data-act="codex">📖 도감</button></div>
      <button class="btn" data-act="settings">⚙️ 설정</button>
    </div>
    <div class="muted small">판 ${m.stats.runs} · 클리어 ${m.stats.wins} · 야찌 ${m.stats.yahtzees}${m.bestEndless ? ` · 엔드리스 최고 ${m.bestEndless}막` : ''}</div>
  </div>`;
}

export function charScreen(app: App): string {
  const m = app.meta;
  const cards = CHARACTERS.map((c) => {
    const unlocked = !c.unlock || m.flags[c.unlock];
    return `<button class="item ${app.ui.charSel === c.id && unlocked ? 'charpick' : ''} ${unlocked ? '' : 'lockedchar'}" style="width:100%" ${unlocked ? `data-act="char" data-arg="${c.id}"` : 'disabled'}>
      <div class="ic" style="font-size:34px">${unlocked ? c.emoji : '🔒'}</div>
      <div class="grow" style="text-align:left"><div class="tt">${app.ui.charSel === c.id && unlocked ? '✔ ' : ''}${c.name} <span class="muted small">❤${c.hp}</span> <span class="lvl">Lv.${masteryLevel(m.mastery?.[c.id] ?? 0)}</span></div>
      <div class="ds">${esc(c.desc)}</div>
      <div class="ds">시작 덱: 베기×4 · 방패×4 · ${c.startCards.map((s) => CARD_BY_ID[s].icon + ' ' + CARD_BY_ID[s].name).join(' · ')}</div>
      <div class="ds">주사위: ${[...new Set(c.dice)].map((m) => `${MATERIAL_BY_ID[m].icon} ${MATERIAL_BY_ID[m].name}×${c.dice.filter((x) => x === m).length}`).join(' ')}</div>
      ${[...new Set(c.dice)].filter((m) => m !== 'wood').map((m) => `<div class="ds">${MATERIAL_BY_ID[m].icon} ${esc(MATERIAL_BY_ID[m].long)}</div>`).join('')}
      ${unlocked ? '' : `<div class="ds red">해금: ${esc(c.unlockText)}</div>`}</div>
    </button>`;
  }).join('');
  const stakes = Array.from({ length: m.maxStake + 1 }, (_, i) => `<button class="btn ${app.ui.stakeSel === i ? 'primary' : 'ghost'}" style="min-width:44px;padding:4px" data-act="stake" data-arg="${i}">${i}</button>`).join('');
  const owned = (id: string) => id === 'classic' || (m.owned ?? []).includes('table:' + id);
  if (!owned(app.ui.tableSel)) app.ui.tableSel = 'classic';
  const tables = TABLES.map((t) => owned(t.id)
    ? `<button class="tbl ${app.ui.tableSel === t.id ? 'on' : ''}" data-act="table" data-arg="${t.id}"><span>${t.icon}</span>${t.name.replace(' 테이블', '')}</button>`
    : `<button class="tbl locked" disabled data-tip="${esc('업적 「' + (ACH_BY_ID[t.unlock]?.name ?? '') + '」 달성 시 해금')}"><span>🔒</span>${t.name.replace(' 테이블', '')}</button>`).join('');
  const sdesc = app.ui.stakeSel ? STAKES.filter((s) => s.level <= app.ui.stakeSel).map((s) => s.desc).join(' · ') : '스테이지 0: 기본 난이도';
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>캐릭터 선택</h2></div>
    <div class="col">${cards}</div>
    <div class="card col"><b>🎲 시작 테이블</b><div class="tablepick">${tables}</div><div class="small">${esc(TABLE_BY_ID[app.ui.tableSel]?.desc ?? '')}</div></div>
    <div class="card"><div class="row" style="flex-wrap:wrap"><b>⚜ 난이도 스테이지</b>${stakes}</div><div class="muted small" style="margin-top:4px">${esc(sdesc)}${m.maxStake < 8 ? ' · 클리어하면 다음 스테이지가 열린다' : ''}</div></div>
    <div class="grow"></div>
    <button class="btn primary big" data-act="start">하우스에 들어간다 ▶</button>
  </div>`;
}

export function settingsScreen(app: App): string {
  const s = app.settings;
  const owned = app.meta.owned ?? [];
  const tg = (k: string, label: string, on: boolean) => `<button class="item" style="width:100%" data-act="set" data-arg="${k}"><div class="grow tt" style="text-align:left">${label}</div><b class="${on ? 'green' : 'red'}">${on ? 'ON' : 'OFF'}</b></button>`;
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>설정</h2></div>
    ${tg('sound', '🔊 효과음', s.sound)}
    ${tg('vibrate', '📳 진동', s.vibrate)}
    ${tg('shake', '💥 화면 흔들림', s.shake)}
    <button class="item" style="width:100%" data-act="speed"><div class="grow tt" style="text-align:left">⏩ 연출 속도</div><b class="gold">×${s.speed}</b></button>
    <h3>🎨 꾸미기</h3>
    <div class="small muted">업적과 캐릭터 숙련도로 더 열립니다.</div>
    <div class="cosrow">${SKINS.map((c) => cos(c.id, 'skin', c.name, c.preview, s.skin === c.id, c.id === 'ivory' || owned.includes('skin:' + c.id))).join('')}</div>
    <div class="cosrow">${FELTS.map((c) => cos(c.id, 'felt', c.name, c.preview, s.felt === c.id, c.id === 'green' || owned.includes('felt:' + c.id))).join('')}</div>
    <div class="muted small">디버그 패널: 주소 뒤에 ?debug=1</div>
  </div>`;
}

function cos(id: string, kind: string, name: string, color: string, on: boolean, have: boolean): string {
  return `<button class="cos ${on ? 'on' : ''} ${have ? '' : 'locked'}" ${have ? `data-act="cosmetic" data-arg="${kind}:${id}"` : 'disabled'}><i style="background:${color}"></i>${have ? name : '🔒'}</button>`;
}

export function codexScreen(app: App): string {
  const c = app.meta.codex;
  const tab = app.ui.codexTab;
  const tabs = `<div class="tabs">${[['card', '카드'], ['combo', '콤보'], ['relic', '유물'], ['face', '면'], ['enemy', '적'], ['hand', '족보']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="codexTab" data-arg="${k}">${l}</button>`).join('')}</div>`;
  let list = '';
  if (tab === 'relic') list = RELICS.map((r) => c.relics.includes(r.id)
    ? `<div class="item r-${r.rarity}"><div class="ic">${r.emoji}</div><div class="grow"><div class="tt">${r.name} ${rarityTag(r.rarity)}</div><div class="ds">${esc(r.desc)}</div></div></div>`
    : `<div class="item" style="opacity:.4"><div class="ic">❔</div><div class="grow tt">???</div></div>`).join('');
  if (tab === 'face') list = FACES.map((f) => c.faces.includes(f.id)
    ? `<div class="item r-${f.rarity}"><div class="ic">${f.emoji}</div><div class="grow"><div class="tt">${f.name} ${rarityTag(f.rarity)}</div><div class="ds">${esc(fmt(f.desc, f.v))}</div></div></div>`
    : `<div class="item" style="opacity:.4"><div class="ic">❔</div><div class="grow tt">???</div></div>`).join('');
  if (tab === 'enemy') list = ENEMIES.map((e) => c.enemies.includes(e.id)
    ? `<div class="item"><div class="ic">${e.emoji}</div><div class="grow"><div class="tt">${e.name} <span class="muted small">${e.act}막 ${e.tier === 'boss' ? '보스' : e.tier === 'elite' ? '엘리트' : ''} ❤${e.hp}</span></div><div class="ds">${esc(e.desc)}</div></div></div>`
    : `<div class="item" style="opacity:.4"><div class="ic">❔</div><div class="grow tt">???</div></div>`).join('');
  if (tab === 'hand') list = HANDS.map((h) => `<div class="item" style="${c.hands.includes(h.id) ? '' : 'opacity:.4'}"><div class="grow"><div class="tt">${h.name}</div><div class="ds">배율 ×${h.mult} · 열기 ${h.heat < 0 ? '초기화' : '+' + h.heat}${h.jackpot ? ` · 잭팟 +${h.jackpot}%` : ''}</div></div></div>`).join('');
  if (tab === 'card') list = `<div class="dgrid">${CARDS.filter(isPoolCard).map((d) => c.cards.includes(d.id) ? cardFace(resolveCard({ id: d.id, up: null })) : '<div class="dcard unknown"><div class="dart">❔</div><div class="dname">???</div></div>').join('')}</div>`;
  if (tab === 'combo') list = COMBOS.map((k) => c.combos.includes(k.id)
    ? `<div class="item"><div class="ic">🔗</div><div class="grow"><div class="tt">${esc(k.name)} <span class="muted small">${CARD_BY_ID[k.a].name} + ${CARD_BY_ID[k.b].name}</span></div><div class="ds">${esc(k.desc)}</div></div></div>`
    : `<div class="item" style="opacity:.5"><div class="ic">🔒</div><div class="grow"><div class="tt">??? <span class="muted small">${CARD_BY_ID[k.a].icon}? + ${CARD_BY_ID[k.b].icon}?</span></div><div class="ds">${k.char ? '캐릭터 전용 · ' : ''}두 카드를 같은 덱에 모으면 발견</div></div></div>`).join('');
  const s = app.meta.stats;
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>도감</h2></div>
    <div class="muted small">야찌 ${s.yahtzees}회 · 메가 잭팟 ${s.megaJackpots}회 · 최고 도달 ${s.bestNodes}노드 · 해금 ${app.meta.unlocked.length}/${META_LOCKED_START.length}</div>
    ${tabs}<div class="col">${list}</div>
  </div>`;
}

export function endScreen(app: App): string {
  const run = app.run!;
  const won = run.screen === 'victory';
  const end = app.ui.end;
  const endless = !!run.flags.endless;
  const names = (end?.unlocked ?? []).map(rewardLabel);
  const achs = (end?.achievements ?? []).map((id) => ACH_BY_ID[id]).filter(Boolean);
  const title = endless ? `♾️ 엔드리스 ${run.act}막에서 쓰러졌다` : won ? '하우스를 이겼다!' : '게임 오버';
  return `<div class="screen center" style="justify-content:center;gap:10px">
    <div style="font-size:60px">${won ? '🏆' : endless ? '♾️' : '💀'}</div>
    <h1 class="${won ? 'gold' : endless ? '' : 'red'}">${title}</h1>
    ${won || !run.stats.deathBy ? '' : `<div class="muted">${esc(run.stats.deathBy)}에게 쓰러졌다</div>`}
    ${end?.dailyScore !== null && end?.dailyScore !== undefined ? `<div class="card gold"><b>📅 오늘의 도전 점수 ${end.dailyScore}</b> <span class="muted small">(오늘 최고 ${app.meta.daily?.[run.dailyKey ?? ''] ?? end.dailyScore})</span></div>` : ''}
    ${achs.length ? `<div class="card col achnew"><b>🏆 새 업적!</b>${achs.map((a) => `<div class="row"><span style="font-size:22px">${a.icon}</span><div class="grow" style="text-align:left"><b>${a.name}</b><div class="ds gold">${esc(rewardLabel(a.reward))} 해금</div></div></div>`).join('')}</div>` : ''}
    <div class="card col" style="text-align:left">
      <div>도달: ${run.act}막 ${run.floor + 1}층 (${run.nodesReached}칸) · 보스 ${run.bossesKilled}</div>
      <div>야찌 ${run.stats.yahtzees} · 잭팟 턴 ${run.stats.jackpotTurns} · 도박 ${run.stats.gambles} · 처치 ${run.stats.kills}</div>
      <div class="gold">해금 포인트 +${end?.points ?? runPoints(run)} · ${CHAR_BY_ID[run.charId].name} 숙련도 +${end?.masteryXp ?? 0}</div>
      ${(end?.masteryLevelUp ?? []).map((l) => `<div class="green">⭐ ${CHAR_BY_ID[run.charId].name} Lv.${l.level}! ${l.reward === 'story' ? `📜 “${esc(l.story ?? '')}”` : esc(rewardLabel(l.reward)) + ' 해금'}</div>`).join('')}
      ${names.length ? `<div class="green">새로 해금: ${names.map(esc).join(', ')}</div>` : ''}
      <div class="muted small">다음 해금까지 ${nextUnlockIn(app.meta)}점</div>
    </div>
    ${won ? '<button class="btn primary big" data-act="endless">♾️ 엔드리스로 계속 (4막~)</button>' : ''}
    <button class="btn ${won ? '' : 'primary'} big" data-act="again">🔁 새로 시작</button>
    <button class="btn" data-act="toTitle">타이틀로</button>
  </div>`;
}

const RWD_KIND: Record<string, string> = { card: '카드', skill: '카드', relic: '유물', face: '면', table: '테이블', skin: '주사위 스킨', felt: '테이블 색' };
export function rewardLabel(r: string): string {
  const [k, id] = r.split(':');
  const name = k === 'card' || k === 'skill' ? CARD_BY_ID[id]?.name : k === 'relic' ? RELIC_BY_ID[id]?.name : k === 'face' ? FACE_BY_ID[id]?.name
    : k === 'table' ? TABLE_BY_ID[id]?.name : k === 'skin' ? SKINS.find((x) => x.id === id)?.name : FELTS.find((x) => x.id === id)?.name;
  return `${RWD_KIND[k] ?? ''} 「${name ?? id}」`;
}

export function achievementsScreen(app: App): string {
  const m = app.meta;
  const tab = app.ui.achTab;
  const tabs = `<div class="tabs"><button class="${tab === 'ach' ? 'on' : ''}" data-act="achTab" data-arg="ach">🏆 업적</button><button class="${tab === 'mastery' ? 'on' : ''}" data-act="achTab" data-arg="mastery">⭐ 캐릭터 숙련도</button></div>`;
  let body = '';
  if (tab === 'ach') {
    body = ACHIEVEMENTS.map((a) => {
      const done = (m.achievements ?? []).includes(a.id);
      return `<div class="item ach ${done ? 'done' : ''}"><div class="ic">${done ? a.icon : '🔒'}</div>
        <div class="grow"><div class="tt">${a.name}${done ? ' ✔' : ''}</div><div class="ds">${esc(a.desc)}</div><div class="ds gold">보상: ${esc(rewardLabel(a.reward))}</div></div></div>`;
    }).join('');
  } else {
    body = CHARACTERS.map((c) => {
      const xp = m.mastery?.[c.id] ?? 0;
      const lv = masteryLevel(xp);
      const next = MASTERY_LEVELS[lv] ?? null;
      const prev = MASTERY_LEVELS[lv - 1] ?? 0;
      const pct = next ? Math.round(((xp - prev) / (next - prev)) * 100) : 100;
      const rewards = (MASTERY_REWARDS[c.id] ?? []).map((r) => `<div class="ds ${lv >= r.level ? '' : 'muted'}">Lv.${r.level} ${lv >= r.level ? '✔' : '🔒'} ${r.reward === 'story' ? (lv >= r.level ? `📜 “${esc(r.story ?? '')}”` : '📜 이야기 조각') : esc(rewardLabel(r.reward))}</div>`).join('');
      return `<div class="card col"><div class="row"><span style="font-size:28px">${c.emoji}</span><b class="grow">${c.name}</b><span class="lvl">Lv.${lv}</span></div>
        <div class="xpbar"><i style="width:${pct}%"></i><b>${next ? `${xp}/${next}` : `${xp} · 최고 레벨`}</b></div>${rewards}</div>`;
    }).join('');
  }
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>업적 · 숙련도</h2></div>
    <div class="muted small">${tab === 'ach' ? `${m.achievements?.length ?? 0}/${ACHIEVEMENTS.length} 달성 · 판이 끝날 때 확인합니다.` : '판을 할수록 경험치가 쌓입니다. (도달한 칸 + 보스×5 + 클리어 20)'}</div>
    ${tabs}<div class="col">${body}</div>
  </div>`;
}
