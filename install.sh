#!/usr/bin/env bash
# ==============================================================================
# 한밤의 늑대인간 (One Night Ultimate Werewolf) - Apache & WebDAV 자동 설치 스크립트
# 사용법:
#   sudo ./install.sh [설치경로] [아파치포트] [도메인또는IP]
# 예시:
#   sudo ./install.sh /var/www/werewolf 80 _
#   sudo ./install.sh /var/www/werewolf 8080 192.168.0.10
# ==============================================================================

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${PURPLE}"
echo "=========================================================="
echo "   🌙 한밤의 늑대인간 WebDAV PWA - Apache 자동 설치기"
echo "=========================================================="
echo -e "${NC}"

# 1. Root / Sudo 권한 확인
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[오류] 이 스크립트는 루트 권한으로 실행해야 합니다. (예: sudo ./install.sh)${NC}"
  exit 1
fi

# 실제 로그인 사용자 확인 (sudo로 실행했을 때 원래 사용자)
REAL_USER=${SUDO_USER:-$USER}
if [ "$REAL_USER" = "root" ]; then
  REAL_USER=$(logname 2>/dev/null || echo "root")
fi

# 파라미터 기본값 설정
TARGET_DIR="${1:-/var/www/werewolf}"
APACHE_PORT="${2:-80}"
SERVER_NAME="${3:-_}"

DIST_DIR="${TARGET_DIR}/dist"
WEBDAV_DIR="${TARGET_DIR}/webdav"
ROOMS_DIR="${WEBDAV_DIR}/rooms"

echo -e "${CYAN}[1/7] 환경 설정 및 디렉터리 확인${NC}"
echo " - 설치 경로: ${TARGET_DIR}"
echo " - 정적 웹 파일: ${DIST_DIR}"
echo " - WebDAV 저장소: ${WEBDAV_DIR}"
echo " - 아파치 포트: ${APACHE_PORT}"
echo " - 서버 이름: ${SERVER_NAME}"
echo " - 실행 계정: ${REAL_USER}"

# 2. Apache2 및 Git 설치 확인
echo -e "\n${CYAN}[2/7] 필수 패키지 (Apache2, Git) 확인${NC}"
if ! command -v apache2 >/dev/null 2>&1; then
  echo -e "${YELLOW}Apache2가 설치되어 있지 않습니다. apt를 통해 설치합니다...${NC}"
  apt-get update
  apt-get install -y apache2 git
else
  echo -e "${GREEN}✓ Apache2 및 Git 준비 완료${NC}"
fi

# 3. 필수 아파치 모듈 활성화
echo -e "\n${CYAN}[3/7] 필수 Apache2 모듈 활성화 (dav, dav_fs, headers, rewrite)${NC}"
a2enmod dav >/dev/null 2>&1 || true
a2enmod dav_fs >/dev/null 2>&1 || true
a2enmod headers >/dev/null 2>&1 || true
a2enmod rewrite >/dev/null 2>&1 || true
echo -e "${GREEN}✓ Apache2 모듈 활성화 완료${NC}"

# 4. 디렉터리 생성 및 Lock 파일 준비
echo -e "\n${CYAN}[4/7] 서비스 디렉터리 및 권한 구조 생성${NC}"
mkdir -p "${DIST_DIR}"
mkdir -p "${ROOMS_DIR}"
mkdir -p /var/lock/apache2
chown -R www-data:www-data /var/lock/apache2

# 원격 Git 저장소 URL 감지
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL=""
if git -C "${SCRIPT_DIR}" remote get-url origin >/dev/null 2>&1; then
  REPO_URL=$(git -C "${SCRIPT_DIR}" remote get-url origin)
fi

# 5. release 브랜치 코드 배포 (dist 디렉터리)
echo -e "\n${CYAN}[5/7] release 브랜치 빌드 결과물 배포${NC}"
if [ -d "${DIST_DIR}/.git" ]; then
  echo -e "기존 Git 저장소 감지됨. release 브랜치 최신화..."
  sudo -u "${REAL_USER}" git config --global --add safe.directory "${DIST_DIR}" || true
  git config --global --add safe.directory "${DIST_DIR}" || true
  git -C "${DIST_DIR}" fetch origin release || true
  git -C "${DIST_DIR}" reset --hard origin/release || true
elif [ -n "${REPO_URL}" ]; then
  echo -e "원격 저장소(${REPO_URL})에서 release 브랜치를 클론합니다..."
  sudo -u "${REAL_USER}" git clone -b release --single-branch "${REPO_URL}" "${DIST_DIR}" || {
    echo -e "${YELLOW}클론 실패 시 현재 프로젝트 dist 폴더 내용을 복사합니다.${NC}"
    if [ -d "${SCRIPT_DIR}/dist" ]; then
      cp -r "${SCRIPT_DIR}/dist/"* "${DIST_DIR}/"
    fi
  }
else
  if [ -d "${SCRIPT_DIR}/dist" ]; then
    echo -e "현재 디렉터리의 dist 빌드 결과물을 복사합니다..."
    cp -r "${SCRIPT_DIR}/dist/"* "${DIST_DIR}/"
  fi
fi

# 6. Apache 가상 호스트 설정 파일 생성
echo -e "\n${CYAN}[6/7] Apache VirtualHost 설정 생성 (/etc/apache2/sites-available/werewolf.conf)${NC}"

# Listen 포트 확인 및 추가
if [ "${APACHE_PORT}" != "80" ]; then
  if ! grep -q "^Listen ${APACHE_PORT}" /etc/apache2/ports.conf 2>/dev/null; then
    echo "Listen ${APACHE_PORT}" >> /etc/apache2/ports.conf
    echo -e "${YELLOW}ports.conf에 Listen ${APACHE_PORT} 추가됨${NC}"
  fi
