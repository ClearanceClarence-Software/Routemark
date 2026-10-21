import apiFetch from '@wordpress/api-fetch';
import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import Overview from './components/Overview';
import SettingsView from './components/SettingsView';
import Sidebar from './components/Sidebar';
import { Icon, Mark } from './components/ui';
import Workspace from './components/Workspace';
import { useHashRoute, useStoredState } from './lib/hooks';
import { filterRoutes, groupRoutes } from './lib/routes';
import { initialSettings, saveSettings } from './lib/settings';
import type { Draft, Filters, HistoryEntry, RoutesResponse, Settings } from './types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
	const [ data, setData ] = useState< RoutesResponse | null >( null );
	const [ error, setError ] = useState< string | null >( null );
	const [ loading, setLoading ] = useState( true );
	const [ selected, setSelected ] = useHashRoute();
	const [ settings, setSettings ] = useState< Settings >( initialSettings );
	const [ saveStatus, setSaveStatus ] = useState< SaveStatus >( 'idle' );
	const [ showSettings, setShowSettings ] = useState( false );
	const [ history, setHistory ] = useStoredState< HistoryEntry[] >( `restbench.history.${ window.restbenchSettings?.userId ?? 0 }`, [] );
	const [ filters, setFilters ] = useState< Filters >( { search: '', methods: [], publicOnly: false } );
	const [ preset, setPreset ] = useState< { id: string; draft: Draft } | null >( null );
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
		apiFetch< RoutesResponse >( { path: '/restbench/v1/routes' } )
			.then( setData )
			.catch( ( err: { message?: string } ) => setError( err.message ?? __( 'Could not load routes.', 'restbench' ) ) )
			.finally( () => setLoading( false ) );
	}, [] );

	useEffect( load, [ load ] );

	// 0.1.0 kept one shared, unredacted history under restbench.history, and
	// the theme lived in localStorage until it became a setting. Clear both out.
	useEffect( () => {
		try {
			window.localStorage.removeItem( 'restbench.history' );
			window.localStorage.removeItem( 'restbench.theme' );
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
				setShowSettings( false );
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
		setShowSettings( false );
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
	const themeLabel = theme === 'light' ? __( 'Switch to dark theme', 'restbench' ) : __( 'Switch to light theme', 'restbench' );

	return (
		<div className="rb" data-theme={ theme }>
			<header className="rb-topbar">
				<button type="button" className="rb-brand" onClick={ () => pick( null ) } title={ __( 'Overview', 'restbench' ) }>
					<Mark size={ 28 } />
					<span className="rb-brand-name">Restbench</span>
					<span className="rb-brand-version">{ window.restbenchSettings?.version ?? '' }</span>
				</button>

				<div className="rb-topbar-root" title={ __( 'REST API root', 'restbench' ) }>
					<code>{ window.restbenchSettings?.restRoot ?? '/wp-json/' }</code>
				</div>

				<span className="rb-spacer" />

				<button
					type="button"
					className={ `rb-btn rb-btn--ghost${ loading ? ' is-spinning' : '' }` }
					onClick={ load }
					disabled={ loading }
				>
					<Icon name="refresh" size={ 15 } />
					<span className="rb-hide-sm">{ __( 'Reload routes', 'restbench' ) }</span>
				</button>
				<button
					type="button"
					className="rb-btn rb-btn--icon rb-btn--ghost"
					onClick={ () => updateSettings( { theme: theme === 'light' ? 'dark' : 'light' } ) }
					title={ themeLabel }
					aria-label={ themeLabel }
				>
					<Icon name={ theme === 'light' ? 'moon' : 'sun' } size={ 16 } />
				</button>
				<button
					type="button"
					className={ `rb-btn rb-btn--ghost${ showSettings ? ' is-active' : '' }` }
					aria-pressed={ showSettings }
					onClick={ () => setShowSettings( ! showSettings ) }
				>
					<Icon name="sliders" size={ 16 } />
					<span className="rb-hide-sm">{ __( 'Settings', 'restbench' ) }</span>
				</button>
			</header>

			<div className="rb-body">
				<Sidebar
					groups={ groups }
					shown={ filtered.length }
					total={ visible.length }
					filters={ filters }
					selected={ showSettings ? null : selected }
					history={ history }
					searchRef={ searchRef }
					onFilters={ setFilters }
					onSelect={ pick }
					onRestore={ ( entry ) => {
						setShowSettings( false );
						setSelected( entry.route );
						setPreset( { id: entry.id, draft: entry.draft } );
					} }
					onClearHistory={ () => setHistory( [] ) }
					onStep={ step }
				/>

				<main className="rb-main">
					{ error && (
						<div className="rb-center">
							<div className="rb-callout rb-callout--error">
								<Icon name="alert" size={ 16 } />
								<div>
									<p>{ error }</p>
								</div>
							</div>
							<button type="button" className="rb-btn rb-btn--primary" onClick={ load }>
								<Icon name="refresh" size={ 15 } /> { __( 'Try again', 'restbench' ) }
							</button>
						</div>
					) }

					{ ! error && ! data && (
						<div className="rb-skeleton" aria-busy="true" aria-label={ __( 'Loading routes', 'restbench' ) }>
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

					{ data && ! showSettings && ! current && (
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

					{ data && ! showSettings && current && (
						<Workspace
							key={ current.route + ( preset?.id ?? '' ) }
							route={ current }
							settings={ settings }
							preset={ preset?.draft ?? null }
							onRecord={ record }
						/>
					) }
				</main>
			</div>
		</div>
	);
}
