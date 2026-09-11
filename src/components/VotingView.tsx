import React, { useState, useEffect } from 'react';
import {
  Vote,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Users,
} from 'lucide-react';
import { PlayerInfo } from '../types';
import { webdav } from '../lib/webdav';

interface VotingViewProps {
  roomId: string;
  myId: string;
  isHost: boolean;
  players: PlayerInfo[];
  votedTarget: string | null;
  onVote: (targetId: string) => void;
  onTallyResult: () => void;
}

export const VotingView: React.FC<VotingViewProps> = ({
  roomId,
  myId,
  isHost,
  players,
  votedTarget,
  onVote,
  onTallyResult,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(votedTarget);
  const [votedUserIds, setVotedUserIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync votedTarget from props if restored asynchronously
  useEffect(() => {
    if (votedTarget) {
      setSelectedTarget(votedTarget);
    }
  }, [votedTarget]);

  // Poll votes folder to see who has already voted
  useEffect(() => {
    let isMounted = true;

    async function checkVotedList() {
      try {
        const resources = await webdav.propfind(`/rooms/${roomId}/votes`, '1');
        if (isMounted) {
          const userIds = resources
            .filter((r) => !r.isDir && r.name.endsWith('.txt'))
            .map((r) => r.name.replace(/\.txt$/, ''));
          setVotedUserIds(userIds);
        }
      } catch (err) {
        console.warn('Error fetching votes status:', err);
      }
    }

    checkVotedList();
    const interval = setInterval(checkVotedList, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roomId]);

  const hasVoted = Boolean(votedTarget || votedUserIds.includes(myId));
  const currentTarget = selectedTarget || votedTarget;
  const totalVotesCount = votedUserIds.length;
  const allVoted = totalVotesCount >= players.length;

  const handleSelectCandidate = (candidateId: string) => {
    if (hasVoted) return; // already submitted vote
    setSelectedTarget(candidateId);
  };

  const handleSubmitVote = async () => {
    if (!currentTarget || isSubmitting || hasVoted) return;
    setIsSubmitting(true);
    try {
      // PUT /webdav/rooms/room_101/votes/user_{myId}.txt with target ID content
      await webdav.put(`/rooms/${roomId}/votes/${myId}.txt`, currentTarget);
      onVote(currentTarget);
    } catch (e) {
      console.warn('Failed to submit vote:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center space-y-4">
      {/* Header Banner */}
      <div className="w-full p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-rose-400">
            FINAL JUDGMENT
          </span>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Vote className="w-5 h-5 text-rose-500" />
            늑대인간 의심자 투표
          </h2>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono">
          <span className="text-slate-400">투표율:</span>
          <span className="font-bold text-amber-400">
            {totalVotesCount}/{players.length}
          </span>
        </div>
      </div>

      {/* Voting Instruction / Status */}
      <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 text-xs text-slate-300 flex items-center justify-between">
        {hasVoted ? (
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>투표가 정상 등록되었습니다. 집계를 기다려주세요.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>가장 늑대인간으로 의심되는 플레이어 1명을 터치하세요.</span>
          </div>
        )}
      </div>

      {/* Players Cards for Voting */}
      <div className="w-full grid grid-cols-2 gap-2.5">
        {players.map((p) => {
          const isSelected = currentTarget === p.id;
          const isMe = p.id === myId;
          const isUserVoted = votedUserIds.includes(p.id);

          return (
            <button
              key={p.id}
              disabled={hasVoted || isSubmitting}
              onClick={() => handleSelectCandidate(p.id)}
              className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 min-h-[95px] relative overflow-hidden ${
                isSelected
                  ? 'bg-rose-950/70 border-rose-500 text-rose-100 shadow-lg shadow-rose-950/50 scale-[1.02]'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 active:scale-98'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-sm text-slate-100 truncate">
                  {p.displayName}
                </span>
                {isMe && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    나
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                <span className="text-[11px] text-slate-400">
                  {isSelected ? '✓ 지목 대상' : hasVoted ? '선택 완료' : '터치하여 지목'}
                </span>
                {isUserVoted ? (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    투표함
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">투표 대기</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Submit Button (if not yet submitted) */}
      {!hasVoted && (
        <button
          disabled={!currentTarget || isSubmitting}
          onClick={handleSubmitVote}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-40 text-white font-black text-base shadow-xl shadow-rose-950/60 transition active:scale-98 flex items-center justify-center gap-2"
        >
          <Vote className="w-5 h-5" />
          <span>{isSubmitting ? '투표 제출 중...' : '투표 제출하기'}</span>
        </button>
      )}

      {/* Host Tally Button */}
      {isHost && (
        <div className="w-full pt-2 border-t border-slate-800">
          <button
            id="tally-result-btn"
            onClick={() => {
              onTallyResult();
            }}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-xl shadow-indigo-950/60 transition active:scale-98 flex items-center justify-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            <span>
              {allVoted ? '전원 투표 완료! [결과 발표]' : `투표 마감 및 [결과 발표] (${totalVotesCount}/${players.length})`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
