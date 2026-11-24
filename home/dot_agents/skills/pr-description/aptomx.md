# aptomx PR layout

Roberto approved this layout for every aptomx PR body. Write it in natural Spanish, using only the sections the PR needs, in this order.

1. `## Resumen`: 3–4 bullets that start with a verb. Merge order and deploy constraints go here in **bold**.
2. `## Contrato HTTP`: the endpoint in a `text` block, a request/response JSON example, then short rule bullets (status codes, error `codeName`s).
3. `## Cambios`: numbered subsections (`### 1. Tema`), 3–6 one-line bullets each. A deviation from the ticket sits on its bullet: "(la tarea pide …)".
4. `## Para el front`: one-line bullets with what the client has to change.
5. `## Validación`: build, lint, and migrations, then 3–5 summary bullets. Then a folded block:

   ````markdown
   <details><summary>Casos probados (N ✔)</summary>

   ```text
   Alta
   ✔ rol super-admin → 403 PROTECTED_ROLE
   ✔ correo repetido → 409 EMAIL_ALREADY_EXISTS
   ```
   </details>
   ````

   Group cases by topic. Keep lines under about 60 characters, continuing a long result on an indented next line.
6. `## Pruebas`: one bullet, when the repository's test policy matters to the reviewer.
7. A folded `<details>` titled `Requerimientos de ABC-12 · N ✅ · N ⚠️ · N ❌`. It lists every technical criterion and test from the ticket on its own short line: ✅ met, ⚠️ agreed deviation (reason), ❌ not met (reason), `↪ en #N` when another PR covers it.

The title carries the ticket key in parentheses, `(ABC-12)`, plus the topic; English or Spanish both work.

Show a before/after on one bullet ("antes 500 → ahora 400"); Roberto finds tables harder to scan in review.
