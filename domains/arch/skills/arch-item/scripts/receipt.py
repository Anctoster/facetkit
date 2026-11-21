"""receipt - a tool signs what it measured: which tool, which version of it, on which inputs.
The journal accepts a result only with a receipt whose tool is the one shipped with the plugin (or a
registered project script): an "OK" typed by hand, or written by an edited copy of a tool, is refused.
A receipt proves which code produced the file and that the file was not edited by hand afterwards. It does
not prove the code is right - tests do that - and it is not a signature: whoever sets out to forge one can.
What stops that is an independent re-run of the checks, not this file."""
import hashlib, json, os, sys, time


def body_sha(results):
    """The hash of the results themselves: a file edited after the tool wrote it no longer matches its receipt."""
    body = {k: v for k, v in results.items() if k != "_receipt"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def sha_of(path):
    """SHA-256 of a file's content with line ends normalised, so that a copy on Windows hashes the same."""
    with open(path, "rb") as f:
        return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()


def stamp(results, tool_file, inputs=None):
    """Return `results` with a `_receipt`. Inputs default to every command-line argument that is a file."""
    files = inputs if inputs is not None else [a for a in sys.argv[1:] if os.path.isfile(a)]
    out = dict(results)
    out = json.loads(json.dumps(out, ensure_ascii=False))  # as it will be read back: tuples are lists, keys are text
    out["_receipt"] = {"tool": os.path.basename(tool_file), "tool_sha": sha_of(tool_file), "results_sha": body_sha(out),
                       "inputs": {os.path.basename(p): sha_of(p) for p in files if os.path.isfile(p)},
                       "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    return out
