# dsh-ide-git

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[简体中文](README.md) | English

> An **IDE-grade Git tool window** for the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) sidebar — branch tree on the left, commit graph in the middle, changes and commit details on the right, with JetBrains-style actions. Registered as a native [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) tab, usable in both the native right sidebar and the bottom workbench; since v0.13.0 also as a **conversation-area tab** (a Git tab beside Chat/Trajectory, switchable off in settings).

DSH's built-in Git panel covers stage / commit / revert / history. `dsh-ide-git` adds the layer IDE users expect: a **branch tree with a full context menu**, a **commit graph**, **commit details with per-file diffs**, a **grouped changes list** and a commit box.

## Screenshots

> Captured from a **clean DSH with only two plugins installed** (`dsh-better-sidebar` + this one), bound to a fictional demo repository (`scripts/demo-repo.mjs`). No real workspace, no wallpaper plugin and no other panel is in frame; the whole sequence is reproducible with `scripts/screenshots.mjs`.

<table>
<tr>
<td align="center" width="58%"><img src="docs/screenshots/1-bottom-workbench.png" alt="Bottom workbench: branch tree / commit graph / changes"/></td>
<td valign="top"><b>Bottom workbench (wide → three panes)</b><br/>A JetBrains-style action rail whose button count follows the rail's <b>own height</b> (overflow folds into <code>⋯</code>, and <code>⚙</code> at the end reorders or hides actions), a commit list in IDEA column order (<b>date → author → graph → refs → subject</b>) with the filter row above it (text/hash, branch or tag, author, date, path), and the changes pane with the commit box.</td>
</tr>
</table>

<table>
<tr>
<td align="center" width="58%"><img src="docs/screenshots/2-commit-menu.png" alt="Commit context menu"/></td>
<td valign="top"><b>Commit context menu</b><br/>Details, copy revision, checkout, new branch here, new tag, cherry-pick, revert, reset here (keep / discard) — destructive rows in red, positioned inside the panel so it opens in the bottom workbench too.</td>
</tr>
<tr>
<td align="center" width="58%"><img src="docs/screenshots/3-branch-undo.png" alt="Undo toast after deleting a branch"/></td>
<td valign="top"><b>Deletes are reversible</b><br/>Deleting a branch or a stash is a <b>real delete</b>, but the host records the object id first: the toast in the corner offers <b>Undo</b> (one-shot, valid 30 minutes), and the toolbar keeps a “recently deleted” menu for when the toast is gone. Deleting <code>main</code>/<code>master</code> asks you to type the branch name.</td>
</tr>
</table>

<table>
<tr>
<td align="center" width="58%"><img src="docs/screenshots/4-rail-settings.png" alt="Action rail settings: order and visibility"/></td>
<td valign="top"><b>Configurable action rail</b><br/>Drag or use the arrows to reorder, the eye to hide an action. Only the permutation and the hidden set are stored (normalised), so a later version that adds an action never breaks an existing config.</td>
</tr>
<tr>
<td align="center" width="58%"><img src="docs/screenshots/5-commit-detail.png" alt="Commit details with a per-file diff"/></td>
<td valign="top"><b>Commit details</b><br/>Full message, author and date, changed files with +/− counts, and a line-level diff with gutters, hunk highlighting and red/green backgrounds.</td>
</tr>
</table>

<table>
<tr>
<td align="center" width="58%"><img src="docs/screenshots/6-right-sidebar.png" alt="The same panel in the native right sidebar"/></td>
<td valign="top"><b>One registration, two layouts</b><br/>In the narrow, tall <b>native right sidebar</b> the same panel stacks: rail as a single row on top, changes first, history below. The panel only measures itself — it never guesses which container it is in.</td>
</tr>
</table>

## Send to chat

Everything in the panel can be right-clicked into the **current session's composer** — through DSH's official insertion channel (it appends at the tail without touching what you already typed; while sending, or when the service is absent, it falls back to copying the payload with a toast, never a dead click):

