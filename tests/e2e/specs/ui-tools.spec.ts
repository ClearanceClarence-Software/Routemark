import { expect, test, type Page } from '@playwright/test';

import { openRoutemark, Rest, send, watchErrors } from '../helpers';

// 0.4.0: the REST call recorder, the body form, "why was this refused",
// the response table / search / links / pages, Compare, cURL import and
// search by field.

let admin: Rest;
const created: number[] = [];

test.beforeAll( async ( {}, info ) => {
	admin = await Rest.as( 'admin', info.project.use.baseURL! );
	await admin.setSettingsMeta( 'admin', null );
	// Enough posts for more than one page at per_page=1.
	for ( const title of [ 'Paging one', 'Paging two' ] ) {
		const res = await admin.call( 'POST', '/wp/v2/posts', { body: { title, status: 'publish' } } );
		created.push( res.json.id );
	}
} );

test.afterAll( async () => {
	for ( const id of created ) {
		await admin.call( 'DELETE', `/wp/v2/posts/${ id }`, { query: { force: 'true' } } );
	}
	await admin.dispose();
} );

// The REST URL for a path, whatever the permalink setting.
const restUrl = ( page: Page, path: string ) =>
	page.evaluate( ( p ) => {
		const root = new URL( ( window as unknown as { routemarkRecorder: { restRoot: string } } ).routemarkRecorder.restRoot );
		if ( root.searchParams.has( 'rest_route' ) ) {
			root.searchParams.set( 'rest_route', p );
			return root.toString();
		}
		return root.toString().replace( /\/?$/, '' ) + p;
	}, path );

test.describe( 'recorder', () => {
	test( 'records REST calls on another screen, blanks secrets, and opens them in Routemark', async ( { page } ) => {
		const errors = watchErrors( page );
		await page.goto( '/wp-admin/index.php' );
		const bar = page.locator( '#wp-admin-bar-routemark-recorder' );
		await expect( bar ).toContainText( 'REST calls' );
		await bar.hover();
		await page.locator( '#wp-admin-bar-routemark-recorder-toggle > .ab-item' ).click();
		await expect( bar ).toHaveClass( /is-recording/ );
		await expect( bar ).toContainText( 'Recording REST calls (0)' );

		// One through fetch, one through XMLHttpRequest, like jQuery would.
		const types = await restUrl( page, '/wp/v2/types' );
		const submit = await restUrl( page, '/leaky/v1/submit' );
		await page.evaluate( async ( url ) => {
			await fetch( url );
		}, types );
		await page.evaluate(
			( url ) =>
				new Promise( ( done ) => {
					const x = new XMLHttpRequest();
					x.open( 'POST', url );
					x.setRequestHeader( 'Content-Type', 'application/json' );
					x.onloadend = done;
					x.send( JSON.stringify( { message: 'hi', password: 'hunter2' } ) );
				} ),
			submit
		);
		// Not REST, not recorded.
		await page.evaluate( async () => {
			await fetch( '/wp-admin/admin-ajax.php?action=heartbeat' );
		} );
		await expect( bar ).toContainText( 'Recording REST calls (2)' );

		const stored = await page.evaluate( () => JSON.parse( localStorage.getItem( 'routemark.recorder.1' ) ?? 'null' ) );
		expect( stored.calls.map( ( c: { method: string; path: string } ) => `${ c.method } ${ c.path }` ) ).toEqual( [ 'POST /leaky/v1/submit', 'GET /wp/v2/types' ] );
		expect( JSON.parse( stored.calls[ 0 ].body ) ).toEqual( { message: 'hi', password: '' } );
		expect( stored.calls[ 0 ].page ).toBe( '/wp-admin/index.php' );

		// The admin bar's "Open in Routemark" lands on the Recorded list.
		await page.goto( '/wp-admin/tools.php?page=routemark&panel=recorded' );
		const list = page.locator( '.rmk-recorded' );
		await expect( list.locator( '.rmk-recorder-bar' ) ).toContainText( 'Recording' );
		await expect( list.locator( '.rmk-recorded-item' ) ).toHaveCount( 2 );
		await list.locator( '.rmk-recorded-item', { hasText: '/leaky/v1/submit' } ).click();

		await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/leaky/v1/submit' );
		await expect( page.locator( '.rmk-address-method' ) ).toHaveValue( 'POST' );
		await expect( page.locator( '.rmk-main-note' ) ).toContainText( 'Recorded on /wp-admin/index.php' );
		await page.getByRole( 'tab', { name: 'Body' } ).click();
		await page.getByRole( 'button', { name: 'JSON', exact: true } ).click();
		const body = JSON.parse( await page.locator( '.rmk-editor-input' ).inputValue() );
		expect( body ).toEqual( { message: 'hi', password: '' } );

		// Stop and clear from Routemark, and the admin bar follows.
		await page.getByRole( 'tab', { name: 'Recorded' } ).click();
		await list.getByRole( 'button', { name: 'Stop' } ).click();
		await list.getByRole( 'button', { name: 'Clear 2 calls' } ).click();
		await expect( list ).toContainText( 'Nothing recorded yet.' );
		await page.goto( '/wp-admin/index.php' );
		await expect( bar ).not.toHaveClass( /is-recording/ );
		expect( errors ).toEqual( [] );
	} );

	test( 'the admin bar entry can be turned off in Settings', async ( { page } ) => {
		await openRoutemark( page );
		await page.getByRole( 'button', { name: 'Settings', exact: true } ).click();
		await page.locator( '.rmk-setting', { hasText: 'Show "REST calls" in the admin bar' } ).getByRole( 'switch' ).click();
		await expect( page.locator( '.rmk-save-status.is-saved' ) ).toBeVisible();
		await page.goto( '/wp-admin/index.php' );
		await expect( page.locator( '#wp-admin-bar-routemark-recorder' ) ).toHaveCount( 0 );
		await admin.setSettingsMeta( 'admin', null );
	} );
} );

