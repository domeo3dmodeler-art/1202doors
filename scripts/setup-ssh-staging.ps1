# Copy SSH key to staging and setup config
# Run: .\scripts\setup-ssh-staging.ps1
# Enter VM password when prompted

$keyDir = "C:\Users\petr2\.ssh\ssh-key-1773410153319"
$pubKey = Join-Path $keyDir "ssh-key-1773410153319.pub"
$stagingHost = "178.154.244.83"
$user = "ubuntu"

if (-not (Test-Path $pubKey)) {
    Write-Error "Public key not found: $pubKey"
    exit 1
}

Write-Host "Copying public key to $user@${stagingHost}..."
Get-Content $pubKey | ssh "${user}@${stagingHost}" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Key added. Testing key login..."
    ssh -i (Join-Path $keyDir "ssh-key-1773410153319") "${user}@${stagingHost}" "echo OK"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Key login OK."
    }
}

$sshConfigDir = Join-Path $env:USERPROFILE ".ssh"
$sshConfigPath = Join-Path $sshConfigDir "config"
$privateKeyPath = Join-Path $keyDir "ssh-key-1773410153319"
$configBlock = @"
Host domeo-staging
    HostName $stagingHost
    User $user
    IdentityFile $privateKeyPath
"@

if (-not (Test-Path $sshConfigDir)) {
    New-Item -ItemType Directory -Path $sshConfigDir -Force | Out-Null
}
if (-not (Test-Path $sshConfigPath)) {
    Set-Content -Path $sshConfigPath -Value $configBlock.Trim() -Encoding UTF8
    Write-Host "Created $sshConfigPath - use: ssh domeo-staging"
} else {
    $content = Get-Content $sshConfigPath -Raw
    if ($content -notmatch "domeo-staging") {
        Add-Content -Path $sshConfigPath -Value $configBlock -Encoding UTF8
        Write-Host "Added domeo-staging to $sshConfigPath"
    } else {
        Write-Host "domeo-staging already in config"
    }
}
