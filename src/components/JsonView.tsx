import { createContext, useContext, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';

const CHUNK = 100;

interface ViewOptions {
	/** Text to highlight, lowercase. Empty for none. */
	term: string;
	/** Opens a REST URL inside Routemark. Returns false if it isn't one. */
	onLink?: ( url: string ) => boolean;
	/** Is this string a REST URL on this site? Decides which strings become links. */
	isLink?: ( url: string ) => boolean;
}

const Options = createContext< ViewOptions >( { term: '' } );

function Mark( { text }: { text: string } ): ReactNode {
	const { term } = useContext( Options );
	if ( ! term ) {
		return text;
	}
	const lower = text.toLowerCase();
	const parts: ReactNode[] = [];
	let from = 0;
	let at = lower.indexOf( term );
	while ( at !== -1 ) {
		parts.push( text.slice( from, at ), <mark key={ at }>{ text.slice( at, at + term.length ) }</mark> );
		from = at + term.length;
		at = lower.indexOf( term, from );
	}
	parts.push( text.slice( from ) );
	return <>{ parts }</>;
}

function Primitive( { value }: { value: unknown } ) {
	const { onLink, isLink } = useContext( Options );
	if ( value === null ) {
		return (
			<span className="rmk-j-null">
				<Mark text="null" />
			</span>
		);
	}
	if ( typeof value === 'string' ) {
		const quoted = JSON.stringify( value );
		if ( onLink && isLink?.( value ) ) {
			return (
				<button type="button" className="rmk-j-str rmk-j-link" onClick={ () => onLink( value ) } title={ __( 'Open in Routemark', 'routemark' ) }>
					<Mark text={ quoted } />
				</button>
			);
		}
		return (
			<span className="rmk-j-str">
				<Mark text={ quoted } />
			</span>
		);
	}
	if ( typeof value === 'number' ) {
		return (
			<span className="rmk-j-num">
				<Mark text={ String( value ) } />
			</span>
		);
	}
	if ( typeof value === 'boolean' ) {
		return (
			<span className="rmk-j-bool">
				<Mark text={ String( value ) } />
			</span>
		);
	}
	return <span>{ String( value ) }</span>;
}

interface NodeProps {
	name?: string;
	value: unknown;
	depth: number;
	openDepth: number;
	last: boolean;
}

function Key( { name }: { name?: string } ) {
	if ( name === undefined ) {
		return null;
	}
	return (
		<>
			<span className="rmk-j-key">
				<Mark text={ JSON.stringify( name ) } />
			</span>
			<span className="rmk-j-punct">: </span>
		</>
	);
}

function Node( { name, value, depth, openDepth, last }: NodeProps ) {
	const isObject = value !== null && typeof value === 'object';
	const [ open, setOpen ] = useState( depth < openDepth );
	const [ limit, setLimit ] = useState( CHUNK );

	if ( ! isObject ) {
		return (
			<div className="rmk-j-line">
				<Key name={ name } />
				<Primitive value={ value } />
				{ ! last && <span className="rmk-j-punct">,</span> }
			</div>
		);
	}

	const isArray = Array.isArray( value );
	const entries: Array< [ string | undefined, unknown ] > = isArray
		? ( value as unknown[] ).map( ( v ) => [ undefined, v ] )
		: Object.entries( value as Record< string, unknown > );
	const [ openCh, closeCh ] = isArray ? [ '[', ']' ] : [ '{', '}' ];

	if ( entries.length === 0 ) {
		return (
			<div className="rmk-j-line">
				<Key name={ name } />
				<span className="rmk-j-punct">
					{ openCh }
					{ closeCh }
				</span>
				{ ! last && <span className="rmk-j-punct">,</span> }
			</div>
		);
	}

	const summary = isArray
		? /* translators: %d: number of items */ sprintf( _n( '%d item', '%d items', entries.length, 'routemark' ), entries.length )
		: /* translators: %d: number of keys */ sprintf( _n( '%d key', '%d keys', entries.length, 'routemark' ), entries.length );

	return (
		<div className="rmk-j-node">
			<div className="rmk-j-line">
				<button
					type="button"
					className={ `rmk-j-toggle${ open ? ' is-open' : '' }` }
					aria-expanded={ open }
					aria-label={ open ? __( 'Collapse', 'routemark' ) : __( 'Expand', 'routemark' ) }
					onClick={ () => setOpen( ! open ) }
				/>
				<Key name={ name } />
				<span className="rmk-j-punct">{ openCh }</span>
				{ ! open && (
					<>
						<button type="button" className="rmk-j-summary" onClick={ () => setOpen( true ) }>
							{ summary }
						</button>
						<span className="rmk-j-punct">
							{ closeCh }
							{ ! last && ',' }
						</span>
					</>
				) }
			</div>

			{ open && (
				<>
					<div className="rmk-j-children">
						{ entries.slice( 0, limit ).map( ( [ k, v ], i ) => (
							<Node key={ k ?? i } name={ k } value={ v } depth={ depth + 1 } openDepth={ openDepth } last={ i === entries.length - 1 } />
						) ) }
						{ entries.length > limit && (
							<button type="button" className="rmk-j-more" onClick={ () => setLimit( limit + CHUNK ) }>
								{ sprintf(
									/* translators: %d: number of hidden items */
									__( 'Show %d more…', 'routemark' ),
									Math.min( CHUNK, entries.length - limit )
								) }
							</button>
						) }
					</div>
					<div className="rmk-j-line">
						<span className="rmk-j-punct">
							{ closeCh }
							{ ! last && ',' }
						</span>
					</div>
				</>
			) }
		</div>
	);
}

const MISSING = Symbol( 'missing' );

/**
 * Only the parts of a value that match a search: keys or values containing
 * the term, with their parents so they keep their place. A matching key
 * keeps everything under it. Arrays keep their matching items.
 */
export function pruneJson( value: unknown, term: string ): { value: unknown; matches: number } {
	let matches = 0;
	const hit = ( text: string ) => text.toLowerCase().includes( term );

	const walk = ( v: unknown ): unknown => {
		if ( v !== null && typeof v === 'object' ) {
			if ( Array.isArray( v ) ) {
				const kept = v.map( walk ).filter( ( x ) => x !== MISSING );
				return kept.length ? kept : MISSING;
			}
			const out: Record< string, unknown > = {};
			for ( const [ k, child ] of Object.entries( v as Record< string, unknown > ) ) {
				if ( hit( k ) ) {
					matches++;
					out[ k ] = child;
					continue;
				}
				const kept = walk( child );
				if ( kept !== MISSING ) {
					out[ k ] = kept;
				}
			}
			return Object.keys( out ).length ? out : MISSING;
		}
		if ( hit( v === null ? 'null' : String( v ) ) ) {
			matches++;
			return v;
		}
		return MISSING;
	};

	const result = walk( value );
	return { value: result === MISSING ? undefined : result, matches };
}

interface Props {
	value: unknown;
	openDepth?: number;
	revision?: number;
	/** Highlight this text (case-insensitive). */
	highlight?: string;
	onLink?: ( url: string ) => boolean;
	isLink?: ( url: string ) => boolean;
}

// Bump `revision` to make the tree re-apply openDepth (expand/collapse all).
export default function JsonView( { value, openDepth = 2, revision = 0, highlight = '', onLink, isLink }: Props ) {
	return (
		<Options.Provider value={ { term: highlight.trim().toLowerCase(), onLink, isLink } }>
			<div className="rmk-json" key={ revision }>
				<Node value={ value } depth={ 0 } openDepth={ openDepth } last />
			</div>
		</Options.Provider>
	);
}