test( 'the body form writes JSON, and flags what WordPress would reject', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await page.selectOption( '.rmk-address-method', 'POST' );
	await page.getByRole( 'tab', { name: 'Body' } ).click();
	await page.locator( '#rmk-field-status' ).selectOption( { label: 'draft' } );
	await page.fill( '#rmk-field-title', 'From the form' );
	await page.fill( '#rmk-field-categories', '1, 2' );
	await page.getByRole( 'button', { name: 'JSON', exact: true } ).click();
	expect( JSON.parse( await page.locator( '.rmk-editor-input' ).inputValue() ) ).toEqual( { status: 'draft', title: 'From the form', categories: [ 1, 2 ] } );

	// Back in the form, a field set in JSON shows up, and Clear removes it.
	await page.locator( '.rmk-editor-input' ).fill( '{"status":"draft","sticky":true}' );
	await page.getByRole( 'button', { name: 'Form', exact: true } ).click();
	await expect( page.locator( '#rmk-field-sticky' ) ).toHaveValue( 'true' );
	await page.locator( '.rmk-field', { has: page.locator( '#rmk-field-sticky' ) } ).getByRole( 'button', { name: 'Clear' } ).click();
	await page.getByRole( 'button', { name: 'JSON', exact: true } ).click();
	expect( JSON.parse( await page.locator( '.rmk-editor-input' ).inputValue() ) ).toEqual( { status: 'draft' } );

	// Users need username, email and password.
	await openRoutemark( page, '/wp/v2/users' );
	await page.selectOption( '.rmk-address-method', 'POST' );
	await page.getByRole( 'tab', { name: 'Body' } ).click();
	await page.getByRole( 'button', { name: 'JSON', exact: true } ).click();
	await page.locator( '.rmk-editor-input' ).fill( '{}' );
	await expect( page.locator( '.rmk-address-notes' ) ).toContainText( 'WordPress will likely reject these fields as they are: email, password, username.' );
	await page.getByRole( 'button', { name: 'Form', exact: true } ).click();
	await expect( page.locator( '.rmk-field.has-error', { has: page.locator( '#rmk-field-username' ) } ) ).toContainText( 'Required.' );
} );

test( 'a refused request says which check refused it, and can go again as you', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/settings' );
	await page.locator( '.rmk-sendas-toggle' ).click();
	await page.locator( '.rmk-sendas-option', { hasText: 'Sam Subscriber' } ).click();
	await send( page );
	await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '403' );
	const help = page.locator( '.rmk-denied' );
	await expect( help ).toContainText( 'WP_REST_Settings_Controller->get_item_permissions_check()' );
	await expect( help ).toContainText( 'class-wp-rest-settings-controller.php:' );
	await expect( help.locator( '.rmk-denied-caps .lacks' ) ).toHaveText( 'manage_options' );

	await help.getByRole( 'button', { name: 'Send it again as you' } ).click();
	await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '200' );
	await expect( page.locator( '.rmk-sendas-toggle' ) ).toContainText( 'You' );
	await expect( page.locator( '.rmk-denied' ) ).toHaveCount( 0 );
} );

test( 'lists get a table, the body can be searched, and REST links open in Routemark', async ( { page } ) => {
	const errors = watchErrors( page );
	await openRoutemark( page, '/wp/v2/users' );
	await send( page );
	await page.getByRole( 'tab', { name: 'Table' } ).click();
	const table = page.locator( '.rmk-table--data' );
	await expect( table.locator( 'th' ).first() ).toHaveText( 'id' );
	await expect( table ).toContainText( 'Jane Editor' );

	await page.fill( '.rmk-response-search input', 'jane' );
	await expect( table.locator( 'tbody tr' ) ).toHaveCount( 1 );
	await table.getByRole( 'button', { name: 'Open' } ).click();
	await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/wp/v2/users/{id}' );
	await expect( page.locator( '.rmk-pathparam input' ) ).not.toHaveValue( '' );

	await send( page );
	await page.fill( '.rmk-response-search input', 'editor' );
	await expect( page.locator( '.rmk-response-search' ) ).toContainText( /\d+ match/ );
	await expect( page.locator( '.rmk-json mark' ).first() ).toHaveText( /editor/i );
	await page.fill( '.rmk-response-search input', '' );

	// _links point back into the API. Clicking one opens that route.
	await page.getByRole( 'button', { name: 'Expand all' } ).click();
	await page.locator( '.rmk-j-link' ).filter( { hasText: '/wp/v2/users' } ).first().click();
	await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/wp/v2/users' );
	expect( errors ).toEqual( [] );
} );

