# Running the tools

**Blender scripts** (`blender/*.py`) run inside the open Blender through its code-execution tool. Send only this launcher - never the script text:

```python
VIZ_ARGS = {"out": r"<viz_dir>\work\<ITEM>\checks.json", "terrain": "<terrain_pattern>", "height_limit": <height_limit_m>, "designed": "<designed_pattern>"}
exec(compile(open(r"<viz_dir>\tools\blender\scene_checks.py", encoding="utf-8").read(), "scene_checks.py", "exec"))
print(VIZ_DIGEST)
```

The digest is printed and also left in `VIZ_DIGEST`; each check's status is in `VIZ_RESULTS` and in the `out` file, which `vizflow.py evidence --from` reads. The bundled scripts are read-only: they do not change or save the scene.

`stage_checks.py` runs only the groups it is given parameters for (`export`, `junction`, `environment`, `materials`, `cameras`, `render`) and needs `"tools": r"<viz_dir>\tools\blender"` to find `vizcore.py`; its docstring lists every parameter. A group without its parameters reports SKIP, and SKIP does not pass.

`selftest_blender.py` is the only script that builds anything, and it does so in its own background Blender: `blender --background --factory-startup --python selftest_blender.py`. Never run it in the open project.

**Image tools** (`img_digest.py`, `contact_sheet.py`, `web_pack.py`) need Python with Pillow. Run them where the images are if that computer has it; otherwise bring the images into the session workspace in batches and run them there. Each prints its usage with `-h`.

**Journal** (`vizflow.py`) needs only Python 3.8+. `vizflow.py -h` lists the commands.

Exit codes everywhere: 0 ok, 1 a check failed or the command was refused, 3 a cap is spent or a loop was detected - stop and report BLOCKED.
