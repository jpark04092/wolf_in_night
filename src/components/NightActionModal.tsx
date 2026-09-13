import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Moon,
  Eye,
  Sparkles,
  Shuffle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { PlayerInfo, RoleType, NightStep, CenterCardsFile, UserCardFile } from '../types';
import { ROLES } from '../lib/roles';
import { webdav } from '../lib/webdav';

interface NightActionModalProps {
  roomId: string;
  myId: string;
  currentStep: NightStep;
  initialRole: RoleType;
  players: PlayerInfo[];
  centerCards: RoleType[];
  onCompleteAction: () => void;
}

export const NightActionModal: React.FC<NightActionModalProps> = ({
  roomId,
  myId,
  currentStep,
  initialRole,
  players,
  centerCards,
  onCompleteAction,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [troubleTargets, setTroubleTargets] = useState<string[]>([]);
  const [selectedCenterIndices, setSelectedCenterIndices] = useState<number[]>([]);
  const [seerMode, setSeerMode] = useState<'player' | 'center'>('player');

  // Revealed info state
  const [revealedPlayerCard, setRevealedPlayerCard] = useState<{ id: string; role: RoleType } | null>(null);
  const [revealedCenterCards, setRevealedCenterCards] = useState<Record<number, RoleType>>({});
  const [werewolfTeammates, setWerewolfTeammates] = useState<PlayerInfo[]>([]);
  const [isLoneWolf, setIsLoneWolf] = useState(false);
  const [stolenRole, setStolenRole] = useState<RoleType | null>(null);
  const [insomniacRole, setInsomniacRole] = useState<RoleType | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const otherPlayers = players.filter((p) => p.id !== myId);

  // Load initial contextual role information when modal opens
  useEffect(() => {
    let isMounted = true;

    async function loadRoleContext() {
      if (currentStep === 'WEREWOLF' && initialRole === 'WEREWOLF') {
        // Optimistic pre-population from current players prop for instant rendering
        const initialTeammates = otherPlayers.filter(
          (p) => p.initialRole === 'WEREWOLF' || p.role === 'WEREWOLF'
        );
        setWerewolfTeammates(initialTeammates);
        setIsLoneWolf(initialTeammates.length === 0);

        // Verify with WebDAV in parallel to guarantee freshness
        const wolfTeammates: PlayerInfo[] = [];
        await Promise.all(
          otherPlayers.map(async (p) => {
            try {
              const userFile = await webdav.get<UserCardFile>(`/rooms/${roomId}/${p.id}.json`);
              if (userFile && (userFile.initialRole === 'WEREWOLF' || userFile.role === 'WEREWOLF')) {
                wolfTeammates.push(p);
              }
            } catch (e) {
              console.warn(e);
              if (p.initialRole === 'WEREWOLF' || p.role === 'WEREWOLF') {
                wolfTeammates.push(p);
              }
            }
          })
        );

        if (isMounted) {
          setWerewolfTeammates(wolfTeammates);
          setIsLoneWolf(wolfTeammates.length === 0);
          setIsLoading(false);
        }
      }

      if (currentStep === 'INSOMNIAC' && initialRole === 'INSOMNIAC') {
        setIsLoading(true);
        try {
          // Insomniac re-fetches own user_{myId}.json
          const myFile = await webdav.get<UserCardFile>(`/rooms/${roomId}/${myId}.json`);
          if (myFile && isMounted) {
            setInsomniacRole(myFile.role);
            setActionDone(true);
          }
        } catch (e) {
          console.warn(e);
        } finally {
          if (isMounted) setIsLoading(false);
        }
      }
    }

    loadRoleContext();
    return () => {
      isMounted = false;
    };
  }, [currentStep, initialRole, roomId, myId]);

  // Seer Action
  const handleSeerPlayerLook = async (targetId: string) => {
    setIsLoading(true);
    try {
      const userFile = await webdav.get<UserCardFile>(`/rooms/${roomId}/${targetId}.json`);
      if (userFile) {
        setRevealedPlayerCard({ id: targetId, role: userFile.role });
        setActionDone(true);
        setStatusMessage('플레이어의 현재 카드를 확인했습니다.');
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeerCenterLook = async (centerIndex: number) => {
    if (selectedCenterIndices.includes(centerIndex)) return;
    if (selectedCenterIndices.length >= 2) return;

    const nextIndices = [...selectedCenterIndices, centerIndex];
    setSelectedCenterIndices(nextIndices);

    // Fetch center.json
    try {
      const centerData = await webdav.get<CenterCardsFile>(`/rooms/${roomId}/center.json`);
      const cards = centerData ? centerData.cards : centerCards;
      setRevealedCenterCards((prev) => ({
        ...prev,
        [centerIndex]: cards[centerIndex],
      }));

      if (nextIndices.length === 2) {
        setActionDone(true);
        setStatusMessage('중앙 카드 2장을 모두 확인했습니다.');
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // Werewolf Lone Wolf center look
  const handleWerewolfCenterLook = async (centerIndex: number) => {
    setSelectedCenterIndices([centerIndex]);
    try {
      const centerData = await webdav.get<CenterCardsFile>(`/rooms/${roomId}/center.json`);
      const cards = centerData ? centerData.cards : centerCards;
      setRevealedCenterCards({ [centerIndex]: cards[centerIndex] });
      setActionDone(true);
      setStatusMessage('외로운 늑대로서 중앙 카드 1장을 확인했습니다.');
    } catch (e) {
      console.warn(e);
    }
  };

  // Robber Action: Safe role property swap (preserves user identity & initialRole)
  const handleRobberSwap = async () => {
    if (!selectedTarget) return;
    setIsLoading(true);
    try {
      const roomPrefix = `/rooms/${roomId}`;
      const myFile = `${roomPrefix}/${myId}.json`;
      const targetFile = `${roomPrefix}/${selectedTarget}.json`;

      const myUserData = await webdav.get<UserCardFile>(myFile);
      const targetUserData = await webdav.get<UserCardFile>(targetFile);

      if (myUserData && targetUserData) {
        const myOriginalRole = myUserData.role;
        const targetOriginalRole = targetUserData.role;

        // Swap ONLY the role property. Preserve initialRole, displayName, avatarId, lastSeen!
        await webdav.put(myFile, {
          ...myUserData,
          role: targetOriginalRole,
        });

        await webdav.put(targetFile, {
          ...targetUserData,
          role: myOriginalRole,
        });

        setStolenRole(targetOriginalRole);
        setActionDone(true);
        setStatusMessage('카드를 맞바꿨습니다! 새로운 직업을 확인하세요.');
      }
    } catch (e) {
      console.warn('[Robber Swap Error]', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Troublemaker Action: Safe role property swap between target A & target B
  const handleTroublemakerSwap = async () => {
    if (troubleTargets.length !== 2) return;
    setIsLoading(true);
    try {
      const [targetA, targetB] = troubleTargets;
      const roomPrefix = `/rooms/${roomId}`;
      const fileA = `${roomPrefix}/${targetA}.json`;
      const fileB = `${roomPrefix}/${targetB}.json`;

      const userAData = await webdav.get<UserCardFile>(fileA);
      const userBData = await webdav.get<UserCardFile>(fileB);

      if (userAData && userBData) {
        const roleA = userAData.role;
        const roleB = userBData.role;

        // Swap ONLY the role property between A and B
        await webdav.put(fileA, {
          ...userAData,
          role: roleB,
        });

        await webdav.put(fileB, {
          ...userBData,
          role: roleA,
        });

        setActionDone(true);
        setStatusMessage('두 플레이어의 카드를 몰래 맞바꿨습니다! (내용은 알 수 없음)');
      }
    } catch (e) {
      console.warn('[Troublemaker Swap Error]', e);
    } finally {
      setIsLoading(false);
    }
  };

  const currentRoleDef = ROLES[currentStep];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-md bg-slate-900 border-2 border-indigo-500/80 rounded-3xl p-5 shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                {currentStep === 'WEREWOLF' && <Moon className="w-5 h-5 text-rose-400" />}
                {currentStep === 'SEER' && <Eye className="w-5 h-5 text-blue-400" />}
                {currentStep === 'ROBBER' && <Sparkles className="w-5 h-5 text-amber-400" />}
                {currentStep === 'TROUBLEMAKER' && <Shuffle className="w-5 h-5 text-purple-400" />}
                {currentStep === 'INSOMNIAC' && <Clock className="w-5 h-5 text-teal-400" />}
              </span>
              <div>
                <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">
                  당신의 차례입니다
                </span>
                <h2 className="text-lg font-bold text-white">{currentRoleDef.name} 액션</h2>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-800 text-indigo-300 font-semibold border border-slate-700">
                {currentRoleDef.team === 'WEREWOLF' ? '늑대인간 팀' : currentRoleDef.team === 'TANNER' ? '무두장이' : '시민 팀'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300 mt-3 mb-4 leading-relaxed bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            {currentRoleDef.nightInstruction}
          </p>

          {/* 1. WEREWOLF ACTION */}
          {currentStep === 'WEREWOLF' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-rose-400" />
                  동료 늑대인간 확인
                </h3>
                {werewolfTeammates.length > 0 ? (
                  <div className="space-y-1.5">
                    {werewolfTeammates.map((mate) => (
                      <div
                        key={mate.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-rose-950/40 border border-rose-800/50"
                      >
                        <span className="font-semibold text-rose-200">{mate.displayName}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 font-bold">
                          동료 늑대인간
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-amber-300 bg-amber-950/40 border border-amber-800/40 p-3 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                    <span>당신은 유일한 늑대인간(외로운 늑대)입니다! 중앙 카드 1장을 볼 수 있습니다.</span>
                  </div>
                )}
              </div>

              {isLoneWolf && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    중앙 카드 3장 중 1장을 터치하세요:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((idx) => {
                      const isRevealed = revealedCenterCards[idx] !== undefined;
                      const role = revealedCenterCards[idx];
                      return (
                        <button
                          key={idx}
                          disabled={actionDone && !isRevealed}
                          onClick={() => handleWerewolfCenterLook(idx)}
                          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                            isRevealed
                              ? 'bg-amber-950/60 border-amber-500 text-amber-200 shadow-lg'
                              : 'bg-slate-800/80 border-slate-700 hover:border-amber-500/50'
                          }`}
                        >
                          <span className="text-xs text-slate-400 mb-1 font-mono">#{idx + 1}</span>
                          {isRevealed && role ? (
                            <span className="font-bold text-xs text-amber-300">{ROLES[role]?.name}</span>
                          ) : (
                            <span className="text-xs text-slate-300 font-medium">카드 확인</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. SEER ACTION */}
          {currentStep === 'SEER' && (
            <div className="space-y-4">
              {/* Tab Selector: Look at Player or Look at 2 Center Cards */}
              {!actionDone && (
                <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
                  <button
                    onClick={() => setSeerMode('player')}
                    className={`py-2 text-xs font-semibold rounded-xl transition ${
                      seerMode === 'player'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    다른 플레이어 1명 보기
                  </button>
                  <button
                    onClick={() => setSeerMode('center')}
                    className={`py-2 text-xs font-semibold rounded-xl transition ${
                      seerMode === 'center'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    중앙 카드 2장 보기
                  </button>
                </div>
              )}

              {seerMode === 'player' && (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">
                    카드를 확인할 플레이어를 선택하세요:
                  </span>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {otherPlayers.map((p) => {
                      const isTarget = selectedTarget === p.id;
                      const isRevealed = revealedPlayerCard?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          disabled={actionDone}
                          onClick={() => {
                            setSelectedTarget(p.id);
                            handleSeerPlayerLook(p.id);
                          }}
                          className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                            isRevealed
                              ? 'bg-blue-950/70 border-blue-500 shadow-md'
                              : isTarget
                              ? 'bg-slate-800 border-blue-400'
                              : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                          }`}
                        >
                          <span className="text-sm font-semibold truncate">{p.displayName}</span>
                          {isRevealed && revealedPlayerCard && (
                            <span className="text-xs font-bold text-blue-300">
                              {ROLES[revealedPlayerCard.role]?.name}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {seerMode === 'center' && (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">
                    중앙 카드 3장 중 2장을 선택하여 확인하세요 ({selectedCenterIndices.length}/2):
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((idx) => {
                      const isRevealed = revealedCenterCards[idx] !== undefined;
                      const role = revealedCenterCards[idx];
                      return (
                        <button
                          key={idx}
                          disabled={actionDone && !isRevealed}
                          onClick={() => handleSeerCenterLook(idx)}
                          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                            isRevealed
                              ? 'bg-blue-950/70 border-blue-500 text-blue-200 shadow-lg'
                              : 'bg-slate-800/80 border-slate-700 hover:border-blue-500/50'
                          }`}
                        >
                          <span className="text-xs text-slate-400 mb-1 font-mono">#{idx + 1}</span>
                          {isRevealed && role ? (
                            <span className="font-bold text-xs text-blue-300">{ROLES[role]?.name}</span>
                          ) : (
                            <span className="text-xs text-slate-300 font-medium">확인</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. ROBBER ACTION */}
          {currentStep === 'ROBBER' && (
            <div className="space-y-4">
              {!actionDone ? (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">
                    카드를 빼앗아 바꿀 대상을 선택하세요:
                  </span>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {otherPlayers.map((p) => {
                      const isSelected = selectedTarget === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedTarget(p.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                              : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                          }`}
                        >
                          <div className="font-semibold text-sm">{p.displayName}</div>
                          <div className="text-[11px] text-slate-400">터치하여 선택</div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    disabled={!selectedTarget || isLoading}
                    onClick={handleRobberSwap}
                    className="w-full mt-3 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 font-bold text-sm text-white shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>선택한 플레이어의 카드 훔치기</span>
                  </button>
                </div>
              ) : (
                <div className="bg-amber-950/50 border border-amber-500/60 p-4 rounded-2xl text-center space-y-2">
                  <span className="text-xs text-amber-300 font-medium">훔쳐온 새 직업 확인:</span>
                  <div className="text-2xl font-black text-amber-400">
                    {stolenRole ? ROLES[stolenRole]?.name : '확인 완료'}
                  </div>
                  <p className="text-xs text-slate-300">
                    이제 당신은 이 새로운 직업의 팀 승리 조건을 따릅니다!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 4. TROUBLEMAKER ACTION */}
          {currentStep === 'TROUBLEMAKER' && (
            <div className="space-y-4">
              {!actionDone ? (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">
                    서로 카드를 바꿀 다른 플레이어 2명을 선택하세요 ({troubleTargets.length}/2):
                  </span>
                  <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                    {otherPlayers.map((p) => {
                      const isSelected = troubleTargets.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (isSelected) {
                              setTroubleTargets((prev) => prev.filter((id) => id !== p.id));
                            } else if (troubleTargets.length < 2) {
                              setTroubleTargets((prev) => [...prev, p.id]);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-md'
                              : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                          }`}
                        >
                          <div className="font-semibold text-sm truncate">{p.displayName}</div>
                          <div className="text-[11px] text-slate-400">
                            {isSelected ? '✓ 선택됨' : '선택'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    disabled={troubleTargets.length !== 2 || isLoading}
                    onClick={handleTroublemakerSwap}
                    className="w-full mt-3 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 font-bold text-sm text-white shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>선택한 두 유저의 카드 맞바꾸기</span>
                  </button>
                </div>
              ) : (
                <div className="bg-purple-950/50 border border-purple-500/60 p-4 rounded-2xl text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-purple-400 mx-auto" />
                  <div className="text-base font-bold text-purple-200">
                    두 플레이어의 카드가 교환되었습니다!
                  </div>
                  <p className="text-xs text-slate-300">
                    말썽쟁이는 카드의 내용을 알지 못한 채 두 플레이어의 카드를 바꿉니다.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 5. INSOMNIAC ACTION */}
          {currentStep === 'INSOMNIAC' && (
            <div className="space-y-3">
              <div className="bg-teal-950/50 border border-teal-500/60 p-5 rounded-2xl text-center space-y-2">
                <Clock className="w-8 h-8 text-teal-400 mx-auto animate-pulse" />
                <span className="text-xs text-teal-300 font-medium">당신의 최종 직업:</span>
                <div className="text-3xl font-black text-teal-400">
                  {insomniacRole ? ROLES[insomniacRole]?.name : '확인 중...'}
                </div>
                <p className="text-xs text-slate-300">
                  {insomniacRole === 'INSOMNIAC'
                    ? '아무도 당신의 카드를 건드리지 않았습니다.'
                    : '강도나 말썽쟁이에 의해 당신의 카드가 바뀌었습니다!'}
                </p>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="mt-3 text-xs text-center font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-2 rounded-xl">
              ✓ {statusMessage}
            </div>
          )}

          {/* Finish Action Button */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <button
              onClick={() => {
                onCompleteAction();
              }}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 font-bold text-sm text-white shadow-xl transition active:scale-98 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{actionDone ? '액션 완료 (미니게임으로 복귀)' : '턴 넘기기 (미니게임 복귀)'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
