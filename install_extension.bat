@echo off
:: Views Asset Manager - Installation Launcher
:: This script launches the PowerShell installer with admin privileges

title Views Asset Manager - Installation

:: Launch PowerShell script with admin privileges
powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -NoProfile -File \"%~dp0script.ps1\"' -Verb RunAs"

exit

