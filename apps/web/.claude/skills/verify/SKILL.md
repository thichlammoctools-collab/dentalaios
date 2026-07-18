---
name: verify
summary: Runtime verification recipe for the DentalAIOS web app
---

# Verify the web app

## Launch

From the repository root, run the API on the port expected by `apps/web/vite.config.ts`:

```bash
npm exec --workspace apps/api -- wrangler dev --port 8788 --var JWT_SECRET:local-verification-secret
```

In a second terminal:

```bash
npm run dev:web
```

Confirm the Vite proxy reaches the Worker through `http://localhost:5173/api/health`.

## Authenticate

Use the local demo account `admin@demo.clinic` / `password123`. The browser stores `dentalaios.token` and `dentalaios.session` in localStorage.

## Drive member management

1. Open `http://localhost:5173/settings/members`.
2. Confirm only the current-member table has the `Thao tác` column with `Sửa` and `Xóa` buttons.
3. Open `Sửa`; confirm name, role, branch, and active state are prefilled.
4. Change all editable fields and save. Observe `PUT /api/users/:id`, HTTP 200, and the refreshed row.
5. Restore the member data through the same dialog.
6. Confirm deletion on a non-current demo member. Observe `DELETE /api/users/:id`, HTTP 200, and `Đã khóa`; reactivate via Edit afterward.
7. Probe deleting the signed-in admin. Confirm the `Không thể xóa chính mình` toast appears and no DELETE request is sent.

## Local-only gotchas

- Never use `--remote` for verification.
- `JWT_SECRET` is not configured by default locally; pass a throwaway value with `--var`.
- The Vite proxy is fixed to port 8788, so start Wrangler explicitly on 8788.
- If local login reports a missing schema column, the local D1 migration ledger may be stale. Repair or recreate only the local database before continuing; do not touch production.
