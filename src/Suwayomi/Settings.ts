import {
	DUINavigationButton,
	SourceStateManager,
} from '@paperback/types';
import {
	DEFAULT_VALUES,
	SuwayomiRequestInterceptor
} from './Common';

/* UI definition */
// NOTE: Submitted data won't be tested
export const serverSettingsMenu = (
	stateManager: SourceStateManager,
	interceptor: SuwayomiRequestInterceptor
): DUINavigationButton => {
	return App.createDUINavigationButton({
		id: "server_settings",
		label: "Server Settings",
		form: App.createDUIForm({
			sections: async () => [
				App.createDUISection({
					id: "information",
					header: undefined,
					isHidden: false,
					rows: async () => [
						App.createDUIMultilineLabel({
							label: "Setup",
							value: "Server URL: the address of your Suwayomi server, for example http://192.168.1.10:4567\n\nUsername and password: the login of the Suwayomi web UI. Leave both empty if the server has no login.\n\nOnly chapters downloaded on the server are shown, so nothing is fetched from the source websites.",
							id: "description",
						}),
					],
				}),
				App.createDUISection({
					id: "serverSettings",
					header: "Server Settings",
					isHidden: false,
					rows: async () => retrieveStateData(stateManager).then((values) => [
						App.createDUIInputField({
							id: "serverAddress",
							label: "Server URL",
							value: App.createDUIBinding({
								async get() {
									return values.serverAddress;
								},
								async set(value) {
									values.serverAddress = value;
									await setStateData(stateManager, interceptor, values);
								}
							})
						}),
						App.createDUIInputField({
							id: "username",
							label: "Username",
							value: App.createDUIBinding({
								async get() {
									return values.username;
								},
								async set(value) {
									values.username = value;
									await setStateData(stateManager, interceptor, values);
								}
							})
						})
					]),
				}),
				// The password has a section of its own: sharing one made Paperback mask the server URL too.
				App.createDUISection({
					id: "login",
					header: "Login",
					isHidden: false,
					rows: async () => retrieveStateData(stateManager).then((values) => [
						App.createDUISecureInputField({
							id: 'password',
							label: 'Password',
							value: App.createDUIBinding({
								async get() {
									return values.password;
								},
								async set(value) {
									values.password = value;
									await setStateData(stateManager, interceptor, values);
								}
							})
						})
					]),
				}),
				App.createDUISection({
					id: "sourceOptions",
					header: "Source Options",
					isHidden: false,
					footer: "",
					rows: async () => retrieveStateData(stateManager).then((values) => [
						App.createDUIInputField({
							id: 'pageSize',
							label: 'Page Size',
							value: App.createDUIBinding({
								async get() {
									return typeof values.pageSize === 'string' ? values.pageSize : values.pageSize.toString();
								},
								async set(value) {
									values.pageSize = value;
									await setStateData(stateManager, interceptor, values);
								}
							})
						}),
						App.createDUISwitch({
							id: 'showContinueReading',
							label: 'Show Continue Reading',
							value: App.createDUIBinding({
								async get() {
									return values.showContinueReading;
								},
								async set(value) {
									values.showContinueReading = value;
									await setStateData(stateManager, interceptor, values);
								}
							})
						}),
						App.createDUISwitch({
							id: 'showRecentlyUpdated',
							label: 'Show Recently Updated',
							value: App.createDUIBinding({
								async get() {
									return values.showRecentlyUpdated;
								},
								async set(value) {
									values.showRecentlyUpdated = value;
									await setStateData(stateManager, interceptor, values);
								}
							})
						})
					]),
				}),
			],
		}),
	});
};

export async function retrieveStateData(stateManager: SourceStateManager) {
	const serverAddress = (await stateManager.retrieve('serverAddress') as string) ?? DEFAULT_VALUES.serverAddress;
	const username = (await stateManager.retrieve('username') as string) ?? DEFAULT_VALUES.username;
	const password = (await stateManager.keychain.retrieve('password') as string) ?? DEFAULT_VALUES.password;
	const pageSize = (await stateManager.retrieve('pageSize') as number) ?? DEFAULT_VALUES.pageSize;

	const showContinueReading = (await stateManager.retrieve('showContinueReading') as boolean) ?? DEFAULT_VALUES.showContinueReading;
	const showRecentlyUpdated = (await stateManager.retrieve('showRecentlyUpdated') as boolean) ?? DEFAULT_VALUES.showRecentlyUpdated;

	return { serverAddress, username, password, pageSize, showContinueReading, showRecentlyUpdated }
}

export async function setStateData(stateManager: SourceStateManager, interceptor: SuwayomiRequestInterceptor, data: Record<string, any>) {
	const promises: Promise<void>[] = [];
	const prevStateData: any = await retrieveStateData(stateManager);

	let clear = false;
	for (const [key, value] of Object.entries(data)) {
		if (prevStateData[key] !== value) {
			switch (key) {
				case 'serverAddress':
				case 'username':
					promises.push(stateManager.store(key, value));
					clear = true;
					break;
				case 'password':
					promises.push(stateManager.keychain.store(key, value));
					clear = true;
					break;
				case 'pageSize':
					const pageSize = typeof value === 'string' ? parseInt(value) === 0 ? DEFAULT_VALUES.pageSize : parseInt(value) : DEFAULT_VALUES.pageSize;
					promises.push(stateManager.store(key, pageSize));
					break;
				default:
					promises.push(stateManager.store(key, value));
			}
		}
	}

	await Promise.all(promises);
	if (clear) interceptor.clearTokens();
}
