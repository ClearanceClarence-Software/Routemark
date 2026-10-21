# Restbench

A REST API explorer that lives inside wp-admin. It lists every route registered on the site, shows the arguments and schema for each one, and lets you send requests as the logged-in user.

The user-facing description is in `readme.txt` (that's the one WordPress.org reads). This file is for working on the code.

## Install

Grab `restbench-x.y.z.zip` from [Releases](https://github.com/ClearanceClarence/restbench/releases), then Plugins > Add New > Upload Plugin in WordPress. The "Source code" zips GitHub adds to every release are the repo, not an installable plugin.

## Setup

You need Node 20+ and a WordPress 6.6+ site to load it in.

```bash
npm ci
npm run build      # one-off build into build/
npm start          # rebuild on change
npm run typecheck
npm run zip        # build + dist/restbench-<version>.zip, runtime files only
```

Then symlink or copy the folder into `wp-content/plugins/`, activate it and open Tools > Restbench. On XAMPP that's `C:\xampp\htdocs\<site>\wp-content\plugins\restbench`.

6.6 is the floor because the build uses the `react-jsx-runtime` script handle, which core started shipping in 6.6.

## Layout

```
restbench.php                 plugin header, constants, bootstrap
webpack.config.js             default wp-scripts config with minification off
postcss.config.js             same, for CSS (keeps cssnano out)
scripts/zip.mjs               makes the install zip (explicit file list)
.github/workflows/            CI on every push, release zip on tags
includes/
  class-plugin.php
  class-admin.php             Tools page, enqueues the bundle
  class-routes-controller.php GET restbench/v1/routes
  class-route-source.php      works out which plugin/theme registered a route
  class-settings.php          per-user settings (user meta), GET/POST restbench/v1/settings
uninstall.php                 deletes the settings meta when the plugin is deleted
src/
  App.tsx                     top bar, theme, filters, history
  components/                 Sidebar, Overview, Workspace, ResponsePanel, JsonView, ...
  lib/
    routes.ts                 regex route -> {param} template, grouping, filtering
    request.ts                building and sending requests
    snippets.ts               apiFetch / fetch / cURL / PHP output
    hooks.ts                  localStorage state, theme, URL hash
  admin.scss
licenses/                     OFL text for the bundled fonts
.wordpress-org/               icon + banner for the plugin directory (not in the zip)
```

## Things worth knowing

Settings live in user meta (`restbench_settings`). `Settings::schema()` is the single list of what each setting can be: it feeds the REST args (so WordPress validates POSTs before our code sees them), the defaults, and the check on read, so stale or hand-edited meta falls back to defaults. The TypeScript `Settings` type in `src/types.ts` mirrors it. The page gets the current values inlined on load, so there's no flash of defaults.

`Route_Source` works out who registered a route. WordPress doesn't record that, so it reflects the route's callback, takes the file the class (or function) lives in and matches the path against wp-includes, the plugins folder, mu-plugins and the theme root. It uses the class of the actual object rather than the class that declares the method, because lots of plugins extend `WP_REST_Posts_Controller` and friends and should still be credited.

The rest of the PHP side doesn't do much. `Routes_Controller` walks `rest_get_server()->get_routes()`, keeps only the plain-data parts of each arg (callbacks get stripped, they don't serialize) and calls each route's schema callback inside a try/catch, because some plugins' schema callbacks fatal when they're called outside a real request.

Requests go through `@wordpress/api-fetch`, which already has the REST nonce in wp-admin, so there's no auth to set up. We call it with `parse: false` to get the raw `Response` for status, headers and timing. Note that in that mode it throws the Response on 4xx/5xx instead of returning it, so `send()` catches that and treats it as a normal result.

Route patterns like `(?P<id>[\d]+)` are turned into `{id}` by walking the string and counting parens. A single regex doesn't work because core's plugins route has a group nested inside the named one.

"Public" only means the permission callback is literally `__return_true`. A callback that always returns true some other way won't be flagged.

## Releasing

1. Bump the version in `restbench.php` (header and `RESTBENCH_VERSION`), `package.json` and `Stable tag` in `readme.txt`, and add a changelog entry to `readme.txt`.
2. Commit, then tag and push: `git tag v0.1.4 && git push --follow-tags`.
3. The release workflow builds the plugin, checks the tag matches the version in the files, and attaches `restbench-0.1.4.zip` to a GitHub release.

The zip only holds `restbench.php`, `uninstall.php`, `readme.txt`, `includes/`, `build/` and `licenses/`. Source and build setup stay here, and `readme.txt` links to this repo, which is what WordPress.org asks for when the shipped JS is compiled.

## Security

The rules from the handbook pages on escaping, sanitizing and nonces, and where each one is handled:

- **Escaping.** The PHP only prints a few fixed strings, all through `esc_html__()` / `esc_html_e()` / `esc_url()`. The data the page needs goes in through `wp_add_inline_script()` as JSON with `JSON_HEX_TAG | JSON_HEX_AMP`, so no value can close the `<script>` tag. Everything else is rendered by React, which escapes text by default. There's no `dangerouslySetInnerHTML` anywhere, and the one `createInterpolateElement()` only maps a `<code>` tag.
- **Sanitizing and validating.** The only input is the settings endpoint. Every key has a schema (`Settings::schema()`), and the REST args use `rest_validate_request_arg` then `rest_sanitize_request_arg`, so bad values are rejected with a 400 before our code runs, not quietly cleaned up. Unknown keys are ignored, and values read back from user meta are validated again. Plugin names from headers go through `wp_strip_all_tags()`. Nothing reads `$_GET`, `$_POST` or `$_SERVER`.
- **Nonces.** There are no forms or admin-ajax handlers. All requests go through the REST API with cookie auth, which means `@wordpress/api-fetch` sends the `wp_rest` nonce as `X-WP-Nonce` and core checks it. Without a valid nonce the request runs as logged out and gets a 401. Every endpoint also has its own `current_user_can( 'manage_options' )` permission callback, since nonces aren't access control.

To run the WordPress Coding Standards checks (Plugin Check uses the same security sniffs): install PHP_CodeSniffer with `wp-coding-standards/wpcs` and run `phpcs` in this folder. It picks up `phpcs.xml.dist`.

## WordPress.org notes

A few of the directory guidelines shape how this is built:

- Everything in the plugin is free and unlocked (guideline 5). If a Pro version happens, it has to be a separate add-on plugin sold elsewhere, not a license key that unlocks code already in this one.
- `build/` is compiled (though not minified), so `readme.txt` links to this repo for the source and build tools (guideline 4). Keep the repo public.
- No external requests at all, fonts included (guidelines 7 and 8). The fonts are bundled through `@fontsource`.
- The art in `.wordpress-org/` goes in the `assets/` folder at the root of the SVN repo, not in `trunk/`.

## Look and feel

The light theme (the default) doesn't have its own palette. It uses wp-admin's grays (`#F0F0F1` background, white panels, `#DCDCDE` lines, `#1D2327` text) and `--wp-admin-theme-color` for links, focus and the main button, so it follows the user's admin color scheme and falls back to `#2271B1`. The dark theme is the branded one: graphite `#16181B` with chartreuse `#C3EC6A` for the main button. The logo mark is moss `#3F6212` on light. The logo is three bars on a line (`Mark` in `src/components/ui.tsx`, and `.wordpress-org/icon.svg`). Below 32px drop the line, it turns to mush.

Type is Atkinson Hyperlegible Next for text and Atkinson Hyperlegible Mono for routes and code. Picked them mostly because they keep `l`, `I` and `1` apart, which matters when you're reading IDs and keys all day.

## Ideas for later

- TypeScript types generated from the route schemas
- OpenAPI export
- Saved requests and environments (local, staging, live via application passwords)
- Sending as a different user or role
- A report of routes with no schema or loose permission callbacks
