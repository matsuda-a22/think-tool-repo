import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "@/lib/utils"

export const createHandle = DialogPrimitive.createHandle

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal {...props} />
}

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-full max-w-lg bg-background border rounded-xl shadow-lg p-6",
          "data-open:animate-in data-closed:animate-out",
          "data-closed:fade-out-0 data-open:fade-in-0",
          "data-closed:zoom-out-95 data-open:zoom-in-95",
          "data-closed:slide-out-to-left-1/2 data-closed:slide-out-to-top-[48%]",
          "data-open:slide-in-from-left-1/2 data-open:slide-in-from-top-[48%]",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogClose({ className, children, ...props }: DialogPrimitive.Close.Props & { className?: string }) {
  return (
    <DialogPrimitive.Close
      className={className}
      {...props}
    >
      {children}
    </DialogPrimitive.Close>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogBackdrop,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
}
