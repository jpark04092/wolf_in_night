import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Skull,
  RotateCcw,
  Sparkles,
  Layers,
  CheckCircle2,
  Users,
  Crown,
  Gift,
  Gamepad2,
} from 'lucide-react';
import { PlayerInfo, RoleType } from '../types';
import { ROLES } from '../lib/roles';

interface ResultViewProps {
  isHost: boolean;
  myId: string;
  players: PlayerInfo[];
  centerCards: RoleType[];
  killedUserIds: string[];
  voteCounts: Record<string, number>;
  onRestartGame: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  isHost,
  myId,
  players,
  centerCards,
  killedUserIds,
  voteCounts,
  onRestartGame,
}) => {
  const [isRestarting, setIsRestarting] = useState(false);

  // Minigame MVP & Reward Target Calculation
  // Prioritize human players for rewards; fallback to all players if only bots
  const humanPlayers = players.filter((p) => !p.isBot);
  const rewardEligiblePlayers = humanPlayers.length > 0 ? humanPlayers : players;
  const maxMinigameScore = Math.max(0, ...rewardEligiblePlayers.map((p) => p.minigameScore || 0));
  const topMinigameScorers = rewardEligiblePlayers.filter(
    (p) => (p.minigameScore || 0) === maxMinigameScore && maxMinigameScore > 0
  );
  const isMeTopScorer = topMinigameScorers.some((p) => p.id === myId);

  // Determine who won:
  // Werewolves in the game (final roles of players):
  const werewolfPlayers = players.filter((p) => p.role === 'WEREWOLF');
  const hasWerewolvesInPlay = werewolfPlayers.length > 0;

  // Check if at least one werewolf was killed
  const killedWerewolf = players.some(
    (p) => killedUserIds.includes(p.id) && p.role === 'WEREWOLF'
  );

  // Check if Tanner was killed
  const killedTanner = players.some(
    (p) => killedUserIds.includes(p.id) && p.role === 'TANNER'
  );

  let winnerTeam: 'VILLAGER' | 'WEREWOLF' | 'TANNER' = 'VILLAGER';
  let winnerTitle = '';
  let winnerDesc = '';

  if (killedTanner) {
    winnerTeam = 'TANNER';
    winnerTitle = '무두장이(Tanner) 단독 승리!';
    winnerDesc = '무두장이가 마을 사람들의 손에 처형당하여 소원을 이뤘습니다.';
  } else if (hasWerewolvesInPlay) {
    if (killedWerewolf) {
      winnerTeam = 'VILLAGER';
      winnerTitle = '마을 사람 팀 대승리! 🎉';
      winnerDesc = '숨어있던 늑대인간을 정확히 찾아내어 처형했습니다.';
    } else {
      winnerTeam = 'WEREWOLF';
      winnerTitle = '늑대인간 팀 승리! 🐺';
      winnerDesc = '늑대인간이 처형을 피하고 마을 사람을 처형시켰습니다.';
    }
  } else {
    // No werewolves in play: peace town!
    if (killedUserIds.length === 0) {
      winnerTeam = 'VILLAGER';
      winnerTitle = '평화의 마을! 마을 사람 팀 승리! 🎉';
      winnerDesc = '늑대인간이 없었으며, 아무도 처형되지 않았습니다.';
    } else {
      winnerTeam = 'WEREWOLF';
      winnerTitle = '늑대인간 팀 승리!';
      winnerDesc = '늑대인간이 없는 평화로운 마을이었으나 무고한 시민이 처형되었습니다.';
    }
  }

  useEffect(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  }, []);

  const myPlayer = players.find((p) => p.id === myId);
  const myRole = myPlayer?.role;
  const myWon =
    (winnerTeam === 'VILLAGER' && ROLES[myRole || 'VILLAGER']?.team === 'VILLAGER') ||
    (winnerTeam === 'WEREWOLF' && ROLES[myRole || 'WEREWOLF']?.team === 'WEREWOLF') ||
    (winnerTeam === 'TANNER' && myRole === 'TANNER');

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center space-y-4 pb-8">
      {/* Victory / Defeat Main Banner */}
      <div
        className={`w-full p-5 rounded-3xl border shadow-2xl text-center flex flex-col items-center justify-center space-y-2 relative overflow-hidden ${
          winnerTeam === 'VILLAGER'
            ? 'bg-gradient-to-b from-blue-900/60 to-indigo-950/80 border-blue-500/50 text-blue-100'
            : winnerTeam === 'WEREWOLF'
            ? 'bg-gradient-to-b from-rose-950/80 to-slate-950 border-rose-500/50 text-rose-100'
            : 'bg-gradient-to-b from-purple-950/80 to-slate-950 border-purple-500/50 text-purple-100'
        }`}
      >
        <div className="w-14 h-14 rounded-3xl bg-white/10 flex items-center justify-center mb-1 shadow-inner border border-white/20">
          <Trophy className="w-7 h-7 text-amber-300" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-amber-300">
          GAME OVER
        </span>
        <h2 className="text-xl font-black text-white">{winnerTitle}</h2>
        <p className="text-xs text-slate-300 max-w-xs">{winnerDesc}</p>

        <div className="mt-2 pt-2 border-t border-white/10 w-full flex items-center justify-center gap-2 text-xs font-bold">
          <span>나의 최종 결과:</span>
          {myWon ? (
            <span className="text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
              승리! 🎉
            </span>
          ) : (
            <span className="text-rose-300 bg-rose-950/60 border border-rose-500/40 px-2.5 py-0.5 rounded-full">
              패배 😢
            </span>
          )}
        </div>
      </div>

      {/* Killed Player Announcement */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Skull className="w-4 h-4 text-rose-400" />
          투표 결과 및 처형 대상자
        </h3>

        {killedUserIds.length > 0 ? (
          <div className="space-y-2">
            {killedUserIds.map((kId) => {
              const p = players.find((pl) => pl.id === kId);
              const votes = voteCounts[kId] || 0;
              return (
                <div
                  key={kId}
                  className="p-3 rounded-2xl bg-rose-950/40 border border-rose-600/50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-rose-600/20 text-rose-400 flex items-center justify-center font-bold">
                      <Skull className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">
                        {p?.displayName || kId}
                      </div>
                      <div className="text-xs text-rose-300 font-semibold">
                        최종 직업: {ROLES[p?.role || 'VILLAGER']?.name}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-rose-900/60 text-rose-200">
                    {votes}표 득표
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
            동점 또는 표 분산으로 아무도 처형되지 않았습니다.
          </div>
        )}
      </div>

      {/* Minigame MVP & Reward Target Announcement */}
      <div className="w-full bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/50 rounded-3xl p-4 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-400" />
            밤 미니게임 최고 득점자
          </h3>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center gap-1 shadow-sm">
            <Gift className="w-3 h-3 text-amber-400" />
            리워드 지급 대상
          </span>
        </div>

        {maxMinigameScore > 0 && topMinigameScorers.length > 0 ? (
          <div className="space-y-2">
            {topMinigameScorers.map((scorer) => (
              <div
                key={scorer.id}
                className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between shadow-inner"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 flex items-center justify-center font-bold shadow-md">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-white">
                        {scorer.displayName}
                      </span>
                      {scorer.id === myId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 font-bold">
                          나
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        {topMinigameScorers.length > 1 ? '공동 1위' : '단독 1위'}
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-200/80 font-medium mt-0.5">
                      손동작 은폐 최고 기록 달성
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-sm font-black text-amber-300 font-mono px-3 py-1 rounded-xl bg-amber-950/80 border border-amber-500/50 block shadow">
                    {scorer.minigameScore?.toLocaleString()}점
                  </span>
                </div>
              </div>
            ))}

            {isMeTopScorer && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center text-xs text-amber-300 font-bold flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                <span>축하합니다! 이번 게임 미니게임 1등으로 리워드 대상입니다! 🎉</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
            밤 동안 미니게임 득점자가 없습니다 (0점).
          </div>
        )}
      </div>

      {/* All Players Final Cards Reveal */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-400" />
          전체 플레이어 직업 공개 (시작 직업 → 최종 직업)
        </h3>

        <div className="grid grid-cols-1 gap-2">
          {players.map((p) => {
            const isKilled = killedUserIds.includes(p.id);
            const isChanged = p.initialRole && p.role && p.initialRole !== p.role;
            const finalRoleDef = ROLES[p.role || 'VILLAGER'];
            const initialRoleDef = ROLES[p.initialRole || 'VILLAGER'];

            return (
              <div
                key={p.id}
                className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                  isKilled
                    ? 'bg-rose-950/30 border-rose-700/60 shadow-md'
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-white">{p.displayName}</span>
                    {p.id === myId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                        나
                      </span>
                    )}
                    {isKilled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold flex items-center gap-0.5">
                        <Skull className="w-3 h-3" />
                        처형됨
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <span>시작: {initialRoleDef?.name}</span>
                    {isChanged && (
                      <span className="text-amber-400 font-bold">→ 교환됨!</span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black text-amber-300 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 block">
                    {finalRoleDef?.name}
                  </span>
                  <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                      <Gamepad2 className="w-3 h-3" />
                      {(p.minigameScore || 0).toLocaleString()}점
                      {maxMinigameScore > 0 && (p.minigameScore || 0) === maxMinigameScore && (
                        <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-500/30 text-amber-200 font-bold">
                          MVP
                        </span>
                      )}
                    </span>
                    <span>•</span>
                    <span>{voteCounts[p.id] || 0}표</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center 3 Cards Reveal */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Layers className="w-4 h-4" />
          중앙 카드 3장 공개
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {centerCards.map((role, idx) => (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-slate-950 border border-amber-500/30 flex flex-col items-center justify-center text-center shadow-md"
            >
              <span className="text-[10px] text-slate-500 font-mono mb-1">#{idx + 1}</span>
              <span className="text-xs font-black text-amber-300">
                {ROLES[role]?.name || role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rematch Button */}
      <div className="w-full pt-2">
        {isHost ? (
          <button
            id="rematch-btn"
            disabled={isRestarting}
            onClick={async () => {
              setIsRestarting(true);
              try {
                await onRestartGame();
              } finally {
                setIsRestarting(false);
              }
            }}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-base shadow-xl shadow-indigo-950/60 transition active:scale-98 flex items-center justify-center gap-2"
          >
            <RotateCcw className={`w-5 h-5 ${isRestarting ? 'animate-spin' : ''}`} />
            <span>{isRestarting ? '대기실로 복귀 중...' : '새로운 게임 시작 (대기실로 복귀)'}</span>
          </button>
        ) : (
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
            방장이 새로운 게임을 준비하기를 기다리는 중입니다.
          </div>
        )}
      </div>
    </div>
  );
};