test( 'Next and Previous move through the pages', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await page.locator( '.rmk-kv-row' ).filter( { has: page.locator( 'code.rmk-kv-name', { hasText: /^per_page$/ } ) } ).locator( '.rmk-kv-value input' ).fill( '1' );
	await send( page );
	const pager = page.locator( '.rmk-pager' );
	await expect( pager ).toContainText( /Page 1 of \d+/ );
	await pager.getByRole( 'button', { name: 'Next' } ).click();
	await expect( pager ).toContainText( /Page 2 of \d+/ );
	await expect( page.locator( '.rmk-address-path' ) ).toContainText( 'page=2' );
	await pager.getByRole( 'button', { name: 'Previous' } ).click();
	await expect( pager ).toContainText( /Page 1 of \d+/ );
} );

test( 'Compare sends the same GET as someone else and marks what differs', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/users/me' );
	await send( page );
	await page.locator( '.rmk-sendas-toggle--inline' ).click();
	await page.fill( '.rmk-sendas--inline .rmk-sendas-search', 'jane' );
	await page.locator( '.rmk-sendas--inline .rmk-sendas-option', { hasText: 'Jane Editor' } ).click();
	const compare = page.locator( '.rmk-compare' );
	await expect( compare.locator( '.rmk-compare-head' ) ).toHaveText( [ /You.*200/, /Jane Editor.*200/ ] );
	await expect( compare.locator( '.rmk-response-bar' ) ).toContainText( /\d+ lines differ/ );
	await expect( compare.locator( '.rmk-compare-line.is-only-b' ).first() ).toBeVisible();
	await compare.getByRole( 'button', { name: 'Close' } ).click();
	await expect( page.locator( '.rmk-compare' ) ).toHaveCount( 0 );

	// Not offered for writes, which would run twice.
	await openRoutemark( page, '/leaky/v1/submit' );
	await send( page );
	await expect( page.locator( '.rmk-sendas-toggle--inline' ) ).toHaveCount( 0 );
} );

test( 'a cURL command from another site opens as the matching route here', async ( { page } ) => {
	await openRoutemark( page );
	await page.getByRole( 'button', { name: 'Import', exact: true } ).click();
	const dialog = page.getByRole( 'dialog', { name: 'Import a cURL command' } );
	await dialog.locator( 'textarea' ).fill( "curl 'https://example.com/not-the-api/'" );
	await dialog.getByRole( 'button', { name: 'Import' } ).click();
	await expect( dialog ).toContainText( "isn't a REST API URL" );

	await dialog.locator( 'textarea' ).fill(
		`curl -X POST 'https://staging.example.com/wp-json/wp/v2/posts/12?context=edit' \\\n  -H 'Authorization: Bearer abc' \\\n  -H 'X-Trace: 7' \\\n  --data-raw '{"title":"From curl"}'`
	);
	await dialog.getByRole( 'button', { name: 'Import' } ).click();
	await expect( dialog ).toHaveCount( 0 );
	await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/wp/v2/posts/{id}' );
	await expect( page.locator( '.rmk-address-method' ) ).toHaveValue( 'POST' );
	await expect( page.locator( '.rmk-address-path' ) ).toContainText( '/wp/v2/posts/12?context=edit' );
	await expect( page.locator( '.rmk-main-note' ) ).toContainText( 'Left out these headers' );
	await expect( page.locator( '.rmk-main-note' ) ).toContainText( 'Authorization' );
	await page.getByRole( 'tab', { name: 'Headers' } ).click();
	await expect( page.locator( '.rmk-tab-panel input[value="X-Trace"]' ) ).toHaveCount( 1 );
} );

test( 'Fields searches what routes accept and return', async ( { page } ) => {
	await openRoutemark( page );
	await page.locator( '.rmk-chip--fields' ).click();
	await page.fill( '.rmk-search-input', 'author_email' );
	const comments = page.locator( '.rmk-route', { hasText: /^\/comments/ } ).first();
	await expect( comments ).toBeVisible();
	await expect( comments.locator( '.rmk-route-fields code' ) ).toContainText( [ 'author_email' ] );
	await expect( page.locator( '.rmk-route', { hasText: '/settings' } ) ).toHaveCount( 0 );
} );
