import React, { useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className="flex items-center gap-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 text-xs font-semibold hover:bg-amber-500/30 transition-all active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>앱 설치</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          id="pwa-ios-install-btn"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 text-xs font-medium hover:bg-slate-700 transition-all"
        >
          <Share2 className="w-3.5 h-3.5 text-amber-400" />
          <span>홈 화면 추가</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-amber-400" />
                  아이폰/아이패드 홈 화면에 추가
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <p>Safari 브라우저 하단 툴바의 <strong>공유(Share)</strong> 버튼을 탭합니다.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <p>메뉴를 내려 <strong>'홈 화면에 추가(Add to Home Screen)'</strong>를 누릅니다.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                    3
                  </span>
                  <p>전체 화면으로 쾌적하게 보드게임을 즐길 수 있습니다.</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
