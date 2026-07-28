[CmdletBinding(SupportsShouldProcess)] param([string]$Distro='Ubuntu-26.04')
$ErrorActionPreference='Stop'; $exe="$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"; if(!(Test-Path $exe)){throw 'Docker Desktop is not installed'}
$settings="$env:APPDATA\Docker\settings-store.json"; if(!(Test-Path $settings)){throw 'Docker Desktop settings are unavailable; start Docker Desktop once'}
$j=Get-Content $settings -Raw|ConvertFrom-Json; if(-not $j.WslEngineEnabled){throw 'Enable the WSL2 engine in Docker Desktop settings'}
if($PSCmdlet.ShouldProcess('Docker Desktop','start and validate WSL2 backend')){Start-Process $exe; $deadline=(Get-Date).AddMinutes(2); do{Start-Sleep 2; docker info *> $null}until($LASTEXITCODE -eq 0 -or (Get-Date)-gt $deadline); if($LASTEXITCODE){throw 'Docker Desktop daemon did not become ready'}}
Write-Host "Enable WSL integration only for $Distro in Settings > Resources > WSL Integration, then run windows-doctor.ps1."