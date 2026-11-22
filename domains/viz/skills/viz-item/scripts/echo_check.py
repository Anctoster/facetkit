#!/usr/bin/env python3
"""echo_check - did the agent of a step understand the brief, before it starts? (FacetKit plan 2.9)

The same rules as FacetKit's lib/echo.mjs. work/<ITEM>/echo.json:
  {"step": "work", "criteria": [{"id": "A1", "value": "...", "action": "...", "check": "..."}], "fixed": ["..."], "unknown": ["..."]}
  U1 every criterion whose "by" is the step is there                     < 100 % - refused
  U2 numbers with units, quoted words and identifiers of each criterion's
     text appear in its value as written ("25cm" = "25 cm", "20 cm" is not) < 100 % - refused
  U3 every line of the brief's Fixed section is named                     < 100 % - refused
  U4 numbers the brief does not have                                      a question to a person, not a refusal
"""
import re

NUMBER = re.compile(r"(?<![\w.\-])-?\d+(?:[.,]\d+)?(?:\s?(?:%|°[CF]?|[^\W\d_]{1,4}(?![^\W_])|[µ²³]))?")
QUOTED = re.compile(r"\"([^\"]+)\"|«([^»]+)»|'([^'\s][^']*[^'\s])'|`([^`]+)`")
IDENT = re.compile(r"\b(?:[A-Za-z]+[_.][A-Za-z0-9_.]+|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*|[A-Z]{2,}[A-Z0-9_-]*\d[A-Z0-9_-]*|[A-Za-z]+\d+(?:[-_][A-Za-z0-9]+)+)\b")


def squash(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def loose(s):
    return re.sub(r"(\d)\s(?=[^\d\s])", r"\1", squash(s)).replace(",", ".", 1).lower()


def literals(text):
    t, out = str(text or ""), []
    add = lambda x: x and x not in out and out.append(x)
    for m in QUOTED.finditer(t):
        add(squash(next(g for g in m.groups() if g)))
    bare = QUOTED.sub(" ", t)
    for m in NUMBER.finditer(bare):
        add(squash(m.group(0)))
    for m in IDENT.finditer(bare):
        add(m.group(0).rstrip("."))
    return out


def fixed_of(brief):
    lines, out, on = str(brief or "").splitlines(), [], False
    for l in lines:
        if re.match(r"^##\s", l):
            on = bool(re.match(r"^##\s+Fixed\b", l, re.I))
            continue
        if on:
            s = squash(re.sub(r"^[-*]\s*|^\d+[.)]\s*", "", l))
            if s and not s.startswith("(") and not re.match(r"^none\.?$", s, re.I):
                out.append(s)
    return out


def key_words(line):
    return [w.strip(".-") for w in re.split(r"[^\w.\-]+", squash(line).lower()) if len(w.strip(".-")) > 3]


def check_echo(echo, step, criteria, fixed):
    """{"ok", "problems": [(u, text, id)], "u1", "u2", "u3", "u4", "extra"}"""
    probs = []
    if not isinstance(echo, dict) or not isinstance(echo.get("criteria"), list):
        return {"ok": False, "problems": [("U1", "the echo is not a file of the form {step, criteria: [{id, value, action, check}], fixed, unknown}", None)],
                "u1": 0, "u2": 0, "u3": 0, "u4": 0, "extra": []}
    if echo.get("step") not in (None, step):
        probs.append(("U1", "the echo is for step %s, not %s" % (echo.get("step"), step), None))
    mine = [c for c in criteria if c.get("by") == step]
    said = {c["id"]: c for c in echo["criteria"] if isinstance(c, dict) and c.get("id")}
    covered = [c for c in mine if c["id"] in said]
    for c in mine:
        if c["id"] not in said:
            probs.append(("U1", "criterion %s of this step is not in the echo" % c["id"], c["id"]))
    wanted = found = 0
    for c in covered:
        s = said[c["id"]]
        value = loose(s.get("value"))
        for lit in literals(c.get("text")):
            wanted += 1
            if loose(lit) in value:
                found += 1
            else:
                probs.append(("U2", "criterion %s: the brief says \"%s\", the echo does not (it says: %s)" % (c["id"], lit, squash(s.get("value"))[:80]), c["id"]))
        if not squash(s.get("action")):
            probs.append(("U2", "criterion %s: no action - what will be done" % c["id"], c["id"]))
        if not squash(s.get("check")):
            probs.append(("U2", "criterion %s: no check - how it will be shown to hold" % c["id"], c["id"]))
    named = " | ".join(squash(f).lower() for f in echo.get("fixed") or [])
    kept = [l for l in fixed if all(w in named for w in key_words(l)) or squash(l).lower() in named]
    for l in fixed:
        if l not in kept:
            probs.append(("U3", "Fixed: \"%s\" is not named as unchangeable" % l, None))
    known = {c.get("id") for c in criteria}
    extra = [i for i in said if i not in known]
    ok = not probs
    probs += [("U4", "%s is not a criterion of the brief: scope-creep - ask a person before doing it" % i, i) for i in extra]
    return {"ok": ok, "problems": probs, "u1": round(len(covered) / len(mine), 3) if mine else 1,
            "u2": round(found / wanted, 3) if wanted else 1, "u3": round(len(kept) / len(fixed), 3) if fixed else 1, "u4": len(extra), "extra": extra}


def render(r):
    return "\n".join(["echo: %s - U1 %d %% · U2 %d %% · U3 %d %% · U4 %d" % ("understood" if r["ok"] else "NOT understood", round(r["u1"] * 100), round(r["u2"] * 100), round(r["u3"] * 100), r["u4"])]
                     + ["  %s %s %s" % ("?" if u == "U4" else "x", u, t) for u, t, _ in r["problems"]])
