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
