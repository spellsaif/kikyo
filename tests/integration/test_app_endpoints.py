import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from kikyo.api.app import app, AppState
from kikyo.kernel.manager import KernelPool


@pytest.mark.asyncio
async def test_notebook_rename_and_delete(tmp_path: Path):
    AppState.notebook_root = tmp_path
    AppState.pool = KernelPool(warm_size=0, default_cwd=tmp_path)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a notebook
        r1 = await client.post("/api/notebooks/initial_nb")
        assert r1.status_code == 200
        assert (tmp_path / "initial_nb.py").exists()

        # Create a sidecar dummy file
        (tmp_path / "initial_nb.kout").write_text("{}", encoding="utf-8")

        # 2. Rename notebook
        r2 = await client.post(
            "/api/notebooks/initial_nb/rename",
            json={"new_name": "renamed_nb"},
        )
        assert r2.status_code == 200
        assert not (tmp_path / "initial_nb.py").exists()
        assert (tmp_path / "renamed_nb.py").exists()
        assert (tmp_path / "renamed_nb.kout").exists()

        # 3. List notebooks
        r3 = await client.get("/api/notebooks")
        assert r3.status_code == 200
        assert "renamed_nb" in r3.json()
        assert "initial_nb" not in r3.json()

        # 4. Delete notebook
        r4 = await client.delete("/api/notebooks/renamed_nb")
        assert r4.status_code == 200
        assert not (tmp_path / "renamed_nb.py").exists()
        assert not (tmp_path / "renamed_nb.kout").exists()

        # 5. Verify deleted from list
        r5 = await client.get("/api/notebooks")
        assert "renamed_nb" not in r5.json()


@pytest.mark.asyncio
async def test_notebook_export_py_and_ipynb(tmp_path: Path):
    from kikyo.storage.format import Cell, Notebook, save_file
    AppState.notebook_root = tmp_path
    AppState.pool = KernelPool(warm_size=0, default_cwd=tmp_path)

    # Write a test notebook file using save_file
    nb_file = tmp_path / "export_test.py"
    save_file(Notebook(cells=[Cell("c1", "a = 10"), Cell("c2", "print(a)")]), nb_file)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Export as pure Python
        r_py = await client.get("/api/notebook/export_test/export/py")
        assert r_py.status_code == 200
        assert "a = 10" in r_py.text
        assert 'attachment; filename="export_test.py"' in r_py.headers.get("content-disposition", "")

        # Export as Jupyter Notebook
        r_ipynb = await client.get("/api/notebook/export_test/export")
        assert r_ipynb.status_code == 200
        data = r_ipynb.json()
        assert data.get("nbformat") == 4
        assert len(data.get("cells", [])) == 2
        assert 'attachment; filename="export_test.ipynb"' in r_ipynb.headers.get("content-disposition", "")
