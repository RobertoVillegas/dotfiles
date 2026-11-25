---
name: files-upload
description: Publish a local file at a public https://files.roberto.lol URL and get a shareable link, with a mobile-friendly PDF viewer. Use when the user asks to share, publish, host, upload or "send a link to" a file, PDF, image, video or report.
---

# files-upload

`files-upload` uploads a file to the public file host and prints its URL. It needs only bash and curl, so it runs on the workstation and the devbox the same way.

Everything you upload is **public**. Anyone with the link can open it. The random suffix keeps the URL unguessable, not secret. Do not upload credentials, `.env` files, private keys, or personal data unless the user explicitly asks you to.

## Usage

```bash
files-upload report.pdf                          # slug from the file name
files-upload report.pdf "Q3 sales"               # custom slug  -> q3-sales-x8k2m1pq.pdf
files-upload report.pdf clients/acme/            # into a folder -> clients/acme/report-....pdf
files-upload --title "Q3 sales report" report.pdf  # title for WhatsApp/Slack previews
files-upload --json report.pdf                   # {key,url,viewer,size,contentType}
files-upload --rm https://files.roberto.lol/clients/acme/report-x8k2m1pq.pdf   # delete
```

Output: line 1 is the direct URL. For PDFs, images and video, line 2 is the viewer URL (`/v/...`).

## Which link to give the user

- **PDF:** give the `/v/` viewer URL. It renders with PDF.js on every device, including Android Chrome, which otherwise downloads the PDF, and it shows a clean title in chat link previews. Mention the direct URL only if they need the raw file.
- **Images and video:** use the `/v/` URL for chat previews and the direct URL to embed.
- **Other types:** give the direct URL. Office and ZIP files download; text, CSV, JSON and Markdown display as plain text.

## Notes

- The token comes from `$FILES_UPLOAD_TOKEN` or `~/.config/files-upload/token`. If neither is set, say so and stop. Never print the token, commit it, or pass it in a URL.
- To give a machine the token, run this on the workstation: `ssh <host> '~/.local/bin/files-upload --set-token' < ~/.config/files-upload/token`. It checks the token against the server before saving it.
- Uploads go through the Worker, so a single file can be at most about 100 MB.
- Re-uploading the same file creates a new URL. To replace a file in place, pass its existing key without the extension as dest, plus `--overwrite --no-suffix`. For example: `files-upload --overwrite --no-suffix new.pdf clients/acme/report-x8k2m1pq`.
- Nothing ever lists the bucket. If you need the URL later, record it when you upload.
- The server (Worker and R2) lives in `~/Developer/files-roberto-lol` on the workstation. This script and this skill live in the dotfiles.
