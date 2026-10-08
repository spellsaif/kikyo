from pathlib import Path
from kikyo.storage.sidecar import OutputSidecar


def test_sidecar_append_and_load(tmp_path: Path):
    nb_path = tmp_path / "test_note.py"
    sidecar = OutputSidecar(nb_path)

    sidecar.append("c1", "stream", {"name": "stdout", "text": "hello\n"})
    sidecar.append("c1", "execute_result", {"data": {"text/plain": "42"}})
    sidecar.append("c2", "stream", {"name": "stderr", "text": "warning\n"})

    assert len(sidecar.get_outputs("c1")) == 2
    assert len(sidecar.get_outputs("c2")) == 1

    # Reload from disk in a fresh sidecar instance
    sidecar2 = OutputSidecar(nb_path)
    assert len(sidecar2.get_outputs("c1")) == 2
    assert sidecar2.get_outputs("c1")[0]["kind"] == "stream"


def test_sidecar_clear_and_compact(tmp_path: Path):
    nb_path = tmp_path / "test_note.py"
    sidecar = OutputSidecar(nb_path)

    sidecar.append("c1", "stream", {"text": "output 1"})
    sidecar.append("c2", "stream", {"text": "output 2"})

    sidecar.clear("c1")
    assert sidecar.get_outputs("c1") == []
    assert len(sidecar.get_outputs("c2")) == 1

    # Verify on-disk persistence of compacted state
    sidecar_reloaded = OutputSidecar(nb_path)
    assert sidecar_reloaded.get_outputs("c1") == []
    assert len(sidecar_reloaded.get_outputs("c2")) == 1
