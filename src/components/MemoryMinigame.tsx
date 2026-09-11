import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Moon,
  Eye,
  Sparkles,
  Shield,
  Flame,
  Wine,
  Ghost,
  Skull,
  HelpCircle,
  Trophy,
} from 'lucide-react';

interface MinigameCard {
  id: number;
  pairId: number;
  iconName: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const ICONS = [
  { name: 'moon', icon: Moon, label: '보름달', color: 'text-amber-300' },
  { name: 'eye', icon: Eye, label: '예언의 눈', color: 'text-blue-400' },
  { name: 'sparkle', icon: Sparkles, label: '은단검', color: 'text-yellow-400' },
  { name: 'shield', icon: Shield, label: '방패', color: 'text-emerald-400' },
  { name: 'flame', icon: Flame, label: '횃불', color: 'text-orange-400' },
  { name: 'potion', icon: Wine, label: '성수', color: 'text-purple-400' },
  { name: 'ghost', icon: Ghost, label: '망령', color: 'text-indigo-400' },
  { name: 'skull', icon: Skull, label: '해골', color: 'text-rose-400' },
];

function generateDeck(): MinigameCard[] {
  const cards: MinigameCard[] = [];
  let id = 0;
  // 8 pairs = 16 cards for a 4x4 grid
  ICONS.forEach((item, pairId) => {
    cards.push({
      id: id++,
      pairId,
      iconName: item.name,
      isFlipped: false,
      isMatched: false,
    });
    cards.push({
      id: id++,
      pairId,
      iconName: item.name,
      isFlipped: false,
      isMatched: false,
    });
  });

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export const MemoryMinigame: React.FC = () => {
  const [cards, setCards] = useState<MinigameCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [combos, setCombos] = useState(0);
  const [clears, setClears] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const initGame = useCallback(() => {
    setCards(generateDeck());
    setFlippedIndices([]);
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const handleCardClick = (index: number) => {
    if (isProcessing) return;
    const card = cards[index];
    if (card.isFlipped || card.isMatched) return;
    if (flippedIndices.length >= 2) return;

    const nextCards = [...cards];
    nextCards[index] = { ...card, isFlipped: true };
    setCards(nextCards);

    const nextFlipped = [...flippedIndices, index];
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      const [firstIdx, secondIdx] = nextFlipped;
      const firstCard = nextCards[firstIdx];
      const secondCard = nextCards[secondIdx];

      if (firstCard.pairId === secondCard.pairId) {
        // MATCH!
        setIsProcessing(true);
        setTimeout(() => {
          setCards((prev) => {
            const updated = [...prev];
            updated[firstIdx] = { ...updated[firstIdx], isMatched: true };
            updated[secondIdx] = { ...updated[secondIdx], isMatched: true };

            // Check if all matched
            const allMatched = updated.every((c) => c.isMatched);
            if (allMatched) {
              setClears((c) => c + 1);
              setTimeout(() => {
                initGame();
              }, 400);
            }
            return updated;
          });
          setScore((s) => s + 100 + combos * 20);
          setCombos((c) => c + 1);
          setFlippedIndices([]);
          setIsProcessing(false);
        }, 300);
      } else {
        // NO MATCH
        setIsProcessing(true);
        setTimeout(() => {
          setCards((prev) => {
            const updated = [...prev];
            updated[firstIdx] = { ...updated[firstIdx], isFlipped: false };
            updated[secondIdx] = { ...updated[secondIdx], isFlipped: false };
            return updated;
          });
          setCombos(0);
          setFlippedIndices([]);
          setIsProcessing(false);
        }, 700);
      }
    }
  };

  const getIconComponent = (iconName: string) => {
    const item = ICONS.find((i) => i.name === iconName);
    if (!item) return <HelpCircle className="w-6 h-6 text-slate-400" />;
    const IconComp = item.icon;
    return <IconComp className={`w-7 h-7 ${item.color}`} />;
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center select-none">
      {/* Minigame status & disguise banner */}
      <div className="w-full flex items-center justify-between mb-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-medium text-slate-300">손동작 은폐 미니게임</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-semibold flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            {score}점
          </span>
          {clears > 0 && (
            <span className="text-purple-400 font-bold bg-purple-950/60 border border-purple-800/40 px-2 py-0.5 rounded-full">
              {clears}판 완주
            </span>
          )}
        </div>
      </div>

      {/* 4x4 Grid */}
      <div className="grid grid-cols-4 gap-2.5 w-full aspect-square p-2 bg-slate-900/60 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md">
        {cards.map((card, idx) => {
          return (
            <button
              key={card.id}
              onClick={() => handleCardClick(idx)}
              disabled={card.isMatched || isProcessing}
              className={`relative rounded-xl flex items-center justify-center transition-all duration-200 aspect-square ${
                card.isMatched
                  ? 'bg-slate-900/40 border border-emerald-500/40 shadow-inner opacity-70'
                  : card.isFlipped
                  ? 'bg-slate-800 border-2 border-indigo-500/80 shadow-lg scale-95'
                  : 'bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700/80 hover:border-slate-600 active:scale-95 shadow-md'
              }`}
            >
              {card.isFlipped || card.isMatched ? (
                <motion.div
                  initial={{ scale: 0.5, rotateY: 90 }}
                  animate={{ scale: 1, rotateY: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {getIconComponent(card.iconName)}
                </motion.div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-700/40 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 text-center mt-2.5 px-2">
        🔒 밤 동안 전원 계속 카드를 뒤집어 손동작과 시선을 자연스럽게 감춥니다.
      </p>
    </div>
  );
};
