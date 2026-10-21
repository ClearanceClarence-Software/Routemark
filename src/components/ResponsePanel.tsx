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
			<section className="rb-response rb-response--empty" aria-live="polite">
				{ running ? (
					<div className="rb-response-wait">
						<span className="rb-pulse" /> { __( 'Sending…', 'restbench' ) }
					</div>
				) : (
					<div className="rb-response-idle">
						<p>{ __( 'Nothing sent yet.', 'restbench' ) }</p>
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
		<section className={ `rb-response${ running ? ' is-stale' : '' }` } aria-live="polite">
			<div className="rb-response-bar">
				<span className={ `rb-status rb-status--${ family }xx` }>
					<strong>{ result.status || 'ERR' }</strong>
					<span>{ result.statusText || REASONS[ result.status ] || '' }</span>
				</span>
				<span className="rb-response-stat">
					<Icon name="clock" size={ 13 } /> { result.durationMs } ms
				</span>
				<span className="rb-response-stat">{ formatBytes( result.sizeBytes ) }</span>
				{ total !== undefined && (
					<span className="rb-response-stat">
						{ sprintf(
							/* translators: 1: total items, 2: total pages */
							__( '%1$s items · %2$s pages', 'restbench' ),
							total,
							pages ?? '1'
						) }
					</span>
				) }
			</div>

			{ error && (
				<div className="rb-callout rb-callout--error">
					<Icon name="alert" size={ 16 } />
					<div>
						<code>{ error.code }</code>
						<p>{ error.message }</p>
					</div>
				</div>
			) }

			<Tabs< View >
				label={ __( 'Response view', 'restbench' ) }
				active={ view }
				onChange={ setView }
				tabs={ [
					{ id: 'pretty', label: __( 'Body', 'restbench' ) },
					{ id: 'raw', label: __( 'Raw', 'restbench' ) },
					{ id: 'headers', label: __( 'Headers', 'restbench' ), count: headerCount },
				] }
				trailing={
					<>
						{ view === 'pretty' && result.isJson && (
							<>
								<button
									type="button"
									className="rb-btn rb-btn--icon rb-btn--ghost"
									title={ __( 'Expand all', 'restbench' ) }
									aria-label={ __( 'Expand all', 'restbench' ) }
									onClick={ () => setDepth( ( d ) => ( { open: 99, rev: d.rev + 1 } ) ) }
								>
									<Icon name="expand" size={ 14 } />
								</button>
								<button
									type="button"
									className="rb-btn rb-btn--icon rb-btn--ghost"
									title={ __( 'Collapse all', 'restbench' ) }
									aria-label={ __( 'Collapse all', 'restbench' ) }
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

			<div className="rb-response-body">
				{ view === 'pretty' &&
					( result.isJson ? (
						<JsonView value={ result.json } openDepth={ depth.open } revision={ depth.rev } />
					) : (
						<pre className="rb-pre">{ result.raw || __( '(empty body)', 'restbench' ) }</pre>
					) ) }

				{ view === 'raw' && <pre className="rb-pre rb-pre--wrap">{ result.raw || __( '(empty body)', 'restbench' ) }</pre> }

				{ view === 'headers' && (
					<table className="rb-table rb-table--headers">
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
