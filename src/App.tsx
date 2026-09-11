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
  Zap,
  Clock,
  Crown,
  FlaskConical,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import {
  GamePhase,
  NightStep,
  PlayerInfo,
  RoleType,
  RoomState,
  UserCardFile,
  CenterCardsFile,
  RoomInfo,
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
import { AdminModal } from './components/AdminModal';
import { RoleRevealModal } from './components/RoleRevealModal';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const sessionRoom = sessionStorage.getItem('onw_room_id');
      return sessionRoom || roomParam || null;
    }
    return null;
  });

  const [isRestoring, setIsRestoring] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const sessionRoom = sessionStorage.getItem('onw_room_id');
      return Boolean(sessionRoom || roomParam);
    }
    return false;
  });

  const [myId, setMyId] = useState<string>(() => {
    // Prefer sessionStorage so each browser tab gets a unique identity for local testing / multi-tab sessions
    let saved = sessionStorage.getItem('onw_my_id');
    if (!saved) {
      // If none in session, generate unique ID for this tab
      saved = `user_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('onw_my_id', saved);
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
  const [hasConfirmedInitialRole, setHasConfirmedInitialRole] = useState<boolean>(false);
  const [votedTarget, setVotedTarget] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [initialRoomFromUrl, setInitialRoomFromUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [toastMessage, setToastMessage] = useState<{ id: number; text: string; type?: 'info' | 'success' | 'warn' } | null>(null);

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('onw_is_admin') === 'true';
  });
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [adminRooms, setAdminRooms] = useState<RoomInfo[]>([]);

  // Fetch rooms list for AdminModal when opened
  useEffect(() => {
    if (!showAdminModal) return;
    webdav.listRooms().then((list) => {
      setAdminRooms(
        list.map((r) => ({
          id: r.name,
          name: r.name.replace(/^room_/, '방 '),
          playerCount: r.playerCount ?? 0,
          phase: (r.phase as any) || 'WAITING',
          hostId: r.hostId || '',
        }))
      );
    }).catch(() => {});
  }, [showAdminModal]);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((text: string, type: 'info' | 'success' | 'warn' = 'info') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage({ id: Date.now(), text, type });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Admin Test Mode Toggle (Timer freeze for manual inspection)
  const handleToggleTestMode = useCallback(async () => {
    if (!roomId) return;
    if (!isAdmin) {
      setShowAdminModal(true);
      return;
    }
    const nextVal = !roomStateRef.current.testMode;
    try {
      const curState = roomStateRef.current;
      const updated: RoomState = {
        ...curState,
        testMode: nextVal,
      };
      await webdav.put(`/rooms/${roomId}/state.json`, updated);
      setRoomState(updated);
      showToast(
        nextVal
          ? '🧪 테스트 모드 활성화: 모든 자동 타이머가 정지되었습니다.'
          : '⏱️ 일반 모드 복구: 타이머가 정상 재개되었습니다.',
        'info'
      );
      playSound('click');
    } catch (err) {
      console.warn('Failed to toggle test mode:', err);
    }
  }, [roomId, isAdmin, showToast]);

  const { isLocked, isSupported: wakeLockSupported, requestLock } = useWakeLock();

  // Stable refs for interval callbacks to avoid closures on stale state
  const roomStateRef = useRef<RoomState>(roomState);
  roomStateRef.current = roomState;
  const playersRef = useRef<PlayerInfo[]>(players);
  playersRef.current = players;
  const roomIdRef = useRef<string | null>(roomId);
  roomIdRef.current = roomId;
  const botHandledStepRef = useRef<NightStep | null>(null);
  const advancingStepRef = useRef<string | null>(null);
  const isPromotingHostRef = useRef<boolean>(false);
  const missingStateCountRef = useRef<number>(0);
  const prevHostIdRef = useRef<string>('');

  // In-memory unique ID for this React tab instance (not shared or cloned)
  const tabInstanceIdRef = useRef<string>(`tab_${Math.random().toString(36).substring(2, 9)}`);

  // Tab session ID (persisted in sessionStorage for F5 reload)
  const [tabSessionId] = useState<string>(() => {
    let saved = sessionStorage.getItem('onw_session_id');
    if (!saved) {
      saved = `sess_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem('onw_session_id', saved);
    }
    return saved;
  });

  // BroadcastChannel to detect duplicate tab connections on same myId
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel(`onw_tab_sync_${myId}`);
    sessionChannelRef.current = channel;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !roomIdRef.current) return;

      if (data.type === 'PING_SESSION' && data.roomId === roomIdRef.current) {
        if (data.senderTabInstanceId !== tabInstanceIdRef.current) {
          channel.postMessage({
            type: 'PONG_SESSION',
            roomId: roomIdRef.current,
            responderTabInstanceId: tabInstanceIdRef.current,
          });
        }
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      sessionChannelRef.current = null;
    };
  }, [myId]);

  const checkDuplicateTab = useCallback((targetRoomId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.BroadcastChannel || !sessionChannelRef.current) {
        resolve(false);
        return;
      }
      let responded = false;
      const channel = sessionChannelRef.current;
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'PONG_SESSION' && event.data?.roomId === targetRoomId) {
          responded = true;
        }
      };
      channel.addEventListener('message', handleMessage);
      try {
        channel.postMessage({
          type: 'PING_SESSION',
          roomId: targetRoomId,
          senderTabInstanceId: tabInstanceIdRef.current,
        });
      } catch {
        // channel error
      }

      setTimeout(() => {
        channel.removeEventListener('message', handleMessage);
        resolve(responded);
      }, 100);
    });
  }, []);

  const checkDuplicateDisplayName = useCallback(
    async (
      targetRoomId: string,
      checkName: string,
      myUserId: string,
      isTestMode = false
    ): Promise<{ isDuplicate: boolean; staleFileNames: string[] }> => {
      try {
        const roomFiles = await webdav.propfind(`/rooms/${targetRoomId}/`, '1');
        const userFiles = roomFiles.filter(
          (rf) => !rf.isDir && rf.name.startsWith('user_') && rf.name.endsWith('.json') && rf.name !== `${myUserId}.json`
        );

        const timeoutThreshold = isTestMode ? 180000 : 12000;
        const now = Date.now();
        const normalizedCheck = checkName.trim().toLowerCase();
        const staleFileNames: string[] = [];
        let isDuplicate = false;

        for (const uf of userFiles) {
          const uData = await webdav.get<UserCardFile>(`/rooms/${targetRoomId}/${uf.name}`);
          if (uData && !uData.isBot && uData.displayName) {
            if (uData.displayName.trim().toLowerCase() === normalizedCheck) {
              const isOnline = uData.lastSeen ? now - uData.lastSeen < timeoutThreshold : true;
              if (isOnline) {
                isDuplicate = true;
                break;
              } else {
                staleFileNames.push(uf.name);
              }
            }
          }
        }

        return { isDuplicate, staleFileNames };
      } catch {
        return { isDuplicate: false, staleFileNames: [] };
      }
    },
    []
  );

  // High-frequency tick for smooth night progress bar rendering
  useEffect(() => {
    if (roomState.phase !== 'NIGHT') return;
    const tick = setInterval(() => setCurrentTime(Date.now()), 100);
    return () => clearInterval(tick);
  }, [roomState.phase]);

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

  // Re-acquire lock and touch heartbeat on mobile visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomId) {
        if (roomState.phase !== 'WAITING') {
          requestLock();
        }
        webdav.get<UserCardFile>(`/rooms/${roomId}/${myId}.json`).then((file) => {
          if (file) {
            webdav.put(`/rooms/${roomId}/${myId}.json`, {
              ...file,
              lastSeen: Date.now(),
              sessionId: tabSessionId,
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [roomId, myId, roomState.phase, requestLock, tabSessionId]);

  // Session Restoration Effect on initial mount / reload
  useEffect(() => {
    const targetRoom = roomId;
    if (!targetRoom) {
      setIsRestoring(false);
      return;
    }

    let isMounted = true;
    async function restoreSession() {
      try {
        console.log(`[Session Restore] Checking room: ${targetRoom}, user: ${myId}`);
        // 1. Verify if room state exists
        const state = await webdav.get<RoomState>(`/rooms/${targetRoom}/state.json`);
        if (!state) {
          console.warn(`[Session Restore] Room ${targetRoom} does not exist. Returning to lobby.`);
          sessionStorage.removeItem('onw_room_id');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          if (isMounted) {
            setRoomId(null);
            setIsRestoring(false);
          }
          return;
        }

        // 2. Check for duplicate active tab on the same myId in targetRoom
        const isDupTab = await checkDuplicateTab(targetRoom);
        if (isDupTab) {
          console.warn(`[Session Restore] Duplicate tab detected for user ${myId} in ${targetRoom}`);
          sessionStorage.removeItem('onw_room_id');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          if (isMounted) {
            setRoomId(null);
            setIsRestoring(false);
            showToast('동일한 ID로 이미 다른 창에서 접속 중입니다. (중복 접속 차단)', 'warn');
          }
          return;
        }

        // 3. Check if user's file exists
        const existingUser = await webdav.get<UserCardFile>(`/rooms/${targetRoom}/${myId}.json`);
        if (existingUser) {
          console.log(`[Session Restore] Found existing user card:`, existingUser);
          if (isMounted) {
            setRoomState(state);
            setIsHost(state.hostId === myId);
            setMyRole(existingUser.role);
            if (existingUser.initialRole) {
              setMyInitialRole(existingUser.initialRole);
            }
            if (existingUser.displayName) {
              setDisplayName(existingUser.displayName);
            }
          }
          // Touch heartbeat
          await webdav.put(`/rooms/${targetRoom}/${myId}.json`, {
            ...existingUser,
            lastSeen: Date.now(),
            sessionId: tabSessionId,
          });
        } else {
          // If no existing user file
          if (state.phase === 'WAITING') {
            const cleanName = displayName.trim() || '모험가';
            const isTestMode = Boolean(state.testMode);

            // Check if another active player already has the same nickname
            const { isDuplicate, staleFileNames } = await checkDuplicateDisplayName(
              targetRoom,
              cleanName,
              myId,
              isTestMode
            );

            if (isDuplicate) {
              console.warn(`[Session Restore] Duplicate nickname detected: ${cleanName}`);
              sessionStorage.removeItem('onw_room_id');
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', window.location.pathname);
              }
              if (isMounted) {
                setRoomId(null);
                setIsRestoring(false);
                showToast(`이미 대기실에 동일한 닉네임(ID) '${cleanName}' 플레이어가 접속 중입니다. 로비에서 닉네임을 변경해주세요.`, 'warn');
              }
              return;
            }

            // Clean up any stale sessions with the same nickname
            for (const sf of staleFileNames) {
              await webdav.delete(`/rooms/${targetRoom}/${sf}`).catch(() => {});
            }

            console.log(`[Session Restore] Registering new user into waiting room: ${targetRoom}`);
            const newFile: UserCardFile = {
              role: 'VILLAGER',
              displayName: cleanName,
              isBot: false,
              lastSeen: Date.now(),
              sessionId: tabSessionId,
            };
            await webdav.put(`/rooms/${targetRoom}/${myId}.json`, newFile);
            if (isMounted) {
              setRoomState(state);
              setIsHost(state.hostId === myId);
            }
          } else {
            console.warn(`[Session Restore] Game already in progress (${state.phase}). Cannot join mid-game.`);
            sessionStorage.removeItem('onw_room_id');
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', window.location.pathname);
            }
            if (isMounted) {
              setRoomId(null);
              setIsRestoring(false);
            }
            return;
          }
        }

        // 4. Restore vote if in VOTING phase
        if (state.phase === 'VOTING') {
          try {
            const vote = await webdav.get<string>(`/rooms/${targetRoom}/votes/${myId}.txt`);
            if (vote && isMounted) {
              setVotedTarget(vote.trim());
            }
          } catch {
            // ignore
          }
        }

        // 5. Update session storage and URL
        sessionStorage.setItem('onw_room_id', targetRoom);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/?room=${encodeURIComponent(targetRoom)}`);
        }
      } catch (err) {
        console.error('[Session Restore] Error during restore:', err);
      } finally {
        if (isMounted) {
          setIsRestoring(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []); // Run once on mount

  // Join or Create Room Handler
  const handleJoinRoom = async (targetRoomId: string, userDisplayName: string, hostFlag: boolean) => {
    const cleanName = userDisplayName.trim();
    if (!cleanName) {
      showToast('닉네임(ID)을 입력해주세요.', 'warn');
      return;
    }

    try {
      // 1. Check if room exists and phase
      const existingState = await webdav.get<RoomState>(`/rooms/${targetRoomId}/state.json`);
      if (!hostFlag && existingState && existingState.phase !== 'WAITING') {
        const existingCard = await webdav.get<UserCardFile>(`/rooms/${targetRoomId}/${myId}.json`);
        if (!existingCard) {
          showToast('이미 게임이 진행 중인 방에는 입장할 수 없습니다.', 'warn');
          return;
        }
      }

      // 2. Check for duplicate session tab in the same browser
      const isDupTab = await checkDuplicateTab(targetRoomId);
      if (isDupTab) {
        showToast('동일한 ID로 이미 다른 창에서 접속 중입니다. (중복 접속 차단)', 'warn');
        return;
      }

      // 3. Check for duplicate active displayName in targetRoomId
      const isTestMode = Boolean(existingState?.testMode);
      const { isDuplicate, staleFileNames } = await checkDuplicateDisplayName(
        targetRoomId,
        cleanName,
        myId,
        isTestMode
      );

      if (isDuplicate) {
        showToast(
          `이미 대기실에 동일한 닉네임(ID) '${cleanName}' 플레이어가 접속 중입니다. 다른 닉네임을 설정해주세요.`,
          'warn'
        );
        return;
      }

      // Clean up any stale duplicate player sessions before proceeding
      for (const sf of staleFileNames) {
        console.log(`[Join] Cleaning up stale duplicate player session ${sf} (${cleanName})`);
        await webdav.delete(`/rooms/${targetRoomId}/${sf}`).catch(() => {});
      }

      setRoomId(targetRoomId);
      setDisplayName(cleanName);
      setIsHost(hostFlag);

      // Save to storage
      localStorage.setItem('onw_nickname', cleanName);
      sessionStorage.setItem('onw_room_id', targetRoomId);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/?room=${encodeURIComponent(targetRoomId)}`);
      }

      // Ensure directory /rooms, /rooms/{roomId} and /rooms/{roomId}/votes
      await webdav.mkcol('/rooms');
      await webdav.mkcol(`/rooms/${targetRoomId}`);
      await webdav.mkcol(`/rooms/${targetRoomId}/votes`);

      // Check if user already has a card (preserve role and initialRole!)
      const existingUser = await webdav.get<UserCardFile>(`/rooms/${targetRoomId}/${myId}.json`);
      if (existingUser) {
        const updated: UserCardFile = {
          ...existingUser,
          displayName: cleanName,
          lastSeen: Date.now(),
          sessionId: tabSessionId,
        };
        await webdav.put(`/rooms/${targetRoomId}/${myId}.json`, updated);
        setMyRole(existingUser.role);
        if (existingUser.initialRole) {
          setMyInitialRole(existingUser.initialRole);
        }
      } else {
        const userFile: UserCardFile = {
          role: 'VILLAGER',
          displayName: cleanName,
          isBot: false,
          lastSeen: Date.now(),
          sessionId: tabSessionId,
        };
        await webdav.put(`/rooms/${targetRoomId}/${myId}.json`, userFile);
      }

      // If host, ensure state.json exists
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

  // Leave room (User explicitly clicked Leave button)
  const handleLeaveRoom = async () => {
    if (roomId) {
      try {
        if (isHost) {
          // Check other human players in the room
          const curPlayers = playersRef.current;
          const otherHumans = curPlayers.filter((p) => !p.isBot && p.id !== myId);
          if (otherHumans.length > 0) {
            // Hand over host privilege to the next human player in list
            const nextHost = otherHumans[0];
            console.log(`[Host Handover] Host is leaving. Handing over host privilege to ${nextHost.displayName} (${nextHost.id})...`);
            const curState = roomStateRef.current;
            await webdav.put(`/rooms/${roomId}/state.json`, {
              ...curState,
              hostId: nextHost.id,
            });
            // Delete own user card file
            await webdav.delete(`/rooms/${roomId}/${myId}.json`);
          } else {
            // No other human players left in room -> Delete room collection entirely
            console.log(`[Room Cleanup] Last human player/host left. Deleting room /rooms/${roomId}...`);
            await webdav.delete(`/rooms/${roomId}`);
          }
        } else {
          // Regular guest leaving
          await webdav.delete(`/rooms/${roomId}/${myId}.json`);
        }
      } catch (e) {
        console.warn('Error during leave room:', e);
      }
    }
    sessionStorage.removeItem('onw_room_id');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
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
    setPlayers([]);
  };

  // Host can kick a disconnected / zombie player in WAITING room
  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!roomId || !isHost || targetPlayerId === myId) return;
    try {
      console.log(`[Host] Kicking player ${targetPlayerId}...`);
      await webdav.delete(`/rooms/${roomId}/${targetPlayerId}.json`);
      setPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));
    } catch (err) {
      console.warn('Failed to kick player:', err);
    }
  };

  // Periodic Heartbeat loop: update lastSeen every 4 seconds when in room
  useEffect(() => {
    if (!roomId) return;
    const heartbeatInterval = setInterval(async () => {
      try {
        const currentFile = await webdav.get<UserCardFile>(`/rooms/${roomId}/${myId}.json`);
        if (currentFile) {
          await webdav.put(`/rooms/${roomId}/${myId}.json`, {
            ...currentFile,
            lastSeen: Date.now(),
            sessionId: tabSessionId,
          });
        }
      } catch {
        // ignore
      }
    }, 4000);

    return () => clearInterval(heartbeatInterval);
  }, [roomId, myId, tabSessionId]);

  // Synchronize Room State & Players via WebDAV polling (0.8s interval)
  useEffect(() => {
    if (!roomId) return;
    let isMounted = true;

    async function syncState() {
      try {
        // 1. Fetch state.json
        const state = await webdav.get<RoomState>(`/rooms/${roomId}/state.json`);
        if (!state) {
          missingStateCountRef.current += 1;
          // If state.json is absent for 2 consecutive polls, room was closed or deleted
          if (missingStateCountRef.current >= 2 && isMounted) {
            console.warn(`[Sync] Room ${roomId} was closed or deleted. Returning to lobby.`);
            sessionStorage.removeItem('onw_room_id');
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setRoomId(null);
            setRoomState({
              phase: 'WAITING',
              currentStep: null,
              stepStartedAt: 0,
              hostId: '',
              killed: null,
            });
            setPlayers([]);
            showToast('대기실이 종료되었거나 삭제되어 로비로 이동합니다.', 'warn');
            return;
          }
          return;
        }

        missingStateCountRef.current = 0;
        if (isMounted) {
          setRoomState(state);
          setIsHost(state.hostId === myId);
        }

        // 2. Fetch all user_*.json files
        const resources: WebDAVResource[] = await webdav.propfind(`/rooms/${roomId}/`, '1');
        const userFiles = resources.filter(
          (r) => !r.isDir && r.name.startsWith('user_') && r.name.endsWith('.json')
        );

        const loadedPlayers: PlayerInfo[] = [];
        const now = Date.now();
        for (const uf of userFiles) {
          const uId = uf.name.replace(/\.json$/, '');
          const uData = await webdav.get<UserCardFile>(`/rooms/${roomId}/${uf.name}`);
          if (uData) {
            // Check online presence (12s normally, or 180s in testMode for multi-tab inspection)
            const timeoutThreshold = (state?.testMode || roomStateRef.current.testMode) ? 180000 : 12000;
            const isOnline = uData.isBot || (uData.lastSeen ? now - uData.lastSeen < timeoutThreshold : true);

            loadedPlayers.push({
              id: uId,
              displayName: uData.displayName,
              isHost: state?.hostId === uId,
              isBot: uData.isBot,
              role: uData.role,
              initialRole: uData.initialRole,
              lastSeen: uData.lastSeen,
              sessionId: uData.sessionId,
              isOnline,
            });

            if (uId === myId) {
              setMyRole(uData.role);
              if (uData.initialRole) {
                // Keep initialRole immutable during gameplay once assigned
                setMyInitialRole((prev) => (state?.phase === 'WAITING' || !prev ? uData.initialRole : prev));
              }

              // Check if another tab/client took over this user session
              if (uData.sessionId && uData.sessionId !== tabSessionId) {
                console.warn(`[Sync] Duplicate session conflict detected for user ${myId}. Disconnecting.`);
                sessionStorage.removeItem('onw_room_id');
                if (typeof window !== 'undefined') {
                  window.history.replaceState(null, '', window.location.pathname);
                }
                setRoomId(null);
                showToast('다른 창이나 기기에서 동일한 ID로 접속하여 연결이 종료되었습니다.', 'warn');
                return;
              }
            }
          }
        }

        if (isMounted) {
          setPlayers(loadedPlayers);
        }

        // 2-1. Host Migration & Self-Healing: Check if host is missing or offline
        const currentHost = loadedPlayers.find((p) => p.id === state.hostId);
        const isHostMissing = !currentHost;
        const isHostOfflineInWaiting =
          state.phase === 'WAITING' &&
          Boolean(currentHost && !currentHost.isBot && currentHost.isOnline === false);

        if (isHostMissing || isHostOfflineInWaiting) {
          const activeHumans = loadedPlayers.filter(
            (p) => !p.isBot && p.isOnline && p.id !== state.hostId
          );

          if (activeHumans.length > 0) {
            // First online human player in list takes over host role
            const candidate = activeHumans[0];
            if (candidate.id === myId && !isPromotingHostRef.current) {
              isPromotingHostRef.current = true;
              console.warn(
                `[Self-Healing Host Migration] Host (${state.hostId}) is ${
                  isHostMissing ? 'missing' : 'offline in waiting room'
                }. Promoting self (${myId}) to host!`
              );
              try {
                const updatedState: RoomState = {
                  ...state,
                  hostId: myId,
                };
                await webdav.put(`/rooms/${roomId}/state.json`, updatedState);
                if (isMounted) {
                  setRoomState(updatedState);
                  setIsHost(true);
                  showToast('👑 방장이 부재중이거나 퇴장하여 새로운 방장이 되었습니다!', 'success');
                  playSound('click');
                }
                // If previous host was an offline zombie in waiting room, clean up their file
                if (isHostOfflineInWaiting && currentHost) {
                  webdav.delete(`/rooms/${roomId}/${currentHost.id}.json`).catch(() => {});
                }
              } catch (err) {
                console.error('Failed to promote to host:', err);
              } finally {
                setTimeout(() => {
                  isPromotingHostRef.current = false;
                }, 2000);
              }
            }
          }
        }

        // 2-2. Host Change Notification (Toast for other guests)
        if (prevHostIdRef.current && prevHostIdRef.current !== state.hostId) {
          const newHostPlayer = loadedPlayers.find((p) => p.id === state.hostId);
          if (newHostPlayer && newHostPlayer.id !== myId) {
            showToast(`👑 새로운 방장: ${newHostPlayer.displayName} 님`, 'info');
          }
        }
        prevHostIdRef.current = state.hostId;

        // 3. If in RESULT phase or Seer, fetch center.json
        if (state?.phase === 'RESULT' || state?.phase === 'NIGHT') {
          const cData = await webdav.get<CenterCardsFile>(`/rooms/${roomId}/center.json`);
          if (cData && isMounted) {
            setCenterCards(cData.cards);
          }
        }

        // 4. If in VOTING phase, restore user's votedTarget if not set
        if (state?.phase === 'VOTING') {
          const vote = await webdav.get<string>(`/rooms/${roomId}/votes/${myId}.txt`);
          if (vote && isMounted) {
            setVotedTarget(vote.trim());
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

  // Helper to advance the night step atomically
  const advanceNightStep = useCallback(
    async (fromStep: NightStep) => {
      if (!roomId) return;
      const curState = roomStateRef.current;
      if (curState.phase !== 'NIGHT' || curState.currentStep !== fromStep) {
        return;
      }
      // Deduplicate rapid consecutive triggers for the exact same step cycle
      const transitionKey = `${fromStep}_${curState.stepStartedAt}`;
      if (advancingStepRef.current === transitionKey) return;
      advancingStepRef.current = transitionKey;

      console.log(`[Night Progression] Advancing from ${fromStep}...`);
      const nextStep = getNextNightStep(fromStep);
      if (nextStep) {
        const updated: RoomState = {
          ...curState,
          currentStep: nextStep,
          stepStartedAt: Date.now(),
        };
        await webdav.put(`/rooms/${roomId}/state.json`, updated);
        setRoomState(updated);
      } else {
        // Last night role finished -> Auto transition to DAY_DISCUSSION
        const updated: RoomState = {
          ...curState,
          phase: 'DAY_DISCUSSION',
          currentStep: null,
          timerStartedAt: Date.now(),
        };
        await webdav.put(`/rooms/${roomId}/state.json`, updated);
        setRoomState(updated);
      }
    },
    [roomId]
  );

  // Complete Night Action (Human Player finished)
  const handleCompleteNightAction = async () => {
    if (!roomState.currentStep) return;
    await advanceNightStep(roomState.currentStep);
  };

  // Night Step Timer & Bot Orchestrator with Self-Healing Fallback
  useEffect(() => {
    if (!roomId || roomState.phase !== 'NIGHT' || !roomState.currentStep) {
      return;
    }

    const currentStep = roomState.currentStep;
    const stepStartedAt = roomState.stepStartedAt;

    const interval = setInterval(async () => {
      const curState = roomStateRef.current;
      if (curState.phase !== 'NIGHT' || curState.currentStep !== currentStep) {
        return;
      }

      const curPlayers = playersRef.current;
      const humanWithRole = curPlayers.find((p) => !p.isBot && p.initialRole === currentStep);
      const botWithRole = curPlayers.find((p) => p.isBot && p.initialRole === currentStep);

      // Determine step duration:
      // - Human player exists: 12 seconds safeguard (can finish early via modal)
      // - Bot player exists: 2 seconds
      // - Unassigned role (in center): fastMode ? 0.8s : 3.5s (bluffing concealment)
      let targetDuration = 3.5;
      if (humanWithRole) {
        targetDuration = 12;
      } else if (botWithRole) {
        targetDuration = 2;
      } else if (curState.fastMode) {
        targetDuration = 0.8;
      }

      const elapsed = (Date.now() - stepStartedAt) / 1000;

      // 1. Bot action execution (Host executes once around 1.2s mark)
      if (isHost && botWithRole && botHandledStepRef.current !== currentStep && elapsed >= 1.2) {
        botHandledStepRef.current = currentStep;
        if (currentStep === 'ROBBER') {
          const target = curPlayers.find((p) => p.id !== botWithRole.id);
          if (target) {
            const myFile = `/rooms/${roomId}/${botWithRole.id}.json`;
            const targetFile = `/rooms/${roomId}/${target.id}.json`;
            const botData = await webdav.get<UserCardFile>(myFile);
            const targetData = await webdav.get<UserCardFile>(targetFile);
            if (botData && targetData) {
              await webdav.put(myFile, { ...botData, role: targetData.role });
              await webdav.put(targetFile, { ...targetData, role: botData.role });
            }
          }
        } else if (currentStep === 'TROUBLEMAKER') {
          const others = curPlayers.filter((p) => p.id !== botWithRole.id);
          if (others.length >= 2) {
            const fileA = `/rooms/${roomId}/${others[0].id}.json`;
            const fileB = `/rooms/${roomId}/${others[1].id}.json`;
            const userAData = await webdav.get<UserCardFile>(fileA);
            const userBData = await webdav.get<UserCardFile>(fileB);
            if (userAData && userBData) {
              await webdav.put(fileA, { ...userAData, role: userBData.role });
              await webdav.put(fileB, { ...userBData, role: userAData.role });
            }
          }
        }
      }

      // 2. Freeze auto-advancement in testMode for manual inspection across tabs
      if (curState.testMode) {
        return;
      }

      // 3. Normal Host Step Progression
      if (isHost && elapsed >= targetDuration) {
        console.log(`[Host] Night step ${currentStep} duration reached (${targetDuration}s). Advancing...`);
        advanceNightStep(currentStep);
        return;
      }

      // 3. Fail-safe / Self-Healing for background tab throttled host:
      // If host is inactive or throttled and elapsed >= targetDuration + 2.5s,
      // the first active human player takes over advancing the step.
      const firstActiveHuman = curPlayers.find((p) => !p.isBot);
      if (!isHost && firstActiveHuman?.id === myId && elapsed >= targetDuration + 2.5) {
        console.warn(`[Self-Healing Fail-Safe] Host throttled/offline. Advancing step ${currentStep}...`);
        advanceNightStep(currentStep);
      }
    }, 400);

    return () => {
      clearInterval(interval);
    };
  }, [roomId, isHost, myId, roomState.phase, roomState.currentStep, roomState.stepStartedAt, advanceNightStep]);

  // Host Bot Simulation for Voting
  useEffect(() => {
    if (!isHost || !roomId || roomState.phase !== 'VOTING') return;

    const bots = players.filter((p) => p.isBot);
    bots.forEach((bot) => {
      // Random target (other player)
      const candidates = players.filter((p) => p.id !== bot.id);
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        webdav.put(`/rooms/${roomId}/votes/${bot.id}.txt`, pick.id).catch(console.warn);
      }
    });
  }, [isHost, roomId, roomState.phase, players]);

  // Host: Start Game (Shuffle deck & assign roles)
  const handleStartGame = async (shuffledDeck: RoleType[], fastMode = false, testMode = false) => {
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
          lastSeen: p.lastSeen,
          sessionId: p.sessionId,
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

      // 4. PUT state.json (phase: "NIGHT", currentStep: "WEREWOLF", stepStartedAt: Date.now(), fastMode, testMode)
      const isTestActive = testMode || roomStateRef.current.testMode || false;
      const nextState: RoomState = {
        phase: 'NIGHT',
        currentStep: 'WEREWOLF',
        stepStartedAt: Date.now(),
        hostId: myId,
        killed: null,
        fastMode,
        testMode: isTestActive,
      };
      await webdav.put(`/rooms/${roomId}/state.json`, nextState);
      setRoomState(nextState);
      setVotedTarget(null);
      setHasConfirmedInitialRole(false);
    } catch (err) {
      console.error('Failed to start game:', err);
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
        testMode: roomStateRef.current.testMode || false,
      };
      await webdav.put(`/rooms/${roomId}/state.json`, nextState);
      setRoomState(nextState);
      setVotedTarget(null);
      setHasConfirmedInitialRole(false);
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

  // Render Loading spinner during session restoration
  if (isRestoring) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center animate-spin mb-4">
          <Moon className="w-6 h-6 text-indigo-400" />
        </div>
        <p className="text-slate-200 font-bold text-base">게임 세션 복원 중...</p>
        <p className="text-slate-400 text-xs mt-1">방 정보를 확인하고 연결 중입니다</p>
      </div>
    );
  }

  // Render Lobby if not in a room
  if (!roomId) {
    return (
      <>
        <OfflineIndicator />
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/60 text-white shadow-2xl flex items-center gap-2.5 text-xs font-bold backdrop-blur-md">
            <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
        )}
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
          label: '밤 (진행 중)',
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

      {/* Floating Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/60 text-white shadow-2xl shadow-indigo-950/80 flex items-center gap-2.5 text-xs font-bold backdrop-blur-md">
          <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{toastMessage.text}</span>
        </div>
      )}

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
          {/* Test Mode Badge / Toggle Button */}
          {roomState.testMode ? (
            <button
              onClick={handleToggleTestMode}
              className="px-2.5 py-1 rounded-full bg-purple-950/90 border border-purple-500/60 text-purple-300 font-bold text-xs flex items-center gap-1 shadow-sm hover:bg-purple-900 transition"
              title="테스트 모드 활성 중 (타이머 정지). 클릭 시 일반 모드로 전환"
            >
              <FlaskConical className="w-3 h-3 text-purple-400" />
              <span>테스트 ON</span>
            </button>
          ) : (isAdmin || isHost) && (
            <button
              onClick={handleToggleTestMode}
              className="p-1.5 rounded-xl text-slate-500 hover:text-purple-300 hover:bg-slate-800 transition text-xs flex items-center gap-0.5"
              title="검증용 테스트 모드 활성화 (타이머 중지)"
            >
              <FlaskConical className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Admin Dashboard / Login Button */}
          <button
            onClick={() => {
              playSound('click');
              setShowAdminModal(true);
            }}
            className={`p-1.5 rounded-xl transition ${
              isAdmin
                ? 'text-amber-400 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30'
                : 'text-slate-500 hover:text-amber-300 hover:bg-slate-800'
            }`}
            title={isAdmin ? '관리자 대시보드 열기' : '관리자 로그인 (비밀번호: 0000)'}
          >
            {isAdmin ? <ShieldAlert className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          </button>

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
            isAdmin={isAdmin}
            testMode={roomState.testMode}
            players={players}
            onStartGame={handleStartGame}
            onAddBot={handleAddBot}
            onRemoveBot={handleRemoveBot}
            onKickPlayer={handleKickPlayer}
            onToggleTestMode={handleToggleTestMode}
            onOpenAdmin={() => setShowAdminModal(true)}
          />
        )}

        {/* 2. NIGHT PHASE: Mandatory 4x4 Memory Minigame for Bluffing Concealment */}
        {roomState.phase === 'NIGHT' && (() => {
          const humanHasThisRole = players.some((p) => !p.isBot && p.initialRole === roomState.currentStep);
          const botHasThisRole = players.some((p) => p.isBot && p.initialRole === roomState.currentStep);
          const currentStepDuration = humanHasThisRole
            ? 12
            : botHasThisRole
            ? 2
            : roomState.fastMode
            ? 0.8
            : 3.5;
          const remainingSec = Math.max(0, currentStepDuration - (currentTime - roomState.stepStartedAt) / 1000);
          const progressPercent = Math.min(100, Math.max(0, (1 - remainingSec / currentStepDuration) * 100));

          return (
            <div className="w-full flex-1 flex flex-col items-center relative">
              {/* Night Step Live Status & Progress Bar (Role name hidden to protect bluffing) */}
              <div className="w-full bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-3 mb-2.5 shadow-lg backdrop-blur-md">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Moon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>고요한 정적 속에서 밤이 흐르고 있습니다...</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                    {roomState.testMode ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 flex items-center gap-1">
                        <FlaskConical className="w-3 h-3 text-purple-400" />
                        <span>타이머 정지 (테스트 모드)</span>
                      </span>
                    ) : (
                      <>
                        {roomState.fastMode && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-0.5">
                            <Zap className="w-3 h-3" /> 빠른 모드
                          </span>
                        )}
                        <span>{remainingSec.toFixed(1)}s</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all duration-100 ease-linear rounded-full ${
                      roomState.testMode
                        ? 'bg-purple-500 w-full'
                        : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500'
                    }`}
                    style={roomState.testMode ? undefined : { width: `${progressPercent}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-400 text-center">
                  {isMyNightTurn ? (
                    <span className="text-amber-300 font-bold animate-pulse">
                      당신의 차례입니다! 능력을 사용하세요.
                    </span>
                  ) : (
                    <span>
                      모두 눈을 감고 있습니다... 미니게임을 하며 <strong>포커페이스</strong>를 유지하세요!
                    </span>
                  )}
                </div>

                {/* Test Mode Manual Step Advancement Control */}
                {roomState.testMode && roomState.currentStep && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-purple-300 flex items-center gap-1">
                      <FlaskConical className="w-3 h-3 text-purple-400" />
                      탭 이동 검증 후 버튼으로 수동 진행
                    </span>
                    <button
                      onClick={() => {
                        playSound('click');
                        advanceNightStep(roomState.currentStep!);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
                    >
                      <span>다음 밤 단계 진행</span>
                      <span>⏩</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Memory Minigame & Modal Container */}
              <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                <MemoryMinigame />

                {/* 1. Game Start Secret Role Reveal Modal */}
                {roomState.phase === 'NIGHT' && myInitialRole && !hasConfirmedInitialRole && (
                  <RoleRevealModal
                    role={myInitialRole}
                    onClose={() => setHasConfirmedInitialRole(true)}
                  />
                )}

                {/* 2. If it's my turn, display the semi-transparent role action modal (only after role is confirmed) */}
                {isMyNightTurn && roomState.currentStep && myInitialRole && hasConfirmedInitialRole && (
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
            </div>
          );
        })()}

        {/* 3. DAY DISCUSSION VIEW */}
        {roomState.phase === 'DAY_DISCUSSION' && (
          <DiscussionView
            isHost={isHost}
            myInitialRole={myInitialRole}
            players={players}
            timerStartedAt={roomState.timerStartedAt || roomState.stepStartedAt}
            durationSeconds={300}
            testMode={roomState.testMode}
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

      {/* In-Game Admin Modal */}
      <AdminModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        isAdmin={isAdmin}
        setIsAdmin={setIsAdmin}
        rooms={adminRooms}
        onRoomsUpdated={async () => {
          try {
            const list = await webdav.listRooms();
            setAdminRooms(
              list.map((r) => ({
                id: r.name,
                name: r.name.replace(/^room_/, '방 '),
                playerCount: r.playerCount ?? 0,
                phase: (r.phase as any) || 'WAITING',
                hostId: r.hostId || '',
              }))
            );
          } catch {
            // ignore
          }
        }}
      />
    </div>
  );
}
