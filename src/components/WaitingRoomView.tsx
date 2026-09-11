import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  QrCode,
  Copy,
  Check,
  Play,
  UserPlus,
  UserMinus,
  UserX,
  Sparkles,
  Shield,
  Layers,
  HelpCircle,
  Zap,
} from 'lucide-react';
import { PlayerInfo, RoleType } from '../types';
import { ROLES, generateDefaultDeck } from '../lib/roles';
import { playSound } from '../lib/audio';

interface WaitingRoomViewProps {
  roomId: string;
  myId: string;
  isHost: boolean;
  players: PlayerInfo[];
  onStartGame: (deck: RoleType[], fastMode?: boolean) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onKickPlayer?: (playerId: string) => void;
}

export const WaitingRoomView: React.FC<WaitingRoomViewProps> = ({
  roomId,
  myId,
  isHost,
  players,
  onStartGame,
  onAddBot,
  onRemoveBot,
  onKickPlayer,
}) => {
  const [fastMode, setFastMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Calculate join link
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const joinLink = `${currentUrl}/?room=${encodeURIComponent(roomId)}`;

  // Generate QR Code
  useEffect(() => {
    QRCode.toDataURL(joinLink, {
      width: 280,
      margin: 2,
      color: {
        dark: '#020617',
        light: '#f8fafc',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('QR code gen error:', err));
  }, [joinLink]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalCards = players.length + 3;
  const previewDeck = generateDefaultDeck(players.length);

  const canStart = players.length >= 3;

  return (
    <div className="w-full flex-1 flex flex-col items-center max-w-md mx-auto space-y-4">
      {/* Top Banner: Room Invite Bar */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-xl flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold">
            대기실 초대 코드
          </span>
          <div className="text-base font-black text-white flex items-center gap-2">
            <span>{roomId}</span>
            <span className="text-xs font-normal text-slate-400">
              ({players.length}명 참여 중)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              playSound('click');
              setShowQrModal(true);
            }}
            className="p-2.5 rounded-2xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 transition shadow-md flex items-center gap-1 text-xs font-semibold"
            title="QR 코드 열기"
          >
            <QrCode className="w-4 h-4" />
            <span>QR</span>
          </button>
          <button
            onClick={handleCopyLink}
            className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 shadow-md text-xs flex items-center gap-1"
            title="초대 링크 복사"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? '복사됨' : '링크'}</span>
          </button>
        </div>
      </div>

      {/* Center 3 Cards Preview (Face Down) */}
      <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            중앙 카드 3장 (비공개 덱)
          </span>
          <span className="text-[11px] text-slate-500">밤에 예언자/도둑/늑대가 확인/교환 가능</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[1, 2, 3].map((num) => (
            <div
              key={num}
              className="aspect-[3/4] rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border-2 border-indigo-900/50 flex flex-col items-center justify-center p-2 shadow-inner group relative overflow-hidden"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-900/40 border border-indigo-500/20 flex items-center justify-center mb-1">
                <HelpCircle className="w-4 h-4 text-indigo-400/80" />
              </div>
              <span className="text-[10px] font-mono text-indigo-300/80 font-bold">중앙 #{num}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Connected Players Grid */}
      <div className="w-full bg-slate-900/70 border border-slate-800 rounded-3xl p-4 shadow-xl flex-1 flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-sm text-slate-200">
              접속자 목록 ({players.length}명)
            </h3>
          </div>
          {isHost && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  playSound('click');
                  onAddBot();
                }}
                className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-indigo-500/30 flex items-center gap-1 transition"
                title="가상 테스트 봇 추가"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>봇 추가</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 overflow-y-auto max-h-56 pr-1">
          {players.map((p) => {
            const isMe = p.id === myId;
            const isOffline = p.isOnline === false;

            return (
              <div
                key={p.id}
                className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                  isMe
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md'
                    : isOffline
                    ? 'bg-slate-950/40 border-amber-900/40 opacity-75'
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        p.isBot
                          ? 'bg-purple-400'
                          : isOffline
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-emerald-400'
                      }`}
                      title={p.isBot ? '가상 봇' : isOffline ? '통신 끊김 (오프라인)' : '온라인 접속 중'}
                    />
                    <span className="font-bold text-sm text-slate-100 truncate">
                      {p.displayName}
                    </span>
                    {isMe && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300 font-bold">
                        나
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {p.isHost && (
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-0.5">
                        <Shield className="w-3 h-3" />
                        방장
                      </span>
                    )}
                    {p.isBot && (
                      <span className="text-[10px] text-purple-400 font-mono">가상 플레이어</span>
                    )}
                    {!p.isBot && isOffline && (
                      <span className="text-[10px] text-amber-400 font-medium">
                        오프라인
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-1.5">
                  {isHost && p.isBot && (
                    <button
                      onClick={() => onRemoveBot(p.id)}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
                      title="봇 제거"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isHost && !p.isBot && !isMe && (
                    <button
                      onClick={() => {
                        if (confirm(`'${p.displayName}' 플레이어를 대기실에서 내보내시겠습니까?`)) {
                          onKickPlayer?.(p.id);
                        }
                      }}
                      className={`p-1 rounded-lg transition ${
                        isOffline
                          ? 'text-amber-400 hover:text-rose-400 hover:bg-rose-950/40'
                          : 'text-slate-600 hover:text-rose-400 hover:bg-rose-950/40'
                      }`}
                      title={isOffline ? '오프라인 유저 내보내기' : '플레이어 내보내기'}
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {players.length < 3 && (
          <div className="mt-3 p-2.5 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300 flex items-center gap-2">
            <span>한밤의 늑대인간은 최소 3명이 필요합니다. (친구를 초대하거나 <strong>[봇 추가]</strong>를 눌러보세요!)</span>
          </div>
        )}
      </div>

      {/* Role Deck Distribution Info */}
      <div className="w-full bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3 text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between text-slate-300 font-semibold">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            이번 게임 덱 ({totalCards}장):
          </span>
          <span className="text-[11px] text-slate-500">플레이어 {players.length}장 + 중앙 3장</span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {previewDeck.map((role, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300"
            >
              {ROLES[role]?.name}
            </span>
          ))}
        </div>
      </div>

      {/* Host Option: Fast Mode Toggle */}
      {isHost && (
        <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-xl ${fastMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}`}>
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">빠른 진행 모드 (Fast Mode)</div>
              <div className="text-[10px] text-slate-400">
                {fastMode ? '플레이어 없는 직업을 0.8초만에 즉시 통과 (테스트용)' : '블러핑 은폐를 위해 3.5초 가상 턴 유지 (권장)'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setFastMode((v) => !v);
            }}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
              fastMode ? 'bg-amber-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                fastMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Host Start Game Button */}
      <div className="w-full pt-1">
        {isHost ? (
          <button
            id="start-game-btn"
            disabled={!canStart}
            onClick={() => {
              playSound('howl');
              onStartGame(previewDeck, fastMode);
            }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-base shadow-xl shadow-indigo-950/60 transition active:scale-98 flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>게임 시작 (밤 단계 돌입)</span>
          </button>
        ) : (
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>방장이 게임을 시작하기를 기다리는 중입니다...</span>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-400" />
                모바일 카메라로 스캔하여 참여
              </h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                닫기
              </button>
            </div>

            {qrDataUrl ? (
              <div className="p-3 bg-white rounded-2xl inline-block shadow-inner">
                <img src={qrDataUrl} alt="Room QR Code" className="w-56 h-56 mx-auto" />
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-slate-500">
                QR 생성 중...
              </div>
            )}

            <div className="text-xs text-slate-300 space-y-1">
              <p className="font-medium text-white">별도 앱 설치 불필요 (Zero Install)</p>
              <p className="text-slate-400">
                스마트폰 카메라로 위 QR 코드를 비추면 즉시 사파리/크롬 브라우저로 방에 입장합니다.
              </p>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
            >
              {copied ? '초대 링크 복사 완료!' : '초대 링크 복사'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
