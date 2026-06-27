# Issues, Resolutions, And Correction Events

Issues are separate from Tasks, even when they appear beside Tasks in a worklist. Local Data Managers propose Resolution Proposals with comments and plain guided choices, Central Data Managers approve or reject them, and Approved Resolutions become authoritative through backend/admin events rather than direct edits.

When an Approved Resolution accepts a Form Submission that changes projected state or workflow, the backend creates a Correction Event based on the accepted Form Submission and recalculates affected projections and Tasks. If a resolution sends work back to the field, it creates a Correction/Revisit Task in the same Task Worklist as protocol work, linked to the Issue and prior Form Submission.
