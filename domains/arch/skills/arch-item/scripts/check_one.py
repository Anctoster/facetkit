#!/usr/bin/env python3
"""check_one - does one check hold in one state? (FacetKit plan 2.8, the source step of a finding)

FacetKit's `facet origin` runs a criterion's check on the state after each step - the snapshot the
journal engine takes when a step starts (work/<ITEM>/snap/<step>/) - to find the step that broke it.
This script answers for one check id, from a results file a shipped tool writes ({"<id>": {"status":
"OK|FAIL|SKIP", ...}, "_receipt": ...}):

  check_one.py CHECK --results FILE [--op <= --value 0.05]     a results file kept in the state
  check_one.py CHECK --in DIR [...]                             the first results file in DIR that holds the check
  check_one.py CHECK [--op ... --value ...] -- TOOL.py ARGS...  run the tool on the state (it gets --out)
  check_one.py CHECK --in DIR -- TOOL.py ARGS...                 the tool when the state holds its inputs, else the state's results

Exit 0: the check holds; 1: it does not; 2: this state cannot say (no file, no such check, SKIP).
With --op and --value the result's numeric "value" is compared with the criterion's threshold;
otherwise the tool's own status decides.
"""
import argparse, json, operator, os, subprocess, sys, tempfile

OPS = {"<=": operator.le, ">=": operator.ge, "<": operator.lt, ">": operator.gt, "=": operator.eq, "==": operator.eq, "!=": operator.ne}


def verdict(results, check, op=None, value=None):
    r = results.get(check) if isinstance(results, dict) else None
    if not isinstance(r, dict):
        return 2
    if op and value is not None and isinstance(r.get("value"), (int, float)):
        return 0 if OPS[op](r["value"], value) else 1
    return {"OK": 0, "FAIL": 1}.get(r.get("status"), 2)


def main(argv):
    if "--" in argv:
        at = argv.index("--")
        mine, tool = argv[:at], argv[at + 1:]
    else:
        mine, tool = argv, []
    ap = argparse.ArgumentParser(prog="check_one.py")
    ap.add_argument("check"); ap.add_argument("--results"); ap.add_argument("--in", dest="dir"); ap.add_argument("--op", choices=sorted(OPS)); ap.add_argument("--value", type=float)
    a = ap.parse_args(mine)
    tool_inputs = [x for x in tool if x.endswith(".json")]
    if a.dir and not (tool and all(os.path.exists(x) for x in tool_inputs)):
        for name in sorted(os.listdir(a.dir)) if os.path.isdir(a.dir) else []:
            if not name.endswith(".json"):
                continue
            try:
                res = json.load(open(os.path.join(a.dir, name), encoding="utf-8"))
            except ValueError:
                continue
            # only a file a shipped tool wrote (it carries a receipt) is taken as a result
            if isinstance(res, dict) and "_receipt" in res and isinstance(res.get(a.check), dict):
                return verdict(res, a.check, a.op, a.value)
        return 2
    if a.results:
        if not os.path.exists(a.results):
            return 2
        try:
            return verdict(json.load(open(a.results, encoding="utf-8")), a.check, a.op, a.value)
        except ValueError:
            return 2
    if not tool or not all(os.path.exists(x) for x in tool if x.endswith(".json")):
        return 2  # the state does not hold the files the tool reads: it cannot say
    out = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
    out.close()
    try:
        script = tool[0] if os.path.isabs(tool[0]) else os.path.join(os.path.dirname(os.path.abspath(__file__)), tool[0])
        subprocess.run([sys.executable, script, *tool[1:], "--out", out.name], capture_output=True, text=True)
        try:
            return verdict(json.load(open(out.name, encoding="utf-8")), a.check, a.op, a.value)
        except ValueError:
            return 2
    finally:
        os.unlink(out.name)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
