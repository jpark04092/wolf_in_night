import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Moon,
  Sun,
  Shield,
  LogOut,
  Vote,
  Trophy,
  Users,
  Eye,
  Sparkles,
} from 'lucide-react';
import {
  GamePhase,
  NightStep,
  PlayerInfo,
  RoleType,
  RoomState,
  UserCardFile,
  CenterCardsFile,
} from './types';
import { ROLES, NIGHT_STEPS, getNextNightStep } from './lib/roles';
import { webdav, WebDAVResource } from './lib/webdav';
import { playSound } from './lib/audio';
import { useWakeLock } from './hooks/useWakeLock';
import { LobbyView } from './components/LobbyView';
import { WaitingRoomView } from './components/WaitingRoomView';
import { MemoryMinigame } from './components/MemoryMinigame';
import { NightActionModal } from './components/NightActionModal';
import { DiscussionView } from './components/DiscussionView';
import { VotingView } from './components/VotingView';
import { ResultView } from './components/ResultView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { VersionBadge } from './components/VersionBadge';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string>(() => {
    let saved = localStorage.getItem('onw_my_id');
    if (!saved) {
      saved = `user_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem('onw_my_id', saved);
    }
    return saved;
  });
  const [displayName, setDisplayName] = useState<string>(() => {
    return localStorage.getItem('onw_nickname') || '모험가';
  });
  const [isHost, setIsHost] = useState(false);

  // In-Game state synchronized via WebDAV state.json
  const [roomState, setRoomState] = useState<RoomState>({
    phase: 'WAITING',
    currentStep: null,
    stepStartedAt: 0,
    hostId: '',
    killed: null,
  });

  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [centerCards, setCenterCards] = useState<RoleType[]>([]);
  const [myRole, setMyRole] = useState<RoleType | null>(null);
  const [myInitialRole, setMyInitialRole] = useState<RoleType | null>(null);
  const [votedTarget, setVotedTarget] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [initialRoomFromUrl, setInitialRoomFromUrl] = useState<string>('');

  const { isLocked, isSupported: wakeLockSupported, requestLock } = useWakeLock();
  const safeguardTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Parse room query parameter on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        setInitialRoomFromUrl(roomParam);
      }
    }
  }, []);

  // Request WakeLock when in-game
  useEffect(() => {
    if (roomId && roomState.phase !== 'WAITING') {
      requestLock();
    }
  }, [roomId, roomState.phase, requestLock]);

  // Join or Create Room Handler
  const handleJoinRoom = async (targetRoomId: string, userDisplayName: string, hostFlag: boolean) => {
    setRoomId(targetRoomId);
    setDisplayName(userDisplayName);
    setIsHost(hostFlag);

    // Save to localStorage
    localStorage.setItem('onw_nickname', userDisplayName);

    try {
      // 1. Ensure directory /rooms/{roomId} and /rooms/{roomId}/votes
      await webdav.mkcol(`/rooms/${targetRoomId}`);
      await webdav.mkcol(`/rooms/${targetRoomId}/votes`);

      // 2. Register user file: PUT /rooms/{roomId}/{myId}.json
      const userFile: UserCardFile = {
        role: 'VILLAGER',
        displayName: userDisplayName,
        isBot: false,
      };
      await webdav.put(`/rooms/${targetRoomId}/${myId}.json`, userFile);

      // 3. If host, ensure state.json exists
      const existingState = await webdav.get<RoomState>(`/rooms/${targetRoomId}/state.json`);
      if (!existingState) {
        const initialState: RoomState = {
          phase: 'WAITING',
          currentStep: null,
          stepStartedAt: Date.now(),
          hostId: myId,
          killed: null,
        };
        await webdav.put(`/rooms/${targetRoomId}/state.json`, initialState);
        setRoomState(initialState);
      } else {
        setRoomState(existingState);
        if (existingState.hostId === myId) {
          setIsHost(true);
        }
      }
    } catch (err) {
      console.warn('Error joining room:', err);
    }
  };

  // Leave room
  const handleLeaveRoom = async () => {
    if (roomId) {
      try {
        await webdav.delete(`/rooms/${roomId}/${myId}.json`);
      } catch (e) {
        // ignore
      }
    }
    setRoomId(null);
    setRoomState({
      phase: 'WAITING',
      currentStep: null,
      stepStartedAt: 0,
      hostId: '',
      killed: null,
    });
    setMyRole(null);
    setMyInitialRole(null);
    setVotedTarget(null);
  };

  // Synchronize Room State & Players via WebDAV polling (0.8s interval)
  useEffect(() => {
    if (!roomId) return;
    let isMounted = true;

    async function syncState() {
      try {
        // 1. Fetch state.json
        const state = await webdav.get<RoomState>(`/rooms/${roomId}/state.json`);
        if (state && isMounted) {
          setRoomState(state);
          if (state.hostId === myId) {
            setIsHost(true);
          }
        }

        // 2. Fetch all user_*.json files
        const resources: WebDAVResource[] = await webdav.propfind(`/rooms/${roomId}`, '1');
        const userFiles = resources.filter(
          (r) => !r.isDir && r.name.startsWith('user_') && r.name.endsWith('.json')
        );

        const loadedPlayers: PlayerInfo[] = [];
        for (const uf of userFiles) {
          const uId = uf.name.replace(/\.json$/, '');
          const uData = await webdav.get<UserCardFile>(`/rooms/${roomId}/${uf.name}`);
          if (uData) {
            loadedPlayers.push({
              id: uId,
              displayName: uData.displayName,
              isHost: state?.hostId === uId,
              isBot: uData.isBot,
              role: uData.role,
              initialRole: uData.initialRole,
            });

            if (uId === myId) {
              setMyRole(uData.role);
              if (uData.initialRole) {
                setMyInitialRole(uData.initialRole);
              }
            }
          }
        }

        if (isMounted) {
          setPlayers(loadedPlayers);
        }

        // 3. If in RESULT phase or Seer, fetch center.json
        if (state?.phase === 'RESULT' || state?.phase === 'NIGHT') {
          const cData = await webdav.get<CenterCardsFile>(`/rooms/${roomId}/center.json`);
          if (cData && isMounted) {
            setCenterCards(cData.cards);
          }
        }
      } catch (err) {
        console.warn('Sync state poll error:', err);
      }
    }

    syncState();
    const interval = setInterval(syncState, 800);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roomId, myId]);

  // Host Safeguard Timeout (12 seconds per night step)
  useEffect(() => {
    if (!isHost || roomState.phase !== 'NIGHT' || !roomState.currentStep) {
      if (safeguardTimerRef.current) clearInterval(safeguardTimerRef.current);
      return;
    }

    const checkStepTimeout = async () => {
      const now = Date.now();
      const elapsed = (now - roomState.stepStartedAt) / 1000;

      // 12-second safeguard timeout as specified in Section 4.1
      if (elapsed > 12) {
        console.log(`[Host Safeguard] Step ${roomState.currentStep} timed out (12s). Advancing...`);
        const nextStep = getNextNightStep(roomState.currentStep);
        if (nextStep) {
          await webdav.put(`/rooms/${roomId}/state.json`, {
            ...roomState,
            currentStep: nextStep,
            stepStartedAt: Date.now(),
          });
        } else {
          // Night completed -> Auto transition to DAY_DISCUSSION
          await webdav.put(`/rooms/${roomId}/state.json`, {
            ...roomState,
            phase: 'DAY_DISCUSSION',
            currentStep: null,
            timerStartedAt: Date.now(),
          });
        }
      }
    };

    safeguardTimerRef.current = setInterval(checkStepTimeout, 1000);
    return () => {
      if (safeguardTimerRef.current) clearInterval(safeguardTimerRef.current);
    };
  }, [isHost, roomId, roomState]);

  // Host Bot Simulation for Night and Voting
  useEffect(() => {
    if (!isHost || !roomId) return;

    // Bot night turn handling
    if (roomState.phase === 'NIGHT' && roomState.currentStep) {
      const step = roomState.currentStep;
      // Check if a bot has this initial role
      const botWithRole = players.find((p) => p.isBot && p.initialRole === step);
      if (botWithRole) {
        const timer = setTimeout(async () => {
          // Bot automated action
          if (step === 'ROBBER') {
            // Bot robber swaps with another player
            const target = players.find((p) => p.id !== botWithRole.id);
            if (target) {
              const myFile = `/rooms/${roomId}/${botWithRole.id}.json`;
              const targetFile = `/rooms/${roomId}/${target.id}.json`;
              const tempFile = `/rooms/${roomId}/temp.json`;
              await webdav.move(myFile, tempFile);
              await webdav.move(targetFile, myFile);
              await webdav.move(tempFile, targetFile);
            }
          } else if (step === 'TROUBLEMAKER') {
            const others = players.filter((p) => p.id !== botWithRole.id);
            if (others.length >= 2) {
              const fileA = `/rooms/${roomId}/${others[0].id}.json`;
              const fileB = `/rooms/${roomId}/${others[1].id}.json`;
              const tempFile = `/rooms/${roomId}/temp.json`;
              await webdav.move(fileA, tempFile);
              await webdav.move(fileB, fileA);
              await webdav.move(tempFile, fileB);
            }
          }

          // Advance step
          const next = getNextNightStep(step);
          if (next) {
            await webdav.put(`/rooms/${roomId}/state.json`, {
              ...roomState,
              currentStep: next,
              stepStartedAt: Date.now(),
            });
          } else {
            await webdav.put(`/rooms/${roomId}/state.json`, {
              ...roomState,
              phase: 'DAY_DISCUSSION',
              currentStep: null,
              timerStartedAt: Date.now(),
            });
          }
        }, 2000);
        return () => clearTimeout(timer);
      }
    }

    // Bot auto-voting
    if (roomState.phase === 'VOTING') {
      const bots = players.filter((p) => p.isBot);
      bots.forEach((bot) => {
        // Random target (other player)
        const candidates = players.filter((p) => p.id !== bot.id);
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          webdav.put(`/rooms/${roomId}/votes/${bot.id}.txt`, pick.id).catch(console.warn);
        }
      });
    }
  }, [isHost, roomId, roomState, players]);

  // Host: Start Game (Shuffle deck & assign roles)
  const handleStartGame = async (shuffledDeck: RoleType[]) => {
    if (!roomId || !isHost) return;

    try {
      // 1. Assign player cards
      const assignedCenter = shuffledDeck.slice(players.length);
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const assignedRole = shuffledDeck[i];
        const uFile: UserCardFile = {
          role: assignedRole,
          initialRole: assignedRole,
          displayName: p.displayName,
          isBot: p.isBot,
        };
        await webdav.put(`/rooms/${roomId}/${p.id}.json`, uFile);
      }

      // 2. Write center.json
      const centerData: CenterCardsFile = {
        cards: assignedCenter,
      };
      await webdav.put(`/rooms/${roomId}/center.json`, centerData);
      setCenterCards(assignedCenter);

      // 3. Clear votes directory
      const voteFiles = await webdav.propfind(`/rooms/${roomId}/votes`, '1');
      for (const vf of voteFiles) {
        if (!vf.isDir && vf.name.endsWith('.txt')) {
          await webdav.delete(`/rooms/${roomId}/votes/${vf.name}`);
        }
      }

      // 4. PUT state.json (phase: "NIGHT", currentStep: "WEREWOLF", stepStartedAt: Date.now())
      const nextState: RoomState = {
        phase: 'NIGHT',
        currentStep: 'WEREWOLF',
        stepStartedAt: Date.now(),
        hostId: myId,
        killed: null,
      };
      await webdav.put(`/rooms/${roomId}/state.json`, nextState);
      setRoomState(nextState);
      setVotedTarget(null);
    } catch (err) {
      console.error('Failed to start game:', err);
    }
  };

  // Complete Night Action
  const handleCompleteNightAction = async () => {
    if (!roomId || !roomState.currentStep) return;

    const nextStep = getNextNightStep(roomState.currentStep);
    if (nextStep) {
      const updated: RoomState = {
        ...roomState,
        currentStep: nextStep,
        stepStartedAt: Date.now(),
      };
      await webdav.put(`/rooms/${roomId}/state.json`, updated);
      setRoomState(updated);
    } else {
      // Last role (Insomniac) finished -> Auto switch to DAY_DISCUSSION
      const updated: RoomState = {
        ...roomState,
        phase: 'DAY_DISCUSSION',
        currentStep: null,
        timerStartedAt: Date.now(),
      };
      await webdav.put(`/rooms/${roomId}/state.json`, updated);
      setRoomState(updated);
    }
  };

  // Host: Start Voting
  const handleStartVoting = async () => {
    if (!roomId || !isHost) return;
    const updated: RoomState = {
      ...roomState,
      phase: 'VOTING',
    };
    await webdav.put(`/rooms/${roomId}/state.json`, updated);
    setRoomState(updated);
  };

  // Player Vote Callback
  const handleVote = (targetId: string) => {
    setVotedTarget(targetId);
  };

  // Host: Tally Votes and Announce Results
  const handleTallyResult = async () => {
    if (!roomId || !isHost) return;

    try {
      // 1. PROPFIND /webdav/rooms/room_xxx/votes/
      const resources = await webdav.propfind(`/rooms/${roomId}/votes`, '1');
      const voteFiles = resources.filter((r) => !r.isDir && r.name.endsWith('.txt'));

      const tallies: Record<string, number> = {};
      for (const vf of voteFiles) {
        const targetId = await webdav.get<string>(`/rooms/${roomId}/votes/${vf.name}`);
        if (targetId) {
          const cleanTarget = targetId.trim();
          tallies[cleanTarget] = (tallies[cleanTarget] || 0) + 1;
        }
      }
      setVoteCounts(tallies);

      // Find highest votes
      let maxVotes = 0;
      for (const count of Object.values(tallies)) {
        if (count > maxVotes) {
          maxVotes = count;
        }
      }

      let killedList: string[] = [];
      // Standard One Night Werewolf rules:
      // If highest vote is 1 vote each (everyone voted for someone else or total max <= 1 in 3+ players),
      // NO ONE dies!
      if (maxVotes > 1) {
        killedList = Object.keys(tallies).filter((k) => tallies[k] === maxVotes);
      }

      // PUT state.json (phase: "RESULT", killed: killedList)
      const nextState: RoomState = {
        ...roomState,
        phase: 'RESULT',
        killed: killedList,
      };
      await webdav.put(`/rooms/${roomId}/state.json`, nextState);
      setRoomState(nextState);
    } catch (err) {
      console.error('Failed to tally votes:', err);
    }
  };

  // Host: Restart Game (Return to WAITING)
  const handleRestartGame = async () => {
    if (!roomId || !isHost) return;
    try {
      // Reset state.json
      const nextState: RoomState = {
        phase: 'WAITING',
        currentStep: null,
        stepStartedAt: 0,
        hostId: myId,
        killed: null,
      };
      await webdav.put(`/rooms/${roomId}/state.json`, nextState);
      setRoomState(nextState);
      setVotedTarget(null);
    } catch (err) {
      console.error('Failed to restart game:', err);
    }
  };

  // Add simulated bot player (for easy solo/testing)
  const handleAddBot = async () => {
    if (!roomId) return;
    const botNum = players.filter((p) => p.isBot).length + 1;
    const botNames = ['민수', '영희', '지우', '현우', '다은', '준호'];
    const botName = `봇_${botNames[(botNum - 1) % botNames.length]}`;
    const botId = `user_bot_${Math.random().toString(36).substring(2, 6)}`;

    const botFile: UserCardFile = {
      role: 'VILLAGER',
      displayName: botName,
      isBot: true,
    };
    await webdav.put(`/rooms/${roomId}/${botId}.json`, botFile);
  };

  // Remove simulated bot
  const handleRemoveBot = async (botId: string) => {
    if (!roomId) return;
    await webdav.delete(`/rooms/${roomId}/${botId}.json`);
  };

  // Is it my turn to perform a night action?
  const isMyNightTurn =
    roomState.phase === 'NIGHT' &&
    roomState.currentStep !== null &&
    myInitialRole === roomState.currentStep;

  // Render Lobby if not in a room
  if (!roomId) {
    return (
      <>
        <OfflineIndicator />
        <LobbyView onJoinRoom={handleJoinRoom} initialRoomId={initialRoomFromUrl} />
      </>
    );
  }

  // Phase Title & Badges
  const getPhaseBadge = () => {
    switch (roomState.phase) {
      case 'WAITING':
        return { label: '대기실', color: 'bg-indigo-950 text-indigo-300 border-indigo-700' };
      case 'NIGHT':
        return {
          label: `밤 (${ROLES[roomState.currentStep || 'WEREWOLF']?.name || '진행 중'})`,
          color: 'bg-rose-950 text-rose-300 border-rose-700',
        };
      case 'DAY_DISCUSSION':
        return { label: '아침 토론', color: 'bg-amber-950 text-amber-300 border-amber-700' };
      case 'VOTING':
        return { label: '투표 진행 중', color: 'bg-red-950 text-red-300 border-red-700' };
      case 'RESULT':
        return { label: '결과 발표', color: 'bg-emerald-950 text-emerald-300 border-emerald-700' };
    }
  };

  const badge = getPhaseBadge();
  const killedList = Array.isArray(roomState.killed)
    ? roomState.killed
    : roomState.killed
    ? [roomState.killed]
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-3 selection:bg-indigo-500">
      <OfflineIndicator />

      {/* Persistent Top Status Bar */}
      <header className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl px-4 py-2.5 shadow-xl flex items-center justify-between mb-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center shadow">
            <Moon className="w-4 h-4 text-amber-300 fill-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm text-white">{displayName}</span>
              {isHost && (
                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                  <Shield className="w-3 h-3" /> 방장
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">방: {roomId}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Phase Badge */}
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm ${badge.color}`}
          >
            {badge.label}
          </span>

          {/* Leave Button */}
          <button
            onClick={handleLeaveRoom}
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            title="방 나가기"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Screen Wake Lock Status Bar (Mobile experience) & Version Badge */}
      <div className="w-full max-w-md px-2 mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${isLocked ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          {isLocked ? '화면 켜짐 유지' : '절전 방지 대기'}
        </span>
        <div className="flex items-center gap-2">
          <VersionBadge compact />
          <PWAInstallButton />
        </div>
      </div>

      {/* In-Game Central Dynamic Views */}
      <main className="w-full max-w-md flex-1 flex flex-col">
        {/* 1. WAITING ROOM VIEW */}
        {roomState.phase === 'WAITING' && (
          <WaitingRoomView
            roomId={roomId}
            myId={myId}
            isHost={isHost}
            players={players}
            onStartGame={handleStartGame}
            onAddBot={handleAddBot}
            onRemoveBot={handleRemoveBot}
          />
        )}

        {/* 2. NIGHT PHASE: Mandatory 4x4 Memory Minigame for Bluffing Concealment */}
        {roomState.phase === 'NIGHT' && (
          <div className="w-full flex-1 flex flex-col items-center justify-center relative">
            <MemoryMinigame />

            {/* If it's my turn, display the semi-transparent role action modal */}
            {isMyNightTurn && roomState.currentStep && myInitialRole && (
              <NightActionModal
                roomId={roomId}
                myId={myId}
                currentStep={roomState.currentStep}
                initialRole={myInitialRole}
                players={players}
                centerCards={centerCards}
                onCompleteAction={handleCompleteNightAction}
              />
            )}
          </div>
        )}

        {/* 3. DAY DISCUSSION VIEW */}
        {roomState.phase === 'DAY_DISCUSSION' && (
          <DiscussionView
            isHost={isHost}
            myInitialRole={myInitialRole}
            players={players}
            timerStartedAt={roomState.timerStartedAt || roomState.stepStartedAt}
            durationSeconds={300}
            onStartVoting={handleStartVoting}
          />
        )}

        {/* 4. VOTING VIEW */}
        {roomState.phase === 'VOTING' && (
          <VotingView
            roomId={roomId}
            myId={myId}
            isHost={isHost}
            players={players}
            votedTarget={votedTarget}
            onVote={handleVote}
            onTallyResult={handleTallyResult}
          />
        )}

        {/* 5. RESULT VIEW */}
        {roomState.phase === 'RESULT' && (
          <ResultView
            isHost={isHost}
            myId={myId}
            players={players}
            centerCards={centerCards}
            killedUserIds={killedList}
            voteCounts={voteCounts}
            onRestartGame={handleRestartGame}
          />
        )}
      </main>
    </div>
  );
}
