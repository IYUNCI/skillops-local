package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"os"
	stdRuntime "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	logLine("main start")
	// Create an instance of the app structure
	app := NewApp()
	app.ensureLocalServer()

	appMenu := buildMenu(app)

	// Create application with options
	err := wails.Run(&options.App{
		Title:     appProductName,
		Width:     1280,
		Height:    860,
		MinWidth:  1040,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 245, G: 247, B: 251, A: 1},
		Menu:             appMenu,
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Debug: options.Debug{
			OpenInspectorOnStartup: os.Getenv("SKILLOPS_OPEN_INSPECTOR") == "1",
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameAqua,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   appProductName,
				Message: fmt.Sprintf("%s\n\n版本：%s\n作者：%s\n%s", appProductName, appVersion, appAuthor, appCopyright),
			},
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		logLine("wails run error: " + err.Error())
		println("Error:", err.Error())
	} else {
		logLine("wails run returned")
	}
}

func buildMenu(app *App) *menu.Menu {
	root := menu.NewMenu()

	if stdRuntime.GOOS == "darwin" {
		root.Append(menu.AppMenu())
	}

	workbench := root.AddSubmenu("工作台")
	workbench.AddText("打开仪表盘", keys.CmdOrCtrl("1"), func(_ *menu.CallbackData) {
		_ = app.OpenLocalPage("")
	})
	workbench.AddText("打开扫描页面", keys.CmdOrCtrl("2"), func(_ *menu.CallbackData) {
		_ = app.OpenLocalPage("/scan")
	})
	workbench.AddText("打开 MCP 管理", nil, func(_ *menu.CallbackData) {
		_ = app.OpenLocalPage("/mcp")
	})
	workbench.AddSeparator()
	workbench.AddText("检查更新", nil, func(_ *menu.CallbackData) {
		result, err := app.CheckForUpdate("", "", appVersion)
		if err != nil {
			runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.WarningDialog, Title: "更新检测失败", Message: err.Error()})
			return
		}
		available, _ := result["isAvailable"].(bool)
		if available {
			runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.InfoDialog, Title: "检测到新版本", Message: fmt.Sprintf("当前版本: %s，最新版本: %s\n\n%s", result["current"], result["latest"], result["releaseUrl"])})
		} else {
			runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.InfoDialog, Title: "无可用更新", Message: "当前已是最新版本。"})
		}
	})
	workbench.AddText("重启本地服务", keys.CmdOrCtrl("r"), func(_ *menu.CallbackData) {
		if err := app.RestartLocalServer(); err != nil {
			runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.WarningDialog, Title: "服务重启失败", Message: err.Error()})
			return
		}
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.InfoDialog, Title: "服务重启", Message: "本地服务已重启。"})
	})
	workbench.AddText("退出", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	system := root.AddSubmenu("系统")
	system.AddText("签名与打包", nil, func(_ *menu.CallbackData) {
		status := app.GetSignatureStatus()
		jsonText, _ := jsonForDisplay(status)
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.InfoDialog, Title: "签名状态", Message: jsonText})
	})
	system.AddText("打开安装器目录", nil, func(_ *menu.CallbackData) {
		if err := app.OpenInstallerFolder(); err != nil {
			runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{Type: runtime.WarningDialog, Title: "打开目录失败", Message: err.Error()})
			return
		}
	})
	system.AddText("打开发布页", nil, func(_ *menu.CallbackData) {
		_ = app.OpenURL("https://github.com/your-org/skillops-local/releases")
	})

	if stdRuntime.GOOS == "darwin" {
		root.Append(menu.EditMenu())
		root.Append(menu.WindowMenu())
	} else {
		root.Append(menu.EditMenu())
	}

	return root
}

func jsonForDisplay(input map[string]interface{}) (string, error) {
	buffer := &bytes.Buffer{}
	encoder := json.NewEncoder(buffer)
	encoder.SetIndent("", "  ")
	err := encoder.Encode(input)
	return buffer.String(), err
}
