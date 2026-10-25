import { useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

const CHUNK = 100;

function Primitive( { value }: { value: unknown } ) {
	if ( value === null ) {
		return <span className="rmk-j-null">null</span>;
	}
	if ( typeof value === 'string' ) {
		return <span className="rmk-j-str">{ JSON.stringify( value ) }</span>;
	}
	if ( typeof value === 'number' ) {
		return <span className="rmk-j-num">{ String( value ) }</span>;
	}
	if ( typeof value === 'boolean' ) {
		return <span className="rmk-j-bool">{ String( value ) }</span>;
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
			<span className="rmk-j-key">{ JSON.stringify( name ) }</span>
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
							<Node
								key={ k ?? i }
								name={ k }
								value={ v }
								depth={ depth + 1 }
								openDepth={ openDepth }
								last={ i === entries.length - 1 }
							/>
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

// Bump `revision` to make the tree re-apply openDepth (expand/collapse all).
export default function JsonView( { value, openDepth = 2, revision = 0 }: { value: unknown; openDepth?: number; revision?: number } ) {
	return (
		<div className="rmk-json" key={ revision }>
			<Node value={ value } depth={ 0 } openDepth={ openDepth } last />
		</div>
	);
}
