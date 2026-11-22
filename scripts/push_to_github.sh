#!/usr/bin/env bash
# One-time push of this repo to a GitHub account that is NOT connected on this machine.
#
#   ./scripts/push_to_github.sh
#
# - Prompts for the target repo, GitHub username and a personal access token.
# - The token is read silently, handed to git through a temporary askpass helper,
#   and never written to .git/config, the remote URL, shell history or disk
#   (the helper file is deleted on exit).
# - No remote is added; your local git setup is left untouched.
# - Only COMMITTED work is pushed. .env is refused if it is tracked.
#
# Create the (empty) target repo on GitHub first, and use a token with
# "repo" scope (classic) or "Contents: read/write" on that repo (fine-grained).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ── Safety checks ────────────────────────────────────────────────────
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "Refusing to push: .env is tracked by git (it contains secrets)." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: you have uncommitted changes. They will NOT be pushed:" >&2
  git status --short >&2
  echo >&2
  read -r -p "Continue anyway? [y/N] " ok
  [ "${ok:-N}" = "y" ] || [ "${ok:-N}" = "Y" ] || { echo "Aborted. Commit first, then re-run."; exit 1; }
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# ── Inputs ───────────────────────────────────────────────────────────
read -r -p "Target repo (owner/name, e.g. someone/shayak): " TARGET
case "$TARGET" in
  */*) ;;
  *) echo "Target must look like owner/name." >&2; exit 1 ;;
esac

read -r -p "GitHub username to authenticate as: " GH_USER
read -r -s -p "Personal access token (input hidden): " GH_TOKEN
echo
[ -n "$GH_USER" ] && [ -n "$GH_TOKEN" ] || { echo "Username and token are required." >&2; exit 1; }

read -r -p "Remote branch name [$BRANCH]: " REMOTE_BRANCH
REMOTE_BRANCH="${REMOTE_BRANCH:-$BRANCH}"

URL="https://github.com/${TARGET%.git}.git"

echo
echo "About to push:"
echo "  from : $(pwd) ($BRANCH, $(git rev-list --count HEAD) commit(s))"
echo "  to   : $URL  ($REMOTE_BRANCH)"
read -r -p "Proceed? [y/N] " go
[ "${go:-N}" = "y" ] || [ "${go:-N}" = "Y" ] || { echo "Aborted."; exit 1; }

# ── Push with a throwaway credential helper ──────────────────────────
ASKPASS="$(mktemp)"
trap 'rm -f "$ASKPASS"; unset GH_TOKEN' EXIT
cat > "$ASKPASS" <<'EOF'
#!/bin/sh
case "$1" in
  Username*) printf '%s' "$GH_USER" ;;
  *)         printf '%s' "$GH_TOKEN" ;;
esac
EOF
chmod 700 "$ASKPASS"

export GH_USER GH_TOKEN
GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 \
  git -c credential.helper= push "$URL" "HEAD:refs/heads/${REMOTE_BRANCH}"

echo
echo "Done. Pushed to https://github.com/${TARGET%.git}"
