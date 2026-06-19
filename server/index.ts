import http from "node:http";
import { randomUUID } from "node:crypto";
import type { RawData } from "ws";
import { WebSocketServer, WebSocket } from "ws";
import { analyzeCards, buildDeck, canBeat, describePattern, findPlayableHand, shuffle, sortCards } from "../shared/rules.js";
import type { BidRecord, Card, ClientMessage, GameView, LastPlay, Phase, PublicPlayer, ServerMessage } from "../shared/types.js";

interface Player {
  id: string;
  name: string;
  seat: number;
  score: number;
  hand: Card[];
  isBot: boolean;
  isTrustee: boolean;
  online: boolean;
  ws?: WebSocket;
}

interface Room {
  id: string;
  phase: Phase;
  players: Player[];
  landlordCards: Card[];
  landlordId: string | null;
  currentTurnId: string | null;
  dealerSeat: number;
  bidStarterSeat: number;
  bidRound: number;
  bidPoints: number;
  highestBidderId: string | null;
  robAvailable: boolean;
  multiplier: number;
  lastPlay: LastPlay | null;
  passCount: number;
  bids: BidRecord[];
  logs: string[];
  winnerIds: string[];
  timer?: NodeJS.Timeout;
}

const PORT = Number(process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
const sockets = new Map<WebSocket, { roomId: string; playerId: string }>();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "happy-doudizhu-ws" }));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(rawToString(raw)) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "消息格式不正确" });
      return;
    }
    handleMessage(ws, message);
  });
  ws.on("close", () => {
    const meta = sockets.get(ws);
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    const player = room?.players.find((item) => item.id === meta.playerId);
    if (player) {
      player.online = false;
      player.ws = undefined;
      player.isTrustee = true;
      log(room!, `${player.name} 离线，已进入托管`);
      scheduleBot(room!);
      broadcast(room!);
    }
    sockets.delete(ws);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`WebSocket server listening on http://127.0.0.1:${PORT}`);
});

function handleMessage(ws: WebSocket, message: ClientMessage): void {
  if (message.type === "join") {
    const room = getRoom(message.roomId || "lobby");
    while (room.players.length < 3) room.players.push(createBot(room.players.length));
    const existing = room.players.find((player) => !player.online && !player.isBot && player.name === message.name);
    const openSeat = existing ?? room.players.find((player) => !player.online) ?? room.players.find((player) => player.isBot);
    if (!openSeat) {
      send(ws, { type: "error", message: "房间已满，请换一个房间号" });
      return;
    }
    const player = openSeat;
    if (!existing) {
      player.name = (message.name || "玩家").slice(0, 12);
      player.isTrustee = false;
      player.score = player.score ?? 0;
    }
    player.ws = ws;
    player.online = true;
    player.isBot = false;
    sockets.set(ws, { roomId: room.id, playerId: player.id });
    log(room, `${player.name} 进入房间`);
    broadcast(room);
    return;
  }

  const meta = sockets.get(ws);
  if (!meta) return send(ws, { type: "error", message: "请先加入房间" });
  const room = rooms.get(meta.roomId);
  const player = room?.players.find((item) => item.id === meta.playerId);
  if (!room || !player) return send(ws, { type: "error", message: "房间不存在" });

  if (message.type === "start") startRound(room);
  if (message.type === "bid") handleBid(room, player, Number(message.value ?? 0));
  if (message.type === "play") handlePlay(room, player, message.cardIds ?? []);
  if (message.type === "pass") handlePass(room, player);
  if (message.type === "trustee") {
    player.isTrustee = Boolean(message.enabled);
    log(room, `${player.name} ${player.isTrustee ? "开启" : "关闭"}托管`);
    if (player.isTrustee) scheduleBot(room);
    broadcast(room);
  }
}

function getRoom(id: string): Room {
  const existing = rooms.get(id);
  if (existing) return existing;
  const room: Room = {
    id,
    phase: "waiting",
    players: [],
    landlordCards: [],
    landlordId: null,
    currentTurnId: null,
    dealerSeat: 0,
    bidStarterSeat: 0,
    bidRound: 0,
    bidPoints: 0,
    highestBidderId: null,
    robAvailable: false,
    multiplier: 1,
    lastPlay: null,
    passCount: 0,
    bids: [],
    logs: ["房间已创建"],
    winnerIds: []
  };
  rooms.set(id, room);
  return room;
}

