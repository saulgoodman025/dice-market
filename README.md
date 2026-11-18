# 🎲 DICE MARKET (베타)

지하 카지노 던전 “하우스”에서 주사위 5개로 싸우고, 아낀 눈으로 돈을 벌고, 슬롯·룰렛·더블 오어 낫싱으로 판돈을 불려 하우스를 이기는 로그라이크. 사양: [GAME_SPEC.md](GAME_SPEC.md) · 결정 기록: [DECISIONS.md](DECISIONS.md)

## 플레이

- 공개 주소: https://saulgoodman025.github.io/dice-market/ (main에 push하면 GitHub Actions가 테스트 → 빌드 → 배포)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173  (디버그 패널: ?debug=1)
npm test           # Vitest: 족보·DDA·규칙·가드레일 (34개)
npm run sim -- --runs 5000   # 헤드리스 밸런스 시뮬레이터 → sim/report.md
npm run build      # 타입 체크 + 프로덕션 빌드 (dist/)
```

## 조작
- **리롤 단계**: 주사위 탭 = 🔒잠금. `🎲 리롤`은 잠그지 않은 주사위만 다시 굴린다.
- **덱**: 시작 덱 10장에서 매 턴 5장을 뽑는다. 카드를 적(🎯) 또는 테이블(✋)로 끌어 놓으면 알맞은 주사위로 발동. 🔥 태우기로 주사위 하나를 버리고 카드 1장.
- **성장**: 카드 보상(3장 중 1장), 분기 강화 A/B, 카드 삭제(상점·휴게실·이벤트·파쇄기), 계열 태그 3/5/7장 단계, 숨은 콤보 20종, 증강 56종(실버·골드·프리즘).
- 리롤을 마치고 첫 카드를 쓰면 족보가 확정된다.
- 쓰지 않은 주사위는 턴 종료 시 🐷저금통 → 전투 후 골드.
- 적을 탭하면 대상 지정. 아무 요소나 **길게 누르면** 설명 툴팁.

## 구조
```
src/core    rng(시드·스트림 분리) · state(타입) · events(버스) · save(localStorage)
src/rules   UI를 모르는 순수 규칙: hands · dice · combat · economy · casino · dda · map · run · meta
src/data    모든 수치/콘텐츠: 카드125 · 증강56 · 콤보20 · 면20 · 재질9 · 유물50 · 소모품16 · 적27 · 이벤트12 · 캐릭터4 · 스테이크8
src/ui      app(렌더/연출 큐) · actions · screens/* · fx(숫자 팝업·흔들림·히트스톱·파티클)
src/audio   Web Audio 합성 효과음 (에셋 파일 없음)
sim/        random / greedy 봇, run-sim → report.md
tests/      hands · dda · rules
```
효과는 모두 훅(`onRoll`, `onHandScored`, `onGambleResult` …) + 수치 보정(`mods`) 데이터로 정의된다. 규칙 코드에 특정 아이템 id 분기가 없다는 것도 테스트로 확인한다.

## 단계별 수용 기준 현황
| Phase | 기준 | 상태 |
| --- | --- | --- |
| 1 코어 전투 | `npm run dev`로 전투 완주, 족보 경계 케이스 테스트 | ✅ (`tests/hands.test.ts` 17개) |
| 2 한 막 루프 | 1막 시작~보스, 새로고침 후 이어하기 | ✅ 매 행동마다 저장, 전투 중에도 복원 |
| 3 카지노·전체 콘텐츠 | 3막 클리어 가능, 모든 도박 UI에 확률·EV | ✅ (숙련 봇 클리어율 37%) |
| 4 DDA·메타·밸런스 | sim 5000판 목표 범위, `dda.test.ts` | ⚠️ 6개 중 5개 충족 — 판당 야찌 0.83 (목표 0.3~0.6) |
| 5 폴리싱 | 360×780에서 스크롤 없는 전투 화면 | ✅ 6주사위·6스킬·튜토리얼 동시 표시도 맞음 / 60fps는 실기기 미측정 |

## 금지선
실제 돈으로 사는 확률형 상품 없음 · 에너지/대기 시간 없음 · 게임 내 화폐의 현금화 없음.
