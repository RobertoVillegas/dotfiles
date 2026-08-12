# General-purpose WSL2 + NVIDIA devbox

The supported WSL contract is `--devbox --target=wsl --gpu=nvidia --container=docker-desktop --remote-owner=windows --editor=none`. Windows owns the NVIDIA driver, Tailscale, and Docker Desktop. Ubuntu owns systemd and OpenSSH on TCP 2222. Never install `nvidia-driver-*`, `cuda-drivers`, Docker Engine, NVIDIA Container Toolkit, ROS 2, Gazebo, PyTorch, or CUDA Toolkit as part of this base profile.

## Install

Inventory and back up `.wslconfig`, Docker settings, firewall rules, scheduled tasks, and any distro that will be changed. Confirm BitLocker recovery before platform changes. Run `windows/bootstrap-wsl.ps1` for the newest official Ubuntu name, then `windows/configure-wsl.ps1`. On first launch create a non-root user. Apply this branch from the Linux filesystem and rerun it to prove idempotence:

```sh
./bootstrap --devbox --target=wsl --gpu=nvidia --container=docker-desktop --remote-owner=windows --editor=none
```

Add only a public client key to `~/.ssh/authorized_keys`, rerun `wsl-provision`, validate a second SSH login, and confirm `PasswordAuthentication no` with `sshd -T`. Enable Docker Desktop WSL2 integration only for the target distro. Do not expose TCP 2222 on the router.

## Validate

Run `devbox-doctor`, `wsl-doctor`, and `gpu-doctor`. Set digest-pinned official images before `container-gpu-doctor` and `rl-smoke-doctor`. Reports belong under `~/devbox-reports/TIMESTAMP`, not Git. This Ubuntu distro is the general development host, not a VSSS-only container. Active code and data belong under `~/src`, `~/work`, `~/data`, `~/runs`, `~/checkpoints`, and `~/replays`; `/mnt/c` is only an allowed backup destination. This follows Microsoft's [WSL filesystem performance guidance](https://learn.microsoft.com/en-us/windows/wsl/filesystems#file-storage-and-performance-across-file-systems).

Remote access is `ssh -p 2222 USER@WINDOWS_TAILSCALE_IP`; recover a session with `tmux attach -t dev`. Forward dashboards with `ssh -L 6006:127.0.0.1:6006 -p 2222 USER@WINDOWS_TAILSCALE_IP`. Mirrored networking is preferred. If it fails, document the reason, switch to NAT, add a narrow Windows portproxy and updater task, and keep external port 2222.

T3 Code runs as the official systemd user service inside Ubuntu. Its managed
`tailscale` wrapper calls the Windows CLI, so `t3 pair --tailscale` publishes the
WSL backend through the Windows-owned tailnet without adding Linux `tailscaled`.
This path requires Windows to reach WSL loopback under mirrored networking; see
[T3 Code](t3-code.md) before configuring pairing or Tailscale Serve. Run the
pairing command through `wsl.exe` from elevated PowerShell if Windows requires
administrator rights to change its Serve map.

## Operation and rollback

Use `windows/devbox-mode.ps1 -Mode Training`, `Balanced`, or `Gaming`. Gaming refuses active containers; checkpoint first. `tmux` survives disconnects but not Windows restarts or `wsl --shutdown`.

Rollback is recoverable: restore the hashed `.wslconfig` backup; remove the `VSSS WSL SSH via Tailscale` firewall rule and `VSSS-WSL-Start` task; disable Docker Desktop integration for the distro; restore `/etc/ssh/sshd_config.d/60-devbox.conf` from backup or remove only that managed drop-in; and import a verified distro export when one exists. Never use `wsl --unregister` as an automated rollback. The VHD location, export/import commands, checkpoint directories, DNS/GPU troubleshooting and all effective commands must be recorded in the machine report.
