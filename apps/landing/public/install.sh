#!/bin/bash
# SpokeUI macOS installer. Run as your normal user; no sudo is needed.
set -euo pipefail

fail() { printf 'SpokeUI: %s\n' "$*" >&2; exit 1; }
[ "$(uname -s)" = Darwin ] || fail 'This installer supports macOS only. See https://github.com/ivasuy/SpokeUI/releases for other platforms.'
[ "$(id -u)" -ne 0 ] || fail 'Run this installer without sudo.'

version=0.1.3
arch=$(uname -m)
# Detect Apple Silicon even when Terminal is running under Rosetta.
if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || true)" = 1 ]; then arch=arm64; fi
case "$arch" in
  arm64) checksum=ff736abbf355dfa707bd2ac0b0ee743d1b3c7d6c4c4ca577c1f03f30808d62b3 ;;
  x86_64) arch=x64; checksum=93dc2f83c84027b93fdd3c5288c4056daf2572ba007f9da3f2111a371c820227 ;;
  *) fail "Unsupported architecture: $arch" ;;
esac

install_dir="$HOME/Applications"
app="$install_dir/SpokeUI.app"
[ ! -e "$app" ] && [ ! -L "$app" ] || fail "SpokeUI already exists at $app. Quit it and move that copy to Trash before reinstalling."
mkdir -p "$install_dir"
# Stage on the destination filesystem so the final move is atomic.
staging=$(mktemp -d "$install_dir/.spokeui-install.XXXXXX")
trap 'rm -rf "$staging"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Downloading SpokeUI %s for %s…\n' "$version" "$arch"
curl --fail --location --show-error --proto '=https' --tlsv1.2 --retry 3 \
  "https://github.com/ivasuy/SpokeUI/releases/download/v$version/SpokeUI-darwin-$arch-$version.zip" \
  --output "$staging/SpokeUI.zip"
printf '%s  %s\n' "$checksum" "$staging/SpokeUI.zip" | shasum -a 256 -c - || fail 'Download checksum verification failed.'
ditto -x -k "$staging/SpokeUI.zip" "$staging/unpacked"
extracted="$staging/unpacked/SpokeUI.app"
[ -d "$extracted" ] && [ ! -L "$extracted" ] || fail 'The release does not contain SpokeUI.app.'
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$extracted/Contents/Info.plist")" = dev.spokeui.desktop ] || fail 'Unexpected application identifier.'
codesign --verify --deep --strict "$extracted" || fail 'Application signature verification failed.'
# Do not change quarantine attributes or system security settings.
[ ! -e "$app" ] && [ ! -L "$app" ] || fail "An app appeared at $app during installation; leaving it untouched."
mv -n "$extracted" "$app"
[ ! -d "$extracted" ] || fail 'The destination changed during installation; leaving it untouched.'
printf '\nInstalled SpokeUI to %s\nOpen it from Finder, or run: open "%s"\n' "$app" "$app"
printf 'Microphone access is requested by macOS when needed. This release is not Apple-notarized.\n'
