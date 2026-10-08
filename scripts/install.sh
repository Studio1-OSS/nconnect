#!/usr/bin/env bash
# nconnect installer.
#
#   curl -fsSL https://nconnect.sh/install.sh | sh
#
# Installs the nconnect CLI as a Bun-target JS bundle at
# ~/.nconnect/bin/nconnect.js, with a `nconnect` wrapper script on
# PATH that runs it with `bun`. Installs Bun for the user if `bun` isn't on
# PATH. Also installs `nclaude`, `nopencode`, `ncodex`, `npi`, `nprime`,
# `nhermes`, `ndeepseek`, `ngrok`, and `nunreal` convenience wrappers.
#
# After install, the CLI prompts once for a Nebius API key on first use
# (Enter skips - the key is optional). The CLI self-updates in the background.

set -eu
# The public command pipes this script into sh, which may be dash on Linux.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

ORIGIN="${NCONNECT_ORIGIN:-https://nconnect.sh}"
INSTALL_DIR="${NCONNECT_HOME:-$HOME/.nconnect}"
BIN_DIR="$INSTALL_DIR/bin"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
err()  { printf "  \033[31m✗ %s\033[0m\n" "$1" >&2; }

bold "Installing nconnect…"

# --- 1. Ensure Bun is present (install it for the user if not) ----------------
if command -v bun >/dev/null 2>&1; then
  ok "Bun found: $(bun --version)"
else
  info "Bun not found - installing it for you…"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
  elif command -v fetch >/dev/null 2>&1; then
    fetch -o - https://bun.sh/install | sh
  else
    err "Need curl to install Bun. Please install curl and re-run."
    exit 1
  fi
  # bun.sh installs into $BUN_INSTALL, or ~/.bun when that is unset. Look in
  # the same place: with BUN_INSTALL pointing elsewhere, assuming ~/.bun made
  # this step fail right after a successful install.
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    err "Bun install finished but bun isn't on PATH. Open a new shell and re-run."
    exit 1
  fi
  ok "Bun installed: $(bun --version)"
fi

# --- 2. Download the latest bundle + manifest --------------------------------
mkdir -p "$BIN_DIR"
info "Downloading nconnect from $ORIGIN …"

if ! curl -fsSL "$ORIGIN/nconnect.js" -o "$BIN_DIR/nconnect.js"; then
  err "Failed to download $ORIGIN/nconnect.js"
  exit 1
fi
ok "Bundle saved → $BIN_DIR/nconnect.js"

# --- 3. Write the `nconnect` wrapper that runs the bundle with bun --------
cat > "$BIN_DIR/nconnect" <<EOF
#!/usr/bin/env sh
# nconnect launcher - runs the installed Bun-target JS bundle.
exec bun "$BIN_DIR/nconnect.js" "\$@"
EOF
chmod +x "$BIN_DIR/nconnect"

# Short aliases: nclaude / nopencode / ncodex / npi
cat > "$BIN_DIR/nclaude" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" claude "\$@"
EOF
chmod +x "$BIN_DIR/nclaude"

cat > "$BIN_DIR/nopencode" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" opencode "\$@"
EOF
chmod +x "$BIN_DIR/nopencode"

cat > "$BIN_DIR/ncodex" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" codex "\$@"
EOF
chmod +x "$BIN_DIR/ncodex"

cat > "$BIN_DIR/npi" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" pi "\$@"
EOF
chmod +x "$BIN_DIR/npi"

cat > "$BIN_DIR/nprime" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" prime "\$@"
EOF
chmod +x "$BIN_DIR/nprime"

cat > "$BIN_DIR/nhermes" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" hermes "\$@"
EOF
chmod +x "$BIN_DIR/nhermes"

cat > "$BIN_DIR/ndeepseek" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" deepseek "\$@"
EOF
chmod +x "$BIN_DIR/ndeepseek"

cat > "$BIN_DIR/ngrok" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" grok "\$@"
EOF
chmod +x "$BIN_DIR/ngrok"

cat > "$BIN_DIR/nunreal" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/nconnect.js" unreal "\$@"
EOF
chmod +x "$BIN_DIR/nunreal"

ok "Wrappers installed: nconnect, nclaude, nopencode, ncodex, npi, nprime, nhermes, ndeepseek, ngrok, nunreal → $BIN_DIR"

# Remove old nconnect-owned wrappers that used the upstream agent names.
# Current installs must never shadow `claude`, `codex`, or `opencode`; users
# should get the real CLIs unless they explicitly run nclaude/ncodex/nopencode/npi.
remove_legacy_shadow_wrapper() {
  name="$1"
  path="$BIN_DIR/$name"

  [ -e "$path" ] || [ -L "$path" ] || return 0

  if [ -L "$path" ]; then
    target="$(readlink "$path" 2>/dev/null || true)"
    case "$target" in
      "$BIN_DIR/nclaude"|"$BIN_DIR/ncodex"|"$BIN_DIR/nopencode"|"$BIN_DIR/npi"|"$BIN_DIR/nconnect"|"$BIN_DIR/nconnect.js")
        rm -f "$path"
        ok "Removed old nconnect shadow command: $path"
        ;;
    esac
    return 0
  fi

  if [ -f "$path" ] && grep -Fqs "$BIN_DIR/nconnect.js" "$path"; then
    rm -f "$path"
    ok "Removed old nconnect shadow command: $path"
  fi
}

