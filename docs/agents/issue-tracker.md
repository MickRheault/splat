# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in the `docs/` folder.

## Conventions

- The PRD is `docs/prd/<feature-slug>.md`
- Implementation issues are `docs/issues/<feature-slug>/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `docs/prd/` or `docs/issues/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path.
