//go:build !windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

// checkDatasourceBinaryOwnership refuses a file anybody else can rewrite. The
// config entry says "run this program", and that promise only holds while the
// bytes behind the path cannot be replaced by another account.
func checkDatasourceBinaryOwnership(path string, info os.FileInfo) error {
	mode := info.Mode().Perm()
	if mode&0o111 == 0 {
		return fmt.Errorf("plugin binary is not executable, run: chmod +x %s", path)
	}
	if mode&0o022 != 0 {
		return fmt.Errorf("plugin binary is group- or world-writable (%04o), run: chmod go-w %s", mode, path)
	}

	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return errors.New("plugin binary ownership could not be determined")
	}
	// Root-owned files are accepted alongside the user's own: a binary the user
	// cannot write is a stronger guarantee than one they can, not a weaker one.
	if owner := int(stat.Uid); owner != os.Getuid() && owner != 0 {
		return fmt.Errorf("plugin binary is owned by uid %d, not by you (uid %d)", owner, os.Getuid())
	}
	return nil
}

// baseDatasourceEnvironment is the minimum a program needs to start and resolve
// names. Everything else the plugin gets comes from its own env: block.
func baseDatasourceEnvironment() []string {
	environment := []string{"PATH=/usr/local/bin:/usr/bin:/bin"}
	for _, key := range []string{"HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR"} {
		if value, present := os.LookupEnv(key); present {
			environment = append(environment, key+"="+value)
		}
	}
	return environment
}

type datasourceProcess struct{}

func newDatasourceProcess(command *exec.Cmd) (*datasourceProcess, error) {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return &datasourceProcess{}, nil
}

func (*datasourceProcess) Run(command *exec.Cmd) error {
	if err := command.Start(); err != nil {
		return err
	}
	return command.Wait()
}

// Kill terminates the whole group. A plugin that spawned a child would
// otherwise keep the pipe open and outlive its own timeout.
func (*datasourceProcess) Kill(command *exec.Cmd) error {
	if command.Process == nil {
		return nil
	}
	if err := syscall.Kill(-command.Process.Pid, syscall.SIGKILL); err != nil {
		return command.Process.Kill()
	}
	return nil
}

func (*datasourceProcess) Close() error { return nil }
