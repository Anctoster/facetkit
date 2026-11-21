"""safe - text that comes from outside the office is data, and is handled as data.

A client's questionnaire, a consultant's IFC file and a supplier's schedule all end up in the output of
a tool, and that output is read by an agent. So every tool passes foreign text through here:
  clean()      control and direction characters removed, whitespace collapsed, length cut;
  suspect()    does this read like an instruction to the reader rather than a fact about a building?
  bad_regex()  is a search expression safe to run and specific enough to mean something?
None of this makes a hostile text harmless on its own. It makes it visible, short, and somebody's question."""
import re

CTRL = re.compile("[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩﻿]")
INSTRUCTION = [re.compile(p, re.I) for p in (
    r"ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|messages)", r"disregard\s+(the\s+)?(previous|above|instructions)",
    r"\bsystem\s+prompt\b", r"\byou\s+are\s+now\b", r"\b(assistant|system)\s*:", r"\bmark\s+(this|it|all|every\w*)\b.{0,40}\b(as\s+)?(done|passed|ok|complete|verified)",
    r"\bdo\s+not\s+(check|verify|report|tell)\b", r"\b(record|write|report)\s+(a\s+)?(pass|ok)\b",
    r"игнорир\w+\s+(все\s+)?(предыдущ\w+|прежн\w+|вышеуказан\w+)?\s*(инструкц|правил|указан)", r"не\s+(проверя|сообща|докладыва)\w+", r"отмет\w+\s+.{0,40}(выполнен|пройден|провер)",
    r"\bты\s+теперь\b", r"систем\w+\s+(промпт|подсказк|инструкц)", r"запиш\w+\s+.{0,20}\b(ок|ok|pass)\b",
    r"zignoruj\s+.{0,30}(instrukcj|polece|zasad)", r"pomi[nń]\s+.{0,30}(instrukcj|polece)", r"nie\s+(sprawdzaj|zg[lł]aszaj|raportuj)", r"oznacz\s+.{0,40}(jako\s+)?(wykonan|sprawdzon|zaliczon)",
    r"jeste[sś]\s+teraz\b")]
NESTED = re.compile(r"\([^()]*[+*][^()]*\)\s*[+*{]")


def clean(value, limit=160):
    """Foreign text made safe to print on one line."""
    s = " ".join(CTRL.sub(" ", str(value)).split())
    return s if len(s) <= limit else s[:limit - 1] + "…"


def suspect(value):
    """True when a text addresses whoever reads it instead of describing something."""
    s = clean(value, 2000)
    return any(p.search(s) for p in INSTRUCTION)


def bad_regex(expr):
    """Why a search expression may not be used as evidence, or None."""
    if not isinstance(expr, str) or not expr.strip():
        return "no search expression"
    if len(expr) > 120:
        return "the expression is longer than 120 characters"
    if NESTED.search(expr):
        return "the expression repeats a repeated group, which can hang the search"
    bare = re.sub(r"\[[^\]]*\]", " ", re.sub(r"\\.", " ", expr))
    if not re.search(r"[^\W\d_]{4,}", bare):
        return "the expression holds no word of four letters or more: it would match almost anything"
    try:
        re.compile(expr)
    except re.error as e:
        return "the expression does not compile (%s)" % e
    return None
