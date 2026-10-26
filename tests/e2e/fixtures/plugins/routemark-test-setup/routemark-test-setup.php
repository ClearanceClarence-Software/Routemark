<?php
/**
 * Plugin Name: Routemark Test Setup
 * Description: Only for Routemark's end-to-end tests. Creates test users and adds a few helper routes. Never install this on a real site.
 */

// Users the tests send requests as. Created on first load, all with password "password".
add_action(
	'init',
	function () {
		$users = array(
			'jane'   => array( 'editor', 'Jane Editor' ),
			'ali'    => array( 'author', 'Ali Author' ),
			'sam'    => array( 'subscriber', 'Sam Subscriber' ),
			'admin2' => array( 'administrator', 'Second Admin' ),
		);
		foreach ( $users as $login => $info ) {
			if ( ! username_exists( $login ) ) {
				wp_insert_user(
					array(
						'user_login'   => $login,
						'user_pass'    => 'password',
						'user_email'   => $login . '@example.test',
						'role'         => $info[0],
						'display_name' => $info[1],
					)
				);
			}
		}
	}
);

// Who the current user is when PHP shuts down, so a test can check that
// Send as switched back. The read route returns the value from the request before it.
add_action(
	'shutdown',
	function () {
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			update_option( 'routemark_test_shutdown_user', get_current_user_id(), false );
		}
	}
);

add_action(
	'rest_api_init',
	function () {
		$admin_only = function () {
			return current_user_can( 'manage_options' );
		};

		// User IDs by login.
		register_rest_route(
			'routemark-test/v1',
			'/users',
			array(
				'methods'             => 'GET',
				'permission_callback' => $admin_only,
				'callback'            => function () {
					$out = array();
					foreach ( array( 'admin', 'jane', 'ali', 'sam', 'admin2' ) as $login ) {
						$user          = get_user_by( 'login', $login );
						$out[ $login ] = $user ? $user->ID : null;
					}
					return $out;
				},
			)
		);

		// Write raw user meta for the settings tests (including invalid values),
		// or delete it with value null.
		register_rest_route(
			'routemark-test/v1',
			'/settings-meta',
			array(
				'methods'             => 'POST',
				'permission_callback' => $admin_only,
				'callback'            => function ( $request ) {
					$user  = get_user_by( 'login', (string) $request['login'] );
					$value = $request->get_json_params()['value'] ?? null;
					if ( null === $value ) {
						delete_user_meta( $user->ID, 'routemark_settings' );
					} else {
						update_user_meta( $user->ID, 'routemark_settings', $value );
					}
					return array( 'meta' => get_user_meta( $user->ID, 'routemark_settings', true ) );
				},
			)
		);

		register_rest_route(
			'routemark-test/v1',
			'/last-shutdown-user',
			array(
				'methods'             => 'GET',
				'permission_callback' => $admin_only,
				'callback'            => function () {
					return array( 'id' => (int) get_option( 'routemark_test_shutdown_user' ) );
				},
			)
		);

		// Probes for Send as: who's the current user in the handler, and in an _embed.
		register_rest_route(
			'routemark-test/v1',
			'/me',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => function () {
					return array( 'id' => get_current_user_id() );
				},
			)
		);
		register_rest_route(
			'routemark-test/v1',
			'/outer',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => function () {
					$response = new WP_REST_Response( array( 'id' => get_current_user_id() ) );
					$response->add_link( 'me', rest_url( 'routemark-test/v1/me' ), array( 'embeddable' => true ) );
					return $response;
				},
			)
		);
	}
);

// ?routemark_test_offer=ended moves the launch offer's end date to yesterday.
add_filter(
	'routemark_launch_offer',
	function ( $offer ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- test fixture.
		if ( is_array( $offer ) && isset( $_GET['routemark_test_offer'] ) && 'ended' === $_GET['routemark_test_offer'] ) {
			$offer['ends'] = wp_date( 'Y-m-d', time() - DAY_IN_SECONDS );
		}
		return $offer;
	}
);
