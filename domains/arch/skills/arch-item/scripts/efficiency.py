"""efficiency - is the agent team worth it on this kind of task, measured from the journal.

Used by archflow.py and vizflow.py (the same file sits next to both). It answers, per kind of task
(route), the questions an office asks before it trusts agents with more work:

  - how often the result was right the first time, and how often the architect accepted it as it was;
  - how much of the architect's own time the item still took, against what the same work takes by hand;
  - how many questions, preview rounds and changed briefs it needed;
  - which agent on which model gets its work sent back, and whether a cheaper model would do;
  - what the checks caught before the architect saw the result;
  - what it cost in tokens (and money, when project.json gives prices).

Two records come from the architect, because the journal cannot know them:
  hand ITEM --hours H --by NAME      how long this work takes the office by hand - said BEFORE the agents start
                                      (said later, it is shown but not used: knowing the result changes the guess)
  spent ITEM --minutes M --on WHAT   the architect's own time on the item: brief, questions, preview, review, fix

Rates come with an 80 % interval, and nothing is concluded from fewer than five items."""
import datetime, html, json, math, os, statistics

MIN = 5
Z80 = 1.2816
ON = ("brief", "questions", "preview", "review", "fix", "other")

T = {
    "en": {
        "title": "Agent efficiency", "route": "task type", "items": "items closed", "first": "right the first time",
        "accepted": "accepted as delivered", "judged": "judged by the architect", "questions": "questions to the architect per item",
        "previews": "preview rounds per item", "briefs": "briefs changed after approval", "arch": "architect's time per item",
        "hand": "same work by hand", "saved": "time saved per item", "agent_time": "agents' working time per item",
        "tokens": "tokens per item", "cost": "cost per item", "caught": "caught by the checks before the architect saw it",
        "remarks": "architect's remarks", "agent": "defect", "brief": "missing in the brief", "taste": "new wish",
        "agents": "Agents (sent back = items where the inspector returned this agent's work)", "sent": "sent back",
        "nodata": "not enough data (fewer than %d items)", "reliable": "reliable on this model", "raise": "raise one model up",
        "watch": "watch", "models": "Same agent, different models", "noconcl": "no conclusion yet",
        "better": "%s does better than %s here", "unknown": "unknown", "late": "%d estimates given after the work started - not used",
        "noarch": "the architect's time was not recorded (spent ITEM --minutes M --on ...)",
        "nohand": "no estimate of the hand work (hand ITEM --hours H, before the agents start)",
        "foot": "Counted from the journal. Defects nobody reported and time nobody recorded are not in it.",
        "none": "No closed item yet: efficiency is read from finished work.", "h": "h", "min": "min",
        "verdict_good": "worth it: saves %s per item and is right the first time in %s",
        "verdict_bad": "not worth it yet: the architect spends more time than by hand",
        "verdict_thin": "too few items to judge (%d of %d needed)", "verdict": "verdict",
        "on": {"brief": "brief", "questions": "questions", "preview": "previews", "review": "review", "fix": "fixing", "other": "other"},
    },
    "ru": {
        "title": "Эффективность агентов", "route": "тип задачи", "items": "закрыто задач", "first": "верно с первого раза",
        "accepted": "принято без замечаний", "judged": "оценено архитектором", "questions": "вопросов архитектору на задачу",
        "previews": "кругов превью на задачу", "briefs": "ТЗ изменено после утверждения", "arch": "время архитектора на задачу",
        "hand": "та же работа вручную", "saved": "сэкономлено на задачу", "agent_time": "время работы агентов на задачу",
        "tokens": "токенов на задачу", "cost": "стоимость задачи", "caught": "поймано проверками до того, как увидел архитектор",
        "remarks": "замечания архитектора", "agent": "дефект", "brief": "не было в ТЗ", "taste": "новое пожелание",
        "agents": "Агенты (возвращено = задачи, где инспектор вернул работу этого агента)", "sent": "возвращено",
        "nodata": "мало данных (меньше %d задач)", "reliable": "надёжен на этой модели", "raise": "поднять на модель выше",
        "watch": "наблюдать", "models": "Один агент, разные модели", "noconcl": "пока без вывода",
        "better": "%s здесь лучше, чем %s", "unknown": "неизвестно", "late": "%d оценок дано после начала работы - не учтены",
        "noarch": "время архитектора не записано (spent ITEM --minutes M --on ...)",
        "nohand": "нет оценки ручной работы (hand ITEM --hours H, до старта агентов)",
        "foot": "Посчитано по журналу. Дефекты, о которых не сообщили, и неучтённое время сюда не входят.",
        "none": "Закрытых задач ещё нет: эффективность считается по завершённой работе.", "h": "ч", "min": "мин",
        "verdict_good": "окупается: экономит %s на задачу, верно с первого раза в %s",
        "verdict_bad": "пока не окупается: архитектор тратит больше, чем вручную",
        "verdict_thin": "слишком мало задач для вывода (%d из %d)", "verdict": "вывод",
        "on": {"brief": "ТЗ", "questions": "вопросы", "preview": "превью", "review": "проверка", "fix": "исправления", "other": "другое"},
    },
    "pl": {
        "title": "Efektywność agentów", "route": "rodzaj zadania", "items": "zamkniętych zadań", "first": "dobrze za pierwszym razem",
        "accepted": "przyjęte bez uwag", "judged": "ocenione przez architekta", "questions": "pytań do architekta na zadanie",
        "previews": "rund podglądu na zadanie", "briefs": "brief zmieniony po zatwierdzeniu", "arch": "czas architekta na zadanie",
        "hand": "ta sama praca ręcznie", "saved": "oszczędność na zadanie", "agent_time": "czas pracy agentów na zadanie",
        "tokens": "tokenów na zadanie", "cost": "koszt zadania", "caught": "wyłapane przez kontrole, zanim zobaczył architekt",
        "remarks": "uwagi architekta", "agent": "błąd", "brief": "brak w briefie", "taste": "nowe życzenie",
        "agents": "Agenci (zwrócone = zadania, w których inspektor zwrócił pracę agenta)", "sent": "zwrócone",
        "nodata": "za mało danych (mniej niż %d zadań)", "reliable": "niezawodny na tym modelu", "raise": "podnieść o jeden model",
        "watch": "obserwować", "models": "Ten sam agent, różne modele", "noconcl": "jeszcze bez wniosku",
        "better": "%s radzi sobie tu lepiej niż %s", "unknown": "nieznane", "late": "%d szacunków podanych po rozpoczęciu pracy - pominięte",
        "noarch": "czas architekta nie został zapisany (spent ITEM --minutes M --on ...)",
        "nohand": "brak szacunku pracy ręcznej (hand ITEM --hours H, przed startem agentów)",
        "foot": "Policzone z dziennika. Błędy, których nikt nie zgłosił, i niezapisany czas nie są tu ujęte.",
        "none": "Brak zamkniętych zadań: efektywność liczy się z zakończonej pracy.", "h": "h", "min": "min",
        "verdict_good": "opłaca się: oszczędza %s na zadanie, dobrze za pierwszym razem w %s",
        "verdict_bad": "jeszcze się nie opłaca: architekt traci więcej czasu niż ręcznie",
        "verdict_thin": "za mało zadań na wniosek (%d z %d)", "verdict": "wniosek",
        "on": {"brief": "brief", "questions": "pytania", "preview": "podglądy", "review": "sprawdzenie", "fix": "poprawki", "other": "inne"},
    },
}


