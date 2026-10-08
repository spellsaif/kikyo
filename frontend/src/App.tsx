import { useEffect, useState, useRef } from "react";
import {
  Play,
  Download,
  Square,
  RotateCcw,
  Sun,
  Moon,
  Plus,
  Maximize2,
  Minimize2,
  Loader2,
  Layers,
  Cpu,
  FileCode2,
  HelpCircle,
  X,
  FileText,
  AlertOctagon,
  Trash2,
  AlertTriangle,
  Command,
  Zap,
  MoreHorizontal,
  BookOpen,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cell } from "./Cell";
import { KikyoWSClient } from "./ws";
import { useKikyoStore } from "./store";
import { CommandPalette } from "./CommandPalette";
import { ReactiveDrawer } from "./ReactiveDrawer";
import { HomeDocs } from "./HomeDocs";

/**
 * High-performance collision detection for single-column notebook blocks:
 * 1. Checks direct pointer containment
 * 2. Checks vertical (Y-axis) row intersection, ensuring tall/large cells are effortlessly
 *    dragged over and swapped without requiring extreme center-point Euclidean crossing
 * 3. Falls back to closestCenter for edge cases
 */
const customCollisionDetection: CollisionDetection = (args) => {
  // 1. Direct pointer collision check
  const directPointerCollisions = pointerWithin(args);
  if (directPointerCollisions.length > 0) {
    return directPointerCollisions;
  }

  // 2. Vertical slice check (Y-axis proximity for single-column notebook)
  const { droppableContainers, droppableRects, pointerCoordinates } = args;
  if (pointerCoordinates && droppableRects) {
    const py = pointerCoordinates.y;
    let closestContainer: (typeof droppableContainers)[number] | null = null;
    let minDistance = Infinity;

    for (const container of droppableContainers) {
      const rect = droppableRects.get(container.id);
      if (!rect) continue;

      // Pointer is within the vertical bounds of this row
      if (py >= rect.top && py <= rect.bottom) {
        return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
      }

      // Distance to this container vertically
      const dist = py < rect.top ? rect.top - py : py - rect.bottom;
      if (dist < minDistance) {
        minDistance = dist;
        closestContainer = container;
      }
    }

    if (closestContainer) {
      return [{ id: closestContainer.id, data: { droppableContainer: closestContainer, value: minDistance } }];
    }
  }

  // 3. Fallback
  return closestCenter(args);
};

function SortableCellItem({
  cell,
  ws,
}: {
  cell: any;
  ws: KikyoWSClient | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cell.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 40 : undefined,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Cell id={cell.id} ws={ws} dragHandleProps={{ attributes, listeners }} />
    </div>
  );
}

