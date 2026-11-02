# Shared AAST/IEC branding

The workspace uses the same AAST/IEC family lockup as the SSO Portal and CEPT: supplied institution logo, AAST wordmark and a smaller right-aligned application name. This app uses FINANCE with its existing blue accent and Manrope typography.

- `frontend/src/components/AastBrand.jsx`: shared layout; blue logo on light backgrounds, supplied white logo in the dark sidebar, black for print.
- `frontend/src/components/WorkspaceUI.jsx`: Brand wrapper used by login and DashboardLayout. The sidebar passes inverse; normal login remains blue.
- `frontend/src/styles/_AastBrand.scss`: responsive sizes and brand colors; imported last by `_global.scss`.
- `frontend/src/assets/branding/`: original supplied blue/white/black IEC assets; images are used without recoloring filters. The favicon uses the same blue asset.

This change affects on-screen branding and the browser icon. Course, student, payroll and export behavior is unchanged.

Browser tabs use a simple blue dollar-sign icon (`frontend/public/app-icon.svg`). The FINANCE label uses restrained semibold Manrope lettering with measured spacing.
