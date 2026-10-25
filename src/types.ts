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
	isPublic: boolean;
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
}

export interface HistoryEntry {
	id: string;
	at: number;
	route: string;
	path: string;
	status: number;
	durationMs: number;
	draft: Draft;
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
		routemarkSettings?: { restRoot: string; version: string; userId: number; settings?: Settings };
	}
}
