import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { typeLabel } from '../lib/routes';
import type { RouteArg, SchemaNode } from '../types';
import { Icon } from './ui';

type Obj = Record< string, unknown >;

// Arguments WordPress handles itself, nothing to fill in.
const SKIP = new Set( [ 'context', '_locale', '_envelope', '_method', '_fields', '_embed' ] );

/** The arguments the form shows: everything except path params and WordPress's own. */
export function formArgs( args: Record< string, RouteArg >, pathParams: string[] ): Array< [ string, RouteArg ] > {
	return Object.entries( args )
		.filter( ( [ name ] ) => ! pathParams.includes( name ) && ! SKIP.has( name ) )
		.sort( ( [ an, a ], [ bn, b ] ) => Number( !! b.required ) - Number( !! a.required ) || an.localeCompare( bn ) );
}

function mainType( arg: SchemaNode ): string {
	// Core's title, content and excerpt are { raw, rendered } objects in the
	// schema, but WordPress takes a plain string for them, and that's what
	// everyone sends.
	if ( arg.properties && 'raw' in arg.properties ) {
		return 'string';
	}
	const types = Array.isArray( arg.type ) ? arg.type : arg.type ? [ arg.type ] : [];
	return types.find( ( t ) => t !== 'null' ) ?? ( arg.properties ? 'object' : 'string' );
}

/** What's wrong with a value for this argument, or null. Mirrors the checks WordPress runs. */
export function fieldError( arg: RouteArg, value: unknown, set: boolean ): string | null {
	if ( ! set ) {
		return arg.required ? __( 'Required.', 'routemark' ) : null;
	}
	const type = mainType( arg );
	if ( Array.isArray( arg.enum ) && arg.enum.length && type !== 'array' && ! arg.enum.some( ( e ) => e === value ) ) {
		return sprintf(
			/* translators: %s: allowed values */
			__( 'Must be one of: %s.', 'routemark' ),
			arg.enum.map( ( e ) => String( e ) ).join( ', ' )
		);
	}
	if ( ( type === 'integer' || type === 'number' ) && typeof value === 'number' ) {
		if ( type === 'integer' && ! Number.isInteger( value ) ) {
			return __( 'Must be a whole number.', 'routemark' );
		}
		if ( typeof arg.minimum === 'number' && value < arg.minimum ) {
			/* translators: %s: minimum value */
			return sprintf( __( 'At least %s.', 'routemark' ), String( arg.minimum ) );
		}
		if ( typeof arg.maximum === 'number' && value > arg.maximum ) {
			/* translators: %s: maximum value */
			return sprintf( __( 'At most %s.', 'routemark' ), String( arg.maximum ) );
		}
	}
	return null;
}

interface FieldProps {
	name: string;
	arg: RouteArg;
	value: unknown;
	set: boolean;
	onSet: ( value: unknown ) => void;
	onUnset: () => void;
}

