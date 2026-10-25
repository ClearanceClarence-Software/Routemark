<?php
/**
 * Plugin Name: Demo Shop
 * Description: Test fixture for Routemark. A well-behaved plugin: a controller that extends core's, one open read-only route, and two filters for the Hooks tab to find.
 */

/**
 * Same as core's posts controller, under a different namespace. Routemark
 * should credit it to Demo Shop, not WordPress.
 */
class Demo_Shop_Products extends WP_REST_Posts_Controller {
	public function __construct() {
		parent::__construct( 'post' );
		$this->namespace = 'demo-shop/v1';
		$this->rest_base = 'products';
	}
}

add_action(
	'rest_api_init',
	function () {
		( new Demo_Shop_Products() )->register_routes();
		register_rest_route(
			'demo-shop/v1',
			'/ping',
			array(
				'methods'             => 'GET',
				'callback'            => function () {
					return array( 'pong' => true );
				},
				'permission_callback' => '__return_true',
			)
		);
	}
);

// Adds a field to every post in the REST API.
function demo_shop_price( $response, $post ) {
	$response->data['price'] = 42;
	return $response;
}
add_filter( 'rest_prepare_post', 'demo_shop_price', 20, 2 );

// A closure, so the Hooks tab has to show file and line.
add_filter(
	'rest_post_query',
	function ( $args ) {
		return $args;
	}
);
