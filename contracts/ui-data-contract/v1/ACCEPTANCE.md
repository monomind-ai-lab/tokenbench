Status: PROPOSED — NOT PIPELINE ACCEPTED

`ui-data-contract/v1` is a proposed consumer package for the React preview migration. Its JSON examples use approved illustrative adapter facts and are explicitly illustrative consumer examples. They are not production responses, stable pipeline artifacts, or evidence of API-adapter acceptance.

The acceptance gate remains open until the pipeline sign-off supplies all of the following evidence:

- Pipeline commit SHA that produced the candidate contract responses.
- Stable artifact path containing the retained response artifacts.
- The method and query for each of `models`, `profile`, `lifecycle`, `rankings`, `comparison`, and `subscription`.
- Evidence that mixed-source responses preserve `effectiveAt: null` and every source's individual effective time.
- Evidence that unavailable facts retain their non-empty reasons and any supplied provenance.
- Evidence that invalid timestamps and unsupported contract versions are rejected by the consumer boundary.
- Confirmation that no D1, R2, cache, or other storage internals are present in the published envelope, data, provenance, or artifacts.

Task 13 owns external pipeline acceptance and live API-adapter integration. This package does not select a runtime adapter or change page behavior.
