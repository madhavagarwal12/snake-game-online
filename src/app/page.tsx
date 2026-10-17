"use client";

import React, { useState, useCallback } from "react";
import { Lobby } from "@/components/Lobby";
import { GameCanvas } from "@/components/GameCanvas";

export default function Home() {
  const [inGame, setInGame] = useState(false);
  const [playerName, setPlayerName] = useState("Snake");
  const [playerSkin, setPlayerSkin] = useState("classic_green");
  const [playerCoins, setPlayerCoins] = useState(0);

  const handleStartGame = useCallback((name: string, skinId: string) => {
    setPlayerName(name);
    setPlayerSkin(skinId);
    setInGame(true);
  }, []);

  const handleExitToLobby = useCallback(() => {
    setInGame(false);
  }, []);

  const handleUpdateCoins = useCallback((earned: number) => {
    setPlayerCoins((prev) => prev + earned);
  }, []);

  if (!inGame) {
    return <Lobby onStartGame={handleStartGame} playerCoins={playerCoins} />;
  }

  return (
    <GameCanvas
      playerName={playerName}
      playerSkin={playerSkin}
      onExitToLobby={handleExitToLobby}
      onUpdateCoins={handleUpdateCoins}
    />
  );
}
