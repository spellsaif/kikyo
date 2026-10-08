import { useState, useEffect, useRef } from "react";
import {
  Play,
  Zap,
  Square,
  RotateCcw,
  Plus,
  FileText,
  FileCode2,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eraser,
  Layers,
  Maximize2,
  Sun,
  Download,
  HelpCircle,
  Search,
  Terminal,
  Edit3,
} from "lucide-react";
import { useKikyoStore } from "./store";
import type { KikyoWSClient } from "./ws";

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  category: "Execution" | "Cells" | "View & Graph" | "File" | "Help";
  shortcut?: string;
  icon: any;
  action: () => void;
}

export function CommandPalette({
  ws,
  onOpenShortcuts,
  onOpenDeleteModal,
  onStartRename,
}: {
  ws: KikyoWSClient | null;
  onOpenShortcuts: () => void;
  onOpenDeleteModal: () => void;
  onStartRename: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const showCommandPalette = useKikyoStore((s) => s.showCommandPalette);
  const setShowCommandPalette = useKikyoStore((s) => s.setShowCommandPalette);

  const activeCellId = useKikyoStore((s) => s.activeCellId);
  const cells = useKikyoStore((s) => s.cells);
  const activeNb = useKikyoStore((s) => s.notebookName);

  const addCell = useKikyoStore((s) => s.addCell);
  const addCellAbove = useKikyoStore((s) => s.addCellAbove);
  const changeCellType = useKikyoStore((s) => s.changeCellType);
  const deleteCell = useKikyoStore((s) => s.deleteCell);
  const moveCellUp = useKikyoStore((s) => s.moveCellUp);
  const moveCellDown = useKikyoStore((s) => s.moveCellDown);
  const clearOutputs = useKikyoStore((s) => s.clearOutputs);
  const clearAllOutputs = useKikyoStore((s) => s.clearAllOutputs);
  const toggleTheme = useKikyoStore((s) => s.toggleTheme);
  const toggleFullWidth = useKikyoStore((s) => s.toggleFullWidth);
  const setShowGraphDrawer = useKikyoStore((s) => s.setShowGraphDrawer);
  const showGraphDrawer = useKikyoStore((s) => s.showGraphDrawer);
  const setMode = useKikyoStore((s) => s.setMode);
  const reactiveExecution = useKikyoStore((s) => s.reactiveExecution);
  const toggleReactiveExecution = useKikyoStore((s) => s.toggleReactiveExecution);

  useEffect(() => {
    if (showCommandPalette) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showCommandPalette]);

  if (!showCommandPalette) return null;

  const targetId = activeCellId || (cells.length > 0 ? cells[0].id : undefined);

  const commands: CommandItem[] = [
    // Execution
    {
      id: "toggle-reactive-mode",
      title: reactiveExecution
        ? "Switch to Classic Single-Cell Execution (Classic Mode)"
        : "Switch to Reactive Flow (Reactive DAG)",
      description: reactiveExecution
        ? "Currently in Reactive Flow. Click to run single cells only (standard Jupyter)"
        : "Currently in Classic mode. Click to enable automatic DAG propagation",
      category: "Execution",
      icon: Zap,
      action: () => {
        toggleReactiveExecution();
      },
    },
    {
      id: "run-reactive",
      title: "Run Reactive (Cell & All Dependents)",
      description: "Executes selected cell and propagates down the dependency DAG",
      category: "Execution",
      shortcut: "Shift + Enter",
      icon: Zap,
      action: () => {
        if (ws && targetId) ws.send({ op: "run_reactive", cell_id: targetId });
      },
    },
    {
      id: "run-single",
      title: "Run Single Cell In-Place",
      description: "Runs only the current cell without downstream execution",
      category: "Execution",
      shortcut: "Ctrl + Enter",
      icon: Play,
      action: () => {
        if (ws && targetId) ws.send({ op: "run", cell_id: targetId });
      },
    },
    {
      id: "run-all",
      title: "Run All Cells",
      description: "Executes every code cell sequentially in the notebook",
      category: "Execution",
      icon: Play,
      action: () => {
        if (!ws) return;
        cells.forEach((c) => {
          if (c.cell_type !== "markdown") ws.send({ op: "run_reactive", cell_id: c.id });
        });
      },
    },
    {
      id: "interrupt",
      title: "Interrupt Kernel Execution",
      description: "Sends SIGINT to stop running cells or infinite loops",
      category: "Execution",
      shortcut: "I, I",
      icon: Square,
      action: () => {
        if (ws) ws.send({ op: "interrupt" });
      },
    },
    {
      id: "restart-kernel",
      title: "Restart Python Kernel",
      description: "Restarts the runtime process and resets variable namespace",
      category: "Execution",
      shortcut: "0, 0",
      icon: RotateCcw,
      action: () => {
        if (ws) ws.send({ op: "restart_kernel" });
      },
    },
    {
      id: "clear-outputs",
      title: "Clear Selected Cell Outputs",
      description: "Wipes standard output and display figures for the active cell",
      category: "Execution",
      icon: Eraser,
      action: () => {
        if (targetId) clearOutputs(targetId);
      },
    },
    {
      id: "clear-all-outputs",
      title: "Clear All Outputs in Notebook",
      description: "Resets all output views across the entire notebook canvas",
      category: "Execution",
      icon: Eraser,
      action: () => {
        clearAllOutputs();
      },
    },

    // Cells
    {
      id: "insert-below",
      title: "Insert Code Cell Below",
      description: "Adds a new code block after the current cell",
      category: "Cells",
      shortcut: "B",
      icon: Plus,
      action: () => {
        const newId = addCell(targetId, "code");
        if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: targetId, cell_type: "code" });
      },
    },
    {
      id: "insert-above",
      title: "Insert Code Cell Above",
      description: "Adds a new code block before the current cell",
      category: "Cells",
      shortcut: "A",
      icon: Plus,
      action: () => {
        if (!targetId) return;
        const newId = addCellAbove(targetId, "code");
        if (ws) ws.send({ op: "insert_cell", cell_id: newId, before_id: targetId, cell_type: "code" });
      },
    },
    {
      id: "insert-markdown",
      title: "Insert Text / Markdown Block Below",
      description: "Adds an editable Notion-style text block with Markdown formatting",
      category: "Cells",
      icon: FileText,
      action: () => {
        const newId = addCell(targetId, "markdown");
        if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: targetId, cell_type: "markdown" });
      },
    },
    {
      id: "to-markdown",
      title: "Convert Selected Block to Markdown",
      description: "Switches cell to rich markdown text formatting",
      category: "Cells",
      shortcut: "M",
      icon: FileText,
      action: () => {
        if (targetId) {
          changeCellType(targetId, "markdown");
          if (ws) ws.send({ op: "change_type", cell_id: targetId, cell_type: "markdown" });
        }
      },
    },
    {
      id: "to-code",
      title: "Convert Selected Block to Python Code",
      description: "Switches cell to executable Python code block",
      category: "Cells",
      shortcut: "Y",
      icon: FileCode2,
      action: () => {
        if (targetId) {
          changeCellType(targetId, "code");
          if (ws) ws.send({ op: "change_type", cell_id: targetId, cell_type: "code" });
        }
      },
    },
    {
      id: "move-up",
      title: "Move Selected Cell Up",
      description: "Swaps position with cell above",
      category: "Cells",
      shortcut: "Alt + ↑",
      icon: ArrowUp,
      action: () => {
        if (targetId) {
          moveCellUp(targetId);
          if (ws) ws.send({ op: "move_cell", cell_id: targetId, direction: "up" });
        }
      },
    },
    {
      id: "move-down",
      title: "Move Selected Cell Down",
      description: "Swaps position with cell below",
      category: "Cells",
      shortcut: "Alt + ↓",
      icon: ArrowDown,
      action: () => {
        if (targetId) {
          moveCellDown(targetId);
          if (ws) ws.send({ op: "move_cell", cell_id: targetId, direction: "down" });
        }
      },
    },
    {
      id: "delete-cell",
      title: "Delete Selected Block",
      description: "Removes block and updates reactive dependency graph",
      category: "Cells",
      shortcut: "D, D",
      icon: Trash2,
      action: () => {
        if (targetId) {
          deleteCell(targetId);
          if (ws) ws.send({ op: "delete_cell", cell_id: targetId });
        }
      },
    },

    // View & Graph
    {
      id: "toggle-graph",
      title: "Toggle Reactive Graph & Variable Inspector",
      description: "Inspect notebook global variables, inputs, outputs, and DAG tree",
      category: "View & Graph",
      shortcut: "Ctrl + G",
      icon: Layers,
      action: () => {
        setShowGraphDrawer(!showGraphDrawer);
      },
    },
    {
      id: "switch-command-mode",
      title: "Switch to Command Mode",
      description: "Control notebook structure and navigate using keyboard shortcuts",
      category: "View & Graph",
      shortcut: "Esc",
      icon: Terminal,
      action: () => {
        setMode("command");
      },
    },
    {
      id: "switch-edit-mode",
      title: "Switch to Edit Mode",
      description: "Type code or text directly inside active cell",
      category: "View & Graph",
      shortcut: "Enter",
      icon: Edit3,
      action: () => {
        setMode("edit");
      },
    },
    {
      id: "toggle-width",
      title: "Toggle Full Width / Centered Layout",
      description: "Expand notebook canvas to 100% or standard 1024px width",
      category: "View & Graph",
      icon: Maximize2,
      action: () => {
        toggleFullWidth();
      },
    },
    {
      id: "toggle-theme",
      title: "Toggle Dark / Light Theme",
      description: "Switch color theme between dark and light modes",
      category: "View & Graph",
      icon: Sun,
      action: () => {
        toggleTheme();
      },
    },

    // File
    {
      id: "rename-notebook",
      title: "Rename Current Notebook",
      description: "Inline edit notebook file title",
      category: "File",
      icon: FileCode2,
      action: () => {
        onStartRename();
      },
    },
    {
      id: "export-ipynb",
      title: "Export as Jupyter Notebook (.ipynb)",
      description: "Download compatible .ipynb with all code, markdown, and sidecar outputs",
      category: "File",
      icon: Download,
      action: () => {
        window.location.href = `/api/notebook/${activeNb}/export`;
      },
    },
    {
      id: "export-py",
      title: "Export as Pure Python Script (.py)",
      description: "Download standalone executable Python file with # %% cell markers",
      category: "File",
      icon: Download,
      action: () => {
        window.location.href = `/api/notebook/${activeNb}/export/py`;
      },
    },
    {
      id: "delete-notebook",
      title: "Delete Notebook Permanently",
      description: "Permanently unlinks .py script and cached output sidecar",
      category: "File",
      icon: Trash2,
      action: () => {
        onOpenDeleteModal();
      },
    },

    // Help
    {
      id: "shortcuts",
      title: "Show Keyboard Shortcuts Cheat Sheet",
      description: "View all Vim and Jupyter keyboard bindings",
      category: "Help",
      shortcut: "?",
      icon: HelpCircle,
      action: () => {
        onOpenShortcuts();
      },
    },
  ];

  const filtered = commands.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.shortcut?.toLowerCase().includes(q)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowCommandPalette(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      const cmd = filtered[selectedIndex] || filtered[0];
      setShowCommandPalette(false);
      cmd.action();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-[14vh] backdrop-blur-xs p-4 animate-in fade-in duration-100"
      onClick={() => setShowCommandPalette(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-[#121215] text-neutral-800 dark:text-neutral-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 border-b border-neutral-200/80 px-4 py-3 dark:border-neutral-800">
          <Search size={16} className="text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search actions... (e.g. run, restart, markdown, export)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500 font-sans"
          />
          <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No matching commands found for "{query}"
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((cmd, idx) => {
                const Icon = cmd.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      setShowCommandPalette(false);
                      cmd.action();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors text-[13px] ${
                      isSelected
                        ? "bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100 font-medium"
                        : "hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`rounded-md p-1.5 ${
                          isSelected
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        <Icon size={15} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cmd.title}</span>
                          <span className="rounded bg-neutral-100 px-1.5 py-0.2 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                            {cmd.category}
                          </span>
                        </div>
                        {cmd.description && (
                          <p className="text-xs text-neutral-400 dark:text-neutral-500 font-normal mt-0.5">
                            {cmd.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {cmd.shortcut && (
                      <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="flex items-center justify-between border-t border-neutral-200/60 bg-neutral-50/70 px-4 py-2.5 text-xs text-neutral-400 dark:border-neutral-800/80 dark:bg-[#0e0e11]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono text-[11px]">↑</kbd> <kbd className="font-mono text-[11px]">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="font-mono text-[11px]">↵</kbd> Select
            </span>
            <span>
              <kbd className="font-mono text-[11px]">Esc</kbd> Close
            </span>
          </div>
          <span>Kikyo Command Palette</span>
        </div>
      </div>
    </div>
  );
}
