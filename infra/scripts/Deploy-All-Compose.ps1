<#
.SYNOPSIS
    Repository-wide Docker Compose stack deployment and orchestration utility.

.DESCRIPTION
    Discovers, validates, builds, and orchestrates Docker Compose stacks across the
    model-box workspace with real-time log streaming, idempotent network guards,
    and granular artifact cleanup options.

.NOTES
    Standards Alignment: STD-COD-007 (Shell Clean Code), STD-PAT-CORE-SHELL (Core Design Patterns).
    Target Runtimes: Windows PowerShell 5.1 and PowerShell 7.4+.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Position = 0)]
    [ValidateSet('Up', 'Down', 'Build', 'BuildAndUp', 'Status', 'Logs', 'Config', 'Restart')]
    [string]$Action = 'BuildAndUp',

    [Parameter()]
    [string[]]$Stacks,

    [Parameter()]
    [string[]]$Profiles,

    [Parameter()]
    [switch]$CleanRecreate,

    [Parameter()]
    [switch]$RemoveContainers,

    [Parameter()]
    [switch]$RemoveImages,

    [Parameter()]
    [switch]$RemoveNetworks,

    [Parameter()]
    [switch]$RemoveVolumes,

    [Parameter()]
    [switch]$RemoveBuildx,

    [Parameter()]
    [switch]$CleanupAfterBuild,

    [Parameter()]
    [switch]$Build,

    [Parameter()]
    [switch]$NoCache,

    [Parameter()]
    [switch]$Wait,

    [Parameter()]
    [switch]$FollowLogs,

    [Parameter()]
    [switch]$SkipDockerCheck,

    [Parameter()]
    [bool]$VerifyArtifacts = $true,

    [Parameter()]
    [switch]$Quiet
)

# 1. Strict Mode & Execution Environment (STD-COD-007.4)
Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

# 2. Typed Constants & Script Scoping (STD-COD-007.1, STD-COD-007.5)
Set-Variable -Name DEFAULT_WAIT_TIMEOUT_SECONDS -Value 180 -Option ReadOnly -Scope Script
Set-Variable -Name REQUIRED_DOCKER_NETWORK -Value 'model-box-net' -Option ReadOnly -Scope Script

$script:WhatIfEnabled = [bool]$WhatIfPreference
$script:ComposeProfiles = @()
foreach ($rawProfile in @($Profiles)) {
    if (-not [string]::IsNullOrWhiteSpace($rawProfile)) {
        foreach ($token in ($rawProfile -split ',')) {
            $trimmed = $token.Trim()
            if (-not [string]::IsNullOrWhiteSpace($trimmed) -and $script:ComposeProfiles -notcontains $trimmed) {
                $script:ComposeProfiles += $trimmed
            }
        }
    }
}

$script:ScriptRoot = (Resolve-Path -Path $PSScriptRoot).Path
$script:RepoRoot = (Resolve-Path -Path (Join-Path -Path $script:ScriptRoot -ChildPath '..\..')).Path
$script:LogDirectory = Join-Path -Path $script:RepoRoot -ChildPath 'infra\logs'
$script:LogFileName = 'docker-compose-orchestrator-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
$script:LogFilePath = Join-Path -Path $script:LogDirectory -ChildPath $script:LogFileName

[System.IO.Directory]::CreateDirectory($script:LogDirectory) | Out-Null

<#
.SYNOPSIS
    Writes a timestamped and leveled log entry to console and log file (STD-COD-007.6).
#>
function Write-LogLine {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('INFO', 'SUCCESS', 'WARNING', 'ERROR')]
        [string]$Level,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffK')
    $formattedLine = '[{0}] [{1}] {2}' -f $timestamp, $Level, $Message
    [System.IO.File]::AppendAllText($script:LogFilePath, $formattedLine + [System.Environment]::NewLine, [System.Text.UTF8Encoding]::new($true))

    if (-not $Quiet) {
        switch ($Level) {
            'INFO'    { Write-Host $formattedLine -ForegroundColor Cyan }
            'SUCCESS' { Write-Host $formattedLine -ForegroundColor Green }
            'WARNING' { Write-Warning $Message }
            'ERROR'   { Write-Host $formattedLine -ForegroundColor Red }
        }
    }
}

<#
.SYNOPSIS
    Invokes a Docker CLI command with streaming or captured output (STD-COD-007.4, STD-COD-007.7).
