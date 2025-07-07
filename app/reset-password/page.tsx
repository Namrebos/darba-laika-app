'use client'


import { Suspense } from 'react'
import ActualResetPasswordForm from './ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Notiek ielāde...</div>}>
      <ActualResetPasswordForm />
    </Suspense>
  )
}
