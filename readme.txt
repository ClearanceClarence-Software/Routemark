=== Routemark ===
Contributors: cccode
Tags: rest api, developer, debug, headless, json
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Browse every REST API route on your site and send test requests to it from wp-admin.

== Description ==

Routemark adds a page under Tools that lists every REST API route registered on your site: core, WooCommerce, whatever your plugins and theme have added. Click a route to see its arguments and schema, fill in the parameters and send a request as the user you're logged in as. No Postman, no copying nonces around, no application passwords for quick tests.

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

Requests you send from Routemark are real. A DELETE deletes. Use a staging or local site when you're poking at things you don't know.

= Privacy =

Routemark doesn't contact any outside server and doesn't collect anything. It only calls your own site's REST API, and only when you press Send. Your settings are saved in the database as user meta (routemark_settings), one copy per user. They're removed when you delete the plugin.

Request history is stored in your browser (localStorage), never in the database. It's kept per WordPress user, you can turn it off or clear it in Settings, and anything that looks like a secret (Authorization headers, fields named password, token, api_key and so on) is blanked before it's saved.

== Installation ==

1. Install from Plugins > Add New, or upload the routemark folder to /wp-content/plugins/.
2. Activate it.
3. Go to Tools > Routemark.

== Frequently Asked Questions ==

= Does it show routes from other plugins? =

Yes. It reads the same route list WordPress uses to answer requests, so anything a plugin or theme registers on rest_api_init shows up, with the plugin's name next to it. The name is worked out from where the route's callback is defined, so a route registered from a custom or must-use plugin is labelled with that file or folder.

The one catch is routes a plugin only registers in some situations (say, only on the front end, or only for certain users). Routemark sees what's registered when it asks, which is an admin REST request.

= Does it change how my API behaves? =

No. It reads the route table WordPress already has and registers one read-only endpoint of its own (routemark/v1/routes), which only admins can call.

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

The source code and build setup are on GitHub: https://github.com/ClearanceClarence-Software/Routemark

To build it yourself you need Node 20 or newer:

    npm ci
    npm run build

`npm run zip` makes the same plugin zip that's published here.

== Credits ==

Routemark bundles the Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono fonts (Copyright 2020-2024 The Atkinson Hyperlegible Next / Mono Project Authors) and Bricolage Grotesque (Copyright 2022 The Bricolage Grotesque Project Authors), all licensed under the SIL Open Font License 1.1. The license text is in the licenses/ folder. The fonts are served from the plugin folder, not from Google.

== Changelog ==

= 0.2.0 =
* First release on WordPress.org.

== Upgrade Notice ==

= 0.2.0 =
First WordPress.org release.
