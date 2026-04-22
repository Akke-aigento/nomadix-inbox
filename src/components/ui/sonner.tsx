import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "group toast nomadix-toast group-[.toaster]:bg-surface-2 group-[.toaster]:text-text-primary group-[.toaster]:border-strong group-[.toaster]:elev-3 group-[.toaster]:rounded-lg group-[.toaster]:px-4 group-[.toaster]:py-2.5",
          title:
            "group-[.toast]:font-display group-[.toast]:italic group-[.toast]:text-[15px] group-[.toast]:tracking-[-0.01em]",
          description:
            "group-[.toast]:text-text-secondary group-[.toast]:font-sans group-[.toast]:text-[13px]",
          actionButton:
            "group-[.toast]:bg-[hsl(var(--accent-teal))] group-[.toast]:text-white group-[.toast]:font-sans group-[.toast]:text-[12px]",
          cancelButton:
            "group-[.toast]:bg-surface-3 group-[.toast]:text-text-secondary",
          success:
            "group-[.toaster]:!border-[hsl(var(--accent-teal)/0.4)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
