"use client";

import { useState } from "react";
import { AIMixStudio } from "./AIMixStudio";
import { BeatGenerator } from "./BeatGenerator";

interface Props {
  userRole?: "user" | "admin";
  isPremium?: boolean;
  generationsUsed?: number;
  isLoggedIn?: boolean;
}

export function AIMixStudioTabs(props: Props) {
  const [tab, setTab] = useState<"mix" | "beat">("mix");

  return (
    <div className="w-full">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 mb-6 max-w-sm mx-auto">
        <button
          onClick={() => setTab("mix")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold
            transition-all duration-200
            ${tab === "mix"
              ? "bg-[var(--accent)] text-black shadow-lg"
              : "text-white/50 hover:text-white"}`}
        >
          <span>🎛</span>
          <span>Mix Studio</span>
        </button>
        <button
          onClick={() => setTab("beat")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold
            transition-all duration-200
            ${tab === "beat"
              ? "bg-[var(--accent)] text-black shadow-lg"
              : "text-white/50 hover:text-white"}`}
        >
          <span>🎹</span>
          <span>Beat Generator</span>
        </button>
      </div>

      {/* Content */}
      {tab === "mix" ? (
        <AIMixStudio {...props} />
      ) : (
        <BeatGenerator />
      )}
    </div>
  );
}
