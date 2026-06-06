package main

import (
	"embed"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	logLine("main start")
	// Create an instance of the app structure
	app := NewApp()
	app.ensureLocalServer()

	// Create application menu
	appMenu := menu.NewMenu()
	if runtime.GOOS == "darwin" {
		appMenu.Append(menu.AppMenu())
		appMenu.Append(menu.EditMenu())
		appMenu.Append(menu.WindowMenu())
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "SkillOps Local",
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
				Title:   "SkillOps Local",
				Message: "Version 0.1.1\nLocal-first Skill and MCP capability manager.\n© 2026 SkillOps",
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
