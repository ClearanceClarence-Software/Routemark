import { expect, test } from '@playwright/test';

import { Rest } from '../helpers';

// routemark/v1/routes and routemark/v1/settings: who can call them, what the
// route list says about each route, and how settings are validated and stored.

let admin: Rest;
let editor: Rest;
let anon: Rest;

test.beforeAll( async ( {}, info ) => {
	const baseURL = info.project.use.baseURL!;
	admin = await Rest.as( 'admin', baseURL );
	editor = await Rest.as( 'jane', baseURL );
	anon = await Rest.as( null, baseURL );
} );

test.afterAll( async () => {
	await admin.setSettingsMeta( 'admin', null );
	await Promise.all( [ admin.dispose(), editor.dispose(), anon.dispose() ] );
} );

test.describe( 'access', () => {
	test( 'logged out gets 401 on every Routemark endpoint', async () => {
		expect( ( await anon.call( 'GET', '/routemark/v1/routes' ) ).status ).toBe( 401 );
		expect( ( await anon.call( 'GET', '/routemark/v1/settings' ) ).status ).toBe( 401 );
		expect( ( await anon.call( 'POST', '/routemark/v1/settings', { body: { theme: 'dark' } } ) ).status ).toBe( 401 );
		expect( ( await anon.call( 'GET', '/routemark/v1/users' ) ).status ).toBe( 401 );
		expect( ( await anon.call( 'GET', '/routemark/v1/hooks', { query: { route: '/wp/v2/posts' } } ) ).status ).toBe( 401 );
	} );

	test( 'an editor gets 403', async () => {
		expect( ( await editor.call( 'GET', '/routemark/v1/routes' ) ).status ).toBe( 403 );
		expect( ( await editor.call( 'GET', '/routemark/v1/settings' ) ).status ).toBe( 403 );
	} );

	test( "Routemark's routes aren't in the public /wp-json/ index", async () => {
		const index = await anon.call( 'GET', '/' );
		const listed = Object.keys( index.json.routes ).filter( ( r ) => r.startsWith( '/routemark/v1/' ) );
		expect( listed ).toEqual( [] );
	} );
} );

test.describe( 'route list', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let byRoute: Record< string, any >;

	test.beforeAll( async () => {
		const res = await admin.call( 'GET', '/routemark/v1/routes' );
		expect( res.status ).toBe( 200 );
		byRoute = Object.fromEntries( res.json.routes.map( ( r: { route: string } ) => [ r.route, r ] ) );
	} );

	test( 'has the whole route table', () => {
		expect( Object.keys( byRoute ).length ).toBeGreaterThan( 50 );
		expect( byRoute[ '/wp/v2/posts' ].endpoints[ 0 ].args.per_page.type ).toBe( 'integer' );
	} );

	test( 'credits each route to whoever registered it', () => {
		expect( byRoute[ '/wp/v2/posts' ].source ).toEqual( { type: 'core', name: 'WordPress' } );
		// A controller that extends core's still counts as the plugin's.
		expect( byRoute[ '/demo-shop/v1/products' ].source.name ).toBe( 'Demo Shop' );
		// So does a closure.
		expect( byRoute[ '/demo-shop/v1/ping' ].source.name ).toBe( 'Demo Shop' );
		expect( byRoute[ '/tweaks/v1/hello' ].source.type ).toBe( 'mu-plugin' );
		expect( byRoute[ '/routemark/v1/routes' ].source.name ).toBe( 'Routemark' );
	} );

	test( 'tags how each endpoint checks permission', () => {
		const e = ( route: string ) => byRoute[ route ].endpoints[ 0 ];
		expect( e( '/leaky/v1/submit' ).permission ).toBe( 'missing' );
		expect( e( '/leaky/v1/submit' ).isPublic ).toBe( true );
		expect( e( '/leaky/v1/stats' ).permission ).toBe( 'missing' );
		expect( e( '/leaky/v1/subscribe' ).permission ).toBe( 'open' );
		expect( e( '/demo-shop/v1/ping' ).permission ).toBe( 'open' );
		expect( e( '/tweaks/v1/hello' ).permission ).toBe( 'check' );
		expect( e( '/tweaks/v1/hello' ).isPublic ).toBe( false );
	} );

	test( "core's own index routes and batch aren't reported as missing a check", () => {
		const e = ( route: string ) => byRoute[ route ].endpoints[ 0 ];
		expect( e( '/' ).permission ).toBe( 'open' );
		expect( e( '/leaky/v1' ).permission ).toBe( 'open' );
		expect( e( '/batch/v1' ).permission ).toBe( 'check' );
		const coreMissing = Object.values( byRoute )
			.filter( ( r ) => r.source?.type === 'core' )
			.filter( ( r ) => r.endpoints.some( ( ep: { permission: string } ) => ep.permission === 'missing' ) )
			.map( ( r ) => r.route );
		expect( coreMissing ).toEqual( [] );
	} );

	test( 'lists arguments nothing checks, and only those', () => {
		const args = ( route: string ) => byRoute[ route ].endpoints.flatMap( ( ep: { uncheckedArgs: string[] } ) => ep.uncheckedArgs );
		expect( args( '/leaky/v1/submit' ) ).toEqual( [ 'message' ] );
		expect( args( '/leaky/v1/subscribe' ) ).toEqual( [] ); // typed
		expect( args( '/leaky/v1/search' ) ).toEqual( [ 'q' ] ); // page is typed with a null callback, on purpose
		// Core's post controller sets title/content callbacks to null on purpose. Not flagged,
		// and neither is a plugin that extends it.
		expect( args( '/wp/v2/posts' ) ).toEqual( [] );
		expect( args( '/demo-shop/v1/products' ) ).toEqual( [] );
	} );

	test( "Routemark's own routes have a schema", () => {
		for ( const r of [ '/routemark/v1/routes', '/routemark/v1/settings', '/routemark/v1/users', '/routemark/v1/hooks' ] ) {
			expect( byRoute[ r ].schema, r ).not.toBeNull();
		}
	} );
} );