export default function App() {
  const [activeNb, setActiveNb] = useState("analysis");
  const [viewMode, setViewMode] = useState<"notebook" | "home">("notebook");
  const [isLoaded, setIsLoaded] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Notion-style inline title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(activeNb);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const theme = useKikyoStore((s) => s.theme);
  const toggleTheme = useKikyoStore((s) => s.toggleTheme);
  const fullWidth = useKikyoStore((s) => s.fullWidth);
  const toggleFullWidth = useKikyoStore((s) => s.toggleFullWidth);

  const mode = useKikyoStore((s) => s.mode);
  const reactiveExecution = useKikyoStore((s) => s.reactiveExecution);
  const toggleReactiveExecution = useKikyoStore((s) => s.toggleReactiveExecution);

  const kernelStatus = useKikyoStore((s) => s.kernelStatus);
  const showGraphDrawer = useKikyoStore((s) => s.showGraphDrawer);
  const setShowGraphDrawer = useKikyoStore((s) => s.setShowGraphDrawer);
  const showModeHelper = useKikyoStore((s) => s.showModeHelper);
  const setShowModeHelper = useKikyoStore((s) => s.setShowModeHelper);
  const setShowCommandPalette = useKikyoStore((s) => s.setShowCommandPalette);

  const notebooks = useKikyoStore((s) => s.notebooks);
  const setNotebooks = useKikyoStore((s) => s.setNotebooks);
  const cells = useKikyoStore((s) => s.cells);
  const setCells = useKikyoStore((s) => s.setCells);
  const addCell = useKikyoStore((s) => s.addCell);
  const setNotebookName = useKikyoStore((s) => s.setNotebookName);
  const cycleWarning = useKikyoStore((s) => s.cycleWarning);
  const setCycleWarning = useKikyoStore((s) => s.setCycleWarning);

  // Dedicated WebSocket lifecycle (auto-closes old clients when notebook changes or home view)
  const [ws, setWs] = useState<KikyoWSClient | null>(null);

  useEffect(() => {
    if (!activeNb || viewMode === "home") {
      setWs(null);
      return;
    }
    const client = new KikyoWSClient(activeNb);
    setWs(client);
    return () => {
      client.close();
    };
  }, [activeNb, viewMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Sync title text whenever active notebook changes
  useEffect(() => {
    setTitleText(activeNb);
    setNotebookName(activeNb);
    setIsEditingTitle(false);
    setTitleError(null);
  }, [activeNb, setNotebookName]);

  // Fetch notebook list
  useEffect(() => {
    fetch("/api/notebooks")
      .then((r) => r.json())
      .then((list: string[]) => {
        setNotebooks(list);
        if (list.length > 0) {
          if (!activeNb || !list.includes(activeNb)) {
            setActiveNb(list[0]);
          }
        } else {
          setActiveNb("");
          setViewMode("home");
        }
      })
      .catch((e) => console.error("Error loading notebooks:", e));
  }, [setNotebooks]);

  // Fetch active notebook cells
  useEffect(() => {
    if (!activeNb || viewMode === "home") {
      setIsLoaded(true);
      return;
    }
    setIsLoaded(false);
    fetch(`/api/notebook/${activeNb}/cells`)
      .then((r) => {
        if (!r.ok) {
          return fetch(`/api/notebooks/${activeNb}`, { method: "POST" })
            .then(() => fetch(`/api/notebook/${activeNb}/cells`))
            .then((res) => res.json());
        }
        return r.json();
      })
      .then((data) => {
        setCells(
          data.map((c: any) => ({
            id: c.id,
            source: c.source || "",
            cell_type: c.cell_type || "code",
            outputs: c.outputs || [],
            status: "idle",
          }))
        );
        setIsLoaded(true);
      })
      .catch((e) => {
        console.error("Error fetching cells:", e);
        setIsLoaded(true);
      });
  }, [activeNb, viewMode, setCells]);

  // dnd-kit sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragCell = activeDragId ? cells.find((c) => c.id === activeDragId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cells.findIndex((c) => c.id === active.id);
      const newIndex = cells.findIndex((c) => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newCells = arrayMove(cells, oldIndex, newIndex);
        setCells(newCells);
        if (ws) {
          ws.send({ op: "reorder_cells", cell_ids: newCells.map((c) => c.id) });
        }
      }
    }
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
  };

  // Global Jupyter Command Mode & Edit Mode Navigation
  useEffect(() => {
    let lastKeyDTime = 0;
    let lastKeyITime = 0;
    let lastKey0Time = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useKikyoStore.getState();
      const { mode: currentMode, activeCellId, cells: currentCells } = store;

      // Global Ctrl + K / Cmd + K : Open command palette anywhere
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        store.setShowCommandPalette(!store.showCommandPalette);
        return;
      }

      // Global Ctrl + G / Cmd + G : Toggle reactive graph drawer anywhere
      if ((e.ctrlKey || e.metaKey) && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        store.setShowGraphDrawer(!store.showGraphDrawer);
        return;
      }

      // Escape always transitions to Command Mode and closes modals
      if (e.key === "Escape") {
        if (store.showCommandPalette) {
          store.setShowCommandPalette(false);
          return;
        }
        if (store.showGraphDrawer) {
          store.setShowGraphDrawer(false);
          return;
        }
        store.setMode("command");
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      // Check if user is actively typing in a form or CodeMirror editor
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.classList.contains("cm-content");

      // In Edit Mode or when typing in an input, don't hijack keys
      if (currentMode === "edit" || isInputFocused) {
        return;
      }

      // In Command Mode:
      // P or / : Open command palette
      if (e.key === "p" || e.key === "P" || e.key === "/") {
        e.preventDefault();
        store.setShowCommandPalette(true);
        return;
      }

      // 0, 0 : Restart Python runtime
      if (e.key === "0") {
        const now = Date.now();
        if (now - lastKey0Time < 800) {
          e.preventDefault();
          if (ws) ws.send({ op: "restart_kernel" });
          lastKey0Time = 0;
        } else {
          lastKey0Time = now;
        }
        return;
      }

      // I, I : Interrupt execution
      if (e.key === "i" || e.key === "I") {
        const now = Date.now();
        if (now - lastKeyITime < 800) {
          e.preventDefault();
          if (ws) ws.send({ op: "interrupt" });
          lastKeyITime = 0;
        } else {
          lastKeyITime = now;
        }
        return;
      }

      // In Command Mode:
      if (!activeCellId && currentCells.length > 0) {
        store.setActiveCellId(currentCells[0].id);
        return;
      }
      if (!activeCellId) return;

      const currentIndex = currentCells.findIndex((c) => c.id === activeCellId);
      if (currentIndex === -1) return;
      const activeCell = currentCells[currentIndex];

      // H or ? : toggle shortcuts modal
      if (e.key === "h" || e.key === "H" || e.key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // Enter : switch to Edit Mode
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        store.setMode("edit");
        return;
      }

      // Shift + Enter : run active block & advance
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        if (ws && activeCell.cell_type !== "markdown") {
          ws.send({
            op: store.reactiveExecution ? "run_reactive" : "run",
            cell_id: activeCellId,
          });
        }
        if (currentIndex === currentCells.length - 1) {
          const newId = store.addCell(activeCellId, "code");
          if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: activeCellId, cell_type: "code" });
        } else {
          store.setActiveCellId(currentCells[currentIndex + 1].id);
        }
        return;
      }

      // Ctrl + Enter : run in place
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (ws && activeCell.cell_type !== "markdown") {
          ws.send({
            op: store.reactiveExecution ? "run_reactive" : "run",
            cell_id: activeCellId,
          });
        }
        return;
      }

      // A : Insert cell above
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        const newId = store.addCellAbove(activeCellId, "code");
        if (ws) ws.send({ op: "insert_cell", cell_id: newId, before_id: activeCellId, cell_type: "code" });
        return;
      }

      // B : Insert cell below
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        const newId = store.addCell(activeCellId, "code");
        if (ws) ws.send({ op: "insert_cell", cell_id: newId, after_id: activeCellId, cell_type: "code" });
        return;
      }

      // M : Switch cell type to Markdown
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        store.changeCellType(activeCellId, "markdown");
        if (ws) ws.send({ op: "change_type", cell_id: activeCellId, cell_type: "markdown" });
        return;
      }

      // Y : Switch cell type to Code
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        store.changeCellType(activeCellId, "code");
        if (ws) ws.send({ op: "change_type", cell_id: activeCellId, cell_type: "code" });
        return;
      }

      // D, D : Delete cell
      if (e.key === "d" || e.key === "D") {
        const now = Date.now();
        if (now - lastKeyDTime < 800) {
          e.preventDefault();
          const nextActive =
            currentCells[currentIndex + 1]?.id || currentCells[currentIndex - 1]?.id || null;
          store.deleteCell(activeCellId);
          if (nextActive) store.setActiveCellId(nextActive);
          if (ws) ws.send({ op: "delete_cell", cell_id: activeCellId });
          lastKeyDTime = 0;
        } else {
          lastKeyDTime = now;
        }
        return;
      }

      // Cell reordering: Alt+Up / Alt+Down
      if (e.altKey && (e.key === "ArrowUp" || e.key === "k")) {
        e.preventDefault();
        store.moveCellUp(activeCellId);
        if (ws) ws.send({ op: "move_cell", cell_id: activeCellId, direction: "up" });
        return;
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "j")) {
        e.preventDefault();
        store.moveCellDown(activeCellId);
        if (ws) ws.send({ op: "move_cell", cell_id: activeCellId, direction: "down" });
        return;
      }

      // J or ArrowDown : Navigate down
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (currentIndex < currentCells.length - 1) {
          store.setActiveCellId(currentCells[currentIndex + 1].id);
        }
        return;
      }

      // K or ArrowUp : Navigate up
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (currentIndex > 0) {
          store.setActiveCellId(currentCells[currentIndex - 1].id);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ws]);

  // Instant Notion-style new page creation (no browser prompt!)
  const handleCreateNotebook = async () => {
    let base = "untitled";
    let candidate = base;
    let counter = 1;
    while (notebooks.includes(candidate)) {
      candidate = `${base}_${counter}`;
      counter++;
    }

    try {
      const res = await fetch(`/api/notebooks/${candidate}`, { method: "POST" });
      if (res.ok) {
        setNotebooks([...notebooks, candidate]);
        setActiveNb(candidate);
        setViewMode("notebook");
        setTimeout(() => {
          setIsEditingTitle(true);
        }, 100);
      }
    } catch (e) {
      console.error("Failed to create notebook:", e);
    }
  };

  // Commit Notion-style inline rename
  const commitRename = async (rawName: string) => {
    const trimmed = rawName.trim().replace(/\.py$/, "");
    if (!trimmed || trimmed === activeNb) {
      setTitleText(activeNb);
      setIsEditingTitle(false);
      setTitleError(null);
      return;
    }

    const cleanName = trimmed.replace(/[^\w\-]/g, "_");
    try {
      const res = await fetch(`/api/notebooks/${activeNb}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: cleanName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTitleError(data.detail || "Rename failed");
        return;
      }
      setNotebooks(notebooks.map((n) => (n === activeNb ? cleanName : n)));
      setActiveNb(cleanName);
      setTitleText(cleanName);
      setIsEditingTitle(false);
      setTitleError(null);
    } catch {
      setTitleError("Network error while renaming");
    }
  };

  // Confirm delete notebook from in-app modal
  const handleConfirmDelete = async () => {
    const target = deleteTarget || activeNb;
    if (!target) return;
    try {
      const res = await fetch(`/api/notebooks/${target}`, {
        method: "DELETE",
      });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      if (!res.ok) {
        const data = await res.json();
        console.error("Delete failed:", data.detail);
        return;
      }

      const remaining = notebooks.filter((nb) => nb !== target);
      setNotebooks(remaining);
      if (remaining.length > 0) {
        setActiveNb(remaining[0]);
        setViewMode("notebook");
      } else {
        setActiveNb("");
        setViewMode("home");
      }
    } catch (e) {
      console.error("Delete error:", e);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleRunAll = () => {
    if (!ws) return;
    cells.forEach((c) => {
      if (c.cell_type !== "markdown") {
        ws.send({ op: "run", cell_id: c.id });
      }
    });
  };

  const handleAddBottom = (type: "code" | "markdown") => {
    const newId = addCell(undefined, type);
    if (ws) ws.send({ op: "insert_cell", cell_id: newId, cell_type: type });
  };

  return (
    <div className="min-h-screen bg-white text-neutral-800 transition-colors dark:bg-[#191919] dark:text-neutral-100 font-sans antialiased">
      {/* Top Bar Navigation */}
      <header className="sticky top-0 z-40 flex h-11 items-center justify-between border-b border-neutral-200/80 bg-white/95 px-4 backdrop-blur-xs dark:border-neutral-800/80 dark:bg-[#191919]/95 text-xs">
        {/* Left: Breadcrumbs & Notebook Selector */}
        <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <button
            onClick={() => setViewMode(viewMode === "home" && activeNb ? "notebook" : "home")}
            className="flex items-center gap-2 font-semibold text-neutral-800 hover:text-blue-600 dark:text-neutral-100 dark:hover:text-blue-400 transition-colors mr-1 group"
            title="Toggle Kikyo Home & Documentation"
          >
            <img src="/favicon.svg" alt="Kikyo Logo" className="h-4.5 w-4.5 transition-transform group-hover:scale-110" />
            <span className="font-semibold tracking-tight text-[13px]">Kikyo</span>
          </button>
          <span className="text-neutral-300 dark:text-neutral-700">/</span>

          {viewMode === "home" || !activeNb ? (
            <span className="font-medium text-neutral-700 dark:text-neutral-300 px-1 py-0.5">
              Home & Docs
            </span>
          ) : (
            <div className="flex items-center gap-1">
              <select
                value={activeNb}
                onChange={(e) => {
                  setActiveNb(e.target.value);
                  setViewMode("notebook");
                }}
                className="cursor-pointer rounded border border-transparent bg-transparent py-1 pr-3 font-medium text-neutral-800 hover:bg-neutral-100 focus:border-neutral-300 focus:outline-none dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus:border-neutral-700 max-w-[200px] truncate"
              >
                {notebooks.map((nb) => (
                  <option key={nb} value={nb} className="bg-white text-neutral-800 dark:bg-[#202020] dark:text-neutral-100">
                    {nb}.py
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New Notebook Button */}
          <button
            onClick={handleCreateNotebook}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors ml-1"
            title="Create new notebook page"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>

        {/* Right: Actions and Controls */}
        <div className="flex items-center gap-1.5">
          {/* Dedicated Stop Button when kernel is busy or any cell is running */}
          {activeNb && viewMode === "notebook" && (kernelStatus === "busy" || cells.some((c) => c.status === "running")) && (
            <button
              onClick={() => ws?.send({ op: "interrupt" })}
              className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/80 transition-colors shadow-xs animate-pulse cursor-pointer"
              title="Stop execution (Interrupt Python runtime - I, I)"
            >
              <Square size={10} className="fill-current text-rose-600 dark:text-rose-400" />
              <span>Stop</span>
            </button>
          )}

          {/* Kernel Status Indicator */}
          {activeNb && viewMode === "notebook" && (
            <div
              className="flex items-center gap-1.5 rounded-md border border-neutral-200/90 bg-neutral-50/70 px-2.5 py-1 font-mono text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300"
              title={`Python Kernel status: ${kernelStatus}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  kernelStatus === "busy"
                    ? "bg-amber-500 animate-pulse"
                    : kernelStatus === "restarting"
                    ? "bg-blue-500 animate-spin"
                    : "bg-emerald-500"
                }`}
              />
              <span className="hidden md:inline capitalize">{kernelStatus}</span>
            </div>
          )}

          {/* Reactive Execution Flow Toggle */}
          {activeNb && viewMode === "notebook" && (
            <button
              onClick={toggleReactiveExecution}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-all ${
                reactiveExecution
                  ? "border-amber-300/80 bg-amber-50 text-amber-900 shadow-xs dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-neutral-200/90 bg-neutral-100/70 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400"
              }`}
              title={
                reactiveExecution
                  ? "Reactive Flow ON: Running a cell automatically evaluates downstream dependent cells. Click to switch to Classic single-cell mode."
                  : "Classic Mode ON: Running a cell executes ONLY that cell. Click to switch to Reactive DAG mode."
              }
            >
              <Zap
                size={12}
                className={reactiveExecution ? "text-amber-500 fill-amber-500" : "text-neutral-400"}
              />
              <span className="font-semibold hidden sm:inline">
                {reactiveExecution ? "Reactive" : "Classic"}
              </span>
            </button>
          )}

          {/* Active Mode Indicator Badge */}
          {activeNb && viewMode === "notebook" && (
            <div
              className="hidden lg:flex items-center gap-1.5 rounded-md border border-neutral-200/90 bg-neutral-100/70 px-2.5 py-1 text-xs font-mono text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300"
              title={
                mode === "edit"
                  ? "Edit Mode: Active editor has focus. Press Esc to return to Command Mode."
                  : "Command Mode: Cell selected. Press Enter to edit, or navigate using shortcuts."
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  mode === "edit" ? "bg-emerald-500" : "bg-blue-500"
                }`}
              />
              <span className="font-medium">
                {mode === "edit" ? "Edit Mode" : "Command Mode"}
              </span>
              <span className="text-neutral-400 text-[11px]">
                ({mode === "edit" ? "Esc" : "Enter"})
              </span>
            </div>
          )}

          {/* Command Palette Trigger Button */}
          <button
            onClick={() => setShowCommandPalette(true)}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200/90 bg-neutral-50/70 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            title="Open Command Palette (Ctrl+K or Cmd+K)"
          >
            <Command size={12} className="text-neutral-500 dark:text-neutral-400" />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="rounded border border-neutral-200 bg-white px-1 py-0.2 font-mono text-[10px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              Ctrl+K
            </kbd>
          </button>

          {/* Reactive Graph & Variables Drawer Toggle */}
          {activeNb && viewMode === "notebook" && (
            <button
              onClick={() => setShowGraphDrawer(!showGraphDrawer)}
              className={`flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                showGraphDrawer
                  ? "border-blue-500/80 bg-blue-50 text-blue-700 dark:border-blue-500/80 dark:bg-blue-950/60 dark:text-blue-300"
                  : "border-neutral-200/80 bg-neutral-50/70 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
              title="Toggle Reactive Graph & Variable Inspector (Ctrl+G)"
            >
              <Layers size={12} />
              <span className="hidden md:inline">Graph</span>
            </button>
          )}

          {/* Notion-Style "..." More Actions Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="rounded border border-neutral-200/80 bg-neutral-50/70 p-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              title="More options and notebook settings"
            >
              <MoreHorizontal size={14} />
            </button>

            {showMoreMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-[#1f1f1f] z-50 animate-in fade-in duration-75 text-xs text-neutral-700 dark:text-neutral-200"
                onClick={() => setShowMoreMenu(false)}
              >
                {activeNb && viewMode === "notebook" && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Execution
                    </div>
                    <button
                      onClick={handleRunAll}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                    >
                      <Play size={12} />
                      <span>Run all cells</span>
                    </button>
                    <button
                      onClick={() => ws?.send({ op: "interrupt" })}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-rose-50 text-rose-600 dark:hover:bg-rose-950/40 dark:text-rose-400 text-left"
                    >
                      <Square size={12} className="fill-current text-rose-600 dark:text-rose-400" />
                      <span>Stop execution (Interrupt)</span>
                    </button>
                    <button
                      onClick={() => ws?.send({ op: "restart_kernel" })}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                    >
                      <RotateCcw size={12} />
                      <span>Restart Python kernel</span>
                    </button>
                    <div className="my-1 border-t border-neutral-150 dark:border-neutral-800" />
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Export
                    </div>
                    <a
                      href={`/api/notebook/${activeNb}/export`}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <Download size={12} />
                      <span>Jupyter Notebook (.ipynb)</span>
                    </a>
                    <a
                      href={`/api/notebook/${activeNb}/export/py`}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <FileCode2 size={12} />
                      <span>Python Script (.py)</span>
                    </a>
                    <div className="my-1 border-t border-neutral-150 dark:border-neutral-800" />
                  </>
                )}

                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  View & Preferences
                </div>
                <button
                  onClick={toggleFullWidth}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                >
                  <div className="flex items-center gap-2">
                    {fullWidth ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    <span>Full width layout</span>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-400">{fullWidth ? "ON" : "OFF"}</span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                >
                  <div className="flex items-center gap-2">
                    {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
                    <span>Theme</span>
                  </div>
                  <span className="capitalize font-mono text-[10px] text-neutral-400">{theme}</span>
                </button>
                <button
                  onClick={() => setShowShortcuts(true)}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                >
                  <HelpCircle size={12} />
                  <span>Keyboard shortcuts</span>
                </button>
                <button
                  onClick={() => setViewMode("home")}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                >
                  <BookOpen size={12} />
                  <span>Documentation & Guide</span>
                </button>

                {activeNb && viewMode === "notebook" && (
                  <>
                    <div className="my-1 border-t border-neutral-150 dark:border-neutral-800" />
                    <button
                      onClick={() => {
                        setDeleteTarget(activeNb);
                        setShowDeleteModal(true);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 text-left"
                    >
                      <Trash2 size={12} />
                      <span>Delete notebook</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Jupyter Workflow Guidance Bar */}
      {showModeHelper && (
        <div className="flex items-center justify-between border-b border-neutral-200/60 bg-neutral-50/60 px-4 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800/60 dark:bg-[#151515] dark:text-neutral-400 select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Workflow:
            </span>
            <span>
              Click cell to edit · <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.2 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-800">Shift+Enter</kbd> runs cell & advances
            </span>
            <span>·</span>
            <span>
              <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.2 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-800">Esc</kbd> enters Command Mode (<kbd className="font-mono text-[10px]">A</kbd>/<kbd className="font-mono text-[10px]">B</kbd> add, <kbd className="font-mono text-[10px]">DD</kbd> delete, <kbd className="font-mono text-[10px]">Alt+↑/↓</kbd> reorder)
            </span>
            <span>·</span>
            <span>
              <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.2 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-800">Ctrl+K</kbd> palette
            </span>
          </div>
          <button
            onClick={() => setShowModeHelper(false)}
            className="rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Dismiss guidance bar"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Cycle Warning Banner */}
      {cycleWarning && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertOctagon size={14} className="text-amber-600 dark:text-amber-400" />
            <span>Cycle detected in reactive graph cells: {cycleWarning.cells.join(", ")}</span>
          </div>
          <button
            onClick={() => setCycleWarning(null)}
            className="rounded px-2 py-0.5 hover:bg-amber-200/60 dark:hover:bg-amber-900/60"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main View: Home/Docs or Notebook Canvas */}
      {viewMode === "home" || !activeNb || notebooks.length === 0 ? (
        <HomeDocs
          notebooks={notebooks}
          onOpenNotebook={(nb) => {
            setActiveNb(nb);
            setViewMode("notebook");
          }}
          onCreateNotebook={handleCreateNotebook}
          onDeleteNotebook={(nb) => {
            setDeleteTarget(nb);
            setShowDeleteModal(true);
          }}
        />
      ) : (
        /* Main Document Canvas */
        <main className={`mx-auto w-full py-8 transition-all duration-150 ${fullWidth ? "max-w-7xl px-8" : "max-w-4xl px-6"}`}>
          {/* Document Notion Header */}
          <div className="mb-6 border-b border-neutral-150 pb-6 dark:border-neutral-800/70">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200/80 bg-neutral-100/70 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300 select-none">
              <FileCode2 size={16} strokeWidth={1.75} />
            </div>

            {/* Notion-Style Inline Editable Title */}
            <div className="group/title relative mb-4">
              {isEditingTitle ? (
                <div className="flex flex-col gap-1">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleText}
                    onChange={(e) => {
                      setTitleText(e.target.value);
                      setTitleError(null);
                    }}
                    onBlur={() => commitRename(titleText)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        setTitleText(activeNb);
                        setIsEditingTitle(false);
                        setTitleError(null);
                      }
                    }}
                    autoFocus
                    placeholder="Untitled Notebook"
                    className="w-full rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-2xl font-semibold tracking-tight text-neutral-900 outline-none ring-2 ring-neutral-200 dark:border-neutral-700 dark:text-neutral-50 dark:ring-neutral-800"
                  />
                  {titleError && (
                    <span className="text-xs font-medium text-rose-500">{titleError}</span>
                  )}
                  <span className="text-[11px] text-neutral-400">Press Enter to save · Esc to cancel</span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-2.5 cursor-text"
                    onClick={() => setIsEditingTitle(true)}
                    title="Click to rename notebook"
                  >
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 hover:text-neutral-600 dark:text-neutral-50 dark:hover:text-neutral-300 transition-colors">
                      {activeNb}
                    </h1>
                    <span className="opacity-0 group-hover/title:opacity-100 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 transition-opacity">
                      Click to rename
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Properties Meta Table */}
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 sm:gap-4">
              <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <Cpu size={13} />
                <span className="font-medium">Runtime:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Python 3.13
                </span>
              </div>

              <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <Layers size={13} />
                <span className="font-medium">Engine:</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  Reactive DAG
                </span>
              </div>

              <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <FileCode2 size={13} />
                <span className="font-medium">Storage:</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {activeNb}.py + .kout
                </span>
              </div>
            </div>
          </div>

          {/* Blocks Stream */}
          {!isLoaded ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-400">
              <Loader2 size={24} className="animate-spin text-neutral-400" />
              <span className="text-xs">Loading notebook document...</span>
            </div>
          ) : cells.length === 0 ? (
            /* Empty Notebook State */
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center dark:border-neutral-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
                <FileCode2 size={20} strokeWidth={1.5} />
              </div>
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                This notebook is empty
              </div>
              <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                Start writing code or documentation. Grab the handle to drag blocks, or press <kbd className="rounded border px-1 py-0.2 font-mono">B</kbd> in Command Mode.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => handleAddBottom("code")}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <Plus size={13} />
                  <span>Add Code Block</span>
                </button>
                <button
                  onClick={() => handleAddBottom("markdown")}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <FileText size={13} />
                  <span>Add Markdown Block</span>
                </button>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={customCollisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={cells.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {cells.map((cell) => (
                    <SortableCellItem key={cell.id} cell={cell} ws={ws} />
                  ))}

                  {/* Bottom Add Buttons */}
                  <div className="mt-6 flex items-center gap-2 pt-2">
                    <button
                      onClick={() => handleAddBottom("code")}
                      className="flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-neutral-50/50 px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
                    >
                      <Plus size={14} />
                      <span>Add code block</span>
                    </button>

                    <button
                      onClick={() => handleAddBottom("markdown")}
                      className="flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-neutral-50/50 px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
                    >
                      <FileText size={14} />
                      <span>Add text (markdown)</span>
                    </button>
                  </div>
                </div>
              </SortableContext>

              <DragOverlay adjustScale={false}>
                {activeDragCell ? (
                  <div className="flex max-h-24 w-full cursor-grabbing items-center justify-between rounded-xl border-2 border-blue-500 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-sm dark:bg-[#1a1a1a]/95 dark:border-blue-400">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <GripVertical size={16} className="text-blue-500 shrink-0" />
                      <span className="rounded bg-neutral-200/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 shrink-0">
                        [{activeDragCell.id}] {activeDragCell.cell_type === "markdown" ? "Text" : "Code"}
                      </span>
                      <span className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-300">
                        {activeDragCell.source.trim().split("\n")[0] || "(empty block)"}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0 ml-3">
                      Moving block
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </main>
      )}

      {/* Notion-Style Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          onClick={() => {
            setShowDeleteModal(false);
            setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-[#1f1f1f]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle size={18} />
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                Delete notebook?
              </h3>
            </div>
            <p className="mb-5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Permanently delete <strong className="text-neutral-800 dark:text-neutral-200">{deleteTarget || activeNb}.py</strong> and its cached output sidecar? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 shadow-xs transition-colors"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-[#1f1f1f]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-neutral-150 pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Jupyter Keyboard Navigation
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  Two-Mode
                </span>
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <h4 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Mode Switching
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Enter Edit Mode on selected cell</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Enter
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Return to Command Mode</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Esc
                    </kbd>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Command Mode (when cell is selected)
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Insert cell above</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      A
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Insert cell below</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      B
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Convert to Code block</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Y
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Convert to Markdown block</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      M
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Move block up / down</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Alt + ↑ / ↓
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Delete selected cell</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      D, D
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Navigate blocks up / down</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      K / J or ↑ / ↓
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Execute cell and advance</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Shift + Enter
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Execute cell in-place</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Ctrl + Enter
                    </kbd>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Edit Mode (inside code editor)
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Trigger runtime autocompletion</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Tab
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Execute & advance</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Shift + Enter
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Return to Command Mode</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Esc
                    </kbd>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Global Shortcuts
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Open Command Palette</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Ctrl + K
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Toggle Reactive Graph Drawer</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      Ctrl + G
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Interrupt kernel execution</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      I, I
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Restart Python kernel</span>
                    <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
                      0, 0
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spotlight Command Palette */}
      <CommandPalette
        ws={ws}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onOpenDeleteModal={() => setShowDeleteModal(true)}
        onStartRename={() => setIsEditingTitle(true)}
      />

      {/* Reactive Graph & Variable Inspector Drawer */}
      <ReactiveDrawer />
    </div>
  );
}
