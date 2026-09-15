package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

func newDatasourceCommand(appOpts *appOptions) *cobra.Command {
	dsCmd := &cobra.Command{
		Use:   "ds",
		Short: "Inspect and run datasource plugins",
		Long: "Datasource plugins are external programs Finn runs on demand. They are registered in config.yml only:\n" +
			"neither the UI nor the HTTP API can add one.",
	}
	dsCmd.AddCommand(
		newDatasourceListCommand(appOpts),
		newDatasourceHashCommand(),
		newDatasourceManifestCommand(appOpts),
		newDatasourceFetchCommand(appOpts),
		newDatasourceVerifyCommand(appOpts),
	)
	return dsCmd
}

// withDatasourceService opens the same database the app uses. WAL and a busy
// timeout are already configured, so a concurrent write does not fail — but a
// browser tab that is already open will not show new items until it reloads.
func withDatasourceService(appOpts *appOptions, run func(*dsService) error) error {
	cfg := LoadConfig(appOpts.configPath)
	db := initDB(cfg, false)
	defer db.Close()
	return run(newDatasourceService(cfg, db, false))
}

func printDatasourceJSON(writer io.Writer, value any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func newDatasourceListCommand(appOpts *appOptions) *cobra.Command {
	asJSON := false
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List the datasources registered in config.yml",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return withDatasourceService(appOpts, func(service *dsService) error {
				view, err := service.sources()
				if err != nil {
					return err
				}
				if asJSON {
					return printDatasourceJSON(cmd.OutOrStdout(), view)
				}
				printDatasourceList(cmd.OutOrStdout(), view)
				return nil
			})
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Print the result as JSON")
	return cmd
}

func printDatasourceList(writer io.Writer, view dsSourcesView) {
	if !view.Enabled {
		reason := "datasources.enabled is false in config.yml"
		if view.Demo {
			reason = "demo mode never runs external programs"
		}
		fmt.Fprintf(writer, "⚠️  Datasources are off: %s\n\n", reason)
	}
	if len(view.Sources) == 0 {
		fmt.Fprintln(writer, "No datasources are registered. Add a 'datasources.plugins' entry to config.yml.")
		return
	}

	for _, source := range view.Sources {
		fmt.Fprintf(writer, "\n🔌 %s\n", source.Name)
		if source.Orphaned {
			fmt.Fprintln(writer, "   state: orphaned — it has Inbox history but is no longer in config.yml")
		} else {
			fmt.Fprintf(writer, "   path:  %s\n", source.Path)
			if source.SHA256 != "" {
				fmt.Fprintf(writer, "   sha256: %s%s\n", source.SHA256, map[bool]string{true: " (pinned)", false: " (unpinned)"}[source.Pinned])
			}
			fmt.Fprintf(writer, "   state: %s\n", datasourceStateLabel(source))
		}
		if source.Manifest != nil {
			fmt.Fprintf(writer, "   plugin: %s %s, kinds: %s\n", source.Manifest.Name, source.Manifest.Version, strings.Join(source.Manifest.Kinds, ", "))
		}
		if source.LastRunAt != "" {
			fmt.Fprintf(writer, "   last run: %s (%s)\n", source.LastRunAt, source.LastStatus)
		}
		for label, message := range map[string]string{
			"config error":   source.ConfigError,
			"binary error":   source.BinaryError,
			"manifest error": source.ManifestError,
			"last error":     source.LastError,
		} {
			if message != "" {
				fmt.Fprintf(writer, "   %s: %s\n", label, message)
			}
		}
		fmt.Fprintf(writer, "   inbox: %d waiting\n", source.PendingCount)
	}
	fmt.Fprintf(writer, "\n%d item(s) waiting in the Inbox in total.\n", view.Pending)
}

func datasourceStateLabel(source dsSourceView) string {
	switch {
	case source.ConfigError != "":
		return "misconfigured"
	case source.BinaryError != "":
		return "unavailable"
	case source.Disabled:
		return "disabled in config.yml"
	case !source.Confirmed:
		return "awaiting confirmation for this path and hash"
	default:
		return "ready"
	}
}

func newDatasourceHashCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "hash <path>",
		Short: "Print the sha256 to pin a plugin binary in config.yml",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			path := expandDatasourcePath(args[0])
			if !filepath.IsAbs(path) {
				absolute, err := filepath.Abs(path)
				if err != nil {
					return err
				}
				path = absolute
			}
			hash, err := datasourceBinaryHash(path)
			if err != nil {
				return err
			}
			// Straight to stdout, unlike cobra's own Print helpers: the whole
			// point of this command is that its output can be captured.
			_, err = fmt.Fprintln(cmd.OutOrStdout(), hash)
			return err
		},
	}
}

func newDatasourceManifestCommand(appOpts *appOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "manifest <name>",
		Short: "Ask a plugin to describe itself",
		Long: "The manifest command must have no side effects and must not touch the network,\n" +
			"so Finn runs it without asking for confirmation.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := LoadConfig(appOpts.configPath)
			plugin, found := cfg.Datasources.Plugin(strings.ToLower(strings.TrimSpace(args[0])))
			if !found {
				return errDatasourceUnknown
			}
			if plugin.ConfigError != "" {
				return errors.New(plugin.ConfigError)
			}

			result := runDatasourcePlugin(cmd.Context(), plugin, dsRequest{
				Command: dsCommandManifest,
				Source:  plugin.Name,
				Config:  plugin.Config,
			})
			if result.StderrTail != "" {
				cmd.PrintErrf("stderr:\n%s\n", result.StderrTail)
			}
			if result.Error != "" {
				return errors.New(result.Error)
			}
			return printDatasourceJSON(cmd.OutOrStdout(), result.Response)
		},
	}
	return cmd
}

func newDatasourceFetchCommand(appOpts *appOptions) *cobra.Command {
	dryRun := false
	assumeYes := false
	asJSON := false

	cmd := &cobra.Command{
		Use:   "fetch <name>",
		Short: "Run a datasource and file what it returns in the Inbox",
		Long: "Nothing reaches Cash Flow here: items land in the Inbox as pending and a person accepts them.\n\n" +
			"--dry-run guarantees only that Finn wrote nothing. The plugin has already talked to the outside\n" +
			"world by then and may have acted there, so the guarantee is one-directional.\n\n" +
			"This command writes to the same database as a running Finn. A browser tab that is already open\n" +
			"will not show new items until the page is reloaded.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return withDatasourceService(appOpts, func(service *dsService) error {
				name := strings.ToLower(strings.TrimSpace(args[0]))
				if assumeYes {
					if _, err := service.confirm(name); err != nil {
						return err
					}
				}

				summary, err := service.fetch(cmd.Context(), name, dsFetchOptions{DryRun: dryRun})
				if errors.Is(err, errDatasourceNeedsOK) {
					printConfirmationNeeded(cmd, service, name)
					return err
				}
				if err != nil {
					return err
				}
				if asJSON {
					return printDatasourceJSON(cmd.OutOrStdout(), summary)
				}
				printFetchSummary(cmd.OutOrStdout(), summary)
				return nil
			})
		},
	}
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Run the plugin without writing to the Inbox or moving the cursor")
	cmd.Flags().BoolVar(&assumeYes, "yes", false, "Confirm running this binary at its current path and hash")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Print the result as JSON")
	return cmd
}

func printConfirmationNeeded(cmd *cobra.Command, service *dsService, name string) {
	plugin, err := service.plugin(name)
	if err != nil {
		return
	}
	binary, err := verifyDatasourceBinary(plugin)
	if err != nil {
		return
	}
	cmd.PrintErrf(`
Finn is about to run a program on your machine:

  name:   %s
  path:   %s
  sha256: %s

Once started it is an ordinary process with your rights: it can read your files and
reach the network, and Finn does not restrict that. Re-run with --yes to confirm.

`, plugin.Name, binary.Path, binary.SHA256)
}

