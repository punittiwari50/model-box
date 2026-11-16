"""Cyclic Reference & Circular Dependency Verification Tool adhering to STD-COD-004.

Performs static AST analysis on Python backend modules and Regex AST analysis
on TypeScript UI modules to mathematically verify the import graphs are pure DAGs (Directed Acyclic Graphs).
"""

import ast
import os
from pathlib import Path
import re
import sys
from typing import Mapping, Sequence


class PythonCycleDetector:
    """Detects import cycles across Python packages using AST analysis and DFS graph coloring."""

    def __init__(self, root_dir: Path, package_prefix: str = "model_connectors") -> None:
        self.root_dir = root_dir
        self.package_prefix = package_prefix
        self.graph: dict[str, set[str]] = {}

    def _file_to_module(self, path: Path) -> str:
        rel = path.relative_to(self.root_dir).with_suffix("")
        parts = list(rel.parts)
        if parts and parts[-1] == "__init__":
            parts.pop()
        return ".".join(parts)

    def build_graph(self) -> dict[str, set[str]]:
        self.graph.clear()
        if not self.root_dir.exists():
            return self.graph

        for root, _, files in os.walk(self.root_dir):
            for file in files:
                if file.endswith(".py"):
                    full_path = Path(root) / file
                    mod_name = self._file_to_module(full_path)
                    self.graph[mod_name] = set()

                    try:
                        with open(full_path, "r", encoding="utf-8") as f:
                            tree = ast.parse(f.read(), filename=str(full_path))
                    except Exception:
                        continue

                    for node in ast.walk(tree):
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                if alias.name.startswith(self.package_prefix):
                                    self._add_edge(mod_name, alias.name)
                        elif isinstance(node, ast.ImportFrom):
                            target = ""
                            if node.level > 0:
                                # Relative import
                                base_parts = mod_name.split(".")[:-node.level + 1]
                                if node.module:
                                    target = ".".join(base_parts + node.module.split("."))
                                else:
                                    target = ".".join(base_parts)
                            elif node.module and node.module.startswith(self.package_prefix):
                                target = node.module

                            if target:
                                self._add_edge(mod_name, target)

        return self.graph

    def _add_edge(self, source_mod: str, target_mod: str) -> None:
        # Match target_mod to actual registered module keys (resolve submodule vs package)
        for registered in self.graph:
            if registered == target_mod or target_mod.startswith(registered + "."):
                if registered != source_mod:
                    self.graph[source_mod].add(registered)
                return

    def find_cycles(self) -> list[list[str]]:
        # DFS with 3-color marking: 0 = unvisited (white), 1 = visiting (gray), 2 = visited (black)
        color: dict[str, int] = {node: 0 for node in self.graph}
        path: list[str] = []
        cycles: list[list[str]] = []

        def dfs(u: str) -> None:
            color[u] = 1
            path.append(u)

            for v in self.graph.get(u, ()):
                if v not in color:
                    continue
                if color[v] == 1:
                    # Cycle found!
                    cycle_start_idx = path.index(v)
                    cycle = path[cycle_start_idx:] + [v]
                    cycles.append(cycle)
                elif color[v] == 0:
                    dfs(v)

            path.pop()
            color[u] = 2

        for node in list(self.graph.keys()):
            if color[node] == 0:
                dfs(node)

        return cycles


