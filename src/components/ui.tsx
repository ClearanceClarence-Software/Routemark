import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';

import { copyText } from '../lib/hooks';
import { splitTemplate } from '../lib/routes';

const PATHS = {
	search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35',
	chevron: 'm9 6 6 6-6 6',
	send: 'M5 12h14M13 6l6 6-6 6',
	copy: 'M9 9h10v10H9zM5 15V5h10',
	check: 'm5 12 5 5 9-10',
	x: 'M6 6l12 12M18 6 6 18',
	plus: 'M12 5v14M5 12h14',
	sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
	moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
	refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
	clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
	list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
	lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
	globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
	trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
	wand: 'm4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6L19 11Z',
	expand: 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5',
	collapse: 'M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5',
	alert: 'M12 8v5M12 16h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
	sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
	book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5ZM8 7h7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon( { name, size = 16 }: { name: IconName; size?: number } ) {
	return (
		<svg
			className="rmk-icon"
			width={ size }
			height={ size }
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={ 1.8 }
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<path d={ PATHS[ name ] } />
		</svg>
	);
}

// Logo: the CC Software hex well, with a route running to a marker inside it.
// Same colors in both themes, since the well itself is always dark.
export function Mark( { size = 24 }: { size?: number } ) {
	return (
		<svg className="rmk-mark" width={ size } height={ size } viewBox="0 0 48 48" aria-hidden="true" focusable="false">
			<path d="M24 2 43.05 13v22L24 46 4.95 35V13z" fill="#3b82f6" />
			<path d="M24 8.5 37.42 16.25v15.5L24 39.5 10.58 31.75v-15.5z" fill="#16181b" />
			<path d="M16 31.5 21.5 25l5 3.5 5.5-8" fill="none" stroke="#93c5fd" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="16" cy="31.5" r="2.2" fill="#93c5fd" />
			<circle cx="32" cy="20" r="3.6" fill="#ffffff" />
			<circle cx="32" cy="20" r="1.5" fill="#1e40af" />
		</svg>
	);
}

export function Method( { method, size = 'md' }: { method: string; size?: 'sm' | 'md' | 'lg' } ) {
	return <span className={ `rmk-method rmk-method--${ method.toLowerCase() } rmk-method--${ size }` }>{ method }</span>;
}

// <wbr> after each slash so long routes wrap somewhere sensible
function withBreaks( text: string ) {
	return text.split( /(?<=\/)/ ).map( ( seg, i ) => (
		<span key={ i }>
			{ seg }
			<wbr />
		</span>
	) );
}

export function PathText( { template }: { template: string } ) {
	return (
		<span className="rmk-path">
			{ splitTemplate( template ).map( ( part, i ) =>
				part.param ? (
					<span key={ i } className="rmk-path-param">
						{ part.text }
					</span>
				) : (
					<span key={ i }>{ withBreaks( part.text ) }</span>
				)
			) }
		</span>
	);
}

export function CopyButton( { text, label }: { text: string; label?: string } ) {
	const [ done, setDone ] = useState( false );
	return (
		<button
			type="button"
			className="rmk-btn rmk-btn--ghost"
			onClick={ async () => {
				if ( await copyText( text ) ) {
					setDone( true );
					window.setTimeout( () => setDone( false ), 1400 );
				}
			} }
		>
			<Icon name={ done ? 'check' : 'copy' } size={ 14 } />
			{ done ? __( 'Copied', 'routemark' ) : label ?? __( 'Copy', 'routemark' ) }
		</button>
	);
}

export interface TabDef< T extends string > {
	id: T;
	label: string;
	count?: number;
	hidden?: boolean;
}

export function Tabs< T extends string >( {
	tabs,
	active,
	onChange,
	label,
	trailing,
}: {
	tabs: TabDef< T >[];
	active: T;
	onChange: ( id: T ) => void;
	label: string;
	trailing?: ReactNode;
} ) {
	return (
		<div className="rmk-tabs">
			<div className="rmk-tabs-list" role="tablist" aria-label={ label }>
				{ tabs
					.filter( ( t ) => ! t.hidden )
					.map( ( t ) => (
						<button
							key={ t.id }
							type="button"
							role="tab"
							aria-selected={ t.id === active }
							className={ `rmk-tab${ t.id === active ? ' is-active' : '' }` }
							onClick={ () => onChange( t.id ) }
						>
							{ t.label }
							{ !! t.count && <span className="rmk-tab-count">{ t.count }</span> }
						</button>
					) ) }
			</div>
			{ trailing && <div className="rmk-tabs-trailing">{ trailing }</div> }
		</div>
	);
}

export function Toggle( {
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: ( v: boolean ) => void;
	label: string;
} ) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={ checked }
			aria-label={ label }
			title={ label }
			className={ `rmk-switch${ checked ? ' is-on' : '' }` }
			onClick={ () => onChange( ! checked ) }
		>
			<span />
		</button>
	);
}
