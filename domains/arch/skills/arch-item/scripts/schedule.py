#!/usr/bin/env python3
"""schedule - when will the documentation be ready, how likely is it to be late, and what shortens it.

A plan is work packages with three estimates each (best, likely, worst), what each waits for, and the
risks that can delay them. The tool runs the plan many times with values drawn between best and worst
and reports the dates it is 50 %, 80 % and 95 % sure of, the chance of missing the deadline, what
drives the delay, and what each possible measure would gain - in working days, not adjectives.

Usage: schedule.py PLAN.json [--out results.json] [--runs 5000] [--seed 1] [--max-miss 0.15]

PLAN.json {"start": "2026-12-01", "deadline": "2027-03-15", "hours_per_day": 6,
           "packages": [{"id": "model", "title": "...", "hours": [40, 60, 110], "people": 1, "after": ["intake"]},
                        {"id": "uzgodnienia", "title": "...", "days": [10, 21, 45], "external": true, "after": ["pb"]}],
           "risks": [{"id": "late-inputs", "text": "...", "probability": 0.4, "delay_days": [3, 7, 20], "hits": "intake"}],
           "history": [{"estimated_hours": 120, "actual_hours": 150}]}
"hours" are working hours of the office; "days" are working days of waiting on somebody else."""
import argparse, datetime, json, random, statistics, sys
import receipt

RES, LINES = {}, []


def report(cid, status, text, data=None):
    RES[cid] = {"status": status, "text": text, "data": data}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def add_workdays(start, days):
    d, left = start, int(round(days))
    while left > 0:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d


def workdays_between(a, b):
    n, d, step = 0, a, 1 if b >= a else -1
    while d != b:
        d += datetime.timedelta(days=step)
        if d.weekday() < 5:
            n += step
    return n


def problems_of(plan):
    p, ids = [], [k.get("id") for k in plan.get("packages", [])]
    for k in ("start", "deadline", "packages"):
        if not plan.get(k):
            p.append("'%s' is missing" % k)
    for k in plan.get("packages", []):
        est = k.get("hours") or k.get("days")
        if not est or len(est) != 3 or not (0 < est[0] <= est[1] <= est[2]):
            p.append("package %s needs three estimates: best <= likely <= worst" % k.get("id"))
        elif est[2] == est[0]:
            p.append("package %s: best and worst are equal - an estimate without a range hides its risk" % k.get("id"))
        p += ["package %s waits for unknown package '%s'" % (k.get("id"), a) for a in k.get("after", []) if a not in ids]
    p += ["package id used twice: %s" % i for i in sorted({i for i in ids if ids.count(i) > 1})]
    for r in plan.get("risks", []):
        if not 0 < r.get("probability", 0) <= 1 or len(r.get("delay_days", [])) != 3:
            p.append("risk %s needs a probability in (0, 1] and three delay estimates" % r.get("id"))
        if r.get("hits") and r["hits"] not in ids:
            p.append("risk %s hits unknown package '%s'" % (r.get("id"), r["hits"]))
    order, seen = [], set()
    todo = list(plan.get("packages", []))
    while todo:  # the order of work; a package that can never start is a cycle
        ready = [k for k in todo if all(a in seen for a in k.get("after", []))]
        if not ready:
            p.append("packages wait for each other in a circle: %s" % ", ".join(k["id"] for k in todo))
            break
        for k in ready:
            order.append(k); seen.add(k["id"]); todo.remove(k)
    return p, order


def simulate(plan, order, runs, seed, factor, drop_risk=None, speed=None):
    """Finish in working days for every run, and how often each package was on the longest chain."""
    rnd, hpd = random.Random(seed), plan.get("hours_per_day", 6)
    finishes, critical = [], {k["id"]: 0 for k in order}
    for _ in range(runs):
        end, via = {}, {}
        for k in order:
            if k.get("hours"):
                o, m, w = k["hours"]
                dur = rnd.triangular(o, w, m) * factor / (hpd * k.get("people", 1))
            else:
                o, m, w = k["days"]
                dur = rnd.triangular(o, w, m)
            if speed and speed[0] == k["id"]:
                dur *= speed[1]
            for r in plan.get("risks", []):
                if r.get("hits") == k["id"] and r["id"] != drop_risk:
                    d = rnd.triangular(r["delay_days"][0], r["delay_days"][2], r["delay_days"][1])  # drawn always, so that runs stay comparable
                    if rnd.random() < r["probability"]:
                        dur += d
            before = max(k.get("after", []), key=lambda a: end[a], default=None)
            end[k["id"]] = (end[before] if before else 0.0) + dur
            via[k["id"]] = before
        last = max(end, key=end.get)
        tail = 0.0
        for r in plan.get("risks", []):
            if not r.get("hits") and r["id"] != drop_risk:
                d = rnd.triangular(r["delay_days"][0], r["delay_days"][2], r["delay_days"][1])
                if rnd.random() < r["probability"]:
                    tail += d
        finishes.append(end[last] + tail)
        while last:
            critical[last] += 1
            last = via[last]
    return finishes, {k: v / runs for k, v in critical.items()}


