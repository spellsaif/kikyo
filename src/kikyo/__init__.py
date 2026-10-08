"""🪻 Kikyo — Reactive, Collaborative, Git-Friendly Python Notebooks."""
from __future__ import annotations

import json
from typing import Any, Callable
from IPython.display import display

__version__ = "0.2.0"


def ui(mime: str = "application/vnd.kikyo.widget+json"):
    """Decorator: Publish a JSON widget spec to the frontend."""
    def deco(fn: Callable[..., dict[str, Any]]) -> Callable[..., None]:
        def wrapper(*args: Any, **kw: Any) -> None:
            spec = fn(*args, **kw)
            display({mime: json.dumps(spec), "text/plain": repr(spec)}, raw=True)
        return wrapper
    return deco


__all__ = ["ui", "__version__"]
