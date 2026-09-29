[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet('Up', 'Down', 'Build', 'BuildAndUp', 'Status', 'Logs', 'Config', 'Restart')]
    [string]$Action = 'BuildAndUp',

    [string[]]$Stacks,

    [switch]$CleanRecreate,

    [switch]$RemoveContainers,

    [switch]$RemoveImages,

    [switch]$RemoveNetworks,

    [switch]$RemoveVolumes,

    [switch]$RemoveBuildx,

    [switch]$CleanupAfterBuild,

    [switch]$Build,

    [switch]$NoCache,

    [switch]$Wait,

    [switch]$FollowLogs,

    [switch]$SkipDockerCheck,

    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

$RepoRoot = (Get-Location).Path
$LogDirectory = Join-Path -Path $RepoRoot -ChildPath 'logs'
$LogFileName = 'docker-compose-orchestrator-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
$LogFilePath = Join-Path -Path $LogDirectory -ChildPath $LogFileName

[System.IO.Directory]::CreateDirectory($LogDirectory) | Out-Null

class DockerComposeException : System.Exception {
    DockerComposeException([string]$Message) : base($Message) { }
}

class DockerCleanupOptions {
    [bool]$Containers
    [bool]$Images
    [bool]$Networks
    [bool]$Volumes
    [bool]$Buildx
    [bool]$PruneDangling

    DockerCleanupOptions(
        [bool]$Containers,
        [bool]$Images,
        [bool]$Networks,
        [bool]$Volumes,
        [bool]$Buildx,
        [bool]$PruneDangling
    ) {
        $this.Containers = $Containers
        $this.Images = $Images
        $this.Networks = $Networks
        $this.Volumes = $Volumes
        $this.Buildx = $Buildx
        $this.PruneDangling = $PruneDangling
    }

    [bool] IsEmpty() {
        return -not ($this.Containers -or $this.Images -or $this.Networks -or $this.Volumes -or $this.Buildx -or $this.PruneDangling)
    }
}

class DockerCleanupService {
    [ComposeLogger]$Logger
    [DockerCommandRunner]$Runner

    DockerCleanupService([ComposeLogger]$Logger, [DockerCommandRunner]$Runner) {
        $this.Logger = $Logger
        $this.Runner = $Runner
    }

    [void] Execute([DockerCleanupOptions]$Options) {
        if ($null -eq $Options -or $Options.IsEmpty()) {
            return
        }

        $this.Logger.Info('Starting Docker cleanup for generated artifacts.')

        if ($Options.Containers) { $this.RemoveContainers() }
        if ($Options.Images) { $this.RemoveImages() }
        if ($Options.Networks) { $this.RemoveNetworks() }
        if ($Options.Volumes) { $this.RemoveVolumes() }
        if ($Options.Buildx) { $this.RemoveBuildx() }
        if ($Options.PruneDangling) { $this.PruneDangling() }

        $this.Logger.Success('Docker cleanup completed.')
    }

