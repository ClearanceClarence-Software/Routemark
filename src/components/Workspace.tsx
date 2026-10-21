import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { buildPath, fullUrl, hasBody, jsonError, missingParams, newDraft, redactDraft, redactPath, sampleBody, send, switchMethod, uid } from '../lib/request';
import { endpointFor, routeMethods, routeToTemplate, sourceLabel, templateParams, typeLabel } from '../lib/routes';
import { buildSnippet, SNIPPET_LABELS, type SnippetKind } from '../lib/snippets';
import { needsConfirm } from '../lib/settings';
import type { Draft, HistoryEntry, HttpMethod, RouteInfo, RunResult, Settings } from '../types';
import CodeEditor from './CodeEditor';
import DocsView from './DocsView';
import KeyValueEditor from './KeyValueEditor';
import ResponsePanel from './ResponsePanel';
import { CopyButton, Icon, PathText, Tabs } from './ui';

type Tab = 'params' | 'body' | 'headers' | 'docs' | 'code';

interface Props {
	route: RouteInfo;
	settings: Settings;
	preset: Draft | null;
	onRecord: ( entry: HistoryEntry ) => void;
}

export default function Workspace( { route, settings, preset, onRecord }: Props ) {
	const [ draft, setDraft ] = useState< Draft >( () => preset ?? newDraft( route, undefined, settings.suggestParams ) );
	const [ result, setResult ] = useState< RunResult | null >( null );
	const [ running, setRunning ] = useState( false );
	const [ snippet, setSnippet ] = useState< SnippetKind >( settings.snippetLanguage );
	const [ armed, setArmed ] = useState( false );

	const template = routeToTemplate( route.route );
	const source = sourceLabel( route );
	const params = templateParams( template );
	const methods = routeMethods( route );
	const endpoint = endpointFor( route, draft.method );
	const path = buildPath( route, draft );
	const missing = missingParams( draft );
	const bodyError = hasBody( draft.method ) ? jsonError( draft.body ) : null;
	const enabledQuery = draft.query.filter( ( r ) => r.enabled ).length;
	const enabledHeaders = draft.headers.filter( ( r ) => r.enabled && r.key ).length;
	const canSend = ! running && missing.length === 0 && ! bodyError;
	const destructive = draft.method === 'DELETE';

	const [ tab, setTab ] = useState< Tab >( () =>
		params.length === 0 && draft.query.length === 0 && ! hasBody( draft.method ) ? 'docs' : 'params'
	);

	const confirmFirst = needsConfirm( settings.confirmWrites, draft.method );

	// Anything you change after the first click disarms it again.
	useEffect( () => setArmed( false ), [ draft ] );
	useEffect( () => {
		if ( ! armed ) {
			return;
		}
		const t = window.setTimeout( () => setArmed( false ), 4000 );
		return () => window.clearTimeout( t );
	}, [ armed ] );

	const run = useCallback( async () => {
		if ( ! canSend ) {
			return;
		}
		if ( confirmFirst && ! armed ) {
			setArmed( true );
			return;
		}
		setArmed( false );
		setRunning( true );
		const res = await send( path, draft );
		setResult( res );
		setRunning( false );
		onRecord( {
			id: uid(),
			at: Date.now(),
			route: route.route,
			path: redactPath( path ),
			status: res.status,
			durationMs: res.durationMs,
			draft: redactDraft( draft ),
		} );
	}, [ canSend, confirmFirst, armed, path, draft, route.route, onRecord ] );

	// Ctrl/Cmd+Enter sends, from anywhere on the page
	const runRef = useRef( run );
	runRef.current = run;
	useEffect( () => {
		const onKey = ( e: KeyboardEvent ) => {
			if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
				e.preventDefault();
				runRef.current();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [] );

	const setMethod = ( m: HttpMethod ) => {
		setDraft( switchMethod( route, draft, m, settings.suggestParams ) );
		if ( tab === 'body' && ! hasBody( m ) ) {
			setTab( 'params' );
		}
	};

	return (
		<div className="rb-workspace">
			<header className="rb-ws-head">
				<div className="rb-ws-title">
					<p className="rb-eyebrow">
						{ route.namespace || __( 'root', 'restbench' ) }
						{ source && (
							<span className="rb-ws-source">
								{ /* translators: %s: plugin, theme or "WordPress" */ sprintf( __( 'from %s', 'restbench' ), source ) }
							</span>
						) }
					</p>
					<h2>
						<PathText template={ template } />
					</h2>
				</div>
				<div className="rb-ws-badges">
					{ endpoint?.isPublic ? (
						<span className="rb-badge rb-badge--public">
							<Icon name="globe" size={ 12 } /> { __( 'Public', 'restbench' ) }
						</span>
					) : (
						<span className="rb-badge">
							<Icon name="lock" size={ 12 } /> { __( 'Needs permission', 'restbench' ) }
						</span>
					) }
				</div>
			</header>

			<div className="rb-ws-split">
				<section className="rb-request">
					<form
						className="rb-address"
						onSubmit={ ( e ) => {
							e.preventDefault();
							run();
						} }
					>
						<label className="screen-reader-text" htmlFor="rb-method">
							{ __( 'Method', 'restbench' ) }
						</label>
						<select
							id="rb-method"
							className={ `rb-address-method rb-method--${ draft.method.toLowerCase() }` }
							value={ draft.method }
							onChange={ ( e ) => setMethod( e.target.value as HttpMethod ) }
							disabled={ methods.length < 2 }
						>
							{ methods.map( ( m ) => (
								<option key={ m } value={ m }>
									{ m }
								</option>
							) ) }
						</select>
						<div className="rb-address-path" title={ fullUrl( path ) }>
							<PathText template={ path } />
						</div>
						<CopyButton text={ fullUrl( path ) } label={ __( 'URL', 'restbench' ) } />
						<button
							type="submit"
							className={ `rb-btn rb-btn--primary${ destructive ? ' rb-btn--danger-fill' : '' }${ armed ? ' is-armed' : '' }` }
							disabled={ ! canSend }
						>
							{ running ? <span className="rb-spinner" /> : <Icon name={ armed ? 'alert' : 'send' } size={ 15 } /> }
							{ armed
								? /* translators: %s: HTTP method */ sprintf( __( 'Click again to %s', 'restbench' ), draft.method )
								: __( 'Send', 'restbench' ) }
						</button>
					</form>

					{ ( missing.length > 0 || bodyError || destructive ) && (
						<div className="rb-address-notes">
							{ missing.length > 0 && (
								<p className="rb-hint">
									<Icon name="alert" size={ 14 } />
									{ sprintf(
										/* translators: %s: list of path parameters */
										__( 'Fill in %s under Params before sending.', 'restbench' ),
										missing.map( ( m ) => `{${ m }}` ).join( ', ' )
									) }
								</p>
							) }
							{ bodyError && (
								<p className="rb-hint rb-hint--error">
									<Icon name="alert" size={ 14 } />
									{ __( 'The body is not valid JSON:', 'restbench' ) } { bodyError }
								</p>
							) }
							{ destructive && missing.length === 0 && (
								<p className="rb-hint rb-hint--error">
									<Icon name="alert" size={ 14 } />
									{ __( 'Careful, this is a real DELETE and it runs against this site.', 'restbench' ) }
								</p>
							) }
						</div>
					) }

					<Tabs< Tab >
						label={ __( 'Request', 'restbench' ) }
						active={ tab }
						onChange={ setTab }
						tabs={ [
							{ id: 'params', label: __( 'Params', 'restbench' ), count: params.length + enabledQuery },
							{ id: 'body', label: __( 'Body', 'restbench' ), hidden: ! hasBody( draft.method ) },
							{ id: 'headers', label: __( 'Headers', 'restbench' ), count: enabledHeaders },
							{ id: 'docs', label: __( 'Docs', 'restbench' ) },
							{ id: 'code', label: __( 'Code', 'restbench' ) },
						] }
					/>

					<div className="rb-tab-panel">
						{ tab === 'params' && (
							<>
								{ params.length > 0 && (
									<div className="rb-section">
										<h4 className="rb-label">{ __( 'Path parameters', 'restbench' ) }</h4>
										<div className="rb-pathparams">
											{ params.map( ( p ) => {
												const arg = endpoint?.args[ p ];
												return (
													<label key={ p } className="rb-pathparam">
														<span className="rb-pathparam-name">
															<code>{ `{${ p }}` }</code>
															{ arg && <span className="rb-kv-type">{ typeLabel( arg.type, arg.format ) }</span> }
														</span>
														<input
															type="text"
															className={ `rb-input rb-input--mono${ draft.pathParams[ p ] ? '' : ' is-missing' }` }
															value={ draft.pathParams[ p ] ?? '' }
															placeholder={ arg?.description ?? p }
															onChange={ ( e ) =>
																setDraft( { ...draft, pathParams: { ...draft.pathParams, [ p ]: e.target.value } } )
															}
														/>
													</label>
												);
											} ) }
										</div>
									</div>
								) }

								<div className="rb-section">
									<h4 className="rb-label">{ __( 'Query parameters', 'restbench' ) }</h4>
									{ hasBody( draft.method ) && draft.query.length === 0 && (
										<p className="rb-muted rb-note">
											{ __( 'Arguments for this method go in the Body tab. Query params still work if you need them.', 'restbench' ) }
										</p>
									) }
									<KeyValueEditor
										rows={ draft.query }
										onChange={ ( query ) => setDraft( { ...draft, query } ) }
										keyPlaceholder={ __( 'name', 'restbench' ) }
										addLabel={ __( 'Add query parameter', 'restbench' ) }
									/>
								</div>
							</>
						) }

						{ tab === 'body' && (
							<div className="rb-section">
								<div className="rb-section-bar">
									<h4 className="rb-label">{ __( 'JSON body', 'restbench' ) }</h4>
									<span className="rb-spacer" />
									<button
										type="button"
										className="rb-btn rb-btn--ghost"
										onClick={ () => setDraft( { ...draft, body: sampleBody( route, draft.method ) } ) }
									>
										<Icon name="wand" size={ 14 } /> { __( 'Insert example', 'restbench' ) }
									</button>
									<button
										type="button"
										className="rb-btn rb-btn--ghost"
										disabled={ !! bodyError || draft.body.trim() === '' }
										onClick={ () => setDraft( { ...draft, body: JSON.stringify( JSON.parse( draft.body ), null, 2 ) } ) }
									>
										{ __( 'Format', 'restbench' ) }
									</button>
								</div>
								<CodeEditor
									label={ __( 'JSON body', 'restbench' ) }
									value={ draft.body }
									onChange={ ( body ) => setDraft( { ...draft, body } ) }
									onSubmit={ run }
								/>
							</div>
						) }

						{ tab === 'headers' && (
							<div className="rb-section">
								<p className="rb-muted rb-note">
									{ __( 'The REST nonce is added for you, so you only need this for anything extra.', 'restbench' ) }
								</p>
								<KeyValueEditor
									rows={ draft.headers }
									onChange={ ( headers ) => setDraft( { ...draft, headers } ) }
									keyPlaceholder={ __( 'Header-Name', 'restbench' ) }
									addLabel={ __( 'Add header', 'restbench' ) }
								/>
							</div>
						) }

						{ tab === 'docs' && <DocsView route={ route } /> }

						{ tab === 'code' && (
							<div className="rb-section">
								<div className="rb-section-bar">
									<div className="rb-seg" role="group" aria-label={ __( 'Snippet language', 'restbench' ) }>
										{ ( Object.keys( SNIPPET_LABELS ) as SnippetKind[] ).map( ( k ) => (
											<button
												key={ k }
												type="button"
												aria-pressed={ snippet === k }
												className={ snippet === k ? 'is-on' : '' }
												onClick={ () => setSnippet( k ) }
											>
												{ SNIPPET_LABELS[ k ] }
											</button>
										) ) }
									</div>
									<span className="rb-spacer" />
									<CopyButton text={ buildSnippet( snippet, path, draft ) } />
								</div>
								<pre className="rb-pre rb-codebox">{ buildSnippet( snippet, path, draft ) }</pre>
							</div>
						) }
					</div>
				</section>

				<ResponsePanel result={ result } running={ running } jsonDepth={ settings.jsonDepth } />
			</div>
		</div>
	);
}
