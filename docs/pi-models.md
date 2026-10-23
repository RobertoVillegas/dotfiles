# Third-party models in Pi

Pi ships with a model catalog. Providers it does not ship are configured per
machine in `~/.pi/agent/models.json`, and their API keys stay outside the
dotfiles in `~/.config/pi/<provider>.key`. Neither file is versioned: the
catalog is machine state, and the keys are secrets.

## Where things live

| File | Holds | In the dotfiles |
| --- | --- | --- |
| `~/.pi/agent/models.json` | provider endpoints, model IDs, limits, costs, key references | never |
| `~/.config/pi/<provider>.key` | one provider's API key, mode 600 | never |

Both paths are listed in `home/.chezmoiignore`, so `chezmoi add` refuses them
instead of committing a key.

## Add a provider

1. Store the key, without a trailing newline:

   ```sh
   install -d -m 700 ~/.config/pi
   printf %s 'sk-...' > ~/.config/pi/example.key
   chmod 600 ~/.config/pi/example.key
   ```

2. Add the provider to `models.json`, referencing the key rather than
   pasting it:

   ```json
   "example": {
     "name": "Example",
     "baseUrl": "https://api.example.com/v1",
     "api": "openai-completions",
     "apiKey": "!printf %s \"${EXAMPLE_API_KEY:-$(cat \"$HOME/.config/pi/example.key\" 2>/dev/null)}\"",
     "models": [
       {
         "id": "example-model",
         "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
       }
     ]
   }
   ```

3. Verify and select it with `/model`:

   ```sh
   pi auth check --provider example --json
   pi --model example/example-model -p 'Responde exactamente: ok' --no-session -nt
   ```

## Why the key line looks like that

A value starting with `!` is a shell command run when Pi resolves the
credential, and its stdout becomes the key. The command tries the provider's
environment variable first, then the key file. Environment variables only reach
Pi when whatever launches it inherited them, and T3 Code does not inherit a
login shell, so the file is the branch that actually works on these machines.

Empty output means "no credential": Pi hides that provider's models from
`/model` instead of sending a request that fails with 401.

## Invariants

- Never put a literal key in `models.json`. A literal works, but it turns a
  machine file into a secret and makes an accidental add unrecoverable.
- Use `$HOME`, not `/Users/<name>`: the same entry then works on a workstation
  with a different home directory.
- Keys are per machine. After a rebuild, recreate `~/.config/pi` and its key
  files; nothing restores them.
- `api` maps to the wire protocol: `openai-completions`, `openai-responses`
  (a Codex `wire_api = "responses"` endpoint), `anthropic-messages`, or
  `google-generative-ai`. A gateway can expose one model on a protocol that
  does not route, so confirm the model ID against the gateway's own catalog.
- `cost`, `contextWindow`, and `maxTokens` are optional but drive the footer
  estimate and the context limit; a model without costs reports free usage.

## Unmanaged by design

`models.json` is not a template because provider lists differ per machine and
carry no shared intent. Keep the entries you want in the repository's docs
instead: this file describes the shape, not the catalog.
