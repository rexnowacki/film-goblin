# fg-maint

Local-only Film Goblin maintenance CLI.

Run from the repository root:

```sh
fg-maint status
fg-maint db counts
fg-maint missing trailers
fg-maint missing cast --limit 200
fg-maint trailers search-missing --limit 10
fg-maint prices run --all --yes
```

To install `fg-maint` as a local terminal command:

```sh
npm run fg:link
fg-maint status
fg-maint prices run --all --yes
```

`prices run --all` takes one snapshot of every tracked film with an iTunes ID,
then checks each film exactly once in polite iTunes lookup batches.

`trailers search-missing` searches Brave for YouTube trailer candidates. It is a
dry run unless `--write` is passed.
