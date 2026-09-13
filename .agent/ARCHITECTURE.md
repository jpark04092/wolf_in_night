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
|        Vite Dev Server (포트 5173) / Express 서버 (포트 3000)            |
|   - 공용 미들웨어: src/server/webdavMiddleware.ts (Connect/Express)      |
|   - 엔드포인트: /webdav/* (WebDAV RFC 4918), /api/rooms (고속 방 조회)   |
|   - 정적 파일 제공: Vite HMR / dist/ (빌드 아티팩트)                      |
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
  "killed": ["user_d3e4f"] | null,
  "round": 1,
  "fastMode": false,
  "testMode": false
}
```
* **currentStep**: 밤 단계(`NIGHT`) 시작 직후에는 `null`로 초기화되어 5.0초간(Fast Mode 시 3.0초) 전원 시작 직업 카드(`RoleRevealModal`) 확인 단계를 거칩니다. 이후 `WEREWOLF` → `SEER` → `ROBBER` → `TROUBLEMAKER` → `INSOMNIAC` 순으로 전진하며, 아침 토론/투표/결과/대기실 단계에서는 `null`이 됩니다.
* **round**: 게임 회차 카운터 (방 생성 시 0, 게임 시작 시 1씩 증가). 턴 스텝 이동 시 갱신되는 `stepStartedAt`과 게임 회차 구분을 독립시켜 턴 전환 시 시작 직업 모달 재팝업을 방지.

### (3) 유저 카드 상태: `{userId}.json`
* **경로**: `/rooms/{roomId}/{userId}.json` (예: `user_x92a.json`)
* **역할**: 해당 플레이어의 현재 손패 및 초기 부여 직업 저장.
```json
{
  "role": "WEREWOLF",
  "initialRole": "WEREWOLF",
  "displayName": "홍길동",
  "isBot": false,
  "lastSeen": 1741678805000,
  "sessionId": "sess_x92a1"
}
```
* **주의**: 강도(Robber)나 말썽쟁이(Troublemaker)에 의해 카드가 맞바뀌더라도 유저 파일명을 MOVE하지 않고, 오직 `role` 필드만 상호 교체하여 갱신(`PUT`)합니다. `initialRole` 및 `displayName`, `lastSeen`, `sessionId`는 영구 보존되어 신원 파괴를 원천 차단합니다.
* **lastSeen**: 브라우저 탭 활성 상태를 알리는 하트비트 타임스탬프(4초 주기 갱신). 대기실에서 12초 초과 미갱신 시 오프라인으로 판정됩니다.
* **sessionId**: 브라우저 탭/클라이언트의 고유 세션 토큰으로 동일 ID에 대한 다중 탭/다중 기기 중복 접속 및 충돌을 감지하고 방지합니다.

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
* **상태 관리**: 투표 제출 전에는 후보 카드를 자유롭게 터치하여 변경 가능하며, `[투표 제출하기]` 클릭 시 WebDAV 파일이 생성되고 선택이 확정(잠금)됩니다.
* **집계 방식**: 방장이 `PROPFIND /rooms/{roomId}/votes/`로 목록을 읽어 각 파일의 텍스트 내용을 합산 집계.

### (6) 관리자 보안 설정 파일: `admin.json`
* **경로**: `/admin.json` (루트 WebDAV 디렉터리)
* **역할**: 관리자 인증 비밀번호 및 업데이트 타임스탬프 저장. (단순 파일 기반 직접 대조 방식 지원)
```json
{
  "password": "0000",
  "updatedAt": 1741678800000
}
```
* **초기 비밀번호**: `0000` (서버 부팅 및 설치 시 자동 셋업). 관리자 대시보드에서 변경 및 0000 리셋 가능.

### (7) 리매치 및 대기실 복귀 시 파일 생명주기 (Rematch & Cleanup Lifecycle)
한 게임이 끝난 후 방장이 `[대기실로 돌아가기]`를 누르거나 새 게임을 시작할 때 이전 게임에 영향을 미치지 않도록 WebDAV 파일들을 안전하게 정리합니다:
* **`votes/` 디렉터리 내 개별 투표 파일 정리 (`clearVotesDirectory`)**: 이전 게임의 투표 파일(`votes/*.txt`)들을 `PROPFIND /rooms/{roomId}/votes/`로 순회하여 개별 삭제(`delete`)합니다. 디렉터리 자체를 `DELETE`/`MKCOL`하지 않음으로써 WebDAV RFC 4918 디렉터리 리다이렉트(301/405) 및 폴더 누락(409) 충돌을 원천 차단하고, 두 번째 판 이후 투표 파일이 즉시 갱신되어 정상 투표가 가능하도록 보장합니다.
* **`{userId}.json` 역할 리셋**: 유저의 `initialRole` 필드를 삭제하고 `role: 'VILLAGER'`로 리셋. 유저 신원 및 세션(`displayName`, `avatarId`, `sessionId`, `lastSeen`)은 보존.
* **`state.json` 대기 상태 전이**: `phase: 'WAITING'`, `currentStep: null`, `stepStartedAt: 0`, `killed: null`, `round` 보존으로 갱신하여 방 전체를 대기실 상태로 회귀.


---

## 3. WebDAV 클라이언트 I/O 인터페이스 (`/src/lib/webdav.ts`)

| 메서드 | HTTP Verb | 목적 | 헤더/페이로드 |
| :--- | :--- | :--- | :--- |
| `listRooms()` | `GET` 또는 `PROPFIND` | 방 목록 및 접속자/페이즈 일괄 조회 (고속 동기화) | `Cache-Control: no-store` (`/api/rooms` 우선, PROPFIND 대체) |
| `propfind(path, depth)` | `PROPFIND` | 디렉터리 내 자식 파일/폴더 목록 검색 | `Depth: 0 또는 1`, XML/JSON 파싱 (D:response) |
| `get<T>(path)` | `GET` | 파일 내용 읽기 (JSON 파싱 자동 처리) | `Cache-Control: no-cache, no-store` |
| `put(path, data)` | `PUT` | 신규 파일 생성 또는 덮어쓰기 | `Content-Type: application/json` 또는 `text/plain` |
| `mkcol(path)` | `MKCOL` | 신규 폴더/컬렉션 생성 | (없음) |
| `move(src, dest)` | `MOVE` | 원자적 파일명 변경 및 스왑 트랜잭션 | `Destination: {destPath}`, `Overwrite: T` |
| `delete(path)` | `DELETE` | 파일 또는 컬렉션 삭제 (200, 204, 404 시 멱등 성공 처리) | (없음) |

> **네트워크 & 동기화 안정성 보장 조치**:
> * **CORS 프리플라이트 완벽 지원**: `Accept`, `Depth`, `Destination`, `Cache-Control`, `Pragma`, `Authorization` 등 커스텀 WebDAV 헤더 사전 승인.
> * **캐시 무효화 및 PWA 바이패스**: 모든 WebDAV 및 API(`/api/*`, `/webdav/*`) 요청은 Service Worker 캐시를 바이패스하여 브라우저/프록시 304 또는 빈 상태 캐싱을 원천 차단.
> * **RFC 4918 디렉터리 표준 준수**: WebDAV 컬렉션 조회(`PROPFIND`, `MKCOL`) 시 trailing slash(`/rooms/`, `/rooms/{id}/`, `/rooms/{id}/votes/`)를 강제 보장하여 웹서버(Apache/Nginx)의 301 Moved Permanently 리다이렉트 실패 방지.
> * **VirtualFS 폴백 조건 정밀화**: 정상적인 404(자원 미존재) 및 MKCOL 405(기존 디렉터리 존재) 응답이 가상 WebDAV(localStorage)로 잘못 폴백되지 않도록 HTML SPA 응답이나 501 미지원 시에만 한정 폴백.
> * **로비 2초 자동 폴링**: 로비 진입 후 2초 간격으로 `listRooms()`를 호출하여 다른 기기에서 생성된 방을 새로고침 없이 실시간 갱신 (불필요한 반복 `mkcol` 호출 제거).
> * **멀티 탭 세션 분리 (`sessionStorage`)**: 동일 기기/브라우저에서 탭을 여러 개 열어 테스트할 때 `sessionStorage`를 우선 사용하여 각 탭마다 고유한 `myId`를 부여, 플레이어 충돌 및 데이터 덮어쓰기 방지.
> * **Multi-Tab BroadcastChannel VirtualFS 동기화**: 일시적 네트워크 순단이나 가상 폴백 모드에서도 `BroadcastChannel`과 `localStorage`를 통해 브라우저의 다른 탭들과 방 목록 및 상태를 실시간 상호 동기화.
> * **한글/특수문자 방 코드 디코딩**: URL 디코딩(`decodeURIComponent`) 처리로 다국어 방 이름 완벽 호환.
> * **초대 링크 & 직접 코드 입력**: `?room={roomId}` 쿼리 파라미터 감지 시 1클릭 입장 배너 및 로비 내 직접 코드 입력창 제공.

---

## 4. 모바일 환경 최적화 (Mobile First & PWA)

1. **Screen Wake Lock API (`/src/hooks/useWakeLock.ts`)**:
   * 게임 도중 화면 꺼짐(절전 모드)으로 인해 폴링이 중단되거나 턴을 놓치는 문제를 원천 차단.
   * `document.visibilitychange` 이벤트와 연동되어 백그라운드 복귀 시 자동 재요청.
2. **초대용 QR 코드**:
   * `qrcode` 라이브러리로 `https://도메인/?room={roomId}` 형태의 URL을 동적 생성.
   * 별도 모바일 앱 설치(Zero-Install) 없이 스마트폰 기본 카메라로 즉시 입장.
3. **PWA 매니페스트 및 서비스 워커 (`manifest.webmanifest`, `public/sw.js`)**:
   * 홈 화면 바로가기 추가 지원 (`display: standalone`).
   * 오프라인 리소스 캐시 및 네트워크 단절 시 `OfflineIndicator` 즉시 노출.
   * **버전 관리 및 Network-First 문서 전략 (`one-night-werewolf-v2`)**: 신규 배포 시 구버전 번들 고착을 막기 위해 HTML/문서 요청에 Network-First 전략을 적용하고, 서비스 워커 활성화 시 구버전 캐시를 원자적으로 자동 제거.

---

## 5. WebDAV 서버 설치 및 배포 가이드 (Installation & Setup)

### 방법 1. 본 프로젝트 내장 WebDAV 서버 사용 (가장 간단, 권장)
본 프로젝트의 `server.ts`에 이미 RFC 4918 규격의 WebDAV 핸들러(`webdav_storage/`)와 CORS 설정이 완벽히 구현되어 있습니다. 별도의 Nginx나 외부 DB 설치 없이 즉시 구동됩니다.
```bash
# 1. 의존성 설치
npm install

# 2. 프로덕션 빌드 (Vite 클라이언트 번들링 + esbuild 서버 번들링)
npm run build

# 3. 서버 실행 (포트 3000)
npm run start
```
* 저장 경로: `./webdav_storage/rooms/` 하위에 파일이 영구 보관됩니다.

### 방법 2. 독립형 Nginx WebDAV 서버 연동
자체 Linux 서버나 NAS에 독립형 Nginx를 두고 프록시 또는 저장소로 분리할 경우:
```nginx
# nginx.conf 예시
server {
    listen 80;
    server_name your-domain.com;

    # 1. 프론트엔드 정적 파일 서빙
    location / {
        root /var/www/werewolf/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. WebDAV 전용 엔드포인트 (/webdav/)
    location /webdav/ {
        alias /var/webdav_data/;
        
        # WebDAV 활성화 (nginx-extras 모듈 필요: PROPFIND, MKCOL 지원)
        dav_methods PUT DELETE MKCOL COPY MOVE;
        dav_ext_methods PROPFIND OPTIONS;
        create_full_put_path on;
        dav_access user:rw group:rw all:r;

        # WebDAV CORS 허용 헤더
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Depth, Destination" always;
        add_header DAV "1, 2" always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
```

### 방법 3. Docker를 이용한 독립형 WebDAV 컨테이너 실행
```bash
# Nginx WebDAV 이미지 실행
docker run -d --name werewolf-webdav \
  -p 8080:80 \
  -v $(pwd)/webdav_storage:/var/webdav \
  -e WEBDAV_DATADIR=/var/webdav \
  bytemark/webdav
```
* 클라이언트 `src/lib/webdav.ts`의 `baseUrl`을 `http://서버IP:8080`으로 지정하여 연동 가능합니다.

### 방법 4. Custom NAS의 Apache HTTP Server (`/var/www`) 연동
NAS에 이미 Apache가 설치되어 `/var/www`를 사용 중인 경우:

1. **클론 추천 경로**: `/var/www/werewolf`
   ```bash
   cd /var/www
   sudo git clone <저장소_URL> werewolf
   sudo chown -R $USER:$USER /var/www/werewolf
   ```
2. **필수 Apache 모듈 활성화**:
   ```bash
   sudo a2enmod dav dav_fs headers rewrite
   ```
3. **WebDAV 락 디렉터리 및 저장소 생성/권한 설정**:
   ```bash
   # WebDAV 저장 폴더 생성
   mkdir -p /var/www/werewolf/webdav/rooms
   sudo mkdir -p /var/lock/apache2

   # 빌드 및 WebDAV 디렉터리 권한 부여
   sudo chown -R www-data:www-data /var/www/werewolf/webdav
   sudo chown -R www-data:www-data /var/lock/apache2
   sudo chmod -R 775 /var/www/werewolf/webdav
   ```
4. **1-Click 자동 설치 스크립트 (`install.sh`)**:
   - 신규 서버나 다른 환경에서 클론 후 Apache 가상호스트, 필수 모듈(`dav`, `dav_fs`, `headers`, `rewrite`), WebDAV 폴더, CORS 헤더 및 권한을 한 번에 자동 구성합니다.
   ```bash
   sudo chmod +x install.sh update.sh
   sudo ./install.sh [설치경로(기본 /var/www/werewolf)] [포트(기본 80)] [도메인/IP(기본 _)]
   # 예: sudo ./install.sh /var/www/werewolf 80 _
   ```

5. **1-Click 릴리즈 업데이트 스크립트 (`update.sh`)**:
   - GitHub Actions가 `main` 브랜치 푸시 시 `dist/` 산출물과 `update.sh`를 `release` 브랜치에 자동 강제 푸시합니다.
   - 서버에서 최신 배포본으로 갱신할 때 단 한 줄로 안전하게 fetch, reset, 권한 복구 및 `version.json` 확인을 수행합니다.
   ```bash
   # dist 디렉터리 또는 werewolf 루트에서 실행:
   ./update.sh
   # (배포 버전 및 Git 커밋 해시가 터미널에 자동 출력됨)
   ```

6. **Apache VirtualHost 설정 참조 (`/etc/apache2/sites-available/werewolf.conf`)**:
   ```apache
   DavLockDB /var/lock/apache2/DavLock

   <VirtualHost *:80>
       ServerName _
       DocumentRoot /var/www/werewolf/dist

       # 1. WebDAV 저장소 엔드포인트
       Alias /webdav /var/www/werewolf/webdav
       <Directory /var/www/werewolf/webdav>
           Dav On
           Options Indexes FollowSymLinks
           AllowOverride None
           Require all granted

           # WebDAV 브라우저 연동용 CORS 헤더
           Header always set Access-Control-Allow-Origin "*"
           Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS, HEAD"
           Header always set Access-Control-Allow-Headers "Content-Type, Depth, Destination, Authorization, Cache-Control, Pragma, X-Requested-With, Accept"
           Header always set Access-Control-Expose-Headers "DAV, Location, Date"
           Header always set DAV "1, 2"

           # 실시간 상태 보장용 캐시 무효화
           Header always set Cache-Control "no-cache, no-store, must-revalidate, max-age=0"
           Header always set Pragma "no-cache"
       </Directory>

       # 2. React SPA 라우팅 지원 (HTML5 History API)
       <Directory /var/www/werewolf/dist>
           Options FollowSymLinks
           AllowOverride None
           Require all granted

           RewriteEngine On
           RewriteCond %{REQUEST_URI} !^/webdav [NC]
           RewriteCond %{REQUEST_FILENAME} !-f
           RewriteCond %{REQUEST_FILENAME} !-d
           RewriteRule ^ index.html [QSA,L]
       </Directory>
   </VirtualHost>
   ```

7. **빌드 결과물 복사 및 릴리즈 브랜치 배포**:
   - GitHub Actions(`.github/workflows/deploy.yml`)가 main 푸시 시 자동으로 `npm run build`를 수행하여 빌드 결과물(`dist/`)을 `release` 브랜치에 강제 푸시합니다.
   - 빌드 시 `version.json`이 자동 생성되어 `version`, `commit`, `buildTime(KST)`이 기록되며, 프론트엔드 코드 번들에도 전역 주입됩니다.
   - 로비 및 인게임 화면 최상단에 `VersionBadge`(`v1.1.0 · #commit`)가 상시 표시되어 최신 배포 여부를 즉시 확인할 수 있습니다.
   - 서버 터미널에서도 `cat /var/www/werewolf/dist/version.json`으로 배포 상태를 바로 확인할 수 있습니다.

---

## 8. 브라우저 새로고침 대응 및 세션 복원 / Presence 프로토콜

### (1) 브라우저 새로고침(F5) 시 세션 보존 메커니즘
* **세션 식별자**: `sessionStorage`에 `onw_room_id`, `onw_my_id`를 보관하고, 브라우저 주소창을 `/?room={roomId}`로 실시간 동기화(`window.history.replaceState`).
* **세션 복원 (`restoreSession`)**:
  - 앱 마운트 시 `sessionStorage` 또는 URL 파라미터에서 `roomId`를 감지하면 즉시 복원 시퀀스를 실행합니다.
  - `/rooms/{roomId}/state.json`과 `/rooms/{roomId}/{myId}.json`을 확인합니다.
  - **직업 보존**: 기존 유저 카드가 존재할 경우 기존 배정된 직업(`role`, `initialRole`)을 그대로 보존하며, 절대 `VILLAGER`로 덮어쓰지 않습니다.
  - **투표 복원**: `VOTING` 단계일 경우 `/rooms/{roomId}/votes/{myId}.txt`를 읽어 투표 대상 선택 상태를 복구합니다.
  - **비정상 접근 차단**: 유저 카드가 없는데 이미 게임이 진행 중(`phase !== 'WAITING'`)인 경우, 난입이 불가능하므로 안전하게 세션을 지우고 로비로 회귀시킵니다.
* **명시적 퇴장 분리**:
  - 오직 상단 헤더의 `[방 나가기]` 버튼을 사용자가 직접 클릭했을 때만 서버 파일 삭제 및 `sessionStorage.removeItem('onw_room_id')`가 실행됩니다.

### (2) 하트비트(Heartbeat) 및 유령 플레이어/중복 참가 방지
* **하트비트 루프**:
  - 방에 입장한 모든 클라이언트는 4초 주기로 자신의 `{myId}.json` 파일의 `lastSeen` 타임스탬프(`Date.now()`) 및 `sessionId`를 갱신합니다.
  - 모바일 기기 화면 복귀(`visibilitychange`) 시에도 즉시 `lastSeen`과 `sessionId`를 터치합니다.
* **접속 상태 판정**:
  - `0.8s` 상태 폴링 시 `Date.now() - uData.lastSeen < 12000` (12초 이내, 테스트 모드는 180초)이면 온라인, 초과 시 '오프라인'으로 판정합니다.
* **대기실 방장 강퇴(`Kick`) 권한**:
  - 대기실(`WAITING`)에서 12초 이상 하트비트가 끊겨 오프라인이 된 좀비 플레이어가 있을 경우, 방장에게 `[강퇴]` 버튼(`UserX`)이 노출되어 방 파일 목록에서 안전하게 제거할 수 있습니다.
* **동일 닉네임(ID) 활성 플레이어 중복 입장 차단**:
  - 대기실 입장(`handleJoinRoom`) 및 세션 복원(`restoreSession`) 시 대상 방의 활성 플레이어 중 동일한 닉네임(`displayName`, 대소문자 무시 및 공백 제거)이 이미 존재하는 경우, 입장을 원천 차단하고 사용자에게 안내 토스트를 띄운 뒤 로비에 머무르도록 합니다.
  - 동일한 `displayName`을 가진 세션이 12초 이상 경과한 비활성(stale) 상태라면, 이전 잔재 파일로 판단하여 신규 입장 시 자동으로 삭제(`DELETE`)하고 재입장(Takeover)을 허용합니다.
* **동일 세션 ID(`myId`) 다중 탭 동시 접속 감지 (`BroadcastChannel`)**:
  - 탭 복제(Duplicate Tab) 등으로 동일한 `myId`를 가진 브라우저 탭이 추가로 열리는 경우, `BroadcastChannel('onw_tab_sync_{myId}')` 기반의 `PING_SESSION`/`PONG_SESSION` 핸드셰이크를 통해 이미 활성 상태인 탭이 있는지 감지합니다.
  - 기존 탭이 응답할 경우 신규 탭의 대기실 입장을 즉시 차단하고 로비로 안내합니다. F5 새로고침 시에는 기존 탭이 언로드된 후 복원되므로 차단되지 않고 세션이 안전하게 유지됩니다.
* **다중 기기 세션 충돌 감지 (`sessionId`)**:
  - `0.8s` 주기 상태 동기화 중 서버상의 `{myId}.json`에 기록된 `sessionId`가 현재 탭의 세션 토큰과 다를 경우, 다른 기기/창에서 새롭게 접속한 것으로 판단하여 현재 탭을 자동으로 연결 종료하고 사용자에게 안내 토스트를 출력합니다.

### (3) 방장 퇴장(Leave) 시 권한 위임(Host Handover) 및 빈 방 수명주기
* **명시적 방장 퇴장 처리 (`handleLeaveRoom`)**:
  - 방장(`isHost`)이 `[방 나가기]`를 클릭하면 접속자 목록에서 다른 인간 플레이어(`otherHumans = players.filter(p => !p.isBot && p.id !== myId)`)를 탐색합니다.
  - **다른 인간 플레이어가 남은 경우**: 리스트 첫 번째 유저(`otherHumans[0]`)를 새 방장으로 지정하여 `/rooms/{roomId}/state.json`의 `hostId`를 즉시 이전 갱신(`PUT`)하고 본인 카드 파일을 삭제합니다.
  - **혼자 남은 경우**: 유령 방 방지를 위해 방 전체 컬렉션을 즉시 삭제(`DELETE /rooms/{roomId}`)합니다.
* **비정상 종료(탭 닫기/네트워크 단절) 시 자가치유 승계 (Fail-Safe Self-Healing)**:
  - 게스트 클라이언트가 `0.8s` 주기 폴링 시 방장 파일(`user_{hostId}.json`)이 부재하거나, 대기실(`WAITING`)에서 방장이 12초 이상 오프라인 상태임을 감지합니다.
  - 남아있는 온라인 인간 플레이어 중 리스트 1순위(`activeHumans[0]`) 클라이언트가 단독으로 `state.json`의 `hostId`를 자신의 ID로 원자적 승계 갱신하여 대기실 고착을 방지합니다.
* **방 삭제(404) 감지 및 로비 자동 안전 복귀 (Graceful 404 Exit)**:
  - `syncState` 중 `state.json`이 2회 연속 부재(404 Not Found)할 경우, 대기실이 정상 종료/삭제된 것으로 판정하여 사용자 안내 토스트를 띄우고 세션을 정리한 후 로비로 안전하게 자동 복귀합니다.

---

## 9. 관리자(Admin) 권한 및 룸 라이프사이클 제어 아키텍처

### (1) 관리자 인증 및 보안 체계
* **저장소**: 루트 디렉터리의 `/admin.json`에 `password` 형태로 저장되어 직접 대조됩니다. (비보안 HTTP, LAN IP, 모바일 웹뷰 등 모든 환경에서 100% 동작 보장)
* **초기 비밀번호**: `0000`으로 자동 설정되며, 관리자 대시보드 [보안 설정] 탭에서 언제든지 새 비밀번호로 갱신하거나 `0000`으로 원클릭 리셋 가능합니다.
* **세션 유지**: 관리자 로그인 성공 시 `sessionStorage('onw_is_admin')`에 인증 플래그가 저장되어 새로고침 후에도 유지되며, 명시적 로그아웃 지원.

### (2) 룸 라이프사이클 관리 기능
* **로비 직접 삭제**: 관리자 모드 활성화 시 로비의 각 방 카드 우측에 `[🗑️ 삭제]` 버튼이 활성화되어, 컨펌 후 `DELETE /rooms/{roomId}`를 호출해 즉시 영구 삭제합니다.
* **빈 방 일괄 정리**: 접속자 수가 0명인 유령 방들을 탐색하여 일괄 삭제(`handleCleanEmptyRooms`).
* **전체 룸 초기화**: 시스템 점검 또는 테스트 데이터 초기화를 위한 전체 방 일괄 정리 기능 제공.
* **기능 확장성**: 향후 전체 공지 브로드캐스트, 서버 모니터링 등 추가 기능을 수용할 수 있는 모듈형 관리자 대시보드(`AdminModal.tsx`) 탑재.

### (3) 검증용 테스트 모드 (Test Mode & Timer Freeze)
* **목적**: 단일 테스터가 복수의 브라우저 탭을 전환하며 룰과 동기화를 여유롭게 검증할 수 있도록 지원.
* **동작 메커니즘**:
  - 관리자 인증(`isAdmin`) 또는 대기실/인게임 상단 헤더 토글을 통해 활성화 (`state.testMode = true`).
  - **밤 단계(NIGHT) 자동 전진 완전 중지**: 타임아웃에 의한 자동 전진을 중단하고 수동 `[다음 밤 단계 진행 ⏩]` 컨트롤 제공.
  - **토론 단계(DAY_DISCUSSION) 무제한**: 300초 카운트다운 타이머를 중지하고 방장의 [투표 시작] 클릭 시까지 영구 대기.
  - **백그라운드 탭 하트비트 스로틀링 보호**: 브라우저 비활성 탭의 타이머 지연으로 인한 오프라인 오판정을 방지하기 위해 하트비트 임계치를 12초에서 **180초(3분)**로 대폭 연장.

