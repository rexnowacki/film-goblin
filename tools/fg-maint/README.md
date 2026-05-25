# fg-maint

Local-only Film Goblin maintenance CLI.

Run from the repository root:

```sh
npm run fg -- status
npm run fg -- db counts
npm run fg -- prices run --all --yes
```

To install `fg-maint` as a local terminal command:

```sh
npm run fg:link
fg-maint status
fg-maint prices run --all --yes
```

`prices run --all` takes one snapshot of every tracked film with an iTunes ID,
then checks each film exactly once in polite iTunes lookup batches.
