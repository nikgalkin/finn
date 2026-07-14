package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

type appOptions struct {
	noOpen    bool
	demo      bool
	forceDemo bool
}

type outputColors struct {
	blue   string
	green  string
	yellow string
	cyan   string
	reset  string
}

func colorsForWriter(w io.Writer) outputColors {
	if os.Getenv("NO_COLOR") != "" {
		return outputColors{}
	}
	file, ok := w.(*os.File)
	if !ok {
		return outputColors{}
	}
	info, err := file.Stat()
	if err != nil || info.Mode()&os.ModeCharDevice == 0 {
		return outputColors{}
	}
	return outputColors{
		blue:   "\033[0;34m",
		green:  "\033[0;32m",
		yellow: "\033[1;33m",
		cyan:   "\033[0;36m",
		reset:  "\033[0m",
	}
}

func newRootCommand() *cobra.Command {
	appOpts := appOptions{}

	rootCmd := &cobra.Command{
		Use:           "finn",
		Short:         "Personal net worth tracker",
		Args:          cobra.NoArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(_ *cobra.Command, _ []string) error {
			return runApp(appOpts)
		},
	}
	rootCmd.SetVersionTemplate("finn version {{.Version}}\n")
	rootCmd.Version = fmt.Sprintf("%s (%s/%s)", version, runtime.GOOS, runtime.GOARCH)
	rootCmd.CompletionOptions.DisableDefaultCmd = true

	rootCmd.Flags().BoolVarP(&appOpts.noOpen, "no-open", "n", false, "Disable automatic browser opening")
	rootCmd.Flags().BoolVarP(&appOpts.demo, "demo", "d", false, "Run with an isolated sample database")
	rootCmd.Flags().BoolVar(&appOpts.forceDemo, "demo-force", false, "Replace the demo database with fresh sample data")

	rootCmd.AddCommand(newVersionCommand(), newBackupCommand())
	return rootCmd
}

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version information",
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, _ []string) {
			cmd.Printf("finn version %s (%s/%s)\n", version, runtime.GOOS, runtime.GOARCH)
		},
	}
}

func newBackupCommand() *cobra.Command {
	backupCmd := &cobra.Command{
		Use:   "backup",
		Short: "Manage backups",
	}
	backupCmd.AddCommand(
		&cobra.Command{
			Use:     "list",
			Aliases: []string{"ls"},
			Short:   "List configured backup targets and files",
			Args:    cobra.NoArgs,
			RunE: func(cmd *cobra.Command, _ []string) error {
				return printConfiguredBackups(cmd.OutOrStdout(), LoadConfig())
			},
		},
		newGenerateBackupKeyCommand(),
		&cobra.Command{
			Use:   "restore <file>",
			Short: "Restore an encrypted or raw backup file",
			Args:  cobra.ExactArgs(1),
			Run: func(_ *cobra.Command, args []string) {
				RunRestoreJob(LoadConfig(), args[0])
			},
		},
	)
	return backupCmd
}

func newGenerateBackupKeyCommand() *cobra.Command {
	raw := false
	cmd := &cobra.Command{
		Use:     "generate-key",
		Aliases: []string{"gen-key"},
		Short:   "Generate a secure backup encryption key",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return printGeneratedBackupKey(cmd.OutOrStdout(), raw)
		},
	}
	cmd.Flags().BoolVar(&raw, "raw", false, "Print only the Base64 key")
	return cmd
}

func printGeneratedBackupKey(w io.Writer, raw bool) error {
	key, err := generateBackupCipherKey()
	if err != nil {
		return err
	}
	if raw {
		_, err = fmt.Fprintln(w, key)
		return err
	}

	colors := colorsForWriter(w)
	_, err = fmt.Fprintf(w, `%s🔑 Finn Backup Key Generator%s
----------------------------------------
%s✅ Your new secret cipher key has been successfully generated:%s
%s%s%s
----------------------------------------
%s💡 How to use it?%s
Add the key to %s~/.finn/config.yaml%s:
  %sbackup:
    cipher_key: %q%s
On macOS and Linux, protect the file:
  %schmod 600 ~/.finn/config.yaml%s
%s⚠️  Keep this key safe. Encrypted backups cannot be restored without it.%s
----------------------------------------
`, colors.blue, colors.reset,
		colors.green, colors.reset,
		colors.cyan, key, colors.reset,
		colors.yellow, colors.reset,
		colors.blue, colors.reset,
		colors.cyan, key, colors.reset,
		colors.cyan, colors.reset,
		colors.yellow, colors.reset)
	return err
}

func printConfiguredBackups(w io.Writer, cfg *Config) error {
	fmt.Fprintln(w, "📂 Configured Backup Targets & Files:")
	if len(cfg.Backup.Targets) == 0 {
		fmt.Fprintln(w, "   (No backup targets configured or backup is disabled)")
		return nil
	}

	for _, target := range cfg.Backup.Targets {
		fmt.Fprintf(w, "\n🎯 Target [%s]: %s (Retention: %d)\n", target.Name, target.Path, target.Retention)
		files, err := os.ReadDir(target.Path)
		if err != nil {
			fmt.Fprintf(w, "   ⚠️  Failed to read directory: %v\n", err)
			continue
		}

		foundAny := false
		for _, file := range files {
			if file.IsDir() || !strings.HasPrefix(file.Name(), backupPrefix) {
				continue
			}
			fullPath := filepath.Join(target.Path, file.Name())
			info, err := file.Info()
			if err == nil {
				fmt.Fprintf(w, "   📄 %s  (%d KB)  [%s]\n", fullPath, info.Size()/1024, info.ModTime().Format("2006-01-02 15:04:05"))
			} else {
				fmt.Fprintf(w, "   📄 %s\n", fullPath)
			}
			foundAny = true
		}
		if !foundAny {
			fmt.Fprintln(w, "   (No backup files found in this directory yet)")
		}
	}
	return nil
}
