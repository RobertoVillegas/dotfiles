[CmdletBinding(SupportsShouldProcess)] param([Parameter(Mandatory)][ValidateSet('Training','Balanced','Gaming')][string]$Mode,[string]$Distro='Ubuntu-26.04',[switch]$AllowStopDocker)
$ErrorActionPreference='Stop'; $here=Split-Path $MyInvocation.MyCommand.Path
if($Mode -in 'Training','Balanced'){
 & (Join-Path $here 'configure-wsl.ps1') -Preset $Mode -Distro $Distro -Confirm:$false
 $docker="$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"; if(Test-Path $docker){Start-Process $docker}; wsl.exe -d $Distro --exec /bin/true
 wsl.exe -d $Distro -- /usr/lib/wsl/lib/nvidia-smi
} else {
 $running=@(docker ps --format '{{.ID}} {{.Names}}' 2>$null); if($running.Count){Write-Warning "Running containers detected:`n$($running -join "`n")"; throw 'Checkpoint and stop project containers explicitly before Gaming mode'}
 if((Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue) -and !$AllowStopDocker){throw 'Re-run with -AllowStopDocker after confirming Docker Desktop may close'}
 if($AllowStopDocker){Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue|Stop-Process}; if($PSCmdlet.ShouldProcess('all WSL distros','shutdown to release resources')){wsl.exe --shutdown}
}