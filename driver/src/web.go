// Package web is the acceptance test driver through a browser (reasonrd
// test --driver web; RFC §27.3; RFC §22). A separate module: the core does
// not depend on Playwright.
//
// given, time offset, the commands of external systems and fakes go
// through the server's test API (port.TestAPI, the same ephemeral tenant). A command in when goes through a UI place: signing in as the
// caller, a screen with parameters from the step's arguments, a list row,
// a form dialog, inputs, submit; the step's errors and notifications are
// taken from the place's API response and compared with the shown ones. A
// query in then goes through the query's place: the value of the result:…
// label.
//
// One command can be called from several places (RFC §22.10): the test
// runs k times, k being the largest number of applicable places of one
// step; in the i-th run a step takes the i-th place (cyclically).
package web

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mxschmitt/playwright-go"

	reasonr "github.com/tycheg/reasonr-compiler"
	"github.com/tycheg/reasonr-engine/kind"
)

// Runner is a browser and the places of one model on a reasonrd --test server.
type Runner struct {
	URL    string // the server address
	API    kind.TestAPIFactory
	Model  string          // base or the name of a tenant extension
	Schema *reasonr.Schema // the model schema (as on the server)
	UI     *reasonr.UI     // the model's interface program
	// Place: run the steps only through this place (--place).
	Place string
	// Navigate: go to a screen from the menu (--navigate path), not by address.
	Navigate bool
	// Artifacts is the directory of failure screenshots; "" — no screenshots.
	Artifacts string
	Timeout   time.Duration // waiting for an element; 0 — 10 s
	Headed    bool

	pw      *playwright.Playwright
	browser playwright.Browser
	mu      sync.Mutex
	used    map[string]bool
	systems map[string]bool // the roles of the model's external systems
	shots   int
}

// Install installs the Playwright driver and Chromium; deps — the browser's
// system libraries too (Linux, root rights needed).
func Install(deps bool) error {
	return playwright.Install(&playwright.RunOptions{Browsers: []string{"chromium"}, WithDeps: deps})
}

// Start starts the browser.
func (r *Runner) Start() error {
	if r.Timeout == 0 {
		r.Timeout = 10 * time.Second
	}
	r.used = map[string]bool{}
	r.systems = map[string]bool{}
	for i := range r.Schema.Types {
		if t := &r.Schema.Types[i]; t.Kind == reasonr.TypeExternal && t.Role != "" {
			r.systems[t.Role] = true
		}
	}
	return r.launch()
}

func (r *Runner) launch() error {
	var err error
	if r.pw, err = playwright.Run(&playwright.RunOptions{Verbose: false}); err != nil {
		return fmt.Errorf("playwright: %w (reasonrd web install)", err)
	}
	r.browser, err = r.pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{Headless: playwright.Bool(!r.Headed)})
	if err != nil {
		_ = r.pw.Stop()
		return fmt.Errorf("chromium: %w (reasonrd web install)", err)
	}
	return nil
}

// Close closes the browser.
func (r *Runner) Close() {
	if r.browser != nil {
		_ = r.browser.Close()
	}
	if r.pw != nil {
		_ = r.pw.Stop()
	}
}

// NewRunDriver is the driver of the run run (port.TestRuns.New).
func (r *Runner) NewRunDriver(ctx context.Context, run int) (reasonr.Driver, func(), error) {
	h, err := r.API(ctx)
	if err != nil {
		return nil, nil, err
	}
	d := &Driver{r: r, h: h, run: run}
	return d, func() { _ = h.Close(context.WithoutCancel(ctx)) }, nil
}

// Runs is the number of runs of a test: the largest number of places of a
// step in the first run (port.TestRuns.Runs).
func (r *Runner) Runs(d reasonr.Driver) int { return max(1, d.(*Driver).places) }

// Uncovered gives the app places no step went through (--coverage).
func (r *Runner) Uncovered() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []string
	for _, a := range r.UI.Apps {
		for _, p := range a.Places {
			if !r.used[p.Name] {
				out = append(out, p.Name)
			}
		}
	}
	sort.Strings(out)
	return out
}

func (r *Runner) use(place string) {
	r.mu.Lock()
	r.used[place] = true
	r.mu.Unlock()
}

