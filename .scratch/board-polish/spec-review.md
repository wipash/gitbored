# Spec review

Scope: changes from `cf0e37f` through `7c22bfd`, plus the working implementation of colours, merged Settings, and card-anchored details. Reviewed against `.scratch/board-polish/spec.md`. Bounded to requested behaviour and concrete regressions; no redesign or refactor recommendations.

## Findings

No outstanding spec findings.

One blocker was found and corrected during review: base `.workspace-card` styles overrode manual fills and split-label accents because the colour stylesheet loaded first. The more specific selector at `src/client/workspace/cardColours.css:1` fixes it. Chromium initially computed `backgroundImage: none`, a white background, and a 1px grey border despite supplied colours. Rechecking the updated source styles computed the intended tinted background, split gradient, and transparent 5px top border.

Settings consolidation, board-persisted manual colours, reversible overlays, editable category colours, and camera-relative popup positioning match the recorded assumptions. Source review found no additional actionable regression. Popup chrome-clearance adjustments made after this review remain covered by the implementation agent's pending focused checks.

## Boundary

This was the spec axis only, not the independent standards axis or an exhaustive accessibility review. Browser evidence above covers the colour cascade; parent/team checks cover complete popup interactions, narrow viewports, native history, and integrated application behaviour. No full gate was run by this reviewer.
