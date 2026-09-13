import { RoleDef, RoleType, NightStep } from '../types';

export const ROLES: Record<RoleType, RoleDef> = {
  WEREWOLF: {
    id: 'WEREWOLF',
    name: '늑대인간',
    team: 'WEREWOLF',
    description: '밤에 다른 늑대인간을 확인합니다. 만약 혼자라면 중앙 카드 1장을 훔쳐볼 수 있습니다.',
    nightInstruction: '눈을 뜨고 다른 늑대인간을 확인하세요. 홀로 남은 늑대라면 중앙 카드 1장을 확인하세요.',
    nightOrder: 1,
    deductionTip: '늑대들은 서로의 정체를 확인했습니다. (외톨이 늑대는 중앙 카드 1장을 확인)',
    color: 'from-red-600 to-rose-900',
    iconName: 'Moon',
  },
  MINION: {
    id: 'MINION',
    name: '하수인',
    team: 'WEREWOLF',
    description: '늑대인간이 누구인지 알지만, 늑대인간은 하수인이 누구인지 모릅니다. 늑대 팀이 승리해야 합니다.',
    nightInstruction: '누가 늑대인간인지 확인하세요.',
    nightOrder: 2,
    deductionTip: '늑대인간이 누구인지 알고 있으나, 늑대들은 하수인을 모릅니다.',
    color: 'from-orange-600 to-red-950',
    iconName: 'Flame',
  },
  SEER: {
    id: 'SEER',
    name: '예언자',
    team: 'VILLAGER',
    description: '다른 플레이어 1명의 카드를 보거나, 중앙 카드 중 2장을 볼 수 있습니다.',
    nightInstruction: '다른 플레이어 1명의 카드를 보거나, 중앙 카드 2장을 확인하세요.',
    nightOrder: 3,
    deductionTip: '교환이 발생하기 전 최초의 카드(플레이어 1명 또는 중앙 2장)를 확인했습니다.',
    color: 'from-blue-600 to-indigo-900',
    iconName: 'Eye',
  },
  ROBBER: {
    id: 'ROBBER',
    name: '강도',
    team: 'VILLAGER',
    description: '다른 플레이어 1명의 카드를 빼앗아 자신의 카드와 바꾸고, 새로 바뀐 카드를 확인합니다.',
    nightInstruction: '다른 플레이어 1명의 카드를 빼앗아 바꾸고 새 직업을 확인하세요.',
    nightOrder: 4,
    deductionTip: '다른 플레이어의 카드를 훔쳐오고 내 카드를 넘겼습니다. (1차 교환 발생)',
    color: 'from-amber-600 to-yellow-900',
    iconName: 'Sparkles',
  },
  TROUBLEMAKER: {
    id: 'TROUBLEMAKER',
    name: '말썽쟁이',
    team: 'VILLAGER',
    description: '자신을 제외한 다른 두 플레이어의 카드를 서로 맞바꿉니다. (카드는 보지 못합니다)',
    nightInstruction: '다른 플레이어 2명을 선택하여 카드를 서로 맞바꾸세요.',
    nightOrder: 5,
    deductionTip: '강도가 훔친 뒤, 다른 두 플레이어의 카드를 맞바꿨습니다. (2차 교환 발생)',
    color: 'from-purple-600 to-fuchsia-900',
    iconName: 'Shuffle',
  },
  DRUNK: {
    id: 'DRUNK',
    name: '주정뱅이',
    team: 'VILLAGER',
    description: '술에 취해 중앙 카드 1장과 자신의 카드를 보지 않고 바꿉니다.',
    nightInstruction: '중앙 카드 1장과 자신의 카드를 보지 않고 맞바꾸세요.',
    nightOrder: 6,
    deductionTip: '말썽쟁이 교환 직후 중앙 카드와 보지 않고 맞바꿨습니다. (본인도 현재 직업 모름)',
    color: 'from-violet-600 to-indigo-950',
    iconName: 'Wine',
  },
  INSOMNIAC: {
    id: 'INSOMNIAC',
    name: '불면증환자',
    team: 'VILLAGER',
    description: '밤이 끝나기 직전 잠에서 깨어 자신의 카드가 바뀌었는지 확인합니다.',
    nightInstruction: '눈을 떠서 자신의 카드가 다른 사람에 의해 바뀌었는지 확인하세요.',
    nightOrder: 7,
    deductionTip: '강도·말썽쟁이·주정뱅이의 모든 교환이 끝난 뒤 최종 자신의 카드를 확인했습니다.',
    color: 'from-teal-600 to-emerald-900',
    iconName: 'Clock',
  },
  VILLAGER: {
    id: 'VILLAGER',
    name: '마을주민',
    team: 'VILLAGER',
    description: '특수 능력이 없습니다. 낮 토론을 통해 늑대인간을 찾아내야 합니다.',
    nightInstruction: '밤 동안에는 아무것도 하지 않고 조용히 잠을 잡니다.',
    nightOrder: 0,
    deductionTip: '밤 동안 아무런 행동도 하지 않고 잠을 잤습니다.',
    color: 'from-slate-600 to-slate-800',
    iconName: 'Users',
  },
  TANNER: {
    id: 'TANNER',
    name: '무두장이',
    team: 'TANNER',
    description: '삶을 비관하여 오직 자신이 처형당해 죽는 것만이 승리 목표입니다.',
    nightInstruction: '밤에는 아무것도 하지 않습니다. 낮에 의심을 사서 죽으세요.',
    nightOrder: 0,
    deductionTip: '밤 동안 행동이 없으며, 낮 투표에서 자신이 처형당해야 단독 승리합니다.',
    color: 'from-zinc-600 to-stone-900',
    iconName: 'Skull',
  },
};