function Field( { name, arg, value, set, onSet, onUnset }: FieldProps ) {
	const type = mainType( arg );
	const id = `rmk-field-${ name }`;
	const [ jsonText, setJsonText ] = useState( () => ( set && typeof value === 'object' ? JSON.stringify( value, null, 2 ) : '' ) );
	const [ jsonError, setJsonError ] = useState< string | null >( null );
	const error = jsonError ?? fieldError( arg, value, set );
	const itemEnum = type === 'array' && Array.isArray( arg.items?.enum ) ? ( arg.items!.enum as unknown[] ) : null;

	let control;
	if ( type !== 'array' && Array.isArray( arg.enum ) && arg.enum.length ) {
		const index = set ? arg.enum.findIndex( ( e ) => e === value ) : -1;
		control = (
			<select id={ id } className="rmk-input" value={ set ? String( index ) : '' } onChange={ ( e ) => ( e.target.value === '' ? onUnset() : onSet( arg.enum![ Number( e.target.value ) ] ) ) }>
				<option value="">{ __( '(not set)', 'routemark' ) }</option>
				{ arg.enum.map( ( opt, i ) => (
					<option key={ i } value={ i }>
						{ String( opt ) }
					</option>
				) ) }
			</select>
		);
	} else if ( type === 'boolean' ) {
		control = (
			<select id={ id } className="rmk-input" value={ set ? String( value ) : '' } onChange={ ( e ) => ( e.target.value === '' ? onUnset() : onSet( e.target.value === 'true' ) ) }>
				<option value="">{ __( '(not set)', 'routemark' ) }</option>
				<option value="true">true</option>
				<option value="false">false</option>
			</select>
		);
	} else if ( type === 'integer' || type === 'number' ) {
		control = (
			<input
				id={ id }
				type="number"
				className="rmk-input rmk-input--mono"
				step={ type === 'integer' ? 1 : 'any' }
				min={ arg.minimum }
				max={ arg.maximum }
				value={ set && typeof value === 'number' ? value : '' }
				onChange={ ( e ) => ( e.target.value === '' ? onUnset() : onSet( Number( e.target.value ) ) ) }
			/>
		);
	} else if ( itemEnum ) {
		const chosen = Array.isArray( value ) ? value : [];
		control = (
			<div className="rmk-field-checks" role="group" aria-labelledby={ `${ id }-label` }>
				{ itemEnum.map( ( opt, i ) => (
					<label key={ i } className="rmk-field-check">
						<input
							type="checkbox"
							checked={ chosen.includes( opt ) }
							onChange={ ( e ) => {
								const next = e.target.checked ? [ ...chosen, opt ] : chosen.filter( ( c ) => c !== opt );
								if ( next.length ) {
									onSet( next );
								} else {
									onUnset();
								}
							} }
						/>
						{ String( opt ) }
					</label>
				) ) }
			</div>
		);
	} else if ( type === 'array' && mainType( arg.items ?? {} ) !== 'object' ) {
		const itemType = mainType( arg.items ?? {} );
		control = (
			<input
				id={ id }
				type="text"
				className="rmk-input rmk-input--mono"
				placeholder={ __( 'Comma-separated', 'routemark' ) }
				value={ set && Array.isArray( value ) ? value.join( ', ' ) : '' }
				onChange={ ( e ) => {
					const parts = e.target.value
						.split( ',' )
						.map( ( p ) => p.trim() )
						.filter( ( p ) => p !== '' );
					if ( ! parts.length ) {
						onUnset();
						return;
					}
					onSet( itemType === 'integer' || itemType === 'number' ? parts.map( Number ) : parts );
				} }
			/>
		);
	} else if ( type === 'object' || type === 'array' ) {
		control = (
			<textarea
				id={ id }
				className="rmk-input rmk-input--mono"
				rows={ 3 }
				spellCheck={ false }
				placeholder={ type === 'array' ? '[ ]' : '{ }' }
				value={ jsonText }
				onChange={ ( e ) => {
					setJsonText( e.target.value );
					if ( e.target.value.trim() === '' ) {
						setJsonError( null );
						onUnset();
						return;
					}
					try {
						onSet( JSON.parse( e.target.value ) );
						setJsonError( null );
					} catch {
						setJsonError( __( 'Not valid JSON yet.', 'routemark' ) );
					}
				} }
			/>
		);
	} else {
		const inputType = arg.format === 'email' ? 'email' : arg.format === 'uri' ? 'url' : 'text';
		control = (
			<input
				id={ id }
				type={ inputType }
				className="rmk-input"
				placeholder={ arg.format === 'date-time' ? 'YYYY-MM-DDTHH:MM:SS' : '' }
				value={ set && value !== null && value !== undefined ? String( value ) : '' }
				onChange={ ( e ) => ( e.target.value === '' ? onUnset() : onSet( e.target.value ) ) }
			/>
		);
	}

	return (
		<div className={ `rmk-field${ error && ( set || arg.required ) ? ' has-error' : '' }${ set ? ' is-set' : '' }` }>
			<label className="rmk-field-label" htmlFor={ id } id={ `${ id }-label` }>
				<code>{ name }</code>
				{ arg.required && (
					<span className="rmk-field-required" title={ __( 'Required', 'routemark' ) }>
						*
					</span>
				) }
				<span className="rmk-kv-type">{ arg.properties && 'raw' in arg.properties ? 'string' : typeLabel( arg.type, arg.format ) }</span>
				{ set && ! arg.required && (
					<button type="button" className="rmk-link rmk-field-clear" onClick={ () => { setJsonText( '' ); setJsonError( null ); onUnset(); } }>
						{ __( 'Clear', 'routemark' ) }
					</button>
				) }
			</label>
			{ control }
			{ arg.description && <p className="rmk-field-help">{ arg.description }</p> }
			{ error && ( set || arg.required ) && (
				<p className="rmk-field-error">
					<Icon name="alert" size={ 12 } /> { error }
				</p>
			) }
		</div>
	);
}

