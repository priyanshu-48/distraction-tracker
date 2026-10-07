# Auth mutation check (reproducible)

A deliberate-break check: each row changes one thing in the login/authorization code, runs the related tests
(`session`, `sessionDomain`, `account`, `intervals`, `auth`: 123 tests), and requires at least one failure. The file is restored after every row.

Reproduce: `cd server && node scripts/mutate-auth.mjs` (needs the same `DB_*` settings as `npm test`; about 10 minutes).
Raw output: `docs/evidence/raw/auth-mutations.txt`. Commit: see `docs/RESUME_EVIDENCE.md`.

| # | Mutation (what was broken) | Result | Tests failing / total |
|---:|---|---|---|
| 1 | token version is not compared (logout does not revoke) | caught | 3 / 123 |
| 2 | a token with no version is rejected (older tokens break) | caught | 1 / 123 |
| 3 | scope is not checked | caught | 17 / 123 |
| 4 | every route accepts the extension's token | caught | 17 / 123 |
| 5 | a token without a scope is treated as the limited one | caught | 1 / 123 |
| 6 | no CSRF check | caught | 3 / 123 |
| 7 | CSRF header demanded of bearer requests too | caught | 53 / 123 |
| 8 | CSRF header demanded on reads too | caught | 2 / 123 |
| 9 | the cookie wins over the bearer header | caught | 1 / 123 |
| 10 | a deleted account is not noticed | caught | 5 / 123 |
| 11 | the cookie is readable by scripts | caught | 3 / 123 |
| 12 | the cookie is SameSite=Lax | caught | 3 / 123 |
| 13 | the cookie is sent on every path | caught | 4 / 123 |
| 14 | Secure is never set | caught | 1 / 123 |
| 15 | logout does not revoke | caught | 2 / 123 |
| 16 | logout does not clear the cookie | caught | 1 / 123 |
| 17 | the extension token is a full token | caught | 19 / 123 |
| 18 | the extension token expires in a day | caught | 1 / 123 |
| 19 | sign-in sets no cookie | caught | 11 / 123 |
| 20 | deleting the account leaves the cookie | caught | 1 / 123 |
| 21 | the internal token version is sent to the client | caught | 1 / 123 |
| 22 | the extension cannot upload | caught | 1 / 123 |
| 23 | CORS does not allow credentials | caught | 1 / 123 |

**23 of 23 mutations caught, 0 survived, 0 not applied**
Unmutated code: Tests  123 passed (123)

## History of this check (honest note)

- A first version of this check was run in the session that built the feature, by a throwaway Python script that is not in the repo (22 mutations, plus one rewritten after it failed to apply). It is not the evidence for the count.
- The first run of the committed script applied only 19 of 23 because four patterns span two lines and the files use Windows (CRLF) line endings; nothing survived and the four were reported as NOT APPLIED. Output kept in `docs/evidence/raw/auth-mutations-run1-19of23.txt`.
- After the script was taught about CRLF, all 23 applied and were caught (the table above).

## What this does and does not prove

- It shows the tests are sensitive to each of these 23 specific mistakes. It is not a mutation score over the whole code base (no Stryker run), and 23 hand-picked mutations are not exhaustive.
- Some rows are caught by only one test (`1 / 123`), which is enough but is thin protection for that rule.
