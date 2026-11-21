import vine from '@vinejs/vine'

const safeInteger = vine.createRule((value, _, field) => {
  if (typeof value === 'string' && !Number.isSafeInteger(Number(value))) {
    field.report('The {{ field }} field must be a safe integer', 'safeInteger', field)
  }
})

/** One bounded page of deleted accounts, with a fixed page size of 25. */
export const listDeletedUsersValidator = vine.create({
  page: vine.number().withoutDecimals().positive().max(1_000_000).optional(),
})

/** The recycle-bin restore operation accepts a positive, safe integer user ID. */
export const restoreDeletedUserValidator = vine.create({
  params: vine.object({
    id: vine
      .string()
      .regex(/^[1-9][0-9]*$/)
      .maxLength(16)
      .use(safeInteger())
      .transform(Number),
  }),
})
