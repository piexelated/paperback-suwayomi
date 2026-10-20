import {
	BadgeColor,
	Chapter,
	ChapterDetails,
	ChapterProviding,
	ContentRating,
	DUIForm,
	DUISection,
	HomePageSectionsProviding,
	HomeSection,
	MangaProgress,
	MangaProgressProviding,
	MangaProviding,
	PagedResults,
	PartialSourceManga,
	RequestManagerProviding,
	SearchRequest,
	SearchResultsProviding,
	SourceInfo,
	SourceIntents,
	SourceManga,
	TrackerActionQueue
} from '@paperback/types';
import {
	serverSettingsMenu
} from './Settings';
import {
	SuwayomiRequestInterceptor,
	getOptions,
	getServer,
	getServerUnavailableMangaTiles,
	graphQL
} from './Common';
import { CacheManager } from './CacheManager';

// A manga's meta entry under this key lists the ids of other Suwayomi manga
// (same series, other sources) whose downloaded chapters fill its gaps.
// Those manga are hidden from the lists.
const MERGE_KEY = 'paperback.merge';

const SUWAYOMI_STATUS: any = {
	ONGOING: 'Ongoing',
	COMPLETED: 'Completed',
	PUBLISHING_FINISHED: 'Completed',
	CANCELLED: 'Cancelled',
	ON_HIATUS: 'Hiatus',
	LICENSED: 'Licensed',
	UNKNOWN: 'Unknown'
}

interface LibraryEntry {
	id: number;
	title: string;
	categories: number[];
	lastReadAt: number;
	lastFetchedAt: number;
}

interface MergedChapter {
	id: number;
	name: string;
	chapNum: number;
	sortKey: number;
	time: Date;
	isRead: boolean;
	lastReadAt: number;
}

function mergedIds(meta: any[]): number[] {
	const value: string = meta.find((entry: any) => entry.key === MERGE_KEY)?.value ?? '';
	return value.split(',').map((id) => parseInt(id)).filter((id) => !isNaN(id));
}

// Paperback shows "Chapter <number>" itself, so drop it from the name.
function chapterName(name: string): string {
	return name.replace(/^chapter\s+[\d.]+\s*[:\-–]?\s*/i, '');
}

export const SuwayomiInfo: SourceInfo = {
	version: '1.0.1',
	name: 'Suwayomi',
	icon: 'icon.png',
	author: 'piexel',
	authorWebsite: 'https://github.com/GITHUB_USER',
	description: 'Unofficial client for Suwayomi servers. Shows only the chapters downloaded on the server.',
	contentRating: ContentRating.EVERYONE,
	websiteBaseURL: 'https://github.com/Suwayomi/Suwayomi-Server',
	sourceTags: [
		{
			text: 'Suwayomi',
			type: BadgeColor.GREEN,
		},
	],
	intents: SourceIntents.COLLECTION_MANAGEMENT | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.MANGA_CHAPTERS | SourceIntents.MANGA_TRACKING | SourceIntents.SETTINGS_UI
};

export class Suwayomi implements ChapterProviding, HomePageSectionsProviding, MangaProgressProviding, MangaProviding, RequestManagerProviding, SearchResultsProviding {
	stateManager = App.createSourceStateManager();

	cacheManager = new CacheManager();
	interceptor = new SuwayomiRequestInterceptor(this.stateManager);

	requestManager = App.createRequestManager({
		requestsPerSecond: 8,
		requestTimeout: 20000,
		interceptor: this.interceptor
	});

	async getSourceMenu(): Promise<DUISection> {
		return App.createDUISection({
			id: 'main',
			header: 'Source Settings',
			isHidden: false,
			rows: async () => [
				serverSettingsMenu(this.stateManager, this.interceptor)
			],
		});
	}

	async query(query: string, variables: any = {}): Promise<any> {
		return graphQL(this.requestManager, this.stateManager, query, variables);
	}

