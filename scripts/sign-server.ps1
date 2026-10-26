# Signing server for releases: holds the Certum token session so the PIN is asked once per build.
# Tauri's signCommand (scripts/sign-client.ps1) sends each file path over the named pipe.
# Renewing the certificate means changing this thumbprint.
$Thumbprint = '9104B16C1523CEBB0A3605EA176330DD30587AEE'
$PipeName = 'ntfier-sign'

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    [Console]::Error.WriteLine("[sign-server] $Message")
    exit 1
}

$cert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint" -ErrorAction SilentlyContinue
if (-not $cert) { Fail "certificate $Thumbprint not found in Cert:\CurrentUser\My (is the token plugged in?)" }
if (-not $cert.HasPrivateKey) { Fail "certificate $Thumbprint has no private key (is the token plugged in?)" }

$signtool = $env:TAURI_WINDOWS_SIGNTOOL_PATH
if (-not $signtool) {
    $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [version]$_.Directory.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $signtool -or -not (Test-Path -LiteralPath $signtool)) { Fail 'signtool.exe not found (install the Windows SDK or set TAURI_WINDOWS_SIGNTOOL_PATH)' }

$releaseDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src-tauri\target\release')) + '\'
# makensis signs the uninstaller from %TEMP%\nst*.tmp; TEMP may be an 8.3 short path, so accept both spellings.
$tempDirs = @($env:TEMP, [IO.Path]::GetTempPath()) | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') }

function Test-Allowed([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.StartsWith($releaseDir, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    $dir = [IO.Path]::GetDirectoryName($full)
    return ($tempDirs -contains $dir) -and ([IO.Path]::GetFileName($full) -like 'nst*.tmp')
}

try {
    # One instance only: a second server fails here while this one runs.
    $pipe = [IO.Pipes.NamedPipeServerStream]::new($PipeName, 'InOut', 1, 'Byte', 'CurrentUserOnly')
} catch {
    Fail "cannot open pipe \\.\pipe\$PipeName (another sign server running?): $($_.Exception.Message)"
}

$count = 0
Write-Host "[sign-server] cert: $($cert.Subject)"
Write-Host "[sign-server] signtool: $signtool"
Write-Host "[sign-server] ready on \\.\pipe\$PipeName"

while ($true) {
    $pipe.WaitForConnection()
    try {
        $reader = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8, $false, 4096, $true)
        $writer = [IO.StreamWriter]::new($pipe, [Text.UTF8Encoding]::new($false), 4096, $true)
        $writer.AutoFlush = $true
        $path = $reader.ReadLine()
        try {
            if (-not $path -or -not (Test-Allowed $path)) { throw "path not allowed: $path" }
            # The key is used in this process only, so the token keeps the PIN after the first prompt.
            $sig = Set-AuthenticodeSignature -LiteralPath $path -Certificate $cert -HashAlgorithm SHA256
            if ($sig.Status -ne 'Valid') { throw "Set-AuthenticodeSignature: $($sig.Status) $($sig.StatusMessage)" }
            # Timestamping does not use the private key, so a child signtool asks for no PIN.
            $out = & $signtool timestamp /tr http://time.certum.pl /td sha256 $path 2>&1
            if ($LASTEXITCODE -ne 0) { throw "signtool timestamp: $out" }
            $count++
            Write-Host "[sign-server] #$count OK $path"
            $writer.WriteLine('OK')
        } catch {
            Write-Host "[sign-server] ERR $path : $($_.Exception.Message)"
            $writer.WriteLine("ERR $($_.Exception.Message)")
        }
    } catch {
        Write-Host "[sign-server] connection error: $($_.Exception.Message)"
    } finally {
        if ($pipe.IsConnected) { $pipe.Disconnect() }
    }
}
