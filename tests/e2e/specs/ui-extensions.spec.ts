import { expect, test } from '@playwright/test';

import { openRoutemark, send, watchErrors } from '../helpers';

// The extension points, through the example add-on in
// tests/e2e/fixtures/plugins/routemark-example-addon.

test( 'PHP side: app data filter and API version reach the page', async ( { page } ) => {
	await openRoutemark( page );
	const data = await page.evaluate( () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const w = window as any;
		return {
			settings: w.routemarkSettings,
			global: { version: w.routemark?.version, apiVersion: w.routemark?.apiVersion, ui: Object.keys( w.routemark?.ui ?? {} ) },
		};
	} );
	expect( data.settings.exampleAddon ).toEqual( { greeting: 'Hello from PHP' } );
	expect( data.settings.apiVersion ).toBe( 1 );
	expect( data.global.apiVersion ).toBe( 1 );
	expect( data.global.ui ).toEqual( expect.arrayContaining( [ 'Icon', 'Method', 'PathText', 'JsonView', 'CopyButton', 'Toggle' ] ) );
} );

test( 'a panel gets a top bar button, the app context, and can open a route', async ( { page } ) => {
	const errors = watchErrors( page );
	await openRoutemark( page );
	await page.getByRole( 'button', { name: 'Example', exact: true } ).click();
	const panel = page.locator( '.example-panel' );
	await expect( panel ).toContainText( 'Example panel' );
	await expect( panel ).toContainText( /\d+ routes\. Hello from PHP/ );
	await expect( panel.locator( '.rmk-method' ) ).toHaveText( 'GET' ); // our component, reused

	await panel.getByRole( 'button', { name: 'Open users/me logged out' } ).click();
	await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/wp/v2/users/me' );
	await expect( page.locator( '.rmk-sendas-toggle' ) ).toContainText( 'Logged out' );
	expect( errors ).toEqual( [] );
} );

test( 'workspace tab gets the request context, including the last response', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await page.getByRole( 'tab', { name: 'Example' } ).click();
	await expect( page.locator( '.example-tab' ) ).toHaveText( 'Route /wp/v2/posts, path /wp/v2/posts, last status none' );
	await send( page );
	await expect( page.locator( '.example-tab' ) ).toHaveText( 'Route /wp/v2/posts, path /wp/v2/posts, last status 200' );
} );

test( 'a tab that throws shows an error and the rest keeps working', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await page.getByRole( 'tab', { name: 'Broken' } ).click();
	await expect( page.locator( '.rmk-extension-error' ) ).toContainText( 'Broken stopped working' );
	await expect( page.locator( '.rmk-extension-error' ) ).toContainText( 'broken on purpose' );
	// Still usable.
	await page.getByRole( 'tab', { name: 'Docs' } ).click();
	await expect( page.locator( '.rmk-tab-panel' ) ).toContainText( 'Arguments' );
	await send( page );
	await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '200' );
} );

test( 'a filter added after the first render still shows up', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await page.getByRole( 'tab', { name: 'Late' } ).click();
	await expect( page.locator( '.example-late' ) ).toHaveText( 'Late tab' );
} );

test( 'response action, requestSent and extra snippet language', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/users/me' );
	await send( page );
	await expect.poll( () => page.evaluate( () => ( window as unknown as { routemarkExample: { sent: number[] } } ).routemarkExample.sent ) ).toEqual( [ 200 ] );

	await page.getByRole( 'button', { name: 'Remember status' } ).click();
	expect( await page.evaluate( () => ( window as unknown as { routemarkExample: { action: number } } ).routemarkExample.action ) ).toBe( 200 );

	await page.getByRole( 'tab', { name: 'Code' } ).click();
	await page.getByRole( 'button', { name: 'HTTPie' } ).click();
	await expect( page.locator( '.rmk-codebox' ) ).toHaveText( /^http GET '.+users\/me'$/ );
} );

test( 'add-on findings show up in the Report', async ( { page } ) => {
	await openRoutemark( page );
	await page.getByRole( 'button', { name: 'Report', exact: true } ).click();
	const finding = page.locator( '.rmk-finding', { hasText: 'Example finding' } );
	await expect( finding ).toContainText( 'Added by the example add-on.' );
	await expect( finding.locator( '.rmk-sev' ) ).toHaveText( 'Low' );
} );