	async getLibrary(): Promise<LibraryEntry[]> {
		const cached = this.cacheManager.getCachedData('library');
		if (cached !== undefined) return cached;

		const data = await this.query(`{
			mangas(condition: {inLibrary: true}, order: [{by: TITLE}]) {
				nodes {
					id title meta { key value } categories { nodes { id } }
					lastReadChapter { lastReadAt } latestFetchedChapter { fetchedAt }
				}
			}
		}`);

		const hidden = new Set<number>();
		for (const manga of data.mangas.nodes) {
			for (const id of mergedIds(manga.meta)) hidden.add(id);
		}

		const library: LibraryEntry[] = data.mangas.nodes
			.filter((manga: any) => !hidden.has(manga.id))
			.map((manga: any) => ({
				id: manga.id,
				title: manga.title,
				categories: manga.categories.nodes.map((category: any) => category.id),
				lastReadAt: Number(manga.lastReadChapter?.lastReadAt ?? 0),
				lastFetchedAt: Number(manga.latestFetchedChapter?.fetchedAt ?? 0)
			}));

		this.cacheManager.setCachedData('library', library);
		return library;
	}

	async getSectionEntries(sectionId: string): Promise<LibraryEntry[]> {
		const library = await this.getLibrary();

		switch (sectionId) {
			case 'continue':
				return library.filter((entry) => entry.lastReadAt > 0).sort((a, b) => b.lastReadAt - a.lastReadAt);
			case 'updated':
				return [...library].sort((a, b) => b.lastFetchedAt - a.lastFetchedAt);
			default: {
				// Suwayomi's "Default" category (id 0) holds the manga without a category.
				const categoryId = parseInt(sectionId.replace('category-', ''));
				return library.filter((entry) => categoryId === 0 ? entry.categories.length === 0 : entry.categories.includes(categoryId));
			}
		}
	}

	async createTiles(entries: LibraryEntry[]): Promise<PartialSourceManga[]> {
		const server = await getServer(this.stateManager);

		return entries.map((entry) => App.createPartialSourceManga({
			title: entry.title,
			image: `${server.url}/api/v1/manga/${entry.id}/thumbnail`,
			mangaId: `${entry.id}`,
			subtitle: undefined
		}));
	}

	async getMangaDetails(mangaId: string): Promise<SourceManga> {
		const server = await getServer(this.stateManager);
		const data = await this.query(`query($id: Int!) {
			manga(id: $id) { title author artist description status genre }
		}`, { id: parseInt(mangaId) });
		const manga = data.manga;

		return App.createSourceManga({
			id: mangaId,
			mangaInfo: App.createMangaInfo({
				image: `${server.url}/api/v1/manga/${mangaId}/thumbnail`,
				artist: manga.artist ?? '',
				author: manga.author ?? '',
				desc: (manga.description ?? '').replace(/<[^>]+>/g, ''),
				status: SUWAYOMI_STATUS[manga.status] ?? 'Unknown',
				hentai: false,
				titles: [manga.title],
				tags: [App.createTagSection({
					id: 'genres',
					label: 'genres',
					tags: (manga.genre ?? []).map((genre: string) => App.createTag({ id: `genre-${genre}`, label: genre }))
				})]
			})
		});
	}

