"""Production append-only JSONL output sidecar (.kout)."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


class OutputSidecar:
    """Manages append-only JSONL output files (.kout) companion to notebooks."""

    def __init__(self, path: Path) -> None:
        self.path = path.with_suffix(".kout")
        self._cache: dict[str, list[dict[str, Any]]] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                        cell_id = record.get("cell_id")
                        event = record.get("event")
                        if cell_id and event:
                            self._cache.setdefault(cell_id, []).append(event)
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            log.warning("Failed to load sidecar %s: %s", self.path, e)

    def append(self, cell_id: str, kind: str, data: dict[str, Any]) -> None:
        """Appends a new execution event to memory and disk."""
        event = {"kind": kind, "data": data}
        self._cache.setdefault(cell_id, []).append(event)
        try:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps({"cell_id": cell_id, "event": event}) + "\n")
        except Exception as e:
            log.error("Failed to write to sidecar %s: %s", self.path, e)

    def clear(self, cell_id: str) -> None:
        """Clears cached outputs for a cell and compacts disk."""
        self._cache.pop(cell_id, None)
        self.compact()

    def get_outputs(self, cell_id: str) -> list[dict[str, Any]]:
        return self._cache.get(cell_id, [])

    def get_all_outputs(self) -> dict[str, list[dict[str, Any]]]:
        return dict(self._cache)

    def compact(self) -> None:
        """Compacts the .kout JSONL file by writing out the current cached state."""
        try:
            tmp_path = self.path.with_suffix(".kout.tmp")
            with open(tmp_path, "w", encoding="utf-8") as f:
                for cell_id, events in self._cache.items():
                    for event in events:
                        f.write(json.dumps({"cell_id": cell_id, "event": event}) + "\n")
            tmp_path.replace(self.path)
        except Exception as e:
            log.error("Failed to compact sidecar %s: %s", self.path, e)
