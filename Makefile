GO ?= go
# The npm workspace (packages/runtime, std-ui, vite and app, the built-in
# bundle's build) and two Go modules: bundle (the build, embedded; tags
# bundle/vX.Y.Z) and driver (the web test driver; tags driver/vX.Y.Z). The
# driver's browser tests run in reasonr-dist: they need a whole reasonrd.
GOMODS = bundle driver

.PHONY: all check web web-check fmt-check vet lint test install publish

all: check

check: web-check fmt-check vet lint test

# The type check, the conformance suite, the built-in bundle in
# bundle/src/dist (reasonrd embeds it).
web:
	npm ci && npm run typecheck && npm test && npm run build

# The committed build matches the sources (CI).
web-check: web
	git diff --exit-code -- bundle/src/dist

fmt-check:
	@out=$$(gofmt -l $(GOMODS)); if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

vet:
	for d in $(GOMODS); do (cd $$d && $(GO) vet ./...) || exit 1; done

lint:
	for d in $(GOMODS); do (cd $$d && staticcheck ./...) || exit 1; done

test:
	for d in $(GOMODS); do (cd $$d && $(GO) test ./...) || exit 1; done

# reasonr-ui into the global npm bin: it finds a UI build and runs it.
install:
	npm install -g --no-audit --no-fund ./packages/vite

# The npm packages to npmjs.com (an account that owns the @tycheg scope).
publish:
	npm publish -w packages/runtime -w packages/std-ui -w packages/vite
