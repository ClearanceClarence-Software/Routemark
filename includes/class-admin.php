<?php
/**
 * Tools > Restbench. The page itself is a React app, this just mounts it.
 *
 * @package Restbench
 */

namespace Restbench;

defined( 'ABSPATH' ) || exit;

/**
 * The admin screen.
 */
class Admin {

	const SLUG       = 'restbench';
	const HANDLE     = 'restbench-admin';
	const CAPABILITY = 'manage_options';

	/**
	 * What add_management_page() gave us back, so we only load assets on our page.
	 *
	 * @var string
	 */
	private $hook_suffix = '';

	/**
	 * Hooks into WordPress.
	 */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_page' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter( 'admin_body_class', array( $this, 'body_class' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( RESTBENCH_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * Adds Tools > Restbench.
	 */
	public function add_page(): void {
		$this->hook_suffix = (string) add_management_page(
			__( 'Restbench', 'restbench' ),
			__( 'Restbench', 'restbench' ),
			self::CAPABILITY,
			self::SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * The stylesheet uses this class to take over the full content area
	 * (no left padding, no footer) on our screen only.
	 *
	 * @param string $classes Space separated body classes.
	 * @return string
	 */
	public function body_class( string $classes ): string {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && $screen->id === $this->hook_suffix ) {
			$classes .= ' restbench-screen';
		}
		return $classes;
	}

	/**
	 * "Open" link next to Deactivate on the Plugins screen.
	 *
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public function action_links( array $links ): array {
		$url = admin_url( 'tools.php?page=' . self::SLUG );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Open', 'restbench' ) . '</a>' );
		return $links;
	}

	/**
	 * Prints the mount point for the React app.
	 */
	public function render_page(): void {
		// The hidden h1 and wp-header-end are there so WordPress drops admin
		// notices above the app instead of somewhere inside it.
		echo '<h1 class="screen-reader-text">' . esc_html__( 'Restbench', 'restbench' ) . '</h1>';
		echo '<hr class="wp-header-end">';

		if ( ! file_exists( $this->asset_file() ) ) {
			echo '<div class="notice notice-error"><p>';
			esc_html_e( 'Restbench assets are missing. Run "npm install" and "npm run build" in the plugin folder.', 'restbench' );
			echo '</p></div>';
			return;
		}

		echo '<div id="restbench-root"></div>';
	}

	/**
	 * Loads the app's script and styles, on our page only.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( $hook_suffix !== $this->hook_suffix || ! file_exists( $this->asset_file() ) ) {
			return;
		}

		$asset = require $this->asset_file();

		wp_enqueue_script(
			self::HANDLE,
			RESTBENCH_URL . 'build/index.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);

		wp_enqueue_style(
			self::HANDLE,
			RESTBENCH_URL . 'build/index.css',
			array(),
			$asset['version']
		);
		// wp-scripts also builds index-rtl.css, WordPress swaps it in for RTL languages.
		wp_style_add_data( self::HANDLE, 'rtl', 'replace' );

		wp_add_inline_script(
			self::HANDLE,
			'window.restbenchSettings = ' . wp_json_encode(
				array(
					'restRoot' => esc_url_raw( rest_url() ),
					'version'  => RESTBENCH_VERSION,
					'userId'   => get_current_user_id(),
					// Inlined so the page opens with the right theme and options
					// instead of flashing defaults while it fetches them.
					'settings' => Settings::for_user( get_current_user_id() ),
				),
				// This lands inside a <script> tag, so < > & are written as \u003C etc.
				// Nothing in here can close the tag, whatever a value contains.
				JSON_HEX_TAG | JSON_HEX_AMP
			) . ';',
			'before'
		);

		wp_set_script_translations( self::HANDLE, 'restbench' );
	}

	/**
	 * The asset file wp-scripts writes next to the bundle (dependencies + cache-busting hash).
	 *
	 * @return string
	 */
	private function asset_file(): string {
		return RESTBENCH_DIR . 'build/index.asset.php';
	}
}
