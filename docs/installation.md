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

The Windows installer uses the same download, validation, and atomic replacement process. Close a running Finn instance before updating it; Windows does not allow the installer to safely replace an executable that is in use. Short-lived file locks, such as antivirus scanning immediately after a download, are retried automatically. Open PowerShell and run:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.ps1 | iex"
```

To install a specific release:

```powershell
powershell -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.ps1))) -Version v1.8.0"
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
