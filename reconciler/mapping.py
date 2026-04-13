from __future__ import annotations

import ast
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path

from .common import file_changed, load_json, now_utc, repo_root, write_json, write_text


IGNORED_DIRS = {
    ".git",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".pnpm",
    "node_modules",
    "dist",
    "cdk.out",
    "logs",
    "reports",
}


@dataclass
class PythonFileSummary:
    path: str
    functions: int
    classes: int
    imports: list[str]


@dataclass
class TypeScriptFileSummary:
    path: str
    exports: int
    functions: int
    imports: list[str]


def _is_ignored(path: Path) -> bool:
    parts = set(path.parts)
    if ".agent" in parts and "runtime" in parts:
        return True
    return bool(parts & IGNORED_DIRS)


def _iter_repo_files(root: Path, suffixes: tuple[str, ...]) -> list[Path]:
    matches: list[Path] = []

    for directory, dirnames, filenames in os.walk(root):
        current = Path(directory)

        if _is_ignored(current):
            dirnames[:] = []
            continue

        current_parts = set(current.parts)
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if dirname not in IGNORED_DIRS and not (dirname == "runtime" and ".agent" in current_parts)
        ]

        for filename in filenames:
            path = current / filename
            if path.suffix in suffixes and not _is_ignored(path):
                matches.append(path)

    return sorted(matches)


def _scan_python_file(path: Path, root: Path) -> PythonFileSummary | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except Exception:
        return None

    imports: list[str] = []
    functions = 0
    classes = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            functions += 1
        elif isinstance(node, ast.AsyncFunctionDef):
            functions += 1
        elif isinstance(node, ast.ClassDef):
            classes += 1
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            imports.append(module)

    return PythonFileSummary(
        path=str(path.relative_to(root)).replace("\\", "/"),
        functions=functions,
        classes=classes,
        imports=sorted({item for item in imports if item}),
    )


def _scan_typescript_file(path: Path, root: Path) -> TypeScriptFileSummary | None:
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return None

    imports = sorted(set(re.findall(r'from ["\']([^"\']+)["\']', content)))
    export_count = len(re.findall(r"^\s*export\s", content, flags=re.MULTILINE))
    function_count = len(re.findall(r"\bfunction\b|\=\s*(?:async\s*)?\(", content))

    return TypeScriptFileSummary(
        path=str(path.relative_to(root)).replace("\\", "/"),
        exports=export_count,
        functions=function_count,
        imports=imports,
    )


def build_repo_map(root: Path | None = None) -> dict:
    root = root or repo_root()

    top_level_dirs = sorted(
        p.name for p in root.iterdir()
        if p.is_dir() and p.name not in {"__pycache__", ".git"}
    )
    top_level_files = sorted(
        p.name for p in root.iterdir()
        if p.is_file() and p.name != ".DS_Store"
    )

    python_summaries: list[PythonFileSummary] = []
    entrypoints: list[str] = []
    dependency_edges: list[dict] = []
    typescript_summaries: list[TypeScriptFileSummary] = []

    for path in _iter_repo_files(root, (".py",)):
        summary = _scan_python_file(path, root)
        if not summary:
            continue
        python_summaries.append(summary)

        filename = path.name
        relpath = str(path.relative_to(root)).replace("\\", "/")
        if filename in {"main.py", "app.py", "run.py"} or relpath.startswith("scripts/"):
            entrypoints.append(relpath)

    for path in _iter_repo_files(root, (".ts", ".tsx")):
        summary = _scan_typescript_file(path, root)
        if not summary:
            continue
        typescript_summaries.append(summary)

        filename = path.name
        relpath = str(path.relative_to(root)).replace("\\", "/")
        if (
            filename in {"main.ts", "main.tsx", "server.ts", "lambda.ts", "http.ts", "handlers.ts"}
            or relpath.startswith("infra/bin/")
            or relpath.endswith("vite.config.ts")
        ):
            entrypoints.append(relpath)

    repo_modules = {
        item.path.replace("/", ".").removesuffix(".py")
        for item in python_summaries
    }

    for item in python_summaries:
        internal_targets = []
        for imp in item.imports:
            if any(module == imp or module.startswith(f"{imp}.") or imp.startswith(f"{module}.") for module in repo_modules):
                internal_targets.append(imp)
        if internal_targets:
            dependency_edges.append(
                {
                    "source": item.path,
                    "targets": sorted(set(internal_targets)),
                }
            )

    data = {
        "generated_at": now_utc().isoformat(),
        "repo_name": root.name,
        "top_level_directories": top_level_dirs,
        "top_level_files": top_level_files,
        "entrypoints": sorted(set(entrypoints)),
        "python_files": [asdict(item) for item in python_summaries],
        "typescript_files": [asdict(item) for item in typescript_summaries],
        "internal_dependency_edges": dependency_edges,
        "notes": [
            "Runtime folders such as logs/, reports/, and .agent/runtime/ are intentionally excluded from dependency analysis.",
            "The generator focuses on Python and TypeScript structure plus top-level repository anatomy.",
        ],
    }
    return data


