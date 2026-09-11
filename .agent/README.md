# .agent 임베딩 및 프로젝트 컨텍스트 마스터 인덱스

본 디렉토리(`.agent/`)는 향후 AI 에이전트 작업 시 프롬프트 토큰 비용을 최소화하고 정확도 높은 검색 및 컨텍스트 인젝션(Context Ingestion / Semantic Embedding)을 수행하기 위해 프로젝트의 아키텍처, 데이터 스키마, 상태 머신, 파일 맵을 구조화하여 보관합니다.

---

## 1. 문서 구성 체계

| 문서 파일명 | 핵심 내용 및 용도 |
| :--- | :--- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Nginx/Express WebDAV 파일 기반 백엔드 없는 상태 구조, HTTP 메서드 매핑, PWA 및 모바일 네트워크 아키텍처 |
| [`GAME_LOGIC.md`](./GAME_LOGIC.md) | 5단계 상태 머신 생명주기, 9개 직업 규칙, 3단계 원자적 `MOVE` 트랜잭션, 승패 판정 공식 |
| [`FILE_MAP.md`](./FILE_MAP.md) | 전체 코드베이스 파일 경로, 타입 인터페이스 정의, 수정 시 참조 가이드 및 토큰 절약 규칙 |

---

## 2. 프로젝트 퀵 요약 (Executive Summary)

* **프로젝트명**: 한밤의 늑대인간 (One Night Ultimate Werewolf) 모바일 웹/PWA
* **핵심 컨셉**:
  1. **Zero DB & Zero Custom Game Server**: Nginx WebDAV의 파일 I/O(MKCOL, PUT, GET, MOVE, PROPFIND)만으로 룸과 유저 상태를 격리 관리 (`File-as-a-State`).
  2. **블러핑 강제 은폐**: 밤 동안 모든 유저가 '4x4 메모리 카드 뒤집기' 미니게임을 강제 플레이하여 시선과 손가락 움직임을 은폐하며, 미배정 직업은 3.5초 가상 턴 유지(테스트용 Fast Mode 지원).
  3. **3단계 MOVE 스왑 트랜잭션**: 강도와 말썽쟁이의 카드 교환 시 동시성 충돌을 방지하기 위해 `temp.json`을 경유하는 원자적 파일 교체.
  4. **스마트 타이머 & 분산 자가 치유(Self-Healing)**: 호스트 탭 스로틀링이나 미배정 직업 발생 시에도 멈춤 없이 안정적으로 턴이 전진하는 장애 복구 메커니즘 탑재.
  5. **Zero Install & PWA**: 방장의 화면에 표시되는 초대용 QR 코드를 모바일 카메라로 스캔하여 즉시 Safari/Chrome으로 접속 (Screen Wake Lock 연동).
  6. **무중단 세션 복원 및 Presence 관리**: 브라우저 새로고침(F5) 시 로비로 튕기지 않고 배정된 직업과 투표 상태를 100% 보존하며, 4초 주기 하트비트 기반으로 오프라인 좀비 플레이어 방지 및 방장 강퇴 기능 지원.
  7. **관리자(Admin) 권한 및 룸 라이프사이클 제어**: WebDAV `/admin.json` 기반 관리자 인증(초기 암호: `0000`, 0000 원클릭 리셋 지원), 비밀번호 변경, 로비 내 개별/일괄 좀비 방 삭제 및 확장 가능한 관리자 대시보드 지원.

---

## 3. 에이전트 프롬프트 참조 가이드 (Token Saving Tips)
* 새 기능 추가나 버그 수정 시 전체 소스코드를 프롬프트에 넣지 말고, 본 `.agent/` 폴더 내 해당되는 섹션(예: WebDAV I/O 변경 시 `ARCHITECTURE.md`, 턴 로직 수정 시 `GAME_LOGIC.md`)만 참조하십시오.
* 상태 파일 포맷이나 타입 정의 확인 시 [`FILE_MAP.md`](./FILE_MAP.md)의 타입 정의 섹션을 최우선 활용합니다.
