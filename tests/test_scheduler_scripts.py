from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class SchedulerScriptTests(unittest.TestCase):
    def test_linux_uninstall_script_has_shebang_at_byte_zero(self) -> None:
        content = (ROOT / "scripts" / "uninstall_schedule_linux.sh").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("#!/usr/bin/env bash\n"))

    def test_windows_uninstall_script_starts_with_param_block(self) -> None:
        content = (ROOT / "scripts" / "uninstall_schedule_windows.ps1").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("Param("))

    def test_windows_uninstall_script_uses_configured_task_name_by_default(self) -> None:
        content = (ROOT / "scripts" / "uninstall_schedule_windows.ps1").read_text(encoding="utf-8")
        self.assertIn('Join-Path $repoRoot "config\\maintenance.json"', content)
        self.assertIn("$config.schedule.task_name", content)
        self.assertIn('$TaskName = "ai-news-hub-maintenance"', content)


if __name__ == "__main__":
    unittest.main()
