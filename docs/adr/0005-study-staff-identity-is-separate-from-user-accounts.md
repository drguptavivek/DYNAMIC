# Study Staff Identity Is Separate From User Accounts

DYNAMIC distinguishes real-world study staff identity from app login identity.

Institutions, Study Staff Members, designations, Study Roles, assignments, and Data Access Profiles are study governance concepts. User Accounts are authentication credentials for people who need system access. Every User Account maps to exactly one Study Staff Member. A Study Staff Member has one Institution affiliation in DYNAMIC. Designation is free text. Study Roles are also app roles where the person needs login access.

This keeps operational access control separate from the study roster. It also supports US Collaborators, who may be real study collaborators with institution and designation metadata and app login access to dashboards/data, but can access only non-PII aggregate, de-identified, or analysis-ready data. Non-PII access is enforced by role-based filtering on approved routes and views, not by creating a separate parallel API surface by default.
