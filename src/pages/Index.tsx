import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";

// ==== CONFIG =====
const BASE_URL = "https://tictactoe.nik-server.in";
const WS_BASE = "wss://tictactoe.nik-server.in";

// ==== HELPERS =====
function getPlayerId() {
  let id = localStorage.getItem("player_id");
  if (!id) {
    if (window.crypto?.randomUUID) id = window.crypto.randomUUID();
    else id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("player_id", id);
  }
  return id;
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// Gaming Cell Component with Enhanced Visuals
function Cell({ value, onClick, disabled, isWinning = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "game-cell",
        value === "X" && "x-cell",
        value === "O" && "o-cell",
        isWinning && "game-winner",
        disabled && "opacity-60"
      )}
    >
      {value}
    </button>
  );
}

// Enhanced Game Board with Visual Effects
function Board({ board, onMove, canPlay, winningLine = [] }) {
  return (
    <div className="grid grid-cols-3 gap-2 p-4 rounded-3xl glass-card">
      {board.map((v, i) => (
        <Cell
          key={i}
          value={v}
          disabled={!canPlay || v}
          onClick={() => onMove(i)}
          isWinning={winningLine.includes(i)}
        />
      ))}
    </div>
  );
}

// Enhanced Status Pill with Gaming Style
function StatusPill({ children, variant = "default" }) {
  return (
    <span className={classNames("status-pill", variant)}>
      {children}
    </span>
  );
}

// Animated Logo Component
function GameLogo() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-6xl md:text-8xl font-black mb-4 pulse-glow">
        <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
          TIC TAC TOE
        </span>
      </h1>
      <p className="text-xl text-foreground/70 font-medium">Epic Real-Time Battles</p>
    </div>
  );
}

