"""Apply fact-check verdicts to a draft batch -> staged file.

Usage:
    python3 apply_fixes.py <batch_name>

Reads:
    batch_NN_<batch_name>_draft.json
    batch_NN_<batch_name>_review.json
    overrides.json (optional, applied AFTER review patches)

Writes:
    batch_NN_<batch_name>_staged.json
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent

# Manual overrides — applied after agent review verdicts. Use sparingly.
OVERRIDES = {
    "ir008": {
        "reason": "Darius was not biologically Cyrus's son; reviewer marked borderline accept. Forcing accurate phrasing.",
        "fix": {
            "question": (
                "He came to the throne of the Achaemenid Empire in 522 BC after putting down a "
                "rebellion, and at Behistun he left a trilingual rock inscription boasting of his "
                "victories. Name him."
            ),
            "explanation": "Darius I (r. 522–486 BC); the Behistun Inscription, in Old Persian, Elamite and Babylonian, helped decipher cuneiform.",
        },
    },
}

# Cross-batch duplicates — answers that appear in two batches. Drop the world-batch
# version and keep the USA-batch version, since these are all distinctly American figures
# (presidents, athletes, brands, actors). Amazon kept in both because they're different
# concepts (river vs company).
CROSS_BATCH_DROPS = {
    "wa048",  # George Washington — owned by usa/us001
    "wb001",  # Casablanca — owned by usa/us022
    "wb015",  # Elvis Presley — owned by usa/us046
    "wb011",  # Meryl Streep — owned by usa/us029
    "wb032",  # Michael Phelps — owned by usa/us018
    "wb041",  # Tiger Woods — owned by usa/us020
    "wb046",  # Coca-Cola — owned by usa/us044
    "wb047",  # Ray Kroc — owned by usa/us045
}


def find_pair(batch_name):
    draft = sorted(HERE.glob(f"batch_*_{batch_name}_draft.json"))
    review = sorted(HERE.glob(f"batch_*_{batch_name}_review.json"))
    if not draft or not review:
        sys.exit(f"Could not find draft/review pair for batch={batch_name}")
    return draft[0], review[0]


def apply(batch_name):
    draft_path, review_path = find_pair(batch_name)
    draft = json.load(open(draft_path))
    review = json.load(open(review_path))

    questions = {q["id"]: dict(q) for q in draft["questions"]}
    verdicts = {v["id"]: v for v in review["verdicts"]}

    accepted, patched, dropped, override_count = 0, 0, 0, 0
    final = []
    for qid in [q["id"] for q in draft["questions"]]:
        v = verdicts.get(qid)
        if v is None:
            print(f"  WARN {qid}: no verdict found, dropping")
            dropped += 1
            continue
        verdict = v["verdict"]
        if qid in CROSS_BATCH_DROPS:
            print(f"  CROSS-BATCH DROP {qid}: dup of another batch")
            dropped += 1
            continue
        if verdict == "drop":
            print(f"  DROP {qid}: {v.get('issue','')}")
            dropped += 1
            continue
        q = questions[qid]
        if verdict == "patch":
            fix = v.get("fix", {})
            for k, val in fix.items():
                q[k] = val
            patched += 1
        else:
            accepted += 1
        # Manual override layer
        if qid in OVERRIDES:
            o = OVERRIDES[qid]
            for k, val in o["fix"].items():
                q[k] = val
            override_count += 1
            print(f"  OVERRIDE {qid}: {o['reason']}")
        final.append(q)

    out_path = draft_path.with_name(draft_path.name.replace("_draft.json", "_staged.json"))
    json.dump(
        {
            "batch": batch_name,
            "count": len(final),
            "accepted": accepted,
            "patched": patched,
            "dropped": dropped,
            "overrides": override_count,
            "questions": final,
        },
        open(out_path, "w"),
        indent=2,
        ensure_ascii=False,
    )
    print(f"  -> {out_path.name}: {len(final)} questions ({accepted} accept, {patched} patched, {dropped} dropped, {override_count} overrides)")


if __name__ == "__main__":
    for batch in sys.argv[1:]:
        print(f"\n== {batch} ==")
        apply(batch)
