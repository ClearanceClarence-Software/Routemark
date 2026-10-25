import apiFetch from '@wordpress/api-fetch';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { addQueryArgs } from '@wordpress/url';

import type { HookInfo, HooksResponse, RouteInfo } from '../types';
import { Icon, Toggle } from './ui';

const sourceName = ( c: HookInfo[ 'callbacks' ][ number ] ) => c.source?.name ?? __( 'unknown', 'routemark' );
// Core and Routemark's own hooks are hidden unless you ask for them. Routemark's
// are only there to make Send as and the server numbers work.
const isCore = ( c: HookInfo[ 'callbacks' ][ number ] ) => c.source?.type === 'core' || c.callback.startsWith( 'Routemark\\' );

// PHP_INT_MAX / PHP_INT_MIN are common for "run last" / "run first", and don't fit.
function priorityLabel( p: number ): string {
	if ( p > 1e15 ) {
		return __( 'last', 'routemark' );
	}
	if ( p < -1e15 ) {
		return __( 'first', 'routemark' );
	}
	return String( p );
}

function HookList( { hooks, showCore, empty }: { hooks: HookInfo[]; showCore: boolean; empty: string } ) {
	const visible = hooks
		.map( ( h ) => ( { ...h, callbacks: showCore ? h.callbacks : h.callbacks.filter( ( c ) => ! isCore( c ) ) } ) )
		.filter( ( h ) => h.callbacks.length > 0 );

	if ( visible.length === 0 ) {
		return <p className="rmk-muted rmk-note">{ empty }</p>;
	}

	return (
		<div className="rmk-hooks">
			{ visible.map( ( h ) => (
				<div key={ h.name } className="rmk-hook">
					<p className="rmk-hook-name">
						<code>{ h.name }</code>
					</p>
					<ul className="rmk-hook-list">
						{ h.callbacks.map( ( c, i ) => (
							<li key={ i } className={ isCore( c ) ? 'is-core' : '' }>
								<span className="rmk-hook-priority" title={ __( 'Priority. Lower runs first.', 'routemark' ) }>
									{ priorityLabel( c.priority ) }
								</span>
								<code className="rmk-hook-callback">{ c.callback }</code>
								<span className="rmk-hook-source">{ sourceName( c ) }</span>
							</li>
						) ) }
					</ul>
				</div>
			) ) }
		</div>
	);
}

export default function HooksView( { route }: { route: RouteInfo } ) {
	const [ data, setData ] = useState< HooksResponse | null >( null );
	const [ error, setError ] = useState< string | null >( null );
	const [ showCore, setShowCore ] = useState( false );

	useEffect( () => {
		let stale = false;
		setData( null );
		setError( null );
		apiFetch< HooksResponse >( { path: addQueryArgs( '/routemark/v1/hooks', { route: route.route } ) } )
			.then( ( res ) => {
				if ( ! stale ) {
					setData( res );
				}
			} )
			.catch( ( err: { message?: string } ) => {
				if ( ! stale ) {
					setError( err.message ?? __( 'Could not load hooks.', 'routemark' ) );
				}
			} );
		return () => {
			stale = true;
		};
	}, [ route.route ] );

	if ( error ) {
		return (
			<div className="rmk-section">
				<p className="rmk-hint rmk-hint--error">
					<Icon name="alert" size={ 14 } /> { error }
				</p>
			</div>
		);
	}
	if ( ! data ) {
		return (
			<div className="rmk-section">
				<p className="rmk-muted">{ __( 'Loading…', 'routemark' ) }</p>
			</div>
		);
	}

	const count = ( hooks: HookInfo[] ) =>
		hooks.reduce( ( n, h ) => n + h.callbacks.filter( ( c ) => showCore || ! isCore( c ) ).length, 0 );

	return (
		<div className="rmk-section">
			<div className="rmk-section-bar">
				<p className="rmk-muted rmk-note rmk-hooks-intro">
					{ __( "Everything hooked into this route's filters and actions, and which plugin it comes from. If a response has a field you didn't expect, or is missing one, look here.", 'routemark' ) }
				</p>
				<label className="rmk-report-core">
					<Toggle checked={ showCore } onChange={ setShowCore } label={ __( 'Show WordPress core and Routemark', 'routemark' ) } />
					<span>{ __( 'Show WordPress core and Routemark', 'routemark' ) }</span>
				</label>
			</div>

			<h4 className="rmk-label">
				{ data.subjects.length > 0
					? sprintf(
							/* translators: %s: post type, taxonomy, "user" or "comment" */
							__( 'For %s', 'routemark' ),
							data.subjects.join( ', ' )
					  )
					: __( 'For this route', 'routemark' ) }
				<span className="rmk-report-count">{ count( data.route ) }</span>
			</h4>
			<HookList
				hooks={ data.route }
				showCore={ showCore }
				empty={
					data.subjects.length > 0
						? __( 'No plugin hooks into this one.', 'routemark' )
						: __( "This route isn't one of core's post, term, user or comment controllers, so there are no per-object hooks to list. The ones below still apply.", 'routemark' )
				}
			/>

			<h4 className="rmk-label rmk-hooks-global">
				{ __( 'On every REST request', 'routemark' ) }
				<span className="rmk-report-count">{ count( data.global ) }</span>
			</h4>
			<HookList hooks={ data.global } showCore={ showCore } empty={ __( 'No plugin hooks in here.', 'routemark' ) } />

			<p className="rmk-muted rmk-note rmk-report-foot">
				{ __(
					"These are the hooks registered right now. A plugin that only adds a filter partway through a request (inside another callback, say) won't show up here.",
					'routemark'
				) }
			</p>
		</div>
	);
}
