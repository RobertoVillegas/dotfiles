[CmdletBinding(SupportsShouldProcess)] param([string]$Distro='Ubuntu-26.04',[string]$Location="C:\WSL\Ubuntu-26.04",[string]$LogDirectory="$env:USERPROFILE\devbox-logs")
$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force $LogDirectory|Out-Null; Start-Transcript -Path (Join-Path $LogDirectory "bootstrap-wsl-$(Get-Date -Format yyyyMMdd-HHmmss).log")|Out-Null
try {
 $online=(wsl.exe --list --online) -join "`n"; if($online -notmatch "(?m)^\s*$([regex]::Escape($Distro))\s"){throw "$Distro is not in the official online catalog"}
 $installed=(wsl.exe --list --quiet) -replace "`0",''; if($installed -contains $Distro){throw "$Distro already exists; refusing to replace or unregister it"}
 if($PSCmdlet.ShouldProcess('WSL','update stable release')){wsl.exe --update; if($LASTEXITCODE){throw 'wsl --update failed'}}
 if($PSCmdlet.ShouldProcess('WSL','set default version 2')){wsl.exe --set-default-version 2}
 if($PSCmdlet.ShouldProcess($Location,"install $Distro without launch")){New-Item -ItemType Directory -Force (Split-Path $Location)|Out-Null; wsl.exe --install -d $Distro --location $Location --no-launch; if($LASTEXITCODE){throw 'WSL distro install failed'}}
} finally {Stop-Transcript|Out-Null}