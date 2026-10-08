"""Lexical scope analyzer for Python notebook cells."""
from __future__ import annotations

import ast
import builtins
import re
from dataclasses import dataclass, field

_PYTHON_BUILTINS = frozenset(dir(builtins))

_MUTATING_METHODS = frozenset({
    "append", "extend", "insert", "pop", "remove", "clear", "sort", "reverse",
    "update", "add", "discard", "fit", "transform", "fit_transform", "train"
})


@dataclass
class Scope:
    parent: Scope | None
    is_function: bool = False
    defs: set[str] = field(default_factory=set)
    reads: set[str] = field(default_factory=set)
    mutations: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class CellAnalysis:
    defines: frozenset[str]
    reads: frozenset[str]
    mutations: frozenset[str]
    syntax_ok: bool
    error: str | None = None


class LexicalAnalyzer(ast.NodeVisitor):
    def __init__(self) -> None:
        self.global_scope = Scope(parent=None)
        self.current_scope = self.global_scope

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.current_scope.defs.add(node.name)
        func_scope = Scope(parent=self.current_scope, is_function=True)
        # Bind function arguments locally
        for arg in node.args.posonlyargs + node.args.args + node.args.kwonlyargs:
            func_scope.defs.add(arg.arg)
        if node.args.vararg:
            func_scope.defs.add(node.args.vararg.arg)
        if node.args.kwarg:
            func_scope.defs.add(node.args.kwarg.arg)

        prev = self.current_scope
        self.current_scope = func_scope
        for stmt in node.body:
            self.visit(stmt)
        self.current_scope = prev

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.current_scope.defs.add(node.name)
        class_scope = Scope(parent=self.current_scope, is_function=False)
        prev = self.current_scope
        self.current_scope = class_scope
        for stmt in node.body:
            self.visit(stmt)
        self.current_scope = prev

    def visit_Lambda(self, node: ast.Lambda) -> None:
        lambda_scope = Scope(parent=self.current_scope, is_function=True)
        for arg in node.args.posonlyargs + node.args.args + node.args.kwonlyargs:
            lambda_scope.defs.add(arg.arg)
        if node.args.vararg:
            lambda_scope.defs.add(node.args.vararg.arg)
        if node.args.kwarg:
            lambda_scope.defs.add(node.args.kwarg.arg)
        prev = self.current_scope
        self.current_scope = lambda_scope
        self.visit(node.body)
        self.current_scope = prev

    def visit_ListComp(self, node: ast.ListComp) -> None:
        self._handle_comp(node.generators, [node.elt])

    def visit_SetComp(self, node: ast.SetComp) -> None:
        self._handle_comp(node.generators, [node.elt])

    def visit_DictComp(self, node: ast.DictComp) -> None:
        self._handle_comp(node.generators, [node.key, node.value])

    def visit_GeneratorExp(self, node: ast.GeneratorExp) -> None:
        self._handle_comp(node.generators, [node.elt])

    def _handle_comp(self, generators: list[ast.comprehension], exprs: list[ast.AST]) -> None:
        comp_scope = Scope(parent=self.current_scope, is_function=False)
        prev = self.current_scope
        self.current_scope = comp_scope
        for gen in generators:
            self.visit(gen.iter)
            self._bind_target(gen.target, comp_scope)
            for if_expr in gen.ifs:
                self.visit(if_expr)
        for expr in exprs:
            self.visit(expr)
        self.current_scope = prev

    def _bind_target(self, target: ast.AST, scope: Scope) -> None:
        if isinstance(target, ast.Name):
            scope.defs.add(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for elt in target.elts:
                self._bind_target(elt, scope)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            name = alias.asname or alias.name.split(".")[0]
            self.current_scope.defs.add(name)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        for alias in node.names:
            name = alias.asname or alias.name
            self.current_scope.defs.add(name)

    def visit_Assign(self, node: ast.Assign) -> None:
        for t in node.targets:
            self._collect_assignment(t)
        self.visit(node.value)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:
        if isinstance(node.target, ast.Name):
            self._record_read(node.target.id)
            self.current_scope.defs.add(node.target.id)
        elif isinstance(node.target, (ast.Subscript, ast.Attribute)):
            root = self._get_root_name(node.target)
            if root:
                self.current_scope.mutations.add(root)
                self._record_read(root)
        self.visit(node.value)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        self._collect_assignment(node.target)
        if node.value:
            self.visit(node.value)

    def _collect_assignment(self, node: ast.AST) -> None:
        if isinstance(node, ast.Name):
            self.current_scope.defs.add(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for elt in node.elts:
                self._collect_assignment(elt)
        elif isinstance(node, ast.Starred):
            self._collect_assignment(node.value)
        elif isinstance(node, (ast.Subscript, ast.Attribute)):
            root = self._get_root_name(node)
            if root:
                self.current_scope.mutations.add(root)
                self._record_read(root)

    def visit_For(self, node: ast.For) -> None:
        self._bind_target(node.target, self.current_scope)
        self.visit(node.iter)
        for stmt in node.body:
            self.visit(stmt)
        for stmt in node.orelse:
            self.visit(stmt)

    visit_AsyncFor = visit_For

    def visit_With(self, node: ast.With) -> None:
        for item in node.items:
            self.visit(item.context_expr)
            if item.optional_vars:
                self._bind_target(item.optional_vars, self.current_scope)
        for stmt in node.body:
            self.visit(stmt)

    visit_AsyncWith = visit_With

    def visit_Call(self, node: ast.Call) -> None:
        # Detect in-place mutating method calls (e.g., df.dropna(inplace=True))
        if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            obj_name = node.func.value.id
            method_name = node.func.attr
            is_inplace = any(
                kw.arg == "inplace" and getattr(kw.value, "value", None) is True
                for kw in node.keywords
            )
            if method_name in _MUTATING_METHODS or is_inplace:
                self.current_scope.mutations.add(obj_name)
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            self._record_read(node.id)
        elif isinstance(node.ctx, ast.Store):
            self.current_scope.defs.add(node.id)

    def _record_read(self, name: str) -> None:
        if name in _PYTHON_BUILTINS:
            return
        curr = self.current_scope
        while curr:
            if name in curr.defs:
                return  # Bound in local scope
            curr = curr.parent
        self.global_scope.reads.add(name)

    def _get_root_name(self, node: ast.AST) -> str | None:
        curr = node
        while isinstance(curr, (ast.Subscript, ast.Attribute)):
            curr = curr.value
        return curr.id if isinstance(curr, ast.Name) else None


def _clean_ipython_source(source: str) -> str:
    """Comment out IPython magics (%, %%), shell escapes (!), and help (?) so ast.parse succeeds."""
    lines = source.splitlines(keepends=True)
    out: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith(("%time ", "%timeit ")):
            indent = line[: len(line) - len(stripped)]
            after = re.sub(r"^%time(it)?\s+", "", stripped)
            out.append(indent + after)
        elif stripped.startswith(("%", "!", "?")):
            indent = line[: len(line) - len(stripped)]
            out.append(indent + "# [ipython] " + stripped)
        else:
            out.append(line)
    return "".join(out)


def analyze(source: str) -> CellAnalysis:
    """Analyze a code cell and extract defines, external reads, and in-place mutations."""
    clean_src = _clean_ipython_source(source)
    try:
        tree = ast.parse(clean_src)
    except SyntaxError as e:
        return CellAnalysis(frozenset(), frozenset(), frozenset(), False, str(e))

    analyzer = LexicalAnalyzer()
    analyzer.visit(tree)

    true_reads = analyzer.global_scope.reads - analyzer.global_scope.defs
    return CellAnalysis(
        defines=frozenset(analyzer.global_scope.defs),
        reads=frozenset(true_reads),
        mutations=frozenset(analyzer.global_scope.mutations),
        syntax_ok=True,
    )


def analyze_markdown(source: str) -> CellAnalysis:
    """Markdown cells do not produce or consume variables in the reactive DAG."""
    return CellAnalysis(
        defines=frozenset(),
        reads=frozenset(),
        mutations=frozenset(),
        syntax_ok=True,
    )
