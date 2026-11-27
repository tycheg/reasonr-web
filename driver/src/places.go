package web

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/mxschmitt/playwright-go"
	reasonr "github.com/tycheg/reasonr-compiler"
)

// step is a test step in canonical JSON: the target, the passed arguments
// and the caller.
type step struct {
	ti     *reasonr.TypeInfo
	mi     *reasonr.MethodInfo
	caller reasonr.Caller
	arena  *reasonr.Arena
	auth   string // Authorization in the ephemeral tenant
	me     string // the identifier of the calling actor
	who    string
	target json.RawMessage
	args   map[string]json.RawMessage
}

func (d *Driver) newStep(a *reasonr.Arena, ti *reasonr.TypeInfo, mi *reasonr.MethodInfo, caller reasonr.Caller, id reasonr.Value, args reasonr.Record) (*step, error) {
	s := &step{ti: ti, mi: mi, caller: caller, arena: a, args: map[string]json.RawMessage{}}
	var err error
	if s.auth, err = d.h.Auth(a, caller); err != nil {
		return nil, err
	}
	if caller.Subject.Kind == reasonr.KindID {
		if s.me, err = d.h.IDText(a, caller.Subject); err != nil {
			return nil, err
		}
		s.who = d.r.Schema.Type(caller.Subject.Type).Name + " " + s.me
	} else {
		s.who = strings.Join(caller.Roles, ", ")
	}
	if id.Kind != reasonr.KindNone {
		if s.target, err = d.h.AppendJSON(nil, a, reasonr.Type{Kind: reasonr.KindID, Ref: ti.Ref}, id); err != nil {
			return nil, err
		}
	}
	vals := a.Fields(args)
	for i, p := range mi.Params {
		if i >= len(vals) || vals[i].Kind == reasonr.KindNone {
			continue
		}
		t := p.Type
		t.Optional = true
		if s.args[p.Name], err = d.h.AppendJSON(nil, a, t, vals[i]); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// cand is a step's place: the app, the screen and the node.
type cand struct {
	app    *reasonr.UIApp
	place  reasonr.UIPlace
	screen *reasonr.UIScreen
	node   *reasonr.UINode
}

// candidates are the applicable places of a step (RFC §27.3, item 1): the
// caller has the app, and the place's fixed values match the step's
// arguments. Visibility is checked on the screen. Web apps come first;
// mobile ones go through the same web runtime. With --place a step has
// only that place.
func (d *Driver) candidates(s *step, command bool) []cand {
	apps := append([]reasonr.UIApp(nil), d.r.UI.Apps...)
	sort.SliceStable(apps, func(i, j int) bool { return web(&apps[i]) && !web(&apps[j]) })
	var out []cand
	for i := range apps {
		a := &apps[i]
		if !d.enters(a, s.caller) {
			continue
		}
		for _, p := range a.Places {
			if p.Type != s.ti.Name || p.Method != s.mi.Name || p.Command != command || p.Screen == "" {
				continue
			}
			sc := d.r.UI.Screen(p.Screen)
			n := sc.Node(p.Node)
			if n == nil || !fixed(s, n) {
				continue
			}
			out = append(out, cand{app: d.r.UI.App(a.Name), place: p, screen: sc, node: n})
		}
	}
	// --place narrows the places of its method's steps; the other steps are as usual.
	for _, c := range out {
		if c.place.Name == d.r.Place {
			return []cand{c}
		}
	}
	return out
}

func web(a *reasonr.UIApp) bool {
	for _, p := range a.Platforms {
		if p == "web" {
			return true
		}
	}
	return false
}

func (d *Driver) enters(a *reasonr.UIApp, c reasonr.Caller) bool {
	if c.Subject.Kind == reasonr.KindID {
		if ti := d.r.Schema.Type(c.Subject.Type); ti != nil {
			for _, x := range a.Actors {
				if x == ti.Name {
					return true
				}
			}
		}
	}
	for _, r := range c.Roles {
		for _, x := range a.Roles {
			if x == r {
				return true
			}
		}
	}
	return false
}

// fixed reports whether the place's fixed values match the step's
// arguments: the target me is the caller, constants are the step's values.
func fixed(s *step, n *reasonr.UINode) bool {
	if n.Bind == nil {
		return false
	}
	if t := n.Bind.Target; t != nil && t.From == reasonr.UIFromMe && unquote(s.target) != s.me {
		return false
	}
	for _, a := range n.Bind.Args {
		if a.From == reasonr.UIFromExpr && a.Expr != nil && a.Expr.Func == "" {
			if v, ok := s.args[a.Name]; ok && !jsonEqual(v, a.Expr.Value) {
				return false
			}
		}
	}
	return true
}

// params gives the screen parameters of a place from the step's arguments:
// by the place's bindings, by the target type, by name (RFC §27.3: orderId = o1).
func (d *Driver) params(s *step, c cand) (url.Values, bool) {
	q := url.Values{}
	for _, p := range c.screen.Params {
		var v json.RawMessage
		for _, a := range bindArgs(c.node) {
			if a.From == reasonr.UIFromParam && a.Field == p.Name {
				v = s.value(c.node, a)
			}
		}
		if v == nil && s.target != nil && strings.TrimSuffix(p.Type, "?") == entityName(s.ti)+".Id" {
			v = s.target
		}
		if v == nil {
			v = s.args[p.Name]
		}
		if v == nil {
			if !strings.HasSuffix(p.Type, "?") {
				return nil, false
			}
			continue
		}
		q.Set(p.Name, string(v))
	}
	if after := d.h.After(); after != "" {
		q.Set("_after", after)
	}
	return q, true
}

func bindArgs(n *reasonr.UINode) []reasonr.UIArg {
	out := append([]reasonr.UIArg(nil), n.Bind.Args...)
	if n.Bind.Target != nil {
		out = append(out, *n.Bind.Target)
	}
	return out
}

// value is the step's value for an argument or the target of a place.
func (s *step) value(n *reasonr.UINode, a reasonr.UIArg) json.RawMessage {
	if n.Bind.Target != nil && a.Name == n.Bind.Target.Name && a.Type == n.Bind.Target.Type {
		return s.target
	}
	return s.args[a.Name]
}

func sel(label string) string {
	b, _ := json.Marshal(label)
	return "[data-rr=" + string(b) + "]"
}

// at runs a step in the place c; why != "" — the place is not applicable
// (hidden, no row, the screen parameters cannot be filled). last is the
// step's last place: if it is not applicable either, a screenshot is saved.
func (d *Driver) at(ctx context.Context, s *step, c cand, last bool) (*reasonr.Step, string, error) {
	q, ok := d.params(s, c)
	if !ok {
		return nil, "cannot fill the screen parameters of " + c.screen.Name, nil
	}
	bctx, err := d.r.browser.NewContext(playwright.BrowserNewContextOptions{BaseURL: playwright.String(d.r.URL)})
	if err != nil {
		return nil, "", err
	}
	defer bctx.Close()
	session, _ := json.Marshal(map[string]string{"authorization": s.auth, "me": s.me, "label": s.who})
	if err := bctx.AddInitScript(playwright.Script{Content: playwright.String(
		"sessionStorage.setItem('reasonr.session', " + strconv.Quote(string(session)) + ");")}); err != nil {
		return nil, "", err
	}
	page, err := bctx.NewPage()
	if err != nil {
		return nil, "", err
	}
	page.SetDefaultTimeout(float64(d.r.Timeout.Milliseconds()))
	path := "/ui/" + url.PathEscape(c.app.Name) + "/" + url.PathEscape(c.screen.Name) + "?" + q.Encode()
	var st *reasonr.Step
	var why string
	if c.place.Command {
		st, why, err = d.command(ctx, page, s, c, path)
	} else {
		st, why, err = d.query(page, s, c, path)
	}
	if err != nil || why != "" && last {
		d.shot(page, c.place.Name)
	}
	return st, why, err
}

// open opens a screen: by address or, with --navigate path, from the menu.
func (d *Driver) open(page playwright.Page, c cand, path string) error {
	if d.r.Navigate && len(c.screen.Params) == 0 {
		if _, err := page.Goto("/ui/" + url.PathEscape(c.app.Name)); err != nil {
			return err
		}
		link := page.Locator(sel("link:" + c.screen.Name)).First()
		if err := link.WaitFor(playwright.LocatorWaitForOptions{Timeout: playwright.Float(3000)}); err == nil {
			if err := link.Click(); err != nil {
				return err
			}
			return page.Locator(sel("screen:" + c.app.Name + "." + c.screen.Name)).WaitFor()
		}
	}
	if _, err := page.Goto(path); err != nil {
		return err
	}
	return page.Locator(sel("screen:" + c.app.Name + "." + c.screen.Name)).WaitFor()
}

// rowNode is the table or list node in whose row the place stands, or 0.
func rowNode(n *reasonr.UINode) int {
	for _, a := range bindArgs(n) {
		if a.From == reasonr.UIFromRow {
			return a.Node
		}
	}
	return 0
}

func (d *Driver) command(ctx context.Context, page playwright.Page, s *step, c cand, path string) (*reasonr.Step, string, error) {
	if err := d.open(page, c, path); err != nil {
		return nil, "the screen did not open: " + err.Error(), nil
	}
	scope := page.Locator("body")
	if list := rowNode(c.node); list != 0 {
		listPlace := ""
		for _, p := range c.app.Places {
			if p.Screen == c.screen.Name && p.Node == list {
				listPlace = p.Name
			}
		}
		id := unquote(s.target)
		item := page.Locator(sel("item:" + listPlace + ":" + id))
		for i := 0; ; i++ {
			if n, _ := item.Count(); n > 0 {
				break
			}
			more := page.Locator(sel("more:" + listPlace))
			if n, _ := more.Count(); n == 0 || i > 50 {
				return nil, "no row " + id, nil
			}
			rows := `[data-rr^="item:` + listPlace + `:"]`
			n := count(page.Locator(rows))
			if err := more.First().Click(); err != nil {
				return nil, "", err
			}
			if _, err := page.WaitForFunction(`([sel, n]) => document.querySelectorAll(sel).length > n`, []any{rows, n}); err != nil {
				return nil, "no row " + id, nil
			}
		}
		scope = item.First()
	}
	name := c.place.Name
	if err := scope.Locator(sel("place:" + name)).First().WaitFor(playwright.LocatorWaitForOptions{Timeout: playwright.Float(3000)}); err != nil {
		return nil, "the place is hidden", nil
	}
	if open := scope.Locator(sel("open:" + name)); count(open) > 0 {
		if err := open.First().Click(); err != nil {
			return nil, "", err
		}
	}
	// The step's new identifiers — for the new values of the place.
	var ids []string
	if t := c.node.Bind.Target; t != nil && t.From == reasonr.UIFromNew {
		ids = append(ids, unquote(s.target))
	}
	for _, a := range c.node.Bind.Args {
		if a.From == reasonr.UIFromNew && s.args[a.Name] != nil {
			ids = append(ids, unquote(s.args[a.Name]))
		}
	}
	if len(ids) > 0 {
		if _, err := page.Evaluate(`ids => { window.__reasonr = window.__reasonr || { inputs: {} }; window.__reasonr.ids = ids; }`, ids); err != nil {
			return nil, "", err
		}
	}
	for _, a := range bindArgs(c.node) {
		v := s.value(c.node, a)
		if !a.Input || v == nil {
			continue
		}
		label := "input:" + name + "." + a.Name
		if _, err := page.WaitForFunction(`l => !!(window.__reasonr && window.__reasonr.inputs[l])`, label); err != nil {
			return nil, "no input " + a.Name, nil
		}
		var x any
		_ = json.Unmarshal(v, &x)
		if _, err := page.Evaluate(`([l, v]) => window.__reasonr.inputs[l](v)`, []any{label, x}); err != nil {
			return nil, "", err
		}
	}
	submit := scope.Locator(sel("submit:" + name))
	if count(submit) == 0 {
		submit = page.Locator(sel("submit:" + name)).Last() // the form dialog is outside the row
	} else {
		submit = submit.First()
	}
	suffix := "/app/" + c.app.Name + "/" + c.screen.Name + "/" + strconv.Itoa(c.node.ID)
	resp, err := page.ExpectResponse(func(r playwright.Response) bool {
		return r.Request().Method() == "POST" && strings.HasSuffix(urlPath(r.URL()), suffix)
	}, func() error { return submit.Click() })
	if err != nil {
		return nil, "", fmt.Errorf("the command response: %w", err)
	}
	body, err := resp.Body()
	if err != nil {
		return nil, "", err
	}
	st := d.h.NewStep()
	if err := d.h.Response(st, resp.Status(), body, s.caller, s.arena); err != nil {
		return nil, "", err
	}
	if err := d.h.Captured(ctx, st); err != nil {
		return nil, "", err
	}
	for _, be := range st.Errors {
		if err := page.Locator(sel("error:" + be.Name)).First().WaitFor(playwright.LocatorWaitForOptions{
			State: playwright.WaitForSelectorStateAttached, Timeout: playwright.Float(3000)}); err != nil {
			return nil, "", fmt.Errorf("error %s is not shown in the UI", be.Name)
		}
	}
	return st, "", nil
}

// screenData is the screen data response.
type screenData struct {
	Nodes map[string]struct {
		Data    json.RawMessage   `json:"data"`
		Errors  []json.RawMessage `json:"errors"`
		Hidden  bool              `json:"hidden"`
		Pending bool              `json:"pending"`
	} `json:"nodes"`
}

func (d *Driver) query(page playwright.Page, s *step, c cand, path string) (*reasonr.Step, string, error) {
	dataPath := "/app/" + c.app.Name + "/" + c.screen.Name
	resp, err := page.ExpectResponse(func(r playwright.Response) bool {
		return r.Request().Method() == "GET" && urlPath(r.URL()) == dataPath
	}, func() error { return d.open(page, c, path) })
	if err != nil {
		return nil, "the screen did not open: " + err.Error(), nil
	}
	body, err := resp.Body()
	if err != nil {
		return nil, "", err
	}
	var sd screenData
	if err := json.Unmarshal(body, &sd); err != nil {
		return nil, "", fmt.Errorf("screen data: %w", err)
	}
	ns, ok := sd.Nodes[strconv.Itoa(c.node.ID)]
	if !ok || ns.Hidden {
		return nil, "the place is hidden", nil
	}
	data := ns.Data
	// Filters: the step's values that are not in the screen data are entered.
	if filters := d.filters(s, c); len(filters) > 0 || ns.Pending {
		suffix := dataPath + "/" + strconv.Itoa(c.node.ID)
		resp, err := page.ExpectResponse(func(r playwright.Response) bool {
			return r.Request().Method() == "GET" && urlPath(r.URL()) == suffix
		}, func() error { return d.setInputs(page, c.place.Name, filters) })
		if err != nil {
			return nil, "filters: " + err.Error(), nil
		}
		b, err := resp.Body()
		if err != nil {
			return nil, "", err
		}
		var one struct {
			Data   json.RawMessage   `json:"data"`
			Errors []json.RawMessage `json:"errors"`
		}
		if err := json.Unmarshal(b, &one); err != nil {
			return nil, "", err
		}
		data, ns.Errors = one.Data, one.Errors
	}
	st := d.h.NewStep()
	for _, raw := range ns.Errors {
		be, err := d.h.DecodeError(raw)
		if err != nil {
			return nil, "", err
		}
		st.Errors = append(st.Errors, be)
	}
	if len(st.Errors) > 0 || len(data) == 0 {
		return st, "", nil
	}
	if st.Result, err = d.h.DecodeJSON(st.Arena, *s.mi.Result, data); err != nil {
		return nil, "", fmt.Errorf("result: %w", err)
	}
	res := page.Locator(sel("result:" + c.place.Name)).First()
	if v, err := res.GetAttribute("data-rr-value"); err != nil || v == "" {
		return nil, "", fmt.Errorf("result %s is not shown in the UI", c.place.Name)
	}
	return st, "", nil
}

// filters gives the step's values for the place's filters that differ from
// the defaults.
func (d *Driver) filters(s *step, c cand) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for _, a := range c.node.Bind.Args {
		v, ok := s.args[a.Name]
		if !a.Input || !ok || (a.Default && jsonEqual(v, a.Value)) {
			continue
		}
		out[a.Name] = v
	}
	return out
}

func (d *Driver) setInputs(page playwright.Page, place string, vals map[string]json.RawMessage) error {
	for name, v := range vals {
		label := "input:" + place + "." + name
		if _, err := page.WaitForFunction(`l => !!(window.__reasonr && window.__reasonr.inputs[l])`, label); err != nil {
			return fmt.Errorf("no input %s", name)
		}
		var x any
		_ = json.Unmarshal(v, &x)
		if _, err := page.Evaluate(`([l, v]) => window.__reasonr.inputs[l](v)`, []any{label, x}); err != nil {
			return err
		}
	}
	return nil
}

func count(l playwright.Locator) int {
	n, _ := l.Count()
	return n
}

func urlPath(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return u.Path
}

func unquote(b json.RawMessage) string {
	var s string
	if json.Unmarshal(b, &s) == nil {
		return s
	}
	return string(b)
}

func jsonEqual(a json.RawMessage, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	xa, _ := json.Marshal(x)
	ya, _ := json.Marshal(y)
	return string(xa) == string(ya)
}

// entityName is the entity name of a type: Ordering.Order, whose Id is written Ordering.Order.Id.
func entityName(ti *reasonr.TypeInfo) string { return ti.Name }
