#!/usr/bin/env pwsh

# GUI Performance Test Script
Set-Location -Path "$PSScriptRoot\gui"
& npm run test:sandbag