    [void] InvokeCleanupCommand([string]$Description, [string[]]$Command) {
        $commandText = 'docker ' + ($Command -join ' ')
        $this.Logger.Info(('Running cleanup step: {0} | Command: {1}' -f $Description, $commandText))

        if ($script:WhatIfPreference) {
            $this.Logger.Warning(('WhatIf: {0}' -f $commandText))
            return
        }

        $result = $this.Runner.Invoke($Command)
        if ($result.Output -and $result.Output.Count -gt 0) {
            foreach ($line in $result.Output) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $this.Logger.Info($line)
                }
            }
        }

        if ($result.ExitCode -ne 0) {
            $this.Logger.Warning(('Cleanup step failed for {0} with exit code {1}. Continuing because cleanup is non-blocking.' -f $Description, $result.ExitCode))
        }
    }

    [void] RemoveContainers() {
        $containerIds = @()
        $result = $this.Runner.Invoke(@('container', 'ls', '-aq'))
        if ($result.ExitCode -eq 0) {
            foreach ($line in @($result.Output)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $containerIds += $line.Trim()
                }
            }
        }

        if ($containerIds.Count -eq 0) {
            $this.Logger.Info('No Docker containers found for cleanup.')
            return
        }

        $this.InvokeCleanupCommand('Remove containers', @('rm', '-f') + $containerIds)
    }

    [void] RemoveImages() {
        $imageIds = @()
        $result = $this.Runner.Invoke(@('image', 'ls', '-aq'))
        if ($result.ExitCode -eq 0) {
            foreach ($line in @($result.Output)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $imageIds += $line.Trim()
                }
            }
        }

        if ($imageIds.Count -eq 0) {
            $this.Logger.Info('No Docker images found for cleanup.')
            return
        }

        $this.InvokeCleanupCommand('Remove images', @('rmi', '-f') + $imageIds)
    }

    [void] RemoveNetworks() {
        $networkIds = @()
        $result = $this.Runner.Invoke(@('network', 'ls', '-q'))
        if ($result.ExitCode -eq 0) {
            foreach ($line in @($result.Output)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $networkIds += $line.Trim()
                }
            }
        }

        if ($networkIds.Count -eq 0) {
            $this.Logger.Info('No Docker networks found for cleanup.')
            return
        }

        $this.InvokeCleanupCommand('Remove networks', @('network', 'rm') + $networkIds)
    }

    [void] RemoveVolumes() {
        $volumeNames = @()
        $result = $this.Runner.Invoke(@('volume', 'ls', '-q'))
        if ($result.ExitCode -eq 0) {
            foreach ($line in @($result.Output)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $volumeNames += $line.Trim()
                }
            }
        }

        if ($volumeNames.Count -eq 0) {
            $this.Logger.Info('No Docker volumes found for cleanup.')
            return
        }

        $this.InvokeCleanupCommand('Remove volumes', @('volume', 'rm', '-f') + $volumeNames)
    }

    [void] RemoveBuildx() {
        $builderNames = @()
        $result = $this.Runner.Invoke(@('buildx', 'ls', '--format', '{{.Name}}'))
        if ($result.ExitCode -eq 0) {
            foreach ($line in @($result.Output)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $builderNames += $line.Trim()
                }
            }
        }

        if ($builderNames.Count -eq 0) {
            $this.Logger.Info('No Docker Buildx builders found for cleanup.')
            return
        }

        foreach ($builder in $builderNames) {
            $this.InvokeCleanupCommand(('Remove Buildx builder {0}' -f $builder), @('buildx', 'rm', $builder))
        }
    }

    [void] PruneDangling() {
        $this.InvokeCleanupCommand('Prune dangling images', @('image', 'prune', '-af'))
        $this.InvokeCleanupCommand('Prune dangling volumes', @('volume', 'prune', '-f'))
        $this.InvokeCleanupCommand('Prune build cache', @('builder', 'prune', '-af'))
        $this.InvokeCleanupCommand('Prune unused networks', @('network', 'prune', '-f'))
    }
}

class ComposeLogger {
    [string]$LogFilePath
    [bool]$Quiet

    ComposeLogger([string]$LogFilePath, [bool]$Quiet) {
        $this.LogFilePath = $LogFilePath
        $this.Quiet = $Quiet
    }

    [void] Write([string]$Level, [string]$Message) {
        $timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffK')
        $line = '[{0}] [{1}] {2}' -f $timestamp, $Level, $Message
        [System.IO.File]::AppendAllText($this.LogFilePath, $line + [System.Environment]::NewLine, [System.Text.UTF8Encoding]::new($true))

        if (-not $this.Quiet) {
            switch ($Level) {
                'INFO' { Write-Host $line -ForegroundColor Cyan }
                'SUCCESS' { Write-Host $line -ForegroundColor Green }
                'WARNING' { Write-Warning $Message }
                'ERROR' { Write-Host $line -ForegroundColor Red }
                default { Write-Host $line }
            }
        }
    }

    [void] Info([string]$Message) { $this.Write('INFO', $Message) }
    [void] Warning([string]$Message) { $this.Write('WARNING', $Message) }
    [void] Success([string]$Message) { $this.Write('SUCCESS', $Message) }
    [void] Error([string]$Message) { $this.Write('ERROR', $Message) }
}

class DockerCommandRunner {
    [ComposeLogger]$Logger

    DockerCommandRunner([ComposeLogger]$Logger) {
        $this.Logger = $Logger
    }

