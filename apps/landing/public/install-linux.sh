#!/bin/bash
set -euo pipefail
fail() { printf 'SpokeUI: %s\n' "$*" >&2; exit 1; }
[ "$(uname -s)" = Linux ] || fail 'This installer requires Linux.'
[ "$(uname -m)" = x86_64 ] || fail 'The current Linux release supports x86_64 only.'
command -v apt-get >/dev/null || fail 'This installer supports Debian and Ubuntu systems with apt-get.'
for tool in curl sha256sum; do command -v "$tool" >/dev/null || fail "Install $tool first."; done
if [ "$(id -u)" -ne 0 ]; then command -v sudo >/dev/null || fail 'sudo is required to install the Debian package.'; fi
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
package="$staging/spokeui.deb"
curl --fail --location --show-error --proto '=https' --tlsv1.2 --retry 3 \
  https://github.com/ivasuy/SpokeUI/releases/download/v0.1.3/spokeui_0.1.3_amd64.deb --output "$package"
printf '%s  %s\n' f2f0b504cca275904a734bca131f18c67c00d723e9d2c26b54a769bf28011574 "$package" | sha256sum -c - || fail 'Download checksum verification failed.'
# apt resolves Electron's system dependencies and uses its normal confirmation prompt.
if [ "$(id -u)" -eq 0 ]; then
  apt-get install "$package" < /dev/tty
else
  sudo apt-get install "$package" < /dev/tty
fi
printf 'SpokeUI is installed. Open it from your applications menu.\n'
