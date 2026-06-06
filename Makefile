.PHONY: install build lint version help

install:
	npm install

build:
	npm run build

lint:
	npm run lint

# Bump the patch version, push, and create a GitHub Release — which triggers
# .github/workflows/publish.yml to publish to npm.
#
# `npm version patch` bumps package.json AND creates a matching `vX.Y.Z` git tag
# (the publish workflow validates the tag equals package.json's version), then we
# push and create the Release off that tag. Lint + build run first so a broken
# build is never released.
#
# Requires: a clean working tree (commit your changes first), `gh` authenticated,
# and the repo's `npm` environment + NPM_TOKEN secret configured.
version: lint build
	@echo "Bumping patch version and creating release..."
	@npm version patch -m "release: v%s"
	@git push --follow-tags
	@NEW_TAG="v$$(node -p "require('./package.json').version")"; \
		gh release create "$$NEW_TAG" --title "$$NEW_TAG" --generate-notes; \
		echo "➜ released $$NEW_TAG — the publish workflow will push it to npm"

help:
	@echo "Available targets:"
	@echo "  install  - npm install"
	@echo "  build    - tsup build (dist: esm + cjs + d.ts)"
	@echo "  lint     - tsc --noEmit"
	@echo "  version  - bump patch, tag, push, and create a GitHub Release (-> npm publish)"
