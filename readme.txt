=== Restbench ===
Contributors: clearanceclarence
Tags: rest api, developer, debug, headless, json
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.3
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Browse every REST API route on your site and send test requests to it from wp-admin.

== Description ==

Restbench adds a page under Tools that lists every REST API route registered on your site: core, WooCommerce, whatever your plugins and theme have added. Click a route to see its arguments and schema, fill in the parameters and send a request as the user you're logged in as. No Postman, no copying nonces around, no application passwords for quick tests.

What you get:

* The full route list, grouped by namespace, with a filter and method toggles.
* Which plugin, theme or part of WordPress added each route, so `wc/v3` shows up as WooCommerce. You can search by plugin name too.
* Arguments for each endpoint, with types, defaults, allowed values and descriptions.
* A request form that pre-fills query parameters from those arguments and can build a JSON body skeleton for POST/PUT/PATCH.
* The response with status, timing, size and the WordPress pagination headers, plus a collapsible JSON view and the raw text.
* "Copy as code" for wp.apiFetch, fetch, cURL and PHP (rest_do_request).
* A history of the requests you sent, so you can go back to one.
* Settings for history, confirming before DELETE (or any change), the default code language, how much of a JSON response opens, light or dark, and namespaces to hide.
* A short list of endpoints that are open to anyone without logging in, which is handy when you're checking what a site exposes.

Only administrators (the manage_options capability) can see the page or the route list.

Requests you send from Restbench are real. A DELETE deletes. Use a staging or local site when you're poking at things you don't know.

= Privacy =

Restbench doesn't contact any outside server and doesn't collect anything. It only calls your own site's REST API, and only when you press Send. Your settings are saved in the database as user meta (restbench_settings), one copy per user. They're removed when you delete the plugin.

Request history is stored in your browser (localStorage), never in the database. It's kept per WordPress user, you can turn it off or clear it in Settings, and anything that looks like a secret (Authorization headers, fields named password, token, api_key and so on) is blanked before it's saved.

== Installation ==

1. Install from Plugins > Add New, or upload the restbench folder to /wp-content/plugins/.
2. Activate it.
3. Go to Tools > Restbench.

== Frequently Asked Questions ==

= Does it show routes from other plugins? =

Yes. It reads the same route list WordPress uses to answer requests, so anything a plugin or theme registers on rest_api_init shows up, with the plugin's name next to it. The name is worked out from where the route's callback is defined, so a route registered from a custom or must-use plugin is labelled with that file or folder.

The one catch is routes a plugin only registers in some situations (say, only on the front end, or only for certain users). Restbench sees what's registered when it asks, which is an admin REST request.

= Does it change how my API behaves? =

No. It reads the route table WordPress already has and registers one read-only endpoint of its own (restbench/v1/routes), which only admins can call.

= Why does a route show "No login needed"? =

Its permission callback is __return_true. That's normal for things like oEmbed and the API index. If you see one of your own endpoints there and didn't mean it, that's worth fixing.

= It says "rest_forbidden" for some routes =

You're sending as yourself, so you get the same answer your account would get from any other client. Some endpoints need a specific capability, and some (like application passwords) need a different auth method entirely.

= Will there be a paid version? =

Maybe. If it happens it'll be a separate add-on plugin. Nothing in this plugin is locked or limited.

== Screenshots ==

1. Overview: every namespace on the site, which plugin added it, and which endpoints are open to everyone.
2. Sending a request, with the response next to it.
3. The Docs tab: arguments and response schema for a route.
4. Settings: history, confirmations, display options and hidden namespaces.

== Development ==

The files in build/ are compiled from TypeScript and SCSS but not minified, so you can read them as they are.

The source code and build setup are on GitHub: https://github.com/ClearanceClarence/restbench

To build it yourself you need Node 20 or newer:

    npm ci
    npm run build

`npm run zip` makes the same plugin zip that's published here.

== Credits ==

Restbench bundles the Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono fonts (Copyright 2020-2024 The Atkinson Hyperlegible Next / Mono Project Authors), licensed under the SIL Open Font License 1.1. The license text is in the licenses/ folder. The fonts are served from the plugin folder, not from Google.

== Changelog ==

= 0.1.3 =
* The plugin download now only contains what it needs to run. Source code and build tools live on GitHub: https://github.com/ClearanceClarence/restbench

= 0.1.2 =
* New: a Settings page (top right). Settings are saved per user, so they follow you to other browsers:
  * keep request history or not, and how many requests to keep
  * clear history
  * ask before sending: never, DELETE only, or anything but GET (Send then needs a second click)
  * pre-fill query parameters from the route's arguments, or start with an empty list
  * which language the Code tab opens on
  * light or dark
  * how many levels of a JSON response open by default
  * hide namespaces you don't use from the sidebar and search
* Fixed: plugins installed as a symlink showed no "added by" name.
* Fixed: small namespaces from must-use plugins could be labelled as WordPress.
* Deleting the plugin now removes its settings from the database.
* The JavaScript and CSS in build/ are no longer minified.
* Hardening: the settings endpoint names its validate and sanitize callbacks explicitly, and the data written into the page escapes < > & so it can't break out of its script tag.

= 0.1.1 =
* New: each namespace and route shows which plugin, theme or part of WordPress added it, and the filter matches plugin names.
* Changed: the light theme now uses wp-admin's colors, including your admin color scheme, so it blends in with the rest of the dashboard.
* Fixed: light is now the default theme. It used to follow your OS setting, so you could end up with dark mode inside a light wp-admin. The button in the top bar switches between light and dark.
* Fixed: "Copy as code" didn't escape quotes properly. A ' in a path parameter or header could break the snippet, and in the cURL version it could run as a shell command when pasted.
* Security: request history no longer keeps passwords, tokens, API keys or Authorization headers. They're blanked before saving.
* Security: history is now kept per WordPress user instead of per browser. The old shared history from 0.1.0 is deleted the first time you open Restbench.
* The restbench/v1/routes endpoint is no longer listed in the public /wp-json/ index.
* Right-to-left languages now get the RTL stylesheet.

= 0.1.0 =
* First release.

== Upgrade Notice ==

= 0.1.3 =
Smaller download, no changes to how the plugin works.

= 0.1.2 =
Adds a Settings page, and deleting the plugin now cleans up after itself.

= 0.1.1 =
Fixes unescaped quotes in "Copy as code" and stops request history from storing secrets. Worth updating.
