<?php
/**
 * Boots the plugin.
 *
 * @package Routemark
 */

namespace Routemark;

defined( 'ABSPATH' ) || exit;

/**
 * Small on purpose. If this grows past a handful of components it probably
 * wants a proper container, but we're not there.
 */
final class Plugin {

	/**
	 * The one instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Creates the plugin on first call, returns the same one after that.
	 *
	 * @return Plugin
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();

			/**
			 * Routemark is loaded. Add-ons should hook in here rather than on
			 * plugins_loaded, so they know Routemark is active and can check
			 * ROUTEMARK_API_VERSION first.
			 *
			 * @param Plugin $plugin The plugin.
			 */
			do_action( 'routemark_loaded', self::$instance );
		}
		return self::$instance;
	}

	/**
	 * Registers each part of the plugin.
	 */
	private function __construct() {
		( new Admin() )->register();
		( new Routes_Controller() )->register();
		( new Settings() )->register();
		( new Send_As() )->register();
		( new Request_Stats() )->register();
		( new Hooks() )->register();
		( new Permission() )->register();
		( new Recorder() )->register();
		( new Site_Health() )->register();
	}
}
