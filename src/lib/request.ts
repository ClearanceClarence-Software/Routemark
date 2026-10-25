import apiFetch from '@wordpress/api-fetch';

import type { Draft, HttpMethod, RouteArg, RouteInfo, Row, RunResult, SendAsUser, ServerStats } from '../types';
import { endpointFor, routeMethods, routeToTemplate, templateParams } from './routes';

let counter = 0;
export const uid = () => `r${ Date.now().toString( 36 ) }${ ( counter++ ).toString( 36 ) }`;

export const hasBody = ( method: HttpMethod ) => method !== 'GET' && method !== 'DELETE';

export function emptyRow(): Row {
	return { id: uid(), enabled: true, key: '', value: '' };
}

// Pre-fill query rows from the endpoint args. They start switched off so
// nothing gets sent that you didn't ask for.
export function suggestedQuery( route: RouteInfo, method: HttpMethod ): Row[] {
	if ( hasBody( method ) ) {
		return [];
	}
	const params = new Set( templateParams( routeToTemplate( route.route ) ) );
	const args = endpointFor( route, method )?.args ?? {};

	return Object.entries( args )
		.filter( ( [ name ] ) => ! params.has( name ) )
		.map( ( [ key, arg ] ) => ( { id: uid(), enabled: false, key, value: '', arg } ) );
}

export function newDraft( route: RouteInfo, method?: HttpMethod, suggest = true ): Draft {
	const m = method ?? routeMethods( route )[ 0 ] ?? 'GET';
	const pathParams: Record< string, string > = {};
	templateParams( routeToTemplate( route.route ) ).forEach( ( p ) => ( pathParams[ p ] = '' ) );

	return {
		method: m,
		pathParams,
		query: suggest ? suggestedQuery( route, m ) : [],
		headers: [],
		body: hasBody( m ) ? sampleBody( route, m ) : '',
	};
}

// Switching method shouldn't throw away what you already typed.
export function switchMethod( route: RouteInfo, draft: Draft, method: HttpMethod, suggest = true ): Draft {
	const typed = draft.query.filter( ( r ) => r.value !== '' || ! r.arg );
	const suggestions = ( suggest ? suggestedQuery( route, method ) : [] ).filter(
		( s ) => ! typed.some( ( t ) => t.key === s.key )
	);
	return {
		...draft,
		method,
		query: [ ...typed, ...suggestions ],
		body: hasBody( method ) && draft.body.trim() === '' ? sampleBody( route, method ) : draft.body,
	};
}

export function missingParams( draft: Draft ): string[] {
	return Object.entries( draft.pathParams )
		.filter( ( [ , v ] ) => v.trim() === '' )
		.map( ( [ k ] ) => k );
}

export function buildPath( route: RouteInfo, draft: Draft ): string {
	let path = routeToTemplate( route.route ).replace( /\{(\w+)\}/g, ( match, name: string ) => {
		const v = draft.pathParams[ name ];
		return v ? encodeURIComponent( v ) : match;
	} );

	const qs = new URLSearchParams();
	draft.query
		.filter( ( r ) => r.enabled && r.key.trim() !== '' )
		.forEach( ( r ) => qs.append( r.key.trim(), r.value ) );

	const query = qs.toString();
	if ( query ) {
		path += ( path.includes( '?' ) ? '&' : '?' ) + query;
	}
	return path;
}

export function activeHeaders( draft: Draft ): Record< string, string > {
	const out: Record< string, string > = {};
	draft.headers
		.filter( ( r ) => r.enabled && r.key.trim() !== '' )
		.forEach( ( r ) => ( out[ r.key.trim() ] = r.value ) );
	return out;
}

function sampleValue( arg: RouteArg ): unknown {
	if ( arg.default !== undefined ) {
		return arg.default;
	}
	if ( arg.enum && arg.enum.length > 0 ) {
		return arg.enum[ 0 ];
	}
	const type = Array.isArray( arg.type ) ? arg.type[ 0 ] : arg.type;
	switch ( type ) {
		case 'integer':
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'array':
			return [];
		case 'object':
			return {};
		default:
			return '';
	}
}

// Rough body skeleton from the args, required ones first.
export function sampleBody( route: RouteInfo, method: HttpMethod ): string {
	const params = new Set( templateParams( routeToTemplate( route.route ) ) );
	const args = endpointFor( route, method )?.args ?? {};
	const body: Record< string, unknown > = {};

	Object.entries( args )
		.filter( ( [ name ] ) => ! params.has( name ) && name !== 'context' && name !== '_locale' )
		.sort( ( [ , a ], [ , b ] ) => Number( !! b.required ) - Number( !! a.required ) )
		.forEach( ( [ name, arg ] ) => ( body[ name ] = sampleValue( arg ) ) );

	return Object.keys( body ).length ? JSON.stringify( body, null, 2 ) : '{\n  \n}';
}

export function jsonError( text: string ): string | null {
	if ( text.trim() === '' ) {
		return null;
	}
	try {
		JSON.parse( text );
		return null;
	} catch ( e ) {
		return ( e as Error ).message;
	}
}