    [PSCustomObject] Invoke([string[]]$Arguments) {
        $previousPreference = $script:ErrorActionPreference
        $script:ErrorActionPreference = 'Continue'

        try {
            $rawOutput = & docker @Arguments 2>&1
            $normalizedOutput = @()
            foreach ($item in @($rawOutput)) {
                if ($null -eq $item) { continue }
                $normalizedOutput += [string]$item.ToString()
            }

            return [PSCustomObject]@{
                Output = @($normalizedOutput)
                ExitCode = $LASTEXITCODE
            }
        }
        finally {
            $script:ErrorActionPreference = $previousPreference
        }
    }

    [string[]] GetContainerNamesForStack([PSCustomObject]$Stack) {
        $configCommand = @('compose', '-f', $Stack.FilePath)
        foreach ($envFile in $Stack.EnvFiles) {
            $configCommand += '--env-file'
            $configCommand += $envFile
        }
        $configCommand += 'config', '--format', 'json'

        $dockerResult = $this.Invoke($configCommand)
        if ($dockerResult.ExitCode -ne 0 -or -not $dockerResult.Output) {
            return @()
        }

        try {
            $jsonText = @($dockerResult.Output) -join [System.Environment]::NewLine
            $config = $jsonText | ConvertFrom-Json
            if (-not $config -or -not $config.services) { return @() }

            $names = @()
            foreach ($serviceName in $config.services.PSObject.Properties.Name) {
                $service = $config.services.$serviceName
                if ($service.PSObject.Properties.Name -contains 'container_name') {
                    $names += $service.container_name
                }
            }
            return @($names | Where-Object { $_ })
        }
        catch {
            return @()
        }
    }

    [bool] IsContainerRunning([string]$ContainerName) {
        if ([string]::IsNullOrWhiteSpace($ContainerName)) {
            return $false
        }

        $psCommand = @('ps', '--filter', ('name={0}' -f $ContainerName), '--format', '{{.Names}}')
        $dockerResult = $this.Invoke($psCommand)
        if ($dockerResult.ExitCode -ne 0) {
            return $false
        }

        foreach ($line in @($dockerResult.Output)) {
            if ($line -match [regex]::Escape($ContainerName)) {
                return $true
            }
        }

        return $false
    }
}

class ComposeAction {
    [ComposeLogger]$Logger
    [DockerCommandRunner]$Runner
    [PSCustomObject]$Stack

    ComposeAction([ComposeLogger]$Logger, [DockerCommandRunner]$Runner, [PSCustomObject]$Stack) {
        $this.Logger = $Logger
        $this.Runner = $Runner
        $this.Stack = $Stack
    }

    [object] Execute() {
        throw [DockerComposeException]::new('Action handler not implemented.')
    }
}

class BuildComposeAction : ComposeAction {
    BuildComposeAction([ComposeLogger]$Logger, [DockerCommandRunner]$Runner, [PSCustomObject]$Stack) : base($Logger, $Runner, $Stack) { }

    [object] Execute() {
        if (-not (Test-StackHasBuildDirective -Stack $this.Stack)) {
            $this.Logger.Warning(('Skip build for stack: {0} because it has no build directive.' -f $this.Stack.Name))
            return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Build'; Status = 'Skipped'; Command = 'docker compose build (not required)' }
        }

        $command = @(New-ComposeCommand -Stack $this.Stack -Action 'Build' -ShouldBuild:$true -NoCache:$script:NoCache -WaitForHealthy:$script:Wait -FollowLogs:$script:FollowLogs)
        $commandText = 'docker ' + ($command -join ' ')
        $this.Logger.Info(('Starting stack: {0} | Action: Build' -f $this.Stack.Name))

        if ($script:WhatIfPreference) {
            $this.Logger.Warning(('WhatIf: {0}' -f $commandText))
            return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Build'; Status = 'WouldRun'; Command = $commandText }
        }

        $dockerResult = $this.Runner.Invoke($command)
        $output = @($dockerResult.Output)
        foreach ($line in $output) {
            Write-Host $line
            [System.IO.File]::AppendAllText($script:LogFilePath, $line + [System.Environment]::NewLine, [System.Text.UTF8Encoding]::new($true))
        }

        if ($dockerResult.ExitCode -ne 0) {
            $outputText = ($output | Out-String).ToLowerInvariant()
            if ($outputText.Contains('no services to build') -or $outputText.Contains('no build services')) {
                $this.Logger.Warning(('No build target for stack: {0}. Skipping build step and continuing.' -f $this.Stack.Name))
                return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Build'; Status = 'Skipped'; Command = $commandText }
            }

            $message = ('Docker Compose execution failed for stack ''{0}'' with exit code {1}.' -f $this.Stack.Name, $dockerResult.ExitCode)
            $this.Logger.Error($message)
            throw [DockerComposeException]::new($message)
        }

        $this.Logger.Success(('Stack completed: {0} | Action: Build' -f $this.Stack.Name))
        return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Build'; Status = 'Completed'; Command = $commandText }
    }
}

