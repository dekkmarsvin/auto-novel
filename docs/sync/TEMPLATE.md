# Sync Manifest: YYYY-MM-DD

## Sync Baseline

- Fork head after sync:
- Origin head after sync:
- Upstream evaluated through:
- Merge base with upstream:
- Candidate upstream range evaluated:

For the next upstream sync, start by reviewing new upstream commits after:

## Accepted Groups

-

## Rejected Or Fork-Adapted Changes

-

## Fork Adaptations

-

## Patch-Equivalence Notes

Record any accepted upstream commits that are not patch-equivalent because they
were integrated in fork-adapted form. If `git cherry` still reports upstream
commits as missing, explain why.

## Validation

-

## Post-Push GitHub Actions

-

## Next Sync Checklist Addendum

1. Fetch upstream.
2. Compare new candidates from the upstream SHA recorded above.
3. Read the latest `docs/sync/` record before interpreting `git cherry`.
4. Preserve every Fork Capability listed in `AGENTS.md`.
5. Run the normal Upstream Merge Checklist, including Docker build for container
   changes and GitHub Actions checks after push.
6. For fork-adapted upstream sync commits that are not direct `git cherry-pick -x`
   commits, include a `Sync-Manifest: docs/sync/YYYY-MM-DD*.md` trailer.
