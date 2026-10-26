import apiFetch from '@wordpress/api-fetch';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { addQueryArgs } from '@wordpress/url';

import type { RouteSource, SendAsUser } from '../types';
import { sendAsLabel } from './SendAs';
import { Icon } from './ui';

export interface PermissionInfo {
	permission: 'missing' | 'open' | 'check';
	callback: { name: string; file: string | null; line: number | null; source: RouteSource | null } | null;
	needsLogin: boolean;
	caps: Array< { cap: string; primitive: boolean; has: boolean | null } >;
	user: { id: number; name: string };
	early: Array< { hook: string; callback: string; source: RouteSource | null } >;
}

interface Props {
	route: string;
	method: string;
	/** Who the request was sent as. null is you. */
	sentAs: SendAsUser | null;
	/** The error code from the response, e.g. rest_forbidden. */
	code: string | null;
	status: number;
	/** Send it again as yourself. Only offered when it went as someone else. */
	onRetryAsMe?: () => void;
}

/**
 * Under a 401 or 403: which check refused the request, where that check
 * lives, and the capabilities it looks at for the user it was sent as.
 */
export default function DeniedHelp( { route, method, sentAs, code, status, onRetryAsMe }: Props ) {
	const [ info, setInfo ] = useState< PermissionInfo | null >( null );
	const [ failed, setFailed ] = useState( false );

	useEffect( () => {
		let stale = false;
		apiFetch< PermissionInfo >( {
			path: addQueryArgs( '/routemark/v1/permission', { route, method, ...( sentAs ? { user: sentAs.id } : {} ) } ),
		} )
			.then( ( res ) => ! stale && setInfo( res ) )
			.catch( () => ! stale && setFailed( true ) );
		return () => {
			stale = true;
		};
	}, [ route, method, sentAs ] );

	const who = sendAsLabel( sentAs );
	// These codes come from WordPress itself, before the route's own check runs.
	const nonce = code === 'rest_cookie_invalid_nonce';

	return (
		<div className="rmk-denied" aria-live="polite">
			<h4 className="rmk-denied-title">
				<Icon name="help" size={ 15 } /> { __( 'Why was this refused?', 'routemark' ) }
			</h4>

			{ nonce && (
				<p>
					{ __( "WordPress turned it down before the route's own check: the REST nonce has expired. Reload the Routemark page and send it again.", 'routemark' ) }
				</p>
			) }

			{ ! nonce && failed && <p className="rmk-muted">{ __( "Couldn't look up this route's permission check.", 'routemark' ) }</p> }
			{ ! nonce && ! failed && ! info && <p className="rmk-muted">{ __( 'Looking up the permission check…', 'routemark' ) }</p> }

			{ ! nonce && info && (
				<>
					{ info.permission !== 'check' && (
						<p>
							{ __( "This endpoint doesn't check permissions itself, so its own code or another plugin refused the request. Check the plugins below, and the error code above.", 'routemark' ) }
						</p>
					) }

					{ info.callback && (
						<dl className="rmk-denied-facts">
							<dt>{ __( 'Permission check', 'routemark' ) }</dt>
							<dd>
								<code>{ info.callback.name }</code>
								{ info.callback.source && <span className="rmk-denied-source">{ info.callback.source.name }</span> }
							</dd>
							{ info.callback.file && (
								<>
									<dt>{ __( 'Defined in', 'routemark' ) }</dt>
									<dd>
										<code>
											{ info.callback.file }:{ info.callback.line }
										</code>
									</dd>
								</>
							) }
							<dt>
								{ sprintf(
									/* translators: %s: user name, "You" or "Logged out" */
									__( 'Checks, for %s', 'routemark' ),
									who
								) }
							</dt>
							<dd>
								{ info.caps.length === 0 && ! info.needsLogin && (
									<span className="rmk-muted">
										{ __( "No capability names written out in the check. It works them out while it runs, so read the code at the line above.", 'routemark' ) }
									</span>
								) }
								<ul className="rmk-denied-caps">
									{ info.needsLogin && (
										<li className={ info.user.id ? 'has' : 'lacks' }>
											<Icon name={ info.user.id ? 'check' : 'x' } size={ 13 } /> { __( 'logged in', 'routemark' ) }
										</li>
									) }
									{ info.caps.map( ( c ) => (
										<li key={ c.cap } className={ c.has === null ? 'unknown' : c.has ? 'has' : 'lacks' }>
											<Icon name={ c.has === null ? 'help' : c.has ? 'check' : 'x' } size={ 13 } />
											<code>{ c.cap }</code>
											{ c.has === null && (
												<span className="rmk-muted">{ __( 'depends on the item', 'routemark' ) }</span>
											) }
										</li>
									) ) }
								</ul>
							</dd>
						</dl>
					) }

					{ info.early.length > 0 && (
						<div className="rmk-denied-early">
							<p>{ __( 'These can also turn a request away before the permission check runs:', 'routemark' ) }</p>
							<ul>
								{ info.early.map( ( e, i ) => (
									<li key={ i }>
										<code>{ e.callback }</code> { e.source && <span className="rmk-denied-source">{ e.source.name }</span> }{ ' ' }
										<span className="rmk-muted">{ e.hook }</span>
									</li>
								) ) }
							</ul>
						</div>
					) }
				</>
			) }

			{ onRetryAsMe && sentAs && (
				<button type="button" className="rmk-btn rmk-btn--ghost" onClick={ onRetryAsMe }>
					<Icon name="user" size={ 14 } /> { __( 'Send it again as you', 'routemark' ) }
				</button>
			) }
			{ status === 401 && ! sentAs && ! nonce && (
				<p className="rmk-muted rmk-note">{ __( "401 means the check wanted a logged-in user and didn't get one, even though you're logged in. Another plugin may be removing the login from REST requests.", 'routemark' ) }</p>
			) }
		</div>
	);
}
