# Desarrollo HTTP privado

Todo lo que se comparte en el tailnet vive exactamente lo que vive su proceso.
Nada queda publicado cuando el servicio ya no existe.

## HTTP: `dev` (Portless)

`dev` ejecuta Portless con Tailscale activado. El proxy local escucha en
loopback:1355 por HTTP; el acceso remoto usa HTTPS de Tailscale. No modifica
/etc/hosts ni instala certificados locales. No usa Funnel.

- `dev`: descubre el script dev del proyecto actual. En monorepos puede descubrir varias apps; para ejecutar una sola, entra a su workspace.
- `dev nombre bun run dev`: nombre y comando explícitos.
- `dev nombre --app-port 3000 bun run dev`: para aplicaciones que fijan el puerto en su script.
- `dev list`: URLs locales y de Tailscale activas.
- `PORTLESS=0 dev`: sin proxy.
- Ctrl+C en el proceso: detiene la app y retira su ruta de Tailscale.

Los procesos iniciados con `bun run dev` directamente no se interceptan. Usa `dev`
para exposición automática.

## TCP o HTTP incompatible con Portless: `expose`

`expose` publica un puerto de loopback con un `tailscale serve` en primer plano,
nunca con `--bg`. Tailscale ata la ruta a la conexión del proceso y la retira en
cuanto se cierra, incluso con `kill -9`.

- `expose 5432`: comparte un servicio que ya corre, hasta Ctrl+C.
- `expose 3000 -- bun run dev`: corre el comando y comparte su puerto; si uno de los dos termina, termina el otro.
- `expose --tcp 5432 -- postgres …`: TCP crudo en vez de HTTPS.

Usa puertos del tailnet desde 9443 para no chocar con los de Portless.

## Rutas huérfanas: `devbox-serve-gc`

Portless registra sus rutas con `tailscale serve --bg`, que persiste. Si su
sesión muere sin salir limpio (SIGKILL, crash, un panel cerrado), la ruta
sobrevive. `devbox-serve-gc` corre cada dos minutos (LaunchAgent o timer de
systemd) y al iniciar `dev`, y retira las rutas cuyo backend lleva más de dos
minutos sin escuchar.

- `devbox-serve-gc --check`: lista rutas muertas sin tocar nada.
- `devbox-serve-gc --dry-run`: muestra lo que retiraría.
- `~/.config/devbox/serve-keep`: puertos compartidos a propósito que nunca retira (T3 Code en 443).

No toca rutas de una sesión de Portless viva ni las que no apuntan a loopback.
Registro: `~/.local/state/devbox/serve-gc.log`.

Las bases de datos y servidores TCP no se descubren ni se publican solos. Nunca
publiques una base de datos sin autenticación propia.
