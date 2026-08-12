# dotfiles

Mi setup reproducible para una workstation o devbox en macOS y Linux. Usa
[chezmoi](https://www.chezmoi.io/) para administrar la configuración, Homebrew
para herramientas del sistema y [mise](https://mise.jdx.dev/) para Node, pnpm,
Bun y CLIs de los registros de lenguajes.

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

La workstation incluye Zsh, Oh My Zsh, Pure, Ghostty, Git, mise, herramientas
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
- T3 Code como control surface de Codex, Claude Code y OpenCode en la devbox.
- Node LTS, npm, pnpm, Bun y CLIs globales administrados por mise.
- Antigravity, Codex, Claude Code, OpenCode, Pi, LazyPi y Prime Agent.
- Ax y Agent Browser para acceso y automatización web.
- Context7 por CLI para consultar documentación actual, sin MCP.
- Skills globales para Herdr, descubrimiento y documentación.
- Fastfetch, bottom/btop y utilidades modernas para procesos, disco, tareas y archivos.
- LazyGit y Delta para Git, ghui para pull requests y LazyDocker para contenedores.
- Druk como editor de código en la terminal.
- Mole (`mo`) para mantenimiento y análisis interactivo de macOS.
- Tailscale Serve para compartir servicios de desarrollo.
- OrbStack en macOS o clientes de Docker en Linux.

```sh
curl -fsSL https://raw.githubusercontent.com/RobertoVillegas/dotfiles/main/bootstrap | bash -s -- --devbox
```

La configuración de SSH, GitHub, firmas y acceso remoto está documentada en la
[guía de la devbox](docs/devbox.md). Para validar una instalación:

```sh
devbox-doctor
```

La instalación, pairing por Tailscale y política de checkouts de T3 están en la
[guía de T3 Code](docs/t3-code.md).

## Minimal

Para una máquina ligera con shell, Git, tmux, mise y utilidades de terminal:

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

El perfil devbox además se actualiza solo una vez al día con
`~/.local/bin/dotfiles-autoupdate`, programado por un agente de launchd en macOS
y por un timer de usuario de systemd en Linux. Ambos recuperan la corrida
perdida si la máquina estaba apagada. La bitácora vive en
`~/.local/state/dotfiles/autoupdate.log`:

```sh
tail -f ~/.local/state/dotfiles/autoupdate.log   # ver la última corrida
dotfiles-autoupdate                              # forzar una ahora
```

Esa misma corrida hace `brew update && brew upgrade --formula` y un `brew
cleanup`. Los casks quedan fuera a propósito: subir 1Password, Ghostty o Raycast
sin supervisión reinicia una app que puedes estar usando. Para esos:

```sh
brew upgrade --cask
```

Para saber qué pins tienen versión más nueva disponible:

```sh
dotfiles-outdated
```

Compara lo instalado contra el upstream de cada herramienta y dice en qué
archivo se edita cada pin. `mise outdated` no sirve para esto: con una versión
exacta, la pedida siempre es la más nueva que satisface la petición.

Las versiones y CLIs administradas por mise se declaran en
`home/dot_config/mise/config.toml.tmpl`. Para agregar una CLI de npm de forma
reproducible, añade una entrada como `"npm:dev3000" = "0.0.178"`; una instalación
manual con `npm install -g` pertenece a la versión activa de Node y no pasa a
formar parte del inventario declarativo.

### Quién es dueño de qué

Cada herramienta tiene un solo dueño. Cuando hay dos, el PATH decide en silencio
y cada máquina termina con una versión distinta.

- **mise**: runtimes y cualquier CLI atado a un ecosistema de lenguaje — node,
  pnpm, bun, python, rust, uv, ruff, just y los paquetes `npm:`.
- **brew**: herramientas nativas del sistema y los casks.

Nada puede estar en ambos. Los shims de mise van primero en el PATH, así que una
copia en brew es peso muerto que además deriva.

### Seguridad de la cadena de suministro

El auto-update ejecuta lo que llegue a `origin/main`, así que una credencial
robada sería ejecución de código en las dos devbox. Tres capas:

1. **Firma verificada antes de aplicar.** `dotfiles-autoupdate` hace fetch,
   verifica que el commit venga firmado por una llave en
   `~/.config/dotfiles/allowed_signers`, y sólo entonces hace merge y aplica. Si
   la firma no verifica, aborta sin tocar nada.

   Esa lista trae **sólo la llave de la workstation**, que vive en 1Password. Las
   llaves de cada devbox están a propósito fuera: viven sin cifrar en esas
   máquinas, así que confiar en una dejaría que quien tome un devbox firme un
   commit que la otra ejecuta. Verificar usa nada más la llave pública.

2. **`mise.lock` con checksums.** El pin dice qué versión; el lockfile dice qué
   bytes exactos. Cubre las herramientas que mise descarga él mismo. Los CLIs de
   `npm:` y rust quedan fuera porque esos backends delegan la descarga a npm y
   rustup, que no le entregan a mise nada que verificar.

3. **`npm_config_ignore_scripts`.** Bloquea los `preinstall`/`postinstall`, que
   corren como tú al instalar y son la vía clásica para robar llaves y tokens.
   Estos CLIs se reinstalaron con esto y siguen funcionando, así que no hubo
   que exceptuar ninguno.

4. **Cuarentena de 24 horas.** Un paquete envenenado casi siempre se retira en
   horas, así que el riesgo no es quedarse atrás: es instalar justo dentro de esa
   ventana. Un día la cierra casi por completo sin costar frescura.

   | Capa | Ajuste | Dónde |
   | --- | --- | --- |
   | mise (toolchain) | `minimum_release_age = "24h"` | `dot_config/mise/config.toml.tmpl` |
   | pnpm (deps de proyectos) | `minimumReleaseAge: 1440` (min) | `dot_config/pnpm/config.yaml` (Linux) |
   | | | `private_Library/Preferences/pnpm/config.yaml` (macOS) |
   | bun (deps de proyectos) | `minimumReleaseAge = 86400` (seg) | `dot_bunfig.toml` |

   pnpm guarda registry y auth en INI y todo lo demás en YAML, así que la llave
   en `~/.npmrc` se ignora en silencio y npm además advierte por ella. npm no
   tiene equivalente. `dotfiles-outdated` aplica la misma ventana, así que
   tampoco propone bumpear a algo recién publicado.

   Para un hotfix legítimo dentro de la ventana: `minimumReleaseAgeExclude` en
   ese proyecto, o `minimum_release_age_excludes` en mise.

### Política de versiones

Todo se fija a una versión exacta, no a `latest`. Un `latest` se resuelve el día
que cada máquina instala la herramienta, así que dos devbox configuradas en
fechas distintas terminan en versiones distintas sin que nada lo reporte.
Actualizar es editar el número y hacer push; el auto-update diario lo propaga.

Las versiones viven junto a cada instalador:

| Herramienta | Dónde |
| --- | --- |
| node, pnpm, bun y CLIs de npm | `dot_config/mise/config.toml.tmpl` |
| Claude Code | `run_onchange_after_20-install-runtime-tools.sh.tmpl` |
| Ax, druk, LazyPi, Prime Agent | su propio `run_onchange_after_*` |
| Plugins de Herdr | `run_onchange_after_30-install-herdr-plugins.sh.tmpl` (`--ref`) |

Antigravity es la excepción: su instalador sólo acepta `--dir` y siempre baja la
release actual, así que queda en la versión del día en que se instaló la máquina.

Para revisar o reinstalar sólo los paquetes de Homebrew:

```sh
brew bundle --file="$HOME/.config/dotfiles/Brewfile"
```


## WSL2 + NVIDIA

La configuración de Windows 11, Ubuntu WSL2, Docker Desktop, CUDA, acceso remoto y rollback está en [docs/wsl-nvidia-devbox.md](docs/wsl-nvidia-devbox.md).
