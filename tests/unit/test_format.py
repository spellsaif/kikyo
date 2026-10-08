from pathlib import Path
from kikyo.storage.format import Cell, Notebook, dumps, loads, to_ipynb, from_ipynb


def test_round_trip():
    nb = Notebook(cells=[Cell("c1", "x = 42"), Cell("c2", "print(x)")])
    text = dumps(nb)
    parsed = loads(text)
    assert len(parsed.cells) == 2
    assert parsed.cells[0].id == "c1"
    assert parsed.cells[0].source == "x = 42"
    assert parsed.cells[1].id == "c2"


def test_ipynb_bidirectional_conversion():
    nb = Notebook(cells=[Cell("c1", "a = 1"), Cell("c2", "b = 2")])
    outputs_map = {
        "c2": [{"kind": "stream", "data": {"name": "stdout", "text": "2\n"}}]
    }

    # Convert to ipynb
    ipynb_data = to_ipynb(nb, outputs_map)
    assert ipynb_data["nbformat"] == 4
    assert len(ipynb_data["cells"]) == 2
    assert ipynb_data["cells"][1]["outputs"][0]["text"] == ["2\n"]

    # Convert back from ipynb
    nb_back, outputs_back = from_ipynb(ipynb_data)
    assert len(nb_back.cells) == 2
    assert nb_back.cells[0].source == "a = 1"
    assert "c2" in outputs_back


def test_markdown_cells_roundtrip():
    nb = Notebook(cells=[
        Cell("c1", "# Welcome to Kikyo\nThis is a notebook.", cell_type="markdown"),
        Cell("c2", "x = 42", cell_type="code"),
    ])
    dumped = dumps(nb)
    assert 'type=markdown' in dumped
    assert '"""' in dumped
    assert 'Welcome to Kikyo' in dumped

    loaded = loads(dumped)
    assert len(loaded.cells) == 2
    assert loaded.cells[0].cell_type == "markdown"
    assert loaded.cells[0].source == "# Welcome to Kikyo\nThis is a notebook."
    assert loaded.cells[1].cell_type == "code"
    assert loaded.cells[1].source == "x = 42"


def test_markdown_ipynb_conversion():
    nb = Notebook(cells=[
        Cell("c1", "### Heading", cell_type="markdown"),
        Cell("c2", "y = 10", cell_type="code"),
    ])
    ipynb = to_ipynb(nb, {})
    assert ipynb["cells"][0]["cell_type"] == "markdown"
    assert ipynb["cells"][1]["cell_type"] == "code"

    nb_back, _ = from_ipynb(ipynb)
    assert nb_back.cells[0].cell_type == "markdown"
    assert nb_back.cells[0].source == "### Heading"


def test_markdown_with_triple_quotes_roundtrip():
    # Markdown containing Python docstrings or triple quotes should not corrupt format
    content = 'Here is a docstring example:\n"""Hello World"""'
    nb = Notebook(cells=[Cell("c1", content, cell_type="markdown")])
    dumped = dumps(nb)
    loaded = loads(dumped)
    assert loaded.cells[0].source == content


def test_cell_type_syntax_support():
    # Support both type=markdown and cell_type=markdown
    text = (
        "# kikyo:notebook v=1\n"
        "# kikyo:cell id=c1 cell_type=markdown\n"
        "'''\n# Doc\n'''\n"
        "# kikyo:cell id=c2\n"
        "x = 1\n"
    )
    loaded = loads(text)
    assert len(loaded.cells) == 2
    assert loaded.cells[0].cell_type == "markdown"
    assert loaded.cells[0].source == "# Doc"
    assert loaded.cells[1].cell_type == "code"


