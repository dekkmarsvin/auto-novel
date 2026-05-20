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

function Get-ChangedSyncManifests {
    param([Parameter(Mandatory = $true)][string]$Range)

    $ChangedFiles = Invoke-Git -Arguments @('diff', '--name-only', $Range)
    if ($ChangedFiles.ExitCode -ne 0) {
        Add-Warning "Could not inspect changed files for range ${Range}: $($ChangedFiles.Output -join ' ')"
        return @()
    }

    return @($ChangedFiles.Output | Where-Object { $_ -match '^docs/sync/.+\.md$' })
}

function Assert-SyncManifestContent {
    param(
        [string[]]$ManifestPaths = @(),
        [Parameter(Mandatory = $true)][string[]]$ExpectedUpstreamShas
    )

    if ($null -eq $ManifestPaths) {
        $ManifestPaths = @()
    }

    if ($ManifestPaths.Count -eq 0) {
        Add-Failure 'Upstream-derived changes found, but no docs/sync/*.md manifest was added or updated in the checked range.'
        return
    }

    $ManifestContent = ''
    foreach ($ManifestPath in $ManifestPaths) {
        $FullPath = Join-Path $RepoRoot $ManifestPath
        if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
            Add-Failure "Changed sync manifest is missing from working tree: $ManifestPath"
            continue
        }
        $ManifestContent += "`n" + (Get-Content -LiteralPath $FullPath -Raw)
    }

    if ($ManifestContent -notmatch '(?im)^\s*-\s*Candidate upstream range evaluated:') {
        Add-Failure 'Sync manifest must record "Candidate upstream range evaluated".'
    }
    if ($ManifestContent -notmatch '(?im)^For the next upstream sync, start by reviewing new upstream commits after:') {
        Add-Failure 'Sync manifest must record the next upstream sync starting point.'
    }

    foreach ($Sha in $ExpectedUpstreamShas) {
        if ([string]::IsNullOrWhiteSpace($Sha)) {
            continue
        }
        $ShortSha = $Sha.Substring(0, [Math]::Min(8, $Sha.Length))
        if ($ManifestContent -notmatch [regex]::Escape($Sha) -and $ManifestContent -notmatch [regex]::Escape($ShortSha)) {
            Add-Failure "Sync manifest does not mention upstream cherry-pick source: $Sha"
        }
    }
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
Assert-FileContains 'CONTEXT.md' 'Sync Manifest' 'Sync Manifest domain language'
Assert-FileContains 'README.md' 'Selective Feature Sync' 'Selective Feature Sync workflow documentation'
Assert-FileContains 'README.md' 'Curated Upstream Sync Commit' 'Curated Upstream Sync workflow documentation'
Assert-FileContains 'README.md' 'Sync Manifest' 'Sync Manifest workflow documentation'
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
    $ChangedSyncManifests = Get-ChangedSyncManifests -Range $Range
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

    $CherryPickSources = New-Object System.Collections.Generic.List[string]
    $CommitShas = Invoke-Git -Arguments @('log', '--reverse', '--format=%H', $Range)
    if ($CommitShas.ExitCode -ne 0) {
        Add-Warning "Could not inspect commit bodies for upstream cherry-picks in range ${Range}: $($CommitShas.Output -join ' ')"
    } else {
        foreach ($Sha in $CommitShas.Output) {
            $Body = Invoke-Git -Arguments @('log', '-1', '--format=%B', $Sha)
            if ($Body.ExitCode -ne 0) {
                Add-Warning "Could not inspect commit body for ${Sha}: $($Body.Output -join ' ')"
                continue
            }

            $BodyText = $Body.Output -join "`n"
            foreach ($Match in [regex]::Matches($BodyText, '\(cherry picked from commit ([0-9a-f]{7,40})\)')) {
                $CherryPickSources.Add($Match.Groups[1].Value) | Out-Null
            }
        }
    }

    if ($CherryPickSources.Count -gt 0) {
        Assert-SyncManifestContent `
            -ManifestPaths $ChangedSyncManifests `
            -ExpectedUpstreamShas @($CherryPickSources | Select-Object -Unique)
    }

    $SyncCommitLog = Invoke-Git -Arguments @('log', '--format=%H%x09%s', $Range)
    if ($SyncCommitLog.ExitCode -ne 0) {
        Add-Warning "Could not inspect sync manifest references for range ${Range}: $($SyncCommitLog.Output -join ' ')"
    } else {
        foreach ($Line in $SyncCommitLog.Output) {
            if ($Line -notmatch '^(?<Sha>[0-9a-f]+)\t(?<Subject>.+)$') {
                continue
            }
            $Sha = $Matches.Sha
            $Subject = $Matches.Subject
            if ($Subject -notmatch '(?i)(curated upstream sync|sync upstream|upstream sync)') {
                continue
            }

            $Body = Invoke-Git -Arguments @('log', '-1', '--format=%B', $Sha)
            $ChangedFiles = Invoke-Git -Arguments @('diff-tree', '--no-commit-id', '--name-only', '-r', $Sha)
            $HasManifestReference =
                ($Body.ExitCode -eq 0 -and (($Body.Output -join "`n") -match '(?im)^Sync-Manifest:\s+\S+')) -or
                ($ChangedFiles.ExitCode -eq 0 -and ($ChangedFiles.Output | Where-Object { $_ -match '^docs/sync/.+\.md$' })) -or
                ($ChangedSyncManifests.Count -gt 0)

            if (-not $HasManifestReference) {
                Add-Failure "Upstream sync commit lacks Sync-Manifest reference or docs/sync manifest: $Sha`t$Subject"
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
