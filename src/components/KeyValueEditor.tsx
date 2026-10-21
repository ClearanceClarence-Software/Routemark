import { __ } from '@wordpress/i18n';

import { emptyRow } from '../lib/request';
import { typeLabel } from '../lib/routes';
import type { Row } from '../types';
import { Icon, Toggle } from './ui';

interface Props {
	rows: Row[];
	onChange: ( rows: Row[] ) => void;
	keyPlaceholder: string;
	addLabel: string;
}

export default function KeyValueEditor( { rows, onChange, keyPlaceholder, addLabel }: Props ) {
	const update = ( id: string, patch: Partial< Row > ) =>
		onChange( rows.map( ( r ) => ( r.id === id ? { ...r, ...patch } : r ) ) );

	return (
		<div className="rb-kv">
			{ rows.length > 0 && (
				<div className="rb-kv-head" aria-hidden="true">
					<span />
					<span>{ __( 'Name', 'restbench' ) }</span>
					<span>{ __( 'Value', 'restbench' ) }</span>
					<span />
				</div>
			) }

			{ rows.map( ( row ) => {
				const arg = row.arg;
				const enumValues = arg?.enum?.map( String );
				const rawType = arg?.type;
				const type = Array.isArray( rawType ) ? rawType[ 0 ] : rawType;

				return (
					<div key={ row.id } className={ `rb-kv-row${ row.enabled ? '' : ' is-off' }` }>
						<Toggle
							checked={ row.enabled }
							onChange={ ( enabled ) => update( row.id, { enabled } ) }
							label={ __( 'Include this row', 'restbench' ) }
						/>

						<div className="rb-kv-key">
							{ arg ? (
								<>
									<code className="rb-kv-name">
										{ row.key }
										{ arg.required && <span className="rb-req" title={ __( 'Required', 'restbench' ) }>*</span> }
									</code>
									<span className="rb-kv-type">{ typeLabel( arg.type, arg.format ) }</span>
								</>
							) : (
								<input
									type="text"
									className="rb-input rb-input--mono"
									placeholder={ keyPlaceholder }
									value={ row.key }
									onChange={ ( e ) => update( row.id, { key: e.target.value } ) }
								/>
							) }
						</div>

						<div className="rb-kv-value">
							{ enumValues && enumValues.length > 0 ? (
								<select
									className="rb-input rb-input--mono"
									value={ row.value }
									onChange={ ( e ) => update( row.id, { value: e.target.value, enabled: e.target.value !== '' } ) }
								>
									<option value="">{ arg?.default !== undefined ? `${ __( 'default', 'restbench' ) }: ${ String( arg.default ) }` : __( 'not set', 'restbench' ) }</option>
									{ enumValues.map( ( v ) => (
										<option key={ v } value={ v }>
											{ v }
										</option>
									) ) }
								</select>
							) : type === 'boolean' ? (
								<select
									className="rb-input rb-input--mono"
									value={ row.value }
									onChange={ ( e ) => update( row.id, { value: e.target.value, enabled: e.target.value !== '' } ) }
								>
									<option value="">{ arg?.default !== undefined ? `${ __( 'default', 'restbench' ) }: ${ String( arg.default ) }` : __( 'not set', 'restbench' ) }</option>
									<option value="true">true</option>
									<option value="false">false</option>
								</select>
							) : (
								<input
									type="text"
									className="rb-input rb-input--mono"
									inputMode={ type === 'integer' || type === 'number' ? 'numeric' : undefined }
									placeholder={
										arg?.default !== undefined && arg.default !== '' && typeof arg.default !== 'object'
											? `${ __( 'default', 'restbench' ) }: ${ String( arg.default ) }`
											: __( 'value', 'restbench' )
									}
									value={ row.value }
									onChange={ ( e ) =>
										update( row.id, {
											value: e.target.value,
											// typing into a suggested row turns it on
											enabled: arg ? e.target.value !== '' || row.enabled : row.enabled,
										} )
									}
								/>
							) }
							{ arg?.description && <p className="rb-kv-desc">{ arg.description }</p> }
						</div>

						<div className="rb-kv-actions">
							{ ! arg && (
								<button
									type="button"
									className="rb-btn rb-btn--icon rb-btn--ghost"
									aria-label={ __( 'Remove row', 'restbench' ) }
									onClick={ () => onChange( rows.filter( ( r ) => r.id !== row.id ) ) }
								>
									<Icon name="x" size={ 14 } />
								</button>
							) }
						</div>
					</div>
				);
			} ) }

			<button type="button" className="rb-btn rb-btn--dashed" onClick={ () => onChange( [ ...rows, emptyRow() ] ) }>
				<Icon name="plus" size={ 14 } /> { addLabel }
			</button>
		</div>
	);
}
