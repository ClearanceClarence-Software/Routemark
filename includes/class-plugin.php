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
	}
}
