import { X, Layers, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useKikyoStore } from "./store";

export function ReactiveDrawer() {
  const showGraphDrawer = useKikyoStore((s) => s.showGraphDrawer);
  const setShowGraphDrawer = useKikyoStore((s) => s.setShowGraphDrawer);
  const activeCellId = useKikyoStore((s) => s.activeCellId);
  const setActiveCellId = useKikyoStore((s) => s.setActiveCellId);
  const duplicates = useKikyoStore((s) => s.duplicates);
  const cycleWarning = useKikyoStore((s) => s.cycleWarning);
  const graphInfo = useKikyoStore((s) => s.graphInfo);

  if (!showGraphDrawer) return null;

  const cellInfo = graphInfo.cell_info || {};
  const dependents = graphInfo.dependents || {};

  // Build list of all defined symbols across the entire notebook
  const symbolMap: Record<string, { definedBy: string; readBy: string[] }> = {};
  Object.entries(cellInfo).forEach(([cid, info]) => {
    (info.defines || []).forEach((sym) => {
      if (!symbolMap[sym]) {
        symbolMap[sym] = { definedBy: cid, readBy: [] };
      }
    });
  });

  Object.entries(cellInfo).forEach(([cid, info]) => {
    (info.reads || []).forEach((sym) => {
      if (symbolMap[sym]) {
        if (!symbolMap[sym].readBy.includes(cid)) {
          symbolMap[sym].readBy.push(cid);
        }
      }
    });
  });

  const activeInfo = activeCellId ? cellInfo[activeCellId] : null;
  const activeDependents = activeCellId ? dependents[activeCellId] || [] : [];

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-md dark:border-neutral-800 dark:bg-[#1c1c1c]/95 text-neutral-800 dark:text-neutral-100 animate-in slide-in-from-right duration-150"
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-neutral-200/80 px-4 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-blue-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
            Reactive Graph & Variables
          </h2>
        </div>
        <button
          onClick={() => setShowGraphDrawer(false)}
          className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Close drawer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs scrollbar-thin">
        {/* Graph Health */}
        <div className="rounded-lg border border-neutral-200/80 bg-neutral-50/70 p-3 dark:border-neutral-800/80 dark:bg-neutral-900/50">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            DAG Health
          </span>
          <div className="mt-2 space-y-2">
            {cycleWarning ? (
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Cycle detected in: {cycleWarning.cells.join(", ")}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} />
                <span>Acyclic DAG: No cycles detected</span>
              </div>
            )}

            {Object.keys(duplicates).length > 0 ? (
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Duplicate definitions: {Object.keys(duplicates).join(", ")}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} />
                <span>Unique symbol namespaces verified</span>
              </div>
            )}
          </div>
        </div>

        {/* Selected Cell Inspector */}
        <div>
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Selected Cell Inspector {activeCellId ? `[${activeCellId}]` : ""}
          </span>

          {!activeCellId ? (
            <p className="mt-2 text-neutral-400 italic">Select a cell in the notebook to view its reactive dependencies.</p>
          ) : (
            <div className="mt-2 space-y-3 rounded-lg border border-neutral-200/80 p-3 dark:border-neutral-800/80 bg-white dark:bg-[#202020]">
              {/* Inputs */}
              <div>
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Inputs (Reads):
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {activeInfo && activeInfo.reads.length > 0 ? (
                    activeInfo.reads.map((r) => (
                      <span
                        key={r}
                        className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10.5px] text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/60"
                      >
                        {r}
                      </span>
                    ))
                  ) : (
                    <span className="text-neutral-400 italic text-[11px]">None (root cell)</span>
                  )}
                </div>
              </div>

              {/* Outputs */}
              <div>
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Outputs (Defines / Mutates):
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {activeInfo && activeInfo.defines.length > 0 ? (
                    activeInfo.defines.map((d) => (
                      <span
                        key={d}
                        className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10.5px] text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                      >
                        {d}
                      </span>
                    ))
                  ) : (
                    <span className="text-neutral-400 italic text-[11px]">None</span>
                  )}
                </div>
              </div>

              {/* Cascade Dependents */}
              <div>
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Downstream Trigger Cascade:
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {activeDependents.length > 0 ? (
                    activeDependents.map((depId) => (
                      <button
                        key={depId}
                        onClick={() => setActiveCellId(depId)}
                        className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10.5px] text-neutral-700 hover:bg-blue-100 hover:text-blue-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-blue-900 dark:hover:text-blue-200 transition-colors"
                        title="Click to jump to cell"
                      >
                        <ArrowRight size={10} />
                        <span>[{depId}]</span>
                      </button>
                    ))
                  ) : (
                    <span className="text-neutral-400 italic text-[11px]">
                      No downstream cells depend on this block
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Notebook Variable Table */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Exported Variables ({Object.keys(symbolMap).length})
            </span>
          </div>

          {Object.keys(symbolMap).length === 0 ? (
            <p className="text-neutral-400 italic">No global variables declared yet.</p>
          ) : (
            <div className="divide-y divide-neutral-150 rounded-lg border border-neutral-200/80 bg-white dark:divide-neutral-800 dark:border-neutral-800/80 dark:bg-[#202020]">
              {Object.entries(symbolMap).map(([sym, meta]) => (
                <div key={sym} className="flex items-center justify-between p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                      {sym}
                    </span>
                    <button
                      onClick={() => setActiveCellId(meta.definedBy)}
                      className="rounded bg-neutral-100 px-1.5 py-0.2 font-mono text-[10px] text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 transition-colors"
                      title="Defined in cell"
                    >
                      [{meta.definedBy}]
                    </button>
                  </div>

                  <div className="text-[11px] text-neutral-400">
                    {meta.readBy.length > 0 ? (
                      <span>read by {meta.readBy.length} {meta.readBy.length === 1 ? "cell" : "cells"}</span>
                    ) : (
                      <span className="italic">unused</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