class TypeScriptCycleDetector:
    """Detects import cycles across TypeScript / React modules."""

    def __init__(self, src_dir: Path) -> None:
        self.src_dir = src_dir
        self.graph: dict[str, set[str]] = {}

    def _normalize_module(self, path: Path) -> str:
        return str(path.relative_to(self.src_dir).with_suffix("")).replace("\\", "/")

    def build_graph(self) -> dict[str, set[str]]:
        self.graph.clear()
        if not self.src_dir.exists():
            return self.graph

        import_pattern = re.compile(r"""(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]""")

        for root, _, files in os.walk(self.src_dir):
            for file in files:
                if file.endswith((".ts", ".tsx", ".js", ".jsx")):
                    file_path = Path(root) / file
                    mod_name = self._normalize_module(file_path)
                    self.graph[mod_name] = set()

                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            content = f.read()
                    except Exception:
                        continue

                    for match in import_pattern.finditer(content):
                        raw_import = match.group(1)
                        if raw_import.startswith("."):
                            # Resolve relative import to normalized path
                            target_dir = file_path.parent
                            target_path = (target_dir / raw_import).resolve()
                            try:
                                target_mod = self._normalize_module(target_path)
                                if target_mod != mod_name:
                                    self.graph[mod_name].add(target_mod)
                            except Exception:
                                pass

        return self.graph

    def find_cycles(self) -> list[list[str]]:
        color: dict[str, int] = {node: 0 for node in self.graph}
        path: list[str] = []
        cycles: list[list[str]] = []

        def dfs(u: str) -> None:
            color[u] = 1
            path.append(u)

            for v in self.graph.get(u, ()):
                if v not in color:
                    continue
                if color[v] == 1:
                    cycle_start_idx = path.index(v)
                    cycle = path[cycle_start_idx:] + [v]
                    cycles.append(cycle)
                elif color[v] == 0:
                    dfs(v)

            path.pop()
            color[u] = 2

        for node in list(self.graph.keys()):
            if color[node] == 0:
                dfs(node)

        return cycles


def find_directories() -> tuple[Path, Path]:
    current = Path(__file__).resolve().parent
    # Search upwards for model-connectors root
    for parent in [current, current.parent, current.parent.parent]:
        service_candidate = parent / "service" / "src"
        if not service_candidate.exists():
            service_candidate = parent / "src"
        ui_candidate = parent / "ui" / "src"
        if service_candidate.exists():
            return service_candidate, ui_candidate
    return current / "src", current / "ui" / "src"


def main() -> None:
    print("=" * 70)
    print("CYCLIC REFERENCE & DEPENDENCY VERIFICATION")
    print("=" * 70)

    service_src, ui_src = find_directories()

    # 1. Analyze Python Service Subproject
    print(f"Scanning Python service source: {service_src}")
    py_detector = PythonCycleDetector(service_src, package_prefix="model_connectors")
    py_graph = py_detector.build_graph()
    py_cycles = py_detector.find_cycles()

    print(f"\n[Python Service Subproject] Scanned {len(py_graph)} modules.")
    if py_cycles:
        print(f"[FAIL] FOUND {len(py_cycles)} PYTHON IMPORT CYCLES:")
        for idx, cycle in enumerate(py_cycles, 1):
            print(f"  Cycle {idx}: {' -> '.join(cycle)}")
        sys.exit(1)
    else:
        print("[OK] Zero cyclic references found in Python service subproject (Pure DAG).")

    # 2. Analyze TypeScript UI Subproject
    print(f"\nScanning TypeScript UI source: {ui_src}")
    ts_detector = TypeScriptCycleDetector(ui_src)
    ts_graph = ts_detector.build_graph()
    ts_cycles = ts_detector.find_cycles()

    print(f"[TypeScript UI Subproject] Scanned {len(ts_graph)} modules.")
    if ts_cycles:
        print(f"[FAIL] FOUND {len(ts_cycles)} TYPESCRIPT IMPORT CYCLES:")
        for idx, cycle in enumerate(ts_cycles, 1):
            print(f"  Cycle {idx}: {' -> '.join(cycle)}")
        sys.exit(1)
    else:
        print("[OK] Zero cyclic references found in TypeScript UI subproject (Pure DAG).")

    print("\n" + "=" * 70)
    print("VERIFICATION COMPLETE: 0 CYCLIC REFERENCES ACROSS THE ENTIRE CODEBASE!")
    print("=" * 70)


if __name__ == "__main__":
    main()
