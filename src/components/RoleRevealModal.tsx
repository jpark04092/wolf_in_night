import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Moon,
  Eye,
  Sparkles,
  Shuffle,
  Clock,
  User,
  Shield,
  Wine,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { RoleType } from '../types';
import { ROLES } from '../lib/roles';
import { playSound } from '../lib/audio';

interface RoleRevealModalProps {
  role: RoleType;
  onClose: () => void;
  durationSeconds?: number;
}

export const RoleRevealModal: React.FC<RoleRevealModalProps> = ({
  role,
  onClose,
  durationSeconds = 4.5,
}) => {
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const roleDef = ROLES[role];

  useEffect(() => {
    playSound('flip');
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, durationSeconds - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [durationSeconds, onClose]);

  const renderIcon = () => {
    const iconClass = 'w-14 h-14';
    switch (role) {
      case 'WEREWOLF':
        return <Moon className={`${iconClass} text-rose-400`} />;
      case 'SEER':
        return <Eye className={`${iconClass} text-blue-400`} />;
      case 'ROBBER':
        return <Sparkles className={`${iconClass} text-amber-400`} />;
      case 'TROUBLEMAKER':
        return <Shuffle className={`${iconClass} text-purple-400`} />;
      case 'INSOMNIAC':
        return <Clock className={`${iconClass} text-teal-400`} />;
      case 'MINION':
        return <Users className={`${iconClass} text-orange-400`} />;
      case 'TANNER':
        return <Shield className={`${iconClass} text-emerald-400`} />;
      case 'DRUNK':
        return <Wine className={`${iconClass} text-pink-400`} />;
      case 'VILLAGER':
      default:
        return <User className={`${iconClass} text-indigo-400`} />;
    }
  };

  const teamName =
    roleDef.team === 'WEREWOLF'
      ? '늑대인간 팀'
      : roleDef.team === 'TANNER'
      ? '무두장이 (단독 승리)'
      : '마을 사람 팀';

  const teamBg =
    roleDef.team === 'WEREWOLF'
      ? 'bg-rose-950/60 border-rose-600/60 text-rose-300'
      : roleDef.team === 'TANNER'
      ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
      : 'bg-indigo-950/60 border-indigo-600/60 text-indigo-300';

  const progressPercent = (timeLeft / durationSeconds) * 100;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg">
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-indigo-500/80 rounded-3xl p-6 shadow-2xl text-center flex flex-col items-center relative overflow-hidden"
        >
          {/* Top Progress Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mt-1 mb-1">
            SECRET ROLE CARD
          </span>
          <h2 className="text-xl font-black text-white mb-4">당신의 시작 직업</h2>

          {/* Role Card Visual */}
          <div
            className={`w-32 h-44 rounded-2xl bg-gradient-to-br ${roleDef.color} p-0.5 shadow-2xl flex flex-col items-center justify-center mb-4 border border-white/20`}
          >
            <div className="w-full h-full bg-slate-950/70 rounded-[14px] flex flex-col items-center justify-center p-3">
              <div className="mb-2">{renderIcon()}</div>
              <div className="text-lg font-black text-white tracking-wide">{roleDef.name}</div>
            </div>
          </div>

          {/* Team Badge */}
          <div className={`text-xs font-bold px-3 py-1 rounded-full border mb-3 ${teamBg}`}>
            {teamName}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-300 leading-relaxed mb-5 px-1 bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
            {roleDef.description}
          </p>

          {/* Confirmation Button */}
          <button
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 font-bold text-sm text-white shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>확인 완료 (눈 감기) · {timeLeft.toFixed(0)}s</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

