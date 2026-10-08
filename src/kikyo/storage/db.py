"""SQLite persistence for sessions, execution history, and metadata."""
from __future__ import annotations

from pathlib import Path
import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    notebook TEXT NOT NULL,
    started_at REAL NOT NULL,
    last_active REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    cell_id TEXT NOT NULL,
    started_at REAL NOT NULL,
    duration_ms REAL NOT NULL,
    success INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_notebook ON sessions(notebook);
CREATE INDEX IF NOT EXISTS idx_exec_log_session ON execution_log(session_id);
"""


async def get_db(db_path: Path) -> aiosqlite.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(db_path))
    await db.executescript(SCHEMA)
    return db