async function toResult( response: Response, startedAt: number ): Promise< RunResult > {
	const headers: Record< string, string > = {};
	response.headers.forEach( ( value, key ) => ( headers[ key ] = value ) );

	const raw = await response.text();
	let json: unknown = null;
	let isJson = false;
	try {
		json = JSON.parse( raw );
		isJson = true;
	} catch {
		// not JSON, that's fine, the Raw tab shows it
	}

	const ranAs = headers[ 'x-routemark-as' ];
	let stats: ServerStats | null = null;
	try {
		stats = headers[ 'x-routemark-stats' ] ? ( JSON.parse( headers[ 'x-routemark-stats' ] ) as ServerStats ) : null;
	} catch {
		// something mangled the header, just don't show the numbers
	}

	return {
		ranAs: ranAs === undefined ? null : Number( ranAs ),
		stats,
		status: response.status,
		statusText: response.statusText,
		durationMs: Math.round( performance.now() - startedAt ),
		sizeBytes: new Blob( [ raw ] ).size,
		headers,
		raw,
		json,
		isJson,
	};
}

// Never throws. Network errors come back as status 0 so the UI has one path.
export async function send( path: string, draft: Draft, as: SendAsUser | null = null ): Promise< RunResult > {
	const headers = activeHeaders( draft );
	// Asks for query count, PHP time and memory. Only admins get them back.
	headers[ 'X-Routemark-Stats' ] = '1';
	if ( as ) {
		// The server checks this nonce against you before it switches. See class-send-as.php.
		headers[ 'X-Routemark-As' ] = String( as.id );
		headers[ 'X-Routemark-Nonce' ] = window.routemarkSettings?.sendAs?.nonce ?? '';
	}
	const withBody = hasBody( draft.method ) && draft.body.trim() !== '';
	if ( withBody && ! Object.keys( headers ).some( ( h ) => h.toLowerCase() === 'content-type' ) ) {
		headers[ 'Content-Type' ] = 'application/json';
	}

	const startedAt = performance.now();
	try {
		const response = await apiFetch< Response, false >( {
			path,
			method: draft.method,
			parse: false,
			headers,
			...( withBody ? { body: draft.body } : {} ),
		} );
		return toResult( response, startedAt );
	} catch ( err ) {
		// Gotcha: with parse: false, apiFetch *throws* the Response on 4xx/5xx
		// instead of returning it.
		if ( err instanceof Response ) {
			return toResult( err, startedAt );
		}
		const message = ( err as { message?: string } )?.message ?? 'Network error';
		return {
			status: 0,
			statusText: message,
			durationMs: Math.round( performance.now() - startedAt ),
			sizeBytes: 0,
			headers: {},
			raw: message,
			json: null,
			isJson: false,
		};
	}
}

export function formatBytes( bytes: number ): string {
	if ( bytes < 1024 ) {
		return `${ bytes } B`;
	}
	if ( bytes < 1024 * 1024 ) {
		return `${ ( bytes / 1024 ).toFixed( 1 ) } KB`;
	}
	return `${ ( bytes / 1024 / 1024 ).toFixed( 2 ) } MB`;
}

// Works with plain permalinks too (?rest_route=/...).
export function fullUrl( path: string ): string {
	const root = window.routemarkSettings?.restRoot ?? '/wp-json/';
	const clean = path.replace( /^\//, '' );
	if ( root.includes( 'rest_route=' ) ) {
		return root + clean.replace( '?', '&' );
	}
	return root.replace( /\/?$/, '/' ) + clean;
}

// History lives in localStorage, so anything that looks like a secret is blanked
// before it gets there: auth headers, and body or query fields named like
// passwords or tokens. You'll have to type those again when you restore one.
const SECRET = /pass(word)?|secret|token|auth|cookie|nonce|api[_-]?key|private/i;

export const LOGGED_OUT: SendAsUser = { id: 0, name: '', role: '' };

function scrub( value: unknown ): unknown {
	if ( Array.isArray( value ) ) {
		return value.map( scrub );
	}
	if ( value && typeof value === 'object' ) {
		return Object.fromEntries(
			Object.entries( value as Record< string, unknown > ).map( ( [ k, v ] ) => [ k, SECRET.test( k ) ? '' : scrub( v ) ] )
		);
	}
	return value;
}

export function redactDraft( draft: Draft ): Draft {
	const clean = ( rows: Row[] ) => rows.map( ( r ) => ( SECRET.test( r.key ) ? { ...r, value: '' } : r ) );
	let body = draft.body;
	try {
		body = JSON.stringify( scrub( JSON.parse( draft.body ) ), null, 2 );
	} catch {
		// Not JSON, so we can't tell which part is sensitive. Don't keep it.
		body = '';
	}
	return { ...draft, query: clean( draft.query ), headers: clean( draft.headers ), body };
}

export function redactPath( path: string ): string {
	const [ route, qs ] = path.split( '?' );
	if ( ! qs ) {
		return path;
	}
	const params = new URLSearchParams( qs );
	Array.from( params.keys() ).forEach( ( k ) => SECRET.test( k ) && params.set( k, '' ) );
	return `${ route }?${ params.toString() }`;
}
