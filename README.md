# Suwayomi for Paperback

An unofficial [Paperback](https://paperback.moe/) extension for reading manga from your own [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server) server.

It only shows chapters that are downloaded on the server. It never asks Suwayomi for a chapter that isn't, so no page comes live from a source website: you read the files you have, and nothing else.

## Install

1. On your phone, open <https://GITHUB_USER.github.io/paperback-suwayomi/> and tap **Add to Paperback**. You can also add that address as an extension repository in Paperback's settings.
2. Install **Suwayomi** from that repository.
3. Open the extension's settings → Server Settings and fill in:
   - **Server URL**: the address of your server, for example `http://192.168.1.10:4567`
   - **Username** and **Password**: the login of the Suwayomi web UI. Leave both empty if your server has no login.

## Requirements

- Paperback 0.8
- Suwayomi-Server 2.x, tested with v2.4.2366
- Server login: none (`AUTH_MODE=none`) or the web UI login (`AUTH_MODE=ui_login`). Basic auth and simple login are not supported.

## Features

- Home sections: Continue Reading, Recently Updated, and one per Suwayomi category.
- Search within your Suwayomi library.
- Reading a chapter marks it read in Suwayomi, for series added to a tracker in Paperback.

### One series from two sources

When a source misses some chapters of a series, you may have downloaded those from another source. To show both as one series, give the main manga a meta entry `paperback.merge` holding the ids of the other manga, separated by commas. For example, with Suwayomi's GraphQL API:

```graphql
mutation {
  setMangaMeta(input: {meta: {mangaId: 12, key: "paperback.merge", value: "34"}}) {
    meta { key value }
  }
}
```

Manga 34 then fills the chapter numbers that manga 12 lacks, and drops out of the lists.

## Build

```sh
npm ci
npm run build    # type check
npm run bundle   # writes the repository to bundles/
npm run serve    # serves it on your network for testing
```

## Credits

Built on [Kavya](https://github.com/ACK72/kavya-paperback) by ACK72, a Kavita extension for Paperback.

This project is not affiliated with or endorsed by Suwayomi or Paperback.
