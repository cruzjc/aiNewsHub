from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from reconciler.gitops import ReconcileResult
from reconciler.mapping import build_repo_map, update_repo_map_files
from reconciler.runner import EXIT_NOOP, load_config, run


ROOT = Path(__file__).resolve().parents[1]


class RunnerContractTests(unittest.TestCase):
    def test_required_files_exist(self) -> None:
        required = [
            "README.md",
            "PROJECT_SPEC.md",
            "AGENT_RULES.md",
            "RUNNER_CONTRACT.md",
            "REPO_MAP.md",
            "repo_map.json",
            "config/maintenance.json",
            "prompts/bootstrap.md",
            "prompts/maintenance.md",
            "scripts/run_maintenance.py",
        ]
        for item in required:
            self.assertTrue((ROOT / item).exists(), item)

    def test_config_loads(self) -> None:
        config = load_config()
        self.assertEqual(config["contract_version"], 1)
        self.assertIn("project", config)
        self.assertIn("reconcile", config)
        self.assertIn("agent", config)

    def test_repo_map_builder_returns_expected_keys(self) -> None:
        repo_map = build_repo_map(ROOT)
        for key in ("generated_at", "repo_name", "top_level_directories", "top_level_files", "entrypoints", "python_files"):
            self.assertIn(key, repo_map)

    def test_repo_map_json_is_valid(self) -> None:
        content = json.loads((ROOT / "repo_map.json").read_text(encoding="utf-8"))
        self.assertIn("repo_name", content)

    def test_repo_map_update_is_stable_when_structure_is_unchanged(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "run_maintenance.py").write_text("def main():\n    return 0\n", encoding="utf-8")

            first = update_repo_map_files(root)
            second = update_repo_map_files(root)
            second_json = (root / "repo_map.json").read_text(encoding="utf-8")
            second_md = (root / "REPO_MAP.md").read_text(encoding="utf-8")
            third = update_repo_map_files(root)

            self.assertTrue(first["changed"])
            self.assertTrue(second["changed"])
            self.assertFalse(third["changed"])
            self.assertEqual(second_json, (root / "repo_map.json").read_text(encoding="utf-8"))
            self.assertEqual(second_md, (root / "REPO_MAP.md").read_text(encoding="utf-8"))

    @mock.patch("reconciler.runner.write_report")
    @mock.patch("reconciler.runner.release_lock")
    @mock.patch("reconciler.runner.run_validation")
    @mock.patch("reconciler.runner.invoke_agent")
    @mock.patch("reconciler.runner.collect_logs")
    @mock.patch("reconciler.runner.update_repo_map_files")
    @mock.patch("reconciler.runner.reconcile")
    @mock.patch("reconciler.runner.acquire_lock")
    @mock.patch("reconciler.runner.load_config")
    def test_runner_stops_when_reconcile_is_unsafe(
        self,
        load_config_mock: mock.Mock,
        acquire_lock_mock: mock.Mock,
        reconcile_mock: mock.Mock,
        update_repo_map_mock: mock.Mock,
        collect_logs_mock: mock.Mock,
        invoke_agent_mock: mock.Mock,
        run_validation_mock: mock.Mock,
        release_lock_mock: mock.Mock,
        write_report_mock: mock.Mock,
    ) -> None:
        load_config_mock.return_value = {
            "contract_version": 1,
            "project": {"name": "template", "primary_branch": "main"},
            "maintenance": {"lock_file": ".agent/maintenance.lock"},
            "reconcile": {},
            "logs": {},
            "reports": {"directory": "reports"},
            "repo_map": {},
            "agent": {},
            "validation": {},
        }
        acquire_lock_mock.return_value = (True, {})
        reconcile_mock.return_value = ReconcileResult(
            status="dirty_workspace",
            detail="workspace has uncommitted changes; reconcile skipped",
        )

        exit_code = run("manual")

        self.assertEqual(exit_code, EXIT_NOOP)
        update_repo_map_mock.assert_not_called()
        collect_logs_mock.assert_not_called()
        invoke_agent_mock.assert_not_called()
        run_validation_mock.assert_not_called()
        write_report_mock.assert_called_once()
        release_lock_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
