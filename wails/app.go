package main

import (
	"bufio"
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	gotime "runtime"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	appProductName = "SkillOps Local"
	skillOpsHost = "127.0.0.1"
	skillOpsPort = "18765"
	skillOpsURL  = "http://" + skillOpsHost + ":" + skillOpsPort
	logFilePath  = "/tmp/skillops-wails.log"

	defaultUpdateRepoOwner = "IYUNCI"
	defaultUpdateRepoName  = "skillops-local"
	appVersion            = "0.1.3"
	appAuthor             = "yunpai"
	appCopyright          = "Copyright © 2026 云磁数字"
)

//go:embed all:backend-dist all:assets
var bundledFiles embed.FS

// App is the Wails backend that starts the existing SkillOps local service.
type App struct {
	ctx       context.Context
	cmd       *exec.Cmd
	tempDir   string
	logFile   *os.File
	logPath   string
	nodePath  string
	launched  time.Time
	stateLock sync.Mutex
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.logPath = logFilePath
	a.launched = time.Now()
	logLine("startup")
	go func() {
		if err := a.ensureLocalServer(); err != nil {
			logLine(fmt.Sprintf("ensure local server failed: %v", err))
		}
	}()
}

func (a *App) shutdown(ctx context.Context) {
	logLine("shutdown")
	a.stopLocalServer()
}

func (a *App) LocalURL() string {
	return skillOpsURL
}

func (a *App) GetCurrentVersion() string {
	return appVersion
}

func (a *App) GetDesktopState() map[string]interface{} {
	a.stateLock.Lock()
	cmd := a.cmd
	nodePath := a.nodePath
	logPath := a.logPath
	launched := a.launched
	a.stateLock.Unlock()

	isRunning := false
	pid := 0
	if cmd != nil && cmd.Process != nil && cmd.ProcessState == nil {
		isRunning = true
		pid = cmd.Process.Pid
	}

	isReady := waitForLocalServer(400 * time.Millisecond)
	status := "未启动"
	if isRunning {
		if isReady {
			status = "运行中"
		} else {
			status = "启动中"
		}
	} else if isReady {
		status = "外部可访问"
	}

	return map[string]interface{}{
		"version":        appVersion,
		"status":         status,
		"url":            skillOpsURL,
		"isRunning":      isRunning,
		"isReady":        isReady,
		"pid":            pid,
		"nodePath":       nodePath,
		"logPath":        logPath,
		"launchTime":     launched.Format(time.RFC3339),
		"platform":       gotime.GOOS,
		"architecture":   gotime.GOARCH,
	}
}

func (a *App) RestartLocalServer() error {
	logLine("restart local server requested")
	a.stopLocalServer()
	return a.ensureLocalServer()
}

func (a *App) OpenLocalPage(relativePath string) error {
	if strings.TrimSpace(relativePath) == "" {
		runtime.BrowserOpenURL(a.ctx, skillOpsURL+"/?shell=wails")
		return nil
	}

	trimmed := strings.TrimSpace(relativePath)
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		runtime.BrowserOpenURL(a.ctx, trimmed)
		return nil
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}

	targetPath := strings.TrimSpace(parsed.Path)
	if targetPath == "" {
		targetPath = "/"
	}
	if !strings.HasPrefix(targetPath, "/") {
		targetPath = "/" + targetPath
	}

	runtime.BrowserOpenURL(a.ctx, skillOpsURL+targetPath+"?shell=wails")
	return nil
}

func (a *App) OpenURL(rawURL string) error {
	candidate := strings.TrimSpace(rawURL)
	if candidate == "" {
		return errors.New("url is empty")
	}
	_, err := url.ParseRequestURI(candidate)
	if err != nil {
		return fmt.Errorf("invalid url: %w", err)
	}
	runtime.BrowserOpenURL(a.ctx, candidate)
	return nil
}

func (a *App) OpenInstallerFolder() error {
	paths := a.GetInstallerPaths()
	folder, ok := paths["installerFolder"].(string)
	if !ok || folder == "" {
		return errors.New("未能获取安装器目录")
	}
	return openPathInSystem(folder)
}

