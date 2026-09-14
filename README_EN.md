# dsh-ide-git

> An **IDE-grade Git tool window** for the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) sidebar — branch tree on the left, commit graph in the middle, changes and commit details on the right, with JetBrains-style actions. Registered as a native [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) tab, usable in both the native right sidebar and the bottom workbench.

DSH's built-in Git panel covers stage / commit / revert / history. `dsh-ide-git` adds the layer IDE users expect: a **branch tree with a full context menu**, a **commit graph**, **commit details with per-file diffs**, a **grouped changes list** and a commit box.

## Two surfaces, two layouts (deliberately)

In better-sidebar 0.19.x one tab registration shows up on two very different surfaces:

| Surface | Owner | Shape | Layout here |
|---|---|---|---|
| Right sidebar | **DSH's native right sidebar** (plugin tabs are bridged in) | narrow + tall | `stack`: changes above the graph, collapsible branch pane |
| Bottom panel | **better-sidebar's own workbench** | wide + flat | `columns`: tree / graph / changes — the JetBrains Git tool window shape |

The panel never guesses: it measures itself with a `ResizeObserver` (width ≥ 640px and aspect ≥ 1.5 → columns, otherwise stack), so free-floating windows and the mobile drawer adapt too.

## Features

- Toolbar: refresh, new branch, fetch (prune), pull (`--ff-only`), push (confirmed), branch pane toggle.
- Status line: branch, upstream, ahead/behind, stash count, busy indicator.
- Branch tree: HEAD / Local / Remote / Tags groups, filter box, ahead/behind badges, worktree marker.
- Branch context menu: checkout, rebase current onto this, merge into current, compare with current, new branch from here, rename, delete, fetch, push.
- Commit list: lane graph, refs badges, relative date, author, subject, filter, load more (120 per page).
- Commit context menu: details, copy revision, checkout revision, new branch here, new tag, cherry-pick, revert, reset here (keep / discard changes).
- Commit details: full message, author/date, changed files with +/− and per-file line diff.
- Changes: conflicts / staged / changes / untracked groups, inline stage / unstage / discard, group-level actions, click for diff.
- Commit box: multi-line message, Ctrl+Enter (Cmd+Enter) to commit, amend.

## Install

`@sh
dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add "github:KannaKuron/dsh-ide-git"
`@

Restart `dsh web`, then open **Git** from the bottom panel's `+` menu or from the native right sidebar's `+` menu. The plugin also appears as a card in better-sidebar's settings page (side cards), where it can be disabled.

## How it works

- **Host half** (`src/index.js`): one prefix route `/dsh-ide-git/api` with a 29-method table. Every git call is an argv array through `spawn` — no shell string, no `exec` — with argument validation (absolute paths, refs never start with `-`, paths stay inside the repository).
- **Client half** (`src/client.js`): no build step, single file, `window.__ModuleLoader__.load({ id, factory })`, requiring only `react` (a DSH client baseline module).
- **Trust fence**: only loopback Hosts, or same-origin browser requests (`Sec-Fetch-Site`), are served.
- **Destructive actions** (push, hard reset, force delete, discarding untracked files, dropping a stash) require an explicit `confirm: true` and always ask in the UI first.

## Limits / roadmap

v0.1.0 covers the main path. Still missing: multi-select and partial commits (changelists), interactive rebase / fixup / squash, patches, a merge-conflict editor, blame and file history, plugin-owned settings rows, a worktree view, and desktop-client verification. Large repositories: paginated log and a 400KB diff cap.

## License

MIT © KannaKuron
