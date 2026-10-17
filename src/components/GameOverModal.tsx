"use client";

import React from "react";
import { Trophy, Coins, RotateCcw, Home, Skull, Clock } from "lucide-react";

interface GameOverModalProps {
  stats: {
    length: number;
    kills: number;
    coins: number;
    survivedTime: number;
    rank: number;
  };
  onPlayAgain: () => void;
  onLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  stats,
  onPlayAgain,
  onLobby,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <Skull className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">GAME OVER</h2>
          <p className="mt-1 text-sm text-slate-400">You were eliminated in the arena</p>
        </div>

        {/* Stats Grid */}
        <div className="my-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-slate-800/50 p-3.5 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Final Length</span>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">{stats.length}</p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-800/50 p-3.5 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Kills</span>
            <p className="mt-1 font-mono text-2xl font-bold text-rose-400">{stats.kills}</p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-800/50 p-3.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Coins className="h-3.5 w-3.5 text-amber-400" /> Coins Earned
            </div>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-400">+{stats.coins}</p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-800/50 p-3.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Trophy className="h-3.5 w-3.5 text-indigo-400" /> Final Rank
            </div>
            <p className="mt-1 font-mono text-2xl font-bold text-indigo-400">#{stats.rank}</p>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          <span>Survived for {stats.survivedTime} seconds</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onPlayAgain}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <RotateCcw className="h-5 w-5" />
            Play Again
          </button>

          <button
            onClick={onLobby}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-800/80 py-3 font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            Back to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
