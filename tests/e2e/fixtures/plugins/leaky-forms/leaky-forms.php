<?php
/**
 * Plugin Name: Leaky Forms
 * Description: Test fixture for Routemark. Badly registered routes, one for each thing the Report should catch. Never install this on a real site.
 */

add_action(
	'rest_api_init',
	function () {
		// No permission_callback, changes data, and an argument with no type or callbacks.
		register_rest_route(
			'leaky/v1',
			'/submit',
			array(
				'methods'  => 'POST',
				'callback' => function ( $request ) {
					return array( 'got' => $request['message'] );
				},
				'args'     => array( 'message' => array( 'description' => 'Whatever' ) ),
			)
		);
		// Open on purpose, changes data. The typed argument counts as checked.
		register_rest_route(
			'leaky/v1',
			'/subscribe',
			array(
				'methods'             => 'POST',
				'callback'            => function () {
					return array( 'ok' => true );
				},
				'permission_callback' => '__return_true',
				'args'                => array(
					'email' => array(
						'type'   => 'string',
						'format' => 'email',
					),
				),
			)
		);
		// No permission_callback, read-only.
		register_rest_route(
			'leaky/v1',
			'/stats',
			array(
				'methods'  => 'GET',
				'callback' => function () {
					return array( 'users' => 3 );
				},
			)
		);
		// Proper permission check. q has nothing declared, page is typed with
		// a null callback on purpose (like core's title/content) and is fine.
		register_rest_route(
			'leaky/v1',
			'/search',
			array(
				'methods'             => 'GET',
				'callback'            => function () {
					return array();
				},
				'permission_callback' => function () {
					return current_user_can( 'read' );
				},
				'args'                => array(
					'q'    => array( 'description' => 'Search' ),
					'page' => array(
						'type'              => 'integer',
						'sanitize_callback' => null,
					),
				),
			)
		);
		// Path param with nothing declared. The route regex checks it, so it isn't flagged.
		register_rest_route(
			'leaky/v1',
			'/item/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => function () {
					return array();
				},
				'permission_callback' => function () {
					return current_user_can( 'read' );
				},
				'args'                => array( 'id' => array( 'description' => 'ID' ) ),
			)
		);
	}
);
