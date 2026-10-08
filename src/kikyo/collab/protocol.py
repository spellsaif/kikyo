"""Yjs/CRDT collaboration protocol using pycrdt and standard y-protocols."""
from __future__ import annotations

import logging
from typing import Any, Callable
import pycrdt
from pycrdt.websocket.yroom import (
    YMessageType,
    YSyncMessageType,
    create_sync_message,
    handle_sync_message,
    create_update_message,
)

log = logging.getLogger(__name__)


class CRDTSessionBridge:
    """Manages the server-authoritative Y.Doc and handles framed y-protocols messages."""

    def __init__(self, doc: pycrdt.Doc | None = None) -> None:
        self.doc = doc or pycrdt.Doc()
        self.cells = self.doc.get("cells", type=pycrdt.Map)

    def init_cells(self, cell_items: list[tuple[str, str]]) -> None:
        """Hydrates Y.Doc with initial cells if empty."""
        with self.doc.transaction():
            for cid, src in cell_items:
                if cid not in self.cells:
                    self.cells[cid] = pycrdt.Text(src)

    def get_cell_text(self, cell_id: str) -> str:
        t = self.cells.get(cell_id)
        return str(t) if t is not None else ""

    def update_cell_text(self, cell_id: str, new_source: str) -> None:
        t = self.cells.get(cell_id)
        if t is None:
            with self.doc.transaction():
                self.cells[cell_id] = pycrdt.Text(new_source)
        else:
            current_str = str(t)
            if current_str != new_source:
                with self.doc.transaction():
                    # Diff replacement
                    del t[0 : len(t)]
                    t += new_source

    def create_initial_sync_message(self) -> bytes:
        """Message sent by server when a client connects to trigger initial sync."""
        return create_sync_message(self.doc)

    def handle_client_message(self, data: bytes) -> bytes | None:
        """Decodes standard y-protocols framed messages and returns optional response."""
        if not data:
            return None

        msg_type = data[0]

        if msg_type == YMessageType.SYNC:
            # Strip the message type prefix and let pycrdt handle sync payload
            reply = handle_sync_message(data[1:], self.doc)
            return reply

        elif msg_type == YMessageType.AWARENESS:
            # Awareness messages (user cursors, presence) are passed through for rebroadcasting
            return None

        return None