const Index = () => {
  const playerId = useMemo(getPlayerId, []);

  // Routing-ish state
  const [view, setView] = useState("home");

  // Room / player state
  const [roomCode, setRoomCode] = useState("");
  const [hostId, setHostId] = useState(null);
  const [players, setPlayers] = useState([]);

  // Game state
  const [board, setBoard] = useState(Array(9).fill(""));
  const [xPlayer, setXPlayer] = useState(null);
  const [oPlayer, setOPlayer] = useState(null);
  const [turn, setTurn] = useState("X");
  const [finished, setFinished] = useState(false);
  const [winner, setWinner] = useState(null);
  const [history, setHistory] = useState([]);

  // WS state
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [retries, setRetries] = useState(0);
  const maxRetries = 5;

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const resetBoard = useCallback(() => {
    setBoard(Array(9).fill(""));
    setTurn("X");
    setFinished(false);
    setWinner(null);
  }, []);

  const closeWS = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
  }, []);

  const connectWS = useCallback((code) => {
    if (!code) return;
    setConnecting(true);

    const url = `${WS_BASE}/ws/tictactoe/${code}/?player_id=${encodeURIComponent(playerId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      setRetries(0);
      ws.send(JSON.stringify({ action: "resume_game", player_id: playerId }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.error) {
          alert(msg.error);
          return;
        }

        if (Array.isArray(msg.history)) {
          setHistory(msg.history);
          return;
        }
        if (msg.history === "No previous games") {
          setHistory([]);
          return;
        }

        switch (msg.type) {
          case "room_update":
            setPlayers(msg.players || []);
            setHostId(msg.host || null);
            break;
          case "game_started":
            setXPlayer(msg.x_player);
            setOPlayer(msg.o_player);
            setBoard(msg.board || Array(9).fill(""));
            setTurn(msg.turn || "X");
            setFinished(false);
            setWinner(null);
            setView("game");
            break;
          case "game_update":
            setBoard(msg.board || Array(9).fill(""));
            setFinished(!!msg.finished);
            setWinner(msg.winner ?? null);
            setXPlayer(msg.x_player ?? null);
            setOPlayer(msg.o_player ?? null);
            setTurn(msg.turn || "X");
            break;
          case "resume_game":
            setXPlayer(msg.x_player);
            setOPlayer(msg.o_player);
            setBoard(msg.board || Array(9).fill(""));
            setFinished(!!msg.finished);
            setWinner(msg.winner ?? null);
            setTurn(msg.turn || "X");
            setView("game");
            break;
          case "no_game_to_resume":
            break;
          default:
            break;
        }
      } catch (e) {
        console.error("WS parse error", e);
      }
    };

    ws.onclose = (evt) => {
      setConnected(false);
      setConnecting(false);
      if (retries < maxRetries && roomCode) {
        const next = retries + 1;
        setRetries(next);
        const delay = Math.min(1000 * Math.pow(2, next - 1), 10000);
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => connectWS(roomCode), delay);
      }
    };

    ws.onerror = () => {};
  }, [playerId, retries, roomCode]);

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimer.current);
      closeWS();
    };
  }, [closeWS]);

  // ----- REST: Create Room -----
  const createRoom = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/create-room/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json();
      setRoomCode(data.code);
      setHostId(data.host_id);
      setPlayers(data.players || []);
      setView("lobby");
      connectWS(data.code);
    } catch (e) {
      alert(e.message || "Create room failed");
    }
  };

  const [joinInput, setJoinInput] = useState("");
  const joinRoom = () => {
    if (!joinInput) return;
    setRoomCode(joinInput);
    setView("lobby");
    connectWS(joinInput);
  };

  const leaveRoom = () => {
    closeWS();
    setView("home");
    setRoomCode("");
    setPlayers([]);
    setHostId(null);
    resetBoard();
    setHistory([]);
  };

  const startGame = () => {
    if (!connected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ action: "start_game" }));
  };

  // NEW: Restart Game Function
  const restartGame = () => {
    if (!connected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ action: "start_game" }));
  };

  const makeMove = (index) => {
    if (!connected || !wsRef.current) return;
    if (finished || board[index]) return;
    const amX = playerId === xPlayer;
    const amO = playerId === oPlayer;
    if ((turn === "X" && !amX) || (turn === "O" && !amO)) return;

    wsRef.current.send(
      JSON.stringify({ action: "make_move", player_id: playerId, index })
    );
  };

  const iAmHost = useMemo(() => hostId === playerId, [hostId, playerId]);
  const iAmX = useMemo(() => xPlayer === playerId, [xPlayer, playerId]);
  const iAmO = useMemo(() => oPlayer === playerId, [oPlayer, playerId]);
  const canPlay = useMemo(() => {
    if (finished) return false;
    if (!xPlayer || !oPlayer) return false;
    if (turn === "X") return iAmX;
    return iAmO;
  }, [finished, xPlayer, oPlayer, turn, iAmX, iAmO]);

  const requestHistory = () => {
    if (!connected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ action: "request_history" }));
  };

  // Get connection status for styling
  const connectionStatus = connecting ? "connecting" : connected ? "connected" : "disconnected";

  // ====== ENHANCED VIEWS ======
  const Home = (
    <div className="relative particles min-h-screen flex items-center justify-center">
      <div className="max-w-2xl mx-auto space-y-8 text-center">
        <GameLogo />
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass-card space-y-4">
            <h2 className="text-2xl font-bold text-white">Create Room</h2>
            <p className="text-foreground/70">Start a new epic battle</p>
            <button onClick={createRoom} className="btn-gaming w-full">
              ⚡ Create Battle Arena
            </button>
          </div>

          <div className="glass-card space-y-4">
            <h2 className="text-2xl font-bold text-white">Join Battle</h2>
            <p className="text-foreground/70">Enter the arena</p>
            <div className="space-y-3">
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.trim())}
                placeholder="Enter 6-digit code"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 backdrop-blur-xl"
              />
              <button onClick={joinRoom} className="btn-secondary w-full">
                🚀 Join Battle
              </button>
            </div>
          </div>
        </div>

        <div className="text-sm text-foreground/50">
          Player ID: <span className="font-mono text-cyan-400">{playerId}</span>
        </div>
      </div>
    </div>
  );

  const Lobby = (
    <div className="relative particles min-h-screen flex items-center justify-center">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black text-white">⚔️ Battle Lobby</h1>
          <button onClick={leaveRoom} className="text-red-400 hover:text-red-300 transition-colors">
            ← Exit Lobby
          </button>
        </div>

        <div className="glass-card space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-foreground/70 text-sm uppercase tracking-wider">Arena Code</div>
              <div className="text-4xl font-black text-transparent bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text">
                {roomCode}
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(roomCode)}
              className="btn-secondary"
            >
              📋 Copy Code
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatusPill>🏠 Host: {hostId || "Waiting..."}</StatusPill>
            <StatusPill>👥 Players: {players.join(", ") || "Searching..."}</StatusPill>
            <StatusPill variant={connectionStatus}>
              {connected ? "🟢 Connected" : connecting ? "🟡 Connecting..." : "🔴 Disconnected"}
            </StatusPill>
            {retries > 0 && <StatusPill>🔄 Retry {retries}/{maxRetries}</StatusPill>}
          </div>

          <div className="border-t border-white/20 pt-6">
            <button
              onClick={startGame}
              disabled={!iAmHost || players.length < 2 || !connected}
              className={classNames(
                iAmHost && players.length >= 2 && connected
                  ? "btn-gaming"
                  : "btn-gaming opacity-50 cursor-not-allowed"
              )}
            >
              {iAmHost ? "🎮 Start Epic Battle!" : "Waiting for host..."}
            </button>
          </div>
        </div>

        <div className="text-center text-sm text-foreground/50">
          You are <span className="font-mono text-cyan-400">{playerId}</span>
        </div>
      </div>
    </div>
  );

  const Game = (
    <div className="relative particles min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl md:text-4xl font-black text-white">⚔️ Battle Arena</h1>
            <div className="flex items-center gap-2 glass-card px-3 py-1">
              <span className="text-foreground/70">#</span>
              <span className="font-mono text-cyan-400">{roomCode}</span>
              <button 
                onClick={() => copyToClipboard(roomCode)}
                className="text-foreground/50 hover:text-foreground transition-colors p-1"
                title="Copy room code"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setView("lobby")} className="text-cyan-400 hover:text-cyan-300 transition-colors">
              ← Lobby
            </button>
            <button onClick={leaveRoom} className="text-red-400 hover:text-red-300 transition-colors">
              Exit
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Game Board Section */}
          <div className="lg:col-span-2 glass-card space-y-6">
            <div className="text-center">
              <div className="text-lg font-bold text-white mb-3">
                {turn === "X" 
                  ? (xPlayer === playerId ? "Your turn" : "Opponent's turn")
                  : (oPlayer === playerId ? "Your turn" : "Opponent's turn")
                }
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <StatusPill>❌ {xPlayer === playerId ? "You" : (xPlayer ? "Opponent" : "Waiting...")}</StatusPill>
                <StatusPill>⭕ {oPlayer === playerId ? "You" : (oPlayer ? "Opponent" : "Waiting...")}</StatusPill>
                <StatusPill variant={connectionStatus}>
                  {connected ? "🟢 Live" : connecting ? "🟡 Connecting..." : "🔴 Offline"}
                </StatusPill>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <Board board={board} onMove={makeMove} canPlay={canPlay} />
            </div>

            {finished && (
              <div className="text-center space-y-4">
                <div className="p-6 rounded-2xl glass-card game-winner">
                  <div className="text-3xl font-black mb-2">
                    {winner === "Draw" ? "🤝 Epic Draw!" : `🏆 ${winner} Conquers!`}
                  </div>
                  <div className="text-foreground/70">
                    {winner === "Draw" ? "Both warriors fought valiantly!" : `Victory belongs to ${winner}!`}
                  </div>
                </div>
                
                {/* Restart Game Button for Host */}
                {iAmHost && (
                  <button onClick={restartGame} className="btn-secondary">
                    🔄 Start New Battle
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={requestHistory} className="btn-secondary">
                📊 Battle History
              </button>
            </div>
          </div>

          {/* History Panel */}
          <div className="glass-card space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              📜 Battle Chronicles
            </h2>
            
            {/* Win/Loss Counter */}
            {history.length > 0 && (() => {
              let myWins = 0;
              let opponentWins = 0;
              let draws = 0;
              
              history.forEach(game => {
                if (game.winner === "Draw") {
                  draws++;
                } else if (
                  (game.x_player === playerId && game.winner === "X") ||
                  (game.o_player === playerId && game.winner === "O")
                ) {
                  myWins++;
                } else {
                  opponentWins++;
                }
              });
              
              return (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30">
                    <div className="text-2xl font-black text-emerald-400">{myWins}</div>
                    <div className="text-xs text-emerald-300">Your Wins</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-amber-500/20 border border-amber-400/30">
                    <div className="text-2xl font-black text-amber-400">{draws}</div>
                    <div className="text-xs text-amber-300">Draws</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-500/20 border border-red-400/30">
                    <div className="text-2xl font-black text-red-400">{opponentWins}</div>
                    <div className="text-xs text-red-300">Their Wins</div>
                  </div>
                </div>
              );
            })()}
            
            {history.length === 0 ? (
              <div className="text-center py-8 text-foreground/50">
                <div className="text-4xl mb-2">⚔️</div>
                <div>No battles fought yet</div>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-auto pr-2">
                {history.map((g, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-sm text-cyan-400 font-bold">Battle #{idx + 1}</div>
                    <div className="text-xs text-foreground/60 mb-2">
                      ❌ {g.x_player === playerId ? "You" : "Opponent"} vs ⭕ {g.o_player === playerId ? "You" : "Opponent"}
                    </div>
                    <div className="font-bold">
                      {g.winner === "Draw" ? "🤝 Draw" : `🏆 ${g.winner} Victory`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {view === "home" && Home}
      {view === "lobby" && Lobby}
      {view === "game" && Game}
    </div>
  );
};

export default Index;