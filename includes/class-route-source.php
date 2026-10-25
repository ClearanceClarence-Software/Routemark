<?php
/**
 * Works out which plugin, theme or core file registered a route.
 *
 * @package Routemark
 */

namespace Routemark;

defined( 'ABSPATH' ) || exit;

/**
 * WordPress doesn't record who registered a route, so we look at the route's
 * callback instead and find the file it was defined in. That file sits in a
 * plugin folder, a theme folder or wp-includes, which tells us the owner.
 *
 * For class callbacks we use the class of the actual object, not the class
 * that declares the method. Plenty of plugins extend core controllers like
 * WP_REST_Posts_Controller, and they should show up as the plugin, not core.
 */
class Route_Source {

	/**
	 * Plugin folder (or single-file plugin) => plugin name. Filled on first use.
	 *
	 * @var array<string, string>|null
	 */
	private $plugin_names = null;

	/**
	 * File path => source, so each file is only worked out once.
	 *
	 * @var array<string, array|null>
	 */
	private $cache = array();

	/**
	 * Source for a list of route handlers. The first handler we can place wins,
	 * they almost always come from the same controller anyway.
	 *
	 * @param array $handlers Handlers from WP_REST_Server::get_routes().
	 * @return array|null { type: core|plugin|mu-plugin|theme, name: string }
	 */
	public function for_handlers( array $handlers ) {
		foreach ( $handlers as $handler ) {
			$file = $this->callback_file( $handler['callback'] ?? null );
			if ( $file ) {
				$source = $this->for_file( $file );
				if ( $source ) {
					return $source;
				}
			}
		}
		return null;
	}

	/**
	 * Finds the file a callback lives in.
	 *
	 * @param mixed $callback Any callable.
	 * @return string|null Normalized path of the file it's defined in.
	 */
	private function callback_file( $callback ) {
		try {
			if ( is_string( $callback ) && false !== strpos( $callback, '::' ) ) {
				$callback = explode( '::', $callback, 2 );
			}

			if ( is_array( $callback ) && 2 === count( $callback ) ) {
				$ref = new \ReflectionClass( is_object( $callback[0] ) ? get_class( $callback[0] ) : (string) $callback[0] );
			} elseif ( $callback instanceof \Closure || ( is_string( $callback ) && function_exists( $callback ) ) ) {
				$ref = new \ReflectionFunction( $callback );
			} elseif ( is_object( $callback ) ) {
				$ref = new \ReflectionClass( get_class( $callback ) );
			} else {
				return null;
			}
		} catch ( \ReflectionException $e ) {
			return null;
		}

		$file = $ref->getFileName();
		return $file ? wp_normalize_path( $file ) : null;
	}

	/**
	 * Matches a file path against core, plugins, mu-plugins and themes.
	 *
	 * @param string $file Normalized file path.
	 * @return array|null
	 */
	private function for_file( string $file ) {
		if ( array_key_exists( $file, $this->cache ) ) {
			return $this->cache[ $file ];
		}

		$source = null;
		$file   = $this->unsymlink( $file );

		$core    = wp_normalize_path( ABSPATH . WPINC ) . '/';
		$admin   = wp_normalize_path( ABSPATH . 'wp-admin' ) . '/';
		$plugins = wp_normalize_path( WP_PLUGIN_DIR ) . '/';
		$mu      = wp_normalize_path( WPMU_PLUGIN_DIR ) . '/';
		$themes  = wp_normalize_path( get_theme_root() ) . '/';

		if ( 0 === strpos( $file, $core ) || 0 === strpos( $file, $admin ) ) {
			$source = array(
				'type' => 'core',
				'name' => 'WordPress',
			);
		} elseif ( 0 === strpos( $file, $plugins ) ) {
			$slug   = strtok( substr( $file, strlen( $plugins ) ), '/' );
			$names  = $this->plugin_names();
			$source = array(
				'type' => 'plugin',
				'name' => $names[ $slug ] ?? $slug,
			);
		} elseif ( 0 === strpos( $file, $mu ) ) {
			$source = array(
				'type' => 'mu-plugin',
				'name' => strtok( substr( $file, strlen( $mu ) ), '/' ),
			);
		} elseif ( 0 === strpos( $file, $themes ) ) {
			$slug   = strtok( substr( $file, strlen( $themes ) ), '/' );
			$theme  = wp_get_theme( $slug );
			$source = array(
				'type' => 'theme',
				'name' => $theme->exists() ? $theme->get( 'Name' ) : $slug,
			);
		}

		// Names come from plugin headers, which anyone can write. React escapes
		// on output anyway, but there's no reason to pass markup along.
		if ( $source ) {
			$source['name'] = wp_strip_all_tags( (string) $source['name'] );
		}

		$this->cache[ $file ] = $source;
		return $source;
	}

	/**
	 * Reflection gives us the real path. If a plugin folder is a symlink
	 * (common when developing), that path is outside wp-content/plugins.
	 * WordPress keeps a map of symlinked plugin folders, so we use it to
	 * turn the real path back into the plugins-folder one.
	 *
	 * @param string $file Normalized real path.
	 * @return string
	 */
	private function unsymlink( string $file ): string {
		global $wp_plugin_paths;

		foreach ( (array) $wp_plugin_paths as $dir => $realdir ) {
			$realdir = trailingslashit( wp_normalize_path( $realdir ) );
			if ( 0 === strpos( $file, $realdir ) ) {
				return trailingslashit( wp_normalize_path( $dir ) ) . substr( $file, strlen( $realdir ) );
			}
		}
		return $file;
	}

	/**
	 * Plugin names keyed by folder, from the plugin headers.
	 *
	 * @return array<string, string>
	 */
	private function plugin_names(): array {
		if ( null !== $this->plugin_names ) {
			return $this->plugin_names;
		}

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$this->plugin_names = array();
		foreach ( get_plugins() as $basename => $data ) {
			// Folder plugins are keyed by folder, single-file plugins by file name.
			$slug                        = false !== strpos( $basename, '/' ) ? strtok( $basename, '/' ) : $basename;
			$this->plugin_names[ $slug ] = $data['Name'] ?? $slug;
		}

		return $this->plugin_names;
	}
}
