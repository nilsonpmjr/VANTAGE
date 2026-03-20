# Local Plugins

This directory is reserved for local plugins that ship with a downstream or customer-specific deployment.

- `core` built-ins remain in `backend/extensions/plugins/`
- `local` plugins may live here
- `premium` plugins should be discovered from external roots configured via `PREMIUM_PLUGIN_ROOTS`

The public repository should not store private premium plugin code.
