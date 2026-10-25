import apiFetch from '@wordpress/api-fetch';

import type { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
	keepHistory: true,
	historySize: 40,
	confirmWrites: 'delete',
	suggestParams: true,
	theme: 'light',
	jsonDepth: 2,
	snippetLanguage: 'apiFetch',
	hiddenNamespaces: [],
};

export function initialSettings(): Settings {
	return { ...DEFAULT_SETTINGS, ...( window.routemarkSettings?.settings ?? {} ) };
}

// Only sends what changed. The server answers with the full, validated set.
export function saveSettings( patch: Partial< Settings > ): Promise< Settings > {
	return apiFetch< Settings >( { path: '/routemark/v1/settings', method: 'POST', data: patch } );
}

export function needsConfirm( setting: Settings[ 'confirmWrites' ], method: string ): boolean {
	if ( setting === 'all' ) {
		return method !== 'GET';
	}
	return setting === 'delete' && method === 'DELETE';
}
