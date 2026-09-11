# 시스템 아키텍처 및 WebDAV 데이터 명세서

## 1. 아키텍처 개요 (File-as-a-State Paradigm)

본 애플리케이션은 전통적인 RDBMS/NoSQL 데이터베이스나 별도의 WebSocket 게임 서버 없이 동작합니다.
표준 **WebDAV(RFC 4918)** 규약에 기반한 HTTP 파일 시스템을 백엔드 상태 저장소로 직접 사용합니다.

```
+-------------------------------------------------------------------------+
|                              클라이언트 브라우저                         |
|   - React 18 + TypeScript + Tailwind CSS                                |
|   - Screen Wake Lock API (절전 모드 차단)                               |
|   - 800ms 주기의 WebDAV 파일 폴링 (0.8s sync loop)                       |
+-------------------------------------------------------------------------+
                                    │
                                    │ HTTP (MKCOL, PROPFIND, PUT, GET, MOVE, DELETE)
                                    ▼
+-------------------------------------------------------------------------+
|                  Express + WebDAV 미들웨어 (포트 3000)                   |
|   - 엔드포인트: /webdav/*                                                |
|   - 정적 파일 제공: dist/ (Vite 빌드 아티팩트)                           |
+-------------------------------------------------------------------------+
                                    │
                                    │ Local Disk I/O
                                    ▼
+-------------------------------------------------------------------------+
|                     파일 시스템 저장소 (storage/webdav/)                  |
|   /rooms/                                                               |
|     └── room_{id}/                                                      |
|           ├── state.json          (현재 게임 단계, 활성 스텝, 타임스탬프) |
|           ├── center.json         (중앙 카드 3장의 직업 배열)            |
|           ├── {userId}.json       (각 유저의 시작/현재 카드 및 봇 플래그) |
|           ├── temp.json           (카드 교환 시 사용하는 임시 버퍼)     |
|           └── votes/                                                    |
|                 └── {userId}.txt  (투표한 지목 대상의 ID)               |
+-------------------------------------------------------------------------+
```

---

## 2. WebDAV 파일 계층 및 리소스 명세

### (1) 방 디렉터리: `/webdav/rooms/{roomId}/`
* **생성 시점**: 대기실 생성 버튼 클릭 시 `MKCOL /rooms/{roomId}` 및 `MKCOL /rooms/{roomId}/votes` 호출.
* **조회 시점**: 로비에서 `PROPFIND /rooms/` (Depth: 1) 호출로 생성된 방 목록 수집.

### (2) 게임 상태: `state.json`
* **경로**: `/rooms/{roomId}/state.json`
* **역할**: 방 전체의 페이즈 및 타이머 제어의 단일 진실 공급원(SSOT).
```json
{
  "phase": "WAITING" | "NIGHT" | "DAY_DISCUSSION" | "VOTING" | "RESULT",
  "currentStep": "WEREWOLF" | "SEER" | "ROBBER" | "TROUBLEMAKER" | "INSOMNIAC" | null,
  "stepStartedAt": 1741678800000,
  "timerStartedAt": 1741678820000,
  "hostId": "user_a1b2c",
  "killed": ["user_d3e4f"] | null
}
```

### (3) 유저 카드 상태: `{userId}.json`
* **경로**: `/rooms/{roomId}/{userId}.json` (예: `user_x92a.json`)
* **역할**: 해당 플레이어의 현재 손패 및 초기 부여 직업 저장.
```json
{
  "role": "WEREWOLF",
  "initialRole": "WEREWOLF",
  "displayName": "홍길동",
  "isBot": false
}
```
* **주의**: 강도(Robber)나 말썽쟁이(Troublemaker)에 의해 카드가 맞바뀌면 파일 내용이 갱신되거나 파일명이 `MOVE` 됩니다.

### (4) 중앙 카드: `center.json`
* **경로**: `/rooms/{roomId}/center.json`
* **역할**: 게임 시작 시 중앙에 뒷면으로 놓이는 3장의 카드.
```json
{
  "cards": ["VILLAGER", "DRUNK", "MINION"]
}
```

### (5) 투표 내역: `votes/{userId}.txt`
* **경로**: `/rooms/{roomId}/votes/{userId}.txt`
* **파일 내용**: 투표 지목 대상의 `userId` 문자열 (Plain Text).
* **집계 방식**: 방장이 `PROPFIND /rooms/{roomId}/votes/`로 목록을 읽어 각 파일의 텍스트 내용을 합산 집계.

---

## 3. WebDAV 클라이언트 I/O 인터페이스 (`/src/lib/webdav.ts`)

| 메서드 | HTTP Verb | 목적 | 헤더/페이로드 |
| :--- | :--- | :--- | :--- |
| `propfind(path, depth)` | `PROPFIND` | 디렉터리 내 자식 파일/폴더 목록 검색 | `Depth: 0 또는 1`, XML 파싱 (D:response) |
| `get<T>(path)` | `GET` | 파일 내용 읽기 (JSON 파싱 자동 처리) | `Cache-Control: no-cache` |
| `put(path, data)` | `PUT` | 신규 파일 생성 또는 덮어쓰기 | `Content-Type: application/json` 또는 `text/plain` |
| `mkcol(path)` | `MKCOL` | 신규 폴더/컬렉션 생성 | (없음) |
| `move(src, dest)` | `MOVE` | 원자적 파일명 변경 및 스왑 트랜잭션 | `Destination: {destPath}`, `Overwrite: T` |
| `delete(path)` | `DELETE` | 파일 또는 컬렉션 삭제 | (없음) |

---

## 4. 모바일 환경 최적화 (Mobile First & PWA)

1. **Screen Wake Lock API (`/src/hooks/useWakeLock.ts`)**:
   * 게임 도중 화면 꺼짐(절전 모드)으로 인해 폴링이 중단되거나 턴을 놓치는 문제를 원천 차단.
   * `document.visibilitychange` 이벤트와 연동되어 백그라운드 복귀 시 자동 재요청.
2. **초대용 QR 코드**:
   * `qrcode` 라이브러리로 `https://도메인/?room={roomId}` 형태의 URL을 동적 생성.
   * 별도 모바일 앱 설치(Zero-Install) 없이 스마트폰 기본 카메라로 즉시 입장.
3. **PWA 매니페스트 및 서비스 워커 (`manifest.webmanifest`, `sw.js`)**:
   * 홈 화면 바로가기 추가 지원 (`display: standalone`).
   * 오프라인 리소스 캐시 및 네트워크 단절 시 `OfflineIndicator` 즉시 노출.
