import { useMemo, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { formatBytes } from '../lib/request';
import type { RunResult, SendAsUser } from '../types';
import { runAction, type RequestContext, type ResponseActionDef } from '../lib/extensions';
import DeniedHelp from './DeniedHelp';
import JsonView, { pruneJson } from './JsonView';
import SendAs, { sendAsLabel } from './SendAs';
import TableView, { isTable } from './TableView';
import { CopyButton, Icon, Tabs } from './ui';

type View = 'pretty' | 'table' | 'raw' | 'headers';

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

interface Props {
	result: RunResult | null;
	sentAs?: SendAsUser | null;
	// Buttons from add-ons, and what they get when clicked.
	actions?: ResponseActionDef[];
	context?: RequestContext;
	running: boolean;
	jsonDepth?: number;
	/** The route and method sent, for the "why was this refused" lookup. */
	route?: string;
	method?: string;
	/** Opens a REST URL in Routemark. False if it isn't one. */
	onLink?: ( url: string ) => boolean;
	isLink?: ( url: string ) => boolean;
	/** The page that was asked for, and a way to ask for another. */
	page?: number;
	onPage?: ( page: number ) => void;
	onRetryAsMe?: () => void;
	/** Send the same request as someone else and show both. */
	onCompare?: ( as: SendAsUser | null ) => void;
}

export default function ResponsePanel( {
	result,
	sentAs = null,
	running,
	jsonDepth = 2,
	actions = [],
	context,
	route,
	method,
	onLink,
	isLink,
	page = 1,
	onPage,
	onRetryAsMe,
	onCompare,
}: Props ) {
	const [ view, setView ] = useState< View >( 'pretty' );
	const [ depth, setDepth ] = useState( { open: jsonDepth, rev: 0 } );
	const [ search, setSearch ] = useState( '' );
	const term = search.trim().toLowerCase();
	const found = useMemo( () => ( result?.isJson && term ? pruneJson( result.json, term ) : null ), [ result, term ] );
	const table = !! result?.isJson && isTable( result.json );
	const rows = useMemo(
		() =>
			table && result ? ( result.json as Record< string, unknown >[] ).filter( ( r ) => ! term || JSON.stringify( r ).toLowerCase().includes( term ) ) : [],
		[ table, result, term ]
	);
	// Stay on Body if a new response isn't a list any more.
	const shown: View = view === 'table' && ! table ? 'pretty' : view;

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
	const pageCount = Number( pages ?? 0 );
	const denied = result.status === 401 || result.status === 403;
	// The server says who it ran as. If we asked for someone and that header
	// is missing (and it wasn't our own refusal), something else answered the
	// request first, so it most likely ran as you.
	const switchMissed = !! sentAs && result.ranAs !== sentAs.id && error?.code !== 'routemark_send_as_denied' && result.status !== 0;
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
				{ sentAs && ! switchMissed && (
					<span className="rmk-response-stat rmk-response-as">
						<Icon name={ sentAs.id === 0 ? 'globe' : 'user' } size={ 13 } />
						{ /* translators: %s: user name, or "Logged out" */ sprintf( __( 'as %s', 'routemark' ), sendAsLabel( sentAs ) ) }
					</span>
				) }
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
				{ result.stats && (
					<span className="rmk-response-server">
						<span
							className="rmk-response-stat"
							title={ sprintf(
								/* translators: %d: database queries for the whole request */
								__( 'Database queries while WordPress handled this request. %d for the whole request, including loading WordPress and plugins.', 'routemark' ),
								result.stats.queriesTotal
							) }
						>
							<Icon name="database" size={ 13 } />
							{ sprintf(
								/* translators: %d: number of database queries */
								_n( '%d query', '%d queries', result.stats.queries, 'routemark' ),
								result.stats.queries
							) }
						</span>
						<span
							className="rmk-response-stat"
							title={ sprintf(
								/* translators: %s: milliseconds */
								__( 'Time in PHP from dispatch until the response was ready, not counting _embed. %s ms for the whole request, including loading WordPress.', 'routemark' ),
								String( result.stats.totalMs )
							) }
						>
							<Icon name="cpu" size={ 13 } />
							{ /* translators: %s: milliseconds */ sprintf( __( 'PHP %s ms', 'routemark' ), String( Math.round( result.stats.handlerMs ) ) ) }
						</span>
						<span className="rmk-response-stat" title={ __( 'Peak PHP memory for the whole request.', 'routemark' ) }>
							{ formatBytes( result.stats.peakMemory ) }
						</span>
					</span>
				) }
			</div>

			{ switchMissed && (
				<div className="rmk-callout rmk-callout--warn">
					<Icon name="alert" size={ 16 } />
					<div>
						<p>
							{ sprintf(
								/* translators: %s: user name, or "Logged out" */
								__( 'This was meant to run as %s, but the server didn\'t confirm the switch. Another plugin probably answered the request first, so treat this response as yours.', 'routemark' ),
								sendAsLabel( sentAs )
							) }
						</p>
					</div>
				</div>
			) }

			{ error && (
				<div className="rmk-callout rmk-callout--error">
					<Icon name="alert" size={ 16 } />
					<div>
						<code>{ error.code }</code>
						<p>{ error.message }</p>
					</div>
				</div>
			) }

			{ denied && route && method && ! switchMissed && (
				<DeniedHelp route={ route } method={ method } sentAs={ sentAs } code={ error?.code ?? null } status={ result.status } onRetryAsMe={ onRetryAsMe } />
			) }

			{ onPage && pageCount > 1 && (
				<div className="rmk-pager" role="navigation" aria-label={ __( 'Pages', 'routemark' ) }>
					<button type="button" className="rmk-btn rmk-btn--ghost" disabled={ page <= 1 || running } onClick={ () => onPage( page - 1 ) }>
						<Icon name="arrowLeft" size={ 14 } /> { __( 'Previous', 'routemark' ) }
					</button>
					<span className="rmk-pager-text">
						{ sprintf(
							/* translators: 1: current page, 2: number of pages */
							__( 'Page %1$d of %2$d', 'routemark' ),
							page,
							pageCount
						) }
					</span>
					<button type="button" className="rmk-btn rmk-btn--ghost" disabled={ page >= pageCount || running } onClick={ () => onPage( page + 1 ) }>
						{ __( 'Next', 'routemark' ) } <Icon name="arrowRight" size={ 14 } />
					</button>
				</div>
			) }

			<Tabs< View >
				label={ __( 'Response view', 'routemark' ) }
				active={ shown }
				onChange={ setView }
				tabs={ [
					{ id: 'pretty', label: __( 'Body', 'routemark' ) },
					{ id: 'table', label: __( 'Table', 'routemark' ), hidden: ! table },
					{ id: 'raw', label: __( 'Raw', 'routemark' ) },
					{ id: 'headers', label: __( 'Headers', 'routemark' ), count: headerCount },
				] }
				trailing={
					<>
						{ onCompare && (
							<SendAs
								id="rmk-compare"
								label={ __( 'Compare with', 'routemark' ) }
								value={ null }
								onChange={ ( as ) => onCompare( as ) }
								showNote={ false }
								hideYou={ ! sentAs }
								variant="inline"
							/>
						) }
						{ shown === 'pretty' && result.isJson && ! term && (
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
						{ context &&
							actions.map( ( a ) => (
								<button
									key={ a.id }
									type="button"
									className="rmk-btn rmk-btn--ghost rmk-ext-action"
									onClick={ () => runAction( a, { ...context, result } ) }
								>
									{ a.label }
								</button>
							) ) }
						<CopyButton text={ shown === 'headers' ? JSON.stringify( result.headers, null, 2 ) : pretty } />
					</>
				}
			/>

			{ result.isJson && ( shown === 'pretty' || shown === 'table' ) && (
				<div className="rmk-response-search">
					<label className="rmk-search">
						<Icon name="search" size={ 14 } />
						<span className="screen-reader-text">{ __( 'Search the response', 'routemark' ) }</span>
						<input
							type="search"
							className="rmk-search-input"
							placeholder={ shown === 'table' ? __( 'Filter rows', 'routemark' ) : __( 'Search keys and values', 'routemark' ) }
							value={ search }
							onChange={ ( e ) => setSearch( e.target.value ) }
						/>
					</label>
					{ term && shown === 'pretty' && found && (
						<span className="rmk-muted">
							{ sprintf(
								/* translators: %d: number of matches */
								_n( '%d match', '%d matches', found.matches, 'routemark' ),
								found.matches
							) }
						</span>
					) }
					{ term && shown === 'table' && (
						<span className="rmk-muted">
							{ sprintf(
								/* translators: 1: rows shown, 2: all rows */
								__( '%1$d of %2$d rows', 'routemark' ),
								rows.length,
								( result.json as unknown[] ).length
							) }
						</span>
					) }
				</div>
			) }

			<div className="rmk-response-body">
				{ shown === 'pretty' &&
					( result.isJson ? (
						term ? (
							found && found.value !== undefined ? (
								<JsonView value={ found.value } openDepth={ 99 } highlight={ term } onLink={ onLink } isLink={ isLink } />
							) : (
								<p className="rmk-muted rmk-response-nomatch">{ __( 'Nothing in the response matches that.', 'routemark' ) }</p>
							)
						) : (
							<JsonView value={ result.json } openDepth={ depth.open } revision={ depth.rev } onLink={ onLink } isLink={ isLink } />
						)
					) : (
						<pre className="rmk-pre">{ result.raw || __( '(empty body)', 'routemark' ) }</pre>
					) ) }

				{ shown === 'table' && <TableView rows={ rows } onLink={ onLink } /> }

				{ shown === 'raw' && <pre className="rmk-pre rmk-pre--wrap">{ result.raw || __( '(empty body)', 'routemark' ) }</pre> }

				{ shown === 'headers' && (
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
