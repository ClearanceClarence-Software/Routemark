<?php
/**
 * GET /wp-json/routemark/v1/hooks?route=<route>
 *
 * Who hooks into a route: every callback on the filters and actions WordPress
 * runs for it, with the plugin each one comes from. When a response has a
 * field you didn't expect, or is missing one, this is where to look.
 *
 * @package Routemark
 */

namespace Routemark;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * Lists hook callbacks for a route.
 */
class Hooks {

	// Run on every REST request, in the order WordPress runs them.
	const GLOBAL_HOOKS = array(
		'rest_authentication_errors',
		'rest_pre_dispatch',
		'rest_request_before_callbacks',
		'rest_dispatch_request',
		'rest_request_after_callbacks',
		'rest_post_dispatch',
		'rest_pre_serve_request',
		'rest_pre_echo_response',
	);

	// Per-object hooks core controllers fire. {s} is the post type, taxonomy,
	// "user" or "comment". Not every one exists for every controller, we only
	// return the ones something is hooked into.
	const SUBJECT_HOOKS = array(
		'rest_{s}_query',
		'rest_prepare_{s}',
		'rest_pre_insert_{s}',
		'rest_insert_{s}',
		'rest_after_insert_{s}',
		'rest_delete_{s}',
		'rest_{s}_trashable',
		'rest_{s}_collection_params',
		'rest_{s}_item_schema',
	);

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Registers GET routemark/v1/hooks.
	 */
	public function register_routes(): void {
		register_rest_route(
			Routes_Controller::REST_NAMESPACE,
			'/hooks',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_hooks' ),
					'permission_callback' => array( $this, 'can_access' ),
					'show_in_index'       => false,
					'args'                => array(
						'route' => array(
							'description'       => __( 'A route exactly as registered, e.g. /wp/v2/posts/(?P<id>[\d]+).', 'routemark' ),
							'type'              => 'string',
							'required'          => true,
							'maxLength'         => 500,
							'validate_callback' => 'rest_validate_request_arg',
							'sanitize_callback' => 'rest_sanitize_request_arg',
						),
					),
				),
				'schema' => array( $this, 'get_schema' ),
			)
		);
	}

	/**
	 * Admins only, same as the rest of the plugin.
	 *
	 * @return bool
	 */
	public function can_access(): bool {
		return current_user_can( Admin::CAPABILITY );
	}

	/**
	 * Hook callbacks for one route.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_hooks( WP_REST_Request $request ) {
		$route  = (string) $request->get_param( 'route' );
		$routes = rest_get_server()->get_routes();

		// Only routes that exist. Also means nothing user-supplied ends up in a hook name.
		if ( ! isset( $routes[ $route ] ) ) {
			return new WP_Error( 'routemark_unknown_route', __( 'No route is registered with that pattern.', 'routemark' ), array( 'status' => 404 ) );
		}

		$subjects = $this->subjects( $routes[ $route ] );
		$names    = array();
		foreach ( $subjects as $subject ) {
			foreach ( self::SUBJECT_HOOKS as $pattern ) {
				$names[] = str_replace( '{s}', $subject, $pattern );
			}
		}

		$sources = new Route_Source();

		return new WP_REST_Response(
			array(
				'subjects' => $subjects,
				'route'    => $this->collect( array_unique( $names ), $sources ),
				'global'   => $this->collect( self::GLOBAL_HOOKS, $sources ),
			)
		);
	}

	/**
	 * What the route's controller works on: a post type, a taxonomy, users or
	 * comments. That's what goes into names like rest_prepare_{post_type}.
	 *
	 * @param array $handlers Route handlers.
	 * @return string[]
	 */
	private function subjects( array $handlers ): array {
		$subjects = array();

		foreach ( $handlers as $handler ) {
			$callback = $handler['callback'] ?? null;
			if ( ! is_array( $callback ) || ! is_object( $callback[0] ?? null ) ) {
				continue;
			}
			$controller = $callback[0];

			if ( $controller instanceof \WP_REST_Users_Controller ) {
				$subjects[] = 'user';
			} elseif ( $controller instanceof \WP_REST_Comments_Controller ) {
				$subjects[] = 'comment';
			}

			// post_type and taxonomy are protected on core's controllers, and
			// plugins that extend them inherit that.
			foreach ( array( 'post_type', 'taxonomy' ) as $property ) {
				$value = self::read_property( $controller, $property );
				if ( is_string( $value ) && '' !== $value ) {
					$subjects[] = $value;
				}
			}
		}

		return array_values( array_unique( $subjects ) );
	}

	/**
	 * Reads a property whatever its visibility. Read only. Used for a
	 * controller's post_type and taxonomy, here and in class-permission.php.
	 *
	 * @param object $controller Controller.
	 * @param string $property   Property name.
	 * @return mixed
	 */
	public static function read_property( $controller, string $property ) {
		try {
			$ref = new \ReflectionObject( $controller );
			while ( $ref && ! $ref->hasProperty( $property ) ) {
				$ref = $ref->getParentClass();
			}
			if ( ! $ref ) {
				return null;
			}
			$prop = $ref->getProperty( $property );
			// Needed before PHP 8.1, a no-op after, and deprecated in 8.5.
			if ( PHP_VERSION_ID < 80100 ) {
				$prop->setAccessible( true );
			}
			return $prop->getValue( $controller );
		} catch ( \ReflectionException $e ) {
			return null;
		}
	}

	/**
	 * Callbacks on each of the given hooks, skipping hooks nothing uses.
	 *
	 * @param string[]     $names   Hook names.
	 * @param Route_Source $sources Source lookup.
	 * @return array
	 */
	private function collect( array $names, Route_Source $sources ): array {
		global $wp_filter;

		$out = array();
		foreach ( $names as $name ) {
			if ( empty( $wp_filter[ $name ] ) || ! $wp_filter[ $name ] instanceof \WP_Hook ) {
				continue;
			}

			$callbacks = array();
			foreach ( $wp_filter[ $name ]->callbacks as $priority => $list ) {
				foreach ( $list as $entry ) {
					$callbacks[] = array(
						'priority' => (int) $priority,
						'callback' => self::describe( $entry['function'] ),
						'source'   => $sources->for_callback( $entry['function'] ),
					);
				}
			}

			if ( $callbacks ) {
				$out[] = array(
					'name'      => $name,
					'callbacks' => $callbacks,
				);
			}
		}
		return $out;
	}

	/**
	 * A readable name for a callback: my_function(), Some_Class->method(),
	 * Some_Class::method(), or a closure with where it's defined.
	 *
	 * @param mixed $callback Callable.
	 * @return string
	 */
	public static function describe( $callback ): string {
		if ( is_string( $callback ) ) {
			return $callback . '()';
		}
		if ( is_array( $callback ) && 2 === count( $callback ) ) {
			return is_object( $callback[0] )
				? get_class( $callback[0] ) . '->' . $callback[1] . '()'
				: $callback[0] . '::' . $callback[1] . '()';
		}
		if ( $callback instanceof \Closure ) {
			try {
				$ref  = new \ReflectionFunction( $callback );
				$file = wp_normalize_path( (string) $ref->getFileName() );
				$base = wp_normalize_path( WP_CONTENT_DIR ) . '/';
				$file = 0 === strpos( $file, $base ) ? substr( $file, strlen( $base ) ) : basename( $file );
				/* translators: 1: file path, 2: line number */
				return sprintf( __( 'closure in %1$s:%2$d', 'routemark' ), $file, $ref->getStartLine() );
			} catch ( \ReflectionException $e ) {
				return __( 'closure', 'routemark' );
			}
		}
		if ( is_object( $callback ) ) {
			return get_class( $callback ) . '->__invoke()';
		}
		return __( 'unknown callback', 'routemark' );
	}

	/**
	 * What GET routemark/v1/hooks returns.
	 *
	 * @return array
	 */
	public function get_schema(): array {
		$hook_list = array(
			'type'     => 'array',
			'readonly' => true,
			'items'    => array(
				'type'       => 'object',
				'properties' => array(
					'name'      => array( 'type' => 'string' ),
					'callbacks' => array(
						'type'  => 'array',
						'items' => array(
							'type'       => 'object',
							'properties' => array(
								'priority' => array( 'type' => 'integer' ),
								'callback' => array( 'type' => 'string' ),
								'source'   => array( 'type' => array( 'object', 'null' ) ),
							),
						),
					),
				),
			),
		);

		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'routemark-hooks',
			'type'       => 'object',
			'properties' => array(
				'subjects' => array(
					'description' => __( 'Post types, taxonomies, "user" or "comment" the route works on.', 'routemark' ),
					'type'        => 'array',
					'items'       => array( 'type' => 'string' ),
					'readonly'    => true,
				),
				'route'    => array_merge( $hook_list, array( 'description' => __( 'Hooks specific to what this route works on.', 'routemark' ) ) ),
				'global'   => array_merge( $hook_list, array( 'description' => __( 'Hooks that run on every REST request.', 'routemark' ) ) ),
			),
		);
	}
}