class UpComposeAction : ComposeAction {
    UpComposeAction([ComposeLogger]$Logger, [DockerCommandRunner]$Runner, [PSCustomObject]$Stack) : base($Logger, $Runner, $Stack) { }

    [object] Execute() {
        $containerNames = @($this.Runner.GetContainerNamesForStack($this.Stack))
        foreach ($containerName in $containerNames) {
            if ($this.Runner.IsContainerRunning($containerName)) {
                $this.Logger.Warning(('Skipping running stack: {0} because container {1} is already running.' -f $this.Stack.Name, $containerName))
                return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Up'; Status = 'Skipped'; Command = ('docker compose up -d for {0}' -f $containerName) }
            }
        }

        $command = @(New-ComposeCommand -Stack $this.Stack -Action 'Up' -ShouldBuild:$script:Build -NoCache:$script:NoCache -WaitForHealthy:$script:Wait -FollowLogs:$script:FollowLogs)
        $commandText = 'docker ' + ($command -join ' ')
        $this.Logger.Info(('Starting stack: {0} | Action: Up' -f $this.Stack.Name))

        if ($script:WhatIfPreference) {
            $this.Logger.Warning(('WhatIf: {0}' -f $commandText))
            return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Up'; Status = 'WouldRun'; Command = $commandText }
        }

        foreach ($containerName in $containerNames) {
            $cleanupResult = $this.Runner.Invoke(@('rm', '-f', $containerName))
            if ($cleanupResult.ExitCode -eq 0) {
                $this.Logger.Warning(('Removed stale container before start: {0}' -f $containerName))
            }
            elseif ($cleanupResult.Output -and (($cleanupResult.Output | Out-String) -match 'No such object|No such container')) {
                $this.Logger.Info(('No stale container to remove for stack: {0} ({1})' -f $this.Stack.Name, $containerName))
            }
            else {
                $this.Logger.Warning(('Could not remove stale container {0}; continuing with compose up.' -f $containerName))
            }
        }

        $dockerResult = $this.Runner.Invoke($command)
        $output = @($dockerResult.Output)
        foreach ($line in $output) {
            Write-Host $line
            [System.IO.File]::AppendAllText($script:LogFilePath, $line + [System.Environment]::NewLine, [System.Text.UTF8Encoding]::new($true))
        }

        if ($dockerResult.ExitCode -ne 0) {
            $message = ('Docker Compose execution failed for stack ''{0}'' with exit code {1}.' -f $this.Stack.Name, $dockerResult.ExitCode)
            $this.Logger.Error($message)
            throw [DockerComposeException]::new($message)
        }

        $this.Logger.Success(('Stack completed: {0} | Action: Up' -f $this.Stack.Name))
        return [PSCustomObject]@{ Stack = $this.Stack.Name; Action = 'Up'; Status = 'Completed'; Command = $commandText }
    }
}

class ComposeActionFactory {
    static [object] Create([ComposeLogger]$Logger, [DockerCommandRunner]$Runner, [PSCustomObject]$Stack, [string]$Action) {
        switch ($Action) {
            'Build' { return [BuildComposeAction]::new($Logger, $Runner, $Stack) }
            'Up' { return [UpComposeAction]::new($Logger, $Runner, $Stack) }
            default { throw [DockerComposeException]::new(('Unsupported action: {0}' -f $Action)) }
        }

        return $null
    }
}

$script:RuntimeLogger = [ComposeLogger]::new($LogFilePath, $Quiet)

