import { useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

const CHUNK = 100;

function Primitive( { value }: { value: unknown } ) {
	if ( value === null ) {
		return <span className="rb-j-null">null</span>;
	}
	if ( typeof value === 'string' ) {
		return <span className="rb-j-str">{ JSON.stringify( value ) }</span>;
	}
	if ( typeof value === 'number' ) {
		return <span className="rb-j-num">{ String( value ) }</span>;
	}
	if ( typeof value === 'boolean' ) {
		return <span className="rb-j-bool">{ String( value ) }</span>;
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
			<span className="rb-j-key">{ JSON.stringify( name ) }</span>
			<span className="rb-j-punct">: </span>
		</>
	);
}

function Node( { name, value, depth, openDepth, last }: NodeProps ) {
	const isObject = value !== null && typeof value === 'object';
	const [ open, setOpen ] = useState( depth < openDepth );
	const [ limit, setLimit ] = useState( CHUNK );

	if ( ! isObject ) {
		return (
			<div className="rb-j-line">
				<Key name={ name } />
				<Primitive value={ value } />
				{ ! last && <span className="rb-j-punct">,</span> }
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
			<div className="rb-j-line">
				<Key name={ name } />
				<span className="rb-j-punct">
					{ openCh }
					{ closeCh }
				</span>
				{ ! last && <span className="rb-j-punct">,</span> }
			</div>
		);
	}

	const summary = isArray
		? /* translators: %d: number of items */ sprintf( _n( '%d item', '%d items', entries.length, 'restbench' ), entries.length )
		: /* translators: %d: number of keys */ sprintf( _n( '%d key', '%d keys', entries.length, 'restbench' ), entries.length );

	return (
		<div className="rb-j-node">
			<div className="rb-j-line">
				<button
					type="button"
					className={ `rb-j-toggle${ open ? ' is-open' : '' }` }
					aria-expanded={ open }
					aria-label={ open ? __( 'Collapse', 'restbench' ) : __( 'Expand', 'restbench' ) }
					onClick={ () => setOpen( ! open ) }
				/>
				<Key name={ name } />
				<span className="rb-j-punct">{ openCh }</span>
				{ ! open && (
					<>
						<button type="button" className="rb-j-summary" onClick={ () => setOpen( true ) }>
							{ summary }
						</button>
						<span className="rb-j-punct">
							{ closeCh }
							{ ! last && ',' }
						</span>
					</>
				) }
			</div>

			{ open && (
				<>
					<div className="rb-j-children">
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
							<button type="button" className="rb-j-more" onClick={ () => setLimit( limit + CHUNK ) }>
								{ sprintf(
									/* translators: %d: number of hidden items */
									__( 'Show %d more…', 'restbench' ),
									Math.min( CHUNK, entries.length - limit )
								) }
							</button>
						) }
					</div>
					<div className="rb-j-line">
						<span className="rb-j-punct">
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
		<div className="rb-json" key={ revision }>
			<Node value={ value } depth={ 0 } openDepth={ openDepth } last />
		</div>
	);
}
