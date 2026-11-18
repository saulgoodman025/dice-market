# 🎲 DICE MARKET (베타)

지하 카지노 던전 “하우스”에서 주사위 5개로 싸우고, 아낀 눈으로 돈을 벌고, 슬롯·룰렛·더블 오어 낫싱으로 판돈을 불려 하우스를 이기는 로그라이크. 사양: [GAME_SPEC.md](GAME_SPEC.md) · 결정 기록: [DECISIONS.md](DECISIONS.md)

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
- **배치**: 주사위를 고르고(또는 잠근 채로) 스킬 칸을 탭 → 즉시 발동. 선택 없이 스킬을 탭하면 알맞은 주사위를 자동 선택.
- `✓ 족보 확정`으로 리롤을 끝낼 수 있고, 첫 스킬 사용 시 자동 확정된다.
- 쓰지 않은 주사위는 턴 종료 시 🐷저금통 → 전투 후 골드.
- 적을 탭하면 대상 지정. 아무 요소나 **길게 누르면** 설명 툴팁.

## 구조
```
src/core    rng(시드·스트림 분리) · state(타입) · events(버스) · save(localStorage)
src/rules   UI를 모르는 순수 규칙: hands · dice · combat · economy · casino · dda · map · run · meta
src/data    모든 수치/콘텐츠: 스킬32 · 면20 · 재질9 · 유물50 · 소모품16 · 적27 · 이벤트12 · 캐릭터4 · 스테이크8
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