def wilson(k, n, z=Z80):
    if not n:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def rate(k, n):
    if not n:
        return {"k": 0, "n": 0, "p": None, "lo": None, "hi": None}
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "p": k / n, "lo": lo, "hi": hi}


def when(ts):
    try:
        return datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S")
    except (TypeError, ValueError):
        return None


def started_items(ev):
    return {e["item"] for e in ev if e["type"] == "start" and e.get("step") != "order"}


def record_hand(j, a):
    ev = j.events()
    if any(e["type"] == "hand" and e.get("item") == a.item for e in ev):
        return "Refused: %s already has an estimate of the hand work; the first one stands." % a.item, 1
    if a.hours <= 0:
        return "Refused: --hours must be above zero.", 1
    late = a.item in started_items(ev)
    j.add("hand", item=a.item, hours=a.hours, by=a.by, late=late or None)
    return ("recorded: %s takes %.1f h by hand (%s)%s" % (a.item, a.hours, a.by,
            "  - LATE: the agents already started, so it is shown but not used to compute savings" if late else "")), 0


def record_spent(j, a):
    ev = j.events()
    if not any(e["type"] == "open" and e.get("item") == a.item for e in ev):
        return "Refused: no item %s in the journal." % a.item, 1
    if a.minutes <= 0:
        return "Refused: --minutes must be above zero.", 1
    j.add("spent", item=a.item, minutes=a.minutes, on=a.on, by=a.by)
    return "recorded: %d min of the architect's time on %s (%s)" % (a.minutes, a.item, a.on), 0


