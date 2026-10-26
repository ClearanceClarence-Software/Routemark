=== Routemark ===
Contributors: cccode
Tags: rest api, developer, debug, headless, json
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Browse every REST API route on your site and send test requests to it from wp-admin.

== Description ==

Routemark adds a page under Tools that lists every REST API route registered on your site: core, WooCommerce, whatever your plugins and theme have added. Click a route to see its arguments and schema, fill in the parameters and send a request as the user you're logged in as. No Postman, no copying nonces around, no application passwords for quick tests.

What you get:

* The full route list, grouped by namespace, with a filter and method toggles.
* Which plugin, theme or part of WordPress added each route, so `wc/v3` shows up as WooCommerce. You can search by plugin name too.
* Arguments for each endpoint, with types, defaults, allowed values and descriptions.
* A request form that pre-fills query parameters from those arguments. Bodies for POST/PUT/PATCH can be filled in as a form built from the route's arguments, with a check on each field before you send, or written as JSON.
* The response with status, timing, size and the WordPress pagination headers, plus a collapsible JSON view you can search, a table view for lists, and the raw text. Links in the JSON open in Routemark, and Previous/Next pages through paged results.
* Compare: send the same request as two users, or before and after a change, and see the difference line by line.
* "Why was this refused?": when a request comes back 401 or 403, Routemark shows which permission callback refused it, the capabilities it checks, and whether the user you sent as has them.
* A recorder that catches the REST calls wp-admin makes while you work (the block editor, WooCommerce, any plugin screen), so you can open one in Routemark and send it again. Start and stop it from the admin bar.
* Paste a cURL command to open it as a request.
* Search routes by the fields they take or return, like "author" or "sku".
* Server numbers for every request you send: how many database queries it ran, how long PHP spent on it and peak memory. So you can tell a slow endpoint from a slow connection.
* A Hooks tab that lists every plugin hooked into a route's filters and actions (rest_prepare_post, rest_post_dispatch and so on), with the function, priority and plugin name. When a field shows up that you didn't expect, or goes missing, this tells you who did it.
* "Copy as code" for wp.apiFetch, fetch, cURL and PHP (rest_do_request).
* "Send as": send the same request as logged out, or as another user. Pick one user per role (an editor, a subscriber) or search for someone, and see exactly what they'd get back.
* A history of the requests you sent, so you can go back to one.
* Settings for history, confirming before DELETE (or any change), the default code language, how much of a JSON response opens, light or dark, and namespaces to hide.
* A short list of endpoints that are open to anyone without logging in, which is handy when you're checking what a site exposes.
* A Report that goes through every route and flags the ones worth a look: no permission check at all, anyone allowed to change data, arguments WordPress never checks, and routes with no schema. Grouped by plugin, worst first, with a button to open each one as logged out. You can copy it as text for a ticket or a client.
* A Site Health test that warns when a route lets anyone change data, with a link to the Report.

Only administrators (the manage_options capability) can see the page or the route list.

Requests you send from Routemark are real. A DELETE deletes. Use a staging or local site when you're poking at things you don't know.

= Privacy =

Routemark doesn't contact any outside server and doesn't collect anything. It only calls your own site's REST API, and only when you press Send. Your settings are saved in the database as user meta (routemark_settings), one copy per user. They're removed when you delete the plugin.

Request history and recorded calls are stored in your browser (localStorage), never in the database. They're kept per WordPress user, you can turn history off or clear either one, and anything that looks like a secret (Authorization headers, fields named password, token, api_key and so on) is blanked before it's saved. The recorder only runs for administrators, only after they start it, and only in their own browser.

== Installation ==

1. Install from Plugins > Add New, or upload the routemark folder to /wp-content/plugins/.
2. Activate it.
3. Go to Tools > Routemark.

== Frequently Asked Questions ==

= Does it show routes from other plugins? =

Yes. It reads the same route list WordPress uses to answer requests, so anything a plugin or theme registers on rest_api_init shows up, with the plugin's name next to it. The name is worked out from where the route's callback is defined, so a route registered from a custom or must-use plugin is labelled with that file or folder.

The one catch is routes a plugin only registers in some situations (say, only on the front end, or only for certain users). Routemark sees what's registered when it asks, which is an admin REST request.

