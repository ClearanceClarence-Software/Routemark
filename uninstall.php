<?php
/**
 * Runs when the plugin is deleted from the Plugins screen.
 *
 * The only thing Routemark stores in the database is each user's settings.
 * Request history lives in the browser, so there's nothing to clean up there.
 *
 * @package Routemark
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_metadata( 'user', 0, 'routemark_settings', '', true );