- **Commit** → `git commit 47ad017 "Subject" (repo xxx)`: short hash + message + repository, one sentence naming a revision;
- **Branch** → `git branch main (repo xxx)`;
- **File** (change rows and commit-detail file rows) → a `@path` file reference chip (DSH's native @ grammar, quoted paths included) or just the raw path;
- **Selected diff lines**: select some text in a diff window (opened from a commit detail or the working tree), right-click → **Send selected lines to chat**: an `@file` chip plus a line note — `lines N–M (commit 47ad017 "Subject" @ branch)` for a commit, `lines N–M (worktree, staged / uncommitted)` for the working tree. Numbers are reconstructed from the diff rows under the selection against the patch's hunk headers, in **new-file numbering**; a purely deleted span reports OLD numbers and says so. If the selection cannot be pinned to diff rows the menu degrades to **Send selected snippet to chat** (text truncated at 600 characters) instead of inventing numbers, and a **Copy the selection reference** item is always there. With no selection the browser's own menu stays.

Also in place: change-row and detail-file-row icons are tinted by extension (DSH's own FileTypeIcon); diff previews render inline (red/green rows, split / wrap switches, copy toolbar) and stay inline by default even when dsh-better-sidebar or the native preview seat is installed — the settings card can hand them back to the sidebar; the diff window's height is draggable and remembered per placement; and the whole panel can live in the **main conversation area** — the Git tab next to Dialogue / Trace, switchable in the plugin settings.

## Where it mounts: two hosts, one panel

The plugin registers once; which surface it lands on is the **host's** decision, and the two doors are exclusive:

| Host | When | What you get |
|---|---|---|
| **dsh-better-sidebar** (optional) | whenever it is installed | its tab system: the tab in the right sidebar **plus the bottom workbench**; the plugin also shows up as a card in its settings page |
| **DSH's own right sidebar** | automatically, when better-sidebar is absent | a **Git** capsule on the sidebar's guide page — the very same panel |
| **Conversation-area tab** (since v0.13.0) | always on (switchable in settings) | a **Git** tab beside Chat/Trajectory at the top of the conversation — clicking it turns the whole conversation area into the Git tool window; the switch lives in the plugin settings under Placement |

better-sidebar wins while it is there (it also carries the bottom workbench); a late-arriving better-sidebar takes the native registration down and hosts the tab itself. Installing this plugin alone is fully supported — no prerequisite.

The same panel shows up on surfaces of very different shapes, so the layout measures instead of guessing:

| Surface | Shape | Layout here |
|---|---|---|
| Right sidebar (native, or bridged by better-sidebar) | narrow + tall | `stack`: changes on top, history and diff as two tabs below (a click on a file switches to `Diff`), collapsible branch pane |
| Bottom workbench (better-sidebar only) | wide + flat | `columns`: tree / graph / changes — the JetBrains Git tool window shape |
| Sidebar dragged very narrow (< 400px) | narrow | `compact`: changes on top, history and diff as two tabs below, collapsible tree |

The panel never guesses: it measures itself with a `ResizeObserver` (width ≥ 600px and width ≥ 1.15 × height → columns, width < 400px → the compact tabs, otherwise stack — width decides, height has no veto); both stacked layouts make history and diff tabs, and a click on a changed file flips to `Diff`. Free-floating windows and the mobile drawer adapt too.

## Features

- Action rail: the JetBrains-style vertical strip in the bottom workbench (and one horizontal row under the header in the right sidebar) with refresh, new branch, checkout, delete, compare, show diff, stash, new tag, favorite, fetch, pull and push. **It shows as many buttons as fit**, folds the rest into a `⋯ more` menu, and pins a `⚙ settings` button that lets you reorder actions and toggle each of them (stored as one boolean per action plus `railOrder` in the plugin's row Config; an empty order means the code order). Every action lights up or greys out with the current state (no other branch → delete / checkout / compare off, no remote → fetch / push off, no upstream → pull off, no changes → diff off).
- Tabs in the stacked layouts: below 600px (both `stack` and `compact`) the changes list keeps the top of the panel and the lower window is a `History` / `Diff` tab pair — opening a changed file switches to `Diff`, so the history list (and its scroll position) is never pushed away; the divider above that window drags and double-click resets (same store as the other panes, `dsh-ide-git.panes.v1`).
- Hover hints: rest the pointer on an icon button for 120ms and its action name appears beside it — to the RIGHT of a vertical rail icon (centred on that row, flipping to the left when the window's right edge is in the way) and below everywhere else; greyed-out actions explain themselves too (e.g. `Hide · Not available in the current state`). The hint card lives on the window layer, so the bottom workbench cannot clip it — sweeping across a row of icons does not flash, and a pressed pointer / scroll / resize drops it immediately.
- Status line: branch, upstream, ahead/behind, stash count, busy indicator.
- Composer status pill: repository/branch capsule in the host input-bar tool row (colored uncommitted / pullable / to-push counters), click to open a searchable switcher — repositories filter by name or path, branches fold on `/` into a folder tree (`fix/xxx` stays legible), typing filters immediately, arrow keys + Enter pick. Kept in sync with the panel both ways; single-repo workspaces switch branches only, multi-repo workspaces switch both. Off-switch in the settings (on by default). Sessions are pre-warmed on switch so the panel opens instantly.
- Repo/branch switcher: the panel header and the composer pills share one searchable picker. Repositories filter by name, path, clone directory or current branch and show each clone's checked-out branch; branches fold on `/` into a folder tree that opens matching folders while typing, arrow keys + Enter pick, and folders stay collapsible on an empty filter.
- Branch tree: HEAD / Local / Remote / Tags groups, filter box, ahead/behind badges, worktree marker; local blue / remote violet / tag amber / HEAD green.
- Worktrees: a rail view listing the primary and every linked worktree (current / primary / locked / prunable badges, branch, short HEAD, path). Create one on a new branch or attach an existing branch (with an optional start point), open it in the panel, copy its path, remove it (a dirty tree asks for a second, forced confirmation), and prune stale records. It coexists with the official change-request panel.
- Branch context menu: checkout, rebase current onto this, merge into current (default / `--no-ff` / `--squash` / `--no-ff --no-commit`), compare with current, new branch from here, rename, delete, fetch, push, send to chat (branch + repo). A pending no-commit merge can be backed out from **More → Commit → Abort merge**.
- History scope and filters: switch the log between the current branch, every branch (`--branches --remotes`) or any named local/remote branch, so commits that only exist on an unrelated or ahead branch stay visible; then filter by text or hash, branch or tag, author (with a one-click "Me" entry) or date (today / 7 days / 30 days / this year), toggle newest / oldest first and clear all; the path filter runs server-side (`git log -- <path>`) on Enter. Infinite scroll keeps loading pages at the list edge, rubber-band selection works across all three lists, and double-clicking a branch browses its history without checking it out.
- Commit list: IDEA column order — **date → author → graph → refs → subject**; a lane graph whose segments span whole rows (pixel-aligned across rows), a hollow dot for HEAD, refs badges (HEAD green / local blue / remote violet / tag amber, at most three plus `+n`), load more (120 per page). The date column defaults to relative labels; plugin settings → History list switches it to absolute timestamps (same-year `MM-DD HH:mm`, cross-year `YYYY/MM/DD HH:mm`, with the other form in the tooltip).
- Commit context menu: details, copy revision, checkout revision, new branch here, new tag, cherry-pick, revert, reset here (keep / discard changes), send to chat (short hash + message + repo).
- Commit details: full message, author/date, changed files with +/− and per-file line diff.
- Diff pane: inline line diff (red/green rows, **split / wrap** switches, copy toolbar), opened inline by default so installing dsh-better-sidebar cannot take those controls away — turn off "Preview diffs in the panel" in the settings card to hand previews back to the sidebar; draggable height remembered per placement; **select diff rows and right-click** to send a line-level reference into the conversation — an `@file` chip plus the line range with commit (hash / subject / current branch) or worktree (staged / uncommitted) context; deleted rows are labelled as old-numbered, selections that cannot be pinned to rows degrade to the raw snippet (truncated at 600 characters), and a copy-reference item is always available.
- Changes: conflicts / staged / changes / untracked groups, inline stage / unstage / discard, group-level actions, click for diff.
- Commit box: multi-line message, Ctrl+Enter (Cmd+Enter) to commit, amend. The AI commit-message model picker also shows each model's listing badge, localized to the active interface language.
- File context menu: show diff, stage / unstage, discard changes, copy path, send to chat (an `@file` reference chip or the raw path).
- **Safety and undo**: deleting a branch or a stash pops a toast in the corner with an **Undo** action — the delete is real, and undo recreates the ref from the object id recorded just before it (one-shot, valid for 30 minutes). Deleting `main` / `master` / `trunk` requires typing the branch name, destructive dialogs focus Cancel instead of the red button, writes are serialised per repository on the host, and while a merge / rebase / cherry-pick / revert / bisect is still open the affected actions are greyed out with the reason.

## Install

```sh
# works on its own: the panel lands in DSH's native right sidebar
dsh plugin --profile web add dsh-ide-git
# optional: adds the bottom workbench and better-sidebar's sidebar chrome
dsh plugin --profile web add dsh-better-sidebar
```

Restart `dsh web`, then:

- **plugin alone** — open the right sidebar from the session header and pick the **Git** capsule on the guide page;
- **with better-sidebar** — pick **Git** from the bottom panel's `+` menu, or from the native right sidebar's `+` menu (one registration, one state);
- with better-sidebar present the plugin also appears as a card in its settings page (side cards), where it can be disabled.

### Compatibility

- `engines.dsh` and the `@deepseek-ai/dsh` peerDependency are both **`>=0.2.2-rc.1`** since v0.28.0, with an **open floor and no ceiling**. The compatibility gate reads `engines.dsh` first (and ignores the peer when it exists); the peer stays in sync and optional as the second declaration for package managers and diagnostics.
- One settings surface: on `>=0.2.2-rc.1` `ctx.configForms` is the only source, every row-Config field is writable, the card toggles each action and carries placement, date format and the AI commit message, and the panel gear writes the `railOrder` permutation. The old `localStorage` document is read once by the migration; its write path is gone. A loading form shows a loading state, and only an unusable form says settings are unavailable. Optional host data such as model badges is still capability-detected, never version-sniffed.
- Three long-lived contracts, nothing else: the host's `webServer.register({ kind: 'prefix' })` route, the client's `window.__ModuleLoader__.load({ id, factory })`, and the client `slots` service. It does **not** import the `ui-primitives` icon set (every icon is an inline SVG), so host icon changes cannot reach it.
- better-sidebar is an **optional** peer: absent, broken, or waiting on its own upstream fix, the plugin still mounts in the native right sidebar.

### Interface language

Follows DSH's locale setting (`ctx.locale`) and switches live. **21 dictionaries** ship with the plugin: Simplified and Traditional Chinese (including `zh-HK` / `zh-MO` / `zh-TW`), English, Japanese, Korean, German, French, Italian, Portuguese, Russian, Dutch, Polish, Swedish, Turkish, Indonesian, Vietnamese, Thai, Hindi and Arabic. They are also published to DSH's locale registry through `ctx.locale.register`. Resolution is "exact tag → primary subtag → English", and **English is always the key-complete dictionary** — any language without a dictionary falls back to it rather than showing raw keys.

The dictionaries live in the `LOCALES` table inside `src/client.js`: one entry per language, each preceded by a `/* locale: <tag> */` marker. **The check is automatic** — a smoke test requires every dictionary to carry exactly the same key set as Chinese, because a missing key falls back to English silently and leaves the panel half-translated, which is what that test exists to catch.

## How it works

- **Host half** (`src/index.js`): one prefix route `/dsh-ide-git/api` with a 51-method table. Every git call is an argv array through `spawn` — no shell string, no `exec` — with argument validation (absolute paths, refs never start with `-`, paths stay inside the repository).
- **Client half** (`src/client.js`): no build step, single file, `window.__ModuleLoader__.load({ id, factory })`, requiring only `react` (a DSH client baseline module).
- **Trust fence**: only loopback Hosts, or same-origin browser requests (`Sec-Fetch-Site`), are served.
- **Destructive actions** (push, hard reset, force delete, discarding untracked files, dropping a stash) require an explicit `confirm: true` and always ask in the UI first.

## Tests

```sh
npm test   # smoke (file-level invariants) + api (a real throwaway repo driven through the host route)
```

## Limits / roadmap

v0.1.0 covers the main path. Still missing: multi-select and partial commits (changelists), interactive rebase / fixup / squash, patches, a merge-conflict editor, blame and file history, plugin-owned settings rows, and desktop-client verification. Large repositories: paginated log and a 400KB diff cap.

## License

MIT © KannaKuron
