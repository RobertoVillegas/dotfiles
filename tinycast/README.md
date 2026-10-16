# Tinycast

`settings.tinycast` is a Tinycast **Settings & Shortcuts** export. It includes
preferences and global shortcuts, including window management bindings. It does
not include clipboard history, notes, snippets or launcher learning.

`extensions.json` lists the extensions installed on this Mac. Tinycast does not
include extension code, data, sign-ins or extension shortcuts in its backup, so
reinstall extensions in Tinycast and configure them separately when restoring.

To refresh both files, export **Settings & Shortcuts** in Tinycast → Settings →
Backup, then run from the dotfiles repo:

```sh
python3 tinycast/update.py
```

The script uses the newest `Tinycast-*.tinycast` file in Downloads. You can pass
a specific export path instead. It refuses an export containing other backup
categories. Review changes before committing: this repository is public, and
future quicklinks or custom commands may contain private information.

To restore, import `settings.tinycast` through Tinycast → Settings → Backup.
Tinycast only guarantees imports into the same app version that created the file.