export const NIGHT_STEPS: NightStep[] = [
  'WEREWOLF',
  'SEER',
  'ROBBER',
  'TROUBLEMAKER',
  'INSOMNIAC',
];

export function getNextNightStep(current: NightStep | null): NightStep | null {
  if (!current) return NIGHT_STEPS[0];
  const idx = NIGHT_STEPS.indexOf(current);
  if (idx >= 0 && idx < NIGHT_STEPS.length - 1) {
    return NIGHT_STEPS[idx + 1];
  }
  return null; // Night finished!
}

// Default deterministic role pool based on player count (Always Players + 3 center cards)
// Unshuffled and sorted deterministically to guarantee stable layout and prevent UI jitter.
export function generateDefaultDeck(playerCount: number): RoleType[] {
  const totalCards = playerCount + 3;
  // Core classic setup:
  // 2 Werewolves, 1 Seer, 1 Robber, 1 Troublemaker
  const deck: RoleType[] = ['WEREWOLF', 'WEREWOLF', 'SEER', 'ROBBER', 'TROUBLEMAKER'];

  if (totalCards >= 6) {
    deck.push('INSOMNIAC');
  }
  if (totalCards >= 7) {
    deck.push('VILLAGER');
  }
  if (totalCards >= 8) {
    deck.push('VILLAGER');
  }
  if (totalCards >= 9) {
    deck.push('VILLAGER');
  }
  if (totalCards >= 10) {
    deck.push('TANNER');
  }
  if (totalCards >= 11) {
    deck.push('MINION');
  }
  if (totalCards >= 12) {
    deck.push('DRUNK');
  }

  // If still not enough, pad with villagers
  while (deck.length < totalCards) {
    deck.push('VILLAGER');
  }

  const result = deck.slice(0, totalCards);

  // Deterministic sort: nightOrder first, then role name
  result.sort((a, b) => {
    const orderA = ROLES[a]?.nightOrder || 99;
    const orderB = ROLES[b]?.nightOrder || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  return result;
}

// Fisher-Yates shuffle algorithm used when the game actually starts
export function shuffleDeck(deck: RoleType[]): RoleType[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
