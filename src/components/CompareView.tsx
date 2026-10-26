import { __, sprintf } from '@wordpress/i18n';

import type { RunResult, SendAsUser } from '../types';
import { sendAsLabel } from './SendAs';
import { Icon } from './ui';

type Line = { text: string; kind: 'same' | 'only-a' | 'only-b' };

// Past this many line pairs the table gets too big to diff in the browser.
const MAX_CELLS = 4_000_000;

/** Line diff (longest common subsequence), split into the two sides. */
export function diffLines( a: string[], b: string[] ): { left: Line[]; right: Line[]; changed: number } | null {
	if ( a.length * b.length > MAX_CELLS ) {
		return null;
	}
	const n = a.length;
	const m = b.length;
	const lcs: Uint32Array[] = Array.from( { length: n + 1 }, () => new Uint32Array( m + 1 ) );
	for ( let i = n - 1; i >= 0; i-- ) {
		for ( let j = m - 1; j >= 0; j-- ) {
			lcs[ i ][ j ] = a[ i ] === b[ j ] ? lcs[ i + 1 ][ j + 1 ] + 1 : Math.max( lcs[ i + 1 ][ j ], lcs[ i ][ j + 1 ] );
		}
	}
	const left: Line[] = [];
	const right: Line[] = [];
	let changed = 0;
	let i = 0;
	let j = 0;
	while ( i < n || j < m ) {
		if ( i < n && j < m && a[ i ] === b[ j ] ) {
			left.push( { text: a[ i++ ], kind: 'same' } );
			right.push( { text: b[ j++ ], kind: 'same' } );
		} else if ( j < m && ( i >= n || lcs[ i ][ j + 1 ] >= lcs[ i + 1 ][ j ] ) ) {
			right.push( { text: b[ j++ ], kind: 'only-b' } );
			changed++;
		} else {
			left.push( { text: a[ i++ ], kind: 'only-a' } );
			changed++;
		}
	}
	return { left, right, changed };
}

const pretty = ( r: RunResult ) => ( r.isJson ? JSON.stringify( r.json, null, 2 ) : r.raw );

interface Props {
	a: { as: SendAsUser | null; result: RunResult };
	b: { as: SendAsUser | null; result: RunResult | null };
	onClose: () => void;
}

/** The same request sent as two users, side by side, with the differences marked. */
export default function CompareView( { a, b, onClose }: Props ) {
	const diff = b.result ? diffLines( pretty( a.result ).split( '\n' ), pretty( b.result ).split( '\n' ) ) : null;

	const side = ( who: SendAsUser | null, result: RunResult | null, lines: Line[] | null ) => (
		<div className="rmk-compare-side">
			<div className="rmk-compare-head">
				<Icon name={ who?.id === 0 ? 'globe' : 'user' } size={ 14 } />
				<strong>{ sendAsLabel( who ) }</strong>
				{ result && <span className={ `rmk-status-dot rmk-status--${ Math.floor( result.status / 100 ) }xx` }>{ result.status || 'ERR' }</span> }
			</div>
			{ ! result && (
				<div className="rmk-response-wait">
					<span className="rmk-pulse" /> { __( 'Sending…', 'routemark' ) }
				</div>
			) }
			{ result && (
				<pre className="rmk-pre rmk-compare-pre">
					{ lines
						? lines.map( ( l, i ) => (
								<span key={ i } className={ `rmk-compare-line is-${ l.kind }` }>
									{ l.text }
									{ '\n' }
								</span>
						  ) )
						: pretty( result ) }
				</pre>
			) }
		</div>
	);

	return (
		<section className="rmk-response rmk-compare" aria-live="polite">
			<div className="rmk-response-bar">
				<Icon name="columns" size={ 15 } />
				<strong>{ __( 'Compare', 'routemark' ) }</strong>
				{ diff && (
					<span className="rmk-response-stat">
						{ diff.changed === 0
							? __( 'Same response for both', 'routemark' )
							: sprintf(
									/* translators: %d: number of lines that differ */
									__( '%d lines differ', 'routemark' ),
									diff.changed
							  ) }
					</span>
				) }
				{ b.result && ! diff && <span className="rmk-response-stat">{ __( 'Too big to mark the differences line by line', 'routemark' ) }</span> }
				<span className="rmk-spacer" />
				<button type="button" className="rmk-btn rmk-btn--ghost" onClick={ onClose }>
					<Icon name="x" size={ 14 } /> { __( 'Close', 'routemark' ) }
				</button>
			</div>
			<div className="rmk-compare-grid">
				{ side( a.as, a.result, diff?.left ?? null ) }
				{ side( b.as, b.result, diff?.right ?? null ) }
			</div>
		</section>
	);
}
