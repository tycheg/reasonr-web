# The interface

A model's interface is apps, screens and primitives in the language (RFC §22). A product engineer builds screens from primitives bound to queries and commands; no TypeScript is needed for that. Examples are the taxi screens in `compiler/examples/taxi/src/contexts/Ordering/` (`ui.rr` for the customer, the driver and the dispatcher, `admin.rr` for the admin app) and the apps in `compiler/examples/taxi/src/apps`.

```rr
app(Staff, admin, support) Admin "Admin"     # who signs in: an actor and roles
  language en
  Menu
    AdminOrders

screen AdminOrder(orderId Order.Id) "Order"
  Card Order.Details                         # orderId ← the screen parameter
    Actions
      Edit Order.Edit "Edit" if status == searching
```

- **Apps and access.** The listed actors and roles sign in to an app; a node whose method they cannot call is not shown. `app … auto` builds the interface from the types, and `reasonr ui eject App` turns it into source to edit.
- **Primitives.** The standard catalog (`Table`, `Card`, `Form`, `Edit`, `Confirm`, `EntityPicker`, …) is declared in `compiler/internal/std/ui.rr` and implemented here on React and Ant Design. A primitive of your own is declared in the model (`primitive`), and its implementation goes into `primitives/<Primitive>.tsx` of the platform UI build; `reasonr build --ui-types` (`reasonr-ui types`) gives the prop types. The `reasonr-ui` command builds the UI, tests the implementations and runs a dev server with the primitives page `/ui/_primitives`. Until an implementation exists, the automatic UI draws its place.
- **Server.** `reasonrd` serves the app API (`/app/…`: the manifest, screen descriptions, a screen's data in one request, the queries and commands of the app's places only) and the web runtime (`/ui/…`). The built-in bundle is already in the binary; a build of your own (the `@tycheg/reasonr-vite` plugin) is plugged in with `ingress[].ui.dir`.
- **Sign-in.** With `--test` the runtime shows a "sign in as" form: an actor, an identifier, roles, a tenant. Otherwise sign-in goes through OIDC (the authorization code and PKCE), and `me` is the token's `sub`.

```yaml
ingress:
  - type: http
    listen: ":8080"
    ui:
      dir: ./src/ui/dist                       # without dir — the built-in bundle
      auth: { oidc: { issuer: https://idp.example.com, client_id: taxi-web, scopes: [openid, profile] } }
```

```bash
reasonrd --model examples/taxi/src --test     # then http://localhost:8080/ui/Admin
reasonr build --dump-ui examples/taxi/src     # the interface program: screens, places, types
reasonr build --ui-types examples/taxi/src    # TypeScript props for primitive implementations
reasonr graph --app Taxi examples/taxi/src    # the app's screens and navigation
```

### A platform UI build

```bash
npm install -g ./packages/vite                # reasonr-ui in PATH
cd my-platform/ui/web                         # package.json with the @tycheg/reasonr-vite dependency, primitives/
reasonr-ui types --model ../../model/src      # primitives/reasonr-ui.ts
reasonr-ui dev --model ../../model/src        # Vite with hot reload; the API is proxied to reasonrd dev on :8080
reasonr-ui test && reasonr-ui typecheck && reasonr-ui build    # dist/ with the manifest reasonr-ui.json
```

`reasonrd check` warns about primitives of web apps that no implementation covers (C0016). An example is the pilot platform's `ui/web`.
