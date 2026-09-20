# CP008 Revision Plan: QA Claim Pattern

## Reason for Revision

Execution 5411 reached the QA Gate after all upstream AI, verification,
travel-time, copy, and photo stages succeeded, but the gate rejected the
output with HOURS_OR_TICKET_CLAIM. The offending text was a limitation
statement: “tiket masuk tidak dinyatakan sebagai bagian yang termasuk”.
That is not a factual ticket price or opening-hours claim.

## Clarifications and Decisions

- The QA guard must detect factual opening-hour/time claims and factual ticket
  price/free claims, not bare words such as tiket, included, or termasuk.
- Negative limitation language must remain accepted.
- No workflow shape, model, credential, or output contract changes.
- Regression tests must cover the observed Indonesian limitation sentence,
  an actual opening-time claim, and an actual ticket-price/free claim.

## Existing Behavior

The current regex scans up to 80 characters after opening/ticket vocabulary
and accepts included or termasuk as a claim. This creates false positives
inside evidence limitations.

## Required Behavior

- Reject explicit time claims attached to opening/closing/operating language.
- Reject explicit ticket price, currency, numeric amount, or free-ticket
  claims.
- Accept limitations that say a ticket price or inclusion is unknown/not
  stated.
- Preserve MONEY_VALUE_FORBIDDEN and OTA_PRODUCT_PAGE_TELL checks.

## Proposed Changes

Replace the broad single regex in the QA Gate Code node with two precise
patterns:

1. An hours pattern requiring an opening/closing vocabulary plus a concrete
   clock/time expression, in either order.
2. A ticket pattern requiring ticket vocabulary plus price/cost/free/currency
   evidence. Do not treat included/termasuk alone as a price claim.

Keep the existing failure code HOURS_OR_TICKET_CLAIM and error message so
downstream behavior remains compatible.

## Impact and Regression Risk

This reduces false positives and may allow a previously rejected model output
through. The existing money and OTA guards remain independent. A fixture with
an actual monetary ticket value must still fail.

## Verification Plan

- Replay the observed execution payload through the revised guard.
- Run a unit fixture with “tiket masuk tidak dinyatakan sebagai bagian yang
  termasuk” and expect pass.
- Run fixtures with “buka pukul 08:00” and “tiket masuk Rp 50.000” and expect
  HOURS_OR_TICKET_CLAIM.
- Re-run the local half-day form submission and record the new execution.
- Confirm workflow settings and credentials are unchanged.

## Updated Acceptance Criteria

- Execution 5411's false-positive phrase no longer fails QA.
- Actual opening-hour and ticket-price claims still fail closed.
- No new secrets, nodes, or external dependencies are introduced.
- CP008 remains completed after the revision log is appended.

## Rollback

Restore the pre-revision workflow JSON/version from the timestamped backup and
recheck that the workflow is active with its previous node graph.
