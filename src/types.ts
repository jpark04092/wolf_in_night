export type GamePhase = 'WAITING' | 'NIGHT' | 'DAY_DISCUSSION' | 'VOTING' | 'RESULT';

export type RoleType =
  | 'WEREWOLF'
  | 'SEER'
  | 'ROBBER'
  | 'TROUBLEMAKER'
  | 'INSOMNIAC'
  | 'VILLAGER'
  | 'MINION'
  | 'TANNER'
  | 'DRUNK';

export type NightStep = 'WEREWOLF' | 'SEER' | 'ROBBER' | 'TROUBLEMAKER' | 'INSOMNIAC';

export interface RoomState {
  phase: GamePhase;
  currentStep: NightStep | null;
  stepStartedAt: number;
  hostId: string;
  killed: string | string[] | null;
  round?: number;
  timerStartedAt?: number;
  discussionDuration?: number; // seconds, default 300
}

export interface UserCardFile {
  role: RoleType;
  initialRole?: RoleType;
  displayName: string;
  isBot?: boolean;
  avatarId?: number;
}

export interface CenterCardsFile {
  cards: RoleType[];
}

export interface PlayerInfo {
  id: string; // e.g. "user_A"
  displayName: string;
  isHost: boolean;
  isBot?: boolean;
  role?: RoleType;
  initialRole?: RoleType;
  hasVoted?: boolean;
  votedTarget?: string;
  avatarId?: number;
}

export interface RoomInfo {
  id: string; // e.g. "room_101"
  name: string;
  playerCount: number;
  phase: GamePhase;
  hostId: string;
  createdAt?: number;
}

export interface RoleDef {
  id: RoleType;
  name: string;
  team: 'VILLAGER' | 'WEREWOLF' | 'TANNER';
  description: string;
  nightInstruction: string;
  nightOrder: number; // 0 means no night action
  color: string;
  iconName: string;
}

export interface MemoryCard {
  id: number;
  pairId: number;
  icon: string;
  label: string;
  isFlipped: boolean;
  isMatched: boolean;
}
