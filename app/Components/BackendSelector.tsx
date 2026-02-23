import React from "react";
import { VoiceBackend } from "../voice/VoiceClient";
import cn from "../utils/TailwindMergeAndClsx";

interface BackendSelectorProps {
  value: VoiceBackend;
  onChange: (backend: VoiceBackend) => void;
  disabled: boolean;
}

const BackendSelector: React.FC<BackendSelectorProps> = ({
  value,
  onChange,
  disabled,
}) => {
  return (
    <div className={cn("flex gap-1 p-1 bg-effect15White rounded-[100px]", disabled && "opacity-50 pointer-events-none")}>
      <button
        onClick={() => onChange("openai")}
        className={cn(
          "px-4 py-1 rounded-[100px] text-xs font-abc-repro-mono font-bold transition-all duration-300",
          value === "openai"
            ? "bg-simliblue text-white"
            : "bg-transparent text-white/60 hover:text-white"
        )}
      >
        OpenAI
      </button>
      <button
        onClick={() => onChange("gemini")}
        className={cn(
          "px-4 py-1 rounded-[100px] text-xs font-abc-repro-mono font-bold transition-all duration-300",
          value === "gemini"
            ? "bg-simliblue text-white"
            : "bg-transparent text-white/60 hover:text-white"
        )}
      >
        Gemini
      </button>
    </div>
  );
};

export default BackendSelector;
