#!/usr/bin/env python3
"""Audit, then optionally insert missing August records into external Supabase.

Source is always read-only. Destination is unchanged unless --apply and the
explicit project-ref confirmation are both supplied. No schema or filter edits.

Prerequisite: pip install 'psycopg[binary]>=3.2,<4'
Environment: RT_ORIGINAL_DATABASE_URL, RT_EXTERNAL_DATABASE_URL
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
import os
from urllib.parse import unquote, urlsplit

TARGET_REF = "sythouvmvdhxwbmzwpxy"
PARENTS = ("assets", "indicator_registry", "data_sources")
BATCH_SIZE = 100


@dataclass(frozen=True)
class TableSpec:
    name: str
    key: tuple[str, ...]
    window_column: str | None = None


TABLES = (
    TableSpec("data_vintages", ("id",)),
    TableSpec("prices_daily", ("asset_id", "trade_date"), "trade_date"),
    TableSpec("raw_observations", ("id",), "retrieved_at"),
    TableSpec("scores", ("id",), "computed_at"),
)


class UnsafeSync(RuntimeError):
    """Abort without committing any writes."""


def key_of(row: dict, fields: tuple[str, ...]) -> tuple:
    return tuple(row[f] for f in fields)


def index_rows(rows: list[dict], fields: tuple[str, ...]) -> dict[tuple, dict]:
    result = {}
    for row in rows:
        key = key_of(row, fields)
        if key in result:
            raise UnsafeSync(f"Duplicate comparison key: {key}")
        result[key] = row
    return result


def compare(source: list[dict], dest: list[dict], spec: TableSpec):
    s = index_rows(source, spec.key)
    d = index_rows(dest, spec.key)
    only_source = [r for k, r in s.items() if k not in d]
    only_dest = [r for k, r in d.items() if k not in s]
    # Price UUIDs may differ for an otherwise identical (asset, trade_date).
    ignored = {"id"} if spec.name == "prices_daily" else set()
    conflicts = [
        k for k in s.keys() & d.keys()
        if any(s[k].get(c) != d[k].get(c) for c in s[k] if c not in ignored)
    ]
    return only_source, only_dest, conflicts


def assert_target(source_url: str, dest_url: str) -> None:
    s, d = urlsplit(source_url), urlsplit(dest_url)
    if not all((s.scheme.startswith("postgres"), d.scheme.startswith("postgres"), s.hostname, d.hostname)):
        raise UnsafeSync("Expected two valid PostgreSQL URLs")
    dest_identity = f"{d.hostname} {unquote(d.username or '')}"
    if TARGET_REF not in dest_identity:
        raise UnsafeSync("Destination hostname/username does not identify the approved external project")
    if (s.hostname, s.username, s.path) == (d.hostname, d.username, d.path):
        raise UnsafeSync("Source and destination connections resolve to the same database identity")


def columns(conn, table: str) -> list[tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT column_name, udt_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",
            (table,),
        )
        return [(c, t) for c, t in cur.fetchall()]


def read_rows(conn, spec: TableSpec, since: date) -> list[dict]:
    from psycopg import sql
    from psycopg.rows import dict_row

    query = sql.SQL("SELECT * FROM public.{}").format(sql.Identifier(spec.name))
    params = ()
    if spec.window_column:
        query += sql.SQL(" WHERE {} >= %s").format(sql.Identifier(spec.window_column))
        cutoff = since if spec.window_column == "trade_date" else datetime.combine(
            since, time.min, tzinfo=timezone.utc
        )
        params = (cutoff,)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, params)
        return cur.fetchall()


def older_date_counts(conn, spec: TableSpec, since: date) -> dict:
    """Detect missing historical day-buckets without transporting old rows."""
    from psycopg import sql

    if not spec.window_column:
        return {}
    day = sql.Identifier(spec.window_column)
    where = since if spec.window_column == "trade_date" else datetime.combine(
        since, time.min, tzinfo=timezone.utc
    )
    query = sql.SQL(
        "SELECT ({col})::date AS day, count(*)::bigint FROM public.{table} "
        "WHERE {col} < %s GROUP BY 1 ORDER BY 1"
    ).format(col=day, table=sql.Identifier(spec.name))
    with conn.cursor() as cur:
        cur.execute(query, (where,))
        return dict(cur.fetchall())


def insert_batch(conn, spec: TableSpec, rows: list[dict], coltypes: list[tuple[str, str]]) -> int:
    from psycopg import sql
    from psycopg.types.json import Jsonb

    if not rows:
        return 0
    cols = [c for c, _ in coltypes]
    values = []
    for row in rows:
        for name, dtype in coltypes:
            value = row[name]
            values.append(Jsonb(value) if dtype == "jsonb" and value is not None else value)
    one_row = sql.SQL("(") + sql.SQL(",").join([sql.Placeholder()] * len(cols)) + sql.SQL(")")
    query = sql.SQL("INSERT INTO public.{} ({}) VALUES {} ON CONFLICT DO NOTHING").format(
        sql.Identifier(spec.name),
        sql.SQL(",").join(map(sql.Identifier, cols)),
        sql.SQL(",").join([one_row] * len(rows)),
    )
    with conn.cursor() as cur:
        cur.execute(query, values)
        if cur.rowcount != len(rows):
            raise UnsafeSync(
                f"{spec.name}: insert collision ({cur.rowcount} inserted / {len(rows)} planned); transaction rolled back"
            )
        return cur.rowcount


def run(since: date, apply: bool, confirm: str) -> None:
    import psycopg

    source_url = os.environ.get("RT_ORIGINAL_DATABASE_URL", "")
    dest_url = os.environ.get("RT_EXTERNAL_DATABASE_URL", "")
    if not source_url or not dest_url:
        raise UnsafeSync("Set RT_ORIGINAL_DATABASE_URL and RT_EXTERNAL_DATABASE_URL securely (never commit them)")
    assert_target(source_url, dest_url)
    if apply and confirm != TARGET_REF:
        raise UnsafeSync(f"Apply requires --confirm-external={TARGET_REF}")

    with psycopg.connect(source_url, options="-c default_transaction_read_only=on") as src, \
         psycopg.connect(dest_url) as dst:
        src.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        # Never mutate destination in dry-run mode, even via a future code change.
        if not apply:
            dst.execute("SET TRANSACTION READ ONLY")

        for parent in PARENTS:
            spec = TableSpec(parent, ("id",))
            s, d = read_rows(src, spec, since), read_rows(dst, spec, since)
            if set(index_rows(s, spec.key)) != set(index_rows(d, spec.key)):
                raise UnsafeSync(f"{parent}: differing parent IDs; source/destination mapping must be resolved first")
            print(f"Parent {parent}: matching {len(s)} IDs")

        planned = []
        any_blocker = False
        for spec in TABLES:
            src_cols, dest_cols = columns(src, spec.name), columns(dst, spec.name)
            if not src_cols or src_cols != dest_cols:
                raise UnsafeSync(f"{spec.name}: schema/column types do not match")
            old_s = older_date_counts(src, spec, since)
            old_d = older_date_counts(dst, spec, since)
            mismatched_days = [k for k in old_s.keys() | old_d.keys() if old_s.get(k) != old_d.get(k)]
            source, dest = read_rows(src, spec, since), read_rows(dst, spec, since)
            missing, extra, conflicts = compare(source, dest, spec)
            print(
                f"{spec.name}: source_window={len(source)}, external_window={len(dest)}, "
                f"missing={len(missing)}, external_only={len(extra)}, "
                f"conflicts={len(conflicts)}, older_day_mismatches={len(mismatched_days)}"
            )
            if mismatched_days:
                print(f"  Earliest historical mismatch: {min(mismatched_days)}. Re-run with an earlier --since.")
            if conflicts:
                print(f"  First overlapping key conflict: {str(conflicts[0])[:160]}")
            if extra:
                print(f"  First external-only key: {str(key_of(extra[0], spec.key))[:160]}")
            if mismatched_days or conflicts or extra:
                any_blocker = True
            planned.append((spec, missing, src_cols))

        if any_blocker:
            raise UnsafeSync("Divergent or conflicting rows: nothing written. Review the report before syncing.")
        if not apply:
            print("DRY RUN COMPLETE: external database unchanged.")
            return

        inserted = Counter()
        for spec, missing, coltypes in planned:
            for i in range(0, len(missing), BATCH_SIZE):
                inserted[spec.name] += insert_batch(dst, spec, missing[i:i+BATCH_SIZE], coltypes)
            # Verify all copied source rows are now present before commit.
            src_rows = read_rows(src, spec, since)
            dst_rows = read_rows(dst, spec, since)
            remaining, extra, conflicts = compare(src_rows, dst_rows, spec)
            if remaining or extra or conflicts:
                raise UnsafeSync(f"{spec.name}: post-insert verification failed; rollback")
        dst.commit()
        print("COMMITTED insert-only reconciliation:", dict(inserted))
        print("Technical cache and current scores are NOT refreshed here; run separately after data checks.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", type=date.fromisoformat, default=date(2026, 8, 1))
    parser.add_argument("--apply", action="store_true", help="Insert-only commit; default is read-only")
    parser.add_argument("--confirm-external", default="", help="Must equal the external Supabase project ref to apply")
    args = parser.parse_args()
    try:
        run(args.since, args.apply, args.confirm_external)
        return 0
    except (UnsafeSync, ValueError) as exc:
        print(f"BLOCKED: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
