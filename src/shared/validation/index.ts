/**
 * Placeholder for shared Zod validation schemas.
 *
 * Phase 2 plan:
 *   - Add `zod` as a dep in apps/api
 *   - Use `@hono/zod-validator` middleware
 *   - Schemas here are imported by both Worker routes and frontend forms
 *     (frontend uses `zod` directly to validate before submit)
 *
 * Examples to add later:
 *   - createPatientSchema
 *   - createVisitSchema
 *   - addFindingSchema
 *   - createTreatmentPlanSchema
 *   - recordPaymentSchema
 */

export {};