function createPlayer(name: string, seat: number): Player {
  return { id: randomUUID(), name: name.slice(0, 12), seat, score: 0, hand: [], isBot: false, isTrustee: false, online: true };
}

function createBot(seat: number): Player {
  return { id: randomUUID(), name: `电脑${seat + 1}`, seat, score: 0, hand: [], isBot: true, isTrustee: true, online: true };
}

function startRound(room: Room): void {
  clearTimer(room);
  while (room.players.length < 3) room.players.push(createBot(room.players.length));
  room.phase = "bidding";
  room.landlordId = null;
  room.landlordCards = [];
  room.bidPoints = 0;
  room.highestBidderId = null;
  room.robAvailable = false;
  room.multiplier = 1;
  room.lastPlay = null;
  room.passCount = 0;
  room.bids = [];
  room.winnerIds = [];
  room.bidRound = 0;
  const deck = shuffle(buildDeck());
  room.players.forEach((player, index) => {
    player.hand = sortCards(deck.slice(index * 17, index * 17 + 17));
    player.isTrustee = player.isBot ? true : player.isTrustee;
  });
  room.landlordCards = sortCards(deck.slice(51));
  room.dealerSeat = (room.dealerSeat + 1) % 3;
  room.bidStarterSeat = room.dealerSeat;
  room.currentTurnId = playerBySeat(room, room.bidStarterSeat).id;
  log(room, "新一局开始，进入叫地主");
  broadcast(room);
  scheduleBot(room);
}

function handleBid(room: Room, player: Player, value: number): void {
  if (room.phase !== "bidding" || room.currentTurnId !== player.id) return;
  const action = value > 0 ? (room.robAvailable ? "rob" : "bid") : "pass";
  if (value > 0) {
    room.bidPoints = Math.max(room.bidPoints, Math.min(3, value));
    room.highestBidderId = player.id;
    room.robAvailable = true;
    if (action === "rob") room.multiplier *= 2;
  }
  room.bids.push({ playerId: player.id, playerName: player.name, action, points: value });
  log(room, `${player.name}${action === "pass" ? "不叫/不抢" : action === "bid" ? `叫 ${value} 分` : "抢地主"}`);
  room.bidRound += 1;
  if (room.bidPoints === 3 || room.bidRound >= 3) {
    settleLandlord(room);
  } else {
    room.currentTurnId = nextPlayer(room, player.id).id;
  }
  broadcast(room);
  scheduleBot(room);
}

function settleLandlord(room: Room): void {
  const landlord = room.players.find((player) => player.id === room.highestBidderId) ?? playerBySeat(room, room.bidStarterSeat);
  room.landlordId = landlord.id;
  landlord.hand = sortCards([...landlord.hand, ...room.landlordCards]);
  room.bidPoints = Math.max(1, room.bidPoints);
  room.phase = "playing";
  room.currentTurnId = landlord.id;
  room.lastPlay = null;
  room.passCount = 0;
  log(room, `${landlord.name} 成为地主，底牌已加入手牌`);
}

function handlePlay(room: Room, player: Player, cardIds: string[]): void {
  if (room.phase !== "playing" || room.currentTurnId !== player.id) return;
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card));
  if (cards.length !== cardIds.length) return sendPlayer(player, "选择的牌不在手中");
  const pattern = analyzeCards(cards);
  const target = room.lastPlay && room.lastPlay.playerId !== player.id ? room.lastPlay.pattern : null;
  if (!pattern || !canBeat(pattern, target)) return sendPlayer(player, "牌型不合法或压不过上家");
  player.hand = player.hand.filter((card) => !cardIds.includes(card.id));
  room.lastPlay = { playerId: player.id, playerName: player.name, cards: sortCards(cards), pattern };
  room.passCount = 0;
  if (pattern.kind === "bomb" || pattern.kind === "rocket") room.multiplier *= 2;
  log(room, `${player.name} 打出 ${describePattern(pattern)} (${cards.map((card) => card.rank).join(" ")})`);
  if (player.hand.length === 0) return finishRound(room, player);
  room.currentTurnId = nextPlayer(room, player.id).id;
  broadcast(room);
  scheduleBot(room);
}

