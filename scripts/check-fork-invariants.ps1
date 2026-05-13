$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Failures = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return Join-Path $RepoRoot $Path
}

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $Failures.Add($Message) | Out-Null
}

function Add-Warning {
    param([Parameter(Mandatory = $true)][string]$Message)
    $Warnings.Add($Message) | Out-Null
}

function Assert-FileExists {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath (Resolve-RepoPath $Path) -PathType Leaf)) {
        Add-Failure "Missing required file: $Path"
    }
}

function Assert-FileContains {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $FullPath = Resolve-RepoPath $Path
    if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
        Add-Failure "Cannot check missing file: $Path"
        return
    }

    $Content = Get-Content -LiteralPath $FullPath -Raw
    if ($Content -notmatch $Pattern) {
        Add-Failure "$Description not found in $Path"
    }
}

function Get-FilesForDomainCheck {
    $Paths = @(
        'web',
        '.github',
        'docker-compose.yml',
        'docker-compose.dev.yml',
        'docker-compose.debug.yml'
    )

    foreach ($Path in $Paths) {
        $FullPath = Resolve-RepoPath $Path
        if (-not (Test-Path -LiteralPath $FullPath)) {
            continue
        }

        if (Test-Path -LiteralPath $FullPath -PathType Container) {
            Get-ChildItem -LiteralPath $FullPath -Recurse -File -Force |
                Where-Object {
                    $_.FullName -notlike ('*' + [System.IO.Path]::DirectorySeparatorChar + 'node_modules' + [System.IO.Path]::DirectorySeparatorChar + '*') -and
                    $_.FullName -notlike ('*' + [System.IO.Path]::DirectorySeparatorChar + 'dist' + [System.IO.Path]::DirectorySeparatorChar + '*')
                }
        } else {
            Get-Item -LiteralPath $FullPath
        }
    }
}

$RequiredFiles = @(
    'server/src/main/kotlin/api/RouteThemeGlossary.kt',
    'server/src/main/kotlin/infra/common/ThemeGlossary.kt',
    'server/src/main/kotlin/infra/common/ThemeGlossaryRepository.kt',
    'server/src/main/kotlin/Application.kt',
    'server/src/main/kotlin/api/RouteWebNovel.kt',
    'server/src/main/kotlin/api/RouteWenkuNovel.kt',
    'server/src/main/kotlin/infra/web/WebNovel.kt',
    'server/src/main/kotlin/infra/wenku/WenkuNovel.kt',
    'server/src/main/kotlin/infra/MongoClient.kt',
    'web/src/api/novel/ThemeGlossaryApi.ts',
    'web/src/model/ThemeGlossary.ts',
    'web/src/components/GlossaryButton.vue',
    'web/src/pages/workspace/components/ToolboxItemThemeGlossary.vue',
    'web/src/pages/novel/components/TranslateOptions.vue',
    'web/src/pages/novel/components/WebNovelWide.vue',
    'web/src/pages/novel/components/WebTranslate.vue',
    'web/src/pages/novel/WenkuNovel.vue',
    'web/src/api/novel/WebNovelApi.ts',
    'web/src/api/novel/WenkuNovelApi.ts',
    'web/src/model/WebNovel.ts',
    'web/src/model/WenkuNovel.ts',
    'docker-compose.dev.yml'
)

foreach ($Path in $RequiredFiles) {
    Assert-FileExists $Path
}

Assert-FileContains 'server/src/main/kotlin/Application.kt' 'ThemeGlossaryRepository' 'ThemeGlossary repository DI registration'
Assert-FileContains 'server/src/main/kotlin/Application.kt' 'ThemeGlossaryApi' 'ThemeGlossary API DI registration'
Assert-FileContains 'server/src/main/kotlin/Application.kt' 'routeThemeGlossary\(\)' 'ThemeGlossary route registration'
Assert-FileContains 'server/src/main/kotlin/infra/MongoClient.kt' 'THEME_GLOSSARY\s*=\s*"theme-glossary"' 'ThemeGlossary Mongo collection constant'