= Does it change how my API behaves? =

No. It reads the route table WordPress already has and adds a few endpoints of its own under routemark/v1, which only admins can call.

Requests you send from the Routemark page carry two extra things: a header asking for the server numbers (query count, PHP time, memory), and, if you picked someone under "Send as", the user to run it as. Both are only honored for administrators. Nothing changes for requests from anywhere else.

= How does "Send as" work, and is it safe? =

When you pick someone under "Send as", Routemark adds two headers to that one request: the user ID and a nonce that belongs to you. On the server, after WordPress has checked your login as usual, Routemark checks the nonce and that you're allowed to switch, then runs the request as that user. As soon as the response is ready it switches back to you. Nothing is saved, no cookies change, and you stay logged in as yourself.

You need manage_options, plus permission to edit the user you pick (edit_user). On multisite that means a site admin can't send requests as a super admin. Logged out is always available to admins.

Requests sent as someone else are still real. If you send a POST as an editor, the post is created by that editor. After a reload you're always back to sending as yourself.

= Why does a route show "No login needed"? =

Its permission callback is __return_true. That's normal for things like oEmbed and the API index. If you see one of your own endpoints there and didn't mean it, that's worth fixing.

If it says "No permission check" instead, the route was registered without a permission_callback at all. WordPress logs a notice about that, but still runs it for anyone.

= What does the Hooks tab show? =

For routes from core's post, term, user and comment controllers (and plugins that extend them), every callback on the per-object hooks, like rest_prepare_post or rest_pre_insert_product. For every route, the callbacks on the hooks that run on all REST requests, like rest_pre_dispatch and rest_post_dispatch. Each one shows its priority, the function or class method, and the plugin or theme it lives in. WordPress core and Routemark's own callbacks are hidden unless you switch them on.

It lists what's registered when you open the tab. A plugin that only adds a filter partway through a request won't show up.

= Where do the query count and PHP time come from? =

When you press Send, Routemark asks your site to measure the request. Counting starts when WordPress begins handling it and stops when the response is ready, so it covers the permission check, the callback and every filter, but not _embed. Hover over the numbers to see the totals for the whole request, including loading WordPress itself. Only administrators get these numbers, and only for requests sent from the Routemark page.

= What does the Report check? =

Only how each route was registered. It doesn't send any requests.

* High: a route with no permission_callback that changes data, or one that changes data and uses __return_true.
* Medium: a read-only route with no permission_callback, or arguments with no type, validate_callback or sanitize_callback on a route that changes data or is public.
* Low: the same unchecked arguments on other routes, and routes with no schema.

It can't tell what a permission callback actually allows, only that there is one. For that, open the route and try it with "Send as". WordPress core is left out by default, there's a switch to include it.

= It says "rest_forbidden" for some routes =

Check who you're sending as. Unless you picked someone under "Send as", you get the same answer your own account would get from any other client. Some endpoints need a specific capability, and some (like application passwords) need a different auth method entirely.

= Can other plugins add to Routemark? =

Yes. There are PHP hooks (routemark_loaded, routemark_app_data, routemark_enqueue_assets, routemark_menu_title) and JavaScript filters through wp.hooks for adding panels, workspace tabs, response actions, code languages and Report findings. A broken add-on can't take Routemark down with it. The details and an example add-on are on GitHub.

= Is there a paid version? =

Yes, Routemark Pro: rules that lock down or rate-limit routes without editing the plugin that added them, API tests that run on a schedule or after updates, a log of the REST traffic your site gets, snapshots with a diff of what each plugin update changed and alerts by email, Slack or webhook, a public API docs page, WP-CLI commands, and export to OpenAPI, Postman and TypeScript. It's a separate plugin that adds to this one. Nothing in this plugin is locked or limited, and it doesn't advertise beyond a link on the Plugins screen and a card at the bottom of Settings.

Get Routemark Pro: https://checkout.freemius.com/plugin/42850/plan/74584/

== Screenshots ==

1. Overview: every namespace on the site, which plugin added it, and which endpoints are open to everyone.
2. Sending a request, with the response next to it.
3. The Docs tab: arguments and response schema for a route.
4. Settings: history, confirmations, display options and hidden namespaces.
5. Send as: the same request sent as an editor, who isn't allowed to read site settings.
6. The Report: routes worth a second look, grouped by the plugin that added them.
7. The Hooks tab: which plugins hook into /wp/v2/posts, with the query count and PHP time for the request below.

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

