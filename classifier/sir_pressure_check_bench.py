"""Compare a fixed encoder threshold and a local evidence check on frozen reviews."""
import argparse
import json
from pathlib import Path
from time import perf_counter

from sir_pressure_check import FAMILIES, MODEL, STATES, check, check_status
from sir_pressure_sweep import CACHE, linked_scores, read

TIER = {"absent": 0, "uncertain": 1, "present": 2}


def gold_status(row):
    return check_status({family: {"status": row[family]} for family in FAMILIES})


def counts(gold, alerts):
    return {
        "tp": sum(g == "present" and a for g, a in zip(gold, alerts)),
        "fp": sum(g == "absent" and a for g, a in zip(gold, alerts)),
        "fn": sum(g == "present" and not a for g, a in zip(gold, alerts)),
        "uncertain_alerts": sum(g == "uncertain" and a for g, a in zip(gold, alerts)),
    }


def matched_fp(gold, order, target):
    if target == 0:
        return None
    tp = fp = 0
    for i in order:
        tp += gold[i] == "present"
        fp += gold[i] == "absent"
        if tp == target:
            return fp
    raise ValueError("Target recall is outside the ranking")


def evaluate(rows, model, batch):
    scores, threshold = linked_scores(rows)
    start = perf_counter()
    results = [item for i in range(0, len(rows), batch) for item in check(rows[i:i+batch], model)]
    seconds = perf_counter() - start
    status = [check_status(r) for r in results]
    gold = [gold_status(r) for r in rows]
    candidate = [bool(s >= threshold) for s in scores]
    confirmed = [a and s == "present" for a, s in zip(candidate, status)]
    base = counts(gold, candidate)
    order = sorted(range(len(rows)), key=lambda i: (TIER[status[i]], scores[i]), reverse=True)
    metrics = {
        "n": len(rows), "gold": {key: gold.count(key) for key in TIER},
        "encoder_alerts": sum(candidate), "invalid_checks": results.count(None), "check_seconds": seconds,
        "encoder": base, "confirmed_candidates": counts(gold, confirmed),
        "checker_all": counts(gold, [s == "present" for s in status]),
        "checker_all_fp_at_encoder_recall": matched_fp(gold, order, base["tp"]),
        "exact_family_status": {
            family: sum(result is not None and result[family]["status"] == row[family]
                        for row, result in zip(rows, results))
            for family in FAMILIES
        },
    }
    if all("pair" in row for row in rows):
        metrics["pairs_exact"] = sum(all(
            results[i] is not None and all(results[i][family]["status"] == rows[i][family]
                                           for family in FAMILIES)
            for i in range(len(rows)) if rows[i]["pair"] == pair)
            for pair in {row["pair"] for row in rows})
    return metrics, [{"id": row.get("id"), "pair": row.get("pair"),
                     "reference": {f: row[f] for f in FAMILIES},
                     "candidate": candidate[i], "checker": results[i],
                     "score": float(scores[i])} for i, row in enumerate(rows)]


def reviewed_rows(queue, review):
    reviewed = read(review)
    labels = {row["id"]: row for row in reviewed}
    rows = read(queue)
    if len(rows) != len(reviewed) or len(rows) != len(labels) or set(labels) != {row["id"] for row in rows}:
        raise ValueError("Review IDs must match the queue")
    if any(record.get(family) not in STATES for record in reviewed for family in FAMILIES):
        raise ValueError("Reviews must give a valid status for each family")
    return [{**row, **{family: labels[row["id"]][family] for family in FAMILIES}} for row in rows]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review", nargs=2, action="append", metavar=("QUEUE", "LABELS"), default=[])
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--batch", type=int, choices=range(1, 9), default=8)
    parser.add_argument("--skip-pairs", action="store_true")
    parser.add_argument("--pairs", type=Path, default=Path(__file__).with_name("sir_pressure_check_pairs.json"))
    parser.add_argument("--report-name", choices=("results", "context-results"), default="results")
    args = parser.parse_args()
    folder = CACHE / "evidence_check"
    folder.mkdir(exist_ok=True)
    sets = {} if args.skip_pairs else {"pairs": json.loads(
        args.pairs.read_text(encoding="utf-8"))}
    if args.review:
        rows = [row for queue, review in args.review for row in reviewed_rows(Path(queue), Path(review))]
        if len({row["thread"] for row in rows}) != len(rows):
            raise ValueError("Expected one reviewed example per thread")
        sets["reviewed"] = rows
    for name, rows in sets.items():
        metrics, detail = evaluate(rows, args.model, args.batch)
        (folder / (name + "-" + args.report_name + ".json")).write_text(json.dumps(
            {"metrics": metrics, "rows": detail}, indent=2), encoding="utf-8")
        print(json.dumps({name: metrics}, indent=2), flush=True)


if __name__ == "__main__":
    main()
