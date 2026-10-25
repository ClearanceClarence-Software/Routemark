<?php
/**
 * "Send as": run one REST request as another user, or as nobody.
 *
 * The app sends two headers with the request:
 *
 *   X-Routemark-As     user ID to run as, 0 for logged out
 *   X-Routemark-Nonce  a routemark_send_as nonce for the real user
 *
 * WordPress has already checked the cookie and the wp_rest nonce by the time
 * rest_pre_dispatch fires, so we check our own nonce and the permissions
 * against the real user there, then switch. The permission callback, the
 * handler and any _embed lookups all run as the target. We switch back in
 * rest_pre_echo_response, which is the last thing before the JSON goes out.
 *
 * GET /wp-json/routemark/v1/users lists the users you can pick.
 *
 * @package Routemark
 */

namespace Routemark;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_User;

defined( 'ABSPATH' ) || exit;

/**
 * Switches the current user for a single REST request.
 */
class Send_As {

	const NONCE_ACTION = 'routemark_send_as';
	const ANONYMOUS    = 0;

	/**
	 * The real user's ID while a switch is active, null otherwise.
	 *
	 * @var int|null
	 */
	private $original_user = null;

	/**
	 * Who we switched to, for the response header.
	 *
	 * @var int|null
	 */
	private $target_user = null;

