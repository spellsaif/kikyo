export interface OutputData {
  kind: "stream" | "execute_result" | "display_data" | "error" | "aborted";
  data: any;
}

export interface CellData {
  id: string;
  source: string;
  cell_type?: "code" | "markdown";
  outputs: OutputData[];
  status: "idle" | "running" | "error" | "aborted";
  executionCount?: number;
  executionDuration?: number;
}

export type ClientMsg =
  | { op: "run"; cell_id: string }
  | { op: "run_reactive"; cell_id: string }
  | { op: "interrupt" }
  | { op: "restart_kernel" }
  | { op: "update_cell"; cell_id: string; source: string }
  | { op: "change_type"; cell_id: string; cell_type: "code" | "markdown" }
  | { op: "insert_cell"; cell_id: string; after_id?: string; before_id?: string; cell_type?: "code" | "markdown" }
  | { op: "delete_cell"; cell_id: string }
  | { op: "move_cell"; cell_id: string; direction: "up" | "down" }
  | { op: "reorder_cells"; cell_ids: string[] }
  | { op: "complete"; cell_id: string; code: string; cursor_pos: number };

export type ServerMsg =
  | { op: "event"; cell_id: string; kind: string; data: any }
  | {
      op: "graph";
      duplicates: Record<string, string[]>;
      stale: string[];
      cell_info?: Record<string, { defines: string[]; reads: string[]; mutations: string[] }>;
      dependents?: Record<string, string[]>;
    }
  | { op: "cycle"; cycle_cells: string[]; message: string }
  | { op: "aborted"; cell_id: string; reason: string }
  | {
      op: "complete_reply";
      cell_id: string;
      matches: string[];
      cursor_start: number;
      cursor_end: number;
    };
