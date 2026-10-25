import { expect, test } from '@playwright/test';

import { Rest } from '../helpers';

// routemark/v1/hooks (who's hooked into a route) and X-Routemark-Stats
// (query count, PHP time and memory for requests sent from the app).

let admin: Rest;
let editor: Rest;

test.beforeAll( async ( {}, info ) => {
	admin = await Rest.as( 'admin', info.project.use.baseURL! );
	editor = await Rest.as( 'jane', info.project.use.baseURL! );
} );

test.afterAll( async () => {
	await Promise.all( [ admin.dispose(), editor.dispose() ] );
} );

const hooks = ( route: string ) => admin.call( 'GET', '/routemark/v1/hooks', { query: { route } } );

test.describe( 'hooks', () => {
	test( "finds a plugin's filters on /wp/v2/posts", async () => {
		const res = await hooks( '/wp/v2/posts' );
		expect( res.status ).toBe( 200 );
		expect( res.json.subjects ).toEqual( [ 'post' ] );

		const names = res.json.route.map( ( h: { name: string } ) => h.name );
		expect( names ).toEqual( expect.arrayContaining( [ 'rest_prepare_post', 'rest_post_query' ] ) );

		const prepare = res.json.route.find( ( h: { name: string } ) => h.name === 'rest_prepare_post' ).callbacks;
		expect( prepare ).toContainEqual( { priority: 20, callback: 'demo_shop_price()', source: { type: 'plugin', name: 'Demo Shop' } } );
	} );

	test( 'describes a closure by file and line', async () => {
		const res = await hooks( '/wp/v2/posts' );
		const query = res.json.route.find( ( h: { name: string } ) => h.name === 'rest_post_query' ).callbacks;
		expect( query.map( ( c: { callback: string } ) => c.callback ) ).toContainEqual(
			expect.stringMatching( /^closure in plugins\/demo-shop\/demo-shop\.php:\d+$/ )
		);
	} );

	test( 'lists the hooks every request goes through, core ones labelled', async () => {
		const res = await hooks( '/wp/v2/posts' );
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const global: Record< string, any[] > = Object.fromEntries( res.json.global.map( ( h: any ) => [ h.name, h.callbacks ] ) );
		expect( global.rest_pre_dispatch.map( ( c ) => c.callback ) ).toContain( 'Routemark\\Send_As->maybe_switch()' );
		expect( global.rest_post_dispatch ).toContainEqual(
			expect.objectContaining( { callback: 'rest_send_allow_header()', source: { type: 'core', name: 'WordPress' } } )
		);
	} );

	test( 'works out the subject for terms, users and plugin controllers', async () => {
		expect( ( await hooks( '/wp/v2/categories/(?P<id>[\\d]+)' ) ).json.subjects ).toEqual( [ 'category' ] );
		expect( ( await hooks( '/wp/v2/users/me' ) ).json.subjects ).toEqual( [ 'user' ] );
		expect( ( await hooks( '/demo-shop/v1/products' ) ).json.subjects ).toEqual( [ 'post' ] );
		expect( ( await hooks( '/demo-shop/v1/ping' ) ).json.subjects ).toEqual( [] );
	} );

	test( 'only takes registered routes', async () => {
		const unknown = await hooks( '/nope' );
		expect( unknown.status ).toBe( 404 );
		expect( unknown.json.code ).toBe( 'routemark_unknown_route' );
		expect( ( await admin.call( 'GET', '/routemark/v1/hooks' ) ).status ).toBe( 400 );
	} );

	test( 'admins only', async () => {
		expect( ( await editor.call( 'GET', '/routemark/v1/hooks', { query: { route: '/wp/v2/posts' } } ) ).status ).toBe( 403 );
	} );
} );

test.describe( 'server stats', () => {
	const stats = ( headers: Record< string, string > ) => ( headers[ 'x-routemark-stats' ] ? JSON.parse( headers[ 'x-routemark-stats' ] ) : null );

	test( 'come back when asked for', async () => {
		const res = await admin.call( 'GET', '/wp/v2/posts', { headers: { 'X-Routemark-Stats': '1' } } );
		const s = stats( res.headers );
		expect( s ).not.toBeNull();
		expect( s.queries ).toBeGreaterThan( 0 );
		expect( s.queriesTotal ).toBeGreaterThanOrEqual( s.queries );
		expect( s.handlerMs ).toBeGreaterThan( 0 );
		expect( s.totalMs ).toBeGreaterThanOrEqual( s.handlerMs );
		expect( s.peakMemory ).toBeGreaterThan( 1_000_000 );
	} );

	test( 'not without the header, or with any other value', async () => {
		expect( stats( ( await admin.call( 'GET', '/wp/v2/posts' ) ).headers ) ).toBeNull();
		expect( stats( ( await admin.call( 'GET', '/wp/v2/posts', { headers: { 'X-Routemark-Stats': 'yes' } } ) ).headers ) ).toBeNull();
	} );

	test( 'not for an editor', async () => {
		const res = await editor.call( 'GET', '/wp/v2/posts', { headers: { 'X-Routemark-Stats': '1' } } );
		expect( res.status ).toBe( 200 );
		expect( stats( res.headers ) ).toBeNull();
	} );

	test( 'still there when sending as logged out', async () => {
		const nonce = await admin.sendAsNonce();
		const res = await admin.call( 'GET', '/wp/v2/users/me', {
			headers: { 'X-Routemark-Stats': '1', 'X-Routemark-As': '0', 'X-Routemark-Nonce': nonce },
		} );
		expect( res.status ).toBe( 401 );
		expect( res.headers[ 'x-routemark-as' ] ).toBe( '0' );
		expect( stats( res.headers ) ).not.toBeNull();
	} );
} );
