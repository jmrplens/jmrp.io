#!/usr/bin/env bash
# PostToolUse hook for Write/Edit: format the file Claude just wrote with
# Prettier, run from the checkout that owns the file.
#
# The hook used to `cd` into CLAUDE_PROJECT_DIR (the production checkout) and
# pass `--ignore-path .prettierignore`. That ignore file's patterns are
# relative to the production checkout, so they never matched a file in
# another worktree of this repository: every edit to a worktree's MDX post or
# tool page was reformatted, which collapses the lists inside components and
# glues code fences to the text. It also formatted files outside any
# repository (scratch files, notes) with this project's Prettier.
#
# Now it formats only files inside this repository or one of its worktrees
# (same git common dir as the project), with that checkout's own Prettier and
# .prettierignore, and stays silent otherwise. It never fails the tool call.
set -u

file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
[ -n "$file" ] && [ -f "$file" ] || exit 0

root=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || exit 0

project="${CLAUDE_PROJECT_DIR:-/var/www/jmrp.io}"
ours=$(git -C "$project" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
theirs=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
[ "$ours" = "$theirs" ] || exit 0

# A worktree without its own dependencies is left alone rather than formatted
# with another checkout's Prettier, plugins or ignore rules.
prettier="$root/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

cd "$root" || exit 0
timeout 60 "$prettier" --write --ignore-unknown --ignore-path .prettierignore "$file" >/dev/null 2>&1
exit 0
