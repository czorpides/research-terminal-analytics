"""Pure reconciliation-planner regression tests (no database or secrets required)."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "reconcile_august_snapshot.py"
spec = importlib.util.spec_from_file_location("reconcile_august_snapshot", PATH)
module = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class ReconcilePlannerTests(unittest.TestCase):
    def test_missing_source_record_is_insert_only(self):
        t = module.TableSpec("scores", ("id",))
        missing, extra, conflicts = module.compare(
            [{"id": "a", "value": 1}, {"id": "b", "value": 2}],
            [{"id": "a", "value": 1}], t
        )
        self.assertEqual([r["id"] for r in missing], ["b"])
        self.assertEqual((extra, conflicts), ([], []))

    def test_conflicting_score_blocks(self):
        missing, extra, conflicts = module.compare(
            [{"id": "a", "value": 2}], [{"id": "a", "value": 1}],
            module.TableSpec("scores", ("id",))
        )
        self.assertEqual((missing, extra, conflicts), ([], [], [("a",)]))

    def test_price_business_key_overrides_nonsemantic_uuid(self):
        t = module.TableSpec("prices_daily", ("asset_id", "trade_date"), "trade_date")
        source = [{"id": "old-pk", "asset_id": "asset", "trade_date": "2026-08-10", "close": 101}]
        dest = [{"id": "new-pk", "asset_id": "asset", "trade_date": "2026-08-10", "close": 101}]
        self.assertEqual(module.compare(source, dest, t), ([], [], []))
        dest[0]["close"] = 102
        self.assertEqual(module.compare(source, dest, t)[2], [("asset", "2026-08-10")])

    def test_external_only_is_detected(self):
        missing, extra, conflicts = module.compare(
            [{"id": "a"}], [{"id": "a"}, {"id": "c"}],
            module.TableSpec("raw_observations", ("id",))
        )
        self.assertFalse(missing or conflicts)
        self.assertEqual([r["id"] for r in extra], ["c"])

    def test_duplicate_comparison_key_aborts(self):
        with self.assertRaises(module.UnsafeSync):
            module.index_rows([{"id": "a"}, {"id": "a"}], ("id",))

    def test_wrong_destination_project_rejected(self):
        with self.assertRaises(module.UnsafeSync):
            module.assert_target(
                "postgresql://postgres:p@db.itfwojimxuxwmxjcolzt.supabase.co/postgres",
                "postgresql://postgres:p@db.different.supabase.co/postgres",
            )
        module.assert_target(
            "postgresql://postgres:p@db.itfwojimxuxwmxjcolzt.supabase.co/postgres",
            "postgresql://postgres:p@db.sythouvmvdhxwbmzwpxy.supabase.co/postgres",
        )

    def test_same_database_rejected(self):
        url = "postgresql://postgres:p@db.sythouvmvdhxwbmzwpxy.supabase.co/postgres"
        with self.assertRaises(module.UnsafeSync):
            module.assert_target(url, url)


if __name__ == "__main__":
    unittest.main()
