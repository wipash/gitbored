# tldraw keyboard patch review (useKeyboardShortcuts)

Scope: `patches/tldraw@5.6.0.patch` and the installed `src/lib/ui/hooks/useKeyboardShortcuts.ts` (pnpm patch hash `50473daf…`), compared with checkpoint `94af19e`. The editor-package patch (`@tldraw__editor@5.6.0.patch`, `useDocumentEvents`) is byte-identical to the checkpoint and was read only for interplay. `dist-cjs` and `dist-esm` carry the same logic as `src`. No edits made.

## What changed since the checkpoint

1. `heldKeyRegistrations` moved from a local inside the `isFocused`/`actions`/`tools` effect to `useMemo(() => new Map(), [editor])` and was added to the effect's dependency list.
2. `handleKeyDown` gained an early path: on `e.repeat`, if the physical code has an accepted registration, only that registration may fire, and only when one of its parsed shortcuts still matches the current modifiers; otherwise the repeat is swallowed. The old loop still handles fresh presses and repeats with no accepted registration.
3. (Already at checkpoint) `handleKeyUp` fires only the registration that accepted the press and no longer consults `shouldSkipEvent`; Comma's release no longer checks `areShortcutsDisabled`; the registration is recorded on every accepted press, not only on non-repeat presses.

## Lifecycle and repeat correctness

- **Effect re-runs no longer lose a held press.** Any dependency change (`actions`, `tools`, `isReadonlyMode`, `isFocused`, `commentingEnabled`) rebuilds the registry and re-attaches body listeners, but the accepted entry for the held code survives, so the release still reaches Comma's `onKeyUp` (`inputs.keys.delete('Comma')` + `pointer_up`). At the checkpoint the Map was recreated on every re-run; with the keyup handler already restricted to held entries, a re-run mid-hold dropped the release. That is the defect the test reproduced, and the change closes it.
- **Editor swap resets state correctly.** A new `editor` yields a new Map; stale entries from the previous editor cannot fire against the new one.
- **Repeat gating is sound.** A repeat with an accepted registration fires that registration only while its modifiers still match (`held.parsed.some(matchesEvent)`), so releasing or adding Shift during a held Comma stops the gesture's repeats without letting a neighbouring shortcut start. A repeat with no accepted entry (press started while unfocused or in a text field) still falls through to the loop, as before. A fresh press always replaces the entry, which keeps the macOS cmd+z then cmd+shift+z case working.
- **Interplay with `useNativeUiKeys`.** The app's capture-phase handler stops propagation of keydowns whose target is inside `[data-native-ui]`, so repeats over a panel never reach this hook; keyups propagate unless the press started inside the UI. A press accepted on the canvas and released over the Find button therefore reaches `handleKeyUp` with its held entry intact, which is the path the test exercises.
- **Release while a menu is open or focus sits in a text input** now completes the Comma gesture (both `areShortcutsDisabled` and `shouldSkipEvent` were removed from the keyup path). Only Comma registers an `onKeyUp`, so no other shortcut gains keyup behaviour.

## Findings

| Severity | Location | Issue | Suggestion |
| --- | --- | --- | --- |
| LOW | `useKeyboardShortcuts.ts:153-158` | Keyup has no fallback when the Map lacks an entry. If the hook instance remounts for the same editor, or React discards the `useMemo` value, a Comma press that already dispatched `pointer_down` can never dispatch `pointer_up` (the checkpoint's registry loop would still have matched it). Not reachable in this app's current composition (`components` and `getShapeVisibility` are stable), but the new design is strictly less forgiving here. | When no held entry exists, fall back to the registry loop for `onKeyUp`; Comma's handler already self-guards with `inputs.keys.has('Comma')`, so the fallback cannot double-fire. Alternatively hold the Map in `useRef`/`useState` keyed by editor so persistence is guaranteed rather than cached. |
| LOW | `useKeyboardShortcuts.ts:123-127` | After a registry rebuild, repeats of a still-held key call the closure from the previous registry (previous `action`/`tool` object and helpers). Harmless for Comma and for tools, and the entry is replaced on the next fresh press, but a stale `action.onSelect` can read outdated helper context for the duration of the hold. | Acceptable as is; if it matters, re-resolve the held entry to the current registry by parsed-key equality when the effect re-runs. |

## Regression check

I found no material regression. Every behaviour reachable at the checkpoint is preserved or made more robust: fresh presses, modifier-changed repeats, same-registration repeats (`=` zoom), swallowed keyups on macOS cmd combinations, and release over UI or with a menu open. The one behavioural narrowing (keyup only fires the accepted registration) was already present at the checkpoint; the new code only makes its state survive effect re-runs.

## Verification

- Read: current patch, checkpoint patch (`git show 94af19e:patches/tldraw@5.6.0.patch`), installed `src`, `dist-esm` and `dist-cjs` hooks, the editor patch, `src/client/workspace/useNativeUiKeys.ts`, `tests/e2e/board-keyboard.spec.ts`.
- `git diff --stat 94af19e -- patches/ package.json pnpm-lock.yaml`: only the tldraw patch and its lockfile hash changed.
- Not run by me: `tests/e2e/board-keyboard.spec.ts` (shared production runner lock); I rely on the reported fail-then-pass.
