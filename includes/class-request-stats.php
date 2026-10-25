<?php
/**
 * Server-side numbers for requests sent from Routemark: how many database
 * queries ran, how long PHP took and how much memory it used.
 *
 * The app sends "X-Routemark-Stats: 1". If the real user is an admin, we
 * start counting when dispatch starts and send the numbers back in an
 * X-Routemark-Stats response header (JSON).
 *
 * @package Routemark
 */

namespace Routemark;

use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Measures one REST request.
 */
class Request_Stats {

	/**
	 * Set when dispatch starts, null if we aren't measuring this request.
	 *
	 * @var array{time: float, queries: int}|null
	 */
	private $start = null;

	/**
	 * Only the first rest_pre_dispatch counts, same as Send_As.
	 *
	 * @var bool
	 */
	private $handled = false;

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		// Priority 1: before Send_As switches user (so the admin check is
		// against you), and before most plugins' own rest_pre_dispatch work,
		// so that gets counted too.
		add_filter( 'rest_pre_dispatch', array( $this, 'start' ), 1, 3 );
		// Headers go out right after rest_post_dispatch, so this is the last
		// moment we can add one. _embed runs after it and isn't included.
		add_filter( 'rest_post_dispatch', array( $this, 'finish' ), PHP_INT_MAX );
	}

	/**
	 * Starts counting if the request asks for it.
	 *
	 * @param mixed           $result  Short-circuit response, usually null.
	 * @param mixed           $server  Server instance.
	 * @param WP_REST_Request $request The request.
	 * @return mixed
	 */
	public function start( $result, $server, $request ) {
		if ( $this->handled || ! $request instanceof WP_REST_Request || ! wp_is_serving_rest_request() ) {
			return $result;
		}
		if ( '1' !== $request->get_header( 'x_routemark_stats' ) ) {
			return $result;
		}
		$this->handled = true;

		if ( current_user_can( Admin::CAPABILITY ) ) {
			$this->start = array(
				'time'    => microtime( true ),
				'queries' => get_num_queries(),
			);
		}
		return $result;
	}

	/**
	 * Adds the numbers to the response.
	 *
	 * @param WP_REST_Response $response Response.
	 * @return WP_REST_Response
	 */
	public function finish( $response ) {
		if ( null === $this->start || ! $response instanceof WP_REST_Response ) {
			return $response;
		}

		$response->header(
			'X-Routemark-Stats',
			(string) wp_json_encode(
				array(
					// While handling this request: permission check, callback, filters.
					'queries'      => get_num_queries() - $this->start['queries'],
					'handlerMs'    => round( ( microtime( true ) - $this->start['time'] ) * 1000, 1 ),
					// Everything since PHP started: loading WordPress and every plugin too.
					'queriesTotal' => get_num_queries(),
					'totalMs'      => round( timer_float() * 1000, 1 ),
					'peakMemory'   => memory_get_peak_usage(),
				)
			)
		);
		$this->start = null;

		return $response;
	}
}