fi

CONF_FILE="/etc/apache2/sites-available/werewolf.conf"

cat <<'EOF' > "${CONF_FILE}.tmp"
DavLockDB /var/lock/apache2/DavLock

<VirtualHost *:${APACHE_PORT}>
    ServerName ${SERVER_NAME}
    DocumentRoot ${DIST_DIR}

    # 1. WebDAV 실시간 데이터 저장소
    Alias /webdav ${WEBDAV_DIR}
    <Directory ${WEBDAV_DIR}>
        Dav On
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted

        # WebDAV 및 다기기 브라우저 연동용 완벽 CORS 헤더
        Header always set Access-Control-Allow-Origin "*"
        Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS, HEAD"
        Header always set Access-Control-Allow-Headers "Content-Type, Depth, Destination, Authorization, Cache-Control, Pragma, X-Requested-With, Accept"
        Header always set Access-Control-Expose-Headers "DAV, Location, Date"
        Header always set DAV "1, 2"

        # WebDAV 실시간 상태 보장을 위한 강력한 캐시 무효화
        Header always set Cache-Control "no-cache, no-store, must-revalidate, max-age=0"
        Header always set Pragma "no-cache"
    </Directory>

    # 2. React SPA 라우팅 및 캐시 방지 (HTML5 History API)
    <Directory ${DIST_DIR}>
        Options FollowSymLinks
        AllowOverride None
        Require all granted

        RewriteEngine On
        RewriteCond %{REQUEST_URI} !^/webdav [NC]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.html [QSA,L]
    </Directory>

    # 정적 파일 MIME 타입 보장
    AddType application/manifest+json .webmanifest
    AddType application/javascript .js
    AddType text/css .css

    ErrorLog ${APACHE_LOG_DIR}/werewolf_error.log
    CustomLog ${APACHE_LOG_DIR}/werewolf_access.log combined
</VirtualHost>
EOF

# 템플릿 변수 치환
sed -e "s|\${APACHE_PORT}|${APACHE_PORT}|g" \
    -e "s|\${SERVER_NAME}|${SERVER_NAME}|g" \
    -e "s|\${DIST_DIR}|${DIST_DIR}|g" \
    -e "s|\${WEBDAV_DIR}|${WEBDAV_DIR}|g" \
    "${CONF_FILE}.tmp" > "${CONF_FILE}"
rm -f "${CONF_FILE}.tmp"

echo -e "${GREEN}✓ ${CONF_FILE} 생성 완료${NC}"

# 7. update.sh 배치 및 권한 부여
echo -e "\n${CYAN}[7/7] 업데이트 스크립트(update.sh) 배치 및 최종 권한 설정${NC}"

if [ -f "${SCRIPT_DIR}/update.sh" ]; then
  cp "${SCRIPT_DIR}/update.sh" "${TARGET_DIR}/update.sh"
  cp "${SCRIPT_DIR}/update.sh" "${DIST_DIR}/update.sh" 2>/dev/null || true
  chmod +x "${TARGET_DIR}/update.sh" "${DIST_DIR}/update.sh" 2>/dev/null || true
fi

# 소유권 및 권한 설정:
# dist: 사용자가 git update 할 수 있도록 $REAL_USER:www-data (775)
# webdav: 아파치 데몬이 방과 상태 파일을 쓰도록 www-data:www-data (775)
chown -R "${REAL_USER}:www-data" "${DIST_DIR}"
chown -R www-data:www-data "${WEBDAV_DIR}"
chmod -R 775 "${DIST_DIR}"
chmod -R 775 "${WEBDAV_DIR}"

# Git safe.directory 등록
sudo -u "${REAL_USER}" git config --global --add safe.directory "${DIST_DIR}" 2>/dev/null || true
git config --global --add safe.directory "${DIST_DIR}" 2>/dev/null || true

# 사이트 활성화 및 아파치 재시작
a2ensite werewolf.conf >/dev/null 2>&1 || true

if apache2ctl configtest >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Apache 설정 문법 검사 통과 (Syntax OK)${NC}"
  systemctl reload apache2 || systemctl restart apache2
  echo -e "${GREEN}✓ Apache2 재로드 완료${NC}"
else
  echo -e "${YELLOW}주의: Apache 설정 검사에 경고가 있습니다. 재시작을 시도합니다...${NC}"
  systemctl restart apache2 || true
fi

# 완료 안내
echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}   🎉 한밤의 늑대인간 설치 및 설정이 성공적으로 완료되었습니다!${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo -e "📍 웹 접속 주소: ${BLUE}http://localhost:${APACHE_PORT}/${NC} (또는 서버의 IP:${APACHE_PORT})"
echo -e "📁 웹 루트: ${DIST_DIR}"
echo -e "📁 WebDAV 경로: ${WEBDAV_DIR} (웹상 /webdav)"
echo -e "⚙️ Apache 설정: ${CONF_FILE}"

if [ -f "${DIST_DIR}/version.json" ]; then
  echo -e "\n📦 현재 설치된 릴리즈 버전:"
  cat "${DIST_DIR}/version.json"
fi

echo -e "\n💡 ${YELLOW}추후 원격 릴리즈 업데이트 방법:${NC}"
echo -e "   cd ${TARGET_DIR} && ./update.sh"
echo -e "   (또는 cd ${DIST_DIR} && ./update.sh)"
echo "=========================================================="
