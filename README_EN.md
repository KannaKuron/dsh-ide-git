# dsh-ide-git

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[简体中文](README.md) | English

> An **IDE-grade Git tool window** for the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) sidebar — branch tree on the left, commit graph in the middle, changes and commit details on the right, with JetBrains-style actions. Registered as a native [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) tab, usable in both the native right sidebar and the bottom workbench.

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

## Two surfaces, two layouts (deliberately)

In better-sidebar 0.19.x one tab registration shows up on two very different surfaces:

| Surface | Owner | Shape | Layout here |
|---|---|---|---|
| Right sidebar | **DSH's native right sidebar** (plugin tabs are bridged in) | narrow + tall | `stack`: changes above the graph, collapsible branch pane |
| Bottom panel | **better-sidebar's own workbench** | wide + flat | `columns`: tree / graph / changes — the JetBrains Git tool window shape |

The panel never guesses: it measures itself with a `ResizeObserver` (width ≥ 600px and width ≥ 1.15 × height → columns, otherwise stack), so free-floating windows and the mobile drawer adapt too.

## Features

- Action rail: the JetBrains-style vertical strip in the bottom workbench (and one horizontal row under the header in the right sidebar) with refresh, new branch, checkout, delete, compare, show diff, stash, new tag, favorite, fetch, pull and push. **It shows as many buttons as fit**, folds the rest into a `⋯ more` menu, and pins a `⚙ settings` button that lets you reorder actions and toggle each of them (stored in `dsh-ide-git.rail.v1`). Every action lights up or greys out with the current state (no other branch → delete / checkout / compare off, no remote → fetch / push off, no upstream → pull off, no changes → diff off).
- Status line: branch, upstream, ahead/behind, stash count, busy indicator.
- Branch tree: HEAD / Local / Remote / Tags groups, filter box, ahead/behind badges, worktree marker; local blue / remote violet / tag amber / HEAD green.
- Branch context menu: checkout, rebase current onto this, merge into current, compare with current, new branch from here, rename, delete, fetch, push.
- History filters: text or hash, branch or tag, author, date (today / 7 days / 30 days / this year), an order toggle (newest / oldest first) and one-click clear; the path filter runs server-side (`git log -- <path>`) on Enter.
- Commit list: IDEA column order — **date → author → graph → refs → subject**; a lane graph whose segments span whole rows (pixel-aligned across rows), a hollow dot for HEAD, refs badges (HEAD green / local blue / remote violet / tag amber, at most three plus `+n`), load more (120 per page).
- Commit context menu: details, copy revision, checkout revision, new branch here, new tag, cherry-pick, revert, reset here (keep / discard changes).
- Commit details: full message, author/date, changed files with +/− and per-file line diff.
- Changes: conflicts / staged / changes / untracked groups, inline stage / unstage / discard, group-level actions, click for diff.
- Commit box: multi-line message, Ctrl+Enter (Cmd+Enter) to commit, amend.
- **Safety and undo**: deleting a branch or a stash pops a toast in the corner with an **Undo** action — the delete is real, and undo recreates the ref from the object id recorded just before it (one-shot, valid for 30 minutes). Deleting `main` / `master` / `trunk` requires typing the branch name, destructive dialogs focus Cancel instead of the red button, writes are serialised per repository on the host, and while a merge / rebase / cherry-pick / revert / bisect is still open the affected actions are greyed out with the reason.

## Install

`@sh
dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add "github:KannaKuron/dsh-ide-git"
`@

Restart `dsh web`, then open **Git** from the bottom panel's `+` menu or from the native right sidebar's `+` menu. The plugin also appears as a card in better-sidebar's settings page (side cards), where it can be disabled.

## How it works

- **Host half** (`src/index.js`): one prefix route `/dsh-ide-git/api` with a 31-method table. Every git call is an argv array through `spawn` — no shell string, no `exec` — with argument validation (absolute paths, refs never start with `-`, paths stay inside the repository).
- **Client half** (`src/client.js`): no build step, single file, `window.__ModuleLoader__.load({ id, factory })`, requiring only `react` (a DSH client baseline module).
- **Trust fence**: only loopback Hosts, or same-origin browser requests (`Sec-Fetch-Site`), are served.
- **Destructive actions** (push, hard reset, force delete, discarding untracked files, dropping a stash) require an explicit `confirm: true` and always ask in the UI first.

## Tests

```sh
npm test   # smoke (file-level invariants) + api (a real throwaway repo driven through the host route)
```

## Limits / roadmap

v0.1.0 covers the main path. Still missing: multi-select and partial commits (changelists), interactive rebase / fixup / squash, patches, a merge-conflict editor, blame and file history, plugin-owned settings rows, a worktree view, and desktop-client verification. Large repositories: paginated log and a 400KB diff cap.

## License

MIT © KannaKuron