#>
function Invoke-DockerCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [Parameter()]
        [switch]$CaptureOutput,

        [Parameter()]
        [switch]$IgnoreError
    )

    $commandText = 'docker ' + ($Arguments -join ' ')
    if ($script:WhatIfEnabled) {
        Write-LogLine -Level 'WARNING' -Message ('WhatIf: {0}' -f $commandText)
        return [PSCustomObject]@{ Output = @(); ExitCode = 0 }
    }

    $prevPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($CaptureOutput) {
            $buffer = [System.Collections.Generic.List[string]]::new()
            & docker @Arguments 2>&1 | ForEach-Object {
                if ($null -ne $_) {
                    $line = [string]$_
                    $buffer.Add($line)
                    [System.IO.File]::AppendAllText($script:LogFilePath, $line + [System.Environment]::NewLine, [System.Text.UTF8Encoding]::new($true))
                }
            }
            return [PSCustomObject]@{ Output = @($buffer.ToArray()); ExitCode = $LASTEXITCODE }
        }

        $streamBuffer = [System.Collections.Generic.List[string]]::new()
        & docker @Arguments 2>&1 | ForEach-Object {
            if ($null -ne $_) {
                $line = [string]$_
                $streamBuffer.Add($line)
                if (-not $Quiet) { Write-Host $line }
                [System.IO.File]::AppendAllText($script:LogFilePath, $line + [System.Environment]::NewLine, [System.Text.UTF8Encoding]::new($true))
            }
        }
        return [PSCustomObject]@{ Output = @($streamBuffer.ToArray()); ExitCode = $LASTEXITCODE }
    }
    finally {
        $ErrorActionPreference = $prevPreference
    }
}

<#
.SYNOPSIS
    Idempotently ensures external bridge network exists (Command: STD-COD-007.3).
#>
function Ensure-DockerNetwork {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$NetworkName
    )

    $res = Invoke-DockerCommand -Arguments @('network', 'ls', '--filter', ('name=^{0}$' -f $NetworkName), '--format', '{{.Name}}') -CaptureOutput
    $matched = @($res.Output | Where-Object { $_.Trim() -eq $NetworkName })
    if ($matched.Count -eq 0) {
        Write-LogLine -Level 'INFO' -Message ('Creating required Docker network: {0}' -f $NetworkName)
        Invoke-DockerCommand -Arguments @('network', 'create', $NetworkName) -IgnoreError | Out-Null
    }
}

<#
.SYNOPSIS
    Executes container, image, network, volume, and build cache cleanup (Command: STD-COD-007.3).
#>
function Invoke-DockerCleanup {
    [CmdletBinding()]
    param(
        [Parameter()] [switch]$Containers,
        [Parameter()] [switch]$Images,
        [Parameter()] [switch]$Networks,
        [Parameter()] [switch]$Volumes,
        [Parameter()] [switch]$Buildx,
        [Parameter()] [switch]$PruneDangling
    )

    if (-not ($Containers -or $Images -or $Networks -or $Volumes -or $Buildx -or $PruneDangling)) { return }

    Write-LogLine -Level 'INFO' -Message 'Starting Docker cleanup for generated artifacts.'

    if ($Containers) {
        $res = Invoke-DockerCommand -Arguments @('container', 'ls', '-aq') -CaptureOutput
        $ids = @($res.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })
        if ($ids.Count -gt 0) { Invoke-DockerCommand -Arguments (@('rm', '-f') + $ids) -IgnoreError | Out-Null }
    }
    if ($Images) {
        $res = Invoke-DockerCommand -Arguments @('image', 'ls', '-aq') -CaptureOutput
        $ids = @($res.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })
        if ($ids.Count -gt 0) { Invoke-DockerCommand -Arguments (@('rmi', '-f') + $ids) -IgnoreError | Out-Null }
    }
    if ($Networks) {
        $res = Invoke-DockerCommand -Arguments @('network', 'ls', '--format', '{{.ID}} {{.Name}}') -CaptureOutput
        $ids = @()
        foreach ($line in @($res.Output)) {
            $parts = $line.Trim() -split '\s+', 2
            if ($parts.Count -ge 2 -and $parts[1] -notin @('bridge', 'host', 'none')) { $ids += $parts[0] }
        }
        if ($ids.Count -gt 0) { Invoke-DockerCommand -Arguments (@('network', 'rm') + $ids) -IgnoreError | Out-Null }
    }
    if ($Volumes) {
        $res = Invoke-DockerCommand -Arguments @('volume', 'ls', '-q') -CaptureOutput
        $names = @($res.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })
        if ($names.Count -gt 0) { Invoke-DockerCommand -Arguments (@('volume', 'rm', '-f') + $names) -IgnoreError | Out-Null }
    }
    if ($Buildx) {
        Invoke-DockerCommand -Arguments @('buildx', 'prune', '-af') -IgnoreError | Out-Null
    }
    if ($PruneDangling) {
        Invoke-DockerCommand -Arguments @('image', 'prune', '-af') -IgnoreError | Out-Null
        Invoke-DockerCommand -Arguments @('volume', 'prune', '-f') -IgnoreError | Out-Null
        Invoke-DockerCommand -Arguments @('builder', 'prune', '-af') -IgnoreError | Out-Null
        Invoke-DockerCommand -Arguments @('network', 'prune', '-f') -IgnoreError | Out-Null
    }

    Write-LogLine -Level 'SUCCESS' -Message 'Docker cleanup completed.'
}

