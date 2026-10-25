import { expect, test } from '@playwright/test';

import { Rest } from '../helpers';

// Send as: X-Routemark-As switches the user for one request, but only for an
// admin with a valid routemark_send_as nonce, and only to users they may edit.

let admin: Rest;
let editor: Rest;
let ids: Record< string, number >;
let saNonce: string;

const as = ( user: number | string, nonce = saNonce ) => ( { 'X-Routemark-As': String( user ), 'X-Routemark-Nonce': nonce } );

test.beforeAll( async ( {}, info ) => {
	const baseURL = info.project.use.baseURL!;
	admin = await Rest.as( 'admin', baseURL );
	editor = await Rest.as( 'jane', baseURL );
	ids = await admin.userIds();
	saNonce = await admin.sendAsNonce();
} );

test.afterAll( async () => {
	await Promise.all( [ admin.dispose(), editor.dispose() ] );
} );

test.describe( 'user picker', () => {
	test( 'lists one user per role, never you, and no emails', async () => {
		const res = await admin.call( 'GET', '/routemark/v1/users' );
		expect( res.status ).toBe( 200 );
		const roles = res.json.users.map( ( u: { role: string } ) => u.role );
		expect( roles ).toEqual( expect.arrayContaining( [ 'Administrator', 'Editor', 'Author', 'Subscriber' ] ) );
		expect( res.json.users.map( ( u: { id: number } ) => u.id ) ).not.toContain( ids.admin );
		for ( const u of res.json.users ) {
			expect( u ).not.toHaveProperty( 'email' );
		}
	} );

	test( 'searches by name', async () => {
		const res = await admin.call( 'GET', '/routemark/v1/users', { query: { search: 'jan' } } );
		expect( res.json.users.map( ( u: { login: string } ) => u.login ) ).toEqual( [ 'jane' ] );
	} );

	test( "editors can't list users", async () => {
		expect( ( await editor.call( 'GET', '/routemark/v1/users' ) ).status ).toBe( 403 );
	} );
} );

test.describe( 'switching', () => {
	test( 'without the header, requests run as you', async () => {
		const res = await admin.call( 'GET', '/wp/v2/users/me' );
		expect( res.json.id ).toBe( ids.admin );
		expect( res.headers[ 'x-routemark-as' ] ).toBeUndefined();
	} );

	test( 'runs as the chosen user and says so in a header', async () => {
		const res = await admin.call( 'GET', '/wp/v2/users/me', { query: { context: 'edit' }, headers: as( ids.jane ) } );
		expect( res.status ).toBe( 200 );
		expect( res.json.id ).toBe( ids.jane );
		expect( res.json.roles ).toEqual( [ 'editor' ] );
		expect( res.headers[ 'x-routemark-as' ] ).toBe( String( ids.jane ) );
	} );

	test( '0 means logged out', async () => {
		const res = await admin.call( 'GET', '/wp/v2/users/me', { headers: as( 0 ) } );
		expect( res.status ).toBe( 401 );
		expect( res.json.code ).toBe( 'rest_not_logged_in' );
		expect( res.headers[ 'x-routemark-as' ] ).toBe( '0' );
		expect( [ 400, 401 ] ).toContain( ( await admin.call( 'GET', '/wp/v2/posts', { query: { status: 'draft' }, headers: as( 0 ) } ) ).status );
	} );

	test( "uses the target's permissions for writes", async () => {
		const sub = await admin.call( 'POST', '/wp/v2/posts', { headers: as( ids.sam ), body: { title: 'nope', status: 'draft' } } );
		expect( sub.status ).toBe( 403 );
		expect( sub.json.code ).toBe( 'rest_cannot_create' );

		const author = await admin.call( 'POST', '/wp/v2/posts', { headers: as( ids.ali ), body: { title: 'by ali', status: 'draft' } } );
		expect( author.status ).toBe( 201 );
		expect( author.json.author ).toBe( ids.ali );
		expect( ( await admin.call( 'DELETE', `/wp/v2/posts/${ author.json.id }`, { query: { force: 'true' } } ) ).status ).toBe( 200 );
	} );

	test( '_embed runs as the target too, and you get switched back afterwards', async () => {
		const res = await admin.call( 'GET', '/routemark-test/v1/outer', { query: { _embed: 'me' }, headers: as( ids.jane ) } );
		expect( res.json.id ).toBe( ids.jane );
		expect( res.json._embedded.me[ 0 ].id ).toBe( ids.jane );
		// The test plugin records the current user at shutdown of each REST request.
		const shutdown = await admin.call( 'GET', '/routemark-test/v1/last-shutdown-user' );
		expect( shutdown.json.id ).toBe( ids.admin );
	} );

	test( 'batch sub-requests run as the target', async () => {
		const res = await admin.call( 'POST', '/batch/v1', {
			headers: as( ids.sam ),
			body: { requests: [ { method: 'POST', path: '/wp/v2/posts', body: { title: 'x' } } ] },
		} );
		expect( res.json.responses[ 0 ].status ).toBe( 403 );
	} );
} );

test.describe( 'refusals', () => {
	const denied = ( res: { status: number; json: { code?: string } } ) => {
		expect( res.status ).toBe( 403 );
		expect( res.json.code ).toBe( 'routemark_send_as_denied' );
	};

	test( 'bad or missing nonce', async () => {
		denied( await admin.call( 'GET', '/wp/v2/users/me', { headers: as( ids.jane, 'bogus' ) } ) );
		denied( await admin.call( 'GET', '/wp/v2/users/me', { headers: as( ids.jane, '' ) } ) );
	} );

	for ( const bad of [ '1 OR 1=1', '-1', 'abc', '12abc', '' ] ) {
		test( `user ID ${ JSON.stringify( bad ) }`, async () => {
			denied( await admin.call( 'GET', '/wp/v2/users/me', { headers: as( bad ) } ) );
		} );
	}

	test( "a user that doesn't exist", async () => {
		denied( await admin.call( 'GET', '/wp/v2/users/me', { headers: as( 999999 ) } ) );
	} );

	test( 'an editor, even with an admin’s nonce', async () => {
		denied( await editor.call( 'GET', '/wp/v2/users/me', { headers: as( ids.admin ) } ) );
	} );

	test( 'no wp_rest nonce: WordPress treats you as logged out and nothing switches', async () => {
		const res = await admin.call( 'GET', '/wp/v2/users/me', { nonce: false, headers: as( ids.jane ) } );
		expect( [ 401, 403 ] ).toContain( res.status );
		expect( res.headers[ 'x-routemark-as' ] ).toBeUndefined();
	} );
} );
