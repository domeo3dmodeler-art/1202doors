# Скачивает Chrome .deb на ПК для последующей загрузки на ВМ.
# После скачивания: .\scripts\setup-vm-chromium.ps1 -LocalDeb "<путь из вывода>"
$url = "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
$out = Join-Path $env:TEMP "google-chrome-stable_current_amd64.deb"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Host "Downloading to $out ..." -ForegroundColor Cyan
(New-Object Net.WebClient).DownloadFile($url, $out)
$len = (Get-Item $out).Length
Write-Host "Done. Size: $([math]::Round($len/1MB, 2)) MB" -ForegroundColor Green
Write-Host "Run: .\scripts\setup-vm-chromium.ps1 -LocalDeb `"$out`""
