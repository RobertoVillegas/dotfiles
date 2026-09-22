# Memoria de Pi y QMD

Los perfiles de desarrollo instalan `@tobilu/qmd` con mise y crean la colección
`pi-memory` para `~/.pi/agent/memory` (o `PI_MEMORY_DIR`). Los Markdown, índices,
modelos y credenciales son datos locales y no se guardan en los dotfiles.

Pi y Hermes pueden usar el mismo ejecutable QMD, configuración, índice y caché
de modelos. Sus memorias viven en colecciones distintas. `pi-memory` queda
excluida de búsquedas sin filtro; Pi usa `-c pi-memory` explícitamente. Esto
separa los resultados por defecto, pero no es una barrera de permisos.

En instalaciones antiguas de Hermes, configurar el comando MCP de QMD y el job
existente de actualización para usar `~/.local/share/mise/shims/qmd` en lugar
de una copia ligada a un Node antiguo. No hace falta otro servidor MCP para Pi:
la extensión ejecuta el CLI directamente.

Pi actualiza el índice y los embeddings automáticamente al iniciar y después
de escribir memoria. No se instala otro job. Una colección vacía no necesita
embeddings; los modelos se descargan cuando hacen falta.

Para verificar:

```sh
mise which qmd
qmd collection show pi-memory
qmd search "preferencias" -c pi-memory
```

En Pi, `memory_status` informa el estado de la extensión. Reiniciar Pi o usar
`/reload` después del setup. `devbox-doctor` comprueba que QMD se pueda ejecutar,
no solamente que exista un shim.
