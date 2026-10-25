import { __, sprintf } from '@wordpress/i18n';

import { METHODS } from '../types';
import type { Endpoint, Filters, HttpMethod, RouteInfo } from '../types';

/**
 * '/wp/v2/posts/(?P<id>[\d]+)'  ->  '/wp/v2/posts/{id}'
 *
 * Tried a single regex first, but core's own plugins route nests a group
 * inside the named one: (?P<plugin>[^.\/]+(?:\/[^.\/]+)?). So we just walk
 * the string and count parens.
 */
export function routeToTemplate( route: string ): string {
	let out = '';
	let i = 0;

	while ( i < route.length ) {
		if ( route.startsWith( '(?P<', i ) ) {
			const nameEnd = route.indexOf( '>', i );
			const name = route.slice( i + 4, nameEnd );

			let depth = 1;
			let j = nameEnd + 1;
			while ( j < route.length && depth > 0 ) {
				const ch = route[ j ];
				if ( ch === '\\' ) {
					j += 2;
					continue;
				}
				if ( ch === '(' ) {
					depth++;
				} else if ( ch === ')' ) {
					depth--;
				}
				j++;
			}

			out += `{${ name }}`;
			i = route[ j ] === '?' ? j + 1 : j;
			continue;
		}

		out += route[ i ];
		i++;
	}

	return out.replace( /^\^/, '' ).replace( /\$$/, '' );
}

export function templateParams( template: string ): string[] {
	return Array.from( template.matchAll( /\{(\w+)\}/g ), ( m ) => m[ 1 ] );
}

export function splitTemplate( template: string ): Array< { text: string; param: boolean } > {
	return template
		.split( /(\{\w+\})/ )
		.filter( Boolean )
		.map( ( text ) => ( { text, param: /^\{\w+\}$/.test( text ) } ) );
}

// '/wp/v2/posts/{id}' -> '/posts/{id}'. The sidebar already shows the namespace.
export function localPath( route: RouteInfo ): string {
	const template = routeToTemplate( route.route );
	if ( ! route.namespace ) {
		return template;
	}
	const prefix = `/${ route.namespace }`;
	if ( template === prefix ) {
		return '/';
	}
	return template.startsWith( prefix + '/' ) ? template.slice( prefix.length ) : template;
}

export function routeMethods( route: RouteInfo ): HttpMethod[] {
	const all = new Set( route.endpoints.flatMap( ( e ) => e.methods ) );
	return METHODS.filter( ( m ) => all.has( m ) );
}

export function endpointFor( route: RouteInfo, method: HttpMethod ): Endpoint | undefined {
	return route.endpoints.find( ( e ) => e.methods.includes( method ) );
}

export function isPublicRoute( route: RouteInfo ): boolean {
	return route.endpoints.some( ( e ) => e.isPublic );
}

export function filterRoutes( routes: RouteInfo[], filters: Filters ): RouteInfo[] {
	const terms = filters.search.trim().toLowerCase().split( /\s+/ ).filter( Boolean );

	return routes.filter( ( route ) => {
		if ( filters.publicOnly && ! isPublicRoute( route ) ) {
			return false;
		}
		if ( filters.methods.length > 0 ) {
			const methods = routeMethods( route );
			if ( ! filters.methods.some( ( m ) => methods.includes( m ) ) ) {
				return false;
			}
		}
		if ( terms.length > 0 ) {
			// plugin name is in there too, so typing "woo" finds WooCommerce's routes
			const haystack = `${ routeToTemplate( route.route ) } ${ route.source?.name ?? '' }`.toLowerCase();
			return terms.every( ( t ) => haystack.includes( t ) );
		}
		return true;
	} );
}

export interface RouteGroup {
	namespace: string;
	routes: RouteInfo[];
}

// Name to show for a whole namespace: whichever source owns most of its routes.
export function groupSource( routes: RouteInfo[] ): string | null {
	const counts = new Map< string, number >();
	routes.forEach( ( r ) => {
		// Skip the index route WordPress adds to every namespace (/wc/v3 itself).
		// Core registers it, so it would otherwise tip small namespaces to "WordPress".
		const label = sourceLabel( r );
		if ( label && r.route !== `/${ r.namespace }` ) {
			counts.set( label, ( counts.get( label ) ?? 0 ) + 1 );
		}
	} );
	let best: string | null = null;
	counts.forEach( ( n, name ) => {
		if ( best === null || n > ( counts.get( best ) ?? 0 ) ) {
			best = name;
		}
	} );
	return best;
}

export function sourceLabel( route: RouteInfo ): string | null {
	if ( ! route.source ) {
		return null;
	}
	if ( route.source.type === 'theme' ) {
		/* translators: %s: theme name */
		return sprintf( __( '%s (theme)', 'routemark' ), route.source.name );
	}
	if ( route.source.type === 'mu-plugin' ) {
		/* translators: %s: must-use plugin file or folder */
		return sprintf( __( '%s (must-use)', 'routemark' ), route.source.name );
	}
	return route.source.name;
}

// wp/v2 first, then other wp-* stuff, then plugins. Root routes at the bottom.
export function groupRoutes( routes: RouteInfo[] ): RouteGroup[] {
	const map = new Map< string, RouteInfo[] >();
	for ( const route of routes ) {
		const list = map.get( route.namespace ) ?? [];
		list.push( route );
		map.set( route.namespace, list );
	}

	const rank = ( ns: string ) => {
		if ( ns === '' ) {
			return 3;
		}
		if ( ns.startsWith( 'wp/' ) ) {
			return 0;
		}
		return ns.startsWith( 'wp-' ) ? 1 : 2;
	};

	return Array.from( map, ( [ namespace, list ] ) => ( { namespace, routes: list } ) ).sort(
		( a, b ) => rank( a.namespace ) - rank( b.namespace ) || a.namespace.localeCompare( b.namespace )
	);
}

export function typeLabel( type: unknown, format?: string ): string {
	const base = Array.isArray( type ) ? type.join( ' | ' ) : typeof type === 'string' ? type : 'any';
	return format ? `${ base } (${ format })` : base;
}
