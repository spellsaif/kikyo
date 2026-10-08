import pytest
from kikyo.reactive.analyzer import analyze
from kikyo.reactive.graph import ReactiveGraph
from kikyo.reactive.pipeline import CycleError, topological_run_plan


def test_topological_run_order():
    g = ReactiveGraph()
    g.upsert("c1", analyze("x = 1"))
    g.upsert("c2", analyze("y = x + 1"))
    g.upsert("c3", analyze("z = y * 2"))
    g.upsert("c4", analyze("w = 100"))  # independent

    plan = topological_run_plan(g, "c1")
    assert plan == ["c1", "c2", "c3"]


def test_tarjan_cycle_detection():
    g = ReactiveGraph()
    # Cycle between c1 and c2
    g.upsert("c1", analyze("x = y + 1"))
    g.upsert("c2", analyze("y = x + 1"))

    with pytest.raises(CycleError) as exc_info:
        topological_run_plan(g, "c1")

    assert set(exc_info.value.cycle_nodes) == {"c1", "c2"}


def test_diamond_dependency():
    g = ReactiveGraph()
    g.upsert("c1", analyze("a = 1"))
    g.upsert("c2", analyze("b = a + 1"))
    g.upsert("c3", analyze("c = a + 2"))
    g.upsert("c4", analyze("d = b + c"))

    plan = topological_run_plan(g, "c1")
    assert plan[0] == "c1"
    assert plan.index("c2") < plan.index("c4")
    assert plan.index("c3") < plan.index("c4")
