# 코드베이스 파일 맵 및 타입 참조 (Codebase Map & Types)

## 1. 프로젝트 파일 디렉터리 맵

```
/
├── .agent/                             # 에이전트 토큰 절약용 구조화 문서 (본 폴더)
│   ├── README.md                       # 마스터 인덱스
│   ├── ARCHITECTURE.md                 # WebDAV 아키텍처 및 PWA 명세
│   ├── GAME_LOGIC.md                   # 게임 로직 및 승패 판정
│   └── FILE_MAP.md                     # 소스코드 맵 및 핵심 타입 정의
├── .vscode/
│   └── settings.json                   # VS Code 및 패키지 매니저(npm) 설정
├── .github/
│   └── workflows/
│       └── deploy.yml                  # GitHub Push 및 Codespaces 자동 빌드/배포 워크플로우
├── src/
│   ├── main.tsx                        # React DOM 엔트리포인트 (PWA 서비스 워커 등록)
│   ├── App.tsx                         # 최상위 상태 관리자, WebDAV 폴링(800ms) 및 페이즈 라우팅
│   ├── types.ts                        # 공통 타입 및 인터페이스 (RoleType, RoomState 등)
│   ├── version.ts                      # 빌드타임 버전, 빌드일시, Git Commit Hash 정의
│   ├── index.css                       # Tailwind CSS (@import "tailwindcss";)
│   ├── server/
│   │   └── webdavMiddleware.ts         # Vite dev/preview 및 Express 공용 WebDAV & /api/rooms Connect 미들웨어
│   ├── lib/
│   │   ├── webdav.ts                   # WebDAV 클라이언트 (PROPFIND, GET, PUT, MKCOL, MOVE, DELETE)
│   │   ├── roles.ts                    # 9개 직업 정의, 덱 생성 함수, 밤 스텝 순서
│   │   └── audio.ts                    # Web Audio API 기반 효과음 합성기 (외부 에셋 불필요)
│   ├── hooks/
│   │   └── useWakeLock.ts              # Screen Wake Lock API 훅 (모바일 절전 방지)
│   └── components/
│       ├── LobbyView.tsx               # 방 목록(PROPFIND), 방 생성 모달, 닉네임 설정
│       ├── VersionBadge.tsx            # 상단 배포 버전/커밋/빌드시각 뱃지 및 상세 확인 모달
│       ├── WaitingRoomView.tsx         # 참여자 목록, QR 코드 모달, 가상 봇 추가/제거, 게임 시작
│       ├── MemoryMinigame.tsx          # 4x4 메모리 카드 맞추기 (블러핑 은폐)
│       ├── NightActionModal.tsx        # 밤 직업별 오버레이 액션 (3단계 MOVE 스왑 포함)
│       ├── DiscussionView.tsx          # 5분 아침 토론 타이머 및 팁
│       ├── VotingView.tsx              # 의심자 지목 투표 및 실시간 투표자 폴링
│       ├── ResultView.tsx              # 처형자 발표, 시작/최종 직업 공개, 승패 판정, 폭죽 효과
│       ├── AdminModal.tsx              # 관리자 인증(0000), 비밀번호 변경, 방 개별/일괄 삭제 대시보드
│       ├── PWAInstallButton.tsx        # 모바일 PWA 홈 화면 추가 버튼
│       └── OfflineIndicator.tsx        # 오프라인 네트워크 단절 배너
├── public/
│   ├── manifest.webmanifest            # PWA 웹 앱 매니페스트
│   ├── sw.js                           # 오프라인 캐시 서비스 워커
│   └── icon-*.png                      # PWA 및 파비콘 아이콘
├── server.ts                           # Express + WebDAV 미들웨어 + Vite SSR/Dev 서버
├── vite.config.ts                      # Vite 번들러 설정
├── package.json                        # 종속성 및 스크립트 정의
├── install.sh                          # Apache2 가상호스트, WebDAV 및 권한 1-Click 자동 설치 스크립트
├── update.sh                           # 원격 release 브랜치 1-Click 최신 배포 갱신 스크립트
├── metadata.json                       # AI Studio 메타데이터 (이름, 권한, 주요 역량)
├── AGENTS.md                           # AI 에이전트 지침 및 .agent 동기화 규칙 (시스템 자동 주입)
└── AGENT.md                            # 에이전트 규칙 별칭 파일
```

---

## 2. 핵심 타입 인터페이스 (`src/types.ts`)

```typescript
// 지원 직업 목록
export type RoleType =
  | 'WEREWOLF'
  | 'MINION'
  | 'MASON'
  | 'SEER'
  | 'ROBBER'
  | 'TROUBLEMAKER'
  | 'DRUNK'
  | 'INSOMNIAC'
  | 'VILLAGER'
  | 'TANNER';

// 게임 진행 단계
export type GamePhase = 'WAITING' | 'NIGHT' | 'DAY_DISCUSSION' | 'VOTING' | 'RESULT';

// 밤 단계 순서
export type NightStep = 'WEREWOLF' | 'SEER' | 'ROBBER' | 'TROUBLEMAKER' | 'INSOMNIAC';

// 방 상태 파일 (state.json)
export interface RoomState {
  phase: GamePhase;
  currentStep: NightStep | null;
  stepStartedAt: number;
  timerStartedAt?: number;
  hostId: string;
  killed: string[] | string | null;
  fastMode?: boolean;
}

// 유저 카드 파일 ({userId}.json)
export interface UserCardFile {
  role: RoleType;
  initialRole?: RoleType;
  displayName: string;
  isBot?: boolean;
  avatarId?: number;
  lastSeen?: number; // 4초 주기 하트비트 타임스탬프
}

// 참여 플레이어 런타임 정보
export interface PlayerInfo {
  id: string;
  displayName: string;
  isHost: boolean;
  isBot?: boolean;
  role?: RoleType;
  initialRole?: RoleType;
  hasVoted?: boolean;
  votedTarget?: string;
  avatarId?: number;
  lastSeen?: number;
  isOnline?: boolean;
}

// 중앙 카드 파일 (center.json)
export interface CenterCardsFile {
  cards: RoleType[];
}

// 관리자 설정 파일 (admin.json)
export interface AdminConfigFile {
  password: string;
  passwordHash?: string;
  updatedAt: number;
}
```

---

## 3. Web Audio API 효과음 목록 (`src/lib/audio.ts`)

별도의 무거운 MP3 오디오 파일 없이, 브라우저 내장 `AudioContext`의 오실레이터(Oscillator)를 사용하여 100% 무중단 합성 재생합니다:
* `'click'`: 버튼 터치 피드백 틱
* `'flip'`: 메모리 카드 뒤집기
* `'match'`: 메모리 게임 짝 맞춤 성공
* `'howl'`: 늑대 하울링 (밤 시작)
* `'morning'`: 아침 토론 시작 종소리
* `'vote'`: 투표 등록 비프음
* `'victory'`: 승리 팡파르

---

## 4. 빌드 및 검증 명령어

* **린트 검사**: `npm run lint` (`tsc --noEmit`)
* **프로덕션 빌드**: `npm run build` (`vite build && esbuild server.ts ...`)
* **개발 서버**: `npm run dev` (`tsx server.ts`)