	// The downloaded chapters of a manga and of the manga merged into it, oldest first.
	// A merged manga only adds chapter numbers the main manga lacks.
	async getMergedChapters(mangaId: string): Promise<MergedChapter[]> {
		const metaData = await this.query(`query($id: Int!) {
			manga(id: $id) { meta { key value } }
		}`, { id: parseInt(mangaId) });
		const ids = [parseInt(mangaId), ...mergedIds(metaData.manga.meta)];

		const data = await this.query(`query($ids: [Int!]) {
			chapters(filter: {mangaId: {in: $ids}, isDownloaded: {equalTo: true}}, order: [{by: SOURCE_ORDER}]) {
				nodes { id mangaId name scanlator chapterNumber sourceOrder uploadDate fetchedAt isRead lastReadAt }
			}
		}`, { ids });

		const chapters: MergedChapter[] = [];
		const numbers = new Set<number>();
		const files = new Set<string>();

		for (const mangaIdOfSource of ids) {
			const isMain = mangaIdOfSource === ids[0];
			const sourceNumbers = new Set<number>();
			let previousNumber = 0;

			for (const chapter of data.chapters.nodes) {
				if (chapter.mangaId !== mangaIdOfSource) continue;

				const known = chapter.chapterNumber >= 0;
				if (!isMain && (!known || numbers.has(chapter.chapterNumber))) continue;
				// Chapters with the same name and scanlator share one file; list it once.
				const file = `${chapter.mangaId}/${chapter.scanlator}/${chapter.name}`;
				if (files.has(file)) continue;
				files.add(file);

				if (known) {
					sourceNumbers.add(chapter.chapterNumber);
					previousNumber = chapter.chapterNumber;
				}

				const uploadDate = Number(chapter.uploadDate);
				chapters.push({
					id: chapter.id,
					name: chapterName(chapter.name),
					chapNum: known ? chapter.chapterNumber : 0,
					// Unnumbered chapters (notices) keep their place after the previous chapter.
					sortKey: known ? chapter.chapterNumber : previousNumber + 0.0001,
					time: new Date(uploadDate > 0 ? uploadDate : Number(chapter.fetchedAt) * 1000),
					isRead: chapter.isRead,
					lastReadAt: Number(chapter.lastReadAt)
				});
			}

			sourceNumbers.forEach((number) => numbers.add(number));
		}

		return chapters.sort((a, b) => a.sortKey - b.sortKey);
	}

	async getChapters(mangaId: string): Promise<Chapter[]> {
		const chapters = await this.getMergedChapters(mangaId);

		return chapters.map((chapter, index) => App.createChapter({
			id: `${chapter.id}`,
			chapNum: chapter.chapNum,
			name: chapter.name,
			time: chapter.time,
			volume: 0,
			sortingIndex: index
		}));
	}

	async getChapterDetails(
		mangaId: string,
		chapterId: string
	): Promise<ChapterDetails> {
		const server = await getServer(this.stateManager);

		// For a downloaded chapter Suwayomi reads the page list from the file on disk.
		const data = await this.query(`mutation($id: Int!) {
			fetchChapterPages(input: {chapterId: $id}) { pages chapter { isDownloaded } }
		}`, { id: parseInt(chapterId) });

		// Never fall back to the source website: its pages are not checked.
		if (!data.fetchChapterPages.chapter.isDownloaded) {
			throw new Error('This chapter is no longer downloaded on the server.');
		}

		return App.createChapterDetails({
			id: chapterId,
			mangaId: mangaId,
			pages: data.fetchChapterPages.pages.map((page: string) => page.startsWith('http') ? page : `${server.url}${page}`)
		});
	}

	async getSearchResults(
		searchQuery: SearchRequest,
		metadata: any
	): Promise<PagedResults> {
		// This function is also called when the user search in an other source. It should not throw if the server is unavailable.
		if (!(await this.interceptor.isServerAvailable())) {
			return App.createPagedResults({
				results: getServerUnavailableMangaTiles(),
			});
		}

		const { pageSize } = await getOptions(this.stateManager);
		const page: number = metadata?.page ?? 0;
		const title = (searchQuery.title ?? '').toLowerCase();

		const matches = (await this.getLibrary()).filter((entry) => entry.title.toLowerCase().includes(title));
		const tiles = await this.createTiles(matches.slice(page * pageSize, (page + 1) * pageSize));

		return App.createPagedResults({
			results: tiles,
			metadata: (page + 1) * pageSize < matches.length ? { page: page + 1 } : undefined
		});
	}

