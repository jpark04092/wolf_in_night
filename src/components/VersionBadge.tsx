import React, { useState, useEffect } from 'react';
import { Tag, Calendar, GitCommit, CheckCircle2, RefreshCw, X, Info } from 'lucide-react';
import { APP_VERSION, BUILD_TIME, COMMIT_HASH } from '../version';

interface VersionBadgeProps {
  compact?: boolean;
  className?: string;
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({ compact = false, className = '' }) => {
  const [showDetail, setShowDetail] = useState(false);
  const [serverVersion, setServerVersion] = useState<{
    version?: string;
    commit?: string;
    buildTime?: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Optional live fetch of /version.json to confirm cache consistency
  const checkServerVersion = async () => {
    setIsChecking(true);
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setServerVersion(data);
      }
    } catch {
      // ignore
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (showDetail) {
      checkServerVersion();
    }
  }, [showDetail]);

  if (compact) {
    return (
      <>
        <button
          onClick={() => setShowDetail(true)}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-800/90 hover:bg-slate-700/90 text-indigo-300 border border-slate-700 transition cursor-pointer active:scale-95 shadow-sm ${className}`}
          title={`버전: ${APP_VERSION} (${COMMIT_HASH}) / 빌드: ${BUILD_TIME}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{APP_VERSION}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">#{COMMIT_HASH}</span>
        </button>

        {showDetail && (
          <VersionModal
            onClose={() => setShowDetail(false)}
            serverVersion={serverVersion}
            isChecking={isChecking}
            onRecheck={checkServerVersion}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowDetail(true)}
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-200 transition active:scale-98 shadow-sm cursor-pointer ${className}`}
        title="버전 정보 및 배포 상태 확인"
      >
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-mono font-black tracking-tight text-white">
            {APP_VERSION}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {COMMIT_HASH}
          </span>
        </div>
        <div className="hidden sm:flex items-center text-[10px] text-indigo-300/70 border-l border-indigo-500/20 pl-2">
          <span>{BUILD_TIME}</span>
        </div>
        <Info className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white transition" />
      </button>

      {showDetail && (
        <VersionModal
          onClose={() => setShowDetail(false)}
          serverVersion={serverVersion}
          isChecking={isChecking}
          onRecheck={checkServerVersion}
        />
      )}
    </>
  );
};

interface VersionModalProps {
  onClose: () => void;
  serverVersion: {
    version?: string;
    commit?: string;
    buildTime?: string;
  } | null;
  isChecking: boolean;
  onRecheck: () => void;
}

const VersionModal: React.FC<VersionModalProps> = ({
  onClose,
  serverVersion,
  isChecking,
  onRecheck,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-5 shadow-2xl relative text-left">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">릴리즈 배포 버전 정보</h3>
              <p className="text-[11px] text-slate-400">현재 브라우저에 로드된 빌드 사양</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current In-Memory Version Info */}
        <div className="space-y-2.5 mb-4">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span>릴리즈 버전</span>
            </div>
            <span className="font-mono font-black text-xs text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-800/60">
              {APP_VERSION}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <GitCommit className="w-3.5 h-3.5 text-indigo-400" />
              <span>Git 커밋 해시</span>
            </div>
            <span className="font-mono font-bold text-xs text-indigo-300 bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-800/60">
              {COMMIT_HASH}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>빌드 일시</span>
            </div>
            <span className="font-mono text-[11px] text-slate-200">
              {BUILD_TIME}
            </span>
          </div>
        </div>

        {/* Server Sync Check Card */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-800/40 text-xs mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              서버 최신 배포본(version.json)
            </span>
            <button
              onClick={onRecheck}
              disabled={isChecking}
              className="p-1 rounded-lg hover:bg-indigo-900/60 text-indigo-300 transition"
              title="서버 파일 다시 확인"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {serverVersion ? (
            <p className="text-[11px] text-slate-300 font-mono">
              서버 기록: <span className="text-emerald-400">{serverVersion.version}</span> (
              {serverVersion.commit}) / {serverVersion.buildTime}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              {isChecking ? '서버 파일 확인 중...' : '로컬 빌드와 서버 상태가 일치합니다.'}
            </p>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
        >
          닫기
        </button>
      </div>
    </div>
  );
};
