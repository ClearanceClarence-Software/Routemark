import { useCallback, useEffect, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { readState, storageKey, writeState, type RecordedCall, type RecorderState } from '../lib/recorded-store';
import { Icon, Method } from './ui';

const userId = () => window.routemarkSettings?.userId ?? 0;

/** The recorder's state, kept in step with other tabs where it's recording. */
export function useRecorder(): [ RecorderState, ( next: RecorderState ) => void ] {
	const [ state, setState ] = useState< RecorderState >( () => readState( userId() ) );

	useEffect( () => {
		const onStorage = ( e: StorageEvent ) => {
			if ( e.key === storageKey( userId() ) ) {
				setState( readState( userId() ) );
			}
		};
		window.addEventListener( 'storage', onStorage );
		return () => window.removeEventListener( 'storage', onStorage );
	}, [] );

	const update = useCallback( ( next: RecorderState ) => {
		writeState( userId(), next );
		setState( readState( userId() ) );
	}, [] );

	return [ state, update ];
}

// "/wp-admin/post.php?post=12&action=edit" -> "post.php"
function pageLabel( page: string ): string {
	const file = page.split( '?' )[ 0 ].split( '/' ).filter( Boolean ).pop() ?? page;
	const query = new URLSearchParams( page.split( '?' )[ 1 ] ?? '' );
	return query.get( 'page' ) ?? file;
}

function timeOf( at: number ): string {
	return new Date( at ).toLocaleTimeString( [], { hour: '2-digit', minute: '2-digit', second: '2-digit' } );
}

interface Props {
	state: RecorderState;
	onChange: ( next: RecorderState ) => void;
	onOpen: ( call: RecordedCall ) => void;
	/** Whether a call matches a route here, so it can be opened. */
	canOpen: ( call: RecordedCall ) => boolean;
}

export default function RecordedList( { state, onChange, onOpen, canOpen }: Props ) {
	const [ filter, setFilter ] = useState( '' );
	const shown = filter.trim()
		? state.calls.filter( ( c ) => `${ c.method } ${ c.path } ${ c.page }`.toLowerCase().includes( filter.trim().toLowerCase() ) )
		: state.calls;

	return (
		<div className="rmk-tree rmk-recorded">
			<div className={ `rmk-recorder-bar${ state.on ? ' is-on' : '' }` }>
				<span className="rmk-recorder-dot" aria-hidden="true" />
				<span className="rmk-recorder-state">{ state.on ? __( 'Recording', 'routemark' ) : __( 'Not recording', 'routemark' ) }</span>
				<span className="rmk-spacer" />
				<button type="button" className={ `rmk-btn ${ state.on ? 'rmk-btn--ghost' : 'rmk-btn--primary' }` } onClick={ () => onChange( { ...state, on: ! state.on } ) }>
					{ state.on ? __( 'Stop', 'routemark' ) : __( 'Start recording', 'routemark' ) }
				</button>
			</div>

			<p className="rmk-muted rmk-note rmk-recorded-help">
				{ state.on
					? __( 'Use any admin screen in another tab, like the block editor. Its REST requests show up here as they happen.', 'routemark' )
					: __( 'Records the REST requests other admin screens make, like the block editor, so you can open them here and send them again. They stay in this browser only.', 'routemark' ) }
			</p>

			{ state.calls.length > 0 && (
				<label className="rmk-search rmk-recorded-filter">
					<Icon name="search" size={ 15 } />
					<span className="screen-reader-text">{ __( 'Filter recorded calls', 'routemark' ) }</span>
					<input type="search" className="rmk-search-input" placeholder={ __( 'Filter recorded calls', 'routemark' ) } value={ filter } onChange={ ( e ) => setFilter( e.target.value ) } />
				</label>
			) }

			{ state.calls.length === 0 ? (
				<p className="rmk-tree-empty">{ __( 'Nothing recorded yet.', 'routemark' ) }</p>
			) : (
				<>
					<ul className="rmk-history">
						{ shown.map( ( call ) => {
							const openable = canOpen( call );
							return (
								<li key={ call.id }>
									<button
										type="button"
										className="rmk-history-item rmk-recorded-item"
										onClick={ () => onOpen( call ) }
										disabled={ ! openable }
										title={ openable ? call.path : __( 'No route on this site matches this path.', 'routemark' ) }
									>
										<span className="rmk-history-top">
											<Method method={ call.method } size="sm" />
											<span className={ `rmk-status-dot rmk-status--${ Math.floor( call.status / 100 ) }xx` }>{ call.status || 'ERR' }</span>
											<span className="rmk-history-as" title={ call.page }>
												{ pageLabel( call.page ) }
											</span>
											<span className="rmk-history-time">{ timeOf( call.at ) }</span>
										</span>
										<span className="rmk-history-path">{ call.path }</span>
									</button>
								</li>
							);
						} ) }
					</ul>
					<button type="button" className="rmk-btn rmk-btn--ghost rmk-history-clear" onClick={ () => onChange( { ...state, calls: [] } ) }>
						<Icon name="trash" size={ 14 } />
						{ sprintf(
							/* translators: %d: number of recorded requests */
							_n( 'Clear %d call', 'Clear %d calls', state.calls.length, 'routemark' ),
							state.calls.length
						) }
					</button>
				</>
			) }
		</div>
	);
}