func printFetchSummary(writer io.Writer, summary dsFetchSummary) {
	icon := "✅"
	if summary.Status != "ok" {
		icon = "❌"
	}
	fmt.Fprintf(writer, "%s %s finished in %dms (exit %d)\n", icon, summary.Source, summary.DurationMS, summary.ExitCode)
	if summary.Error != "" {
		fmt.Fprintf(writer, "   error: %s\n", summary.Error)
	}
	if summary.DryRun {
		fmt.Fprintf(writer, "   dry run: %d item(s) returned, nothing was written\n", summary.ItemsTotal)
		for _, item := range summary.Items {
			fmt.Fprintf(writer, "   • [%s] %s %s\n", item.Kind, item.ExternalID, strings.TrimSpace(item.Raw))
			if len(item.Draft) > 0 {
				fmt.Fprintf(writer, "     %s\n", string(item.Draft))
			}
		}
	} else {
		fmt.Fprintf(writer, "   items: %d returned, %d new, %d skipped\n", summary.ItemsTotal, summary.ItemsNew, summary.ItemsSkipped)
	}
	for _, warning := range summary.Warnings {
		fmt.Fprintf(writer, "   ⚠️  %s\n", warning)
	}
	if summary.StderrTail != "" {
		fmt.Fprintf(writer, "   stderr:\n%s\n", summary.StderrTail)
	}
}

// --- verify --------------------------------------------------------------

type dsCheck struct {
	Name    string `json:"name"`
	Result  string `json:"result"`
	Details string `json:"details,omitempty"`
}

type dsVerifyReport struct {
	Path     string    `json:"path"`
	SHA256   string    `json:"sha256"`
	Protocol int       `json:"protocol"`
	Checks   []dsCheck `json:"checks"`
	Failed   int       `json:"failed"`
	Warned   int       `json:"warned"`
}

const (
	dsCheckPass = "pass"
	dsCheckWarn = "warn"
	dsCheckFail = "fail"
)

func (report *dsVerifyReport) add(name, result, format string, arguments ...any) {
	details := ""
	if format != "" {
		details = fmt.Sprintf(format, arguments...)
	}
	report.Checks = append(report.Checks, dsCheck{Name: name, Result: result, Details: details})
	switch result {
	case dsCheckFail:
		report.Failed++
	case dsCheckWarn:
		report.Warned++
	}
}

