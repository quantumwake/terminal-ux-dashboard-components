.PHONY: install build lint version help

install:
	npm install

build:
	npm run build

lint:
	npm run lint

# Bump the patch version, push, and create a GitHub Release. The Release triggers
# .github/workflows/publish.yml, which runs lint + build + `npm publish` — CI owns
# the authoritative build and publish. We run lint + build locally first as
# verification guards (catch type/build errors before cutting a release).
#
# `npm version patch` bumps package.json AND creates a matching `vX.Y.Z` git tag
# (the publish workflow validates the tag equals package.json's version), then we
# push and create the Release off that tag.
#
# Requires: a clean working tree (commit your changes first), `gh` authenticated,
# and the repo's `npm` environment + NPM_TOKEN secret configured.
version: lint build
	@echo "Bumping patch version and creating release..."
	@npm version patch -m "release: v%s"
	@git push --follow-tags
	@NEW_TAG="v$$(node -p "require('./package.json').version")"; \
		gh release create "$$NEW_TAG" --title "$$NEW_TAG" --generate-notes; \
		echo "➜ released $$NEW_TAG — CI (publish workflow) will build + push to npm"

help:
	@echo "Available targets:"
	@echo "  install  - npm install"
	@echo "  build    - tsup build (dist: esm + cjs + d.ts)"
	@echo "  lint     - tsc --noEmit"
	@echo "  version  - bump patch, tag, push, and create a GitHub Release (-> npm publish)"
