# Deployment status

The application builds and runs locally. The complete source was pushed to the private Site repository. **No successful hosted deployment exists yet.** Do not present the reserved Site URL as a working service.

The first native deployment failed while applying database migrations:

```text
failure_message: incomplete input: SQLITE_ERROR
site: appgprj_6abed3f11ba481918a42879c8c288508
version: appgprj_6abed3f11ba481918a42879c8c288508~appgver_e8d8eda9c3f88191938fd47536e25a47
deployment: appgdep_6abedeb137408191a98f81f34640981e
attempted source commit: af84ce730e9b5e1c90ed38a042e29f68b956f1da
```

All three migrations execute successfully against local D1, and a fresh database was tested with the migration helper. The custom `0001_assignment_guards.sql` contains `CREATE TRIGGER ... BEGIN ... END` bodies. A hosted migration statement splitter is a plausible cause, but this is an inference: the native error did not identify the failing statement or file.

The live database overview returned no visible bindings or tables following the failure. This does **not** establish that nothing was applied: it may only expose the live deployment, and this Site has none. The applied/unapplied boundary is therefore unknown. Existing migration files were preserved rather than rewritten or repeatedly redeployed.

Recovery: obtain the provider's migration ledger and the exact failed SQL statement. Preserve any applied migration and matching metadata. If the trigger migration is confirmed unapplied, correct only that migration's supported execution format (or redesign the assignment guard with an equivalent transactional database constraint), verify conflict protection, build a new archive from the new pushed source and publish a new version. Do not remove assignment conflict enforcement just to make the deployment pass. Do not reset an unknown remote database.

The Sites plugin's local workflow helper also became unavailable during this session. Source and archive delivery were completed using the native repository credential and Site tools. Re-enable the normal Sites workflow before the next managed publication when available.

Configured runtime: `ADMIN_EMAILS=admin@example.com`, `SEED_ENABLED=true`, and the reserved trusted origin. No payment or notification secrets were supplied. Replace the placeholder allowlist with the operator's real sign-in email before attempting hosted admin access.
