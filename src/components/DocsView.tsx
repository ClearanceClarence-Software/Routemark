import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { typeLabel } from '../lib/routes';
import type { Endpoint, RouteArg, RouteInfo, SchemaNode } from '../types';
import JsonView from './JsonView';
import { Icon, Method } from './ui';

function Default( { value }: { value: unknown } ) {
	if ( value === undefined ) {
		return null;
	}
	const text = typeof value === 'object' ? JSON.stringify( value ) : String( value );
	return (
		<span className="rmk-meta">
			{ __( 'default', 'routemark' ) } <code>{ text === '' ? '""' : text }</code>
		</span>
	);
}

function Constraints( { arg }: { arg: SchemaNode } ) {
	const bits: string[] = [];
	if ( arg.minimum !== undefined ) {
		bits.push( `≥ ${ arg.minimum }` );
	}
	if ( arg.maximum !== undefined ) {
		bits.push( `≤ ${ arg.maximum }` );
	}
	if ( arg.items?.type ) {
		bits.push( `${ __( 'items', 'routemark' ) }: ${ typeLabel( arg.items.type ) }` );
	}
	if ( arg.items?.enum ) {
		bits.push( arg.items.enum.map( String ).join( ', ' ) );
	}
	return bits.length ? <span className="rmk-meta">{ bits.join( ' · ' ) }</span> : null;
}

function ArgRows( { args }: { args: Record< string, RouteArg > } ) {
	const entries = Object.entries( args ).sort(
		( [ an, a ], [ bn, b ] ) => Number( !! b.required ) - Number( !! a.required ) || an.localeCompare( bn )
	);

	if ( entries.length === 0 ) {
		return <p className="rmk-muted rmk-note">{ __( 'This endpoint takes no arguments.', 'routemark' ) }</p>;
	}

	return (
		<dl className="rmk-args">
			{ entries.map( ( [ name, arg ] ) => (
				<div key={ name } className="rmk-arg">
					<dt>
						<code className="rmk-arg-name">{ name }</code>
						<span className="rmk-arg-type">{ typeLabel( arg.type, arg.format ) }</span>
						{ arg.required && <span className="rmk-badge rmk-badge--req">{ __( 'required', 'routemark' ) }</span> }
					</dt>
					<dd>
						{ arg.description && <p>{ arg.description }</p> }
						{ arg.enum && arg.enum.length > 0 && (
							<div className="rmk-enum">
								{ arg.enum.map( ( v ) => (
									<code key={ String( v ) }>{ String( v ) }</code>
								) ) }
							</div>
						) }
						<div className="rmk-arg-meta">
							<Default value={ arg.default } />
							<Constraints arg={ arg } />
						</div>
					</dd>
				</div>
			) ) }
		</dl>
	);
}

function EndpointDocs( { endpoint }: { endpoint: Endpoint } ) {
	return (
		<section className="rmk-doc-block">
			<header className="rmk-doc-head">
				{ endpoint.methods.map( ( m ) => (
					<Method key={ m } method={ m } />
				) ) }
				{ endpoint.isPublic ? (
					<span className="rmk-badge rmk-badge--public">
						<Icon name="globe" size={ 12 } /> { __( 'No login needed', 'routemark' ) }
					</span>
				) : (
					<span className="rmk-badge">
						<Icon name="lock" size={ 12 } /> { __( 'Permission check', 'routemark' ) }
					</span>
				) }
			</header>
			<ArgRows args={ endpoint.args } />
		</section>
	);
}

function SchemaTable( { schema }: { schema: SchemaNode } ) {
	const props = Object.entries( schema.properties ?? {} );
	if ( props.length === 0 ) {
		return null;
	}

	return (
		<table className="rmk-table">
			<thead>
				<tr>
					<th>{ __( 'Field', 'routemark' ) }</th>
					<th>{ __( 'Type', 'routemark' ) }</th>
					<th>{ __( 'Description', 'routemark' ) }</th>
				</tr>
			</thead>
			<tbody>
				{ props.map( ( [ name, prop ] ) => (
					<tr key={ name }>
						<td>
							<code className="rmk-arg-name">{ name }</code>
							{ prop.readonly && <span className="rmk-badge rmk-badge--ro">{ __( 'read-only', 'routemark' ) }</span> }
						</td>
						<td className="rmk-arg-type">
							{ typeLabel( prop.type, prop.format ) }
							{ prop.properties && (
								<span className="rmk-meta">{ Object.keys( prop.properties ).join( ', ' ) }</span>
							) }
						</td>
						<td>
							{ prop.description }
							{ prop.context && prop.context.length > 0 && (
								<span className="rmk-meta">
									{ __( 'context', 'routemark' ) }: { prop.context.join( ', ' ) }
								</span>
							) }
						</td>
					</tr>
				) ) }
			</tbody>
		</table>
	);
}

export default function DocsView( { route }: { route: RouteInfo } ) {
	const [ raw, setRaw ] = useState( false );

	return (
		<div className="rmk-docs">
			<h4 className="rmk-label">{ __( 'Arguments', 'routemark' ) }</h4>
			{ route.endpoints.map( ( e, i ) => (
				<EndpointDocs key={ i } endpoint={ e } />
			) ) }

			<div className="rmk-docs-schema">
				<h4 className="rmk-label">
					{ __( 'Response schema', 'routemark' ) }
					{ route.schema?.title && <code className="rmk-label-code">{ route.schema.title }</code> }
				</h4>
				{ ! route.schema && <p className="rmk-muted rmk-note">{ __( 'This route does not publish a schema.', 'routemark' ) }</p> }
				{ route.schema && (
					<>
						<div className="rmk-seg" role="group" aria-label={ __( 'Schema view', 'routemark' ) }>
							<button type="button" aria-pressed={ ! raw } className={ ! raw ? 'is-on' : '' } onClick={ () => setRaw( false ) }>
								{ __( 'Fields', 'routemark' ) }
							</button>
							<button type="button" aria-pressed={ raw } className={ raw ? 'is-on' : '' } onClick={ () => setRaw( true ) }>
								JSON
							</button>
						</div>
						{ raw ? (
							<div className="rmk-codebox">
								<JsonView value={ route.schema } openDepth={ 3 } />
							</div>
						) : (
							<SchemaTable schema={ route.schema } />
						) }
					</>
				) }
			</div>
		</div>
	);
}
