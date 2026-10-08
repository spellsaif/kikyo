import { useState } from "react";
import {
  Plus,
  Zap,
  Layers,
  FileCode2,
  Trash2,
  ArrowRight,
  BookOpen,
  Keyboard,
  Cpu,
  Package,
} from "lucide-react";

interface HomeDocsProps {
  notebooks: string[];
  onOpenNotebook: (name: string) => void;
  onCreateNotebook: () => void;
  onDeleteNotebook: (name: string) => void;
}

export function HomeDocs({
  notebooks,
  onOpenNotebook,
  onCreateNotebook,
  onDeleteNotebook,
}: HomeDocsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "shortcuts" | "architecture">("overview");

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 transition-colors animate-in fade-in duration-150">
      {/* Notion Cover Icon & Header */}
      <div className="mb-8 border-b border-neutral-200/80 pb-8 dark:border-neutral-800">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-semibold text-base select-none shadow-xs">
          K
        </div>
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Kikyo (桔梗)
          </h1>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60">
            v1.0.0
          </span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
          A minimalist, reactive Python notebook that saves as clean, git-friendly <code className="text-neutral-700 dark:text-neutral-300 font-mono">.py</code> scripts. Designed with Notion breathability, real-time AST dependency flow, and zero AI slop.
        </p>

        {/* Quick Launch Buttons */}
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <button
            onClick={onCreateNotebook}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors"
          >
            <Plus size={14} />
            <span>New Notebook</span>
          </button>

          {notebooks.length > 0 && (
            <button
              onClick={() => onOpenNotebook(notebooks[0])}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-750 dark:bg-[#1f1f1f] dark:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <span>Open {notebooks[0]}.py</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Notebooks Library Cards (if any exist) */}
      <div className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Your Notebooks ({notebooks.length})
          </h2>
          <button
            onClick={onCreateNotebook}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <Plus size={12} />
            <span>Create</span>
          </button>
        </div>

        {notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-neutral-200 py-10 text-center dark:border-neutral-800">
            <FileCode2 size={24} className="text-neutral-300 dark:text-neutral-600" strokeWidth={1.5} />
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              No notebooks in workspace
            </span>
            <p className="text-[11px] text-neutral-400 max-w-xs">
              Click "New Notebook" to create your first page and start running code.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {notebooks.map((nb) => (
              <div
                key={nb}
                onClick={() => onOpenNotebook(nb)}
                className="group/card flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3.5 hover:border-neutral-300 hover:shadow-xs dark:border-neutral-800 dark:bg-[#1a1a1a] dark:hover:border-neutral-700 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    <FileCode2 size={16} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 group-hover/card:text-blue-600 dark:group-hover/card:text-blue-400 transition-colors">
                      {nb}.py
                    </h3>
                    <p className="text-[10.5px] text-neutral-400">
                      Python script + sidecar cache
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNotebook(nb);
                    }}
                    className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                    title={`Delete ${nb}.py`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Documentation Tabs */}
      <div>
        <div className="mb-4 flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <BookOpen size={13} />
            <span>How Kikyo Works</span>
          </button>
          <button
            onClick={() => setActiveTab("shortcuts")}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-colors ${
              activeTab === "shortcuts"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Keyboard size={13} />
            <span>Keyboard Shortcuts</span>
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-colors ${
              activeTab === "architecture"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Cpu size={13} />
            <span>Engineering Architecture</span>
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1.5">
                <Zap size={15} className="text-amber-500" />
                <h3>1. Reactive Flow vs Classic Execution</h3>
              </div>
              <p className="mb-2">
                Traditional Jupyter notebooks execute cells out of order, creating invisible state bugs. Kikyo solves this with two modes:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-600 dark:text-neutral-400">
                <li>
                  <strong className="text-neutral-800 dark:text-neutral-200">Reactive Flow (Default):</strong> When you run a cell, Kikyo inspects the Python AST to determine defined and referenced symbols. All downstream dependent cells automatically re-run in topological DAG order.
                </li>
                <li>
                  <strong className="text-neutral-800 dark:text-neutral-200">Classic Mode:</strong> Runs only the selected cell in place without touching downstream cells, matching standard Jupyter behavior. You can toggle between modes anytime via the header pill or <kbd className="font-mono">Ctrl+K</kbd>.
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1.5">
                <FileCode2 size={15} className="text-blue-500" />
                <h3>2. Pure Python Script Storage (.py)</h3>
              </div>
              <p className="mb-2">
                No messy 5,000-line JSON diffs. Every Kikyo notebook is stored as a clean Python script using standard <code className="font-mono text-neutral-800 dark:text-neutral-200"># %%</code> block markers.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-600 dark:text-neutral-400">
                <li>Edit files in VS Code, Neovim, or Kikyo interchangeably.</li>
                <li>Run scripts directly in your terminal: <code className="font-mono">python notebooks/analysis.py</code>.</li>
                <li>Outputs and display figures are cached in an append-only JSONL sidecar (<code className="font-mono">.kout</code>) that can be gitignored.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1.5">
                <Layers size={15} className="text-purple-500" />
                <h3>3. Drag & Drop Reordering</h3>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400">
                Reorder cells fluidly by grabbing the drag handle (<code className="font-mono">⋮⋮</code>) on the left of any cell, or using <kbd className="font-mono">Alt + ↑</kbd> / <kbd className="font-mono">Alt + ↓</kbd>. Changes immediately update the script file on disk and recalculate the reactive DAG.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1.5">
                <Package size={15} className="text-emerald-500" />
                <h3>4. Package Installation & Output Scrolling</h3>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400">
                Install packages directly inside code blocks (<code className="font-mono">!pip install numpy pandas matplotlib</code>). Long installation streams and verbose logs automatically collapse to clean, scrollable viewports with instant copy buttons so your notebook canvas stays tidy.
              </p>
            </div>
          </div>
        )}

        {activeTab === "shortcuts" && (
          <div className="rounded-xl border border-neutral-200/80 bg-white dark:border-neutral-800 dark:bg-[#171717] overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
                  <th className="p-3">Action</th>
                  <th className="p-3">Shortcut</th>
                  <th className="p-3">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-150 dark:divide-neutral-800 font-mono text-[11.5px]">
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Run cell & advance</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Shift + Enter</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Any</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Run cell in-place</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Ctrl + Enter</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Any</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Enter Edit Mode</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Enter</kbd> (or click cell)</td>
                  <td className="p-3 font-sans text-neutral-400">Command</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Enter Command Mode</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Esc</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Edit</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Insert cell above / below</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">A</kbd> / <kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">B</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Command</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Convert to Markdown / Code</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">M</kbd> / <kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Y</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Command</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Move cell up / down</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Alt + ↑ / ↓</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Any</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Delete cell</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">D, D</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Command</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Command Palette</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Ctrl + K</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Global</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Reactive Graph Inspector</td>
                  <td className="p-3"><kbd className="rounded border px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">Ctrl + G</kbd></td>
                  <td className="p-3 font-sans text-neutral-400">Global</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "architecture" && (
          <div className="space-y-4 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                FastAPI + Msgspec Wire Protocol
              </h4>
              <p className="text-neutral-500 dark:text-neutral-400">
                High-throughput binary and JSON serialization using <code className="font-mono">msgspec</code> eliminates deserialization overhead. WebSocket multiplexing cleanly separates control commands (execution, reordering, mutations) from CRDT binary sync frames.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Persistent Daemon IPyKernel Bridge
              </h4>
              <p className="text-neutral-500 dark:text-neutral-400">
                Kernels run as independent OS processes managed via ZeroMQ shell and IOPub channels. If your browser closes or network drops, long-running model training or calculations continue uninterrupted in the background.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-[#171717]">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Yjs / Pycrdt Real-Time Collaboration
              </h4>
              <p className="text-neutral-500 dark:text-neutral-400">
                Conflict-free replicated data types provide mathematical convergence for multi-user editing without operational transform conflicts.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
