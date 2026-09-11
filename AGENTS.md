# Agent Guidelines & Synchronization Rules

## 필수 규칙: .agent 문서 동기화 의무

코드베이스 또는 프로젝트 구조에 수정(기능 추가, 버그 수정, 파일 이동/삭제, 아키텍처/로직 변경 등)을 가했을 경우, **반드시 `.agent/` 디렉토리 하위의 해당 문서도 함께 최신 상태로 업데이트**해야 합니다.

### 변경 영역별 동기화 대상 문서:
1. **아키텍처 및 WebDAV 데이터 스키마 변경 시**: [`.agent/ARCHITECTURE.md`](./.agent/ARCHITECTURE.md)
   - WebDAV 파일 경로, 데이터 파일 포맷(`state.json`, `center.json`, `{userId}.json`, `votes/` 등), 네트워크/PWA 설정 변경 사항 반영
2. **게임 룰, 페이즈 상태 머신, 직업 액션 변경 시**: [`.agent/GAME_LOGIC.md`](./.agent/GAME_LOGIC.md)
   - 상태 머신 단계(`WAITING`, `NIGHT`, `DAY_DISCUSSION`, `VOTING`, `RESULT`), 직업별 밤 액션 순서, 3단계 원자적 `MOVE` 스왑 트랜잭션, 승패 판정 규칙 반영
3. **새 파일 추가/삭제/이름 변경 또는 타입 변경 시**: [`.agent/FILE_MAP.md`](./.agent/FILE_MAP.md)
   - 프로젝트 디렉터리 트리, `src/types.ts` 인터페이스, Web Audio 효과음 목록 등 갱신
4. **전체 개요 및 핵심 컨셉 변경 시**: [`.agent/README.md`](./.agent/README.md)
   - 프로젝트 마스터 인덱스 및 요약 갱신

---
*본 규칙은 향후 AI 에이전트 작업 시 프롬프트 토큰 소모를 최소화하고 정확한 컨텍스트 인젝션(Semantic Embedding)을 보장하기 위한 필수 지침입니다.*
