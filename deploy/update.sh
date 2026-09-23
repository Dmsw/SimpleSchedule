#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

git fetch origin main
git pull --ff-only origin main

echo "SimpleSchedule updated to:"
git log -1 --oneline
