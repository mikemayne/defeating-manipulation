"""Measure a delivery-aware Qwen prompt on matched fictional controls."""
import argparse
import json
import random

from prepare import ROOT
from pressure_collect import KEYS, OUT
from pressure_context import SCHEMA_ROW, SYSTEM
from qwen_bench import MODEL, api, gpu_info, metrics

MODES = ("directed", "overheard_known", "overheard_unknown")
EMOTION_NOTE = (
    "\nThe optional reported_emotion field records what the listener says they felt. "
    "Use it to understand their account or consider competing interpretations. "
    "It supplies no evidence that any particular kind of pressure is present. "
    "Keep no-match and insufficient-context decisions available even if the listener felt distressed."
)
EMOTIONS = {
    0: "I felt embarrassed.", 3: "I felt angry and defiant.",
    6: "I started doubting myself.", 9: "I felt scared.", 12: "I felt trapped.",
    15: "I felt afraid.", 16: "I felt trapped.", 17: "I felt embarrassed.",
    18: "I started doubting myself.", 21: "I felt hurt and judged.",
    27: "I felt threatened.", 29: "I felt ashamed.",
}
# The named person is the listener in all modes. Only delivery metadata changes.
CASES = [
    ([0], "After everything we did for Jordan, only an ungrateful person would refuse to sign."),
    ([0], "A decent friend would take the shift. Refusing after I covered for Jordan would be a betrayal."),
    ([0], "If Jordan really cared about the family, Jordan would apologize for disagreeing."),
    ([1], "If Jordan files the complaint, I will cancel Jordan's shifts for the rest of the month."),
    ([1], "Jordan should take down the post. Leave it up and I will send the private messages to the office."),
    ([1], "Jordan should vote the way I asked. Vote differently and I'll see to it that Jordan loses the room."),
    ([2], "Jordan says the alarm went off, but that never happened. Jordan can't trust what Jordan remembers."),
    ([2], "That meeting couldn't have gone the way Jordan remembers. Jordan is always imagining things and should trust my version."),
    ([2], "Jordan thinks the screen went blank. That's all in Jordan's head, just like the other things Jordan thinks happened."),
    ([3], "Jordan's figures don't deserve a hearing. Jordan is a dishonest person, so the report can be dismissed."),
    ([3], "Don't listen to Jordan's objections. That anxious reaction is proof that Jordan can't be trusted."),
    ([3], "Why should anyone believe Jordan's account? Jordan comes from a family of cheats."),
    ([4], "If Jordan objects, that counts as insubordination. If Jordan stays quiet, that counts as consent."),
    ([4], "Jordan has two options. Accept every term today or give up any chance to stay."),
    ([4], "There is no way out for Jordan but signing. Trying to negotiate or walking away both count as refusal."),
    ([], "Jordan should use the other entrance. Ice has made the stairs slippery."),
    ([], "If Jordan misses the final train, the next scheduled service is tomorrow morning."),
    ([], "Jordan says the alarm went off at seven. The event log records it at eight, so I think the time is off by an hour."),
    ([], "Jordan and I remember that meeting differently. Let's compare our notes before deciding what was said."),
    ([], "Jordan's proposed total doesn't use the updated price. That is why I disagree with the estimate."),
    ([], "I find Jordan irritating. We still need to read the report."),
    ([], "Some people enjoy Jordan's music and some don't. I prefer the earlier songs."),
    ([], "Jordan can take the shift or decline it. Either way, I'll arrange coverage."),
    ([], "Jordan has two available appointment slots this week. Next week's diary opens on Monday."),
    ([], "I covered Jordan's last shift. I can cover this one too if Jordan isn't free."),
    ([], "This article lists examples of threats in workplace complaints and explains how the reports were categorised."),
    ([], "Jordan looked nervous during the vote. I don't know why."),
    ([5], "That settles it for Jordan. We know what that means."),
    ([5], "Jordan can make the usual choice if that's what was said."),
    ([5], "Oh, Jordan remembers that? Well, then..."),
]

