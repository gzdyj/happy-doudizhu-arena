import type { Card, CardPattern, Rank, Suit } from "./types.js";

const ranks: Rank[] = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const suits: Suit[] = ["spade", "heart", "club", "diamond"];

export const rankLabel: Record<Rank, string> = {
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
  "2": "2",
  SJ: "小王",
  BJ: "大王"
};

export const suitSymbol: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  club: "♣",
  diamond: "♦",
  joker: "★"
};

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of ranks) {
    for (const suit of suits) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, value: cardValue(rank) });
    }
  }
  deck.push({ id: "joker-SJ", suit: "joker", rank: "SJ", value: 16 });
  deck.push({ id: "joker-BJ", suit: "joker", rank: "BJ", value: 17 });
  return deck;
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
}

export function cardValue(rank: Rank): number {
  if (rank === "SJ") return 16;
  if (rank === "BJ") return 17;
  return ranks.indexOf(rank) + 3;
}

function countsByValue(cards: Card[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const card of cards) map.set(card.value, (map.get(card.value) ?? 0) + 1);
  return map;
}

function isConsecutive(values: number[]): boolean {
  if (values.length < 2) return true;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1) && sorted.at(-1)! < 15;
}

export function analyzeCards(cards: Card[]): CardPattern | null {
  if (cards.length === 0) return null;
  const sorted = sortCards(cards);
  const counts = countsByValue(sorted);
  const groups = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const values = groups.map(([value]) => value);
  const amount = sorted.length;

  if (amount === 1) return { kind: "single", mainValue: sorted[0].value, length: 1 };
  if (amount === 2 && values.includes(16) && values.includes(17)) return { kind: "rocket", mainValue: 17, length: 2 };
  if (amount === 2 && groups.length === 1) return { kind: "pair", mainValue: values[0], length: 2 };
  if (amount === 3 && groups.length === 1) return { kind: "triple", mainValue: values[0], length: 3 };
  if (amount === 4 && groups.length === 1) return { kind: "bomb", mainValue: values[0], length: 4 };

  const triples = groups.filter(([, count]) => count === 3).map(([value]) => value);
  const pairs = groups.filter(([, count]) => count === 2).map(([value]) => value);
  const fours = groups.filter(([, count]) => count === 4).map(([value]) => value);

  if (amount === 4 && triples.length === 1) return { kind: "triple_single", mainValue: triples[0], length: 4 };
  if (amount === 5 && triples.length === 1 && pairs.length === 1) {
    return { kind: "triple_pair", mainValue: triples[0], length: 5 };
  }
  if (amount >= 5 && groups.every(([, count]) => count === 1) && isConsecutive(values)) {
    return { kind: "straight", mainValue: Math.max(...values), length: amount };
  }
  if (amount >= 6 && amount % 2 === 0 && groups.every(([, count]) => count === 2) && isConsecutive(values)) {
    return { kind: "double_straight", mainValue: Math.max(...values), length: amount };
  }
  if (amount >= 6 && amount % 3 === 0 && groups.every(([, count]) => count === 3) && isConsecutive(values)) {
    return { kind: "plane", mainValue: Math.max(...values), length: amount, triples: values.length };
  }

  const tripleRuns = findTripleRuns(triples);
  for (const run of tripleRuns) {
    if (run.length < 2) continue;
    if (amount === run.length * 4 && canUseAsPlaneWings(groups, run, 1)) {
      return { kind: "plane_singles", mainValue: Math.max(...run), length: amount, triples: run.length };
    }
    if (amount === run.length * 5 && canUseAsPlaneWings(groups, run, 2)) {
      return { kind: "plane_pairs", mainValue: Math.max(...run), length: amount, triples: run.length };
    }
  }

  if (amount === 6 && fours.length === 1) return { kind: "four_two_singles", mainValue: fours[0], length: 6 };
  if (amount === 8 && fours.length === 1 && pairs.length === 2) {
    return { kind: "four_two_pairs", mainValue: fours[0], length: 8 };
  }

  return null;
}

function findTripleRuns(values: number[]): number[][] {
  const sorted = values.filter((value) => value < 15).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (let start = 0; start < sorted.length; start += 1) {
    const run = [sorted[start]];
    for (let index = start + 1; index < sorted.length; index += 1) {
      if (sorted[index] !== run.at(-1)! + 1) break;
      run.push(sorted[index]);
      runs.push([...run]);
    }
  }
  return runs.sort((a, b) => b.length - a.length || b.at(-1)! - a.at(-1)!);
}

function canUseAsPlaneWings(groups: [number, number][], run: number[], wingSize: 1 | 2): boolean {
  const wings = groups.filter(([value]) => !run.includes(value));
  if (wingSize === 1) return wings.reduce((sum, [, count]) => sum + count, 0) === run.length;
  return wings.length === run.length && wings.every(([, count]) => count === 2);
}

export function canBeat(candidate: CardPattern, target: CardPattern | null): boolean {
  if (!target) return true;
  if (candidate.kind === "rocket") return target.kind !== "rocket";
  if (candidate.kind === "bomb" && target.kind !== "bomb" && target.kind !== "rocket") return true;
  return candidate.kind === target.kind && candidate.length === target.length && candidate.mainValue > target.mainValue;
}

export function playable(cards: Card[], target: CardPattern | null): boolean {
  const pattern = analyzeCards(cards);
  return Boolean(pattern && canBeat(pattern, target));
}

export function findPlayableHand(hand: Card[], target: CardPattern | null): Card[] {
  const sorted = sortCards(hand);
  if (!target) return [sorted[0]];
  const combinations = generateCombinations(sorted, target.length);
  const match = combinations.find((cards) => playable(cards, target));
  if (match) return match;
  const bomb = findBomb(sorted, target);
  return bomb ?? [];
}

function findBomb(hand: Card[], target: CardPattern): Card[] | null {
  const groups = [...countsByValue(hand).entries()].sort((a, b) => a[0] - b[0]);
  const rocket = hand.filter((card) => card.value >= 16);
  for (const [value, count] of groups) {
    if (count === 4 && (target.kind !== "bomb" || value > target.mainValue)) {
      return hand.filter((card) => card.value === value);
    }
  }
  return rocket.length === 2 && target.kind !== "rocket" ? rocket : null;
}

function generateCombinations(cards: Card[], size: number): Card[][] {
  const result: Card[][] = [];
  const walk = (start: number, combo: Card[]) => {
    if (result.length > 600) return;
    if (combo.length === size) {
      result.push(combo);
      return;
    }
    for (let index = start; index < cards.length; index += 1) {
      combo.push(cards[index]);
      walk(index + 1, combo);
      combo.pop();
    }
  };
  walk(0, []);
  return result.sort((a, b) => (analyzeCards(a)?.mainValue ?? 99) - (analyzeCards(b)?.mainValue ?? 99));
}

export function describePattern(pattern: CardPattern | null): string {
  if (!pattern) return "无";
  const names: Record<CardPattern["kind"], string> = {
    single: "单牌",
    pair: "对子",
    triple: "三张",
    triple_single: "三带一",
    triple_pair: "三带二",
    straight: "顺子",
    double_straight: "连对",
    plane: "飞机",
    plane_singles: "飞机带单",
    plane_pairs: "飞机带对",
    four_two_singles: "四带二",
    four_two_pairs: "四带两对",
    bomb: "炸弹",
    rocket: "王炸"
  };
  return names[pattern.kind];
}
