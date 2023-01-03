# faster-hacs-action

This action attempts to do the same things that [hacs/action](https://github.com/hacs/action) does, but because it's natively in NodeJS and runs in your already running container, it does it much, much faster.

There is one significant difference in that we do not attempt to load your repo with HACS.  Instead, we perform all the same checks that HACS does before loading your repo.

We created this to confirm changes to our integrations in our CI chain more rapidly.  Feel free to use it yourself, but we recommend that you use the official HACS action in your release chain.

It is backward compatible with [hacs/action](https://github.com/hacs/action) so that you can use the same configuration. You only need to change the 'uses.'

## Inputs

| Input    | Description                                                                              |
| -------- | ---------------------------------------------------------------------------------------- |
| ignore   | A space-separated list of ignored checks                                                 |
| category | The type of repository (`integration`, `plugin`, `theme`, `netdaemon`, `appdaemon`, `python_script`) |
| comment  | Post the results of the cheks to the PR (true, false)                                    |

## Example

```yaml
name: HACS Action

on:
  push:
  pull_request:
  schedule:
    - cron: "0 0 * * *"

jobs:
  hacs:
    name: HACS Action
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Faster HACS Action
        uses: TheRealWaldo/faster-hacs-action@v0.0.7"
        with:
          category: integration
```

## Ignorable checks

These checks can be disabled with `with.ignore`. Use a string, and if you ignore multiple ones, separate them with spaces.

| Check          | More info                | Description                                                         |
| -------------- | ------------------------ | ------------------------------------------------------------------- |
| `archived`     | [More info][archived]    | Checks if the repository is archived                                |
| `brands`       | [More info][brands]      | Checks if the domain is added to the brands repo                    |
| `description`  | [More info][description] | Checks if the repository has a description                          |
| `hacs`         | [More info][hacs]        | Runs all checks that HACS would before loading the repo             |
| `hacsjson`     | [More info][hacsjson]    | Checks that hacs.json exists                                        |
| `images`       | [More info][images]      | Checks that the info file has images                                |
| `information`  | [More info][information] | Checks that the repo has an information file                        |
| `issues`       | [More info][issues]      | Checks that issues are enabled                                      |
| `requirements` |                          | Checks that the integration does not import builtin python packages |
| `topics`       | [More info][topics]      | Checks that the repository has topics                               |
| `wheels`       | [More info][wheels]      | Checks if the domain is added to the custom wheels repo             |

[archived]: https://hacs.xyz/docs/publish/include#check-archived
[brands]: https://hacs.xyz/docs/publish/include#check-brands
[description]: https://hacs.xyz/docs/publish/include#check-repository
[hacs]: https://hacs.xyz/docs/publish/include#check-hacs
[hacsjson]: https://hacs.xyz/docs/publish/include#check-hacs-manifest
[images]: https://hacs.xyz/docs/publish/include#check-images
[information]: https://hacs.xyz/docs/publish/include#check-info
[issues]: https://hacs.xyz/docs/publish/include#check-repository
[topics]: https://hacs.xyz/docs/publish/include#check-repository
[wheels]: https://hacs.xyz/docs/publish/include#check-wheels
