import apiFetch from '@wordpress/api-fetch';
import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import ImportDialog from './components/ImportDialog';
import Overview from './components/Overview';
import { useRecorder } from './components/RecordedList';
import ReportView from './components/ReportView';
import SettingsView from './components/SettingsView';
import Sidebar, { type SidebarView } from './components/Sidebar';
import { Icon, isIconName, Mark } from './components/ui';
import Workspace from './components/Workspace';
import { useHashRoute, useStoredState } from './lib/hooks';
import { filterRoutes, groupRoutes } from './lib/routes';
import { ExtensionBoundary, ExtensionSlot, getBrand, getPanels, useExtensions } from './lib/extensions';
import { LOGGED_OUT } from './lib/request';
import { matchRoute, replay, type Replay } from './lib/replay';
import { initialSettings, saveSettings } from './lib/settings';
import type { Draft, Filters, HistoryEntry, RoutesResponse, SendAsUser, Settings } from './types';

// tools.php?page=routemark&panel=report opens the Report, &panel=recorded the
// Recorded list (the admin bar and Site Health link there).
const START = new URLSearchParams( window.location.search ).get( 'panel' );

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
	const [ data, setData ] = useState< RoutesResponse | null >( null );
	const [ error, setError ] = useState< string | null >( null );
	const [ loading, setLoading ] = useState( true );
	const [ selected, setSelected ] = useHashRoute();
	const [ settings, setSettings ] = useState< Settings >( initialSettings );
	const [ saveStatus, setSaveStatus ] = useState< SaveStatus >( 'idle' );
	// Settings and the report take over the main area. null means the route view.
	// Built-in panels are 'settings' and 'report', add-on panels use their own id.
	const [ panel, setPanel ] = useState< string | null >( START === 'report' ? 'report' : null );
	const [ sidebarView, setSidebarView ] = useState< SidebarView >( START === 'recorded' ? 'recorded' : 'routes' );
	const [ recorder, setRecorder ] = useRecorder();
	const [ importing, setImporting ] = useState( false );
	// A one-line note above the workspace, e.g. what an import left out.
	const [ note, setNote ] = useState< string | null >( null );
	useExtensions();
	const extPanels = getPanels();
	const brand = getBrand();
	const showSettings = panel === 'settings';
	const [ history, setHistory ] = useStoredState< HistoryEntry[] >( `routemark.history.${ window.routemarkSettings?.userId ?? 0 }`, [] );
	const [ filters, setFilters ] = useState< Filters >( { search: '', methods: [], publicOnly: false, fields: false } );
	const [ preset, setPreset ] = useState< { id: string; draft: Draft } | null >( null );
	// Kept while you move between routes, but never saved: after a reload
	// you're always back to sending as yourself.
	const [ sendAs, setSendAs ] = useState< SendAsUser | null >( null );
	const searchRef = useRef< HTMLInputElement >( null );
	const saveTimer = useRef< number >( 0 );
	const topbarRef = useRef< HTMLElement >( null );
	const [ compact, setCompact ] = useState( false );
	const theme = settings.theme;

	// Apply right away, save in the background. If the save fails we put the
	// old values back, so the screen never shows something that isn't stored.
	const updateSettings = useCallback( ( patch: Partial< Settings > ) => {
		let before: Settings | null = null;
		setSettings( ( s ) => {
			before = s;
			return { ...s, ...patch };
		} );
		setSaveStatus( 'saving' );
		window.clearTimeout( saveTimer.current );
		saveSettings( patch )
			.then( ( saved ) => {
				setSettings( saved );
				setSaveStatus( 'saved' );
				saveTimer.current = window.setTimeout( () => setSaveStatus( 'idle' ), 2000 );
			} )
			.catch( () => {
				if ( before ) {
					setSettings( before );
				}
				setSaveStatus( 'error' );
			} );
	}, [] );

	const load = useCallback( () => {
		setLoading( true );
		setError( null );
		apiFetch< RoutesResponse >( { path: '/routemark/v1/routes' } )
			.then( setData )
			.catch( ( err: { message?: string } ) => setError( err.message ?? __( 'Could not load routes.', 'routemark' ) ) )
			.finally( () => setLoading( false ) );
	}, [] );

	useEffect( load, [ load ] );

	// 0.1.0 kept one shared, unredacted history under routemark.history, and
	// the theme lived in localStorage until it became a setting. Clear both out.
	useEffect( () => {
		try {
			window.localStorage.removeItem( 'routemark.history' );
			window.localStorage.removeItem( 'routemark.theme' );
		} catch {
			// storage blocked, nothing to clean up then
		}
	}, [] );

	// History follows the settings: off means empty, a smaller size trims it.
	useEffect( () => {
		setHistory( ( h ) => ( settings.keepHistory ? h.slice( 0, settings.historySize ) : [] ) );
	}, [ settings.keepHistory, settings.historySize, setHistory ] );

	// "/" focuses the filter, unless you're already typing somewhere
	useEffect( () => {
		const onKey = ( e: KeyboardEvent ) => {
			const t = e.target as HTMLElement;
			const typing = [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( t.tagName ) || t.isContentEditable;
			if ( e.key === '/' && ! typing ) {
				e.preventDefault();
				setPanel( null );
				searchRef.current?.focus();
				searchRef.current?.select();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [] );

	// Hidden namespaces drop out of the sidebar and search, not the overview.
	const visible = useMemo( () => {
		const hidden = new Set( settings.hiddenNamespaces );
		return data ? data.routes.filter( ( r ) => ! hidden.has( r.namespace ) ) : [];
	}, [ data, settings.hiddenNamespaces ] );

	const filtered = useMemo( () => filterRoutes( visible, filters ), [ visible, filters ] );

	// Opens a request that came from somewhere else: a recorded call, a cURL command, a link.
	const openReplay = useCallback(
		( result: Replay, message: string | null = null ) => {
			setPanel( null );
			setSelected( result.route.route );
			setPreset( { id: `${ Date.now() }`, draft: result.draft } );
			setNote( message );
		},
		[ setSelected ]
	);
	const groups = useMemo( () => groupRoutes( filtered ), [ filtered ] );
	const order = useMemo( () => groups.flatMap( ( g ) => g.routes.map( ( r ) => r.route ) ), [ groups ] );

	const pick = ( route: string | null ) => {
		setPanel( null );
		setPreset( null );
		setNote( null );
		setSelected( route );
	};

	// A REST URL from a response (a _links href, say). False if it's not one of ours.
	const openUrl = useCallback(
		( url: string, method = 'GET' ): boolean => {
			if ( ! data ) {
				return false;
			}
			const root = window.routemarkSettings?.restRoot ?? '/wp-json/';
			let path: string | null = null;
			try {
				const u = new URL( url, window.location.href );
				const r = new URL( root, window.location.href );
				if ( u.origin !== r.origin ) {
					return false;
				}
				const routeParam = u.searchParams.get( 'rest_route' );
				if ( routeParam !== null ) {
					u.searchParams.delete( 'rest_route' );
					path = routeParam + ( u.searchParams.toString() ? `?${ u.searchParams.toString() }` : '' );
				} else if ( u.pathname.startsWith( r.pathname.replace( /\/?$/, '/' ) ) ) {
					path = '/' + u.pathname.slice( r.pathname.replace( /\/?$/, '/' ).length ) + u.search;
				}
			} catch {
				return false;
			}
			const result = path !== null ? replay( data.routes, { method, path } ) : null;
			if ( ! result ) {
				return false;
			}
			openReplay( result );
			return true;
		},
		[ data, openReplay ]
	);

	const step = ( delta: number ) => {
		if ( order.length === 0 ) {
			return;
		}
		const i = selected ? order.indexOf( selected ) : -1;
		const next = i === -1 ? ( delta > 0 ? 0 : order.length - 1 ) : Math.min( order.length - 1, Math.max( 0, i + delta ) );
		pick( order[ next ] );
	};

	const record = useCallback(
		( entry: HistoryEntry ) => {
			if ( settings.keepHistory ) {
				setHistory( ( h ) => [ entry, ...h ].slice( 0, settings.historySize ) );
			}
		},
		[ setHistory, settings.keepHistory, settings.historySize ]
	);

	// With add-on panels the labels can outgrow the bar. Then they fold into
	// icons, and come back once the bar is wide enough to hold them again.
	const fullWidth = useRef( 0 );
	useEffect( () => {
		const bar = topbarRef.current;
		if ( ! bar || typeof ResizeObserver === 'undefined' ) {
			return;
		}
		const check = () => {
			if ( ! bar.classList.contains( 'is-compact' ) ) {
				fullWidth.current = bar.scrollWidth;
				setCompact( bar.scrollWidth > bar.clientWidth + 1 );
			} else {
				setCompact( fullWidth.current > bar.clientWidth + 1 );
			}
		};
		const observer = new ResizeObserver( check );
		observer.observe( bar );
		check();
		return () => observer.disconnect();
	}, [ extPanels.length ] );

	const current = data?.routes.find( ( r ) => r.route === selected ) ?? null;
	const themeLabel = theme === 'light' ? __( 'Switch to dark theme', 'routemark' ) : __( 'Switch to light theme', 'routemark' );

	return (
		<div className="rmk" data-theme={ theme }>
			<header className={ `rmk-topbar${ compact ? ' is-compact' : '' }` } ref={ topbarRef }>
				<button type="button" className="rmk-brand" onClick={ () => pick( null ) } title={ __( 'Overview', 'routemark' ) }>
					<Mark size={ 28 } />
					<span className="rmk-brand-name">
						Route<em>mark</em>
					</span>
					{ brand.edition && <span className="rmk-brand-edition">{ brand.edition }</span> }
					<span className="rmk-brand-version">
						{ window.routemarkSettings?.version ?? '' }
						{ brand.version && <span className="rmk-brand-addon-version"> · { brand.version }</span> }
					</span>
				</button>

				<div className="rmk-topbar-root" title={ __( 'REST API root', 'routemark' ) }>
					<code>{ window.routemarkSettings?.restRoot ?? '/wp-json/' }</code>
				</div>

				<span className="rmk-spacer" />

				<button
					type="button"
					className={ `rmk-btn rmk-btn--ghost${ loading ? ' is-spinning' : '' }` }
					onClick={ load }
					disabled={ loading }
					title={ __( 'Reload routes', 'routemark' ) }
				>
					<Icon name="refresh" size={ 15 } />
					<span className="rmk-hide-sm">{ __( 'Reload routes', 'routemark' ) }</span>
				</button>
				{ extPanels.map( ( p ) => (
					<button
						key={ p.id }
						type="button"
						className={ `rmk-btn rmk-btn--ghost rmk-ext-panel-btn${ panel === `ext:${ p.id }` ? ' is-active' : '' }` }
						aria-pressed={ panel === `ext:${ p.id }` }
						onClick={ () => setPanel( panel === `ext:${ p.id }` ? null : `ext:${ p.id }` ) }
						title={ p.label }
					>
						<Icon name={ isIconName( p.icon ) ? p.icon : 'puzzle' } size={ 16 } />
						<span className="rmk-hide-sm">{ p.label }</span>
					</button>
				) ) }
				<button type="button" className="rmk-btn rmk-btn--ghost" onClick={ () => setImporting( true ) } disabled={ ! data } title={ __( 'Import a cURL command', 'routemark' ) }>
					<Icon name="import" size={ 16 } />
					<span className="rmk-hide-sm">{ __( 'Import', 'routemark' ) }</span>
				</button>
				<button
					type="button"
					className={ `rmk-btn rmk-btn--ghost${ panel === 'report' ? ' is-active' : '' }` }
					aria-pressed={ panel === 'report' }
					onClick={ () => setPanel( panel === 'report' ? null : 'report' ) }
					title={ __( 'Report', 'routemark' ) }
				>
					<Icon name="shield" size={ 16 } />
					<span className="rmk-hide-sm">{ __( 'Report', 'routemark' ) }</span>
				</button>
				<button
					type="button"
					className="rmk-btn rmk-btn--icon rmk-btn--ghost"
					onClick={ () => updateSettings( { theme: theme === 'light' ? 'dark' : 'light' } ) }
					title={ themeLabel }
					aria-label={ themeLabel }
				>
					<Icon name={ theme === 'light' ? 'moon' : 'sun' } size={ 16 } />
				</button>
				<button
					type="button"
					className={ `rmk-btn rmk-btn--ghost${ showSettings ? ' is-active' : '' }` }
					aria-pressed={ showSettings }
					onClick={ () => setPanel( showSettings ? null : 'settings' ) }
					title={ __( 'Settings', 'routemark' ) }
				>
					<Icon name="sliders" size={ 16 } />
					<span className="rmk-hide-sm">{ __( 'Settings', 'routemark' ) }</span>
				</button>
			</header>

			<div className="rmk-body">
				<Sidebar
					groups={ groups }
					shown={ filtered.length }
					total={ visible.length }
					filters={ filters }
					selected={ panel ? null : selected }
					history={ history }
					searchRef={ searchRef }
					onFilters={ setFilters }
					onSelect={ pick }
					onRestore={ ( entry ) => {
						setPanel( null );
						setSelected( entry.route );
						setPreset( { id: entry.id, draft: entry.draft } );
					} }
					onClearHistory={ () => setHistory( [] ) }
					onStep={ step }
					view={ sidebarView }
					onView={ setSidebarView }
					recorder={ {
						state: recorder,
						onChange: setRecorder,
						canOpen: ( call ) => !! data && matchRoute( data.routes, call.path ) !== null,
						onOpen: ( call ) => {
							const result = data ? replay( data.routes, call ) : null;
							if ( result ) {
								openReplay(
									result,
									/* translators: 1: admin screen file, 2: time */
									sprintf( __( 'Recorded on %1$s at %2$s. Check the request before you send it, it runs against this site.', 'routemark' ), call.page, new Date( call.at ).toLocaleTimeString() )
								);
							}
						},
					} }
				/>

				<main className="rmk-main">
					{ error && (
						<div className="rmk-center">
							<div className="rmk-callout rmk-callout--error">
								<Icon name="alert" size={ 16 } />
								<div>
									<p>{ error }</p>
								</div>
							</div>
							<button type="button" className="rmk-btn rmk-btn--primary" onClick={ load }>
								<Icon name="refresh" size={ 15 } /> { __( 'Try again', 'routemark' ) }
							</button>
						</div>
					) }

					{ ! error && ! data && (
						<div className="rmk-skeleton" aria-busy="true" aria-label={ __( 'Loading routes', 'routemark' ) }>
							<span />
							<span />
							<span />
						</div>
					) }

					{ data && showSettings && (
						<SettingsView
							settings={ settings }
							routes={ data.routes }
							historyCount={ history.length }
							status={ saveStatus }
							onChange={ updateSettings }
							onClearHistory={ () => setHistory( [] ) }
						/>
					) }

					{ data && panel === 'report' && (
						<ReportView
							routes={ data.routes }
							onOpen={ ( route, loggedOut ) => {
								if ( loggedOut ) {
									setSendAs( LOGGED_OUT );
								}
								pick( route );
							} }
						/>
					) }

					{ data &&
						extPanels
							.filter( ( p ) => panel === `ext:${ p.id }` )
							.map( ( p ) => (
								<div key={ p.id } className="rmk-overview rmk-ext-panel">
									<ExtensionBoundary name={ p.label }>
										<ExtensionSlot
											render={ () =>
												p.render( {
													routes: data.routes,
													settings,
													openRoute: ( route, options ) => {
														if ( options && 'sendAs' in options ) {
															setSendAs( options.sendAs ?? null );
														}
														pick( route );
													},
												} )
											}
										/>
									</ExtensionBoundary>
								</div>
							) ) }

					{ data && ! panel && ! current && (
						<Overview
							routes={ data.routes }
							namespaces={ data.namespaces }
							hidden={ settings.hiddenNamespaces }
							onPick={ pick }
							onNamespace={ ( ns ) => {
								// Clicking a hidden namespace in the overview un-hides it,
								// otherwise the filter would show nothing.
								if ( settings.hiddenNamespaces.includes( ns ) ) {
									updateSettings( { hiddenNamespaces: settings.hiddenNamespaces.filter( ( n ) => n !== ns ) } );
								}
								setFilters( { search: ns, methods: [], publicOnly: false, fields: false } );
								searchRef.current?.focus();
							} }
						/>
					) }

					{ data && ! panel && current && note && (
						<div className="rmk-callout rmk-callout--info rmk-main-note" role="status">
							<Icon name="alert" size={ 16 } />
							<div>
								<p>{ note }</p>
							</div>
							<button type="button" className="rmk-btn rmk-btn--icon rmk-btn--ghost" onClick={ () => setNote( null ) } aria-label={ __( 'Dismiss', 'routemark' ) }>
								<Icon name="x" size={ 14 } />
							</button>
						</div>
					) }

					{ data && ! panel && current && (
						<Workspace
							key={ current.route + ( preset?.id ?? '' ) }
							route={ current }
							settings={ settings }
							preset={ preset?.draft ?? null }
							sendAs={ sendAs }
							onSendAs={ setSendAs }
							onRecord={ record }
							onOpenUrl={ openUrl }
						/>
					) }
				</main>
			</div>

			{ importing && data && (
				<ImportDialog
					routes={ data.routes }
					onClose={ () => setImporting( false ) }
					onImport={ ( result ) => {
						setImporting( false );
						openReplay(
							result,
							result.dropped.length
								? sprintf(
										/* translators: %s: comma-separated header names */
										__( 'Imported. Left out these headers, since Routemark sends the request with your login: %s.', 'routemark' ),
										result.dropped.join( ', ' )
								  )
								: __( 'Imported. Check the request before you send it, it runs against this site.', 'routemark' )
						);
					} }
				/>
			) }
		</div>
	);
}
