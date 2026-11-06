#!/usr/bin/env bash
# Builds the whole GitHub Pages site into one folder: main at the root, and
# each pull request listed in the previews file at pr/<number>/.
#
# Usage: scripts/build-pages-site.sh <previews file> <site dir> <built file>
#
# Each line of the previews file is "<number> <head sha>". The workflow only
# lists open pull requests whose branch is in this repository. A pull request
# that fails to build is skipped with a warning, so it can't hold back main or
# the other previews. The numbers that built go to the built file, one a line.
set -euo pipefail

previews=$1
site=$2
built=$3

rm -rf "$site"
mkdir -p "$site/pr"
: > "$built"

npm ci
npm run build
cp -R dist/. "$site/"

while read -r number sha; do
  [ -n "$number" ] || continue
  dir=$(mktemp -d)
  echo "::group::Build pull request #$number ($sha)"
  if git fetch --no-tags --depth=1 origin "$sha" &&
    git worktree add --detach "$dir" "$sha" &&
    (cd "$dir" && npm ci && npm run build); then
    mkdir -p "$site/pr/$number"
    cp -R "$dir/dist/." "$site/pr/$number/"
    echo "$number" >> "$built"
    echo "::endgroup::"
  else
    echo "::endgroup::"
    echo "::warning title=Preview skipped::Pull request #$number didn't build, so it has no preview this time."
  fi
  git worktree remove --force "$dir" 2> /dev/null || rm -rf "$dir"
done < "$previews"
