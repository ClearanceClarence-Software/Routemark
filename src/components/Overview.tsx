import { createInterpolateElement, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { groupRoutes, groupSource, localPath } from '../lib/routes';
import { METHODS } from '../types';
import type { RouteInfo } from '../types';
import { Method, PathText } from './ui';

interface Props {
	routes: RouteInfo[];
	namespaces: string[];
	onPick: ( route: string ) => void;
	onNamespace: ( ns: string ) => void;
	hidden: string[];
}

export default function Overview( { routes, namespaces, onPick, onNamespace, hidden }: Props ) {
	const rows = useMemo(
		() =>
			groupRoutes( routes )
				.map( ( g ) => {
					const endpoints = g.routes.flatMap( ( r ) => r.endpoints );
					const counts = METHODS.map( ( m ) => endpoints.filter( ( e ) => e.methods.includes( m ) ).length );
					return { namespace: g.namespace, source: groupSource( g.routes ), routes: g.routes.length, counts };
				} )
				.sort( ( a, b ) => b.routes - a.routes ),
		[ routes ]
	);

	const open = useMemo(
		() =>
			routes.flatMap( ( r ) =>
				// Skip /wc/v3 and friends, every namespace has one and they're always public.
				r.route === `/${ r.namespace }`
					? []
					: r.endpoints.filter( ( e ) => e.isPublic ).map( ( e ) => ( { route: r, methods: e.methods } ) )
			),
		[ routes ]
	);

	const endpointCount = routes.reduce( ( n, r ) => n + r.endpoints.length, 0 );

	return (
		<div className="rmk-overview">
			<h2 className="rmk-overview-title">{ __( 'Overview', 'routemark' ) }</h2>
			<p className="rmk-overview-lede">
				{ sprintf(
					/* translators: 1: routes, 2: endpoints, 3: namespaces */
					__( '%1$d routes and %2$d endpoints across %3$d namespaces. Pick a route on the left to look inside it.', 'routemark' ),
					routes.length,
					endpointCount,
					namespaces.length
				) }
			</p>

			<section className="rmk-overview-section">
				<h3 className="rmk-section-title">{ __( 'Namespaces', 'routemark' ) }</h3>
				<div className="rmk-table-wrap">
					<table className="rmk-table rmk-table--ns">
						<thead>
							<tr>
								<th>{ __( 'Namespace', 'routemark' ) }</th>
								<th className="num">{ __( 'Routes', 'routemark' ) }</th>
								{ METHODS.map( ( m ) => (
									<th key={ m } className="num">
										{ m }
									</th>
								) ) }
							</tr>
						</thead>
						<tbody>
							{ rows.map( ( row ) => (
								<tr key={ row.namespace }>
									<td>
										<button type="button" className="rmk-link rmk-link--mono" onClick={ () => onNamespace( row.namespace ) }>
											{ row.namespace || __( '(root)', 'routemark' ) }
										</button>
										{ hidden.includes( row.namespace ) && (
											<span className="rmk-hidden-tag">{ __( 'hidden', 'routemark' ) }</span>
										) }
										{ /* Under the namespace, like the sidebar, so the counts always fit. */ }
										<span className="rmk-ns-source">{ row.source ?? <span className="rmk-muted">{ __( 'unknown', 'routemark' ) }</span> }</span>
									</td>
									<td className="num">{ row.routes }</td>
									{ row.counts.map( ( c, i ) => (
										<td key={ METHODS[ i ] } className={ `num${ c === 0 ? ' is-zero' : '' }` }>
											{ c || '·' }
										</td>
									) ) }
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			</section>

			<section className="rmk-overview-section">
				<h3 className="rmk-section-title">{ __( 'Open to everyone', 'routemark' ) }</h3>
				<p className="rmk-muted rmk-note">
					{ createInterpolateElement(
						__( "These endpoints work without logging in, either because their permission check is <code>__return_true</code> or because they don't have one. Most are fine (oEmbed, the index), but it's worth knowing which ones they are. The Report at the top goes through the rest.", 'routemark' ),
						{ code: <code /> }
					) }
				</p>
				{ open.length === 0 ? (
					<p className="rmk-muted">{ __( 'None found.', 'routemark' ) }</p>
				) : (
					<ul className="rmk-openlist">
						{ open.map( ( o, i ) => (
							<li key={ o.route.route + i }>
								<button type="button" onClick={ () => onPick( o.route.route ) }>
									<span className="rmk-openlist-methods">
										{ o.methods.map( ( m ) => (
											<Method key={ m } method={ m } size="sm" />
										) ) }
									</span>
									<span className="rmk-openlist-ns">{ o.route.namespace || '/' }</span>
									<PathText template={ localPath( o.route ) } />
								</button>
							</li>
						) ) }
					</ul>
				) }
			</section>

			<p className="rmk-shortcuts">
				<kbd className="rmk-kbd">/</kbd> { __( 'to search,', 'routemark' ) } <kbd className="rmk-kbd">↑</kbd>
				<kbd className="rmk-kbd">↓</kbd> { __( 'to move through the list,', 'routemark' ) } <kbd className="rmk-kbd">Ctrl</kbd>+
				<kbd className="rmk-kbd">Enter</kbd> { __( 'to send.', 'routemark' ) }
			</p>
		</div>
	);
}