func (a *App) GetInstallerPaths() map[string]interface{} {
	home := os.Getenv("HOME")
	if home == "" {
		home = os.TempDir()
	}

	buildRoot := filepath.Join(home, ".skillops", "builds", "wails", "mac-"+gotime.GOARCH)
	insRoot := filepath.Join(home, ".skillops", "builds", "installer", "darwin", "mac-"+gotime.GOARCH)

	appPath := resolveBuiltAppPath(buildRoot)
	appName := "SkillOps Local"
	if filepath.Base(appPath) != "" && strings.HasSuffix(strings.ToLower(filepath.Base(appPath)), ".app") {
		appName = strings.TrimSuffix(filepath.Base(appPath), filepath.Ext(filepath.Base(appPath)))
	}
	safeName := strings.ReplaceAll(appName, " ", "_")

	candidateFile := strings.TrimSuffix(safeName, "_")

	return map[string]interface{}{
		"buildRoot":       buildRoot,
		"appPath":         appPath,
		"installerFolder": insRoot,
		"dmgFile":         filepath.Join(insRoot, candidateFile+".dmg"),
		"pkgFile":         filepath.Join(insRoot, candidateFile+".pkg"),
		"isReady":         appPath != "",
		"recommendedCommand": "npm run desktop:package:mac:installer",
		"releaseCommand":  "npm run wails:pack:mac-m4 && npm run desktop:package:mac:installer",
	}
}

func (a *App) GetSignatureStatus() map[string]interface{} {
	if gotime.GOOS != "darwin" {
		return map[string]interface{}{
			"platform":   gotime.GOOS,
			"isSigned":   false,
			"isSupported": false,
			"status":     "签名检测当前仅支持 macOS",
		}
	}

	appPath := resolveAppBundlePath()
	cmd := exec.Command("/usr/bin/codesign", "-dv", "--verbose=4", appPath)
	output, err := cmd.CombinedOutput()
	payload := string(output)

	result := map[string]interface{}{
		"platform":  "darwin",
		"isSigned":  err == nil,
		"appPath":   appPath,
		"rawOutput": payload,
	}
	if err != nil {
		result["status"] = "未签名或校验失败"
		result["error"] = err.Error()
		if strings.Contains(payload, "code object is not signed") {
			result["status"] = "未签名"
		}
		return result
	}

	parsed := parseCodeSignOutput(payload)
	for k, v := range parsed {
		result[k] = v
	}
	if _, ok := result["Identifier"]; ok {
		result["status"] = "已签名"
	} else {
		result["status"] = "签名信息不完整"
	}
	return result
}

func parseCodeSignOutput(raw string) map[string]string {
	r := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "Identifier=") {
			r["Identifier"] = strings.TrimPrefix(line, "Identifier=")
		}
		if strings.HasPrefix(line, "TeamIdentifier=") {
			r["TeamIdentifier"] = strings.TrimPrefix(line, "TeamIdentifier=")
		}
		if strings.HasPrefix(line, "TeamIdentifier\t") {
			r["TeamIdentifier"] = strings.TrimPrefix(line, "TeamIdentifier\t")
		}
		if strings.HasPrefix(line, "Authority=") {
			r["Authority"] = strings.TrimPrefix(line, "Authority=")
		}
	}
	return r
}

func (a *App) CheckForUpdate(owner string, repo string, currentVersion string) (map[string]interface{}, error) {
	owner = strings.TrimSpace(owner)
	repo = strings.TrimSpace(repo)
	if owner == "" {
		owner = defaultUpdateRepoOwner
	}
	if repo == "" {
		repo = defaultUpdateRepoName
	}
	if currentVersion == "" {
		currentVersion = appVersion
	}

	release, err := fetchLatestRelease(owner, repo)
	if err != nil {
		return nil, err
	}

	latest := strings.TrimSpace(release.TagName)
	if latest == "" {
		latest = strings.TrimSpace(release.Name)
	}
	if latest == "" {
		return nil, errors.New("release 信息缺少版本号")
	}

	available := isVersionNewer(latest, currentVersion)
	return map[string]interface{}{
		"owner":         owner,
		"repo":          repo,
		"current":       currentVersion,
		"latest":        latest,
		"name":          release.Name,
		"notes":         release.Body,
		"publishedAt":   release.Published,
		"releaseUrl":    release.HTMLURL,
		"isAvailable":   available,
		"isPrerelease":  release.Prerelease,
		"hasUpdate":     available,
	}, nil
}

