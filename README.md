# Ting Reader Plugin Store

Official plugin-store provider for Ting Reader.

The plugin exposes a `plugin_store` capability and lets the server read plugin entries from a configurable source URL.

## Build

Release builds are produced by GitHub Actions. The workflow packages the plugin with `trpack` and signs the `.tr` package with the `TRPACK_SIGNING_KEY` repository secret.
