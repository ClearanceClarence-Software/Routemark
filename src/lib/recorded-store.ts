/**
 * Where recorded REST calls are kept: localStorage, per user, in this browser.
 * Shared by the recorder script (src/recorder.ts), which writes, and the app,
 * which lists them. No imports, so the recorder stays small.
 */

export interface RecordedCall {
	id: string;
	at: number;
	method: string;
	/** Path after the REST root, with the query string. */
	path: string;
	status: number;
	durationMs: number;
	/** The admin screen it came from, e.g. /wp-admin/post.php?post=1&action=edit */
	page: string;
	/** JSON or form body as sent, with secret-looking fields blanked. */
	body?: string;
	contentType?: string;
}

export interface RecorderState {
	on: boolean;
	calls: RecordedCall[];
}

export const MAX_CALLS = 200;
// Bigger bodies (an uploaded file, say) aren't kept, only that there was one.
export const MAX_BODY = 50_000;

export const storageKey = ( userId: number ) => `routemark.recorder.${ userId }`;

export function readState( userId: number ): RecorderState {
	try {
		const raw = window.localStorage.getItem( storageKey( userId ) );
		const parsed = raw ? ( JSON.parse( raw ) as Partial< RecorderState > ) : null;
		return { on: !! parsed?.on, calls: Array.isArray( parsed?.calls ) ? parsed!.calls : [] };
	} catch {
		return { on: false, calls: [] };
	}
}

export function writeState( userId: number, state: RecorderState ): void {
	try {
		window.localStorage.setItem( storageKey( userId ), JSON.stringify( { on: state.on, calls: state.calls.slice( 0, MAX_CALLS ) } ) );
	} catch {
		// Full or blocked. Recording just stops sticking, nothing breaks.
	}
}

// Same rule as the history: anything named like a secret is blanked before it's stored.
export const SECRET = /pass(word)?|secret|token|auth|cookie|nonce|api[_-]?key|private/i;

function scrub( value: unknown ): unknown {
	if ( Array.isArray( value ) ) {
		return value.map( scrub );
	}
	if ( value && typeof value === 'object' ) {
		return Object.fromEntries( Object.entries( value as Record< string, unknown > ).map( ( [ k, v ] ) => [ k, SECRET.test( k ) ? '' : scrub( v ) ] ) );
	}
	return value;
}

/** A body we're willing to keep: JSON or url-encoded, under MAX_BODY, secrets blanked. */
export function cleanBody( body: unknown ): string | undefined {
	if ( typeof body !== 'string' || body === '' || body.length > MAX_BODY ) {
		return undefined;
	}
	try {
		return JSON.stringify( scrub( JSON.parse( body ) ) );
	} catch {
		// Not JSON. Form-encoded bodies get the same treatment, anything else isn't kept.
		if ( /^[\w.%\-[\]]+=/.test( body ) ) {
			const params = new URLSearchParams( body );
			Array.from( params.keys() ).forEach( ( k ) => SECRET.test( k ) && params.set( k, '' ) );
			return params.toString();
		}
		return undefined;
	}
}

/** Drops the nonce and blanks secret-looking query params. */
export function cleanPath( path: string ): string {
	const [ route, qs ] = path.split( '?' );
	if ( ! qs ) {
		return path;
	}
	const params = new URLSearchParams( qs );
	params.delete( '_wpnonce' );
	Array.from( params.keys() ).forEach( ( k ) => SECRET.test( k ) && params.set( k, '' ) );
	const rest = params.toString();
	return rest ? `${ route }?${ rest }` : route;
}

/**
 * The REST path for a URL, or null if it isn't a REST request.
 * Handles both /wp-json/... and ?rest_route=/... URLs.
 */
export function restPath( url: string, restRoot: string ): string | null {
	let parsed: URL;
	let root: URL;
	try {
		parsed = new URL( url, window.location.href );
		root = new URL( restRoot, window.location.href );
	} catch {
		return null;
	}
	if ( parsed.origin !== root.origin ) {
		return null;
	}
	const routeParam = parsed.searchParams.get( 'rest_route' );
	if ( routeParam !== null ) {
		parsed.searchParams.delete( 'rest_route' );
		const qs = parsed.searchParams.toString();
		return routeParam + ( qs ? `?${ qs }` : '' );
	}
	const base = root.pathname.replace( /\/?$/, '/' );
	if ( ! parsed.pathname.startsWith( base ) ) {
		return null;
	}
	return '/' + parsed.pathname.slice( base.length ) + parsed.search;
}
