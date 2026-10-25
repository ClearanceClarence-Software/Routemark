<?php
/**
 * GET /wp-json/routemark/v1/routes
 *
 * Dumps the whole route table in a shape the React side can use.
 *
 * @package Routemark
 */

namespace Routemark;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * The route table endpoint.
 */
class Routes_Controller {

	const REST_NAMESPACE = 'routemark/v1';

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
	 * Registers GET routemark/v1/routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/routes',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_routes' ),
					'permission_callback' => array( $this, 'can_access' ),
					// Keeps it out of the public /wp-json/ route list. It's checked per
					// endpoint, and a route only disappears once all of them have it.
					'show_in_index'       => false,
				),
				'schema' => array( $this, 'get_schema' ),
			)
		);
	}

	/**
	 * What GET routemark/v1/routes returns. Kept short, the TypeScript types
	 * in src/types.ts have the details.
	 *
	 * @return array
	 */
	public function get_schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'routemark-routes',
			'type'       => 'object',
			'properties' => array(
				'namespaces' => array(
					'description' => __( 'Every registered namespace.', 'routemark' ),
					'type'        => 'array',
					'items'       => array( 'type' => 'string' ),
					'readonly'    => true,
				),
				'routes'     => array(
					'description' => __( 'Every registered route.', 'routemark' ),
					'type'        => 'array',
					'readonly'    => true,
					'items'       => array(
						'type'       => 'object',
						'properties' => array(
							'route'     => array(
								'description' => __( 'The route pattern as registered.', 'routemark' ),
								'type'        => 'string',
							),
							'namespace' => array(
								'description' => __( 'Namespace the route belongs to.', 'routemark' ),
								'type'        => 'string',
							),
							'endpoints' => array(
								'description' => __( 'One entry per set of methods: args, and how permission is checked.', 'routemark' ),
								'type'        => 'array',
								'items'       => array( 'type' => 'object' ),
							),
							'schema'    => array(
								'description' => __( "The route's own schema, if it has one.", 'routemark' ),
								'type'        => array( 'object', 'null' ),
							),
							'source'    => array(
								'description' => __( 'The plugin, theme or part of WordPress that registered it.', 'routemark' ),
								'type'        => array( 'object', 'null' ),
							),
						),
					),
				),
			),
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
				$args       = (array) ( $handler['args'] ?? array() );
				$permission = $this->permission_kind( $handler['permission_callback'] ?? null, $route, (string) ( $options['namespace'] ?? '' ) );

				$endpoints[] = array(
					'methods'       => array_keys( array_filter( (array) ( $handler['methods'] ?? array() ) ) ),
					'args'          => $this->normalize_args( $args ),
					'isPublic'      => 'check' !== $permission,
					// For the report. Worked out here because the callbacks are
					// stripped before the args go out.
					'permission'    => $permission,
					'uncheckedArgs' => $this->unchecked_args( $args ),
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
	 * How an endpoint decides who may call it:
	 *
	 * - missing: no permission_callback. WordPress logs a notice since 5.5 but
	 *   still runs the endpoint for anyone (see respond_to_request()).
	 * - open:    __return_true, so open on purpose.
	 * - check:   some other callback. We can't tell what it allows, only that
	 *   it's there. One that always returns true in a roundabout way still
	 *   counts as a check.
	 *
	 * @param mixed  $callback        Permission callback.
	 * @param string $route           Route regex.
	 * @param string $route_namespace Route namespace.
	 * @return string
	 */
	private function permission_kind( $callback, string $route, string $route_namespace ): string {
		if ( empty( $callback ) ) {
			// WordPress registers these itself, without a permission callback.
			// The index routes are public on purpose, and batch checks each
			// request inside it separately.
			if ( '/batch/v1' === $route ) {
				return 'check';
			}
			if ( '/' === $route || '/' . $route_namespace === $route ) {
				return 'open';
			}
			return 'missing';
		}
		return '__return_true' === $callback ? 'open' : 'check';
	}

	/**
	 * Args that declare nothing WordPress could check them with: no type, no
	 * validate_callback, no sanitize_callback. Whatever is sent reaches the
	 * handler as is.
	 *
	 * A typed arg is checked by WordPress on its own (rest_parse_request_arg).
	 * We also leave alone typed args with the callbacks set to null on
	 * purpose. Core's post controllers do that for title and content, because
	 * they clean those up themselves later, and so does every plugin that
	 * extends them.
	 *
	 * @param array $args Raw endpoint args.
	 * @return string[]
	 */
	private function unchecked_args( array $args ): array {
		$unchecked = array();

		foreach ( $args as $name => $arg ) {
			if ( ! is_array( $arg ) ) {
				continue;
			}
			if ( empty( $arg['type'] ) && empty( $arg['validate_callback'] ) && empty( $arg['sanitize_callback'] ) ) {
				$unchecked[] = (string) $name;
			}
		}

		return $unchecked;
	}
}
