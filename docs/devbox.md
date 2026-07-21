# Devbox setup

The devbox role turns an existing macOS or Linux machine into a headless
development host without installing workstation or personal applications.

```sh
./bootstrap --devbox
```

The command is idempotent. Existing Homebrew packages, Oh My Zsh, proto,
Tailscale, OrbStack, and agent CLIs are reused or updated in place.

## Automated setup

The role installs the portable development toolchain, Mosh, Herdr, agent CLIs,
the shared devbox context, and the `devbox-network` skill. macOS receives
Tailscale and OrbStack; Linux receives Docker clients but leaves the daemon to
the distribution package manager.

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

## Restricted GitHub CLI token on macOS

Create a fine-grained token limited to the required repositories. Typical
permissions are Metadata read, Contents read, Pull requests write, Issues
write when needed, and Actions read. Do not grant Administration, Secrets,
Variables, Workflows, Webhooks, Environments, or organization administration.

Store the token without putting it in shell history:

```zsh
read -s "GH_TOKEN?Paste the restricted token: "
echo
security add-generic-password -U -a "$USER" \
  -s github-devbox-gh-token -w "$GH_TOKEN"
unset GH_TOKEN
```

The devbox `~/.local/bin/gh` wrapper retrieves it only for each `gh` invocation
rather than exporting it to every child process, including agent sessions.

## Services

Bind services to loopback and use the installed skill to expose them privately:

```sh
tailscale serve --bg --https=3000 http://127.0.0.1:3000
tailscale serve --bg --tcp=5432 tcp://127.0.0.1:5432
tailscale serve status
```

Never commit application passwords. Use ignored `.env` files or the project's
existing secret-management mechanism.
