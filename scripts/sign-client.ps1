# Tauri signCommand target: hands one file to scripts/sign-server.ps1 and waits for the result.
# Exit 0 = signed, 1 = signing failed, 2 = server not running.
param([Parameter(Mandatory)][string]$Path)

$full = (Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue).ProviderPath
if (-not $full) { [Console]::Error.WriteLine("sign-client: file not found: $Path"); exit 1 }

$pipe = [IO.Pipes.NamedPipeClientStream]::new('.', 'ntfier-sign', 'InOut', 'CurrentUserOnly')
try { $pipe.Connect(5000) } catch { [Console]::Error.WriteLine("sign-client: sign server not running: $($_.Exception.Message)"); exit 2 }
try {
    $writer = [IO.StreamWriter]::new($pipe, [Text.UTF8Encoding]::new($false), 4096, $true)
    $writer.AutoFlush = $true
    $writer.WriteLine($full)
    $reply = [IO.StreamReader]::new($pipe, [Text.Encoding]::UTF8).ReadLine()
} catch {
    [Console]::Error.WriteLine("sign-client: pipe error: $($_.Exception.Message)"); exit 1
} finally {
    $pipe.Dispose()
}
if ($reply -ne 'OK') { [Console]::Error.WriteLine("sign-client: signing $full failed: $reply"); exit 1 }
