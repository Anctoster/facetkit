# Security

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository ("Security" → "Report a vulnerability"). You should receive an answer within seven days.

## Threat model

facetkit records what agents did and decides whether the record shows the work was done. Its guarantees are only as useful as the attacker they are meant for, so they are stated against four sources of harm and one that is out of scope.

| Source | Example | What facetkit does about it |
|---|---|---|
| **A. An agent that errs** | passes the wrong item id, runs the wrong check, lists files it did not change | Refuses malformed steps and handoffs; checks run by the tool, not reported by the agent, decide a verdict |
| **B. An agent that games the record** | writes "OK" without running the check, edits a line of the journal, weakens a test, approves its own brief | Hash-chained journal, signatures where keys exist, re-runs by a witness, proofs that go stale when the sources change, roles that may not judge their own work |
| **C. Foreign content** | a task text, a file from another party or a web page containing text that reads as an instruction to the agent | `facet scan` flags known patterns; agents are told that source content is data, not instructions. A filter, not a guarantee |
| **D. Accidents** | two sessions writing at once, a killed process, a half-written line | Journal locks with fencing epochs; a line cut off by a killed writer is detected and set aside by an explicit `facet journal repair`, never repaired silently |

**Out of scope: whoever controls the machine or the repository.** A person or process that can rewrite every file, holds the private keys and can force-push the branch can produce any record. facetkit makes such rewriting visible where something outside that control exists — a signature by a key held elsewhere, a commit others have pulled, a witness run in CI — and does not claim more.

Also out of scope: the operating system, the model provider, and the dependencies of the project facetkit runs in.

## What each guarantee rests on

| Guarantee | Against | Rests on | Does not hold if |
|---|---|---|---|
| The journal shows edits | A, B, D | each event's id is a hash of its content; each event names the one before it | the person editing can recompute the chain — an unsigned journal shows careless edits, not deliberate ones. Sign events (`govern.signEvents`) and commit the journal |
| A signed record is attributable | B | Ed25519 signatures by keys listed in `.facet/trust.json` with a role | the private key leaks, or `trust.json` itself is changed without review |
| A proof pack matches the sources | A, B | the pack's digest covers the evidence and the hashes of the files it is about; any change to them makes it STALE | the files that matter are outside the pack's scope |
| A witness reproduced the checks | A, B | a second run of the same checks on the same sources | the witness runs on the same machine, with the same environment and the same key as the author — then it shows repeatability, not independence. Treat a witness record as a claim until it is signed by a key in the `witness` role |
| Steps of one item do not overwrite each other | D | locks with an owner and a fencing epoch | a process ignores the lock and writes the file directly |
| `facet scan` finds secrets and injected text | B, C | patterns | the secret or the instruction does not match a pattern, or the file was not read. Absence of findings is not absence of risk |

Anything not in this table is not a guarantee, however it is worded elsewhere.

## What facetkit does and does not do

- It runs **your** commands (`facet run`, `facet check`, `facet eval judge`, the test command of `facet mutate`). It adds no sandbox: anything those commands can do, they can do. Run agents and their commands with the permissions you would give a new colleague on their first day.
- `facet mutate` and `facet canary` change source files temporarily and restore them. If the process is killed in between, restore with `git checkout -- <file>` (and `facet canary reveal` for a planted canary).
- `facet scan` is a set of patterns. It finds common secrets, dangerous commands and injected instructions; it does not prove their absence. Keep your usual secret scanning.
- The journal, the memory store and attestations are plain text meant to be committed. They contain file names, command lines and notes written by agents. **Review them before making a repository public.** `facet scan` checks the text stores agents read for injected instructions, but nothing stops a person from writing a secret into a note.
- An attestation (`facet attest`) is a digest, not a signature. A **proof pack** (`facet proof create`) is signed when this machine has a key (`facet key new`) and is verified against the keys the project trusts in `.facet/trust.json`. Keep private keys out of repositories (`~/.facet/keys`, mode 600, or `FACET_KEY`); a signature makes a record attributable, not true — a leaked key signs anything, so remove it from `trust.json` in a reviewed commit. Journal events are signed only with `govern.signEvents`. Sign commits or attestation files with your own tooling if you need that.
- Transcripts imported by `facet cost import` are read for token counts only; their content is not stored.
