<?php
/**
 * Per-user settings, stored in user meta.
 *
 * GET  /wp-json/routemark/v1/settings
 * POST /wp-json/routemark/v1/settings  (send only the keys you want to change)
 *
 * @package Routemark
 */

namespace Routemark;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * Settings are per user rather than a site option: they're preferences
 * (theme, how much history to keep), and two admins on one site shouldn't
 * keep overwriting each other's.
 */
class Settings {

	const META_KEY = 'routemark_settings';

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * The single source of truth for what a setting can be. The REST args,
	 * the defaults and the validation all come from here.
	 *
	 * @return array
	 */
	public static function schema(): array {
		return array(
			'keepHistory'      => array(
				'type'    => 'boolean',
				'default' => true,
			),
			'historySize'      => array(
				'type'    => 'integer',
				'minimum' => 10,
				'maximum' => 200,
				'default' => 40,
			),
			'confirmWrites'    => array(
				'type'    => 'string',
				'enum'    => array( 'never', 'delete', 'all' ),
				'default' => 'delete',
			),
			'suggestParams'    => array(
				'type'    => 'boolean',
				'default' => true,
			),
			'theme'            => array(
				'type'    => 'string',
				'enum'    => array( 'light', 'dark' ),
				'default' => 'light',
			),
			'jsonDepth'        => array(
				'type'    => 'integer',
				'minimum' => 1,
				'maximum' => 6,
				'default' => 2,
			),
			'snippetLanguage'  => array(
				'type'    => 'string',
				'enum'    => array( 'apiFetch', 'fetch', 'curl', 'php' ),
				'default' => 'apiFetch',
			),
			'recorderInBar'    => array(
				'type'    => 'boolean',
				'default' => true,
			),
			'hiddenNamespaces' => array(
				'type'     => 'array',
				'maxItems' => 200,
				'items'    => array(
					'type'      => 'string',
					'maxLength' => 100,
					// Namespaces are things like "wc/v3". Empty string is the root group.
					'pattern'   => '^[A-Za-z0-9._\-/]*$',
				),
				'default'  => array(),
			),
		);
	}

	/**
	 * Default value for every setting.
	 *
	 * @return array
	 */
	public static function defaults(): array {
		return array_map(
			static function ( $field ) {
				return $field['default'];
			},
			self::schema()
		);
	}

	/**
	 * Stored settings merged over the defaults. Anything in the database that
	 * doesn't validate any more (old version, hand-edited meta) falls back to
	 * its default instead of reaching the UI.
	 *
	 * @param int $user_id User ID.
	 * @return array
	 */
	public static function for_user( int $user_id ): array {
		$stored   = get_user_meta( $user_id, self::META_KEY, true );
		$stored   = is_array( $stored ) ? $stored : array();
		$settings = self::defaults();

		foreach ( self::schema() as $key => $field ) {
			if ( array_key_exists( $key, $stored ) && true === rest_validate_value_from_schema( $stored[ $key ], $field, $key ) ) {
				$settings[ $key ] = rest_sanitize_value_from_schema( $stored[ $key ], $field, $key );
			}
		}

		return $settings;
	}

	/**
	 * Registers GET and POST routemark/v1/settings.
	 */
	public function register_routes(): void {
		$args = array();
		foreach ( self::schema() as $key => $field ) {
			// No defaults on the POST args, otherwise every save would reset
			// the keys that weren't sent.
			unset( $field['default'] );
			// Validate first (reject anything that doesn't fit the schema),
			// then sanitize (cast to the right type). WordPress would add these
			// two on its own for typed args, but spelling them out is clearer.
			$field['validate_callback'] = 'rest_validate_request_arg';
			$field['sanitize_callback'] = 'rest_sanitize_request_arg';
			$args[ $key ]               = $field;
		}

		register_rest_route(
			Routes_Controller::REST_NAMESPACE,
			'/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get' ),
					'permission_callback' => array( $this, 'can_access' ),
					'show_in_index'       => false,
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update' ),
					'permission_callback' => array( $this, 'can_access' ),
					'args'                => $args,
					'show_in_index'       => false,
				),
				'schema' => array( $this, 'get_schema' ),
			)
		);
	}

	/**
	 * Response schema, built from the same schema() as everything else.
	 *
	 * @return array
	 */
	public function get_schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'routemark-settings',
			'type'       => 'object',
			'properties' => self::schema(),
		);
	}

	/**
	 * Same rule as the rest of the plugin: admins only.
	 *
	 * @return bool
	 */
	public function can_access(): bool {
		return current_user_can( Admin::CAPABILITY );
	}

	/**
	 * The current user's settings.
	 *
	 * @return WP_REST_Response
	 */
	public function get(): WP_REST_Response {
		return new WP_REST_Response( self::for_user( get_current_user_id() ) );
	}

	/**
	 * By the time we get here WordPress has already validated and sanitized
	 * every arg against the schema, so we only copy over known keys that were
	 * actually sent.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function update( WP_REST_Request $request ): WP_REST_Response {
		$user_id  = get_current_user_id();
		$settings = self::for_user( $user_id );
		$params   = $request->get_params();

		foreach ( array_keys( self::schema() ) as $key ) {
			if ( array_key_exists( $key, $params ) ) {
				$settings[ $key ] = $params[ $key ];
			}
		}

		if ( isset( $settings['hiddenNamespaces'] ) ) {
			$settings['hiddenNamespaces'] = array_values( array_unique( $settings['hiddenNamespaces'] ) );
		}

		update_user_meta( $user_id, self::META_KEY, $settings );

		return new WP_REST_Response( $settings );
	}
}
