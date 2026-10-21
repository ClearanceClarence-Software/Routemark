import { createRoot } from '@wordpress/element';

// Fonts are bundled so wp-admin never calls out to Google Fonts.
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-600.css';

import App from './App';
import './admin.scss';

const container = document.getElementById( 'restbench-root' );

if ( container ) {
	createRoot( container ).render( <App /> );
}
