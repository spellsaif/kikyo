"""FastAPI server application factory with detached session reaper."""
from __future__ import annotations

import asyncio
import logging
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketDisconnected
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from ..kernel.manager import KernelPool
from ..storage.format import Notebook, load_file, save_file, to_ipynb
from ..storage.sidecar import OutputSidecar
from .protocol import decode_client
from .session import NotebookSession

log = logging.getLogger(__name__)


class AppState:
    pool: KernelPool
    sessions: dict[str, NotebookSession] = {}
    notebook_root: Path
    lease_ttl: float = 86400.0  # 24 hours
    reaper_task: asyncio.Task | None = None


async def _reap_expired_sessions() -> None:
    """Background task to clean up sessions disconnected longer than lease_ttl."""
    while True:
        try:
            await asyncio.sleep(60.0)
            now = time.time()
            expired: list[str] = []
            for name, sess in list(AppState.sessions.items()):
                if sess.last_disconnected_at is not None:
                    if now - sess.last_disconnected_at > AppState.lease_ttl:
                        expired.append(name)

            for name in expired:
                sess = AppState.sessions.pop(name, None)
                if sess:
                    log.info("Reaping expired detached session %s (lease TTL exceeded)", name)
                    await sess.close(AppState.pool)
        except asyncio.CancelledError:
            break
        except Exception as e:
            log.error("Error in session reaper: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    AppState.notebook_root = Path("./notebooks").resolve()
    AppState.notebook_root.mkdir(parents=True, exist_ok=True)
    AppState.pool = KernelPool(warm_size=1, default_cwd=AppState.notebook_root)
    await AppState.pool.start()
    AppState.reaper_task = asyncio.create_task(_reap_expired_sessions())
    log.info("Kikyo server started (notebook root: %s)", AppState.notebook_root)

    try:
        yield
    finally:
        if AppState.reaper_task:
            AppState.reaper_task.cancel()
        for s in list(AppState.sessions.values()):
            await s.close(AppState.pool)
        AppState.sessions.clear()
        await AppState.pool.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Kikyo", version="0.2.0", lifespan=lifespan)

    @app.get("/api/notebooks")
    async def list_notebooks():
        return sorted(p.stem for p in AppState.notebook_root.glob("*.py"))

    @app.post("/api/notebooks/{name}")
    async def create_notebook(name: str):
        path = AppState.notebook_root / f"{name}.py"
        if path.exists():
            raise HTTPException(status_code=400, detail="Notebook already exists")
        save_file(Notebook.new(), path)
        return {"ok": True, "name": name}

    @app.post("/api/notebooks/{name}/rename")
    async def rename_notebook(name: str, payload: dict):
        raw_name = payload.get("new_name", "").strip()
        if not raw_name:
            raise HTTPException(status_code=400, detail="New notebook name cannot be empty")
        new_name = re.sub(r"[^\w\-]", "_", raw_name.removesuffix(".py"))
        if not new_name:
            raise HTTPException(status_code=400, detail="Invalid notebook name")

        old_path = AppState.notebook_root / f"{name}.py"
        if not old_path.exists():
            raise HTTPException(status_code=404, detail="Notebook not found")

        new_path = AppState.notebook_root / f"{new_name}.py"
        if new_path.exists() and new_name != name:
            raise HTTPException(status_code=400, detail=f"Notebook '{new_name}' already exists")

        # Close session for old name if active
        sess = AppState.sessions.pop(name, None)
        if sess:
            await sess.close(AppState.pool)

        # Rename .py file
        if new_path != old_path:
            old_path.rename(new_path)

        # Rename .kout sidecar file if present
        old_sidecar = AppState.notebook_root / f"{name}.kout"
        new_sidecar = AppState.notebook_root / f"{new_name}.kout"
        if old_sidecar.exists() and old_sidecar != new_sidecar:
            old_sidecar.rename(new_sidecar)

        return {"ok": True, "old_name": name, "new_name": new_name}

    @app.delete("/api/notebooks/{name}")
    async def delete_notebook(name: str):
        path = AppState.notebook_root / f"{name}.py"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Close and remove session if active
        sess = AppState.sessions.pop(name, None)
        if sess:
            await sess.close(AppState.pool)

        # Delete notebook file and sidecar
        path.unlink(missing_ok=True)
        sidecar_path = AppState.notebook_root / f"{name}.kout"
        sidecar_path.unlink(missing_ok=True)

        return {"ok": True, "name": name}

    @app.get("/api/notebook/{name}/cells")
    async def get_notebook_cells(name: str):
        path = AppState.notebook_root / f"{name}.py"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Notebook not found")
        nb = load_file(path)
        sidecar = OutputSidecar(path)
        all_outputs = sidecar.get_all_outputs()

        return [
            {
                "id": c.id,
                "source": c.source,
                "cell_type": c.cell_type,
                "outputs": all_outputs.get(c.id, []),
            }
            for c in nb.cells
        ]

    @app.get("/api/notebook/{name}/export")
    async def export_ipynb(name: str):
        path = AppState.notebook_root / f"{name}.py"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Notebook not found")
        nb = load_file(path)
        sidecar = OutputSidecar(path)
        ipynb_json = to_ipynb(nb, sidecar.get_all_outputs())
        return JSONResponse(
            content=ipynb_json,
            headers={"Content-Disposition": f'attachment; filename="{name}.ipynb"'},
        )

    @app.get("/api/notebook/{name}/export/py")
    async def export_py(name: str):
        path = AppState.notebook_root / f"{name}.py"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Notebook not found")
        content = path.read_text(encoding="utf-8")
        return PlainTextResponse(
            content=content,
            headers={"Content-Disposition": f'attachment; filename="{name}.py"'},
        )

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
                msg = await ws.receive()
                if "text" in msg:
                    try:
                        client_msg = decode_client(msg["text"].encode("utf-8"))
                    except Exception as err:
                        log.warning("Could not decode client message: %s", err)
                        continue
                    try:
                        await session.handle_control(client_msg, ws)
                    except Exception as err:
                        log.error("Error executing client control message: %s", err, exc_info=True)
                elif "bytes" in msg:
                    await session.handle_crdt(ws, msg["bytes"])
        except (WebSocketDisconnect, WebSocketDisconnected):
            await session.remove_client(ws)
        except Exception as e:
            log.warning("WebSocket connection ended: %s", e)
            await session.remove_client(ws)

    # Static frontend assets
    frontend_dir = Path(__file__).parent.parent / "frontend"
    if (frontend_dir / "index.html").exists():
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app


app = create_app()
