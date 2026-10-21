import type { Draft } from '../types';
import { activeHeaders, fullUrl, hasBody } from './request';

export type SnippetKind = 'apiFetch' | 'fetch' | 'curl' | 'php';

export const SNIPPET_LABELS: Record< SnippetKind, string > = {
	apiFetch: 'wp.apiFetch',
	fetch: 'fetch',
	curl: 'cURL',
	php: 'PHP',
};

// Everything that goes into a snippet is quoted for its language. People paste
// these straight into a terminal, so a stray ' in a path param must never be
// able to end the string early. (encodeURIComponent leaves ' alone, so paths
// can contain one.)
const js = ( s: string ) => JSON.stringify( s );
const sh = ( s: string ) => `'${ s.replace( /'/g, `'\\''` ) }'`;
const php = ( s: string ) => `'${ s.replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) }'`;

const decode = ( s: string ) => {
	try {
		return decodeURIComponent( s );
	} catch {
		return s;
	}
};

// Valid JSON gets pretty-printed as a literal. Anything else goes in as a string.
function jsBody( body: string, pad: string ): string {
	try {
		return JSON.stringify( JSON.parse( body ), null, '\t' ).replace( /\n/g, '\n' + pad );
	} catch {
		return js( body.trim() );
	}
}

function phpValue( value: unknown, depth: number ): string {
	const pad = '\t'.repeat( depth );
	if ( value === null ) {
		return 'null';
	}
	if ( Array.isArray( value ) ) {
		if ( value.length === 0 ) {
			return 'array()';
		}
		return `array(\n${ value.map( ( v ) => `${ pad }\t${ phpValue( v, depth + 1 ) },` ).join( '\n' ) }\n${ pad })`;
	}
	if ( typeof value === 'object' ) {
		const entries = Object.entries( value as Record< string, unknown > );
		if ( entries.length === 0 ) {
			return 'array()';
		}
		return `array(\n${ entries
			.map( ( [ k, v ] ) => `${ pad }\t${ php( k ) } => ${ phpValue( v, depth + 1 ) },` )
			.join( '\n' ) }\n${ pad })`;
	}
	if ( typeof value === 'string' ) {
		return php( value );
	}
	if ( typeof value === 'number' || typeof value === 'boolean' ) {
		return String( value );
	}
	return 'null';
}

export function buildSnippet( kind: SnippetKind, path: string, draft: Draft ): string {
	const method = draft.method;
	const withBody = hasBody( method ) && draft.body.trim() !== '';
	const headers = activeHeaders( draft );

	if ( kind === 'apiFetch' ) {
		const lines = [ 'apiFetch( {', `\tpath: ${ js( path ) },`, `\tmethod: ${ js( method ) },` ];
		if ( Object.keys( headers ).length ) {
			lines.push( `\theaders: ${ JSON.stringify( headers ) },` );
		}
		if ( withBody ) {
			lines.push( `\tdata: ${ jsBody( draft.body, '\t' ) },` );
		}
		lines.push( '} ).then( ( data ) => console.log( data ) );' );
		return lines.join( '\n' );
	}

	if ( kind === 'fetch' ) {
		const headerLines = [
			`\t\t'Content-Type': 'application/json',`,
			`\t\t'X-WP-Nonce': wpApiSettings.nonce,`,
			...Object.entries( headers ).map( ( [ k, v ] ) => `\t\t${ js( k ) }: ${ js( v ) },` ),
		];
		const lines = [
			`fetch( ${ js( fullUrl( path ) ) }, {`,
			`\tmethod: ${ js( method ) },`,
			"\tcredentials: 'include',",
			'\theaders: {',
			...headerLines,
			'\t},',
		];
		if ( withBody ) {
			lines.push( `\tbody: JSON.stringify( ${ jsBody( draft.body, '\t' ) } ),` );
		}
		lines.push( '} ).then( ( res ) => res.json() );' );
		return lines.join( '\n' );
	}

	if ( kind === 'php' ) {
		const [ route, qs ] = path.split( '?' );
		const lines = [ `$request = new WP_REST_Request( ${ php( method ) }, ${ php( decode( route ) ) } );` ];
		if ( qs ) {
			const params: Record< string, string > = {};
			new URLSearchParams( qs ).forEach( ( v, k ) => ( params[ k ] = v ) );
			lines.push( `$request->set_query_params( ${ phpValue( params, 0 ) } );` );
		}
		if ( withBody ) {
			try {
				lines.push( `$request->set_body_params( ${ phpValue( JSON.parse( draft.body ), 0 ) } );` );
			} catch {
				lines.push( `$request->set_body( ${ php( draft.body.trim() ) } );` );
			}
		}
		lines.push( '$response = rest_do_request( $request );', '$data     = rest_get_server()->response_to_data( $response, false );' );
		return lines.join( '\n' );
	}

	const parts = [ `curl -X ${ method } ${ sh( fullUrl( path ) ) }`, "  -u 'USERNAME:APPLICATION_PASSWORD'" ];
	Object.entries( headers ).forEach( ( [ k, v ] ) => parts.push( `  -H ${ sh( `${ k }: ${ v }` ) }` ) );
	if ( withBody ) {
		if ( ! Object.keys( headers ).some( ( h ) => h.toLowerCase() === 'content-type' ) ) {
			parts.push( "  -H 'Content-Type: application/json'" );
		}
		parts.push( `  -d ${ sh( draft.body.trim() ) }` );
	}
	return parts.join( ' \\\n' );
}
