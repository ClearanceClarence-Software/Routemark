import { __, _n, sprintf } from '@wordpress/i18n';

const MAX_COLUMNS = 12;
const MAX_TEXT = 80;

/** A list of objects, which is what a collection route returns. */
export function isTable( value: unknown ): value is Record< string, unknown >[] {
	return Array.isArray( value ) && value.length > 0 && value.every( ( v ) => v !== null && typeof v === 'object' && ! Array.isArray( v ) );
}

// id first, _links and _embedded last (they're for following, not reading).
function columnsFor( rows: Record< string, unknown >[] ): string[] {
	const seen: string[] = [];
	rows.slice( 0, 50 ).forEach( ( r ) => Object.keys( r ).forEach( ( k ) => ! seen.includes( k ) && seen.push( k ) ) );
	const rank = ( k: string ) => ( k === 'id' ? 0 : k.startsWith( '_' ) ? 2 : 1 );
	return seen.sort( ( a, b ) => rank( a ) - rank( b ) ).filter( ( k ) => ! k.startsWith( '_' ) );
}

function strip( html: string ): string {
	const doc = new DOMParser().parseFromString( html, 'text/html' );
	return ( doc.body.textContent ?? '' ).replace( /\s+/g, ' ' ).trim();
}

function cell( value: unknown ): { text: string; kind: string } {
	if ( value === null || value === undefined ) {
		return { text: value === null ? 'null' : '', kind: 'null' };
	}
	if ( typeof value === 'object' ) {
		// Core's { rendered, raw } fields: show the text.
		const rendered = ( value as { rendered?: unknown } ).rendered;
		if ( typeof rendered === 'string' ) {
			return { text: strip( rendered ), kind: 'str' };
		}
		const count = Array.isArray( value ) ? value.length : Object.keys( value ).length;
		return { text: Array.isArray( value ) ? `[${ count }]` : `{${ count }}`, kind: 'punct' };
	}
	if ( typeof value === 'string' ) {
		return { text: value, kind: 'str' };
	}
	return { text: String( value ), kind: typeof value === 'number' ? 'num' : 'bool' };
}

function selfLink( row: Record< string, unknown > ): string | null {
	const links = row._links as { self?: Array< { href?: unknown } > } | undefined;
	const href = links?.self?.[ 0 ]?.href;
	return typeof href === 'string' ? href : null;
}

interface Props {
	rows: Record< string, unknown >[];
	onLink?: ( url: string ) => boolean;
}

export default function TableView( { rows, onLink }: Props ) {
	const all = columnsFor( rows );
	const columns = all.slice( 0, MAX_COLUMNS );

	return (
		<div className="rmk-table-view">
			<div className="rmk-table-scroll">
				<table className="rmk-table rmk-table--data">
					<thead>
						<tr>
							{ columns.map( ( c ) => (
								<th key={ c } scope="col">
									{ c }
								</th>
							) ) }
							{ onLink && <th className="rmk-table-open" aria-label={ __( 'Open', 'routemark' ) } /> }
						</tr>
					</thead>
					<tbody>
						{ rows.map( ( row, i ) => {
							const href = selfLink( row );
							return (
								<tr key={ i }>
									{ columns.map( ( c ) => {
										const { text, kind } = cell( row[ c ] );
										return (
											<td key={ c } className={ `rmk-j-${ kind }` } title={ text.length > MAX_TEXT ? text : undefined }>
												{ text.length > MAX_TEXT ? `${ text.slice( 0, MAX_TEXT ) }…` : text }
											</td>
										);
									} ) }
									{ onLink && (
										<td className="rmk-table-open">
											{ href && (
												<button type="button" className="rmk-link" onClick={ () => onLink( href ) }>
													{ __( 'Open', 'routemark' ) }
												</button>
											) }
										</td>
									) }
								</tr>
							);
						} ) }
					</tbody>
				</table>
			</div>
			{ all.length > columns.length && (
				<p className="rmk-muted rmk-note">
					{ sprintf(
						/* translators: %d: number of columns not shown */
						_n( '%d more field is in the Body view.', '%d more fields are in the Body view.', all.length - columns.length, 'routemark' ),
						all.length - columns.length
					) }
				</p>
			) }
		</div>
	);
}
