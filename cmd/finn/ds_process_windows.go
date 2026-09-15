//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

// checkDatasourceBinaryOwnership has no cheap Windows equivalent: the unix mode
// bits Finn checks do not exist here, and reading an ACL would pull in a
// dependency for a check that ACL defaults already cover. The pinned sha256 in
// config.yml is what carries the guarantee on this platform.
func checkDatasourceBinaryOwnership(_ string, _ os.FileInfo) error {
	return nil
}

// baseDatasourceEnvironment keeps the variables Windows itself needs to load a
// process and open a TLS connection. Everything else comes from the plugin's own
// env: block.
func baseDatasourceEnvironment() []string {
	environment := make([]string, 0, 8)
	for _, key := range []string{"SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "PROGRAMDATA"} {
		if value, present := os.LookupEnv(key); present {
			environment = append(environment, key+"="+value)
		}
	}
	return environment
}

// A Job Object is the Windows equivalent of the unix process group used by the
// runner. KILL_ON_JOB_CLOSE also covers descendants a plugin starts itself.
type datasourceProcess struct {
	mu  sync.Mutex
	job windows.Handle
}

func newDatasourceProcess(_ *exec.Cmd) (*datasourceProcess, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("create Job Object: %w", err)
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)),
		uint32(unsafe.Sizeof(limits)),
	); err != nil {
		_ = windows.CloseHandle(job)
		return nil, fmt.Errorf("configure Job Object: %w", err)
	}
	return &datasourceProcess{job: job}, nil
}

func (process *datasourceProcess) Run(command *exec.Cmd) error {
	if err := command.Start(); err != nil {
		return err
	}
	handle, err := windows.OpenProcess(
		windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION,
		false,
		uint32(command.Process.Pid),
	)
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		return fmt.Errorf("open plugin process: %w", err)
	}
	defer windows.CloseHandle(handle)
	if err := windows.AssignProcessToJobObject(process.job, handle); err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		return fmt.Errorf("assign plugin to Job Object: %w", err)
	}
	return command.Wait()
}

func (process *datasourceProcess) Kill(command *exec.Cmd) error {
	if command.Process == nil {
		return nil
	}
	process.mu.Lock()
	defer process.mu.Unlock()
	if process.job == 0 {
		return command.Process.Kill()
	}
	if err := windows.TerminateJobObject(process.job, 1); err != nil {
		return command.Process.Kill()
	}
	return nil
}

func (process *datasourceProcess) Close() error {
	process.mu.Lock()
	defer process.mu.Unlock()
	if process.job == 0 {
		return nil
	}
	err := windows.CloseHandle(process.job)
	process.job = 0
	return err
}
