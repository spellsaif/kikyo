import pytest
from pathlib import Path
from kikyo.api.protocol import RunReactive, decode_client
from kikyo.api.session import NotebookSession
from kikyo.kernel.manager import KernelPool
from kikyo.storage.format import Cell, Notebook, save_file


@pytest.mark.asyncio
async def test_session_execution_and_sidecar(tmp_path: Path):
    nb_path = tmp_path / "integration.py"
    nb = Notebook(cells=[
        Cell("c1", "a = 21"),
        Cell("c2", "b = a * 2"),
        Cell("c3", "print(b)"),
    ])
    save_file(nb, nb_path)

    pool = KernelPool(warm_size=1, default_cwd=tmp_path)
    await pool.start()

    try:
        session = await NotebookSession.open(nb_path, pool)

        received_events = []

        class MockWS:
            async def send_bytes(self, data: bytes):
                received_events.append(data)

            async def send_text(self, data: str):
                received_events.append(data)

        mock_ws = MockWS()
        await session.add_client(mock_ws)

        # Trigger reactive run from c1
        await session.handle_control(RunReactive(cell_id="c1"))
        await session.wait_idle()

        # Verify sidecar recorded stdout output for c3
        outputs_c3 = session.sidecar.get_outputs("c3")
        assert any("42" in evt["data"].get("text", "") for evt in outputs_c3)

        await session.close(pool)
    finally:
        await pool.stop()


@pytest.mark.asyncio
async def test_session_markdown_cell_ops_and_autocomplete(tmp_path: Path):
    nb_path = tmp_path / "test_ops.py"
    nb = Notebook(cells=[
        Cell("c1", "import math", cell_type="code"),
        Cell("c2", "# Description of math usage", cell_type="markdown"),
        Cell("c3", "res = math.sqrt(16)", cell_type="code"),
    ])
    save_file(nb, nb_path)

    pool = KernelPool(warm_size=1, default_cwd=tmp_path)
    await pool.start()

    try:
        session = await NotebookSession.open(nb_path, pool)
        received_text: list[str] = []

        class MockWS:
            async def send_bytes(self, data: bytes):
                pass

            async def send_text(self, data: str):
                received_text.append(data)

        mock_ws = MockWS()
        await session.add_client(mock_ws)

        # 1. Run c1 so math is imported in kernel namespace
        from kikyo.api.protocol import RunCell, CompleteRequest, ChangeCellType, InsertCell, DeleteCell
        await session.handle_control(RunCell(cell_id="c1"))
        await session.wait_idle()

        # Test autocompletion via CompleteRequest
        await session.handle_control(
            CompleteRequest(cell_id="c1", code="math.sq", cursor_pos=7),
            ws=mock_ws,
        )
        assert any('"sqrt"' in msg for msg in received_text)

        # 2. Test inserting a cell
        await session.handle_control(InsertCell(cell_id="c4", after_id="c3", cell_type="code"))
        assert any(c.id == "c4" for c in session.notebook.cells)

        # 3. Test changing cell type
        await session.handle_control(ChangeCellType(cell_id="c1", cell_type="markdown"))
        cell_c1 = next(c for c in session.notebook.cells if c.id == "c1")
        assert cell_c1.cell_type == "markdown"

        # 4. Test deleting a cell
        await session.handle_control(DeleteCell(cell_id="c4"))
        assert not any(c.id == "c4" for c in session.notebook.cells)

        await session.close(pool)
    finally:
        await pool.stop()


@pytest.mark.asyncio
async def test_session_move_cell(tmp_path: Path):
    nb_path = tmp_path / "test_move.py"
    nb = Notebook(cells=[
        Cell("c1", "x = 1"),
        Cell("c2", "y = 2"),
        Cell("c3", "z = 3"),
    ])
    save_file(nb, nb_path)

    pool = KernelPool(warm_size=1, default_cwd=tmp_path)
    await pool.start()

    try:
        session = await NotebookSession.open(nb_path, pool)
        from kikyo.api.protocol import MoveCell

        # Move c1 down: order should become c2, c1, c3
        await session.handle_control(MoveCell(cell_id="c1", direction="down"))
        assert [c.id for c in session.notebook.cells] == ["c2", "c1", "c3"]

        # Verify disk persistence
        from kikyo.storage.format import load_file
        persisted = load_file(nb_path)
        assert [c.id for c in persisted.cells] == ["c2", "c1", "c3"]

        # Move c3 up: order should become c2, c3, c1
        await session.handle_control(MoveCell(cell_id="c3", direction="up"))
        assert [c.id for c in session.notebook.cells] == ["c2", "c3", "c1"]
        persisted = load_file(nb_path)
        assert [c.id for c in persisted.cells] == ["c2", "c3", "c1"]

        # Reorder cells via arbitrary list: c1, c2, c3
        from kikyo.api.protocol import ReorderCells
        await session.handle_control(ReorderCells(cell_ids=["c1", "c2", "c3"]))
        assert [c.id for c in session.notebook.cells] == ["c1", "c2", "c3"]
        persisted = load_file(nb_path)
        assert [c.id for c in persisted.cells] == ["c1", "c2", "c3"]

        await session.close(pool)
    finally:
        await pool.stop()


@pytest.mark.asyncio
async def test_session_interactive_stdin(tmp_path: Path):
    nb_path = tmp_path / "test_stdin.py"
    nb = Notebook(cells=[
        Cell("c1", "x = int(input('Enter a number: '))\nfor i in range(1, x + 1):\n    print(i)"),
    ])
    save_file(nb, nb_path)

    pool = KernelPool(warm_size=1, default_cwd=tmp_path)
    await pool.start()

    try:
        session = await NotebookSession.open(nb_path, pool)
        from kikyo.api.protocol import RunCell, InputReply
        import json
        import asyncio

        received_events: list[dict] = []
        got_input_request = asyncio.Event()

        class MockWS:
            async def send_bytes(self, data: bytes):
                pass

            async def send_text(self, data: str):
                try:
                    parsed = json.loads(data)
                    received_events.append(parsed)
                    if parsed.get("op") == "event" and parsed.get("kind") == "input_request":
                        got_input_request.set()
                except Exception:
                    pass

        mock_ws = MockWS()
        await session.add_client(mock_ws)

        # Launch execution of cell c1
        run_task = asyncio.create_task(session.handle_control(RunCell(cell_id="c1")))

        # Wait for input_request event
        await asyncio.wait_for(got_input_request.wait(), timeout=10.0)
        assert any(
            e.get("kind") == "input_request" and e.get("data", {}).get("prompt") == "Enter a number: "
            for e in received_events
        )

        # Reply with "3"
        await session.handle_control(InputReply(value="3", cell_id="c1"))

        # Wait for cell execution to finish
        await session.wait_idle()

        # Verify sidecar outputs
        outputs = session.sidecar.get_outputs("c1")
        all_text = "".join(o["data"].get("text", "") for o in outputs if o.get("kind") == "stream")
        assert "Enter a number: 3" in all_text
        assert "1\n2\n3" in all_text

        await session.close(pool)
    finally:
        await pool.stop()

