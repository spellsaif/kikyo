import { useMemo, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { autocompletion, CompletionContext } from "@codemirror/autocomplete";
import { Play, Square, Trash2, Plus, FileText, Eraser, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { useKikyoStore } from "./store";
import type { KikyoWSClient } from "./ws";
import { Output } from "./Output";
import { MarkdownCell } from "./MarkdownCell";

export function Cell({
  id,
  ws,
  dragHandleProps,
}: {
  id: string;
  ws: KikyoWSClient | null;
  dragHandleProps?: { attributes: any; listeners: any };
}) {
  const theme = useKikyoStore((s) => s.theme);
  const mode = useKikyoStore((s) => s.mode);
  const setMode = useKikyoStore((s) => s.setMode);
  const cell = useKikyoStore((s) => s.cells.find((c) => c.id === id));
  const activeCellId = useKikyoStore((s) => s.activeCellId);
  const setActiveCellId = useKikyoStore((s) => s.setActiveCellId);
  const duplicates = useKikyoStore((s) => s.duplicates);
  const updateSource = useKikyoStore((s) => s.updateCellSource);
  const changeCellType = useKikyoStore((s) => s.changeCellType);
  const deleteCell = useKikyoStore((s) => s.deleteCell);
  const moveCellUp = useKikyoStore((s) => s.moveCellUp);
  const moveCellDown = useKikyoStore((s) => s.moveCellDown);
  const addCell = useKikyoStore((s) => s.addCell);
  const clearOutputs = useKikyoStore((s) => s.clearOutputs);
  const graphInfo = useKikyoStore((s) => s.graphInfo);
  const reactiveExecution = useKikyoStore((s) => s.reactiveExecution);

  if (!cell) return null;

  // Render dedicated Markdown block if cell is markdown
  if (cell.cell_type === "markdown") {
    return (
      <>
        <MarkdownCell id={id} ws={ws} dragHandleProps={dragHandleProps} />
        {/* Inter-cell divider */}
        <div className="group/divider relative my-1 flex h-4 items-center justify-center">
          <div className="absolute inset-x-0 h-px bg-transparent transition-colors group-hover/divider:bg-neutral-200 dark:group-hover/divider:bg-neutral-800" />
          <div className="relative z-10 hidden items-center gap-1.5 group-hover/divider:flex">
            <button
              onClick={() => {
                const newId = addCell(id, "code");
                if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: id, cell_type: "code" });
              }}
              className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <Plus size={10} />
              <span>Code</span>
            </button>
            <button
              onClick={() => {
                const newId = addCell(id, "markdown");
                if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: id, cell_type: "markdown" });
              }}
              className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <FileText size={10} />
              <span>Text</span>
            </button>
          </div>
        </div>
      </>
    );
  }

  const isActive = activeCellId === id;

  const dupSymbols = Object.entries(duplicates)
    .filter(([_, ids]) => ids.includes(id))
    .map(([name]) => name);

  const cellMetadata = graphInfo.cell_info?.[id];
  const defines = cellMetadata?.defines || [];
  const dependents = graphInfo.dependents?.[id] || [];

  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (isActive && mode === "edit" && viewRef.current) {
      if (!viewRef.current.hasFocus) {
        viewRef.current.focus();
      }
    }
  }, [isActive, mode]);

  const runCell = () => {
    if (ws && cell.status !== "running") {
      if (reactiveExecution) {
        ws.send({ op: "run_reactive", cell_id: id });
      } else {
        ws.send({ op: "run", cell_id: id });
      }
    }
  };

  const runAndAdvance = () => {
    runCell();
    const cells = useKikyoStore.getState().cells;
    const idx = cells.findIndex((c) => c.id === id);
    if (idx === cells.length - 1) {
      const newId = addCell(id, "code");
      if (ws) {
        ws.send({ op: "insert_cell", cell_id: newId, after_id: id, cell_type: "code" });
      }
    } else {
      setActiveCellId(cells[idx + 1].id);
    }
  };

  const keyboardExtension = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: "Shift-Enter",
            run: () => {
              runAndAdvance();
              return true;
            },
          },
          {
            key: "Ctrl-Enter",
            run: () => {
              runCell();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            run: () => {
              runCell();
              return true;
            },
          },
          {
            key: "Escape",
            run: (view) => {
              setMode("command");
              view.contentDOM.blur();
              return true;
            },
          },
        ])
      ),
    [runAndAdvance, runCell, setMode]
  );

  const kikyoAutocomplete = useMemo(() => {
    return autocompletion({
      override: [
        async (context: CompletionContext) => {
          if (!ws) return null;
          const word = context.matchBefore(/[\w\.]+/);
          if (!word && !context.explicit) return null;

          const code = context.state.doc.toString();
          const pos = context.pos;
          const res = await ws.requestCompletion(id, code, pos);
          if (!res || !res.matches || res.matches.length === 0) return null;

          return {
            from: res.cursor_start,
            to: res.cursor_end,
            options: res.matches.map((m) => ({
              label: m,
              type: "keyword",
            })),
          };
        },
      ],
      activateOnTyping: true,
    });
  }, [ws, id]);

  const handleSwitchToMarkdown = () => {
    changeCellType(id, "markdown");
    if (ws) {
      ws.send({ op: "change_type", cell_id: id, cell_type: "markdown" });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCell(id);
    if (ws) {
      ws.send({ op: "delete_cell", cell_id: id });
    }
  };

  const handleInsertBelow = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = addCell(id, "code");
    if (ws) {
      ws.send({ op: "insert_cell", cell_id: newId, after_id: id, cell_type: "code" });
    }
  };

  return (
    <>
      <div
        className={`group/block relative my-3 overflow-hidden rounded-lg border transition-all ${
          isActive
            ? mode === "edit"
              ? "border-emerald-500 shadow-md ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:ring-emerald-500/30"
              : "border-blue-500 shadow-md ring-2 ring-blue-500/20 dark:border-blue-500 dark:ring-blue-500/30"
            : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700 shadow-xs"
        } bg-white dark:bg-[#1c1c1c]`}
        onClick={() => {
          setActiveCellId(id);
        }}
      >
        {/* Cell Header Toolbar */}
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/70 px-2.5 py-1 text-xs select-none dark:border-neutral-800/60 dark:bg-[#171717]">
          {/* Left toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {dragHandleProps && (
              <button
                {...dragHandleProps.listeners}
                {...dragHandleProps.attributes}
                className="cursor-grab active:cursor-grabbing rounded p-0.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors"
                title="Drag to reorder cell"
              >
                <GripVertical size={13} />
              </button>
            )}

            {cell.status === "running" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (ws) ws.send({ op: "interrupt" });
                }}
                className="flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 font-medium text-rose-700 border border-rose-200 transition-colors hover:bg-rose-100 hover:border-rose-300 dark:bg-rose-950/60 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-900/80 cursor-pointer shadow-xs animate-pulse"
                title="Stop execution (Interrupt Kernel)"
              >
                <Square size={10} className="fill-current text-rose-600 dark:text-rose-400" />
                <span className="text-[11px] font-sans font-semibold">Stop</span>
              </button>
            ) : (
              <button
                onClick={runCell}
                className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-800 transition-colors hover:bg-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                title="Run cell (Shift+Enter to run & advance, Ctrl+Enter to run in-place)"
              >
                <Play size={10} className="fill-current text-neutral-800 dark:text-neutral-200" />
                <span className="text-[11px] font-sans">Run</span>
              </button>
            )}

            <span className="font-mono text-[10.5px] text-neutral-400 dark:text-neutral-500">
              [{id}]
            </span>

            {/* Active focus status badge */}
            {isActive && (
              <span
                className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-medium ${
                  mode === "edit"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                }`}
              >
                {mode === "edit" ? "Editing" : "Selected"}
              </span>
            )}

            <span className="rounded bg-neutral-200/60 px-1.5 py-0.2 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              Python
            </span>

            {/* Execution duration */}
            {typeof cell.executionDuration === "number" && (
              <span
                className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500"
                title={`Last execution took ${cell.executionDuration}s`}
              >
                {cell.executionDuration}s
              </span>
            )}

            {/* Status pills */}
            {cell.status === "running" && (
              <span className="flex items-center gap-1 rounded bg-blue-100/80 px-1.5 py-0.2 text-[10px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                running
              </span>
            )}
            {cell.status === "error" && (
              <span className="rounded bg-rose-100/80 px-1.5 py-0.2 text-[10px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                error
              </span>
            )}
            {cell.status === "aborted" && (
              <span className="rounded bg-neutral-200/80 px-1.5 py-0.2 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                aborted
              </span>
            )}

            {/* Defined symbols pill */}
            {defines.length > 0 && (
              <span
                className="rounded bg-emerald-50 px-1.5 py-0.2 font-mono text-[10px] text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50"
                title={`Defines global symbols: ${defines.join(", ")}`}
              >
                def: {defines.join(", ")}
              </span>
            )}

            {/* Downstream dependents pill */}
            {dependents.length > 0 && (
              <span
                className="rounded bg-sky-50 px-1.5 py-0.2 font-mono text-[10px] text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/50"
                title={`Triggers ${dependents.length} downstream cells on execution`}
              >
                → {dependents.length} {dependents.length === 1 ? "dep" : "deps"}
              </span>
            )}

            {dupSymbols.length > 0 && (
              <span
                className="rounded bg-amber-100/80 px-1.5 py-0.2 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                title={`Duplicate symbol definition: ${dupSymbols.join(", ")}`}
              >
                dup: {dupSymbols.join(", ")}
              </span>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-0.5 text-neutral-400 dark:text-neutral-500">
            {/* Move Up */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveCellUp(id);
                if (ws) ws.send({ op: "move_cell", cell_id: id, direction: "up" });
              }}
              className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Move cell up (Alt+↑)"
            >
              <ArrowUp size={13} />
            </button>

            {/* Move Down */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveCellDown(id);
                if (ws) ws.send({ op: "move_cell", cell_id: id, direction: "down" });
              }}
              className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Move cell down (Alt+↓)"
            >
              <ArrowDown size={13} />
            </button>

            {cell.outputs && cell.outputs.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearOutputs(id);
                }}
                className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                title="Clear cell outputs"
              >
                <Eraser size={13} />
              </button>
            )}
            <button
              onClick={handleSwitchToMarkdown}
              className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Convert to Markdown cell (M in Command Mode)"
            >
              <FileText size={13} />
            </button>
            <button
              onClick={handleInsertBelow}
              className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Insert block below (B in Command Mode)"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={handleDelete}
              className="rounded p-1 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
              title="Delete block (D, D in Command Mode)"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Code Editor */}
        <div className="cm-notion-frame text-[13px]">
          <CodeMirror
            onCreateEditor={(view) => {
              viewRef.current = view;
            }}
            value={cell.source}
            extensions={[python(), keyboardExtension, kikyoAutocomplete]}
            theme={theme === "dark" ? oneDark : "light"}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              foldGutter: false,
              autocompletion: false,
            }}
            onFocus={() => {
              setActiveCellId(id);
              setMode("edit");
            }}
            onChange={(val) => {
              updateSource(id, val);
              if (ws) {
                ws.send({ op: "update_cell", cell_id: id, source: val });
              }
            }}
          />
        </div>

        {/* Outputs Container */}
        {cell.outputs && cell.outputs.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-neutral-100 bg-[#fafafa] p-3 dark:border-neutral-800/60 dark:bg-[#151515] max-h-[420px] overflow-y-auto scrollbar-thin">
            {cell.outputs.map((out, idx) => (
              <Output key={idx} output={out} />
            ))}
          </div>
        )}
      </div>

      {/* Inter-cell hover divider */}
      <div className="group/divider relative my-1 flex h-4 items-center justify-center">
        <div className="absolute inset-x-0 h-px bg-transparent transition-colors group-hover/divider:bg-neutral-200 dark:group-hover/divider:bg-neutral-800" />
        <div className="relative z-10 hidden items-center gap-1.5 group-hover/divider:flex">
          <button
            onClick={() => {
              const newId = addCell(id, "code");
              if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: id, cell_type: "code" });
            }}
            className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Plus size={10} />
            <span>Code</span>
          </button>
          <button
            onClick={() => {
              const newId = addCell(id, "markdown");
              if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: id, cell_type: "markdown" });
            }}
            className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <FileText size={10} />
            <span>Text</span>
          </button>
        </div>
      </div>
    </>
  );
}
