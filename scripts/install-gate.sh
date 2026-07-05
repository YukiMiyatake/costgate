#!/usr/bin/env bash
# Install costgate-gate from GitHub Releases (no Go required).
#
# Usage:
#   ./scripts/install-gate.sh              # latest
#   ./scripts/install-gate.sh v0.4.0       # specific tag
#   INSTALL_DIR=~/.local/bin ./scripts/install-gate.sh
set -euo pipefail

REPO="YukiMiyatake/costgate"
TAG="${1:-latest}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
  linux) ;;
  darwin) ;;
  mingw*|msys*|cygwin*) os=windows ;;
  *)
    echo "[install-gate] unsupported OS: $os" >&2
    exit 1
    ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *)
    echo "[install-gate] unsupported arch: $arch" >&2
    exit 1
    ;;
esac

if [[ "$TAG" == "latest" ]]; then
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p' | head -1)
  if [[ -z "$TAG" ]]; then
    echo "[install-gate] no releases found" >&2
    exit 1
  fi
fi

ver="${TAG#v}"
ext=tar.gz
if [[ "$os" == "windows" ]]; then
  ext=zip
fi

asset="costgate-gate_${ver}_${os}_${arch}.${ext}"
url="https://github.com/$REPO/releases/download/${TAG}/${asset}"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

echo "[install-gate] downloading ${url}"
curl -fsSL "$url" -o "$tmpdir/archive.${ext}"

mkdir -p "$tmpdir/extract"
if [[ "$ext" == "zip" ]]; then
  unzip -q "$tmpdir/archive.${ext}" -d "$tmpdir/extract"
else
  tar -xzf "$tmpdir/archive.${ext}" -C "$tmpdir/extract"
fi

bin=costgate-gate
if [[ "$os" == "windows" ]]; then
  bin=costgate-gate.exe
fi

src="$tmpdir/extract/$bin"
if [[ ! -f "$src" ]]; then
  echo "[install-gate] binary not found in archive" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
install -m 755 "$src" "$INSTALL_DIR/$bin"

echo "[install-gate] installed: $INSTALL_DIR/$bin"
echo "[install-gate] ensure $INSTALL_DIR is on your PATH"
"$INSTALL_DIR/$bin" --version
