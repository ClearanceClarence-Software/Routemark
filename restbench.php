<?php
/**
 * Plugin Name:       Restbench
 * Description:       Browse every REST API route on your site and send test requests to it from wp-admin.
 * Version:           0.1.3
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            ClearanceClarence
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       restbench
 * Plugin URI:        https://github.com/ClearanceClarence/restbench
 *
 * @package Restbench
 */

defined( 'ABSPATH' ) || exit;

define( 'RESTBENCH_VERSION', '0.1.3' );
define( 'RESTBENCH_FILE', __FILE__ );
define( 'RESTBENCH_DIR', plugin_dir_path( __FILE__ ) );
define( 'RESTBENCH_URL', plugin_dir_url( __FILE__ ) );

require_once RESTBENCH_DIR . 'includes/class-plugin.php';
require_once RESTBENCH_DIR . 'includes/class-admin.php';
require_once RESTBENCH_DIR . 'includes/class-route-source.php';
require_once RESTBENCH_DIR . 'includes/class-routes-controller.php';
require_once RESTBENCH_DIR . 'includes/class-settings.php';

add_action( 'plugins_loaded', array( \Restbench\Plugin::class, 'instance' ) );
