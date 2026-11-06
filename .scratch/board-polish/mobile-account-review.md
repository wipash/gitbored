# Account controls in Settings

Scope: theme selection, account identity, sign-out and account recovery in the shared Settings surface; standalone Settings on sign-in, Boards and recovery screens. Root owns mobile toolbar layout and its browser tests. Existing better-interface and all six owning skills were applied to this bounded flow.

Implementation: `AccountSettingsContext` supplies the same content to one visible host. Native workspace registration uses a stable callback and a layout effect; native account content waits for registration so IDs and focus refs are not duplicated. Account changes still key the Boards subtree by user ID. Dirty sign-out still uses browser leave protection and retains a blocked local draft when staying. Only blocked checks, reauthorization or action errors autoopen Settings; successful session checks preserve the current workspace panel.

## Source review

No actionable source findings remain in the account flow. Native theme select, buttons and links retain their names and existing recovery copy. The existing destructive board dialog is unchanged. No animations or palette values added. Settings remains non-modal. Standalone Escape closes and returns focus; the canvas uses the existing native UI key boundary.

Validation at commit: lint passed; application type-check passed. Root and the test agent coordinate focused authentication/session/browser verification; no duplicate full gate was run here.

## Interface coverage

| Domain | Evidence | Result |
| --- | --- | --- |
| Accessibility | Source names, label binding, Escape/focus return, single settings host | Clear in source; runtime verification pending integration |
| Layout | Source removes all lower-edge account controls | Root owns mobile screenshots |
| Writing | Existing recovery and sign-out copy retained | Clear |
| Typography | Existing type system inherited; root mobile input sizes | Root owns rendered verification |
| Colors | Existing semantic theme tokens; no new colors | Clear in source |
| UI | Non-modal settings, no motion added, stable editor ownership | Clear in source; runtime verification pending integration |

No new screen-reader, iOS or RTL claims are made.
