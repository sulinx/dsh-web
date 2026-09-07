# Agent Note: Sidebar entry injection on the 0.1.3 BEM shell

Status: implemented

## Problem

The harness 0.1.3-alpha.1 tauri shell rewrote the GUI sidebar DOM. The sidebar
column keeps a hashed css-module class (still matched by
`[class*="sidebarCol"]`), but the inner blocks moved from camelCase
css-module classes to BEM classes: the New Session button is now
`button.dshp-panel__new-session` nested inside a `dshp-panel__panel-area`
block, and the logo row is a `dshp-panel__logo-row` sibling block. The shared
`sidebar-entry-core.ts` (consumer packages dsh-task-board, dsh-skill-explorer,
dsh-ssh) located the anchor with `button[class*="newSession"]` and assumed the
sidebar root was the insertion container. On the 0.1.3 shell both assumptions
failed: the anchor query matched nothing, so `placeEntry` silently no-oped and
the plugin sidebar entries disappeared; and even with a found anchor,
`root.insertBefore(entry, anchor)` would have thrown NotFoundError because the
anchor's parent (the panel-area block) is not the sidebar root. The skin-center
semantic adapter's new-session rule (`SEMANTIC_RULES_V1`) carried the same
single-generation selector, so it stopped stamping
`data-dsh-part="new-session"` on 0.1.3 shells, which skins use as their stable
anchor.

## Decision

Keep both shell class generations addressable. In
`shared/client/sidebar-entry-core.ts`:

1. `newSessionButton`'s anchor query is now
   `button[class*="newSession"], button[class*="new-session"]`, matching the
   0.1.2 camelCase css-module classes and the 0.1.3 BEM class.
2. `placeEntry` resolves the insertion host from the anchor's actual DOM
   position instead of assuming the sidebar root: it finds the logo row through
   `button.closest('[class*="logoRow"], [class*="logo-row"]')`, takes the row
   when it is a direct child of the root (legacy geometry), otherwise takes the
   button itself, and inserts into that base's `parentElement`. Legacy shells
   resolve the host to the sidebar root, so their behavior is unchanged; on the
   0.1.3 shell the host is the panel-area block and the entry lands directly
   after the New Session row. The family-anchor scan and the no-append-to-end
   rule now run over the host's children.
3. `packages/skins/skin-center/src/client/runtime/semantic-adapter.ts` extends
   the new-session rule to
   `button[class*="newSession"], button[class*="new-session"]`.

The package copies of `sidebar-entry-core.ts` are regenerated with
`node scripts/sync-shared.mjs` (verified clean with `--check`).

## Testing

`shared/tests/sidebar-entry-core.spec.ts` extends the FakeElement stub with a
class-needle `querySelector` and a parent-walking `closest`, and adds a
regression case with the real 0.1.3 geometry (sidebar column > panel root >
panel-area > BEM new-session button) asserting the entry lands in the button's
parent host, after the button, with the panel root untouched.
`packages/skins/skin-center/tests/skin-runtime.spec.ts` adds a jsdom case that
stamps `data-dsh-part="new-session"` on both class generations in one document.

## Alternatives considered

Wait for the upstream shell to stabilize the sidebar class names. The shell
renamed the classes inside the 0.1.3-alpha.1 pre-release, while the plugins
already shipped against the 0.1.2 generation; a shell-side fix would leave every
installed plugin broken until a new harness release, and a plugin cannot gate
on the harness version at mount time. Dual-generation selectors cost one comma
per selector.

Re-derive the anchor from the new BEM classes only. Dropping the camelCase
selectors would break every shell of the previous generation still in the field
(0.1.2 rc.x profiles), and the css-module hashing makes the old classes fragile
but still the only stable substring across 0.1.2 builds.

## Consequences

Plugin sidebar entries and skin semantic anchors work on both the 0.1.2
camelCase css-module shells and the 0.1.3 BEM shells. If a future shell changes
the sidebar class generation again, the same three selectors (anchor query,
logo-row `closest`, semantic rule) are the extension points, and the two
regression cases are the acceptance evidence. The insertion-host contract is now
"insert into the anchor's actual parent", so future nesting of the New Session
button is handled without another core change.
