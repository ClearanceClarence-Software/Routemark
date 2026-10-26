<?php
/**
 * Records the REST requests other admin screens make, like the block editor.
 *
 * @package Routemark
 */

namespace Routemark;

defined( 'ABSPATH' ) || exit;

/**
 * Loads build/recorder.js on admin screens and adds "REST calls" to the
 * admin bar. The script does the recording (src/recorder.ts): while it's
 * switched on, it notes each REST request the page makes and keeps the last
 * ones in this browser's localStorage. Routemark lists them under Recorded,
 * where any of them can be opened and sent again.
 *
 * Nothing is sent anywhere and nothing is stored on the server. Recording
 * is off until you switch it on, and only administrators get the script.
 */
class Recorder {

	const HANDLE = 'routemark-recorder';

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		// Priority 1 so the script is in place before other scripts start making requests.
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ), 1 );
		add_action( 'admin_bar_menu', array( $this, 'admin_bar' ), 100 );
	}

	/**
	 * Is this a screen the recorder belongs on? Admins, and not Routemark itself.
	 *
	 * @return bool
	 */
	private function wanted(): bool {
		if ( ! is_admin() || ! current_user_can( Admin::CAPABILITY ) ) {
			return false;
		}
		// Routemark's own requests already show up in its history.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- only reads which screen this is.
		return ! ( isset( $_GET['page'] ) && Admin::SLUG === $_GET['page'] );
	}

	/**
	 * Loads the recorder in the head, before other scripts run.
	 */
	public function enqueue(): void {
		$asset_file = ROUTEMARK_DIR . 'build/recorder.asset.php';
		if ( ! $this->wanted() || ! file_exists( $asset_file ) ) {
			return;
		}
		$asset = require $asset_file;

		wp_enqueue_script( self::HANDLE, ROUTEMARK_URL . 'build/recorder.js', array(), $asset['version'], false );
		// A dot that turns red while recording.
		wp_add_inline_style(
			'admin-bar',
			'#wpadminbar .routemark-recorder .ab-icon:before{content:"";display:inline-block;width:8px;height:8px;margin:0 2px;border-radius:50%;background:#a7aaad;vertical-align:middle}'
			. '#wpadminbar .routemark-recorder.is-recording .ab-icon:before{background:#d63638;box-shadow:0 0 0 3px rgba(214,54,56,.35)}'
		);
		wp_add_inline_script(
			self::HANDLE,
			'window.routemarkRecorder = ' . wp_json_encode(
				array(
					'restRoot' => esc_url_raw( rest_url() ),
					'userId'   => get_current_user_id(),
					'appUrl'   => admin_url( 'tools.php?page=' . Admin::SLUG . '&panel=recorded' ),
					'labels'   => array(
						'off'   => __( 'REST calls', 'routemark' ),
						/* translators: %d: number of recorded requests */
						'on'    => __( 'Recording REST calls (%d)', 'routemark' ),
						'start' => __( 'Start recording', 'routemark' ),
						'stop'  => __( 'Stop recording', 'routemark' ),
						'open'  => __( 'Open in Routemark', 'routemark' ),
						'clear' => __( 'Clear recorded calls', 'routemark' ),
					),
				),
				JSON_HEX_TAG | JSON_HEX_AMP
			) . ';',
			'before'
		);
	}

	/**
	 * "REST calls" in the admin bar, with Start/Stop, Open and Clear under it.
	 * The script fills in the labels, since recording is per browser.
	 *
	 * @param \WP_Admin_Bar $bar Admin bar.
	 */
	public function admin_bar( $bar ): void {
		if ( ! $this->wanted() ) {
			return;
		}
		$settings = Settings::for_user( get_current_user_id() );
		// Can be switched off in Routemark's Settings.
		if ( empty( $settings['recorderInBar'] ) ) {
			return;
		}
		$bar->add_node(
			array(
				'id'    => 'routemark-recorder',
				'title' => '<span class="ab-icon" aria-hidden="true"></span><span class="ab-label">' . esc_html__( 'REST calls', 'routemark' ) . '</span>',
				'href'  => admin_url( 'tools.php?page=' . Admin::SLUG . '&panel=recorded' ),
				'meta'  => array( 'class' => 'routemark-recorder' ),
			)
		);
		foreach ( array(
			'toggle' => __( 'Start recording', 'routemark' ),
			'open'   => __( 'Open in Routemark', 'routemark' ),
			'clear'  => __( 'Clear recorded calls', 'routemark' ),
		) as $id => $label ) {
			$bar->add_node(
				array(
					'parent' => 'routemark-recorder',
					'id'     => 'routemark-recorder-' . $id,
					'title'  => esc_html( $label ),
					'href'   => 'open' === $id ? admin_url( 'tools.php?page=' . Admin::SLUG . '&panel=recorded' ) : '#',
				)
			);
		}
	}
}
