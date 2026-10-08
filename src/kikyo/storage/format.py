"""Notebook file format (.py) parser, serializer, and .ipynb converter with Markdown support."""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

HEADER = "# kikyo:notebook v=1"
LEGACY_HEADER = "# jasmine:notebook v=1"
CELL_RE = re.compile(
    r"^# (?:kikyo|jasmine):cell id=(?P<id>[A-Za-z0-9_\-]+)(?:\s+(?:cell_)?type=(?P<type>[a-z]+))?\s*$"
)


@dataclass
class Cell:
    id: str
    source: str
    cell_type: str = "code"  # "code" | "markdown"


@dataclass
class Notebook:
    cells: list[Cell] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def new(cls) -> Notebook:
        return cls(cells=[Cell(id=_new_id(), source="", cell_type="code")])


def _new_id() -> str:
    return "c" + uuid.uuid4().hex[:8]


def _clean_markdown_source(raw: str) -> str:
    """Unwraps triple-quoted string docstrings if present."""
    text = raw.strip()
    if text.startswith('"""') and text.endswith('"""') and len(text) >= 6:
        inner = text[3:-3].strip("\n")
        return inner.replace(r'\"\"\"', '"""')
    if text.startswith("'''") and text.endswith("'''") and len(text) >= 6:
        inner = text[3:-3].strip("\n")
        return inner.replace(r"\'\'\'", "'''")
    return text


def loads(text: str) -> Notebook:
    """Parses Python source with cell markers into a Notebook model."""
    lines = text.splitlines()
    if not lines or (lines[0].strip() != HEADER and lines[0].strip() != LEGACY_HEADER):
        # Plain Python script without markers: treat as single code cell
        return Notebook(cells=[Cell(id=_new_id(), source=text.strip(), cell_type="code")])

    cells: list[Cell] = []
    cur_id: str | None = None
    cur_type: str = "code"
    cur_lines: list[str] = []

    for line in lines[1:]:
        m = CELL_RE.match(line)
        if m:
            if cur_id is not None:
                raw_src = "\n".join(cur_lines).rstrip("\n")
                cleaned_src = _clean_markdown_source(raw_src) if cur_type == "markdown" else raw_src
                cells.append(Cell(id=cur_id, source=cleaned_src, cell_type=cur_type))
            cur_id = m.group("id")
            cur_type = m.group("type") or "code"
            cur_lines = []
        else:
            cur_lines.append(line)

    if cur_id is not None:
        raw_src = "\n".join(cur_lines).rstrip("\n")
        cleaned_src = _clean_markdown_source(raw_src) if cur_type == "markdown" else raw_src
        cells.append(Cell(id=cur_id, source=cleaned_src, cell_type=cur_type))

    return Notebook(cells=cells or [Cell(id=_new_id(), source="", cell_type="code")])


def dumps(nb: Notebook) -> str:
    """Serializes a Notebook model to a clean Python script with cell markers."""
    parts = [HEADER]
    for cell in nb.cells:
        if cell.cell_type == "markdown":
            parts.append(f"# kikyo:cell id={cell.id} type=markdown")
            src = cell.source.strip()
            if '"""' not in src:
                parts.append(f'"""\n{src}\n"""\n')
            elif "'''" not in src:
                parts.append(f"'''\n{src}\n'''\n")
            else:
                escaped = src.replace('"""', r'\"\"\"')
                parts.append(f'"""\n{escaped}\n"""\n')
        else:
            parts.append(f"# kikyo:cell id={cell.id}")
            parts.append(cell.source.rstrip("\n") + "\n")
    return "\n".join(parts).rstrip("\n") + "\n"


def load_file(path: Path) -> Notebook:
    return loads(path.read_text(encoding="utf-8"))


def save_file(nb: Notebook, path: Path) -> None:
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(dumps(nb), encoding="utf-8")
    tmp_path.replace(path)


# ---------------- .ipynb Bidirectional Compatibility ----------------


def to_ipynb(nb: Notebook, sidecar_outputs: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, Any]:
    """Converts a Kikyo Notebook and companion outputs to standard Jupyter v4 JSON."""
    outputs_map = sidecar_outputs or {}
    ipynb_cells: list[dict[str, Any]] = []

    for idx, c in enumerate(nb.cells):
        if c.cell_type == "markdown":
            ipynb_cells.append({
                "cell_type": "markdown",
                "metadata": {"kikyo_id": c.id},
                "source": [line + "\n" for line in c.source.splitlines()] or [""],
            })
            continue

        raw_events = outputs_map.get(c.id, [])
        formatted_outputs: list[dict[str, Any]] = []

        for evt in raw_events:
            kind = evt.get("kind", "")
            data = evt.get("data", {})
            if kind == "stream":
                formatted_outputs.append({
                    "output_type": "stream",
                    "name": data.get("name", "stdout"),
                    "text": [data.get("text", "")],
                })
            elif kind in ("execute_result", "display_data"):
                formatted_outputs.append({
                    "output_type": kind,
                    "data": data.get("data", {}),
                    "metadata": data.get("metadata", {}),
                    "execution_count": idx + 1 if kind == "execute_result" else None,
                })
            elif kind == "error":
                formatted_outputs.append({
                    "output_type": "error",
                    "ename": data.get("ename", "Error"),
                    "evalue": data.get("evalue", ""),
                    "traceback": data.get("traceback", []),
                })

        ipynb_cells.append({
            "cell_type": "code",
            "execution_count": idx + 1 if formatted_outputs else None,
            "metadata": {"kikyo_id": c.id},
            "source": [line + "\n" for line in c.source.splitlines()] or [""],
            "outputs": formatted_outputs,
        })

    return {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "language_info": {"name": "python", "version": "3.13"},
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        },
        "cells": ipynb_cells,
    }


def from_ipynb(data: dict[str, Any]) -> tuple[Notebook, dict[str, list[dict[str, Any]]]]:
    """Imports a Jupyter .ipynb dictionary into a Kikyo Notebook and sidecar outputs."""
    cells: list[Cell] = []
    outputs_map: dict[str, list[dict[str, Any]]] = {}

    for idx, c in enumerate(data.get("cells", [])):
        cid = c.get("metadata", {}).get("kikyo_id", f"c{idx:04x}")
        raw_source = c.get("source", "")
        source_text = "".join(raw_source) if isinstance(raw_source, list) else str(raw_source)
        cell_type = c.get("cell_type", "code")

        if cell_type == "markdown":
            cells.append(Cell(id=cid, source=source_text.strip(), cell_type="markdown"))
            continue

        cells.append(Cell(id=cid, source=source_text.strip(), cell_type="code"))

        # Extract outputs
        cell_outputs: list[dict[str, Any]] = []
        for out in c.get("outputs", []):
            otype = out.get("output_type", "")
            if otype == "stream":
                cell_outputs.append({
                    "kind": "stream",
                    "data": {"name": out.get("name", "stdout"), "text": "".join(out.get("text", []))},
                })
            elif otype in ("execute_result", "display_data"):
                cell_outputs.append({
                    "kind": otype,
                    "data": {"data": out.get("data", {}), "metadata": out.get("metadata", {})},
                })
            elif otype == "error":
                cell_outputs.append({
                    "kind": "error",
                    "data": {
                        "ename": out.get("ename", ""),
                        "evalue": out.get("evalue", ""),
                        "traceback": out.get("traceback", []),
                    },
                })

        if cell_outputs:
            outputs_map[cid] = cell_outputs

    return Notebook(cells=cells or [Cell.new()]), outputs_map
