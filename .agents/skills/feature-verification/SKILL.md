---
name: feature-verification
description: Keep OpenSmash's feature verification map accurate when changing gameplay, controls, roster policy, preparation, rooms or deployment behavior, and when reconciling test evidence.
---

# Maintain feature verification

Read [the feature map](../../../docs/feature-verification.md) from the repository
root (`docs/feature-verification.md`). It owns coverage and evidence classification;
existing tests and proof tools own execution. Do not create a parallel framework.

When changing a feature:

1. Identify the affected row, user-visible contract and changed ownership boundary.
   Follow its test links; inspect assertions before treating a pass as proof.
2. Choose the smallest relevant regression set. Add actual browser/game evidence
   when input acquisition, rendered progress, results, cache restore or session
   cleanup cannot be established by fixtures. Report unavailable environments.
3. Update that row and its evidence checkpoint with exact source/runtime revision,
   UTC date, environment, repeatable command or steps, observed result and limits.
   Separate automated regression, browser evidence, user feedback and unrun work.
   Keep skipped/failed checks visible. Preserve ancestor results at their own SHA.
4. Keep personal identities, source hashes/assets, accepted per-person donor pairs,
   screenshots and private host configuration in `alex-furrier/opensmash-characters`.
   Hand off specific private updates to its owner; do not copy them into this fork.
5. Check relative links, command paths and `git diff --check`. In the PR, name the
   changed coverage, checks run and remaining gaps. Documentation-only edits need
   these source checks, not unrelated GPU runs, full generation or paid work.

Do not promote a local scripted peer to WAN proof, a synthetic pad to physical
multi-controller proof, selected-state parity to rollback/full-state proof, or
an application-message fault over TCP to transport packet loss. Build success
does not establish the served revision. Network/deployment changes and private
storage migration require their own authorized scope and targeted acceptance.
