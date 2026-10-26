import { expect, test } from '@playwright/test';

import { openRoutemark, send, watchErrors } from '../helpers';

// The Report screen and the Hooks tab.

test.describe( 'report', () => {
	test.use( { permissions: [ 'clipboard-read', 'clipboard-write' ] } );

	test.beforeEach( async ( { page } ) => {
		await openRoutemark( page );
		await page.getByRole( 'button', { name: 'Report', exact: true } ).click();
		await page.waitForSelector( '.rmk-report' );
	} );

	test( 'puts the leaky plugin first and finds each problem', async ( { page } ) => {
		const errors = watchErrors( page );
		const groups = page.locator( '.rmk-report-group .rmk-section-title' );
		await expect( groups.first() ).toContainText( 'Leaky Forms' );
		// Group titles are "<name>\n<count>".
		const names = ( await groups.allInnerTexts() ).map( ( t ) => t.split( '\n' )[ 0 ].trim() );
		expect( names ).not.toContain( 'WordPress' );
		// Routemark doesn't flag itself (the test setup plugin is a different plugin).
		expect( names ).not.toContain( 'Routemark' );

		const leaky = page.locator( '.rmk-report-group' ).first();
		const titles = await leaky.locator( '.rmk-finding-title' ).allInnerTexts();
		expect( titles ).toEqual( expect.arrayContaining( [ 'No permission check', 'Anyone can change data', 'Unchecked argument', 'No schema' ] ) );
		// /item/{id}'s path param is checked by the route regex.
		await expect( leaky ).not.toContainText( 'id: no type' );
		expect( errors ).toEqual( [] );
	} );

	test( 'counts by level and filters on click', async ( { page } ) => {
		const high = page.locator( '.rmk-report-stat', { hasText: 'High' } );
		await expect( high.locator( 'strong' ) ).toHaveText( '2' );
		await high.click();
		await expect( page.locator( '.rmk-finding' ) ).toHaveCount( 2 );
		await high.click();
		await expect( page.locator( '.rmk-finding' ) ).not.toHaveCount( 2 );
	} );

	test( 'core is left out until you switch it on', async ( { page } ) => {
		await page.locator( '.rmk-report-core .rmk-switch' ).click();
		await expect( page.locator( '.rmk-report-group .rmk-section-title', { hasText: 'WordPress' } ) ).toHaveCount( 1 );
	} );

	test( 'copies as text', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Copy as text' } ).click();
		const text = await page.evaluate( () => navigator.clipboard.readText() );
		expect( text ).toMatch( /^Routemark report for / );
		expect( text ).toContain( '## Leaky Forms' );
		expect( text ).toContain( '[High] POST /leaky/v1/submit: No permission check.' );
	} );

	test( '"Open as logged out" lands on the route, switched, ready to send', async ( { page } ) => {
		await page.locator( '.rmk-finding', { hasText: '/submit' } ).first().getByRole( 'button', { name: 'Open as logged out' } ).click();
		await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/leaky/v1/submit' );
		await expect( page.locator( '.rmk-sendas-toggle' ) ).toContainText( 'Logged out' );
		await expect( page.locator( '.rmk-ws-badges .rmk-badge--danger' ) ).toContainText( 'No permission check' );

		await page.getByRole( 'tab', { name: 'Body' } ).click();
		await page.getByRole( 'button', { name: 'JSON', exact: true } ).click();
		await page.locator( '.rmk-tab-panel textarea' ).fill( '{"message": "hi"}' );
		await send( page );
		// No permission check, so a visitor really can post to it.
		await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '200' );
	} );
} );

test.describe( 'hooks tab', () => {
	test( 'shows the plugin filters on /wp/v2/posts', async ( { page } ) => {
		const errors = watchErrors( page );
		await openRoutemark( page, '/wp/v2/posts' );
		await page.getByRole( 'tab', { name: 'Hooks' } ).click();
		const panel = page.locator( '.rmk-tab-panel' );
		await expect( panel ).toContainText( 'For post' );

		const price = page.locator( '.rmk-hook-list li', { hasText: 'demo_shop_price()' } );
		await expect( price ).toContainText( 'Demo Shop' );
		await expect( price.locator( '.rmk-hook-priority' ) ).toHaveText( '20' );
		await expect( page.locator( '.rmk-hook-callback', { hasText: /closure in plugins\/demo-shop/ } ) ).toHaveCount( 1 );

		// Core and Routemark's own callbacks stay hidden until you ask.
		await expect( page.locator( '.rmk-hook-list li.is-core' ) ).toHaveCount( 0 );
		await expect( page.locator( '.rmk-hook-callback', { hasText: 'Routemark\\' } ) ).toHaveCount( 0 );
		await panel.locator( '.rmk-switch' ).click();
		await expect( page.locator( '.rmk-hook-list li.is-core' ).first() ).toBeVisible();
		// PHP_INT_MAX shows as "last", not a 19-digit number.
		await expect( page.locator( '.rmk-hook-list li', { hasText: 'Request_Stats->finish()' } ).locator( '.rmk-hook-priority' ) ).toHaveText(
			'last'
		);
		expect( errors ).toEqual( [] );
	} );

	test( "explains when a route has no per-object hooks", async ( { page } ) => {
		await openRoutemark( page, '/demo-shop/v1/ping' );
		await page.getByRole( 'tab', { name: 'Hooks' } ).click();
		await expect( page.locator( '.rmk-tab-panel' ) ).toContainText( "isn't one of core's" );
	} );
} );