<#
.SYNOPSIS
    Calculates normalized relative file path (Query: STD-COD-007.3).
#>
function Get-RelativeFilePath {
    [CmdletBinding()]
    param([string]$BasePath, [string]$TargetPath)

    $baseUri = New-Object System.Uri((Resolve-Path -Path $BasePath).Path.TrimEnd('\') + [System.IO.Path]::DirectorySeparatorChar)
    $targetUri = New-Object System.Uri((Resolve-Path -Path $TargetPath).Path)
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

<#
.SYNOPSIS
    Maps compose file to preferred environment files using regex strategy (Query: STD-COD-007.3).
#>
function Get-PreferredEnvFiles {
    [CmdletBinding()]
    param([string]$ComposeFilePath)

    $fileName = [System.IO.Path]::GetFileName($ComposeFilePath).ToLowerInvariant()
    $dir = Split-Path -Path $ComposeFilePath -Parent
    $candidates = switch -Regex ($fileName) {
        'compose\.comfyui\.gpu\.ya?ml$' { @('comfyui-gpu.env', '.env'); break }
        'compose\.comfyui\.cpu\.ya?ml$' { @('comfyui-cpu.env', '.env'); break }
        'compose\.ollama\.gpu\.ya?ml$'  { @('ollama-gpu.env', '.env'); break }
        'compose\.ollama\.cpu\.ya?ml$'  { @('ollama-cpu.env', '.env'); break }
        'compose\.gpu\.ya?ml$'          { @('comfyui-gpu.env', 'ollama-gpu.env', '.env'); break }
        'compose\.cpu\.ya?ml$'          { @('comfyui-cpu.env', 'ollama-cpu.env', '.env'); break }
        'compose\.ollama\.ya?ml$'       { @('ollama.env', '.env'); break }
        'compose\.connectors\.ya?ml$'   { @('connectors.env', '.env'); break }
        'compose\.performance\.ya?ml$'  { @('performance.env', '.env', 'performance-local.env'); break }
        default                         { @('.env'); break }
    }

    $found = @()
    foreach ($item in $candidates) {
        $path = Join-Path -Path $dir -ChildPath $item
        if ((Test-Path -Path $path) -and $found -notcontains $path) { $found += $path }
    }
    if ($found.Count -eq 0) {
        $fallbacks = @(Get-ChildItem -Path $dir -File -Filter '*.env' | Select-Object -ExpandProperty FullName)
        foreach ($fb in $fallbacks) { if ($found -notcontains $fb) { $found += $fb } }
    }
    return @($found)
}

<#
.SYNOPSIS
    Discovers all Compose stack descriptors under repository root (Query: STD-COD-007.3).
#>
function Get-ComposeStacks {
    [CmdletBinding()]
    param([string]$RootPath)

    $files = @(Get-ChildItem -Path $RootPath -Recurse -File -Include 'compose*.yml', 'compose*.yaml' |
        Where-Object {
            $_.FullName -notmatch [regex]::Escape((Join-Path -Path $RootPath -ChildPath '.git')) -and
            $_.FullName -notmatch [regex]::Escape((Join-Path -Path $RootPath -ChildPath 'node_modules')) -and
            $_.FullName -notmatch [regex]::Escape((Join-Path -Path $RootPath -ChildPath '.venv'))
        } | Sort-Object FullName)

    $stacks = @()
    foreach ($file in $files) {
        $envFiles = @(Get-PreferredEnvFiles -ComposeFilePath $file.FullName)
        $relPath = Get-RelativeFilePath -BasePath $RootPath -TargetPath $file.FullName
        $cleanRel = $relPath.Replace('\', '/')
        $stackName = if ($cleanRel.StartsWith('infra/')) { $cleanRel.Substring(6) } else { $cleanRel }
        $stacks += [PSCustomObject]@{
            Name         = $stackName
            RelativePath = $relPath
            FilePath     = $file.FullName
            EnvFiles     = $envFiles
        }
    }
    return @($stacks)
}

<#
.SYNOPSIS
    Filters available stacks using user-provided substring selectors (Query: STD-COD-007.3).
#>
function Resolve-SelectedStacks {
    [CmdletBinding()]
    param(
        [string[]]$RequestedSelectors,
        [object[]]$AvailableStacks
    )

    if (-not $RequestedSelectors -or $RequestedSelectors.Count -eq 0) { return @($AvailableStacks) }

    $tokens = @()
    foreach ($item in $RequestedSelectors) {
        if (-not [string]::IsNullOrWhiteSpace($item)) {
            foreach ($t in ($item -split ',')) {
                $c = $t.Trim()
                if (-not [string]::IsNullOrWhiteSpace($c)) { $tokens += $c }
            }
        }
    }
    if ($tokens.Count -eq 0) { return @($AvailableStacks) }

    $selected = @()
    foreach ($tok in $tokens) {
        $match = $AvailableStacks | Where-Object {
            $_.Name -like "*$tok*" -or $_.RelativePath -like "*$tok*" -or $_.FilePath -like "*$tok*"
        }
        if (-not $match) { throw "No compose stack matched the selector '$tok'." }
        foreach ($m in $match) { if ($selected -notcontains $m) { $selected += $m } }
    }
    return @($selected)
}

<#
.SYNOPSIS
    Checks whether the target stack contains any service build directives (Query: STD-COD-007.3).
#>
function Test-StackHasBuildDirective {
    [CmdletBinding()]
    param([PSCustomObject]$Stack)

    $cmd = @('compose')
    foreach ($p in $script:ComposeProfiles) { $cmd += '--profile'; $cmd += $p }
    foreach ($e in $Stack.EnvFiles) { $cmd += '--env-file'; $cmd += $e }
    $cmd += '-f'; $cmd += $Stack.FilePath; $cmd += 'config'; $cmd += '--format'; $cmd += 'json'

    $res = Invoke-DockerCommand -Arguments $cmd -CaptureOutput
    if ($res.ExitCode -ne 0) { return $false }

    try {
        $json = (@($res.Output) -join [System.Environment]::NewLine) | ConvertFrom-Json
        if (-not $json -or -not $json.services) { return $false }
        foreach ($prop in $json.services.PSObject.Properties.Name) {
            if ($json.services.$prop.PSObject.Properties.Name -contains 'build') { return $true }
        }
    }
    catch { return $false }
    return $false
}

<#
.SYNOPSIS
    Constructs CLI parameter array for a compose action (Query: STD-COD-007.3).
#>
function New-ComposeCommandArguments {
    [CmdletBinding()]
    param(
        [PSCustomObject]$Stack,
        [string]$SubAction,
        [switch]$ShouldBuild,
        [switch]$NoCacheFlag,
        [switch]$WaitForHealthy,
        [switch]$FollowLogsFlag
    )

    $parts = @('compose')
    foreach ($p in $script:ComposeProfiles) { $parts += '--profile'; $parts += $p }
    foreach ($e in $Stack.EnvFiles) { $parts += '--env-file'; $parts += $e }
    $parts += '-f'; $parts += $Stack.FilePath

    switch ($SubAction) {
        'Up'      {
            $parts += 'up'; $parts += '-d'
            if ($ShouldBuild) { $parts += '--build' }
            if ($WaitForHealthy) { $parts += '--wait'; $parts += '--wait-timeout'; $parts += [string]$script:DEFAULT_WAIT_TIMEOUT_SECONDS }
        }
        'Down'    { $parts += 'down'; $parts += '--remove-orphans' }
        'Build'   { $parts += 'build'; if ($NoCacheFlag) { $parts += '--no-cache' } }
        'Status'  { $parts += 'ps' }
        'Logs'    { $parts += 'logs'; if ($FollowLogsFlag) { $parts += '-f' } }
        'Config'  { $parts += 'config' }
        'Restart' { $parts += 'restart' }
        default   { throw "Unsupported sub-action: '$SubAction'" }
    }
    return @($parts)
}

<#
.SYNOPSIS
    Executes a single compose stack action with streaming output and duration tracking (Command: STD-COD-007.3).
#>
function Invoke-StackAction {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Stack,

        [Parameter(Mandatory = $true)]
        [string]$SubAction
    )

    if ($SubAction -eq 'Build' -and -not (Test-StackHasBuildDirective -Stack $Stack)) {
        Write-LogLine -Level 'WARNING' -Message ('Skip build for stack: {0} (no build directive).' -f $Stack.Name)
        return [PSCustomObject]@{
            Stack = $Stack.Name; Action = 'Build'; Status = 'Skipped'; DurationSeconds = 0; LogFile = $script:LogFilePath; Command = 'docker compose build (not required)'
        }
    }

    if ($SubAction -eq 'Up') { Ensure-DockerNetwork -NetworkName $script:REQUIRED_DOCKER_NETWORK }

    $cmd = @(New-ComposeCommandArguments -Stack $Stack -SubAction $SubAction -ShouldBuild:$Build -NoCacheFlag:$NoCache -WaitForHealthy:$Wait -FollowLogsFlag:$FollowLogs)
    $cmdText = 'docker ' + ($cmd -join ' ')
    Write-LogLine -Level 'INFO' -Message ('Starting stack: {0} | Action: {1}' -f $Stack.Name, $SubAction)
    Write-LogLine -Level 'INFO' -Message ('Command: {0}' -f $cmdText)

    if ($script:WhatIfEnabled) {
        return [PSCustomObject]@{ Stack = $Stack.Name; Action = $SubAction; Status = 'WouldRun'; DurationSeconds = 0; LogFile = $script:LogFilePath; Command = $cmdText }
    }

    $startTime = Get-Date
    $res = Invoke-DockerCommand -Arguments $cmd
    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 2)

    if ($res.ExitCode -ne 0) {
        $out = ($res.Output -join ' ').ToLowerInvariant()
        if ($SubAction -eq 'Build' -and ($out.Contains('no services to build') -or $out.Contains('no build services'))) {
            Write-LogLine -Level 'WARNING' -Message ('No build target for stack: {0}. Skipped.' -f $Stack.Name)
            return [PSCustomObject]@{ Stack = $Stack.Name; Action = 'Build'; Status = 'Skipped'; DurationSeconds = $elapsed; LogFile = $script:LogFilePath; Command = $cmdText }
        }
        $err = ('Docker Compose execution failed for stack ''{0}'' with exit code {1}.' -f $Stack.Name, $res.ExitCode)
        Write-LogLine -Level 'ERROR' -Message $err
        throw $err
    }

    Write-LogLine -Level 'SUCCESS' -Message ('Stack completed: {0} | Action: {1}' -f $Stack.Name, $SubAction)
    return [PSCustomObject]@{
        Stack = $Stack.Name; Action = $SubAction; Status = 'Completed'; DurationSeconds = $elapsed; LogFile = $script:LogFilePath; Command = $cmdText
    }
}

<#
.SYNOPSIS
    Gathers and reports Docker resource metrics (Query: STD-COD-007.3).
#>
function Invoke-DockerArtifactVerification {
    [CmdletBinding()]
    param([string]$Phase)

    $img = Invoke-DockerCommand -Arguments @('image', 'ls', '--format', '{{.Repository}}:{{.Tag}} {{.ID}}') -CaptureOutput
    $none = @()
    if ($img.ExitCode -eq 0) {
        foreach ($line in @($img.Output)) {
            $t = $line.Trim()
            if ($t -like '<none>:<none>*' -or $t -like '<none>:*' -or $t -like '*:<none> *') { $none += $t }
        }
    }
    $dangling = @((Invoke-DockerCommand -Arguments @('image', 'ls', '--filter', 'dangling=true', '--format', '{{.ID}}') -CaptureOutput).Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $vols = @((Invoke-DockerCommand -Arguments @('volume', 'ls', '-q') -CaptureOutput).Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $nets = @((Invoke-DockerCommand -Arguments @('network', 'ls', '--format', '{{.Name}}') -CaptureOutput).Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_.Trim() -notin @('bridge', 'host', 'none') })
    $bx = @((Invoke-DockerCommand -Arguments @('buildx', 'du') -CaptureOutput).Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_.Trim() -notmatch '^(ID|Reclaimable|Total|Builder|\-+)' })

    Write-LogLine -Level 'INFO' -Message ('Artifact verification ({0}): none-tag images={1}, dangling images={2}, volumes={3}, custom networks={4}, buildx entries={5}' -f $Phase, $none.Count, $dangling.Count, $vols.Count, $nets.Count, $bx.Count)
}

<#
.SYNOPSIS
    Renders tabular summary and grouped execution results (SLAP Presentation: STD-COD-007.2).
#>
function Show-OrchestrationSummary {
    [CmdletBinding()]
    param([object[]]$Results)

    Write-LogLine -Level 'SUCCESS' -Message 'Orchestration completed for all selected compose stacks.'
    $summary = @($Results | Sort-Object Stack, Action)
    $summary | Format-Table -AutoSize -Property Stack, Action, Status, DurationSeconds, LogFile, Command | Out-String | Write-Host

    $grouped = @($summary | Group-Object Stack)
    foreach ($grp in $grouped) {
        Write-Host ''
        Write-Host ('=== Stack: {0} ===' -f $grp.Name) -ForegroundColor Magenta
        foreach ($row in $grp.Group) {
            $color = switch ($row.Status) { 'Completed' { 'Green' } 'WouldRun' { 'Yellow' } 'Skipped' { 'DarkGray' } default { 'Red' } }
            Write-Host ('  Action: {0,-8} Status: {1,-10} Duration: {2}s' -f $row.Action, $row.Status, $row.DurationSeconds) -ForegroundColor $color
            Write-Host ('  Command: {0}' -f $row.Command) -ForegroundColor DarkGray
        }
    }
}

<#
.SYNOPSIS
    Main pipeline orchestrator (SLAP <= 20 lines: STD-COD-007.2).
#>
function Main {
    if (-not $SkipDockerCheck -and -not (Get-Command -Name 'docker' -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI was not found in PATH. Install Docker Desktop or Docker Engine.'
    }

    $available = @(Get-ComposeStacks -RootPath $script:RepoRoot)
    $selected = @(Resolve-SelectedStacks -RequestedSelectors $Stacks -AvailableStacks $available)
    if ($selected.Count -eq 0) { throw "No compose files matched criteria in '$script:RepoRoot'." }

    if ($VerifyArtifacts) { Invoke-DockerArtifactVerification -Phase 'before orchestration' }
    if ($CleanRecreate -and $selected.Count -gt 0) {
        foreach ($stk in $selected) {
            Invoke-DockerCommand -Arguments @(New-ComposeCommandArguments -Stack $stk -SubAction 'Down') -IgnoreError | Out-Null
        }
    }

    $needsClean = $CleanRecreate -or $RemoveContainers -or $RemoveImages -or $RemoveNetworks -or $RemoveVolumes -or $RemoveBuildx
    if ($needsClean) {
        Invoke-DockerCleanup -Containers:($RemoveContainers -or $CleanRecreate) -Images:($RemoveImages -or $CleanRecreate) -Networks:($RemoveNetworks -or $CleanRecreate) -Volumes:($RemoveVolumes -or $CleanRecreate) -Buildx:($RemoveBuildx -or $CleanRecreate)
    }

    $results = @()
    foreach ($stk in $selected) {
        if ($Action -eq 'BuildAndUp') {
            $results += Invoke-StackAction -Stack $stk -SubAction 'Build'
            $results += Invoke-StackAction -Stack $stk -SubAction 'Up'
        }
        else {
            $results += Invoke-StackAction -Stack $stk -SubAction $Action
        }
    }

    if ($CleanupAfterBuild -or $CleanRecreate) { Invoke-DockerCleanup -PruneDangling:$true }
    if ($VerifyArtifacts) { Invoke-DockerArtifactVerification -Phase 'after orchestration' }
    Show-OrchestrationSummary -Results $results
}

try {
    Main
}
catch {
    $errMessage = $_.Exception.Message
    Write-LogLine -Level 'ERROR' -Message $errMessage
    Write-Host ('[ERROR] {0}' -f $errMessage) -ForegroundColor Red
    exit 1
}