function handlePass(room: Room, player: Player): void {
  if (room.phase !== "playing" || room.currentTurnId !== player.id || !room.lastPlay || room.lastPlay.playerId === player.id) return;
  room.passCount += 1;
  log(room, `${player.name} 要不起`);
  if (room.passCount >= 2) {
    room.currentTurnId = room.lastPlay.playerId;
    room.lastPlay = null;
    room.passCount = 0;
  } else {
    room.currentTurnId = nextPlayer(room, player.id).id;
  }
  broadcast(room);
  scheduleBot(room);
}

function finishRound(room: Room, winner: Player): void {
  const landlordWon = winner.id === room.landlordId;
  const base = room.bidPoints * room.multiplier;
  room.phase = "roundOver";
  room.currentTurnId = null;
  room.winnerIds = landlordWon ? [winner.id] : room.players.filter((player) => player.id !== room.landlordId).map((player) => player.id);
  for (const player of room.players) {
    if (player.id === room.landlordId) player.score += landlordWon ? base * 2 : -base * 2;
    else player.score += landlordWon ? -base : base;
  }
  log(room, `${landlordWon ? "地主" : "农民"}获胜，本局倍数 ${room.multiplier}，底分 ${room.bidPoints}`);
  broadcast(room);
}

function scheduleBot(room: Room): void {
  clearTimer(room);
  const player = room.players.find((item) => item.id === room.currentTurnId);
  if (!player || (!player.isBot && !player.isTrustee)) return;
  room.timer = setTimeout(() => {
    if (room.phase === "bidding") {
      const value = botBidValue(room, player);
      handleBid(room, player, value);
    } else if (room.phase === "playing") {
      const target = room.lastPlay && room.lastPlay.playerId !== player.id ? room.lastPlay.pattern : null;
      const cards = findPlayableHand(player.hand, target);
      if (cards.length > 0) handlePlay(room, player, cards.map((card) => card.id));
      else handlePass(room, player);
    }
  }, player.isBot ? 900 : 1300);
}

function botBidValue(room: Room, player: Player): number {
  const power = player.hand.filter((card) => card.value >= 15).length + player.hand.filter((card) => card.value === 14).length * 0.4;
  if (!room.robAvailable) return power >= 3 ? 2 : power >= 2 ? 1 : 0;
  return power >= 3.5 && Math.random() > 0.35 ? room.bidPoints : 0;
}

function clearTimer(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
}

function nextPlayer(room: Room, playerId: string): Player {
  const seat = room.players.find((player) => player.id === playerId)?.seat ?? 0;
  return playerBySeat(room, (seat + 1) % 3);
}

function playerBySeat(room: Room, seat: number): Player {
  return room.players.find((player) => player.seat === seat)!;
}

function broadcast(room: Room): void {
  for (const player of room.players) {
    if (!player.ws || player.ws.readyState !== WebSocket.OPEN) continue;
    send(player.ws, { type: "state", state: viewFor(room, player) });
  }
}

function viewFor(room: Room, self: Player): GameView {
  return {
    roomId: room.id,
    selfId: self.id,
    phase: room.phase,
    players: room.players.map(toPublicPlayer.bind(null, room)),
    hand: sortCards(self.hand),
    landlordCards: room.phase === "bidding" ? [] : room.landlordCards,
    currentTurnId: room.currentTurnId,
    dealerSeat: room.dealerSeat,
    bidPoints: room.bidPoints,
    multiplier: room.multiplier,
    lastPlay: room.lastPlay,
    passCount: room.passCount,
    bids: room.bids,
    logs: room.logs.slice(-16),
    winnerIds: room.winnerIds,
    message: roomMessage(room, self)
  };
}

function toPublicPlayer(room: Room, player: Player): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    handCount: player.hand.length,
    score: player.score,
    isLandlord: player.id === room.landlordId,
    isBot: player.isBot,
    isTrustee: player.isTrustee,
    online: player.online
  };
}

function roomMessage(room: Room, self: Player): string {
  if (room.phase === "waiting") return "点击开始，电脑会自动补齐三人桌";
  if (room.phase === "bidding") return room.currentTurnId === self.id ? "轮到你叫地主/抢地主" : "等待其他玩家叫地主";
  if (room.phase === "playing") return room.currentTurnId === self.id ? "轮到你出牌" : "等待对手出牌";
  return "本局结束，可以开始下一局";
}

function sendPlayer(player: Player, message: string): void {
  if (player.ws?.readyState === WebSocket.OPEN) send(player.ws, { type: "error", message });
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function log(room: Room, entry: string): void {
  room.logs.push(entry);
}

function rawToString(raw: RawData): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return raw.toString("utf8");
}
