# ============================================================
#  build-csg-manifest.ps1
#  ------------------------------------------------------------
#  Scansiona csg/*.csg e produce csg/manifest.js con tutti i
#  contenuti embedded come stringhe JS.
#
#  Esecuzione (dalla cartella webgl/):
#      powershell -ExecutionPolicy Bypass -File tools/build-csg-manifest.ps1
#
#  L'autoloader (js/csg-autoload.js) legge la mappa CSG_EMBEDDED
#  prodotta da questo script e registra ogni .csg in CsgScenes.
# ============================================================

$ErrorActionPreference = 'Stop'

$here       = Split-Path -Parent $MyInvocation.MyCommand.Definition
$webglRoot  = Split-Path -Parent $here
$csgDir     = Join-Path $webglRoot 'csg'
$outPath    = Join-Path $csgDir   'manifest.js'

if (-not (Test-Path $csgDir)) {
    Write-Error "Cartella non trovata: $csgDir"
    exit 1
}

$files = Get-ChildItem -Path $csgDir -Filter '*.csg' -File |
         Sort-Object Name

# costruisce una tabella { nome -> contenuto }
$table = [ordered]@{}
foreach ($f in $files) {
    $table[$f.Name] = Get-Content -Raw -Encoding UTF8 -LiteralPath $f.FullName
}

# ConvertTo-Json produce un letterale JS valido (JSON e' un subset).
# -Depth alto per sicurezza, -Compress no (manteniamo leggibile).
$payload = $table | ConvertTo-Json -Depth 8

$header = @'
// csg/manifest.js  -  GENERATO automaticamente da tools/build-csg-manifest.ps1
// Mappa "nome.csg" -> contenuto testuale; viene letta da js/csg-autoload.js
// Per rigenerare:    powershell -ExecutionPolicy Bypass -File tools/build-csg-manifest.ps1

var CSG_EMBEDDED =
'@

# scrive UTF-8 senza BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outPath, ($header + $payload + ";`r`n"), $utf8NoBom)

Write-Host "Generato $outPath"
foreach ($f in $files) {
    Write-Host ("  - {0,-28} ({1} bytes)" -f $f.Name, $f.Length)
}
Write-Host ("Totale: {0} file." -f $files.Count)
