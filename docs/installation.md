# Installation

## Linux and macOS

Install the latest version of Finn with the following command. The installer detects your operating system and CPU architecture, downloads the correct executable, removes macOS Gatekeeper quarantine attributes when necessary, validates the binary, and atomically replaces the installed version. A failed or interrupted download leaves the existing installation unchanged.

```bash
curl -fsSL https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.sh | sh
```

To install a specific release, pass its tag (the leading `v` is optional):

```bash
curl -fsSL https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.sh | sh -s -- --version v1.8.0
```

## Windows PowerShell

The Windows installer downloads a release directly to `~/.finn/bin/finn.exe`. Close a running Finn instance before updating so Windows can overwrite the executable. Open PowerShell and run:

```powershell
$p = Join-Path $env:TEMP "finn-install-$PID.ps1"; try { Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.ps1' -OutFile $p -ErrorAction Stop; Unblock-File $p; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; if ($LASTEXITCODE -ne 0) { throw "Finn installer failed with exit code $LASTEXITCODE" } } finally { Remove-Item $p -Force -ErrorAction SilentlyContinue }
```

To install a specific release, pass its tag with or without the leading `v`:

```powershell
$p = Join-Path $env:TEMP "finn-install-$PID.ps1"; try { Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.ps1' -OutFile $p -ErrorAction Stop; Unblock-File $p; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Version v1.8.0; if ($LASTEXITCODE -ne 0) { throw "Finn installer failed with exit code $LASTEXITCODE" } } finally { Remove-Item $p -Force -ErrorAction SilentlyContinue }
```

## Configuration

Finn works with its default settings without a configuration file. To customize the application, use [`demo/config.yml`](../demo/config.yml) as a starting point and save your version as `~/.finn/config.yaml` or `config.yaml` in the current working directory.

To keep a config somewhere else, point Finn at it with `-c` / `--config`:

```shell
finn --config ~/configs/finn-work.yml
```

The flag also works for the `backup` subcommands, so a restore reads the same targets and key as the instance that wrote the file:

```shell
finn backup list -c ~/configs/finn-work.yml
```

Unlike the default lookup, an explicit path must exist: Finn stops with an error instead of falling back to the defaults, so a typo cannot silently start the app against another database. Relative paths inside the file, such as `database.filename`, are still resolved the usual way rather than relative to the config file.

Review the example before using it, especially the backup paths, which must match folders available on your computer. See [Backups and Recovery](backups.md) for details.

[Back to the README](../README.md)
