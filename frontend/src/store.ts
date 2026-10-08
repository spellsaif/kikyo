import { create } from "zustand";
import type { CellData, OutputData } from "./types";

interface KikyoState {
  theme: "dark" | "light";
  fullWidth: boolean;
  mode: "command" | "edit";
  notebookName: string;
  notebooks: string[];
  cells: CellData[];
  activeCellId: string | null;
  duplicates: Record<string, string[]>;
  cycleWarning: { cells: string[]; message: string } | null;
  kernelStatus: "idle" | "busy" | "restarting";
  graphInfo: {
    cell_info: Record<string, { defines: string[]; reads: string[]; mutations: string[] }>;
    dependents: Record<string, string[]>;
  };
  showCommandPalette: boolean;
  showGraphDrawer: boolean;
  showModeHelper: boolean;
  reactiveExecution: boolean;

  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  toggleFullWidth: () => void;
  toggleReactiveExecution: () => void;
  setMode: (mode: "command" | "edit") => void;
  setNotebookName: (name: string) => void;
  setNotebooks: (list: string[]) => void;
  setCells: (cells: CellData[]) => void;
  setActiveCellId: (id: string | null) => void;
  setKernelStatus: (status: "idle" | "busy" | "restarting") => void;
  setGraphInfo: (info: {
    cell_info?: Record<string, { defines: string[]; reads: string[]; mutations: string[] }>;
    dependents?: Record<string, string[]>;
  }) => void;
  setShowCommandPalette: (show: boolean) => void;
  setShowGraphDrawer: (show: boolean) => void;
  setShowModeHelper: (show: boolean) => void;
  setCellDuration: (id: string, duration: number) => void;
  addCell: (afterId?: string, cellType?: "code" | "markdown") => string;
  addCellAbove: (targetId: string, cellType?: "code" | "markdown") => string;
  changeCellType: (id: string, cellType: "code" | "markdown") => void;
  deleteCell: (id: string) => void;
  moveCellUp: (id: string) => void;
  moveCellDown: (id: string) => void;
  updateCellSource: (id: string, source: string) => void;
  appendOutput: (id: string, output: OutputData) => void;
  clearOutputs: (id: string) => void;
  clearAllOutputs: () => void;
  setCellStatus: (id: string, status: CellData["status"]) => void;
  setDuplicates: (dups: Record<string, string[]>) => void;
  setCycleWarning: (warning: { cells: string[]; message: string } | null) => void;
}

const savedTheme =
  (typeof window !== "undefined" && (localStorage.getItem("kikyo_theme") as "dark" | "light")) || "dark";
const savedFullWidth =
  typeof window !== "undefined" && localStorage.getItem("kikyo_full_width") === "true";

