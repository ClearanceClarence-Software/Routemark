import { useRef } from '@wordpress/element';

interface Props {
	value: string;
	onChange: ( v: string ) => void;
	label: string;
	onSubmit?: () => void;
}

// Just a textarea with line numbers. Didn't want to pull in CodeMirror for a JSON box.
export default function CodeEditor( { value, onChange, label, onSubmit }: Props ) {
	const gutter = useRef< HTMLDivElement >( null );
	const released = useRef( false );
	const lines = Math.max( 1, value.split( '\n' ).length );

	return (
		<div className="rmk-editor">
			<div className="rmk-editor-gutter" ref={ gutter } aria-hidden="true">
				{ Array.from( { length: lines }, ( _, i ) => (
					<span key={ i }>{ i + 1 }</span>
				) ) }
			</div>
			<textarea
				className="rmk-editor-input"
				aria-label={ label }
				spellCheck={ false }
				autoCapitalize="off"
				autoComplete="off"
				value={ value }
				onChange={ ( e ) => onChange( e.target.value ) }
				onFocus={ () => ( released.current = false ) }
				onScroll={ ( e ) => {
					if ( gutter.current ) {
						gutter.current.scrollTop = e.currentTarget.scrollTop;
					}
				} }
				onKeyDown={ ( e ) => {
					if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
						e.preventDefault();
						onSubmit?.();
						return;
					}
					// Esc hands Tab back to the browser, otherwise keyboard users get stuck in here
					if ( e.key === 'Escape' ) {
						released.current = true;
						return;
					}
					if ( e.key === 'Tab' && ! e.shiftKey && ! released.current ) {
						e.preventDefault();
						const el = e.currentTarget;
						const { selectionStart: s, selectionEnd: end } = el;
						const next = value.slice( 0, s ) + '  ' + value.slice( end );
						onChange( next );
						window.requestAnimationFrame( () => el.setSelectionRange( s + 2, s + 2 ) );
					}
				} }
			/>
		</div>
	);
}
