import apiFetch from '@wordpress/api-fetch';
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { addQueryArgs } from '@wordpress/url';
import type { KeyboardEvent } from 'react';

import { LOGGED_OUT } from '../lib/request';
import type { SendAsUser } from '../types';
import { Icon } from './ui';

export function sendAsLabel( as: SendAsUser | null ): string {
	if ( ! as ) {
		return __( 'You', 'routemark' );
	}
	if ( as.id === 0 ) {
		return __( 'Logged out', 'routemark' );
	}
	return as.name || as.login || `#${ as.id }`;
}

interface Props {
	value: SendAsUser | null;
	onChange: ( as: SendAsUser | null ) => void;
	/** Visible label. "Send as" by default. */
	label?: string;
	/** Prefix for element ids, so two pickers can share a page. */
	id?: string;
	/** The explanation and "Back to you" next to a switched user. */
	showNote?: boolean;
	/** Leave "You" out of the list (comparing against yourself makes no sense). */
	hideYou?: boolean;
	/** "bar": the full-width row under the address. "inline": a compact button, e.g. in a toolbar. */
	variant?: 'bar' | 'inline';
}

export default function SendAs( { value, onChange, label, id = 'rmk-sendas', showNote = true, hideYou = false, variant = 'bar' }: Props ) {
	const inline = variant === 'inline';
	const [ open, setOpen ] = useState( false );
	const [ search, setSearch ] = useState( '' );
	const [ users, setUsers ] = useState< SendAsUser[] | null >( null );
	const [ failed, setFailed ] = useState( false );
	const wrap = useRef< HTMLDivElement >( null );
	const toggle = useRef< HTMLButtonElement >( null );
	const input = useRef< HTMLInputElement >( null );
	const me = window.routemarkSettings?.sendAs?.name ?? '';

	// No search: one user per role. Typing: matches, after a short pause so
	// we're not firing a request per keystroke.
	useEffect( () => {
		if ( ! open ) {
			return;
		}
		let stale = false;
		const t = window.setTimeout(
			() => {
				apiFetch< { users: SendAsUser[] } >( { path: addQueryArgs( '/routemark/v1/users', { search: search.trim() } ) } )
					.then( ( res ) => {
						if ( ! stale ) {
							setUsers( res.users );
							setFailed( false );
						}
					} )
					.catch( () => {
						if ( ! stale ) {
							setFailed( true );
						}
					} );
			},
			search ? 250 : 0
		);
		return () => {
			stale = true;
			window.clearTimeout( t );
		};
	}, [ open, search ] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		input.current?.focus();
		const onDown = ( e: MouseEvent ) => {
			if ( wrap.current && ! wrap.current.contains( e.target as Node ) ) {
				setOpen( false );
			}
		};
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ open ] );

	const close = () => {
		setOpen( false );
		toggle.current?.focus();
	};

	const choose = ( as: SendAsUser | null ) => {
		onChange( as );
		close();
	};

	// Up/down moves between the options, Escape closes.
	const onKeyDown = ( e: KeyboardEvent ) => {
		if ( e.key === 'Escape' ) {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
		if ( e.key !== 'ArrowDown' && e.key !== 'ArrowUp' ) {
			return;
		}
		e.preventDefault();
		const items = Array.from( wrap.current?.querySelectorAll< HTMLElement >( '.rmk-sendas-option, .rmk-sendas-search' ) ?? [] );
		const i = items.indexOf( document.activeElement as HTMLElement );
		const next = items[ ( i + ( e.key === 'ArrowDown' ? 1 : -1 ) + items.length ) % items.length ];
		next?.focus();
	};

	const isOn = ( as: SendAsUser | null ) => ( value?.id ?? null ) === ( as?.id ?? null );

	const option = ( as: SendAsUser | null, title: string, meta: string, key: string ) => (
		<li key={ key }>
			<button
				type="button"
				className={ `rmk-sendas-option${ isOn( as ) ? ' is-on' : '' }` }
				aria-pressed={ isOn( as ) }
				onClick={ () => choose( as ) }
			>
				<span className="rmk-sendas-option-name">{ title }</span>
				{ meta && <span className="rmk-sendas-option-meta">{ meta }</span> }
				{ isOn( as ) && <Icon name="check" size={ 14 } /> }
			</button>
		</li>
	);

	return (
		<div className={ inline ? 'rmk-sendas rmk-sendas--inline' : `rmk-sendas${ value ? ' is-switched' : '' }` } ref={ wrap } onKeyDown={ open ? onKeyDown : undefined }>
			<span className={ inline ? 'screen-reader-text' : 'rmk-sendas-label' } id={ `${ id }-label` }>
				{ label ?? __( 'Send as', 'routemark' ) }
			</span>
			<button
				type="button"
				ref={ toggle }
				className={ inline ? 'rmk-sendas-toggle--inline' : 'rmk-sendas-toggle' }
				aria-expanded={ open }
				aria-labelledby={ `${ id }-label ${ id }-current` }
				onClick={ () => setOpen( ! open ) }
			>
				<Icon name={ inline ? 'columns' : value?.id === 0 ? 'globe' : 'user' } size={ 14 } />
				<span id={ `${ id }-current` }>{ inline ? label : sendAsLabel( value ) }</span>
				{ value && value.role && <span className="rmk-sendas-role">{ value.role }</span> }
				<span className="rmk-sendas-caret" aria-hidden="true" />
			</button>

			{ value && showNote && (
				<>
					<span className="rmk-sendas-note">
						{ value.id === 0
							? __( 'Sent with no logged-in user, like a visitor would.', 'routemark' )
							: __( 'Runs with their permissions. Anything it changes is done as them.', 'routemark' ) }
					</span>
					<button type="button" className="rmk-btn rmk-btn--ghost rmk-sendas-reset" onClick={ () => onChange( null ) }>
						{ __( 'Back to you', 'routemark' ) }
					</button>
				</>
			) }

			{ open && (
				<div className="rmk-sendas-menu" role="dialog" aria-label={ label ?? __( 'Send as', 'routemark' ) }>
					<input
						ref={ input }
						type="search"
						className="rmk-input rmk-sendas-search"
						placeholder={ __( 'Find a user by name, login or email', 'routemark' ) }
						aria-label={ __( 'Find a user', 'routemark' ) }
						value={ search }
						onChange={ ( e ) => setSearch( e.target.value ) }
					/>
					<ul className="rmk-sendas-list">
						{ ! search && ! hideYou && option( null, __( 'You', 'routemark' ), me, 'me' ) }
						{ ! search && option( LOGGED_OUT, __( 'Logged out', 'routemark' ), __( 'no cookie, like a visitor', 'routemark' ), 'anon' ) }
						<li className="rmk-sendas-heading" aria-hidden="true">
							{ search ? __( 'Matching users', 'routemark' ) : __( 'One user per role', 'routemark' ) }
						</li>
						{ failed && <li className="rmk-sendas-empty">{ __( 'Could not load users.', 'routemark' ) }</li> }
						{ ! failed && users === null && <li className="rmk-sendas-empty">{ __( 'Loading…', 'routemark' ) }</li> }
						{ ! failed && users?.length === 0 && (
							<li className="rmk-sendas-empty">
								{ search ? __( 'No one you can switch to matches that.', 'routemark' ) : __( 'No other users you can switch to.', 'routemark' ) }
							</li>
						) }
						{ ! failed &&
							users?.map( ( u ) =>
								option(
									u,
									u.name || u.login || `#${ u.id }`,
									/* translators: 1: role name, 2: user login */
									u.role ? sprintf( __( '%1$s · %2$s', 'routemark' ), u.role, u.login ?? '' ) : u.login ?? '',
									`u${ u.id }`
								)
							) }
					</ul>
				</div>
			) }
		</div>
	);
}
