/* global wp */
// Every Routemark extension point, in plain JavaScript (no build step).
( function () {
	const { addFilter, addAction } = wp.hooks;
	const el = wp.element.createElement;
	const ns = 'routemark-example-addon';

	// The tests read these to check what happened.
	window.routemarkExample = { sent: [], action: null };

	// A panel: a button in the top bar and a full-width view.
	addFilter( 'routemark.panels', ns, ( panels ) => [
		...panels,
		{
			id: 'example',
			label: 'Example',
			render: ( { routes, openRoute } ) =>
				el(
					'div',
					{ className: 'example-panel' },
					el( 'h2', { className: 'rmk-overview-title' }, 'Example panel' ),
					el( 'p', null, `${ routes.length } routes. ${ window.routemarkSettings.exampleAddon.greeting }` ),
					el( window.routemark.ui.Method, { method: 'GET' } ),
					el(
						'button',
						{
							type: 'button',
							className: 'rmk-btn rmk-btn--ghost example-open',
							onClick: () => openRoute( '/wp/v2/users/me', { sendAs: { id: 0, name: '', role: '' } } ),
						},
						'Open users/me logged out'
					)
				),
		},
	] );

	// Tabs in the workspace. The second one breaks on purpose: Routemark should
	// show an error in its place and keep working.
	addFilter( 'routemark.workspaceTabs', ns, ( tabs ) => [
		...tabs,
		{
			id: 'example',
			label: 'Example',
			render: ( { route, path, result } ) =>
				el( 'p', { className: 'example-tab' }, `Route ${ route.route }, path ${ path }, last status ${ result ? result.status : 'none' }` ),
		},
		{
			id: 'broken',
			label: 'Broken',
			render: () => {
				throw new Error( 'broken on purpose' );
			},
		},
	] );

	// A button next to Copy in the response panel.
	addFilter( 'routemark.responseActions', ns, ( actions ) => [
		...actions,
		{
			id: 'example',
			label: 'Remember status',
			onClick: ( { result } ) => {
				window.routemarkExample.action = result.status;
			},
		},
	] );

	// Another language in the Code tab.
	addFilter( 'routemark.snippetLanguages', ns, ( langs ) => [
		...langs,
		{ id: 'httpie', label: 'HTTPie', build: ( { url, draft } ) => `http ${ draft.method } '${ url }'` },
	] );

	// A finding of our own in the Report. Unknown kinds need a title and detail.
	addFilter( 'routemark.reportFindings', ns, ( findings, routes ) => {
		const route = routes.find( ( r ) => r.route === '/demo-shop/v1/ping' );
		return route
			? [
					...findings,
					{
						id: 'example-finding',
						kind: 'example',
						severity: 'low',
						route,
						methods: [ 'GET' ],
						args: [],
						title: 'Example finding',
						detail: 'Added by the example add-on.',
					},
			  ]
			: findings;
	} );

	// After every request sent from the workspace.
	addAction( 'routemark.requestSent', ns, ( event ) => {
		window.routemarkExample.sent.push( event.result.status );
	} );

	// Registered after Routemark has rendered, to check it still shows up.
	setTimeout( () => {
		addFilter( 'routemark.workspaceTabs', ns + '/late', ( tabs ) => [
			...tabs,
			{ id: 'late', label: 'Late', render: () => el( 'p', { className: 'example-late' }, 'Late tab' ) },
		] );
	}, 300 );
} )();
