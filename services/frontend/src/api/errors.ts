export type ApiErrorCode =
  | 'invalid_credentials'
  | 'user_blocked'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'network'

export class ApiError extends Error {
  code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Что-то пошло не так. Попробуйте ещё раз.'
