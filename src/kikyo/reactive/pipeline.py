"""Execution planning with Tarjan SCC cycle detection and cascading abort execution."""
from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from typing import Any, Callable, Coroutine

from .graph import ReactiveGraph


class CycleError(Exception):
    def __init__(self, cycle_nodes: list[str]) -> None:
        self.cycle_nodes = cycle_nodes
        super().__init__(f"Circular dependency detected among cells: {cycle_nodes}")


def topological_run_plan(graph: ReactiveGraph, changed_cell: str) -> list[str]:
    """Generates an ordered list of cell IDs to execute, detecting cycles via Tarjan's SCC."""
    affected = {changed_cell, *graph.dependents_of(changed_cell)}
    prov = graph.providers()

    # Build direct dependency edges among affected cells: source_cell -> target_cell
    edges: dict[str, set[str]] = {c: set() for c in affected}
    for cid in affected:
        node = graph.cells.get(cid)
        if not node:
            continue
        for name in node.analysis.reads:
            src = prov.get(name)
            if src and src in affected and src != cid:
                edges[src].add(cid)

    # 1. Tarjan SCC check for cycles within affected subgraph
    indices: dict[str, int] = {}
    lowlink: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    sccs: list[list[str]] = []
    index = 0

    def strongconnect(v: str) -> None:
        nonlocal index
        indices[v] = index
        lowlink[v] = index
        index += 1
        stack.append(v)
        on_stack.add(v)

        for w in edges.get(v, set()):
            if w not in indices:
                strongconnect(w)
                lowlink[v] = min(lowlink[v], lowlink[w])
            elif w in on_stack:
                lowlink[v] = min(lowlink[v], indices[w])

        if lowlink[v] == indices[v]:
            scc = []
            while True:
                w = stack.pop()
                on_stack.remove(w)
                scc.append(w)
                if w == v:
                    break
            if len(scc) > 1:
                sccs.append(scc)

    for node in list(affected):
        if node not in indices:
            strongconnect(node)

    if sccs:
        raise CycleError(sccs[0])

    # 2. Deterministic topological sort
    indeg: dict[str, int] = {c: 0 for c in affected}
    for u in affected:
        for v in edges[u]:
            indeg[v] += 1

    ready = [c for c in affected if indeg[c] == 0]
    order: list[str] = []

    while ready:
        ready.sort()  # Maintain deterministic tie-breaking
        curr = ready.pop(0)
        order.append(curr)
        for nxt in edges[curr]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                ready.append(nxt)

    return order
