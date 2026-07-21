# dotfiles

Public, cross-platform dotfiles for a development machine. The default profile
installs the shell, CLI essentials, AI coding tools, and a curated macOS setup.
Personal apps are always opt-in.

## Quick start

Run the bootstrap without options to open an interactive menu for Workstation,
Devbox, or Minimal setup:

```sh
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash
```

Defaults: `profile=dev`, `role=workstation`, `editor=zed`, `container=auto`, and
no personal apps. Automatic containers mean OrbStack on macOS; the Linux
devbox manifest installs Docker clients and leaves the daemon distro-managed.

Flags remain available for repeatable and non-interactive installs:

```sh
# Minimal shell and CLI setup
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --minimal

# Development setup with VS Code
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --dev --editor=vscode

# Development and personal macOS apps
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --dev --personal --editor=both

# Headless devbox on macOS or Linux
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --devbox
```

Run `./bootstrap --help` for every option. The script is idempotent and uses
[chezmoi](https://www.chezmoi.io/) for files and Homebrew Bundle for packages.

## Profiles

- `minimal`: Zsh, Oh My Zsh, Pure, Git, tmux, proto, and core CLI tools.
- `dev`: minimal plus AI agents, runtimes, development tools, DataGrip, Postman,
  Bruno, and Paper on macOS.
- `--devbox`: headless `dev` role with Mosh, Herdr, agents, private Tailscale
  service workflows, and no workstation or personal applications.
- `--personal`: Spotify and Flow. Sleeve and Ports require a manual download
  because they do not have reliable Homebrew casks.

The macOS `dev` profile adds Ghostty, Raycast, 1Password, Tailscale, Handy, and
Zen. Linux receives the portable CLI setup; GUI applications remain
distro-specific.

See [the devbox guide](docs/devbox.md) for SSH, GitHub, Tailscale, and the
manual security steps that deliberately remain outside bootstrap.

The manifest intentionally excludes Neovim, Starship, DuckDB, Plex, VLC, Podman,
QEMU, and emulators. Pure is the Zsh prompt, proto manages language runtimes,
and OrbStack is the default macOS container runtime. VS Code extensions are
left to Settings Sync instead of being pinned in the Brewfile.

## Secrets

This repository contains no credentials. Authentication state for GitHub,
1Password, Codex, Claude, Pi, OpenCode, and other tools is deliberately ignored.
Git identity can be supplied during bootstrap:

```sh
DOTFILES_GIT_NAME="Your Name" DOTFILES_GIT_EMAIL="you@example.com" ./bootstrap
```

After setup, sign in to each service normally. If Git commit signing through
1Password is desired, configure it locally; the public Git template does not
publish an SSH key fingerprint or signing identity. Put machine-specific Git
settings in `~/.gitconfig.local`; it is included automatically and is not
managed by this repository. The personal profile also expects the Mac App
Store to be signed in before installing Flow.

## Updating

```sh
chezmoi update
brew bundle --file="$HOME/.config/dotfiles/Brewfile"
```
