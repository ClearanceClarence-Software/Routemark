/**
 * Extension points for add-ons, through wp.hooks (the same filters and
 * actions WordPress itself uses). An add-on enqueues its script on the
 * routemark_enqueue_assets action, with "routemark-admin" as a dependency,
 * and registers filters like this:
 *
 *     wp.hooks.addFilter( 'routemark.workspaceTabs', 'my-addon', ( tabs ) => [
 *         ...tabs,
 *         { id: 'notes', label: 'Notes', render: ( { route } ) => ... },
 *     ] );
 *
 * Everything an add-on hands us runs inside a try/catch or an error
 * boundary. A broken add-on shows an error where its part would have been,
 * and the rest of Routemark keeps working.
 *
 * Bump EXTENSION_API (and ROUTEMARK_API_VERSION in routemark.php) when one of
 * these shapes changes in a way that breaks add-ons.
 */
import { Component, useEffect, useState } from '@wordpress/element';
import { addAction, applyFilters, doAction, removeAction } from '@wordpress/hooks';
import { __, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';

import type { Draft, RouteInfo, RunResult, SendAsUser, Settings } from '../types';
import type { Finding } from './report';

export const EXTENSION_API = 1;

/** Passed to panels: things an add-on may want to do in the app. */
export interface AppContext {
	routes: RouteInfo[];
	settings: Settings;
	/** Opens a route in the workspace. sendAs: null for you, { id: 0 } for logged out. */
	openRoute: ( route: string, options?: { sendAs?: SendAsUser | null } ) => void;
}

/** A full-width view with its own button in the top bar, like Report or Settings. */
export interface PanelDef {
	id: string;
	label: string;
	/** One of Routemark's icon names (window.routemark.icons). Defaults to a puzzle piece. */
	icon?: string;
	render: ( ctx: AppContext ) => ReactNode;
}

/**
 * How the top bar presents the product. An add-on edition (Pro, say) sets
 * edition, which shows as a small badge after the wordmark, and version,
 * which goes after Routemark's own version number.
 */
export interface BrandDef {
	edition?: string;
	version?: string;
}

/** What the workspace knows about the request on screen. */
export interface RequestContext {
	route: RouteInfo;
	draft: Draft;
	/** Path with params and query filled in, e.g. /wp/v2/posts?per_page=5 */
	path: string;
	/** Full URL for the same request. */
	url: string;
	sendAs: SendAsUser | null;
	/** The last response, or null before anything was sent. */
	result: RunResult | null;
}

/** An extra tab next to Params, Body, Headers, Docs, Hooks and Code. */
export interface WorkspaceTabDef {
	id: string;
	label: string;
	render: ( ctx: RequestContext ) => ReactNode;
}

/** A button in the response panel's toolbar. Only shown once there's a response. */
export interface ResponseActionDef {
	id: string;
	label: string;
	onClick: ( ctx: RequestContext & { result: RunResult } ) => void;
}

/** An extra language in the Code tab. */
export interface SnippetDef {
	id: string;
	label: string;
	build: ( ctx: { path: string; url: string; draft: Draft } ) => string;
}

/**
 * A button on each finding in the Report, after Open and Open as logged out.
 * show() decides which findings get it; leave it out for all of them.
 */
export interface FindingActionDef {
	id: string;
	label: string;
	icon?: string;
	show?: ( finding: Finding ) => boolean;
	run: ( finding: Finding ) => void | Promise< unknown >;
}

/** Fired after every request sent from the workspace. */
export interface RequestSentEvent extends RequestContext {
	result: RunResult;
}

function safely< T >( name: string, fallback: T, run: () => T ): T {
	try {
		return run();
	} catch ( e ) {
		// eslint-disable-next-line no-console
		console.error( `Routemark: an add-on broke ${ name }`, e );
		return fallback;
	}
}

// Filters return whatever the add-on returns, so check the shape before trusting it.
function list< T extends { id: string } >( name: string, base: T[] ): T[] {
	return safely( name, base, () => {
		const out = applyFilters( name, base ) as unknown;
		if ( ! Array.isArray( out ) ) {
			return base;
		}
		const seen = new Set< string >();
		return out.filter( ( item ): item is T => {
			const ok = !! item && typeof item === 'object' && typeof item.id === 'string' && ! seen.has( item.id );
			if ( ok ) {
				seen.add( item.id );
			}
			return ok;
		} );
	} );
}

export const getPanels = () => list< PanelDef >( 'routemark.panels', [] );

/** Short plain strings only: this ends up in the top bar on every screen. */
export function getBrand(): { edition: string; version: string } {
	const none = { edition: '', version: '' };
	return safely( 'routemark.brand', none, () => {
		const out = applyFilters( 'routemark.brand', {} ) as unknown;
		if ( ! out || typeof out !== 'object' ) {
			return none;
		}
		const brand = out as Record< string, unknown >;
		const clean = ( value: unknown, max: number ) => ( typeof value === 'string' ? value.trim().slice( 0, max ) : '' );
		return { edition: clean( brand.edition, 12 ), version: clean( brand.version, 40 ) };
	} );
}
export const getWorkspaceTabs = () => list< WorkspaceTabDef >( 'routemark.workspaceTabs', [] );
export const getResponseActions = () => list< ResponseActionDef >( 'routemark.responseActions', [] );
export const getFindingActions = () => list< FindingActionDef >( 'routemark.findingActions', [] );

/** Finding actions that apply to this finding. A show() that throws hides the button. */
export function actionsFor( finding: Finding ): FindingActionDef[] {
	return getFindingActions().filter( ( a ) => ! a.show || safely( `the "${ a.label }" button`, false, () => !! a.show!( finding ) ) );
}

export function runFindingAction( action: FindingActionDef, finding: Finding ): Promise< unknown > {
	return Promise.resolve( safely( `the "${ action.label }" button`, undefined, () => action.run( finding ) ) ).catch( ( e ) => {
		// eslint-disable-next-line no-console
		console.error( `Routemark: the "${ action.label }" button failed`, e );
	} );
}
export const getSnippets = () => list< SnippetDef >( 'routemark.snippetLanguages', [] );

/** Add-ons can add their own findings to the Report (give them a title and detail). */
export function filterFindings( findings: Finding[], routes: RouteInfo[] ): Finding[] {
	return safely( 'routemark.reportFindings', findings, () => {
		const out = applyFilters( 'routemark.reportFindings', findings, routes ) as unknown;
		return Array.isArray( out ) ? ( out as Finding[] ).filter( ( f ) => f && f.route && f.severity ) : findings;
	} );
}

export function requestSent( event: RequestSentEvent ) {
	safely( 'routemark.requestSent', undefined, () => doAction( 'routemark.requestSent', event ) );
}

export function runAction( action: ResponseActionDef, ctx: RequestContext & { result: RunResult } ) {
	safely( `the "${ action.label }" action`, undefined, () => action.onClick( ctx ) );
}

export function buildExtraSnippet( def: SnippetDef, ctx: { path: string; url: string; draft: Draft } ): string {
	return safely( `the ${ def.label } snippet`, '', () => String( def.build( ctx ) ?? '' ) );
}

/**
 * Re-renders when an add-on adds or removes a routemark.* filter after the
 * app has started, so a script that loads late still shows up. An add-on
 * whose filters now return something different (it saved a setting, say)
 * calls wp.hooks.doAction( 'routemark.extensionsChanged' ) for the same.
 */
export function useExtensions(): number {
	const [ revision, setRevision ] = useState( 0 );
	useEffect( () => {
		// Each component that uses this needs its own namespace, or removing
		// one listener would remove them all.
		const ns = `routemark/extensions/${ ++listeners }`;
		const bump = ( hookName: string ) => {
			if ( hookName.startsWith( 'routemark.' ) ) {
				setRevision( ( r ) => r + 1 );
			}
		};
		addAction( 'hookAdded', ns, bump );
		addAction( 'hookRemoved', ns, bump );
		addAction( 'routemark.extensionsChanged', ns, () => setRevision( ( r ) => r + 1 ) );
		return () => {
			removeAction( 'hookAdded', ns );
			removeAction( 'hookRemoved', ns );
			removeAction( 'routemark.extensionsChanged', ns );
		};
	}, [] );
	return revision;
}

let listeners = 0;

/**
 * Runs an add-on's render function inside the component tree, so the
 * boundary around it catches a throw. Calling render() in the parent
 * would skip the boundary.
 */
export function ExtensionSlot( { render }: { render: () => ReactNode } ) {
	return <>{ render() }</>;
}

/** Keeps an add-on's crash inside its own box. */
export class ExtensionBoundary extends Component< { name: string; children: ReactNode }, { error: Error | null } > {
	state = { error: null as Error | null };

	static getDerivedStateFromError( error: Error ) {
		return { error };
	}

	componentDidCatch( error: Error ) {
		// eslint-disable-next-line no-console
		console.error( `Routemark: ${ this.props.name } crashed`, error );
	}

	render() {
		if ( this.state.error ) {
			return (
				<div className="rmk-callout rmk-callout--error rmk-extension-error" role="alert">
					<div>
						<p>
							{ sprintf(
								/* translators: %s: name of the add-on's tab or panel */
								__( '%s stopped working. This comes from an add-on, not Routemark itself.', 'routemark' ),
								this.props.name
							) }
						</p>
						<code>{ String( this.state.error.message || this.state.error ) }</code>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
