<p align="center">
  <img src="assets/kikyo-logo.svg" width="160" alt="Kikyo Logo" />
</p>

# Kikyo (桔梗)

> **A reactive, git-friendly Python notebook that stores code as clean `.py` scripts and eliminates out-of-order execution bugs.**

[![Python 3.12+](https://img.shields.io/badge/python-3.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Tests: 26 passed](https://img.shields.io/badge/tests-26%20passed-success.svg)]()

---

## Why Kikyo?

Traditional notebooks suffer from two fundamental design flaws:

1. **Hidden State & Out-of-Order Execution**: If you run Cell 1, jump to Cell 4, modify Cell 2, and re-run Cell 3, your memory namespace is corrupted. What worked 5 minutes ago will fail when the notebook is run top-to-bottom.
2. **Git Merge Conflicts**: Standard Jupyter notebooks store code, stdout, execution counts, base64 images, and metadata in a single monolithic `.ipynb` JSON file. A 1-line code change routinely produces a 2,000-line git diff and merge conflicts.

**Kikyo takes a different approach:**
- **Code as Pure Python**: Every notebook is a plain Python file (`experiment.py`) with standard `# %%` block comments. You can open it in Neovim or VS Code, run it with `python experiment.py`, and inspect clean 1-line git diffs.
- **Sidecar Output Storage**: Execution outputs and plots stream into an append-only companion file (`experiment.kout`), keeping your repository git history free of multi-megabyte base64 plots.
- **Reactive Dependency Flow**: Kikyo parses the Abstract Syntax Tree (AST) of each block to identify global definitions, reads, and in-place mutations. Running a cell automatically re-executes all downstream dependent cells in topological DAG order.
- **Anti-AI-Slop Minimalism**: A serene, Notion-inspired document canvas with default full-width layout. No cluttered menus, no artificial widgets—just your code, your markdown, drag-and-drop block ordering, and instant feedback.

---

## Quickstart

### Installation

```bash
# Using uv (recommended)
uv tool install kikyo-notebook

# Or using pip
pip install kikyo-notebook
```

### Launching

```bash
# Start the reactive environment in the current folder
kikyo start

# Or create and start a new named notebook
kikyo new experiment
kikyo start
```

Open `http://127.0.0.1:8765` in your browser.

---

## Core Concepts

### 1. Reactive Flow vs. Classic Execution

Kikyo gives you complete control over execution semantics via a toggle in the top bar or via the Command Palette (<kbd>Ctrl+K</kbd>):

* **Reactive Flow (Default)**:
  ```python
  # Cell 1
  x = 10

  # Cell 2 (depends on x)
  y = x * 2

  # Cell 3 (depends on y)
  print(f"Result: {y}")
  ```
  If you edit Cell 1 to `x = 25` and run it, Kikyo automatically determines that Cell 2 and Cell 3 depend on `x`, executing them in topological order. You never have to manually track which cells need updating.

* **Classic Execution**:
  Runs **only** the cell you executed, without propagating downstream changes. Ideal when you are iterating on a single expensive calculation (e.g. database query, training step) and do not want downstream blocks to trigger yet.

### 2. Dual-File Storage Architecture

```
my_project/
├── experiment.py       # Pure Python script with # %% cell markers (Version controlled)
└── experiment.kout     # Append-only JSONL execution output sidecar (Gitignored)
```

`experiment.py` contains valid Python code:

```python
# kikyo:notebook v=1
# kikyo:cell id=c1 cell_type=markdown
# # Exploratory Data Analysis

# kikyo:cell id=c2
import numpy as np
import pandas as pd

# kikyo:cell id=c3
data = np.random.randn(100, 2)
df = pd.DataFrame(data, columns=["x", "y"])
print(df.describe())
```

If you ever decide to stop using Kikyo, you are not locked into any proprietary format. Your notebooks are already standard Python scripts that run out of the box with `python experiment.py`.

### 3. Persistent Daemon Kernels

Kernels run as decoupled background processes managed over ZeroMQ. If you refresh your browser, close the tab, or experience a temporary network disconnect, your long-running training loop or data download will **not** be killed. When you reopen the page, the WebSocket client reconnects and streams the latest state.

### 4. Real-time Multiplayer Collaboration

Kikyo includes conflict-free multi-user synchronization out of the box using [pycrdt](https://github.com/jupyter-server/pycrdt) (Yjs CRDTs) and WebSocket message broadcasting:
- **Zero-config collaboration**: Run `kikyo start --host 0.0.0.0 --port 8765` on your workstation, local network, VPN, or cloud VM.
- Anyone opening the shared URL (`http://<ip-or-host>:8765`) connects to the exact same notebook session.
- Code typing, block reordering, and additions synchronize live across all browser windows.
- Execution outputs, kernel state, and reactive graph updates stream simultaneously to all peers.

---

## Complete User Guide & Everyday Workflow

Here is how you use Kikyo for data exploration, ML prototyping, and collaborative development:

### 1. Creating and Managing Notebooks
- **Start Kikyo**: Run `kikyo start` in your project folder and open `http://127.0.0.1:8765`.
- **Create a new notebook**: Click the **+ New** button in the top left breadcrumb, or run `kikyo new experiment` from your terminal.
- **Switch between notebooks**: Use the top breadcrumb dropdown selector or press <kbd>Ctrl+K</kbd> to open the Command Palette.
- **Rename inline**: Click directly on the notebook title at the top of the canvas, type the new name, and press <kbd>Enter</kbd>.

### 2. Working with Cells
- **Two Navigation Modes**:
  - **Command Mode** (Blue accent): Navigate cells with <kbd>J</kbd>/<kbd>K</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd>. Create new cells with <kbd>A</kbd> (above) or <kbd>B</kbd> (below). Delete with <kbd>D, D</kbd>.
  - **Edit Mode** (Green accent): Press <kbd>Enter</kbd> (or click inside code) to edit. Press <kbd>Esc</kbd> to return to Command Mode.
- **Cell Types**:
  - Press <kbd>Y</kbd> to convert a cell to Python Code.
  - Press <kbd>M</kbd> to convert a cell to Markdown. Markdown cells render formatted prose, headers, lists, and math.
- **Running Code**:
  - <kbd>Shift + Enter</kbd>: Runs the active cell and advances focus to the next block (or creates a new code block at the bottom).
  - <kbd>Ctrl + Enter</kbd>: Runs the active cell in-place.
  - **Stop Button**: If code is stuck in a long calculation, click the red **Stop** button in the header (or press <kbd>I, I</kbd> in Command Mode) to interrupt execution without losing runtime memory.

### 3. Understanding Cell Indicators & Guardrails
- **`def: [symbol1, symbol2]` (Green badge)**: Indicates the top-level variables, functions, or classes this block exports to the notebook namespace.
- **`→ N deps` (Sky-blue badge)**: Shows how many downstream cells depend on variables defined in this block.
- **`dup: [symbol]` (Amber warning)**: Alerts you when two separate cells define the same variable name, preventing accidental namespace collisions.

### 4. When to Use Classic Mode vs. Reactive Mode
- **Reactive Flow (Default)**: Best for exploratory analysis, feature engineering, and reports. Editing an upstream variable (e.g., changing `sample_size = 500`) automatically triggers downstream cells in topological DAG order.
- **Classic Mode (Opt-in single-cell)**: Best for heavy ML training, large dataset downloads, or slow API calls. Click the **⚡ Reactive** toggle in the header or use <kbd>Ctrl+K</kbd> to switch to Classic mode, so executing an upstream cell updates state without auto-running heavy downstream cells.

### 5. Inspecting the Reactive Graph & Variables
- Press <kbd>Ctrl+G</kbd> or click **Graph** in the top bar to open the slide-out **Reactive Graph & Variable Inspector Drawer**.
- Displays the complete DAG dependency tree, symbol definitions, and detects circular dependency cycles.

### 6. Drag & Drop Reordering
- Grab the drag handle (<kbd>⋮⋮</kbd>) on the left of any cell to drag and reorder blocks effortlessly.
- Or use keyboard shortcuts: <kbd>Alt + ↑</kbd> to move up, <kbd>Alt + ↓</kbd> to move down.
- Reordering instantly updates the underlying `.py` file and recalculates the reactive DAG.

### 7. Git & Production Best Practices
Each notebook consists of:
- `notebooks/experiment.py`: Pure Python code with `# %%` cell markers. **Commit this file to git.**
- `notebooks/experiment.kout`: Append-only JSONL sidecar containing execution logs and images. **Add `*.kout` to `.gitignore`.**

```gitignore
# .gitignore
*.kout
```
- **Run headlessly**: Any Kikyo notebook can be run directly from terminal or CI/CD:
  ```bash
  python notebooks/experiment.py
  ```

### 8. Importing & Exporting Jupyter Notebooks
- **Import existing notebooks**:
  ```bash
  kikyo convert my_existing.ipynb --output-dir notebooks/
  ```
- **Export to Jupyter**:
  ```bash
  kikyo export notebooks/experiment.py --output-file experiment.ipynb
  ```

---

## User Interface & Keyboard Navigation

Kikyo adopts the proven two-mode workflow of classic Jupyter with modern Notion-like design:

- **Edit Mode** (Green accent bar): Cursor is inside the editor. Type code or markdown directly.
- **Command Mode** (Blue accent bar): Cell is selected. Navigate and organize notebook structure using single-key shortcuts.
- **Full-Width Canvas**: Generous full-width document canvas by default (toggleable via the `...` menu or Command Palette).

### Keyboard Shortcuts

| Action | Shortcut | Mode |
| :--- | :--- | :--- |
| **Run cell & advance** | <kbd>Shift + Enter</kbd> | Edit / Command |
| **Run cell in-place** | <kbd>Ctrl + Enter</kbd> | Edit / Command |
| **Enter Edit Mode** | <kbd>Enter</kbd> (or click cell) | Command |
| **Enter Command Mode** | <kbd>Esc</kbd> | Edit |
| **Insert cell above** | <kbd>A</kbd> | Command |
| **Insert cell below** | <kbd>B</kbd> | Command |
| **Convert to Code** | <kbd>Y</kbd> | Command |
| **Convert to Markdown** | <kbd>M</kbd> | Command |
| **Move cell up / down** | <kbd>Alt + ↑</kbd> / <kbd>Alt + ↓</kbd> | Any |
| **Drag & drop cell** | Drag the <kbd>⋮⋮</kbd> handle | Any |
| **Delete cell** | <kbd>D, D</kbd> | Command |
| **Navigate cells** | <kbd>J</kbd> / <kbd>K</kbd> or <kbd>↑</kbd> / <kbd>↓</kbd> | Command |
| **Command Palette** | <kbd>Ctrl + K</kbd> or <kbd>Cmd + K</kbd> | Global |
| **Reactive Graph Drawer** | <kbd>Ctrl + G</kbd> | Global |
| **Interrupt execution** | <kbd>I, I</kbd> | Command |
| **Restart kernel** | <kbd>0, 0</kbd> | Command |

---

## CLI Reference

```bash
# Start the web server
kikyo start [--host 127.0.0.1] [--port 8765] [--notebook-dir ./notebooks]

# Create a new empty notebook
kikyo new <notebook_name> [--notebook-dir ./notebooks]

# Export a Kikyo notebook to standard Jupyter .ipynb
kikyo export notebooks/experiment.py [--output-file experiment.ipynb]

# Convert an existing Jupyter .ipynb into a Kikyo .py + .kout pair
kikyo convert my_notebook.ipynb [--output-dir ./notebooks]
```

---

## Engineering Architecture

```
                          ┌──────────────────────────┐
                          │   Browser Client (UI)    │
                          │ React 19 + CodeMirror 6  │
                          └─────────────┬────────────┘
                                        │ WebSocket (JSON + Binary CRDT)
                                        ▼
                          ┌──────────────────────────┐
                          │    FastAPI HTTP / WS     │
                          │   Msgspec Wire Protocol  │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┼───────────────────────────┐
           ▼                            ▼                           ▼
┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
│   Reactive DAG     │       │   Storage Engine   │       │ Daemon IPyKernel   │
│ AST Symbol Parse   │       │ .py Format Parser  │       │ ZeroMQ Shell /     │
│ Topological Sort   │       │ .kout JSONL Sidecar│       │ IOPub Channels     │
│ Cycle Detection    │       │ Bidirectional Conv │       │ Cascading Abort    │
└────────────────────┘       └────────────────────┘       └────────────────────┘
```

### Directory Structure

```
kikyo/
├── src/kikyo/
│   ├── api/                 # FastAPI routes, WebSocket loop, Msgspec schemas
│   │   ├── app.py           # Application factory, REST endpoints
│   │   ├── protocol.py      # Msgspec binary/JSON protocol structs
│   │   └── session.py       # NotebookSession state, execution pipeline, CRDT relay
│   ├── kernel/              # Daemon Jupyter kernel management
│   │   ├── bridge.py        # Async ZeroMQ client bridge for shell and iopub
│   │   └── manager.py       # KernelPool for warm pre-warmed kernel processes
│   ├── reactive/            # AST static analysis and dependency resolution
│   │   ├── analyzer.py      # Python ast.NodeVisitor for defines, reads, mutations
│   │   ├── graph.py         # ReactiveGraph DAG representation
│   │   └── pipeline.py      # Tarjan cycle detection and topological run planning
│   ├── storage/             # File serialization & converters
│   │   ├── format.py        # Pure Python `# %%` loader, serializer & .ipynb converter
│   │   ├── sidecar.py       # Append-only `.kout` JSONL execution output log
│   │   └── db.py            # SQLite state database
│   ├── collab/              # Real-time multiplayer synchronization
│   │   └── protocol.py      # pycrdt (Yjs CRDT) document bindings
│   └── cli/                 # Typer CLI commands (start, new, export, convert)
│
├── frontend/                # Single-page application
│   ├── src/
│   │   ├── App.tsx          # Minimalist Notion shell & layout manager
│   │   ├── Cell.tsx         # CodeMirror 6 Python block with autocompletion
│   │   ├── MarkdownCell.tsx # Rendered/editable Markdown block
│   │   ├── HomeDocs.tsx     # Notion-crafted Home Dashboard & Documentation
│   │   ├── CommandPalette.tsx # Spotlight command search modal (Ctrl+K)
│   │   ├── ReactiveDrawer.tsx # DAG visualizer and global variable inspector
│   │   ├── Output.tsx       # ANSI stream, HTML, images, and error display
│   │   ├── store.ts         # Zustand centralized state
│   │   └── ws.ts            # WebSocket client handler
│   └── package.json
│
└── tests/                   # Integration and unit tests (25 passing tests)
    ├── integration/
    └── unit/
```

---

## Contributing & Development

Contributions are welcome! Kikyo is built with clean Python 3.12+ type hints and standard React/TypeScript tooling.

### Prerequisites

- Python 3.12 or 3.13
- [uv](https://github.com/astral-sh/uv) (recommended package manager)
- Node.js 20+

### Setup

```bash
# 1. Clone repository
git clone https://github.com/spellsaif/kikyo.git
cd kikyo

# 2. Set up Python virtual environment and install dependencies
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"

# 3. Install frontend dependencies
cd frontend
npm install
```

### Running Tests

```bash
# Run backend pytest suite (unit + integration tests)
pytest -v

# Run frontend build check
cd frontend
npm run build
```

### Development Server

```bash
# Start backend in watch mode
kikyo start

# In another terminal, start frontend with HMR
cd frontend
npm run dev
```

---

## License

Kikyo is open-source software licensed under the [Apache 2.0 License](LICENSE).
