import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { RefObject } from 'react';

import { groupSource, isPublicRoute, localPath, routeMethods, type RouteGroup } from '../lib/routes';
import { METHODS } from '../types';
import type { Filters, HistoryEntry, HttpMethod } from '../types';
import { Icon, Method, PathText } from './ui';

interface Props {
	groups: RouteGroup[];
	shown: number;
	total: number;
	filters: Filters;
	selected: string | null;
	history: HistoryEntry[];
	searchRef: RefObject< HTMLInputElement | null >;
	onFilters: ( f: Filters ) => void;
	onSelect: ( route: string ) => void;
	onRestore: ( entry: HistoryEntry ) => void;
	onClearHistory: () => void;
	onStep: ( delta: number ) => void;
}

function timeAgo( at: number ): string {
	const s = Math.round( ( Date.now() - at ) / 1000 );
	if ( s < 60 ) {
		return __( 'just now', 'restbench' );
	}
	const m = Math.round( s / 60 );
	if ( m < 60 ) {
		/* translators: %d: minutes */
		return sprintf( __( '%d min ago', 'restbench' ), m );
	}
	const h = Math.round( m / 60 );
	if ( h < 24 ) {
		/* translators: %d: hours */
		return sprintf( __( '%d h ago', 'restbench' ), h );
	}
	return new Date( at ).toLocaleDateString();
}

