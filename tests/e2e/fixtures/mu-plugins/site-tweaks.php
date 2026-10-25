<?php
/**
 * Test fixture for Routemark: a route from a must-use plugin.
 */
add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'tweaks/v1',
			'/hello',
			array(
				'methods'             => 'GET',
				'callback'            => function () {
					return 'hi';
				},
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}
);