def item_facts(s, ev, prices):
    it = s["item"]
    mine = [e for e in ev if e.get("item") == it]
    opened = {}
    agent_min = 0.0
    for e in mine:
        if e["type"] == "start":
            opened[e["step"]] = when(e.get("ts"))
        elif e["type"] == "end" and opened.get(e["step"]):
            end = when(e.get("ts"))
            if end:
                agent_min += max(0.0, (end - opened.pop(e["step"])).total_seconds() / 60.0)
    hand = next((e for e in mine if e["type"] == "hand"), None)
    spent = [e for e in mine if e["type"] == "spent"]
    questions = sum(1 for e in mine if (e["type"] == "end" and e.get("status") == "NEEDS-USER") or (e["type"] == "verdict" and e.get("verdict") == "NEEDS-USER"))
    caught = {}
    for e in mine:
        if e["type"] == "evidence" and e.get("status") == "FAIL":
            caught[e["check"]] = caught.get(e["check"], 0) + 1
    tok = {}
    for agent, model, n in s["tokens"]:
        tok[model] = tok.get(model, 0) + (n or 0)
    cost = None
    if prices and tok:
        cost = sum(n / 1e6 * prices[m] for m, n in tok.items() if m in prices) if all(m in prices for m in tok) else None
    return {
        "item": it, "route": s["route"], "first": s["rework"] == 0, "judged": bool(s["accepted"] or s["remarks"]),
        "clean": bool(s["accepted"]) and not s["remarks"], "remarks": [r.get("cause", "agent") for r in s["remarks"]],
        "questions": questions, "previews": s["previews"], "brief_changed": sum(1 for e in mine if e["type"] == "brief.ok" and e.get("changed")),
        "agent_min": round(agent_min, 1), "arch_min": sum(e["minutes"] for e in spent) if spent else None,
        "arch_on": {k: sum(e["minutes"] for e in spent if e.get("on") == k) for k in ON if any(e.get("on") == k for e in spent)},
        "hand_h": hand["hours"] if hand and not hand.get("late") else None, "hand_late": bool(hand and hand.get("late")),
        "tokens": sum(tok.values()), "cost": cost, "caught": caught, "rework": s["rework"],
    }


def agent_rows(states, ev):
    rows = {}
    for s in states:
        sent = {}
        for e in ev:
            if e["type"] == "verdict" and e.get("item") == s["item"] and e["verdict"] == "REWORK":
                for f in e.get("fix", []):
                    sent[f.split(":")[0]] = 1
        seen = set()
        for e in s["ends"]:
            k = (e.get("agent", "?"), e.get("model", "?"))
            if k in seen or k[0].endswith("-inspector") or k[0].endswith("-conductor"):
                continue
            seen.add(k)
            r = rows.setdefault(k, {"items": 0, "sent": 0})
            r["items"] += 1
            r["sent"] += sent.get(k[0], 0)
    return {k: dict(v, rate=rate(v["sent"], v["items"])) for k, v in rows.items()}


def models_compared(rows):
    out = []
    by = {}
    for (agent, model), r in rows.items():
        by.setdefault(agent, []).append((model, r))
    for agent, ms in sorted(by.items()):
        if len(ms) < 2:
            continue
        ms = sorted(ms, key=lambda x: x[0])
        for i in range(len(ms)):
            for k in range(i + 1, len(ms)):
                (m1, r1), (m2, r2) = ms[i], ms[k]
                if r1["items"] < MIN or r2["items"] < MIN:
                    out.append({"agent": agent, "a": m1, "b": m2, "better": None, "thin": True})
                    continue
                a, b = r1["rate"], r2["rate"]
                better = m1 if a["hi"] < b["lo"] else m2 if b["hi"] < a["lo"] else None  # fewer sent back is better
                out.append({"agent": agent, "a": m1, "b": m2, "better": better, "thin": False})
    return out


