param(
    [string]$BaseRef = 'origin/main',
    [string]$HeadRef = 'HEAD',
    [switch]$SkipInvariantCheck
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Failures = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $Failures.Add($Message) | Out-Null
}

function Add-Warning {
    param([Parameter(Mandatory = $true)][string]$Message)
    $Warnings.Add($Message) | Out-Null
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $Output = & git -C $RepoRoot @Arguments 2>&1
    return @{
        ExitCode = $LASTEXITCODE
        Output = $Output
    }
}

function Test-GitRef {
    param([Parameter(Mandatory = $true)][string]$Ref)

    $Result = Invoke-Git -Arguments @('rev-parse', '--verify', "$Ref^{commit}")
    return $Result.ExitCode -eq 0
}

function Assert-FileContains {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $FullPath = Join-Path $RepoRoot $Path
    if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
        Add-Failure "Cannot check missing file: $Path"
        return
    }

    $Content = Get-Content -LiteralPath $FullPath -Raw
    if ($Content -notmatch $Pattern) {
        Add-Failure "$Description not found in $Path"
    }
}

function Assert-FileDoesNotContain {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $FullPath = Join-Path $RepoRoot $Path
    if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
        Add-Failure "Cannot check missing file: $Path"
        return
    }

    $Content = Get-Content -LiteralPath $FullPath -Raw
    if ($Content -match $Pattern) {
        Add-Failure "$Description found in $Path"
    }
}

if (-not $SkipInvariantCheck) {
    & (Join-Path $PSScriptRoot 'check-fork-invariants.ps1')
    if ($LASTEXITCODE -ne 0) {
        Add-Failure 'Fork invariant check failed.'
    }
}

Assert-FileContains 'docs/adr/0001-selective-feature-sync.md' 'Selective Feature Sync' 'Selective Feature Sync ADR'
Assert-FileContains 'CONTEXT.md' 'Curated Upstream Sync Commit' 'Curated Upstream Sync domain language'
Assert-FileContains 'README.md' 'Selective Feature Sync' 'Selective Feature Sync workflow documentation'
Assert-FileContains 'README.md' 'Curated Upstream Sync Commit' 'Curated Upstream Sync workflow documentation'
Assert-FileContains 'README.md' 'check-selective-feature-sync\.ps1' 'selective sync check command documentation'
Assert-FileDoesNotContain 'README.md' 'git\s+merge\s+upstream/main' 'blind upstream merge command'

$UpstreamRemote = Invoke-Git -Arguments @('remote', 'get-url', 'upstream')
if ($UpstreamRemote.ExitCode -ne 0) {
    Add-Warning 'No upstream remote is configured. Selective sync checks can still run, but upstream comparison commands will need a remote.'
} elseif (($UpstreamRemote.Output -join "`n") -notmatch 'auto-novel/auto-novel(\.git)?') {
    Add-Warning "The upstream remote does not point at auto-novel/auto-novel: $($UpstreamRemote.Output -join ' ')"
}

if (-not (Test-GitRef $HeadRef)) {
    Add-Failure "Head ref does not exist: $HeadRef"
} elseif (-not (Test-GitRef $BaseRef)) {
    Add-Warning "Base ref does not exist: $BaseRef. Skipping new-commit merge-shape check."
} else {
    $Range = "$BaseRef..$HeadRef"
    $MergeLog = Invoke-Git -Arguments @('log', '--merges', '--format=%H%x09%s', $Range)
    if ($MergeLog.ExitCode -ne 0) {
        Add-Warning "Could not inspect merge commits for range ${Range}: $($MergeLog.Output -join ' ')"
    } else {
        $BlindMergePatterns = @(
            'Merge remote-tracking branch .upstream/',
            'Merge branch .+ of https://github\.com/auto-novel/auto-novel',
            'Merge upstream/',
            'Merge .+upstream'
        )

        foreach ($Line in $MergeLog.Output) {
            foreach ($Pattern in $BlindMergePatterns) {
                if ($Line -match $Pattern) {
                    Add-Failure "Direct upstream merge commit found in ${Range}: $Line"
                    break
                }
            }
        }
    }
}

if ($Warnings.Count -gt 0) {
    Write-Host 'Warnings:' -ForegroundColor Yellow
    foreach ($Warning in $Warnings) {
        Write-Host "  - $Warning" -ForegroundColor Yellow
    }
}

if ($Failures.Count -gt 0) {
    Write-Host 'Selective feature sync check failed:' -ForegroundColor Red
    foreach ($Failure in $Failures) {
        Write-Host "  - $Failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host 'Selective feature sync check passed.' -ForegroundColor Green
