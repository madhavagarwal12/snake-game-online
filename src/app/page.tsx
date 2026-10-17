"use client";

import React, { useState } from "react";
import { Lobby } from "@/components/Lobby";
import { GameCanvas } from "@/components/GameCanvas";

export default function Home() {
  const [inGame, setInGame] = useState(false);
  const [playerName, setPlayerName] = useState("Snake");
  const [playerSkin, setPlayerSkin] = useState("classic_green");
  const [playerCoins, setPlayerCoins] = useState(0);

  const handleStartGame = (name: string, skinId: string) => {
    setPlayerName(name);
    setPlayerSkin(skinId);
    setInGame(true);
  };

  const handleExitToLobby = () => {
    setInGame(false);
  };

  const handleUpdateCoins = (earned: number) => {
    setPlayerCoins((prev) => prev + earned);
  };

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