= 0.4.0 =
* New: a recorder for the REST calls wp-admin makes. Start it from the admin bar, use the block editor or any plugin screen, then open a recorded call in Routemark and send it again. Recorded calls stay in your browser, with secrets blanked.
* New: fill in request bodies as a form built from the route's arguments, with each field checked before you send. New drafts only include the required fields.
* New: "Why was this refused?" on 401 and 403 responses: which permission callback answered, the capabilities it checks, and whether the user you sent as has them. One click sends it again as you.
* New: a table view and search for JSON responses, links in the JSON that open in Routemark, and Previous/Next for paged results.
* New: Compare. Send the same request as someone else, or again after a change, and see what's different.
* New: Import a cURL command as a request.
* New: search routes by field name, and see which fields matched.
* New: a Site Health test for routes that let anyone change data.
* New setting: Show "REST calls" in the admin bar, to hide the recorder's menu when you don't need it.
* The top bar folds its labels into icons when there isn't room for them, and the response toolbar moves its buttons to a second row instead of cutting off tabs.
* For developers: Report findings can get buttons from add-ons (routemark.findingActions) and a note (finding.note), and add-ons can tell Routemark to redraw (routemark.extensionsChanged). New endpoint routemark/v1/permission, admins only.

= 0.3.3 =
* Fix: with Routemark Pro active, activating Routemark showed a "Constant already defined" warning and "unexpected output" notice.

= 0.3.2 =
* New: a "Get Pro" link on the Plugins screen and a short Routemark Pro card at the bottom of Settings. Both go away once Routemark Pro is installed. Until December 31, 2026, the card also shows a launch coupon for Routemark Pro.
* For developers: add-ons can now set how the top bar shows the product (a badge after the name and their own version, through the routemark.brand filter), rename the Tools menu entry and page title (routemark_menu_title), and give their panels an icon.

= 0.3.1 =
* For developers: other plugins can now add to Routemark. PHP hooks (routemark_loaded, routemark_app_data, routemark_enqueue_assets) and wp.hooks filters for panels, workspace tabs, response actions, code languages and Report findings, plus a routemark.requestSent action after each request. A broken add-on shows an error in its own spot and can't take Routemark down. Details and an example add-on are in the GitHub readme.
* The app now starts once every script on the page has loaded, so add-ons are in place from the first render.

= 0.3.0 =
* New: "Send as". Send any request as logged out or as another user, so you can see what an editor, a subscriber or a visitor gets back from an endpoint. Pick one user per role or search by name, login or email. The response shows who it ran as, and history marks requests that weren't sent as you.
* New: a Report (top right) that flags routes with no permission check, routes anyone can use to change data, arguments WordPress never checks, and routes with no schema. Grouped by plugin, worst first. Each finding opens the route, or opens it as logged out so you can try it straight away. "Copy as text" gives you the whole thing for a ticket or a client email.
* New: routes registered without a permission_callback get a "No permission check" badge, and now show up in the overview's "Open to everyone" list. Before, only __return_true did.
* New: server numbers on every response: database queries, PHP time and peak memory, measured on your site while it handles the request.
* New: a Hooks tab for each route, listing the plugins hooked into its filters and actions, with function, priority and plugin name.
* New endpoints routemark/v1/users and routemark/v1/hooks, admins only.
* Routemark's own endpoints now have a response schema.

= 0.2.0 =
* First release on WordPress.org.

== Upgrade Notice ==

= 0.4.0 =
Adds a recorder for wp-admin's REST calls, a form for request bodies, "Why was this refused?", Compare, cURL import, table view and search for responses, and a Site Health test.

= 0.3.3 =
Fixes a PHP warning when Routemark Pro is also active.

= 0.3.2 =
More extension points for add-ons. Nothing changes if you don't use any.

= 0.3.1 =
Adds extension points for add-ons. Nothing changes if you don't use any.

= 0.3.0 =
Adds "Send as" for testing endpoints as other users, a Report of routes with weak permission checks, a Hooks tab, and query counts and timing for every request.

= 0.2.0 =
First WordPress.org release.
