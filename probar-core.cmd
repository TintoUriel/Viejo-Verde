@echo off
rem Corre los tests de la logica sin cambiar la politica de ejecucion de PowerShell.
rem Uso: probar-core   (o doble clic)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0probar-core.ps1" %*
