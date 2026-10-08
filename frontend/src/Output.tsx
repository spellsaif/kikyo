import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check, Terminal, AlertTriangle } from "lucide-react";
import type { OutputData } from "./types";

function cleanTerminalOutput(raw: string): string {
  // Strip ANSI escape sequences
  let text = raw.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );

  // Process carriage returns (\r) common in progress bars (pip, tqdm)
  const lines = text.split("\n");
  const processed = lines.map((line) => {
    if (line.includes("\r")) {
      const parts = line.split("\r");
      return parts.filter(Boolean).pop() || "";
    }
    return line;
  });

  return processed.join("\n");
}

function StreamOutput({
  text,
  isStderr,
}: {
  text: string;
  isStderr: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLPreElement | null>(null);

  const cleanedText = cleanTerminalOutput(text);
  const lineCount = cleanedText.split("\n").length;
  const isLong = lineCount > 10;

  // Auto-scroll to bottom as new content streams in
  useEffect(() => {
    if (scrollRef.current && !isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cleanedText, isExpanded]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`group/stream relative rounded border font-mono text-[13.5px] leading-relaxed transition-colors ${
        isStderr
          ? "border-amber-200/60 bg-amber-50/40 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
          : "border-neutral-200/80 bg-neutral-50/80 text-neutral-800 dark:border-neutral-800/80 dark:bg-[#161616] dark:text-neutral-200"
      }`}
    >
      {/* Stream Controls Header (shown if long output or hovered) */}
      {isLong && (
        <div className="flex items-center justify-between border-b border-neutral-200/60 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-800/60 dark:text-neutral-400">
          <div className="flex items-center gap-1.5 font-sans font-medium">
            <Terminal size={12} className="opacity-70" />
            <span>{isStderr ? "stderr stream" : "stdout stream"}</span>
            <span className="rounded bg-neutral-200/70 px-1.5 py-0.2 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {lineCount} lines
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
              title="Copy output to clipboard"
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              <span className="font-sans text-[11px]">{copied ? "Copied" : "Copy"}</span>
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
              title={isExpanded ? "Collapse to scrollable preview" : "Expand to view full output"}
            >
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span className="font-sans text-[11px]">{isExpanded ? "Collapse" : "Expand"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Pre Content Area */}
      <pre
        ref={scrollRef}
        className={`overflow-x-auto p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap select-text scrollbar-thin ${
          isLong && !isExpanded ? "max-h-64 overflow-y-auto" : "max-h-none overflow-y-visible"
        }`}
      >
        {cleanedText}
      </pre>
    </div>
  );
}

function ErrorOutput({ data }: { data: any }) {
  const [copied, setCopied] = useState(false);
  const traceback = Array.isArray(data.traceback)
    ? data.traceback.join("\n")
    : `${data.ename}: ${data.evalue}`;
  const cleanedTrace = cleanTerminalOutput(traceback);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanedTrace);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded border border-rose-200 bg-rose-50/60 font-mono text-xs dark:border-rose-900/50 dark:bg-rose-950/20">
      <div className="flex items-center justify-between border-b border-rose-200/80 bg-rose-100/50 px-3 py-1.5 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
        <div className="flex items-center gap-1.5 font-sans font-semibold text-xs">
          <AlertTriangle size={13} className="text-rose-500" />
          <span>
            {data.ename}: {data.evalue}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-rose-200/50 dark:hover:bg-rose-900/50"
          title="Copy error traceback"
        >
          {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          <span className="font-sans">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-[13px] leading-relaxed text-rose-950 dark:text-rose-200 whitespace-pre-wrap select-text">
        {cleanedTrace}
      </pre>
    </div>
  );
}

function HTMLOutput({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    try {
      const range = document.createRange();
      range.selectNode(containerRef.current);
      const fragment = range.createContextualFragment(html);
      containerRef.current.appendChild(fragment);
    } catch {
      containerRef.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-neutral-200/70 p-2 text-[13px] dark:border-neutral-800/80">
      <div ref={containerRef} className="notion-html-output" />
    </div>
  );
}

export function Output({ output }: { output: OutputData }) {
  const { kind, data } = output;

  if (kind === "stream") {
    const isStderr = data.name === "stderr";
    return <StreamOutput text={data.text || ""} isStderr={isStderr} />;
  }

  if (kind === "error") {
    return <ErrorOutput data={data} />;
  }

  if (kind === "aborted") {
    return (
      <div className="flex items-center gap-2 rounded border-l-2 border-neutral-400 bg-neutral-100/60 px-3 py-1.5 font-mono text-xs text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900/60 dark:text-neutral-400">
        <span>↳ {data.reason || "Execution cancelled due to upstream failure"}</span>
      </div>
    );
  }

  if (kind === "execute_result" || kind === "display_data") {
    const bundle = data.data || {};

    if (bundle["image/png"]) {
      return (
        <div className="inline-block overflow-hidden rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
          <img
            src={`data:image/png;base64,${bundle["image/png"]}`}
            alt="Plot Output"
            className="max-h-[600px] w-auto max-w-full rounded object-contain"
          />
        </div>
      );
    }

    if (bundle["image/jpeg"]) {
      return (
        <div className="inline-block overflow-hidden rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
          <img
            src={`data:image/jpeg;base64,${bundle["image/jpeg"]}`}
            alt="Plot Output"
            className="max-h-[600px] w-auto max-w-full rounded object-contain"
          />
        </div>
      );
    }

    if (bundle["image/svg+xml"]) {
      return (
        <div
          className="inline-block overflow-hidden rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900 max-w-full"
          dangerouslySetInnerHTML={{ __html: bundle["image/svg+xml"] }}
        />
      );
    }

    if (bundle["text/html"]) {
      return <HTMLOutput html={bundle["text/html"]} />;
    }

    if (bundle["text/plain"]) {
      const text = bundle["text/plain"];
      const lines = text.split("\n");
      const isLong = lines.length > 12;

      return (
        <div className="overflow-hidden rounded border border-neutral-200/70 bg-neutral-50/50 font-mono text-xs dark:border-neutral-800/80 dark:bg-[#161616]">
          <pre
            className={`p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap select-text text-neutral-800 dark:text-neutral-200 ${
              isLong ? "max-h-64 overflow-y-auto" : "max-h-none"
            }`}
          >
            {text}
          </pre>
        </div>
      );
    }
  }

  return null;
}