type githubRelease struct {
	TagName    string `json:"tag_name"`
	Name       string `json:"name"`
	HTMLURL    string `json:"html_url"`
	Body       string `json:"body"`
	Prerelease bool   `json:"prerelease"`
	Published  string `json:"published_at"`
}

func fetchLatestRelease(owner, repo string) (githubRelease, error) {
	urlStr := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", url.PathEscape(owner), url.PathEscape(repo))
	request, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return githubRelease{}, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "skillops-desktop")

	client := &http.Client{Timeout: 12 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return githubRelease{}, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
	body := readAll(response.Body)
	return githubRelease{}, fmt.Errorf("GitHub API error: %s (%s)", response.Status, strings.TrimSpace(string(body)))
	}

	payload := githubRelease{}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return githubRelease{}, err
	}
	return payload, nil
}

func readAll(reader io.Reader) []byte {
	buf := bytes.Buffer{}
	_, _ = buf.ReadFrom(reader)
	return buf.Bytes()
}

func isVersionNewer(latest string, current string) bool {
	return compareVersionParts(latest, current) > 0
}

func compareVersionParts(a string, b string) int {
	aParts := normalizeVersionParts(a)
	bParts := normalizeVersionParts(b)
	max := len(aParts)
	if len(bParts) > max {
		max = len(bParts)
	}

	for i := 0; i < max; i++ {
		left := 0
		right := 0
		if i < len(aParts) {
			left = aParts[i]
		}
		if i < len(bParts) {
			right = bParts[i]
		}
		if left > right {
			return 1
		}
		if left < right {
			return -1
		}
	}
	return 0
}

func normalizeVersionParts(value string) []int {
	clean := strings.TrimSpace(strings.ToLower(value))
	clean = strings.TrimPrefix(clean, "v")
	if idx := strings.IndexRune(clean, '+'); idx >= 0 {
		clean = clean[:idx]
	}
	if idx := strings.IndexRune(clean, '-'); idx >= 0 {
		clean = clean[:idx]
	}
	parts := strings.Split(clean, ".")

	result := make([]int, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		num, err := strconv.Atoi(part)
		if err != nil {
			num = 0
		}
		result = append(result, num)
	}
	for len(result) < 3 {
		result = append(result, 0)
	}
	return result
}

