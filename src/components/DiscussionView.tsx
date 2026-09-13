import React, { useState, useEffect } from 'react';
import {
  Sun,
  Clock,
  Vote,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
  Moon,
  Eye,
  Sparkles,
  Shuffle,
  Wine,
  Flame,
  Skull,
  Users,
  Layers,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Info,
} from 'lucide-react';
import { PlayerInfo, RoleType } from '../types';
import { ROLES, generateDefaultDeck } from '../lib/roles';

interface DiscussionViewProps {
  isHost: boolean;
  myInitialRole: RoleType | null;
  players: PlayerInfo[];
  timerStartedAt: number;
  durationSeconds?: number;
  testMode?: boolean;
  currentDeck?: RoleType[];
  onStartVoting: () => void;
}

export const DiscussionView: React.FC<DiscussionViewProps> = ({
  isHost,
  myInitialRole,
  players,
  timerStartedAt,
  durationSeconds = 300,
  testMode = false,
  currentDeck,
  onStartVoting,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [showTimeline, setShowTimeline] = useState<boolean>(true);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - timerStartedAt) / 1000);
      const remain = Math.max(0, durationSeconds - elapsed);
      setTimeLeft(remain);
    }, 500);

    return () => clearInterval(interval);
  }, [timerStartedAt, durationSeconds]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const isUrgent = timeLeft < 60;

  // Compute deck and participating roles
  const deck =
    currentDeck && currentDeck.length > 0
      ? currentDeck
      : generateDefaultDeck(players.length);

  const roleCounts = deck.reduce((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<RoleType, number>);

  const uniqueRoles = (Object.keys(roleCounts) as RoleType[]);

  // Night active roles sorted by official nightOrder (1: WEREWOLF, 2: MINION, 3: SEER, 4: ROBBER, 5: TROUBLEMAKER, 6: DRUNK, 7: INSOMNIAC)
  const nightActiveRoles = uniqueRoles
    .filter((r) => (ROLES[r]?.nightOrder ?? 0) > 0)
    .sort((a, b) => (ROLES[a]?.nightOrder ?? 0) - (ROLES[b]?.nightOrder ?? 0));

  // Roles without night action (VILLAGER, TANNER)
  const passiveRoles = uniqueRoles.filter((r) => (ROLES[r]?.nightOrder ?? 0) === 0);

  const renderRoleIcon = (role: RoleType, className = 'w-4 h-4') => {
    switch (role) {
      case 'WEREWOLF':
        return <Moon className={`${className} text-rose-400`} />;
      case 'MINION':
        return <Flame className={`${className} text-orange-400`} />;
      case 'SEER':
        return <Eye className={`${className} text-blue-400`} />;
      case 'ROBBER':
        return <Sparkles className={`${className} text-amber-400`} />;
      case 'TROUBLEMAKER':
        return <Shuffle className={`${className} text-purple-400`} />;
      case 'DRUNK':
        return <Wine className={`${className} text-violet-400`} />;
      case 'INSOMNIAC':
        return <Clock className={`${className} text-teal-400`} />;
      case 'TANNER':
        return <Skull className={`${className} text-stone-400`} />;
      case 'VILLAGER':
      default:
        return <Users className={`${className} text-slate-400`} />;
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center space-y-4">
      {/* Morning Announcement Banner */}
      <div className="w-full p-4 rounded-3xl bg-gradient-to-r from-amber-600/30 via-orange-600/20 to-yellow-600/30 border border-amber-500/40 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
            <Sun className="w-7 h-7 animate-spin" style={{ animationDuration: '20s' }} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-black tracking-widest text-amber-300">
              DAY HAS BROKEN
            </span>
            <h2 className="text-lg font-black text-white">아침 토론 시간</h2>
          </div>
        </div>

        {/* 5-minute Countdown Timer or Test Mode Unlimited Badge */}
        {testMode ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-purple-500/50 bg-purple-950/80 text-purple-300 font-bold text-xs shadow-md">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span>무제한 (테스트 모드)</span>
          </div>
        ) : (
          <div
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border font-mono font-black text-base shadow-md ${
              isUrgent
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse'
                : 'bg-slate-900/90 border-slate-700 text-amber-300'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{timeFormatted}</span>
          </div>
        )}
      </div>

      {/* My Initial Role Reminder */}
      {myInitialRole && (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-950/70 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              {renderRoleIcon(myInitialRole, 'w-5 h-5')}
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium">당신의 밤 시작 직업:</span>
              <div className="text-base font-black text-indigo-300">
                {ROLES[myInitialRole]?.name}
              </div>
            </div>
          </div>
          <div className="text-right text-[11px] text-amber-400/90 max-w-[170px] leading-tight font-medium">
            ⚠️ 강도·말썽쟁이 등에 의해 카드가 바뀌었을 수 있습니다!
          </div>
        </div>
      )}

      {/* Participating Roles & Night Action Timeline Section */}
      <div className="w-full bg-slate-900/70 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        {/* Header with Collapsible Toggle */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              참가 직업 & 밤 액션 순서 (추론 타임라인)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowTimeline((prev) => !prev)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-xs flex items-center gap-0.5"
            title={showTimeline ? '접기' : '펼치기'}
          >
            <span className="text-[11px]">{showTimeline ? '접기' : '상세보기'}</span>
            {showTimeline ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Total Deck Summary Badges */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1 font-semibold text-slate-300">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              이번 판 덱 구성 ({deck.length}장):
            </span>
            <span className="text-[10px] text-slate-500">
              플레이어 {players.length}명 + 중앙 3장
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {uniqueRoles.map((role) => {
              const count = roleCounts[role];
              const roleDef = ROLES[role];
              return (
                <span
                  key={role}
                  className="px-2 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 shadow-sm"
                >
                  {renderRoleIcon(role, 'w-3.5 h-3.5')}
                  <span>{roleDef?.name}</span>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-950/50 px-1 rounded-md border border-amber-500/20">
                    x{count}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Detailed Timeline List (Collapsible) */}
        {showTimeline && (
          <div className="pt-2 space-y-2">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>밤에 진행된 공식 순서입니다. 증언의 모순을 밝힐 때 활용하세요:</span>
            </div>

            {/* Night Active Roles Flow */}
            <div className="space-y-2">
              {nightActiveRoles.map((role, idx) => {
                const roleDef = ROLES[role];
                const count = roleCounts[role];
                const stepNum = idx + 1;

                return (
                  <div key={role} className="space-y-1">
                    <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition space-y-1.5">
                      {/* Step Title Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black flex items-center justify-center">
                            {stepNum}
                          </span>
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-100">
                            {renderRoleIcon(role, 'w-4 h-4')}
                            <span>{roleDef?.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({count}장 포함)
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 font-semibold">
                          순서 {roleDef?.nightOrder}번
                        </span>
                      </div>

                      {/* Action & Deduction Tip */}
                      <div className="pl-7 text-[11px] space-y-1">
                        <p className="text-slate-300 leading-snug">
                          {roleDef?.nightInstruction}
                        </p>
                        {roleDef?.deductionTip && (
                          <div className="p-1.5 rounded-xl bg-amber-950/30 border border-amber-800/30 text-amber-200/90 text-[10.5px] leading-tight flex items-start gap-1">
                            <span className="font-bold text-amber-400 flex-shrink-0">🔍 추론:</span>
                            <span>{roleDef.deductionTip}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step Connector Arrow */}
                    {idx < nightActiveRoles.length - 1 && (
                      <div className="flex items-center justify-center py-0.5">
                        <ArrowDown className="w-3.5 h-3.5 text-slate-600 animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Passive Roles (No Night Action) */}
            {passiveRoles.length > 0 && (
              <div className="mt-3 p-2.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-slate-500" />
                  <span>밤 행동 없음 (조용히 잠을 잠):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {passiveRoles.map((role) => (
                    <span
                      key={role}
                      className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1"
                    >
                      {renderRoleIcon(role, 'w-3 h-3')}
                      <span>{ROLES[role]?.name}</span>
                      <span className="text-[10px] text-slate-500">x{roleCounts[role]}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  ※ 이 직업들은 밤 동안 눈을 뜨지 않으며, 강도나 말썽쟁이에 의해 카드가 바뀌었을 수 있습니다.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Discussion Guide & Tactics */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-amber-400" />
          핵심 토론 추론 포인트
        </h3>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-200">교환의 타임라인:</strong> 강도(훔치기) → 말썽쟁이(둘 교환) → 주정뱅이(중앙 교환) 순서로 카드가 바뀌었습니다.
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-rose-200">예언자 vs 불면증환자:</strong> 예언자는 교환 전 <strong>최초 카드</strong>를 보았고, 불면증환자는 모든 교환이 완료된 <strong>최종 카드</strong>를 보았습니다.
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-200">평화의 마을 & 중앙 카드:</strong> 늑대인간이 모두 중앙에 있거나, 참가 덱 중 3장은 중앙에 묻혀 있습니다.
            </div>
          </div>
        </div>
      </div>

      {/* Players in Discussion */}
      <div className="w-full bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-300 mb-1.5 block">참여 중인 마을 사람들:</span>
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => (
            <span
              key={p.id}
              className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-medium"
            >
              {p.displayName}
            </span>
          ))}
        </div>
      </div>

      {/* Host Control to Start Voting */}
      <div className="w-full pt-2">
        {isHost ? (
          <button
            id="start-voting-btn"
            onClick={() => {
              onStartVoting();
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-base shadow-xl shadow-rose-950/60 transition active:scale-98 flex items-center justify-center gap-2"
          >
            <Vote className="w-5 h-5" />
            <span>토론 종료 후 [투표 시작]</span>
          </button>
        ) : (
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-center text-xs text-slate-400">
            방장이 토론 상황을 보고 <strong>[투표 시작]</strong>을 진행합니다.
          </div>
        )}
      </div>
    </div>
  );
};
