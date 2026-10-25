import apiFetch from '@wordpress/api-fetch';
import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import Overview from './components/Overview';
import ReportView from './components/ReportView';
import SettingsView from './components/SettingsView';
import Sidebar from './components/Sidebar';
import { Icon, Mark } from './components/ui';
import Workspace from './components/Workspace';
import { useHashRoute, useStoredState } from './lib/hooks';
import { filterRoutes, groupRoutes } from './lib/routes';
import { LOGGED_OUT } from './lib/request';
import { initialSettings, saveSettings } from './lib/settings';
import type { Draft, Filters, HistoryEntry, RoutesResponse, SendAsUser, Settings } from './types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
	const [ data, setData ] = useState< RoutesResponse | null >( null );
	const [ error, setError ] = useState< string | null >( null );
	const [ loading, setLoading ] = useState( true );
	const [ selected, setSelected ] = useHashRoute();
	const [ settings, setSettings ] = useState< Settings >( initialSettings );
	const [ saveStatus, setSaveStatus ] = useState< SaveStatus >( 'idle' );
	// Settings and the report take over the main area. null means the route view.
	const [ panel, setPanel ] = useState< 'settings' | 'report' | null >( null );
	const showSettings = panel === 'settings';
	const [ history, setHistory ] = useStoredState< HistoryEntry[] >( `routemark.history.${ window.routemarkSettings?.userId ?? 0 }`, [] );
	const [ filters, setFilters ] = useState< Filters >( { search: '', methods: [], publicOnly: false } );
	const [ preset, setPreset ] = useState< { id: string; draft: Draft } | null >( null );
	// Kept while you move between routes, but never saved: after a reload
	// you're always back to sending as yourself.
	const [ sendAs, setSendAs ] = useState< SendAsUser | null >( null );
	const searchRef = useRef< HTMLInputElement >( null );
	const saveTimer = useRef< number >( 0 );
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
	const groups = useMemo( () => groupRoutes( filtered ), [ filtered ] );
	const order = useMemo( () => groups.flatMap( ( g ) => g.routes.map( ( r ) => r.route ) ), [ groups ] );

	const pick = ( route: string | null ) => {
		setPanel( null );
		setPreset( null );
		setSelected( route );
	};

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

	const current = data?.routes.find( ( r ) => r.route === selected ) ?? null;
	const themeLabel = theme === 'light' ? __( 'Switch to dark theme', 'routemark' ) : __( 'Switch to light theme', 'routemark' );

	return (
		<div className="rmk" data-theme={ theme }>
			<header className="rmk-topbar">
				<button type="button" className="rmk-brand" onClick={ () => pick( null ) } title={ __( 'Overview', 'routemark' ) }>
					<Mark size={ 28 } />
					<span className="rmk-brand-name">
						Route<em>mark</em>
					</span>
					<span className="rmk-brand-version">{ window.routemarkSettings?.version ?? '' }</span>
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
				>
					<Icon name="refresh" size={ 15 } />
					<span className="rmk-hide-sm">{ __( 'Reload routes', 'routemark' ) }</span>
				</button>
				<button
					type="button"
					className={ `rmk-btn rmk-btn--ghost${ panel === 'report' ? ' is-active' : '' }` }
					aria-pressed={ panel === 'report' }
					onClick={ () => setPanel( panel === 'report' ? null : 'report' ) }
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
								setFilters( { search: ns, methods: [], publicOnly: false } );
								searchRef.current?.focus();
							} }
						/>
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
						/>
					) }
				</main>
			</div>
		</div>
	);
}
