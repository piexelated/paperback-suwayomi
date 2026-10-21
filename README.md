# Suwayomi for Paperback

An unofficial [Paperback](https://paperback.moe/) 0.8 extension that reads manga from your own [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server) server. It only shows chapters Suwayomi has downloaded, so your phone never loads pages from a source website.

## Install

1. On your phone, open <https://piexelated.github.io/paperback-suwayomi/> and tap **Add to Paperback**.
2. Install **Suwayomi** from the new repository.
3. In its settings, enter your server URL (for example `http://192.168.1.10:4567`) and your Suwayomi web UI login. Leave the login empty if your server has none.

Works with Suwayomi-Server 2.x with `AUTH_MODE` set to `none` or `ui_login`.

## Build

```sh
npm ci && npm run bundle   # writes the repository to bundles/
```

## Credits

Built on [Kavya](https://github.com/ACK72/kavya-paperback) by ACK72. Not affiliated with Suwayomi or Paperback. BSD 2-Clause license.