func newDatasourceVerifyCommand(appOpts *appOptions) *cobra.Command {
	asJSON := false
	sourceName := ""

	cmd := &cobra.Command{
		Use:   "verify [path]",
		Short: "Check a plugin binary against the protocol",
		Long: "Compatibility is decided by behaviour rather than by shared types, so this works for a plugin\n" +
			"written in any language. Point it at a build in CI:\n\n" +
			"  finn ds verify ./dist/plugin\n\n" +
			"Pass --source <name> to run a plugin exactly as config.yml describes it, with its env and config.\n" +
			"Verification runs the plugin for real: fetch reaches whatever the plugin reaches.",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			plugin, err := verifyTargetPlugin(appOpts, args, sourceName)
			if err != nil {
				return err
			}

			report := runDatasourceConformance(cmd.Context(), plugin)
			if asJSON {
				if err := printDatasourceJSON(cmd.OutOrStdout(), report); err != nil {
					return err
				}
			} else {
				printVerifyReport(cmd.OutOrStdout(), report)
			}
			if report.Failed > 0 {
				return fmt.Errorf("%d check(s) failed", report.Failed)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Print the report as JSON")
	cmd.Flags().StringVar(&sourceName, "source", "", "Verify a plugin registered in config.yml, with its env and config")
	return cmd
}

func verifyTargetPlugin(appOpts *appOptions, args []string, sourceName string) (DatasourcePlugin, error) {
	if sourceName != "" {
		cfg := LoadConfig(appOpts.configPath)
		plugin, found := cfg.Datasources.Plugin(strings.ToLower(strings.TrimSpace(sourceName)))
		if !found {
			return DatasourcePlugin{}, errDatasourceUnknown
		}
		if plugin.ConfigError != "" {
			return DatasourcePlugin{}, errors.New(plugin.ConfigError)
		}
		return plugin, nil
	}
	if len(args) == 0 {
		return DatasourcePlugin{}, errors.New("pass a path to the plugin binary, or --source <name>")
	}

	path := expandDatasourcePath(args[0])
	if !filepath.IsAbs(path) {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return DatasourcePlugin{}, err
		}
		path = absolute
	}
	return DatasourcePlugin{Name: "verify", Path: path, TimeoutSeconds: 30}, nil
}

// runDatasourceConformance is the arbiter of compatibility. Every check is
// something Finn itself would refuse at runtime, so passing here means the
// plugin works rather than merely declares that it does.
func runDatasourceConformance(ctx context.Context, plugin DatasourcePlugin) dsVerifyReport {
	report := dsVerifyReport{Path: plugin.Path, Protocol: dsProtocolVersion}

	binary, err := verifyDatasourceBinary(plugin)
	if err != nil {
		report.add("binary is runnable", dsCheckFail, "%v", err)
		return report
	}
	report.SHA256 = binary.SHA256
	report.add("binary is runnable", dsCheckPass, "sha256 %s", binary.SHA256)

	manifest := runDatasourcePlugin(ctx, plugin, dsRequest{Command: dsCommandManifest, Source: plugin.Name, Config: plugin.Config})
	if manifest.Error != "" {
		report.add("manifest answers", dsCheckFail, "%v", manifest.Error)
		return report
	}
	report.add("manifest answers", dsCheckPass, "%s %s", manifest.Response.Name, manifest.Response.Version)

	checkManifestShape(&report, manifest.Response)

	// Side effects and network access cannot be observed from outside, so this
	// stands in for both: a manifest that reads the world tends to answer
	// differently the second time.
	second := runDatasourcePlugin(ctx, plugin, dsRequest{Command: dsCommandManifest, Source: plugin.Name, Config: plugin.Config})
	switch {
	case second.Error != "":
		report.add("manifest is repeatable", dsCheckFail, "the second call failed: %v", second.Error)
	case !sameManifest(manifest.Response, second.Response):
		report.add("manifest is repeatable", dsCheckWarn, "two calls returned different manifests, which suggests a side effect")
	default:
		report.add("manifest is repeatable", dsCheckPass, "")
	}

	unknown := runDatasourcePlugin(ctx, plugin, dsRequest{Command: "definitely-not-a-command", Source: plugin.Name, Config: plugin.Config})
	switch {
	case unknown.ExitCode == 0:
		report.add("unknown command is refused", dsCheckFail, "the plugin exited 0 for an unknown command")
	case unknown.Response.Protocol == dsProtocolVersion && !unknown.Response.OK && unknown.Response.Error != "":
		report.add("unknown command is refused", dsCheckPass, "exit %d, %s", unknown.ExitCode, unknown.Response.Error)
	default:
		report.add("unknown command is refused", dsCheckWarn, "exit %d, but no protocol error was printed", unknown.ExitCode)
	}

	first := runDatasourcePlugin(ctx, plugin, dsRequest{Command: dsCommandFetch, Source: plugin.Name, Config: plugin.Config})
	if first.Error != "" {
		report.add("fetch with an empty cursor", dsCheckFail, "%v", first.Error)
		return report
	}
	report.add("fetch with an empty cursor", dsCheckPass, "%d item(s), %d bytes", len(first.Response.Items), first.StdoutBytes)
	checkFetchItems(&report, first)

	if first.Duration > time.Duration(plugin.Timeout())*time.Second {
		report.add("fetch respects its timeout", dsCheckFail, "took %s with a %ds timeout", first.Duration, plugin.Timeout())
	} else {
		report.add("fetch respects its timeout", dsCheckPass, "took %s", first.Duration.Round(time.Millisecond))
	}

	repeat := runDatasourcePlugin(ctx, plugin, dsRequest{
		Command: dsCommandFetch, Source: plugin.Name, Config: plugin.Config, Cursor: first.Response.Cursor,
	})
	switch {
	case repeat.Error != "":
		report.add("fetch accepts its own cursor back", dsCheckFail, "%v", repeat.Error)
	case !manifest.Response.UsesCursor:
		report.add("fetch accepts its own cursor back", dsCheckPass, "the plugin does not use a cursor")
	case overlappingItems(first.Response.Items, repeat.Response.Items) > 0:
		report.add("fetch accepts its own cursor back", dsCheckFail,
			"%d item(s) came back after the cursor moved past them", overlappingItems(first.Response.Items, repeat.Response.Items))
	default:
		report.add("fetch accepts its own cursor back", dsCheckPass, "%d new item(s) after the cursor", len(repeat.Response.Items))
	}

	return report
}

func checkManifestShape(report *dsVerifyReport, response dsResponse) {
	if err := validateDatasourceManifest(response); err != nil {
		report.add("manifest is complete", dsCheckFail, "%s", err)
		return
	}
	report.add("manifest is complete", dsCheckPass, "")
}

func checkFetchItems(report *dsVerifyReport, result dsRunResult) {
	seen := make(map[string]struct{}, len(result.Response.Items))
	duplicates := 0
	shapeProblems := []string{}
	invalidDrafts := 0

	for index, item := range result.Response.Items {
		row, warning := prepareInboxRow("verify", item, time.Now().Format(time.RFC3339), 0)
		if warning != "" {
			shapeProblems = append(shapeProblems, fmt.Sprintf("item %d: %s", index+1, warning))
			continue
		}
		if _, exists := seen[row.ExternalID]; exists {
			duplicates++
		}
		seen[row.ExternalID] = struct{}{}
		if row.Status == dsStatusInvalid {
			invalidDrafts++
		}
	}

	if len(shapeProblems) > 0 {
		report.add("every item is storable", dsCheckFail, "%s", strings.Join(shapeProblems, "; "))
	} else {
		report.add("every item is storable", dsCheckPass, "")
	}

	if duplicates > 0 {
		report.add("external_id is unique in one response", dsCheckFail, "%d duplicate(s)", duplicates)
	} else {
		report.add("external_id is unique in one response", dsCheckPass, "")
	}

	if result.StdoutBytes > dsMaxStdoutBytes {
		report.add("response fits the limits", dsCheckFail, "%d bytes on stdout", result.StdoutBytes)
	} else if len(result.Response.Items) > dsMaxItems {
		report.add("response fits the limits", dsCheckFail, "%d items", len(result.Response.Items))
	} else {
		report.add("response fits the limits", dsCheckPass, "")
	}

	// An invalid draft is a legitimate outcome: Finn keeps it and the person
	// fixes it. It is worth reporting so the author sees how often it happens.
	if invalidDrafts > 0 {
		report.add("drafts pass Finn's validation", dsCheckWarn, "%d draft(s) will land as invalid for the user to fix", invalidDrafts)
	} else {
		report.add("drafts pass Finn's validation", dsCheckPass, "")
	}
}

func sameManifest(first, second dsResponse) bool {
	encodedFirst, err := json.Marshal(first.Manifest())
	if err != nil {
		return false
	}
	encodedSecond, err := json.Marshal(second.Manifest())
	if err != nil {
		return false
	}
	return string(encodedFirst) == string(encodedSecond)
}

func (r dsResponse) Manifest() dsManifestView {
	return dsManifestView{Name: r.Name, Version: r.Version, Kinds: r.Kinds, UsesCursor: r.UsesCursor, ConfigKeys: r.ConfigKeys}
}

func overlappingItems(first, second []dsItem) int {
	seen := make(map[string]struct{}, len(first))
	for _, item := range first {
		seen[item.ExternalID] = struct{}{}
	}
	overlap := 0
	for _, item := range second {
		if _, exists := seen[item.ExternalID]; exists {
			overlap++
		}
	}
	return overlap
}

func printVerifyReport(writer io.Writer, report dsVerifyReport) {
	fmt.Fprintf(writer, "🔍 Conformance report for %s\n", report.Path)
	if report.SHA256 != "" {
		fmt.Fprintf(writer, "   sha256: %s\n", report.SHA256)
	}
	fmt.Fprintln(writer)

	icons := map[string]string{dsCheckPass: "✅", dsCheckWarn: "⚠️ ", dsCheckFail: "❌"}
	for _, check := range report.Checks {
		fmt.Fprintf(writer, "%s %s", icons[check.Result], check.Name)
		if check.Details != "" {
			fmt.Fprintf(writer, " — %s", check.Details)
		}
		fmt.Fprintln(writer)
	}

	fmt.Fprintln(writer)
	switch {
	case report.Failed > 0:
		fmt.Fprintf(writer, "%d check(s) failed, %d warning(s).\n", report.Failed, report.Warned)
	case report.Warned > 0:
		fmt.Fprintf(writer, "All checks passed with %d warning(s).\n", report.Warned)
	default:
		fmt.Fprintln(writer, "All checks passed.")
	}
}
