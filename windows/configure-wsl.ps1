[CmdletBinding(SupportsShouldProcess)] param([ValidateSet('Training','Balanced')][string]$Preset='Balanced',[string]$Distro='Ubuntu-26.04',[string]$LinuxUser='rob')
$ErrorActionPreference='Stop'; $ram=[math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB); $cpu=(Get-CimInstance Win32_Processor|Measure-Object NumberOfLogicalProcessors -Sum).Sum
$pct=if($Preset -eq 'Training'){0.80}else{0.60}; $reserve=if($Preset -eq 'Training'){1}else{2}; $memory=[math]::Max(4,[math]::Floor($ram*$pct)); $processors=[math]::Max(2,$cpu-$reserve); $swap=[math]::Min(32,[math]::Max(8,[math]::Floor($ram/2)))
$content="[wsl2]`nnetworkingMode=mirrored`ndnsTunneling=true`nfirewall=true`nautoProxy=true`nguiApplications=true`nmemory=${memory}GB`nprocessors=$processors`nswap=${swap}GB`n`n[experimental]`nautoMemoryReclaim=gradual`nsparseVhd=true`n"
$path=Join-Path $env:USERPROFILE '.wslconfig'; if(Test-Path $path){Copy-Item $path "$path.before-devbox" -Force}
if($PSCmdlet.ShouldProcess($path,"write $Preset WSL preset")){Set-Content -LiteralPath $path -Value $content -Encoding ascii; wsl.exe --shutdown}
$conf="[boot]`nsystemd=true`n`n[network]`nhostname=vsss-gpu`n`n[gpu]`nenabled=true`n`n[user]`ndefault=$LinuxUser`n"
if($PSCmdlet.ShouldProcess("${Distro}:/etc/wsl.conf",'enable systemd and default user')){$conf|wsl.exe -d $Distro -u root -- tee /etc/wsl.conf|Out-Null; wsl.exe --terminate $Distro}
[pscustomobject]@{Preset=$Preset;MemoryGB=$memory;Processors=$processors;SwapGB=$swap}