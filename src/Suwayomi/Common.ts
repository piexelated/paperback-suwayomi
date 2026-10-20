import {
	Request,
	RequestManager,
	Response,
	SourceInterceptor,
	SourceStateManager
} from '@paperback/types';

// Suwayomi access tokens expire after 5 minutes, so renew them a minute early.
const TOKEN_LIFETIME = 4 * 60 * 1000;

//
// Suwayomi Common Class & Methods
//
export class SuwayomiRequestInterceptor implements SourceInterceptor {
	stateManager: SourceStateManager;
	accessToken: string = '';
	refreshToken: string = '';
	tokenTime: number = 0;
	renewal: Promise<string> | undefined;

	constructor(stateManager: SourceStateManager) {
		this.stateManager = stateManager;
	}

	async isServerAvailable(): Promise<boolean> {
		const server = await getServer(this.stateManager);
		if (server.url === '') return false;

		// Without a username the server is expected to run without login (AUTH_MODE=none).
		if (server.username === '') {
			const manager = App.createRequestManager({ requestsPerSecond: 4, requestTimeout: 20000 });
			return postGraphQL(manager, server.url, '{ categories { totalCount } }').then(() => true, () => false);
		}

		return (await this.getAccessToken()) !== '';
	}

	async getAccessToken(): Promise<string> {
		const server = await getServer(this.stateManager);
		if (server.url === '' || server.username === '') return '';

		if (this.accessToken !== '' && Date.now() - this.tokenTime < TOKEN_LIFETIME) {
			return this.accessToken;
		}

		// Requests run in parallel; let them share one login.
		this.renewal ??= this.renewAccessToken().finally(() => this.renewal = undefined);
		return this.renewal;
	}

	async renewAccessToken(): Promise<string> {
		const server = await getServer(this.stateManager);
		const manager = App.createRequestManager({
			requestsPerSecond: 4,
			requestTimeout: 20000
		});

		let token = '';
		if (this.refreshToken !== '') {
			const data = await postGraphQL(manager, server.url,
				'mutation($t: String!) { refreshToken(input: {refreshToken: $t}) { accessToken } }',
				{ t: this.refreshToken }
			).catch(() => undefined);
			token = data?.refreshToken?.accessToken ?? '';
		}

		if (token === '') {
			const data = await postGraphQL(manager, server.url,
				'mutation($u: String!, $p: String!) { login(input: {username: $u, password: $p}) { accessToken refreshToken } }',
				{ u: server.username, p: server.password }
			).catch(() => undefined);
			token = data?.login?.accessToken ?? '';
			this.refreshToken = data?.login?.refreshToken ?? '';
		}

		this.accessToken = token;
		this.tokenTime = Date.now();
		return token;
	}

	clearTokens(): void {
		this.accessToken = '';
		this.refreshToken = '';
	}

	async interceptResponse(response: Response): Promise<Response> {
		if (response.status === 401) this.accessToken = '';
		return response;
	}

	async interceptRequest(request: Request): Promise<Request> {
		const token = await this.getAccessToken();

		request.headers = {
			...request.headers,
			...(typeof request.data === 'string' ? { 'Content-Type': 'application/json' } : {}),
			...(token !== '' ? { 'Authorization': `Bearer ${token}` } : {})
		};

		return request;
	}
}

async function postGraphQL(requestManager: RequestManager, url: string, query: string, variables: any = {}): Promise<any> {
	const request = App.createRequest({
		url: `${url}/api/graphql`,
		data: JSON.stringify({ query, variables }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST'
	});

	const response = await requestManager.schedule(request, 1);
	const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

	if (result?.errors?.length) throw new Error(`Suwayomi: ${result.errors[0].message}`);
	if (!result?.data) throw new Error(`Suwayomi: HTTP ${response.status}`);
	return result.data;
}

export async function graphQL(requestManager: RequestManager, stateManager: SourceStateManager, query: string, variables: any = {}): Promise<any> {
	const server = await getServer(stateManager);
	return postGraphQL(requestManager, server.url, query, variables);
}

export function getServerUnavailableMangaTiles() {
	// This tile is used as a placeholder when the server is unavailable
	return [
		App.createPartialSourceManga({
			title: 'Server',
			image: '',
			mangaId: 'placeholder-id',
			subtitle: 'unavailable',
		}),
	];
}

//
// Suwayomi Setting State Methods
//
export const DEFAULT_VALUES: any = {
	serverAddress: '',
	username: '',
	password: '',
	pageSize: 40,

	showContinueReading: true,
	showRecentlyUpdated: true
}

export async function getServer(stateManager: SourceStateManager): Promise<{url: string, username: string, password: string}> {
	const address = (await stateManager.retrieve('serverAddress') as string | undefined) ?? DEFAULT_VALUES.serverAddress;
	const username = (await stateManager.retrieve('username') as string | undefined) ?? DEFAULT_VALUES.username;
	const password = (await stateManager.keychain.retrieve('password') as string | undefined) ?? DEFAULT_VALUES.password;

	return { url: address.replace(/\/+$/, ''), username, password };
}

export async function getOptions(
	stateManager: SourceStateManager
): Promise<{
	pageSize: number;
	showContinueReading: boolean;
	showRecentlyUpdated: boolean;
}> {
	const pageSize = (await stateManager.retrieve('pageSize') as number) ?? DEFAULT_VALUES.pageSize;
	const showContinueReading = (await stateManager.retrieve('showContinueReading') as boolean) ?? DEFAULT_VALUES.showContinueReading;
	const showRecentlyUpdated = (await stateManager.retrieve('showRecentlyUpdated') as boolean) ?? DEFAULT_VALUES.showRecentlyUpdated;

	return { pageSize, showContinueReading, showRecentlyUpdated };
}
