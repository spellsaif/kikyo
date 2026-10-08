import pytest
from kikyo.reactive.analyzer import analyze


def test_simple_assignments():
    a = analyze("x = 10\ny = x + 5")
    assert a.defines == {"x", "y"}
    assert a.reads == set()  # x is self-defined, not an external dependency


def test_comprehension_does_not_leak_loop_var():
    # In naive analyzers, x becomes a defined variable, causing duplicate def bugs
    a = analyze("results = [x * 2 for x in items]")
    assert a.defines == {"results"}
    assert "x" not in a.defines
    assert a.reads == {"items"}


def test_function_captures_closure_dependencies():
    # In naive analyzers, function bodies are skipped, missing external reads
    a = analyze("def predict(data):\n    return model.predict(data)")
    assert a.defines == {"predict"}
    assert a.reads == {"model"}


def test_inplace_mutations_detected():
    # Detect pandas inplace method call
    a1 = analyze("df.dropna(inplace=True)")
    assert "df" in a1.mutations
    assert "df" in a1.reads

    # Detect mutating method call (e.g. list.append or model.fit)
    a2 = analyze("losses.append(current_loss)")
    assert "losses" in a2.mutations
    assert "losses" in a2.reads

    # Detect subscript assignment (e.g. df['col'] = 1)
    a3 = analyze("df['col'] = 42")
    assert "df" in a3.mutations
    assert "df" in a3.reads


def test_builtins_are_ignored():
    # Built-in names like print, len, range should not be counted as external dependencies
    a = analyze("print(len(range(10)))")
    assert a.reads == set()
    assert a.defines == set()


def test_syntax_error():
    a = analyze("def broken(:")
    assert not a.syntax_ok
    assert a.error is not None


def test_ipython_magics_and_shell_commands():
    # IPython shell escapes and line magics should be ignored in AST without syntax errors
    code = (
        "!pip install pandas numpy\n"
        "%matplotlib inline\n"
        "%time x = 42\n"
        "import numpy as np\n"
        "data = np.array([x])\n"
    )
    a = analyze(code)
    assert a.syntax_ok
    assert a.defines == {"x", "np", "data"}
    assert a.reads == set()