export default function Sidebar( {
	groups,
	shown,
	total,
	filters,
	selected,
	history,
	searchRef,
	onFilters,
	onSelect,
	onRestore,
	onClearHistory,
	onStep,
}: Props ) {
	const [ view, setView ] = useState< 'routes' | 'history' >( 'routes' );
	const [ collapsed, setCollapsed ] = useState< Set< string > >( () => new Set() );
	const listRef = useRef< HTMLDivElement >( null );

	const filtering = filters.search !== '' || filters.methods.length > 0 || filters.publicOnly;

	// keep the selected route on screen when stepping with the arrow keys
	useEffect( () => {
		listRef.current?.querySelector( '.rb-route.is-selected' )?.scrollIntoView( { block: 'nearest' } );
	}, [ selected ] );

	const toggleGroup = ( ns: string ) =>
		setCollapsed( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( ns ) ) {
				next.delete( ns );
			} else {
				next.add( ns );
			}
			return next;
		} );

	const toggleMethod = ( m: HttpMethod ) =>
		onFilters( {
			...filters,
			methods: filters.methods.includes( m ) ? filters.methods.filter( ( x ) => x !== m ) : [ ...filters.methods, m ],
		} );

	return (
		<aside className="rb-sidebar">
			<div className="rb-sidebar-switch" role="tablist" aria-label={ __( 'Sidebar', 'restbench' ) }>
				<button
					type="button"
					role="tab"
					aria-selected={ view === 'routes' }
					className={ view === 'routes' ? 'is-active' : '' }
					onClick={ () => setView( 'routes' ) }
				>
					<Icon name="list" size={ 14 } /> { __( 'Routes', 'restbench' ) }
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={ view === 'history' }
					className={ view === 'history' ? 'is-active' : '' }
					onClick={ () => setView( 'history' ) }
				>
					<Icon name="clock" size={ 14 } /> { __( 'History', 'restbench' ) }
					{ history.length > 0 && <span className="rb-tab-count">{ history.length }</span> }
				</button>
			</div>

			{ view === 'routes' && (
				<>
					<div className="rb-filters">
						<label className="rb-search">
							<Icon name="search" size={ 15 } />
							<span className="screen-reader-text">{ __( 'Filter routes', 'restbench' ) }</span>
							<input
								ref={ searchRef }
								type="search"
								className="rb-search-input"
								placeholder={ __( 'Filter routes', 'restbench' ) }
								value={ filters.search }
								onChange={ ( e ) => onFilters( { ...filters, search: e.target.value } ) }
								onKeyDown={ ( e ) => {
									if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
										e.preventDefault();
										onStep( e.key === 'ArrowDown' ? 1 : -1 );
									} else if ( e.key === 'Escape' ) {
										onFilters( { ...filters, search: '' } );
									}
								} }
							/>
							<kbd className="rb-kbd">/</kbd>
						</label>

						<div className="rb-chips" role="group" aria-label={ __( 'Filter by method', 'restbench' ) }>
							{ METHODS.map( ( m ) => (
								<button
									key={ m }
									type="button"
									aria-pressed={ filters.methods.includes( m ) }
									className={ `rb-chip rb-chip--${ m.toLowerCase() }${ filters.methods.includes( m ) ? ' is-on' : '' }` }
									onClick={ () => toggleMethod( m ) }
								>
									{ m }
								</button>
							) ) }
							<button
								type="button"
								aria-pressed={ filters.publicOnly }
								className={ `rb-chip rb-chip--public${ filters.publicOnly ? ' is-on' : '' }` }
								onClick={ () => onFilters( { ...filters, publicOnly: ! filters.publicOnly } ) }
								title={ __( 'Only endpoints anyone can call without logging in', 'restbench' ) }
							>
								<Icon name="globe" size={ 12 } /> { __( 'Public', 'restbench' ) }
							</button>
						</div>

						<div className="rb-filter-meta">
							<span>
								{ sprintf(
									/* translators: 1: routes shown, 2: total routes */
									__( '%1$d of %2$d routes', 'restbench' ),
									shown,
									total
								) }
							</span>
							{ filtering && (
								<button
									type="button"
									className="rb-link"
									onClick={ () => onFilters( { search: '', methods: [], publicOnly: false } ) }
								>
									{ __( 'Clear filters', 'restbench' ) }
								</button>
							) }
						</div>
					</div>

					<div className="rb-tree" ref={ listRef }>
						{ groups.length === 0 && <p className="rb-tree-empty">{ __( 'No routes match these filters.', 'restbench' ) }</p> }

						{ groups.map( ( group ) => {
							const isCollapsed = collapsed.has( group.namespace ) && ! filtering;
							return (
								<section key={ group.namespace } className="rb-group">
									<button
										type="button"
										className={ `rb-group-head${ isCollapsed ? ' is-collapsed' : '' }` }
										aria-expanded={ ! isCollapsed }
										onClick={ () => toggleGroup( group.namespace ) }
									>
										<Icon name="chevron" size={ 13 } />
										<span className="rb-group-label">
											<span className="rb-group-name">{ group.namespace || __( '(root)', 'restbench' ) }</span>
											{ groupSource( group.routes ) && (
												<span className="rb-group-source">{ groupSource( group.routes ) }</span>
											) }
										</span>
										<span className="rb-group-count">{ group.routes.length }</span>
									</button>

									{ ! isCollapsed && (
										<ul className="rb-routes">
											{ group.routes.map( ( route ) => (
												<li key={ route.route }>
													<button
														type="button"
														className={ `rb-route${ route.route === selected ? ' is-selected' : '' }` }
														onClick={ () => onSelect( route.route ) }
														title={ route.route }
													>
														<span className="rb-route-path">
															<PathText template={ localPath( route ) } />
														</span>
														{ isPublicRoute( route ) && (
															<span className="rb-route-public" title={ __( 'Has public endpoints', 'restbench' ) }>
																<Icon name="globe" size={ 13 } />
															</span>
														) }
														<span className="rb-route-methods">
															{ routeMethods( route ).map( ( m ) => (
																<Method key={ m } method={ m } size="sm" />
															) ) }
														</span>
													</button>
												</li>
											) ) }
										</ul>
									) }
								</section>
							);
						} ) }
					</div>
				</>
			) }

			{ view === 'history' && (
				<div className="rb-tree">
					{ history.length === 0 ? (
						<p className="rb-tree-empty">{ __( 'Nothing here yet. Every request you send gets added to this list.', 'restbench' ) }</p>
					) : (
						<>
							<ul className="rb-history">
								{ history.map( ( entry ) => (
									<li key={ entry.id }>
										<button type="button" className="rb-history-item" onClick={ () => onRestore( entry ) }>
											<span className="rb-history-top">
												<Method method={ entry.draft.method } size="sm" />
												<span className={ `rb-status-dot rb-status--${ Math.floor( entry.status / 100 ) }xx` }>
													{ entry.status || 'ERR' }
												</span>
												<span className="rb-history-time">{ timeAgo( entry.at ) }</span>
											</span>
											<span className="rb-history-path">{ entry.path }</span>
										</button>
									</li>
								) ) }
							</ul>
							<button type="button" className="rb-btn rb-btn--ghost rb-history-clear" onClick={ onClearHistory }>
								<Icon name="trash" size={ 14 } />
								{ sprintf(
									/* translators: %d: number of history entries */
									_n( 'Clear %d request', 'Clear %d requests', history.length, 'restbench' ),
									history.length
								) }
							</button>
						</>
					) }
				</div>
			) }
		</aside>
	);
}
