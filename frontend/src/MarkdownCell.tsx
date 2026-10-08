import React, { useState, useEffect, useRef } from "react";
import { marked } from "marked";
import { Edit3, Check, Trash2, Code2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { useKikyoStore } from "./store";
import type { KikyoWSClient } from "./ws";

interface MarkdownCellProps {
  id: string;
  ws: KikyoWSClient | null;
  dragHandleProps?: {
    attributes: any;
    listeners: any;
  };
}

export function MarkdownCell({ id, ws, dragHandleProps }: MarkdownCellProps) {
  const cell = useKikyoStore((s) => s.cells.find((c) => c.id === id));
  const activeCellId = useKikyoStore((s) => s.activeCellId);
  const setActiveCellId = useKikyoStore((s) => s.setActiveCellId);
  const mode = useKikyoStore((s) => s.mode);
  const setMode = useKikyoStore((s) => s.setMode);
  const updateSource = useKikyoStore((s) => s.updateCellSource);
  const changeCellType = useKikyoStore((s) => s.changeCellType);
  const deleteCell = useKikyoStore((s) => s.deleteCell);
  const moveCellUp = useKikyoStore((s) => s.moveCellUp);
  const moveCellDown = useKikyoStore((s) => s.moveCellDown);

  const [isEditing, setIsEditing] = useState(false);
  const [localSource, setLocalSource] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  if (!cell) return null;

  const isActive = activeCellId === id;

  useEffect(() => {
    setLocalSource(cell.source);
  }, [cell.source]);

  // When switching to edit mode via keyboard or click, focus textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  // If this cell is active and store mode transitions to edit mode, enter editing
  useEffect(() => {
    if (isActive && mode === "edit" && !isEditing) {
      setIsEditing(true);
    } else if (isActive && mode === "command" && isEditing) {
      handleDone();
    }
  }, [isActive, mode]);

  const handleDone = () => {
    setIsEditing(false);
    updateSource(id, localSource);
    if (ws) {
      ws.send({ op: "update_cell", cell_id: id, source: localSource });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handleDone();
      setMode("command");
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleDone();
      setMode("command");
    }
  };

  const handleSwitchToCode = () => {
    changeCellType(id, "code");
    if (ws) {
      ws.send({ op: "change_type", cell_id: id, cell_type: "code" });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCell(id);
    if (ws) {
      ws.send({ op: "delete_cell", cell_id: id });
    }
  };

  // Convert markdown to HTML securely
  const renderedHtml = localSource.trim()
    ? (marked.parse(localSource) as string)
    : "<p class='italic text-neutral-400 dark:text-neutral-500 text-sm'>Empty markdown block. Double-click or press Enter to edit.</p>";

  return (
    <div
      className={`group/block relative my-3 overflow-hidden rounded-lg border border-l-4 transition-all ${
        isActive
          ? isEditing || mode === "edit"
            ? "border-neutral-300 border-l-emerald-500 shadow-md ring-1 ring-emerald-500/30 dark:border-neutral-750 dark:border-l-emerald-500"
            : "border-neutral-300 border-l-blue-500 shadow-md ring-1 ring-blue-500/30 dark:border-neutral-750 dark:border-l-blue-500"
          : "border-neutral-200/90 border-l-transparent hover:border-neutral-300 dark:border-neutral-800/90 dark:hover:border-neutral-700"
      } bg-white dark:bg-[#1c1c1c]`}
      onClick={() => setActiveCellId(id)}
      onDoubleClick={() => {
        setIsEditing(true);
        setMode("edit");
      }}
    >
      {/* Block Header Toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/70 px-2.5 py-1 text-xs select-none dark:border-neutral-800/60 dark:bg-[#171717]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {dragHandleProps && (
            <button
              {...dragHandleProps.listeners}
              {...dragHandleProps.attributes}
              className="cursor-grab active:cursor-grabbing rounded p-0.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors"
              title="Drag to reorder block"
            >
              <GripVertical size={13} />
            </button>
          )}

          <span className="font-mono text-[10.5px] text-neutral-400 dark:text-neutral-500">
            [{id}]
          </span>

          {/* Active focus status badge */}
          {isActive && (
            <span
              className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-medium ${
                isEditing || mode === "edit"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
              }`}
            >
              {isEditing || mode === "edit" ? "Editing" : "Selected"}
            </span>
          )}

          <span className="rounded bg-neutral-200/60 px-1.5 py-0.2 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            Markdown
          </span>
        </div>

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

          {isEditing ? (
            <button
              onClick={handleDone}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
              title="Render markdown (Shift+Enter or Esc)"
            >
              <Check size={12} />
              <span className="font-sans text-[11px] font-medium">Done</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setIsEditing(true);
                setMode("edit");
              }}
              className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Edit markdown"
            >
              <Edit3 size={13} />
            </button>
          )}

          <button
            onClick={handleSwitchToCode}
            className="rounded p-1 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="Convert to Code cell (Y in Command Mode)"
          >
            <Code2 size={13} />
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

      {/* Content Area */}
      {isEditing ? (
        <div className="p-3">
          <textarea
            ref={textareaRef}
            className="w-full resize-y rounded border border-neutral-200 bg-neutral-50/50 p-2.5 font-mono text-[13px] leading-relaxed text-neutral-900 outline-none focus:border-blue-400 focus:bg-white dark:border-neutral-750 dark:bg-neutral-900/40 dark:text-neutral-100 dark:focus:border-blue-500 dark:focus:bg-neutral-900"
            value={localSource}
            placeholder="Write Markdown here... (Shift+Enter or Esc to render)"
            onChange={(e) => setLocalSource(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleDone}
            rows={Math.max(3, localSource.split("\n").length + 1)}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
            <span>Shift + Enter to finish editing</span>
            <span>Esc to return to Command Mode</span>
          </div>
        </div>
      ) : (
        <div
          className="notion-prose min-h-[2.5rem] p-4 text-[14px]"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      )}
    </div>
  );
}
