# Reduced LiveBench source fixtures

These fixtures are a reduced, attributable projection of the current-release source
bundle from [`LiveBench/new-livebench`](https://github.com/LiveBench/new-livebench)
commit `d5fcb08be7088c84616652660666b8621b683ae6`.

Original immutable artifact URLs:

- `https://raw.githubusercontent.com/LiveBench/new-livebench/d5fcb08be7088c84616652660666b8621b683ae6/public/table_2026_06_25.csv`
- `https://raw.githubusercontent.com/LiveBench/new-livebench/d5fcb08be7088c84616652660666b8621b683ae6/public/categories_2026_06_25.json`
- `https://raw.githubusercontent.com/LiveBench/new-livebench/d5fcb08be7088c84616652660666b8621b683ae6/public/cost_2026_06_25.csv`
- `https://raw.githubusercontent.com/LiveBench/new-livebench/d5fcb08be7088c84616652660666b8621b683ae6/src/Table/modelLinks.js`

The upstream filenames use underscore-separated dates; TokenBench normalizes the
release identifier to `2026-06-25`. The reduced table retains two source categories,
two source tasks in each category, one proprietary configuration, one open-weight
configuration, and the `smaug-agentic` derivative-finetune metadata. The separate
`categories_2026_06_25-full.json` retains the seven-category source taxonomy solely
for taxonomy-boundary coverage.

The pinned `new-livebench` commit does not itself declare a repository or package
license. `CDLA-Permissive-2.0.txt` is therefore a test input for separately verified
publication evidence, not a claim that the upstream repository made that declaration.
The parser requires that explicit evidence and never infers it from source files.
