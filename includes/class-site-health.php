<?php
/**
 * A Site Health check for REST routes that let anyone change data.
 *
 * @package Routemark
 */

namespace Routemark;

defined( 'ABSPATH' ) || exit;

/**
 * Adds "REST API routes that change data need a login" to Tools > Site Health.
 *
 * It counts endpoints that accept POST, PUT, PATCH or DELETE and have no
 * permission check, or one that always says yes (__return_true). Those are
 * the High findings in Routemark's Report, which this links to.
 */
class Site_Health {

	const TEST = 'routemark_open_write_routes';

	// How many routes to name in the description. The Report has the full list.
	const LIST_LIMIT = 8;

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_filter( 'site_status_tests', array( $this, 'add_test' ) );
	}

	/**
	 * Registers the test.
	 *
	 * @param array $tests Site Health tests.
	 * @return array
	 */
	public function add_test( $tests ) {
		if ( ! is_array( $tests ) ) {
			return $tests;
		}
		$tests['direct'][ self::TEST ] = array(
			'label' => __( 'REST API routes that change data need a login', 'routemark' ),
			'test'  => array( $this, 'run' ),
		);
		return $tests;
	}

	/**
	 * Write endpoints anyone can call: "METHOD /route" strings, sorted.
	 *
	 * @return string[]
	 */
	public static function open_writes(): array {
		$server = rest_get_server();
		$found  = array();

		foreach ( $server->get_routes() as $route => $handlers ) {
			$options   = $server->get_route_options( $route );
			$namespace = (string) ( is_array( $options ) ? ( $options['namespace'] ?? '' ) : '' );
			foreach ( $handlers as $handler ) {
				$kind = Routes_Controller::permission_kind( $handler['permission_callback'] ?? null, $route, $namespace );
				if ( 'check' === $kind ) {
					continue;
				}
				foreach ( array_keys( array_filter( (array) ( $handler['methods'] ?? array() ) ) ) as $method ) {
					if ( in_array( $method, array( 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) ) {
						$found[] = $method . ' ' . $route;
					}
				}
			}
		}

		$found = array_values( array_unique( $found ) );
		sort( $found );
		return $found;
	}

	/**
	 * Runs the test.
	 *
	 * @return array
	 */
	public function run(): array {
		$open   = self::open_writes();
		$report = admin_url( 'tools.php?page=' . Admin::SLUG . '&panel=report' );

		$result = array(
			'label'       => __( 'REST API routes that change data need a login', 'routemark' ),
			'status'      => 'good',
			'badge'       => array(
				'label' => __( 'Security', 'routemark' ),
				'color' => 'blue',
			),
			'description' => '<p>' . esc_html__( "Every REST API endpoint that can create, change or delete something checks who's asking first.", 'routemark' ) . '</p>',
			'actions'     => '<p><a href="' . esc_url( $report ) . '">' . esc_html__( 'Open the Routemark report', 'routemark' ) . '</a></p>',
			'test'        => self::TEST,
		);

		if ( ! $open ) {
			return $result;
		}

		$items = '';
		foreach ( array_slice( $open, 0, self::LIST_LIMIT ) as $line ) {
			$items .= '<li><code>' . esc_html( $line ) . '</code></li>';
		}
		$more = count( $open ) > self::LIST_LIMIT
			? '<p>' . esc_html(
				sprintf(
					/* translators: %d: number of endpoints not listed */
					_n( 'And %d more.', 'And %d more.', count( $open ) - self::LIST_LIMIT, 'routemark' ),
					count( $open ) - self::LIST_LIMIT
				)
			) . '</p>'
			: '';

		$result['status']         = 'recommended';
		$result['badge']['color'] = 'orange';
		$result['label']          = sprintf(
			/* translators: %d: number of endpoints */
			_n( '%d REST API endpoint lets anyone change data', '%d REST API endpoints let anyone change data', count( $open ), 'routemark' ),
			count( $open )
		);
		$result['description'] = '<p>' . esc_html__( "These accept POST, PUT, PATCH or DELETE without checking who's asking, so a visitor who isn't logged in can call them. Some are meant to be open, like a contact form. Check that each one is.", 'routemark' ) . '</p><ul>' . $items . '</ul>' . $more;
		$result['actions']     = '<p><a href="' . esc_url( $report ) . '">' . esc_html__( 'See them in the Routemark report', 'routemark' ) . '</a></p>';

		return $result;
	}
}
