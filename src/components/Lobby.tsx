"use client";

import React, { useState } from "react";
import { SKINS, SkinDefinition } from "@/game/config";
import { Play, Sparkles, Coins, Gamepad2, Shield } from "lucide-react";

interface LobbyProps {
  onStartGame: (nickname: string, skinId: string) => void;
  playerCoins: number;
}

export const Lobby: React.FC<LobbyProps> = ({ onStartGame, playerCoins }) => {
  const [nickname, setNickname] = useState("Snake_" + Math.floor(1000 + Math.random() * 9000));
  const [selectedSkin, setSelectedSkin] = useState("classic_green");
  const [error, setError] = useState<string | null>(null);

  const skinList = Object.values(SKINS);

  const handlePlay = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 16) {
      setError("Nickname must be between 2 and 16 characters");
      return;
    }
    setError(null);
    onStartGame(trimmed, selectedSkin);
  };

  const activeSkin: SkinDefinition = SKINS[selectedSkin] || SKINS.classic_green;

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-950 p-4 font-sans text-white">
      {/* Background Neon Glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-[120px]" />

      {/* Top Bar: Coin Balance */}
      <div className="absolute top-6 right-6 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 backdrop-blur-md">
        <Coins className="h-4 w-4 text-amber-400" />
        <span className="font-mono text-sm font-bold text-amber-400">{playerCoins}</span>
        <span className="text-xs text-slate-400">Coins</span>
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* Game Title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            v2.0 Battle Royale
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            SNAKE <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">.IO</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Eat, boost, eliminate others, and dominate the arena</p>
        </div>

        {/* Card */}
        <div className="w-full rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handlePlay} className="flex flex-col gap-5">
            {/* Nickname Field */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Player Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={16}
                placeholder="Enter nickname..."
                className="mt-1.5 w-full rounded-2xl border border-white/10 bg-slate-800/80 px-4 py-3 text-sm font-medium text-white placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
            </div>

            {/* Skin Selector */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Select Skin
                </label>
                <span className="text-xs font-medium text-emerald-400">{activeSkin.name}</span>
              </div>

              {/* Skin Preview Bubbles */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {skinList.map((skin) => {
                  const isSelected = skin.id === selectedSkin;
                  return (
                    <button
                      type="button"
                      key={skin.id}
                      onClick={() => setSelectedSkin(skin.id)}
                      className={`relative flex h-14 flex-1 flex-col items-center justify-center rounded-2xl border transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-slate-800 scale-105 shadow-lg shadow-emerald-500/20"
                          : "border-white/10 bg-slate-800/50 hover:border-white/20"
                      }`}
                    >
                      <div
                        className="h-6 w-6 rounded-full border border-black/30 shadow-inner"
                        style={{
                          background: `linear-gradient(135deg, ${skin.primaryColor}, ${skin.secondaryColor})`,
                        }}
                      />
                      <span className="mt-1 text-[10px] text-slate-400 truncate max-w-[60px]">
                        {skin.name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Play Button */}
            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-4 text-base font-black tracking-wide text-slate-950 shadow-xl shadow-emerald-500/25 transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Play className="h-5 w-5 fill-current" />
              PLAY NOW (BOT ARENA)
            </button>
          </form>

          {/* Controls Hint */}
          <div className="mt-6 border-t border-white/5 pt-4 text-center">
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Gamepad2 className="h-3.5 w-3.5 text-slate-300" /> Mouse / Touch to Steer
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3.5 w-3.5 text-slate-300" /> Space / Click to Boost
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
