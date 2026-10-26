/**
 * The REST call recorder, loaded on admin screens other than Routemark's
 * (see includes/class-recorder.php). While recording is switched on, it
 * notes every REST request the page makes, through fetch (apiFetch, the
 * block editor) or XMLHttpRequest (jQuery, wp.apiRequest), and keeps the
 * latest in localStorage for Routemark's Recorded list.
 *
 * Responses aren't read or stored, only the status. Nothing leaves the browser.
 */
import { cleanBody, cleanPath, MAX_CALLS, readState, restPath, storageKey, writeState, type RecordedCall } from './lib/recorded-store';

interface Config {
	restRoot: string;
	userId: number;
	appUrl: string;
	labels: Record< 'off' | 'on' | 'start' | 'stop' | 'open' | 'clear', string >;
}

declare global {
	interface Window {
		routemarkRecorder?: Config;
	}
}

const config = window.routemarkRecorder;

let seq = 0;
const newId = () => `c${ Date.now().toString( 36 ) }${ ( seq++ ).toString( 36 ) }`;

function isOn(): boolean {
	return !! config && readState( config.userId ).on;
}

function save( call: RecordedCall ) {
	if ( ! config ) {
		return;
	}
	// Read fresh each time, another tab may have added some or switched it off.
	const state = readState( config.userId );
	if ( ! state.on ) {
		return;
	}
	state.calls = [ call, ...state.calls ].slice( 0, MAX_CALLS );
	writeState( config.userId, state );
	updateBar();
}

function header( headers: HeadersInit | undefined, name: string ): string | undefined {
	if ( ! headers ) {
		return undefined;
	}
	try {
		return new Headers( headers ).get( name ) ?? undefined;
	} catch {
		return undefined;
	}
}

function patchFetch() {
	const original = window.fetch;
	if ( typeof original !== 'function' ) {
		return;
	}
	window.fetch = function ( input: RequestInfo | URL, init?: RequestInit ) {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const path = config && isOn() ? restPath( url, config.restRoot ) : null;
		const started = performance.now();
		const result = original.call( this, input, init );
		if ( path !== null ) {
			const method = ( init?.method ?? ( input instanceof Request ? input.method : 'GET' ) ).toUpperCase();
			const body = cleanBody( init?.body );
			const contentType = header( init?.headers, 'content-type' );
			const done = ( status: number ) =>
				save( {
					id: newId(),
					at: Date.now(),
					method,
					path: cleanPath( path ),
					status,
					durationMs: Math.round( performance.now() - started ),
					page: window.location.pathname + window.location.search,
					...( body !== undefined ? { body } : {} ),
					...( contentType ? { contentType } : {} ),
				} );
			result.then(
				( response ) => done( response.status ),
				() => done( 0 )
			);
		}
		return result;
	};
}

function patchXhr() {
	const proto = window.XMLHttpRequest?.prototype;
	if ( ! proto ) {
		return;
	}
	const open = proto.open;
	const send = proto.send;
	const setHeader = proto.setRequestHeader;
	type Tagged = XMLHttpRequest & { __rmk?: { method: string; path: string; contentType?: string } };

	proto.open = function ( this: Tagged, method: string, url: string | URL, ...rest: unknown[] ) {
		const path = config && isOn() ? restPath( String( url ), config.restRoot ) : null;
		this.__rmk = path !== null ? { method: method.toUpperCase(), path } : undefined;
		return ( open as ( ...a: unknown[] ) => void ).call( this, method, url, ...rest );
	} as typeof proto.open;

	proto.setRequestHeader = function ( this: Tagged, name: string, value: string ) {
		if ( this.__rmk && name.toLowerCase() === 'content-type' ) {
			this.__rmk.contentType = value;
		}
		return setHeader.call( this, name, value );
	};

	proto.send = function ( this: Tagged, body?: Document | XMLHttpRequestBodyInit | null ) {
		const info = this.__rmk;
		if ( info ) {
			const started = performance.now();
			const cleaned = cleanBody( body );
			this.addEventListener( 'loadend', () =>
				save( {
					id: newId(),
					at: Date.now(),
					method: info.method,
					path: cleanPath( info.path ),
					status: this.status,
					durationMs: Math.round( performance.now() - started ),
					page: window.location.pathname + window.location.search,
					...( cleaned !== undefined ? { body: cleaned } : {} ),
					...( info.contentType ? { contentType: info.contentType } : {} ),
				} )
			);
		}
		return send.call( this, body );
	};
}

// The admin bar node is printed by PHP with "Start recording"; this keeps it
// in step with the real state, which lives in this browser.
function updateBar() {
	if ( ! config ) {
		return;
	}
	const { on, calls } = readState( config.userId );
	const root = document.getElementById( 'wp-admin-bar-routemark-recorder' );
	if ( ! root ) {
		return;
	}
	root.classList.toggle( 'is-recording', on );
	const label = root.querySelector( ':scope > .ab-item .ab-label' );
	if ( label ) {
		label.textContent = on ? config.labels.on.replace( '%d', String( calls.length ) ) : config.labels.off;
	}
	const toggle = document.querySelector( '#wp-admin-bar-routemark-recorder-toggle > .ab-item' );
	if ( toggle ) {
		toggle.textContent = on ? config.labels.stop : config.labels.start;
	}
}

function wireBar() {
	if ( ! config ) {
		return;
	}
	document.querySelector( '#wp-admin-bar-routemark-recorder-toggle > .ab-item' )?.addEventListener( 'click', ( e ) => {
		e.preventDefault();
		const state = readState( config.userId );
		writeState( config.userId, { ...state, on: ! state.on } );
		updateBar();
	} );
	document.querySelector( '#wp-admin-bar-routemark-recorder-clear > .ab-item' )?.addEventListener( 'click', ( e ) => {
		e.preventDefault();
		writeState( config.userId, { ...readState( config.userId ), calls: [] } );
		updateBar();
	} );
	// Started or stopped in another tab.
	window.addEventListener( 'storage', ( e ) => {
		if ( e.key === storageKey( config.userId ) ) {
			updateBar();
		}
	} );
	updateBar();
}

if ( config ) {
	patchFetch();
	patchXhr();
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', wireBar );
	} else {
		wireBar();
	}
}
