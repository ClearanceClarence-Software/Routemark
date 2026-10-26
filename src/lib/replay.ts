/**
 * Turns a request seen elsewhere (a recorded call, a pasted cURL command, a
 * link in a response) back into a route and a draft Routemark can send.
 */
import type { Draft, HttpMethod, RouteInfo, Row } from '../types';
import { METHODS } from '../types';
import { hasBody, newDraft, uid } from './request';
import { routeMethods } from './routes';

export interface IncomingRequest {
	method: string;
	/** Path after the REST root, query string included. */
	path: string;
	body?: string;
	headers?: Array< [ string, string ] >;
}

export interface Replay {
	route: RouteInfo;
	draft: Draft;
	/** Headers we left out on purpose (auth, cookies), so the UI can say so. */
	dropped: string[];
}

// Sent for you by the browser or Routemark, or secrets we shouldn't copy.
const SKIP_HEADERS = /^(authorization|cookie|x-wp-nonce|host|content-length|accept-encoding|connection|user-agent|origin|referer|x-routemark-.*)$/i;

const compiled = new WeakMap< RouteInfo, RegExp | null >();

function routeRegex( route: RouteInfo ): RegExp | null {
	if ( ! compiled.has( route ) ) {
		let re: RegExp | null = null;
		try {
			// PHP's named groups are (?P<name>...), JavaScript's are (?<name>...).
			re = new RegExp( '^' + route.route.replace( /\(\?P</g, '(?<' ) + '$' );
		} catch {
			re = null;
		}
		compiled.set( route, re );
	}
	return compiled.get( route ) ?? null;
}

/** The registered route a concrete path belongs to, with its path params. */
export function matchRoute( routes: RouteInfo[], path: string ): { route: RouteInfo; params: Record< string, string > } | null {
	const bare = decodeURI( path.split( '?' )[ 0 ] || '/' ).replace( /\/+$/, '' ) || '/';
	let best: { route: RouteInfo; params: Record< string, string > } | null = null;

	for ( const route of routes ) {
		const m = routeRegex( route )?.exec( bare ) ?? routeRegex( route )?.exec( bare + '/' );
		if ( ! m ) {
			continue;
		}
		// Several can match (a namespace index and a catch-all, say). The
		// longest pattern is the most specific one.
		if ( ! best || route.route.length > best.route.route.length ) {
			best = { route, params: { ...( m.groups ?? {} ) } };
		}
	}
	return best;
}

function rowsFrom( qs: string ): Row[] {
	return Array.from( new URLSearchParams( qs ) ).map( ( [ key, value ] ) => ( { id: uid(), enabled: true, key, value } ) );
}

/** A form-encoded body as the JSON object Routemark sends. */
function formToJson( body: string ): string {
	const out: Record< string, unknown > = {};
	new URLSearchParams( body ).forEach( ( value, key ) => {
		const clean = key.replace( /\[\]$/, '' );
		if ( key.endsWith( '[]' ) ) {
			out[ clean ] = [ ...( ( out[ clean ] as unknown[] ) ?? [] ), value ];
		} else {
			out[ clean ] = value;
		}
	} );
	return JSON.stringify( out, null, 2 );
}

function prettyBody( body: string | undefined ): string {
	if ( ! body ) {
		return '';
	}
	try {
		return JSON.stringify( JSON.parse( body ), null, 2 );
	} catch {
		return /^[\w.%\-[\]]+=/.test( body ) ? formToJson( body ) : body;
	}
}

export function replay( routes: RouteInfo[], req: IncomingRequest ): Replay | null {
	const match = matchRoute( routes, req.path );
	if ( ! match ) {
		return null;
	}
	const { route, params } = match;
	const wanted = req.method.toUpperCase() as HttpMethod;
	const methods = routeMethods( route );
	const method = METHODS.includes( wanted ) && methods.includes( wanted ) ? wanted : methods[ 0 ] ?? 'GET';

	const draft = newDraft( route, method, false );
	Object.keys( draft.pathParams ).forEach( ( k ) => {
		draft.pathParams[ k ] = params[ k ] ?? '';
	} );
	const qs = req.path.includes( '?' ) ? req.path.slice( req.path.indexOf( '?' ) + 1 ) : '';
	draft.query = rowsFrom( qs );

	const dropped: string[] = [];
	draft.headers = ( req.headers ?? [] )
		.filter( ( [ name ] ) => {
			if ( SKIP_HEADERS.test( name ) ) {
				dropped.push( name );
				return false;
			}
			// Routemark always sends JSON, so the original content type doesn't carry over.
			return name.toLowerCase() !== 'content-type';
		} )
		.map( ( [ key, value ] ) => ( { id: uid(), enabled: true, key, value } ) );

	draft.body = hasBody( method ) ? prettyBody( req.body ) || draft.body : '';
	return { route, draft, dropped };
}

/** Splits a shell command line the way a POSIX shell would, near enough. */
function shellWords( input: string ): string[] {
	const words: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let has = false;
	const text = input.replace( /\\\r?\n/g, ' ' );

	for ( let i = 0; i < text.length; i++ ) {
		const ch = text[ i ];
		if ( quote === "'" ) {
			if ( ch === "'" ) {
				quote = null;
			} else {
				current += ch;
			}
		} else if ( quote === '"' ) {
			if ( ch === '"' ) {
				quote = null;
			} else if ( ch === '\\' && i + 1 < text.length && '"\\$`'.includes( text[ i + 1 ] ) ) {
				current += text[ ++i ];
			} else {
				current += ch;
			}
		} else if ( ch === "'" || ch === '"' ) {
			quote = ch;
			has = true;
		} else if ( ch === '\\' && i + 1 < text.length ) {
			current += text[ ++i ];
			has = true;
		} else if ( /\s/.test( ch ) ) {
			if ( current !== '' || has ) {
				words.push( current );
			}
			current = '';
			has = false;
		} else if ( ch === '$' && text[ i + 1 ] === "'" ) {
			// $'...' (Chrome's "Copy as cURL (bash)" uses it). Treat like '...'.
			quote = "'";
			has = true;
			i++;
		} else {
			current += ch;
		}
	}
	if ( current !== '' || has ) {
		words.push( current );
	}
	return words;
}

export interface ParsedCurl {
	url: string;
	request: IncomingRequest;
}

/**
 * Reads a cURL command: the URL, -X, -H, -d / --data* / --json, -G.
 * Options it doesn't know are skipped. Throws with a readable message if
 * there's no URL.
 */
export function parseCurl( command: string, restRoot: string ): ParsedCurl {
	const words = shellWords( command.trim() );
	if ( words[ 0 ] === 'curl' ) {
		words.shift();
	}

	let url = '';
	let method = '';
	let get = false;
	let json = false;
	const headers: Array< [ string, string ] > = [];
	const data: string[] = [];
	// Options that take a value we don't use.
	const skipValue = /^(-u|--user|-o|--output|-A|--user-agent|-e|--referer|-b|--cookie|-c|--cookie-jar|-m|--max-time|--connect-timeout|-w|--write-out|--retry|-x|--proxy|-F|--form|--cacert|--cert|--key|--resolve)$/;

	for ( let i = 0; i < words.length; i++ ) {
		const w = words[ i ];
		const next = () => words[ ++i ] ?? '';
		if ( w === '-X' || w === '--request' ) {
			method = next().toUpperCase();
		} else if ( w.startsWith( '-X' ) && w.length > 2 ) {
			method = w.slice( 2 ).toUpperCase();
		} else if ( w === '-H' || w === '--header' ) {
			const h = next();
			const at = h.indexOf( ':' );
			if ( at > 0 ) {
				headers.push( [ h.slice( 0, at ).trim(), h.slice( at + 1 ).trim() ] );
			}
		} else if ( [ '-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode' ].includes( w ) ) {
			data.push( next() );
		} else if ( w === '--json' ) {
			data.push( next() );
			json = true;
		} else if ( w === '-G' || w === '--get' ) {
			get = true;
		} else if ( w === '--url' ) {
			url = next();
		} else if ( skipValue.test( w ) ) {
			next();
		} else if ( ! w.startsWith( '-' ) && ! url ) {
			url = w;
		}
	}

	if ( ! url ) {
		throw new Error( 'no-url' );
	}

	let body = data.join( '&' );
	if ( data.length > 1 ) {
		// Several -d with JSON in them can't be joined, keep the first.
		try {
			JSON.parse( data[ 0 ] );
			body = data[ 0 ];
		} catch {
			// form fields, joined with & is right
		}
	}
	let path = restPathFor( url, restRoot );
	if ( get && body ) {
		path += ( path.includes( '?' ) ? '&' : '?' ) + body;
		body = '';
	}
	const finalMethod = method || ( body ? 'POST' : 'GET' );
	if ( json && ! headers.some( ( [ n ] ) => n.toLowerCase() === 'content-type' ) ) {
		headers.push( [ 'Content-Type', 'application/json' ] );
	}

	return { url, request: { method: finalMethod, path, body, headers } };
}

/**
 * Path after the REST root for a full URL. Works for URLs on another site
 * too (staging, say): anything after /wp-json/ or in ?rest_route= counts.
 */
export function restPathFor( url: string, restRoot: string ): string {
	let parsed: URL;
	try {
		parsed = new URL( url, window.location.href );
	} catch {
		throw new Error( 'bad-url' );
	}
	const routeParam = parsed.searchParams.get( 'rest_route' );
	if ( routeParam !== null ) {
		parsed.searchParams.delete( 'rest_route' );
		const qs = parsed.searchParams.toString();
		return routeParam + ( qs ? `?${ qs }` : '' );
	}
	let rootPath = '/wp-json/';
	try {
		rootPath = new URL( restRoot, window.location.href ).pathname.replace( /\/?$/, '/' );
	} catch {
		// keep the default
	}
	for ( const base of [ rootPath, '/wp-json/' ] ) {
		const at = parsed.pathname.indexOf( base );
		if ( at !== -1 ) {
			return '/' + parsed.pathname.slice( at + base.length ) + parsed.search;
		}
	}
	throw new Error( 'not-rest' );
}
