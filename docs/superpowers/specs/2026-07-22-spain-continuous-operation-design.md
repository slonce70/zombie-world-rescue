# Spain Continuous Operation Design

## Goal

Completing the Music Center must continue to village clearing, not present Spain as completed.

## Behavior

- Spain Front stage 0 automatically starts stage 1.
- Spain Front stage 1 automatically starts stage 2.
- Only stage 2 shows the completed-operation result.
- The Front state transition and saved progress remain unchanged.
- Other countries and failed stages keep their current result screens.

## Verification

In the in-app browser, finish stages 0 and 1 and confirm the next level starts without a result overlay. Finish stage 2 and confirm the completed-operation overlay remains.