def _without_generated_at(data: dict) -> dict:
    return {key: value for key, value in data.items() if key != "generated_at"}


def render_repo_map_markdown(data: dict) -> str:
    lines: list[str] = []
    lines.append("# Repo map")
    lines.append("")
    lines.append(f"_Generated: {data.get('generated_at', 'unknown')}_")
    lines.append("")
    lines.append("## Top-level directories")
    for item in data.get("top_level_directories", []):
        lines.append(f"- `{item}/`")
    lines.append("")
    lines.append("## Top-level files")
    for item in data.get("top_level_files", []):
        lines.append(f"- `{item}`")
    lines.append("")
    lines.append("## Likely entrypoints")
    entrypoints = data.get("entrypoints", [])
    if entrypoints:
        for item in entrypoints:
            lines.append(f"- `{item}`")
    else:
        lines.append("- No obvious entrypoints detected yet.")
    lines.append("")
    lines.append("## Python module summary")
    python_files = data.get("python_files", [])
    if python_files:
        for item in python_files:
            lines.append(
                f"- `{item['path']}`: {item['functions']} functions, {item['classes']} classes, {len(item['imports'])} imports"
            )
    else:
        lines.append("- No Python files detected.")
    lines.append("")
    lines.append("## Internal dependency highlights")
    edges = data.get("internal_dependency_edges", [])
    if edges:
        for edge in edges:
            targets = ", ".join(f"`{target}`" for target in edge["targets"])
            lines.append(f"- `{edge['source']}` -> {targets}")
    else:
        lines.append("- No internal dependency edges detected.")
    lines.append("")
    lines.append("## TypeScript module summary")
    typescript_files = data.get("typescript_files", [])
    if typescript_files:
        for item in typescript_files:
            lines.append(
                f"- `{item['path']}`: {item['functions']} functions, {item['exports']} exports, {len(item['imports'])} imports"
            )
    else:
        lines.append("- No TypeScript files detected.")
    lines.append("")
    lines.append("## Notes")
    for note in data.get("notes", []):
        lines.append(f"- {note}")
    lines.append("")
    return "\n".join(lines)


def update_repo_map_files(root: Path | None = None, *, json_path: str = "repo_map.json", markdown_path: str = "REPO_MAP.md") -> dict:
    root = root or repo_root()
    data = build_repo_map(root)
    json_target = root / json_path
    md_target = root / markdown_path

    if json_target.exists():
        try:
            existing = load_json(json_target)
        except Exception:
            existing = None
        if isinstance(existing, dict) and _without_generated_at(existing) == _without_generated_at(data):
            data["generated_at"] = existing.get("generated_at", data["generated_at"])

    import json as _json
    json_content = _json.dumps(data, indent=2) + "\n"
    md_content = render_repo_map_markdown(data)

    json_changed = file_changed(json_target, json_content)
    md_changed = file_changed(md_target, md_content)

    if json_changed:
        write_json(json_target, data)
    if md_changed:
        write_text(md_target, md_content)

    return {
        "changed": json_changed or md_changed,
        "json_path": str(json_target.relative_to(root)).replace("\\", "/"),
        "markdown_path": str(md_target.relative_to(root)).replace("\\", "/"),
        "json_changed": json_changed,
        "markdown_changed": md_changed,
        "entrypoint_count": len(data.get("entrypoints", [])),
        "python_file_count": len(data.get("python_files", [])),
    }
