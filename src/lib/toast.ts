/** Shared toast contract between App and sidebar panels. */

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  msg: string
  err?: boolean
  action?: ToastAction
}

export type PushToast = (msg: string, err?: boolean, action?: ToastAction) => void
