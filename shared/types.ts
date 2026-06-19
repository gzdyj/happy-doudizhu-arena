export type Suit = "spade" | "heart" | "club" | "diamond" | "joker";
export type Rank =
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "2"
  | "SJ"
  | "BJ";

export type Phase = "waiting" | "bidding" | "playing" | "roundOver";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  handCount: number;
  score: number;
  isLandlord: boolean;
  isBot: boolean;
  isTrustee: boolean;
  online: boolean;
}

export interface LastPlay {
  playerId: string;
  playerName: string;
  cards: Card[];
  pattern: CardPattern;
}

export interface BidRecord {
  playerId: string;
  playerName: string;
  action: "pass" | "bid" | "rob";
  points: number;
}

export interface GameView {
  roomId: string;
  selfId: string;
  phase: Phase;
  players: PublicPlayer[];
  hand: Card[];
  landlordCards: Card[];
  currentTurnId: string | null;
  dealerSeat: number;
  bidPoints: number;
  multiplier: number;
  lastPlay: LastPlay | null;
  passCount: number;
  bids: BidRecord[];
  logs: string[];
  winnerIds: string[];
  message: string;
}

export interface ClientMessage {
  type: "join" | "start" | "bid" | "play" | "pass" | "trustee";
  name?: string;
  roomId?: string;
  value?: number;
  cardIds?: string[];
  enabled?: boolean;
}

export interface ServerMessage {
  type: "state" | "error";
  state?: GameView;
  message?: string;
}

export type PatternKind =
  | "single"
  | "pair"
  | "triple"
  | "triple_single"
  | "triple_pair"
  | "straight"
  | "double_straight"
  | "plane"
  | "plane_singles"
  | "plane_pairs"
  | "four_two_singles"
  | "four_two_pairs"
  | "bomb"
  | "rocket";

export interface CardPattern {
  kind: PatternKind;
  mainValue: number;
  length: number;
  triples?: number;
}
