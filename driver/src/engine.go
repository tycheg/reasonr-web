package web

import (
	"context"
	"flag"
	"fmt"
	"io"
	"time"

	reasonr "github.com/tycheg/reasonr-compiler"
	"github.com/tycheg/reasonr-engine/kind"
	"github.com/tycheg/reasonr-engine/port/registry"
)

// A binary that links the package has reasonrd test --driver web and
// reasonrd web install.
func init() {
	kind.RegisterDriver("web", &Engine{})
	registry.RegisterCommand("web", webCommand)
}

// Engine is the --driver web driver of the reasonrd test command (port.TestDriver).
type Engine struct {
	place     string
	navigate  string
	artifacts string
	coverage  bool
	headed    bool
	timeout   time.Duration
	runners   []*Runner
}

var _ kind.TestDriver = (*Engine)(nil)

func (e *Engine) Name() string { return "web" }

func (e *Engine) Flags(fl *flag.FlagSet) {
	fl.StringVar(&e.place, "place", "", "--driver web: steps go only through this place, for example Admin.AdminOrder:Order.Cancel")
	fl.StringVar(&e.navigate, "navigate", "url", "--driver web: reach a screen by address (url) or from the menu (path)")
	fl.StringVar(&e.artifacts, "artifacts", "", "--driver web: the directory of failure screenshots")
	fl.BoolVar(&e.coverage, "coverage", false, "--driver web: print the places no step went through")
	fl.BoolVar(&e.headed, "headed", false, "--driver web: show the browser window")
	fl.DurationVar(&e.timeout, "timeout", 10*time.Second, "--driver web: waiting for a page element")
}

func (e *Engine) Model(ctx context.Context, m *reasonr.Model, model, url string, api kind.TestAPIFactory) (kind.TestRuns, error) {
	r := &Runner{
		URL: url, API: api, Model: model, Schema: m.Schema(), UI: m.UI(),
		Place: e.place, Navigate: e.navigate == "path", Artifacts: e.artifacts,
		Timeout: e.timeout, Headed: e.headed,
	}
	if err := r.Start(); err != nil {
		return kind.TestRuns{}, err
	}
	e.runners = append(e.runners, r)
	runs := kind.TestRuns{New: r.NewRunDriver, Runs: r.Runs}
	if e.coverage {
		runs.Uncovered = r.Uncovered
	}
	return runs, nil
}

func (e *Engine) Close() {
	for _, r := range e.runners {
		r.Close()
	}
	e.runners = nil
}

// webCommand is reasonrd web install [--with-deps]: the Playwright driver
// and Chromium (--with-deps — also the system libraries, Linux).
func webCommand(_ context.Context, args []string, _, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "install" {
		fmt.Fprintln(stderr, "Usage: reasonrd web install [--with-deps]")
		return 2
	}
	fl := flag.NewFlagSet("reasonrd web install", flag.ContinueOnError)
	fl.SetOutput(stderr)
	deps := fl.Bool("with-deps", false, "also install the browser's system libraries (Linux, root rights needed)")
	if err := fl.Parse(args[1:]); err != nil {
		return 2
	}
	if err := Install(*deps); err != nil {
		fmt.Fprintf(stderr, "reasonrd: web install: %v\n", err)
		return 1
	}
	return 0
}
