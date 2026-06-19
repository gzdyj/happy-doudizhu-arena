import React from "react";
import { createRoot } from "react-dom/client";
import { Bot, Crown, Play, RotateCcw, Send, Shield, Wifi, WifiOff } from "lucide-react";
import { analyzeCards, describePattern, rankLabel, suitSymbol } from "../shared/rules";
import type { Card, GameView, ServerMessage } from "../shared/types";
import "./styles.css";

const seatNames = ["我方", "下家", "上家"];

function App() {
  const [name, setName] = React.useState(() => `玩家${Math.floor(Math.random() * 900 + 100)}`);
  const [roomId, setRoomId] = React.useState(() => new URLSearchParams(window.location.search).get("room") || "lobby");
  const [ws, setWs] = React.useState<WebSocket | null>(null);
  const socketRef = React.useRef<WebSocket | null>(null);
  const [state, setState] = React.useState<GameView | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const connected = ws?.readyState === WebSocket.OPEN;

  const connect = React.useCallback(() => {
    socketRef.current?.close();
    const socket = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", name, roomId })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "state" && message.state) {
        setState(message.state);
        setSelected([]);
        setError("");
      }
      if (message.type === "error") setError(message.message ?? "操作失败");
    });
    socket.addEventListener("close", () => setError("连接已断开"));
    socketRef.current = socket;
    setWs(socket);
  }, [name, roomId]);

  React.useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, []);

  const sendMessage = (payload: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  const selectedCards = state?.hand.filter((card) => selected.includes(card.id)) ?? [];
  const selectedPattern = analyzeCards(selectedCards);
  const me = state?.players.find((player) => player.id === state.selfId);
  const myTurn = state?.currentTurnId === state?.selfId;
  const mustBeat = state?.lastPlay && state.lastPlay.playerId !== state.selfId;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>欢乐斗地主</h1>
          <p>{state?.message ?? "连接房间中..."}</p>
        </div>
        <div className="join-panel">
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="昵称" />
          <input value={roomId} onChange={(event) => setRoomId(event.target.value)} aria-label="房间号" />
          <button className="icon-button" onClick={connect} title="重新连接">
            {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
          </button>
        </div>
      </section>

      <section className="table">
        <div className="score-strip">
          {state?.players.map((player) => (
            <div className="score-item" key={player.id}>
              <span>{player.name}</span>
              <strong>{player.score}</strong>
            </div>
          ))}
        </div>

        <div className="opponents">
          {state?.players
            .filter((player) => player.id !== state.selfId)
            .map((player) => (
              <article className={`player-panel ${state.currentTurnId === player.id ? "active" : ""}`} key={player.id}>
                <div className="player-title">
                  <span>{seatNames[player.seat] ?? "对手"}</span>
                  <strong>{player.name}</strong>
                  {player.isLandlord && <Crown size={17} />}
                  {player.isBot && <Bot size={17} />}
                </div>
                <div className="card-back-stack" style={{ "--count": player.handCount } as React.CSSProperties}>
                  <span>{player.handCount}</span>
                </div>
                <div className="player-flags">
                  <span>{player.online ? "在线" : "离线"}</span>
                  {player.isTrustee && <span>托管</span>}
                </div>
              </article>
            ))}
        </div>

        <div className="center-play">
          <div className="landlord-cards">
            {(state?.landlordCards.length ? state.landlordCards : [null, null, null]).map((card, index) =>
              card ? <CardView key={card.id} card={card} compact /> : <div className="mini-back" key={index} />
            )}
          </div>
          <div className="round-info">
            <span>底分 {state?.bidPoints || 0}</span>
            <span>倍数 x{state?.multiplier || 1}</span>
            <span>{state?.phase === "bidding" ? "叫地主" : state?.phase === "playing" ? "出牌中" : "待开局"}</span>
          </div>
          <div className="last-play">
            {state?.lastPlay ? (
              <>
                <strong>{state.lastPlay.playerName}</strong>
                <span>{describePattern(state.lastPlay.pattern)}</span>
                <div className="played-cards">
                  {state.lastPlay.cards.map((card) => (
                    <CardView key={card.id} card={card} compact />
                  ))}
                </div>
              </>
            ) : (
              <span>当前无压制牌</span>
            )}
          </div>
        </div>

        <div className={`self-panel ${myTurn ? "active" : ""}`}>
          <div className="self-meta">
            <div>
              <span>{me?.name}</span>
              <strong>{me?.isLandlord ? "地主" : "农民"}</strong>
            </div>
            <div className="pattern-pill">{selectedCards.length ? describePattern(selectedPattern) : "选择手牌"}</div>
          </div>
          <div className="hand">
            {state?.hand.map((card) => (
              <button
                className={`card-button ${selected.includes(card.id) ? "selected" : ""}`}
                key={card.id}
                onClick={() =>
                  setSelected((current) => (current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]))
                }
              >
                <CardView card={card} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="actions">
        {state?.phase === "waiting" || state?.phase === "roundOver" ? (
          <button className="primary" onClick={() => sendMessage({ type: "start" })}>
            <Play size={18} />
            开始一局
          </button>
        ) : null}
        {state?.phase === "bidding" && myTurn ? (
          <>
            <button onClick={() => sendMessage({ type: "bid", value: 0 })}>不叫</button>
            <button onClick={() => sendMessage({ type: "bid", value: Math.max(1, state.bidPoints || 1) })}>叫/抢</button>
            <button className="primary" onClick={() => sendMessage({ type: "bid", value: 3 })}>三分</button>
          </>
        ) : null}
        {state?.phase === "playing" ? (
          <>
            <button disabled={!myTurn || !mustBeat} onClick={() => sendMessage({ type: "pass" })}>
              <RotateCcw size={18} />
              过牌
            </button>
            <button
              className="primary"
              disabled={!myTurn || selected.length === 0}
              onClick={() => sendMessage({ type: "play", cardIds: selected })}
            >
              <Send size={18} />
              出牌
            </button>
          </>
        ) : null}
        <button onClick={() => sendMessage({ type: "trustee", enabled: !me?.isTrustee })}>
          <Shield size={18} />
          {me?.isTrustee ? "取消托管" : "托管"}
        </button>
      </section>

      <aside className="side-log">
        {error && <div className="toast">{error}</div>}
        <h2>牌局记录</h2>
        <div>
          {state?.logs.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </aside>
    </main>
  );
}

function CardView({ card, compact = false }: { card: Card; compact?: boolean }) {
  const red = card.suit === "heart" || card.suit === "diamond" || card.suit === "joker";
  return (
    <span className={`card-face ${compact ? "compact" : ""} ${red ? "red" : "black"}`}>
      <b>{rankLabel[card.rank]}</b>
      <i>{suitSymbol[card.suit]}</i>
    </span>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
