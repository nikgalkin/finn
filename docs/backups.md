# Backups and Recovery

Backups are disabled by default, and Finn does not create a default target automatically. To enable them, create `~/.finn/config.yaml` (or `config.yaml` in the current working directory) and configure at least one target:

```yaml
backup:
  enabled: true
  only_if_changed: true
  interval_hours: 12
  targets:
    - name: local_storage
      path: "$HOME/.finn/backups"
      retention: 10
```

Each target is independent, so you can combine a local directory with Google Drive or another cloud-synced folder:

```yaml
    - name: google_drive
      path: "$HOME/Library/CloudStorage/GoogleDrive-account/My Drive/FinnBackups"
      retention: 10
```

* `only_if_changed` avoids creating another file when the logical database contents have not changed.
* `interval_hours` controls scheduled backups while Finn is running. Finn also runs a synchronized backup during a normal shutdown.
* `retention` is applied per target and defaults to `10` when omitted or set to a non-positive value.
* Target paths support environment variables such as `$HOME`.

Backup filenames include the Finn version that created them without dots, for example `finn_backup_2026_07_20_183000_v140_<fingerprint>.enc`. Local development builds use `vdev`.

## Backup statuses

Finn reports each target separately:

* **Green — Backup created:** The file was written, read back successfully, and retention completed.
* **Blue — Already up to date:** The existing backup matches the current database.
* **Orange — Backup created with warnings:** The file was written, but Finn could not verify it or inspect or rotate the directory. The new copy exists, but old backups may not be cleaned up.
* **Red — Failed:** Finn could not write a backup file to that target.

For cloud-backed folders, the process that launches Finn needs both read and write access. On macOS, Terminal and the VS Code integrated terminal can have different privacy permissions. If reading is denied but writing is allowed, Finn still attempts to create the backup and reports the target in orange.

## Encryption and recovery

Set `backup.cipher_key` in `~/.finn/config.yaml` to encrypt new backups with AES-256-GCM. Generate a 256-bit random key directly with Finn:

```shell
finn backup generate-key
```

The command prints the generated key together with a ready-to-copy configuration snippet. Copy the value into the persistent configuration rather than a shell session:

```yaml
backup:
  enabled: true
  cipher_key: "paste-the-generated-key-here"
```

Restrict access to the configuration file because it contains the key:

```shell
chmod 600 ~/.finn/config.yaml
```

For automation, `finn backup generate-key --raw` prints only the Base64 key.

Keep this key somewhere safe: encrypted backups cannot be recovered without it. Without `backup.cipher_key`, Finn writes unencrypted `.db` files and logs a warning.

List configured targets and their readable backup files:

```shell
finn backup list
```

Restore an encrypted `.enc` or unencrypted `.db` backup before starting Finn normally:

```shell
finn backup restore /path/to/finn_backup_file.enc
```

[Back to the README](../README.md)