interface Props {
	fields: Array< [ string, RouteArg ] >;
	body: string;
	onChange: ( body: string ) => void;
}

/**
 * The JSON body as a form, one field per argument the endpoint declares.
 * Edits go straight into the JSON, and fields the endpoint doesn't declare
 * are kept as they are.
 */
export default function BodyForm( { fields, body, onChange }: Props ) {
	const [ filter, setFilter ] = useState( '' );

	let obj: Obj | null = null;
	if ( body.trim() === '' ) {
		obj = {};
	} else {
		try {
			const parsed = JSON.parse( body );
			obj = parsed && typeof parsed === 'object' && ! Array.isArray( parsed ) ? ( parsed as Obj ) : null;
		} catch {
			obj = null;
		}
	}

	if ( ! obj ) {
		return <p className="rmk-muted rmk-note">{ __( "The body isn't a JSON object right now, so the form can't show it. Fix it in the JSON view.", 'routemark' ) }</p>;
	}
	if ( fields.length === 0 ) {
		return <p className="rmk-muted rmk-note">{ __( "This endpoint doesn't declare any body fields. Use the JSON view.", 'routemark' ) }</p>;
	}

	const current = obj;
	const write = ( next: Obj ) => onChange( Object.keys( next ).length ? JSON.stringify( next, null, 2 ) : '' );
	const term = filter.trim().toLowerCase();
	const shown = term ? fields.filter( ( [ name, arg ] ) => `${ name } ${ arg.description ?? '' }`.toLowerCase().includes( term ) ) : fields;
	const extra = Object.keys( current ).filter( ( k ) => ! fields.some( ( [ name ] ) => name === k ) );

	return (
		<div className="rmk-body-form">
			{ fields.length > 12 && (
				<label className="rmk-search rmk-body-form-filter">
					<Icon name="search" size={ 14 } />
					<span className="screen-reader-text">{ __( 'Filter fields', 'routemark' ) }</span>
					<input type="search" className="rmk-search-input" placeholder={ __( 'Filter fields', 'routemark' ) } value={ filter } onChange={ ( e ) => setFilter( e.target.value ) } />
				</label>
			) }
			{ shown.map( ( [ name, arg ] ) => (
				<Field
					key={ name }
					name={ name }
					arg={ arg }
					value={ current[ name ] }
					set={ name in current }
					onSet={ ( v ) => write( { ...current, [ name ]: v } ) }
					onUnset={ () => {
						const next = { ...current };
						delete next[ name ];
						write( next );
					} }
				/>
			) ) }
			{ extra.length > 0 && (
				<p className="rmk-muted rmk-note">
					{ sprintf(
						/* translators: %s: comma-separated field names */
						__( 'Also in the body, not declared by the endpoint: %s. Edit those in the JSON view.', 'routemark' ),
						extra.join( ', ' )
					) }
				</p>
			) }
		</div>
	);
}

/** Problems that would make WordPress reject the body, for the hint above the tabs. */
export function formProblems( fields: Array< [ string, RouteArg ] >, body: string ): string[] {
	let obj: Obj;
	try {
		obj = body.trim() === '' ? {} : ( JSON.parse( body ) as Obj );
	} catch {
		return [];
	}
	if ( ! obj || typeof obj !== 'object' || Array.isArray( obj ) ) {
		return [];
	}
	return fields.filter( ( [ name, arg ] ) => fieldError( arg, obj[ name ], name in obj ) !== null ).map( ( [ name ] ) => name );
}
