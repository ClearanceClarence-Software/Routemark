<?php
/**
 * GET /wp-json/routemark/v1/permission?route=<route>&method=<method>&user=<id>
 *
 * Explains who an endpoint lets in: which permission callback it runs, where
 * that callback lives, and the capabilities it looks at, checked against a
 * user. Routemark shows this when a request comes back 401 or 403.
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
 * The "why was this denied?" endpoint.
 */
class Permission {

	// Hooks that can turn a request away before the permission callback runs.
	const EARLY_HOOKS = array( 'rest_authentication_errors', 'rest_pre_dispatch', 'rest_request_before_callbacks' );

	// The longest permission callback we'll read looking for capabilities.
	const MAX_LINES = 400;

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Registers GET routemark/v1/permission.
	 */
	public function register_routes(): void {
		register_rest_route(
			Routes_Controller::REST_NAMESPACE,
			'/permission',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'explain' ),
					'permission_callback' => array( $this, 'can_access' ),
					'show_in_index'       => false,
					'args'                => array(
						'route'  => array(
							'description'       => __( 'A route exactly as registered, e.g. /wp/v2/posts/(?P<id>[\d]+).', 'routemark' ),
							'type'              => 'string',
							'required'          => true,
							'maxLength'         => 500,
							'validate_callback' => 'rest_validate_request_arg',
							'sanitize_callback' => 'rest_sanitize_request_arg',
						),
						'method' => array(
							'description' => __( 'HTTP method.', 'routemark' ),
							'type'        => 'string',
							'enum'        => array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ),
							'default'     => 'GET',
						),
						'user'   => array(
							'description' => __( 'Check capabilities for this user. 0 for logged out, leave out for you.', 'routemark' ),
							'type'        => 'integer',
							'minimum'     => 0,
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
	 * The explanation for one endpoint.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function explain( WP_REST_Request $request ) {
		$route  = (string) $request->get_param( 'route' );
		$method = (string) $request->get_param( 'method' );
		$server = rest_get_server();
		$routes = $server->get_routes();

		if ( ! isset( $routes[ $route ] ) ) {
			return new WP_Error( 'routemark_unknown_route', __( 'No route is registered with that pattern.', 'routemark' ), array( 'status' => 404 ) );
		}

		$handler = null;
		foreach ( $routes[ $route ] as $candidate ) {
			if ( ! empty( $candidate['methods'][ $method ] ) ) {
				$handler = $candidate;
				break;
			}
		}
		if ( ! $handler ) {
			return new WP_Error( 'routemark_unknown_method', __( 'That route has no endpoint for this method.', 'routemark' ), array( 'status' => 404 ) );
		}

		// Whose capabilities to check. Someone else only if you could send as them.
		$user_id = $request->has_param( 'user' ) ? (int) $request->get_param( 'user' ) : get_current_user_id();
		if ( get_current_user_id() !== $user_id && ! Send_As::can_switch_to( $user_id ) ) {
			return new WP_Error( 'routemark_user_denied', __( "You can't check another user's capabilities unless you can edit them.", 'routemark' ), array( 'status' => 403 ) );
		}
		$user = $user_id ? get_userdata( $user_id ) : null;

		$options  = $server->get_route_options( $route );
		$callback = $handler['permission_callback'] ?? null;
		$kind     = Routes_Controller::permission_kind( $callback, $route, (string) ( $options['namespace'] ?? '' ) );
		$sources  = new Route_Source();

		$caps        = array();
		$needs_login = false;
		$where       = null;
		if ( 'check' === $kind && $callback ) {
			$where = $this->locate( $callback );
			$caps  = $this->core_caps( $callback );
			if ( $where ) {
				$scan        = $this->scan( $where['path'], $where['line'], $where['end'] );
				$caps        = array_values( array_unique( array_merge( $caps, $scan['caps'] ) ) );
				$needs_login = $scan['login'];
			}
		}

		$primitive = $this->primitive_caps();
		$checked   = array();
		foreach ( $caps as $cap ) {
			$is_primitive = isset( $primitive[ $cap ] );
			$checked[]    = array(
				'cap'       => $cap,
				'primitive' => $is_primitive,
				// Meta caps (edit_post and friends) need the object, so we can't say.
				'has'       => $is_primitive ? ( $user ? user_can( $user, $cap ) : false ) : null,
			);
		}

		return new WP_REST_Response(
			array(
				'route'      => $route,
				'method'     => $method,
				'permission' => $kind,
				'callback'   => 'check' === $kind && $callback ? array(
					'name'   => Hooks::describe( $callback ),
					'file'   => $where ? $where['file'] : null,
					'line'   => $where ? $where['line'] : null,
					'source' => $sources->for_callback( $callback ),
				) : null,
				'needsLogin' => $needs_login,
				'caps'       => $checked,
				'user'       => array(
					'id'   => $user_id,
					'name' => $user ? $user->display_name : '',
				),
				'early'      => $this->early_blockers( $sources ),
			)
		);
	}

	/**
	 * Where a callback is defined: file (relative to the WordPress folder), first and last line.
	 *
	 * @param mixed $callback Callable.
	 * @return array|null { path, file, line, end }
	 */
	private function locate( $callback ) {
		try {
			if ( is_string( $callback ) && false !== strpos( $callback, '::' ) ) {
				$callback = explode( '::', $callback, 2 );
			}
			if ( is_array( $callback ) && 2 === count( $callback ) ) {
				$ref = new \ReflectionMethod( is_object( $callback[0] ) ? get_class( $callback[0] ) : (string) $callback[0], (string) $callback[1] );
			} elseif ( $callback instanceof \Closure || ( is_string( $callback ) && function_exists( $callback ) ) ) {
				$ref = new \ReflectionFunction( $callback );
			} elseif ( is_object( $callback ) && method_exists( $callback, '__invoke' ) ) {
				$ref = new \ReflectionMethod( $callback, '__invoke' );
			} else {
				return null;
			}
		} catch ( \ReflectionException $e ) {
			return null;
		}

		$path = $ref->getFileName();
		if ( ! $path ) {
			return null;
		}
		$path = wp_normalize_path( $path );
		$base = wp_normalize_path( ABSPATH );

		return array(
			'path' => $path,
			'file' => 0 === strpos( $path, $base ) ? substr( $path, strlen( $base ) ) : basename( $path ),
			'line' => (int) $ref->getStartLine(),
			'end'  => (int) $ref->getEndLine(),
		);
	}

	/**
	 * Reads the callback's own lines for current_user_can( 'cap' ),
	 * user_can( $user, 'cap' ) and is_user_logged_in(). Only literal
	 * capability names; anything worked out at runtime we can't see.
	 *
	 * @param string $path  File.
	 * @param int    $start First line.
	 * @param int    $end   Last line.
	 * @return array{caps: string[], login: bool}
	 */
	private function scan( string $path, int $start, int $end ): array {
		$out = array(
			'caps'  => array(),
			'login' => false,
		);
		if ( $start < 1 || $end < $start || ! is_readable( $path ) ) {
			return $out;
		}

		$file = new \SplFileObject( $path );
		$file->seek( $start - 1 );
		$code  = '';
		$lines = min( $end, $start + self::MAX_LINES ) - $start + 1;
		while ( $lines-- > 0 && ! $file->eof() ) {
			$code .= (string) $file->current();
			$file->next();
		}

		if ( preg_match_all( '/\b(?:current_user_can|user_can\s*\(\s*[^,]+,)\s*\(?\s*[\'"]([a-z0-9_\-]+)[\'"]/i', $code, $m ) ) {
			$out['caps'] = array_values( array_unique( $m[1] ) );
		}
		$out['login'] = (bool) preg_match( '/\bis_user_logged_in\s*\(/', $code );
		return $out;
	}

	/**
	 * Capabilities core's controllers check. Their callbacks read them from
	 * the post type or taxonomy at runtime, so scanning the code finds nothing.
	 *
	 * @param mixed $callback Permission callback.
	 * @return string[]
	 */
	private function core_caps( $callback ): array {
		if ( ! is_array( $callback ) || ! is_object( $callback[0] ?? null ) ) {
			return array();
		}
		list( $controller, $method ) = $callback;
		$action                      = preg_replace( '/_permissions?_check$/', '', (string) $method );

		if ( $controller instanceof \WP_REST_Posts_Controller ) {
			$type = get_post_type_object( (string) Hooks::read_property( $controller, 'post_type' ) );
			if ( ! $type ) {
				return array();
			}
			$map = array(
				'get_items'   => array( $type->cap->edit_posts ),
				'create_item' => array( $type->cap->create_posts, $type->cap->publish_posts ),
				'update_item' => array( $type->cap->edit_posts, $type->cap->edit_others_posts ),
				'delete_item' => array( $type->cap->delete_posts, $type->cap->delete_others_posts ),
			);
			return $map[ $action ] ?? array();
		}
		if ( $controller instanceof \WP_REST_Terms_Controller ) {
			$tax = get_taxonomy( (string) Hooks::read_property( $controller, 'taxonomy' ) );
			if ( ! $tax ) {
				return array();
			}
			$map = array(
				'get_items'   => array( $tax->cap->edit_terms ),
				'create_item' => array( $tax->cap->edit_terms ),
				'update_item' => array( $tax->cap->edit_terms ),
				'delete_item' => array( $tax->cap->delete_terms ),
			);
			return $map[ $action ] ?? array();
		}

		$simple = array(
			'WP_REST_Users_Controller'    => array(
				'get_items'   => array( 'list_users' ),
				'get_item'    => array( 'list_users' ),
				'create_item' => array( 'create_users' ),
				'update_item' => array( 'edit_users' ),
				'delete_item' => array( 'delete_users' ),
			),
			'WP_REST_Settings_Controller' => array( '*' => array( 'manage_options' ) ),
			'WP_REST_Plugins_Controller'  => array(
				'get_items'   => array( 'activate_plugins' ),
				'get_item'    => array( 'activate_plugins' ),
				'create_item' => array( 'install_plugins', 'activate_plugins' ),
				'update_item' => array( 'activate_plugins' ),
				'delete_item' => array( 'delete_plugins' ),
			),
			'WP_REST_Themes_Controller'   => array( '*' => array( 'switch_themes', 'edit_theme_options' ) ),
			'WP_REST_Comments_Controller' => array(
				'get_items'   => array( 'moderate_comments' ),
				'update_item' => array( 'moderate_comments' ),
				'delete_item' => array( 'moderate_comments' ),
			),
		);
		foreach ( $simple as $class => $map ) {
			if ( $controller instanceof $class ) {
				return $map[ $action ] ?? ( $map['*'] ?? array() );
			}
		}
		return array();
	}

	/**
	 * Every capability any role on the site has. Those are the ones we can
	 * check without an object to check them against.
	 *
	 * @return array<string, true>
	 */
	private function primitive_caps(): array {
		$caps = array();
		foreach ( wp_roles()->roles as $role ) {
			foreach ( array_keys( (array) ( $role['capabilities'] ?? array() ) ) as $cap ) {
				$caps[ (string) $cap ] = true;
			}
		}
		return $caps;
	}

	/**
	 * Plugin and theme callbacks that can refuse a request before its
	 * permission callback runs. WordPress's own and Routemark's are left out.
	 *
	 * @param Route_Source $sources Source lookup.
	 * @return array
	 */
	private function early_blockers( Route_Source $sources ): array {
		global $wp_filter;

		$out = array();
		foreach ( self::EARLY_HOOKS as $hook ) {
			if ( empty( $wp_filter[ $hook ] ) || ! $wp_filter[ $hook ] instanceof \WP_Hook ) {
				continue;
			}
			foreach ( $wp_filter[ $hook ]->callbacks as $list ) {
				foreach ( $list as $entry ) {
					$source = $sources->for_callback( $entry['function'] );
					$name   = Hooks::describe( $entry['function'] );
					if ( ! $source || 'core' === $source['type'] || 0 === strpos( $name, 'Routemark\\' ) ) {
						continue;
					}
					$out[] = array(
						'hook'     => $hook,
						'callback' => $name,
						'source'   => $source,
					);
				}
			}
		}
		return $out;
	}

	/**
	 * What GET routemark/v1/permission returns.
	 *
	 * @return array
	 */
	public function get_schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'routemark-permission',
			'type'       => 'object',
			'properties' => array(
				'route'      => array(
					'description' => __( 'The route as registered.', 'routemark' ),
					'type'        => 'string',
					'readonly'    => true,
				),
				'method'     => array(
					'description' => __( 'HTTP method.', 'routemark' ),
					'type'        => 'string',
					'readonly'    => true,
				),
				'permission' => array(
					'description' => __( 'missing (no callback), open (__return_true) or check.', 'routemark' ),
					'type'        => 'string',
					'enum'        => array( 'missing', 'open', 'check' ),
					'readonly'    => true,
				),
				'callback'   => array(
					'description' => __( 'The permission callback and where it is defined.', 'routemark' ),
					'type'        => array( 'object', 'null' ),
					'readonly'    => true,
				),
				'needsLogin' => array(
					'description' => __( 'The callback calls is_user_logged_in().', 'routemark' ),
					'type'        => 'boolean',
					'readonly'    => true,
				),
				'caps'       => array(
					'description' => __( 'Capabilities the callback checks, and whether the user has them (null when it needs an object).', 'routemark' ),
					'type'        => 'array',
					'items'       => array( 'type' => 'object' ),
					'readonly'    => true,
				),
				'user'       => array(
					'description' => __( 'Whose capabilities were checked.', 'routemark' ),
					'type'        => 'object',
					'readonly'    => true,
				),
				'early'      => array(
					'description' => __( 'Plugin callbacks that can refuse a request before the permission callback runs.', 'routemark' ),
					'type'        => 'array',
					'items'       => array( 'type' => 'object' ),
					'readonly'    => true,
				),
			),
		);
	}
}
