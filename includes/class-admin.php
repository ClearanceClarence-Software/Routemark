<?php
/**
 * Tools > Routemark. The page itself is a React app, this just mounts it.
 *
 * @package Routemark
 */

namespace Routemark;

defined( 'ABSPATH' ) || exit;

/**
 * The admin screen.
 */
class Admin {

	const SLUG       = 'routemark';
	const HANDLE     = 'routemark-admin';
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
		add_filter( 'plugin_action_links_' . plugin_basename( ROUTEMARK_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * Adds Tools > Routemark.
	 */
	public function add_page(): void {
		$this->hook_suffix = (string) add_management_page(
			__( 'Routemark', 'routemark' ),
			__( 'Routemark', 'routemark' ),
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
			$classes .= ' routemark-screen';
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
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Open', 'routemark' ) . '</a>' );
		return $links;
	}

	/**
	 * Prints the mount point for the React app.
	 */
	public function render_page(): void {
		// The hidden h1 and wp-header-end are there so WordPress drops admin
		// notices above the app instead of somewhere inside it.
		echo '<h1 class="screen-reader-text">' . esc_html__( 'Routemark', 'routemark' ) . '</h1>';
		echo '<hr class="wp-header-end">';

		if ( ! file_exists( $this->asset_file() ) ) {
			echo '<div class="notice notice-error"><p>';
			esc_html_e( 'Routemark assets are missing. Run "npm install" and "npm run build" in the plugin folder.', 'routemark' );
			echo '</p></div>';
			return;
		}

		echo '<div id="routemark-root"></div>';
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
			ROUTEMARK_URL . 'build/index.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);

		wp_enqueue_style(
			self::HANDLE,
			ROUTEMARK_URL . 'build/index.css',
			array(),
			$asset['version']
		);
		// wp-scripts also builds index-rtl.css, WordPress swaps it in for RTL languages.
		wp_style_add_data( self::HANDLE, 'rtl', 'replace' );

		$data = array(
			'restRoot'   => esc_url_raw( rest_url() ),
			'version'    => ROUTEMARK_VERSION,
			'userId'     => get_current_user_id(),
			// Inlined so the page opens with the right theme and options
			// instead of flashing defaults while it fetches them.
			'settings'   => Settings::for_user( get_current_user_id() ),
			// Goes with X-Routemark-As, see class-send-as.php.
			'sendAs'     => array(
				'nonce' => wp_create_nonce( Send_As::NONCE_ACTION ),
				'name'  => wp_get_current_user()->display_name,
			),
			'apiVersion' => ROUTEMARK_API_VERSION,
		);

		/**
		 * Filters the data the app starts with (window.routemarkSettings).
		 * Add-ons can put their own data under their own key. It goes into the
		 * page as JSON, so don't add anything the current user shouldn't see.
		 *
		 * @param array $data Settings for the app.
		 */
		$filtered = apply_filters( 'routemark_app_data', $data );
		$data     = is_array( $filtered ) ? $filtered : $data;

		wp_add_inline_script(
			self::HANDLE,
			'window.routemarkSettings = ' . wp_json_encode(
				$data,
				// This lands inside a <script> tag, so < > & are written as \u003C etc.
				// Nothing in here can close the tag, whatever a value contains.
				JSON_HEX_TAG | JSON_HEX_AMP
			) . ';',
			'before'
		);

		wp_set_script_translations( self::HANDLE, 'routemark' );

		/**
		 * Routemark's script and styles are enqueued. Add-ons enqueue theirs
		 * here, with $handle as a dependency so they load after Routemark and
		 * wp.hooks is there. Only fires on the Routemark page.
		 *
		 * @param string $handle Routemark's script and style handle.
		 */
		do_action( 'routemark_enqueue_assets', self::HANDLE );
	}

	/**
	 * The asset file wp-scripts writes next to the bundle (dependencies + cache-busting hash).
	 *
	 * @return string
	 */
	private function asset_file(): string {
		return ROUTEMARK_DIR . 'build/index.asset.php';
	}
}
