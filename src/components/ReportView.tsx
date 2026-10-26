import { createInterpolateElement, useMemo, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { buildReport, findingDetail, findingTitle, groupFindings, reportAsText, SEVERITIES, severityLabel, type Severity } from '../lib/report';
import { filterFindings, useExtensions } from '../lib/extensions';
import { localPath } from '../lib/routes';
import type { RouteInfo } from '../types';
import { CopyButton, Icon, Method, PathText, Toggle } from './ui';

interface Props {
	routes: RouteInfo[];
	onOpen: ( route: string, loggedOut: boolean ) => void;
}

export default function ReportView( { routes, onOpen }: Props ) {
	const [ includeCore, setIncludeCore ] = useState( false );
	const [ only, setOnly ] = useState< Severity | null >( null );

	const extensions = useExtensions();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const all = useMemo( () => filterFindings( buildReport( routes ), routes ), [ routes, extensions ] );
	const scoped = useMemo( () => ( includeCore ? all : all.filter( ( f ) => f.route.source?.type !== 'core' ) ), [ all, includeCore ] );
	const shown = useMemo( () => ( only ? scoped.filter( ( f ) => f.severity === only ) : scoped ), [ scoped, only ] );
	const groups = useMemo( () => groupFindings( shown ), [ shown ] );
	const coreCount = all.length - all.filter( ( f ) => f.route.source?.type !== 'core' ).length;
	const site = window.routemarkSettings?.restRoot ?? '';

	return (
		<div className="rmk-overview rmk-report">
			<div className="rmk-settings-head">
				<h2 className="rmk-overview-title">{ __( 'Report', 'routemark' ) }</h2>
				<span className="rmk-spacer" />
				<CopyButton text={ reportAsText( shown, site ) } label={ __( 'Copy as text', 'routemark' ) } />
			</div>
			<p className="rmk-overview-lede">
				{ __(
					"How each route on this site is protected, based on how it was registered. It can't see what a permission callback actually allows, so open a route and use Send as to check that.",
					'routemark'
				) }
			</p>

			<div className="rmk-report-summary">
				{ SEVERITIES.map( ( s ) => {
					const n = scoped.filter( ( f ) => f.severity === s ).length;
					return (
						<button
							key={ s }
							type="button"
							className={ `rmk-report-stat rmk-sev--${ s }${ only === s ? ' is-on' : '' }` }
							aria-pressed={ only === s }
							onClick={ () => setOnly( only === s ? null : s ) }
						>
							<strong>{ n }</strong>
							<span>{ severityLabel( s ) }</span>
						</button>
					);
				} ) }
				<label className="rmk-report-core">
					<Toggle checked={ includeCore } onChange={ setIncludeCore } label={ __( 'Include WordPress core', 'routemark' ) } />
					<span>
						{ sprintf(
							/* translators: %d: number of findings in WordPress core */
							_n( 'Include WordPress core (%d finding)', 'Include WordPress core (%d findings)', coreCount, 'routemark' ),
							coreCount
						) }
					</span>
				</label>
			</div>

			{ groups.length === 0 && (
				<div className="rmk-report-clear">
					<Icon name="check" size={ 18 } />
					<p>
						{ only
							? __( 'Nothing at this level.', 'routemark' )
							: __( 'Nothing to flag. Every route has a permission check, its arguments are checked, and it has a schema.', 'routemark' ) }
					</p>
				</div>
			) }

			{ groups.map( ( g ) => (
				<section key={ g.source } className="rmk-overview-section rmk-report-group">
					<h3 className="rmk-section-title">
						{ g.source }
						<span className="rmk-report-count">{ g.findings.length }</span>
					</h3>
					<ul className="rmk-report-list">
						{ g.findings.map( ( f ) => (
							<li key={ f.id } className="rmk-finding">
								<span className={ `rmk-sev rmk-sev--${ f.severity }` }>{ severityLabel( f.severity ) }</span>
								<div className="rmk-finding-main">
									<p className="rmk-finding-route">
										{ f.methods.map( ( m ) => (
											<Method key={ m } method={ m } size="sm" />
										) ) }
										<span className="rmk-finding-ns">{ f.route.namespace || '/' }</span>
										<PathText template={ localPath( f.route ) } />
									</p>
									<p className="rmk-finding-title">{ findingTitle( f ) }</p>
									<p className="rmk-finding-detail">{ findingDetail( f ) }</p>
								</div>
								<div className="rmk-finding-actions">
									<button type="button" className="rmk-btn rmk-btn--ghost" onClick={ () => onOpen( f.route.route, false ) }>
										{ __( 'Open', 'routemark' ) }
									</button>
									{ f.kind !== 'no-schema' && (
										<button type="button" className="rmk-btn rmk-btn--ghost" onClick={ () => onOpen( f.route.route, true ) }>
											<Icon name="globe" size={ 14 } /> { __( 'Open as logged out', 'routemark' ) }
										</button>
									) }
								</div>
							</li>
						) ) }
					</ul>
				</section>
			) ) }

			<p className="rmk-muted rmk-note rmk-report-foot">
				{ createInterpolateElement(
					__(
						'Open read-only endpoints (<code>__return_true</code> on GET) are listed on the overview instead, since most of them are meant to be public.',
						'routemark'
					),
					{ code: <code /> }
				) }
			</p>
		</div>
	);
}
