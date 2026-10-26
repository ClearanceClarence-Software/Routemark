import { expect, test } from '@playwright/test';

import { openRoutemark, Rest, send, useTheme, watchErrors } from '../helpers';

// The main screen, settings, confirm-before-DELETE and history.

test.use( { colorScheme: 'dark' } );

test.beforeEach( async ( {}, info ) => {
	const admin = await Rest.as( 'admin', info.project.use.baseURL! );
	await admin.setSettingsMeta( 'admin', null );
	await admin.dispose();
} );

test.afterAll( async ( {}, info ) => {
	const admin = await Rest.as( 'admin', info.project.use.baseURL! );
	await admin.setSettingsMeta( 'admin', null );
	await admin.dispose();
} );

test( 'opens in the light theme even when the OS is dark', async ( { page } ) => {
	const errors = watchErrors( page );
	await openRoutemark( page );
	await expect( page.locator( '.rmk' ) ).toHaveAttribute( 'data-theme', 'light' );
	expect( errors ).toEqual( [] );
} );

test( 'overview shows which plugin added each namespace', async ( { page } ) => {
	await openRoutemark( page );
	await expect( page.locator( '.rmk-ns-source', { hasText: 'Demo Shop' } ) ).toHaveCount( 1 );
	// Open-to-everyone list: __return_true and no permission check both count,
	// namespace index routes don't.
	const open = page.locator( '.rmk-openlist' );
	await expect( open ).toContainText( '/stats' );
	await expect( open ).toContainText( '/submit' );
} );

test( 'the filter matches plugin names', async ( { page } ) => {
	await openRoutemark( page );
	await page.fill( '.rmk-search-input', 'demo shop' );
	await expect( page.locator( '.rmk-group-name' ) ).toHaveText( [ 'demo-shop/v1' ] );
} );

test( 'settings save and survive a reload', async ( { page } ) => {
	await openRoutemark( page );
	await page.getByRole( 'button', { name: 'Settings', exact: true } ).click();
	const settings = page.locator( '.rmk-settings' );

	await settings.getByRole( 'button', { name: 'Dark' } ).click();
	await expect( page.locator( '.rmk-save-status.is-saved' ) ).toBeVisible();
	await page.locator( 'label.rmk-ns-check', { hasText: 'oembed/1.0' } ).locator( 'input' ).check();
	await expect( page.locator( '.rmk-save-status.is-saved' ) ).toBeVisible();

	await page.reload();
	await page.waitForSelector( '.rmk-overview' );
	await expect( page.locator( '.rmk' ) ).toHaveAttribute( 'data-theme', 'dark' );
	expect( await page.locator( '.rmk-group-name' ).allInnerTexts() ).not.toContain( 'oembed/1.0' );
	// Still in the overview, with a "hidden" tag.
	await expect( page.locator( '.rmk-hidden-tag' ) ).toHaveCount( 1 );
} );

test( 'DELETE needs a second click', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts/(?P<id>[\\d]+)' );
	await page.locator( '.rmk-pathparam input' ).fill( '999999' );
	await page.selectOption( '.rmk-address-method', 'DELETE' );

	await page.keyboard.press( 'Control+Enter' );
	await expect( page.locator( '.rmk-btn--primary.is-armed' ) ).toBeVisible();
	await expect( page.locator( '.rmk-response-bar' ) ).toHaveCount( 0 );

	await page.locator( '.rmk-btn--primary' ).click();
	await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '404' );
} );

test( 'a GET shows status, server numbers and the JSON', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await send( page );
	await expect( page.locator( '.rmk-status--2xx' ) ).toBeVisible();
	const server = page.locator( '.rmk-response-server' );
	await expect( server ).toContainText( /\d+ quer(y|ies)/ );
	await expect( server ).toContainText( /PHP \d+ ms/ );
	await expect( server ).toContainText( 'MB' );
	// Demo Shop adds this to every post.
	await expect( page.locator( '.rmk-response-body' ) ).toContainText( '"price"' );
} );

test( 'history records requests and can be turned off', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/posts' );
	await send( page );
	await page.getByRole( 'tab', { name: 'History' } ).click();
	await expect( page.locator( '.rmk-history-item' ) ).not.toHaveCount( 0 );

	await page.getByRole( 'button', { name: 'Settings', exact: true } ).click();
	await page.locator( '.rmk-setting', { hasText: 'Keep request history' } ).getByRole( 'switch' ).click();
	await expect( page.locator( '.rmk-save-status.is-saved' ) ).toBeVisible();
	await expect( page.locator( '.rmk-settings' ) ).toContainText( '0 requests' );
} );

test( 'the theme button switches and saves', async ( { page } ) => {
	await openRoutemark( page );
	await useTheme( page, 'dark' );
	await page.reload();
	await page.waitForSelector( '.rmk-overview' );
	await expect( page.locator( '.rmk' ) ).toHaveAttribute( 'data-theme', 'dark' );
} );

test( 'without Pro: a "Get Pro" link on the Plugins screen and a card at the bottom of Settings', async ( { page } ) => {
	await openRoutemark( page );
	const url = await page.evaluate( () => ( window as unknown as { routemarkSettings?: { getPro?: string } } ).routemarkSettings?.getPro ?? '' );
	expect( url ).toMatch( /^https:\/\// );

	await page.getByRole( 'button', { name: 'Settings', exact: true } ).click();
	const card = page.locator( '.rmk-pro-card' );
	await expect( card ).toContainText( 'Export to OpenAPI 3.1, Postman and TypeScript' );
	await expect( card.getByRole( 'link', { name: 'See Routemark Pro' } ) ).toHaveAttribute( 'href', url );

	await page.goto( '/wp-admin/plugins.php' );
	const link = page.locator( 'tr[data-slug="routemark"] .routemark-get-pro' );
	await expect( link ).toHaveText( 'Get Pro' );
	await expect( link ).toHaveAttribute( 'href', url );
	await expect( link ).toHaveAttribute( 'target', '_blank' );
} );

test( 'the launch offer: code, a checkout link with the coupon, gone after the end date', async ( { page } ) => {
	await openRoutemark( page );
	await page.getByRole( 'button', { name: 'Settings', exact: true } ).click();
	const offer = page.locator( '.rmk-pro-card .rmk-pro-offer' );
	await expect( offer ).toContainText( 'first 100 buyers' );
	await expect( offer.locator( 'code' ) ).toHaveText( 'EARLY50' );
	const href = await offer.getByRole( 'link', { name: 'Claim 50% off' } ).getAttribute( 'href' );
	const url = new URL( href! );
	expect( url.searchParams.get( 'coupon' ) ).toBe( 'EARLY50' );
	expect( url.searchParams.get( 'licenses' ) ).toBe( 'unlimited' );
	expect( url.searchParams.get( 'billing_cycle' ) ).toBe( 'lifetime' );

	await page.goto( '/wp-admin/tools.php?page=routemark&routemark_test_offer=ended' );
	await page.waitForSelector( '.rmk-overview' );
	await page.getByRole( 'button', { name: 'Settings', exact: true } ).click();
	await expect( page.locator( '.rmk-pro-card' ) ).toBeVisible();
	await expect( page.locator( '.rmk-pro-offer' ) ).toHaveCount( 0 );
} );
