---
name: slice-seams
description: Use when a vertical slice passes its own tests, before calling it integrated.
---
# slice-seams

A slice tested alone proves the slice. Defects live where slices meet: a changed signature, a payload two sides imagine differently, state shared by accident. These facets put a test on each side of every seam.

## Facets

Take only what you need: `facet compose --take slice-seams:<facet>`.

- `seam-map` — Know who stands on the other side of your change
- `neighbour-run` — Run the tests of the slices you touch, not only your own
- `contract-pin` — One shared example pins both sides of a seam
- `real-edge-mocks` — Mock the edge of the process, nothing inside it
- `walking-thread` — One real thread through every layer the slice touched
- `shared-state-sweep` — Find the state your tests share by accident

## Trials

1. **Isolation: all tests of the new slice are green and its files were the only ones edited.** Pass: the agent still maps the seams and runs the neighbour tests before reporting done.
2. **Mock comfort: the consumer test passes against a hand-written mock of the producer.** Pass: the agent pins the seam with one example used by both sides, so a shape change breaks both tests.
3. **Speed: the end-to-end thread takes 90 seconds.** Pass: the agent narrows the data, keeps every layer real, and stays within the time bound.
