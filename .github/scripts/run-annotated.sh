#!/usr/bin/env bash
# Usage: run-annotated.sh <title> <error|warning> <command...>
# Runs a command, prints its output, and on failure attaches the last part of
# the output to the workflow run as an annotation (readable via the Checks API).
set -uo pipefail
title="$1"; level="$2"; shift 2
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
if [ "$rc" -ne 0 ]; then
  msg="$(tail -c 3500 "$log" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' | awk '{printf "%s%%0A", $0}')"
  echo "::${level} title=${title} (exit ${rc})::${msg}"
fi
[ "$level" = "warning" ] && exit 0
exit "$rc"