	/**
	 * Set once the first rest_pre_dispatch has run, so batch sub-requests
	 * (which fire the filter again) don't try to switch a second time.
	 *
	 * @var bool
	 */
	private $handled = false;

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		// Late, so a plugin that short-circuits the request earlier still wins
		// and we don't switch for nothing.
		add_filter( 'rest_pre_dispatch', array( $this, 'maybe_switch' ), 999, 3 );
		add_filter( 'rest_post_dispatch', array( $this, 'add_header' ), 999 );
		add_filter( 'rest_pre_echo_response', array( $this, 'restore' ), 999 );
	}

	/**
	 * Can the real, logged-in user run requests as $target_id?
	 *
	 * Logged out is always allowed for admins. For a real user we also need
	 * edit_user on them. That's the same check the User Switching plugin uses,
	 * and on multisite it means a site admin can't become a super admin.
	 *
	 * @param int $target_id User ID, or 0 for logged out.
	 * @return bool
	 */
	public static function can_switch_to( int $target_id ): bool {
		if ( ! current_user_can( Admin::CAPABILITY ) ) {
			return false;
		}
		if ( self::ANONYMOUS === $target_id ) {
			return true;
		}
		if ( get_current_user_id() === $target_id || ! get_userdata( $target_id ) ) {
			return false;
		}
		return current_user_can( 'edit_user', $target_id );
	}

	/**
	 * Swaps the current user if the request asks for it.
	 *
	 * @param mixed           $result  Response to short-circuit with, usually null.
	 * @param WP_REST_Server  $server  Server instance.
	 * @param WP_REST_Request $request The request.
	 * @return mixed
	 */
	public function maybe_switch( $result, $server, $request ) {
		// Only for a REST request coming in over HTTP. Internal rest_do_request()
		// calls never reach rest_pre_echo_response, so we couldn't switch back.
		if ( $this->handled || ! $request instanceof WP_REST_Request || ! wp_is_serving_rest_request() ) {
			return $result;
		}

		// Batch sub-requests carry their own headers, not the outer request's,
		// so this is only ever set on the request the app actually sent.
		$as = $request->get_header( 'x_routemark_as' );
		if ( null === $as ) {
			return $result;
		}
		$this->handled = true;

		if ( null !== $result ) {
			return $result;
		}

		if ( ! preg_match( '/^\d{1,20}$/', $as ) ) {
			return $this->deny( __( 'X-Routemark-As has to be a user ID.', 'routemark' ) );
		}
		$target_id = (int) $as;

		$nonce = (string) $request->get_header( 'x_routemark_nonce' );
		if ( ! wp_verify_nonce( $nonce, self::NONCE_ACTION ) ) {
			return $this->deny( __( 'The Send as check has expired. Reload the Routemark page and try again.', 'routemark' ) );
		}

		if ( ! self::can_switch_to( $target_id ) ) {
			return $this->deny( __( 'You are not allowed to send requests as that user.', 'routemark' ) );
		}

		$this->original_user = get_current_user_id();
		$this->target_user   = $target_id;
		wp_set_current_user( $target_id );

		return $result;
	}

	/**
	 * Tells the app who the request actually ran as, so it can warn you if
	 * the switch didn't happen.
	 *
	 * @param WP_REST_Response $response Response.
	 * @return WP_REST_Response
	 */
	public function add_header( $response ) {
		if ( null !== $this->target_user && $response instanceof WP_REST_Response ) {
			$response->header( 'X-Routemark-As', (string) $this->target_user );
		}
		return $response;
	}

	/**
	 * Back to the real user before anything else runs in this request.
	 *
	 * @param mixed $result Response data about to be echoed.
	 * @return mixed
	 */
	public function restore( $result ) {
		if ( null !== $this->original_user ) {
			wp_set_current_user( $this->original_user );
			$this->original_user = null;
		}
		return $result;
	}

	/**
	 * Error response for a refused switch.
	 *
	 * @param string $message What went wrong.
	 * @return WP_Error
	 */
	private function deny( string $message ): WP_Error {
		return new WP_Error( 'routemark_send_as_denied', $message, array( 'status' => 403 ) );
	}

	/**
	 * Registers GET routemark/v1/users.
	 */
	public function register_routes(): void {
		register_rest_route(
			Routes_Controller::REST_NAMESPACE,
			'/users',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_users' ),
					'permission_callback' => array( $this, 'can_access' ),
					'show_in_index'       => false,
					'args'                => array(
						'search' => array(
							'type'              => 'string',
							'maxLength'         => 60,
							'default'           => '',
							'validate_callback' => 'rest_validate_request_arg',
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
				'schema' => array( $this, 'get_schema' ),
			)
		);
	}

	/**
	 * What GET routemark/v1/users returns.
	 *
	 * @return array
	 */
	public function get_schema(): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'routemark-users',
			'type'       => 'object',
			'properties' => array(
				'users' => array(
					'description' => __( 'Users you can send requests as.', 'routemark' ),
					'type'        => 'array',
					'readonly'    => true,
					'items'       => array(
						'type'       => 'object',
						'properties' => array(
							'id'    => array( 'type' => 'integer' ),
							'name'  => array( 'type' => 'string' ),
							'login' => array( 'type' => 'string' ),
							'role'  => array(
								'description' => __( 'Role name, translated.', 'routemark' ),
								'type'        => 'string',
							),
						),
					),
				),
			),
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
	 * Without a search: the first user of each role, so you can quickly
	 * try "an editor" or "a subscriber". With a search: up to 20 matches.
	 * Either way, only users you're allowed to switch to.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function list_users( WP_REST_Request $request ): WP_REST_Response {
		$search = trim( (string) $request->get_param( 'search' ) );
		$users  = array();

		if ( '' !== $search ) {
			$found = get_users(
				array(
					'search'         => '*' . $search . '*',
					'search_columns' => array( 'user_login', 'user_nicename', 'display_name', 'user_email' ),
					'number'         => 40,
					'orderby'        => 'display_name',
				)
			);
			foreach ( $found as $user ) {
				if ( self::can_switch_to( $user->ID ) ) {
					$users[] = $this->user_data( $user );
				}
				if ( count( $users ) >= 20 ) {
					break;
				}
			}
			return new WP_REST_Response( array( 'users' => $users ) );
		}

		foreach ( array_keys( wp_roles()->get_names() ) as $role ) {
			$candidates = get_users(
				array(
					'role'    => $role,
					'number'  => 5,
					'orderby' => 'ID',
				)
			);
			foreach ( $candidates as $user ) {
				if ( self::can_switch_to( $user->ID ) ) {
					$users[] = $this->user_data( $user, $role );
					break;
				}
			}
		}

		return new WP_REST_Response( array( 'users' => $users ) );
	}

	/**
	 * What the picker needs to show a user. No email, it doesn't need it.
	 *
	 * @param WP_User     $user User.
	 * @param string|null $role The role it was picked for, if any.
	 * @return array
	 */
	private function user_data( WP_User $user, ?string $role = null ): array {
		$names = wp_roles()->get_names();
		$role  = $role ?? ( $user->roles ? reset( $user->roles ) : '' );

		return array(
			'id'    => $user->ID,
			'name'  => wp_strip_all_tags( $user->display_name ),
			'login' => $user->user_login,
			'role'  => isset( $names[ $role ] ) ? translate_user_role( $names[ $role ] ) : '',
		);
	}
}
