import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Logs in once per user and saves the cookies, so each test starts logged in.
// The first request also makes the test setup plugin create its users.
export const USERS = [ 'admin', 'admin2', 'jane' ] as const;
export const authFile = ( login: string ) => `tests/e2e/.auth/${ login }.json`;

export default async function globalSetup( config: FullConfig ) {
	const baseURL = config.projects[ 0 ].use.baseURL as string;
	mkdirSync( 'tests/e2e/.auth', { recursive: true } );

	// Make sure the site is up and the test users exist before logging any of them in.
	const warmup = await request.newContext( { baseURL } );
	const res = await warmup.get( '/wp-login.php' );
	if ( ! res.ok() ) {
		throw new Error( `WordPress isn't answering at ${ baseURL } (${ res.status() }). Start it with "npm run env:start".` );
	}
	await warmup.dispose();

	for ( const login of USERS ) {
		const ctx = await request.newContext( { baseURL } );
		await ctx.get( '/wp-login.php' ); // sets the test cookie wp-login.php wants
		const login_res = await ctx.post( '/wp-login.php', {
			form: { log: login, pwd: 'password', testcookie: '1', redirect_to: '/wp-admin/' },
			maxRedirects: 0,
		} );
		const cookies = ( await ctx.storageState() ).cookies;
		if ( ! cookies.some( ( c ) => c.name.startsWith( 'wordpress_logged_in_' ) ) ) {
			throw new Error( `Couldn't log in as ${ login } (${ login_res.status() }). Is the Routemark Test Setup plugin active?` );
		}
		await ctx.storageState( { path: authFile( login ) } );
		await ctx.dispose();
	}
}
