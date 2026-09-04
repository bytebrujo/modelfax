# PREDICTIONS.md — written before first line of code. DO NOT EDIT. Evaluate 2027-03-31.

Window: first publish → 2027-03-31. “Unattended” = agent completes the task with
green CI and zero human edits to code/data (merge clicks and prompt-sending excluded).

P1 ≥80% of upstream-drift fixes (scraper breakage) complete unattended.
Measure: MAINTENANCE_LOG.md entries tagged drift-fix, unattended ÷ total.
P2 Human interventions per monthly run decline: month 6 count < month 2 count.
Measure: interventions field in MAINTENANCE_LOG.md.
P3 main never contains schema-invalid data at any commit.
Measure: CI history on main; any red schema job on main falsifies.
P4 Median human minutes per maintenance run ≤15 from month 3 onward.
Measure: human_minutes field in MAINTENANCE_LOG.md.
P5 The registry has ≥1 external consumer (star+usage report, issue from a
stranger, or inbound link) by evaluation. (Tests “real, publishable.”)

Verdict per prediction at evaluation: HELD / FALSIFIED / INCONCLUSIVE + evidence.
