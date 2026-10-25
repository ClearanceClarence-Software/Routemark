import { expect, test } from '@playwright/test';

import { openRoutemark, send, watchErrors } from '../helpers';

// The Send as picker under the address bar.

test( 'starts as you, lists the options, closes on Escape', async ( { page } ) => {
	const errors = watchErrors( page );
	await openRoutemark( page, '/wp/v2/users/me' );
	await expect( page.locator( '.rmk-sendas-toggle' ) ).toContainText( 'You' );

	await page.locator( '.rmk-sendas-toggle' ).click();
	const options = page.locator( '.rmk-sendas-option' );
	await expect( options.first() ).toContainText( 'You' );
	await expect( options.nth( 1 ) ).toContainText( 'Logged out' );
	await expect( page.locator( '.rmk-sendas-option', { hasText: 'Subscriber' } ) ).toHaveCount( 1 );
	await expect( page.locator( '.rmk-sendas-search' ) ).toBeFocused();

	await page.keyboard.press( 'Escape' );
	await expect( page.locator( '.rmk-sendas-menu' ) ).toHaveCount( 0 );
	expect( errors ).toEqual( [] );
} );

test( 'sends as a picked user and shows it everywhere', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/users/me' );
	await page.locator( '.rmk-sendas-toggle' ).click();
	await page.fill( '.rmk-sendas-search', 'jane' );
	await page.locator( '.rmk-sendas-option', { hasText: 'Jane Editor' } ).click();

	await expect( page.locator( '.rmk-sendas-toggle' ) ).toContainText( 'Jane Editor' );
	await expect( page.locator( '.rmk-sendas.is-switched' ) ).toBeVisible();

	await send( page );
	await expect( page.locator( '.rmk-response-bar' ) ).toContainText( 'as Jane Editor' );
	await expect( page.locator( '.rmk-response-body' ) ).toContainText( '"jane"' );

	// The choice follows you to other routes.
	await page.goto( '/wp-admin/tools.php?page=routemark#/wp/v2/settings' );
	await expect( page.locator( '.rmk-ws-title' ) ).toContainText( '/wp/v2/settings' );
	await expect( page.locator( '.rmk-sendas-toggle' ) ).toContainText( 'Jane Editor' );
	await send( page );
	await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '403' );

	// Logged out
	await page.locator( '.rmk-sendas-toggle' ).click();
	await page.locator( '.rmk-sendas-option', { hasText: 'Logged out' } ).click();
	await send( page );
	await expect( page.locator( '.rmk-status strong' ) ).toHaveText( '401' );

	// History tags who each one ran as.
	await page.getByRole( 'tab', { name: 'History' } ).click();
	await expect( page.locator( '.rmk-history-as' ).first() ).toHaveText( 'Logged out' );
	await expect( page.locator( '.rmk-history-as' ).nth( 1 ) ).toHaveText( 'Jane Editor' );

	await page.getByRole( 'button', { name: 'Back to you' } ).click();
	await expect( page.locator( '.rmk-sendas.is-switched' ) ).toHaveCount( 0 );
} );

test( 'a reload always puts you back to yourself', async ( { page } ) => {
	await openRoutemark( page, '/wp/v2/users/me' );
	await page.locator( '.rmk-sendas-toggle' ).click();
	await page.locator( '.rmk-sendas-option', { hasText: 'Sam' } ).click();
	await expect( page.locator( '.rmk-sendas.is-switched' ) ).toBeVisible();
	await page.reload();
	await page.waitForSelector( '.rmk-sendas' );
	await expect( page.locator( '.rmk-sendas.is-switched' ) ).toHaveCount( 0 );
} );