function Get-RelativePath {
    param(
        [string]$BasePath,
        [string]$TargetPath
    )

    $baseUri = New-Object System.Uri((Resolve-Path -Path $BasePath).Path.TrimEnd('\') + [System.IO.Path]::DirectorySeparatorChar)
    $targetUri = New-Object System.Uri((Resolve-Path -Path $TargetPath).Path)
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )

    $script:RuntimeLogger.Write($Level, $Message)
}

function Get-CleanupOptions {
    param(
        [switch]$CleanRecreate,
        [switch]$RemoveContainers,
        [switch]$RemoveImages,
        [switch]$RemoveNetworks,
        [switch]$RemoveVolumes,
        [switch]$RemoveBuildx,
        [switch]$CleanupAfterBuild
    )

    $cleanAll = $false
    if ($CleanRecreate) {
        $cleanAll = $true
    }

    $containerFlag = $RemoveContainers -or $cleanAll
    $imageFlag = $RemoveImages -or $cleanAll
    $networkFlag = $RemoveNetworks -or $cleanAll
    $volumeFlag = $RemoveVolumes -or $cleanAll
    $buildxFlag = $RemoveBuildx -or $cleanAll
    $pruneFlag = $CleanupAfterBuild -or $cleanAll

    return [DockerCleanupOptions]::new($containerFlag, $imageFlag, $networkFlag, $volumeFlag, $buildxFlag, $pruneFlag)
}

function Invoke-PreflightCleanup {
    param(
        [DockerCleanupOptions]$Options,
        [ComposeLogger]$Logger,
        [DockerCommandRunner]$Runner,
        [object[]]$SelectedStacks,
        [switch]$IsCleanRecreate
    )

    if ($null -eq $Options -or $Options.IsEmpty()) {
        return
    }

    if ($IsCleanRecreate -and $SelectedStacks -and $SelectedStacks.Count -gt 0) {
        foreach ($stack in $SelectedStacks) {
            $downCommand = @(New-ComposeCommand -Stack $stack -Action 'Down')
            $commandText = 'docker ' + ($downCommand -join ' ')
            $Logger.Info(('Taking stack down before clean recreate: {0} | Command: {1}' -f $stack.Name, $commandText))

            if ($script:WhatIfPreference) {
                $Logger.Warning(('WhatIf: {0}' -f $commandText))
                continue
            }

            $downResult = $Runner.Invoke($downCommand)
            if ($downResult.Output -and $downResult.Output.Count -gt 0) {
                foreach ($line in $downResult.Output) {
                    if (-not [string]::IsNullOrWhiteSpace($line)) {
                        $Logger.Info($line)
                    }
                }
            }

            if ($downResult.ExitCode -ne 0) {
                $Logger.Warning(('Compose down failed for {0}; continuing with cleanup.' -f $stack.Name))
            }
        }
    }

    $cleanupService = [DockerCleanupService]::new($Logger, $Runner)
    $cleanupService.Execute($Options)
}

function Invoke-PostBuildCleanup {
    param(
        [DockerCleanupOptions]$Options,
        [ComposeLogger]$Logger,
        [DockerCommandRunner]$Runner
    )

    if (($null -eq $Options) -or $Options.IsEmpty()) {
        return
    }

    $cleanupService = [DockerCleanupService]::new($Logger, $Runner)
    $cleanupService.Execute($Options)
}

function Invoke-DockerCommand {
    param(
        [string[]]$Arguments
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    try {
        $rawOutput = & docker @Arguments 2>&1
        $normalizedOutput = @()
        foreach ($item in @($rawOutput)) {
            if ($null -eq $item) { continue }
            $normalizedOutput += [string]$item.ToString()
        }

        return [PSCustomObject]@{
            Output = @($normalizedOutput)
            ExitCode = $LASTEXITCODE
        }
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Get-ComposeContainerNames {
    param(
        [PSCustomObject]$Stack
    )

    $configCommand = @('compose', '-f', $Stack.FilePath)
    foreach ($envFile in $Stack.EnvFiles) {
        $configCommand += '--env-file'
        $configCommand += $envFile
    }
    $configCommand += 'config', '--format', 'json'

    $result = Invoke-DockerCommand -Arguments $configCommand
    if ($result.ExitCode -ne 0 -or -not $result.Output) {
        return @()
    }

    try {
        $jsonText = @($result.Output) -join [System.Environment]::NewLine
        $config = $jsonText | ConvertFrom-Json
        if (-not $config -or -not $config.services) {
            return @()
        }

        $names = @()
        foreach ($serviceName in $config.services.PSObject.Properties.Name) {
            $service = $config.services.$serviceName
            if ($service.PSObject.Properties.Name -contains 'container_name') {
                $names += $service.container_name
            }
        }
        return @($names | Where-Object { $_ })
    }
    catch {
        return @()
    }
}

function Get-StatusColor {
    param(
        [string]$Status
    )

    switch ($Status) {
        'Completed' { return 'Green' }
        'WouldRun' { return 'Yellow' }
        'Skipped' { return 'DarkGray' }
        'Failed' { return 'Red' }
        default { return 'Cyan' }
    }
}

function Write-GroupedStackResults {
    param(
        [object[]]$Results
    )

    if (-not $Results -or $Results.Count -eq 0) {
        return
    }

    $groupedResults = @($Results | Group-Object Stack)
    foreach ($group in $groupedResults) {
        Write-Host ''
        Write-Host ('=== Stack: {0} ===' -f $group.Name) -ForegroundColor Magenta

        foreach ($result in $group.Group) {
            $statusColor = Get-StatusColor -Status $result.Status
            Write-Host ('  Action: {0,-8} Status: {1,-10} Duration: {2}s' -f $result.Action, $result.Status, $result.DurationSeconds) -ForegroundColor $statusColor
            Write-Host ('  Command: {0}' -f $result.Command) -ForegroundColor DarkGray
        }
    }
}

function Get-ComposeFileCandidates {
    param(
        [string]$RootPath
    )

    return @(Get-ChildItem -Path $RootPath -Recurse -File -Include 'compose*.yml', 'compose*.yaml' |
        Where-Object {
            $_.FullName -notmatch [regex]::Escape((Join-Path -Path $RootPath -ChildPath '.git')) -and
            $_.FullName -notmatch [regex]::Escape((Join-Path -Path $RootPath -ChildPath 'node_modules')) -and
            $_.FullName -notmatch [regex]::Escape((Join-Path -Path $RootPath -ChildPath '.venv'))
        } |
        Sort-Object FullName)
}

function Get-PreferredEnvFiles {
    param(
        [string]$ComposeFilePath
    )

    $composeFileName = [System.IO.Path]::GetFileName($ComposeFilePath).ToLowerInvariant()
    $directory = Split-Path -Path $ComposeFilePath -Parent
    $sameDirectoryFiles = @(Get-ChildItem -Path $directory -File -Filter '*.env' | Select-Object -ExpandProperty FullName)

    $preferred = @()
    switch -Regex ($composeFileName) {
        'compose\.gpu\.ya?ml$' { $preferred = @('ollama-gpu.env', '.env'); break }
        'compose\.cpu\.ya?ml$' { $preferred = @('ollama-cpu.env', '.env'); break }
        'compose\.ollama\.ya?ml$' { $preferred = @('ollama.env', '.env'); break }
        'compose\.performance\.ya?ml$' { $preferred = @('.env', 'performance-local.env'); break }
        default { $preferred = @('.env'); break }
    }

    $selected = @()
    foreach ($candidate in $preferred) {
        $target = if ($candidate -eq '.env') { Join-Path -Path $directory -ChildPath '.env' } else { Join-Path -Path $directory -ChildPath $candidate }
        if ((Test-Path -Path $target) -and $selected -notcontains $target) {
            $selected += $target
        }
    }

    if ($selected.Count -eq 0) {
        foreach ($envFile in $sameDirectoryFiles) {
            if ($selected -notcontains $envFile) {
                $selected += $envFile
            }
        }
    }

    return @($selected)
}

function Get-ComposeStacks {
    param(
        [string]$RootPath
    )

    $files = Get-ComposeFileCandidates -RootPath $RootPath
    $result = @()

    foreach ($file in $files) {
        $envFiles = @(Get-PreferredEnvFiles -ComposeFilePath $file.FullName)
        $relativePath = Get-RelativePath -BasePath $RootPath -TargetPath $file.FullName
        $name = ($file.Directory.Name + '/' + $file.Name)
        $result += [PSCustomObject]@{
            Name = $name
            RelativePath = $relativePath
            FilePath = $file.FullName
            EnvFiles = $envFiles
        }
    }

    return @($result)
}

function Resolve-SelectedStacks {
    param(
        [string[]]$RequestedStacks,
        [object[]]$AvailableStacks
    )

    if (-not $RequestedStacks -or $RequestedStacks.Count -eq 0) {
        return @($AvailableStacks)
    }

    $selected = @()
    foreach ($requested in $RequestedStacks) {
        $match = $AvailableStacks | Where-Object {
            $_.Name -like "*$requested*" -or
            $_.RelativePath -like "*$requested*" -or
            $_.FilePath -like "*$requested*"
        }

        if (-not $match) {
            throw "No compose stack matched the selector '$requested'."
        }

        foreach ($item in $match) {
            if ($selected -notcontains $item) {
                $selected += $item
            }
        }
    }

    return @($selected)
}

function New-ComposeCommand {
    param(
        [PSCustomObject]$Stack,
        [string]$Action,
        [switch]$ShouldBuild,
        [switch]$NoCache,
        [switch]$WaitForHealthy,
        [switch]$FollowLogs
    )

    $args = @('compose')
    foreach ($envFile in $Stack.EnvFiles) {
        $args += '--env-file'
        $args += $envFile
    }

    $args += '-f'
    $args += $Stack.FilePath

    switch ($Action) {
        'Up' {
            $args += 'up'
            $args += '-d'
            if ($ShouldBuild) { $args += '--build' }
            if ($WaitForHealthy) { $args += '--wait'; $args += '--wait-timeout'; $args += '180' }
            break
        }
        'Down' {
            $args += 'down'
            $args += '--remove-orphans'
            break
        }
        'Build' {
            $args += 'build'
            if ($NoCache) { $args += '--no-cache' }
            break
        }
        'BuildAndUp' {
            $args += 'build'
            if ($NoCache) { $args += '--no-cache' }
            $args += 'up'
            $args += '-d'
            if ($WaitForHealthy) { $args += '--wait'; $args += '--wait-timeout'; $args += '180' }
            break
        }
        'Status' {
            $args += 'ps'
            break
        }
        'Logs' {
            $args += 'logs'
            if ($FollowLogs) { $args += '-f' }
            break
        }
        'Config' {
            $args += 'config'
            break
        }
        'Restart' {
            $args += 'restart'
            break
        }
        default {
            throw "Unsupported action '$Action'."
        }
    }

    return @($args)
}

function Test-StackHasBuildDirective {
    param(
        [PSCustomObject]$Stack
    )

    $configCommand = @('compose', '-f', $Stack.FilePath)
    foreach ($envFile in $Stack.EnvFiles) {
        $configCommand += '--env-file'
        $configCommand += $envFile
    }
    $configCommand += 'config', '--format', 'json'

    $dockerResult = Invoke-DockerCommand -Arguments $configCommand
    if ($dockerResult.ExitCode -ne 0) {
        return $false
    }

    try {
        $jsonResult = @($dockerResult.Output) -join [System.Environment]::NewLine
        $config = $jsonResult | ConvertFrom-Json
        if (-not $config -or -not $config.services) { return $false }

        foreach ($serviceName in $config.services.PSObject.Properties.Name) {
            $service = $config.services.$serviceName
            if ($service.PSObject.Properties.Name -contains 'build') {
                return $true
            }
        }
    }
    catch {
        return $false
    }

    return $false
}

function Invoke-StackCommand {
    param(
        [PSCustomObject]$Stack,
        [string]$Action,
        [switch]$Build,
        [switch]$NoCache,
        [switch]$Wait,
        [switch]$FollowLogs
    )

    $dockerRunner = [DockerCommandRunner]::new($script:RuntimeLogger)
    $composeAction = [ComposeActionFactory]::Create($script:RuntimeLogger, $dockerRunner, $Stack, $Action)

    $command = @(New-ComposeCommand -Stack $Stack -Action $Action -ShouldBuild:$Build -NoCache:$NoCache -WaitForHealthy:$Wait -FollowLogs:$FollowLogs)
    $commandText = 'docker ' + ($command -join ' ')

    $statusRow = [PSCustomObject]@{
        Stack = $Stack.Name
        Action = $Action
        Label = 'Executing'
        Command = $commandText
    }
    $statusRow | Format-Table -AutoSize | Out-String | Write-Host

    return $composeAction.Execute()
}

try {
    if (-not $SkipDockerCheck) {
        $dockerCommand = Get-Command -Name 'docker' -ErrorAction SilentlyContinue
        if (-not $dockerCommand) {
            throw "Docker CLI was not found in PATH. Install Docker Desktop or Docker Engine before running this orchestrator."
        }
    }

    $availableStacks = @(Get-ComposeStacks -RootPath $RepoRoot)
    if ($availableStacks.Count -eq 0) {
        throw "No compose files were found under the repository root: $RepoRoot"
    }

    $selectedStacks = @(Resolve-SelectedStacks -RequestedStacks $Stacks -AvailableStacks $availableStacks)
    $cleanupOptions = Get-CleanupOptions -CleanRecreate:$CleanRecreate -RemoveContainers:$RemoveContainers -RemoveImages:$RemoveImages -RemoveNetworks:$RemoveNetworks -RemoveVolumes:$RemoveVolumes -RemoveBuildx:$RemoveBuildx -CleanupAfterBuild:$CleanupAfterBuild

    $dockerRunner = [DockerCommandRunner]::new($script:RuntimeLogger)
    if ($CleanRecreate -or -not $cleanupOptions.IsEmpty()) {
        Write-Log -Level 'INFO' -Message 'Running preflight Docker cleanup before orchestration.'
        Invoke-PreflightCleanup -Options $cleanupOptions -Logger $script:RuntimeLogger -Runner $dockerRunner -SelectedStacks $selectedStacks -IsCleanRecreate:$CleanRecreate
    }

    $queue = @()
    for ($index = 0; $index -lt $selectedStacks.Count; $index++) {
        $stack = $selectedStacks[$index]
        $queue += [PSCustomObject]@{
            Order = $index + 1
            Name = $stack.Name
            RelativePath = $stack.RelativePath
            Action = $Action
            EnvFiles = ($stack.EnvFiles -join ', ')
        }
    }

    Write-Log -Level 'INFO' -Message 'Docker Compose stack orchestration plan'
    $queue | Format-Table -AutoSize -Property Order, Name, RelativePath, Action, EnvFiles | Out-String | Write-Host

    $results = @()
    foreach ($stack in $selectedStacks) {
        $stackAction = $Action
        if ($Action -eq 'BuildAndUp') {
            $buildStart = Get-Date
            $buildResult = Invoke-StackCommand -Stack $stack -Action 'Build' -Build:$Build -NoCache:$NoCache -Wait:$Wait -FollowLogs:$FollowLogs
            $buildElapsed = [math]::Round(((Get-Date) - $buildStart).TotalSeconds, 2)
            $buildResult | Add-Member -NotePropertyName DurationSeconds -NotePropertyValue $buildElapsed -Force
            $buildResult | Add-Member -NotePropertyName LogFile -NotePropertyValue $LogFilePath -Force
            $results += $buildResult

            $upStart = Get-Date
            $upResult = Invoke-StackCommand -Stack $stack -Action 'Up' -Build:$Build -NoCache:$NoCache -Wait:$Wait -FollowLogs:$FollowLogs
            $upElapsed = [math]::Round(((Get-Date) - $upStart).TotalSeconds, 2)
            $upResult | Add-Member -NotePropertyName DurationSeconds -NotePropertyValue $upElapsed -Force
            $upResult | Add-Member -NotePropertyName LogFile -NotePropertyValue $LogFilePath -Force
            $results += $upResult
        }
        else {
            $actionStart = Get-Date
            $actionResult = Invoke-StackCommand -Stack $stack -Action $stackAction -Build:$Build -NoCache:$NoCache -Wait:$Wait -FollowLogs:$FollowLogs
            $actionElapsed = [math]::Round(((Get-Date) - $actionStart).TotalSeconds, 2)
            $actionResult | Add-Member -NotePropertyName DurationSeconds -NotePropertyValue $actionElapsed -Force
            $actionResult | Add-Member -NotePropertyName LogFile -NotePropertyValue $LogFilePath -Force
            $results += $actionResult
        }
    }

    if ($CleanupAfterBuild -or $CleanRecreate) {
        Write-Log -Level 'INFO' -Message 'Running post-build Docker cleanup for generated artifacts.'
        Invoke-PostBuildCleanup -Options $cleanupOptions -Logger $script:RuntimeLogger -Runner $dockerRunner
    }

    Write-Log -Level 'SUCCESS' -Message 'Orchestration completed for all selected compose stacks.'
    $summary = @($results | Sort-Object Stack, Action)
    $summary | Format-Table -AutoSize -Property Stack, Action, Status, DurationSeconds, LogFile, Command | Out-String | Write-Host
    Write-GroupedStackResults -Results $summary
}
catch {
    $message = $_.Exception.Message
    Write-Log -Level 'ERROR' -Message $message
    Write-Host ('[ERROR] {0}' -f $message) -ForegroundColor Red
    exit 1
}
