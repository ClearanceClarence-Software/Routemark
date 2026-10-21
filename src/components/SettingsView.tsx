import { __, _n, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';

import { groupRoutes, groupSource } from '../lib/routes';
import { SNIPPET_LABELS, type SnippetKind } from '../lib/snippets';
import type { RouteInfo, Settings } from '../types';
import { Toggle } from './ui';

interface Props {
	settings: Settings;
	routes: RouteInfo[];
	historyCount: number;
	status: 'idle' | 'saving' | 'saved' | 'error';
	onChange: ( patch: Partial< Settings > ) => void;
	onClearHistory: () => void;
}

const HISTORY_SIZES = [ 10, 20, 40, 100, 200 ];

function Row( { label, help, htmlFor, children }: { label: string; help?: ReactNode; htmlFor?: string; children: ReactNode } ) {
	return (
		<div className="rb-setting">
			<div className="rb-setting-text">
				{ htmlFor ? (
					<label className="rb-setting-label" htmlFor={ htmlFor }>
						{ label }
					</label>
				) : (
					<span className="rb-setting-label">{ label }</span>
				) }
				{ help && <p className="rb-setting-help">{ help }</p> }
			</div>
			<div className="rb-setting-control">{ children }</div>
		</div>
	);
}

function Choice< T extends string >( {
	value,
	options,
	onChange,
	label,
}: {
	value: T;
	options: Array< { value: T; label: string } >;
	onChange: ( v: T ) => void;
	label: string;
} ) {
	return (
		<div className="rb-seg" role="group" aria-label={ label }>
			{ options.map( ( o ) => (
				<button
					key={ o.value }
					type="button"
					aria-pressed={ value === o.value }
					className={ value === o.value ? 'is-on' : '' }
					onClick={ () => onChange( o.value ) }
				>
					{ o.label }
				</button>
			) ) }
		</div>
	);
}

export default function SettingsView( { settings, routes, historyCount, status, onChange, onClearHistory }: Props ) {
	const groups = groupRoutes( routes );
	const hidden = new Set( settings.hiddenNamespaces );

	const toggleNamespace = ( ns: string ) => {
		const next = new Set( hidden );
		if ( next.has( ns ) ) {
			next.delete( ns );
		} else {
			next.add( ns );
		}
		onChange( { hiddenNamespaces: Array.from( next ) } );
	};

	return (
		<div className="rb-settings">
			<div className="rb-settings-head">
				<h2 className="rb-overview-title">{ __( 'Settings', 'restbench' ) }</h2>
				<span className={ `rb-save-status is-${ status }` } aria-live="polite">
					{ status === 'saving' && __( 'Saving…', 'restbench' ) }
					{ status === 'saved' && __( 'Saved', 'restbench' ) }
					{ status === 'error' && __( "Couldn't save. Try again?", 'restbench' ) }
				</span>
			</div>
			<p className="rb-overview-lede">
				{ __( 'These are saved to your user account, so they follow you to other browsers. Other admins have their own.', 'restbench' ) }
			</p>

			<section className="rb-overview-section">
				<h3 className="rb-section-title">{ __( 'History', 'restbench' ) }</h3>
				<div className="rb-settings-card">
					<Row
						label={ __( 'Keep request history', 'restbench' ) }
						help={ __( "History is stored in this browser only. Turning this off also clears what's there now.", 'restbench' ) }
					>
						<Toggle
							checked={ settings.keepHistory }
							onChange={ ( keepHistory ) => onChange( { keepHistory } ) }
							label={ __( 'Keep request history', 'restbench' ) }
						/>
					</Row>
					<Row label={ __( 'Requests to keep', 'restbench' ) } htmlFor="rb-history-size">
						<select
							id="rb-history-size"
							className="rb-input"
							value={ settings.historySize }
							disabled={ ! settings.keepHistory }
							onChange={ ( e ) => onChange( { historySize: Number( e.target.value ) } ) }
						>
							{ HISTORY_SIZES.map( ( n ) => (
								<option key={ n } value={ n }>
									{ n }
								</option>
							) ) }
						</select>
					</Row>
					<Row
						label={ __( 'Saved right now', 'restbench' ) }
						help={ sprintf(
							/* translators: %d: number of saved requests */
							_n( '%d request', '%d requests', historyCount, 'restbench' ),
							historyCount
						) }
					>
						<button type="button" className="rb-btn rb-btn--outline" disabled={ historyCount === 0 } onClick={ onClearHistory }>
							{ __( 'Clear history', 'restbench' ) }
						</button>
					</Row>
				</div>
			</section>

			<section className="rb-overview-section">
				<h3 className="rb-section-title">{ __( 'Sending', 'restbench' ) }</h3>
				<div className="rb-settings-card">
					<Row
						label={ __( 'Ask before sending', 'restbench' ) }
						help={ __( 'Send has to be clicked twice for these, so a stray Ctrl+Enter does nothing.', 'restbench' ) }
					>
						<Choice
							label={ __( 'Ask before sending', 'restbench' ) }
							value={ settings.confirmWrites }
							onChange={ ( confirmWrites ) => onChange( { confirmWrites } ) }
							options={ [
								{ value: 'never', label: __( 'Never', 'restbench' ) },
								{ value: 'delete', label: __( 'DELETE only', 'restbench' ) },
								{ value: 'all', label: __( 'Anything but GET', 'restbench' ) },
							] }
						/>
					</Row>
					<Row
						label={ __( 'Pre-fill query parameters', 'restbench' ) }
						help={ __( "List the route's arguments as switched-off rows in the Params tab.", 'restbench' ) }
					>
						<Toggle
							checked={ settings.suggestParams }
							onChange={ ( suggestParams ) => onChange( { suggestParams } ) }
							label={ __( 'Pre-fill query parameters', 'restbench' ) }
						/>
					</Row>
					<Row label={ __( 'Code tab opens on', 'restbench' ) } htmlFor="rb-snippet-lang">
						<select
							id="rb-snippet-lang"
							className="rb-input"
							value={ settings.snippetLanguage }
							onChange={ ( e ) => onChange( { snippetLanguage: e.target.value as SnippetKind } ) }
						>
							{ ( Object.keys( SNIPPET_LABELS ) as SnippetKind[] ).map( ( k ) => (
								<option key={ k } value={ k }>
									{ SNIPPET_LABELS[ k ] }
								</option>
							) ) }
						</select>
					</Row>
				</div>
			</section>

			<section className="rb-overview-section">
				<h3 className="rb-section-title">{ __( 'Display', 'restbench' ) }</h3>
				<div className="rb-settings-card">
					<Row label={ __( 'Theme', 'restbench' ) }>
						<Choice
							label={ __( 'Theme', 'restbench' ) }
							value={ settings.theme }
							onChange={ ( theme ) => onChange( { theme } ) }
							options={ [
								{ value: 'light', label: __( 'Light', 'restbench' ) },
								{ value: 'dark', label: __( 'Dark', 'restbench' ) },
							] }
						/>
					</Row>
					<Row
						label={ __( 'Open JSON responses', 'restbench' ) }
						help={ __( 'How many levels of a response are expanded when it comes in.', 'restbench' ) }
						htmlFor="rb-json-depth"
					>
						<select
							id="rb-json-depth"
							className="rb-input"
							value={ settings.jsonDepth }
							onChange={ ( e ) => onChange( { jsonDepth: Number( e.target.value ) } ) }
						>
							{ [ 1, 2, 3, 4, 5, 6 ].map( ( n ) => (
								<option key={ n } value={ n }>
									{ sprintf(
										/* translators: %d: number of levels */
										_n( '%d level', '%d levels', n, 'restbench' ),
										n
									) }
								</option>
							) ) }
						</select>
					</Row>
				</div>
			</section>

			<section className="rb-overview-section">
				<h3 className="rb-section-title">{ __( 'Hidden namespaces', 'restbench' ) }</h3>
				<p className="rb-muted rb-note">
					{ __( "Hide namespaces you never touch from the sidebar and search. They still show up in the overview, so you won't lose track of them.", 'restbench' ) }
				</p>
				<div className="rb-settings-card rb-ns-checks">
					{ groups.map( ( g ) => {
						const id = `rb-hide-${ g.namespace.replace( /[^a-z0-9]/gi, '-' ) || 'root' }`;
						return (
							<label key={ g.namespace } className="rb-ns-check" htmlFor={ id }>
								<input
									id={ id }
									type="checkbox"
									checked={ hidden.has( g.namespace ) }
									onChange={ () => toggleNamespace( g.namespace ) }
								/>
								<code>{ g.namespace || __( '(root)', 'restbench' ) }</code>
								<span className="rb-muted">{ groupSource( g.routes ) ?? '' }</span>
								<span className="rb-ns-check-count">{ g.routes.length }</span>
							</label>
						);
					} ) }
				</div>
			</section>
		</div>
	);
}
