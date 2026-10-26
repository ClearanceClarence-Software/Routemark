import { __, _n, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';

import { groupRoutes, groupSource } from '../lib/routes';
import { SNIPPET_LABELS, type SnippetKind } from '../lib/snippets';
import type { RouteInfo, Settings } from '../types';
import { CopyButton, Icon, Mark, Toggle } from './ui';

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
		<div className="rmk-setting">
			<div className="rmk-setting-text">
				{ htmlFor ? (
					<label className="rmk-setting-label" htmlFor={ htmlFor }>
						{ label }
					</label>
				) : (
					<span className="rmk-setting-label">{ label }</span>
				) }
				{ help && <p className="rmk-setting-help">{ help }</p> }
			</div>
			<div className="rmk-setting-control">{ children }</div>
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
		<div className="rmk-seg" role="group" aria-label={ label }>
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
		<div className="rmk-settings">
			<div className="rmk-settings-head">
				<h2 className="rmk-overview-title">{ __( 'Settings', 'routemark' ) }</h2>
				<span className={ `rmk-save-status is-${ status }` } aria-live="polite">
					{ status === 'saving' && __( 'Saving…', 'routemark' ) }
					{ status === 'saved' && __( 'Saved', 'routemark' ) }
					{ status === 'error' && __( "Couldn't save. Try again?", 'routemark' ) }
				</span>
			</div>
			<p className="rmk-overview-lede">
				{ __( 'These are saved to your user account, so they follow you to other browsers. Other admins have their own.', 'routemark' ) }
			</p>

			<section className="rmk-overview-section">
				<h3 className="rmk-section-title">{ __( 'History', 'routemark' ) }</h3>
				<div className="rmk-settings-card">
					<Row
						label={ __( 'Keep request history', 'routemark' ) }
						help={ __( "History is stored in this browser only. Turning this off also clears what's there now.", 'routemark' ) }
					>
						<Toggle
							checked={ settings.keepHistory }
							onChange={ ( keepHistory ) => onChange( { keepHistory } ) }
							label={ __( 'Keep request history', 'routemark' ) }
						/>
					</Row>
					<Row label={ __( 'Requests to keep', 'routemark' ) } htmlFor="rmk-history-size">
						<select
							id="rmk-history-size"
							className="rmk-input"
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
						label={ __( 'Saved right now', 'routemark' ) }
						help={ sprintf(
							/* translators: %d: number of saved requests */
							_n( '%d request', '%d requests', historyCount, 'routemark' ),
							historyCount
						) }
					>
						<button type="button" className="rmk-btn rmk-btn--outline" disabled={ historyCount === 0 } onClick={ onClearHistory }>
							{ __( 'Clear history', 'routemark' ) }
						</button>
					</Row>
				</div>
			</section>

			<section className="rmk-overview-section">
				<h3 className="rmk-section-title">{ __( 'Sending', 'routemark' ) }</h3>
				<div className="rmk-settings-card">
					<Row
						label={ __( 'Ask before sending', 'routemark' ) }
						help={ __( 'Send has to be clicked twice for these, so a stray Ctrl+Enter does nothing.', 'routemark' ) }
					>
						<Choice
							label={ __( 'Ask before sending', 'routemark' ) }
							value={ settings.confirmWrites }
							onChange={ ( confirmWrites ) => onChange( { confirmWrites } ) }
							options={ [
								{ value: 'never', label: __( 'Never', 'routemark' ) },
								{ value: 'delete', label: __( 'DELETE only', 'routemark' ) },
								{ value: 'all', label: __( 'Anything but GET', 'routemark' ) },
							] }
						/>
					</Row>
					<Row
						label={ __( 'Pre-fill query parameters', 'routemark' ) }
						help={ __( "List the route's arguments as switched-off rows in the Params tab.", 'routemark' ) }
					>
						<Toggle
							checked={ settings.suggestParams }
							onChange={ ( suggestParams ) => onChange( { suggestParams } ) }
							label={ __( 'Pre-fill query parameters', 'routemark' ) }
						/>
					</Row>
					<Row label={ __( 'Code tab opens on', 'routemark' ) } htmlFor="rmk-snippet-lang">
						<select
							id="rmk-snippet-lang"
							className="rmk-input"
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

			<section className="rmk-overview-section">
				<h3 className="rmk-section-title">{ __( 'Display', 'routemark' ) }</h3>
				<div className="rmk-settings-card">
					<Row label={ __( 'Theme', 'routemark' ) }>
						<Choice
							label={ __( 'Theme', 'routemark' ) }
							value={ settings.theme }
							onChange={ ( theme ) => onChange( { theme } ) }
							options={ [
								{ value: 'light', label: __( 'Light', 'routemark' ) },
								{ value: 'dark', label: __( 'Dark', 'routemark' ) },
							] }
						/>
					</Row>
					<Row
						label={ __( 'Open JSON responses', 'routemark' ) }
						help={ __( 'How many levels of a response are expanded when it comes in.', 'routemark' ) }
						htmlFor="rmk-json-depth"
					>
						<select
							id="rmk-json-depth"
							className="rmk-input"
							value={ settings.jsonDepth }
							onChange={ ( e ) => onChange( { jsonDepth: Number( e.target.value ) } ) }
						>
							{ [ 1, 2, 3, 4, 5, 6 ].map( ( n ) => (
								<option key={ n } value={ n }>
									{ sprintf(
										/* translators: %d: number of levels */
										_n( '%d level', '%d levels', n, 'routemark' ),
										n
									) }
								</option>
							) ) }
						</select>
					</Row>
				</div>
			</section>

			<section className="rmk-overview-section">
				<h3 className="rmk-section-title">{ __( 'Hidden namespaces', 'routemark' ) }</h3>
				<p className="rmk-muted rmk-note">
					{ __( "Hide namespaces you never touch from the sidebar and search. They still show up in the overview, so you won't lose track of them.", 'routemark' ) }
				</p>
				<div className="rmk-settings-card rmk-ns-checks">
					{ groups.map( ( g ) => {
						const id = `rmk-hide-${ g.namespace.replace( /[^a-z0-9]/gi, '-' ) || 'root' }`;
						return (
							<label key={ g.namespace } className="rmk-ns-check" htmlFor={ id }>
								<input
									id={ id }
									type="checkbox"
									checked={ hidden.has( g.namespace ) }
									onChange={ () => toggleNamespace( g.namespace ) }
								/>
								<code>{ g.namespace || __( '(root)', 'routemark' ) }</code>
								<span className="rmk-muted">{ groupSource( g.routes ) ?? '' }</span>
								<span className="rmk-ns-check-count">{ g.routes.length }</span>
							</label>
						);
					} ) }
				</div>
			</section>

			{ !! window.routemarkSettings?.getPro && (
				<section className="rmk-overview-section rmk-pro-card" aria-labelledby="rmk-pro-card-title">
					{ !! window.routemarkSettings.offer && <LaunchOffer offer={ window.routemarkSettings.offer } /> }
					<div className="rmk-pro-card-main">
						<h3 className="rmk-pro-card-brand" id="rmk-pro-card-title">
							<Mark size={ 34 } />
							<span className="rmk-brand-name">
								Route<em>mark</em>
							</span>
							<span className="rmk-brand-edition">{ __( 'Pro', 'routemark' ) }</span>
						</h3>
						<p className="rmk-pro-card-lede">{ __( 'Know what every plugin update did to your REST API.', 'routemark' ) }</p>
						<ul className="rmk-pro-card-list">
							{ [
								__( 'Snapshots of every route, and a diff of what a plugin update changed', 'routemark' ),
								__( 'An email when a route that changes data suddenly works for anyone', 'routemark' ),
								__( 'Export to OpenAPI 3.1, Postman and TypeScript', 'routemark' ),
							].map( ( line ) => (
								<li key={ line }>
									<Icon name="check" size={ 16 } />
									<span>{ line }</span>
								</li>
							) ) }
						</ul>
					</div>
					<div className="rmk-pro-card-cta">
						<a className="rmk-btn rmk-btn--primary rmk-pro-card-button" href={ window.routemarkSettings.getPro } target="_blank" rel="noopener noreferrer">
							{ __( 'See Routemark Pro', 'routemark' ) }
							<Icon name="send" size={ 15 } />
						</a>
						<p className="rmk-pro-card-note">{ __( 'A separate plugin. Nothing in this one is locked or limited.', 'routemark' ) }</p>
					</div>
				</section>
			) }
		</div>
	);
}

/** The launch coupon, as a strip across the top of the Pro card. */
function LaunchOffer( { offer }: { offer: { code: string; ends: string; url: string } } ) {
	const ends = new Date( `${ offer.ends }T12:00:00` ).toLocaleDateString( document.documentElement.lang || undefined, {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	} );
	return (
		<div className="rmk-pro-offer">
			<span className="rmk-pro-offer-tag">{ __( 'Launch offer', 'routemark' ) }</span>
			<p className="rmk-pro-offer-text">
				<strong>{ __( '50% off Unlimited sites, Lifetime', 'routemark' ) }</strong>{ ' ' }
				{ sprintf(
					/* translators: %s: the last day of the offer, e.g. December 31, 2026 */
					__( 'for the first 100 buyers, until %s.', 'routemark' ),
					ends
				) }
			</p>
			<div className="rmk-pro-offer-actions">
				<code>{ offer.code }</code>
				<CopyButton text={ offer.code } label={ __( 'Copy code', 'routemark' ) } />
				<a className="rmk-pro-offer-link" href={ offer.url } target="_blank" rel="noopener noreferrer">
					{ __( 'Claim 50% off', 'routemark' ) }
					<Icon name="send" size={ 14 } />
				</a>
			</div>
		</div>
	);
}
