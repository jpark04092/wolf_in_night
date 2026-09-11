import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Moon,
  Users,
  Plus,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Shield,
  Smartphone,
  Lock,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { webdav, WebDAVResource } from '../lib/webdav';
import { RoomInfo } from '../types';
import { playSound } from '../lib/audio';
import { PWAInstallButton } from './PWAInstallButton';
import { VersionBadge } from './VersionBadge';
import { AdminModal } from './AdminModal';

interface LobbyViewProps {
  onJoinRoom: (roomId: string, displayName: string, isHost: boolean) => void;
  initialRoomId?: string;
}

export const LobbyView: React.FC<LobbyViewProps> = ({ onJoinRoom, initialRoomId = '' }) => {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId);
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('onw_nickname') || `플레이어_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [newRoomName, setNewRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('onw_is_admin') === 'true';
  });
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Fetch rooms list via fast listRooms API or PROPFIND fallback
  const fetchRooms = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const resources: WebDAVResource[] = await webdav.listRooms();

      const validRooms = resources.filter(
        (res) => res.isDir && res.name && res.name !== 'rooms' && !res.name.startsWith('.')
      );

      const roomPromises = validRooms.map(async (res): Promise<RoomInfo> => {
        const rId = res.name;

        // If listRooms already provided details
        if (res.playerCount !== undefined && res.phase !== undefined) {
          return {
            id: rId,
            name: rId.replace(/^room_/, '방 '),
            playerCount: res.playerCount,
            phase: (res.phase as any) || 'WAITING',
            hostId: res.hostId || '',
          };
        }

        // Fallback: query state.json and room files individually
        let phase = 'WAITING';
        let hostId = '';
        let playerCount = 0;

        try {
          const state = await webdav.get<{ phase: string; hostId: string }>(`/rooms/${encodeURIComponent(rId)}/state.json`);
          if (state) {
            phase = state.phase || 'WAITING';
            hostId = state.hostId || '';
          }
        } catch {
          // ignore
        }

        try {
          const roomFiles = await webdav.propfind(`/rooms/${encodeURIComponent(rId)}/`, '1');
          playerCount = roomFiles.filter(
            (f) => !f.isDir && f.name.startsWith('user_') && f.name.endsWith('.json')
          ).length;
        } catch {
          // ignore
        }

        return {
          id: rId,
          name: rId.replace(/^room_/, '방 '),
          playerCount,
          phase: phase as any,
          hostId,
        };
      });

      const roomList = await Promise.all(roomPromises);
      setRooms(roomList);
    } catch (err) {
      console.warn('[Lobby] Error fetching rooms:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []);

  // Initial load and periodic polling every 2 seconds
  useEffect(() => {
    fetchRooms();
    const interval = setInterval(() => {
      fetchRooms(true);
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  // If initialRoomId is provided in URL, auto-populate
  useEffect(() => {
    if (initialRoomId) {
      setRoomIdInput(initialRoomId);
    }
  }, [initialRoomId]);

  const handleSaveNickname = (name: string) => {
    setDisplayName(name);
    localStorage.setItem('onw_nickname', name);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = (newRoomName || `room_${Math.floor(100 + Math.random() * 900)}`)
      .trim()
      .replace(/\s+/g, '_');
    if (!cleanId) return;

    playSound('click');
    setIsLoading(true);
    try {
      // 0. Check if room already exists
      const existingState = await webdav.get<{ phase: string }>(`/rooms/${encodeURIComponent(cleanId)}/state.json`);
      if (existingState) {
        alert('이미 존재하는 방 코드입니다. 다른 방 이름을 사용해주세요.');
        return;
      }

      // 1. MKCOL /rooms/room_xxx
      await webdav.mkcol(`/rooms/${cleanId}`);
      // 2. MKCOL /rooms/room_xxx/votes
      await webdav.mkcol(`/rooms/${cleanId}/votes`);

      setShowCreateModal(false);
      onJoinRoom(cleanId, displayName, true);
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickJoin = (rId: string) => {
    playSound('click');
    onJoinRoom(rId, displayName, false);
  };

  // Direct room deletion from lobby by Admin
  const handleDeleteRoomDirect = async (targetRoomId: string) => {
    if (!isAdmin) return;
    if (!confirm(`[관리자] 방 [${targetRoomId}]을(를) 영구 삭제하시겠습니까?`)) {
      return;
    }
    playSound('click');
    setIsLoading(true);
    try {
      await webdav.delete(`/rooms/${targetRoomId}`);
      await fetchRooms();
    } catch (err) {
      alert('방 삭제 실패: ' + String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Top Brand Bar */}
      <header className="w-full max-w-md flex items-center justify-between py-3 border-b border-slate-800/80 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center shadow-lg shadow-indigo-900/30 shrink-0">
            <Moon className="w-5 h-5 text-amber-300 fill-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black tracking-tight text-base text-white">한밤의 늑대인간</h1>
              <VersionBadge compact />
            </div>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">WebDAV PWA Edition</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isAdmin ? (
            <button
              onClick={() => {
                playSound('click');
                setShowAdminModal(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 transition shadow-sm"
              title="관리자 패널 열기"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>관리자</span>
            </button>
          ) : (
            <button
              onClick={() => {
                playSound('click');
                setShowAdminModal(true);
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="관리자 모드 로그인"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}
          <PWAInstallButton />
        </div>
      </header>

      {/* Main Lobby Container */}
      <main className="w-full max-w-md flex-1 flex flex-col gap-5">
        {/* Profile Card */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-xl backdrop-blur-sm">
          <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            내 닉네임 (플레이어 ID)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              maxLength={12}
              onChange={(e) => handleSaveNickname(e.target.value)}
              placeholder="닉네임(ID)을 입력하세요"
              className="flex-1 bg-slate-950 border border-slate-700/80 focus:border-indigo-500 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-white outline-none transition"
            />
          </div>
        </section>

        {/* Action Button & Code Input */}
        <div className="flex flex-col gap-3">
          <button
            id="create-room-open-btn"
            onClick={() => {
              playSound('click');
              setShowCreateModal(true);
            }}
            className="w-full flex items-center justify-center gap-2.5 p-4 rounded-3xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold shadow-lg shadow-indigo-950/50 transition active:scale-98 border border-indigo-400/30"
          >
            <div className="w-8 h-8 rounded-2xl bg-white/10 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm">새로운 게임 방 만들기 (방장)</span>
          </button>

          {/* Direct Code Input */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-400 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              placeholder="방 코드 입력 (예: room_101)"
              className="flex-1 bg-slate-950 border border-slate-700/80 focus:border-indigo-500 rounded-2xl px-3 py-2 text-xs font-semibold text-white outline-none transition"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && roomIdInput.trim()) {
                  handleQuickJoin(roomIdInput.trim());
                }
              }}
            />
            <button
              onClick={() => {
                if (roomIdInput.trim()) {
                  handleQuickJoin(roomIdInput.trim());
                }
              }}
              disabled={!roomIdInput.trim()}
              className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs transition shrink-0 shadow-md"
            >
              입장
            </button>
          </div>
        </div>

        {/* Direct Code Input if user was invited or scanned QR */}
        {initialRoomId && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-950/60 to-indigo-950/60 border border-amber-500/50 text-amber-200 flex items-center justify-between shadow-lg">
            <div>
              <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 mb-0.5">
                <Sparkles className="w-3.5 h-3.5" />
                초대 링크 감지됨
              </div>
              <div className="text-xs text-slate-300">
                방 코드: <span className="font-mono font-bold text-white">{initialRoomId}</span>
              </div>
            </div>
            <button
              onClick={() => handleQuickJoin(initialRoomId)}
              className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-md flex items-center gap-1"
            >
              <span>입장하기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Room List Section */}
        <section className="flex-1 flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-3xl p-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              진행 중인 WebDAV 방 목록 ({rooms.length})
            </h2>
            <button
              onClick={() => {
                playSound('click');
                fetchRooms();
              }}
              disabled={isLoading}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-72 pr-1">
            {rooms.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-slate-500">
                <Shield className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs">개설된 방이 없습니다.</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  위의 <strong>[방 만들기]</strong> 버튼을 눌러 새 게임을 시작하세요!
                </p>
              </div>
            ) : (
              rooms.map((room) => {
                const isWaiting = room.phase === 'WAITING';
                return (
                  <div
                    key={room.id}
                    className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 transition flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                        <span>{room.name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isWaiting
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                          }`}
                        >
                          {isWaiting ? '대기 중' : '게임 진행 중'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-slate-500" />
                          {room.playerCount}명 접속
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">ID: {room.id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoomDirect(room.id);
                          }}
                          className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition shrink-0"
                          title="방 삭제 (관리자)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleQuickJoin(room.id)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-300 hover:text-white font-semibold text-xs flex items-center gap-1 transition"
                      >
                        <span>입장</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Feature Highlights / Manual */}
        <footer className="text-[11px] text-slate-500 space-y-1 text-center pb-2">
          <p>🔒 WebDAV 파일 기반 상태 머신 (DB 없는 Zero Backend 구조)</p>
          <p>🌙 밤 단계 4x4 메모리 게임으로 블러핑 완벽 은폐</p>
        </footer>
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-5 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              새로운 게임 방 생성
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              방을 생성하면 방장 권한이 부여되고 참가용 QR 코드가 제공됩니다.
            </p>

            <form onSubmit={handleCreateRoom} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  방 코드 / 이름
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="예: room_101 또는 werewolf_party"
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-2xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg"
                >
                  {isLoading ? '생성 중...' : '방 만들기'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Admin Panel Modal */}
      <AdminModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        isAdmin={isAdmin}
        setIsAdmin={setIsAdmin}
        rooms={rooms}
        onRoomsUpdated={fetchRooms}
      />
    </div>
  );
};
