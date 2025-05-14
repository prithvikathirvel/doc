import { ErrorRequestHandler } from 'express'
import { StatusCodes } from 'http-status-codes'
import { AppError } from '../utils/errors'

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error', 
      message: err.message
    })
    return
  }

  console.error('Unexpected error:', err)
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    status: 'error',
    message: 'Internal server error'
  })
  return
}
