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
				r.endpoints.filter( ( e ) => e.isPublic ).map( ( e ) => ( { route: r, methods: e.methods } ) )
			),
		[ routes ]
	);

	const endpointCount = routes.reduce( ( n, r ) => n + r.endpoints.length, 0 );

	return (
		<div className="rb-overview">
			<h2 className="rb-overview-title">{ __( 'Overview', 'restbench' ) }</h2>
			<p className="rb-overview-lede">
				{ sprintf(
					/* translators: 1: routes, 2: endpoints, 3: namespaces */
					__( '%1$d routes and %2$d endpoints across %3$d namespaces. Pick a route on the left to look inside it.', 'restbench' ),
					routes.length,
					endpointCount,
					namespaces.length
				) }
			</p>

			<section className="rb-overview-section">
				<h3 className="rb-section-title">{ __( 'Namespaces', 'restbench' ) }</h3>
				<div className="rb-table-wrap">
					<table className="rb-table rb-table--ns">
						<thead>
							<tr>
								<th>{ __( 'Namespace', 'restbench' ) }</th>
								<th>{ __( 'Added by', 'restbench' ) }</th>
								<th className="num">{ __( 'Routes', 'restbench' ) }</th>
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
										<button type="button" className="rb-link rb-link--mono" onClick={ () => onNamespace( row.namespace ) }>
											{ row.namespace || __( '(root)', 'restbench' ) }
										</button>
										{ hidden.includes( row.namespace ) && (
											<span className="rb-hidden-tag">{ __( 'hidden', 'restbench' ) }</span>
										) }
									</td>
									<td className="rb-ns-source">{ row.source ?? <span className="rb-muted">{ __( 'unknown', 'restbench' ) }</span> }</td>
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

			<section className="rb-overview-section">
				<h3 className="rb-section-title">{ __( 'Open to everyone', 'restbench' ) }</h3>
				<p className="rb-muted rb-note">
					{ createInterpolateElement(
						__( "These endpoints use <code>__return_true</code> as their permission check, so they work without logging in. Most are fine (oEmbed, the index), but it's worth knowing which ones they are.", 'restbench' ),
						{ code: <code /> }
					) }
				</p>
				{ open.length === 0 ? (
					<p className="rb-muted">{ __( 'None found.', 'restbench' ) }</p>
				) : (
					<ul className="rb-openlist">
						{ open.map( ( o, i ) => (
							<li key={ o.route.route + i }>
								<button type="button" onClick={ () => onPick( o.route.route ) }>
									<span className="rb-openlist-methods">
										{ o.methods.map( ( m ) => (
											<Method key={ m } method={ m } size="sm" />
										) ) }
									</span>
									<span className="rb-openlist-ns">{ o.route.namespace || '/' }</span>
									<PathText template={ localPath( o.route ) } />
								</button>
							</li>
						) ) }
					</ul>
				) }
			</section>

			<p className="rb-shortcuts">
				<kbd className="rb-kbd">/</kbd> { __( 'to search,', 'restbench' ) } <kbd className="rb-kbd">↑</kbd>
				<kbd className="rb-kbd">↓</kbd> { __( 'to move through the list,', 'restbench' ) } <kbd className="rb-kbd">Ctrl</kbd>+
				<kbd className="rb-kbd">Enter</kbd> { __( 'to send.', 'restbench' ) }
			</p>
		</div>
	);
}
