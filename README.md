# dotfiles

Mi setup reproducible para una workstation o devbox en macOS y Linux. Usa
[chezmoi](https://www.chezmoi.io/) para administrar la configuración, Homebrew
para herramientas del sistema y [Proto](https://moonrepo.dev/proto) para Node,
pnpm y Bun.

## Empezar

En una máquina nueva:

```sh
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash
```

El instalador muestra un menú con tres opciones:

- **Workstation:** entorno de desarrollo y aplicaciones de macOS.
- **Devbox:** host remoto para desarrollar por SSH, Mosh y Tailscale.
- **Minimal:** shell y herramientas esenciales para terminal.

El proceso es idempotente, así que el mismo comando sirve para terminar una
instalación interrumpida o aplicar una actualización.

## Estructura

```text
home/       configuración administrada por chezmoi
docs/       guías para tareas que requieren intervención manual
bootstrap   instalador y selector de perfiles
```

Los nombres técnicos dentro de `home/` representan atributos de chezmoi. Por
ejemplo, `dot_zshrc.tmpl` produce `~/.zshrc`, mientras que `executable_` y
`symlink_` conservan el tipo correcto del archivo al instalarlo.

## Workstation

La workstation incluye Zsh, Oh My Zsh, Pure, Ghostty, Git, Proto, herramientas
de desarrollo, agentes de código y aplicaciones como Raycast, 1Password,
Tailscale y Zen. Durante el setup se puede elegir Zed, VS Code, ambos o ninguno.
Las skills portables de Herdr, descubrimiento y documentación actual se
comparten con el perfil devbox.

Las aplicaciones personales son opcionales:

```sh
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --dev --personal
```

## Devbox

El perfil devbox prepara una máquina macOS o Linux para trabajar remotamente:

- SSH y Mosh sobre Tailscale.
- Herdr, Hunk, tmux y herramientas de terminal.
- Node, npm, pnpm y Bun administrados por Proto.
- Codex, Claude Code, OpenCode, Pi y LazyPi.
- Ax y Agent Browser para acceso y automatización web.
- Context7 por CLI para consultar documentación actual, sin MCP.
- Skills globales para Herdr, descubrimiento y documentación.
- Fastfetch, bottom/btop y utilidades modernas para procesos, disco, tareas y archivos.
- LazyGit y Delta para Git, ghui para pull requests y LazyDocker para contenedores.
- Portless y Tailscale Serve para compartir servicios de desarrollo.
- OrbStack en macOS o clientes de Docker en Linux.

```sh
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --devbox
```

La configuración de SSH, GitHub, firmas y acceso remoto está documentada en la
[guía de la devbox](docs/devbox.md). Para validar una instalación:

```sh
devbox-doctor
```

## Minimal

Para una máquina ligera con shell, Git, tmux, Proto y utilidades de terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --minimal
```

## Configuración privada

El repositorio es público y no administra credenciales, llaves SSH, sesiones,
memoria de agentes ni tokens. Cada herramienta conserva su autenticación en la
máquina correspondiente.

La identidad y firma de Git específicas de una máquina viven en
`~/.gitconfig.local`, que se incluye desde la configuración global pero no se
versiona. La identidad inicial puede indicarse durante bootstrap:

```sh
DOTFILES_GIT_NAME="Your Name" DOTFILES_GIT_EMAIL="you@example.com" ./bootstrap
```

## Actualizar

```sh
chezmoi update
```

Para revisar o reinstalar sólo los paquetes de Homebrew:

```sh
brew bundle --file="$HOME/.config/dotfiles/Brewfile"
```
