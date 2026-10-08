import type { ClientMsg, ServerMsg } from "./types";
import { useKikyoStore } from "./store";

export class KikyoWSClient {
  private ws: WebSocket | null = null;
  private name: string;
  private isDestroyed = false;

  constructor(name: string) {
    this.name = name;
    this.connect();
  }

  private connect() {
    if (this.isDestroyed) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}/ws/notebook/${this.name}`);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {};

    this.ws.onclose = () => {
      if (!this.isDestroyed) {
        setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg: ServerMsg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error("Failed to parse JSON WS message:", e);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Decode Uint8Array for text or CRDT frames
        try {
          const text = new TextDecoder().decode(event.data);
          const msg: ServerMsg = JSON.parse(text);
          this.handleServerMessage(msg);
        } catch {
          // Binary CRDT frame
        }
      }
    };
  }

  private completionResolvers = new Map<
    string,
    (res: { matches: string[]; cursor_start: number; cursor_end: number }) => void
  >();

  private handleServerMessage(msg: ServerMsg) {
    const store = useKikyoStore.getState();

    if (msg.op === "event") {
      if (msg.kind === "status") {
        const state = msg.data.execution_state;
        if (msg.data.restarted) {
          store.setKernelStatus("idle");
        } else if (state === "busy") {
          store.setKernelStatus("busy");
          if (msg.cell_id) {
            store.setCellStatus(msg.cell_id, "running");
            store.clearOutputs(msg.cell_id);
          }
        } else if (state === "idle") {
          store.setKernelStatus("idle");
          if (msg.cell_id) {
            const currentCell = store.cells.find((c) => c.id === msg.cell_id);
            if (currentCell?.status !== "error") {
              store.setCellStatus(msg.cell_id, "idle");
            }
            if (typeof msg.data.duration === "number") {
              store.setCellDuration(msg.cell_id, msg.data.duration);
            }
          }
        }
      } else if (msg.kind === "error") {
        store.setCellStatus(msg.cell_id, "error");
        store.appendOutput(msg.cell_id, { kind: "error", data: msg.data });
      } else {
        store.appendOutput(msg.cell_id, { kind: msg.kind as any, data: msg.data });
      }
    } else if (msg.op === "graph") {
      store.setDuplicates(msg.duplicates || {});
      store.setGraphInfo({
        cell_info: msg.cell_info,
        dependents: msg.dependents,
      });
    } else if (msg.op === "cycle") {
      store.setCycleWarning({ cells: msg.cycle_cells, message: msg.message });
    } else if (msg.op === "aborted") {
      store.setCellStatus(msg.cell_id, "aborted");
      store.appendOutput(msg.cell_id, {
        kind: "aborted",
        data: { reason: msg.reason },
      });
    } else if (msg.op === "complete_reply") {
      const resolver = this.completionResolvers.get(msg.cell_id);
      if (resolver) {
        this.completionResolvers.delete(msg.cell_id);
        resolver({
          matches: msg.matches,
          cursor_start: msg.cursor_start,
          cursor_end: msg.cursor_end,
        });
      }
    }
  }

  requestCompletion(
    cell_id: string,
    code: string,
    cursor_pos: number
  ): Promise<{ matches: string[]; cursor_start: number; cursor_end: number }> {
    return new Promise((resolve) => {
      this.completionResolvers.set(cell_id, resolve);
      setTimeout(() => {
        if (this.completionResolvers.has(cell_id)) {
          this.completionResolvers.delete(cell_id);
          resolve({ matches: [], cursor_start: cursor_pos, cursor_end: cursor_pos });
        }
      }, 2000);
      this.send({ op: "complete", cell_id, code, cursor_pos });
    });
  }

  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.isDestroyed = true;
    if (this.ws) {
      this.ws.close();
    }
  }
}