test.describe( 'settings', () => {
	test.describe.configure( { mode: 'serial' } );

	test.beforeAll( async () => {
		await admin.setSettingsMeta( 'admin', null );
	} );

	test( 'start from defaults', async () => {
		const res = await admin.call( 'GET', '/routemark/v1/settings' );
		expect( res.status ).toBe( 200 );
		expect( res.json ).toMatchObject( { theme: 'light', keepHistory: true, historySize: 40, confirmWrites: 'delete' } );
	} );

	test( 'saving only changes the keys you send', async () => {
		const res = await admin.call( 'POST', '/routemark/v1/settings', { body: { theme: 'dark', historySize: 100 } } );
		expect( res.status ).toBe( 200 );
		expect( res.json ).toMatchObject( { theme: 'dark', historySize: 100, confirmWrites: 'delete' } );
	} );

	test( 'rejects values outside the schema', async () => {
		expect( ( await admin.call( 'POST', '/routemark/v1/settings', { body: { historySize: 5000 } } ) ).status ).toBe( 400 );
		expect( ( await admin.call( 'POST', '/routemark/v1/settings', { body: { theme: '<script>' } } ) ).status ).toBe( 400 );
		expect(
			( await admin.call( 'POST', '/routemark/v1/settings', { body: { hiddenNamespaces: [ 'wc/v3', '"><img src=x>' ] } } ) ).status
		).toBe( 400 );
	} );

	test( 'dedupes hidden namespaces and ignores unknown keys', async () => {
		const res = await admin.call( 'POST', '/routemark/v1/settings', {
			body: { hiddenNamespaces: [ 'oembed/1.0', 'oembed/1.0', '' ], evil: 'x' },
		} );
		expect( res.status ).toBe( 200 );
		expect( res.json.hiddenNamespaces ).toEqual( [ 'oembed/1.0', '' ] );
		expect( res.json ).not.toHaveProperty( 'evil' );
	} );

	test( 'invalid values in the database fall back to defaults', async () => {
		await admin.setSettingsMeta( 'admin', { theme: 'purple', historySize: -3, jsonDepth: 4 } );
		const res = await admin.call( 'GET', '/routemark/v1/settings' );
		expect( res.json ).toMatchObject( { theme: 'light', historySize: 40, jsonDepth: 4 } );
	} );

	test( 'are kept per user', async ( {}, info ) => {
		await admin.call( 'POST', '/routemark/v1/settings', { body: { theme: 'dark' } } );
		await admin.setSettingsMeta( 'admin2', null );
		const admin2 = await Rest.as( 'admin2', info.project.use.baseURL! );
		expect( ( await admin2.call( 'GET', '/routemark/v1/settings' ) ).json.theme ).toBe( 'light' );
		expect( ( await admin.call( 'GET', '/routemark/v1/settings' ) ).json.theme ).toBe( 'dark' );
		await admin2.dispose();
	} );
} );
