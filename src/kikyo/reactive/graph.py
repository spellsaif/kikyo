"""Reactive dependency graph tracking symbols, mutations, and duplicates."""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass

from .analyzer import CellAnalysis


@dataclass
class CellNode:
    id: str
    analysis: CellAnalysis
    stale: bool = False


class ReactiveGraph:
    def __init__(self) -> None:
        self.cells: dict[str, CellNode] = {}

    def upsert(self, cell_id: str, analysis: CellAnalysis) -> None:
        self.cells[cell_id] = CellNode(id=cell_id, analysis=analysis)

    def remove(self, cell_id: str) -> None:
        self.cells.pop(cell_id, None)

    def providers(self) -> dict[str, str]:
        """Maps exported symbol -> cell_id providing it."""
        prov: dict[str, str] = {}
        for cid, node in self.cells.items():
            for name in node.analysis.defines:
                prov[name] = cid
        return prov

    def duplicate_defs(self) -> dict[str, list[str]]:
        """Maps symbol -> list of cell_ids if multiple cells define the same symbol."""
        by_name: dict[str, list[str]] = defaultdict(list)
        for cid, node in self.cells.items():
            for name in node.analysis.defines:
                by_name[name].append(cid)
        return {n: ids for n, ids in by_name.items() if len(ids) > 1}

    def dependents_of(self, cell_id: str) -> list[str]:
        """All cells that directly or transitively read what this cell defines or mutates."""
        prov = self.providers()
        readers: dict[str, list[str]] = defaultdict(list)
        for cid, node in self.cells.items():
            for name in node.analysis.reads:
                readers[name].append(cid)

        seen: set[str] = set()
        queue = deque([cell_id])
        result: list[str] = []

        while queue:
            cur = queue.popleft()
            if cur not in self.cells:
                continue
            # Symbols defined or mutated by current cell
            symbols = self.cells[cur].analysis.defines | self.cells[cur].analysis.mutations
            for name in symbols:
                for r in readers.get(name, []):
                    if r not in seen and r != cell_id:
                        seen.add(r)
                        result.append(r)
                        queue.append(r)

        return result
