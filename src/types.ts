export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const METHODS: HttpMethod[] = [ 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ];

export interface SchemaNode {
	title?: string;
	type?: string | string[];
	description?: string;
	format?: string;
	enum?: unknown[];
	context?: string[];
	readonly?: boolean;
	required?: boolean | string[];
	default?: unknown;
	minimum?: number;
	maximum?: number;
	properties?: Record< string, SchemaNode >;
	items?: SchemaNode;
}

export interface RouteArg extends SchemaNode {
	required?: boolean;
}

export interface Endpoint {
	methods: string[];
	args: Record< string, RouteArg >;
	// true for both "missing" and "open" below, since both work without logging in
	isPublic: boolean;
	// missing: no permission_callback at all, open: __return_true, check: anything else
	permission: 'missing' | 'open' | 'check';
	// args with no type, validate_callback or sanitize_callback
	uncheckedArgs: string[];
}

export interface RouteInfo {
	route: string;
	namespace: string;
	endpoints: Endpoint[];
	schema: SchemaNode | null;
	// Who registered it, worked out from the callback's file. Null if we couldn't tell.
	source: RouteSource | null;
}

export interface RouteSource {
	type: 'core' | 'plugin' | 'mu-plugin' | 'theme';
	name: string;
}

export interface RoutesResponse {
	namespaces: string[];
	routes: RouteInfo[];
}

// A row in the query params / headers editor.
export interface Row {
	id: string;
	enabled: boolean;
	key: string;
	value: string;
	// only set on rows we pre-filled from the route's args
	arg?: RouteArg;
}

export interface Draft {
	method: HttpMethod;
	pathParams: Record< string, string >;
	query: Row[];
	headers: Row[];
	body: string;
}

export interface RunResult {
	status: number;
	statusText: string;
	durationMs: number;
	sizeBytes: number;
	headers: Record< string, string >;
	raw: string;
	json: unknown;
	isJson: boolean;
	// User ID from the X-Routemark-As response header, if the server switched.
	ranAs?: number | null;
	// From the X-Routemark-Stats response header. See class-request-stats.php.
	stats?: ServerStats | null;
}

export interface ServerStats {
	queries: number;
	handlerMs: number;
	queriesTotal: number;
	totalMs: number;
	peakMemory: number;
}

export interface HookCallback {
	priority: number;
	callback: string;
	source: RouteSource | null;
}

export interface HookInfo {
	name: string;
	callbacks: HookCallback[];
}

export interface HooksResponse {
	subjects: string[];
	route: HookInfo[];
	global: HookInfo[];
}

// Who a request is sent as. null means you, id 0 means logged out.
export interface SendAsUser {
	id: number;
	name: string;
	login?: string;
	role: string;
}

export interface HistoryEntry {
	id: string;
	at: number;
	route: string;
	path: string;
	status: number;
	durationMs: number;
	draft: Draft;
	as?: SendAsUser | null;
}

export interface Filters {
	search: string;
	methods: HttpMethod[];
	publicOnly: boolean;
}

export type ThemeChoice = 'light' | 'dark';

// Mirrors Settings::schema() in includes/class-settings.php. Keep them in step.
export interface Settings {
	keepHistory: boolean;
	historySize: number;
	confirmWrites: 'never' | 'delete' | 'all';
	suggestParams: boolean;
	theme: ThemeChoice;
	jsonDepth: number;
	snippetLanguage: 'apiFetch' | 'fetch' | 'curl' | 'php';
	hiddenNamespaces: string[];
}

declare global {
	interface Window {
		// userId keys the request history, so two admins on one browser don't see each other's requests
		routemarkSettings?: {
			restRoot: string;
			version: string;
			userId: number;
			settings?: Settings;
			sendAs?: { nonce: string; name: string };
			// Where "Get Pro" goes. Empty when Pro is installed.
			getPro?: string;
			/** Launch coupon for the Pro card, null when there is none. */
			offer?: { code: string; ends: string; url: string } | null;
		};
		// Set by index.tsx for add-ons. See src/lib/extensions.tsx.
		routemark?: { version: string; apiVersion: number; ui: Record< string, unknown >; icons: string[] };
	}
}
