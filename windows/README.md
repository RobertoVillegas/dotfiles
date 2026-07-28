# Windows WSL/NVIDIA devbox

Run scripts from an elevated PowerShell only when they say so. Every mutating script supports `-WhatIf` and stops on errors. Logs are written under `~/devbox-logs` where applicable.

1. `bootstrap-wsl.ps1 -WhatIf`, then install the newest official Ubuntu (26.04 when listed).
2. `configure-wsl.ps1 -Preset Balanced -Distro Ubuntu-26.04 -LinuxUser rob`.
3. Apply the dotfiles inside WSL with `--target=wsl --gpu=nvidia --container=docker-desktop --remote-owner=windows`.
4. Enable only the target distro in Docker Desktop WSL Integration.
5. Add a client public key to `~/.ssh/authorized_keys`, rerun `wsl-provision`, and test SSH before password auth is disabled.
6. Run `configure-wsl-remote.ps1` elevated and validate from a tailnet client with `ssh -p 2222 USER@WINDOWS_TAILSCALE_IP`.

Use `devbox-mode.ps1 -Mode Training|Balanced|Gaming`. Gaming refuses to continue while containers run and requires `-AllowStopDocker` before closing Docker Desktop. Roll back by restoring `.wslconfig.before-devbox`, removing firewall rule `VSSS WSL SSH via Tailscale`, unregistering scheduled task `VSSS-WSL-Start`, disabling Docker Desktop integration, and importing a prior distro export. Scripts never unregister a distro.