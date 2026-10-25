import { request, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

import { authFile } from './global-setup';

export interface Call {
	status: number;
	headers: Record< string, string >;
	json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * A REST client logged in as one user, with that user's wp_rest nonce.
 * Paths go through ?rest_route= so it works with any permalink setting.
 */
export class Rest {
	private constructor(
		public readonly ctx: APIRequestContext,
		public readonly nonce: string
	) {}

	static async as( login: 'admin' | 'admin2' | 'jane' | null, baseURL: string ): Promise< Rest > {
		const ctx = await request.newContext( { baseURL, storageState: login ? authFile( login ) : undefined } );
		let nonce = '';
		if ( login ) {
			nonce = ( await ( await ctx.get( '/wp-admin/admin-ajax.php?action=rest-nonce' ) ).text() ).trim();
		}
		return new Rest( ctx, nonce );
	}

	async call(
		method: string,
		path: string,
		opts: { query?: Record< string, string >; body?: unknown; headers?: Record< string, string >; nonce?: boolean } = {}
	): Promise< Call > {
		const params = new URLSearchParams( { rest_route: path, ...( opts.query ?? {} ) } );
		const headers: Record< string, string > = { ...( opts.headers ?? {} ) };
		if ( this.nonce && opts.nonce !== false ) {
			headers[ 'X-WP-Nonce' ] = this.nonce;
		}
		const res: APIResponse = await this.ctx.fetch( `/?${ params }`, {
			method,
			headers,
			...( opts.body !== undefined ? { data: opts.body } : {} ),
		} );
		let json: unknown = null;
		try {
			json = await res.json();
		} catch {
			json = await res.text();
		}
		return { status: res.status(), headers: res.headers(), json };
	}

	// The nonce Send as needs, from the Routemark page.
	async sendAsNonce(): Promise< string > {
		const html = await ( await this.ctx.get( '/wp-admin/tools.php?page=routemark' ) ).text();
		const m = html.match( /window\.routemarkSettings = (\{.*?\});/ );
		expect( m, 'routemarkSettings on the Tools page' ).toBeTruthy();
		return JSON.parse( m![ 1 ] ).sendAs.nonce;
	}

	async userIds(): Promise< Record< string, number > > {
		return ( await this.call( 'GET', '/routemark-test/v1/users' ) ).json;
	}

	// Raw user meta, so tests can start clean or plant invalid values. null deletes it.
	async setSettingsMeta( login: string, value: unknown ) {
		const res = await this.call( 'POST', '/routemark-test/v1/settings-meta', { query: { login }, body: { value } } );
		expect( res.status ).toBe( 200 );
	}

	dispose() {
		return this.ctx.dispose();
	}
}

// Opens Tools > Routemark, optionally on a route, and waits for the app.
export async function openRoutemark( page: Page, route = '' ) {
	await page.goto( '/wp-admin/tools.php?page=routemark' + ( route ? `#${ route }` : '' ) );
	await page.waitForSelector( route ? '.rmk-workspace' : '.rmk-overview' );
	await page.evaluate( () => document.fonts.ready );
}

export async function useTheme( page: Page, theme: 'light' | 'dark' ) {
	if ( ( await page.getAttribute( '.rmk', 'data-theme' ) ) !== theme ) {
		await page.getByRole( 'button', { name: `Switch to ${ theme } theme` } ).click();
		await expect( page.locator( '.rmk' ) ).toHaveAttribute( 'data-theme', theme );
	}
}

// Ctrl+Enter sends from anywhere on the page.
export async function send( page: Page ) {
	await page.keyboard.press( 'Control+Enter' );
	await page.waitForSelector( '.rmk-response-bar' );
}

// Fails the test on any JS error on the page.
export function watchErrors( page: Page ): string[] {
	const errors: string[] = [];
	page.on( 'pageerror', ( e ) => errors.push( String( e ) ) );
	return errors;
}
