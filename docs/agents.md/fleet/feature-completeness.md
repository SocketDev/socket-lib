---
enforcement: hook + check + human-review
---

# Feature Completeness

A feature is not done until it ships with full enforcement and verification.

## Completeness Checklist

Every feature must include:

1. **Code-as-law check script** (`scripts/fleet/check/<feature>.mts`)
   - Verifies configuration is correct
   - Verifies wiring is in place (imports, function calls)
   - Runs in preflight and CI

2. **Unit tests** (`test/repo/unit/<feature>.test.mts`)
   - Test each function in isolation
   - Cover happy path and error cases
   - Test edge cases and boundary conditions

3. **Integration tests**
   - Test component interactions
   - Test the wiring between modules
   - Verify data flows correctly through the system

4. **E2E tests**
   - Simulate real user scenarios
   - Test the full request/response flow
   - Verify the feature works end-to-end

5. **Preflight integration**
   - Add check script to `preflight.mts` STAGES array
   - Ensure the check runs before push

## Enforcement

The `feature-incomplete-guard` hook blocks commits that add new exports without corresponding:

- A check script that verifies the wiring
- Test coverage for the new code

## Examples

### Training Model Gating (Reference Implementation)

```text
scripts/fleet/_shared/model-training-policy.mts   # Core logic
scripts/fleet/_shared/repo-visibility.mts         # Supporting module
scripts/fleet/_shared/path-to-repo.mts            # Supporting module
scripts/fleet/check/training-models-respect-visibility.mts  # Code-as-law
scripts/fleet/preflight.mts                       # Wired into preflight
test/repo/unit/model-training-policy.test.mts     # Unit tests
test/repo/unit/repo-visibility.test.mts           # Unit tests
test/repo/unit/training-model-gating.test.mts     # Integration + e2e tests
```

The check script verifies:

- MODELS_THAT_TRAIN set is populated
- modelTrainsOnData() function works
- filterLadderForTrainingPolicy() filters correctly
- Roster exists and has expected entries
- Visibility lookup works
- proxy.mts imports required functions
- proxy.mts calls extractFilePathsFromRequest()
- proxy.mts calls recordFileAccesses()
- proxy.mts calls filterLadderForTrainingPolicy()

## Coverage Requirements

- Target: 90%+ coverage fleet-wide
- New features must not drop coverage
- Coverage thresholds ratchet up, never down (`--fix` ratchets)
- When idle, increasing coverage is the default pickup task

## What "Done" Means

A feature is done when:

1. The code works (manual verification)
2. The code is tested (automated verification)
3. The wiring is enforced (code-as-law check)
4. The check runs in preflight (gate enforcement)
5. All tests pass
6. Coverage is maintained or improved
7. The commit is landed

Never mark a feature complete without all six layers.
