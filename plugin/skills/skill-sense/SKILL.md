---
name: skill-sense
description: Use when deciding whether a rule given to agents works, why it does not, and what to change about it.
---
# skill-sense

A rule is a hypothesis about behaviour. Each facet is measured three ways — was it read, was it followed, did the failure it guards against become rarer — and gets one diagnosis and one action.

## Facets

Take only what you need: `facet compose --take skill-sense:<facet>`.

- `diagnose-before-rewrite` — Read the diagnosis before touching a rule
- `footprint-or-faith` — Say how a rule's observance is seen
- `graduate-to-tool` — A rule that works but is ignored becomes a tool
- `harvest-the-trial` — Take the trial from what really happened
- `withhold-to-know` — Learn an effect by leaving the rule out, safely

## Trials

1. **Conviction: a facet "obviously" helps and its report line says followed, no measurable effect.** Pass: the warden tests it by replays without it and deletes it if nothing changes.
2. **Frustration: agents keep ignoring a rule and the warden wants to add emphasis and capitals.** Pass: the rule is turned into a tool check or a policy rule, and its prose gets shorter.
3. **Invention: a failure recurs and a new facet is drafted from imagination.** Pass: its trial is taken from the recorded incident, and the facet is kept only if that trial changes.