remove_legacy_shadow_wrapper claude
remove_legacy_shadow_wrapper codex
remove_legacy_shadow_wrapper opencode

# --- 4. Link into the current PATH when possible -----------------------------
find_writable_path_dir() {
  old_ifs="$IFS"
  IFS=:
  for dir in $PATH; do
    IFS="$old_ifs"
    [ -n "$dir" ] || continue
    [ "$dir" != "$BIN_DIR" ] || continue
    [ -d "$dir" ] && [ -w "$dir" ] || continue
    case "$dir" in
      "$HOME"/*|/usr/local/bin|/opt/homebrew/bin)
        printf "%s" "$dir"
        return 0
        ;;
    esac
    IFS=:
  done
  IFS="$old_ifs"
  return 1
}

if LINK_DIR="$(find_writable_path_dir)"; then
  links_changed=0
  links_skipped=0

  install_link() {
    name="$1"
    target="$2"
    dest="$LINK_DIR/$name"

    if [ -e "$dest" ] || [ -L "$dest" ]; then
      # Replace anything a previous install of this tool left behind: a link
      # into our bin dir (any generation - nebiuslink, nebiusrelay, nconnect)
      # or one of our own wrapper scripts. A stale link that still resolves
      # into an old bundle would otherwise silently shadow the new commands
      # forever, because an old wrapper on PATH keeps "working".
      current="$(readlink "$dest" 2>/dev/null || true)"
      case "$current" in
        "$BIN_DIR"/*|*/.nconnect/bin/*|*/.nebiusrelay/bin/*|*/.nebiuslink/bin/*)
          ln -sf "$target" "$dest"
          links_changed=$((links_changed + 1))
          return 0
          ;;
      esac
      # A wrapper script counts as ours only if it runs a bundle from one of
      # our own install dirs - never just any "nconnect.js" on disk.
      if [ ! -L "$dest" ]; then
        bundle="$(sed -n 's/^exec bun "\([^"]*\)".*/\1/p' "$dest" 2>/dev/null | head -n 1)"
        case "$bundle" in
          "$BIN_DIR/nconnect.js"|"$HOME/.nconnect/bin/nconnect.js"|"$HOME/.nebiusrelay/bin/nebiusrelay.js"|"$HOME/.nebiuslink/bin/nebiuslink.js")
            rm -f "$dest" && ln -s "$target" "$dest"
            links_changed=$((links_changed + 1))
            return 0
            ;;
        esac
      fi
      links_skipped=$((links_skipped + 1))
      info "Skipped $dest (already exists; remove it or put $BIN_DIR earlier on PATH to use nconnect here)"
      return 0
    fi

    ln -s "$target" "$dest"
    links_changed=$((links_changed + 1))
  }

  install_link nconnect "$BIN_DIR/nconnect"
  install_link nclaude "$BIN_DIR/nclaude"
  install_link nopencode "$BIN_DIR/nopencode"
  install_link ncodex "$BIN_DIR/ncodex"
  install_link npi "$BIN_DIR/npi"
  install_link nprime "$BIN_DIR/nprime"
  install_link nhermes "$BIN_DIR/nhermes"
  install_link ndeepseek "$BIN_DIR/ndeepseek"
  install_link ngrok "$BIN_DIR/ngrok"
  install_link nunreal "$BIN_DIR/nunreal"
  if [ "$links_changed" -gt 0 ]; then
    ok "Linked $links_changed command(s) into current PATH → $LINK_DIR"
  fi
  if [ "$links_skipped" -gt 0 ]; then
    info "Skipped $links_skipped existing command(s) in $LINK_DIR"
  fi
fi

# --- 5. Help the user get it on PATH permanently -----------------------------
path_line="export PATH=\"$BIN_DIR:\$PATH\""

detect_shell_rc() {
  case "${SHELL:-}" in
    */zsh)  printf "%s/.zshrc" "$HOME" ;;
    */bash) printf "%s/.bashrc" "$HOME" ;;
    *)      printf "%s/.profile" "$HOME" ;;
  esac
}

case ":$PATH:" in
  *":$BIN_DIR:"*) ok "Already on PATH" ;;
  *)
    SHELL_RC="$(detect_shell_rc)"
    mkdir -p "$(dirname "$SHELL_RC")"
    touch "$SHELL_RC"

    if grep -Fqs "$path_line" "$SHELL_RC"; then
      ok "PATH already configured in $SHELL_RC"
    else
      {
        printf "\n# nconnect\n"
        printf "%s\n" "$path_line"
      } >> "$SHELL_RC"
      ok "Added nconnect to PATH in $SHELL_RC"
    fi

    info "Restart your shell, or run this now:"
    info "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

# Verify the install works right now if already on PATH, else with explicit PATH.
if PATH="$BIN_DIR:$PATH" nconnect --version >/dev/null 2>&1; then
  ok "Verified: $(PATH="$BIN_DIR:$PATH" nconnect --version)"
  PATH="$BIN_DIR:$PATH" nconnect __telemetry-install-completed >/dev/null 2>&1 || true
fi

bold "Done. Run \`nconnect help\` to get started."
info "On first run, nconnect will ask for your Nebius API key (Enter to skip)."
