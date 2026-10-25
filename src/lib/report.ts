import { __, _n, sprintf } from '@wordpress/i18n';

import type { RouteInfo } from '../types';
import { routeToTemplate, sourceLabel, templateParams } from './routes';

export type Severity = 'high' | 'medium' | 'low';
export type FindingKind = 'no-permission' | 'open-write' | 'unchecked-args' | 'no-schema';

export interface Finding {
	id: string;
	kind: FindingKind;
	severity: Severity;
	route: RouteInfo;
	// empty for route-level findings (no schema)
	methods: string[];
	args: string[];
}

export const SEVERITIES: Severity[] = [ 'high', 'medium', 'low' ];

const WRITES = [ 'POST', 'PUT', 'PATCH', 'DELETE' ];
const writes = ( methods: string[] ) => methods.some( ( m ) => WRITES.includes( m ) );

// Every namespace gets an index route from core (/wc/v3 itself). They're public
// by design and have no schema, so flagging one per plugin would just be noise.
const isIndexRoute = ( route: RouteInfo ) => route.route === '/' || route.route === `/${ route.namespace }`;

/**
 * Goes through what each route registered and flags:
 *
 * - no permission_callback: anyone can call it. High if it writes.
 * - __return_true on a write: open on purpose, but it changes data. High.
 * - args WordPress doesn't check: medium if it writes or is public, else low.
 * - no schema: low. Not a hole, just nothing documented or checked.
 *
 * Open read endpoints aren't flagged here, the overview lists those.
 */
export function buildReport( routes: RouteInfo[] ): Finding[] {
	const findings: Finding[] = [];

	for ( const route of routes ) {
		if ( isIndexRoute( route ) ) {
			continue;
		}
		// Path params are matched by the route's regex, so they're checked already.
		const pathParams = new Set( templateParams( routeToTemplate( route.route ) ) );

		route.endpoints.forEach( ( e, i ) => {
			const id = `${ route.route }#${ i }`;
			const isWrite = writes( e.methods );

			if ( e.permission === 'missing' ) {
				findings.push( { id: id + 'p', kind: 'no-permission', severity: isWrite ? 'high' : 'medium', route, methods: e.methods, args: [] } );
			} else if ( e.permission === 'open' && isWrite ) {
				findings.push( { id: id + 'o', kind: 'open-write', severity: 'high', route, methods: e.methods, args: [] } );
			}

			const unchecked = ( e.uncheckedArgs ?? [] ).filter( ( a ) => ! pathParams.has( a ) );
			if ( unchecked.length > 0 ) {
				findings.push( {
					id: id + 'a',
					kind: 'unchecked-args',
					severity: isWrite || e.isPublic ? 'medium' : 'low',
					route,
					methods: e.methods,
					args: unchecked,
				} );
			}
		} );

		if ( ! route.schema ) {
			findings.push( { id: route.route + '#s', kind: 'no-schema', severity: 'low', route, methods: [], args: [] } );
		}
	}

	const rank = ( s: Severity ) => SEVERITIES.indexOf( s );
	return findings.sort(
		( a, b ) => rank( a.severity ) - rank( b.severity ) || a.route.route.localeCompare( b.route.route )
	);
}

export function severityLabel( s: Severity ): string {
	return { high: __( 'High', 'routemark' ), medium: __( 'Medium', 'routemark' ), low: __( 'Low', 'routemark' ) }[ s ];
}

export function findingTitle( f: Finding ): string {
	switch ( f.kind ) {
		case 'no-permission':
			return __( 'No permission check', 'routemark' );
		case 'open-write':
			return __( 'Anyone can change data', 'routemark' );
		case 'unchecked-args':
			return _n( 'Unchecked argument', 'Unchecked arguments', f.args.length, 'routemark' );
		case 'no-schema':
			return __( 'No schema', 'routemark' );
	}
}

export function findingDetail( f: Finding ): string {
	switch ( f.kind ) {
		case 'no-permission':
			return __(
				'It was registered without a permission_callback. WordPress logs a notice about that, then runs it for anyone who asks, logged in or not.',
				'routemark'
			);
		case 'open-write':
			return __(
				'The permission check is __return_true, so it works without logging in, and this method changes data. Fine for things like a contact form, worth a second look for anything else.',
				'routemark'
			);
		case 'unchecked-args':
			return sprintf(
				/* translators: %s: comma-separated argument names */
				__( '%s: no type, validate_callback or sanitize_callback, so whatever is sent reaches the handler as is.', 'routemark' ),
				f.args.join( ', ' )
			);
		case 'no-schema':
			return __( "There's no schema, so the response isn't documented and WordPress can't filter it by context or _fields.", 'routemark' );
	}
}

export function reportSourceName( route: RouteInfo ): string {
	return sourceLabel( route ) ?? __( 'Unknown source', 'routemark' );
}

export interface FindingGroup {
	source: string;
	worst: Severity;
	findings: Finding[];
}

// One group per plugin/theme, worst first, so the plugin with the real
// problem ends up at the top instead of the one with the most "no schema".
export function groupFindings( findings: Finding[] ): FindingGroup[] {
	const map = new Map< string, Finding[] >();
	findings.forEach( ( f ) => {
		const source = reportSourceName( f.route );
		map.set( source, [ ...( map.get( source ) ?? [] ), f ] );
	} );
	const rank = ( s: Severity ) => SEVERITIES.indexOf( s );
	return Array.from( map, ( [ source, list ] ) => ( {
		source,
		findings: list,
		worst: list.reduce< Severity >( ( w, f ) => ( rank( f.severity ) < rank( w ) ? f.severity : w ), 'low' ),
	} ) ).sort( ( a, b ) => rank( a.worst ) - rank( b.worst ) || a.source.localeCompare( b.source ) );
}

// Plain text you can paste into a ticket or a client email.
export function reportAsText( findings: Finding[], siteUrl: string ): string {
	const lines: string[] = [ sprintf( /* translators: %s: site URL */ __( 'Routemark report for %s', 'routemark' ), siteUrl ) ];
	if ( findings.length === 0 ) {
		lines.push( '', __( 'Nothing to flag.', 'routemark' ) );
	}

	for ( const group of groupFindings( findings ) ) {
		lines.push( '', `## ${ group.source }` );
		for ( const f of group.findings ) {
			const methods = f.methods.length ? f.methods.join( ',' ) + ' ' : '';
			lines.push( `- [${ severityLabel( f.severity ) }] ${ methods }${ routeToTemplate( f.route.route ) }: ${ findingTitle( f ) }. ${ findingDetail( f ) }` );
		}
	}
	return lines.join( '\n' ) + '\n';
}
