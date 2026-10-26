<?php
/**
 * Plugin Name: Routemark Example Add-on
 * Description: Uses every Routemark extension point, for the tests and as a starting point for your own add-on. Not meant for real sites.
 */

// routemark_loaded only fires when Routemark is active, so nothing below runs without it.
add_action(
	'routemark_loaded',
	function () {
		// Check the extension API version you were written for.
		if ( ! defined( 'ROUTEMARK_API_VERSION' ) || 1 !== ROUTEMARK_API_VERSION ) {
			return;
		}

		// Data for the add-on's script, under its own key in window.routemarkSettings.
		add_filter(
			'routemark_app_data',
			function ( $data ) {
				$data['exampleAddon'] = array( 'greeting' => 'Hello from PHP' );
				return $data;
			}
		);

		// Only fires on the Routemark page. Depend on Routemark's handle so this loads after it.
		add_action(
			'routemark_enqueue_assets',
			function ( $handle ) {
				wp_enqueue_script( 'routemark-example-addon', plugins_url( 'addon.js', __FILE__ ), array( $handle, 'wp-hooks', 'wp-element' ), '1', true );
			}
		);
	}
);
