import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { parseCurl, replay, type Replay } from '../lib/replay';
import type { RouteInfo } from '../types';
import { Icon } from './ui';

interface Props {
	routes: RouteInfo[];
	onImport: ( result: Replay ) => void;
	onClose: () => void;
}

const EXAMPLE = `curl -X POST 'https://example.com/wp-json/wp/v2/posts' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Hello","status":"draft"}'`;

/** Paste a cURL command (from docs, or the browser's "Copy as cURL") to fill in a request. */
export default function ImportDialog( { routes, onImport, onClose }: Props ) {
	const [ text, setText ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const ref = useRef< HTMLTextAreaElement >( null );

	useEffect( () => {
		ref.current?.focus();
		const onKey = ( e: KeyboardEvent ) => e.key === 'Escape' && onClose();
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ onClose ] );

	const submit = () => {
		setError( null );
		let parsed;
		try {
			parsed = parseCurl( text, window.routemarkSettings?.restRoot ?? '/wp-json/' );
		} catch ( e ) {
			const code = ( e as Error ).message;
			setError(
				code === 'no-url'
					? __( "There's no URL in that command.", 'routemark' )
					: code === 'not-rest'
					? __( "That URL isn't a REST API URL. It needs /wp-json/ or ?rest_route= in it.", 'routemark' )
					: __( "That URL couldn't be read.", 'routemark' )
			);
			return;
		}
		const result = replay( routes, parsed.request );
		if ( ! result ) {
			setError(
				sprintf(
					/* translators: %s: REST path, e.g. /wc/v3/orders */
					__( 'No route on this site matches %s.', 'routemark' ),
					parsed.request.path.split( '?' )[ 0 ]
				)
			);
			return;
		}
		onImport( result );
	};

	return (
		<div className="rmk-modal-backdrop" onMouseDown={ ( e ) => e.target === e.currentTarget && onClose() }>
			<div className="rmk-modal" role="dialog" aria-modal="true" aria-labelledby="rmk-import-title">
				<header className="rmk-modal-head">
					<h2 id="rmk-import-title">{ __( 'Import a cURL command', 'routemark' ) }</h2>
					<button type="button" className="rmk-btn rmk-btn--icon rmk-btn--ghost" onClick={ onClose } aria-label={ __( 'Close', 'routemark' ) }>
						<Icon name="x" size={ 16 } />
					</button>
				</header>
				<div className="rmk-modal-body">
					<p className="rmk-muted">
						{ __( 'Paste a command from documentation, or from your browser: right-click a request in the Network tab and choose Copy as cURL. The URL can be from another site, Routemark finds the matching route here.', 'routemark' ) }
					</p>
					<label className="screen-reader-text" htmlFor="rmk-import-text">
						{ __( 'cURL command', 'routemark' ) }
					</label>
					<textarea
						id="rmk-import-text"
						ref={ ref }
						className="rmk-input rmk-input--mono rmk-import-text"
						rows={ 8 }
						spellCheck={ false }
						placeholder={ EXAMPLE }
						value={ text }
						onChange={ ( e ) => setText( e.target.value ) }
						onKeyDown={ ( e ) => {
							if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
								e.preventDefault();
								e.stopPropagation();
								submit();
							}
						} }
					/>
					{ error && (
						<p className="rmk-hint rmk-hint--error" role="alert">
							<Icon name="alert" size={ 14 } /> { error }
						</p>
					) }
					<p className="rmk-muted rmk-note">
						{ __( "Login headers and cookies are left out. The request is sent as you, or whoever you pick under Send as.", 'routemark' ) }
					</p>
				</div>
				<footer className="rmk-modal-foot">
					<button type="button" className="rmk-btn rmk-btn--ghost" onClick={ onClose }>
						{ __( 'Cancel', 'routemark' ) }
					</button>
					<button type="button" className="rmk-btn rmk-btn--primary" onClick={ submit } disabled={ text.trim() === '' }>
						<Icon name="import" size={ 15 } /> { __( 'Import', 'routemark' ) }
					</button>
				</footer>
			</div>
		</div>
	);
}
