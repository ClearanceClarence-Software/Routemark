import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { buildPath, fullUrl, hasBody, jsonError, missingParams, newDraft, redactDraft, redactPath, sampleBody, send, switchMethod, uid } from '../lib/request';
import { endpointFor, routeMethods, routeToTemplate, sourceLabel, templateParams, typeLabel } from '../lib/routes';
import { buildSnippet, SNIPPET_LABELS, type SnippetKind } from '../lib/snippets';
import { needsConfirm } from '../lib/settings';
import type { Draft, HistoryEntry, HttpMethod, RouteInfo, RunResult, SendAsUser, Settings } from '../types';
import CodeEditor from './CodeEditor';
import DocsView from './DocsView';
import HooksView from './HooksView';
import KeyValueEditor from './KeyValueEditor';
import ResponsePanel from './ResponsePanel';
import SendAs from './SendAs';
import { CopyButton, Icon, PathText, Tabs } from './ui';

type Tab = 'params' | 'body' | 'headers' | 'docs' | 'hooks' | 'code';

interface Props {
	route: RouteInfo;
	settings: Settings;
	preset: Draft | null;
	sendAs: SendAsUser | null;
	onSendAs: ( as: SendAsUser | null ) => void;
	onRecord: ( entry: HistoryEntry ) => void;
}

