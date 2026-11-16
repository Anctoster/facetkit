---
id: contract-pin
phase: [red]
bounds: contracts=3
guards: [seam-break]
ablatable: replay
---
# One shared example pins both sides of a seam

Do: Where data crosses a seam — a function signature, a route, an event payload, a stored row, a file format — put one example of that data in a fixture that both tests import. The producer's test asserts it produces the example; the consumer's test asserts it accepts the example. Neither side keeps a private copy of the shape. Changing the shape must turn both tests red.

Check: The fixture is imported by at least two test files, one on each side; renaming one of its fields makes both fail.

Stop: 3 contracts per slice. Choose the seams with the most consumers; name the unpinned ones.

Why: Two sides each tested against their own mock agree with themselves, not with each other.
