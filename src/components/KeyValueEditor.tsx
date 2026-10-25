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
		<div className="rmk-kv">
			{ rows.length > 0 && (
				<div className="rmk-kv-head" aria-hidden="true">
					<span />
					<span>{ __( 'Name', 'routemark' ) }</span>
					<span>{ __( 'Value', 'routemark' ) }</span>
					<span />
				</div>
			) }

			{ rows.map( ( row ) => {
				const arg = row.arg;
				const enumValues = arg?.enum?.map( String );
				const rawType = arg?.type;
				const type = Array.isArray( rawType ) ? rawType[ 0 ] : rawType;

				return (
					<div key={ row.id } className={ `rmk-kv-row${ row.enabled ? '' : ' is-off' }` }>
						<Toggle
							checked={ row.enabled }
							onChange={ ( enabled ) => update( row.id, { enabled } ) }
							label={ __( 'Include this row', 'routemark' ) }
						/>

						<div className="rmk-kv-key">
							{ arg ? (
								<>
									<code className="rmk-kv-name">
										{ row.key }
										{ arg.required && <span className="rmk-req" title={ __( 'Required', 'routemark' ) }>*</span> }
									</code>
									<span className="rmk-kv-type">{ typeLabel( arg.type, arg.format ) }</span>
								</>
							) : (
								<input
									type="text"
									className="rmk-input rmk-input--mono"
									placeholder={ keyPlaceholder }
									value={ row.key }
									onChange={ ( e ) => update( row.id, { key: e.target.value } ) }
								/>
							) }
						</div>

						<div className="rmk-kv-value">
							{ enumValues && enumValues.length > 0 ? (
								<select
									className="rmk-input rmk-input--mono"
									value={ row.value }
									onChange={ ( e ) => update( row.id, { value: e.target.value, enabled: e.target.value !== '' } ) }
								>
									<option value="">{ arg?.default !== undefined ? `${ __( 'default', 'routemark' ) }: ${ String( arg.default ) }` : __( 'not set', 'routemark' ) }</option>
									{ enumValues.map( ( v ) => (
										<option key={ v } value={ v }>
											{ v }
										</option>
									) ) }
								</select>
							) : type === 'boolean' ? (
								<select
									className="rmk-input rmk-input--mono"
									value={ row.value }
									onChange={ ( e ) => update( row.id, { value: e.target.value, enabled: e.target.value !== '' } ) }
								>
									<option value="">{ arg?.default !== undefined ? `${ __( 'default', 'routemark' ) }: ${ String( arg.default ) }` : __( 'not set', 'routemark' ) }</option>
									<option value="true">true</option>
									<option value="false">false</option>
								</select>
							) : (
								<input
									type="text"
									className="rmk-input rmk-input--mono"
									inputMode={ type === 'integer' || type === 'number' ? 'numeric' : undefined }
									placeholder={
										arg?.default !== undefined && arg.default !== '' && typeof arg.default !== 'object'
											? `${ __( 'default', 'routemark' ) }: ${ String( arg.default ) }`
											: __( 'value', 'routemark' )
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
							{ arg?.description && <p className="rmk-kv-desc">{ arg.description }</p> }
						</div>

						<div className="rmk-kv-actions">
							{ ! arg && (
								<button
									type="button"
									className="rmk-btn rmk-btn--icon rmk-btn--ghost"
									aria-label={ __( 'Remove row', 'routemark' ) }
									onClick={ () => onChange( rows.filter( ( r ) => r.id !== row.id ) ) }
								>
									<Icon name="x" size={ 14 } />
								</button>
							) }
						</div>
					</div>
				);
			} ) }

			<button type="button" className="rmk-btn rmk-btn--dashed" onClick={ () => onChange( [ ...rows, emptyRow() ] ) }>
				<Icon name="plus" size={ 14 } /> { addLabel }
			</button>
		</div>
	);
}
