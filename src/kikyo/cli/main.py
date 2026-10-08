"""Command-line interface for Kikyo."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import typer
import uvicorn
from rich.console import Console
from rich.table import Table

from ..storage.format import Notebook, from_ipynb, load_file, save_file, to_ipynb
from ..storage.sidecar import OutputSidecar

app = typer.Typer(help="🪻 Kikyo — Reactive, collaborative, git-friendly Python notebooks.")
console = Console()


import socket

def _find_available_port(host: str, start_port: int, max_attempts: int = 50) -> int:
    """Find the next open port starting from start_port."""
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, p))
                return p
            except OSError:
                continue
    return start_port


@app.command()
def start(
    host: str = "127.0.0.1",
    port: int = 8765,
    notebook_dir: Path = Path("./notebooks"),
    reload: bool = False,
):
    """Start the Kikyo notebook server."""
    notebook_dir.mkdir(parents=True, exist_ok=True)
    target_port = _find_available_port(host, port)
    if target_port != port:
        console.print(f"[yellow]Port {port} is already in use.[/] Automatically selected port [cyan bold]{target_port}[/].\n")

    console.print(f"[bold magenta]🪻 Kikyo[/] running at [link=http://{host}:{target_port}]http://{host}:{target_port}[/]")
    console.print(f"Notebooks directory: [cyan]{notebook_dir.resolve()}[/]\n")

    uvicorn.run(
        "kikyo.api.app:app",
        host=host,
        port=target_port,
        reload=reload,
        log_level="info",
    )


@app.command()
def new(name: str, notebook_dir: Path = Path("./notebooks")):
    """Create a new empty notebook."""
    notebook_dir.mkdir(parents=True, exist_ok=True)
    path = notebook_dir / f"{name}.py"
    if path.exists():
        console.print(f"[red]Error:[/] Notebook already exists: {path}")
        raise typer.Exit(1)
    save_file(Notebook.new(), path)
    console.print(f"[green]Created notebook:[/] [cyan]{path}[/]")


@app.command()
def convert(ipynb_path: Path, output_dir: Path = Path("./notebooks")):
    """Convert an existing Jupyter .ipynb notebook into a clean .py + .kout pair."""
    if not ipynb_path.exists():
        console.print(f"[red]Error:[/] File not found: {ipynb_path}")
        raise typer.Exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    with open(ipynb_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    nb, outputs_map = from_ipynb(data)
    target_py = output_dir / f"{ipynb_path.stem}.py"
    save_file(nb, target_py)

    sidecar = OutputSidecar(target_py)
    for cid, events in outputs_map.items():
        for evt in events:
            sidecar.append(cid, evt["kind"], evt["data"])

    console.print(f"[green]Successfully converted:[/] {ipynb_path}")
    console.print(f"  ➔ Source script: [cyan]{target_py}[/]")
    console.print(f"  ➔ Output sidecar: [cyan]{sidecar.path}[/]")


@app.command()
def export(py_path: Path, output_file: Path | None = None):
    """Export a Kikyo notebook and its .kout sidecar to standard Jupyter .ipynb."""
    if not py_path.exists():
        console.print(f"[red]Error:[/] File not found: {py_path}")
        raise typer.Exit(1)

    target_ipynb = output_file or py_path.with_suffix(".ipynb")
    nb = load_file(py_path)
    sidecar = OutputSidecar(py_path)
    ipynb_data = to_ipynb(nb, sidecar.get_all_outputs())

    with open(target_ipynb, "w", encoding="utf-8") as f:
        json.dump(ipynb_data, f, indent=2)

    console.print(f"[green]Exported to Jupyter notebook:[/] [cyan]{target_ipynb}[/]")


if __name__ == "__main__":
    app()
