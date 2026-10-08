"""NotebookSession managing execution, CRDT, sidecar persistence, and decoupled daemon leases."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import WebSocket

from ..collab.protocol import CRDTSessionBridge
from ..kernel.bridge import KernelBridge, KernelEvent
from ..kernel.manager import KernelPool
from ..storage.format import Cell, Notebook, load_file, save_file
from ..reactive.analyzer import analyze, analyze_markdown
from ..reactive.graph import ReactiveGraph
from ..reactive.pipeline import CycleError, topological_run_plan
from ..storage.sidecar import OutputSidecar
from .protocol import (
    CellAborted,
    ChangeCellType,
    ClientMsg,
    CompleteReply,
    CompleteRequest,
    CycleWarning,
    DeleteCell,
    GraphUpdate,
    InsertCell,
    Interrupt,
    RestartKernel,
    KernelOutEvent,
    MoveCell,
    ReorderCells,
    RunCell,
    RunReactive,
    UpdateCell,
    encode,
)

log = logging.getLogger(__name__)


@dataclass
class NotebookSession:
    path: Path
    notebook: Notebook
    sidecar: OutputSidecar
    crdt: CRDTSessionBridge
    graph: ReactiveGraph = field(default_factory=ReactiveGraph)
    bridge: KernelBridge | None = None
    kernel_id: str | None = None
    clients: set[WebSocket] = field(default_factory=set)
    last_disconnected_at: float | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _exec_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @classmethod
    async def open(cls, path: Path, pool: KernelPool) -> NotebookSession:
        nb = load_file(path)
        sidecar = OutputSidecar(path)
        crdt = CRDTSessionBridge()
        crdt.init_cells([(c.id, c.source) for c in nb.cells])

        sess = cls(path=path, notebook=nb, sidecar=sidecar, crdt=crdt)
        for c in nb.cells:
            analysis = analyze_markdown(c.source) if c.cell_type == "markdown" else analyze(c.source)
            sess.graph.upsert(c.id, analysis)

        # Acquire kernel bound to the notebook's directory
        kernel = await pool.acquire(cwd=path.parent)
        sess.kernel_id = kernel.id
        sess.bridge = KernelBridge(kernel)
        await sess.bridge.start()

        log.info("Session opened for %s (kernel=%s)", path.name, kernel.id)
        return sess

    async def close(self, pool: KernelPool) -> None:
        """Explicitly shut down session and release kernel process."""
        if self.bridge:
            await self.bridge.stop()
        if self.kernel_id:
            await pool.release(self.kernel_id)
        log.info("Session closed for %s", self.path.name)

    async def add_client(self, ws: WebSocket) -> None:
        self.clients.add(ws)
        self.last_disconnected_at = None

        # 1. Send CRDT hydration message
        initial_sync = self.crdt.create_initial_sync_message()
        if initial_sync:
            try:
                await ws.send_bytes(initial_sync)
            except Exception:
                pass

        # 2. Send current dependency graph state
        await self._broadcast_graph()

    async def remove_client(self, ws: WebSocket) -> None:
        self.clients.discard(ws)
        if not self.clients:
            # Transition to detached daemon state — keep kernel alive!
            self.last_disconnected_at = time.time()
            log.info("Session %s detached; kernel kept alive under daemon lease", self.path.name)

    # ---------------- Incoming Control & Edit Messages ----------------

    async def handle_control(self, msg: ClientMsg, ws: WebSocket | None = None) -> None:
        match msg:
            case UpdateCell(cell_id=cid, source=src):
                await self._update_cell(cid, src)
            case ChangeCellType(cell_id=cid, cell_type=ctype):
                await self._change_cell_type(cid, ctype)
            case InsertCell(cell_id=cid, after_id=aid, before_id=bid, cell_type=ctype):
                await self._insert_cell(cid, after_id=aid, before_id=bid, cell_type=ctype)
            case DeleteCell(cell_id=cid):
                await self._delete_cell(cid)
            case MoveCell(cell_id=cid, direction=dir):
                await self._move_cell(cid, dir)
            case ReorderCells(cell_ids=cids):
                await self._reorder_cells(cids)
            case CompleteRequest(cell_id=cid, code=code, cursor_pos=pos):
                await self._complete(cid, code, pos, ws)
            case RunCell(cell_id=cid):
                await self._run_pipeline([cid])
            case RunReactive(cell_id=cid):
                try:
                    plan = topological_run_plan(self.graph, cid)
                    await self._run_pipeline(plan)
                except CycleError as e:
                    warn = CycleWarning(cycle_cells=e.cycle_nodes, message=str(e))
                    await self._broadcast(encode(warn))
            case Interrupt():
                if self.bridge and self.bridge.kernel:
                    await self.bridge.kernel.interrupt()
            case RestartKernel():
                if self.bridge and self.bridge.kernel:
                    await self.bridge.kernel.restart()
                    restarted_evt = KernelOutEvent(
                        cell_id="",
                        kind="status",
                        data={"execution_state": "idle", "restarted": True},
                    )
                    await self._broadcast(encode(restarted_evt))

    async def handle_crdt(self, sender: WebSocket, data: bytes) -> None:
        # 1. Process sync frame
        reply = self.crdt.handle_client_message(data)
        if reply:
            try:
                await sender.send_bytes(reply)
            except Exception:
                pass

        # 2. Rebroadcast CRDT frame to other collaborators
        for other in list(self.clients):
            if other is not sender:
                try:
                    await other.send_bytes(data)
                except Exception:
                    self.clients.discard(other)

        # 3. Synchronize cell models and graph from CRDT state
        for cell in self.notebook.cells:
            current_text = self.crdt.get_cell_text(cell.id)
            if current_text and current_text != cell.source:
                cell.source = current_text
                analysis = analyze_markdown(cell.source) if cell.cell_type == "markdown" else analyze(cell.source)
                self.graph.upsert(cell.id, analysis)
                save_file(self.notebook, self.path)

    async def _update_cell(self, cell_id: str, source: str) -> None:
        async with self._lock:
            self.crdt.update_cell_text(cell_id, source)
            for c in self.notebook.cells:
                if c.id == cell_id:
                    c.source = source
                    analysis = analyze_markdown(source) if c.cell_type == "markdown" else analyze(source)
                    break
            else:
                self.notebook.cells.append(Cell(cell_id, source))
                analysis = analyze(source)

            self.graph.upsert(cell_id, analysis)
            save_file(self.notebook, self.path)

        await self._broadcast_graph()

    async def _change_cell_type(self, cell_id: str, cell_type: str) -> None:
        async with self._lock:
            for c in self.notebook.cells:
                if c.id == cell_id:
                    c.cell_type = cell_type
                    analysis = analyze_markdown(c.source) if cell_type == "markdown" else analyze(c.source)
                    self.graph.upsert(cell_id, analysis)
                    break
            save_file(self.notebook, self.path)

        await self._broadcast_graph()

    async def _insert_cell(
        self,
        cell_id: str,
        after_id: str | None = None,
        before_id: str | None = None,
        cell_type: str = "code",
    ) -> None:
        async with self._lock:
            if any(c.id == cell_id for c in self.notebook.cells):
                return
            new_cell = Cell(cell_id, "", cell_type=cell_type)
            if before_id:
                idx = next((i for i, c in enumerate(self.notebook.cells) if c.id == before_id), None)
                if idx is not None:
                    self.notebook.cells.insert(idx, new_cell)
                else:
                    self.notebook.cells.append(new_cell)
            elif after_id:
                idx = next((i for i, c in enumerate(self.notebook.cells) if c.id == after_id), None)
                if idx is not None:
                    self.notebook.cells.insert(idx + 1, new_cell)
                else:
                    self.notebook.cells.append(new_cell)
            else:
                self.notebook.cells.append(new_cell)

            self.crdt.init_cells([(cell_id, "")])
            analysis = analyze_markdown("") if cell_type == "markdown" else analyze("")
            self.graph.upsert(cell_id, analysis)
            save_file(self.notebook, self.path)

        await self._broadcast_graph()

    async def _delete_cell(self, cell_id: str) -> None:
        async with self._lock:
            self.notebook.cells = [c for c in self.notebook.cells if c.id != cell_id]
            self.graph.remove(cell_id)
            self.sidecar.clear(cell_id)
            save_file(self.notebook, self.path)

        await self._broadcast_graph()

    async def _move_cell(self, cell_id: str, direction: str) -> None:
        async with self._lock:
            idx = next((i for i, c in enumerate(self.notebook.cells) if c.id == cell_id), -1)
            if idx == -1:
                return
            if direction == "up" and idx > 0:
                self.notebook.cells[idx], self.notebook.cells[idx - 1] = (
                    self.notebook.cells[idx - 1],
                    self.notebook.cells[idx],
                )
            elif direction == "down" and idx < len(self.notebook.cells) - 1:
                self.notebook.cells[idx], self.notebook.cells[idx + 1] = (
                    self.notebook.cells[idx + 1],
                    self.notebook.cells[idx],
                )
            save_file(self.notebook, self.path)

        await self._broadcast_graph()

    async def _reorder_cells(self, cell_ids: list[str]) -> None:
        async with self._lock:
            id_map = {c.id: c for c in self.notebook.cells}
            new_cells = [id_map[cid] for cid in cell_ids if cid in id_map]
            remaining = [c for c in self.notebook.cells if c.id not in cell_ids]
            self.notebook.cells = new_cells + remaining
            save_file(self.notebook, self.path)

        await self._broadcast_graph()

    async def _complete(self, cell_id: str, code: str, cursor_pos: int, ws: WebSocket | None) -> None:
        if not self.bridge or not ws:
            return
        res = await self.bridge.complete(code, cursor_pos)
        reply = CompleteReply(
            cell_id=cell_id,
            matches=res.get("matches", []),
            cursor_start=res.get("cursor_start", cursor_pos),
            cursor_end=res.get("cursor_end", cursor_pos),
        )
        try:
            await ws.send_text(encode(reply).decode("utf-8"))
        except Exception:
            pass

    # ---------------- Sequential Execution with Cascading Abort ----------------

    async def _run_pipeline(self, cell_ids: list[str]) -> None:
        if not self.bridge:
            return

        async with self._exec_lock:
            for idx, cid in enumerate(cell_ids):
                cell = next((c for c in self.notebook.cells if c.id == cid), None)
                if not cell or cell.cell_type == "markdown":
                    continue

                # Clear previous outputs for this cell in memory and on disk
                self.sidecar.clear(cid)

                # Emit status busy
                busy_evt = KernelOutEvent(
                    cell_id=cid,
                    kind="status",
                    data={"execution_state": "busy"},
                )
                await self._broadcast(encode(busy_evt))

                # Event handler to stream output to clients and append to .kout
                async def on_event(evt: KernelEvent) -> None:
                    if evt.msg_type != "status":
                        self.sidecar.append(cid, evt.msg_type, evt.content)
                    out = KernelOutEvent(cell_id=cid, kind=evt.msg_type, data=evt.content)
                    await self._broadcast(encode(out))

                t_start = time.time()
                # Execute sequentially and gate completion
                success = await self.bridge.execute_and_wait(cell.source, on_event=on_event)
                duration = round(time.time() - t_start, 3)

                # Emit status idle with execution duration
                idle_evt = KernelOutEvent(
                    cell_id=cid,
                    kind="status",
                    data={"execution_state": "idle", "duration": duration},
                )
                await self._broadcast(encode(idle_evt))

                if not success:
                    # Cascading abort: cancel all downstream cells
                    remaining = cell_ids[idx + 1 :]
                    for skipped_id in remaining:
                        abort_msg = CellAborted(
                            cell_id=skipped_id,
                            reason=f"Execution halted: upstream cell {cid} failed with an error.",
                        )
                        await self._broadcast(encode(abort_msg))
                    break

    async def _broadcast_graph(self) -> None:
        cell_info: dict[str, dict[str, list[str]]] = {}
        dependents: dict[str, list[str]] = {}
        for cid, node in self.graph.cells.items():
            cell_info[cid] = {
                "defines": sorted(node.analysis.defines),
                "reads": sorted(node.analysis.reads),
                "mutations": sorted(node.analysis.mutations),
            }
            dependents[cid] = self.graph.dependents_of(cid)

        upd = GraphUpdate(
            duplicates=self.graph.duplicate_defs(),
            stale=[],
            cell_info=cell_info,
            dependents=dependents,
        )
        await self._broadcast(encode(upd))

    async def _broadcast(self, data: bytes) -> None:
        text = data.decode("utf-8")
        dead: list[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)
