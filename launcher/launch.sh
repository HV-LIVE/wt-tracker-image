#!/bin/sh
set -o errexit

work_dir="$(dirname $(readlink -f $0))"
cd "$work_dir"

echo "launch"
exec "node" "/opt/wt-tracker/dist/run-uws-tracker.js" "/etc/wt-tracker/config.json"
