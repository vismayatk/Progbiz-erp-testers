#!/bin/bash
# Build the video tools (encode, probe, grabframe) with the Swift compiler
# from the Command Line Tools. Nothing is downloaded or installed.
#
#   bash scripts/video/encode/build.sh            # quiet build
#   VERBOSE=1 bash scripts/video/encode/build.sh  # show compiler warnings
#
# Binaries go to reports/video/build/bin/ (git-ignored).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="$ROOT/reports/video/build/bin"
mkdir -p "$BIN"

command -v swiftc >/dev/null 2>&1 || { echo "build: swiftc not found (install the Xcode Command Line Tools)" >&2; exit 1; }

# The classic AVAssetWriter / AVAssetReader calls are marked deprecated in the
# macOS 27 SDK but are fully functional; the warnings are hidden unless
# VERBOSE=1 is set.
FLAGS=(-O -swift-version 5)
if [ "${VERBOSE:-0}" != "1" ]; then FLAGS+=(-suppress-warnings); fi

for tool in encode probe grabframe; do
  printf 'build: %-10s ' "$tool"
  start=$(date +%s)
  swiftc "${FLAGS[@]}" "$HERE/$tool.swift" -o "$BIN/$tool"
  echo "ok  ($(( $(date +%s) - start )) s)  -> ${BIN#"$ROOT"/}/$tool"
done

/usr/bin/python3 -m py_compile "$HERE/mixwav.py" && echo "build: mixwav.py   ok  (syntax check)"
rm -rf "$HERE/__pycache__"
echo "build: done"
