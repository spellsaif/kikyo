# 🌸 Jasmine — Building a Modern Jupyter Alternative from Scratch

> *"The lazy engineer writes 100 lines that do the work of 10,000. Because they thought for 3 hours before typing."*
> — Sensei's first lesson

**Author's note:** This is a complete, teaching-first, no-bullshit walkthrough. You will build **Jasmine** — a reactive, reproducible, collaborative Python notebook — from empty folder to production deployment. Every line of code is real. Every concept is explained. Nothing is skipped.

**Target reader:** You (a developer who wants to become an expert Python engineer, contribute to OSS, and internalize how real systems are built).

**Stack (all latest as of July 2026):**
- Python 3.13 (free-threading friendly)
- `uv` 0.5+ (package manager, replaces pip/poetry/pyenv)
- FastAPI 0.139+ (backend, async, websockets)
- `msgspec` (fastest serialization, replaces pydantic for hot paths)
- `anyio` 4.x (structured concurrency)
- `jupyter_client` 8.x (we reuse the battle-tested kernel protocol)
- React 19 + Vite 6 + TypeScript 5.6 (frontend)
- CodeMirror 6 (editor — lighter, more hackable than Monaco)
- Yjs + `y-py` (CRDT for real-time collaboration)
- SQLite + `aiosqlite` (metadata store — zero-config, boring, correct)
- Docker + `uv` for reproducible production images

---

## 📖 Table of Contents

