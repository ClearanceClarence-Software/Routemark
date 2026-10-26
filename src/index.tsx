import { createRoot } from '@wordpress/element';

// Fonts are bundled so wp-admin never calls out to Google Fonts.
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-700.css';

import App from './App';
import JsonView from './components/JsonView';
import { CopyButton, Icon, ICON_NAMES, Method, PathText, Toggle } from './components/ui';
import { EXTENSION_API } from './lib/extensions';
import './admin.scss';

// For add-ons: the version they're running against, and a few of our
// components so their screens can look like the rest of Routemark.
window.routemark = {
	version: window.routemarkSettings?.version ?? '',
	apiVersion: EXTENSION_API,
	ui: { CopyButton, Icon, JsonView, Method, PathText, Toggle },
	icons: ICON_NAMES,
};

// Add-on scripts load after ours (they depend on it), so wait until every
// script on the page has run before the first render. Filters they add even
// later still show up, see useExtensions().
function start() {
	const container = document.getElementById( 'routemark-root' );
	if ( container ) {
		createRoot( container ).render( <App /> );
	}
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', start );
} else {
	start();
}
