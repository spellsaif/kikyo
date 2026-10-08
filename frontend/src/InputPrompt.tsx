import { useState, useRef, useEffect } from "react";
import { CornerDownLeft, Lock, Terminal } from "lucide-react";
import { useKikyoStore } from "./store";
import type { KikyoWSClient } from "./ws";

export function InputPrompt({
  cellId,
  prompt,
  password,
  ws,
}: {
  cellId: string;
  prompt: string;
  password?: boolean;
  ws: KikyoWSClient | null;
}) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRequest = useKikyoStore((s) => s.setInputRequest);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (ws) {
      ws.send({ op: "input_reply", value, cell_id: cellId });
    }
    setInputRequest(cellId, null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded border border-neutral-300/80 bg-white px-3 py-2 font-mono text-[13px] shadow-2xs transition-colors dark:border-neutral-800 dark:bg-[#111114]"
    >
      <div className="flex items-center gap-1.5 font-medium text-neutral-600 select-none dark:text-neutral-400">
        {password ? (
          <Lock size={13} className="opacity-70 text-amber-500/90" />
        ) : (
          <Terminal size={13} className="opacity-70" />
        )}
        <span className="whitespace-pre">{prompt || "Input: "}</span>
      </div>

      <input
        ref={inputRef}
        type={password ? "password" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            handleSubmit();
          }
        }}
        disabled={isSubmitting}
        placeholder={password ? "Password (hidden)" : "Enter value..."}
        className="min-w-0 flex-1 rounded border border-neutral-200/90 bg-neutral-50/70 px-2.5 py-1 text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:ring-1 focus:ring-neutral-400 dark:border-neutral-800 dark:bg-[#0c0c0e] dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600 dark:focus:bg-[#0c0c0e] dark:focus:ring-neutral-600"
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex items-center gap-1.5 rounded border border-neutral-200 bg-neutral-100/80 px-2.5 py-1 text-xs font-sans font-medium text-neutral-700 shadow-3xs transition-colors hover:bg-neutral-200/70 active:scale-98 disabled:opacity-50 dark:border-neutral-700/60 dark:bg-[#18181b] dark:text-neutral-300 dark:hover:bg-neutral-800"
        title="Submit input (Enter)"
      >
        <span>Submit</span>
        <CornerDownLeft size={11} className="opacity-70" />
      </button>
    </form>
  );
}
