import { expect, test } from '@playwright/test';

import { Rest } from '../helpers';

// GET routemark/v1/permission (the "why was this refused?" lookup) and the
// Site Health check for write routes anyone can call.

let admin: Rest;
let editor: Rest;
let ids: Record< string, number >;

test.beforeAll( async ( {}, info ) => {
	admin = await Rest.as( 'admin', info.project.use.baseURL! );
	editor = await Rest.as( 'jane', info.project.use.baseURL! );
	ids = await admin.userIds();
} );

test.afterAll( async () => {
	await admin.dispose();
	await editor.dispose();
} );

const explain = ( who: Rest, route: string, method = 'GET', user?: number ) =>
	who.call( 'GET', '/routemark/v1/permission', { query: { route, method, ...( user !== undefined ? { user: String( user ) } : {} ) } } );

test( "names a core check, where it lives, and what the user lacks", async () => {
	const res = await explain( admin, '/wp/v2/settings', 'GET', ids.sam );
	expect( res.status ).toBe( 200 );
	expect( res.json.permission ).toBe( 'check' );
	expect( res.json.callback.name ).toBe( 'WP_REST_Settings_Controller->get_item_permissions_check()' );
	expect( res.json.callback.file ).toBe( 'wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php' );
	expect( res.json.callback.line ).toBeGreaterThan( 0 );
	expect( res.json.callback.source ).toEqual( { type: 'core', name: 'WordPress' } );
	expect( res.json.caps ).toContainEqual( { cap: 'manage_options', primitive: true, has: false } );
	expect( res.json.user ).toEqual( { id: ids.sam, name: 'Sam Subscriber' } );
} );

test( 'checks you when no user is given, and logged out with user=0', async () => {
	const me = await explain( admin, '/wp/v2/settings' );
	expect( me.json.caps ).toContainEqual( { cap: 'manage_options', primitive: true, has: true } );
	const visitor = await explain( admin, '/wp/v2/settings', 'GET', 0 );
	expect( visitor.json.caps ).toContainEqual( { cap: 'manage_options', primitive: true, has: false } );
	expect( visitor.json.user.id ).toBe( 0 );
} );

test( "post type caps come from the post type, and meta caps say they can't tell", async () => {
	const create = await explain( admin, '/wp/v2/posts', 'POST', ids.sam );
	const caps = create.json.caps.map( ( c: { cap: string } ) => c.cap );
	expect( caps ).toEqual( expect.arrayContaining( [ 'edit_posts', 'publish_posts' ] ) );
	expect( create.json.caps.find( ( c: { cap: string } ) => c.cap === 'edit_posts' ).has ).toBe( false );
} );

test( 'reads capability names out of a plugin callback', async () => {
	// Leaky Forms' /search checks current_user_can( 'read' ) in a closure.
	const res = await explain( admin, '/leaky/v1/search', 'GET', 0 );
	expect( res.json.callback.name ).toMatch( /^closure in plugins\/leaky-forms\/leaky-forms\.php:\d+$/ );
	expect( res.json.callback.source.name ).toBe( 'Leaky Forms' );
	expect( res.json.callback.file ).toMatch( /^wp-content\/plugins\/leaky-forms\/leaky-forms\.php$/ );
	expect( res.json.caps ).toEqual( [ { cap: 'read', primitive: true, has: false } ] );
	const editorCaps = await explain( admin, '/leaky/v1/search', 'GET', ids.jane );
	expect( editorCaps.json.caps ).toEqual( [ { cap: 'read', primitive: true, has: true } ] );
} );

test( 'routes with no check say so', async () => {
	const res = await explain( admin, '/leaky/v1/submit', 'POST' );
	expect( res.json.permission ).toBe( 'missing' );
	expect( res.json.callback ).toBeNull();
} );

test( 'unknown routes and methods are 404, and only admins get in', async () => {
	expect( ( await explain( admin, '/nope/v1/x' ) ).status ).toBe( 404 );
	expect( ( await explain( admin, '/wp/v2/settings', 'DELETE' ) ).status ).toBe( 404 );
	expect( ( await explain( editor, '/wp/v2/settings' ) ).status ).toBe( 403 );
} );

test( 'Site Health lists write routes anyone can call', async ( { page } ) => {
	await page.goto( '/wp-admin/site-health.php' );
	const item = page.locator( '.health-check-accordion-trigger', { hasText: 'REST API endpoint' } );
	await expect( item ).toContainText( /let anyone change data/ );
	await item.click();
	const panel = page.locator( '.health-check-accordion-panel' ).filter( { hasText: 'POST /leaky/v1/submit' } );
	await expect( panel ).toBeVisible();
	await expect( panel.getByRole( 'link', { name: 'See them in the Routemark report' } ) ).toHaveAttribute( 'href', /page=routemark&panel=report/ );
} );
