#!/usr/bin/env bash
# Usage: [REPORT_FILE=path] run-annotated.sh <title> <error|warning> <command...>
#
# Runs a command and prints its output. Then:
# - if REPORT_FILE is set, saves the full output there (uploaded as a report);
# - on failure, attaches the last part of the output to the run as an annotation,
#   so the cause is visible on the run page without opening the logs.
# With level "error" the command's exit code is returned (the step fails);
# with "warning" the step always succeeds.
set -uo pipefail
title="$1"; level="$2"; shift 2
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
if [ -n "${REPORT_FILE:-}" ]; then
  mkdir -p "$(dirname "$REPORT_FILE")"
  cp "$log" "$REPORT_FILE"
fi
if [ "$rc" -ne 0 ]; then
  msg="$(tail -c 3500 "$log" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' | awk '{printf "%s%%0A", $0}')"
  echo "::${level} title=${title} (exit ${rc})::${msg}"
fi
[ "$level" = "warning" ] && exit 0
exit "$rc"
