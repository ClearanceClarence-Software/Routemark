<?php
/**
 * Runs when the plugin is deleted from the Plugins screen.
 *
 * The only thing Restbench stores in the database is each user's settings.
 * Request history lives in the browser, so there's nothing to clean up there.
 *
 * @package Restbench
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_metadata( 'user', 0, 'restbench_settings', '', true );
