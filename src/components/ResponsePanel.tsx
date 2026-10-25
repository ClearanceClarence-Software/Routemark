import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { formatBytes } from '../lib/request';
import type { RunResult } from '../types';
import JsonView from './JsonView';
import { CopyButton, Icon, Tabs } from './ui';

type View = 'pretty' | 'raw' | 'headers';

const REASONS: Record< number, string > = {
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	405: 'Method Not Allowed',
	500: 'Internal Server Error',
};

// WP error responses look like { code, message, data: { status } }
function wpError( result: RunResult ): { code: string; message: string } | null {
	const j = result.json as { code?: unknown; message?: unknown } | null;
	if ( result.status >= 400 && j && typeof j.code === 'string' && typeof j.message === 'string' ) {
		return { code: j.code, message: j.message };
	}
	return null;
}

export default function ResponsePanel( { result, running, jsonDepth = 2 }: { result: RunResult | null; running: boolean; jsonDepth?: number } ) {
	const [ view, setView ] = useState< View >( 'pretty' );
	const [ depth, setDepth ] = useState( { open: jsonDepth, rev: 0 } );

	if ( ! result ) {
		return (
			<section className="rmk-response rmk-response--empty" aria-live="polite">
				{ running ? (
					<div className="rmk-response-wait">
						<span className="rmk-pulse" /> { __( 'Sending…', 'routemark' ) }
					</div>
				) : (
					<div className="rmk-response-idle">
						<p>{ __( 'Nothing sent yet.', 'routemark' ) }</p>
					</div>
				) }
			</section>
		);
	}

	const family = Math.floor( result.status / 100 );
	const error = wpError( result );
	const headerCount = Object.keys( result.headers ).length;
	const total = result.headers[ 'x-wp-total' ];
	const pages = result.headers[ 'x-wp-totalpages' ];
	const pretty = result.isJson ? JSON.stringify( result.json, null, 2 ) : result.raw;

	return (
		<section className={ `rmk-response${ running ? ' is-stale' : '' }` } aria-live="polite">
			<div className="rmk-response-bar">
				<span className={ `rmk-status rmk-status--${ family }xx` }>
					<strong>{ result.status || 'ERR' }</strong>
					<span>{ result.statusText || REASONS[ result.status ] || '' }</span>
				</span>
				<span className="rmk-response-stat">
					<Icon name="clock" size={ 13 } /> { result.durationMs } ms
				</span>
				<span className="rmk-response-stat">{ formatBytes( result.sizeBytes ) }</span>
				{ total !== undefined && (
					<span className="rmk-response-stat">
						{ sprintf(
							/* translators: 1: total items, 2: total pages */
							__( '%1$s items · %2$s pages', 'routemark' ),
							total,
							pages ?? '1'
						) }
					</span>
				) }
			</div>

			{ error && (
				<div className="rmk-callout rmk-callout--error">
					<Icon name="alert" size={ 16 } />
					<div>
						<code>{ error.code }</code>
						<p>{ error.message }</p>
					</div>
				</div>
			) }

			<Tabs< View >
				label={ __( 'Response view', 'routemark' ) }
				active={ view }
				onChange={ setView }
				tabs={ [
					{ id: 'pretty', label: __( 'Body', 'routemark' ) },
					{ id: 'raw', label: __( 'Raw', 'routemark' ) },
					{ id: 'headers', label: __( 'Headers', 'routemark' ), count: headerCount },
				] }
				trailing={
					<>
						{ view === 'pretty' && result.isJson && (
							<>
								<button
									type="button"
									className="rmk-btn rmk-btn--icon rmk-btn--ghost"
									title={ __( 'Expand all', 'routemark' ) }
									aria-label={ __( 'Expand all', 'routemark' ) }
									onClick={ () => setDepth( ( d ) => ( { open: 99, rev: d.rev + 1 } ) ) }
								>
									<Icon name="expand" size={ 14 } />
								</button>
								<button
									type="button"
									className="rmk-btn rmk-btn--icon rmk-btn--ghost"
									title={ __( 'Collapse all', 'routemark' ) }
									aria-label={ __( 'Collapse all', 'routemark' ) }
									onClick={ () => setDepth( ( d ) => ( { open: 1, rev: d.rev + 1 } ) ) }
								>
									<Icon name="collapse" size={ 14 } />
								</button>
							</>
						) }
						<CopyButton text={ view === 'headers' ? JSON.stringify( result.headers, null, 2 ) : pretty } />
					</>
				}
			/>

			<div className="rmk-response-body">
				{ view === 'pretty' &&
					( result.isJson ? (
						<JsonView value={ result.json } openDepth={ depth.open } revision={ depth.rev } />
					) : (
						<pre className="rmk-pre">{ result.raw || __( '(empty body)', 'routemark' ) }</pre>
					) ) }

				{ view === 'raw' && <pre className="rmk-pre rmk-pre--wrap">{ result.raw || __( '(empty body)', 'routemark' ) }</pre> }

				{ view === 'headers' && (
					<table className="rmk-table rmk-table--headers">
						<tbody>
							{ Object.entries( result.headers )
								.sort( ( [ a ], [ b ] ) => a.localeCompare( b ) )
								.map( ( [ k, v ] ) => (
									<tr key={ k }>
										<th scope="row">
											<code>{ k }</code>
										</th>
										<td>
											<code>{ v }</code>
										</td>
									</tr>
								) ) }
						</tbody>
					</table>
				) }
			</div>
		</section>
	);
}
