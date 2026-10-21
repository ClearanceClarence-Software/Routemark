import { useEffect, useState } from '@wordpress/element';

// useState that survives a reload. localStorage can throw (private windows,
// blocked site data), so every call is wrapped and we just fall back to memory.
export function useStoredState< T >( key: string, initial: T ): [ T, ( v: T | ( ( prev: T ) => T ) ) => void ] {
	const [ value, setValue ] = useState< T >( () => {
		try {
			const raw = window.localStorage.getItem( key );
			return raw === null ? initial : ( JSON.parse( raw ) as T );
		} catch {
			return initial;
		}
	} );

	useEffect( () => {
		try {
			window.localStorage.setItem( key, JSON.stringify( value ) );
		} catch {
			// full or blocked, not worth crashing over
		}
	}, [ key, value ] );

	return [ value, setValue ];
}

// Selected route lives in the hash, so a reload or bookmark lands on the same route.
export function useHashRoute(): [ string | null, ( route: string | null ) => void ] {
	const read = () => {
		const hash = window.location.hash.slice( 1 );
		if ( ! hash ) {
			return null;
		}
		try {
			return decodeURIComponent( hash );
		} catch {
			return null;
		}
	};

	const [ route, setRoute ] = useState< string | null >( read );

	useEffect( () => {
		const onHash = () => setRoute( read() );
		window.addEventListener( 'hashchange', onHash );
		return () => window.removeEventListener( 'hashchange', onHash );
	}, [] );

	const update = ( next: string | null ) => {
		setRoute( next );
		const url = window.location.pathname + window.location.search + ( next ? '#' + encodeURIComponent( next ) : '' );
		window.history.replaceState( null, '', url );
	};

	return [ route, update ];
}

export async function copyText( text: string ): Promise< boolean > {
	try {
		await navigator.clipboard.writeText( text );
		return true;
	} catch {
		return false;
	}
}