Assert-FileContains 'server/src/main/kotlin/infra/web/WebNovel.kt' 'themeGlossaryId' 'WebNovel themeGlossaryId field'
Assert-FileContains 'server/src/main/kotlin/infra/wenku/WenkuNovel.kt' 'themeGlossaryId' 'WenkuNovel themeGlossaryId field'
Assert-FileContains 'server/src/main/kotlin/api/RouteWebNovel.kt' 'themeGlossaryRepo' 'WebNovel translate API ThemeGlossary repository dependency'
Assert-FileContains 'server/src/main/kotlin/api/RouteWenkuNovel.kt' 'themeGlossaryRepo' 'WenkuNovel translate API ThemeGlossary repository dependency'
Assert-FileContains 'server/src/main/kotlin/api/RouteWebNovel.kt' 'themeGlossaryId' 'WebNovel API themeGlossaryId handling'
Assert-FileContains 'server/src/main/kotlin/api/RouteWenkuNovel.kt' 'themeGlossaryId' 'WenkuNovel API themeGlossaryId handling'
Assert-FileContains 'server/src/main/kotlin/api/RouteWebNovel.kt' 'themeGlossaryRepo\.get\(it\)\?\.glossary[\s\S]*\+ novel\.glossary' 'WebNovel theme glossary merge order'
Assert-FileContains 'server/src/main/kotlin/api/RouteWenkuNovel.kt' 'themeGlossaryRepo\.get\(it\)\?\.glossary[\s\S]*\+ novel\.glossary' 'WenkuNovel theme glossary merge order'

Assert-FileContains 'web/src/model/WebNovel.ts' 'themeGlossaryId' 'WebNovel DTO themeGlossaryId field'
Assert-FileContains 'web/src/model/WenkuNovel.ts' 'themeGlossaryId' 'WenkuNovel DTO themeGlossaryId field'
Assert-FileContains 'web/src/api/novel/WebNovelApi.ts' 'themeGlossaryId' 'WebNovel API client themeGlossaryId payload'
Assert-FileContains 'web/src/api/novel/WenkuNovelApi.ts' 'themeGlossaryId' 'WenkuNovel API client themeGlossaryId payload'
Assert-FileContains 'web/src/components/GlossaryButton.vue' 'ThemeGlossaryApi\.list' 'GlossaryButton ThemeGlossary list loading'
Assert-FileContains 'web/src/components/GlossaryButton.vue' 'update:themeGlossaryId' 'GlossaryButton themeGlossaryId event'
Assert-FileContains 'web/src/pages/novel/components/TranslateOptions.vue' 'themeGlossaryId' 'TranslateOptions themeGlossaryId prop'
Assert-FileContains 'web/src/pages/novel/WenkuNovel.vue' 'theme-glossary-id' 'WenkuNovel ThemeGlossary binding'

Assert-FileContains 'web/vite.config.ts' 'books\.kotoban\.top' 'production domain books.kotoban.top'
Assert-FileContains 'web/src/components/markdown/MarkdownView.vue' 'books\.kotoban\.top' 'markdown host fallback domain'
Assert-FileContains 'web/src/util/useUserData/api.ts' 'books\.kotoban\.top' 'auth domain comment'

$ForbiddenDomainMatches = Get-FilesForDomainCheck |
    Select-String -Pattern 'n\.novelia\.cc' -List -ErrorAction SilentlyContinue |
    Where-Object { $_.Line -notmatch 'monitor\.novelia\.cc' }

foreach ($Match in $ForbiddenDomainMatches) {
    $RelativePath = Resolve-Path -LiteralPath $Match.Path -Relative
    Add-Failure "Forbidden upstream domain n.novelia.cc found in ${RelativePath}:$($Match.LineNumber)"
}

foreach ($GeneratedFile in @('web/src/auto-imports.d.ts', 'web/src/components.d.ts')) {
    $FullPath = Resolve-RepoPath $GeneratedFile
    if (Test-Path -LiteralPath $FullPath -PathType Leaf) {
        try {
            $Tracked = & git -C $RepoRoot ls-files --error-unmatch $GeneratedFile 2>$null
            if ($LASTEXITCODE -eq 0 -and $Tracked) {
                Add-Failure "Generated frontend declaration is tracked: $GeneratedFile"
            } else {
                Add-Warning "Generated frontend declaration exists locally: $GeneratedFile"
            }
        } catch {
            Add-Warning "Could not check git tracking for generated declaration: $GeneratedFile"
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
    Write-Host 'Fork invariant check failed:' -ForegroundColor Red
    foreach ($Failure in $Failures) {
        Write-Host "  - $Failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host 'Fork invariant check passed.' -ForegroundColor Green
