import React, { useState, useEffect } from 'react';
import {
  Sun,
  Clock,
  Vote,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { PlayerInfo, RoleType } from '../types';
import { ROLES } from '../lib/roles';
import { playSound } from '../lib/audio';

interface DiscussionViewProps {
  isHost: boolean;
  myInitialRole: RoleType | null;
  players: PlayerInfo[];
  timerStartedAt: number;
  durationSeconds?: number;
  onStartVoting: () => void;
}

export const DiscussionView: React.FC<DiscussionViewProps> = ({
  isHost,
  myInitialRole,
  players,
  timerStartedAt,
  durationSeconds = 300,
  onStartVoting,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);

  useEffect(() => {
    playSound('morning');
  }, []);

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

        {/* 5-minute Countdown Timer */}
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
      </div>

      {/* My Initial Role Reminder */}
      {myInitialRole && (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">당신의 밤 시작 직업:</span>
            <div className="text-base font-black text-indigo-300">
              {ROLES[myInitialRole]?.name}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-400 max-w-[200px] leading-tight">
            ⚠️ 강도나 말썽쟁이에 의해 카드가 바뀌었을 수 있습니다!
          </div>
        </div>
      )}

      {/* Discussion Guide & Tactics */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-amber-400" />
          토론 가이드 및 전략 팁
        </h3>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-200">직업 공개하기:</strong> 자신이 밤에 무엇을 했는지 주장해보세요. 단, 거짓말을 섞는 플레이어가 있을 수 있습니다.
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-rose-200">카드 맞바꿈 추적:</strong> 강도나 말썽쟁이가 누구의 카드를 건드렸는지 증언을 맞춰보세요.
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-200">평화의 마을:</strong> 늑대인간 2장이 모두 중앙에 있을 수도 있습니다. 아무도 죽지 않으면 마을의 승리입니다!
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
              playSound('click');
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
