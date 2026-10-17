"use client";

import React from "react";
import { LeaderboardEntry } from "@/game/types";
import { Trophy, Coins, Flame, Skull } from "lucide-react";

interface HUDProps {
  score: number;
  length: number;
  kills: number;
  coins: number;
  playerRank: number;
  leaderboard: LeaderboardEntry[];
  isBoosting: boolean;
  onBoostStart: () => void;
  onBoostEnd: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  score,
  length,
  kills,
  coins,
  playerRank,
  leaderboard,
  isBoosting,
  onBoostStart,
  onBoostEnd,
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden font-sans">
      {/* Top Left: Player Stats */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Length</span>
            <span className="text-lg font-bold">{Math.floor(length)}</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1.5 text-rose-400">
            <Skull className="h-4 w-4" />
            <span className="text-lg font-bold">{kills}</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1.5 text-amber-400">
            <Coins className="h-4 w-4" />
            <span className="text-lg font-bold">{coins}</span>
          </div>
        </div>

        {/* Rank indicator badge */}
        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-slate-900/60 px-3 py-1.5 backdrop-blur-sm">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-slate-300">
            Your Rank: <strong className="text-white">#{playerRank}</strong>
          </span>
        </div>
      </div>

      {/* Top Right: Top 5 Leaderboard */}
      <div className="absolute right-4 top-4 w-56 rounded-2xl border border-white/10 bg-slate-900/85 p-3.5 shadow-2xl backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
            <Trophy className="h-3.5 w-3.5" />
            Leaderboard
          </div>
          <span className="text-[10px] text-slate-400">Top 5</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {leaderboard.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition-colors ${
                entry.isPlayer
                  ? "border border-emerald-500/30 bg-emerald-500/20 font-bold text-emerald-300"
                  : "text-slate-300"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className={`w-4 text-center font-mono text-[11px] ${entry.rank === 1 ? "text-amber-400 font-bold" : "text-slate-400"}`}>
                  {entry.rank}
                </span>
                <span className="truncate">{entry.name}</span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">{entry.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Controls: Boost Button Bottom-Right */}
      <div className="pointer-events-auto absolute bottom-6 right-6 md:hidden">
        <button
          onTouchStart={onBoostStart}
          onTouchEnd={onBoostEnd}
          onMouseDown={onBoostStart}
          onMouseUp={onBoostEnd}
          className={`flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-2xl transition-transform active:scale-90 ${
            isBoosting
              ? "border-amber-400 bg-amber-500 text-slate-950 scale-105"
              : "border-white/20 bg-slate-900/80 text-amber-400 backdrop-blur-md"
          }`}
        >
          <Flame className={`h-8 w-8 ${isBoosting ? "animate-pulse" : ""}`} />
        </button>
      </div>
    </div>
  );
};
