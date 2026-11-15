import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("app-button focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none", {
  variants: { variant: { default: "button-primary", outline: "button-outline", ghost: "button-ghost", quiet: "button-quiet" } },
  defaultVariants: { variant: "default" },
});
function Button({ className, variant, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}
export { Button, buttonVariants };