export default function Workspace( { route, settings, preset, sendAs, onSendAs, onRecord }: Props ) {
	const [ draft, setDraft ] = useState< Draft >( () => preset ?? newDraft( route, undefined, settings.suggestParams ) );
	const [ result, setResult ] = useState< RunResult | null >( null );
	// Who the shown response was sent as, which may not be who's picked now.
	const [ resultAs, setResultAs ] = useState< SendAsUser | null >( null );
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
	useEffect( () => setArmed( false ), [ draft, sendAs ] );
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
		const res = await send( path, draft, sendAs );
		setResult( res );
		setResultAs( sendAs );
		setRunning( false );
		onRecord( {
			id: uid(),
			at: Date.now(),
			route: route.route,
			path: redactPath( path ),
			status: res.status,
			durationMs: res.durationMs,
			draft: redactDraft( draft ),
			as: sendAs,
		} );
	}, [ canSend, confirmFirst, armed, path, draft, sendAs, route.route, onRecord ] );

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
		<div className="rmk-workspace">
			<header className="rmk-ws-head">
				<div className="rmk-ws-title">
					<p className="rmk-eyebrow">
						{ route.namespace || __( 'root', 'routemark' ) }
						{ source && (
							<span className="rmk-ws-source">
								{ /* translators: %s: plugin, theme or "WordPress" */ sprintf( __( 'from %s', 'routemark' ), source ) }
							</span>
						) }
					</p>
					<h2>
						<PathText template={ template } />
					</h2>
				</div>
				<div className="rmk-ws-badges">
					{ endpoint?.permission === 'missing' ? (
						<span className="rmk-badge rmk-badge--danger" title={ __( 'Registered without a permission_callback, so anyone can call it.', 'routemark' ) }>
							<Icon name="alert" size={ 12 } /> { __( 'No permission check', 'routemark' ) }
						</span>
					) : endpoint?.isPublic ? (
						<span className="rmk-badge rmk-badge--public">
							<Icon name="globe" size={ 12 } /> { __( 'Public', 'routemark' ) }
						</span>
					) : (
						<span className="rmk-badge">
							<Icon name="lock" size={ 12 } /> { __( 'Needs permission', 'routemark' ) }
						</span>
					) }
				</div>
			</header>

			<div className="rmk-ws-split">
				<section className="rmk-request">
					<form
						className="rmk-address"
						onSubmit={ ( e ) => {
							e.preventDefault();
							run();
						} }
					>
						<label className="screen-reader-text" htmlFor="rmk-method">
							{ __( 'Method', 'routemark' ) }
						</label>
						<select
							id="rmk-method"
							className={ `rmk-address-method rmk-method--${ draft.method.toLowerCase() }` }
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
						<div className="rmk-address-path" title={ fullUrl( path ) }>
							<PathText template={ path } />
						</div>
						<CopyButton text={ fullUrl( path ) } label={ __( 'URL', 'routemark' ) } />
						<button
							type="submit"
							className={ `rmk-btn rmk-btn--primary${ destructive ? ' rmk-btn--danger-fill' : '' }${ armed ? ' is-armed' : '' }` }
							disabled={ ! canSend }
						>
							{ running ? <span className="rmk-spinner" /> : <Icon name={ armed ? 'alert' : 'send' } size={ 15 } /> }
							{ armed
								? /* translators: %s: HTTP method */ sprintf( __( 'Click again to %s', 'routemark' ), draft.method )
								: __( 'Send', 'routemark' ) }
						</button>
					</form>

					<SendAs value={ sendAs } onChange={ onSendAs } />

					{ ( missing.length > 0 || bodyError || destructive ) && (
						<div className="rmk-address-notes">
							{ missing.length > 0 && (
								<p className="rmk-hint">
									<Icon name="alert" size={ 14 } />
									{ sprintf(
										/* translators: %s: list of path parameters */
										__( 'Fill in %s under Params before sending.', 'routemark' ),
										missing.map( ( m ) => `{${ m }}` ).join( ', ' )
									) }
								</p>
							) }
							{ bodyError && (
								<p className="rmk-hint rmk-hint--error">
									<Icon name="alert" size={ 14 } />
									{ __( 'The body is not valid JSON:', 'routemark' ) } { bodyError }
								</p>
							) }
							{ destructive && missing.length === 0 && (
								<p className="rmk-hint rmk-hint--error">
									<Icon name="alert" size={ 14 } />
									{ __( 'Careful, this is a real DELETE and it runs against this site.', 'routemark' ) }
								</p>
							) }
						</div>
					) }

					<Tabs< Tab >
						label={ __( 'Request', 'routemark' ) }
						active={ tab }
						onChange={ setTab }
						tabs={ [
							{ id: 'params', label: __( 'Params', 'routemark' ), count: params.length + enabledQuery },
							{ id: 'body', label: __( 'Body', 'routemark' ), hidden: ! hasBody( draft.method ) },
							{ id: 'headers', label: __( 'Headers', 'routemark' ), count: enabledHeaders },
							{ id: 'docs', label: __( 'Docs', 'routemark' ) },
							{ id: 'hooks', label: __( 'Hooks', 'routemark' ) },
							{ id: 'code', label: __( 'Code', 'routemark' ) },
						] }
					/>

					<div className="rmk-tab-panel">
						{ tab === 'params' && (
							<>
								{ params.length > 0 && (
									<div className="rmk-section">
										<h4 className="rmk-label">{ __( 'Path parameters', 'routemark' ) }</h4>
										<div className="rmk-pathparams">
											{ params.map( ( p ) => {
												const arg = endpoint?.args[ p ];
												return (
													<label key={ p } className="rmk-pathparam">
														<span className="rmk-pathparam-name">
															<code>{ `{${ p }}` }</code>
															{ arg && <span className="rmk-kv-type">{ typeLabel( arg.type, arg.format ) }</span> }
														</span>
														<input
															type="text"
															className={ `rmk-input rmk-input--mono${ draft.pathParams[ p ] ? '' : ' is-missing' }` }
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

								<div className="rmk-section">
									<h4 className="rmk-label">{ __( 'Query parameters', 'routemark' ) }</h4>
									{ hasBody( draft.method ) && draft.query.length === 0 && (
										<p className="rmk-muted rmk-note">
											{ __( 'Arguments for this method go in the Body tab. Query params still work if you need them.', 'routemark' ) }
										</p>
									) }
									<KeyValueEditor
										rows={ draft.query }
										onChange={ ( query ) => setDraft( { ...draft, query } ) }
										keyPlaceholder={ __( 'name', 'routemark' ) }
										addLabel={ __( 'Add query parameter', 'routemark' ) }
									/>
								</div>
							</>
						) }

						{ tab === 'body' && (
							<div className="rmk-section">
								<div className="rmk-section-bar">
									<h4 className="rmk-label">{ __( 'JSON body', 'routemark' ) }</h4>
									<span className="rmk-spacer" />
									<button
										type="button"
										className="rmk-btn rmk-btn--ghost"
										onClick={ () => setDraft( { ...draft, body: sampleBody( route, draft.method ) } ) }
									>
										<Icon name="wand" size={ 14 } /> { __( 'Insert example', 'routemark' ) }
									</button>
									<button
										type="button"
										className="rmk-btn rmk-btn--ghost"
										disabled={ !! bodyError || draft.body.trim() === '' }
										onClick={ () => setDraft( { ...draft, body: JSON.stringify( JSON.parse( draft.body ), null, 2 ) } ) }
									>
										{ __( 'Format', 'routemark' ) }
									</button>
								</div>
								<CodeEditor
									label={ __( 'JSON body', 'routemark' ) }
									value={ draft.body }
									onChange={ ( body ) => setDraft( { ...draft, body } ) }
									onSubmit={ run }
								/>
							</div>
						) }

						{ tab === 'headers' && (
							<div className="rmk-section">
								<p className="rmk-muted rmk-note">
									{ __( 'The REST nonce is added for you, so you only need this for anything extra.', 'routemark' ) }
								</p>
								<KeyValueEditor
									rows={ draft.headers }
									onChange={ ( headers ) => setDraft( { ...draft, headers } ) }
									keyPlaceholder={ __( 'Header-Name', 'routemark' ) }
									addLabel={ __( 'Add header', 'routemark' ) }
								/>
							</div>
						) }

						{ tab === 'docs' && <DocsView route={ route } /> }

						{ tab === 'hooks' && <HooksView route={ route } /> }

						{ tab === 'code' && (
							<div className="rmk-section">
								<div className="rmk-section-bar">
									<div className="rmk-seg" role="group" aria-label={ __( 'Snippet language', 'routemark' ) }>
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
									<span className="rmk-spacer" />
									<CopyButton text={ buildSnippet( snippet, path, draft ) } />
								</div>
								<pre className="rmk-pre rmk-codebox">{ buildSnippet( snippet, path, draft ) }</pre>
							</div>
						) }
					</div>
				</section>

				<ResponsePanel result={ result } sentAs={ resultAs } running={ running } jsonDepth={ settings.jsonDepth } />
			</div>
		</div>
	);
}
