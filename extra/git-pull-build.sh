#!/bin/sh
set -eu

# Dockge deliberately does not collect credentials. Public repositories need
# none; private repositories must use credentials mounted by the operator.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes"
export SSH_ASKPASS=/bin/false

printf '\n==> git pull --ff-only\n'
git -c safe.directory="$PWD" pull --ff-only

printf '\n==> docker compose up -d --build --remove-orphans\n'
exec docker "$@"
