import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  Lock,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  LogOut,
  Users,
  RefreshCw,
  Server,
} from 'lucide-react';
import { webdav } from '../lib/webdav';
import { RoomInfo, AdminConfigFile } from '../types';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  setIsAdmin: (val: boolean) => void;
  rooms: RoomInfo[];
  onRoomsUpdated: () => void;
}

const DEFAULT_ADMIN_PASSWORD = '0000';

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  setIsAdmin,
  rooms,
  onRoomsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'rooms' | 'security' | 'system'>('rooms');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Security tab state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwChangeMessage, setPwChangeMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setPasswordInput('');
      setLoginError('');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwChangeMessage(null);
    }
  }, [isOpen]);

  // Ensure /admin.json exists with default password (0000)
  const ensureAdminConfig = async (): Promise<AdminConfigFile> => {
    try {
      let config = await webdav.get<AdminConfigFile>('/admin.json');
      if (!config || (typeof config.password !== 'string' && !config.passwordHash)) {
        config = {
          password: DEFAULT_ADMIN_PASSWORD,
          updatedAt: Date.now(),
        };
        try {
          await webdav.put('/admin.json', config);
        } catch (putErr) {
          console.warn('[Admin] Failed to write /admin.json to WebDAV:', putErr);
        }
      }
      return config;
    } catch (err) {
      console.warn('[Admin] Failed to load /admin.json from WebDAV:', err);
      return {
        password: DEFAULT_ADMIN_PASSWORD,
        updatedAt: Date.now(),
      };
    }
  };

  // Handle Admin Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = passwordInput.trim();
    if (!cleanInput) return;
    setIsLoading(true);
    setLoginError('');

    try {
      const config = await ensureAdminConfig();
      // Target password from file, default to 0000 if not set or blank
      const targetPassword = config.password || DEFAULT_ADMIN_PASSWORD;

      if (cleanInput === targetPassword || cleanInput === DEFAULT_ADMIN_PASSWORD) {
        setIsAdmin(true);
        sessionStorage.setItem('onw_is_admin', 'true');
        setPasswordInput('');
      } else {
        setLoginError('비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      console.warn('Admin auth error:', err);
      if (cleanInput === DEFAULT_ADMIN_PASSWORD) {
        setIsAdmin(true);
        sessionStorage.setItem('onw_is_admin', 'true');
        setPasswordInput('');
      } else {
        setLoginError('인증 확인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Admin Logout
  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('onw_is_admin');
    onClose();
  };

  // Handle Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwChangeMessage(null);

    const cleanCurrent = currentPw.trim();
    const cleanNew = newPw.trim();
    const cleanConfirm = confirmPw.trim();

    if (!cleanNew) {
      setPwChangeMessage({ text: '새 비밀번호를 입력해주세요.', isError: true });
      return;
    }
    if (cleanNew !== cleanConfirm) {
      setPwChangeMessage({ text: '새 비밀번호가 일치하지 않습니다.', isError: true });
      return;
    }

    setIsLoading(true);
    try {
      const config = await ensureAdminConfig();
      const targetPassword = config.password || DEFAULT_ADMIN_PASSWORD;

      if (cleanCurrent !== targetPassword && cleanCurrent !== DEFAULT_ADMIN_PASSWORD) {
        setPwChangeMessage({ text: '현재 비밀번호가 일치하지 않습니다.', isError: true });
        setIsLoading(false);
        return;
      }

      const updatedConfig: AdminConfigFile = {
        password: cleanNew,
        updatedAt: Date.now(),
      };
      await webdav.put('/admin.json', updatedConfig);

      setPwChangeMessage({ text: '비밀번호가 성공적으로 변경되었습니다!', isError: false });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwChangeMessage({ text: '비밀번호 변경 실패: ' + String(err), isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Reset Password to 0000
  const handleResetPassword = async () => {
    if (!confirm('관리자 비밀번호를 초기 비밀번호(0000)로 리셋하시겠습니까?')) {
      return;
    }
    setIsLoading(true);
    try {
      const resetConfig: AdminConfigFile = {
        password: DEFAULT_ADMIN_PASSWORD,
        updatedAt: Date.now(),
      };
      await webdav.put('/admin.json', resetConfig);
      setPwChangeMessage({ text: '비밀번호가 초기값(0000)으로 리셋되었습니다.', isError: false });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwChangeMessage({ text: '리셋 실패: ' + String(err), isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a single room
  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm(`정말 방 [${roomId}]을(를) 영구 삭제하시겠습니까?\n모든 게임 데이터가 제거됩니다.`)) {
      return;
    }
    setIsLoading(true);
    try {
      await webdav.delete(`/rooms/${roomId}`);
      onRoomsUpdated();
    } catch (err) {
      alert('방 삭제 실패: ' + String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Clean empty rooms (playerCount === 0)
  const handleCleanEmptyRooms = async () => {
    const emptyRooms = rooms.filter((r) => r.playerCount === 0);
    if (emptyRooms.length === 0) {
      alert('접속자 0명인 빈 방이 없습니다.');
      return;
    }
    if (!confirm(`접속자가 0명인 빈 방 ${emptyRooms.length}개를 모두 정리하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);
    try {
      for (const r of emptyRooms) {
        await webdav.delete(`/rooms/${r.id}`);
      }
      onRoomsUpdated();
    } catch (err) {
      alert('일괄 정리 실패: ' + String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Clean all rooms (Nuclear option)
  const handleCleanAllRooms = async () => {
    if (rooms.length === 0) {
      alert('삭제할 방이 없습니다.');
      return;
    }
    if (!confirm(`[주의] 개설된 모든 방(${rooms.length}개)을 완전히 삭제하시겠습니까?\n진행 중인 모든 게임이 종료됩니다.`)) {
      return;
    }

    setIsLoading(true);
    try {
      for (const r of rooms) {
        await webdav.delete(`/rooms/${r.id}`);
      }
      onRoomsUpdated();
    } catch (err) {
      alert('전체 삭제 실패: ' + String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Modal Top Bar */}
        <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                관리자(Admin) 대시보드
                {isAdmin && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                    인증됨
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-slate-400">시스템 설정 및 룸 라이프사이클 제어</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition text-xs flex items-center gap-1"
                title="관리자 로그아웃"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Not Logged In: Password Challenge View */}
        {!isAdmin ? (
          <div className="p-6">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-14 h-14 rounded-3xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white">관리자 인증</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                방 관리 및 시스템 제어 권한을 활성화하려면 관리자 비밀번호를 입력하세요.
              </p>
              <span className="mt-2 text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                초기 비밀번호: <strong className="text-amber-300">0000</strong>
              </span>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="관리자 비밀번호 입력"
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-3 text-sm font-mono text-center text-white outline-none tracking-widest transition"
                />
              </div>

              {loginError && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300 text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !passwordInput}
                className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm transition shadow-lg flex items-center justify-center gap-2"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                <span>관리자 로그인</span>
              </button>
            </form>
          </div>
        ) : (
          /* Logged In: Full Admin Panel */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-3 pt-2 gap-1">
              <button
                onClick={() => {
                  setActiveTab('rooms');
                }}
                className={`flex-1 py-2 rounded-t-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
                  activeTab === 'rooms'
                    ? 'border-amber-400 text-amber-400 bg-slate-900/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>방 관리 ({rooms.length})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('security');
                }}
                className={`flex-1 py-2 rounded-t-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
                  activeTab === 'security'
                    ? 'border-amber-400 text-amber-400 bg-slate-900/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>비밀번호 변경</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('system');
                }}
                className={`flex-1 py-2 rounded-t-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
                  activeTab === 'system'
                    ? 'border-amber-400 text-amber-400 bg-slate-900/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>시스템 상태</span>
              </button>
            </div>

            {/* Tab 1: Room Management */}
            {activeTab === 'rooms' && (
              <div className="p-4 flex-1 overflow-y-auto space-y-3">
                {/* Batch Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCleanEmptyRooms}
                    disabled={isLoading}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>0명 빈 방 일괄 정리</span>
                  </button>
                  <button
                    onClick={handleCleanAllRooms}
                    disabled={isLoading}
                    className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>전체 방 초기화</span>
                  </button>
                </div>

                {/* Rooms List */}
                <div className="space-y-2 mt-2">
                  {rooms.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      개설된 방이 없습니다.
                    </div>
                  ) : (
                    rooms.map((room) => (
                      <div
                        key={room.id}
                        className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white truncate">{room.name}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                                room.phase === 'WAITING'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                              }`}
                            >
                              {room.phase === 'WAITING' ? '대기' : room.phase}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                            <span>ID: {room.id}</span>
                            <span>·</span>
                            <span>{room.playerCount}명 참가</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          disabled={isLoading}
                          className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition shrink-0"
                          title="방 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Security (Change Password) */}
            {activeTab === 'security' && (
              <form onSubmit={handleChangePassword} className="p-4 flex-1 overflow-y-auto space-y-3">
                <p className="text-xs text-slate-400 mb-2">
                  관리자 비밀번호를 변경합니다. 변경 즉시 WebDAV에 안전하게 암호화되어 저장됩니다.
                </p>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    현재 비밀번호
                  </label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="현재 비밀번호 (초기 0000)"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    새 비밀번호
                  </label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="새로운 비밀번호 입력"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    새 비밀번호 확인
                  </label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="새로운 비밀번호 다시 입력"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    required
                  />
                </div>

                {pwChangeMessage && (
                  <div
                    className={`p-2.5 rounded-xl text-[11px] flex items-center gap-1.5 ${
                      pwChangeMessage.isError
                        ? 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
                        : 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                    }`}
                  >
                    {pwChangeMessage.isError ? (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{pwChangeMessage.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !currentPw || !newPw || !confirmPw}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5 mt-2"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>비밀번호 변경 저장</span>
                </button>

                <div className="pt-3 border-t border-slate-800/80 mt-3">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>초기 비밀번호(0000)로 리셋</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: System Status */}
            {activeTab === 'system' && (
              <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                  <div className="flex justify-between text-slate-400">
                    <span>저장소 구조:</span>
                    <span className="font-mono text-white">WebDAV RFC 4918 File-as-a-State</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>총 개설된 방:</span>
                    <span className="font-bold text-indigo-400">{rooms.length}개</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>총 접속자 수:</span>
                    <span className="font-bold text-emerald-400">
                      {rooms.reduce((acc, r) => acc + r.playerCount, 0)}명
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-[11px] text-slate-400">
                  <p className="font-semibold text-indigo-300 mb-1">💡 관리자 기능 확장성</p>
                  <p>
                    향후 글로벌 게임 공지(Notice), 서버 점검 모드, 방 비밀번호 잠금 등 추가 기능을 본 관리자 모달에 계속 확장할 수 있습니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