func (a *App) ensureLocalServer() error {
	logLine("ensure local server")
	if waitForLocalServer(500 * time.Millisecond) {
		logLine("local server already running")
		return nil
	}

	nodePath, err := findNode()
	if err != nil {
		logLine(err.Error())
		fmt.Fprintln(os.Stderr, err)
		return err
	}
	logLine("node: " + nodePath)

	tempDir, err := os.MkdirTemp("", "skillops-wails-*")
	if err != nil {
		logLine(fmt.Sprintf("create temp dir failed: %v", err))
		fmt.Fprintf(os.Stderr, "SkillOps Wails: create temp dir failed: %v\n", err)
		return err
	}
	logLine("temp dir: " + tempDir)

	if err := extractBundledFiles(tempDir); err != nil {
		logLine(fmt.Sprintf("extract embedded files failed: %v", err))
		fmt.Fprintf(os.Stderr, "SkillOps Wails: extract embedded files failed: %v\n", err)
		_ = os.RemoveAll(tempDir)
		return err
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
	logFile := a.logFile
	if logFile == nil {
		logFile, _ = os.OpenFile(defaultLogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	}
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	} else {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}

	if err := cmd.Start(); err != nil {
		logLine(fmt.Sprintf("start local server failed: %v", err))
		fmt.Fprintf(os.Stderr, "SkillOps Wails: start local server failed: %v\n", err)
		if logFile != nil {
			_ = logFile.Close()
		}
		_ = os.RemoveAll(tempDir)
		return err
	}

	logLine(fmt.Sprintf("started node pid %d", cmd.Process.Pid))
	logPath := logFile.Name()

	a.stateLock.Lock()
	a.cmd = cmd
	a.nodePath = nodePath
	a.tempDir = tempDir
	a.logFile = logFile
	a.logPath = logPath
	a.stateLock.Unlock()

	go a.monitorCommand(cmd, logFile)

	if waitForLocalServer(10 * time.Second) {
		logLine("local server ready")
		return nil
	}

	logLine("local server not ready after timeout")
	return errors.New("local server not ready after timeout")
}

func (a *App) monitorCommand(cmd *exec.Cmd, logFile *os.File) {
	if err := cmd.Wait(); err != nil {
		logLine(fmt.Sprintf("node server exited: %v", err))
	} else {
		logLine("node server exited")
	}

	a.stateLock.Lock()
	if a.cmd == cmd {
		a.cmd = nil
	}
	if a.logFile == logFile {
		a.logFile = nil
	}
	a.stateLock.Unlock()

	if logFile != nil {
		_ = logFile.Close()
	}
}

func (a *App) stopLocalServer() {
	a.stateLock.Lock()
	cmd := a.cmd
	tempDir := a.tempDir
	logFile := a.logFile
	a.cmd = nil
	a.tempDir = ""
	a.logFile = nil
	a.stateLock.Unlock()

	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
		done := make(chan struct{})
		go func() {
			_ = cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			_ = cmd.Process.Kill()
		}
	}
	if tempDir != "" {
		_ = os.RemoveAll(tempDir)
	}
	if logFile != nil {
		_ = logFile.Close()
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
	if gotime.GOOS == "windows" {
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

func defaultRoot() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return home
	}
	if workingDir, err := os.Getwd(); err == nil {
		return workingDir
	}
	return "."
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

func resolveBuiltAppPath(buildRoot string) string {
	if stat, err := os.Stat(buildRoot); err != nil || !stat.IsDir() {
		return ""
	}

	candidates := []string{
		"SkillOps Local.app",
		"SkillOpsLocal.app",
	}
	for _, name := range candidates {
		candidate := filepath.Join(buildRoot, name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	dirs, err := os.ReadDir(buildRoot)
	if err != nil {
		return ""
	}
	for _, dir := range dirs {
		if dir.IsDir() && strings.HasSuffix(strings.ToLower(dir.Name()), ".app") {
			return filepath.Join(buildRoot, dir.Name())
		}
	}
	return ""
}

func resolveAppBundlePath() string {
	execPath, err := os.Executable()
	if err != nil {
		return ""
	}
	candidate := filepath.Clean(execPath)
	for i := 0; i < 10; i++ {
		if strings.HasSuffix(strings.ToLower(filepath.Base(candidate)), ".app") {
			return candidate
		}
		parent := filepath.Dir(candidate)
		if parent == candidate {
			break
		}
		candidate = parent
	}
	return execPath
}

func openPathInSystem(target string) error {
	if target == "" {
		return errors.New("目标路径为空")
	}

	var cmd *exec.Cmd
	switch gotime.GOOS {
	case "darwin":
		cmd = exec.Command("open", target)
	case "windows":
		cmd = exec.Command("explorer", target)
	default:
		cmd = exec.Command("xdg-open", target)
	}

	return cmd.Run()
}

func defaultLogPath() string {
	if gotime.GOOS == "windows" {
		return filepath.Join(os.TempDir(), "skillops-wails.log")
	}
	return "/tmp/skillops-wails.log"
}

func logLine(message string) {
	line := fmt.Sprintf("%s %s\n", time.Now().Format(time.RFC3339), message)
	file, err := os.OpenFile(defaultLogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.WriteString(line)
}
