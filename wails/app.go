package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	skillOpsHost = "127.0.0.1"
	skillOpsPort = "18765"
	skillOpsURL  = "http://" + skillOpsHost + ":" + skillOpsPort
)

//go:embed all:backend-dist all:assets
var bundledFiles embed.FS

// App is the Wails backend that starts the existing SkillOps local service.
type App struct {
	ctx     context.Context
	cmd     *exec.Cmd
	tempDir string
	logFile *os.File
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	logLine("startup")
	go a.ensureLocalServer()
}

func (a *App) shutdown(ctx context.Context) {
	logLine("shutdown")
	if a.cmd != nil && a.cmd.Process != nil {
		_ = a.cmd.Process.Signal(os.Interrupt)
		done := make(chan struct{})
		go func() {
			_ = a.cmd.Wait()
			close(done)
		}()

		select {
		case <-done:
		case <-time.After(2 * time.Second):
			_ = a.cmd.Process.Kill()
		}
	}

	if a.tempDir != "" {
		_ = os.RemoveAll(a.tempDir)
	}
	if a.logFile != nil {
		_ = a.logFile.Close()
		a.logFile = nil
	}
}

func (a *App) LocalURL() string {
	return skillOpsURL
}

func (a *App) ensureLocalServer() {
	logLine("ensure local server")
	if waitForLocalServer(500 * time.Millisecond) {
		logLine("local server already running")
		return
	}

	nodePath, err := findNode()
	if err != nil {
		logLine(err.Error())
		fmt.Fprintln(os.Stderr, err)
		return
	}
	logLine("node: " + nodePath)

	tempDir, err := os.MkdirTemp("", "skillops-wails-*")
	if err != nil {
		logLine(fmt.Sprintf("create temp dir failed: %v", err))
		fmt.Fprintf(os.Stderr, "SkillOps Wails: create temp dir failed: %v\n", err)
		return
	}
	a.tempDir = tempDir
	logLine("temp dir: " + tempDir)

	if err := extractBundledFiles(tempDir); err != nil {
		logLine(fmt.Sprintf("extract embedded files failed: %v", err))
		fmt.Fprintf(os.Stderr, "SkillOps Wails: extract embedded files failed: %v\n", err)
		return
	}
	logLine("embedded files extracted")

	scriptPath := filepath.Join(tempDir, "backend-dist", "cli.js")
	cmd := exec.Command(
		nodePath,
		scriptPath,
		"ui",
		"--host",
		skillOpsHost,
		"--port",
		skillOpsPort,
		"--root",
		defaultRoot(),
	)
	cmd.Env = append(os.Environ(), "SKILLOPS_SHELL=wails")
	if logFile, err := os.OpenFile("/tmp/skillops-wails.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
		a.logFile = logFile
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	} else {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}

	if err := cmd.Start(); err != nil {
		logLine(fmt.Sprintf("start local server failed: %v", err))
		fmt.Fprintf(os.Stderr, "SkillOps Wails: start local server failed: %v\n", err)
		return
	}
	logLine(fmt.Sprintf("started node pid %d", cmd.Process.Pid))

	a.cmd = cmd
	go func() {
		if err := cmd.Wait(); err != nil {
			logLine(fmt.Sprintf("node server exited: %v", err))
		} else {
			logLine("node server exited")
		}
		if a.logFile != nil {
			_ = a.logFile.Close()
			a.logFile = nil
		}
	}()

	if waitForLocalServer(10 * time.Second) {
		logLine("local server ready")
	} else {
		logLine("local server not ready after timeout")
	}
}

func findNode() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("SKILLOPS_NODE")); configured != "" {
		if _, err := os.Stat(configured); err == nil {
			return configured, nil
		}
	}

	if nodePath, err := exec.LookPath("node"); err == nil {
		return nodePath, nil
	}

	candidates := []string{
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
	}
	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			filepath.Join(os.Getenv("ProgramFiles"), "nodejs", "node.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "nodejs", "node.exe"),
		)
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("SkillOps Wails: Node.js not found. Install Node 20+ or set SKILLOPS_NODE.")
}

func extractBundledFiles(targetRoot string) error {
	return fs.WalkDir(bundledFiles, ".", func(pathName string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if pathName == "." {
			return nil
		}

		targetPath := filepath.Join(targetRoot, filepath.FromSlash(pathName))
		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0o755)
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}

		bytes, err := bundledFiles.ReadFile(pathName)
		if err != nil {
			return err
		}
		return os.WriteFile(targetPath, bytes, 0o644)
	})
}

func waitForLocalServer(timeout time.Duration) bool {
	client := http.Client{Timeout: 400 * time.Millisecond}
	deadline := time.Now().Add(timeout)

	for {
		response, err := client.Get(skillOpsURL + "/assets/logo.svg")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode >= 200 && response.StatusCode < 500 {
				return true
			}
		}

		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(250 * time.Millisecond)
	}
}

func defaultRoot() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return home
	}
	if workingDir, err := os.Getwd(); err == nil {
		return workingDir
	}
	return "."
}

func logLine(message string) {
	line := fmt.Sprintf("%s %s\n", time.Now().Format(time.RFC3339), message)
	file, err := os.OpenFile("/tmp/skillops-wails.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.WriteString(line)
}
