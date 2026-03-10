#!/usr/bin/env pwsh

# SDK Performance Test Script
Set-Location -Path "$PSScriptRoot\sdk"
& npm run test:sandbag
