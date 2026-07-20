#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d "$HOME/.oh-my-zsh" ]]; then
  echo "Installing Oh My Zsh..."
  RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c \
    "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

tpm_dir="$HOME/.tmux/plugins/tpm"
if [[ ! -d "$tpm_dir" ]]; then
  echo "Installing tmux plugin manager..."
  git clone --depth=1 https://github.com/tmux-plugins/tpm "$tpm_dir"
fi
