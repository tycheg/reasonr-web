# Tests through the UI

`reasonrd test --driver web` runs the same acceptance tests in a browser against a test mode server (without `--url` the engine starts it itself):

- `given` goes through the test API;
- `when` steps and `then` queries go through the places of the apps: a screen, a list row, a form, submit;
- if a step has several places, the test runs once per place;
- a step whose place is hidden (`if`) or missing is a `ui` failure, unless the test expects errors from the step.

The browser is in the web driver module, so that the engine core does not depend on Playwright; a binary that links the driver has `--driver web`.

```bash
reasonrd web install                          # Chromium for Playwright (Linux: reasonrd web install --with-deps)
reasonrd test --driver api,web --coverage examples/taxi/src
reasonrd test --driver web --place Admin.AdminOrder:Order.Edit --artifacts shots/ examples/taxi/src
```

`--coverage` lists the places no step went through. `--navigate path` opens a screen from the menu rather than by address. `--artifacts` saves screenshots of failures, `--headed` shows the browser window.
