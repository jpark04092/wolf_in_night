#!/usr/bin/env bash
# ==============================================================================
# 한밤의 늑대인간 (One Night Ultimate Werewolf) - release 브랜치 자동 업데이트 스크립트
# 사용법:
#   ./update.sh [배포경로]
# 예시:
#   ./update.sh
#   ./update.sh /var/www/werewolf/dist
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
echo "   🔄 한밤의 늑대인간 - 최신 릴리즈(release) 업데이트"
echo "=========================================================="
echo -e "${NC}"

# 대상 디렉터리 탐색
TARGET_DIST="${1}"

if [ -z "${TARGET_DIST}" ]; then
  # 1) 현재 디렉터리가 Git 저장소이고 dist 경로인지 확인
  if [ -d "./.git" ]; then
    TARGET_DIST="$(pwd)"
  elif [ -d "/var/www/werewolf/dist/.git" ]; then
    TARGET_DIST="/var/www/werewolf/dist"
  elif [ -d "./dist/.git" ]; then
    TARGET_DIST="$(pwd)/dist"
  else
    TARGET_DIST="/var/www/werewolf/dist"
  fi
fi

if [ ! -d "${TARGET_DIST}" ]; then
  echo -e "${RED}[오류] 업데이트할 대상 디렉터리(${TARGET_DIST})를 찾을 수 없습니다.${NC}"
  echo "설치 경로를 인자로 전달해주세요. 예: ./update.sh /var/www/werewolf/dist"
  exit 1
fi

cd "${TARGET_DIST}"

echo -e "${CYAN}📁 업데이트 대상 경로:${NC} ${TARGET_DIST}"

# Git 저장소 여부 확인
if [ ! -d ".git" ]; then
  echo -e "${RED}[오류] ${TARGET_DIST} 경로는 Git 저장소가 아닙니다.${NC}"
  exit 1
fi

# 1. safe.directory 등록 (권한 경고 방지)
git config --global --add safe.directory "${TARGET_DIST}" 2>/dev/null || true

# 2. 최신 release 브랜치 가져오기
echo -e "\n${CYAN}[1/3] 원격 저장소에서 최신 release 브랜치 가져오는 중 (git fetch)...${NC}"
git fetch origin release

# 3. 최신 커밋으로 강제 동기화 (reset & clean)
echo -e "\n${CYAN}[2/3] 로컬 파일을 최신 릴리즈 상태로 동기화 (git reset --hard)...${NC}"
git checkout release 2>/dev/null || git checkout -b release origin/release 2>/dev/null || true
git reset --hard origin/release
git clean -fd

# 4. 웹서버 파일 권한 보장 및 부모 폴더 스크립트 동기화
echo -e "\n${CYAN}[3/3] 파일 권한 재설정 및 관리 스크립트 동기화 중...${NC}"
CURRENT_USER=$(id -un)

# 실행 스크립트 실행 권한 부여
chmod +x install.sh update.sh 2>/dev/null || true

# 부모 디렉터리(/var/www/werewolf 등)에도 스크립트 복사 보장
PARENT_DIR="$(dirname "${TARGET_DIST}")"
if [ -d "${PARENT_DIR}" ] && [ "${PARENT_DIR}" != "/" ] && [ "${PARENT_DIR}" != "/var/www" ]; then
  for s in "install.sh" "update.sh"; do
    if [ -f "${s}" ]; then
      cp -f "${s}" "${PARENT_DIR}/${s}" 2>/dev/null || true
      chmod +x "${PARENT_DIR}/${s}" 2>/dev/null || true
    fi
  done
fi

# 사용자와 www-data 그룹이 안전하게 접근할 수 있도록 775 권한 부여
if [ "$(id -u)" -eq 0 ]; then
  chown -R "${SUDO_USER:-$CURRENT_USER}:www-data" "${TARGET_DIST}" 2>/dev/null || true
fi
chmod -R 775 "${TARGET_DIST}" 2>/dev/null || chmod -R 755 "${TARGET_DIST}" 2>/dev/null || true

# 5. 업데이트 완료 및 버전 확인
echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}   ✅ 최신 릴리즈 업데이트가 성공적으로 완료되었습니다!${NC}"
echo -e "${GREEN}==========================================================${NC}"

if [ -f "version.json" ]; then
  echo -e "📦 ${GREEN}현재 배포된 버전 정보:${NC}"
  cat version.json
  echo ""
else
  COMMIT_INFO=$(git log -1 --pretty=format:"%h - %s (%cr)" 2>/dev/null || echo "Unknown")
  echo -e "📦 최신 커밋: ${COMMIT_INFO}"
fi

echo -e "💡 ${YELLOW}브라우저에서 강력 새로고침(Ctrl + Shift + R 또는 캐시 지우기)을 해주세요.${NC}"
echo "=========================================================="