export const useKikyoStore = create<KikyoState>((set) => ({
  theme: savedTheme,
  fullWidth: savedFullWidth,
  mode: "command",
  notebookName: "analysis",
  notebooks: [],
  cells: [],
  activeCellId: null,
  duplicates: {},
  cycleWarning: null,
  kernelStatus: "idle",
  graphInfo: { cell_info: {}, dependents: {} },
  showCommandPalette: false,
  showGraphDrawer: false,
  showModeHelper: true,
  reactiveExecution: true,

  toggleReactiveExecution: () =>
    set((state) => ({ reactiveExecution: !state.reactiveExecution })),

  setTheme: (theme) => {
    localStorage.setItem("kikyo_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },

  toggleTheme: () => {
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("kikyo_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    });
  },

  toggleFullWidth: () => {
    set((state) => {
      const next = !state.fullWidth;
      localStorage.setItem("kikyo_full_width", String(next));
      return { fullWidth: next };
    });
  },

  setMode: (mode) => set({ mode }),
  setNotebookName: (notebookName) => set({ notebookName }),
  setNotebooks: (notebooks) => set({ notebooks }),
  setCells: (cells) => set({ cells }),
  setActiveCellId: (activeCellId) => set({ activeCellId }),

  addCell: (afterId, cellType = "code") => {
    const newId = "c" + Math.random().toString(36).substring(2, 8);
    set((state) => {
      const newCell: CellData = {
        id: newId,
        source: "",
        cell_type: cellType,
        outputs: [],
        status: "idle",
      };
      if (!afterId) return { cells: [...state.cells, newCell], activeCellId: newId };
      const index = state.cells.findIndex((c) => c.id === afterId);
      if (index === -1) return { cells: [...state.cells, newCell], activeCellId: newId };
      const next = [...state.cells];
      next.splice(index + 1, 0, newCell);
      return { cells: next, activeCellId: newId };
    });
    return newId;
  },

  addCellAbove: (targetId, cellType = "code") => {
    const newId = "c" + Math.random().toString(36).substring(2, 8);
    set((state) => {
      const newCell: CellData = {
        id: newId,
        source: "",
        cell_type: cellType,
        outputs: [],
        status: "idle",
      };
      const index = state.cells.findIndex((c) => c.id === targetId);
      if (index === -1 || index === 0) {
        return { cells: [newCell, ...state.cells], activeCellId: newId };
      }
      const next = [...state.cells];
      next.splice(index, 0, newCell);
      return { cells: next, activeCellId: newId };
    });
    return newId;
  },

  changeCellType: (id, cellType) =>
    set((state) => ({
      cells: state.cells.map((c) =>
        c.id === id ? { ...c, cell_type: cellType } : c
      ),
    })),

  deleteCell: (id) =>
    set((state) => ({
      cells: state.cells.filter((c) => c.id !== id),
      activeCellId: state.activeCellId === id ? null : state.activeCellId,
    })),

  moveCellUp: (id) =>
    set((state) => {
      const idx = state.cells.findIndex((c) => c.id === id);
      if (idx <= 0) return state;
      const next = [...state.cells];
      const temp = next[idx - 1];
      next[idx - 1] = next[idx];
      next[idx] = temp;
      return { cells: next };
    }),

  moveCellDown: (id) =>
    set((state) => {
      const idx = state.cells.findIndex((c) => c.id === id);
      if (idx === -1 || idx >= state.cells.length - 1) return state;
      const next = [...state.cells];
      const temp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = temp;
      return { cells: next };
    }),

  updateCellSource: (id, source) =>
    set((state) => ({
      cells: state.cells.map((c) => (c.id === id ? { ...c, source } : c)),
    })),

  appendOutput: (id, output) =>
    set((state) => ({
      cells: state.cells.map((c) => {
        if (c.id !== id) return c;
        if (
          output.kind === "stream" &&
          c.outputs.length > 0 &&
          c.outputs[c.outputs.length - 1].kind === "stream" &&
          c.outputs[c.outputs.length - 1].data?.name === output.data?.name
        ) {
          const last = c.outputs[c.outputs.length - 1];
          const merged = {
            ...last,
            data: {
              ...last.data,
              text: (last.data.text || "") + (output.data.text || ""),
            },
          };
          return {
            ...c,
            outputs: [...c.outputs.slice(0, -1), merged],
          };
        }
        return { ...c, outputs: [...c.outputs, output] };
      }),
    })),

  clearOutputs: (id) =>
    set((state) => ({
      cells: state.cells.map((c) => (c.id === id ? { ...c, outputs: [] } : c)),
    })),

  clearAllOutputs: () =>
    set((state) => ({
      cells: state.cells.map((c) => ({ ...c, outputs: [] })),
    })),

  setCellStatus: (id, status) =>
    set((state) => ({
      cells: state.cells.map((c) => (c.id === id ? { ...c, status } : c)),
    })),

  setCellDuration: (id, duration) =>
    set((state) => ({
      cells: state.cells.map((c) => (c.id === id ? { ...c, executionDuration: duration } : c)),
    })),

  setKernelStatus: (kernelStatus) => set({ kernelStatus }),
  setGraphInfo: (info) =>
    set((state) => ({
      graphInfo: {
        cell_info: info.cell_info || state.graphInfo.cell_info,
        dependents: info.dependents || state.graphInfo.dependents,
      },
    })),
  setShowCommandPalette: (showCommandPalette) => set({ showCommandPalette }),
  setShowGraphDrawer: (showGraphDrawer) => set({ showGraphDrawer }),
  setShowModeHelper: (showModeHelper) => set({ showModeHelper }),
  setDuplicates: (duplicates) => set({ duplicates }),
  setCycleWarning: (cycleWarning) => set({ cycleWarning }),
}));
