# Devbox setup

The devbox role turns an existing macOS or Linux machine into a headless
development host without installing workstation or personal applications.

```sh
./bootstrap --devbox
```

The command is idempotent. Existing Homebrew packages, Oh My Zsh, proto,
Tailscale, OrbStack, and agent CLIs are reused or updated in place.

## Automated setup

The role installs the portable development toolchain, Mosh, Hunk, Herdr, the
`herdr-file-viewer` and Termscope plugins, agent CLIs, Ax, Agent Browser,
Portless, the shared devbox context, global networking, browser-automation,
Herdr, skill-discovery, and Context7 documentation skills, and LazyPi's complete
public Pi catalog. macOS receives Tailscale and OrbStack; Linux receives Docker
clients but leaves the daemon to the distribution package manager.

The CLI toolbox includes Fastfetch, bottom, btop, dust, duf, procs, just,
Watchexec, Hyperfine, yq, ShellCheck, shfmt, Git LFS, and tealdeer. LazyGit and
Delta cover local Git work, ghui covers GitHub pull requests and Actions, and
LazyDocker provides an interactive view of Docker and Compose. Fastfetch is
available on demand and is not run automatically during SSH login. macOS also
gets Mole's `mo` command for interactive maintenance and disk analysis.

LazyPi is installed through its pinned official installer. It provisions the
public extensions, themes, agents, skills, and Compound Engineering output, but
the dotfiles never manage `~/.pi` itself. Pi credentials, sessions, memory,
backups, and local settings remain machine-private.

On Linux, install and enroll the distro-supported Tailscale package and install
Docker Engine through the distribution's supported packages. The profile does
not attempt privileged cross-distribution daemon installation.

Run the read-only validation after bootstrap:

```sh
devbox-doctor
```

## JavaScript toolchain

Proto installs and pins Node, npm, pnpm, and Bun from `~/.proto/.prototools`.
Proto is the version manager; pnpm and Bun remain available side by side. For
each project, follow its `packageManager` field and existing lockfile. Do not
create a second lockfile or migrate package managers implicitly.

## macOS system setup

Keep the machine connected to power and configure it not to sleep while on AC.
The dotfiles do not change power settings, FileVault, Remote Login, or the
hostname.

Set the hostname if desired:

```sh
sudo scutil --set ComputerName devbox
sudo scutil --set LocalHostName devbox
sudo scutil --set HostName devbox
```

Enable Remote Login for only the development account in System Settings under
General, Sharing. Enroll Tailscale, enable MagicDNS, and confirm both commands:

```sh
ssh USER@devbox
tailscale status
```

## Incoming SSH access

Create a distinct Ed25519 key for each client device and append only its public
key to `~/.ssh/authorized_keys`. Keep private keys and `authorized_keys` out of
this repository. Test every client before disabling password login.

On macOS, confirm `/etc/ssh/sshd_config` includes
`/etc/ssh/sshd_config.d/*`, then create a local root-owned drop-in such as:

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers YOUR_USERNAME
```

Validate with `sudo sshd -t` while an existing session remains open.

Mosh starts through SSH and then uses UDP ports 60000–61000. Include that range
if the tailnet access policy restricts traffic.

## Dedicated GitHub identity

Generate a machine-only key on the devbox:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/devbox_github -C devbox-github
```

Add the public key to GitHub once as an authentication key and again as a
signing key. Configure `~/.ssh/config` locally:

```sshconfig
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/devbox_github
    IdentitiesOnly yes
```

Create the local verification file from the public key:

```sh
mkdir -p ~/.config/git
printf '%s %s\n' "YOUR_VERIFIED_EMAIL" "$(cat ~/.ssh/devbox_github.pub)" \
  > ~/.config/git/allowed_signers
chmod 600 ~/.config/git/allowed_signers
```

Put the machine-specific Git identity and signing configuration in
`~/.gitconfig.local`, which the managed global Git config already includes:

```gitconfig
[user]
    name = YOUR_NAME
    email = YOUR_VERIFIED_EMAIL
    signingkey = ~/.ssh/devbox_github.pub
[gpg]
    format = ssh
[gpg "ssh"]
    allowedSignersFile = ~/.config/git/allowed_signers
[commit]
    gpgsign = true
[tag]
    gpgsign = true
```

## GitHub CLI OAuth on a headless macOS host

Git uses the dedicated SSH key for clone, fetch, pull, and push. GitHub CLI uses
OAuth for API operations such as pull requests, issues, and Actions.

An OAuth credential stored in the macOS login Keychain may be available to the
local graphical login session but unavailable to a separate SSH audit session.
After the normal browser login, refresh it into GitHub CLI's headless storage:

```sh
gh auth login --hostname github.com --git-protocol ssh --skip-ssh-key --web
gh auth refresh --hostname github.com --reset-scopes --insecure-storage
chmod 600 "$HOME/.config/gh/hosts.yml"
```

The resulting default OAuth scopes are `repo`, `read:org`, and `gist`. The
credential file is private to the devbox account and must never be managed by
chezmoi or committed. Keep a personal email as the global default. Override it
only inside repositories that require a different identity:

```sh
git config user.email WORK_EMAIL
```

## Services

For compatible HTTP development servers, Portless assigns a collision-free
local URL and registers the private Tailscale mapping without changing the
repository:

```sh
portless run --tailscale
portless list
tailscale serve status
```

The networking skill falls back to direct Tailscale Serve for incompatible HTTP
servers and uses it for raw TCP services:

```sh
tailscale serve --bg --https=3000 http://127.0.0.1:3000
tailscale serve --bg --tcp=5432 tcp://127.0.0.1:5432
tailscale serve status
```

Never commit application passwords. Use ignored `.env` files or the project's
existing secret-management mechanism.

## Agent web tools

Use `ax` for inexpensive HTTP fetch, discovery, extraction, and Markdown
conversion. Use the global `agent-browser` skill when a page needs JavaScript,
interaction, screenshots, console inspection, or end-to-end testing. Agent
Browser uses its own downloaded Chrome for Testing and does not require an MCP
server. Page-content boundary markers are enabled globally as a defense against
prompt injection; other security policies remain task-specific.

## Global agent skills

Codex and OpenCode discover the portable skills in `~/.agents/skills`. Claude
Code receives symlinks to the same source files under `~/.claude/skills`.

- `herdr` teaches agents to inspect and control Herdr only from a managed pane.
- `find-skills` searches the public agent-skills ecosystem.
- `find-docs` is Context7's official documentation lookup workflow.
- `agent-browser` and `devbox-network` cover browser automation and private
  service exposure.

`find-docs` calls `npx ctx7@latest` directly and does not install or configure a
Context7 MCP server. It works without authentication at the public rate limit;
Context7 login or an API key is optional and remains machine-private.