def pct(values, q):
    s = sorted(values)
    return s[min(len(s) - 1, int(q * len(s)))]


def run(plan, runs=5000, seed=1, max_miss=0.15):
    p, order = problems_of(plan)
    if p:
        report("schedule.inputs", "FAIL", "%d problems: %s" % (len(p), "; ".join(p[:5])), p)
        report("schedule.result", "SKIP", "the plan cannot be computed until its inputs are fixed")
        return None
    hist = [h["actual_hours"] / h["estimated_hours"] for h in plan.get("history", []) if h.get("estimated_hours")]
    factor = statistics.median(hist) if len(hist) >= 3 else 1.0
    report("schedule.inputs", "OK", "%d packages, %d risks; %s" % (len(order), len(plan.get("risks", [])),
           "hours scaled by %.2f, the median of %d finished projects" % (factor, len(hist)) if len(hist) >= 3 else "NOT calibrated: fewer than 3 finished projects in 'history', so the hours are the office's guess as given"))
    start, deadline = datetime.date.fromisoformat(plan["start"]), datetime.date.fromisoformat(plan["deadline"])
    fin, crit = simulate(plan, order, runs, seed, factor)
    allowed = workdays_between(start, deadline)
    miss = sum(1 for f in fin if f > allowed) / len(fin)
    p50, p80, p95 = (pct(fin, q) for q in (0.5, 0.8, 0.95))
    level = "GREEN" if miss <= max_miss else "YELLOW" if miss <= 0.4 else "RED"
    # what each measure would gain at the 80 % date, measured by running the plan again without it
    gains = []
    for r in plan.get("risks", []):
        g = p80 - pct(simulate(plan, order, runs, seed, factor, drop_risk=r["id"])[0], 0.8)
        gains.append((g, "remove risk '%s' (%s)" % (r["id"], r.get("text", "")), r.get("measure") or "agree in writing who delivers what and when, before the work starts"))
    for k in order:
        if crit[k["id"]] < 0.2:
            continue
        g = p80 - pct(simulate(plan, order, runs, seed, factor, speed=(k["id"], 0.8))[0], 0.8)
        how = ("start it earlier or submit a partial set first: it is waiting time, not work" if k.get("days") else
               "add a second person or split it into two packages that run side by side" if k.get("people", 1) == 1 else "reuse the office template and the previous stage's sheets instead of redrawing")
        gains.append((g, "shorten '%s' by a fifth" % k.get("title", k["id"]), how))
    ratios = [((k.get("hours") or k["days"])[2] / (k.get("hours") or k["days"])[1], k) for k in order if crit[k["id"]] >= 0.2]
    wide = sorted(ratios, key=lambda x: x[0])[-1:]
    gains = sorted((g for g in gains if g[0] >= 0.5), reverse=True)[:4]
    out = {"p50": add_workdays(start, p50).isoformat(), "p80": add_workdays(start, p80).isoformat(), "p95": add_workdays(start, p95).isoformat(),
           "deadline": deadline.isoformat(), "miss": round(miss, 3), "level": level, "buffer_days": round(allowed - p80, 1),
           "critical": {k: round(v, 2) for k, v in sorted(crit.items(), key=lambda kv: -kv[1])},
           "measures": [{"gain_days": round(g, 1), "what": what, "how": how} for g, what, how in gains], "factor": round(factor, 2)}
    LINES.append("ready with 50%% certainty by %s, 80%% by %s, 95%% by %s; deadline %s" % (out["p50"], out["p80"], out["p95"], out["deadline"]))
    LINES.append("chance of missing the deadline %d%% -> %s; reserve at the 80%% date: %+.0f working days" % (round(miss * 100), level, out["buffer_days"]))
    LINES.append("on the longest chain: " + ", ".join("%s %d%%" % (k, round(v * 100)) for k, v in list(out["critical"].items())[:5]))
    for m in out["measures"]:
        LINES.append("  gains %.0f working days: %s - %s" % (m["gain_days"], m["what"], m["how"]))
    if wide and wide[0][0] >= 1.8:
        LINES.append("  widest uncertainty: '%s' (worst is %.1fx likely) - a pilot on one sheet or one storey narrows it cheaply" % (wide[0][1].get("title", wide[0][1]["id"]), wide[0][0]))
    report("schedule.result", "OK" if miss <= max_miss else "FAIL", "%d%% chance of missing %s (limit %d%%)" % (round(miss * 100), out["deadline"], round(max_miss * 100)), out)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("plan"); ap.add_argument("--out"); ap.add_argument("--runs", type=int, default=5000); ap.add_argument("--seed", type=int, default=1); ap.add_argument("--max-miss", type=float, default=0.15)
    a = ap.parse_args()
    run(json.load(open(a.plan, encoding="utf-8")), a.runs, a.seed, a.max_miss)
    print("\n".join(LINES))
    if a.out:
        json.dump(receipt.stamp(RES, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if any(r["status"] == "FAIL" for r in RES.values()) else 2 if any(r["status"] == "SKIP" for r in RES.values()) else 0)