	async getHomePageSections(
		sectionCallback: (section: HomeSection) => void
	): Promise<void> {
		// This function is called on the homepage and should not throw if the server is unavailable
		if (!(await this.interceptor.isServerAvailable())) {
			sectionCallback(
				App.createHomeSection({
					id: 'placeholder-id',
					title: 'Library',
					items: getServerUnavailableMangaTiles(),
					containsMoreItems: false,
					type: 'singleRowNormal'
				})
			);
			return;
		}

		const { pageSize, showContinueReading, showRecentlyUpdated } = await getOptions(this.stateManager);

		const sections: { id: string, title: string }[] = [];
		if (showContinueReading) sections.push({ id: 'continue', title: 'Continue Reading' });
		if (showRecentlyUpdated) sections.push({ id: 'updated', title: 'Recently Updated' });

		const data = await this.query('{ categories { nodes { id name } } }');
		for (const category of data.categories.nodes) {
			sections.push({ id: `category-${category.id}`, title: category.name });
		}

		for (const section of sections) {
			const entries = await this.getSectionEntries(section.id);
			if (entries.length === 0) continue;

			sectionCallback(App.createHomeSection({
				id: section.id,
				title: section.title,
				items: await this.createTiles(entries.slice(0, pageSize / 2)),
				containsMoreItems: entries.length > pageSize / 2,
				type: 'singleRowNormal'
			}));
		}
	}

	async getViewMoreItems(
		homepageSectionId: string,
		metadata: any
	): Promise<PagedResults> {
		const { pageSize } = await getOptions(this.stateManager);
		const page: number = metadata?.page ?? 0;

		const entries = await this.getSectionEntries(homepageSectionId);
		const tiles = await this.createTiles(entries.slice(page * pageSize, (page + 1) * pageSize));

		return App.createPagedResults({
			results: tiles,
			metadata: (page + 1) * pageSize < entries.length ? { page: page + 1 } : undefined
		});
	}

	async getMangaProgress(mangaId: string): Promise<MangaProgress | undefined> {
		const chapters = await this.getMergedChapters(mangaId);

		let lastReadChapterNumber = 0;
		let lastReadTime = new Date(0);

		for (const chapter of chapters) {
			if (!chapter.isRead) break;
			lastReadChapterNumber = chapter.chapNum;
			lastReadTime = new Date(chapter.lastReadAt * 1000);
		}

		return App.createMangaProgress({
			mangaId: mangaId,
			lastReadChapterNumber: lastReadChapterNumber,
			lastReadVolumeNumber: 0,
			trackedListName: 'Suwayomi',
			lastReadTime: lastReadTime
		});
	}

	async getMangaProgressManagementForm(mangaId: string): Promise<DUIForm> {
		return App.createDUIForm({
			sections: async () => {
				const chapters = await this.getMergedChapters(mangaId);

				return [
					App.createDUISection({
						id: 'seriesInfo',
						header: 'Info',
						isHidden: false,
						rows: async () => [
							App.createDUILabel({
								id: 'mangaId',
								label: 'Suwayomi ID',
								value: mangaId
							}),
							App.createDUILabel({
								id: 'chaptersRead',
								label: 'Chapters Read',
								value: `${chapters.filter((chapter) => chapter.isRead).length} / ${chapters.length}`
							})
						]
					})
				];
			},
			onSubmit: async () => {}
		});
	}

	async processChapterReadActionQueue(actionQueue: TrackerActionQueue): Promise<void> {
		const chapterReadActions = await actionQueue.queuedChapterReadActions();

		for (const readAction of chapterReadActions) {
			if (!(await this.interceptor.isServerAvailable())) {
				await actionQueue.retryChapterReadAction(readAction);
				continue;
			}

			try {
				// Suwayomi only records the read time (used by Continue Reading) when lastPageRead is set.
				await this.query(`mutation($id: Int!) {
					updateChapter(input: {id: $id, patch: {isRead: true, lastPageRead: 0}}) { chapter { id } }
				}`, { id: parseInt(readAction.sourceChapterId) });

				await actionQueue.discardChapterReadAction(readAction);
			} catch (error) {
				await actionQueue.retryChapterReadAction(readAction);
			}
		}
	}
}
