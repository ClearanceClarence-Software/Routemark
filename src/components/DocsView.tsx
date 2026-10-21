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
		<span className="rb-meta">
			{ __( 'default', 'restbench' ) } <code>{ text === '' ? '""' : text }</code>
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
		bits.push( `${ __( 'items', 'restbench' ) }: ${ typeLabel( arg.items.type ) }` );
	}
	if ( arg.items?.enum ) {
		bits.push( arg.items.enum.map( String ).join( ', ' ) );
	}
	return bits.length ? <span className="rb-meta">{ bits.join( ' · ' ) }</span> : null;
}

function ArgRows( { args }: { args: Record< string, RouteArg > } ) {
	const entries = Object.entries( args ).sort(
		( [ an, a ], [ bn, b ] ) => Number( !! b.required ) - Number( !! a.required ) || an.localeCompare( bn )
	);

	if ( entries.length === 0 ) {
		return <p className="rb-muted rb-note">{ __( 'This endpoint takes no arguments.', 'restbench' ) }</p>;
	}

	return (
		<dl className="rb-args">
			{ entries.map( ( [ name, arg ] ) => (
				<div key={ name } className="rb-arg">
					<dt>
						<code className="rb-arg-name">{ name }</code>
						<span className="rb-arg-type">{ typeLabel( arg.type, arg.format ) }</span>
						{ arg.required && <span className="rb-badge rb-badge--req">{ __( 'required', 'restbench' ) }</span> }
					</dt>
					<dd>
						{ arg.description && <p>{ arg.description }</p> }
						{ arg.enum && arg.enum.length > 0 && (
							<div className="rb-enum">
								{ arg.enum.map( ( v ) => (
									<code key={ String( v ) }>{ String( v ) }</code>
								) ) }
							</div>
						) }
						<div className="rb-arg-meta">
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
		<section className="rb-doc-block">
			<header className="rb-doc-head">
				{ endpoint.methods.map( ( m ) => (
					<Method key={ m } method={ m } />
				) ) }
				{ endpoint.isPublic ? (
					<span className="rb-badge rb-badge--public">
						<Icon name="globe" size={ 12 } /> { __( 'No login needed', 'restbench' ) }
					</span>
				) : (
					<span className="rb-badge">
						<Icon name="lock" size={ 12 } /> { __( 'Permission check', 'restbench' ) }
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
		<table className="rb-table">
			<thead>
				<tr>
					<th>{ __( 'Field', 'restbench' ) }</th>
					<th>{ __( 'Type', 'restbench' ) }</th>
					<th>{ __( 'Description', 'restbench' ) }</th>
				</tr>
			</thead>
			<tbody>
				{ props.map( ( [ name, prop ] ) => (
					<tr key={ name }>
						<td>
							<code className="rb-arg-name">{ name }</code>
							{ prop.readonly && <span className="rb-badge rb-badge--ro">{ __( 'read-only', 'restbench' ) }</span> }
						</td>
						<td className="rb-arg-type">
							{ typeLabel( prop.type, prop.format ) }
							{ prop.properties && (
								<span className="rb-meta">{ Object.keys( prop.properties ).join( ', ' ) }</span>
							) }
						</td>
						<td>
							{ prop.description }
							{ prop.context && prop.context.length > 0 && (
								<span className="rb-meta">
									{ __( 'context', 'restbench' ) }: { prop.context.join( ', ' ) }
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
		<div className="rb-docs">
			<h4 className="rb-label">{ __( 'Arguments', 'restbench' ) }</h4>
			{ route.endpoints.map( ( e, i ) => (
				<EndpointDocs key={ i } endpoint={ e } />
			) ) }

			<div className="rb-docs-schema">
				<h4 className="rb-label">
					{ __( 'Response schema', 'restbench' ) }
					{ route.schema?.title && <code className="rb-label-code">{ route.schema.title }</code> }
				</h4>
				{ ! route.schema && <p className="rb-muted rb-note">{ __( 'This route does not publish a schema.', 'restbench' ) }</p> }
				{ route.schema && (
					<>
						<div className="rb-seg" role="group" aria-label={ __( 'Schema view', 'restbench' ) }>
							<button type="button" aria-pressed={ ! raw } className={ ! raw ? 'is-on' : '' } onClick={ () => setRaw( false ) }>
								{ __( 'Fields', 'restbench' ) }
							</button>
							<button type="button" aria-pressed={ raw } className={ raw ? 'is-on' : '' } onClick={ () => setRaw( true ) }>
								JSON
							</button>
						</div>
						{ raw ? (
							<div className="rb-codebox">
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
