<?php
/**
 * Plugin Name:       Routemark
 * Plugin URI:        https://github.com/ClearanceClarence-Software/Routemark
 * Description:       Browse every REST API route on your site and send test requests to it from wp-admin.
 * Version:           0.3.3
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            CC Software
 * Author URI:        https://github.com/ClearanceClarence-Software
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       routemark
 *
 * @package Routemark
 */

defined( 'ABSPATH' ) || exit;

define( 'ROUTEMARK_VERSION', '0.3.3' );
// Version of the extension points add-ons use (hooks here and in src/lib/extensions.tsx).
// Goes up only when a change would break an add-on.
define( 'ROUTEMARK_API_VERSION', 1 );
define( 'ROUTEMARK_FILE', __FILE__ );
define( 'ROUTEMARK_DIR', plugin_dir_path( __FILE__ ) );
define( 'ROUTEMARK_URL', plugin_dir_url( __FILE__ ) );

// Where "Get Pro" links go. A plain link: nothing is loaded from or sent to it.
define( 'ROUTEMARK_CHECKOUT_URL', 'https://checkout.freemius.com/plugin/42850/plan/74584/' );

require_once ROUTEMARK_DIR . 'includes/class-plugin.php';
require_once ROUTEMARK_DIR . 'includes/class-admin.php';
require_once ROUTEMARK_DIR . 'includes/class-route-source.php';
require_once ROUTEMARK_DIR . 'includes/class-routes-controller.php';
require_once ROUTEMARK_DIR . 'includes/class-settings.php';
require_once ROUTEMARK_DIR . 'includes/class-send-as.php';
require_once ROUTEMARK_DIR . 'includes/class-request-stats.php';
require_once ROUTEMARK_DIR . 'includes/class-hooks.php';

add_action( 'plugins_loaded', array( \Routemark\Plugin::class, 'instance' ) );
