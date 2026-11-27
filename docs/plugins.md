# Notifier plugins

Add your own alert channel without touching the core. Plugins are alert-only:
they receive a payload and deliver it; they can never register for exams.

```json
{ "plugins": ["./examples/console-notifier.js"],
  "notifiers": [{ "type": "console", "prefix": "[seat]" }] }
```

A plugin is an ES module whose default export is one object (or an array):

| member | required | meaning |
|---|---|---|
| `type` | yes | unique name used in `notifiers[].type` (cannot reuse built-in names) |
| `validate(notifier)` | no | return an error string, or null/undefined when valid |
| `send(notifier, payload, ctx)` | yes | deliver; throw on failure. `ctx = { fetchImpl, username }` |

`payload` = `{ title, description, url, color, fields: [{name, value}], content }`.
Relative paths resolve from the config file's directory. Keep secrets in
environment variables, never in committed files. Errors are redacted of
`url`/`token` fields before logging. See `examples/console-notifier.js`.
