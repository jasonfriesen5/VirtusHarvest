#!/bin/bash
# Publish each product's files to its own branch on GitHub.
#
# You keep working in this one folder, on whatever branch you like. This script
# copies the current state of each product into its component branch and pushes
# it, so `harvest-web` and friends stay current instead of drifting into stale
# snapshots.
#
# The alternative — checking out `harvest-web` here — would delete the phone
# app, the hardware folder and everything else from this directory, because
# those files do not exist on that branch. They would be recoverable, but the
# folder you work in would keep changing shape under you, and .claude/launch.json
# points at paths in this one. Hence: work here, publish outward.
#
#   ./publish-branches.sh                 every branch
#   ./publish-branches.sh harvest-web     just one
#
# Each branch keeps its own README.md; this never overwrites it.
set -e
cd "$(dirname "$0")"
SRC="$PWD"

# branch|paths, separated by ';'. NOT spaces: two of these paths contain a
# space ("Virtus Feed Folder", "Reset Password.html"), and splitting on
# whitespace silently matched nothing — which published an empty branch rather
# than failing. Semicolons cannot appear in these names.
BRANCHES=(
  "harvest-web|web;supabase"
  "harvest-app|site/index.html;native-app;release;hardware;virtus_scale;dfu_flash_feather;site/privacy.html;site/support.html;site/Reset Password.html;site/Glas Virtus Icon.png;supabase-delete-account.sql"
  "feed-web|Virtus Feed Folder/web"
  "feed-app|Virtus Feed Folder"
)

WANTED="${1:-}"
TMP="$(mktemp -d)"
trap 'git worktree remove "$TMP/wt" --force 2>/dev/null || true; rm -rf "$TMP"; git worktree prune' EXIT

for entry in "${BRANCHES[@]}"; do
  branch="${entry%%|*}"
  paths="${entry#*|}"
  [ -n "$WANTED" ] && [ "$WANTED" != "$branch" ] && continue

  echo "── $branch"

  # Fresh worktree on the existing branch, so its history keeps going rather
  # than being replaced by an unrelated root each time.
  # Deregister before removing: rm alone leaves git holding a stale entry, and
  # the next add fails with "missing but already registered worktree".
  git worktree remove "$TMP/wt" --force 2>/dev/null || true
  rm -rf "$TMP/wt"
  git worktree prune
  git worktree add -q --detach "$TMP/wt" "origin/$branch" 2>/dev/null \
    || git worktree add -q --detach "$TMP/wt" HEAD
  git -C "$TMP/wt" checkout -q -B "$branch" "origin/$branch" 2>/dev/null || true

  # Clear everything except the branch's own README, which is written by hand
  # and has no counterpart in this folder.
  ( cd "$TMP/wt" && git ls-files -z | grep -zv '^README\.md$' | xargs -0 -r rm -f )
  find "$TMP/wt" -mindepth 1 -type d -empty -not -path "*/.git/*" -delete 2>/dev/null || true

  # Copy the current state. `git ls-files` for tracked, plus --others for files
  # not yet committed anywhere; --exclude-standard applies .gitignore, which is
  # what keeps auth_keys/, keystores, node_modules and build output out.
  copied=0
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      # Feed branches drop the folder prefix so the app sits at the branch root.
      case "$branch" in
        feed-*) dest="$TMP/wt/${f#Virtus Feed Folder/}" ;;
        *)      dest="$TMP/wt/$f" ;;
      esac
      mkdir -p "$(dirname "$dest")"
      cp "$SRC/$f" "$dest"
      copied=$((copied + 1))
    done < <(cd "$SRC" && { git ls-files -- "$p"; git ls-files --others --exclude-standard -- "$p"; } | sort -u)
  done < <(printf '%s\n' "$paths" | tr ';' '\n')

  # An empty result means a path stopped matching. Publishing that would wipe
  # the branch, so stop instead — this exact mistake emptied two branches once.
  if [ "$copied" -eq 0 ]; then
    echo "   ERROR: matched no files for [$paths] — refusing to publish an empty branch"
    continue
  fi

  # feed-web is a subset of feed-app's path, so strip what does not belong.
  if [ "$branch" = "feed-app" ]; then
    rm -rf "$TMP/wt/web"
  fi

  cp "$SRC/.gitignore" "$TMP/wt/.gitignore"

  ( cd "$TMP/wt"
    git add -A
    if git diff --cached --quiet; then
      echo "   no change ($copied files)"
    else
      git commit -q -m "Publish $branch from $(git -C "$SRC" branch --show-current) @ $(git -C "$SRC" rev-parse --short HEAD)"
      git push -q origin "$branch"
      echo "   pushed ($copied files)"
    fi
  )
done

echo
echo "Done. This folder is untouched — still on $(git branch --show-current)."
