// Builds dist/routemark-<version>.zip with only what the plugin needs to run.
// Run `npm run build` first (`npm run zip` does both).
//
// The list is kept explicit on purpose: anything not named here (source,
// configs, node_modules, dotfiles) stays out of the zip.
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import archiver from 'archiver';

const FILES = [ 'routemark.php', 'uninstall.php', 'readme.txt' ];
const DIRS = [ 'includes', 'build', 'licenses' ];

const { version } = JSON.parse( readFileSync( 'package.json', 'utf8' ) );
const header = readFileSync( 'routemark.php', 'utf8' ).match( /Version:\s*([\d.]+)/ )?.[ 1 ];

if ( header !== version ) {
	console.error( `Version mismatch: package.json says ${ version }, routemark.php says ${ header }.` );
	process.exit( 1 );
}
if ( ! existsSync( 'build/index.js' ) ) {
	console.error( 'No build/ folder. Run `npm run build` first.' );
	process.exit( 1 );
}

mkdirSync( 'dist', { recursive: true } );
const target = `dist/routemark-${ version }.zip`;
const zip = archiver( 'zip', { zlib: { level: 9 } } );
zip.pipe( createWriteStream( target ) );

// Everything goes under routemark/, so it unzips straight into wp-content/plugins.
FILES.forEach( ( f ) => zip.file( f, { name: `routemark/${ f }` } ) );
DIRS.forEach( ( d ) => zip.directory( d, `routemark/${ d }` ) );

await zip.finalize();
console.log( `${ target } (${ ( zip.pointer() / 1024 ).toFixed( 0 ) } KB)` );
