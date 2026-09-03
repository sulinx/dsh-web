# Agent Note: Sidebar Entry Placement on Nested Shells

Status: implemented

## Problem

The shared sidebar entry core (`shared/client/sidebar-entry-core.ts`) places
the plugin entry row by calling `root.insertBefore(entry, anchor)`, where
`root` is the sidebar root the New Session button's logo row owns and `anchor`
is the button's `nextElementSibling` (or a family block sibling). That assumes
the New Session button and its following siblings are direct children of the
root. The tauri panel desktop shell nests the button one level deeper
(`root > panelArea > [newSession, panel actions]`), so the resolved anchor is a
child of `panelArea`, not of the root: `insertBefore` throws a DOM
`NotFoundError`, `mountSidebarEntry` propagates it, the board view never
mounts, and the task board sidebar entry silently stays absent on that shell.

## Decision

`placeEntry` now resolves the insertion container from the base row itself
(`base.parentElement`), falling back to the root, and inserts on that
container. Classic shells keep the button as a direct child of the root, so
the container equals the root and behavior is unchanged. Nested shells insert
into the intermediate actions container that actually owns the button and its
next sibling. The family-positioning logic now scans `container.children`
instead of `root.children` so sibling-plugin entries stay ordered in both
layouts. A placement failure returns `false` instead of throwing, so a
mismatched shell never tears down the whole mount; the observer retries on the
next shell mutation.

The change ships through the shared source and its synced copies
(`node scripts/sync-shared.mjs`) to `dsh-ssh`, `dsh-task-board`, and
`dsh-skill-explorer`. A regression test
(`packages/dsh-task-board/tests/sidebar-entry-nested-shell.spec.ts`) reproduces
the nested layout with a DOM-mirroring fake whose `insertBefore` throws when
the anchor is not a child, and covers the classic direct-child layout too.

## Alternatives considered

- Detect the wrapper by walking up from the button and special-casing the
  tauri panel classes. Rejected: fragile class coupling across shells; the
  parentElement container is layout-agnostic and keeps classic behavior
  verbatim.
- Keep inserting on the root but wrap the call in try/catch. Rejected: the
  entry would never appear on nested shells; catching would only silence the
  failure.
- Append to the end of the sidebar as a fallback. Rejected: it would randomly
  reorder the entry block after shell re-renders, contradicting the existing
  no-append-to-end rationale.

## Consequences

The task board sidebar entry (and any sibling plugin sharing the core) now
mounts between the New Session row and the panel actions on the tauri panel
desktop shell as well as on classic dsh-web shells. Runtime verification:
patched the client bundle on a desktop-profile deployment, refreshed the GUI,
and confirmed the entry appears and opens the board against the live Host
ledger.

## Testing

`pnpm --filter @linxin666/dsh-client-ui-task-board test` (316 passed),
`pnpm --filter @linxin666/dsh-client-ui-task-board typecheck`, and root
`pnpm typecheck` pass with the new regression spec included.
