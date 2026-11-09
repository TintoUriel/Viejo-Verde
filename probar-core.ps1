# Corre los tests de la lógica (ViejoVerdeCore) con Swift para Windows.
# Uso, desde PowerShell en la carpeta del proyecto:   .\probar-core.ps1
# (Si Windows no deja ejecutar scripts: powershell -ExecutionPolicy Bypass -File .\probar-core.ps1)

$ErrorActionPreference = "Stop"

# Swift en Windows necesita el entorno de Visual Studio (headers de C y SDK de Windows).
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw "No encontré Visual Studio Build Tools con C++. Instalalo con winget (ver README)." }
$vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"

# Se usa el cmd.exe de Windows con ruta completa (puede haber otro 'cmd' en el PATH, ej. msys2).
& "$env:SystemRoot\System32\cmd.exe" /c "`"$vcvars`" >nul 2>nul && set" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] }
}
$env:Path += ";" + [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $env:SDKROOT) { $env:SDKROOT = [Environment]::GetEnvironmentVariable("SDKROOT", "User") }

# Solo la lógica: la app SwiftUI no compila fuera de iOS.
$env:SOLO_CORE = "1"
# '--build-system native': el sistema nuevo (swift-build) de Swift 6.4 en Windows no pasa
# las variables de Visual Studio al compilador y falla con "'stdlib.h' file not found".
swift test --build-system native @args
exit $LASTEXITCODE
