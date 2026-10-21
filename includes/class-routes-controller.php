<?php
/**
 * GET /wp-json/restbench/v1/routes
 *
 * Dumps the whole route table in a shape the React side can use.
 *
 * @package Restbench
 */

namespace Restbench;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * The route table endpoint.
 */
class Routes_Controller {

	const REST_NAMESPACE = 'restbench/v1';

	// Only the descriptive bits of an arg. validate_callback and friends are
	// closures half the time and json_encode chokes on them anyway.
	const ARG_KEYS = array(
		'type',
		'description',
		'required',
		'default',
		'enum',
		'format',
		'minimum',
		'maximum',
		'minLength',
		'maxLength',
		'pattern',
		'items',
		'properties',
		'context',
	);

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Registers GET restbench/v1/routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/routes',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_routes' ),
				'permission_callback' => array( $this, 'can_access' ),
				// Keeps it out of the public /wp-json/ route list. It's checked per
				// endpoint, and a route only disappears once all of them have it.
				'show_in_index'       => false,
			)
		);
	}

	/**
	 * Admins only. The route list is basically a map of the site's attack
	 * surface, no reason to hand that to anyone else.
	 *
	 * @return bool
	 */
	public function can_access(): bool {
		return current_user_can( Admin::CAPABILITY );
	}

	/**
	 * Every registered route with its endpoints, args, schema and source.
	 *
	 * @param WP_REST_Request $request Not used.
	 * @return WP_REST_Response
	 */
	public function get_routes( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );

		$server  = rest_get_server();
		$routes  = array();
		$sources = new Route_Source();

		foreach ( $server->get_routes() as $route => $handlers ) {
			$options = $server->get_route_options( $route );
			$options = is_array( $options ) ? $options : array();

			$endpoints = array();
			foreach ( $handlers as $handler ) {
				$endpoints[] = array(
					'methods'  => array_keys( array_filter( (array) ( $handler['methods'] ?? array() ) ) ),
					'args'     => $this->normalize_args( (array) ( $handler['args'] ?? array() ) ),
					'isPublic' => $this->is_public( $handler['permission_callback'] ?? null ),
				);
			}

			$routes[] = array(
				'route'     => $route,
				'namespace' => (string) ( $options['namespace'] ?? '' ),
				'endpoints' => $endpoints,
				'schema'    => $this->resolve_schema( $options ),
				'source'    => $sources->for_handlers( $handlers ),
			);
		}

		usort(
			$routes,
			static function ( $a, $b ) {
				return strcmp( $a['route'], $b['route'] );
			}
		);

		return new WP_REST_Response(
			array(
				'namespaces' => array_values( $server->get_namespaces() ),
				'routes'     => $routes,
			)
		);
	}

	/**
	 * Keeps only the plain-data parts of each argument.
	 *
	 * @param array $args Raw endpoint args.
	 * @return array|\stdClass stdClass when empty, otherwise PHP encodes {} as [] and the JS side gets an array.
	 */
	private function normalize_args( array $args ) {
		$out = array();

		foreach ( $args as $name => $arg ) {
			if ( ! is_array( $arg ) ) {
				continue;
			}

			$clean = array();
			foreach ( self::ARG_KEYS as $key ) {
				if ( array_key_exists( $key, $arg ) ) {
					$value = $this->sanitize_value( $arg[ $key ] );
					if ( null !== $value ) {
						$clean[ $key ] = $value;
					}
				}
			}

			$out[ (string) $name ] = empty( $clean ) ? new \stdClass() : $clean;
		}

		return empty( $out ) ? new \stdClass() : $out;
	}

	/**
	 * Drops anything that's an object (closures mostly), recursively.
	 *
	 * @param mixed $value Raw value.
	 * @return mixed
	 */
	private function sanitize_value( $value ) {
		if ( is_object( $value ) ) {
			return null;
		}

		if ( is_array( $value ) ) {
			$clean = array();
			foreach ( $value as $key => $item ) {
				$item = $this->sanitize_value( $item );
				if ( null !== $item ) {
					$clean[ $key ] = $item;
				}
			}
			return $clean;
		}

		return $value;
	}

	/**
	 * Schema callbacks run other plugins' code, and some of them fatal outside
	 * a real request. One broken plugin shouldn't blank the whole list, hence
	 * the catch.
	 *
	 * @param array $options Route options.
	 * @return array|null
	 */
	private function resolve_schema( array $options ) {
		if ( empty( $options['schema'] ) || ! is_callable( $options['schema'] ) ) {
			return null;
		}

		try {
			$schema = call_user_func( $options['schema'] );
		} catch ( \Throwable $e ) {
			return null;
		}

		return is_array( $schema ) ? $this->sanitize_value( $schema ) : null;
	}

	/**
	 * Only catches the obvious case (__return_true). A callback that always
	 * returns true in some roundabout way won't be flagged. Good enough for now.
	 *
	 * @param mixed $callback Permission callback.
	 * @return bool
	 */
	private function is_public( $callback ): bool {
		return '__return_true' === $callback;
	}
}