// Driver is the driver of one test run.
type Driver struct {
	r       *Runner
	h       kind.TestAPI
	run     int
	section reasonr.Section
	places  int // the largest number of applicable places of a step
}

var (
	_ reasonr.Driver        = (*Driver)(nil)
	_ reasonr.SectionDriver = (*Driver)(nil)
	_ reasonr.FeatureDriver = (*Driver)(nil)
)

// EnableFeature switches a test feature flag on through the test API (reasonr.FeatureDriver).
func (d *Driver) EnableFeature(ctx context.Context, name string) error {
	return d.h.EnableFeature(ctx, name)
}

// Section is the section of the next step (reasonr.SectionDriver).
func (d *Driver) Section(s reasonr.Section) { d.section = s }

func (d *Driver) Advance(ctx context.Context, dur time.Duration) (*reasonr.Step, error) {
	return d.h.Advance(ctx, dur)
}

func (d *Driver) NewID(ctx context.Context, a *reasonr.Arena, t reasonr.TypeRef) (reasonr.Value, error) {
	return d.h.NewID(ctx, a, t)
}

// system reports whether the caller is an external system: its answers go through the test API.
func (d *Driver) system(c reasonr.Caller) bool {
	if c.Subject.Kind != reasonr.KindNone {
		return false
	}
	for _, role := range c.Roles {
		if d.r.systems[role] {
			return true
		}
	}
	return false
}

func (d *Driver) Command(ctx context.Context, call reasonr.CommandCall) (*reasonr.Step, error) {
	ti := d.r.Schema.Type(call.Entity)
	if d.section == reasonr.Given || ti.Kind == reasonr.TypeExternal || d.system(call.Caller) {
		return d.h.Command(ctx, call)
	}
	return d.ui(ctx, ti, &ti.Methods[call.Command], true, call.Caller, call.Arena, call.ID, call.Args)
}

func (d *Driver) Query(ctx context.Context, call reasonr.QueryCall) (*reasonr.Step, error) {
	ti := d.r.Schema.Type(call.Type)
	if d.section == reasonr.Given || d.system(call.Caller) {
		return d.h.Query(ctx, call)
	}
	return d.ui(ctx, ti, &ti.Methods[call.Query], false, call.Caller, call.Arena, reasonr.None, call.Args)
}

// ui runs a step through an applicable place: the i-th in the i-th run, and
// if it is hidden in the current state — the next ones.
func (d *Driver) ui(ctx context.Context, ti *reasonr.TypeInfo, mi *reasonr.MethodInfo, command bool,
	caller reasonr.Caller, a *reasonr.Arena, id reasonr.Value, args reasonr.Record) (*reasonr.Step, error) {
	s, err := d.newStep(a, ti, mi, caller, id, args)
	if err != nil {
		return nil, err
	}
	cands := d.candidates(s, command)
	if len(cands) == 0 {
		return d.unavailable(fmt.Sprintf("no place %s.%s for %s", ti.Name, mi.Name, s.who)), nil
	}
	d.places = max(d.places, len(cands))
	var hidden []string
	for i := range cands {
		c := cands[(d.run+i)%len(cands)]
		st, why, err := d.at(ctx, s, c, i == len(cands)-1)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", c.place.Name, err)
		}
		if why == "" {
			d.r.use(c.place.Name)
			return st, nil
		}
		hidden = append(hidden, c.place.Name+": "+why)
	}
	return d.unavailable(strings.Join(hidden, "; ")), nil
}

func (d *Driver) unavailable(why string) *reasonr.Step {
	st := d.h.NewStep()
	st.Unavailable = why
	return st
}

// shot saves a screenshot of a failure page (--artifacts).
func (d *Driver) shot(page playwright.Page, place string) {
	if d.r.Artifacts == "" || page == nil {
		return
	}
	d.r.mu.Lock()
	d.r.shots++
	n := d.r.shots
	d.r.mu.Unlock()
	name := strings.NewReplacer(":", "_", ".", "_", "/", "_").Replace(place)
	_ = os.MkdirAll(d.r.Artifacts, 0o755)
	_, _ = page.Screenshot(playwright.PageScreenshotOptions{Path: playwright.String(filepath.Join(d.r.Artifacts, fmt.Sprintf("%03d-%s.png", n, name)))})
}