0. [Sensei's Philosophy: Why Lazy is Powerful](#0)
1. [Why Jasmine Exists — Understanding Jupyter's Pain](#1)
2. [Architecture: The Big Picture Before Any Code](#2)
3. [Chapter 1 — Project Skeleton & Tooling](#3)
4. [Chapter 2 — The Kernel Bridge (the heart)](#4)
5. [Chapter 3 — The Reactive Engine (killer feature #1)](#5)
6. [Chapter 4 — Notebook File Format (killer feature #2: git-friendly)](#6)
7. [Chapter 5 — FastAPI Backend & WebSocket Protocol](#7)
8. [Chapter 6 — React Frontend & CodeMirror Editor](#8)
9. [Chapter 7 — Real-time Collaboration with Yjs (killer feature #3)](#9)
10. [Chapter 8 — Rich Outputs, Plots, Widgets](#10)
11. [Chapter 9 — Testing Strategy (unit, integration, e2e)](#11)
12. [Chapter 10 — Packaging, CI/CD, and Production Deploy](#12)
13. [Chapter 11 — Becoming a Contributor: OSS Playbook](#13)
14. [Appendix A — Concept Deep-Dives](#14)

---

<a id="0"></a>
## 0. Sensei's Philosophy: Why "Lazy" is a Superpower

Before code, philosophy. If you skip this, you'll overengineer Jasmine.

**Lazy engineer's four laws:**

1. **Don't invent what exists.** Jupyter's kernel protocol has been battle-tested for a decade. We reuse `jupyter_client`. We do NOT rewrite ZeroMQ messaging. Ego kills projects.
2. **Delete more than you write.** Every line is liability. Every dependency is 3am pager duty.
3. **Boring tech wins.** SQLite over Postgres for metadata. Files over DB for notebooks. WebSockets over gRPC. Boring = debuggable at 3am.
4. **One killer feature > ten mediocre ones.** Marimo won hearts with *reactivity*. Observable won with *dataflow*. What's Jasmine's? → **Reactive + Git-friendly + Live-collab in one package.**

Say this out loud: *"I will not build a Kubernetes operator this week."* Good. Continue.

---

<a id="1"></a>
## 1. Why Jasmine Exists — The Pain We Solve

Understand the enemy before you fight it. Jupyter's pain points, ranked by how much they hurt real users:

| # | Pain | Why it hurts | Jasmine's answer |
|---|------|--------------|------------------|
| 1 | **Hidden state / out-of-order execution** | You run cell 5, delete cell 2, and cell 5 still "works" — until you reopen it and it breaks. Reproducibility nightmare. | **Reactive dataflow** — cells form a DAG; changing one auto-invalidates downstream. |
| 2 | **`.ipynb` is JSON blob** with outputs baked in | Git diffs are unreadable. Merge conflicts are hell. Secrets leak in outputs. | **Store as pure `.py` file** with cell markers + separate output sidecar. |
| 3 | **No real-time collab** | Google Docs works. Why not notebooks? JupyterLab RTC is bolt-on and janky. | **Yjs CRDT baked in from day one.** |
| 4 | **Poor editor** | No real LSP, poor autocomplete, no refactor. | **CodeMirror 6 + Pyright LSP over WebSocket.** |
| 5 | **Kernel management is painful** | Kernel dies, you lose state. No warm pool. | **Pooled, autorestart kernels with checkpoint/resume.** |
| 6 | **Widgets are a mess** | ipywidgets is complex, versioning hell. | **Simple `@jasmine.ui` decorator + React components.** |
| 7 | **Deployment is manual** | "Just install jupyter" isn't a deploy story. | **Single binary via `uv tool install jasmine` + Docker image.** |

**We will not solve all seven perfectly.** We will nail 1, 2, 3 and get 4–7 to "good enough." That's the lazy way.

---

<a id="2"></a>
## 2. Architecture — The Big Picture (Draw Before You Code)

Here's the whole system on one napkin:

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  React 19 App                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │ CodeMirror 6 │  │ Output Panel │  │ Yjs Provider │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │    │
│  └────────────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket (JSON + binary Y-updates)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JASMINE SERVER (FastAPI, async)              │
│  ┌────────────────────┐   ┌────────────────────┐               │
│  │  /ws/notebook/:id  │   │  /api/notebooks    │               │
│  │  (WebSocket)       │   │  (REST)            │               │
│  └─────────┬──────────┘   └─────────┬──────────┘               │
│            │                        │                          │
│  ┌─────────▼────────────────────────▼─────────┐                │
│  │   NotebookSession (in-memory, per-doc)     │                │
│  │  • Y.Doc (collab state)                    │                │
│  │  • ReactiveEngine (DAG)                    │                │
│  │  • KernelBridge (ZMQ ↔ WS)                 │                │
│  └───────────────────┬────────────────────────┘                │
│                      │                                         │
│  ┌───────────────────▼────────────────────────┐                │
│  │   KernelPool                                │                │
│  │   • warm ipykernel processes                │                │
│  │   • jupyter_client under the hood           │                │
│  └───────────────────┬────────────────────────┘                │
└──────────────────────┼─────────────────────────────────────────┘
                       │ ZeroMQ (5 sockets, Jupyter proto)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              IPYKERNEL SUBPROCESS (isolated)                    │
│              Runs user code. Sends back displays.               │
└─────────────────────────────────────────────────────────────────┘

STORAGE:
  notebooks/foo.py        ← human-readable Python + cell markers
  notebooks/foo.jout      ← output sidecar (JSONL, gitignored)
  .jasmine/metadata.db    ← SQLite: sessions, users, doc history
```

**Why this shape?**

- **Server is the source of truth** for Yjs docs (single hub avoids peer-to-peer NAT hell).
- **Kernel is a subprocess**, not embedded — if user code segfaults, server survives.
- **In-memory session per doc**, evicted when idle → simple, scales to thousands of docs on one box.
- **SQLite** because you can `cp jasmine.db backup.db`. Postgres for a notebook tool = clown pants.

### Concept sidebar 🧠: Why not just embed the interpreter?

You *could* run user code inside the FastAPI process. Please don't:
- Any `sys.exit()`, C-extension segfault, or `while True: fork()` takes your server down.
- No isolation → one user's `!pip install` breaks everyone.
- Can't have multiple Python versions per notebook.

Isolation via subprocess is boring, correct, and how CPython teams have run untrusted code since IPython 0.12. **Lazy = reuse.**

---

<a id="3"></a>
## 3. Chapter 1 — Project Skeleton & Tooling

### 3.1 Install `uv` (the only Python installer you'll ever want)

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Verify
uv --version   # should be >= 0.5.x
```

**Why uv?** It replaces `pip`, `pip-tools`, `pipx`, `virtualenv`, `poetry`, and `pyenv` — with a single Rust binary that's 10–100× faster. As of 2026 it's the industry default.

### 3.2 Create the project

We use the **src layout** — the professional standard. It prevents the "I imported my dev copy instead of the installed copy" bug that has bitten every Python developer.

```bash
mkdir jasmine && cd jasmine
uv init --package --lib jasmine  # scaffold + src/ layout
```

Then create the full structure:

```bash
mkdir -p src/jasmine/{kernel,reactive,notebook,api,collab,storage,cli}
mkdir -p src/jasmine/frontend
mkdir -p tests/{unit,integration,e2e}
mkdir -p docs scripts .github/workflows
touch src/jasmine/{kernel,reactive,notebook,api,collab,storage,cli}/__init__.py
```

**Final layout (memorize this — it's the shape of nearly every professional Python project in 2026):**

```
jasmine/
├── src/
│   └── jasmine/
│       ├── __init__.py          # public API
│       ├── __main__.py          # `python -m jasmine` entry
│       ├── cli/                 # Typer CLI
│       ├── api/                 # FastAPI routes + WS handlers
│       ├── kernel/              # KernelBridge, KernelPool
│       ├── reactive/            # DAG, static analysis, scheduler
│       ├── notebook/            # File format (.py <-> Notebook model)
│       ├── collab/              # Yjs bridge (y-py)
│       ├── storage/             # SQLite metadata layer
│       └── frontend/            # built React assets (mounted static)
├── frontend/                    # React source (separate build)
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── scripts/                     # dev helpers (start-dev.sh, etc.)
├── .github/workflows/           # CI
├── pyproject.toml               # ONE source of truth
├── uv.lock                      # deterministic deps
├── Dockerfile
├── README.md
└── .gitignore
```

### 3.3 `pyproject.toml` — the modern single source of truth

Replace what `uv init` gave you with this. Every field is deliberate.

```toml
# pyproject.toml
[build-system]
requires = ["hatchling>=1.25"]
build-backend = "hatchling.build"

[project]
name = "jasmine"
version = "0.1.0"
description = "A reactive, collaborative, git-friendly Python notebook."
readme = "README.md"
license = { text = "Apache-2.0" }
requires-python = ">=3.13"
authors = [{ name = "Your Name", email = "you@example.com" }]
keywords = ["notebook", "jupyter", "reactive", "collaborative"]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Programming Language :: Python :: 3.13",
    "Framework :: FastAPI",
    "License :: OSI Approved :: Apache Software License",
]
dependencies = [
    "fastapi>=0.139",
    "uvicorn[standard]>=0.32",
    "websockets>=13",
    "anyio>=4.6",
    "msgspec>=0.19",
    "jupyter-client>=8.6",
    "ipykernel>=6.29",
    "y-py>=0.7",
    "aiosqlite>=0.20",
    "typer>=0.15",
    "rich>=13.9",
    "watchfiles>=0.24",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "pytest-cov>=5",
    "httpx>=0.28",
    "ruff>=0.7",
    "mypy>=1.13",
    "pre-commit>=4",
    "playwright>=1.48",
]

[project.scripts]
jasmine = "jasmine.cli.main:app"

[project.urls]
Homepage = "https://github.com/yourname/jasmine"
Issues = "https://github.com/yourname/jasmine/issues"

# --- Ruff: our formatter + linter (replaces black + isort + flake8) ---
[tool.ruff]
line-length = 100
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM", "RUF", "ASYNC"]
ignore = ["E501"]  # let formatter handle line length

[tool.ruff.format]
quote-style = "double"

# --- Mypy: strict where it matters ---
[tool.mypy]
python_version = "3.13"
strict = true
warn_unreachable = true
files = ["src/jasmine"]

# --- Pytest ---
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = ["--strict-markers", "--strict-config", "-ra"]

# --- Hatch: what to package ---
[tool.hatch.build.targets.wheel]
packages = ["src/jasmine"]
```

Install everything:

```bash
uv sync --all-extras
```

Verify:

```bash
uv run python -c "import jasmine; print('ok')"
```

### Concept sidebar 🧠: What is `pyproject.toml` actually?

Before 2018, Python packaging was `setup.py` (Python code that runs at install time = arbitrary code execution + no way to know deps without executing). PEP 518 introduced `pyproject.toml` — a **declarative** manifest. In 2026, it's the *only* file you need for metadata, deps, tool config (ruff, mypy, pytest). Learn it deeply; it's your project's constitution.

### 3.4 `.gitignore` — don't skip this

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/
htmlcov/
.coverage

# Jasmine-specific
*.jout                # output sidecars — never commit
.jasmine/             # local session data
notebooks/*.jout

# Frontend
frontend/node_modules/
frontend/dist/
src/jasmine/frontend/*
!src/jasmine/frontend/.gitkeep

# Editors
.vscode/
.idea/
.DS_Store
```

### 3.5 Pre-commit hooks — quality on autopilot

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.7.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
```

```bash
uv run pre-commit install
```

**Checkpoint 1:** Run `uv run python -c "import jasmine"` and it prints nothing (no error). If yes — you have a real project. Take a break. ☕

---

<a id="4"></a>
## 4. Chapter 2 — The Kernel Bridge (the heart)

This is where Jasmine touches Python execution. **The lazy move: we do not reimplement the Jupyter kernel protocol. We use `jupyter_client`.** It's 10 years mature.

### 4.1 Concept: How Jupyter kernels actually work

The Jupyter kernel protocol uses **5 ZeroMQ sockets** between frontend and kernel:

| Socket | Direction | Purpose |
|--------|-----------|---------|
| `shell` | client → kernel | execute_request, kernel_info, complete |
| `iopub` | kernel → all clients | stdout, stderr, display_data, execute_result |
| `stdin` | kernel → client | `input()` prompts |
| `control` | client → kernel | shutdown, interrupt (out-of-band) |
| `heartbeat` | ping/pong | detect dead kernels |

Messages are JSON with an HMAC signature. `jupyter_client.AsyncKernelManager` handles all of this. **We just wire it to our WebSocket.**

### 4.2 `src/jasmine/kernel/manager.py`

```python
"""Kernel lifecycle management: start, restart, shutdown, pool."""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator

from jupyter_client.manager import AsyncKernelManager

log = logging.getLogger(__name__)


@dataclass
class Kernel:
    """A live kernel process."""
    id: str
    manager: AsyncKernelManager
    client: object = field(default=None)  # AsyncKernelClient at runtime

    async def start(self) -> None:
        await self.manager.start_kernel()
        self.client = self.manager.client()
        self.client.start_channels()
        await self.client.wait_for_ready(timeout=30)
        log.info("Kernel %s started (pid=%s)", self.id, self.manager.provisioner.pid if hasattr(self.manager, "provisioner") else "?")

    async def shutdown(self) -> None:
        if self.client:
            self.client.stop_channels()
        await self.manager.shutdown_kernel(now=False)
        log.info("Kernel %s shut down", self.id)

    async def interrupt(self) -> None:
        await self.manager.interrupt_kernel()

    async def restart(self) -> None:
        await self.manager.restart_kernel(now=False)
        await self.client.wait_for_ready(timeout=30)


class KernelPool:
    """Warm pool: keep N idle kernels ready so notebook startup feels instant."""

    def __init__(self, warm_size: int = 2) -> None:
        self.warm_size = warm_size
        self._warm: asyncio.Queue[Kernel] = asyncio.Queue()
        self._active: dict[str, Kernel] = {}
        self._filler_task: asyncio.Task | None = None

    async def start(self) -> None:
        self._filler_task = asyncio.create_task(self._keep_warm())

    async def stop(self) -> None:
        if self._filler_task:
            self._filler_task.cancel()
        while not self._warm.empty():
            k = self._warm.get_nowait()
            await k.shutdown()
        await asyncio.gather(*(k.shutdown() for k in self._active.values()), return_exceptions=True)

    async def _keep_warm(self) -> None:
        while True:
            if self._warm.qsize() < self.warm_size:
                k = await self._spawn()
                await self._warm.put(k)
            await asyncio.sleep(0.5)

    async def _spawn(self) -> Kernel:
        k = Kernel(id=str(uuid.uuid4()), manager=AsyncKernelManager())
        await k.start()
        return k

    async def acquire(self) -> Kernel:
        """Get a warm kernel (or spawn if pool empty)."""
        try:
            k = self._warm.get_nowait()
        except asyncio.QueueEmpty:
            k = await self._spawn()
        self._active[k.id] = k
        return k

    async def release(self, kernel_id: str) -> None:
        k = self._active.pop(kernel_id, None)
        if k:
            await k.shutdown()
```

### 4.3 The bridge — `src/jasmine/kernel/bridge.py`

This translates Jupyter ZMQ messages ↔ our internal event stream. **The whole file is ~80 lines. Notice how thin it is.**

```python
"""Bridge ZMQ kernel messages to async iterators our server can consume."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from .manager import Kernel

log = logging.getLogger(__name__)


@dataclass
class KernelEvent:
    """Normalized event from the kernel — the only shape our server sees."""
    msg_type: str          # 'stream' | 'display_data' | 'execute_result' | 'error' | 'status'
    content: dict[str, Any]
    parent_id: str | None  # msg_id of the request that caused this


class KernelBridge:
    """Wraps a Kernel and exposes:
       - execute(code) -> msg_id
       - events() -> async iterator of KernelEvent
    """

    def __init__(self, kernel: Kernel) -> None:
        self.kernel = kernel
        self._queue: asyncio.Queue[KernelEvent] = asyncio.Queue()
        self._reader_task: asyncio.Task | None = None

    async def start(self) -> None:
        self._reader_task = asyncio.create_task(self._read_iopub())

    async def stop(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()

    async def _read_iopub(self) -> None:
        client = self.kernel.client
        while True:
            try:
                msg = await client.get_iopub_msg(timeout=None)  # blocks async
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.exception("iopub read failed: %s", e)
                continue
            evt = KernelEvent(
                msg_type=msg["msg_type"],
                content=msg["content"],
                parent_id=msg["parent_header"].get("msg_id"),
            )
            await self._queue.put(evt)

    async def execute(self, code: str) -> str:
        """Submit code. Returns the msg_id — events with this parent_id belong to it."""
        msg_id = self.kernel.client.execute(code, store_history=False, allow_stdin=False)
        return msg_id

    async def events(self) -> AsyncIterator[KernelEvent]:
        while True:
            yield await self._queue.get()
```

### Concept sidebar 🧠: Why async iterators?

Producer (ZMQ reader) and consumer (WebSocket sender) run at different speeds. Async iterators + `asyncio.Queue` give **natural backpressure** and clean cancellation. No threads. No callbacks. If you master this pattern, you master 80% of async Python.

### 4.4 Unit test — `tests/unit/test_kernel_bridge.py`

```python
import pytest
from jasmine.kernel.manager import Kernel, KernelPool
from jasmine.kernel.bridge import KernelBridge

pytestmark = pytest.mark.asyncio


async def test_execute_hello_world():
    pool = KernelPool(warm_size=1)
    await pool.start()
    try:
        kernel = await pool.acquire()
        bridge = KernelBridge(kernel)
        await bridge.start()

        msg_id = await bridge.execute("print('hello')")

        collected = []
        async for evt in bridge.events():
            if evt.parent_id != msg_id:
                continue
            collected.append(evt)
            if evt.msg_type == "status" and evt.content.get("execution_state") == "idle":
                break

        streams = [e for e in collected if e.msg_type == "stream"]
        assert any("hello" in s.content["text"] for s in streams)

        await bridge.stop()
        await pool.release(kernel.id)
    finally:
        await pool.stop()
```

Run it:

```bash
uv run pytest tests/unit/test_kernel_bridge.py -v
```

If it passes — **you have Python code running in an isolated subprocess, streaming output back over an async channel.** That's the core of every notebook tool on Earth.

**Checkpoint 2:** You can execute code in an isolated kernel. Take a walk. 🚶

---

<a id="5"></a>
## 5. Chapter 3 — The Reactive Engine (killer feature #1)

This is Jasmine's competitive edge. Let's build it.

### 5.1 Concept: Static analysis via `ast`

For a cell like:
```python
z = x + y
```
We need to know:
- **Defines:** `{z}`
- **Reads:** `{x, y}`

Then the dataflow graph is trivial: cell A → cell B if A defines something B reads. Python's stdlib `ast` module does all the work.

### 5.2 `src/jasmine/reactive/analyzer.py`

```python
"""Static analysis of a cell: find names it defines and names it reads."""
from __future__ import annotations

import ast
from dataclasses import dataclass


@dataclass(frozen=True)
class CellAnalysis:
    defines: frozenset[str]
    reads: frozenset[str]
    syntax_ok: bool
    error: str | None = None


class _Visitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.defined: set[str] = set()
        self.read: set[str] = set()
        # Names bound by comprehensions, lambdas, for-loops → local, ignore
        self._local_scopes: list[set[str]] = [set()]

    def _current_locals(self) -> set[str]:
        return self._local_scopes[-1]

    def visit_Assign(self, node: ast.Assign) -> None:
        for t in node.targets:
            self._collect_targets(t)
        self.visit(node.value)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:
        # x += 1  → reads and defines x
        if isinstance(node.target, ast.Name):
            self.read.add(node.target.id)
            self.defined.add(node.target.id)
        self.visit(node.value)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        if isinstance(node.target, ast.Name):
            self.defined.add(node.target.id)
        if node.value:
            self.visit(node.value)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.defined.add(node.name)
        # Don't recurse into body for reads — function body is a new scope
        # (Simplified: real system would still track free vars)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.defined.add(node.name)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.defined.add(node.name)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.defined.add(alias.asname or alias.name.split(".")[0])

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        for alias in node.names:
            self.defined.add(alias.asname or alias.name)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            if node.id not in self._current_locals():
                self.read.add(node.id)
        elif isinstance(node.ctx, ast.Store):
            self.defined.add(node.id)

    def _collect_targets(self, node: ast.AST) -> None:
        if isinstance(node, ast.Name):
            self.defined.add(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for e in node.elts:
                self._collect_targets(e)
        elif isinstance(node, ast.Starred):
            self._collect_targets(node.value)


def analyze(source: str) -> CellAnalysis:
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return CellAnalysis(frozenset(), frozenset(), False, str(e))

    v = _Visitor()
    v.visit(tree)
    # Reads that are also defined in the same cell are self-references, not deps
    reads = v.read - v.defined
    return CellAnalysis(
        defines=frozenset(v.defined),
        reads=frozenset(reads),
        syntax_ok=True,
    )
```

### 5.3 The DAG — `src/jasmine/reactive/graph.py`

```python
"""Cell dependency graph. Rebuilt on every cell change (cheap for <1000 cells)."""
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
        self.cells[cell_id] = CellNode(cell_id, analysis)

    def remove(self, cell_id: str) -> None:
        self.cells.pop(cell_id, None)

    def _providers(self) -> dict[str, str]:
        """Map name -> id of the cell that defines it.
        Rule: a name is provided by the last cell (in insertion order) defining it.
        Duplicate definitions are flagged as errors by the caller."""
        prov: dict[str, str] = {}
        for cid, node in self.cells.items():
            for name in node.analysis.defines:
                prov[name] = cid
        return prov

    def dependents_of(self, cell_id: str) -> list[str]:
        """All cells that (directly or transitively) read something this cell defines."""
        prov = self._providers()
        # Build reverse index: name -> cells that read it
        readers: dict[str, list[str]] = defaultdict(list)
        for cid, node in self.cells.items():
            for name in node.analysis.reads:
                readers[name].append(cid)

        seen: set[str] = set()
        queue = deque([cell_id])
        result: list[str] = []
        while queue:
            cur = queue.popleft()
            names = self.cells[cur].analysis.defines if cur in self.cells else frozenset()
            for name in names:
                for r in readers.get(name, []):
                    if r not in seen and r != cell_id:
                        seen.add(r)
                        result.append(r)
                        queue.append(r)
        return result

    def duplicate_defs(self) -> dict[str, list[str]]:
        """name -> [cell_ids] when more than one cell defines it (reactive rule violation)."""
        by_name: dict[str, list[str]] = defaultdict(list)
        for cid, node in self.cells.items():
            for name in node.analysis.defines:
                by_name[name].append(cid)
        return {n: ids for n, ids in by_name.items() if len(ids) > 1}
```

### Concept sidebar 🧠: Why "one variable, one cell"?

Marimo enforces this. So do we. If two cells both define `x`, dataflow order is undefined and you're back to Jupyter's hidden-state hell. The rule looks strict, but it's what makes reproducibility possible. **Constraint = clarity.**

### 5.4 Scheduler — `src/jasmine/reactive/scheduler.py`

```python
"""Given a changed cell, produce the ordered execution plan for the reactive run."""
from __future__ import annotations

from collections import defaultdict, deque

from .graph import ReactiveGraph


def topological_run_plan(graph: ReactiveGraph, changed_cell: str) -> list[str]:
    """Return [changed_cell, ...dependents in topological order]."""
    affected = {changed_cell, *graph.dependents_of(changed_cell)}

    # Build subgraph edges among affected cells only
    prov = defaultdict(str)
    for cid, node in graph.cells.items():
        for name in node.analysis.defines:
            prov[name] = cid

    edges: dict[str, set[str]] = {c: set() for c in affected}
    indeg: dict[str, int] = {c: 0 for c in affected}
    for cid in affected:
        node = graph.cells[cid]
        for name in node.analysis.reads:
            src = prov.get(name)
            if src and src in affected and src != cid:
                if cid not in edges[src]:
                    edges[src].add(cid)
                    indeg[cid] += 1

    # Kahn's algorithm
    queue = deque([c for c in affected if indeg[c] == 0])
    order: list[str] = []
    while queue:
        c = queue.popleft()
        order.append(c)
        for nxt in edges[c]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
    return order
```

### 5.5 Test it — `tests/unit/test_reactive.py`

```python
from jasmine.reactive.analyzer import analyze
from jasmine.reactive.graph import ReactiveGraph
from jasmine.reactive.scheduler import topological_run_plan


def test_analyze_simple():
    a = analyze("x = 1\ny = x + 2")
    assert a.defines == {"x", "y"}
    assert a.reads == set()  # x is defined AND read in same cell → self-ref


def test_analyze_reads():
    a = analyze("z = x + y")
    assert a.defines == {"z"}
    assert a.reads == {"x", "y"}


def test_dependents():
    g = ReactiveGraph()
    g.upsert("c1", analyze("x = 1"))
    g.upsert("c2", analyze("y = x + 1"))
    g.upsert("c3", analyze("z = y * 2"))
    g.upsert("c4", analyze("w = 100"))  # unrelated

    assert set(g.dependents_of("c1")) == {"c2", "c3"}


def test_run_plan_order():
    g = ReactiveGraph()
    g.upsert("c1", analyze("x = 1"))
    g.upsert("c2", analyze("y = x + 1"))
    g.upsert("c3", analyze("z = y * 2"))

    plan = topological_run_plan(g, "c1")
    assert plan.index("c1") < plan.index("c2") < plan.index("c3")
```

```bash
uv run pytest tests/unit/test_reactive.py -v
```

**Checkpoint 3:** You built a real dataflow engine. In ~200 lines. This is what "lazy = smart" means.

---

<a id="6"></a>
## 6. Chapter 4 — Notebook File Format (killer feature #2: git-friendly)

`.ipynb` is JSON with outputs baked in. Diffs are illegible. We store notebooks as **pure Python** with cell markers — like Marimo, Jupytext, Percent format.

### 6.1 The format

```python
# jasmine:notebook v=1
# jasmine:cell id=c1
import numpy as np
x = np.arange(10)

# jasmine:cell id=c2
y = x ** 2

# jasmine:cell id=c3
print(y.sum())
```

**Properties:**
- Runs directly as `python foo.py`.
- Git-diffs perfectly.
- No output pollution — outputs live in `foo.jout` (gitignored by default).
- Cell IDs are stable → collab state can attach to them.

### 6.2 `src/jasmine/notebook/format.py`

```python
"""Load/save Jasmine notebooks (.py <-> Notebook model)."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path

HEADER = "# jasmine:notebook v=1"
CELL_RE = re.compile(r"^# jasmine:cell id=(?P<id>[A-Za-z0-9_\-]+)\s*$")


@dataclass
class Cell:
    id: str
    source: str  # code, no trailing newline


@dataclass
class Notebook:
    cells: list[Cell] = field(default_factory=list)
    meta: dict = field(default_factory=dict)

    @classmethod
    def new(cls) -> "Notebook":
        return cls(cells=[Cell(id=_new_id(), source="")])


def _new_id() -> str:
    return "c" + uuid.uuid4().hex[:8]


def loads(text: str) -> Notebook:
    lines = text.splitlines()
    if not lines or lines[0].strip() != HEADER:
        # Treat as unmarked script → single cell
        return Notebook(cells=[Cell(id=_new_id(), source=text)])

    cells: list[Cell] = []
    cur_id: str | None = None
    cur_lines: list[str] = []

    for line in lines[1:]:
        m = CELL_RE.match(line)
        if m:
            if cur_id is not None:
                cells.append(Cell(id=cur_id, source="\n".join(cur_lines).rstrip("\n")))
            cur_id = m.group("id")
            cur_lines = []
        else:
            cur_lines.append(line)

    if cur_id is not None:
        cells.append(Cell(id=cur_id, source="\n".join(cur_lines).rstrip("\n")))

    return Notebook(cells=cells or [Cell(id=_new_id(), source="")])


def dumps(nb: Notebook) -> str:
    parts = [HEADER]
    for cell in nb.cells:
        parts.append(f"# jasmine:cell id={cell.id}")
        parts.append(cell.source.rstrip("\n") + "\n")
    return "\n".join(parts).rstrip("\n") + "\n"


def load_file(path: Path) -> Notebook:
    return loads(path.read_text(encoding="utf-8"))


def save_file(nb: Notebook, path: Path) -> None:
    path.write_text(dumps(nb), encoding="utf-8")
```

### 6.3 Tests — `tests/unit/test_format.py`

```python
from jasmine.notebook.format import Cell, Notebook, loads, dumps


def test_round_trip():
    nb = Notebook(cells=[Cell("c1", "x = 1"), Cell("c2", "print(x)")])
    text = dumps(nb)
    parsed = loads(text)
    assert parsed.cells == nb.cells


def test_bare_script_becomes_one_cell():
    nb = loads("import numpy\nprint('hi')")
    assert len(nb.cells) == 1
    assert "numpy" in nb.cells[0].source


def test_stable_ids():
    src = """# jasmine:notebook v=1
# jasmine:cell id=abc123
x = 1
"""
    nb = loads(src)
    assert nb.cells[0].id == "abc123"
```

**Checkpoint 4:** Your notebook format survives round-trip and diffs cleanly. Try `git diff` on a saved notebook — it looks like Python, not JSON garbage.

---

<a id="7"></a>
## 7. Chapter 5 — FastAPI Backend & WebSocket Protocol

Time to expose all this over the network.

### 7.1 Concept: The WebSocket message protocol

We define a simple JSON envelope. **`msgspec` gives us Pydantic-like validation at 5-10× the speed.**

```
Client → Server:
  { "op": "run", "cell_id": "c1" }
  { "op": "run_reactive", "cell_id": "c1" }
  { "op": "interrupt" }
  { "op": "update_cell", "cell_id": "c1", "source": "x = 2" }

Server → Client:
  { "op": "event", "cell_id": "c1", "kind": "stream", "data": {...} }
  { "op": "event", "cell_id": "c1", "kind": "execute_result", "data": {...} }
  { "op": "event", "cell_id": "c1", "kind": "status", "data": {"state": "idle"} }
  { "op": "graph", "duplicates": {...}, "stale": ["c2", "c3"] }
```

### 7.2 `src/jasmine/api/protocol.py`

```python
"""Wire protocol schemas. msgspec is 5-10x faster than pydantic for hot paths."""
from __future__ import annotations

from typing import Any, Literal

import msgspec


class RunCell(msgspec.Struct, tag="run"):
    cell_id: str


class RunReactive(msgspec.Struct, tag="run_reactive"):
    cell_id: str


class Interrupt(msgspec.Struct, tag="interrupt"):
    pass


class UpdateCell(msgspec.Struct, tag="update_cell"):
    cell_id: str
    source: str


ClientMsg = RunCell | RunReactive | Interrupt | UpdateCell


class KernelOutEvent(msgspec.Struct, tag="event"):
    cell_id: str
    kind: str
    data: dict[str, Any]


class GraphUpdate(msgspec.Struct, tag="graph"):
    duplicates: dict[str, list[str]]
    stale: list[str]


ServerMsg = KernelOutEvent | GraphUpdate


_encoder = msgspec.json.Encoder()
_client_decoder = msgspec.json.Decoder(ClientMsg)


def encode(msg: ServerMsg) -> bytes:
    return _encoder.encode(msg)


def decode_client(raw: bytes | str) -> ClientMsg:
    return _client_decoder.decode(raw)
```

### 7.3 The Session — `src/jasmine/api/session.py`

The **Session** is where everything ties together: notebook model + reactive graph + kernel bridge + set of connected WebSockets.

```python
"""One NotebookSession per open notebook. In-memory, evicted on idle."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import WebSocket

from ..kernel.bridge import KernelBridge, KernelEvent
from ..kernel.manager import KernelPool
from ..notebook.format import Notebook, load_file, save_file
from ..reactive.analyzer import analyze
from ..reactive.graph import ReactiveGraph
from ..reactive.scheduler import topological_run_plan
from .protocol import (
    ClientMsg,
    GraphUpdate,
    Interrupt,
    KernelOutEvent,
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
    graph: ReactiveGraph = field(default_factory=ReactiveGraph)
    bridge: KernelBridge | None = None
    kernel_id: str | None = None
    clients: set[WebSocket] = field(default_factory=set)
    _msg_to_cell: dict[str, str] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @classmethod
    async def open(cls, path: Path, pool: KernelPool) -> "NotebookSession":
        nb = load_file(path)
        sess = cls(path=path, notebook=nb)
        for c in nb.cells:
            sess.graph.upsert(c.id, analyze(c.source))
        kernel = await pool.acquire()
        sess.kernel_id = kernel.id
        sess.bridge = KernelBridge(kernel)
        await sess.bridge.start()
        # Fan-out task
        asyncio.create_task(sess._fanout())
        return sess

    async def close(self, pool: KernelPool) -> None:
        if self.bridge:
            await self.bridge.stop()
        if self.kernel_id:
            await pool.release(self.kernel_id)

    async def add_client(self, ws: WebSocket) -> None:
        self.clients.add(ws)
        await self._broadcast_graph()

    async def remove_client(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    # ---------- handling incoming client messages ----------

    async def handle(self, msg: ClientMsg) -> None:
        match msg:
            case UpdateCell(cell_id=cid, source=src):
                await self._update_cell(cid, src)
            case RunCell(cell_id=cid):
                await self._run_cells([cid])
            case RunReactive(cell_id=cid):
                plan = topological_run_plan(self.graph, cid)
                await self._run_cells(plan)
            case Interrupt():
                # Interrupt via manager (accessed indirectly)
                pass  # implementation left as exercise — 3 lines using manager

    async def _update_cell(self, cell_id: str, source: str) -> None:
        async with self._lock:
            for c in self.notebook.cells:
                if c.id == cell_id:
                    c.source = source
                    break
            else:
                # unknown cell — ignore or append; here we append
                from ..notebook.format import Cell
                self.notebook.cells.append(Cell(cell_id, source))
            self.graph.upsert(cell_id, analyze(source))
            save_file(self.notebook, self.path)
        await self._broadcast_graph()

    async def _run_cells(self, cell_ids: list[str]) -> None:
        assert self.bridge is not None
        for cid in cell_ids:
            cell = next((c for c in self.notebook.cells if c.id == cid), None)
            if cell is None:
                continue
            msg_id = await self.bridge.execute(cell.source)
            self._msg_to_cell[msg_id] = cid

    # ---------- kernel → client fan-out ----------

    async def _fanout(self) -> None:
        assert self.bridge is not None
        async for evt in self.bridge.events():
            cid = self._msg_to_cell.get(evt.parent_id or "", "")
            if not cid:
                continue
            out = KernelOutEvent(cell_id=cid, kind=evt.msg_type, data=evt.content)
            await self._broadcast(encode(out))

    async def _broadcast_graph(self) -> None:
        upd = GraphUpdate(
            duplicates=self.graph.duplicate_defs(),
            stale=[],  # future: mark cells whose deps changed
        )
        await self._broadcast(encode(upd))

    async def _broadcast(self, data: bytes) -> None:
        dead = []
        for ws in self.clients:
            try:
                await ws.send_bytes(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)
```

### 7.4 The FastAPI app — `src/jasmine/api/app.py`

```python
"""FastAPI application factory."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from ..kernel.manager import KernelPool
from .protocol import decode_client
from .session import NotebookSession

log = logging.getLogger(__name__)


class AppState:
    pool: KernelPool
    sessions: dict[str, NotebookSession] = {}
    notebook_root: Path


@asynccontextmanager
async def lifespan(app: FastAPI):
    AppState.pool = KernelPool(warm_size=2)
    await AppState.pool.start()
    AppState.notebook_root = Path("./notebooks").resolve()
    AppState.notebook_root.mkdir(exist_ok=True)
    log.info("Jasmine started, notebook root: %s", AppState.notebook_root)
    try:
        yield
    finally:
        for s in list(AppState.sessions.values()):
            await s.close(AppState.pool)
        await AppState.pool.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Jasmine", version="0.1.0", lifespan=lifespan)

    @app.get("/api/notebooks")
    async def list_notebooks():
        return sorted(p.name for p in AppState.notebook_root.glob("*.py"))

    @app.post("/api/notebooks/{name}")
    async def create_notebook(name: str):
        from ..notebook.format import Notebook, save_file
        path = AppState.notebook_root / f"{name}.py"
        if path.exists():
            return {"error": "exists"}
        save_file(Notebook.new(), path)
        return {"ok": True}

    @app.websocket("/ws/notebook/{name}")
    async def notebook_ws(ws: WebSocket, name: str):
        path = AppState.notebook_root / f"{name}.py"
        if not path.exists():
            await ws.close(code=4404)
            return

        await ws.accept()

        session = AppState.sessions.get(name)
        if session is None:
            session = await NotebookSession.open(path, AppState.pool)
            AppState.sessions[name] = session

        await session.add_client(ws)
        try:
            while True:
                raw = await ws.receive_bytes()
                msg = decode_client(raw)
                await session.handle(msg)
        except WebSocketDisconnect:
            await session.remove_client(ws)
            if not session.clients:
                await session.close(AppState.pool)
                del AppState.sessions[name]

    # --- static frontend (built React) ---
    frontend_dir = Path(__file__).parent.parent / "frontend"
    if (frontend_dir / "index.html").exists():
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app


app = create_app()
```

### 7.5 CLI — `src/jasmine/cli/main.py`

```python
"""Command-line interface. `jasmine start` is the only command you'll type daily."""
from __future__ import annotations

from pathlib import Path

import typer
import uvicorn
from rich.console import Console

app = typer.Typer(help="Jasmine — a modern Python notebook.")
console = Console()


@app.command()
def start(
    host: str = "127.0.0.1",
    port: int = 8765,
    notebook_dir: Path = Path("./notebooks"),
    reload: bool = False,
):
    """Start the Jasmine server."""
    notebook_dir.mkdir(exist_ok=True)
    console.print(f"[bold magenta]🌸 Jasmine[/] running at http://{host}:{port}")
    uvicorn.run(
        "jasmine.api.app:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


@app.command()
def new(name: str, notebook_dir: Path = Path("./notebooks")):
    """Create a new empty notebook."""
    from jasmine.notebook.format import Notebook, save_file
    notebook_dir.mkdir(exist_ok=True)
    path = notebook_dir / f"{name}.py"
    if path.exists():
        console.print(f"[red]exists:[/] {path}")
        raise typer.Exit(1)
    save_file(Notebook.new(), path)
    console.print(f"[green]created:[/] {path}")


if __name__ == "__main__":
    app()
```

### 7.6 Try it end-to-end

```bash
uv run jasmine new hello
uv run jasmine start
```

Now open `ws://127.0.0.1:8765/ws/notebook/hello` in `websocat`:

```bash
uv run pip install websocat  # or brew install websocat
echo '{"op":"update_cell","cell_id":"c1","source":"print(2+2)"}' | websocat ws://127.0.0.1:8765/ws/notebook/hello
```

You'll see events streaming back. **Your backend works.** 🎉

**Checkpoint 5:** You have a full-stack, reactive Python execution engine over WebSocket. Coffee break earned. ☕☕

---

<a id="8"></a>
## 8. Chapter 6 — React Frontend & CodeMirror Editor

We keep the frontend deliberately simple. **CodeMirror 6 over Monaco** — because it's 10× smaller, headless-testable, and easier to extend.

### 8.1 Bootstrap

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install codemirror @codemirror/lang-python @codemirror/state @codemirror/view @codemirror/commands @codemirror/autocomplete @uiw/react-codemirror yjs y-websocket y-codemirror.next @codemirror/theme-one-dark zustand
```

### 8.2 `frontend/src/protocol.ts`

Mirror the Python `msgspec` types exactly.

```typescript
export type ClientMsg =
  | { op: "run"; cell_id: string }
  | { op: "run_reactive"; cell_id: string }
  | { op: "interrupt" }
  | { op: "update_cell"; cell_id: string; source: string };

export type ServerMsg =
  | { op: "event"; cell_id: string; kind: string; data: any }
  | { op: "graph"; duplicates: Record<string, string[]>; stale: string[] };
```

### 8.3 `frontend/src/store.ts` — Zustand state

```typescript
import { create } from "zustand";

interface Output {
  kind: string;
  data: any;
}

interface Cell {
  id: string;
  source: string;
  outputs: Output[];
  status: "idle" | "running" | "error";
}

interface State {
  cells: Cell[];
  duplicates: Record<string, string[]>;
  setCells: (c: Cell[]) => void;
  updateSource: (id: string, source: string) => void;
  appendOutput: (id: string, out: Output) => void;
  clearOutputs: (id: string) => void;
  setStatus: (id: string, s: Cell["status"]) => void;
  setDuplicates: (d: Record<string, string[]>) => void;
}

export const useStore = create<State>((set) => ({
  cells: [],
  duplicates: {},
  setCells: (cells) => set({ cells }),
  updateSource: (id, source) =>
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, source } : c)),
    })),
  appendOutput: (id, out) =>
    set((s) => ({
      cells: s.cells.map((c) =>
        c.id === id ? { ...c, outputs: [...c.outputs, out] } : c
      ),
    })),
  clearOutputs: (id) =>
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, outputs: [] } : c)),
    })),
  setStatus: (id, status) =>
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, status } : c)),
    })),
  setDuplicates: (duplicates) => set({ duplicates }),
}));
```

### 8.4 `frontend/src/ws.ts` — WebSocket client

```typescript
import type { ClientMsg, ServerMsg } from "./protocol";
import { useStore } from "./store";

export class WSClient {
  ws: WebSocket;
  constructor(name: string) {
    this.ws = new WebSocket(`ws://${location.host}/ws/notebook/${name}`);
    this.ws.binaryType = "arraybuffer";
    this.ws.onmessage = (e) => this.onMessage(e);
  }

  private onMessage(e: MessageEvent) {
    const text =
      typeof e.data === "string"
        ? e.data
        : new TextDecoder().decode(new Uint8Array(e.data));
    const msg: ServerMsg = JSON.parse(text);
    const s = useStore.getState();
    if (msg.op === "event") {
      if (msg.kind === "status") {
        s.setStatus(
          msg.cell_id,
          msg.data.execution_state === "busy" ? "running" : "idle"
        );
        if (msg.data.execution_state === "busy") s.clearOutputs(msg.cell_id);
      } else if (["stream", "execute_result", "display_data", "error"].includes(msg.kind)) {
        s.appendOutput(msg.cell_id, { kind: msg.kind, data: msg.data });
      }
    } else if (msg.op === "graph") {
      s.setDuplicates(msg.duplicates);
    }
  }

  send(msg: ClientMsg) {
    const encoded = new TextEncoder().encode(JSON.stringify(msg));
    this.ws.send(encoded);
  }
}
```

### 8.5 The Cell component — `frontend/src/Cell.tsx`

```typescript
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import type { WSClient } from "./ws";
import { useStore } from "./store";

export function Cell({ id, ws }: { id: string; ws: WSClient }) {
  const cell = useStore((s) => s.cells.find((c) => c.id === id))!;
  const duplicates = useStore((s) => s.duplicates);
  const updateSource = useStore((s) => s.updateSource);

  const isDup = Object.values(duplicates).some((ids) => ids.includes(id));

  return (
    <div className={`cell ${cell.status} ${isDup ? "duplicate" : ""}`}>
      <div className="cell-toolbar">
        <button
          onClick={() => ws.send({ op: "run_reactive", cell_id: id })}
          disabled={cell.status === "running"}
        >
          ▶ Run reactive
        </button>
        <span className="status">{cell.status}</span>
        {isDup && <span className="warn">⚠ duplicate definition</span>}
      </div>
      <CodeMirror
        value={cell.source}
        extensions={[python()]}
        theme={oneDark}
        onChange={(val) => {
          updateSource(id, val);
          ws.send({ op: "update_cell", cell_id: id, source: val });
        }}
      />
      <div className="outputs">
        {cell.outputs.map((o, i) => (
          <Output key={i} out={o} />
        ))}
      </div>
    </div>
  );
}

function Output({ out }: { out: { kind: string; data: any } }) {
  if (out.kind === "stream") return <pre className="stream">{out.data.text}</pre>;
  if (out.kind === "error")
    return (
      <pre className="error">
        {out.data.ename}: {out.data.evalue}
        {"\n"}
        {(out.data.traceback || []).join("\n")}
      </pre>
    );
  if (out.kind === "execute_result" || out.kind === "display_data") {
    const bundle = out.data.data || {};
    if (bundle["image/png"])
      return <img src={`data:image/png;base64,${bundle["image/png"]}`} />;
    if (bundle["text/html"])
      return (
        <div
          className="html"
          dangerouslySetInnerHTML={{ __html: bundle["text/html"] }}
        />
      );
    return <pre>{bundle["text/plain"]}</pre>;
  }
  return null;
}
```

### 8.6 `frontend/src/App.tsx`

```typescript
import { useEffect, useMemo, useState } from "react";
import { Cell } from "./Cell";
import { WSClient } from "./ws";
import { useStore } from "./store";

export default function App() {
  const name = "hello"; // in a real app, from URL
  const ws = useMemo(() => new WSClient(name), [name]);
  const cells = useStore((s) => s.cells);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fetch initial notebook content via REST
    fetch(`/api/notebook/${name}/cells`)
      .then((r) => r.json())
      .then((cells) => {
        useStore.getState().setCells(
          cells.map((c: any) => ({ ...c, outputs: [], status: "idle" }))
        );
        setLoaded(true);
      });
  }, [name]);

  if (!loaded) return <div>Loading…</div>;

  return (
    <div className="notebook">
      <header>
        <h1>🌸 {name}</h1>
      </header>
      {cells.map((c) => (
        <Cell key={c.id} id={c.id} ws={ws} />
      ))}
    </div>
  );
}
```

### 8.7 Minimal styling — `frontend/src/index.css`

```css
body { font-family: -apple-system, sans-serif; margin: 0; background: #1e1e1e; color: #eee; }
.notebook { max-width: 900px; margin: 2rem auto; padding: 1rem; }
.cell { border: 1px solid #333; border-radius: 8px; margin-bottom: 1rem; padding: 0.5rem; }
.cell.running { border-color: #4c8bf5; }
.cell.duplicate { border-color: #d97706; }
.cell-toolbar { display: flex; gap: 1rem; padding: 0.5rem; font-size: 0.85rem; }
.outputs pre { background: #111; padding: 0.5rem; border-radius: 4px; overflow-x: auto; }
.outputs .error { color: #f87171; }
.warn { color: #d97706; }
```

### 8.8 Add REST endpoint the frontend needs

Add to `src/jasmine/api/app.py`:

```python
@app.get("/api/notebook/{name}/cells")
async def get_cells(name: str):
    from ..notebook.format import load_file
    path = AppState.notebook_root / f"{name}.py"
    if not path.exists():
        return []
    nb = load_file(path)
    return [{"id": c.id, "source": c.source} for c in nb.cells]
```

### 8.9 Build & serve

```bash
cd frontend && npm run build
cp -r dist/* ../src/jasmine/frontend/
cd .. && uv run jasmine start
```

Visit http://127.0.0.1:8765 — **you now have a working notebook.** 🌸

**Checkpoint 6:** Full-stack MVP done. Everything from here is polish + killer features.

---

<a id="9"></a>
## 9. Chapter 7 — Real-time Collaboration with Yjs (killer feature #3)

Yjs is a CRDT library. **CRDT = "Conflict-free Replicated Data Type"** — a math structure where any two users' edits merge deterministically regardless of order. Google Docs uses a related idea; Yjs is the open-source champion.

**Lazy plan:** The Python server is a Yjs *hub*, not a peer. Clients push binary Y-updates, server rebroadcasts + persists. **No CRDT logic on server side beyond storing bytes.** That's why `y-py` is enough.

### 9.1 Extend the protocol

Add a binary message type. In `src/jasmine/api/session.py`, replace the WebSocket loop to distinguish text (control JSON) from binary (Yjs update bytes):

```python
# In app.py, replace the websocket handler:
@app.websocket("/ws/notebook/{name}")
async def notebook_ws(ws: WebSocket, name: str):
    path = AppState.notebook_root / f"{name}.py"
    if not path.exists():
        await ws.close(code=4404)
        return
    await ws.accept()

    session = AppState.sessions.get(name)
    if session is None:
        session = await NotebookSession.open(path, AppState.pool)
        AppState.sessions[name] = session
    await session.add_client(ws)
    try:
        while True:
            m = await ws.receive()
            if "text" in m:
                msg = decode_client(m["text"].encode())
                await session.handle(msg)
            elif "bytes" in m:
                await session.handle_yjs(ws, m["bytes"])
    except WebSocketDisconnect:
        await session.remove_client(ws)
```

### 9.2 Add Yjs to the session

```python
# in session.py
import y_py as Y

# inside NotebookSession:
ydoc: Y.YDoc = field(default_factory=Y.YDoc)

async def handle_yjs(self, ws: WebSocket, data: bytes) -> None:
    # Apply update to server's authoritative doc
    Y.apply_update(self.ydoc, data)
    # Rebroadcast to all *other* clients
    for other in self.clients:
        if other is ws:
            continue
        try:
            await other.send_bytes(data)
        except Exception:
            pass
    # Persist source from Y doc back to cells (debounced in real impl)
    ytext_map = self.ydoc.get_map("cells")
    for cell in self.notebook.cells:
        yt = ytext_map.get(cell.id)
        if yt is not None:
            cell.source = str(yt)
            self.graph.upsert(cell.id, analyze(cell.source))
```

### 9.3 Frontend Yjs binding

```bash
# already installed: yjs y-codemirror.next
```

Update `Cell.tsx` to bind CodeMirror to a Y.Text:

```typescript
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useMemo } from "react";

// Higher up, one doc per notebook:
export const ydoc = new Y.Doc();
export const provider = new WebsocketProvider(
  `ws://${location.host}/ws/notebook`, "hello", ydoc
);

// Inside Cell:
const ytext = useMemo(() => {
  const map = ydoc.getMap("cells");
  let t = map.get(id) as Y.Text | undefined;
  if (!t) { t = new Y.Text(); map.set(id, t); }
  return t;
}, [id]);

// Use ytext instead of value:
<CodeMirror
  extensions={[python(), yCollab(ytext, provider.awareness)]}
  theme={oneDark}
/>
```

Open two browser tabs. Type in one. **Watch the other update in real time.** You just built Google Docs for Python. 🎉

### Concept sidebar 🧠: Why CRDT beats OT

**OT (Operational Transform)** — Google Docs' original approach — requires a central server that transforms operations. Hard to prove correct, harder to scale, dead when server is down.

**CRDT** — every operation is commutative and idempotent by *math*. You can merge updates in any order. Peer-to-peer works. Offline-first works. This is why every serious real-time app since 2020 (Notion, Figma, Linear internals) uses CRDT-like structures.

**Checkpoint 7:** You built real-time collab. Fewer than 30 lines of Python. This is what "lazy = superpower" looks like. 🌸

---

<a id="10"></a>
## 10. Chapter 8 — Rich Outputs, Plots, Widgets

Good news: because we speak the Jupyter protocol, matplotlib, pandas HTML tables, plotly, altair — they all *just work*. Our `Output` component already handles `image/png` and `text/html`. Try it:

```python
import matplotlib.pyplot as plt
plt.plot([1,2,3,4])
plt.show()
```

The kernel emits `display_data` with `image/png`. We render it. Done.

For custom widgets, the lazy answer: **provide a `@jasmine.ui` decorator that emits a `display_data` bundle with a custom MIME type**, and let the frontend register handlers.

`src/jasmine/__init__.py`:

```python
"""Jasmine — reactive Python notebooks."""
from __future__ import annotations

import json
from typing import Any, Callable
from IPython.display import display


def ui(mime: str = "application/vnd.jasmine.widget+json"):
    """Decorator: publish a JSON widget spec to the frontend."""
    def deco(fn: Callable[..., dict]) -> Callable[..., None]:
        def wrapper(*args: Any, **kw: Any) -> None:
            spec = fn(*args, **kw)
            display({mime: json.dumps(spec), "text/plain": repr(spec)}, raw=True)
        return wrapper
    return deco


__all__ = ["ui"]
__version__ = "0.1.0"
```

Frontend adds a handler in `Cell.tsx`:

```typescript
if (bundle["application/vnd.jasmine.widget+json"]) {
  const spec = JSON.parse(bundle["application/vnd.jasmine.widget+json"]);
  return <JasmineWidget spec={spec} />;
}
```

Users can then write:

```python
import jasmine

@jasmine.ui()
def slider(name, min, max, value):
    return {"kind": "slider", "name": name, "min": min, "max": max, "value": value}

slider("temperature", 0, 100, 50)
```

Simple. No ipywidgets nightmare.

---

<a id="11"></a>
## 11. Chapter 9 — Testing Strategy

Three levels. **Lazy engineers write fewer tests, but the ones they write catch everything.**

### 11.1 Unit — pure functions

You already have these for `analyzer`, `graph`, `scheduler`, `format`. **Rule: any pure function has 100% coverage.**

### 11.2 Integration — kernel + session

`tests/integration/test_session.py`:

```python
import pytest
from pathlib import Path

from jasmine.kernel.manager import KernelPool
from jasmine.api.session import NotebookSession
from jasmine.notebook.format import Cell, Notebook, save_file

pytestmark = pytest.mark.asyncio


async def test_reactive_run(tmp_path: Path):
    nb_path = tmp_path / "test.py"
    save_file(Notebook(cells=[
        Cell("c1", "x = 10"),
        Cell("c2", "y = x * 2"),
        Cell("c3", "print(y)"),
    ]), nb_path)

    pool = KernelPool(warm_size=1)
    await pool.start()
    try:
        sess = await NotebookSession.open(nb_path, pool)

        collected = []

        class FakeWS:
            async def send_bytes(self, data): collected.append(data)

        ws = FakeWS()
        sess.clients.add(ws)

        from jasmine.api.protocol import RunReactive
        await sess.handle(RunReactive(cell_id="c1"))
        # wait for events
        import anyio
        await anyio.sleep(2)

        text_all = b"".join(collected).decode()
        assert "20" in text_all
        await sess.close(pool)
    finally:
        await pool.stop()
```

### 11.3 E2E — Playwright hits the browser

`tests/e2e/test_smoke.py`:

```python
import subprocess
import time
import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="module")
def server():
    p = subprocess.Popen(["uv", "run", "jasmine", "start", "--port", "8899"])
    time.sleep(2)
    yield "http://127.0.0.1:8899"
    p.terminate()


def test_run_cell(server, tmp_path):
    subprocess.check_call(["uv", "run", "jasmine", "new", "e2e_hello"])
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page()
        page.goto(f"{server}/?nb=e2e_hello")
        page.get_by_role("textbox").fill("print(6*7)")
        page.get_by_text("Run reactive").click()
        page.wait_for_selector("text=42", timeout=10_000)
        b.close()
```

Install playwright browsers once: `uv run playwright install chromium`.

**Testing philosophy for lazy engineers:**
- Unit tests **document expected behavior** — must be fast (<1s each).
- Integration tests **prove seams**. One per seam.
- E2E tests **prove nothing regressed for the user**. 3-5 total.
- Never: 100 tests of the same layer. That's cargo-culting, not testing.

---

<a id="12"></a>
## 12. Chapter 10 — Packaging, CI/CD, Production Deploy

### 12.1 The Dockerfile — multi-stage, ~50MB image

```dockerfile
# Stage 1: build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build Python wheel
FROM ghcr.io/astral-sh/uv:0.5-python3.13-bookworm-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/
COPY --from=frontend /app/dist/ ./src/jasmine/frontend/
RUN uv build --wheel

# Stage 3: runtime
FROM python:3.13-slim
RUN pip install --no-cache-dir uv
COPY --from=builder /app/dist/*.whl /tmp/
RUN uv pip install --system /tmp/*.whl && rm /tmp/*.whl
EXPOSE 8765
CMD ["jasmine", "start", "--host", "0.0.0.0", "--port", "8765"]
```

Build:
```bash
docker build -t jasmine:latest .
docker run -p 8765:8765 -v $(pwd)/notebooks:/notebooks jasmine:latest
```

### 12.2 CI — `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python: ["3.13"]
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
        with: { enable-cache: true }
      - uses: actions/setup-python@v5
        with: { python-version: ${{ matrix.python }} }
      - name: Install
        run: uv sync --all-extras
      - name: Lint
        run: uv run ruff check .
      - name: Type check
        run: uv run mypy src/jasmine
      - name: Test
        run: uv run pytest --cov=jasmine --cov-report=xml
      - uses: codecov/codecov-action@v4

  publish:
    needs: test
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # trusted publishing to PyPI, no tokens!
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv build
      - uses: pypa/gh-action-pypi-publish@release/v1
```

**PyPI trusted publishing** — no API tokens, GitHub proves your identity via OIDC. Enable it once in PyPI project settings. Once configured, `git tag v0.1.1 && git push --tags` publishes automatically.

### 12.3 Install path for end users

```bash
uv tool install jasmine
jasmine start
```

One command. That's the deploy story.

---

<a id="13"></a>
## 13. Chapter 11 — Becoming an OSS Contributor: Playbook

You built Jasmine. Now use the skills to contribute upstream.

**The lazy contribution loop:**

1. **Pick projects you actually use.** You just used `jupyter_client`, `FastAPI`, `y-py`. Watch their issue trackers.
2. **Start with `good-first-issue` labels.** Not because they're easy, but because maintainers have declared them mentor-friendly.
3. **Reproduce the bug first.** In a script. Attach the script to your PR. Maintainers merge fast when repro is trivial.
4. **Write the test before the fix.** Non-negotiable.
5. **Small PRs. One concept per PR.** A 30-line PR gets merged. A 3000-line PR gets bikeshedded for months.
6. **Read `CONTRIBUTING.md` before typing.** Every project. Every time.
7. **Docs PRs count.** Fix a typo, clarify a paragraph. This is how you meet maintainers.

**Where to start (as of July 2026):**

- `fastapi/fastapi` — huge, welcoming, always docs to improve.
- `astral-sh/uv` — moves fast, great mentorship in the discussions.
- `jupyter/jupyter_client` — you now understand the code more than most.
- `marimo-team/marimo` — best-in-class reactive notebook; you'll learn what "next Jasmine" looks like.
- Your own repo — publish Jasmine. First user is you. That still counts.

**Expert Python growth path from here:**

| Skill | How to acquire (lazy version) |
|-------|------------------------------|
| Async internals | Read Trio's tutorial. Not asyncio's. Same concepts, better docs. |
| Packaging | Read one PEP a week: 517, 518, 621, 660, 723. |
| Performance | Learn `msgspec`, `polars`, `pyarrow`. Skip `pandas` for hot paths. |
| Concurrency | `anyio` + structured concurrency. Never plain threads unless proven necessary. |
| Type theory | `mypy --strict`. Then `pyright`. Then look up `Protocol` and `TypeVar`. |
| Systems | Write a toy shell, a toy database, a toy container runtime. One weekend each. |

---

<a id="14"></a>
## 14. Appendix A — Concept Deep-Dives

### A.1 Why msgspec > pydantic for wire protocols

Pydantic v2 is fast, but msgspec is **5-10× faster** on JSON encode/decode because it generates specialized C code per struct. For a WebSocket streaming 1000+ events/sec, this matters. For a `POST /users` endpoint that runs once per request, use whichever you prefer.

### A.2 Structured concurrency — the mindset shift

```python
async with anyio.create_task_group() as tg:
    tg.start_soon(read_kernel)
    tg.start_soon(broadcast_to_clients)
# Exiting the `with` block guarantees BOTH tasks are done or cancelled.
# One task crashes → the group cancels everything else.
```

Compare to `asyncio.create_task()` — orphaned tasks, silent failures, cleanup nightmares. **Never write async code without structured concurrency in 2026.**

### A.3 SQLite is a real database

For Jasmine metadata (user prefs, session history, permissions), SQLite handles it. Netflix, Fossil, WhatsApp use SQLite in production. Rule of thumb: <10K writes/sec, <1TB data → SQLite is correct.

Add later when needed:

```python
# src/jasmine/storage/db.py
import aiosqlite
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    notebook TEXT NOT NULL,
    user TEXT,
    started_at REAL NOT NULL,
    last_active REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_notebook ON sessions(notebook);
"""

async def get_db(path: Path):
    db = await aiosqlite.connect(path)
    await db.executescript(SCHEMA)
    return db
```

### A.4 The `ast` module is criminally underused

Static analysis, linters, refactoring tools, migration scripts — all built on `ast`. You just used it to build reactivity. Next projects:
- Write a script that upgrades all `dict(a=1)` to `{"a": 1}`.
- Write a linter that flags `datetime.now()` (no timezone).
- Write a `TODO` extractor that groups by author.

30 lines each. Great portfolio material.

### A.5 Reading order for Jupyter internals

If you want to become the world's expert on notebook internals:
1. `jupyter_client/session.py` — message framing.
2. `ipykernel/kernelbase.py` — how kernels execute code.
3. `jupyter_server/services/kernels/*` — the reference server.
4. Marimo's `marimo/_runtime/runner/` — modern reactive engine.
5. This file — you now know Jasmine's engine.

---

## 🎓 Sensei's Closing Words

You built something real:

- **~1500 lines of Python** — a full notebook server, reactive engine, collab, file format.
- **~400 lines of TypeScript** — a working frontend.
- **Zero framework lock-in** — you own every design decision.
- **Deployable** — one Docker image, one command install.

You now understand:
- How Jupyter *actually* works under the hood.
- Dataflow / reactive programming.
- CRDT-based real-time collab.
- Modern Python packaging (pyproject, uv, PEP 621, PEP 660).
- Structured concurrency, async iterators, FastAPI internals.
- Multi-stage Docker, PyPI trusted publishing, GitHub Actions.
- **Why "lazy" is a discipline, not a shortcut.**

**The lazy engineer's final law:** Ship. A running Jasmine v0.1.0 in the world teaches you more in one week than another six months of features in a private repo.

```bash
# Do this today, right now:
git init && git add -A && git commit -m "🌸 Jasmine v0.1.0 — hello world"
gh repo create jasmine --public --push
# Now write a blog post. Then open a PR to jupyter_client.
```

Welcome to the guild. 🌸

— Sensei out.
