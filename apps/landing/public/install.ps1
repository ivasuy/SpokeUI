& {
    $ErrorActionPreference = 'Stop'
    $staging = $null
    try {
        if ($env:OS -ne 'Windows_NT') { throw 'This installer requires Windows.' }
        $architecture = $env:PROCESSOR_ARCHITEW6432
        if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
        if ($architecture -ne 'AMD64') { throw 'The current Windows release supports x64 only.' }
        $staging = Join-Path ([IO.Path]::GetTempPath()) ('spokeui-' + [guid]::NewGuid())
        New-Item -ItemType Directory -Path $staging | Out-Null
        $installer = Join-Path $staging 'SpokeUI.Setup.exe'
        & curl.exe --fail --location --show-error --proto '=https' --tlsv1.2 --retry 3 'https://github.com/ivasuy/SpokeUI/releases/download/v0.1.3/SpokeUI-0.1.3.Setup.exe' --output $installer
        if ($LASTEXITCODE -ne 0) { throw 'Download failed.' }
        $expected = '1f3011a38deae5cee2de4133877562bbf2ed0e073a72883c132b97c03d9d1608'
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant() -ne $expected) {
            throw 'Download checksum verification failed.'
        }
        $process = Start-Process -FilePath $installer -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
        Write-Host 'SpokeUI setup finished. Open it from the Start menu.'
    } catch {
        Write-Error $_ -ErrorAction Continue
        exit 1
    } finally {
        if ($staging -and (Test-Path -LiteralPath $staging)) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
}
