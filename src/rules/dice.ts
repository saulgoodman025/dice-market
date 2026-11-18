import type { CombatState, Die, HandDie } from '../core/state';
import { FACE_BY_ID } from '../data/faces';
import { MATERIAL_BY_ID } from '../data/materials';
import { rng, type Ctx } from './ctx';

export function newDie(uid: number, material = 'wood'): Die {
  return { uid, material, faces: [1, 2, 3, 4, 5, 6].map((pip) => ({ pip })) };
}

/** 면 인덱스를 결정해 손 주사위에 반영 (재질·스티커 적용) */
export function setFace(ctx: Ctx, hd: HandDie, faceIdx: number) {
  const run = ctx.run;
  const die = hd.dieIdx >= 0 ? run.dice[hd.dieIdx] : null;
  hd.face = faceIdx;
  if (!die) {
    hd.pip = faceIdx + 1;
    return;
  }
  const face = die.faces[faceIdx];
  const mat = MATERIAL_BY_ID[die.material];
  const sd = face.sticker ? FACE_BY_ID[face.sticker] : undefined;
  hd.sticker = face.sticker;
  let pip = sd?.pip ?? face.pip;
  if (mat.pipMap && mat.pipMap[pip] !== undefined && !sd?.pip) pip = mat.pipMap[pip];
  hd.pip = pip;
}

export function rollFaceIdx(ctx: Ctx, hd: HandDie): number {
  const run = ctx.run;
  const die = hd.dieIdx >= 0 ? run.dice[hd.dieIdx] : null;
  const r = rng(ctx, 'combat');
  const mat = die ? MATERIAL_BY_ID[die.material] : undefined;
  if (mat?.rollFaces) return r.pick(mat.rollFaces);
  return r.int(0, 5);
}

export function rollHandDie(ctx: Ctx, hd: HandDie) {
  setFace(ctx, hd, rollFaceIdx(ctx, hd));
}

/** 특정 눈으로 강제 (스티커 무시, 일반 눈) */
export function forcePip(ctx: Ctx, hd: HandDie, pip: number) {
  const die = hd.dieIdx >= 0 ? ctx.run.dice[hd.dieIdx] : null;
  // 해당 눈을 가진 면이 있으면 그 면으로, 없으면 눈만 바꾼다
  const idx = die ? die.faces.findIndex((f) => !f.sticker && f.pip === pip) : -1;
  if (idx >= 0) setFace(ctx, hd, idx);
  else {
    hd.pip = pip;
    hd.sticker = undefined;
  }
}

/** 거울 면 등 손 전체에 의존하는 값 갱신 */
export function refreshDerived(cb: CombatState) {
  for (const hd of cb.hand) {
    const sd = hd.sticker ? FACE_BY_ID[hd.sticker] : undefined;
    if (sd?.mirror) {
      const others = cb.hand.filter((h) => h.key !== hd.key && !(h.sticker && FACE_BY_ID[h.sticker]?.mirror));
      hd.pip = others.length ? Math.max(...others.map((h) => h.pip)) : 1;
    }
  }
}

export function materialOf(ctx: Ctx, hd: HandDie) {
  return MATERIAL_BY_ID[hd.material] ?? MATERIAL_BY_ID.wood;
}

export function faceOf(hd: HandDie) {
  return hd.sticker ? FACE_BY_ID[hd.sticker] : undefined;
}

/** 스킬 효과 계산용 값 (재질 배율, 잭팟 턴 ×2) */
export function effValue(ctx: Ctx, hd: HandDie): number {
  const mat = materialOf(ctx, hd);
  let v = hd.pip * (mat.powerMult ?? 1);
  if (hd.golden) v *= 2;
  return v;
}
