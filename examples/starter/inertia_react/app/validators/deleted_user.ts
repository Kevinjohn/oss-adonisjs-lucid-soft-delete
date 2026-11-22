import vine from '@vinejs/vine'

/** The largest id a PostgreSQL `increments` column holds, the narrowest of the supported databases. */
const maxUserId = 2_147_483_647

const userIdRange = vine.createRule((value, _, field) => {
  if (typeof value === 'string' && Number(value) > maxUserId) {
    field.report(`The {{ field }} field must be at most ${maxUserId}`, 'userIdRange', field)
  }
})

/** One bounded page of deleted accounts, with a fixed page size of 25. */
export const listDeletedUsersValidator = vine.create({
  page: vine.number().withoutDecimals().positive().max(1_000_000).optional(),
})

/** The recycle-bin restore operation accepts a positive user ID within the users id column. */
export const restoreDeletedUserValidator = vine.create({
  params: vine.object({
    id: vine
      .string()
      .regex(/^[1-9][0-9]*$/)
      .maxLength(10)
      .use(userIdRange())
      .transform(Number),
  }),
})
