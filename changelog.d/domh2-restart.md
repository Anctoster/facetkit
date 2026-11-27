### Fixed
- **H2 in the domains is measured from the step's first start in the item.** Ending a step BLOCKED and starting it again re-took the hash of the check files with the change already in them, so a loosened threshold passed without anyone's approval.
- **An approval of changed checks covers the state the person saw.** `approve-checks` records the hash of the check files; it survives restarts of the step and stops covering as soon as the files change again (before, it covered any later change in the same step). Approvals written by earlier versions keep their old meaning.
