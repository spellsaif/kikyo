"""High-performance wire protocol serialization using msgspec."""
from __future__ import annotations

from typing import Any
import msgspec


class RunCell(msgspec.Struct, tag="run", tag_field="op"):
    cell_id: str


class RunReactive(msgspec.Struct, tag="run_reactive", tag_field="op"):
    cell_id: str


class Interrupt(msgspec.Struct, tag="interrupt", tag_field="op"):
    pass


class RestartKernel(msgspec.Struct, tag="restart_kernel", tag_field="op"):
    pass


class UpdateCell(msgspec.Struct, tag="update_cell", tag_field="op"):
    cell_id: str
    source: str


class ChangeCellType(msgspec.Struct, tag="change_type", tag_field="op"):
    cell_id: str
    cell_type: str  # "code" | "markdown"


class InsertCell(msgspec.Struct, tag="insert_cell", tag_field="op"):
    cell_id: str
    after_id: str | None = None
    before_id: str | None = None
    cell_type: str = "code"


class DeleteCell(msgspec.Struct, tag="delete_cell", tag_field="op"):
    cell_id: str


class MoveCell(msgspec.Struct, tag="move_cell", tag_field="op"):
    cell_id: str
    direction: str  # "up" | "down"


class ReorderCells(msgspec.Struct, tag="reorder_cells", tag_field="op"):
    cell_ids: list[str]


class CompleteRequest(msgspec.Struct, tag="complete", tag_field="op"):
    cell_id: str
    code: str
    cursor_pos: int


ClientMsg = (
    RunCell
    | RunReactive
    | Interrupt
    | RestartKernel
    | UpdateCell
    | ChangeCellType
    | InsertCell
    | DeleteCell
    | MoveCell
    | ReorderCells
    | CompleteRequest
)


class KernelOutEvent(msgspec.Struct, tag="event", tag_field="op"):
    cell_id: str
    kind: str
    data: dict[str, Any]


class GraphUpdate(msgspec.Struct, tag="graph", tag_field="op"):
    duplicates: dict[str, list[str]]
    stale: list[str] = []
    cell_info: dict[str, dict[str, list[str]]] = {}
    dependents: dict[str, list[str]] = {}


class CycleWarning(msgspec.Struct, tag="cycle", tag_field="op"):
    cycle_cells: list[str]
    message: str


class CellAborted(msgspec.Struct, tag="aborted", tag_field="op"):
    cell_id: str
    reason: str


class CompleteReply(msgspec.Struct, tag="complete_reply", tag_field="op"):
    cell_id: str
    matches: list[str]
    cursor_start: int
    cursor_end: int


ServerMsg = KernelOutEvent | GraphUpdate | CycleWarning | CellAborted | CompleteReply

_encoder = msgspec.json.Encoder()
_client_decoder = msgspec.json.Decoder(ClientMsg)


def encode(msg: ServerMsg) -> bytes:
    return _encoder.encode(msg)


def decode_client(raw: bytes | str) -> ClientMsg:
    return _client_decoder.decode(raw)
