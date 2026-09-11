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
4. **GitHub Actions 자동 빌드 & NAS release 브랜치 연동 (불필요한 소스코드 제외, 오직 dist만)**:
   > 본 저장소의 `.github/workflows/deploy.yml`은 Codespaces 또는 로컬에서 `git push` 시 GitHub Actions(Node 20 LTS)에서 자동으로 빌드를 수행하고, **오직 순수 `dist/` 산출물만 `release` 브랜치에 푸시**합니다. (소스코드, node_modules, package.json 등 불필요한 파일이 전혀 포함되지 않음)
   
   * **NAS에서 오직 배포 파일(dist)만 클론하기**:
     ```bash
     mkdir -p /var/www/werewolf/dist
     cd /var/www/werewolf/dist
     # release 브랜치만 단독 클론 (용량 최소화)
     git clone -b release --single-branch <저장소_URL> .
     sudo chown -R www-data:www-data /var/www/werewolf/dist
     ```
   * **이후 업데이트 시**:
     ```bash
     cd /var/www/werewolf/dist
     git pull origin release
     sudo chown -R www-data:www-data /var/www/werewolf/dist
     ```
5. **Apache VirtualHost 설정 (`/etc/apache2/sites-available/werewolf.conf`)**:
   ```apache
   DavLockDB /var/lock/apache2/DavLock

   <VirtualHost *:80>
       ServerName your-nas-ip-or-domain
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
           Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS"
           Header always set Access-Control-Allow-Headers "Content-Type, Depth, Destination, Authorization"
           Header always set Access-Control-Expose-Headers "DAV, Location"
           Header always set DAV "1, 2"
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
4. **빌드 결과물 복사**:
   로컬에서 `npm run build` 실행 후 생성된 `dist/` 폴더 안의 모든 파일을 NAS의 `/var/www/werewolf/dist/`로 업로드.

