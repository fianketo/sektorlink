$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== SektorLink - podesavanje servera ===" -ForegroundColor Cyan
Write-Host ""

# 1. Node.js mora biti instaliran
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host "Node.js nije instaliran na ovom racunaru." -ForegroundColor Red
  Write-Host "Instaliraj ga sa https://nodejs.org (LTS verzija), pa pokreni ovaj fajl ponovo."
  Start-Process "https://nodejs.org"
  Read-Host "Pritisni Enter za izlaz"
  exit 1
}
Write-Host "Node.js pronadjen: $(node --version)"

# 2. config.json (napravi iz primera ako ne postoji)
if (-not (Test-Path "$root\config.json")) {
  Copy-Item "$root\config.example.json" "$root\config.json"
  Write-Host "Napravljen config.json"
}
$config = Get-Content "$root\config.json" -Raw | ConvertFrom-Json
$port = $config.port
if (-not $port) { $port = 3131 }

# 3. Instaliraj zavisnosti
Write-Host "Instaliram zavisnosti (npm install), sacekaj..."
npm install --no-fund --no-audit *> "$root\npm-install.log"
Write-Host "Zavisnosti instalirane."

$vbsPath = "$root\Pokreni SektorLink server.vbs"
if (-not (Test-Path $vbsPath)) {
  Write-Host "Upozorenje: nedostaje '$vbsPath' - autostart nece raditi." -ForegroundColor Yellow
}

$ws = New-Object -ComObject WScript.Shell

# 4. Startup prečica - server se sam pali sa Windowsom
$startupDir = [Environment]::GetFolderPath('Startup')
$startupLnk = $ws.CreateShortcut("$startupDir\SektorLink server.lnk")
$startupLnk.TargetPath = $vbsPath
$startupLnk.WorkingDirectory = $root
$startupLnk.Save()
Write-Host "Server ce se sam pokretati pri svakom paljenju racunara."

# 5. Desktop prečica - za rucno pokretanje/restart
$desktopDir = [Environment]::GetFolderPath('Desktop')
$desktopLnk = $ws.CreateShortcut("$desktopDir\SektorLink server.lnk")
$desktopLnk.TargetPath = $vbsPath
$desktopLnk.WorkingDirectory = $root
$desktopLnk.Save()
Write-Host "Napravljena ikonica 'SektorLink server' na Desktopu."

# 6. Firewall pravilo (treba administratorska prava)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
$fwName = "SektorLink server ($port)"
$fwExists = Get-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue
if ($fwExists) {
  Write-Host "Firewall pravilo za port $port vec postoji."
} elseif ($isAdmin) {
  New-NetFirewallRule -DisplayName $fwName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
  Write-Host "Otvoren port $port u Windows Firewall-u."
} else {
  Write-Host "Trazim administratorska prava da otvorim port $port u Firewall-u (potvrdi u iskocenom prozoru)..." -ForegroundColor Yellow
  Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
    '-NoProfile', '-Command',
    "New-NetFirewallRule -DisplayName '$fwName' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow"
  )
}

# 7. Pronadji lokalnu IP adresu ovog racunara
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
  Select-Object -First 1).IPAddress

# 8. Napravi spreman .url fajl za racunare koji ce koristiti samo browser
if ($ip) {
  $urlFile = "$root\SektorLink (otvori u browseru).url"
  "[InternetShortcut]`r`nURL=http://$($ip):$port/" | Set-Content -Encoding ASCII $urlFile
  Write-Host "Napravljen fajl 'SektorLink (otvori u browseru).url' - kopiraj ga na Desktop bilo kog drugog racunara."
}

# 9. Pokreni server odmah
Start-Process wscript.exe -ArgumentList "`"$vbsPath`""
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host " GOTOVO" -ForegroundColor Green
if ($ip) {
  Write-Host " Adresa servera (potrebna ostalim racunarima):"
  Write-Host " http://$($ip):$port/" -ForegroundColor Cyan
} else {
  Write-Host " Nisam uspeo automatski da nadjem IP adresu - pokreni 'ipconfig' rucno."
}
Write-Host "==================================================="
