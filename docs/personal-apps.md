# Personal apps outside Homebrew

These personal-workstation apps are not available as Homebrew casks, so the
Brewfile cannot install them. After running bootstrap with `--personal`,
install each one manually.

| App | Developer | Source |
| --- | --- | --- |
| Ports | Alexander Tapper (`com.atapper.Ports`) | Direct download; reuse the original purchase email or license link. |
| SwitchBar | WebCatalog | <https://webcatalog.io/en/switchbar> |
| Sleeve | Replay Software | <https://replay.software/sleeve> |

Everything else in the personal setup comes from the Brewfile: casks are
installed by `brew bundle` and Mac App Store apps by `mas` entries such as
`mas "Flow", id: 1423210932`.
