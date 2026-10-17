"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine } from "@/game/engine";
import { GameRenderer } from "@/game/renderer";
import { HUD } from "./HUD";
import { GameOverModal } from "./GameOverModal";
import { LeaderboardEntry } from "@/game/types";

interface GameCanvasProps {
  playerName: string;
  playerSkin: string;
  onExitToLobby: () => void;
  onUpdateCoins: (coins: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  playerName,
  playerSkin,
  onExitToLobby,
  onUpdateCoins,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  // Input state
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isBoostingRef = useRef<boolean>(false);

  // UI state
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverStats, setGameOverStats] = useState({
    length: 0,
    kills: 0,
    coins: 0,
    survivedTime: 0,
    rank: 1,
  });

  const [score, setScore] = useState(150);
  const [length, setLength] = useState(15);
  const [kills, setKills] = useState(0);
  const [coins, setCoins] = useState(0);
  const [playerRank, setPlayerRank] = useState(1);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isBoosting, setIsBoosting] = useState(false);

  const startGame = useCallback(() => {
    setIsGameOver(false);
    if (!engineRef.current) {
      engineRef.current = new GameEngine();
    }
    const engine = engineRef.current;
    engine.reset(playerName, playerSkin);

    engine.onPlayerDeath = (stats) => {
      setGameOverStats(stats);
      setIsGameOver(true);
      onUpdateCoins(stats.coins);
    };

    engine.onLeaderboardUpdate = (lb, pRank) => {
      setLeaderboard(lb);
      setPlayerRank(pRank);
    };
  }, [playerName, playerSkin, onUpdateCoins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    rendererRef.current = new GameRenderer(canvas);
    startGame();

    // Resize handler
    const handleResize = () => {
      if (rendererRef.current && canvas) {
        rendererRef.current.resize(window.innerWidth, window.innerHeight);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    // Main Game Loop (Delta-time based)
    const animate = (time: number) => {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      const engine = engineRef.current;
      const renderer = rendererRef.current;

      if (engine && renderer && canvas) {
        // Calculate steering angle from player screen center to mouse/touch position
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const targetAngle = Math.atan2(
          mousePosRef.current.y - centerY,
          mousePosRef.current.x - centerX
        );

        engine.setPlayerInput(targetAngle, isBoostingRef.current);
        engine.update(dt);
        renderer.render(engine, window.innerWidth, window.innerHeight);

        // Update player HUD stats
        const player = engine.snakes.get(engine.playerSnakeId);
        if (player) {
          setLength(player.length);
          setScore(Math.floor(player.length * 10));
          setKills(player.kills);
          setCoins(player.coinsEarned);
          setIsBoosting(player.isBoosting);
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [startGame]);

  // Mouse / Pointer listeners
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      isBoostingRef.current = true;
    }
  };

  const handlePointerUp = () => {
    isBoostingRef.current = false;
  };

  // Keyboard controls (Space or Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isBoostingRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isBoostingRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="block h-full w-full cursor-crosshair touch-none"
      />

      <HUD
        score={score}
        length={length}
        kills={kills}
        coins={coins}
        playerRank={playerRank}
        leaderboard={leaderboard}
        isBoosting={isBoosting}
        onBoostStart={() => {
          isBoostingRef.current = true;
        }}
        onBoostEnd={() => {
          isBoostingRef.current = false;
        }}
      />

      {isGameOver && (
        <GameOverModal
          stats={gameOverStats}
          onPlayAgain={startGame}
          onLobby={onExitToLobby}
        />
      )}
    </div>
  );
};