def median(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def summarize(facts, rows):
    n = len(facts)
    first = rate(sum(f["first"] for f in facts), n)
    judged = [f for f in facts if f["judged"]]
    clean = rate(sum(f["clean"] for f in judged), len(judged))
    remarks = {"agent": 0, "brief": 0, "taste": 0}
    caught = {}
    for f in facts:
        for c in f["remarks"]:
            remarks[c] = remarks.get(c, 0) + 1
        for c, k in f["caught"].items():
            caught[c] = caught.get(c, 0) + 1
    paired = [f for f in facts if f["hand_h"] is not None and f["arch_min"] is not None]
    saved = [f["hand_h"] * 60 - f["arch_min"] for f in paired]
    on = {}
    for f in facts:
        for k, v in f["arch_on"].items():
            on[k] = on.get(k, 0) + v
    costs = [f["cost"] for f in facts if f["cost"] is not None]
    return {
        "items": n, "first": first, "accepted": clean, "remarks": remarks,
        "questions": sum(f["questions"] for f in facts) / n if n else 0, "previews": sum(f["previews"] for f in facts) / n if n else 0,
        "briefs": sum(f["brief_changed"] for f in facts), "agent_min": median([f["agent_min"] for f in facts]),
        "arch_min": median([f["arch_min"] for f in facts]), "arch_on": on, "hand_min": median([f["hand_h"] * 60 for f in paired]) if paired else None,
        "saved_min": median(saved), "saved_n": len(paired), "saved_total_min": sum(saved) if saved else None,
        "late": sum(f["hand_late"] for f in facts), "no_arch": sum(f["arch_min"] is None for f in facts),
        "no_hand": sum(f["hand_h"] is None and not f["hand_late"] for f in facts),
        "tokens": median([f["tokens"] for f in facts]), "cost": median(costs) if costs else None,
        "caught": dict(sorted(caught.items(), key=lambda x: -x[1])),
        "agents": [{"agent": k[0], "model": k[1], "items": r["items"], "sent": r["sent"], "rate": r["rate"]} for k, r in sorted(rows.items())],
        "models": models_compared(rows),
    }


def verdict(sm):
    if sm["items"] < MIN or sm["saved_n"] < MIN:
        return "thin", max(sm["items"], 0) if sm["items"] < MIN else sm["saved_n"]
    return ("good" if sm["saved_min"] > 0 else "bad"), None


def build(j, routes, state_fn, route=None, prices=None):
    ev = j.events()
    items = [e["item"] for e in ev if e["type"] == "open"]
    states = [state_fn(j, routes, item=i, events=ev) for i in items]
    closed = [s for s in states if s and s["closed"] and (route is None or s["route"] == route)]
    by = {}
    for s in closed:
        by.setdefault(s["route"], []).append(s)
    out = {"schema": "flow-efficiency/1", "routes": {}, "items": []}
    for r, ss in sorted(by.items()):
        facts = [item_facts(s, ev, prices) for s in ss]
        out["items"] += facts
        out["routes"][r] = summarize(facts, agent_rows(ss, ev))
    if len(by) > 1:
        out["all"] = summarize(out["items"], agent_rows(closed, ev))
    return out


def hm(m, t):
    if m is None:
        return t["unknown"]
    sign = "-" if m < 0 else ""
    m = abs(m)
    return "%s%d %s" % (sign, round(m), t["min"]) if m < 90 else "%s%.1f %s" % (sign, m / 60.0, t["h"])


def pct(r):
    if not r or r["p"] is None:
        return "-"
    return "%d%% (%d/%d, 80%%: %d-%d%%)" % (round(100 * r["p"]), r["k"], r["n"], round(100 * r["lo"]), round(100 * r["hi"]))


def lines(sm, t, name):
    out = ["== %s: %s  (%s %d)" % (t["route"], name, t["items"], sm["items"])]
    v, need = verdict(sm)
    out.append("  %-34s %s" % (t["verdict"], t["verdict_thin"] % (need, MIN) if v == "thin" else
                                t["verdict_good"] % (hm(sm["saved_min"], t), pct(sm["first"]).split(" ")[0]) if v == "good" else t["verdict_bad"]))
    out.append("  %-34s %s" % (t["first"], pct(sm["first"])))
    out.append("  %-34s %s  (%s %d)" % (t["accepted"], pct(sm["accepted"]), t["judged"], sm["accepted"]["n"]))
    out.append("  %-34s %s %d · %s %d · %s %d" % (t["remarks"], t["agent"], sm["remarks"].get("agent", 0), t["brief"], sm["remarks"].get("brief", 0), t["taste"], sm["remarks"].get("taste", 0)))
    out.append("  %-34s %.1f    %s %.1f    %s %d" % (t["questions"], sm["questions"], t["previews"], sm["previews"], t["briefs"], sm["briefs"]))
    on = "  (" + ", ".join("%s %s" % (t["on"].get(k, k), hm(v / max(1, sm["items"] - sm["no_arch"]), t)) for k, v in sm["arch_on"].items()) + ")" if sm["arch_on"] else ""
    out.append("  %-34s %s%s" % (t["arch"], hm(sm["arch_min"], t), on))
    out.append("  %-34s %s" % (t["hand"], hm(sm["hand_min"], t)))
    out.append("  %-34s %s%s" % (t["saved"], hm(sm["saved_min"], t), "  (n=%d, Σ %s)" % (sm["saved_n"], hm(sm["saved_total_min"], t)) if sm["saved_n"] else ""))
    out.append("  %-34s %s" % (t["agent_time"], hm(sm["agent_min"], t)))
    out.append("  %-34s %s%s" % (t["tokens"], "%d" % sm["tokens"] if sm["tokens"] is not None else "-", "    %s %.2f" % (t["cost"], sm["cost"]) if sm["cost"] is not None else ""))
    if sm["caught"]:
        out.append("  %-34s %s" % (t["caught"], ", ".join("%s ×%d" % kv for kv in list(sm["caught"].items())[:6])))
    if sm["no_arch"]:
        out.append("  ! %d: %s" % (sm["no_arch"], t["noarch"]))
    if sm["no_hand"]:
        out.append("  ! %d: %s" % (sm["no_hand"], t["nohand"]))
    if sm["late"]:
        out.append("  ! " + t["late"] % sm["late"])
    if sm["agents"]:
        out.append("  " + t["agents"])
        for r in sm["agents"]:
            word = (t["nodata"] % MIN if r["items"] < MIN else t["reliable"] if r["rate"]["hi"] <= 0.3 else
                    t["raise"] if r["rate"]["lo"] > 0.3 else t["watch"])
            out.append("    %-20s %-7s %s %s -> %s" % (r["agent"], r["model"], t["sent"], pct(r["rate"]), word))
    if sm["models"]:
        out.append("  " + t["models"])
        for m in sm["models"]:
            worse = m["b"] if m["better"] == m["a"] else m["a"]
            out.append("    %-20s %s / %s: %s" % (m["agent"], m["a"], m["b"], t["nodata"] % MIN if m["thin"] else
                                                   t["better"] % (m["better"], worse) if m["better"] else t["noconcl"]))
    return out


def render(rep, lang="en"):
    t = T.get(lang, T["en"])
    if not rep["routes"]:
        return t["none"]
    out = ["%s" % t["title"]]
    for r, sm in rep["routes"].items():
        out += lines(sm, t, r)
    if "all" in rep:
        out += lines(rep["all"], t, "*")
    out.append(t["foot"])
    return "\n".join(out)


def render_html(rep, lang="en"):
    t = T.get(lang, T["en"])
    e = html.escape
    body = []
    groups = list(rep["routes"].items()) + ([("*", rep["all"])] if "all" in rep else [])
    for name, sm in groups:
        v, need = verdict(sm)
        cls = {"good": "ok", "bad": "bad", "thin": "thin"}[v]
        vt = t["verdict_thin"] % (need, MIN) if v == "thin" else t["verdict_good"] % (hm(sm["saved_min"], t), pct(sm["first"]).split(" ")[0]) if v == "good" else t["verdict_bad"]
        rows = [(t["first"], pct(sm["first"])), (t["accepted"], pct(sm["accepted"])),
                (t["arch"], hm(sm["arch_min"], t)), (t["hand"], hm(sm["hand_min"], t)), (t["saved"], hm(sm["saved_min"], t)),
                (t["agent_time"], hm(sm["agent_min"], t)), (t["questions"], "%.1f" % sm["questions"]), (t["previews"], "%.1f" % sm["previews"]),
                (t["remarks"], "%s %d · %s %d · %s %d" % (t["agent"], sm["remarks"].get("agent", 0), t["brief"], sm["remarks"].get("brief", 0), t["taste"], sm["remarks"].get("taste", 0))),
                (t["tokens"], "%d" % sm["tokens"] if sm["tokens"] is not None else "-")]
        if sm["cost"] is not None:
            rows.append((t["cost"], "%.2f" % sm["cost"]))
        if sm["caught"]:
            rows.append((t["caught"], ", ".join("%s ×%d" % kv for kv in sm["caught"].items())))
        agents = "".join("<tr><td>%s</td><td>%s</td><td>%s</td></tr>" % (e(r["agent"]), e(r["model"]), e(pct(r["rate"]))) for r in sm["agents"])
        body.append('<section><h2>%s: %s <small>%s %d</small></h2><p class="v %s">%s</p><table>%s</table>%s</section>' % (
            e(t["route"]), e(name), e(t["items"]), sm["items"], cls, e(vt),
            "".join("<tr><th>%s</th><td>%s</td></tr>" % (e(k), e(v)) for k, v in rows),
            '<h3>%s</h3><table class="a">%s</table>' % (e(t["agents"]), agents) if agents else ""))
    if not groups:
        body.append("<p>%s</p>" % e(t["none"]))
    return """<!doctype html><html lang="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title><style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--mut:#6b6a66;--line:#e3e0d8;--ok:#2f7d4f;--bad:#b3412f;--thin:#8a6d1d}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a18;--fg:#eeece6;--mut:#a5a39c;--line:#3a3935;--ok:#6fc18f;--bad:#e27d6b;--thin:#d9b75a}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:24px 16px}
h1{font-size:22px}h2{font-size:18px;margin-top:32px}small{color:var(--mut);font-weight:400}
table{border-collapse:collapse;width:100%%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:500;color:var(--mut);width:45%%}.v{font-weight:600}.v.ok{color:var(--ok)}.v.bad{color:var(--bad)}.v.thin{color:var(--thin)}
footer{color:var(--mut);margin-top:32px;font-size:13px}</style></head><body><h1>%s</h1>%s<footer>%s</footer></body></html>""" % (
        e(lang), e(t["title"]), e(t["title"]), "".join(body), e(t["foot"]))


def cmd_efficiency(j, routes, state_fn, a, project):
    prices = (project or {}).get("prices") or None
    rep = build(j, routes, state_fn, route=a.route, prices=prices)
    if a.json:
        return json.dumps(rep, indent=1, ensure_ascii=False)
    if a.html:
        with open(a.html, "w", encoding="utf-8") as f:
            f.write(render_html(rep, a.lang))
        return "written: %s" % a.html
    return render(rep, a.lang)


def add_parsers(sub):
    p = sub.add_parser("hand", help="how long the work takes the office by hand - before the agents start")
    p.add_argument("item"); p.add_argument("--hours", type=float, required=True); p.add_argument("--by", required=True)
    p = sub.add_parser("spent", help="the architect's own time on an item")
    p.add_argument("item"); p.add_argument("--minutes", type=int, required=True); p.add_argument("--on", choices=ON, default="other"); p.add_argument("--by")
    p = sub.add_parser("efficiency", help="is the agent team worth it, per task type")
    p.add_argument("--route"); p.add_argument("--lang", default="en", choices=sorted(T)); p.add_argument("--html"); p.add_argument("--json", action="store_true")


def dispatch(j, routes, state_fn, a, project_path):
    if a.cmd == "hand":
        return record_hand(j, a)
    if a.cmd == "spent":
        return record_spent(j, a)
    if a.cmd == "efficiency":
        project = {}
        if os.path.exists(project_path):
            with open(project_path, encoding="utf-8") as f:
                project = json.load(f)
        return cmd_efficiency(j, routes, state_fn, a, project), 0
    return None