def infer(prompt, batch):
    schema = {"type": "object", "properties": {"rows": {"type": "array", "items": SCHEMA_ROW,
               "minItems": len(batch), "maxItems": len(batch)}},
              "required": ["rows"], "additionalProperties": False}
    response = api("/api/chat", {"model": MODEL, "stream": False, "think": False, "keep_alive": "4m",
        "messages": [{"role": "system", "content": prompt},
                     {"role": "user", "content": json.dumps(batch, ensure_ascii=False)}],
        "format": schema, "options": {"temperature": 0, "seed": 16133,
                                       "num_ctx": 6144, "num_predict": 925}})
    rows = json.loads(response["message"]["content"])["rows"]
    if len(rows) != len(batch):
        raise ValueError("Incomplete batch")
    results = []
    for payload, findings in zip(batch, rows):
        if findings == [{"k": -1, "e": "", "c": ""}]:
            results.append([])
            continue
        codes = {x["k"] for x in findings}
        if (len(codes) != len(findings) or not codes.issubset(range(len(KEYS)))
            or (5 in codes and len(codes) > 1)
            or any(not x["e"].strip() or x["e"] not in payload["target"]
                   or (x["c"] and x["c"] not in payload["context"]) for x in findings)):
            results.append(None)
        else:
            results.append(sorted(codes))
    return results

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    variant = parser.add_mutually_exclusive_group()
    variant.add_argument("--baseline", action="store_true", help="Use the earlier neutral prompt")
    variant.add_argument("--emotion", action="store_true", help="Test disclosed emotions on 12 matched cases")
    variant.add_argument("--emotion-control", action="store_true", help="Run the same emotion cases without disclosure")
    args = parser.parse_args()
    prompt = SYSTEM if args.baseline else (ROOT / "pressure_delivery_prompt.txt").read_text(encoding="utf8")
    if args.emotion or args.emotion_control:
        prompt += EMOTION_NOTE
    rng = random.Random(16133)
    cases = [(case_id, mode, expected, {"delivery_mode": mode, "target": text,
              "context": "Jordan is the listener." if mode == "directed"
              else "Jordan is the listener. The speaker is talking to Taylor."})
             for case_id, (expected, text) in enumerate(CASES) for mode in MODES]
    if args.emotion or args.emotion_control:
        cases = [case for case in cases if case[0] in EMOTIONS]
    if args.emotion:
        for case_id, _, _, payload in cases:
            payload["reported_emotion"] = EMOTIONS[case_id]
    rng.shuffle(cases)
    result = []
    for start in range(0, len(cases), 9):
        part = cases[start:start+9]
        ratings = infer(prompt, [x[3] for x in part])
        for (case_id, mode, expected, payload), found in zip(part, ratings):
            if found is None:
                found = infer(prompt, [payload])[0]
            result.append({"case": case_id, "mode": mode, "expected": expected, "predicted": found})
    gpu = gpu_info()
    by_mode = {}
    for mode in MODES:
        rows = [r for r in result if r["mode"] == mode]
        valid = [{"qwen": r["expected"], "browser": r["predicted"]} for r in rows
                 if r["predicted"] is not None]
        by_mode[mode] = {**metrics(valid, KEYS), "attempted": len(rows), "invalid": len(rows)-len(valid),
                         "exact_out_of_attempted_pct": round(100 * sum(
                             r["expected"] == r["predicted"] for r in rows) / len(rows), 2)}
    report = {"teacher": gpu, "dataset": "fictional matched controls", "by_mode": by_mode,
              "ratings": result}
    suffix = ("_baseline" if args.baseline else "_emotion" if args.emotion
              else "_emotion_control" if args.emotion_control else "")
    path = OUT / f"delivery_prompt{suffix}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps(by_mode, indent=2))

if __name__ == "__main__":
    main()
